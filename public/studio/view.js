// Estúdio de ferramentas: Medidas, Dados e Texto e código, com "Usar na conversa".
import {catalog, conversionCount, unitGroups} from './catalog.js';
import {parseCSV, sortRows, toMarkdown} from './data.js';
import {textStats, formatJson} from './text.js';
import {icon} from '../icons.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const tabs = [['medidas', 'Medidas', 'ruler'], ['dados', 'Dados', 'table'], ['texto', 'Texto e código', 'code']];
const lookup = new Map(catalog.slice(0, conversionCount).map(t => [t.group + '/' + t.title, t]));
const textTools = catalog.slice(conversionCount).filter(t => !/JSON|Contar palavras|Contar caracteres/.test(t.title));
const memory = {tab: 'medidas', group: 'Comprimento', from: 'metro', to: 'polegada', value: '1', csv: null, sort: {column: -1, dir: ''}, selected: new Set(), text: '', output: null};
const SAMPLE = 100;

async function copy(text, button) {
  try { await navigator.clipboard.writeText(text); button.innerHTML = icon('check') + 'Copiado'; }
  catch { button.textContent = 'Selecione e copie manualmente'; }
  setTimeout(() => { button.innerHTML = icon('copy') + 'Copiar'; }, 2000);
}

export function renderStudio(root, ctx) {
  if (ctx.tab) memory.tab = ctx.tab;
  root.innerHTML = '<div class="pagehead"><div><h1 id="studiotitle">Estúdio de ferramentas</h1><p>Prepare medidas, dados e textos e leve o resultado para uma conversa. Tudo roda neste navegador; nada é enviado até você pressionar Enviar.</p></div></div>' +
    '<div class="tabs" role="tablist" aria-label="Áreas do Estúdio">' + tabs.map(([id, label, ic]) => '<button type="button" role="tab" class="tab" id="tab-' + id + '" aria-controls="panel-' + id + '" aria-selected="' + (memory.tab === id) + '" tabindex="' + (memory.tab === id ? 0 : -1) + '" data-tab="' + id + '">' + icon(ic) + label + '</button>').join('') + '</div>' +
    '<div id="panel-' + memory.tab + '" class="panel" role="tabpanel" aria-labelledby="tab-' + memory.tab + '"></div>';
  const panel = root.querySelector('.panel');
  ({medidas, dados, texto})[memory.tab](panel, ctx);
  const list = [...root.querySelectorAll('[role=tab]')];
  list.forEach(tab => {
    tab.onclick = () => { memory.tab = tab.dataset.tab; ctx.tabChanged?.(memory.tab); renderStudio(root, {...ctx, tab: null}); root.querySelector('#tab-' + memory.tab).focus(); };
    tab.onkeydown = e => {
      const i = list.indexOf(tab), next = e.key === 'ArrowRight' ? list[(i + 1) % list.length] : e.key === 'ArrowLeft' ? list[(i - 1 + list.length) % list.length] : null;
      if (next) { e.preventDefault(); next.click(); }
    };
  });
}

function medidas(panel, ctx) {
  const groups = Object.keys(unitGroups);
  panel.innerHTML = '<label class="field" style="max-width:320px">Categoria<select id="m-group">' + groups.map(g => '<option ' + (g === memory.group ? 'selected' : '') + '>' + esc(g) + '</option>').join('') + '</select></label>' +
    '<div class="panelgrid"><label class="field">De<select id="m-from"></select></label>' +
    '<button type="button" class="secondary swapbtn" id="m-swap" aria-label="Inverter origem e destino" title="Inverter origem e destino">' + icon('swap') + '</button>' +
    '<label class="field">Para<select id="m-to"></select></label></div>' +
    '<label class="field" style="max-width:320px">Valor<input id="m-value" inputmode="decimal" autocomplete="off" value="' + esc(memory.value) + '" aria-describedby="m-help"><span class="note" id="m-help">Use vírgula ou ponto para decimais, sem separador de milhares.</span></label>' +
    '<div class="result" aria-live="polite"><div class="big" id="m-result"></div><div class="sub" id="m-sub"></div>' +
    '<div class="actions"><button type="button" class="secondary" id="m-copy">' + icon('copy') + 'Copiar</button><button type="button" class="primary" id="m-use">Usar na conversa</button></div></div>';
  const $ = id => panel.querySelector('#m-' + id);
  const fill = () => {
    const units = unitGroups[memory.group];
    if (!units.includes(memory.from)) memory.from = units[0];
    if (!units.includes(memory.to)) memory.to = units[1];
    $('from').innerHTML = units.map(u => '<option ' + (u === memory.from ? 'selected' : '') + '>' + esc(u) + '</option>').join('');
    $('to').innerHTML = units.map(u => '<option ' + (u === memory.to ? 'selected' : '') + '>' + esc(u) + '</option>').join('');
  };
  let line = '';
  const compute = () => {
    memory.value = $('value').value;
    try {
      let result;
      if (memory.from === memory.to) result = memory.value.trim().replace('.', ',') + ' · ' + memory.to;
      else result = lookup.get(memory.group + '/' + memory.from + ' → ' + memory.to).run(memory.value);
      const [num, unit] = result.split(' · ');
      $('result').textContent = num + ' ' + unit;
      $('sub').textContent = memory.value.trim() + ' ' + memory.from + ' = ' + num + ' ' + unit;
      line = memory.value.trim() + ' ' + memory.from + ' = ' + num + ' ' + unit;
      $('copy').dataset.text = num + ' ' + unit;
      $('copy').disabled = $('use').disabled = false;
    } catch (error) {
      $('result').textContent = '—'; $('sub').textContent = error.message; line = '';
      $('copy').disabled = $('use').disabled = true;
    }
  };
  fill(); compute();
  $('group').onchange = () => { memory.group = $('group').value; fill(); compute(); };
  $('from').onchange = () => { memory.from = $('from').value; compute(); };
  $('to').onchange = () => { memory.to = $('to').value; compute(); };
  $('value').oninput = compute;
  $('swap').onclick = () => { [memory.from, memory.to] = [memory.to, memory.from]; fill(); compute(); };
  $('copy').onclick = () => copy($('copy').dataset.text, $('copy'));
  $('use').onclick = () => line && ctx.use(line);
}

