# Configuração dos provedores

## Catálogo do Jack AI

O arquivo `models.config.mjs` é a fonte única do seletor do chat e da Biblioteca. A política do catálogo é: **só modelos pagos lançados a partir de 1º de janeiro de 2026**. Nenhuma variante gratuita (`:free`, `openrouter/free`), endpoint de avaliação ou modelo local é listado. O teste `tests/catalog.mjs` confere essa regra a cada execução. O arquivo define:

- **Perfis Jack AI** (`jack/flash`, `jack/pro`, `jack/studio`, `jack/code`), com instruções, rotas candidatas em ordem de preferência, controles e regras de acesso. O servidor resolve a rota real a cada pedido e a informa no primeiro evento do streaming. O token especial `largest:*` escolhe a rota disponível com maior contexto. O ID antigo `jack/free` continua aceito e passa a usar o Jack AI Flash (`aliases` em `models.config.mjs`).
- **Rotas por fornecedor**: OpenAI, Anthropic, Google, xAI, Mistral AI, DeepSeek, Qwen (Alibaba) e Moonshot AI, conferidas na documentação em `CATALOG_CHECKED`. Cada rota guarda nome público, fornecedor, estágio (estável ou prévia), data de lançamento e links oficiais. Contexto, formatos de entrada e preço vêm do endpoint de listagem da conta.

Uma rota do catálogo só fica disponível quando:

1. aparece em `GET /api/v1/models/user` para a chave do operador, com preço diferente de zero;
2. responde a uma chamada mínima (`max_tokens` 16, pergunta fixa). O servidor faz uma verificação por vez, com intervalo, e grava o resultado na tabela `route_checks`. Falhas temporárias (402 sem créditos, 429, rede, 5xx) voltam a ser tentadas depois de 10 minutos. Verificações aprovadas valem por 7 dias, e cada resposta real bem-sucedida também conta como verificação.

Como todas as rotas são pagas, cada chamada mínima é cobrada. Com os 20 modelos atuais, a verificação semanal custa poucos centavos de dólar no total. Para conferir à mão: `node --env-file-if-exists=.env scripts/check-provider.mjs --catalog`.

| Variável | Efeito |
| --- | --- |
| `OPENROUTER_API_KEY` | Chave do OpenRouter com créditos. Obrigatória para gerar respostas. |
| `JACK_PRO_ROUTES` | Lista de rotas do Jack AI Pro, separadas por vírgula, em ordem de preferência. |
| `JACK_PRO_ACCESS` | `account` (padrão) exige conta para o Pro. `guest` libera para visitantes. |
| `JACK_DISABLED_MODELS` | IDs a esconder do seletor e da Biblioteca sem editar telas. |
| `JACK_ROUTE_CHECKS` | `off` desliga a chamada mínima automática. As rotas listadas pela conta ficam disponíveis sem ela. |

A variável `JACK_ALLOW_PAID_ROUTES` deixou de existir: sem rotas gratuitas, ela não tem mais função. Para controlar o gasto, defina um limite de gastos na própria chave do OpenRouter.

Conversas antigas guardam um retrato da rota usada em cada resposta e continuam legíveis quando um modelo sai do catálogo, inclusive respostas geradas por rotas gratuitas de versões anteriores.

O servidor consulta o catálogo ao abrir a seleção de modelos. O resultado fica em cache por 15 segundos. Cada requisição de geração valida o identificador contra esse catálogo. As conversas seguem para o provedor escolhido, incluindo o histórico, as instruções e os anexos utilizados naquele envio.

## OpenRouter

