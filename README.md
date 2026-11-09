# Jack AI

A edição atual traz o redesign de novembro de 2026: início focado na primeira mensagem, perfis Jack AI Flash, Pro, Studio, Code e Imagem, catálogo só com modelos pagos de 2026 separados por fornecedor, nível de esforço ajustável com raciocínio visível, pesquisa na web com fontes, criação de imagens e figurinhas, visualizador próprio para imagens e arquivos, código entregue como arquivos (2 ou mais chegam num .zip), tutorial guiado depois do login, PDFs, ditado, leitura em voz alta, [login com Google](GOOGLE_LOGIN.md) e o [Estúdio com Medidas, Dados e Texto e código](ESTUDIO.md).

Leia [ATUALIZACAO.md](ATUALIZACAO.md) para atualizar uma instalação existente e [ENTREGA.md](ENTREGA.md) para o relatório da entrega, com testes e tabela de modelos.

Para hospedar esta versão na Discloud, comece pelo [guia de publicação](DISCLOUD.md).

Workspace de conversação em português brasileiro. A aplicação roda em um processo Node.js 24 com SQLite em disco. As respostas vêm de modelos pagos lançados em 2026 (OpenAI, Anthropic, Google, xAI, Mistral AI, DeepSeek, Qwen e Moonshot AI), acessados pelo OpenRouter com a chave e os créditos do operador. Variantes gratuitas e modelos locais não fazem parte do catálogo.

## Instalação local

Requisitos: Node.js 24 com npm, permissão de escrita no diretório de dados e uma chave do OpenRouter com créditos para gerar respostas.

```sh
cd Jack-AI
cp .env.example .env
npm ci
npm test
npm run build
npm start
```

Abra **http://localhost:3000**. Na primeira inicialização, o servidor cria o diretório `data/`, o arquivo `jack.sqlite` e aplica o schema idempotente em `migrations/001.sql`. A distribuição inclui a biblioteca de Markdown e sua licença. A instalação não precisa baixar pacotes de aplicação.

Para gerar a primeira resposta, preencha `OPENROUTER_API_KEY` em `.env`, reinicie o servidor, abra **Biblioteca de modelos** e espere as rotas saírem de “Verificando rota”. Depois escolha um modelo e envie uma pergunta. Todas as rotas são cobradas por token. O [guia dos provedores](PROVIDERS.md) detalha o catálogo, o esforço, a pesquisa na web, os PDFs, o diagnóstico e o teste de inferência. Para o login com Google, siga [GOOGLE_LOGIN.md](GOOGLE_LOGIN.md). O catálogo pode levar até 15 segundos para refletir alterações.

## Arquitetura

| Camada | Arquivos | Responsabilidade |
| --- | --- | --- |
| Navegador | public/index.html, app.js, style.css, icons.js, picker.js, library.js, workspace.js | Workspace responsivo, seletor de modelos, Biblioteca, rascunhos, anexos, preferências e consumo progressivo da resposta |
| Arquivos e imagens | public/files.js, zip.js, viewer.js | Arquivos tirados dos blocos de código, .zip montado no navegador, visualizador de imagens e código, figurinha WebP |
| Tutorial | public/tour.js | Tutorial guiado com destaque de cada ferramenta, teclado e celular |
| Estúdio | public/studio/view.js, catalog.js, data.js, text.js | Medidas, CSV e texto/JSON executados no navegador |
| Catálogo | models.config.mjs, catalog.mjs | Fonte única dos perfis Jack AI e das rotas pagas por fornecedor, regras de acesso, preços e verificação mínima |
| Conteúdo | public/render.js, math.js, render.css, vendor/marked/ | Markdown convertido em nós DOM, realce léxico, cópia e subconjunto de TeX em MathML |
| Identidade visual | public/logo.svg, ring.webp, orbit.svg, vendor/inter | Marca, anel de linhas e fonte Inter (OFL) incluídos localmente |
| API | server.mjs | Sessões, validação, limites, controle de acesso e streaming NDJSON para o navegador |
| Adaptador | providers.mjs | Descoberta das rotas pagas do catálogo no OpenRouter, esforço de raciocínio, pesquisa na web, PDFs, envio de contexto e conversão do fluxo SSE |
| Persistência | migrations/001.sql, 002.sql, 003.sql, 004.sql | Usuários, tokens de sessão com hash, preferências, histórico por proprietário, verificações de rota e imagens geradas (`media`) |

O navegador envia o cookie de sessão à API da própria origem. O servidor identifica o usuário, carrega o histórico, resolve o perfil Jack AI ou a rota escolhida no catálogo, acrescenta as instruções do perfil e as personalizadas e chama a rota real. O primeiro evento do streaming informa a rota usada. Os fragmentos chegam ao navegador conforme o provedor os envia. A pergunta é salva antes da geração. A resposta é gravada ao concluir ou interromper o fluxo. Uma queda abrupta do processo pode perder o texto parcial. Conversas temporárias usam a memória da aba e seguem para o provedor quando enviadas.

## Uso

