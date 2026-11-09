// Arquivos de código gerados nas respostas. Funções puras, testadas em tests/files.mjs.
// Cada bloco cercado (```linguagem caminho/arquivo.ext) vira um arquivo; o nome vem da
// abertura do bloco, da linha logo acima dele ou de um comentário na primeira linha.

const EXT = {
  lua: 'lua', luau: 'luau', javascript: 'js', js: 'js', mjs: 'mjs', jsx: 'jsx', typescript: 'ts', ts: 'ts', tsx: 'tsx', python: 'py', py: 'py',
  html: 'html', css: 'css', scss: 'scss', json: 'json', bash: 'sh', sh: 'sh', shell: 'sh', zsh: 'sh', powershell: 'ps1', ps1: 'ps1', bat: 'bat',
  java: 'java', kotlin: 'kt', kt: 'kt', swift: 'swift', c: 'c', h: 'h', cpp: 'cpp', 'c++': 'cpp', cs: 'cs', csharp: 'cs', go: 'go', rust: 'rs', rs: 'rs',
  php: 'php', ruby: 'rb', rb: 'rb', sql: 'sql', yaml: 'yml', yml: 'yml', toml: 'toml', xml: 'xml', markdown: 'md', md: 'md', vue: 'vue', svelte: 'svelte',
  dart: 'dart', r: 'r', perl: 'pl', gdscript: 'gd', ini: 'ini', text: 'txt', txt: 'txt', plaintext: 'txt', csv: 'csv', mermaid: 'mmd', svg: 'svg'
};
const LANG_OF = Object.fromEntries(Object.entries(EXT).reverse().map(([lang, ext]) => [ext, lang]));
const SPECIAL = /^(?:Dockerfile|Makefile|Procfile|\.env(?:\.\w+)?|\.gitignore|\.dockerignore|\.editorconfig)$/;
const FIRST = {html: 'index.html', css: 'style.css', md: 'README.md'};
const NAMED_LANG = {dockerfile: 'Dockerfile', makefile: 'Makefile'};
const COMMANDS = new Set(['bash', 'sh', 'shell', 'zsh', 'console', 'terminal', 'cmd', 'powershell', 'ps1', '']);
const PATH = /^(?:[\w-][\w.-]*\/)*[\w-][\w.-]*\.[A-Za-z0-9]{1,10}$/;

const isPath = value => typeof value === 'string' && value.length <= 160 && (PATH.test(value) || SPECIAL.test(value.split('/').pop()) && /^[\w./-]+$/.test(value));

// Caminho seguro dentro do .zip: sem barra inicial, sem "..", só caracteres comuns.
export function cleanPath(value) {
  const parts = String(value || '').replace(/\\/g, '/').replace(/^[a-z]:/i, '').split('/')
    .map(p => p.trim().replace(/[^\w.\- ]/g, '').replace(/^\.+$/, '')).filter(Boolean);
  return parts.slice(-6).join('/').slice(0, 160);
}