1. Crie uma chave em [OpenRouter Keys](https://openrouter.ai/settings/keys) e adicione créditos à conta. Se quiser um teto, defina um limite de gastos na chave.
2. Configure `OPENROUTER_API_KEY` no ambiente do processo servidor. Reinicie a aplicação.
3. Abra o seletor. A aplicação consulta `GET /api/v1/key` e `GET /api/v1/models/user` com a chave do operador. Ela usa só as rotas pagas do catálogo que a conta lista. Variantes gratuitas e modelos fora do catálogo são ignorados.
4. Selecione um modelo e envie uma pergunta. O servidor usa `POST /api/v1/chat/completions` em streaming SSE. Uma resposta recebida confirma que aquela rota conseguiu executar o pedido.

A lista leva em conta as preferências e restrições da conta. Capacidade do provedor, saldo, filas e políticas podem impedir a geração mesmo com um modelo listado. O saldo é compartilhado por todos que usam a chave configurada. A visão depende de `input_modalities` incluir `image`. A temperatura é enviada somente quando o modelo declara suporte.

- [Catálogo e preferências de modelos](https://openrouter.ai/docs/client-sdks/typescript/api-reference/models/models)
- [Chave, limites e créditos](https://openrouter.ai/docs/api-reference/limits)
- [Streaming](https://openrouter.ai/docs/api-reference/streaming)

## Nível de esforço, pesquisa na web e PDFs

- **Nível de esforço** (botão “Esforço” ao lado do modelo): Automático, Baixo, Médio ou Alto. O servidor envia `reasoning: {effort}` só para rotas que declaram `reasoning` em `supported_parameters`; nas outras, a escolha é ignorada e o botão avisa. Como o OpenRouter conta raciocínio e resposta no mesmo `max_tokens`, o servidor soma um espaço extra ao tamanho escolhido em Configurações: 2.048 (baixo), 6.144 (médio) ou 16.384 (alto). Com raciocínio ligado, a temperatura não é enviada. O raciocínio que o modelo expõe (`delta.reasoning` ou `reasoning_details`) aparece recolhido em “Ver raciocínio” e fica salvo com a resposta.
- **Pesquisa na web** (botão “Web”): envia a ferramenta de servidor `openrouter:web_search` com até 5 resultados. O modelo decide quando buscar. As citações `url_citation` viram a lista “Fontes” sob a resposta (só links `http` e `https`). Cada busca é cobrada à parte pelo OpenRouter. O formato das anotações no streaming não está documentado em detalhe; o servidor aceita as variantes conhecidas.
- **PDF** (até 2 MB, um por mensagem): vai como parte `file` da mensagem. Modelos com leitura nativa de arquivos recebem o PDF direto. Para os outros, o servidor pede o conversor gratuito do OpenRouter (`file-parser` com `cloudflare-ai`). O PDF fica salvo na conversa e é reenviado nas mensagens seguintes, como o restante do histórico.
- **Resposta cortada**: quando o provedor encerra com `finish_reason: length`, a resposta mostra “Continuar resposta”.

## Imagens e figurinhas (Jack AI Imagem)

- **Perfil** `jack/image` (exige conta; `JACK_IMAGE_ACCESS=guest` libera visitantes). Ordem das rotas: Nano Banana 2.1 (`google/gemini-nano-banana-2.1`), GPT Image 2 (`openai/gpt-image-2`), Nano Banana Pro (`google/gemini-3-pro-image`), Nano Banana 2 (`google/gemini-3.1-flash-image`) e Nano Banana 2 Lite (`google/gemini-3.1-flash-lite-image`). Modelos de imagem nunca entram nos perfis de texto nem na escolha automática do Pro.
- **Chamada**: Image API do OpenRouter, `POST /api/v1/images` com `prompt`, `n: 1`, `aspect_ratio` e, para editar, `input_references` (a foto enviada ou a última imagem da conversa). A imagem volta em `data[].b64_json`. Se a rota responder 404/405 nessa API, o servidor usa o chat com `modalities` e lê `message.images`.
- **Controles**: Estilo (figurinha com fundo liso, ilustração, foto realista, ícone, logotipo, pixel art) vira uma instrução no começo do pedido; Proporção vai em `aspect_ratio` (1:1, 16:9, 9:16, 4:3, 3:4).
- **Sem chamada mínima**: rotas de imagem não passam pelo teste de 16 tokens (uma imagem custa bem mais que isso). Basta aparecer na listagem da chave. Se uma rota falhar, o erro aparece na conversa.
- **Armazenamento**: cada imagem fica na tabela `media` (migração `004.sql`) e é servida em `/api/media/<id>` só para a dona da conversa. O JSON da conversa guarda apenas o endereço. Excluir a conversa apaga as imagens. No chat temporário a imagem fica só na aba.
- **Figurinha**: o visualizador converte qualquer imagem em WebP 512 × 512 (até 100 KB, com margem) e remove o fundo quando ele é liso e ocupa os cantos. Tudo acontece no navegador.
- **Custo**: a saída de imagem é cobrada à parte pelo OpenRouter, por imagem gerada. Defina um limite de gastos na chave.

## Integrações removidas

- **Ollama (modelos locais)**: saiu nesta versão, porque os modelos locais são gratuitos e fora do recorte de 2026. `OLLAMA_BASE_URL` e `JACK_DISABLE_OLLAMA` não têm mais efeito e podem ser apagadas do `.env`.
- **NVIDIA (build.nvidia.com)**: o único modelo da NVIDIA no catálogo era o DeepSeek V4.1 Flash no endpoint gratuito de avaliação. O mesmo modelo segue disponível, pago, pelo OpenRouter (`deepseek/deepseek-v4.1-flash-1017`). `NVIDIA_API_KEY` e `NVIDIA_BASE_URL` não têm mais efeito.

## Diagnóstico

| Estado | Como verificar |
| --- | --- |
| Configure OPENROUTER_API_KEY | Preencha a variável no servidor e reinicie o processo. |
| Credencial inválida ou acesso bloqueado | Verifique a validade da chave e as regras da conta no painel do provedor. |
| Sem créditos (402) | Adicione créditos no OpenRouter ou aumente o limite de gastos da chave. As rotas voltam a ser verificadas em 10 minutos. |
| Limite de requisições (429) | Aguarde alguns instantes e tente novamente, ou escolha outro modelo. |
| “Esta conta do OpenRouter não lista esta rota” | O modelo não aparece para a sua chave (preferências, região ou política). Confira em openrouter.ai/settings. |
| Falha durante a resposta | Uma interrupção pode deixar uma resposta parcial. Tente novamente após verificar a conexão. |
| Imagem rejeitada | Use um modelo com visão e uma imagem PNG, JPEG ou WebP dentro dos limites da aplicação. |

Hugging Face não está integrado nesta versão. O aplicativo não contém chaves, pesos de modelos ou inferência simulada.

## Verificação de inferência após configurar

Rode `node --env-file-if-exists=.env scripts/check-provider.mjs` para listar os IDs descobertos. Em seguida, passe um deles como argumento, por exemplo:

```sh
node --env-file-if-exists=.env scripts/check-provider.mjs openrouter/anthropic/claude-haiku-5.5
```

O teste envia uma única pergunta fixa (até 128 tokens de resposta, cobrados) e imprime os fragmentos recebidos. Saída 0 indica que o fluxo do provedor terminou com texto. Saída 1 indica falha de inferência e saída 2 indica ausência de seleção acessível.
