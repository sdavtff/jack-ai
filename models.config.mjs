// Fonte única do catálogo do Jack AI. O servidor usa este arquivo para montar
// GET /api/models, que alimenta o seletor do chat e a Biblioteca de modelos.
// Para desativar um modelo sem editar telas, use enabled:false aqui ou
// JACK_DISABLED_MODELS=id1,id2 no ambiente. Conversas antigas guardam um
// retrato da rota usada e continuam legíveis quando um modelo sai do catálogo.
//
// Política do catálogo: só modelos pagos lançados a partir de 2026. Nenhuma
// variante gratuita (":free", "openrouter/free"), endpoint de avaliação ou modelo
// local é listado. tests/catalog.mjs confere essa regra a cada execução.

export const CATALOG_CHECKED = '2026-11-09';
export const RELEASED_FROM = '2026-01-01';

// Ordem das seções no seletor e na Biblioteca. Fornecedores ausentes daqui
// aparecem depois, em ordem alfabética.
export const vendorOrder = ['Jack AI', 'OpenAI', 'Anthropic', 'Google', 'xAI', 'Mistral AI', 'DeepSeek', 'Qwen (Alibaba)', 'Moonshot AI'];

// Prefixo do identificador no OpenRouter -> desenvolvedor do modelo.
export const vendorNames = {
  openai: 'OpenAI', anthropic: 'Anthropic', google: 'Google', 'x-ai': 'xAI', mistralai: 'Mistral AI',
  deepseek: 'DeepSeek', qwen: 'Qwen (Alibaba)', moonshotai: 'Moonshot AI'
};

const official = {
  openrouterModels: 'https://openrouter.ai/docs/guides/overview/models',
  openrouterKey: 'https://openrouter.ai/docs/api-reference/limits'
};

// IDs antigos de perfis que mudaram de nome. Conversas e preferências salvas com
// o ID antigo passam a usar o perfil novo.
export const aliases = {'jack/free': 'jack/flash'};

// Perfis da marca. `routes` lista candidatos em ordem de preferência.
// Token especial: largest:* (rota disponível com maior contexto).
const proRoutes = (process.env.JACK_PRO_ROUTES || '').split(',').map(s => s.trim()).filter(Boolean);

export const profiles = [
  {
    id: 'jack/flash', name: 'Jack AI Flash', when: 'Perguntas do dia a dia, resumos e revisões rápidas',
    description: 'Respostas rápidas para o dia a dia em modelos pagos rápidos e econômicos.',
    tasks: ['conversa', 'escrita'], access: 'guest',
    routes: ['openrouter/anthropic/claude-haiku-5.5', 'openrouter/google/gemini-3.8-flash', 'openrouter/openai/gpt-6-luna', 'openrouter/qwen/qwen3.8-flash', 'openrouter/deepseek/deepseek-v4.1-flash-1017'],
    instructions: 'Você é o Jack AI Flash. Responda em português do Brasil, de forma clara e objetiva. Prefira respostas curtas, com listas apenas quando ajudarem a leitura.'
  },
  {
    id: 'jack/pro', name: 'Jack AI Pro', when: 'Análise de documentos, planejamento e problemas com várias etapas',
    description: 'Usa a rota de maior capacidade configurada para o perfil. Requer conta conectada.',
    tasks: ['analise', 'escrita', 'codigo'], access: process.env.JACK_PRO_ACCESS === 'guest' ? 'guest' : 'account',
    routes: proRoutes.length ? proRoutes : ['openrouter/anthropic/claude-fable-5.1', 'openrouter/anthropic/claude-opus-5.5', 'openrouter/openai/gpt-6-astra-pro', 'openrouter/openai/gpt-6-astra', 'openrouter/google/gemini-4-argon', 'openrouter/openai/gpt-6.1-sol', 'largest:*'],
    instructions: 'Você é o Jack AI Pro. Responda em português do Brasil. Para problemas com várias etapas, explicite premissas, organize o raciocínio em passos numerados e termine com uma recomendação e os próximos passos. Ao analisar documentos, cite as partes relevantes do texto fornecido.'
  },
  {
    id: 'jack/studio', name: 'Jack AI Studio', when: 'Briefings, roteiros, campanhas e variações de conteúdo',
    description: 'Criação de conteúdo com controles de público, formato e tom.',
    tasks: ['conteudo', 'escrita'], access: 'guest',
    routes: ['openrouter/anthropic/claude-sonnet-5.5', 'openrouter/openai/gpt-6.1-terra', 'openrouter/google/gemini-3.8-flash', 'openrouter/mistralai/mistral-small-2603', 'openrouter/anthropic/claude-haiku-5.5'],
    controls: [
      {id: 'audience', label: 'Público', options: ['Geral', 'Clientes', 'Equipe interna', 'Investidores', 'Público jovem', 'Especialistas']},
      {id: 'format', label: 'Formato', options: ['Briefing', 'Roteiro', 'Campanha', 'Post para redes sociais', 'E-mail', 'Variações A/B']},
      {id: 'tone', label: 'Tom', options: ['Profissional', 'Descontraído', 'Inspirador', 'Direto', 'Formal', 'Bem-humorado']}
    ],
    // Nenhum adaptador de geração de imagem, áudio ou vídeo está integrado nesta versão.
    media: {enabled: false, reason: 'Nenhuma integração de geração de mídia está configurada nesta instalação.'},
    instructions: 'Você é o Jack AI Studio, especialista em conteúdo e comunicação. Responda em português do Brasil. Respeite o público, o formato e o tom indicados. Entregue o material pronto para uso e, quando fizer sentido, ofereça duas ou três variações curtas.'
  },
  {
    id: 'jack/code', name: 'Jack AI Code', when: 'Implementação, depuração e revisão de código',
    description: 'Foco em código: informe linguagem, comportamento esperado e erro observado.',
    tasks: ['codigo'], access: 'guest',
    routes: ['openrouter/anthropic/claude-sonnet-5.5', 'openrouter/openai/gpt-6.1-sol', 'openrouter/x-ai/grok-4.7', 'openrouter/moonshotai/kimi-k3', 'openrouter/deepseek/deepseek-v4-pro-0813', 'openrouter/deepseek/deepseek-v4.1-flash-1017'],
    controls: [
      {id: 'language', label: 'Linguagem', type: 'text', placeholder: 'Ex.: TypeScript, Python'},
      {id: 'expected', label: 'Comportamento esperado', type: 'text', placeholder: 'O que deveria acontecer'},
      {id: 'observed', label: 'Erro observado', type: 'text', placeholder: 'Mensagem de erro ou sintoma'}
    ],
    instructions: 'Você é o Jack AI Code. Responda em português do Brasil. Para implementação e depuração: identifique a causa provável, mostre o código corrigido em blocos com a linguagem indicada no cercamento (```linguagem), explique a mudança em poucas linhas e sugira como testar. Não invente APIs; quando faltar contexto, diga o que precisa ver.'
  }
];

