import {createDrafts, matchesChat, matchSnippet, preferredModel, suggestions, applySuggestion, incompatibleFiles, isImage, formatBytes, modelLabel} from './workspace.js';
import {readApiResponse} from './api.js';
import {icon} from './icons.js';
import {renderMessage, saveFile, isSvg} from './render.js';
import {openViewer, blobOf} from './viewer.js';
import {projectFiles, zipName} from './files.js';
import {makeZip} from './zip.js';
import {startTour, tourSteps, TOUR_VERSION} from './tour.js';
import {createPicker} from './picker.js';
import {renderLibrary} from './library.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
const ORDER = ['Favoritos', 'Jack AI', 'OpenAI', 'Anthropic', 'Google', 'xAI', 'Mistral AI', 'DeepSeek', 'Qwen (Alibaba)', 'Moonshot AI'];
// IDs antigos de perfis (por exemplo jack/free) apontam para o perfil novo.
const canon = id => state.catalog?.aliases?.[id] || id;
const coarse = matchMedia('(pointer: coarse)');
const mobile = () => matchMedia('(max-width:760px)').matches;
const TEXT_TYPES = /\.(txt|md|csv|json|js|ts|py|html|css)$/i;
const optionLabels = {audience: 'Público', format: 'Formato', tone: 'Tom', language: 'Linguagem', expected: 'Esperado', observed: 'Erro observado', style: 'Estilo', ratio: 'Proporção'};
const prompt = $('#prompt'), composer = $('#composer');

const state = {user: null, chats: [], catalog: null, catalogAt: 0, model: '', view: 'chat', current: null, temporary: false, tmp: [],
  job: null, files: [], edit: null, options: {}, showArchived: false, studioTab: 'medidas', notice: null, stick: true,
  effort: stored('jack.effort', ['low', 'medium', 'high']), web: stored('jack.web', ['1']) === '1', speaking: null, openReasoning: new Set()};
let drafts = createDrafts(null);

function stored(key, allowed) { try { const v = localStorage.getItem(key) || ''; return allowed.includes(v) ? v : ''; } catch { return ''; } }
function remember(key, value) { try { value ? localStorage.setItem(key, value) : localStorage.removeItem(key); } catch {} }
const EFFORTS = [['', 'Automático', 'O modelo decide quanto pensar'], ['low', 'Baixo', 'Responde mais rápido'], ['medium', 'Médio', 'Equilíbrio entre rapidez e cuidado'], ['high', 'Alto', 'Pensa mais antes de responder']];
const effortName = v => EFFORTS.find(e => e[0] === (v || ''))[1];
const entryOf = m => models().find(x => x.id === canon(m?.model));
const CONTINUE = 'Continue a resposta exatamente de onde parou, sem repetir o que já foi escrito.';
// Texto de uma resposta somado às partes que vieram por “Continuar resposta”.
const continued = (rows, i) => rows[i]?.truncated && rows[i + 1]?.role === 'user' && rows[i + 1].content === CONTINUE && rows[i + 2]?.role === 'assistant';
function chainText(rows, i) {
  let text = rows[i].content, k = i;
  while (k >= 2 && rows[k - 1]?.role === 'user' && rows[k - 1].content === CONTINUE && rows[k - 2]?.role === 'assistant' && rows[k - 2].truncated) { text = rows[k - 2].content + text; k -= 2; }
  return text;
}
const filesOf = i => { const rows = messages(); return rows[i] ? projectFiles(chainText(rows, i)) : []; };
// Arquivos “enviados no chat”: um arquivo vira um anexo; dois ou mais viram um .zip.
function attachmentCard(files, i) {
  const box = document.createElement('section'); box.className = 'attach'; box.setAttribute('aria-label', 'Arquivos enviados na resposta');
  const bytes = files.reduce((n, f) => n + new Blob([f.code]).size, 0), broken = files.some(f => f.incomplete);
  const single = files.length === 1 ? files[0] : null;
  const name = single ? single.path : zipName(state.temporary ? 'conversa-temporaria' : current()?.title);
  const meta = single ? [single.lang, single.lines + (single.lines === 1 ? ' linha' : ' linhas'), formatBytes(bytes)].filter(Boolean).join(' · ')
    : files.length + ' arquivos · ' + formatBytes(bytes) + ' · ' + files.map(f => f.path.split('/').pop()).slice(0, 4).join(', ') + (files.length > 4 ? '…' : '');
  box.innerHTML = '<span class="aicon">' + icon(single ? 'file' : 'archive') + '</span><div class="ainfo"><b></b><small></small></div><div class="aact">' +
    '<button type="button" class="secondary" ' + (single ? 'data-view-path="' + esc(single.path) + '"' : 'data-view-all="' + i + '"') + '>' + icon('eye') + (single ? 'Ver' : 'Ver arquivos') + '</button>' +
    '<button type="button" class="primary" ' + (single ? 'data-file="' + i + ':0"' : 'data-zip="' + i + '"') + '>' + icon('download') + (single ? 'Baixar' : 'Baixar .zip') + '</button></div>' +
    (broken ? '<p class="note">' + icon('alert') + 'Um arquivo ficou incompleto porque a resposta foi cortada. Use “Continuar resposta” antes de baixar.</p>' : '');
  box.querySelector('b').textContent = name; box.querySelector('small').textContent = meta;
  return box;
}
// Itens do visualizador a partir dos arquivos de uma resposta.
const viewItems = files => files.map(f => ({kind: 'code', path: f.path, lang: f.lang, code: f.code, incomplete: f.incomplete}));
const imageItems = (m, i) => (m.images || []).map((src, k) => ({kind: 'image', src, name: (m.role === 'user' ? 'anexo-' : 'imagem-') + (i + 1) + '-' + (k + 1), alt: m.role === 'user' ? 'Imagem anexada' : 'Imagem gerada ' + (k + 1),
  caption: m.role === 'user' ? 'Imagem enviada por você' : 'Imagem criada por ' + (m.route?.name || 'Jack AI')}));
async function zipImages(i) {
  const m = messages()[i];
  const files = await Promise.all((m?.images || []).map(async (src, k) => { const blob = await blobOf(src); return {path: 'imagem-' + (k + 1) + '.' + ({'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif'}[blob.type] || 'png'), data: new Uint8Array(await blob.arrayBuffer())}; }));
  const name = zipName((state.temporary ? 'imagens' : current()?.title) + ' imagens');
  saveFile(name, new Blob([makeZip(files)], {type: 'application/zip'}));
  toast(name + ' baixado com ' + files.length + ' imagens.');
}
function downloadZip(i) {
  const files = filesOf(i);
  if (!files.length) return toast('Esta resposta não tem arquivos de código.');
  const name = zipName(state.temporary ? 'conversa-temporaria' : current()?.title);
  saveFile(name, new Blob([makeZip(files.map(f => ({path: f.path, data: f.code.endsWith('\n') ? f.code : f.code + '\n'})))], {type: 'application/zip'}));
  toast(name + ' baixado com ' + files.length + (files.length === 1 ? ' arquivo.' : ' arquivos.'));
}

// --- Utilidades de interface ---------------------------------------------------
let toastTimer;
function toast(text) { $('#toast').textContent = text; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').textContent = ''; }, 4500); }
async function api(route, method = 'GET', body) {
  const r = await fetch('/api/' + route, {method, headers: {'Content-Type': 'application/json'}, body: body === undefined ? undefined : JSON.stringify(body)});
  return readApiResponse(r);
}
let dialogOrigin = null;
function dialog(title, html, {wide = false} = {}) {
  const d = $('#dialog');
  if (!d.open) dialogOrigin = document.activeElement;
  $('#dialogtitle').textContent = title; $('#dialogbody').innerHTML = html; d.classList.toggle('wide', wide);
  if (!d.open) d.showModal();
  ($('#dialogbody').querySelector('[autofocus]') || $('#dialogbody').querySelector('input:not([type=hidden]),textarea,select,button'))?.focus();
}
const closeDialog = () => $('#dialog').open && $('#dialog').close();
$('#dialog').addEventListener('close', () => { const o = dialogOrigin; dialogOrigin = null; if (o && document.contains(o)) o.focus(); });
$('#dialog').addEventListener('click', e => { if (e.target !== $('#dialog')) return; const r = e.target.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeDialog(); });
const button = (act, title, cls = 'secondary', extra = '') => '<button type="button" class="' + cls + '" data-action="' + act + '" ' + extra + '>' + title + '</button>';

let menu = null;
function openMenu(anchor, items) {
  closeMenu(false);
  const el = document.createElement('div');
  el.className = 'menu-pop'; el.setAttribute('role', 'menu'); el.setAttribute('aria-label', anchor.getAttribute('aria-label') || 'Opções');
  el.innerHTML = items.map((it, i) => '<button type="button" role="' + (it.checked === undefined ? 'menuitem' : 'menuitemradio') + '"' + (it.checked === undefined ? '' : ' aria-checked="' + it.checked + '"') + ' data-i="' + i + '" class="' + (it.danger ? 'danger' : '') + '">' + icon(it.icon) +
    (it.hint ? '<span class="mtext"><span>' + esc(it.label) + '</span><small>' + esc(it.hint) + '</small></span>' : esc(it.label)) + '</button>').join('');
  document.body.append(el);
  const r = anchor.getBoundingClientRect();
  el.style.left = Math.max(8, Math.min(r.right - el.offsetWidth, innerWidth - el.offsetWidth - 8)) + 'px';
  el.style.top = (r.bottom + el.offsetHeight + 8 < innerHeight ? r.bottom + 4 : r.top - el.offsetHeight - 4) + 'px';
  anchor.setAttribute('aria-expanded', 'true');
  menu = {el, anchor};
  el.onclick = e => { const b = e.target.closest('[data-i]'); if (!b) return; closeMenu(true); guard(items[b.dataset.i].run)(); };
  el.onkeydown = e => {
    const list = [...el.querySelectorAll('button')], at = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); list[(at + 1) % list.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); list[(at - 1 + list.length) % list.length].focus(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(true); }
    if (e.key === 'Tab') closeMenu(false);
  };
  (el.querySelector('[aria-checked=true]') || el.querySelector('button')).focus();
}
function closeMenu(focus = true) { if (!menu) return; menu.el.remove(); menu.anchor.setAttribute('aria-expanded', 'false'); if (focus && document.contains(menu.anchor)) menu.anchor.focus(); menu = null; }
document.addEventListener('pointerdown', e => { if (menu && !menu.el.contains(e.target) && !menu.anchor.contains(e.target)) closeMenu(false); });

function guard(fn) {
  return async (...args) => {
    try { await fn(...args); }
    catch (e) {
      if ($('#dialog').open) { let err = $('#dialogerror'); if (!err) { err = document.createElement('p'); err.id = 'dialogerror'; err.className = 'note'; err.setAttribute('role', 'alert'); err.style.color = 'var(--danger)'; $('#dialogbody').append(err); } err.textContent = e.message; }
      else toast(e.message);
    }
  };
}

// --- Estado derivado -------------------------------------------------------------
const current = () => state.chats.find(c => c.id === state.current);
const messages = () => state.temporary ? state.tmp : (current()?.messages || []);
const hasThread = () => !!state.current || (state.temporary && state.tmp.length > 0);
const models = () => state.catalog?.models || [];
const selected = () => models().find(m => m.id === state.model);
const favorites = () => [...new Set((state.user?.prefs?.favorites || []).map(canon))];

