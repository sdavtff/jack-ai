import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const PORT = 31341, FIX = 31342, BASE = 'http://127.0.0.1:' + PORT;
const CLIENT = 'cliente-teste.apps.googleusercontent.com';

// Cliente HTTP com cookies separados, como um navegador. O cookie jack é SameSite=Strict:
// na volta do Google (navegação vinda de outro site) ele não é enviado, e o teste imita isso.
function browser() {
  const jar = new Map();
  const keep = r => { for (const c of r.headers.getSetCookie()) { const [pair] = c.split(';'); const [k, v] = pair.split('='); if (/Max-Age=0/.test(c)) jar.delete(k); else jar.set(k, v); } };
  const cookie = names => [...jar].filter(([k]) => !names || names.includes(k)).map(([k, v]) => k + '=' + v).join('; ');
  return {
    jar,
    async call(route, body, method) {
      const r = await fetch(BASE + '/api/' + route, {method: method || (body ? 'POST' : 'GET'), headers: {cookie: cookie(), 'Content-Type': 'application/json'}, body: body && JSON.stringify(body)});
      keep(r);
      const text = await r.text();
      let json = null; try { json = JSON.parse(text); } catch {}
      return {status: r.status, json, headers: r.headers, frames: json ? null : text.trim().split('\n').filter(Boolean).map(l => JSON.parse(l))};
    },
    // Percorre o login do Google: início no Jack AI, tela do Google (servidor de contrato) e volta.
    async google(extra = '', mode = 'login', {tamper = false} = {}) {
      const start = await fetch(BASE + '/api/auth/google/start' + (mode === 'link' ? '?mode=link' : ''), {redirect: 'manual', headers: {cookie: cookie()}});
      keep(start);
      const auth = start.headers.get('location');
      if (!auth.startsWith('http://127.0.0.1:' + FIX)) return {start: auth};
      const consent = await fetch(auth + extra, {redirect: 'manual'});
      const back = consent.headers.get('location');
      const r = await fetch(back, {redirect: 'manual', headers: {cookie: tamper ? 'jack_oauth=outro-estado' : cookie(['jack_oauth'])}});
      keep(r);
      return {auth: new URL(auth), back, location: r.headers.get('location'), cookies: r.headers.getSetCookie()};
    }
  };
}