// Rotas pagas conferidas nas páginas de modelo do OpenRouter e na documentação
// dos fornecedores em CATALOG_CHECKED. Cada rota só fica disponível depois de
// (1) aparecer em GET /api/v1/models/user para a chave do operador e (2) responder
// a uma chamada mínima feita pelo servidor. Dentro de cada fornecedor, a ordem
// abaixo é a ordem de exibição (mais capaz primeiro).
const or = slug => 'https://openrouter.ai/' + slug;
const anthropicDocs = 'https://platform.claude.com/docs/en/about-claude/models/overview';
export const curated = [
  // OpenAI
  {id: 'openrouter/openai/gpt-6-astra-pro', name: 'GPT-6 Astra Pro', vendor: 'OpenAI', released: '2026-09-04', stage: 'estável',
    tasks: ['analise', 'codigo', 'escrita'], description: 'O mesmo GPT-6 Astra com o modo de raciocínio pro, para respostas de maior qualidade em tarefas complexas.',
    verified: {context: 1050000, inputs: ['texto', 'imagem']}, source: or('openai/gpt-6-astra-pro'), docs: 'https://developers.openai.com/api/docs/guides/reasoning'},
  {id: 'openrouter/openai/gpt-6-astra', name: 'GPT-6 Astra', vendor: 'OpenAI', released: '2026-09-03', stage: 'estável',
    tasks: ['analise', 'codigo', 'escrita'], description: 'Modelo principal da OpenAI para trabalho completo de ponta a ponta, análise e engenharia de software.',
    verified: {context: 1050000, inputs: ['texto', 'imagem']}, source: or('openai/gpt-6-astra'), docs: 'https://developers.openai.com/api/docs/models/gpt-6-astra'},
  {id: 'openrouter/openai/gpt-6.1-sol', name: 'GPT-6.1 Sol', vendor: 'OpenAI', released: '2026-09-29', stage: 'estável',
    tasks: ['analise', 'codigo', 'escrita'], description: 'Raciocínio avançado para código, documentos longos e trabalho profissional.',
    verified: {context: 1050000, inputs: ['texto', 'imagem', 'arquivo']}, source: or('openai/gpt-6.1-sol'), docs: 'https://developers.openai.com/api/docs/models'},
  {id: 'openrouter/openai/gpt-6.1-terra', name: 'GPT-6.1 Terra', vendor: 'OpenAI', released: '2026-10-26', stage: 'estável',
    tasks: ['escrita', 'codigo', 'conteudo', 'conversa'], description: 'Modelo intermediário mais recente da OpenAI, rápido para escrita, código e leitura de telas.',
    verified: {context: 1050000, inputs: ['texto', 'imagem', 'arquivo']}, source: or('openai/gpt-6.1-terra'), docs: 'https://developers.openai.com/api/docs/models'},
  {id: 'openrouter/openai/gpt-6-luna', name: 'GPT-6 Luna', vendor: 'OpenAI', released: '2026-09-22', stage: 'estável',
    tasks: ['conversa', 'escrita'], description: 'O modelo mais econômico da série GPT-6, para tarefas rápidas e de alto volume.',
    verified: {context: 1050000, inputs: ['texto', 'imagem']}, source: or('openai/gpt-6-luna'), docs: 'https://developers.openai.com/api/docs/models'},
  // Anthropic
  {id: 'openrouter/anthropic/claude-fable-5.1', name: 'Claude Fable 5.1', vendor: 'Anthropic', released: '2026-09-01', stage: 'estável',
    tasks: ['analise', 'codigo', 'escrita'], description: 'Modelo da classe Mythos da Anthropic aberto ao público, para raciocínio exigente, agentes de longa duração e código ambicioso.',
    verified: {context: 1000000, inputs: ['texto', 'imagem', 'arquivo']}, source: or('anthropic/claude-fable-5.1'), docs: anthropicDocs},
  {id: 'openrouter/anthropic/claude-opus-5.5', name: 'Claude Opus 5.5', vendor: 'Anthropic', released: '2026-09-22', stage: 'estável',
    tasks: ['analise', 'codigo', 'escrita'], description: 'Modelo principal da família Claude 5.5 para raciocínio exigente, código e tarefas longas.',
    verified: {context: 1000000, inputs: ['texto', 'imagem', 'arquivo']}, source: or('anthropic/claude-opus-5.5'), docs: anthropicDocs},
  {id: 'openrouter/anthropic/claude-sonnet-5.5', name: 'Claude Sonnet 5.5', vendor: 'Anthropic', released: '2026-09-28', stage: 'estável',
    tasks: ['escrita', 'codigo', 'conteudo'], description: 'Equilíbrio entre qualidade e velocidade para escrita, conteúdo e código.',
    verified: {context: 1000000, inputs: ['texto', 'imagem', 'arquivo']}, source: or('anthropic/claude-sonnet-5.5'), docs: anthropicDocs},
  {id: 'openrouter/anthropic/claude-haiku-5.5', name: 'Claude Haiku 5.5', vendor: 'Anthropic', released: '2026-10-07', stage: 'estável',
    tasks: ['conversa', 'escrita', 'analise'], description: 'Modelo pequeno e rápido da Anthropic para alto volume e baixo custo: resumos, extração e subagentes.',
    verified: {context: 1000000, inputs: ['texto', 'imagem', 'arquivo']}, source: or('anthropic/claude-haiku-5.5'), docs: anthropicDocs},
  // Google
  {id: 'openrouter/google/gemini-4-argon', name: 'Gemini 4 Argon', vendor: 'Google', released: '2026-10-13', stage: 'estável',
    tasks: ['analise', 'codigo', 'escrita'], description: 'Modelo de fronteira do Google para trabalho complexo, código, documentos longos e ciência.',
    verified: {context: null, inputs: ['texto', 'imagem']}, source: or('google/gemini-4-argon'), docs: 'https://deepmind.google/models/model-cards/gemini-4-argon/'},
  {id: 'openrouter/google/gemini-3.8-flash', name: 'Gemini 3.8 Flash', vendor: 'Google', released: '2026-09-02', stage: 'estável',
    tasks: ['conversa', 'analise', 'conteudo'], description: 'O Flash mais capaz do Google: rápido, multimodal e com contexto de cerca de 1 milhão de tokens.',
    verified: {context: 1048576, inputs: ['texto', 'imagem', 'vídeo', 'áudio', 'arquivo']}, source: or('google/gemini-3.8-flash'), docs: 'https://ai.google.dev/gemini-api/docs/models'},
  // xAI
  {id: 'openrouter/x-ai/grok-4.7', name: 'Grok 4.7', vendor: 'xAI', released: '2026-09-21', stage: 'estável',
    tasks: ['codigo', 'analise', 'escrita'], description: 'Modelo principal da xAI (SpaceXAI) para código, tarefas com agentes e trabalho de conhecimento.',
    verified: {context: 500000, inputs: ['texto', 'imagem', 'arquivo']}, source: or('x-ai/grok-4.7'), docs: or('x-ai/grok-4.7')},
  // Mistral AI
  {id: 'openrouter/mistralai/mistral-large-4-0', name: 'Mistral Large 4', vendor: 'Mistral AI', released: '2026-10-06', stage: 'prévia',
    tasks: ['analise', 'codigo'], description: 'Modelo de fronteira da Mistral para raciocínio e código. Em prévia pública.',
    verified: {context: null, inputs: ['texto', 'imagem']}, source: or('mistralai/mistral-large-4-0'), docs: 'https://docs.mistral.ai/resources/changelogs'},
  {id: 'openrouter/mistralai/mistral-small-2603', name: 'Mistral Small 4', vendor: 'Mistral AI', released: '2026-03-16', stage: 'estável',
    tasks: ['conversa', 'escrita', 'codigo'], description: 'Modelo eficiente para conversa, escrita e código, com entrada de imagens.',
    verified: {context: 262144, inputs: ['texto', 'imagem']}, source: or('mistralai/mistral-small-2603'), docs: 'https://docs.mistral.ai/models'},
  // DeepSeek
  {id: 'openrouter/deepseek/deepseek-v4-pro-0813', name: 'DeepSeek V4 Pro 0813', vendor: 'DeepSeek', released: '2026-08-12', stage: 'estável',
    tasks: ['codigo', 'analise'], description: 'Versão estável do DeepSeek V4 Pro para raciocínio, código e uso de ferramentas. Aceita só texto.',
    verified: {context: 1048576, inputs: ['texto']}, source: or('deepseek/deepseek-v4-pro-0813'), docs: 'https://api-docs.deepseek.com/'},
  {id: 'openrouter/deepseek/deepseek-v4.1-flash-1017', name: 'DeepSeek V4.1 Flash 1017', vendor: 'DeepSeek', released: '2026-10-17', stage: 'estável',
    tasks: ['codigo', 'analise', 'conversa'], description: 'Versão de 17/10/2026 do V4.1 Flash, a que a DeepSeek serve hoje. Contexto longo e análise de imagens a custo baixo.',
    verified: {context: 1048576, inputs: ['texto', 'imagem']}, source: or('deepseek/deepseek-v4.1-flash-1017'), docs: 'https://deepseek.com/en/news/deepseek-v4-1-flash/'},
  {id: 'openrouter/deepseek/deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash', vendor: 'DeepSeek', released: '2026-09-10', stage: 'estável',
    tasks: ['codigo', 'analise'], description: 'Primeira versão do V4.1 Flash (10/09/2026). Para a versão atual, prefira a 1017.',
    verified: {context: 1048576, inputs: ['texto', 'imagem']}, source: or('deepseek/deepseek-v4.1-flash'), docs: 'https://api-docs.deepseek.com/'},
  // Qwen (Alibaba)
  {id: 'openrouter/qwen/qwen3.8-max-0902', name: 'Qwen3.8 Max (0902)', vendor: 'Qwen (Alibaba)', released: '2026-09-03', stage: 'estável',
    tasks: ['analise', 'codigo', 'escrita'], description: 'Versão de 02/09/2026 do Qwen3.8 Max, modelo principal da Alibaba para raciocínio, compreensão de imagens, código e agentes.',
    verified: {context: 1000000, inputs: ['texto', 'imagem']}, source: or('qwen/qwen3.8-max-0902'), docs: or('qwen/qwen3.8-max-0902')},
  {id: 'openrouter/qwen/qwen3.8-flash', name: 'Qwen3.8 Flash', vendor: 'Qwen (Alibaba)', released: '2026-08-26', stage: 'estável',
    tasks: ['conversa', 'escrita', 'analise'], description: 'Modelo rápido e econômico da série Qwen3.8, com entrada de imagens e vídeo.',
    verified: {context: 1000000, inputs: ['texto', 'imagem', 'vídeo']}, source: or('qwen/qwen3.8-flash'), docs: or('qwen/qwen3.8-flash')},
  // Moonshot AI
  {id: 'openrouter/moonshotai/kimi-k3', name: 'Kimi K3', vendor: 'Moonshot AI', released: '2026-07-16', stage: 'estável',
    tasks: ['codigo', 'analise'], description: 'Modelo de raciocínio multimodal da Moonshot AI, com 2,8 trilhões de parâmetros e foco em código e agentes.',
    verified: {context: 1048576, inputs: ['texto', 'imagem']}, source: or('moonshotai/kimi-k3'), docs: or('moonshotai/kimi-k3')}
].map(item => ({
  ...item, paid: true, apiId: item.id.slice('openrouter/'.length), host: 'OpenRouter', provider: 'OpenRouter',
  checked: CATALOG_CHECKED, enabled: item.enabled ?? true
}));

export const sources = official;