// --- Rascunhos ---------------------------------------------------------------------
function draftKey() { return state.temporary ? undefined : (state.current || null); }
function snapshotDraft() { return {text: prompt.value, files: state.files.filter(f => f.status === 'ready'), edit: state.edit, options: {...state.options}}; }
let draftTimer;
function saveDraft() { clearTimeout(draftTimer); const key = draftKey(); if (key !== undefined) drafts.save(key, snapshotDraft()); }
function saveDraftSoon() { clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 250); }
function clearComposer({keepOptions = false} = {}) { prompt.value = ''; state.files = []; state.edit = null; if (!keepOptions) state.options = {}; autosize(); }
function restoreDraft(key) {
  clearComposer();
  if (key === undefined) return;
  const d = drafts.get(key);
  if (!d) return;
  prompt.value = d.text || ''; state.files = (d.files || []).map(f => ({...f, id: uuid(), status: 'ready'})); state.edit = d.edit ?? null; state.options = d.options || {};
  autosize();
}

// --- Navegação ---------------------------------------------------------------------
function setHash() {
  const h = state.view === 'library' ? '#/biblioteca' : state.view === 'studio' ? '#/estudio/' + state.studioTab : state.current && !state.temporary ? '#/c/' + state.current : '#/';
  if (location.hash !== h) history.replaceState(null, '', h);
}
function closeMobileNav() { document.body.classList.remove('mobileopen'); syncNavigation(); }
function busy() { if (state.job) { toast('Interrompa a resposta em andamento antes de trocar de conversa.'); return true; } return false; }
function openChat(id, {focus = true} = {}) {
  if (state.current === id && state.view === 'chat') { closeMobileNav(); return; }
  if (busy()) return;
  saveDraft();
  state.temporary = false; state.tmp = []; sessionStorage.removeItem('jack.temp');
  state.current = id; state.view = 'chat'; state.notice = null;
  const c = current();
  if (c?.model && models().some(m => m.id === canon(c.model) && m.available)) state.model = canon(c.model);
  restoreDraft(id); closeMobileNav(); setHash(); render(); scrollToEnd(true);
  if (focus && !coarse.matches) prompt.focus({preventScroll: true});
}
async function newChat() {
  if (busy()) return;
  if (state.temporary && state.tmp.length && !await confirmDiscard()) return;
  saveDraft();
  state.temporary = false; state.tmp = []; sessionStorage.removeItem('jack.temp');
  state.current = null; state.view = 'chat'; state.notice = null;
  restoreDraft(null); closeMobileNav(); setHash(); render();
  if (!coarse.matches) prompt.focus();
}
function confirmDiscard() {
  return new Promise(resolve => {
    dialog('Descartar conversa temporária?', '<p>As mensagens desta conversa temporária não foram salvas e serão perdidas.</p><div class="actions">' + button('close', 'Continuar na conversa') + '<button type="button" class="primary" id="discardYes">Descartar</button></div>');
    const done = v => { $('#dialog').removeEventListener('close', onClose); resolve(v); };
    const onClose = () => done(false);
    $('#dialog').addEventListener('close', onClose);
    $('#discardYes').onclick = () => { $('#dialog').removeEventListener('close', onClose); closeDialog(); resolve(true); };
  });
}
async function toggleTemporary() {
  if (busy()) return;
  if (!state.temporary) {
    saveDraft();
    state.current = null; state.temporary = true; state.tmp = []; state.view = 'chat'; state.notice = null;
    sessionStorage.setItem('jack.temp', '1'); clearComposer();
  } else {
    if (state.tmp.length && !await confirmDiscard()) return;
    state.temporary = false; state.tmp = []; sessionStorage.removeItem('jack.temp'); state.notice = null;
    restoreDraft(null);
  }
  setHash(); render(); prompt.focus();
}
function openLibrary() {
  saveDraft(); picker.hide(null); state.view = 'library'; closeMobileNav(); setHash(); render();
  renderLibrary($('#library'), libraryCtx); $('#librarytitle')?.focus?.();
  if (Date.now() - state.catalogAt > 15000) loadCatalog();
}
async function openStudio(tab) {
  saveDraft(); if (tab) state.studioTab = tab;
  state.view = 'studio'; closeMobileNav(); setHash(); render();
  const {renderStudio} = await import('./studio/view.js');
  renderStudio($('#studio'), {tab: state.studioTab, use: useInChat, tabChanged: t => { state.studioTab = t; setHash(); }});
  $('#tab-' + state.studioTab)?.focus();
}

// --- Renderização ------------------------------------------------------------------
function render() {
  const thread = state.view === 'chat' && hasThread();
  const page = state.view !== 'chat';
  const body = document.body;
  body.classList.toggle('mode-home', !page && !thread); body.classList.toggle('mode-thread', thread); body.classList.toggle('mode-page', page);
  $('#home').hidden = page || thread; $('#thread').hidden = !thread; $('#library').hidden = state.view !== 'library'; $('#studio').hidden = state.view !== 'studio';
  const active = page ? state.view : thread ? null : 'home';
  document.querySelectorAll('.nav[data-view]').forEach(n => n.dataset.view === active ? n.setAttribute('aria-current', 'page') : n.removeAttribute('aria-current'));
  const c = current();
  $('#page').textContent = state.view === 'library' ? 'Biblioteca de modelos' : state.view === 'studio' ? 'Estúdio de ferramentas' : thread ? (state.temporary ? 'Conversa temporária' : c?.title || 'Nova conversa') : 'Início';
  document.title = (thread && !state.temporary && c ? c.title + ' · ' : '') + 'Jack AI';
  renderTopActions(thread);
  placeComposer(page ? null : thread ? $('#dockSlot') : $('#homeSlot'));
  renderComposer(); renderSidebar();
  if (thread) renderThread();
}
function placeComposer(slot) {
  if (!slot || composer.parentElement === slot) return;
  const focused = document.activeElement === prompt;
  slot.prepend(composer);
  if (focused) prompt.focus({preventScroll: true});
}
function renderTopActions(thread) {
  const box = $('#topactions'), c = current();
  if (!thread) { box.innerHTML = ''; return; }
  if (state.temporary) box.innerHTML = '<span class="badge temp">' + icon('ghost') + 'Temporária · não salva</span>' + button('discardTemp', 'Descartar', 'ghost');
  else box.innerHTML = (c?.archived ? '<span class="badge">' + icon('archive') + 'Arquivada</span>' : '') + (c?.pinned ? '<span class="badge">' + icon('pin') + 'Fixada</span>' : '') +
    '<button type="button" class="icon" id="threadmenu" aria-haspopup="menu" aria-expanded="false" aria-label="Opções da conversa" data-icon="more">' + icon('more') + '</button>';
}

function renderSidebar() {
  const q = $('#search').value;
  const rows = q.trim() ? state.chats.filter(c => matchesChat(c, q)) : state.chats.filter(c => !!c.archived === state.showArchived);
  $('#count').textContent = state.chats.filter(c => !c.archived).length;
  $('#archivedToggle').setAttribute('aria-pressed', String(state.showArchived));
  $('#archivedToggle').textContent = 'Arquivadas (' + state.chats.filter(c => c.archived).length + ')';
  const groups = q.trim() ? [['Resultados', rows]] : state.showArchived ? [['Arquivadas', rows]] : [['Fixadas', rows.filter(c => c.pinned)], ['Recentes', rows.filter(c => !c.pinned)]];
  const row = c => {
    const open = state.current === c.id && state.view === 'chat' && !state.temporary;
    const snippet = q.trim() ? matchSnippet(c, q) : drafts.has(c.id) && !open ? 'Rascunho salvo' : '';
    return '<div class="hrow' + (open ? ' current' : '') + '"><button type="button" class="open" data-chat="' + esc(c.id) + '" ' + (open ? 'aria-current="page"' : '') + '><span>' + esc(c.title) + (c.archived && q.trim() ? '<span class="tag">arquivada</span>' : '') + '</span>' + (snippet ? '<small>' + esc(snippet) + '</small>' : '') + '</button>' +
      '<button type="button" class="icon rowmenu" data-rowmenu="' + esc(c.id) + '" aria-haspopup="menu" aria-expanded="false" aria-label="Opções de ' + esc(c.title) + '">' + icon('more') + '</button></div>';
  };
  let html = state.temporary && state.tmp.length ? '<div class="hgroup"><div class="hrow current"><button type="button" class="open" data-action="noop" aria-current="page"><span>Conversa temporária</span><small>Não entra no histórico</small></button></div></div>' : '';
  html += groups.filter(([, list]) => list.length).map(([title, list]) => '<div class="hgroup" role="group" aria-label="' + title + '"><h3>' + title + '</h3>' + list.map(row).join('') + '</div>').join('');
  $('#history').innerHTML = html || '<p class="empty">' + (q.trim() ? 'Nenhuma conversa encontrada para “' + esc(q) + '”.' : state.showArchived ? 'Nenhuma conversa arquivada.' : 'Suas conversas aparecerão aqui.') + '</p>';
}

