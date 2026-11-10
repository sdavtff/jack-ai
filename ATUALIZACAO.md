# Atualização do Jack AI para Discloud · redesign de novembro de 2026

## Como aplicar

1. Faça um backup da aplicação e da pasta `data/` no painel da Discloud.
2. Atualize os arquivos da instância existente **preservando `.env` e `data/`**. O ZIP traz apenas `.env.example` e nenhum banco.
3. Confira o `.env`:
   - `OPENROUTER_API_KEY` precisa ser de uma conta **com créditos**. Todos os modelos do catálogo agora são pagos. Se quiser um teto, defina um limite de gastos na própria chave do OpenRouter.
   - Pode apagar `JACK_ALLOW_PAID_ROUTES`, `NVIDIA_API_KEY`, `NVIDIA_BASE_URL`, `OLLAMA_BASE_URL` e `JACK_DISABLE_OLLAMA`. Elas não têm mais efeito.
   - Continuam valendo: `JACK_PRO_ACCESS=account`, `JACK_PRO_ROUTES=`, `JACK_DISABLED_MODELS=` e `JACK_ROUTE_CHECKS=on`.
   - Opcional, para o login com Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `PUBLIC_URL`. Passo a passo em [GOOGLE_LOGIN.md](GOOGLE_LOGIN.md).
4. Reinicie a aplicação. Na primeira inicialização de quem vem de uma versão anterior ao redesign, o servidor aplica `migrations/002.sql` (tabela `route_checks`) e adiciona a coluna `archived` à tabela de conversas. Nesta revisão, ele também adiciona a coluna `google_sub` à tabela de usuários e aplica `migrations/003.sql`. As conversas existentes continuam intactas.
5. Abra a Biblioteca de modelos. As rotas novas do catálogo aparecem como “Verificando rota” até a chamada mínima automática terminar, uma por vez, a cada poucos segundos. Cada chamada mínima é cobrada (até 16 tokens de saída).

## O que muda nesta revisão (imagens, visualizador e tutorial)

- **Jack AI Imagem** (`jack/image`): cria e edita imagens e figurinhas com Nano Banana 2.1, GPT Image 2, Nano Banana Pro, Nano Banana 2 e Nano Banana 2 Lite, nessa ordem. Exige conta por padrão; para liberar visitantes, use `JACK_IMAGE_ACCESS=guest` no `.env`. Cada imagem é cobrada pelo OpenRouter.
- **Visualizador**: imagens geradas, fotos anexadas e figurinhas em SVG abrem no próprio site, com Tamanho real, Baixar e **Figurinha** (WebP 512 × 512 com o fundo liso removido). Arquivos de código abrem no mesmo visualizador, com uma aba por arquivo.
- **Arquivos no chat**: o código deixou de aparecer solto na resposta. Cada arquivo vira um cartão; 1 arquivo chega como arquivo, 2 ou mais chegam num único **.zip**.
- **Tutorial guiado**: abre sozinho no primeiro acesso de cada conta e passa por todas as ferramentas. Fica marcado na conta (não abre de novo em outro aparelho). Configurações › “Ver tutorial guiado” mostra de novo.
- **Interromper mais confiável**: o botão agora também avisa o servidor (`POST /api/stop`), que encerra a geração e grava o trecho recebido mesmo quando um proxy segura a conexão aberta. Antes, a conversa podia ficar presa em “Aguarde a resposta em andamento”.
- **Só modelos disponíveis**: o seletor e a Biblioteca mostram apenas o que funciona agora com a sua chave. Modelos sem rota, que falharam na verificação ou desativados somem da lista (o filtro “Só disponíveis” saiu). Perfis que só pedem login, como o Jack AI Pro para visitantes, continuam com “Entre na conta”. Se o modelo salvo parar de funcionar, o Jack AI troca sozinho para um disponível.
- **Banco**: na primeira inicialização o servidor aplica `migrations/004.sql` (tabela `media` para as imagens geradas). Conversas existentes continuam intactas.

## O que muda na revisão anterior (catálogo pago de 2026)

