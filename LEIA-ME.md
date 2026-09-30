# Álbum da festa — como colocar no ar na Vercel

Este projeto é o álbum de fotos e vídeos do aniversário, pronto para a Vercel.

- **Álbum** (para os convidados): `https://SEU-PROJETO.vercel.app`
- **Painel admin** (só para você, com senha): `https://SEU-PROJETO.vercel.app/admin`

Os convidados **não precisam de conta** para enviar fotos. Basta abrir o link.

---

## O que você vai precisar

1. Uma conta no **GitHub** (grátis): https://github.com/signup
2. Uma conta na **Vercel** (grátis). Entre com a conta do GitHub: https://vercel.com/signup

---

## Passo 1 — Colocar os arquivos no GitHub

1. Extraia o arquivo `.zip` no seu computador.
2. No GitHub, clique em **New repository** (botão verde "New").
3. Dê um nome, por exemplo `album-aylla`, e clique em **Create repository**.
4. Na página que abrir, clique no link **uploading an existing file**.
5. Abra a pasta extraída e **arraste todo o conteúdo dela** para a página. São as pastas `api`, `public` e `src` e os arquivos `package.json`, `vercel.json` etc. Não arraste o `.zip`.
6. Clique em **Commit changes**.

## Passo 2 — Criar o projeto na Vercel

1. Na Vercel, clique em **Add New… → Project**.
2. Escolha o repositório `album-aylla` e clique em **Import**.
3. Em **Framework Preset**, deixe **Other**.
4. Abra **Environment Variables** e adicione:

   | Nome | Valor |
   |---|---|
   | `ADMIN_SENHA` | uma senha só sua, para entrar no painel |
   | `CODIGO_FESTA` | *(opcional)* um código que os convidados digitam para enviar fotos, ex.: `aylla1` |

   Sem o `CODIGO_FESTA`, qualquer pessoa com o link consegue enviar fotos. Com ele, só quem souber o código consegue. Você pode colocar o código no convite.

5. Clique em **Deploy**. O site vai ao ar, mas ainda não funciona completamente, porque falta o armazenamento dos passos 3 e 4.

## Passo 3 — Armazenamento das fotos (Vercel Blob)

1. No projeto, vá em **Storage** → **Create** → **Blob**.
2. Em "access", escolha **Public**. Isso é importante, porque é o que deixa as fotos aparecerem no álbum.
3. Dê um nome (ex.: `fotos-aylla`) e crie.
4. Confirme a conexão com o projeto, deixando **Production** e **Preview** marcados.

## Passo 4 — Banco de dados (Upstash Redis)

1. Ainda em **Storage**, clique em **Create** e escolha **Upstash** (Redis) no Marketplace.
2. Escolha o plano **Free**.
3. Conecte ao projeto. **Não altere o prefixo das variáveis.**

## Passo 5 — Publicar de novo

1. Vá em **Deployments**.
2. No deploy mais recente, clique nos **três pontinhos (⋯)** → **Redeploy**.
3. Quando terminar, abra o site e envie uma foto de teste.
4. Abra `/admin`, digite a sua `ADMIN_SENHA` e confira se a foto aparece em "Fotos e vídeos".

Pronto! Mande para os convidados só o link do álbum, **nunca o `/admin`**.

---

## Limites do plano gratuito da Vercel

Se passar de qualquer um destes limites, a Vercel **bloqueia o armazenamento por 30 dias**. Você não é cobrado, mas as fotos param de aparecer.

| O quê | Limite grátis por mês | Quanto rende neste álbum (estimativa) |
|---|---|---|
| Armazenamento | 1 GB | cerca de 1.500 fotos **ou** 1h30 de vídeo |
| Envios (operações) | 2.000 | cerca de 1.000 fotos/vídeos por mês (cada envio usa 2) |
| Visualização (tráfego) | 10 GB | depende de quantas vezes as pessoas assistem aos vídeos |

O que o álbum já faz para economizar:

- As fotos são reduzidas no celular antes de enviar.
- Os vídeos são convertidos para 720p.
- O mural mostra miniaturas pequenas, e a foto grande só carrega quando alguém toca nela.

O painel mostra quanto espaço já foi usado. Se a festa tiver muitos vídeos longos, fique de olho no uso em **Vercel → Observability → Blob**.

## Como funciona

- `public/index.html`: o álbum.
- `public/admin.html`: o painel admin, separado do álbum e protegido por senha.
- `api/`: as funções do servidor. Elas autorizam os envios, guardam os dados e conferem a senha.
- As fotos ficam no **Vercel Blob**. Os dados (legendas, nomes, configurações) ficam no **Upstash Redis**.
- Cada convidado consegue apagar ou editar só o que ele mesmo enviou, do mesmo celular. Pelo painel você consegue apagar e editar tudo.