function routeLine(m) {
  const entry = models().find(x => x.id === m.model);
  const name = entry?.kind === 'profile' || /^jack\//.test(m.model || '') ? (entry?.name || 'Jack AI') : (entry?.name || m.route?.name || modelLabel(models(), m) || 'Jack AI');
  const via = m.route ? (entry?.kind === 'profile' || /^jack\//.test(m.model || '') ? 'via ' + m.route.name : [m.route.vendor, m.route.host && m.route.host !== m.route.vendor ? 'via ' + m.route.host : ''].filter(Boolean).join(' · ')) : '';
  const gone = m.model && models().length && !entry ? ' · fora do catálogo' : '';
  const extras = [m.effort ? 'Esforço ' + effortName(m.effort).toLowerCase() : '', m.web ? 'Pesquisa na web' : ''].filter(Boolean);
  return '<strong>' + esc(name) + '</strong>' + (via || gone ? '<span class="route">' + esc(via + gone) + '</span>' : '') + extras.map(x => '<span class="route soft">' + esc(x) + '</span>').join('');
}
function messageEl(m, i, rows) {
  const el = document.createElement('article');
  el.className = 'message ' + m.role; el.dataset.index = i;
  const last = i === rows.length - 1;
  if (m.role === 'user') {
    el.setAttribute('aria-label', 'Você');
    el.innerHTML = '<div class="msgtext"></div>' + (m.files?.length ? '<div class="msgfiles">' + m.files.map(f => '<span>' + icon('file') + esc(f.name) + (f.size ? ' · ' + formatBytes(f.size) : '') + '</span>').join('') + '</div>' : '') +
      (m.options ? '<p class="msgopts">' + esc(Object.entries(m.options).map(([k, v]) => (optionLabels[k] || k) + ': ' + v).join(' · ')) + '</p>' : '');
    el.querySelector('.msgtext').textContent = m.content;
    (m.images || []).forEach((src, k) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'thumb attached'; b.dataset.viewImage = i + ':' + k; b.setAttribute('aria-label', 'Abrir a imagem anexada no visualizador');
      const img = document.createElement('img'); img.src = src; img.alt = 'Imagem anexada'; b.append(img); el.append(b); });
    const tools = document.createElement('div'); tools.className = 'msgtools';
    tools.innerHTML = '<button type="button" class="mini" data-copy="' + i + '">' + icon('copy') + 'Copiar</button>' + (state.job ? '' : '<button type="button" class="mini" data-edit="' + i + '">' + icon('edit') + 'Editar</button>');
    el.append(tools);
    if (m.status && (last || rows[i + 1]?.role !== 'assistant') && !m.pending) {
      const alt = (state.alternatives || []).map(a => '<button type="button" class="secondary" data-switch="' + esc(a.id) + '">Usar ' + esc(a.name) + '</button>').join('');
      const box = document.createElement('div'); box.className = 'status error'; box.setAttribute('role', 'alert');
      box.innerHTML = icon('alert') + '<div><b>Não foi possível gerar a resposta.</b> ' + esc(m.status) + '<div class="actions"><button type="button" class="primary" data-retry="' + i + '">' + icon('refresh') + 'Tentar novamente</button><button type="button" class="secondary" data-edit="' + i + '">Editar mensagem</button>' + alt + '</div></div>';
      el.append(box);
    }
    return el;
  }
  el.setAttribute('aria-label', 'Resposta do Jack AI');
  el.innerHTML = '<div class="msghead">' + routeLine(m) + '</div>' + (m.reasoning ? '<details class="reasoning"' + (state.openReasoning.has(i) ? ' open' : '') + '><summary>' + icon('spark') +
    (m.streaming && !m.content ? 'Pensando…' : 'Ver raciocínio') + '</summary><div class="rtext"></div></details>' : '') + '<div class="msgtext"></div>';
  if (m.reasoning) {
    const d = el.querySelector('.reasoning'); d.querySelector('.rtext').textContent = m.reasoning;
    d.ontoggle = () => { d.open ? state.openReasoning.add(i) : state.openReasoning.delete(i); };
  }
  const body = el.querySelector('.msgtext');
  if (m.images?.length) {
    const g = document.createElement('div'); g.className = 'gallery' + (m.images.length === 1 ? ' one' : '');
    g.innerHTML = m.images.map((src, k) => '<button type="button" class="thumb" data-view-image="' + i + ':' + k + '" aria-label="Abrir a imagem ' + (k + 1) + ' no visualizador"><img src="' + esc(src) + '" alt="Imagem gerada ' + (k + 1) + '" decoding="async"></button>').join('');
    body.before(g);
    if (m.images.length > 1 && !m.streaming) {
      const z = document.createElement('div'); z.className = 'attach slim';
      z.innerHTML = '<span class="aicon">' + icon('archive') + '</span><div class="ainfo"><b>' + m.images.length + ' imagens</b><small>Toque numa imagem para ver em tela cheia</small></div><div class="aact"><button type="button" class="primary" data-zip-images="' + i + '">' + icon('download') + 'Baixar .zip</button></div>';
      g.after(z);
    }
  }
  const imaging = m.streaming && (entryOf(m)?.output === 'image' || entryOf(m)?.capabilities?.image);
  if (m.streaming && !m.content) body.innerHTML = m.images?.length ? '' : '<span class="typing" role="status">' + (imaging ? 'Criando imagem' : m.reasoning ? 'Pensando' : 'Gerando resposta') + '<i aria-hidden="true"><b></b><b></b><b></b></i></span>';
  else renderMessage(body, m.content, {files: true});
  if (m.sources?.length) {
    const box = document.createElement('nav'); box.className = 'sources'; box.setAttribute('aria-label', 'Fontes da pesquisa na web');
    box.innerHTML = '<h3>' + icon('globe') + 'Fontes</h3><ol>' + m.sources.map(src => { let host = ''; try { host = new URL(src.url).hostname.replace(/^www\./, ''); } catch {}
      return '<li><a href="' + esc(src.url) + '" target="_blank" rel="noopener noreferrer">' + esc(src.title || host) + '</a><small>' + esc(host) + '</small></li>'; }).join('') + '</ol>';
    el.append(box);
  }
  if (!m.streaming && !continued(rows, i)) {
    // SVG sozinho aparece só como imagem; arquivos de código e conjuntos viram anexo (.zip se 2 ou mais).
    const files = projectFiles(chainText(rows, i));
    if (files.length > 1 || (files.length === 1 && !isSvg(files[0]))) el.append(attachmentCard(files, i));
  }
  if (m.truncated && !m.streaming && !m.status) {
    const box = document.createElement('div'); box.className = 'status';
    box.innerHTML = icon('info') + '<div>A resposta chegou ao tamanho máximo configurado.' + (last && !state.job ? '<div class="actions"><button type="button" class="secondary" data-continue="' + i + '">' + icon('chevron') + 'Continuar resposta</button></div>' : '') + '</div>';
    el.append(box);
  }
  if (m.status && !m.streaming) {
    // Interrupção pedida pela pessoa é informativa; falha do provedor oferece nova tentativa.
    const interrupted = m.status === 'Geração interrompida.';
    const box = document.createElement('div'); box.className = 'status' + (interrupted ? '' : ' error');
    if (!interrupted) box.setAttribute('role', 'alert');
    const alt = !interrupted && last ? (state.alternatives || []).map(a => '<button type="button" class="secondary" data-switch="' + esc(a.id) + '">Usar ' + esc(a.name) + '</button>').join('') : '';
    box.innerHTML = icon(interrupted ? 'info' : 'alert') + '<div>' + (interrupted ? '' : '<b>A resposta ficou incompleta.</b> ') + esc(m.status) + ' O trecho recebido foi mantido.' +
      (!interrupted && last && !state.job ? '<div class="actions"><button type="button" class="primary" data-regenerate="' + i + '">' + icon('refresh') + 'Tentar novamente</button>' + alt + '</div>' : '') + '</div>';
    el.append(box);
  }
  if (!m.streaming) {
    const tools = document.createElement('div'); tools.className = 'msgtools';
    const versions = m.versions?.length > 1 ? '<span class="versions" role="group" aria-label="Versões da resposta"><button type="button" class="icon" data-version="' + i + ':' + (m.selected - 1) + '" ' + (m.selected > 0 && !state.job ? '' : 'disabled') + ' aria-label="Versão anterior">' + icon('left') + '</button>' +
      '<span>' + (m.selected + 1) + ' de ' + m.versions.length + '</span><button type="button" class="icon" data-version="' + i + ':' + (m.selected + 1) + '" ' + (m.selected < m.versions.length - 1 && !state.job ? '' : 'disabled') + ' aria-label="Próxima versão">' + icon('chevron') + '</button></span>' : '';
    tools.innerHTML = '<button type="button" class="mini" data-copy="' + i + '">' + icon('copy') + 'Copiar resposta</button>' +
      ('speechSynthesis' in window ? '<button type="button" class="mini" data-speak="' + i + '" aria-pressed="' + (state.speaking === i) + '">' + icon(state.speaking === i ? 'stop' : 'volume') + (state.speaking === i ? 'Parar leitura' : 'Ouvir') + '</button>' : '') +
      (last && !state.job ? '<button type="button" class="mini" data-regenerate="' + i + '">' + icon('refresh') + 'Gerar nova versão</button>' : '') + versions;
    el.append(tools);
  }
  return el;
}
function renderThread() {
  const rows = messages(), c = current();
  $('#chatTitle').textContent = state.temporary ? 'Conversa temporária' : c?.title || 'Nova conversa';
  const badge = $('#threadbadge');
  badge.hidden = !state.temporary;
  badge.className = 'badge temp'; badge.innerHTML = icon('ghost') + 'Não entra no histórico';
  const box = $('#messages');
  box.replaceChildren(...rows.map((m, i) => messageEl(m, i, rows)));
  if (!rows.length) box.innerHTML = '<p class="empty">Escreva a primeira mensagem desta conversa.</p>';
  if (state.stick) scrollToEnd(false);
}
let streamFrame = 0;
function paintStreaming() {
  if (streamFrame) return;
  streamFrame = requestAnimationFrame(() => {
    streamFrame = 0;
    const rows = messages(), i = rows.findIndex(m => m.streaming);
    const node = $('#messages article[data-index="' + i + '"]');
    if (i < 0 || !node) return;
    node.replaceWith(messageEl(rows[i], i, rows));
    if (state.stick) scrollToEnd(false);
  });
}
function scrollToEnd(force) { const sc = $('#scroll'); if (force) state.stick = true; sc.style.scrollBehavior = 'auto'; sc.scrollTop = sc.scrollHeight; sc.style.scrollBehavior = ''; }
$('#scroll').addEventListener('scroll', () => { const sc = $('#scroll'); state.stick = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 120; jumpButton(); }, {passive: true});
function jumpButton() {
  let b = $('#jump');
  const show = document.body.classList.contains('mode-thread') && !state.stick && state.job;
  if (!show) { b?.remove(); return; }
  if (!b) { b = document.createElement('button'); b.type = 'button'; b.id = 'jump'; b.className = 'jump'; b.innerHTML = icon('up') + 'Ir para o fim da resposta'; b.onclick = () => { scrollToEnd(true); b.remove(); }; composer.prepend(b); }
}

