// Teste do operador. Envia apenas esta pergunta fixa ao modelo escolhido.
// Sem argumento, lista as rotas descobertas e o estado das rotas do catálogo.
import {generate, listModels, ping} from '../providers.mjs';
import {curated} from '../models.config.mjs';

const selectedId = process.argv[2];
const {routes, providers} = await listModels();
const available = routes.filter(model => model.available && model.listed);

if (selectedId === '--catalog') {
  // Confere identificador exato e faz a chamada mínima de cada rota do catálogo.
  // Todas as rotas são pagas: cada chamada mínima (até 16 tokens de saída) é cobrada.
  console.log('Provedores:', providers.map(p => p.name + ' · ' + p.status).join(' | '));
  for (const item of curated) {
    const found = routes.find(r => r.id === item.id);
    if (!found) { console.log('[ausente]   ', item.id, '— não listado para esta chave'); continue; }
    const result = await ping(found);
    console.log(result.ok ? '[ok]        ' : '[falhou]    ', item.id, '—', result.detail);
  }
} else if (!selectedId || !available.some(model => model.id === selectedId)) {
  console.error('Informe um ID acessível como argumento, ou --catalog para verificar o catálogo. Modelos descobertos:');
  for (const model of available) console.error(model.id);
  if (!available.length) console.error('Nenhum modelo acessível. Consulte PROVIDERS.md.');
  process.exitCode = 2;
} else {
  try {
    for await (const chunk of generate({
      model: selectedId, maxTokens: 128,
      messages: [{role: 'user', content: 'Em uma frase curta em português, explique por que o céu parece azul.'}]
    })) if (chunk.type === 'text') process.stdout.write(chunk.value);
    process.stdout.write('\n');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