- **Primeira mensagem**. Escreva no campo “Pergunte ao Jack AI…” ou toque em uma sugestão: ela preenche o campo e seleciona o trecho a completar. Enter envia e Shift+Enter quebra a linha no computador. No celular, Enter quebra a linha e o botão envia.
- **Modelos**. O seletor do campo tem busca por nome ou fornecedor, favoritos e o modelo ativo marcado. Os perfis Jack AI aparecem primeiro. A Biblioteca filtra por tarefa e capacidade e mostra contexto, formatos aceitos, hospedagem e verificação de cada rota.
- **Conversas**. A lateral tem Nova conversa, a busca por título e conteúdo e o Histórico. O menu de cada conversa permite renomear, fixar, arquivar e excluir. Cada conversa guarda seu rascunho, que continua lá depois de recarregar.
- **Respostas**. É possível interromper a geração (o trecho recebido fica salvo), copiar a resposta e gerar uma nova versão, com navegação entre as versões. Clique duplo ou nova tentativa não duplicam mensagens.
- **Arquivos**. Código com nome de arquivo vira um cartão na conversa. Uma resposta com um arquivo traz “Ver” e “Baixar”; com 2 ou mais, um único anexo .zip. “Ver” abre o visualizador, com uma aba por arquivo, setas, Copiar e Baixar.
- **Imagens e figurinhas**. O Jack AI Imagem cria e edita imagens (Estilo e Proporção ao lado do campo). As imagens aparecem no chat; um toque abre o visualizador com Tamanho real, Baixar e Figurinha (WebP 512 × 512, fundo liso removido). Fotos anexadas e figurinhas em SVG também abrem no visualizador.
- **Tutorial guiado**. Abre sozinho no primeiro acesso com conta e mostra cada ferramenta passo a passo. Setas, Enter e Esc funcionam. Para rever, use Configurações › Ver tutorial guiado.
- **Anexos**. Até quatro por mensagem: texto, Markdown, CSV, JSON e código de até 80 KB, uma imagem PNG, JPEG ou WebP de até 1,8 MB para modelos com análise de imagens e um PDF de até 2 MB. Não há leitor de áudio ou documentos de escritório.
- **Chat temporário**. O botão fica ao lado do campo. A conversa e o rascunho ficam só na memória da aba, somem ao recarregar e não chegam ao servidor do Jack AI. O provedor do modelo ainda recebe as mensagens.
- **Estúdio**. Medidas, Dados (CSV) e Texto e código. “Usar na conversa” abre uma prévia editável e deixa escolher a conversa de destino. Nada é enviado sem confirmação.
- **Exportação**. TXT e Markdown exportam o conteúdo textual. PDF abre a impressão formatada do navegador.
- **Configurações**. Nome, foto, tema, instruções, temperatura e limite de saída.
- **Atalhos**. Ctrl/Cmd+K abre uma nova conversa, Ctrl/Cmd+/ abre a busca e Esc fecha menus, seletor e diálogos, devolvendo o foco à origem.
- **Conexão e privacidade**. A interface avisa quando a conexão cai. Excluir meus dados remove a conta, as sessões e os chats do banco ativo. As políticas do provedor valem para o conteúdo que ele recebe.

## Publicação

Use um host Linux ou serviço de contêineres com **volume persistente**, HTTPS e suporte a respostas HTTP progressivas. Esta arquitetura opera com uma réplica por banco SQLite. Hospedagens estáticas e funções com disco efêmero não atendem ao requisito de persistência.

1. Configure o provedor e prepare as variáveis conforme `.env.example`. Em produção, use `COOKIE_SECURE=true`, HTTPS e uma origem dedicada.
2. Execute `docker build -t jack-ai .` na raiz e `docker volume create jack-data`.
3. Inicie o serviço com `docker run -d --name jack-ai --restart unless-stopped --env-file .env -e DATA_DIR=/app/data -e COOKIE_SECURE=true -p 127.0.0.1:3000:3000 -v jack-data:/app/data jack-ai`. Em um serviço gerenciado, monte o volume em `/app/data`, exponha a porta 3000 e configure as variáveis no painel.
4. Encaminhe o domínio HTTPS para a porta interna. Preserve o cabeçalho Host original e desligue o buffering de respostas no proxy. Em Nginx, use `proxy_set_header Host $host`, `proxy_buffering off` e um tempo de leitura de pelo menos 310 segundos. Exponha apenas o proxy.
5. Teste cadastro, recarregamento do histórico e geração com o provedor escolhido. Faça backup consistente do SQLite com a API de backup SQLite ou com o processo parado. Proteja o volume e os backups com permissões e criptografia do host.

Sem Docker, use os passos de instalação, execute o processo com um supervisor e aponte DATA_DIR para armazenamento durável. O build também gera `dist/` com o runtime completo. Dentro desse diretório, use `node --env-file-if-exists=.env server.mjs`. A imagem Docker e a publicação pública não foram executadas nesta entrega.

## Segurança e limites operacionais

