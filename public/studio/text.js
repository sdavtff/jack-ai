// Texto e código do Estúdio: contagens e JSON com localização do erro.
export function textStats(text) {
  const s = String(text);
  const words = (s.match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu) || []).length;
  const chars = [...new Intl.Segmenter('pt-BR', {granularity: 'grapheme'}).segment(s)].length;
  return {words, chars, charsNoSpaces: [...new Intl.Segmenter('pt-BR', {granularity: 'grapheme'}).segment(s.replace(/\s/g, ''))].length, lines: s ? s.split(/\r?\n/).length : 0};
}

function locate(source, position) {
  const before = source.slice(0, position);
  const line = before.split('\n').length;
  const column = position - before.lastIndexOf('\n');
  const lineText = source.split('\n')[line - 1] ?? '';
  return {position, line, column, lineText, caret: ' '.repeat(Math.max(0, column - 1)) + '^'};
}

// Encontra a posição do primeiro erro com um analisador próprio, já que a mensagem
// do JSON.parse varia entre navegadores.
function firstError(src) {
  let i = 0;
  const err = (msg, at = i) => { throw Object.assign(new Error(msg), {at}); };
  const ws = () => { while (/[ \t\n\r]/.test(src[i])) i++; };
  const value = () => {
    ws();
    const c = src[i];
    if (c === '{') { i++; ws(); if (src[i] === '}') { i++; return; } for (;;) { ws(); if (src[i] !== '"') err(src[i] === "'" ? 'Use aspas duplas nas chaves.' : 'Esperava uma chave entre aspas duplas.'); string(); ws(); if (src[i] !== ':') err('Esperava ":" depois da chave.'); i++; value(); ws(); if (src[i] === ',') { i++; ws(); if (src[i] === '}') err('Vírgula sobrando antes de "}".'); continue; } if (src[i] === '}') { i++; return; } err('Esperava "," ou "}".'); } }
    if (c === '[') { i++; ws(); if (src[i] === ']') { i++; return; } for (;;) { value(); ws(); if (src[i] === ',') { i++; ws(); if (src[i] === ']') err('Vírgula sobrando antes de "]".'); continue; } if (src[i] === ']') { i++; return; } err('Esperava "," ou "]".'); } }
    if (c === '"') return string();
    if (c === "'") err('Use aspas duplas em textos.');
    if (/[-\d]/.test(c)) { const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(src.slice(i)); if (!m) err('Número inválido.'); i += m[0].length; return; }
    for (const w of ['true', 'false', 'null']) if (src.startsWith(w, i)) { i += w.length; return; }
    if (c === undefined) err('O texto terminou antes do esperado.');
    err('Valor inesperado "' + c + '".');
  };
  const string = () => { const start = i; i++; while (i < src.length && src[i] !== '"') { if (src[i] === '\\') i++; else if (src[i] === '\n') err('Texto sem aspas de fechamento.', start); i++; } if (src[i] !== '"') err('Texto sem aspas de fechamento.', start); i++; };
  try { value(); ws(); if (i < src.length) err('Conteúdo extra depois do JSON.'); return null; }
  catch (e) { return {message: e.message, ...locate(src, Math.min(e.at, src.length))}; }
}

export function formatJson(source, indent = 2) {
  const src = String(source);
  if (!src.trim()) return {ok: false, error: {message: 'Cole um JSON para formatar.', line: 1, column: 1, lineText: '', caret: '^'}};
  try { return {ok: true, output: JSON.stringify(JSON.parse(src), null, indent)}; }
  catch { return {ok: false, error: firstError(src) || {message: 'JSON inválido.', ...locate(src, 0)}}; }
}
