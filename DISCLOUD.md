# Publicar o Jack AI na Discloud

Este pacote executa o frontend, o catálogo de modelos, a autenticação e o histórico no mesmo processo Node. O ponto de entrada discloud.js lê o arquivo .env da raiz antes de iniciar a aplicação, habilita cookies seguros e escuta em 0.0.0.0:8080. O Jack AI consulta apenas o OpenRouter, e todos os modelos do catálogo são pagos.

1. Confira se a sua conta tem plano Platinum ou superior e reserve um subdomínio na seção Domínios do painel. Este projeto solicita 512 MB de RAM.
2. Extraia o ZIP. Em discloud.config, confira o nome reservado em ID=jackai, sem o sufixo .discloud.app ou .discloud.dev.
3. Crie uma chave de inferência em https://openrouter.ai/settings/keys e adicione créditos à conta. Se quiser um teto de gastos, defina um limite na própria chave. Em uma atualização, mantenha seu .env existente. Em uma instalação nova, copie .env.example para .env e preencha o valor após OPENROUTER_API_KEY=. A chave fica no servidor. Mantenha o ZIP preenchido privado. As variáveis opcionais do catálogo (rotas do Jack AI Pro, acesso ao Pro, modelos desativados e chamada mínima) estão comentadas em .env.example. Para trocar a chave, edite o .env da implantação e reinicie a aplicação.
4. Compacte o conteúdo da pasta, incluindo .env, discloud.config, discloud.js, public/ e migrations/ diretamente na raiz. Envie o ZIP pelo dashboard https://discloud.com/dashboard. O pacote usa VERSION=latest e requer Node.js 24+ com node:sqlite.
5. Abra o endereço HTTPS atribuído ao site e entre em Biblioteca de modelos. A aplicação verifica a chave, consulta os modelos permitidos e faz uma chamada mínima (cobrada) em cada rota, uma por vez. Quando as rotas saírem de “Verificando rota”, escolha um modelo e envie uma pergunta.
6. (Opcional) Para o login com Google, siga [GOOGLE_LOGIN.md](GOOGLE_LOGIN.md): crie o cliente OAuth com o retorno `https://SEU-SUBDOMINIO.discloud.dev/api/auth/google/callback` (use o domínio que aparece na barra do navegador) e acrescente `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `PUBLIC_URL` ao `.env`.
7. Atualize a página e reabra a conversa para conferir a persistência. Os dados ficam em data/jack.sqlite. Faça backup da pasta data com o processo parado antes de reinstalar ou substituir os arquivos. Para atualizar uma instalação, preserve data/ e o .env já configurado.

## Diagnóstico

| O que aparece | Ação |
| --- | --- |
| Configure OPENROUTER_API_KEY | Verifique o nome exato do arquivo .env e reinicie a aplicação. |
| Credencial inválida | Substitua a chave por uma chave de inferência ativa. |
| Catálogo vazio ou acesso bloqueado | Confira as preferências, cotas e restrições da conta no OpenRouter. |
| Sem créditos | Adicione créditos no OpenRouter ou aumente o limite de gastos da chave. As rotas voltam a ser verificadas em 10 minutos. |
| Limite de requisições | Aguarde alguns instantes ou escolha outro modelo disponível. |
| Site inacessível | Confira o plano, o subdomínio, MAIN e os logs de inicialização. |

O catálogo tem cache de 15 segundos. A chave permanece no backend. O aplicativo só usa as rotas pagas do catálogo e ignora variantes gratuitas. O gasto depende dos créditos e do limite configurados na chave.

Documentação: https://docs.discloud.com/how-to-host/websites-and-apis
