// CSV do Estúdio: leitura com aspas, detecção de separador, ordenação e Markdown.
export function detectDelimiter(text) {
  const sample = text.split(/\r?\n/).slice(0, 5).join('\n');
  const counts = [',', ';', '\t', '|'].map(d => [d, sample.split(d).length]);
  return counts.sort((a, b) => b[1] - a[1])[0][1] > 1 ? counts[0][0] : ',';
}

export function parseCSV(text, delimiter = detectDelimiter(text)) {
  const rows = []; let row = [], cell = '', quoted = false;
  const src = String(text).replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === delimiter) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const clean = rows.filter(r => r.some(v => v.trim() !== ''));
  if (!clean.length) return {header: [], rows: [], delimiter};
  const width = Math.max(...clean.map(r => r.length));
  const header = clean[0].map((h, i) => h.trim() || 'Coluna ' + (i + 1));
  while (header.length < width) header.push('Coluna ' + (header.length + 1));
  return {header, rows: clean.slice(1).map(r => header.map((_, i) => r[i] ?? '')), delimiter};
}

const asNumber = v => { const s = String(v).trim().replace(/\s/g, ''); if (!/^-?[\d.,]+$/.test(s)) return NaN; const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s); return n; };

// Ordena índices de linhas sem alterar os dados originais.
export function sortRows(rows, column, direction) {
  const order = rows.map((_, i) => i);
  if (direction !== 'asc' && direction !== 'desc') return order;
  const numeric = rows.every(r => r[column] === '' || Number.isFinite(asNumber(r[column])));
  const sign = direction === 'asc' ? 1 : -1;
  return order.sort((a, b) => {
    const x = rows[a][column], y = rows[b][column];
    const cmp = numeric ? (asNumber(x) || 0) - (asNumber(y) || 0) : String(x).localeCompare(String(y), 'pt-BR', {numeric: true, sensitivity: 'base'});
    return cmp * sign || a - b;
  });
}

const md = v => String(v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
export function toMarkdown(header, rows) {
  return ['| ' + header.map(md).join(' | ') + ' |', '| ' + header.map(() => '---').join(' | ') + ' |', ...rows.map(r => '| ' + r.map(md).join(' | ') + ' |')].join('\n');
}