// "lua main.lua", "js title=src/app.js", "main.lua" → {lang, path}
export function parseInfo(info) {
  const words = String(info || '').trim().split(/\s+/).filter(Boolean);
  let lang = (words.shift() || '').toLowerCase(), path = '';
  const rest = words.join(' ');
  const named = rest.match(/(?:title|file|filename|name|path)\s*[=:]\s*["']?([^"'\s]+)/i)?.[1];
  const plain = rest.replace(/^["']|["']$/g, '').split(/\s+/).find(isPath);
  if (named && isPath(named.replace(/^\.\//, ''))) path = named.replace(/^\.\//, '');
  else if (plain) path = plain.replace(/^\.\//, '');
  if (!path && isPath(lang.replace(/^\.\//, '')) && lang.includes('.')) { path = lang.replace(/^\.\//, ''); lang = ''; }
  if (!lang && path) lang = LANG_OF[path.split('.').pop().toLowerCase()] || (SPECIAL.test(path) ? path.toLowerCase() : '');
  return {lang: lang.slice(0, 40), path};
}

// Nome escrito logo acima do bloco: **main.lua**, `src/app.js`, "Arquivo: main.lua", "### index.html".
function nameAbove(lines) {
  for (const raw of lines.slice(-2).reverse()) {
    const line = raw.trim();
    if (!line) continue;
    const ticks = [...line.matchAll(/`([^`\s]+)`/g)].map(m => m[1]);
    const stripped = line.replace(/^[#>*\-\d.)\s]+/, '').replace(/[*_`]/g, '').replace(/^(?:arquivo|file|nome do arquivo|caminho)\s*:\s*/i, '').replace(/[:：]\s*$/, '').trim();
    const hit = [stripped, ...ticks].map(s => s.replace(/^\.\//, '')).find(isPath);
    if (hit) return hit;
    return '';
  }
  return '';
}

// Comentário na primeira linha: -- main.lua, // src/app.js, # arquivo: main.py, <!-- index.html -->
function nameInFirstLine(code) {
  const first = code.split('\n', 1)[0] || '';
  const m = first.match(/^\s*(?:\/\/|#|--|\/\*|<!--|;)\s*(?:arquivo|file|filename|nome)?\s*:?\s*([\w./-]+)\s*(?:\*\/|-->)?\s*$/i);
  return m && isPath(m[1].replace(/^\.\//, '')) ? m[1].replace(/^\.\//, '') : '';
}

// Todos os blocos cercados, na ordem do texto. Blocos curtos de comandos do terminal
// sem nome ficam marcados com skip (não viram arquivo, mas mantêm a ordem para a tela).
export function extractFiles(markdown) {
  const lines = String(markdown || '').split('\n'), blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const open = lines[i].match(/^(\s*)(`{3,}|~{3,})(.*)$/);
    if (!open || /`/.test(open[2][0] === '`' ? open[3] : '')) continue;
    const fence = open[2], info = open[3], body = [];
    let j = i + 1, closed = false;
    for (; j < lines.length; j++) {
      const close = lines[j].match(/^\s*(`{3,}|~{3,})\s*$/);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) { closed = true; break; }
      body.push(lines[j].startsWith(open[1]) ? lines[j].slice(open[1].length) : lines[j]);
    }
    const code = body.join('\n');
    const {lang, path: fromInfo} = parseInfo(info);
    const path = fromInfo || nameAbove(lines.slice(Math.max(0, i - 2), i)) || nameInFirstLine(code);
    blocks.push({lang, path: path ? cleanPath(path) : '', code, lines: body.length, incomplete: !closed,
      skip: !path && COMMANDS.has(lang) && body.length <= 6});
    i = j;
  }
  // Nomes repetidos: primeiro os nomes escritos pelo modelo, depois os nomes padrão.
  const used = new Set();
  const reserve = path => { let candidate = path, n = 2; while (used.has(candidate.toLowerCase())) candidate = path.replace(/(\.[^./]+)?$/, m => '-' + n++ + m); used.add(candidate.toLowerCase()); return candidate; };
  for (const b of blocks) if (!b.skip && b.path) { b.path = reserve(b.path); b.named = true; }
  for (const b of blocks) {
    if (b.skip || b.path) continue;
    b.named = false;
    if (NAMED_LANG[b.lang]) { b.path = reserve(NAMED_LANG[b.lang]); continue; }
    const ext = EXT[b.lang] || 'txt';
    let candidate = FIRST[ext] || 'main.' + ext, n = 2;
    while (used.has(candidate.toLowerCase())) candidate = 'arquivo-' + n++ + '.' + ext;
    b.path = reserve(candidate);
  }
  for (const b of blocks) if (!b.skip && !b.lang) b.lang = LANG_OF[b.path.split('.').pop().toLowerCase()] || '';
  return blocks;
}

export const projectFiles = markdown => extractFiles(markdown).filter(b => !b.skip && b.code.trim());

// Nome do .zip a partir do título da conversa.
export function zipName(title) {
  const slug = String(title || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return (slug || 'jack-ai-arquivos') + '.zip';
}
