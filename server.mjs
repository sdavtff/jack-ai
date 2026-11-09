import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID, randomBytes, createHash, scrypt, timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {readFile, mkdir, stat} from 'node:fs/promises';
import path from 'node:path';
import {listModels, generate, ping} from './providers.mjs';
import {buildCatalog, resolveEntry, pendingChecks, routeSnapshot, canonicalId} from './catalog.mjs';
import {profiles} from './models.config.mjs';

const derive = promisify(scrypt), dir = process.env.DATA_DIR || 'data';
await mkdir(dir, {recursive: true});
const db = new DatabaseSync(path.join(dir, 'jack.sqlite'));
db.exec('PRAGMA journal_mode=WAL');
db.exec(await readFile('migrations/001.sql', 'utf8'));
db.exec(await readFile('migrations/002.sql', 'utf8'));
// Coluna nova em instalações existentes. SQLite não aceita ADD COLUMN IF NOT EXISTS.
if (!db.prepare('PRAGMA table_info(chats)').all().some(c => c.name === 'archived')) db.exec('ALTER TABLE chats ADD COLUMN archived INTEGER DEFAULT 0');
if (!db.prepare('PRAGMA table_info(users)').all().some(c => c.name === 'google_sub')) db.exec('ALTER TABLE users ADD COLUMN google_sub TEXT');
db.exec(await readFile('migrations/003.sql', 'utf8'));

