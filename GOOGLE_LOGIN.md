# Login com Google: passo a passo

O Jack AI já vem com o login com Google pronto (OAuth 2.0 com PKCE). Falta só criar o cliente OAuth no Google Cloud e colocar duas chaves no `.env` do servidor. Leva uns 10 minutos.

> **Nunca** cole o segredo do cliente em chats, issues ou no código. Ele fica só no `.env` do servidor.

## 1. Criar ou escolher o projeto

1. Abra o [Google Cloud Console](https://console.cloud.google.com/) com a conta Google que vai administrar o app.
2. No seletor de projetos (topo da página), clique em **Novo projeto**, dê o nome `Jack AI` e clique em **Criar**. Se já tiver um projeto, só selecione.

## 2. Configurar a Google Auth Platform (tela de consentimento)

1. No menu, abra **Google Auth Platform** (em algumas contas aparece como **APIs e serviços → Tela de permissão OAuth**). Clique em **Começar** (*Get started*).
2. **Informações do app (Branding)**: nome do app `Jack AI` e um e-mail de suporte. Logotipo é opcional. Se você enviar um logotipo, o Google pode pedir a verificação da marca antes de exibi-lo.
3. **Público (Audience)**: escolha **Externo** (qualquer conta Google pode entrar).
4. **Dados de contato**: seu e-mail. Aceite a política de dados de usuário do Google e clique em **Criar**.
5. Ainda em **Público**, o app começa **Em teste**: só as contas que você adicionar em **Usuários de teste** conseguem entrar (até 100). Para liberar para todo mundo, clique em **Publicar app** e confirme **Em produção**. O Jack AI pede só `openid`, `email` e `profile`, escopos que não exigem a verificação de escopos sensíveis.

## 3. Criar o cliente OAuth

1. Em **Google Auth Platform → Clientes** (*Clients*), clique em **Criar cliente**.
2. **Tipo de aplicativo**: **Aplicativo da Web**. Nome: `Jack AI web`.
3. **Origens JavaScript autorizadas**: pode deixar vazio. O Jack AI não usa o SDK JavaScript do Google; tudo passa pelo servidor.
4. **URIs de redirecionamento autorizados**: clique em **Adicionar URI** e cole exatamente:
   - Produção na Discloud: `https://jackai.discloud.dev/api/auth/google/callback`
   - Se o site também abrir em `jackai.discloud.app`, adicione `https://jackai.discloud.app/api/auth/google/callback`
   - (Opcional) Teste local: `http://localhost:3000/api/auth/google/callback`

   Use o endereço que aparece na barra do navegador quando o site está aberto. Troque `jackai` pelo seu subdomínio, se for outro. O endereço precisa bater letra por letra: `https`, sem barra no final.
5. Clique em **Criar**. Copie o **ID do cliente** (termina em `.apps.googleusercontent.com`) e a **Chave secreta do cliente** (começa com `GOCSPX-`). **O segredo só aparece agora**; se perder, gere outro em **Clientes → Jack AI web → Adicionar segredo**.

## 4. Colocar as chaves no servidor

No `.env` da aplicação (na Discloud, edite o arquivo `.env` da implantação), acrescente:

```env
GOOGLE_CLIENT_ID=123456789-abcdefg.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-seu-segredo-aqui
PUBLIC_URL=https://jackai.discloud.dev
```

`PUBLIC_URL` é o endereço público do site, sem barra no final. Se ficar vazio, o servidor usa o endereço em que o site foi aberto. Ele precisa ser o mesmo domínio cadastrado no Google: se o site abre em `jackai.discloud.dev`, use `.dev`. O servidor monta o redirecionamento como `PUBLIC_URL + /api/auth/google/callback`. Se preferir, defina o endereço completo em `GOOGLE_REDIRECT_URI`.

Reinicie a aplicação. Se algo der errado, o motivo aparece nos logs da Discloud em linhas que começam com `[google]`. O Google pode levar de 5 minutos a algumas horas para aplicar um URI novo.

## 5. Testar

1. Abra o site, clique em **Entrar na conta** (canto inferior esquerdo) e depois em **Continuar com Google**.
2. Escolha a conta e aceite. Você volta ao Jack AI já conectado e vê “Você entrou com o Google.”.
3. Se você já entrava com e-mail e senha: entre com a senha, abra **Configurações** e clique em **Conectar conta Google**. A partir daí, os dois jeitos funcionam.

## Como o Jack AI trata as contas

- **Visitante** que entra com o Google vira conta e **mantém as conversas** que já tinha.
- **Conta com senha e o mesmo e-mail**: o Jack AI não liga as duas sozinho, porque o cadastro com senha não confirma o e-mail. A pessoa entra com a senha e conecta o Google em Configurações. Se ela já estiver conectada com o mesmo e-mail, a ligação é automática.
- **E-mail não verificado no Google**: o login é recusado.
- O servidor confere `state` (amarrado ao navegador por um cookie de uso único), PKCE (`S256`), `nonce`, emissor, público (`aud`) e validade do ID token. O segredo nunca vai ao navegador.
- A foto do perfil do Google é copiada para o Jack AI (até 290 KB), porque a política de segurança do site só exibe imagens locais.

## Problemas comuns

| O que aparece | O que fazer |
| --- | --- |
| Fica parado em `.../api/auth/google/callback` | O Google voltou para um domínio diferente do site (por exemplo `.app` em vez de `.dev`). Ajuste `PUBLIC_URL` e o URI cadastrado para o mesmo domínio da barra do navegador. |
| `Erro 400: redirect_uri_mismatch` | O URI em **Clientes → URIs de redirecionamento** não é igual ao do servidor. Confira `https`, domínio, `/api/auth/google/callback` e a ausência de barra no final. Espere alguns minutos depois de salvar. |
| `Acesso bloqueado: este app não concluiu o processo de verificação` | O app está **Em teste** e a conta não está em **Usuários de teste**. Adicione a conta ou publique o app. |
| “O login com Google não está configurado nesta instalação.” | Faltam `GOOGLE_CLIENT_ID` ou `GOOGLE_CLIENT_SECRET` no `.env`, ou a aplicação não foi reiniciada. |
| “O login com Google expirou ou foi aberto em outra aba.” | O retorno demorou mais de 10 minutos, foi aberto em outro navegador ou a aplicação reiniciou no meio. Tente de novo. |
| “Já existe uma conta com este e-mail.” | Entre com e-mail e senha e use **Configurações → Conectar conta Google**. |
| `invalid_client` | ID ou segredo copiados errado, ou o segredo foi trocado no console. |

Referências oficiais: [Gerenciar clientes OAuth](https://support.google.com/cloud/answer/15549257) e [OAuth 2.0 para aplicativos de servidor web](https://developers.google.com/identity/protocols/oauth2/web-server).