// --- Campo de mensagem ------------------------------------------------------------
function autosize() { prompt.style.height = 'auto'; prompt.style.height = prompt.scrollHeight + 2 + 'px'; keepCaretVisible(); updateSend(); }
// Mantém visível a linha em edição quando o campo encolhe (teclado virtual, rotação ou janela menor).
function keepCaretVisible() {
  if (document.activeElement !== prompt) return;
  const before = prompt.value.slice(0, prompt.selectionEnd);
  if (prompt.selectionEnd >= prompt.value.length - 1) { prompt.scrollTop = prompt.scrollHeight; return; }
  const lineHeight = parseFloat(getComputedStyle(prompt).lineHeight) || 24;
  const y = before.split('\n').length * lineHeight;
  if (y > prompt.scrollTop + prompt.clientHeight || y - lineHeight < prompt.scrollTop) prompt.scrollTop = Math.max(0, y - prompt.clientHeight / 2);
}
function updateSend() {
  const send = $('#send'), job = !!state.job;
  send.classList.toggle('stop', job);
  send.innerHTML = icon(job ? 'stop' : 'up');
  send.setAttribute('aria-label', job ? 'Interromper resposta' : 'Enviar mensagem');
  send.disabled = !job && !prompt.value.trim() && !state.files.length;
}
function renderComposer() {
  const m = selected();
  $('#selected').textContent = m?.name || (state.catalog ? 'Escolher modelo' : 'Carregando modelos…');
  $('#modelbtn').classList.toggle('off', !!m && !m.available);
  $('#modelbtn').setAttribute('aria-label', 'Modelo: ' + (m?.name || 'nenhum') + (m && !m.available ? ', indisponível' : '') + '. Trocar modelo');
  $('#tempchip').setAttribute('aria-pressed', String(state.temporary));
  $('#tempchip').setAttribute('aria-label', state.temporary ? 'Chat temporário ativo. Desativar' : 'Ativar chat temporário');
  composer.classList.toggle('temporary', state.temporary);
  const note = $('#tempnote');
  note.hidden = !state.temporary;
  note.innerHTML = '<strong>Chat temporário ativo.</strong> Esta conversa e o rascunho ficam só nesta aba: não entram no histórico, não são salvos no servidor e somem ao recarregar ou fechar. O provedor do modelo ainda recebe as mensagens e aplica a própria política de retenção.';
  const imageMode = m?.output === 'image' || (m?.kind === 'route' && m?.capabilities?.image);
  $('#effort').hidden = $('#web').hidden = !!imageMode;
  prompt.placeholder = imageMode ? 'Descreva a imagem ou a figurinha…' : 'Pergunte ao Jack AI…';
  const reasoning = !!m?.capabilities?.reasoning, eff = $('#effort');
  $('#effortlabel').textContent = state.effort ? 'Esforço ' + effortName(state.effort).toLowerCase() : 'Esforço';
  eff.classList.toggle('active', !!state.effort); eff.classList.toggle('off', !!m && !reasoning);
  eff.setAttribute('aria-label', 'Nível de esforço: ' + effortName(state.effort) + (m && !reasoning ? '. O modelo atual não ajusta o esforço' : '') + '. Trocar');
  eff.title = m && !reasoning ? 'O ' + m.name + ' não ajusta o esforço. A escolha vale para modelos compatíveis.' : 'Nível de esforço';
  const web = $('#web');
  web.setAttribute('aria-pressed', String(state.web));
  web.setAttribute('aria-label', state.web ? 'Pesquisa na web ativada. Desativar' : 'Ativar pesquisa na web');
  web.title = 'Pesquisa na web: o modelo pode buscar informações atuais e cita as fontes. Cobrança extra por busca no OpenRouter.';
  renderMic();
  renderAttachments(); renderControls(); renderNotice(); updateSend();
  prompt.setAttribute('enterkeyhint', coarse.matches ? 'enter' : 'send');
  $('#homeSlot').closest('.hero')?.classList.toggle('busy', !!state.job);
}
function renderAttachments() {
  const list = $('#attachments'), m = selected();
  list.hidden = !state.files.length;
  list.innerHTML = state.files.map(f => {
    const warn = f.status === 'ready' && isImage(f) && m && !m.capabilities?.vision;
    const st = f.status === 'loading' ? 'Carregando…' : f.status === 'error' ? f.error : warn ? 'Exige análise de imagens' : (f.data ? 'PDF · ' : '') + formatBytes(f.size) + ' · pronto';
    return '<li class="attachment ' + (f.status === 'ready' ? (warn ? 'warn' : '') : f.status) + '">' + (f.image ? '<img src="' + esc(f.image) + '" alt="">' : icon(isImage(f) ? 'image' : 'file')) +
      '<span class="fname" title="' + esc(f.name) + '">' + esc(f.name) + '</span><span class="fstate" role="status">' + esc(st) + '</span>' +
      '<button type="button" class="icon remove" data-remove="' + esc(f.id) + '" aria-label="Remover ' + esc(f.name) + '">' + icon('x') + '</button></li>';
  }).join('');
}
function renderControls() {
  const box = $('#profileControls'), m = selected();
  const controls = m?.kind === 'profile' ? m.controls : [];
  box.hidden = !controls?.length;
  if (!controls?.length) { box.innerHTML = ''; return; }
  const key = controls.map(c => c.id).join() + JSON.stringify(state.options);
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  const filled = controls.filter(c => state.options[c.id]).map(c => c.label + ': ' + state.options[c.id]);
  if (state.controlsOpen === undefined) state.controlsOpen = !mobile();
  box.innerHTML = '<details ' + (state.controlsOpen ? 'open' : '') + '><summary>' + icon('sliders') + '<span>Ajustes do ' + esc(m.name) + '</span>' + (filled.length ? '<small>' + esc(filled.join(' · ')) + '</small>' : '') + '</summary><div class="controlgrid">' +
    controls.map(c => '<label><span>' + esc(c.label) + '</span>' + (c.options ? '<select data-opt="' + c.id + '"><option value="">Qualquer</option>' + c.options.map(o => '<option ' + (state.options[c.id] === o ? 'selected' : '') + '>' + esc(o) + '</option>').join('') + '</select>'
      : '<input data-opt="' + c.id + '" value="' + esc(state.options[c.id] || '') + '" placeholder="' + esc(c.placeholder || '') + '" autocomplete="off">') + '</label>').join('') + '</div>' +
    (m.media ? '<p class="media">' + icon('image') + (m.media.enabled ? 'Geração de mídia disponível.' : 'Geração de mídia indisponível: ' + esc(m.media.reason)) + '</p>' : '') + '</details>';
  box.querySelector('details').ontoggle = e => { state.controlsOpen = e.target.open; };
}
function setNotice(notice) { state.notice = notice; renderNotice(); }
function renderNotice() {
  const box = $('#notice'), n = state.notice || editNotice();
  box.hidden = !n;
  if (!n) { box.innerHTML = ''; return; }
  box.className = 'notice ' + (n.type || '');
  box.setAttribute('role', n.type === 'error' ? 'alert' : 'status');
  box.innerHTML = '<p>' + n.html + '</p>' + (n.actions?.length ? '<div class="actions">' + n.actions.map(a => '<button type="button" class="' + (a.primary ? 'primary' : 'secondary') + '" data-notice="' + esc(a.id) + '">' + esc(a.label) + '</button>').join('') + '</div>' : '');
  box.onclick = e => { const b = e.target.closest('[data-notice]'); if (!b) return; const a = n.actions.find(x => x.id === b.dataset.notice); guard(a.run)(); };
}
function editNotice() {
  if (state.edit === null) return null;
  return {type: 'info', html: 'Editando sua mensagem. Ao reenviar, as respostas a partir dela serão substituídas.', actions: [{id: 'cancel', label: 'Cancelar edição', run: () => { clearComposer(); saveDraft(); renderComposer(); prompt.focus(); }}]};
}
function alternativesFor(m, needsVision = false) {
  return models().filter(x => x.available && x.id !== m?.id && (!needsVision || x.capabilities?.vision)).sort((a, b) => Number(b.kind === 'profile') - Number(a.kind === 'profile')).slice(0, 3);
}
function unavailableNotice(m) {
  const needLogin = m.access === 'account' && !state.catalog?.signedIn;
  setNotice({type: 'warn', html: '<b>' + esc(m.name) + '</b> está indisponível agora. ' + esc(m.reason || '') + ' Escolha como continuar:',
    actions: [...(needLogin ? [{id: 'login', label: 'Entrar na conta', primary: true, run: () => auth('login')}] : []),
      ...alternativesFor(m).map(a => ({id: 'use:' + a.id, label: 'Usar ' + a.name, run: () => { setModel(a.id); prompt.focus(); }})),
      {id: 'lib', label: 'Ver Biblioteca', run: openLibrary}]});
}
function compatNotice(m, bad) {
  const names = bad.map(b => '<b>' + esc(b.file.name) + '</b>').join(', ');
  setNotice({type: 'warn', html: names + (bad.length > 1 ? ' precisam' : ' precisa') + ' de um modelo com análise de imagens. O ' + esc(m.name) + ' não aceita imagens.',
    actions: [{id: 'drop', label: 'Remover ' + (bad.length > 1 ? 'imagens' : bad[0].file.name), run: () => { state.files = state.files.filter(f => !isImage(f)); setNotice(null); renderComposer(); prompt.focus(); }},
      ...alternativesFor(m, true).slice(0, 2).map(a => ({id: 'use:' + a.id, label: 'Usar ' + a.name, primary: true, run: () => { setModel(a.id); prompt.focus(); }}))]});
}
function setModel(id) {
  state.model = id; state.notice = null;
  try { localStorage.setItem('jack.model', id); } catch {}
  renderComposer();
}
const readData = file => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(Error('Não foi possível ler o arquivo.')); r.readAsDataURL(file); });
async function addFiles(list) {
  for (const f of list) {
    if (state.files.length >= 4) { toast('Use até quatro arquivos por mensagem.'); break; }
    const item = {id: uuid(), name: f.name, size: f.size, type: f.type, status: 'loading'};
    state.files.push(item); renderComposer();
    try {
      if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
        if (f.size > 2000000) throw Error('PDF acima de 2 MB');
        if (state.files.some(x => x !== item && x.data)) throw Error('Um PDF por mensagem');
        item.data = (await readData(f)).replace(/^data:[^;,]*;base64,/, 'data:application/pdf;base64,');
        item.type = 'application/pdf';
      } else if (f.type.startsWith('image/')) {
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(f.type)) throw Error('Use PNG, JPEG ou WebP');
        if (f.size > 1800000) throw Error('Imagem acima de 1,8 MB');
        if (state.files.filter(x => x !== item && isImage(x)).length) throw Error('Uma imagem por mensagem');
        item.image = await readData(f);
      } else {
        if (!TEXT_TYPES.test(f.name)) throw Error('Formato não aceito');
        if (f.size > 80000) throw Error('Arquivo acima de 80 KB');
        item.text = await f.text();
      }
      item.status = 'ready';
    } catch (e) { item.status = 'error'; item.error = e.message; }
    renderComposer(); saveDraftSoon();
  }
}