O login pode ser por e-mail e senha ou pelo Google (OAuth 2.0 com PKCE, segredo só no servidor). Senhas usam scrypt e sal aleatório. Tokens de sessão aleatórios ficam em cookies HttpOnly e SameSite=Strict, com expiração de 30 dias e opção Secure para HTTPS. O banco armazena os resumos dos tokens e dos códigos de recuperação. As consultas são parametrizadas e o backend verifica o proprietário. Há verificação de origem, CSP, limite de corpo, rate limiting por operação e bloqueio de duas gerações simultâneas no mesmo chat. Uma aba conduz uma geração por vez. Abas separadas podem operar em chats diferentes.

As chaves ficam no ambiente do servidor. O provedor recebe o histórico necessário para a resposta. Antes de abrir o cadastro ao público, ajuste cotas para seu público e configure backups e monitoramento. O rate limiting reside no processo e considera o endereço do socket. Em um proxy único, os limites de IP podem ser compartilhados entre visitantes. Esta versão carrega o histórico completo por usuário para permitir a busca. Grandes volumes ou múltiplas réplicas requerem paginação e uma estratégia compartilhada de banco, limites e locks.

## Verificações e estado da entrega

| Verificação | Resultado |
| --- | --- |
| Instalação e build | Executados com Node 24. O build verifica a sintaxe dos módulos e reúne o runtime em dist/. A implementação usa JavaScript ES Modules, sem etapa TypeScript. |
| Autenticação e isolamento | Teste HTTP executado para cadastro, login, logout, recuperação, invalidação de sessão, persistência entre logins, bloqueio de acesso cruzado e exclusão de conta. |
| Rotas e preferências | Verificados no build de produção o HTML, os recursos visuais e scripts, o bloqueio de origem externa, os atributos do cookie e o salvamento de preferências. |
| Chats e modelos | Testes executados para criação, renomeação, fixação, catálogo indisponível e escolha de modelo descoberto em um servidor de teste. |
| Streaming | Teste de contrato ponta a ponta executado entre a API, SQLite e um servidor HTTP local de teste com o formato do OpenRouter. Verifica fragmentos, edição e ausência de persistência no modo temporário. |
| Inferência real | Pendente. O ambiente não forneceu uma chave do OpenRouter com créditos. O script scripts/check-provider.mjs permite realizar o teste após configurar. |
| Navegador e console | Sem erros de JavaScript nos fluxos testados. A exportação em PDF e um dispositivo físico com teclado virtual continuam sem validação. |
| Interface | 138 verificações em Chromium headless (1440 px e 390 px) com `tests/capture.py`, incluindo teclado, rascunhos, interrupção, falha com nova tentativa, anexo incompatível, Biblioteca sem tokens nem US$, menu de esforço, raciocínio, fontes da web, “Continuar resposta”, PDF, arquivos e .zip, visualizador, Jack AI Imagem, figurinha WebP, tutorial guiado, atalhos, login com Google, Chat temporário após recarregar e auditoria axe-core. Teclado virtual testado por emulação. |
| Material visual | As capturas em screenshots/ são reais e foram feitas com o servidor de contrato. A conversa mostrada não comprova inferência. Os mockups antigos estão em screenshots/anterior/. |

Para repetir os testes, use `npm test`. Os servidores de contrato em `tests/support/` só são usados nos testes e não entram no build publicado. Para as capturas e a verificação da interface, siga as instruções no topo de `tests/capture.py` (Playwright Python e Chrome ou Chromium).

A recuperação de senha usa o código entregue no cadastro. Não há envio de e-mail. A matemática suporta expressões comuns, frações, raízes, índices e símbolos. Sintaxe avançada permanece em texto. A versão integra só o OpenRouter. Ollama e a API da NVIDIA saíram nesta edição. PostgreSQL, Supabase, Hugging Face e implantação na Vercel não integram esta distribuição.

## Usar o endereço workers.dev

O Worker incluído serve o frontend e encaminha /api/* ao servidor Node do Jack AI. Hospede primeiro o backend conforme a seção Publicação, com HTTPS e volume persistente. Depois, na raiz do projeto:

1. Ajuste o campo name em wrangler.jsonc para o nome do Worker que deseja atualizar.
2. Acrescente a propriedade "vars": {"BACKEND_ORIGIN":"https://SEU-BACKEND"} ao objeto raiz de wrangler.jsonc, usando a URL real da sua hospedagem, sem caminho. Configure as chaves dos provedores no backend.
3. Execute npx wrangler@4 login e npx wrangler@4 deploy na conta Cloudflare correta.
4. Recarregue o site e abra Biblioteca de modelos. No painel Rede do navegador, POST /api/session deve responder 200 com cookie jack e GET /api/models deve responder 200 com uma lista JSON. Sem provedor configurado, a lista indica os requisitos de configuração. Um 503 do Worker indica configuração ausente ou inválida. Um 502 pode indicar uma origem inacessível ou um redirecionamento.

Enviar somente a pasta public publica a interface sem as rotas de conta, catálogo e geração. O Dockerfile continua sendo uma alternativa para servir frontend e backend em um único domínio.
