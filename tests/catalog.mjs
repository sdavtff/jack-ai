import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCatalog, resolveEntry, pendingChecks} from '../catalog.mjs';
import {curated, profiles, RELEASED_FROM} from '../models.config.mjs';

const route = (id, extra = {}) => ({id, apiId: id.slice('openrouter/'.length), name: id, vendor: 'X', host: 'OpenRouter', provider: 'OpenRouter', listed: true, available: true, paid: true, vision: false, files: false, context: 100000, ...extra});
const discovery = routes => ({routes, providers: [{id: 'openrouter', name: 'OpenRouter', connected: true, status: 'Conectado'}], keys: {openrouter: {limit: 25, limitRemaining: 18.4, usage: 6.6}}});
const env = extra => ({JACK_ROUTE_CHECKS: 'on', ...extra});
const ok = (...ids) => new Map(ids.map(id => [id, {ok: true, checked: Date.now(), detail: 'ok'}]));

test('catálogo só tem modelos pagos lançados a partir de 2026, sem variantes gratuitas nem rotas locais', () => {
  assert.ok(curated.length >= 15);
  for (const m of curated) {
    assert.equal(m.paid, true, m.id);
    assert.ok(m.released >= RELEASED_FROM, m.id + ' lançado em ' + m.released);
    assert.doesNotMatch(m.id, /:free$|^openrouter\/openrouter\/free$|^nvidia\/|^ollama\//, m.id);
    assert.equal(m.host, 'OpenRouter');
  }
  const ids = new Set(curated.map(m => m.id));
  for (const p of profiles) for (const r of p.routes) assert.ok(r === 'largest:*' || ids.has(r), p.id + ' usa rota fora do catálogo: ' + r);
  assert.equal(profiles.some(p => p.requireFree), false);
});

test('descoberta ignora variantes gratuitas e modelos fora do catálogo', () => {
  const d = discovery([route('openrouter/openrouter/free'), route('openrouter/openai/gpt-oss-120b:free'), route('openrouter/qwen/qwen3-coder-plus'), route('openrouter/anthropic/claude-haiku-5.5')]);
  const cat = buildCatalog({discovery: d, checks: ok('openrouter/anthropic/claude-haiku-5.5'), env: env()});
  assert.equal(cat.models.some(m => /:free$|openrouter\/free|qwen3-coder-plus/.test(m.id)), false);
  assert.ok(cat.models.filter(m => m.kind === 'route').every(m => m.paid));
  assert.equal(cat.models.find(m => m.id === 'jack/flash').route.id, 'openrouter/anthropic/claude-haiku-5.5');
});

test('rota nova do catálogo só fica disponível depois da chamada mínima', () => {
  const id = 'openrouter/anthropic/claude-haiku-5.5';
  const d = discovery([route(id, {vendor: 'Anthropic', vision: true})]);
  let cat = buildCatalog({discovery: d, env: env()});
  const haiku = cat.models.find(m => m.id === id);
  assert.equal(haiku.available, false); assert.equal(haiku.status, 'Verificando rota'); assert.equal(haiku.vendor, 'Anthropic'); assert.equal(haiku.curated, true);
  assert.deepEqual(pendingChecks(d, new Map(), env()).map(r => r.id), [id]);
  cat = buildCatalog({discovery: d, checks: ok(id), env: env()});
  assert.equal(cat.models.find(m => m.id === id).available, true);
  assert.equal(pendingChecks(d, ok(id), env()).length, 0);
  const failed = new Map([[id, {ok: false, checked: Date.now(), detail: 'A conta do OpenRouter está sem créditos. Adicione saldo para continuar.'}]]);
  assert.match(buildCatalog({discovery: d, checks: failed, env: env()}).models.find(m => m.id === id).reason, /falhou.*sem créditos/);
  const off = buildCatalog({discovery: d, env: env({JACK_ROUTE_CHECKS: 'off'})});
  assert.equal(off.models.find(m => m.id === id).available, true, 'JACK_ROUTE_CHECKS=off libera sem chamada mínima');
});

test('perfis seguem a ordem de rotas, respeitam o acesso da conta e a análise de imagens', () => {
  const sonnet = route('openrouter/anthropic/claude-sonnet-5.5', {vision: true, files: true, context: 1000000});
  const pro = route('openrouter/deepseek/deepseek-v4-pro-0813', {vision: false, context: 1048576});
  const d = discovery([sonnet, pro]);
  const cat = buildCatalog({discovery: d, checks: ok(sonnet.id, pro.id), env: env()});
  assert.equal(cat.models.find(m => m.id === 'jack/code').route.id, sonnet.id);
  const jackPro = cat.models.find(m => m.id === 'jack/pro');
  assert.equal(jackPro.available, false); assert.match(jackPro.reason, /Entre na sua conta/);
  assert.equal(jackPro.route.id, pro.id, 'largest:* escolhe a rota de maior contexto');
  assert.throws(() => resolveEntry(cat, 'jack/pro'), e => e.status === 403 && e.extra.alternatives.length > 0);
  const signed = buildCatalog({discovery: d, checks: ok(sonnet.id, pro.id), user: {email: 'a@b.c'}, env: env()});
  assert.equal(signed.models.find(m => m.id === 'jack/pro').available, true);
  assert.throws(() => resolveEntry(cat, pro.id, {vision: true}), /não aceita imagens/);
  const textOnly = buildCatalog({discovery: discovery([pro]), checks: ok(pro.id), env: env()});
  assert.throws(() => resolveEntry(textOnly, 'jack/code', {vision: true}), /análise de imagens/);
});

test('ID antigo jack/free passa a usar o Jack AI Flash', () => {
  const haiku = route('openrouter/anthropic/claude-haiku-5.5', {vision: true});
  const cat = buildCatalog({discovery: discovery([haiku]), checks: ok(haiku.id), env: env()});
  assert.equal(cat.models.some(m => m.id === 'jack/free'), false);
  assert.equal(cat.aliases['jack/free'], 'jack/flash');
  const {entry, route: used} = resolveEntry(cat, 'jack/free');
  assert.equal(entry.id, 'jack/flash'); assert.equal(used.id, haiku.id);
});

test('desativar no ambiente remove o modelo das duas telas; rota ausente aparece com motivo; saldo da chave', () => {
  const d = discovery([route('openrouter/openai/gpt-6-luna')]);
  const cat = buildCatalog({discovery: d, env: env({JACK_DISABLED_MODELS: 'jack/studio,openrouter/openai/gpt-6.1-sol'})});
  assert.equal(cat.models.some(m => m.id === 'jack/studio'), false);
  assert.equal(cat.models.some(m => m.id === 'openrouter/openai/gpt-6.1-sol'), false);
  const fable = cat.models.find(m => m.id === 'openrouter/anthropic/claude-fable-5.1');
  assert.equal(fable.available, false); assert.match(fable.reason, /não lista/); assert.equal(fable.paid, true);
  assert.equal(cat.models.find(m => m.id === 'openrouter/mistralai/mistral-large-4-0').preview, true);
  const order = [...new Set(cat.models.map(m => m.vendor))];
  assert.deepEqual(order.slice(0, 5), ['Jack AI', 'OpenAI', 'Anthropic', 'Google', 'xAI']);
  assert.deepEqual(cat.limits.openrouter, {limit: 25, limitRemaining: 18.4, usage: 6.6});
  const empty = buildCatalog({discovery: {routes: [], providers: [{id: 'openrouter', name: 'OpenRouter', connected: false, status: 'Configure OPENROUTER_API_KEY'}], keys: {}}, env: env()});
  assert.match(empty.models.find(m => m.id === 'openrouter/openai/gpt-6-astra').reason, /OPENROUTER_API_KEY/);
  assert.equal(empty.limits.openrouter, null);
});
