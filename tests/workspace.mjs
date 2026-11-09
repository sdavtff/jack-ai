import test from 'node:test';
import assert from 'node:assert/strict';
import {createDrafts, matchesChat, matchSnippet, preferredModel, applySuggestion, suggestions, incompatibleFiles, groupModels, modelLabel} from '../public/workspace.js';

function memoryStorage() { const m = new Map(); return {getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), raw: m}; }

test('rascunhos preservam texto, anexos e edição por conversa e sobrevivem ao recarregar', () => {
  const storage = memoryStorage();
  const drafts = createDrafts(storage, 'u1');
  drafts.save('a', {text: 'Revisar', files: [{name: 'notas.txt', size: 5, text: 'Texto'}], edit: 2});
  drafts.save(null, {text: 'Outra conversa', files: [], edit: null});
  const reloaded = createDrafts(storage, 'u1');
  assert.equal(reloaded.get('a').text, 'Revisar');
  assert.equal(reloaded.get('a').files[0].name, 'notas.txt');
  assert.equal(reloaded.get('a').edit, 2);
  assert.equal(reloaded.take(null).text, 'Outra conversa');
  assert.equal(reloaded.get(null), null);
  assert.equal(createDrafts(storage, 'outro').get('a'), null, 'rascunhos são separados por conta');
});

test('imagens ficam só na memória e rascunho vazio é removido', () => {
  const storage = memoryStorage();
  const drafts = createDrafts(storage, 'u1');
  drafts.save('b', {text: '', files: [{name: 'foto.png', image: 'data:image/png;base64,AAAA'}], edit: null});
  assert.ok(drafts.has('b'));
  assert.equal(createDrafts(storage, 'u1').get('b').files.length, 0);
  drafts.save('b', {text: '  ', files: [], edit: null});
  assert.equal(drafts.has('b'), false);
  drafts.save('c', {text: 'x', files: []}); drafts.move('c', 'd');
  assert.equal(drafts.get('c'), null); assert.equal(drafts.get('d').text, 'x');
  drafts.clear(); assert.equal(storage.raw.size, 0);
});

test('busca vazia e título suficiente não percorrem mensagens; trecho mostra o conteúdo encontrado', () => {
  const chat = {title: 'Revisão', get messages() { throw Error('leitura desnecessária'); }};
  assert.ok(matchesChat(chat, '  ')); assert.ok(matchesChat(chat, 'REVISÃO'));
  const notes = {title: 'Notas', messages: [{content: 'Uma composição longa sobre arquitetura de software'}]};
  assert.ok(matchesChat(notes, 'posição'));
  assert.match(matchSnippet(notes, 'arquitetura'), /arquitetura de software/);
});

test('preferência do usuário tem precedência; sem escolha, Jack AI Flash é o padrão', () => {
  const models = ['a', 'jack/flash', 'openrouter/openai/gpt-6-luna'].map(id => ({id, available: true}));
  assert.equal(preferredModel(models, 'a'), 'a');
  assert.equal(preferredModel(models, 'indisponível'), 'jack/flash');
  assert.equal(preferredModel([{id: 'x', available: false}], 'x'), '');
});

test('sugestões preenchem o campo, preservam o rascunho e selecionam o trecho a completar', () => {
  const code = suggestions.find(s => s.id === 'code');
  const empty = applySuggestion('', code);
  assert.equal(empty.text.slice(empty.start, empty.end), '…');
  assert.ok(empty.text.startsWith('Ajude-me a implementar esta funcionalidade em'));
  const kept = applySuggestion('Meu rascunho  \n', code);
  assert.ok(kept.text.startsWith('Meu rascunho\n\nAjude-me'));
  assert.equal(kept.text.slice(kept.start, kept.end), '…');
  const write = applySuggestion('', suggestions.find(s => s.id === 'write'));
  assert.equal(write.start, write.text.length);
  assert.match(write.text, /mantendo meu tom de voz/);
});

test('imagem anexada bloqueia modelo sem análise de imagens', () => {
  const files = [{name: 'foto.png', image: 'data:'}, {name: 'a.txt', text: 'x'}];
  assert.equal(incompatibleFiles({capabilities: {vision: false}}, files).length, 1);
  assert.equal(incompatibleFiles({capabilities: {vision: true}}, files).length, 0);
});

test('seções: Favoritos, Jack AI e fornecedores na ordem definida', () => {
  const list = [{id: 'r1', kind: 'route', vendor: 'DeepSeek', name: 'V4'}, {id: 'jack/flash', kind: 'profile', vendor: 'Jack AI', name: 'Jack AI Flash'}, {id: 'r2', kind: 'route', vendor: 'OpenAI', name: 'GPT'}];
  const groups = groupModels(list, {favorites: ['r1'], order: ['Favoritos', 'Jack AI', 'OpenAI', 'DeepSeek']});
  assert.deepEqual(groups.map(g => g.title), ['Favoritos', 'Jack AI', 'OpenAI', 'DeepSeek']);
  assert.deepEqual(groupModels(list, {query: 'openai'}).map(g => g.title), ['OpenAI']);
});

test('mensagens antigas continuam legíveis quando o modelo sai do catálogo', () => {
  assert.equal(modelLabel([], {model: 'openrouter/x/old-model'}), 'old-model (descontinuado)');
  assert.equal(modelLabel([], {model: 'jack/free', route: {name: 'gpt-oss-120b (gratuito)'}}), 'Jack AI · gpt-oss-120b (gratuito)');
  assert.equal(modelLabel([{id: 'a'}], {model: 'gone', route: {name: 'Modelo antigo'}}), 'Modelo antigo (fora do catálogo)');
});
