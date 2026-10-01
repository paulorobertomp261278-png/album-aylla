// Cloudflare R2 (compatível com S3): assinatura SigV4 de URLs, sem dependências
import { createHash, createHmac } from "node:crypto";

export function r2Config() {
  const c = {
    conta: (process.env.R2_ACCOUNT_ID || "").trim(),
    chave: (process.env.R2_ACCESS_KEY_ID || "").trim(),
    segredo: (process.env.R2_SECRET_ACCESS_KEY || "").trim(),
    bucket: (process.env.R2_BUCKET || "").trim(),
    publica: (process.env.R2_PUBLIC_URL || "").trim().replace(/\/+$/, ""),
  };
  return Object.values(c).every(Boolean) ? c : null;
}

// quais variáveis do R2 estão faltando (só os nomes)
export function r2Faltando() {
  return ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_URL"].filter((k) => !(process.env[k] || "").trim());
}

const sha256hex = (s) => createHash("sha256").update(s).digest("hex");
const hmac = (k, s) => createHmac("sha256", k).update(s).digest();
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

// URL pré-assinada genérica (AWS Signature V4, assinando só o host)
export function presign({ metodo, host, caminho, regiao, chave, segredo, expira = 3600, agora = new Date(), extra = {} }) {
  const amz = agora.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const dia = amz.slice(0, 8);
  const escopo = `${dia}/${regiao}/s3/aws4_request`;
  const q = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${chave}/${escopo}`,
    "X-Amz-Date": amz,
    "X-Amz-Expires": String(expira),
    "X-Amz-SignedHeaders": "host",
    ...extra,
  };
  const qs = Object.keys(q).sort().map((k) => enc(k) + "=" + enc(q[k])).join("&");
  const canonico = [metodo, caminho, qs, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const aAssinar = ["AWS4-HMAC-SHA256", amz, escopo, sha256hex(canonico)].join("\n");
  let k = hmac("AWS4" + segredo, dia);
  k = hmac(k, regiao);
  k = hmac(k, "s3");
  k = hmac(k, "aws4_request");
  const assinatura = createHmac("sha256", k).update(aAssinar).digest("hex");
  return `https://${host}${caminho}?${qs}&X-Amz-Signature=${assinatura}`;
}

const caminhoObjeto = (cfg, chaveObjeto) => "/" + cfg.bucket + "/" + chaveObjeto.split("/").map(enc).join("/");

export function urlR2(cfg, metodo, chaveObjeto, expira = 3600) {
  return presign({
    metodo,
    host: `${cfg.conta}.r2.cloudflarestorage.com`,
    caminho: caminhoObjeto(cfg, chaveObjeto),
    regiao: "auto",
    chave: cfg.chave,
    segredo: cfg.segredo,
    expira,
  });
}

// endereço público de um objeto e o caminho inverso
export const publicaDe = (cfg, chaveObjeto) => cfg.publica + "/" + chaveObjeto.split("/").map(enc).join("/");
export function chaveDe(cfg, url) {
  if (typeof url !== "string" || !url.startsWith(cfg.publica + "/")) return null;
  try { return url.slice(cfg.publica.length + 1).split("/").map(decodeURIComponent).join("/"); } catch { return null; }
}

export async function apagarR2(cfg, urls) {
  for (const u of urls) {
    const k = chaveDe(cfg, u);
    if (!k) continue;
    try { await fetch(urlR2(cfg, "DELETE", k, 300), { method: "DELETE", signal: AbortSignal.timeout(10000) }); } catch (e) { console.error("apagar R2", e); }
  }
}

// testa as credenciais listando 1 objeto do bucket
export async function testarR2(cfg) {
  const host = `${cfg.conta}.r2.cloudflarestorage.com`;
  const url = presign({ metodo: "GET", host, caminho: "/" + cfg.bucket, regiao: "auto", chave: cfg.chave, segredo: cfg.segredo, expira: 120, extra: { "list-type": "2", "max-keys": "1" } });
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
  return r;
}