const sql = (q, ...args) => db.prepare(q).run(...args), one = (q, ...args) => db.prepare(q).get(...args);
const digest = s => createHash('sha256').update(s).digest('hex');
const fail = (message, status = 400, extra) => { throw Object.assign(new Error(message), {status, extra}); };
const bounded = (s, max, min = 0) => typeof s === 'string' && s.length >= min && s.length <= max ? s : fail('Confira os dados informados.');
async function hash(pass) { const salt = randomBytes(16).toString('hex'); return salt + ':' + (await derive(pass, salt, 64)).toString('hex'); }
async function matches(pass, value) { if (!value) return false; const [salt, key] = value.split(':'); return timingSafeEqual(await derive(pass, salt, 64), Buffer.from(key, 'hex')); }
const limits = new Map(), active = new Set();
function limit(key, n) { const now = Date.now(); let row = limits.get(key); if (!row || row.end < now) { row = {count: 0, end: now + 60000}; limits.set(key, row); } if (++row.count > n) fail('Muitas tentativas. Aguarde um minuto.', 429); }
setInterval(() => {
  for (const [k, v] of limits) if (v.end < Date.now()) limits.delete(k);
  for (const [k, v] of oauthStates) if (v.expires < Date.now()) oauthStates.delete(k);
  sql('DELETE FROM sessions WHERE expires<?', Date.now());
  sql('DELETE FROM users WHERE email IS NULL AND id NOT IN (SELECT user FROM sessions)');
}, 3600000).unref();
const secure = () => process.env.COOKIE_SECURE === 'true' ? '; Secure' : '';
function sessionCookie(id) { const token = randomBytes(32).toString('hex'); sql('INSERT INTO sessions VALUES(?,?,?)', digest(token), id, Date.now() + 2592000000); return 'jack=' + token + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000' + secure(); }
function session(res, id) { res.setHeader('Set-Cookie', sessionCookie(id)); }
function prefsOf(u) { try { return JSON.parse(u.prefs || '{}'); } catch { return {}; } }
function safe(u) { return {id: u.id, name: u.name, email: u.email, photo: u.photo, prefs: prefsOf(u), google: !!u.google_sub, password: !!u.hash, auth: {google: !!googleConfig()}}; }

// --- Login com Google (OAuth 2.0 com PKCE) ------------------------------------
// O segredo do cliente fica só no servidor. O estado do fluxo fica na memória por
// 10 minutos e é amarrado ao navegador por um cookie SameSite=Lax de uso único.
function googleConfig() {
  const id = process.env.GOOGLE_CLIENT_ID, secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) return null;
  return {id, secret, auth: process.env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth', token: process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token'};
}
const publicBase = req => (process.env.PUBLIC_URL || ((process.env.COOKIE_SECURE === 'true' ? 'https://' : 'http://') + req.headers.host)).replace(/\/+$/, '');
const googleRedirect = req => process.env.GOOGLE_REDIRECT_URI || publicBase(req) + '/api/auth/google/callback';
const oauthStates = new Map();
const oauthCookie = (value, age) => 'jack_oauth=' + value + '; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=' + age + secure();
function decodeJwt(token) {
  try { return JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8')); } catch { return null; }
}
// Foto do perfil do Google convertida em data URL (a CSP só permite imagens locais).
async function googlePhoto(url) {
  try {
    if (!/^https:\/\/[\w.-]+\.googleusercontent\.com\//.test(url || '')) return '';
    const r = await fetch(url, {signal: AbortSignal.timeout(4000), redirect: 'error'});
    const type = (r.headers.get('content-type') || '').split(';')[0];
    if (!r.ok || !['image/png', 'image/jpeg', 'image/webp'].includes(type)) return '';
    const data = Buffer.from(await r.arrayBuffer());
    return data.length <= 290000 ? 'data:' + type + ';base64,' + data.toString('base64') : '';
  } catch { return ''; }
}
async function googleCallback(req, res, url) {
  const back = (code, cookies = []) => { res.writeHead(302, {Location: '/#/?google=' + code, 'Cache-Control': 'no-store', 'Set-Cookie': [oauthCookie('', 0), ...cookies]}); res.end(); };
  const g = googleConfig();
  if (!g) return back('desativado');
  const state = url.searchParams.get('state') || '', rec = oauthStates.get(state);
  oauthStates.delete(state);
  const bound = (req.headers.cookie || '').match(/(?:^|; )jack_oauth=([\w-]+)/)?.[1];
  if (url.searchParams.get('error')) return back('cancelado');
  if (!rec || bound !== state || rec.expires < Date.now()) return back('expirado');
  let tokens;
  try {
    const r = await fetch(g.token, {method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000), headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({code: url.searchParams.get('code') || '', client_id: g.id, client_secret: g.secret, redirect_uri: rec.redirect, grant_type: 'authorization_code', code_verifier: rec.verifier})});
    if (!r.ok) return back('falha');
    tokens = await r.json();
  } catch { return back('falha'); }
  // O ID token veio direto do Google por HTTPS e com o segredo do cliente; ainda assim,
  // conferimos emissor, público, validade e nonce.
  const claims = decodeJwt(tokens.id_token);
  const aud = Array.isArray(claims?.aud) ? claims.aud : [claims?.aud];
  if (!claims || !['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss) || !aud.includes(g.id) || !(claims.exp * 1000 > Date.now()) || claims.nonce !== rec.nonce || typeof claims.sub !== 'string') return back('falha');
  if (claims.email_verified !== true || typeof claims.email !== 'string') return back('nao-verificado');
  const email = claims.email.trim().toLowerCase().slice(0, 254), sub = claims.sub.slice(0, 255);
  const name = String(claims.name || claims.given_name || email.split('@')[0]).trim().slice(0, 80) || 'Pessoa';
  const owner = one('SELECT * FROM users WHERE google_sub=?', sub), current = one('SELECT * FROM users WHERE id=?', rec.user);
  if (rec.mode === 'link') {
    if (!current?.email) return back('sessao');
    if (owner && owner.id !== current.id) return back('vinculada');
    sql('UPDATE users SET google_sub=? WHERE id=?', sub, current.id);
    return back('conectado');
  }
  let id = owner?.id;
  if (!id) {
    // Sem verificação de e-mail no cadastro por senha, não ligamos contas sozinhos:
    // quem já tem senha entra com ela e conecta o Google em Configurações.
    // Quem já está conectado com o mesmo e-mail só ganha o vínculo com o Google.
    if (current?.email === email && !current.google_sub) { sql('UPDATE users SET google_sub=? WHERE id=?', sub, current.id); return back('conectado'); }
    if (one('SELECT id FROM users WHERE email=?', email)) return back('existe');
    const photo = await googlePhoto(claims.picture);
    if (current && !current.email) {
      // Visitante vira conta e mantém as conversas que já tinha.
      if (!sql('UPDATE OR IGNORE users SET email=?,google_sub=?,name=?,photo=? WHERE id=? AND email IS NULL', email, sub, name, photo, current.id).changes) return back('falha');
      sql('DELETE FROM sessions WHERE user=?', current.id);
      id = current.id;
    } else {
      id = randomUUID();
      sql('INSERT INTO users(id,email,google_sub,name,photo) VALUES(?,?,?,?,?)', id, email, sub, name, photo);
    }
  }
  return back('ok', [sessionCookie(id)]);
}
async function json(req) { let size = 0, parts = []; for await (const part of req) { size += part.length; if (size > 4500000) fail('Arquivo ou conversa muito grande.', 413); parts.push(part); } try { return JSON.parse(Buffer.concat(parts).toString() || '{}'); } catch { fail('JSON inválido.'); } }
const mime = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json'};
const chatRow = c => ({id: c.id, title: c.title, pinned: c.pinned, archived: c.archived || 0, updated: c.updated, model: c.model, messages: JSON.parse(c.messages)});

// --- Verificação mínima das rotas novas do catálogo -------------------------
const checks = new Map(db.prepare('SELECT * FROM route_checks').all().map(r => [r.id, {ok: !!r.ok, checked: r.checked, retryAt: r.retry_at, detail: r.detail}]));
function recordCheck(id, ok, detail, retryAt = null) {
  const row = {ok: !!ok, checked: Date.now(), retryAt, detail: String(detail || '').slice(0, 300)};
  checks.set(id, row);
  sql('INSERT INTO route_checks(id,ok,checked,retry_at,detail) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET ok=excluded.ok,checked=excluded.checked,retry_at=excluded.retry_at,detail=excluded.detail', id, Number(!!ok), row.checked, retryAt, row.detail);
}
// Uma chamada por vez, com intervalo, para não disputar o limite de requisições
// da chave do operador. 429 e falhas de rede deixam a rota pendente.
const checking = new Set();
let lastDiscovery = null;
function pumpChecks() {
  if (!lastDiscovery || checking.size) return;
  const route = pendingChecks(lastDiscovery, checks)[0];
  if (!route) return;
  checking.add(route.id);
  ping(route).then(result => {
    if (result.ok) recordCheck(route.id, true, result.detail);
    else if (result.retry) { const prev = checks.get(route.id); if (!prev?.ok) recordCheck(route.id, false, result.detail, Date.now() + 10 * 60000); }
    else recordCheck(route.id, false, result.detail);
  }).catch(() => {}).finally(() => { checking.delete(route.id); setTimeout(pumpChecks, Number(process.env.JACK_CHECK_GAP_MS || 3500)).unref(); });
}
async function runChecks(discovery) { lastDiscovery = discovery; pumpChecks(); }
async function catalogFor(u) {
  const discovery = await listModels();
  runChecks(discovery).catch(() => {});
  return buildCatalog({discovery, checks, user: u});
}

// --- Validação de mensagens -------------------------------------------------
const imageRule = /^data:image\/(png|jpeg|webp);base64,[\w+/=]+$/;
const pdfRule = /^data:application\/pdf;base64,[A-Za-z0-9+/]+=*$/;
function cleanFiles(list) {
  if (list === undefined) return [];
  if (!Array.isArray(list) || list.length > 4) fail('Use até quatro arquivos por mensagem.');
  return list.map(f => {
    if (!f || typeof f.name !== 'string') fail('Arquivo inválido.');
    const size = Math.max(0, Math.min(Number(f.size) || 0, 1e9));
    // PDF: guardado como data URL e enviado ao modelo como arquivo (até 2 MB).
    if (typeof f.data === 'string') {
      if (!pdfRule.test(f.data) || f.data.length > 2800000) fail('O PDF ' + f.name.slice(0, 80) + ' é inválido ou excede 2 MB.');
      return {name: f.name.slice(0, 200), size: size || Math.round(f.data.length * 0.75), kind: 'pdf', data: f.data};
    }
    if (typeof f.text !== 'string') fail('Arquivo inválido.');
    if (f.text.length > 82000) fail('O arquivo ' + f.name.slice(0, 80) + ' excede 80 KB.');
    return {name: f.name.slice(0, 200), size: size || f.text.length, kind: 'text', text: f.text};
  }).filter((f, i, all) => f.kind !== 'pdf' || all.findIndex(x => x.kind === 'pdf') === i || fail('Use um PDF por mensagem.'));
}
function cleanImages(list) {
  if (list === undefined) return [];
  if (!Array.isArray(list) || list.length > 1 || list.some(i => typeof i !== 'string' || !imageRule.test(i))) fail('Imagem inválida.');
  return list;
}
function cleanOptions(value) {
  if (!value || typeof value !== 'object') return null;
  const out = {};
  for (const key of ['audience', 'format', 'tone', 'language', 'expected', 'observed']) if (typeof value[key] === 'string' && value[key].trim()) out[key] = value[key].trim().slice(0, 300);
  return Object.keys(out).length ? out : null;
}
function cleanHistory(list) {
  if (!Array.isArray(list)) return [];
  return list.map(m => {
    if (!m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string') fail('Conversa inválida.');
    const row = {role: m.role, content: m.content.slice(0, 100000)};
    if (m.role === 'user') { const files = cleanFiles(m.files), images = cleanImages(m.images); if (files.length) row.files = files; if (images.length) row.images = images; }
    return row;
  });
}
const optionLabels = {audience: 'Público', format: 'Formato', tone: 'Tom', language: 'Linguagem', expected: 'Comportamento esperado', observed: 'Erro observado'};
// Conteúdo enviado ao provedor: arquivos de texto entram no corpo e imagens antigas
// são substituídas por uma nota quando a rota escolhida não aceita imagens.
function forProvider(m, vision, latest) {
  let content = m.content;
  if (m.role === 'user' && m.files?.length) content += m.files.filter(f => f.kind !== 'pdf').map(f => '\n\n--- Arquivo: ' + f.name + ' ---\n' + f.text).join('');
  const pdfs = m.role === 'user' ? (m.files || []).filter(f => f.kind === 'pdf').map(f => ({name: f.name, data: f.data})) : [];
  if (m.role === 'user' && m.options) content = Object.entries(m.options).map(([k, v]) => optionLabels[k] + ': ' + v).join('\n') + '\n\n' + content;
  const images = m.images?.length ? (vision ? m.images : null) : null;
  if (m.images?.length && !vision) content += '\n\n[Imagem anexada anteriormente omitida: o modelo atual não analisa imagens.]';
  if (!vision && latest && m.images?.length) fail('Escolha um modelo com análise de imagens.');
  return {role: m.role, content: content || '(mensagem vazia)', ...(images ? {images} : {}), ...(pdfs.length ? {pdfs} : {})};
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost'), p = url.pathname, method = req.method;
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'");
  const send = (data, status = 200) => { res.writeHead(status, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}); res.end(JSON.stringify(data)); };
  try {
    if (!p.startsWith('/api/')) {
      if (method !== 'GET' || p.includes('..') || !/^\/[\w.\-/]*$/.test(p)) fail('Não encontrado.', 404);
      const file = p === '/' ? 'index.html' : p.slice(1);
      const location = path.join('public', file);
      let info;
      try { info = await stat(location); } catch { fail('Não encontrado.', 404); }
      if (!info.isFile()) fail('Não encontrado.', 404);
      const etag = 'W/"' + info.size + '-' + Math.floor(info.mtimeMs) + '"';
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      res.setHeader('ETag', etag);
      if (req.headers['if-none-match'] === etag) { res.writeHead(304); return res.end(); }
      res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
      return res.end(await readFile(location));
    }
    if (method !== 'GET' && req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) fail('Origem inválida.', 403);
    const token = digest((req.headers.cookie || '').match(/(?:^|; )jack=([a-f0-9]+)/)?.[1] || '');
    let u = one('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user WHERE token=? AND expires>?', token, Date.now());
    const b = method === 'GET' ? {} : await json(req);
    if (p === '/api/auth/google/callback' && method === 'GET') { limit('oauth' + req.socket.remoteAddress, 30); return await googleCallback(req, res, url); }
    if (p === '/api/auth/google/start' && method === 'GET') {
      const g = googleConfig();
      if (!g) { res.writeHead(302, {Location: '/#/?google=desativado'}); return res.end(); }
      if (!u) { res.writeHead(302, {Location: '/#/?google=sessao'}); return res.end(); }
      limit('oauth' + req.socket.remoteAddress, 30);
      const state = randomBytes(24).toString('base64url'), verifier = randomBytes(48).toString('base64url'), nonce = randomBytes(18).toString('base64url');
      const mode = url.searchParams.get('mode') === 'link' && u.email ? 'link' : 'login', redirect = googleRedirect(req);
      oauthStates.set(state, {user: u.id, mode, verifier, nonce, redirect, expires: Date.now() + 600000});
      const q = new URLSearchParams({client_id: g.id, redirect_uri: redirect, response_type: 'code', scope: 'openid email profile', state, nonce,
        code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', prompt: 'select_account'});
      res.writeHead(302, {Location: g.auth + '?' + q, 'Set-Cookie': oauthCookie(state, 600), 'Cache-Control': 'no-store'});
      return res.end();
    }
    if (p === '/api/session' && method === 'POST') {
      if (!u) { limit('guest' + req.socket.remoteAddress, 40); const id = randomUUID(); sql('INSERT INTO users(id) VALUES(?)', id); session(res, id); u = one('SELECT * FROM users WHERE id=?', id); }
      return send(safe(u));
    }
    if (!u) fail('Entre novamente para continuar.', 401);
    if (['/api/login', '/api/register', '/api/recover'].includes(p) && method === 'POST') {
      limit('auth' + req.socket.remoteAddress, 12);
      const email = bounded(b.email, 254, 3).trim().toLowerCase(), pass = bounded(b.password, 256, 10);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('E-mail inválido.');
      const found = one('SELECT * FROM users WHERE email=?', email);
      if (p === '/api/register') {
        if (u.email || found) fail('Não foi possível cadastrar este e-mail.');
        const recovery = randomBytes(18).toString('hex'); const name = bounded(b.name, 80, 1).trim();
        if (!name) fail('Informe seu nome.');
        const passwordHash = await hash(pass);
        const registered = sql('UPDATE OR IGNORE users SET name=?,email=?,hash=?,recovery=? WHERE id=? AND email IS NULL', name, email, passwordHash, digest(recovery), u.id);
        if (!registered.changes) fail('Cadastro já concluído ou e-mail em uso.', 409);
        sql('DELETE FROM sessions WHERE user=?', u.id); session(res, u.id); return send({recovery});
      }
      if (p === '/api/recover') {
        if (!found || digest(bounded(b.code, 128, 1)) !== found.recovery) fail('Dados de recuperação inválidos.', 403);
        const newHash = await hash(pass), code = randomBytes(18).toString('hex');
        if (!sql('UPDATE users SET hash=?, recovery=? WHERE id=? AND recovery=?', newHash, digest(code), found.id, found.recovery).changes) fail('Código expirado.');
        sql('DELETE FROM sessions WHERE user=?', found.id); return send({recovery: code});
      }
      if (found && !found.hash && found.google_sub) fail('Esta conta usa o login com Google. Use “Continuar com Google”.', 401);
      if (!found || !await matches(pass, found.hash)) fail('E-mail ou senha incorretos.', 401);
      sql('DELETE FROM sessions WHERE token=?', token); session(res, found.id); return send(safe(found));
    }
    if (p === '/api/logout' && method === 'POST') { sql('DELETE FROM sessions WHERE token=?', token); return send({ok: true}); }
    if (p === '/api/logout-all' && method === 'POST') { sql('DELETE FROM sessions WHERE user=?', u.id); return send({ok: true}); }
    if (p === '/api/export' && method === 'GET') {
      limit('export' + u.id, 6);
      const data = {formato: 'jack-ai-exportacao-1', exportado: new Date().toISOString(), conta: {nome: u.name, email: u.email, google: !!u.google_sub, preferencias: prefsOf(u)},
        conversas: db.prepare('SELECT id,title,pinned,archived,updated,model,messages FROM chats WHERE user=? ORDER BY updated DESC').all(u.id).map(chatRow)};
      res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Disposition': 'attachment; filename="jack-ai-dados.json"'});
      return res.end(JSON.stringify(data, null, 2));
    }
    if (p === '/api/chats' && method === 'DELETE') {
      if ([...active].some(k => one('SELECT 1 FROM chats WHERE id=? AND user=?', k, u.id))) fail('Aguarde a resposta em andamento.', 409);
      return send({deleted: sql('DELETE FROM chats WHERE user=?', u.id).changes});
    }
    if (p === '/api/account' && method === 'DELETE') { sql('DELETE FROM users WHERE id=?', u.id); return send({ok: true}); }
    if (p === '/api/profile' && method === 'POST') {
      const photo = bounded(b.photo || '', 400000);
      if (photo && !imageRule.test(photo)) fail('Imagem inválida.');
      const old = prefsOf(u);
      const prefs = {...old, theme: ['auto', 'dark', 'light'].includes(b.theme) ? b.theme : 'auto', instructions: bounded(b.instructions || '', 4000), temperature: Math.min(2, Math.max(0, Number(b.temperature) || 0)), maxTokens: Math.min(8192, Math.max(64, Number(b.maxTokens) || 1024))};
      sql('UPDATE users SET name=?,photo=?,prefs=? WHERE id=?', bounded(b.name, 80, 1), photo, JSON.stringify(prefs), u.id);
      return send(safe(one('SELECT * FROM users WHERE id=?', u.id)));
    }
    if (p === '/api/favorites' && method === 'POST') {
      const id = canonicalId(bounded(b.id, 512, 1)), prefs = prefsOf(u);
      const set = new Set((Array.isArray(prefs.favorites) ? prefs.favorites : []).map(canonicalId));
      if (b.favorite) set.add(id); else set.delete(id);
      prefs.favorites = [...set].slice(-60);
      sql('UPDATE users SET prefs=? WHERE id=?', JSON.stringify(prefs), u.id);
      return send({favorites: prefs.favorites});
    }
    if (p === '/api/models' && method === 'GET') return send(await catalogFor(u));
    if (p === '/api/chats' && method === 'GET') return send(db.prepare('SELECT id,title,pinned,archived,updated,model,messages FROM chats WHERE user=? ORDER BY pinned DESC,updated DESC').all(u.id).map(chatRow));
    if (p === '/api/chats' && method === 'POST') { limit('chat' + u.id, 40); const id = randomUUID(); sql('INSERT INTO chats(id,user,title,updated) VALUES(?,?,?,?)', id, u.id, 'Nova conversa', Date.now()); return send({id}); }
    const parts = p.split('/'), id = parts[3], c = id && one('SELECT * FROM chats WHERE id=? AND user=?', id, u.id);
    if (p.startsWith('/api/chats/')) {
      if (!c) fail('Conversa não encontrada.', 404);
      if (method === 'GET' && parts.length === 4) return send(chatRow(c));
      if (active.has(id)) fail('Aguarde a resposta em andamento.', 409);
      if (parts[4] === 'messages' && method === 'PATCH') {
        const list = JSON.parse(c.messages), index = Number(parts[5]), m = list[index];
        if (!m || m.role !== 'assistant' || !Array.isArray(m.versions)) fail('Esta resposta não tem outras versões.');
        const selected = Number(b.selected);
        if (!Number.isInteger(selected) || !m.versions[selected]) fail('Versão inválida.');
        const v = m.versions[selected];
        list[index] = {...m, content: v.content, model: v.model, route: v.route, status: v.status, created: v.created, reasoning: v.reasoning, sources: v.sources, truncated: v.truncated, effort: v.effort, web: v.web, selected};
        for (const k of ['status', 'reasoning', 'sources', 'truncated', 'effort', 'web']) if (!v[k]) delete list[index][k];
        sql('UPDATE chats SET messages=? WHERE id=?', JSON.stringify(list), id);
        return send(chatRow(one('SELECT * FROM chats WHERE id=?', id)));
      }
      if (parts.length !== 4) fail('Rota não encontrada.', 404);
      if (method === 'DELETE') { sql('DELETE FROM chats WHERE id=?', id); return send({ok: true}); }
      if (method === 'PATCH') {
        sql('UPDATE chats SET title=?,pinned=?,archived=? WHERE id=?', bounded(b.title ?? c.title, 120, 1).trim() || c.title,
          b.pinned === undefined ? c.pinned : Number(!!b.pinned), b.archived === undefined ? (c.archived || 0) : Number(!!b.archived), id);
        return send(chatRow(one('SELECT * FROM chats WHERE id=?', id)));
      }
    }
    if (p === '/api/generate' && method === 'POST') {
      limit('gen' + u.id, 20); limit('gen-ip' + req.socket.remoteAddress, 90);
      const chat = b.id ? one('SELECT * FROM chats WHERE id=? AND user=?', b.id, u.id) : null;
      if (b.id && !chat) fail('Conversa não encontrada.', 404);
      const lock = chat?.id || 'temp' + u.id;
      if (active.has(lock)) fail('Já existe uma resposta em andamento.', 409);
      if (typeof b.model !== 'string' || !b.model || b.model.length > 512) fail('Modelo inválido.');
      // IDs antigos de perfis (por exemplo jack/free) passam a usar o perfil novo.
      const modelId = canonicalId(b.model);
      let messages = chat ? JSON.parse(chat.messages) : cleanHistory(b.history);
      if (!Array.isArray(messages) || messages.length > 180) fail('Inicie uma nova conversa.');
      const files = cleanFiles(b.files), images = cleanImages(b.images), content = bounded(b.content ?? '', 100000), options = cleanOptions(b.options);
      const effort = ['low', 'medium', 'high'].includes(b.effort) ? b.effort : null, web = b.web === true;
      const requestId = typeof b.requestId === 'string' && /^[\w-]{8,64}$/.test(b.requestId) ? b.requestId : randomUUID();
      let target = null, index = b.index;
      if (b.regenerate !== undefined) {
        target = b.regenerate;
        if (!Number.isInteger(target) || target !== messages.length - 1 || messages[target]?.role !== 'assistant') fail('Só é possível gerar uma nova versão da última resposta.');
        if ((messages[target].versions?.length || 1) >= 10) fail('Limite de dez versões atingido para esta resposta.');
      } else {
        const lastUser = messages.findLastIndex(m => m.role === 'user');
        // Mesmo requestId: repetição do mesmo envio. Nunca cria mensagem duplicada.
        if (lastUser >= 0 && messages[lastUser].requestId === requestId) {
          if (messages.length - 1 > lastUser && !messages.at(-1).status) fail('Esta mensagem já foi enviada.', 409);
          index = lastUser;
        }
        if (index !== undefined && index !== null) {
          if (!Number.isInteger(index) || messages[index]?.role !== 'user') fail('Mensagem inválida.');
          messages = messages.slice(0, index);
        }
        if (!content.trim() && !images.length && !files.length) fail('Escreva uma mensagem.');
      }
      const catalog = await catalogFor(u);
      const needs = {vision: target === null ? images.length > 0 : !!messages[target - 1]?.images?.length};
      const {entry, route} = resolveEntry(catalog, modelId, needs);
      const profile = profiles.find(pr => pr.id === entry.id);
      if (target === null) messages.push({role: 'user', content, ...(files.length ? {files} : {}), ...(images.length ? {images} : {}), ...(options ? {options} : {}), requestId, model: modelId, created: Date.now()});
      const context = target === null ? messages : messages.slice(0, target);
      if (JSON.stringify(messages).length > 4000000) fail('Conversa excede o limite.');
      const prefs = prefsOf(u);
      const system = [profile?.instructions, prefs.instructions].filter(Boolean).join('\n\n');
      const providerMessages = [...(system ? [{role: 'system', content: system}] : []), ...context.map((m, i) => forProvider(m, route.vision, i === context.length - 1))];
      const snap = routeSnapshot(route);
      const ctrl = new AbortController(); res.on('close', () => ctrl.abort()); active.add(lock);
      const save = () => {
        if (!chat) return;
        const first = messages.find(m => m.role === 'user');
        const title = chat.title === 'Nova conversa' ? (first?.content.replace(/\s+/g, ' ').trim().slice(0, 65).trim() || first?.files?.[0]?.name || 'Imagem') : chat.title;
        sql('UPDATE chats SET messages=?,updated=?,model=?,title=? WHERE id=?', JSON.stringify(messages), Date.now(), modelId, title, chat.id);
      };
      try {
        if (target === null) save();
        res.writeHead(200, {'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no'}); res.flushHeaders();
        res.write(JSON.stringify({route: {...snap, profile: entry.kind === 'profile' ? entry.id : null}, requestId}) + '\n');
        let reply = '', failure = '', status = null, reasoning = '', sources = null, truncated = false;
        try {
          for await (const ev of generate({route, messages: providerMessages, temperature: prefs.temperature ?? 0.7, maxTokens: prefs.maxTokens || 1024, effort, web, signal: ctrl.signal})) {
            if (ev.type === 'text') { reply += ev.value; res.write(JSON.stringify({delta: ev.value}) + '\n'); }
            else if (ev.type === 'reasoning') { if (reasoning.length < 60000) reasoning += ev.value; res.write(JSON.stringify({reasoning: ev.value}) + '\n'); }
            else if (ev.type === 'sources') { sources = ev.value; res.write(JSON.stringify({sources}) + '\n'); }
            else if (ev.type === 'finish' && ev.value === 'length') { truncated = true; res.write(JSON.stringify({truncated}) + '\n'); }
          }
          if (route.curated) recordCheck(route.id, true, 'Resposta recebida em uma conversa.');
        } catch (e) {
          failure = ctrl.signal.aborted ? 'Geração interrompida.' : (e.message || 'Falha ao conectar ao provedor.');
          status = e.status || null;
          if (route.curated && [404, 403].includes(status)) recordCheck(route.id, false, failure);
          if (!ctrl.signal.aborted) res.write(JSON.stringify({error: failure, status, alternatives: catalog.models.filter(m => m.available && m.id !== modelId && m.route?.id !== route.id && m.id !== route.id).slice(0, 3).map(m => ({id: m.id, name: m.name}))}) + '\n');
        } finally {
          const now = Date.now();
          const extra = {...(reasoning ? {reasoning} : {}), ...(sources ? {sources} : {}), ...(truncated ? {truncated} : {}), ...(effort ? {effort} : {}), ...(web ? {web} : {}), ...(failure ? {status: failure} : {})};
          if (target !== null) {
            if (reply) {
              const old = messages[target];
              const keep = m => Object.fromEntries(['status', 'reasoning', 'sources', 'truncated', 'effort', 'web'].filter(k => m[k]).map(k => [k, m[k]]));
              const versions = old.versions ? [...old.versions] : [{content: old.content, model: old.model, route: old.route, created: old.created, ...keep(old)}];
              versions.push({content: reply, model: modelId, route: snap, created: now, ...extra});
              messages[target] = {role: 'assistant', content: reply, model: modelId, route: snap, created: now, versions, selected: versions.length - 1, ...extra};
              save();
            }
          } else {
            if (reply) messages.push({role: 'assistant', content: reply, model: modelId, route: snap, created: now, ...extra});
            else if (failure) messages.at(-1).status = failure;
            save();
          }
        }
        res.end(JSON.stringify({done: true}) + '\n');
      } finally { active.delete(lock); }
      return;
    }
    fail('Rota não encontrada.', 404);
  } catch (e) {
    if (!res.headersSent) send({error: e.status ? e.message : 'Falha interna ao processar a solicitação.', ...(e.extra || {})}, e.status || 500);
    else res.end();
  }
}).listen(Number(process.env.PORT || 3000), process.env.HOST || '0.0.0.0');
