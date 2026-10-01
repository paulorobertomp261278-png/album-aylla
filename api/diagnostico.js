// Mostra o que está (ou não) configurado no projeto, sem revelar nenhum segredo.
import { json, envRedis, tokenBlob, redis } from "./_lib.js";
import { r2Config, r2Faltando, testarR2 } from "./_r2.js";

export async function GET() {
  const r = envRedis();
  const out = {
    senhaAdmin: process.env.ADMIN_SENHA ? "ok" : "FALTANDO: crie a variável ADMIN_SENHA",
    armazenamentoFotos: "",
    bancoDeDados: "",
  };

  const cf = r2Config();
  const faltaR2 = r2Faltando();
  if (cf) {
    const t = await testarR2(cf);
    if (t.ok) out.armazenamentoFotos = "ok (Cloudflare R2, 10 GB grátis)";
    else if (t.status === 403) out.armazenamentoFotos = "ERRO: o Cloudflare recusou as chaves. Confira R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY e se o token tem permissão de leitura e escrita no bucket";
    else if (t.status === 404) out.armazenamentoFotos = "ERRO: bucket não encontrado. Confira R2_BUCKET e R2_ACCOUNT_ID";
    else out.armazenamentoFotos = "ERRO: não consegui falar com o Cloudflare (código " + t.status + "). Confira R2_ACCOUNT_ID";
    if (!/^https:\/\//.test(cf.publica)) out.armazenamentoFotos = "ERRO: R2_PUBLIC_URL precisa começar com https://";
  } else if (faltaR2.length < 5) {
    out.armazenamentoFotos = "INCOMPLETO: falta criar na Vercel: " + faltaR2.join(", ");
  } else if (tokenBlob() || process.env.BLOB_STORE_ID) {
    out.armazenamentoFotos = "ok (Vercel Blob, 1 GB). Para usar o Cloudflare, crie as variáveis R2_*";
  } else {
    out.armazenamentoFotos = "FALTANDO: configure o Cloudflare R2 (variáveis R2_*) ou conecte um Vercel Blob";
  }

  if (!r.url || !r.token) out.bancoDeDados = "FALTANDO: conecte o Upstash Redis em Storage e faça Redeploy";
  else {
    try { await redis(["PING"]); out.bancoDeDados = "ok"; }
    catch (e) { out.bancoDeDados = "ERRO: " + e.message; }
  }
  out.tudoCerto = out.senhaAdmin === "ok" && out.armazenamentoFotos.startsWith("ok") && out.bancoDeDados.startsWith("ok");
  return json(out);
}