test('esforço, raciocínio, pesquisa na web, PDF, continuação, login com Google e dados da conta', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jack-feat-'));
  const upstream = spawn(process.execPath, ['tests/support/fixture-openrouter.mjs'], {env: {...process.env, FIXTURE_PORT: String(FIX)}, stdio: 'ignore'});
  const server = spawn(process.execPath, ['server.mjs'], {env: {...process.env, PORT: String(PORT), DATA_DIR: dir, OPENROUTER_API_KEY: 'chave-de-teste',
    OPENROUTER_BASE_URL: 'http://127.0.0.1:' + FIX + '/api/v1', JACK_ROUTE_CHECKS: 'off', PUBLIC_URL: BASE,
    GOOGLE_CLIENT_ID: CLIENT, GOOGLE_CLIENT_SECRET: 'segredo-de-teste', GOOGLE_AUTH_URL: 'http://127.0.0.1:' + FIX + '/google/auth', GOOGLE_TOKEN_URL: 'http://127.0.0.1:' + FIX + '/google/token'}, stdio: 'ignore'});
  try {
    const a = browser();
    for (let i = 0; i < 100; i++) { try { await fetch('http://127.0.0.1:' + FIX + '/api/v1/key'); await a.call('session', {}); break; } catch { await new Promise(r => setTimeout(r, 40)); } }
    const me = (await a.call('session', {})).json;
    assert.equal(me.auth.google, true); assert.equal(me.google, false);
    const catalog = (await a.call('models')).json;
    assert.equal(catalog.models.find(m => m.id === 'jack/code').capabilities.reasoning, true);
    assert.equal(catalog.models.find(m => m.id === 'openrouter/mistralai/mistral-small-2603').capabilities.reasoning, false);

    // Esforço alto: raciocínio transmitido e guardado; espaço extra no max_tokens; sem temperatura.
    const {json: {id}} = await a.call('chats', {});
    const high = await a.call('generate', {id, model: 'jack/code', content: 'Explique [codigo] em python', effort: 'high', requestId: 'pedido-esforco'});
    assert.ok(high.frames.some(f => f.reasoning), 'raciocínio chega em tempo real');
    let chat = (await a.call('chats/' + id)).json;
    const answer = chat.messages[1];
    assert.equal(answer.effort, 'high'); assert.match(answer.reasoning, /Entendendo o pedido/);
    const plain = await a.call('generate', {model: 'jack/code', content: 'Teste simples', effort: 'medium', history: []});
    assert.match(plain.frames.filter(f => f.delta).map(f => f.delta).join(''), /Esforço pedido: `medium`, max_tokens 7168/);
    const noReasoning = await a.call('generate', {model: 'openrouter/mistralai/mistral-small-2603', content: 'Teste', effort: 'high', history: []});
    assert.doesNotMatch(noReasoning.frames.filter(f => f.delta).map(f => f.delta).join(''), /Esforço pedido/, 'modelo sem raciocínio ignora o esforço');
    const invalid = await a.call('generate', {model: 'jack/code', content: 'Teste', effort: 'máximo', history: []});
    assert.doesNotMatch(invalid.frames.filter(f => f.delta).map(f => f.delta).join(''), /Esforço pedido/, 'valor desconhecido vira automático');
    const exhausted = await a.call('generate', {model: 'jack/code', content: 'Teste [pensamento-longo]', effort: 'high', history: []});
    assert.match(exhausted.frames.find(f => f.error).error, /raciocínio usou todo o espaço/);

    // Nova versão mantém o raciocínio da anterior acessível.
    await a.call('generate', {id, model: 'jack/code', regenerate: 1});
    chat = (await a.call('chats/' + id)).json;
    assert.equal(chat.messages[1].versions.length, 2); assert.equal(chat.messages[1].reasoning, undefined);
    chat = (await a.call('chats/' + id + '/messages/1', {selected: 0}, 'PATCH')).json;
    assert.match(chat.messages[1].reasoning, /Entendendo/); assert.equal(chat.messages[1].effort, 'high');

    // Pesquisa na web: fontes http(s) chegam no fluxo e ficam salvas.
    const web = await a.call('generate', {id, model: 'jack/flash', content: 'Notícias de hoje', web: true, requestId: 'pedido-web'});
    const sources = web.frames.find(f => f.sources).sources;
    assert.deepEqual(sources.map(s => s.url), ['https://example.com/noticia-de-teste', 'https://example.org/referencia']);
    chat = (await a.call('chats/' + id)).json;
    assert.equal(chat.messages.at(-1).web, true); assert.equal(chat.messages.at(-1).sources.length, 2);

    // PDF: leitura nativa quando a rota aceita arquivos, conversor gratuito quando não.
    const pdf = {name: 'contrato.pdf', size: 9, data: 'data:application/pdf;base64,JVBERi0xLjQK'};
    const native = await a.call('generate', {model: 'jack/flash', content: 'Resuma', files: [pdf], history: []});
    assert.match(native.frames.filter(f => f.delta).map(f => f.delta).join(''), /PDF recebido: `contrato.pdf` \(leitura nativa\)/);
    const parsed = await a.call('generate', {model: 'openrouter/mistralai/mistral-small-2603', content: 'Resuma', files: [pdf], history: []});
    assert.match(parsed.frames.filter(f => f.delta).map(f => f.delta).join(''), /conversor cloudflare-ai/);
    assert.equal((await a.call('generate', {model: 'jack/flash', content: 'x', files: [{...pdf, data: 'data:application/pdf;base64,<script>'}], history: []})).status, 400);
    assert.equal((await a.call('generate', {model: 'jack/flash', content: 'x', files: [pdf, {...pdf, name: 'b.pdf'}], history: []})).status, 400);

    // Resposta cortada pelo tamanho máximo fica marcada para “Continuar resposta”.
    const cut = await a.call('generate', {id, model: 'jack/flash', content: 'Texto [truncar]', requestId: 'pedido-cortado'});
    assert.ok(cut.frames.some(f => f.truncated));
    assert.equal((await a.call('chats/' + id)).json.messages.at(-1).truncated, true);

    // Login com Google: visitante vira conta e mantém as conversas.
    const start = await fetch(BASE + '/api/auth/google/start', {redirect: 'manual', headers: {cookie: 'jack=' + a.jar.get('jack')}});
    const authUrl = new URL(start.headers.get('location'));
    assert.equal(authUrl.searchParams.get('client_id'), CLIENT);
    assert.equal(authUrl.searchParams.get('redirect_uri'), BASE + '/api/auth/google/callback');
    assert.equal(authUrl.searchParams.get('code_challenge_method'), 'S256'); assert.equal(authUrl.searchParams.get('scope'), 'openid email profile');
    assert.ok(authUrl.searchParams.get('state') && authUrl.searchParams.get('nonce'));
    assert.match(start.headers.getSetCookie()[0], /jack_oauth=.*HttpOnly; SameSite=Lax; Path=\/api\/auth\/google/);
    assert.equal(authUrl.toString().includes('segredo'), false, 'o segredo do cliente nunca vai ao navegador');
    const guestChats = (await a.call('chats')).json.length;
    const login = await a.google('&fixture_email=Pessoa@Example.com&fixture_sub=sub-1');
    assert.equal(login.location, '/#/?google=ok');
    assert.ok(login.cookies.some(c => /^jack=[a-f0-9]+; HttpOnly; SameSite=Strict/.test(c)));
    const account = (await a.call('session', {})).json;
    assert.equal(account.email, 'pessoa@example.com'); assert.equal(account.google, true); assert.equal(account.password, false); assert.equal(account.name, 'Pessoa Teste');
    assert.equal((await a.call('chats')).json.length, guestChats, 'as conversas do visitante continuam na conta');
    const replay = await fetch(login.back, {redirect: 'manual', headers: {cookie: 'jack_oauth=' + login.auth.searchParams.get('state')}});
    assert.equal(replay.headers.get('location'), '/#/?google=expirado', 'o mesmo retorno não serve duas vezes');
    assert.equal((await a.call('login', {email: 'pessoa@example.com', password: 'qualquer-senha-123'})).json.error, 'Esta conta usa o login com Google. Use “Continuar com Google”.');

    // Retornos inválidos ou recusados.
    const b = browser(); await b.call('session', {});
    assert.equal((await b.google('', 'login', {tamper: true})).location, '/#/?google=expirado', 'estado de outro navegador é recusado');
    assert.equal((await b.google('&fixture_deny=1')).location, '/#/?google=cancelado');
    assert.equal((await b.google('&fixture_unverified=1&fixture_sub=sub-x')).location, '/#/?google=nao-verificado');

    // Conta com senha e mesmo e-mail: não liga sozinha; liga depois, já conectado.
    const c = browser(); await c.call('session', {});
    assert.equal((await c.call('register', {name: 'Ana', email: 'ana@example.com', password: 'senha-da-ana-123'})).status, 200);
    const d = browser(); await d.call('session', {});
    assert.equal((await d.google('&fixture_email=ana@example.com&fixture_sub=sub-ana')).location, '/#/?google=existe');
    assert.equal((await c.google('&fixture_email=outra@example.com&fixture_sub=sub-ana', 'link')).location, '/#/?google=conectado');
    assert.equal((await c.call('session', {})).json.google, true);
    assert.equal((await d.google('&fixture_sub=sub-ana')).location, '/#/?google=ok', 'quem já ligou entra pelo Google');
    assert.equal((await d.call('session', {})).json.email, 'ana@example.com');
    assert.equal((await c.google('&fixture_sub=sub-1', 'link')).location, '/#/?google=vinculada', 'conta Google de outra pessoa não é ligada');

    // Dados da conta: exportar, excluir conversas e sair de todos os dispositivos.
    const exported = await fetch(BASE + '/api/export', {headers: {cookie: 'jack=' + a.jar.get('jack')}});
    assert.match(exported.headers.get('content-disposition'), /attachment; filename="jack-ai-dados.json"/);
    const data = await exported.json();
    assert.equal(data.conta.email, 'pessoa@example.com'); assert.equal(data.conversas.length, guestChats);
    assert.equal((await a.call('chats', null, 'DELETE')).json.deleted, guestChats);
    assert.deepEqual((await a.call('chats')).json, []);
    assert.equal((await c.call('logout-all', {})).status, 200);
    assert.equal((await c.call('chats')).status, 401); assert.equal((await d.call('chats')).status, 401, 'a outra sessão da mesma conta também saiu');
  } finally {
    await Promise.all([server, upstream].map(async child => { if (child.exitCode === null) { const exit = once(child, 'exit'); child.kill(); await exit; } }));
    await rm(dir, {recursive: true, force: true});
  }
});
