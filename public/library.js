// Biblioteca de modelos: mesma fonte de dados do seletor (GET /api/models).
import {icon} from './icons.js';
import {groupModels} from './workspace.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const tasks = [['todas', 'Todas'], ['conversa', 'Conversa'], ['escrita', 'Escrita'], ['codigo', 'Código'], ['analise', 'Análise'], ['conteudo', 'Conteúdo']];
const caps = [['texto', 'Texto', m => m.capabilities?.text], ['codigo', 'Código', m => m.tasks?.includes('codigo')], ['imagens', 'Análise de imagens', m => m.capabilities?.vision],
  ['arquivos', 'Leitura de arquivos', m => m.capabilities?.files], ['longo', 'Contexto longo', m => m.capabilities?.longContext]];
const inputNames = {text: 'texto', image: 'imagem', file: 'arquivo (PDF)', audio: 'áudio', video: 'vídeo'};
const filter = {task: 'todas', caps: new Set(), query: '', onlyAvailable: false};
const date = v => v ? new Date(v).toLocaleString('pt-BR', {dateStyle: 'short', timeStyle: 'short'}) : '';
const day = v => v ? new Date(v + 'T12:00:00').toLocaleDateString('pt-BR', {day: 'numeric', month: 'long', year: 'numeric'}) : '';

function formats(m) {
  return 'Texto digitado, arquivos .txt, .md, .csv, .json, .js, .ts, .py, .html e .css de até 80 KB e um PDF de até 2 MB' + (m.capabilities?.vision ? '; imagens PNG, JPEG e WebP de até 1,8 MB' : '') +
    (m.capabilities?.files ? '. Lê PDF de forma nativa' : '. PDFs são convertidos em texto antes de chegar ao modelo') + '.';
}

function details(m, catalog) {
  const rows = [];
  const add = (k, v) => v && rows.push('<dt>' + k + '</dt><dd>' + v + '</dd>');
  if (m.kind === 'profile') {
    add('Identificador', '<span class="code">' + esc(m.id) + '</span>');
    add('Rota em uso', m.route ? esc(m.route.name) + ' <span class="tagc active">ativo</span><br><span class="code">' + esc(m.route.apiId) + '</span>' : 'Nenhuma rota disponível agora');
    add('Executado por', m.route ? esc(m.route.vendor) + (m.route.host && m.route.host !== m.route.vendor ? ' · hospedado em ' + esc(m.route.host) : '') + '. O Jack AI apresenta a rota como perfil próprio.' : '');
    const names = m.routes.map(id => catalog.models.find(x => x.id === id)?.name || id);
    add('Rotas candidatas', names.length ? esc(names.join(' → ')) : 'Nenhuma no momento');
    add('Acesso', m.access === 'account' ? 'Requer conta conectada' : 'Visitantes e contas');
    if (m.media) add('Geração de mídia', m.media.enabled ? 'Disponível' : 'Indisponível. ' + esc(m.media.reason));
  } else {
    add('Identificador da API', '<span class="code">' + esc(m.apiId) + '</span>');
    add('Desenvolvedor', esc(m.vendor));
    add('Hospedagem', esc(m.host) + (m.host !== m.vendor ? ' (diferente do desenvolvedor)' : ''));
    add('Estágio', m.preview ? 'Prévia' : m.curated ? 'Estável' : '');
    add('Lançamento', m.released ? day(m.released) : '');
    if (m.inputs?.length) add('Entradas declaradas', esc(m.inputs.map(i => inputNames[i] || i).join(', ')) + ' (endpoint de listagem)');
  }
  add('Nível de esforço', m.capabilities?.reasoning ? 'Ajustável (baixo, médio ou alto)' : m.kind === 'profile' && !m.route ? '' : 'Usa o padrão do modelo');
  add('Formatos aceitos neste app', esc(formats(m)));
  if (m.kind === 'route') {
    add('Verificação', (m.checkedDocs ? 'Documentação conferida em ' + esc(day(m.checkedDocs)) + '. ' : '') +
      (m.verification ? (m.verification.ok ? 'Chamada mínima respondida em ' : 'Chamada mínima falhou em ') + esc(date(m.verification.date)) + '.' : m.curated ? 'Chamada mínima pendente.' : 'Rota descoberta automaticamente na conta.'));
    add('Fonte oficial', [m.source, m.docs].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).map(u => '<a href="' + esc(u) + '" target="_blank" rel="noreferrer noopener">' + esc(new URL(u).host + new URL(u).pathname) + '</a>').join('<br>'));
  }
  return '<details class="more"><summary>' + icon('chevron') + 'Detalhes</summary><dl>' + rows.join('') + '</dl></details>';
}

