// Exclusivo dos testes e das capturas. Imita o contrato HTTP do OpenRouter
// (/api/v1/key, /api/v1/models/user e /api/v1/chat/completions) com os IDs pagos
// conferidos em 2026-11-09. Também lista duas variantes gratuitas e um modelo fora
// do catálogo para provar que o Jack AI os ignora. Imita ainda o login do Google
// (/google/auth e /google/token), com PKCE e nonce conferidos como no Google.
// Nunca é iniciado pelos scripts dev/start e não entra no build.
import http from 'node:http';
import {createHash, randomBytes} from 'node:crypto';
import {deflateSync} from 'node:zlib';

// PNG pequeno gerado na hora: fundo branco liso e um círculo violeta (bom para testar figurinhas).
function png(w, h) {
  const crcTable = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = buf => { let c = 0xFFFFFFFF; for (const b of buf) c = crcTable[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = y * (w * 3 + 1) + 1 + x * 3, inside = (x - w / 2) ** 2 + (y - h / 2) ** 2 < (w * 0.32) ** 2;
    raw[o] = inside ? 118 : 255; raw[o + 1] = inside ? 82 : 255; raw[o + 2] = inside ? 245 : 255;
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const picture = 'data:image/png;base64,' + png(256, 256).toString('base64');

const port = Number(process.env.FIXTURE_PORT || 31262);
const failPing = new Set(String(process.env.FIXTURE_FAIL_PING || '').split(',').filter(Boolean));
const text = ['text'], vision = ['text', 'image'], files = ['text', 'image', 'file'];
const imageModel = (id, name, textToo) => ({id, name, context_length: 131072, pricing: {prompt: '0.000002', completion: '0.00003'},
  architecture: {input_modalities: ['text', 'image'], output_modalities: textToo ? ['image', 'text'] : ['image']}, supported_parameters: ['max_tokens'], top_provider: {max_completion_tokens: 32768}});
// Preços em dólares por milhão de tokens (entrada, saída); a API informa por token.
const model = (id, name, context, inputs, input = 0, output = input, reasoning = true) => ({id, name, context_length: context, pricing: {prompt: String(input / 1e6), completion: String(output / 1e6)},
  architecture: {input_modalities: inputs, output_modalities: ['text']}, supported_parameters: ['temperature', 'max_tokens', ...(reasoning ? ['reasoning', 'include_reasoning'] : [])], top_provider: {max_completion_tokens: 65536}});
const catalog = [
  model('openrouter/free', 'Free Models Router', 200000, vision),
  model('openai/gpt-oss-120b:free', 'OpenAI: gpt-oss-120b (free)', 131072, text),
  model('qwen/qwen3-coder-plus', 'Qwen: Qwen3 Coder Plus', 1000000, text, 1, 5),
  model('openai/gpt-6-astra-pro', 'OpenAI: GPT-6 Astra Pro', 1050000, vision, 10, 50),
  model('openai/gpt-6-astra', 'OpenAI: GPT-6 Astra', 1050000, vision, 10, 50),
  model('openai/gpt-6.1-sol', 'OpenAI: GPT-6.1 Sol', 1050000, files, 2, 10),
  model('openai/gpt-6.1-terra', 'OpenAI: GPT-6.1 Terra', 1050000, files, 1, 5),
  model('openai/gpt-6-luna', 'OpenAI: GPT-6 Luna', 1050000, vision, 0.1, 0.4),
  model('anthropic/claude-fable-5.1', 'Anthropic: Claude Fable 5.1', 1000000, files, 10, 50),
  model('anthropic/claude-opus-5.5', 'Anthropic: Claude Opus 5.5', 1000000, files, 4, 20),
  model('anthropic/claude-sonnet-5.5', 'Anthropic: Claude Sonnet 5.5', 1000000, files, 2, 10),
  model('anthropic/claude-haiku-5.5', 'Anthropic: Claude Haiku 5.5', 1000000, files, 0.1, 0.5),
  model('google/gemini-4-argon', 'Google: Gemini 4 Argon', 1048576, files, 2, 12),
  model('google/gemini-3.8-flash', 'Google: Gemini 3.8 Flash', 1048576, files, 0.75, 3.75),
  model('x-ai/grok-4.7', 'SpaceXAI: Grok 4.7', 500000, files, 1.6, 4.8),
  model('mistralai/mistral-small-2603', 'Mistral: Mistral Small 4', 262144, vision, 0.15, 0.6, false),
  model('mistralai/mistral-large-4-0', 'Mistral: Mistral Large 4', 524288, vision, 0.68, 2),
  model('deepseek/deepseek-v4-pro-0813', 'DeepSeek: DeepSeek V4 Pro 0813', 1048576, text, 0.435, 0.87),
  model('deepseek/deepseek-v4.1-flash-1017', 'DeepSeek: DeepSeek V4.1 Flash 1017', 1048576, vision, 0.3, 0.6),
  model('deepseek/deepseek-v4.1-flash', 'DeepSeek: DeepSeek V4.1 Flash', 1048576, vision, 0.15, 0.3),
  model('qwen/qwen3.8-max-0902', 'Qwen: Qwen3.8 Max (0902)', 1000000, vision, 2, 6),
  model('qwen/qwen3.8-flash', 'Qwen: Qwen3.8 Flash', 1000000, vision, 0.15, 0.47),
  model('moonshotai/kimi-k3', 'MoonshotAI: Kimi K3', 1048576, vision, 2, 11.2),
  imageModel('openai/gpt-image-2', 'OpenAI: GPT Image 2', false),
  imageModel('google/gemini-nano-banana-2.1', 'Google: Nano Banana 2.1', true),
  imageModel('google/gemini-3-pro-image', 'Google: Nano Banana Pro (Gemini 3 Pro Image)', true),
  imageModel('google/gemini-3.1-flash-image', 'Google: Nano Banana 2 (Gemini 3.1 Flash Image)', true),
  imageModel('google/gemini-3.1-flash-lite-image', 'Google: Nano Banana 2 Lite (Gemini 3.1 Flash Lite Image)', true)
];
const failedOnce = new Set();
const wait = ms => new Promise(r => setTimeout(r, ms));
const body = req => new Promise(resolve => { let s = ''; req.on('data', c => s += c); req.on('end', () => resolve(s ? JSON.parse(s) : {})); });

function answerFor(payload) {
  const last = payload.messages.filter(m => m.role === 'user').at(-1);
  const content = typeof last.content === 'string' ? last.content : last.content.map(p => p.text || '[imagem]').join(' ');
  const system = payload.messages.find(m => m.role === 'system')?.content || '';
  if (/\[arquivos\]/i.test(content)) return ['Pronto! O projeto tem dois arquivos em Lua.\n\n**main.lua**\n```lua\nlocal texto = require(\"utils.texto\")\nprint(texto.contar(\"O gato viu o rato\"))\n```\n\n',
    '```lua utils/texto.lua\nlocal M = {}\n\nfunction M.contar(frase)\n  local n = 0\n  for _ in frase:gmatch(\"%S+\") do n = n + 1 end\n  return n\nend\n\nreturn M\n```\n\n',
    'Para rodar:\n\n```bash\nlua main.lua\n```'];
  if (/\[svg\]/i.test(content)) return ['Aqui está a figurinha:\n\n```svg adesivo.svg\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#ffffff"/><circle cx="100" cy="100" r="70" fill="#7652f5"/><circle cx="78" cy="88" r="9" fill="#fff"/><circle cx="122" cy="88" r="9" fill="#fff"/><path d="M70 122q30 26 60 0" stroke="#fff" stroke-width="8" fill="none" stroke-linecap="round"/></svg>\n```'];
  if (/\[arquivo-longo\]/i.test(content)) return ['Segue o script.\n\n```lua contador.lua\n' + Array.from({length: 40}, (_, i) => 'print(\"linha ' + (i + 1) + '\")').join('\n') + '\n```'];
  if (/python/i.test(content) && /\[codigo\]|pares|corrig/i.test(content)) return ['Aqui está uma implementação simples. Ela percorre a lista uma vez e soma apenas os números pares.\n\n',
    '```python\ndef soma_pares(numeros: list[int]) -> int:\n    """Soma apenas os números pares da lista."""\n    total = 0\n    for n in numeros:\n        if n % 2 == 0:  # par\n            total += n\n    return total\n```\n\n',
    'Para testar, rode `soma_pares([1, 2, 3, 4])` e confira se o resultado é **6**.'];
  if (/\[codigo\]|corrig/i.test(content)) return ['Aqui está uma versão corrigida da função. O erro vinha da comparação com `==` e do acúmulo fora do laço.\n\n',
    '```javascript\nfunction somaPares(lista) {\n  let total = 0; // acumula apenas números pares\n  for (const n of lista) {\n    if (n % 2 === 0) total += n;\n  }\n  return total;\n}\n```\n\n',
    'Para testar, rode `somaPares([1, 2, 3, 4])` e confira se o resultado é **6**.'];
  const files = payload.messages.flatMap(m => Array.isArray(m.content) ? m.content.filter(p => p.type === 'file') : []);
  const parts = ['**Resposta do servidor de contrato**\n\n', 'Rota recebida: `' + payload.model + '`. ',
    'A mensagem tinha ' + content.length + ' caracteres' + (system ? ' e instruções do perfil.' : '.')];
  if (payload.reasoning) parts.push(' Esforço pedido: `' + payload.reasoning.effort + '`, max_tokens ' + payload.max_tokens + '.');
  if (payload.tools?.some(t => t.type === 'openrouter:web_search')) parts.push(' Pesquisa na web ativada.');
  if (files.length) parts.push(' PDF recebido: `' + files.map(f => f.file.filename).join(', ') + '`' + (payload.plugins ? ' (conversor ' + payload.plugins[0].pdf.engine + ').' : ' (leitura nativa).'));
  if (/\[longa\]/i.test(content)) for (let i = 1; i <= 14; i++) parts.push('\n\n' + i + '. Parágrafo de teste para verificar a rolagem de uma resposta longa e a leitura confortável do histórico.');
  return parts;
}

const googleClient = process.env.FIXTURE_GOOGLE_CLIENT || 'cliente-teste.apps.googleusercontent.com';
const codes = new Map();
const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const form = req => new Promise(resolve => { let s = ''; req.on('data', c => s += c); req.on('end', () => resolve(Object.fromEntries(new URLSearchParams(s)))); });

const imageCalls = [];
// Modelo de imagem que só funciona pelo chat (modalities): exercita a alternativa do adaptador.
const imageOnlyChat = new Set(['google/gemini-3-pro-image']);
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  // Tela de consentimento do Google: aprova na hora e devolve code e state ao redirect_uri.
  if (url.pathname === '/google/auth') {
    const q = url.searchParams;
    if (q.get('client_id') !== googleClient || q.get('response_type') !== 'code' || q.get('code_challenge_method') !== 'S256' || !/openid/.test(q.get('scope') || '')) { res.writeHead(400); return res.end('pedido inválido'); }
    if (q.get('fixture_deny')) { res.writeHead(302, {Location: q.get('redirect_uri') + '?error=access_denied&state=' + q.get('state')}); return res.end(); }
    const code = randomBytes(12).toString('hex');
    codes.set(code, {nonce: q.get('nonce'), challenge: q.get('code_challenge'), redirect: q.get('redirect_uri'), email: q.get('fixture_email') || 'pessoa.teste@example.com',
      sub: q.get('fixture_sub') || '1000000000000000001', verified: q.get('fixture_unverified') ? false : true, name: q.get('fixture_name') || 'Pessoa Teste'});
    res.writeHead(302, {Location: q.get('redirect_uri') + '?code=' + code + '&state=' + encodeURIComponent(q.get('state'))}); return res.end();
  }
  if (url.pathname === '/google/token' && req.method === 'POST') {
    const f = await form(req), rec = codes.get(f.code);
    codes.delete(f.code);
    const pkce = rec && createHash('sha256').update(f.code_verifier || '').digest('base64url') === rec.challenge;
    if (!rec || !pkce || f.client_id !== googleClient || !f.client_secret || f.redirect_uri !== rec.redirect || f.grant_type !== 'authorization_code') { res.writeHead(400, {'Content-Type': 'application/json'}); return res.end('{"error":"invalid_grant"}'); }
    const now = Math.floor(Date.now() / 1000);
    const idToken = b64({alg: 'RS256', typ: 'JWT'}) + '.' + b64({iss: 'https://accounts.google.com', aud: googleClient, sub: rec.sub, email: rec.email, email_verified: rec.verified, name: rec.name, nonce: rec.nonce, iat: now, exp: now + 3600}) + '.assinatura';
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({access_token: 'token-de-teste', expires_in: 3599, token_type: 'Bearer', scope: 'openid email profile', id_token: idToken}));
  }
  if (url.pathname === '/api/v1/key') return res.end(JSON.stringify({data: {label: 'teste', is_free_tier: false, limit: 25, limit_remaining: 18.4, usage: 6.6}}));
  if (url.pathname === '/api/v1/models/user') return res.end(JSON.stringify({data: catalog}));
  // Image API do OpenRouter: POST /images devolve b64_json. Os pedidos ficam em /__images para os testes.
  if (url.pathname === '/__images') return res.end(JSON.stringify(imageCalls));
  if (url.pathname === '/api/v1/images' && req.method === 'POST') {
    const payload = await body(req);
    res.setHeader('Content-Type', 'application/json');
    if (!imageOnlyChat.has(payload.model) && catalog.some(m => m.id === payload.model && m.architecture?.output_modalities?.includes('image'))) {
      imageCalls.push({model: payload.model, prompt: payload.prompt, aspect_ratio: payload.aspect_ratio, n: payload.n, references: (payload.input_references || []).length});
      if (/\[semimagem\]/i.test(payload.prompt)) return res.end(JSON.stringify({created: Date.now(), data: []}));
      await wait(/\[lento\]/i.test(payload.prompt) ? 1500 : 120);
      return res.end(JSON.stringify({created: Math.floor(Date.now() / 1000), data: [{b64_json: picture.split(',')[1], media_type: 'image/png'}], usage: {cost: 0.04}}));
    }
    res.writeHead(404); return res.end('{"error":{"message":"Model not available on the Image API"}}');
  }
  if (url.pathname !== '/api/v1/chat/completions' || req.method !== 'POST') { res.writeHead(404); return res.end(); }
  const payload = await body(req);
  // Geração de imagem (modalities): resposta inteira, com a imagem em message.images.
  if (payload.modalities?.includes('image')) {
    const lastUser = payload.messages.filter(m => m.role === 'user').at(-1);
    const parts = Array.isArray(lastUser.content) ? lastUser.content : [{type: 'text', text: lastUser.content}];
    const prompt = parts.filter(p => p.type === 'text').map(p => p.text).join(' '), refs = parts.filter(p => p.type === 'image_url').length;
    res.setHeader('Content-Type', 'application/json');
    if (/\[semimagem\]/i.test(prompt)) return res.end(JSON.stringify({choices: [{message: {role: 'assistant', content: 'Não consegui criar essa imagem.'}}]}));
    await wait(/\[lento\]/i.test(prompt) ? 1500 : 120);
    const note = 'Imagem criada por `' + payload.model + '` em ' + (payload.image_config?.aspect_ratio || 'padrão') + (refs ? ', com ' + refs + ' imagem de referência' : '') + (/figurinha/i.test(prompt) ? ', estilo figurinha' : '') + '.';
    return res.end(JSON.stringify({choices: [{message: {role: 'assistant', content: payload.modalities.includes('text') ? note : null, images: [{type: 'image_url', image_url: {url: picture}}]}}]}));
  }
  if (!payload.stream) {
    if (failPing.has(payload.model)) { res.writeHead(404, {'Content-Type': 'application/json'}); return res.end('{"error":{"message":"not found"}}'); }
    return res.end(JSON.stringify({choices: [{message: {role: 'assistant', content: 'ok'}}]}));
  }
  const last = payload.messages.filter(m => m.role === 'user').at(-1);
  const content = typeof last.content === 'string' ? last.content : last.content.map(p => p.text || '').join(' ');
  if (/\[recusar\]/i.test(content)) { res.writeHead(429, {'Content-Type': 'application/json'}); return res.end('{"error":{"message":"rate limited"}}'); }
  res.setHeader('Content-Type', 'text/event-stream');
  if (payload.reasoning) for (const r of ['Entendendo o pedido e o contexto. ', 'Conferindo os passos antes de responder.']) { res.write('data: ' + JSON.stringify({choices: [{delta: {reasoning: r}}]}) + '\n\n'); await wait(60); }
  if (/\[pensamento-longo\]/i.test(content)) { res.write('data: ' + JSON.stringify({choices: [{delta: {}, finish_reason: 'length'}]}) + '\n\n'); return res.end('data: [DONE]\n\n'); }
  const slow = /\[lento\]/i.test(content);
  const chunks = slow ? Array.from({length: 60}, (_, i) => 'Trecho ' + (i + 1) + ' da resposta lenta. ') : answerFor(payload);
  for (const [i, chunk] of chunks.entries()) {
    if (res.destroyed) return;
    // [falha] falha só na primeira vez (falha transitória); [falhasempre] falha sempre.
    if (i === 2 && (/\[falhasempre\]/i.test(content) || (/\[falha\]/i.test(content) && !failedOnce.has(content)))) { failedOnce.add(content); res.write('data: {"error":{"message":"upstream"}}\n\n'); return res.end(); }
    res.write('data: ' + JSON.stringify({choices: [{delta: {content: chunk}}]}) + '\n\n');
    await wait(slow ? 150 : 90);
  }
  if (payload.tools?.some(t => t.type === 'openrouter:web_search')) res.write('data: ' + JSON.stringify({choices: [{delta: {annotations: [
    {type: 'url_citation', url_citation: {url: 'https://example.com/noticia-de-teste', title: 'Notícia de teste', content: 'Trecho'}},
    {type: 'url_citation', url: 'https://example.org/referencia', title: 'Referência de teste'},
    {type: 'url_citation', url_citation: {url: 'javascript:alert(1)', title: 'Ignorada'}}]}}]}) + '\n\n');
  res.write('data: ' + JSON.stringify({choices: [{delta: {}, finish_reason: /\[truncar\]/i.test(content) ? 'length' : 'stop'}]}) + '\n\n');
  res.end('data: [DONE]\n\n');
}).listen(port, '127.0.0.1');