function dados(panel, ctx) {
  const data = memory.csv;
  panel.innerHTML = '<div class="dropzone" id="d-drop"><p style="margin:0 0 10px">Importe um arquivo CSV para ver uma amostra, ordenar colunas e escolher linhas.</p>' +
    '<label class="primary" style="cursor:pointer">' + icon('upload') + 'Importar CSV<input id="d-file" type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" class="sr-only"></label>' +
    '<details class="more" style="margin-top:10px;text-align:left"><summary>' + icon('chevron') + 'Ou cole o conteúdo</summary><label class="field" style="margin-top:8px">Conteúdo CSV<textarea id="d-paste" placeholder="nome;cidade;total"></textarea></label><button type="button" class="secondary" id="d-read" style="margin-top:8px">Ler conteúdo</button></details></div>' +
    '<p class="note" id="d-status" role="status"></p><div id="d-table"></div>';
  const $ = id => panel.querySelector('#d-' + id);
  const load = (text, name) => {
    const parsed = parseCSV(text);
    if (!parsed.header.length) { $('status').textContent = 'Não encontrei linhas neste conteúdo.'; return; }
    memory.csv = {...parsed, name}; memory.sort = {column: -1, dir: ''}; memory.selected = new Set();
    table();
  };
  $('file').onchange = async () => {
    const f = $('file').files[0]; $('file').value = '';
    if (!f) return;
    if (f.size > 5e6) { $('status').textContent = 'Use um CSV de até 5 MB.'; return; }
    $('status').textContent = 'Lendo ' + f.name + '…';
    load(await f.text(), f.name);
  };
  $('read').onclick = () => load($('paste').value, 'conteúdo colado');
  const drop = $('drop');
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = async e => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) load(await f.text(), f.name); };

  function table() {
    const d = memory.csv;
    const order = sortRows(d.rows, memory.sort.column, memory.sort.dir);
    const shown = order.slice(0, SAMPLE);
    const all = shown.length && shown.every(i => memory.selected.has(i));
    const sep = {',': 'vírgula', ';': 'ponto e vírgula', '\t': 'tabulação', '|': 'barra vertical'}[d.delimiter];
    $('status').textContent = d.name + ': ' + d.rows.length.toLocaleString('pt-BR') + ' linhas, ' + d.header.length + ' colunas, separador ' + sep + '. ' +
      (d.rows.length > SAMPLE ? 'Amostra com as ' + SAMPLE + ' primeiras linhas na ordem atual. ' : '') + (memory.selected.size === 1 ? '1 linha selecionada.' : memory.selected.size + ' linhas selecionadas.');
    $('table').innerHTML = '<div class="tablewrap"><table class="data"><caption class="sr-only">Amostra do CSV</caption><thead><tr><th scope="col"><input type="checkbox" id="d-all" ' + (all ? 'checked' : '') + ' aria-label="Selecionar todas as linhas exibidas"></th>' +
      d.header.map((h, i) => { const dir = memory.sort.column === i ? memory.sort.dir : ''; return '<th scope="col" aria-sort="' + (dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none') + '"><button type="button" data-col="' + i + '">' + esc(h) + icon(dir === 'desc' ? 'down' : dir === 'asc' ? 'up' : 'swap') + '<span class="sr-only">, ordenar</span></button></th>'; }).join('') +
      '</tr></thead><tbody>' + shown.map(i => '<tr class="' + (memory.selected.has(i) ? 'sel' : '') + '"><td><input type="checkbox" data-row="' + i + '" ' + (memory.selected.has(i) ? 'checked' : '') + ' aria-label="Selecionar linha ' + (i + 1) + '"></td>' + d.rows[i].map(v => '<td title="' + esc(v) + '">' + esc(v) + '</td>').join('') + '</tr>').join('') +
      '</tbody></table></div><div class="actions"><button type="button" class="primary" id="d-use" ' + (memory.selected.size ? '' : 'disabled') + '>' + (memory.selected.size ? 'Usar ' + memory.selected.size + (memory.selected.size === 1 ? ' linha' : ' linhas') + ' na conversa' : 'Selecione linhas para usar na conversa') + '</button>' +
      '<button type="button" class="ghost" id="d-clear" ' + (memory.selected.size ? '' : 'disabled') + '>Limpar seleção</button></div>';
    $('table').querySelectorAll('[data-col]').forEach(b => b.onclick = () => {
      const col = Number(b.dataset.col), s = memory.sort;
      s.dir = s.column !== col ? 'asc' : s.dir === 'asc' ? 'desc' : s.dir === 'desc' ? '' : 'asc'; s.column = col;
      table(); $('table').querySelector('[data-col="' + col + '"]').focus();
    });
    $('table').querySelectorAll('[data-row]').forEach(c => c.onchange = () => { const i = Number(c.dataset.row); c.checked ? memory.selected.add(i) : memory.selected.delete(i); table(); $('table').querySelector('[data-row="' + i + '"]')?.focus(); });
    $('all').onchange = () => { shown.forEach(i => $('all').checked ? memory.selected.add(i) : memory.selected.delete(i)); table(); $('all').focus(); };
    $('clear').onclick = () => { memory.selected.clear(); table(); };
    $('use').onclick = () => {
      const rows = order.filter(i => memory.selected.has(i)).map(i => d.rows[i]);
      ctx.use('Dados de ' + d.name + ' (' + rows.length + ' linha' + (rows.length > 1 ? 's' : '') + '):\n\n' + toMarkdown(d.header, rows));
    };
  }
  if (data) table();
}

function texto(panel, ctx) {
  panel.innerHTML = '<label class="field">Texto ou código<textarea id="t-input" spellcheck="false" placeholder="Cole um texto para contar ou um JSON para formatar">' + esc(memory.text) + '</textarea></label>' +
    '<div class="stats" id="t-stats" aria-live="polite"></div>' +
    '<div class="actions" style="margin:0"><button type="button" class="secondary" id="t-format">Formatar JSON</button><button type="button" class="secondary" id="t-compact">Compactar JSON</button>' +
    '<label class="field" style="grid-auto-flow:column;align-items:center;display:inline-grid;gap:8px"><span class="sr-only">Outras operações</span><select id="t-tool" aria-label="Outras operações de texto"><option value="">Outras operações…</option>' + textTools.map(t => '<option value="' + t.id + '">' + esc(t.title) + '</option>').join('') + '</select></label></div>' +
    '<div id="t-out" aria-live="polite"></div>';
  const $ = id => panel.querySelector('#t-' + id);
  const stats = () => {
    memory.text = $('input').value;
    const s = textStats(memory.text);
    $('stats').innerHTML = [['words', 'Palavras'], ['chars', 'Caracteres'], ['charsNoSpaces', 'Sem espaços'], ['lines', 'Linhas']].map(([k, l]) => '<div class="stat"><b>' + s[k].toLocaleString('pt-BR') + '</b><span>' + l + '</span></div>').join('');
  };
  const show = out => {
    memory.output = out;
    if (!out) { $('out').innerHTML = ''; return; }
    if (out.error) {
      const e = out.error;
      $('out').innerHTML = e.line ? '<div class="jsonerr" role="alert"><strong>Erro de sintaxe na linha ' + e.line + ', coluna ' + e.column + '.</strong> ' + esc(e.message) + '<pre>' + esc(e.lineText) + '\n<span class="caret">' + esc(e.caret) + '</span></pre></div>'
        : '<div class="jsonerr" role="alert"><strong>Não foi possível aplicar a operação.</strong> ' + esc(e.message) + '</div>';
      return;
    }
    $('out').innerHTML = '<pre class="output" tabindex="0" aria-label="Resultado">' + esc(out.text) + '</pre><div class="actions"><button type="button" class="secondary" id="t-copy">' + icon('copy') + 'Copiar</button><button type="button" class="primary" id="t-use">Usar na conversa</button></div>';
    $('copy').onclick = () => copy(out.text, $('copy'));
    $('use').onclick = () => ctx.use(out.json ? '```json\n' + out.text + '\n```' : out.text);
  };
  $('input').oninput = () => { stats(); show(null); };
  $('format').onclick = () => { const r = formatJson($('input').value, 2); show(r.ok ? {text: r.output, json: true} : {error: r.error}); };
  $('compact').onclick = () => { const r = formatJson($('input').value, 0); show(r.ok ? {text: r.output, json: true} : {error: r.error}); };
  $('tool').onchange = () => {
    const tool = catalog[Number($('tool').value)];
    if (!tool) return;
    try { show({text: tool.run($('input').value)}); } catch (error) { show({error: {message: error.message}}); }
    $('tool').value = '';
  };
  stats(); show(memory.output);
}
