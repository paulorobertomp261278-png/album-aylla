// Mostra o que está (ou não) configurado no projeto, sem revelar nenhum segredo.
import { json, envRedis, tokenBlob, redis } from "./_lib.js";

export async function GET() {
  const r = envRedis();
  const out = {
    senhaAdmin: process.env.ADMIN_SENHA ? "ok" : "FALTANDO: crie a variável ADMIN_SENHA",
    armazenamentoFotos: (tokenBlob() || process.env.BLOB_STORE_ID) ? "ok" : "FALTANDO: crie um Blob (Public) em Storage e conecte ao projeto, depois faça Redeploy",
    bancoDeDados: "",
    variaveisEncontradas: Object.keys(process.env).filter((k) => /KV|REDIS|UPSTASH|BLOB/i.test(k)).sort(),
  };
  if (!r.url || !r.token) out.bancoDeDados = "FALTANDO: conecte o Upstash Redis em Storage e faça Redeploy";
  else {
    try { await redis(["PING"]); out.bancoDeDados = "ok (" + r.url.nome + ")"; }
    catch (e) { out.bancoDeDados = "ERRO: " + e.message; }
  }
  out.tudoCerto = out.senhaAdmin === "ok" && out.armazenamentoFotos === "ok" && out.bancoDeDados.startsWith("ok");
  return json(out);
}