// --- Envio e streaming -------------------------------------------------------------
function activeOptions(m) {
  if (m?.kind !== 'profile' || !m.controls?.length) return undefined;
  const out = {};
  for (const c of m.controls) if (state.options[c.id]) out[c.id] = state.options[c.id];
  return Object.keys(out).length ? out : undefined;
}
async function submit() {
  if (state.job) return;
  const files = state.files;
  if (files.some(f => f.status === 'loading')) return setNotice({type: 'warn', html: 'Aguarde: os arquivos ainda estão carregando.'});
  if (files.some(f => f.status === 'error')) return setNotice({type: 'error', html: 'Remova os arquivos com erro antes de enviar.'});
  if (!prompt.value.trim() && !files.length) { prompt.focus(); return; }
  const m = selected();
  if (!m) { picker.show(); return; }
  if (!m.available) return unavailableNotice(m);
  const bad = incompatibleFiles(m, files);
  if (bad.length) return compatNotice(m, bad);
  await stream({kind: 'send', fromComposer: true, payload: {model: m.id, content: prompt.value, files: files.filter(f => f.text !== undefined || f.data).map(({name, size, text, data}) => data ? {name, size, data} : {name, size, text}),
    images: files.filter(f => f.image).map(f => f.image), options: activeOptions(m), index: state.edit ?? undefined, requestId: uuid(), ...tools()}});
}
function retry(i) {
  const m = messages()[i], model = selected();
  if (!m || state.job) return;
  if (!model?.available) return unavailableNotice(model || {name: 'O modelo escolhido'});
  stream({kind: 'send', payload: {model: model.id, content: m.content, files: (m.files || []).map(({name, size, text, data}) => data ? {name, size, data} : {name, size, text}), images: m.images || [], options: m.options, index: i, requestId: m.requestId || uuid(), ...tools()}});
}
function regenerate(i) {
  const model = selected();
  if (state.job) return;
  if (!model?.available) return unavailableNotice(model || {name: 'O modelo escolhido'});
  stream({kind: 'regenerate', at: i, payload: {model: model.id, regenerate: i, ...tools()}});
}
// Esforço e pesquisa na web valem para o próximo envio, como escolhidos no campo.
const tools = () => ({...(state.effort ? {effort: state.effort} : {}), ...(state.web ? {web: true} : {})});
function continueReply() {
  const model = selected();
  if (state.job) return;
  if (!model?.available) return unavailableNotice(model || {name: 'O modelo escolhido'});
  stream({kind: 'send', payload: {model: model.id, content: CONTINUE, requestId: uuid(), ...tools()}});
}
const forHistory = m => ({role: m.role, content: m.content, ...(m.role === 'user' && m.files?.length ? {files: m.files.map(({name, size, text, data}) => data ? {name, size, data} : {name, size, text})} : {}), ...(m.images?.length ? {images: m.role === 'user' ? m.images : m.images.slice(-1)} : {})});
const wait = ms => new Promise(r => setTimeout(r, ms));
async function stream({kind, payload, at, fromComposer = false}) {
  if (state.job) return;
  const controller = new AbortController();
  state.job = {controller, kind, started: Date.now(), id: uuid()}; state.alternatives = null; state.notice = null;
  const job = state.job.id;
  const temp = state.temporary;
  let chatId = state.current, created = false, accepted = false, done = false, streamError = '', alternatives = null;
  let rows, user = null, assistant, previous = null, removed = [];
  renderComposer();
  try {
    if (!temp && !chatId) {
      const {id} = await api('chats', 'POST', {});
      state.chats.unshift({id, title: 'Nova conversa', messages: [], pinned: 0, archived: 0, updated: Date.now()});
      drafts.move(null, id); state.current = chatId = id; created = true; setHash();
    }
    rows = temp ? state.tmp : current().messages;
    const history = temp ? rows.map(forHistory) : undefined;
    if (kind === 'send') {
      if (payload.index !== undefined) removed = rows.splice(payload.index);
      user = {role: 'user', content: payload.content, files: payload.files, images: payload.images, options: payload.options, requestId: payload.requestId, model: payload.model, pending: true};
      assistant = {role: 'assistant', content: '', model: payload.model, streaming: true, effort: payload.effort, web: payload.web};
      rows.push(user, assistant);
    } else {
      previous = rows[at];
      assistant = {role: 'assistant', content: '', model: payload.model, streaming: true, effort: payload.effort, web: payload.web};
      rows[at] = assistant;
    }
    state.view = 'chat'; state.stick = true; render(); scrollToEnd(true);
    const r = await fetch('/api/generate', {method: 'POST', headers: {'Content-Type': 'application/json'}, signal: controller.signal,
      body: JSON.stringify({...payload, id: temp ? undefined : chatId, history, job})});
    if (!r.ok) { let data = {}; try { data = await r.json(); } catch {} throw Object.assign(new Error(data.error || 'O servidor recusou o envio (HTTP ' + r.status + ').'), {before: true, alternatives: data.alternatives}); }
    accepted = true;
    if (user) user.pending = false;
    // Ajustes do perfil (público, tom, linguagem…) continuam valendo para a próxima mensagem.
    if (fromComposer) { clearComposer({keepOptions: true}); if (!temp) drafts.save(chatId, snapshotDraft()); renderComposer(); }
    const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = '';
    for (;;) {
      const {value, done: end} = await reader.read();
      if (end) break;
      buf += value;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
        if (!line.trim()) continue;
        const ev = JSON.parse(line);
        if (ev.route) { assistant.route = ev.route; paintStreaming(); }
        if (ev.delta) { assistant.content += ev.delta; paintStreaming(); }
        if (ev.reasoning) { assistant.reasoning = (assistant.reasoning || '') + ev.reasoning; paintStreaming(); }
        if (ev.image) { assistant.images = [...(assistant.images || []), ev.image]; paintStreaming(); }
        if (ev.sources) { assistant.sources = ev.sources; paintStreaming(); }
        if (ev.truncated) assistant.truncated = true;
        if (ev.error) { streamError = ev.error; alternatives = ev.alternatives; }
        if (ev.done) done = true;
      }
    }
    if (!done && !streamError) streamError = 'A conexão foi interrompida. Você pode tentar novamente.';
  } catch (e) {
    if (e.name === 'AbortError') streamError = 'Geração interrompida.';
    else if (!accepted) {
      // Nada foi salvo pelo servidor: desfaz a prévia e mantém o conteúdo para revisão.
      const offline = e instanceof TypeError;
      const message = offline ? 'Sem conexão com o servidor.' : e.message;
      if (rows) {
        if (kind === 'send') { rows.splice(rows.indexOf(user)); rows.push(...removed); } else rows[at] = previous;
      }
      if (created) { state.chats = state.chats.filter(c => c.id !== chatId); drafts.move(chatId, null); state.current = null; api('chats/' + chatId, 'DELETE').catch(() => {}); setHash(); }
      const alts = (e.alternatives || []).map(a => ({id: 'use:' + a.id, label: 'Usar ' + a.name, run: () => { setModel(a.id); prompt.focus(); }}));
      if (fromComposer) setNotice({type: 'error', html: '<b>A mensagem não foi enviada.</b> ' + esc(message) + ' O texto e os anexos continuam no campo para você revisar.', actions: [{id: 'again', label: 'Tentar novamente', primary: true, run: submit}, ...alts]});
      else { state.alternatives = e.alternatives || null; toast(message); }
      streamError = '';
    } else streamError = e.message || 'Falha ao receber a resposta.';
  } finally {
    const aborted = controller.signal.aborted;
    state.job = null;
    if (accepted) {
      if (alternatives?.length) state.alternatives = alternatives;
      if (!temp) {
        let saved = null;
        // Após interromper, o servidor grava o trecho parcial assim que percebe o fechamento.
        const caughtUp = s => !aborted || !assistant.content || (kind === 'regenerate'
          ? (s.messages[at]?.versions?.length || 1) > (previous.versions?.length || 1)
          : s.messages.at(-1)?.role === 'assistant' && !!s.messages.at(-1).status);
        for (let n = 0; n < (aborted ? 8 : 2); n++) {
          if (aborted || n) await wait(250);
          const s = await api('chats/' + chatId).catch(() => null);
          if (s) saved = s;
          if (s && caughtUp(s)) break;
        }
        if (saved) { const i = state.chats.findIndex(c => c.id === saved.id); if (i >= 0) state.chats[i] = saved; state.chats.sort((a, b) => b.pinned - a.pinned || b.updated - a.updated); }
        else { assistant.streaming = false; if (streamError) assistant.status = streamError; toast('Não foi possível sincronizar o histórico. Recarregue para conferir.'); }
      } else if (kind === 'regenerate') {
        if (assistant.content) {
          const versions = previous.versions ? [...previous.versions] : [{content: previous.content, model: previous.model, route: previous.route, status: previous.status}];
          const extra = Object.fromEntries(['reasoning', 'sources', 'truncated', 'effort', 'web', 'images'].filter(k => assistant[k]).map(k => [k, assistant[k]]));
          versions.push({content: assistant.content, model: payload.model, route: assistant.route, ...extra, ...(streamError ? {status: streamError} : {})});
          rows[at] = {role: 'assistant', content: assistant.content, model: payload.model, route: assistant.route, versions, selected: versions.length - 1, ...extra, ...(streamError ? {status: streamError} : {})};
        } else { rows[at] = previous; if (streamError) toast(streamError); }
      } else {
        assistant.streaming = false;
        if (!assistant.content) { rows.splice(rows.indexOf(assistant), 1); user.status = streamError || 'O provedor não enviou resposta.'; }
        else if (streamError) assistant.status = streamError;
      }
    } else if (aborted && rows) {
      // Interrompido antes da resposta do servidor: confere o que foi gravado em vez de supor.
      if (!temp && chatId) { const s = await api('chats/' + chatId).catch(() => null); if (s) { const i = state.chats.findIndex(c => c.id === s.id); if (i >= 0) state.chats[i] = s; } }
      else if (kind === 'send') { rows.splice(rows.indexOf(user)); rows.push(...removed); if (fromComposer && !prompt.value) prompt.value = payload.content; }
      else rows[at] = previous;
    } else if (assistant && rows?.includes(assistant)) { assistant.streaming = false; }
    render();
    if (fromComposer && !coarse.matches) prompt.focus({preventScroll: true});
  }
}
async function selectVersion(i, v) {
  if (state.job) return;
  const rows = messages(), m = rows[i];
  if (!m?.versions?.[v]) return;
  if (state.temporary) { const x = m.versions[v]; rows[i] = {...m, content: x.content, model: x.model, route: x.route, status: x.status, reasoning: x.reasoning, sources: x.sources, truncated: x.truncated, effort: x.effort, web: x.web, images: x.images, selected: v}; }
  else { const saved = await api('chats/' + state.current + '/messages/' + i, 'PATCH', {selected: v}); const k = state.chats.findIndex(c => c.id === saved.id); state.chats[k] = saved; }
  state.stick = false; renderThread();
  $('#messages article[data-index="' + i + '"] [data-version]:not([disabled])')?.focus();
}
function edit(i) {
  if (state.job) return;
  const m = messages()[i];
  if (!m || m.role !== 'user') return;
  state.edit = i; prompt.value = m.content;
  state.files = [...(m.files || []).map(f => ({...f, id: uuid(), status: 'ready', type: f.data ? 'application/pdf' : 'text/plain'})), ...(m.images || []).map((src, k) => ({id: uuid(), name: 'imagem-' + (k + 1), image: src, type: 'image/png', size: Math.round(src.length * 0.75), status: 'ready'}))];
  state.options = m.options || {};
  autosize(); renderComposer(); saveDraft(); prompt.focus(); prompt.setSelectionRange(prompt.value.length, prompt.value.length);
}

