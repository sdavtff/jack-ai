// Executado apenas no servidor. Descobre no OpenRouter as rotas pagas do catálogo
// e transmite as respostas. Chaves e credenciais nunca saem deste processo.
import {curated, vendorNames} from './models.config.mjs';

const routerBase = () => (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
const headers = () => ({Authorization: 'Bearer ' + process.env.OPENROUTER_API_KEY});
const curatedIds = new Set(curated.map(item => item.id));
const perMillion = value => { const n = Number(value); return Number.isFinite(n) ? Math.round(n * 1e6 * 10000) / 10000 : null; };

export const providerError = status => ({
  400: 'O provedor recusou os parâmetros ou o tamanho do contexto.',
  401: 'A credencial do provedor é inválida.', 402: 'A conta do OpenRouter está sem créditos. Adicione saldo para continuar.',
  403: 'A política da conta bloqueou o acesso ao modelo.', 404: 'O modelo deixou de estar disponível.',
  429: 'Limite de requisições atingido. Aguarde e tente novamente.'
}[status] || 'O provedor está indisponível. Tente novamente em instantes.');

async function json(url, options = {}) {
  const res = await fetch(url, {signal: AbortSignal.timeout(options.timeout || 3500), ...options, redirect: 'error'});
  if (!res.ok) throw Object.assign(new Error(providerError(res.status)), {status: res.status});
  return res.json();
}

export function vendorOf(slug) {
  const prefix = String(slug).split('/')[0];
  return vendorNames[prefix] || prefix.replace(/(^|-)(\w)/g, (_, dash, c) => (dash ? ' ' : '') + c.toUpperCase());
}

const cleanName = name => String(name || '').replace(/^[^:]{1,40}:\s*/, '').trim();
// Variantes gratuitas nunca entram, mesmo que algum dia apareçam com o mesmo prefixo.
const isFreeVariant = m => m.id.endsWith(':free') || m.id === 'openrouter/free' || ['prompt', 'completion'].every(k => Number(m.pricing?.[k]) === 0);

async function remoteModels() {
  const provider = {id: 'openrouter', name: 'OpenRouter', connected: false, status: 'Configure OPENROUTER_API_KEY'};
  let key = null;
  if (!process.env.OPENROUTER_API_KEY) return {routes: [], provider, key};
  try {
    const info = await json(routerBase() + '/key', {headers: headers()});
    const data = info?.data || {};
    key = {limit: data.limit ?? null, limitRemaining: data.limit_remaining ?? null, usage: data.usage ?? null};
    const {data: list} = await json(routerBase() + '/models/user', {headers: headers()});
    provider.connected = true;
    // Texto na entrada e texto ou imagem na saída (modelos de imagem também entram).
    const textual = m => m.architecture?.input_modalities?.includes('text') && ['text', 'image'].some(k => m.architecture?.output_modalities?.includes(k));
    const routes = list.filter(m => textual(m) && !isFreeVariant(m) && curatedIds.has('openrouter/' + m.id)).map(m => {
      const inputs = m.architecture.input_modalities, outputs = m.architecture.output_modalities;
      return {
        id: 'openrouter/' + m.id, apiId: m.id, name: cleanName(m.name), vendor: vendorOf(m.id), host: 'OpenRouter', provider: 'OpenRouter',
        description: 'Rota paga' + (m.context_length ? ' · ' + Number(m.context_length).toLocaleString('pt-BR') + ' tokens de contexto' : ''),
        available: true, listed: true, paid: true, vision: inputs.includes('image'), files: inputs.includes('file'), inputs,
        temperature: m.supported_parameters?.includes('temperature') || false, context: Number(m.context_length) || null,
        reasoning: ['reasoning', 'include_reasoning'].some(k => m.supported_parameters?.includes(k)),
        imageOutput: outputs.includes('image'), textOutput: outputs.includes('text'),
        maxOutput: Number(m.top_provider?.max_completion_tokens) || null, created: m.created || null,
        price: {input: perMillion(m.pricing?.prompt), output: perMillion(m.pricing?.completion)}
      };
    });
    provider.status = routes.length ? 'Conectado' : 'Nenhum modelo do catálogo acessível com esta chave';
    return {routes, provider, key};
  } catch (error) {
    provider.status = error.status ? providerError(error.status) : 'Falha ao consultar o OpenRouter. Tente novamente.';
    return {routes: [], provider, key};
  }
}

let cache, expires = 0, refreshing;
// Retorna {routes, providers, keys}. Cache de 15 segundos para todas as telas.
export async function listModels() {
  if (cache && Date.now() < expires) return cache;
  if (!refreshing) refreshing = remoteModels().then(remote => {
    cache = {routes: remote.routes, providers: [remote.provider], keys: {openrouter: remote.key}};
    expires = Date.now() + 15000;
    return cache;
  }).finally(() => { refreshing = undefined; });
  return refreshing;
}
export function invalidateModels() { expires = 0; }

const pdfRule = /^data:application\/pdf;base64,[A-Za-z0-9+/]+=*$/;
function adaptMessages(messages, vision) {
  if (!Array.isArray(messages) || !messages.length) throw new Error('Escreva uma mensagem.');
  return messages.map(({role, content, images = [], pdfs = []}) => {
    if (!['system', 'user', 'assistant'].includes(role) || typeof content !== 'string' || !Array.isArray(images) || !Array.isArray(pdfs)) throw new Error('Mensagem inválida.');
    if (!images.length && !pdfs.length) return {role, content};
    if (role !== 'user') throw new Error('Mensagem inválida.');
    if (images.length && !vision) throw new Error('Escolha um modelo com análise de imagens para usar esta conversa com imagens.');
    if (images.length > 8 || images.some(img => typeof img !== 'string' || img.length > 8000000 || !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(img))) throw new Error('Imagem inválida. Use PNG, JPEG ou WebP.');
    if (pdfs.length > 4 || pdfs.some(f => typeof f?.data !== 'string' || f.data.length > 4000000 || !pdfRule.test(f.data))) throw new Error('PDF inválido.');
    return {role, content: [{type: 'text', text: content}, ...images.map(url => ({type: 'image_url', image_url: {url}})),
      ...pdfs.map(f => ({type: 'file', file: {filename: String(f.name || 'documento.pdf').slice(0, 200), file_data: f.data}}))]};
  });
}

// Espaço extra para o raciocínio: no OpenRouter, max_tokens soma raciocínio e resposta.
export const EFFORTS = {low: 2048, medium: 6144, high: 16384};
// Fontes citadas pela pesquisa na web (anotações url_citation), em qualquer formato aceito.
function citations(list) {
  const out = [];
  for (const a of Array.isArray(list) ? list : []) {
    const c = a?.url_citation || a;
    if (a?.type !== 'url_citation' || typeof c?.url !== 'string' || !/^https?:\/\//i.test(c.url)) continue;
    out.push({url: c.url.slice(0, 2000), title: String(c.title || '').replace(/\s+/g, ' ').trim().slice(0, 200)});
  }
  return out;
}
const reasoningText = delta => typeof delta?.reasoning === 'string' ? delta.reasoning
  : Array.isArray(delta?.reasoning_details) ? delta.reasoning_details.map(d => d?.text || d?.summary || '').filter(t => typeof t === 'string').join('') : '';

// Lê o SSE linha a linha. Ao interromper, cancela a leitura na hora: sem isso, um corpo
// já em andamento pode continuar esperando o próximo pedaço mesmo com o fetch abortado.
async function* responseLines(body, signal) {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  const stop = () => { reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', stop, {once: true});
  try {
    let buffer = '';
    while (true) {
      if (signal?.aborted) throw new Error('Geração interrompida.');
      const {value, done} = await reader.read();
      if (signal?.aborted) throw new Error('Geração interrompida.');
      if (done) break;
      buffer += value;
      if (buffer.length > 2000000) throw new Error('Evento de streaming excedeu o tamanho permitido.');
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        yield buffer.slice(0, end).trimEnd();
        buffer = buffer.slice(end + 1);
      }
    }
    if (buffer.trim()) yield buffer.trimEnd();
  } finally {
    signal?.removeEventListener('abort', stop);
    if (!signal?.aborted) reader.cancel().catch(() => {});
  }
}

async function findRoute(model) {
  if (model && typeof model === 'object') return model;
  return (await listModels()).routes.find(item => item.id === model && item.available);
}

// Recebe a rota já resolvida pelo catálogo (ou um ID de rota, para scripts) e emite
// eventos {type: 'text' | 'reasoning' | 'sources' | 'finish', value}.
export async function* generate({route, model, messages, temperature = 0.7, maxTokens = 2048, effort = null, web = false, signal}) {
  const selected = await findRoute(route || model);
  if (!selected) throw new Error('Selecione um modelo disponível. Confira os provedores nas configurações.');
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2 || !Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 8192) throw new Error('Parâmetros de geração inválidos.');
  if (effort !== null && !EFFORTS[effort]) throw new Error('Nível de esforço inválido.');
  const adapted = adaptMessages(messages, selected.vision);
  const thinking = effort && selected.reasoning;
  const payload = {model: selected.apiId, messages: adapted, stream: true, max_tokens: maxTokens + (thinking ? EFFORTS[effort] : 0)};
  if (thinking) payload.reasoning = {effort};
  if (selected.temperature && !thinking) payload.temperature = temperature;
  if (web) payload.tools = [{type: 'openrouter:web_search', parameters: {max_results: 5}}];
  // PDF: leitura nativa quando o modelo aceita arquivos; senão, o conversor gratuito do OpenRouter.
  if (!selected.files && adapted.some(m => Array.isArray(m.content) && m.content.some(p => p.type === 'file'))) payload.plugins = [{id: 'file-parser', pdf: {engine: 'cloudflare-ai'}}];
  const timeout = AbortSignal.timeout(300000), combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response;
  try {
    response = await fetch(routerBase() + '/chat/completions', {
      method: 'POST', redirect: 'error', signal: combined,
      headers: {'Content-Type': 'application/json', ...headers()}, body: JSON.stringify(payload)
    });
  } catch { throw new Error('Não foi possível conectar ao provedor. Verifique o serviço e tente novamente.'); }
  if (!response.ok) { await response.body?.cancel(); throw Object.assign(new Error(providerError(response.status)), {status: response.status}); }
  let completed = false, emitted = false, finish = null;
  const sources = new Map();
  try {
    for await (const line of responseLines(response.body, combined)) {
      if (!line || !line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') { completed = true; break; }
      const event = JSON.parse(data);
      const choice = event.choices?.[0];
      if (event.error || choice?.finish_reason === 'error') throw new Error('Falha na geração.');
      for (const c of citations([...(choice?.delta?.annotations || []), ...(choice?.message?.annotations || []), ...(event.annotations || [])])) if (!sources.has(c.url) && sources.size < 10) sources.set(c.url, c);
      const thought = reasoningText(choice?.delta);
      if (thought) yield {type: 'reasoning', value: thought};
      const chunk = choice?.delta?.content;
      if (typeof chunk === 'string' && chunk) { emitted = true; yield {type: 'text', value: chunk}; }
      if (choice?.finish_reason) finish = choice.finish_reason;
    }
  } catch { throw new Error('O provedor encerrou a resposta antes do fim.'); }
  if (!emitted && finish === 'length') throw new Error('O raciocínio usou todo o espaço da resposta. Escolha um esforço menor ou respostas mais longas nas configurações.');
  if (!completed || !emitted) throw new Error('O provedor encerrou o fluxo sem uma resposta completa.');
  if (sources.size) yield {type: 'sources', value: [...sources.values()]};
  yield {type: 'finish', value: finish};
}

// Geração de imagem pelo endpoint de chat do OpenRouter (modalities). As imagens voltam
// como data URLs em message.images. Sem streaming: a imagem chega inteira no fim.
const generatedRule = /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/;
// Imagens: Image API do OpenRouter (POST /images, resposta em b64_json). Se o modelo não estiver
// nessa API (404/405), cai para o chat com modalities, que devolve message.images.
const imageMime = /^image\/(png|jpeg|webp|gif)$/;
function imageRequest(url, body, signal) {
  const timeout = AbortSignal.timeout(240000);
  return fetch(url, {method: 'POST', redirect: 'error', signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    headers: {'Content-Type': 'application/json', ...headers()}, body: JSON.stringify(body)})
    .catch(() => { throw new Error(signal?.aborted ? 'Geração interrompida.' : 'Não foi possível conectar ao provedor. Verifique o serviço e tente novamente.'); });
}
async function readJson(response) {
  try { return await response.json(); } catch { throw new Error('O provedor devolveu uma resposta inválida.'); }
}
export async function generateImage({route, model, prompt = '', references = [], messages, aspect = '1:1', signal}) {
  const selected = await findRoute(route || model);
  if (!selected) throw new Error('Selecione um modelo disponível. Confira os provedores nas configurações.');
  const refs = selected.vision ? references.filter(u => typeof u === 'string' && u.length <= 8000000 && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(u)).slice(0, 4) : [];
  const text = String(prompt).trim().slice(0, 8000);
  if (!text && !refs.length) throw new Error('Descreva a imagem que você quer criar.');
  let response = await imageRequest(routerBase() + '/images', {model: selected.apiId, prompt: text || 'Recrie esta imagem.', n: 1, aspect_ratio: aspect,
    ...(refs.length ? {input_references: refs.map(url => ({type: 'image_url', image_url: {url}}))} : {})}, signal);
  if (response.ok) {
    const data = await readJson(response);
    const images = (Array.isArray(data?.data) ? data.data : []).map(x => {
      const type = imageMime.test(x?.media_type || '') ? x.media_type : 'image/png';
      return typeof x?.b64_json === 'string' && /^[A-Za-z0-9+/]+=*$/.test(x.b64_json) ? 'data:' + type + ';base64,' + x.b64_json : null;
    }).filter(u => u && u.length <= 12000000).slice(0, 4);
    if (!images.length) throw new Error('O modelo não devolveu nenhuma imagem. Tente descrever de outro jeito.');
    return {images, text: ''};
  }
  if (![404, 405].includes(response.status)) { await response.body?.cancel(); throw Object.assign(new Error(providerError(response.status)), {status: response.status}); }
  await response.body?.cancel();
  // Rota sem Image API: chat com modalities, com o histórico e as instruções do perfil.
  const chat = messages?.length ? messages : [{role: 'user', content: text, images: refs}];
  response = await imageRequest(routerBase() + '/chat/completions', {model: selected.apiId, messages: adaptMessages(chat, selected.vision), stream: false,
    modalities: selected.textOutput ? ['image', 'text'] : ['image'], image_config: {aspect_ratio: aspect}}, signal);
  if (!response.ok) { await response.body?.cancel(); throw Object.assign(new Error(providerError(response.status)), {status: response.status}); }
  const msg = (await readJson(response))?.choices?.[0]?.message || {};
  const images = (Array.isArray(msg.images) ? msg.images : []).map(x => x?.image_url?.url || x?.url).filter(u => typeof u === 'string' && u.length <= 12000000 && generatedRule.test(u)).slice(0, 4);
  const said = typeof msg.content === 'string' ? msg.content : Array.isArray(msg.content) ? msg.content.map(p => typeof p?.text === 'string' ? p.text : '').join('') : '';
  if (!images.length) throw new Error(said.trim() ? 'O modelo respondeu sem imagem: ' + said.trim().slice(0, 240) : 'O modelo não devolveu nenhuma imagem. Tente descrever de outro jeito.');
  return {images, text: said.trim()};
}

// Chamada mínima usada antes de liberar uma rota nova do catálogo.
export async function ping(route) {
  const started = Date.now();
  const body = {model: route.apiId, stream: false, max_tokens: 16, messages: [{role: 'user', content: 'Responda apenas: ok'}]};
  try {
    const data = await json(routerBase() + '/chat/completions', {
      method: 'POST', timeout: 30000, headers: {'Content-Type': 'application/json', ...headers()}, body: JSON.stringify(body)
    });
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string') return {ok: false, retry: true, detail: 'Resposta sem texto.'};
    return {ok: true, detail: 'Chamada mínima respondida em ' + (Date.now() - started) + ' ms.'};
  } catch (error) {
    // 429, 402 (sem créditos) e falhas de rede são temporárias: a rota continua pendente e é verificada de novo.
    const temporary = !error.status || error.status === 429 || error.status === 402 || error.status >= 500;
    return {ok: false, retry: temporary, status: error.status || null, detail: error.message};
  }
}
