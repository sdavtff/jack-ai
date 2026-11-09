import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const PORT = 31331, FIX = 31332;
test('catálogo verificado, anexos, duplicidade, versões, arquivamento, favoritos e falhas', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jack-conv-'));
  const upstream = spawn(process.execPath, ['tests/support/fixture-openrouter.mjs'], {env: {...process.env, FIXTURE_PORT: String(FIX), FIXTURE_FAIL_PING: 'mistralai/mistral-large-4-0'}, stdio: 'ignore'});
  const server = spawn(process.execPath, ['server.mjs'], {env: {...process.env, PORT: String(PORT), DATA_DIR: dir, OPENROUTER_API_KEY: 'chave-de-teste',
    OPENROUTER_BASE_URL: 'http://127.0.0.1:' + FIX + '/api/v1', JACK_CHECK_GAP_MS: '20'}, stdio: 'ignore'});
  let cookie = '';
  async function call(route, body, method) {
    const r = await fetch('http://127.0.0.1:' + PORT + '/api/' + route, {method: method || (body ? 'POST' : 'GET'), headers: {cookie, 'Content-Type': 'application/json'}, body: body && JSON.stringify(body)});
    if (r.headers.has('Set-Cookie')) cookie = r.headers.get('Set-Cookie').split(';')[0];
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    return {status: r.status, json, frames: json ? null : text.trim().split('\n').map(l => JSON.parse(l))};
  }
  try {
    for (let i = 0; i < 100; i++) { try { await call('session', {}); break; } catch { await new Promise(r => setTimeout(r, 40)); } }
    let catalog = (await call('models')).json;
    assert.equal(catalog.models[0].vendor, 'Jack AI');
    for (let i = 0; i < 80; i++) {
      catalog = (await call('models')).json;
      if (catalog.models.filter(m => m.curated && m.status === 'Verificando rota').length === 0) break;
      await new Promise(r => setTimeout(r, 100));
    }
    const sonnet = catalog.models.find(m => m.id === 'openrouter/anthropic/claude-sonnet-5.5');
    assert.equal(sonnet.available, true); assert.equal(sonnet.verification.ok, true);
    const large = catalog.models.find(m => m.id === 'openrouter/mistralai/mistral-large-4-0');
    assert.equal(large.available, false); assert.match(large.reason, /falhou/);
    assert.equal(catalog.models.find(m => m.id === 'jack/code').route.id, sonnet.id);
    assert.deepEqual(catalog.limits.openrouter, {limit: 25, limitRemaining: 18.4, usage: 6.6});
    assert.equal(catalog.models.some(m => /:free$|openrouter\/free|qwen3-coder-plus|^nvidia\/|^ollama\//.test(m.id)), false, 'só rotas pagas do catálogo');
    assert.ok(catalog.models.filter(m => m.kind === 'route').every(m => m.paid && m.released >= '2026-01-01'));
    assert.equal(catalog.providers.length, 1);
    const flash = catalog.models.find(m => m.id === 'jack/flash');
    assert.equal(flash.route.id, 'openrouter/anthropic/claude-haiku-5.5'); assert.deepEqual(flash.route.price, {input: 0.1, output: 0.5});
    const astra = catalog.models.find(m => m.id === 'openrouter/openai/gpt-6-astra');
    assert.equal(astra.available, true); assert.equal(astra.vendor, 'OpenAI'); assert.deepEqual(astra.price, {input: 10, output: 50});
    assert.equal(catalog.models.find(m => m.id === 'jack/pro').route.id, 'openrouter/anthropic/claude-fable-5.1');
    assert.equal(catalog.models.find(m => m.id === 'openrouter/x-ai/grok-4.7').vendor, 'xAI');

    const {json: {id}} = await call('chats', {});
    const sent = await call('generate', {id, model: 'jack/code', content: 'Revise', requestId: 'pedido-0001', files: [{name: 'app.js', size: 12, text: 'const a = 1;'}], options: {language: 'JavaScript'}});
    assert.equal(sent.frames[0].route.id, sonnet.id); assert.equal(sent.frames[0].route.profile, 'jack/code');
    assert.equal(sent.frames.at(-1).done, true);
    const dup = await call('generate', {id, model: 'jack/code', content: 'Revise', requestId: 'pedido-0001'});
    assert.equal(dup.status, 409, 'clique repetido não duplica a mensagem');
    let chat = (await call('chats/' + id)).json;
    assert.equal(chat.messages.length, 2);
    assert.equal(chat.messages[0].files[0].name, 'app.js'); assert.equal(chat.messages[0].options.language, 'JavaScript');
    assert.equal(chat.messages[1].route.id, sonnet.id); assert.equal(chat.title, 'Revise');

    const again = await call('generate', {id, model: 'jack/free', regenerate: 1});
    assert.equal(again.frames.at(-1).done, true);
    assert.equal(again.frames[0].route.profile, 'jack/flash', 'ID antigo jack/free usa o Jack AI Flash');
    chat = (await call('chats/' + id)).json;
    assert.equal(chat.messages.length, 2); assert.equal(chat.messages[1].versions.length, 2); assert.equal(chat.messages[1].selected, 1);
    assert.equal(chat.messages[1].model, 'jack/flash');
    chat = (await call('chats/' + id + '/messages/1', {selected: 0}, 'PATCH')).json;
    assert.equal(chat.messages[1].route.id, sonnet.id, 'versão anterior continua acessível');

    const failed = await call('generate', {id, model: 'jack/flash', content: 'Teste [falha]', requestId: 'pedido-0002'});
    assert.ok(failed.frames.some(f => f.error));
    chat = (await call('chats/' + id)).json;
    const lastUser = chat.messages.findLastIndex(m => m.role === 'user');
    assert.ok(chat.messages.at(-1).status, 'falha fica registrada para nova tentativa');
    const retried = await call('generate', {id, model: 'jack/flash', content: 'Teste sem falha', requestId: 'pedido-0002'});
    assert.equal(retried.frames.at(-1).done, true);
    chat = (await call('chats/' + id)).json;
    assert.equal(chat.messages.filter(m => m.requestId === 'pedido-0002').length, 1, 'nova tentativa substitui sem duplicar');
    assert.equal(chat.messages.length, lastUser + 2);

    const image = 'data:image/png;base64,iVBORw0KGgo=';
    const blocked = await call('generate', {id, model: 'openrouter/deepseek/deepseek-v4-pro-0813', content: 'Veja', images: [image]});
    assert.equal(blocked.status, 400); assert.match(blocked.json.error, /não aceita imagens/); assert.ok(blocked.json.alternatives.length);
    assert.equal((await call('chats/' + id)).json.messages.length, lastUser + 2, 'recusa não grava a mensagem');

    const direct = await call('generate', {model: 'openrouter/x-ai/grok-4.7', content: 'Olá direto', history: []});
    assert.equal(direct.frames[0].route.vendor, 'xAI'); assert.equal(direct.frames[0].route.profile, null); assert.equal(direct.frames.at(-1).done, true);
    assert.match(direct.frames.filter(f => f.delta).map(f => f.delta).join(''), /x-ai\/grok-4.7/);
    const freeRoute = await call('generate', {model: 'openrouter/openai/gpt-oss-120b:free', content: 'Olá', history: []});
    assert.equal(freeRoute.status, 404, 'variante gratuita não é aceita');
    const pro = await call('generate', {id, model: 'jack/pro', content: 'Plano'});
    assert.equal(pro.status, 403);

    assert.equal((await call('chats/' + id, {archived: true}, 'PATCH')).json.archived, 1);
    assert.equal((await call('chats')).json[0].archived, 1);
    assert.deepEqual((await call('favorites', {id: 'jack/code', favorite: true})).json.favorites, ['jack/code']);
    assert.deepEqual((await call('favorites', {id: 'jack/free', favorite: true})).json.favorites, ['jack/code', 'jack/flash'], 'favorito antigo vira jack/flash');
    assert.deepEqual((await call('favorites', {id: 'jack/flash', favorite: false})).json.favorites, ['jack/code']);
    assert.deepEqual((await call('session', {})).json.prefs.favorites, ['jack/code']);

    const temp = await call('generate', {model: 'jack/flash', content: 'Temporária', history: [{role: 'user', content: 'Antes'}, {role: 'assistant', content: 'Ok'}]});
    assert.equal(temp.frames.at(-1).done, true);
    assert.equal((await call('chats')).json.length, 1, 'chat temporário não entra no histórico');
  } finally {
    await Promise.all([server, upstream].map(async child => { if (child.exitCode === null) { const exit = once(child, 'exit'); child.kill(); await exit; } }));
    await rm(dir, {recursive: true, force: true});
  }
});