function card(m, catalog, current, favorites) {
  const fav = favorites.includes(m.id);
  const by = m.kind === 'profile'
    ? 'Perfil Jack AI' + (m.route ? ' · executado por ' + esc(m.route.vendor) + (m.route.host && m.route.host !== m.route.vendor ? ' via ' + esc(m.route.host) : '') : '')
    : esc(m.vendor) + (m.host && m.host !== m.vendor ? ' · via ' + esc(m.host) : '');
  const t = [];
  if (m.capabilities?.longContext) t.push('<span class="tagc">Contexto longo</span>');
  if (m.capabilities?.vision) t.push('<span class="tagc">Imagens</span>');
  if (m.capabilities?.files) t.push('<span class="tagc">PDF</span>');
  if (m.capabilities?.reasoning) t.push('<span class="tagc">Esforço ajustável</span>');
  if (m.preview) t.push('<span class="tagc preview">Prévia</span>');
  if (m.access === 'account') t.push('<span class="tagc">Requer conta</span>');
  if (m.id === current) t.unshift('<span class="tagc active">ativo</span>');
  const needsLogin = !m.available && m.access === 'account' && !catalog.signedIn;
  return '<article class="mcard' + (m.available ? '' : ' off') + (m.id === current ? ' current' : '') + '" aria-labelledby="mc-' + esc(m.id.replace(/\W/g, '-')) + '">' +
    '<header><div><h3 id="mc-' + esc(m.id.replace(/\W/g, '-')) + '">' + esc(m.name) + '</h3><div class="by">' + by + '</div></div>' +
    '<button type="button" class="icon fav right" data-fav="' + esc(m.id) + '" aria-pressed="' + fav + '" aria-label="' + (fav ? 'Remover ' : 'Adicionar ') + esc(m.name) + (fav ? ' dos favoritos' : ' aos favoritos') + '">' + icon('star', fav) + '</button></header>' +
    (m.when ? '<p class="when"><b>Quando escolher:</b> ' + esc(m.when) + '</p>' : '') +
    (m.description ? '<p class="desc">' + esc(m.description) + '</p>' : '') +
    '<div class="tagsrow">' + t.join('') + '</div>' +
    '<p class="state' + (m.available ? ' ok' : '') + '">' + icon(m.available ? 'check' : 'info') + '<span>' + esc(m.available ? (m.kind === 'profile' && m.route ? 'Disponível · usa ' + m.route.name : m.status) : m.reason || m.status) + '</span></p>' +
    details(m, catalog) +
    '<footer>' + (needsLogin ? '<button type="button" class="secondary" data-action="account">' + icon('lock') + 'Entrar para usar</button>'
      : '<button type="button" class="' + (m.available ? 'primary' : 'secondary') + '" data-use="' + esc(m.id) + '" ' + (m.available ? '' : 'disabled') + '>' + (m.id === current ? 'Voltar à conversa' : 'Usar na conversa') + '</button>') + '</footer></article>';
}

