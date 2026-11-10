// Seletor rápido de modelos do chat: busca, favoritos, seções por fornecedor e
// indicação do modelo ativo. Esc fecha e devolve o foco ao botão de origem.
import {icon} from './icons.js';
import {groupModels, incompatibleFiles, listable} from './workspace.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

export function createPicker({root, anchor, ctx}) {
  let query = '', open = false, confirm = null;

  function tags(m, current) {
    const out = [];
    if (m.id === current) out.push('<span class="tagc active">ativo</span>');
    if (m.preview) out.push('<span class="tagc preview">Prévia</span>');
    if (m.capabilities?.image) out.push('<span class="tagc" title="Cria imagens e figurinhas">Cria imagens</span>');
    else if (m.capabilities?.vision) out.push('<span class="tagc" title="Analisa imagens">Imagens</span>');
    if (!m.available) out.push('<span class="tagc">Entre na conta</span>');
    return out.join('');
  }

  function subtitle(m) {
    if (m.kind === 'profile') return m.available ? esc(m.when) + (m.route ? ' · via ' + esc(m.route.name) : '') : esc(m.reason || m.when);
    return esc([m.vendor !== m.host ? m.vendor + ' · via ' + m.host : m.host, m.description].filter(Boolean).join(' · '));
  }

  function render() {
    const {catalog, model, favorites} = ctx.state();
    const models = (catalog?.models || []).filter(m => listable(m, catalog?.signedIn));
    const groups = groupModels(models, {favorites, query, order: ctx.order});
    root.innerHTML = (confirm ? confirmBox() : '') +
      '<div class="picker-head"><div class="search"><i>' + icon('search') + '</i><input id="pickerSearch" type="search" autocomplete="off" placeholder="Buscar por nome ou fornecedor" aria-label="Buscar modelo por nome ou fornecedor" value="' + esc(query) + '"></div>' +
      '<p id="pickerHelp">Use as setas para navegar e Enter para escolher.</p></div>' +
      '<div class="picker-list" id="pickerList">' + (groups.length ? groups.map(g => '<h3>' + esc(g.title) + '</h3>' + g.items.map(m => {
        const fav = favorites.includes(m.id);
        return '<div class="prow"><button type="button" class="opt" data-pick="' + esc(m.id) + '" ' + (m.id === model ? 'aria-current="true"' : '') + ' aria-describedby="pickerHelp">' +
          '<strong>' + esc(m.name) + '</strong><span class="tags">' + tags(m, model) + '</span><small>' + subtitle(m) + '</small></button>' +
          '<button type="button" class="icon fav" data-fav="' + esc(m.id) + '" aria-pressed="' + fav + '" aria-label="' + (fav ? 'Remover ' : 'Adicionar ') + esc(m.name) + (fav ? ' dos favoritos' : ' aos favoritos') + '">' + icon('star', fav) + '</button></div>';
      }).join('')).join('') : '<p class="empty">Nenhum modelo encontrado para “' + esc(query) + '”.</p>') + '</div>' +
      '<div class="picker-foot"><span>' + 'Catálogo conferido em ' + esc(catalog?.checked ? new Date(catalog.checked + 'T12:00:00').toLocaleDateString('pt-BR') : '') + '</span><button type="button" class="linkbtn" data-action="library">Biblioteca de modelos ' + icon('chevron') + '</button></div>';
    const input = root.querySelector('#pickerSearch');
    input.oninput = () => { query = input.value; const pos = input.selectionStart; render(); const again = root.querySelector('#pickerSearch'); again.focus(); again.setSelectionRange(pos, pos); };
  }

  function confirmBox() {
    const {model} = confirm;
    const files = confirm.files.map(f => '<b>' + esc(f.file.name) + '</b>').join(', ');
    return '<div class="confirm" role="alert"><p>' + files + ' ' + (confirm.files.length > 1 ? 'precisam' : 'precisa') + ' de um modelo com análise de imagens. O ' + esc(model.name) + ' não aceita imagens.</p>' +
      '<div class="actions"><button type="button" class="secondary" data-keep>Manter ' + esc(ctx.current()?.name || 'modelo atual') + '</button>' +
      '<button type="button" class="primary" data-drop="' + esc(model.id) + '">Remover ' + (confirm.files.length > 1 ? 'arquivos' : 'arquivo') + ' e usar ' + esc(model.name) + '</button></div></div>';
  }

  function place() {
    if (matchMedia('(max-width:760px)').matches) { root.style.left = '0'; root.style.top = ''; return; }
    const r = anchor.getBoundingClientRect(), h = Math.min(560, innerHeight * 0.7), w = Math.min(420, innerWidth - 24);
    const below = innerHeight - r.bottom > h + 16;
    root.style.left = Math.max(12, Math.min(r.left, innerWidth - w - 12)) + 'px';
    root.style.top = (below ? r.bottom + 8 : Math.max(12, r.top - 8 - Math.min(h, root.offsetHeight || h))) + 'px';
  }

  function show() {
    confirm = null; query = ''; open = true; root.hidden = false; anchor.setAttribute('aria-expanded', 'true');
    render(); place(); requestAnimationFrame(place);
    root.querySelector('#pickerSearch').focus();
    ctx.refresh?.();
  }
  function hide(returnTo = anchor) {
    if (!open) return;
    open = false; root.hidden = true; anchor.setAttribute('aria-expanded', 'false');
    returnTo?.focus();
  }
  function choose(id) {
    const m = ctx.state().catalog.models.find(x => x.id === id);
    if (!m) return;
    if (!m.available) { ctx.unavailable(m); return; }
    const bad = incompatibleFiles(m, ctx.files());
    if (bad.length) { confirm = {model: m, files: bad}; render(); root.querySelector('[data-keep]').focus(); return; }
    ctx.choose(id); hide(ctx.prompt());
  }

  root.addEventListener('click', e => {
    const pick = e.target.closest('[data-pick]'), fav = e.target.closest('[data-fav]');
    if (pick) return choose(pick.dataset.pick);
    if (fav) { const on = fav.getAttribute('aria-pressed') !== 'true'; ctx.favorite(fav.dataset.fav, on).then(() => { render(); root.querySelector('[data-fav="' + CSS.escape(fav.dataset.fav) + '"]')?.focus(); }); return; }
    if (e.target.closest('[data-keep]')) { confirm = null; hide(ctx.prompt()); return; }
    const drop = e.target.closest('[data-drop]');
    if (drop) { ctx.dropImages(); ctx.choose(drop.dataset.drop); confirm = null; hide(ctx.prompt()); return; }
    if (e.target.closest('[data-action=library]')) { hide(null); ctx.library(); }
  });
  root.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hide(); return; }
    const items = [...root.querySelectorAll('.opt')];
    const at = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); (items[at + 1] || items[0])?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); if (at <= 0) root.querySelector('#pickerSearch').focus(); else items[at - 1].focus(); }
    if (e.key === 'Enter' && e.target.id === 'pickerSearch') { e.preventDefault(); items[0]?.click(); }
    if (e.key === 'Tab' && !root.contains(e.relatedTarget)) { /* foco segue normalmente */ }
  });
  document.addEventListener('pointerdown', e => { if (open && !root.contains(e.target) && !anchor.contains(e.target)) hide(null); });
  addEventListener('resize', () => open && place());
  return {show, hide, toggle: () => open ? hide() : show(), render: () => open && render(), get open() { return open; }};
}