// --- Conversas: menus, renomear, arquivar, exportar ---------------------------------
function chatMenu(anchor, id, full = false) {
  const c = state.chats.find(x => x.id === id);
  if (!c) return;
  openMenu(anchor, [
    {icon: 'edit', label: 'Renomear', run: () => rename(id)},
    {icon: 'pin', label: c.pinned ? 'Desafixar' : 'Fixar', run: () => patchChat(id, {pinned: !c.pinned}, c.pinned ? 'Conversa desafixada.' : 'Conversa fixada.')},
    {icon: 'archive', label: c.archived ? 'Desarquivar' : 'Arquivar', run: () => patchChat(id, {archived: !c.archived}, c.archived ? 'Conversa desarquivada.' : 'Conversa arquivada. Veja em Arquivadas.')},
    ...(full ? [{icon: 'file', label: 'Exportar texto (.txt)', run: () => download('txt')}, {icon: 'file', label: 'Exportar Markdown (.md)', run: () => download('md')}, {icon: 'file', label: 'Salvar como PDF', run: () => print()}] : []),
    {icon: 'trash', label: 'Excluir', danger: true, run: () => confirmDelete(id)}
  ]);
}
async function patchChat(id, body, message) {
  const saved = await api('chats/' + id, 'PATCH', body);
  const i = state.chats.findIndex(c => c.id === id); state.chats[i] = saved;
  state.chats.sort((a, b) => b.pinned - a.pinned || b.updated - a.updated);
  render(); if (message) toast(message);
}
function rename(id) {
  const c = state.chats.find(x => x.id === id);
  dialog('Renomear conversa', '<form id="renameform" class="stack" data-id="' + esc(id) + '"><label>Título<input name="title" maxlength="120" required value="' + esc(c.title) + '" autofocus></label><div class="actions"><button class="primary">Salvar</button>' + button('close', 'Cancelar') + '</div></form>');
  $('#renameform input').select();
}
function confirmDelete(id) {
  dialog('Excluir conversa?', '<p>A conversa “' + esc(state.chats.find(c => c.id === id)?.title) + '” será removida de forma permanente.</p><div class="actions">' + button('close', 'Cancelar') + '<button type="button" class="primary" data-delete="' + esc(id) + '">Excluir</button></div>');
}
function download(ext) {
  const title = state.temporary ? 'Conversa temporária' : current()?.title || 'Conversa';
  const data = (ext === 'md' ? '# ' : '') + title + '\n\n' + messages().map(m => (ext === 'md' ? '## ' : '') + (m.role === 'user' ? 'Você' : 'Jack AI') + '\n' + m.content + (m.files?.length ? '\n\nArquivos: ' + m.files.map(f => f.name).join(', ') : '')).join('\n\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], {type: 'text/plain;charset=utf-8'})); a.download = 'Jack-AI-conversa.' + ext; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// --- Estúdio: "Usar na conversa" ------------------------------------------------------
function useInChat(text) {
  const open = state.temporary ? 'temp' : state.current;
  const options = [
    ...(state.temporary ? [['temp', 'Conversa temporária aberta']] : state.current ? [[state.current, 'Conversa aberta: ' + (current()?.title || '')]] : []),
    ['new', 'Nova conversa'],
    ...state.chats.filter(c => !c.archived && c.id !== state.current).slice(0, 30).map(c => [c.id, c.title])
  ];
  dialog('Usar na conversa', '<form id="useform" class="stack"><label>Prévia editável<textarea name="text" rows="9" autofocus>' + esc(text) + '</textarea></label>' +
    '<label>Conversa de destino<select name="target">' + options.map(([v, l]) => '<option value="' + esc(v) + '" ' + (v === (open || 'new') ? 'selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></label>' +
    '<p class="note" id="usenote"></p><div class="actions"><button class="primary">Inserir no rascunho</button>' + button('close', 'Cancelar') + '</div></form>', {wide: true});
  const form = $('#useform');
  const draftFor = target => target === 'temp' || target === state.current ? (state.view === 'chat' || target === 'temp' ? snapshotDraft() : drafts.get(target) || snapshotDraft()) : drafts.get(target === 'new' ? null : target);
  const info = () => {
    const d = draftFor(form.target.value);
    $('#usenote').textContent = (d?.text?.trim() ? 'O rascunho já digitado nesta conversa (' + d.text.trim().length + ' caracteres) será mantido e o conteúdo entra depois dele. ' : 'A conversa escolhida ainda não tem rascunho. ') + 'Nada é enviado até você pressionar Enviar.';
  };
  form.target.onchange = info; info();
}
async function applyUse(form) {
  const text = form.text.value.trim(), target = form.target.value;
  if (!text) throw Error('A prévia está vazia.');
  closeDialog();
  if (target === 'temp') { state.view = 'chat'; }
  else if (target === 'new') { if (state.current || state.temporary) { saveDraft(); state.temporary = false; state.tmp = []; sessionStorage.removeItem('jack.temp'); state.current = null; restoreDraft(null); } state.view = 'chat'; }
  else if (target !== state.current) { openChat(target, {focus: false}); }
  else { state.view = 'chat'; if (!prompt.value && !state.files.length) restoreDraft(target); }
  prompt.value = prompt.value.trim() ? prompt.value.replace(/\s+$/, '') + '\n\n' + text : text;
  setHash(); render(); autosize(); saveDraft();
  prompt.focus(); prompt.setSelectionRange(prompt.value.length, prompt.value.length);
  toast('Conteúdo inserido no rascunho. Revise e envie quando quiser.');
}

// --- Ditado, leitura em voz alta, esforço e atalhos ------------------------------------
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
function renderMic() {
  const mic = $('#mic');
  // Em celulares, o teclado já oferece ditado; o botão aparece só em computadores.
  mic.hidden = !Recognition || coarse.matches;
  mic.setAttribute('aria-pressed', String(!!recognition));
  mic.setAttribute('aria-label', recognition ? 'Parar ditado' : 'Ditar mensagem');
  mic.title = recognition ? 'Ouvindo… clique para parar' : 'Ditar mensagem (o navegador processa o áudio)';
  mic.classList.toggle('listening', !!recognition);
}
function dictate() {
  if (recognition) { recognition.stop(); return; }
  if (!Recognition) return toast('Este navegador não oferece ditado.');
  const rec = new Recognition(), base = prompt.value.trim() ? prompt.value.replace(/\s*$/, ' ') : '';
  let finalText = '';
  rec.lang = 'pt-BR'; rec.interimResults = true; rec.continuous = true;
  rec.onresult = e => {
    let interim = '';
    for (let k = e.resultIndex; k < e.results.length; k++) (e.results[k].isFinal ? (finalText += e.results[k][0].transcript) : (interim += e.results[k][0].transcript));
    prompt.value = base + finalText + interim; autosize(); saveDraftSoon();
  };
  rec.onerror = e => toast(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Permita o uso do microfone para ditar.' : e.error === 'no-speech' ? 'Nenhuma fala detectada.' : 'O ditado parou. Tente de novo.');
  rec.onend = () => { recognition = null; renderMic(); prompt.focus(); };
  recognition = rec; rec.start(); renderMic(); prompt.focus();
}
// Texto falado sem marcação: blocos de código viram um aviso curto.
const speakable = text => String(text).replace(/```[\s\S]*?```/g, ' (bloco de código) ').replace(/`([^`]+)`/g, '$1').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[#*_>~|]/g, ' ').replace(/\$+/g, ' ').replace(/\s+/g, ' ').trim();
function speak(i) {
  const synth = window.speechSynthesis;
  if (!synth) return;
  if (state.speaking === i) { synth.cancel(); state.speaking = null; renderThread(); return; }
  synth.cancel();
  const u = new SpeechSynthesisUtterance(speakable(messages()[i]?.content || ''));
  u.lang = 'pt-BR';
  const voice = synth.getVoices().find(v => /^pt(-|_)BR/i.test(v.lang)) || synth.getVoices().find(v => /^pt/i.test(v.lang));
  if (voice) u.voice = voice;
  u.onend = u.onerror = () => { if (state.speaking === i) { state.speaking = null; renderThread(); } };
  state.speaking = i; renderThread(); synth.speak(u);
}
function effortMenu(anchor) {
  const m = selected(), supported = !!m?.capabilities?.reasoning;
  openMenu(anchor, EFFORTS.map(([value, label, hint]) => ({icon: (state.effort || '') === value ? 'check' : 'blank', label, hint, checked: (state.effort || '') === value,
    run: () => {
      state.effort = value; remember('jack.effort', value); renderComposer();
      toast(value && m && !supported ? 'Esforço ' + label.toLowerCase() + ' escolhido. O ' + m.name + ' não ajusta o esforço; a escolha vale para modelos compatíveis.' : 'Nível de esforço: ' + label + '.');
    }})));
}
function toggleWeb() {
  state.web = !state.web; remember('jack.web', state.web ? '1' : ''); renderComposer();
  toast(state.web ? 'Pesquisa na web ativada: o modelo pode buscar informações atuais e citar as fontes.' : 'Pesquisa na web desativada.');
}
const SHORTCUTS = [['Ctrl/⌘ + K', 'Nova conversa'], ['Ctrl/⌘ + /', 'Buscar conversas'], ['Enter', 'Enviar mensagem (no computador)'], ['Shift + Enter', 'Nova linha'],
  ['Esc', 'Fechar menu, seletor ou diálogo; com o foco nas mensagens, interrompe a resposta'], ['Ctrl/⌘ + Shift + C', 'Copiar a última resposta'], ['Ctrl/⌘ + Shift + E', 'Trocar o nível de esforço'], ['?', 'Mostrar estes atalhos']];
function shortcuts() {
  dialog('Atalhos de teclado', '<dl class="keys">' + SHORTCUTS.map(([k, v]) => '<div><dt>' + k.split(' + ').map(x => '<kbd>' + esc(x) + '</kbd>').join(' + ') + '</dt><dd>' + esc(v) + '</dd></div>').join('') + '</dl>' +
    '<div class="actions">' + button('tour', icon('spark') + 'Ver tutorial guiado') + '</div>');
}
// Tutorial guiado: abre sozinho no primeiro acesso com conta e pode ser revisto em Configurações.
function runTour() {
  if (document.querySelector('.tour')) return;
  if (picker.open) picker.hide?.();
  closeMobileNav();
  if (state.view !== 'chat') { if (busy()) return; saveDraft(); state.view = 'chat'; setHash(); render(); }
  startTour(tourSteps({name: state.user?.name, account: !!state.user?.email}), {
    mobile, openSidebar: () => { document.body.classList.add('mobileopen'); syncNavigation(); }, closeSidebar: closeMobileNav,
    focusAfter: () => prompt,
    done: async completed => {
      if (!completed) toast('Tutorial fechado. Para rever, abra Configurações e toque em “Ver tutorial guiado”.');
      if ((state.user?.prefs?.tour || 0) >= TOUR_VERSION) return;
      try { const r = await api('tour', 'POST', {version: TOUR_VERSION}); if (state.user) state.user.prefs.tour = r.tour; } catch {}
    }
  });
}
async function copyLast() {
  const last = [...messages()].reverse().find(m => m.role === 'assistant' && m.content);
  if (!last) return toast('Ainda não há resposta para copiar.');
  try { await navigator.clipboard.writeText(last.content); toast('Última resposta copiada.'); } catch { toast('Não foi possível copiar.'); }
}
const GOOGLE_MESSAGES = {
  ok: 'Você entrou com o Google.', conectado: 'Conta Google conectada. Agora você também pode entrar com o Google.',
  cancelado: 'Login com Google cancelado.', expirado: 'O login com Google expirou ou foi aberto em outra aba. Tente de novo.',
  falha: 'O Google não confirmou o login. Tente de novo em instantes.', 'nao-verificado': 'O e-mail desta conta Google não está verificado.',
  existe: 'Já existe uma conta com este e-mail. Entre com e-mail e senha e depois conecte o Google em Configurações.',
  vinculada: 'Esta conta Google já está conectada a outro usuário do Jack AI.', desativado: 'O login com Google não está configurado nesta instalação.',
  sessao: 'Sua sessão expirou. Recarregue a página e tente de novo.',
  limite: 'Muitas tentativas de login em pouco tempo. Aguarde um minuto e tente de novo.'
};
function googleStart(mode) { saveDraft(); location.href = '/api/auth/google/start' + (mode === 'link' ? '?mode=link' : ''); }

// --- Conta e preferências -------------------------------------------------------------
function profile() {
  const u = state.user;
  $('#username').textContent = u.name; $('#accountlabel').textContent = u.email ? (u.google ? 'Conta Google' : 'Minha conta') : 'Entrar na conta';
  $('#avatar').innerHTML = u.photo ? '<img alt="" src="' + esc(u.photo) + '">' : esc(u.name.slice(0, 1).toUpperCase());
  const theme = u.prefs.theme || 'dark';
  document.body.classList.toggle('light', theme === 'light' || (theme === 'auto' && matchMedia('(prefers-color-scheme: light)').matches));
}
const LENGTHS = [[512, 'Curtas'], [1024, 'Médias'], [2048, 'Longas'], [4096, 'Muito longas'], [8192, 'Máximo']];
function settings() {
  const u = state.user, p = u.prefs, size = LENGTHS.reduce((best, x) => Math.abs(x[0] - (p.maxTokens || 2048)) < Math.abs(best[0] - (p.maxTokens || 2048)) ? x : best)[0];
  const google = u.email && u.auth?.google ? (u.google ? '<p class="note ok">' + icon('check') + 'Conta Google conectada. Você pode entrar com o Google.</p>' : button('linkGoogle', icon('link') + 'Conectar conta Google')) : '';
  dialog('Configurações', '<form id="settingsform" class="stack"><label>Nome<input name="name" required maxlength="80" value="' + esc(u.name) + '"></label><label>Foto de perfil<input type="file" name="photo" accept="image/png,image/jpeg,image/webp"></label>' +
    '<label>Aparência<select name="theme">' + [['dark', 'Escura'], ['light', 'Clara'], ['auto', 'Automática']].map(([v, n]) => '<option value="' + v + '" ' + (v === (p.theme || 'dark') ? 'selected' : '') + '>' + n + '</option>').join('') + '</select></label>' +
    '<label>Instruções personalizadas<textarea name="instructions" maxlength="4000" placeholder="Ex.: responda de forma direta e use exemplos em Python.">' + esc(p.instructions) + '</textarea></label>' +
    '<label>Criatividade · aplicada em modelos compatíveis<select name="temperature">' + [[0.2, 'Precisa'], [0.7, 'Equilibrada'], [1.1, 'Criativa']].map(([v, n]) => '<option value="' + v + '" ' + (Math.abs((p.temperature ?? 0.7) - v) < 0.21 ? 'selected' : '') + '>' + n + '</option>').join('') + '</select></label>' +
    '<label>Tamanho das respostas<select name="maxTokens" aria-describedby="sizehint">' + LENGTHS.map(([v, n]) => '<option value="' + v + '" ' + (v === size ? 'selected' : '') + '>' + n + '</option>').join('') + '</select><small id="sizehint">O Jack AI Code sempre usa o tamanho Máximo, para não cortar arquivos.</small></label><button class="primary">Salvar preferências</button></form>' +
    '<p class="note">Conversas temporárias ficam apenas na aba aberta. Ao enviar uma mensagem, o provedor do modelo recebe o contexto da conversa.</p>' +
    (u.email ? '<h3 class="sub">Conta</h3><p class="note">' + esc(u.email) + '</p><div class="actions">' + google + button('logoutAll', icon('logout') + 'Sair de todos os dispositivos') + button('logout', 'Sair') + '</div>' : (u.auth?.google ? '<div class="actions">' + button('google', icon('login') + 'Continuar com Google') + button('login', 'Entrar com e-mail') + '</div>' : '')) +
    '<h3 class="sub">Seus dados</h3><div class="actions"><a class="secondary btnlink" href="/api/export" download>' + icon('download') + 'Baixar meus dados (.json)</a>' + button('clearChats', icon('trash') + 'Excluir todas as conversas') + button('deleteAccount', 'Excluir conta e dados') + '</div>' +
    '<div class="actions">' + button('tour', icon('spark') + 'Ver tutorial guiado') + button('shortcuts', icon('keyboard') + 'Atalhos de teclado') + button('library', 'Biblioteca de modelos') + '</div>');
}
function auth(mode = 'login') {
  const reg = mode === 'register', rec = mode === 'recover';
  const google = !rec && state.user?.auth?.google ? '<button type="button" class="secondary google" data-action="google">' + icon('login') + 'Continuar com Google</button><p class="divider"><span>ou use seu e-mail</span></p>' : '';
  dialog(reg ? 'Criar conta' : rec ? 'Recuperar senha' : 'Entrar no Jack AI', google + '<form id="authform" class="stack" data-mode="' + mode + '">' + (reg ? '<label>Nome<input name="name" required maxlength="80" autocomplete="name"></label>' : '') +
    '<label>E-mail<input name="email" type="email" required autocomplete="email"></label>' + (rec ? '<label>Código de recuperação<input name="code" required></label>' : '') +
    '<label>' + (rec ? 'Nova senha' : 'Senha') + '<input name="password" type="password" minlength="10" maxlength="256" required autocomplete="' + (reg || rec ? 'new-password' : 'current-password') + '"></label><button class="primary">' + (reg ? 'Cadastrar' : rec ? 'Redefinir senha' : 'Entrar') + '</button></form>' +
    '<p class="note">Ao entrar, suas conversas ficam guardadas na conta e o Jack AI Pro fica disponível.</p><div class="actions">' + (mode !== 'login' ? button('login', 'Entrar') : '') + (mode !== 'register' ? button('register', 'Criar conta') : '') + (mode !== 'recover' ? button('recover', 'Recuperar senha') : '') + '</div>');
}
function leave() { drafts.clear(); sessionStorage.removeItem('jack.temp'); try { localStorage.removeItem('jack.model'); } catch {} location.reload(); }
async function toggleFavorite(id, on) {
  const prefs = state.user.prefs, set = new Set((prefs.favorites || []).map(canon));
  on ? set.add(id) : set.delete(id); prefs.favorites = [...set];
  try { prefs.favorites = (await api('favorites', 'POST', {id, favorite: on})).favorites; }
  catch (e) { on ? set.delete(id) : set.add(id); prefs.favorites = [...set]; toast(e.message); }
  toast(on ? 'Adicionado aos favoritos.' : 'Removido dos favoritos.');
}

// --- Catálogo ---------------------------------------------------------------------------
async function loadCatalog() {
  try {
    const data = await api('models');
    if (!Array.isArray(data?.models)) throw Error('O catálogo recebido tem um formato inválido.');
    state.catalog = data; state.catalogAt = Date.now();
    let saved = ''; try { saved = localStorage.getItem('jack.model') || ''; } catch {}
    const want = canon(state.model || saved);
    const hit = data.models.find(m => m.id === want);
    if (hit) { state.model = want; if (!hit.available && !state.job && (!state.notice || /indisponível/.test(state.notice.html))) unavailableNotice(hit); else if (state.notice?.type === 'warn' && /indisponível/.test(state.notice.html)) state.notice = null; }
    else state.model = preferredModel(data.models, '');
    if (want && !hit) setNotice({type: 'warn', html: 'O modelo escolhido antes não está mais no catálogo. Selecionei ' + esc(selected()?.name || 'outro modelo') + '; você pode trocar a qualquer momento.'});
  } catch (e) {
    state.catalogError = e.message;
    if (!state.catalog) setNotice({type: 'error', html: 'Não foi possível carregar os modelos. ' + esc(e.message), actions: [{id: 'retry', label: 'Tentar novamente', primary: true, run: loadCatalog}]});
  }
  renderComposer(); picker.render();
  if (state.view === 'library') renderLibrary($('#library'), libraryCtx);
}

const picker = createPicker({root: $('#picker'), anchor: $('#modelbtn'), ctx: {
  state: () => ({catalog: state.catalog, model: state.model, favorites: favorites()}), order: ORDER,
  current: selected, files: () => state.files, prompt: () => prompt,
  choose: id => setModel(id), favorite: toggleFavorite, dropImages: () => { state.files = state.files.filter(f => !isImage(f)); renderComposer(); },
  unavailable: m => { picker.hide(prompt); unavailableNotice(m); }, library: openLibrary,
  refresh: () => { if (Date.now() - state.catalogAt > 30000) loadCatalog(); }
}});
const libraryCtx = {
  state: () => ({catalog: state.catalog, model: state.model, favorites: favorites()}), order: ORDER, favorite: toggleFavorite,
  use: id => { const m = models().find(x => x.id === id); const bad = incompatibleFiles(m, state.files); state.view = 'chat'; setModel(id); setHash(); render(); if (bad.length) compatNotice(m, bad); prompt.focus(); }
};

// --- Eventos -------------------------------------------------------------------------
async function action(a, el) {
  if (a === 'collapse') {
    document.body.classList.toggle(mobile() ? 'mobileopen' : 'collapsed'); syncNavigation();
    if (mobile()) (document.body.classList.contains('mobileopen') ? $('#sidebar .new') : $('.menu')).focus();
    return;
  }
  if (a === 'close') return closeDialog();
  if (a === 'new') return newChat();
  if (a === 'home') { if (state.view !== 'chat' || hasThread()) { if (busy()) return; saveDraft(); if (!state.temporary) { state.current = null; restoreDraft(null); } state.view = 'chat'; closeMobileNav(); setHash(); render(); } prompt.focus(); return; }
  if (a === 'library') { closeDialog(); return openLibrary(); }
  if (a === 'studio') return openStudio(el?.dataset.tab);
  if (a === 'temporary') return toggleTemporary();
  if (a === 'discardTemp') { if (state.tmp.length && !await confirmDiscard()) return; state.temporary = false; state.tmp = []; sessionStorage.removeItem('jack.temp'); restoreDraft(null); setHash(); render(); prompt.focus(); return; }
  if (a === 'toggleArchived') { state.showArchived = !state.showArchived; renderSidebar(); return; }
  if (a === 'attach') return $('#file').click();
  if (a === 'refreshCatalog') { await loadCatalog(); toast('Catálogo atualizado.'); return; }
  if ((a === 'account' || a === 'settings') && !state.user) return toast('Aguarde a conexão com sua sessão.');
  if (a === 'settings') return settings();
  if (a === 'account') return state.user.email ? settings() : auth();
  if (['login', 'register', 'recover'].includes(a)) return auth(a);
  if (a === 'deleteAccount') return dialog('Excluir seus dados?', '<p>Esta ação remove sua conta e todas as conversas de forma permanente.</p><div class="actions">' + button('close', 'Cancelar') + button('confirmDeleteAccount', 'Excluir', 'primary') + '</div>');
  if (a === 'confirmDeleteAccount') { await api('account', 'DELETE'); return leave(); }
  if (a === 'logout') { await api('logout', 'POST'); return leave(); }
  if (a === 'logoutAll') return dialog('Sair de todos os dispositivos?', '<p>Todas as sessões desta conta serão encerradas, inclusive esta. Você precisará entrar de novo.</p><div class="actions">' + button('close', 'Cancelar') + button('confirmLogoutAll', 'Sair de todos', 'primary') + '</div>');
  if (a === 'confirmLogoutAll') { await api('logout-all', 'POST'); return leave(); }
  if (a === 'clearChats') return dialog('Excluir todas as conversas?', '<p>As ' + state.chats.length + ' conversas desta conta, inclusive as arquivadas, serão removidas de forma permanente. Baixe seus dados antes, se quiser guardar uma cópia.</p><div class="actions">' + button('close', 'Cancelar') + button('confirmClearChats', 'Excluir tudo', 'primary') + '</div>');
  if (a === 'confirmClearChats') { const r = await api('chats', 'DELETE'); state.chats.forEach(c => drafts.forget(c.id)); state.chats = []; state.current = null; closeDialog(); restoreDraft(null); setHash(); render(); toast(r.deleted === 1 ? '1 conversa excluída.' : r.deleted + ' conversas excluídas.'); return; }
  if (a === 'google') return googleStart('login');
  if (a === 'linkGoogle') return googleStart('link');
  if (a === 'shortcuts') return shortcuts();
  if (a === 'tour') { closeDialog(); return runTour(); }
  if (a === 'effort') return effortMenu(el);
  if (a === 'web') return toggleWeb();
  if (a === 'dictate') return dictate();
}
document.addEventListener('click', guard(async e => {
  const el = e.target.closest('button');
  if (!el || el.closest('#picker')) return;
  const d = el.dataset;
  if (d.action) return action(d.action, el);
  if (d.suggestion) {
    const s = suggestions.find(x => x.id === d.suggestion), {text, start, end} = applySuggestion(prompt.value, s);
    prompt.value = text; autosize(); prompt.focus(); prompt.setSelectionRange(start, end); saveDraft(); return;
  }
  if (d.chat) return openChat(d.chat);
  if (d.rowmenu) return chatMenu(el, d.rowmenu);
  if (el.id === 'threadmenu') return chatMenu(el, state.current, true);
  if (d.remove) { state.files = state.files.filter(f => f.id !== d.remove); if (!state.files.some(isImage)) state.notice = state.notice?.type === 'warn' ? null : state.notice; renderComposer(); saveDraft(); prompt.focus(); return; }
  if (d.copy !== undefined) { try { await navigator.clipboard.writeText(messages()[d.copy].content); toast(messages()[d.copy].role === 'user' ? 'Mensagem copiada.' : 'Resposta copiada.'); } catch { toast('Não foi possível copiar. Selecione o texto e copie manualmente.'); } return; }
  if (d.edit !== undefined) return edit(Number(d.edit));
  if (d.retry !== undefined) return retry(Number(d.retry));
  if (d.regenerate !== undefined) return regenerate(Number(d.regenerate));
  if (d.continue !== undefined) return continueReply();
  if (d.speak !== undefined) return speak(Number(d.speak));
  if (d.zip !== undefined) return downloadZip(Number(d.zip));
  if (d.zipImages !== undefined) return zipImages(Number(d.zipImages));
  if (d.viewAll !== undefined) return openViewer(viewItems(filesOf(Number(d.viewAll))), 0, el, toast);
  if (d.viewImage) { const [i, k] = d.viewImage.split(':').map(Number), m = messages()[i]; return m && openViewer(imageItems(m, i), k, el, toast); }
  if (d.viewPath) {
    const i = Number(el.closest('article')?.dataset.index), files = Number.isInteger(i) ? filesOf(i) : [], k = files.findIndex(f => f.path === d.viewPath);
    if (k >= 0) return openViewer(viewItems(files), k, el, toast);
    if (el._file) return openViewer(viewItems([el._file]), 0, el, toast);
    return;
  }
  if (d.file) { const [i, k] = d.file.split(':').map(Number), f = filesOf(i)[k]; if (f) { saveFile(f.path, f.code.endsWith('\n') ? f.code : f.code + '\n'); toast(f.path.split('/').pop() + ' baixado.'); } return; }
  if (d.version) { const [i, v] = d.version.split(':').map(Number); return selectVersion(i, v); }
  if (d.switch) { setModel(d.switch); toast('Modelo trocado. Use “Tentar novamente” para reenviar.'); return; }
  if (d.delete) {
    const id = d.delete; await api('chats/' + id, 'DELETE'); drafts.forget(id); closeDialog();
    state.chats = state.chats.filter(c => c.id !== id);
    if (state.current === id) { state.current = null; restoreDraft(null); setHash(); }
    render(); toast('Conversa excluída.');
  }
}));
$('#modelbtn').addEventListener('click', () => picker.toggle());
// Um segundo clique logo após o envio (clique duplo) não interrompe nem duplica a mensagem.
// Interromper: corta o fluxo no navegador e avisa o servidor, que grava o trecho recebido.
function stopJob() {
  const j = state.job; if (!j || j.controller.signal.aborted) return;
  j.controller.abort();
  fetch('/api/stop', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({job: j.id}), keepalive: true}).catch(() => {});
}
composer.addEventListener('submit', e => { e.preventDefault(); if (state.job) { if (Date.now() - state.job.started > 700) stopJob(); return; } guard(submit)(); });
document.addEventListener('submit', guard(async e => {
  const form = e.target;
  if (form === composer) return;
  e.preventDefault();
  const b = Object.fromEntries(new FormData(form));
  if (form.id === 'authform') {
    const result = await api(form.dataset.mode, 'POST', b);
    if (result.recovery) { dialog('Guarde seu código de recuperação', '<p>Guarde este código em um local seguro. Ele permite redefinir sua senha.</p><p><span class="code">' + esc(result.recovery) + '</span></p><div class="actions"><button type="button" class="primary" id="reloadNow">Continuar</button></div>'); $('#reloadNow').onclick = () => location.reload(); }
    else location.reload();
  }
  if (form.id === 'settingsform') {
    if (b.photo.size > 290000) throw Error('Use uma foto com menos de 290 KB.');
    b.photo = b.photo.size ? await readData(b.photo) : state.user.photo;
    state.user = await api('profile', 'POST', b); profile(); closeDialog(); toast('Preferências salvas.');
  }
  if (form.id === 'renameform') { await patchChat(form.dataset.id, {title: b.title}, 'Conversa renomeada.'); closeDialog(); }
  if (form.id === 'useform') await applyUse(form);
}));
$('#file').onchange = guard(async () => { const list = [...$('#file').files]; $('#file').value = ''; if (list.length) await addFiles(list); prompt.focus(); });
composer.addEventListener('dragover', e => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
composer.addEventListener('drop', e => { if (!e.dataTransfer?.files?.length) return; e.preventDefault(); guard(addFiles)([...e.dataTransfer.files]); });
prompt.addEventListener('paste', e => { const files = [...(e.clipboardData?.files || [])]; if (files.length) { e.preventDefault(); guard(addFiles)(files); } });
prompt.addEventListener('input', () => { autosize(); saveDraftSoon(); if (state.notice?.type === 'error' && !state.job) { /* mantém o aviso até nova tentativa */ } });
prompt.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !coarse.matches) { e.preventDefault(); if (!state.job) guard(submit)(); }
});
prompt.addEventListener('focus', () => { if (mobile() && document.body.classList.contains('mode-home')) setTimeout(() => composer.scrollIntoView({block: 'nearest'}), 280); });
$('#profileControls').addEventListener('input', e => { const k = e.target.dataset.opt; if (!k) return; state.options[k] = e.target.value; $('#profileControls').dataset.key = ''; saveDraftSoon(); });
$('#search').addEventListener('input', renderSidebar);
$('#search').addEventListener('keydown', e => { if (e.key === 'Escape' && $('#search').value) { e.stopPropagation(); $('#search').value = ''; renderSidebar(); } });
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (!$('#dialog').open) guard(newChat)(); }
  if ((e.ctrlKey || e.metaKey) && e.key === '/') { e.preventDefault(); if (mobile()) { document.body.classList.add('mobileopen'); syncNavigation(); } $('#search').focus(); }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'c' && !getSelection().toString()) { e.preventDefault(); guard(copyLast)(); }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'e') { e.preventDefault(); if (!$('#dialog').open) effortMenu($('#effort')); }
  if (e.key === '?' && !e.ctrlKey && !e.metaKey && !$('#dialog').open && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) && !document.activeElement?.isContentEditable) { e.preventDefault(); shortcuts(); }
  if (e.key === 'Escape' && !$('#dialog').open && !menu && !picker.open && document.body.classList.contains('mobileopen')) { closeMobileNav(); $('.menu').focus(); }
});
$('#messages').addEventListener('keydown', e => { if (e.key === 'Escape' && state.job) stopJob(); });
addEventListener('hashchange', () => {
  const h = location.hash;
  if (h.startsWith('#/c/')) { const id = h.slice(4); if (state.chats.some(c => c.id === id)) openChat(id, {focus: false}); }
  else if (h === '#/biblioteca') openLibrary();
  else if (h.startsWith('#/estudio')) openStudio(h.split('/')[2]);
  else if (state.view !== 'chat') { state.view = 'chat'; render(); }
});
matchMedia('(prefers-color-scheme: light)').onchange = () => state.user && profile();
addEventListener('online', () => { toast('Conexão restabelecida.'); if (!state.job) guard(async () => { state.chats = await api('chats'); render(); })(); });
addEventListener('offline', () => toast('Sem conexão. Seu rascunho continua guardado.'));
addEventListener('pagehide', saveDraft);
setInterval(() => { if (document.visibilityState === 'visible' && !state.job && state.user && Date.now() - state.catalogAt > 60000) loadCatalog(); }, 20000);

// Teclado virtual: mantém o campo e o botão de envio acima do teclado.
const vv = window.visualViewport;
function fitViewport() {
  if (!vv) return;
  const open = innerHeight - vv.height > 140 && mobile() && vv.scale <= 1.01;
  if (open) document.body.style.setProperty('--app-h', Math.round(vv.height) + 'px');
  else document.body.style.removeProperty('--app-h');
  document.body.classList.toggle('keyboard', open);
  if (open && document.activeElement === prompt) requestAnimationFrame(() => { window.scrollTo(0, 0); composer.scrollIntoView({block: 'nearest'}); keepCaretVisible(); });
}
vv?.addEventListener('resize', fitViewport); vv?.addEventListener('scroll', fitViewport); fitViewport();
addEventListener('resize', () => requestAnimationFrame(() => { keepCaretVisible(); if (document.activeElement === prompt && mobile()) composer.scrollIntoView({block: 'nearest'}); }));

function syncNavigation() {
  const isMobile = mobile();
  const open = isMobile ? document.body.classList.contains('mobileopen') : !document.body.classList.contains('collapsed');
  $('#sidebar').inert = !open; $('main').inert = isMobile && open;
  $('.menu').setAttribute('aria-expanded', String(open));
}
matchMedia('(max-width:760px)').addEventListener('change', syncNavigation);

// --- Inicialização -------------------------------------------------------------------
document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
$('#suggestions').innerHTML = suggestions.map(s => '<button type="button" class="suggestion" data-suggestion="' + s.id + '">' + icon(s.icon) + s.label + '</button>').join('');
$('#homeSlot').append(composer);
async function initialize() {
  $('#connection').hidden = true;
  try {
    state.user = await api('session', 'POST', {}); profile();
    try { drafts = createDrafts(localStorage, state.user.id); } catch { drafts = createDrafts(null, state.user.id); }
    const [chats] = await Promise.all([api('chats'), loadCatalog()]);
    state.chats = chats;
    if (sessionStorage.getItem('jack.temp') === '1') {
      state.temporary = true;
      setNotice({type: 'info', html: 'A conversa temporária anterior foi descartada ao recarregar a página, como previsto. O chat temporário continua ativo.', actions: [{id: 'ok', label: 'Entendi', run: () => { setNotice(null); prompt.focus(); }}]});
      history.replaceState(null, '', '#/');
    }
    const google = location.hash.match(/^#\/\?google=([\w-]+)/)?.[1];
    if (google) { history.replaceState(null, '', '#/'); const text = GOOGLE_MESSAGES[google] || GOOGLE_MESSAGES.falha; if (['ok', 'conectado'].includes(google)) toast(text); else setNotice({type: 'warn', html: esc(text), actions: [{id: 'ok', label: 'Entendi', run: () => { setNotice(null); prompt.focus(); }}, ...(google === 'existe' ? [{id: 'login', label: 'Entrar com e-mail', primary: true, run: () => auth('login')}] : [])]}); }
    const h = location.hash;
    if (!state.temporary && h.startsWith('#/c/') && chats.some(c => c.id === h.slice(4))) { state.current = h.slice(4); const c = current(); if (c.model && models().some(m => m.id === canon(c.model) && m.available)) state.model = canon(c.model); restoreDraft(state.current); }
    else if (h === '#/biblioteca') { restoreDraft(null); render(); return openLibrary(); }
    else if (h.startsWith('#/estudio')) { restoreDraft(null); render(); return openStudio(h.split('/')[2]); }
    else if (!state.temporary) restoreDraft(null);
    render(); scrollToEnd(true);
    if (!coarse.matches) prompt.focus({preventScroll: true});
    if (state.user.email && (state.user.prefs?.tour || 0) < TOUR_VERSION) setTimeout(runTour, 450);
  } catch { $('#connection').hidden = false; }
}
$('#reconnect').onclick = initialize;
syncNavigation(); autosize(); render(); initialize();