export function renderLibrary(root, ctx) {
  const {catalog, model, favorites} = ctx.state();
  if (!catalog) { root.innerHTML = '<div class="pagehead"><div><h1 id="librarytitle">Biblioteca de modelos</h1><p>Consultando provedores…</p></div></div><div class="skeleton"></div><div class="skeleton"></div>'; return; }
  const matches = catalog.models.filter(m => (!filter.onlyAvailable || m.available) && (filter.task === 'todas' || m.tasks?.includes(filter.task)) && [...filter.caps].every(c => caps.find(x => x[0] === c)[2](m)));
  const groups = groupModels(matches, {favorites: [], query: filter.query, order: ctx.order});
  const available = catalog.models.filter(m => m.available && m.kind === 'route').length;
  root.innerHTML = '<div class="pagehead"><div><h1 id="librarytitle">Biblioteca de modelos</h1><p>Os perfis Jack AI escolhem a rota automaticamente. Os demais modelos estão separados por fornecedor. Catálogo conferido em ' + esc(day(catalog.checked)) + '.</p></div>' +
    '<button type="button" class="secondary" data-action="refreshCatalog">' + icon('refresh') + 'Atualizar catálogo</button></div>' +
    '<div class="providers">' + catalog.providers.map(p => '<span class="provider' + (p.connected ? ' on' : '') + '"><span class="dot" aria-hidden="true"></span><b>' + esc(p.name) + '</b>' + esc(p.status) + '</span>').join('') +
    '<span class="provider on"><b>' + available + '</b>' + (available === 1 ? 'rota disponível' : 'rotas disponíveis') + '</span></div>' +
    '<div class="filters"><div class="search"><i>' + icon('search') + '</i><input id="libSearch" type="search" placeholder="Buscar por nome ou fornecedor" aria-label="Buscar na Biblioteca" value="' + esc(filter.query) + '"></div>' +
    '<div class="filterrow" role="group" aria-label="Filtrar por tarefa"><span>Tarefa</span>' + tasks.map(([id, label]) => '<button type="button" class="chip" data-task="' + id + '" aria-pressed="' + (filter.task === id) + '">' + label + '</button>').join('') + '</div>' +
    '<div class="filterrow" role="group" aria-label="Filtrar por capacidade"><span>Capacidade</span>' + caps.map(([id, label]) => '<button type="button" class="chip" data-cap="' + id + '" aria-pressed="' + filter.caps.has(id) + '">' + label + '</button>').join('') +
    '<button type="button" class="chip" data-only aria-pressed="' + filter.onlyAvailable + '">Só disponíveis</button></div></div>' +
    '<p class="sr-only" role="status">' + matches.length + ' modelos encontrados.</p>' +
    (groups.length ? groups.map(g => '<section class="libsection"><h2>' + esc(g.title) + ' <small>' + g.items.length + '</small></h2><div class="cards">' + g.items.map(m => card(m, catalog, model, favorites)).join('') + '</div></section>').join('')
      : '<p class="empty">Nenhum modelo corresponde aos filtros escolhidos.</p>');
  const input = root.querySelector('#libSearch');
  input.oninput = () => { filter.query = input.value; const pos = input.selectionStart; renderLibrary(root, ctx); const again = root.querySelector('#libSearch'); again.focus(); again.setSelectionRange(pos, pos); };
  root.onclick = e => {
    const el = e.target.closest('button');
    if (!el) return;
    if (el.dataset.task) { filter.task = el.dataset.task; return rerender(el); }
    if (el.dataset.cap) { filter.caps.has(el.dataset.cap) ? filter.caps.delete(el.dataset.cap) : filter.caps.add(el.dataset.cap); return rerender(el); }
    if (el.hasAttribute('data-only')) { filter.onlyAvailable = !filter.onlyAvailable; return rerender(el); }
    if (el.dataset.use) return ctx.use(el.dataset.use);
    if (el.dataset.fav) { const on = el.getAttribute('aria-pressed') !== 'true'; ctx.favorite(el.dataset.fav, on).then(() => rerender(el)); }
  };
  function rerender(el) {
    const key = [...el.attributes].find(a => a.name.startsWith('data-'));
    renderLibrary(root, ctx);
    root.querySelector('[' + key.name + (key.value ? '="' + CSS.escape(key.value) + '"' : '') + ']')?.focus();
  }
}