- Saíram todas as rotas gratuitas: `openrouter/free`, as variantes `:free` (DeepSeek V4.1 Flash 1017 gratuito, gpt-oss-120b, Nemotron 3 Ultra, Gemma 4 26B, North Mini Code), o DeepSeek V4.1 Flash no endpoint de avaliação da NVIDIA e os modelos locais do Ollama.
- Entraram, todos pagos e lançados em 2026: Claude Fable 5.1, Claude Haiku 5.5, GPT-6 Astra Pro, Grok 4.7, DeepSeek V4 Pro 0813, Qwen3.8 Max (0902), Qwen3.8 Flash e Kimi K3. Continuam os modelos pagos que já estavam no catálogo.
- O **Jack AI Free** virou **Jack AI Flash** (`jack/flash`), que usa os modelos pagos de menor custo. Conversas, favoritos e preferências salvos com `jack/free` passam a usar o Flash automaticamente.

## O que muda na revisão anterior (arquivos e .zip)

- Código das respostas aparece como arquivo com nome, “Baixar” e “Copiar”, e cada resposta com código ganha **Arquivos gerados → Baixar .zip**.
- O Jack AI Code sempre usa o tamanho máximo de resposta, e “Continuar resposta” junta as partes no mesmo .zip.
- Login com Google: o servidor usa o endereço em que o site foi aberto. Se o site abre em `jackai.discloud.dev`, cadastre `https://jackai.discloud.dev/api/auth/google/callback` no Google e use `PUBLIC_URL=https://jackai.discloud.dev` (ou deixe `PUBLIC_URL` vazio).

## O que muda na revisão anterior (recursos novos)

- **Login com Google** (opcional, depois de configurar o cliente OAuth) e **Conectar conta Google** em Configurações.
- **Nível de esforço** ao lado do modelo (Automático, Baixo, Médio, Alto), com o raciocínio do modelo em “Ver raciocínio”.
- **Pesquisa na web** com lista de fontes, **PDF** como anexo, **“Continuar resposta”** quando a resposta é cortada.
- **Ditar** a mensagem (no computador) e **Ouvir** as respostas em voz alta.
- **Atalhos de teclado** (tecla `?`), **Baixar meus dados**, **Excluir todas as conversas** e **Sair de todos os dispositivos**.
- Instalação como aplicativo (manifesto e ícones) no celular e no computador.
- A interface não mostra mais tokens nem valores em US$: sem preço por modelo, sem contagem de contexto e sem saldo. Em Configurações, “Limite de tokens” virou “Tamanho das respostas” e “Temperatura” virou “Criatividade”.

## O que muda para quem usa

- Início com o campo de mensagem no centro, três sugestões e o Estúdio em segundo plano.
- Perfis Jack AI Flash, Pro, Studio e Code, além dos modelos separados por fornecedor no seletor e na Biblioteca.
- Arquivar conversas, busca com trecho encontrado, rascunho por conversa que continua lá depois de recarregar, versões de resposta e proteção contra mensagens duplicadas.
- Chat temporário visível ao lado do campo, sem nada salvo no servidor nem no navegador.
- Estúdio com Medidas, Dados (CSV) e Texto e código, e “Usar na conversa” com prévia editável.

## Compatibilidade

- `GET /api/models` devolve um objeto `{checked, providers, signedIn, aliases, limits, models}`. A API ainda informa `price` e `limits` para integrações, mas a interface não os exibe. Cada modelo traz `capabilities.reasoning`.
- `POST /api/generate` aceita `effort` (`low`, `medium`, `high`) e `web: true`, e transmite eventos `reasoning`, `sources` e `truncated`. Arquivos aceitam PDF como `{name, size, data}`.
- Rotas novas: `GET /api/auth/google/start`, `GET /api/auth/google/callback`, `POST /api/logout-all`, `GET /api/export` e `DELETE /api/chats`. Nesta revisão: `GET /api/media/:id` (imagem gerada, só para a dona), `POST /api/stop` (`{job}`) e `POST /api/tour` (`{version}`).
- `POST /api/generate` aceita `job` (identificador para interromper) e, no Jack AI Imagem, as opções `style` e `ratio`. O fluxo pode trazer eventos `{image}` com o endereço da imagem; as mensagens guardam `images`. `providers.mjs` exporta `generateImage()`.
- As mensagens guardam `route`, `requestId`, `files` e `versions`. As mensagens antigas, inclusive as geradas por rotas gratuitas, são lidas normalmente.
- `providers.mjs` exporta `listModels()` como `{routes, providers, keys}` e só fala com o OpenRouter. `generate()` agora emite eventos `{type, value}` (`text`, `reasoning`, `sources`, `finish`) em vez de texto puro. O script `scripts/check-provider.mjs` mantém a opção `--catalog`.

Relatório completo, tabela de modelos e pendências: [ENTREGA.md](ENTREGA.md).
