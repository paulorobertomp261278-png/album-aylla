// Funções compartilhadas pelas rotas da API (arquivos com "_" não viram rotas na Vercel)
import { createHash, timingSafeEqual } from "node:crypto";

// ---------- Redis (Upstash) via REST, sem dependências ----------
// A Vercel pode criar as variáveis com prefixos diferentes; procuramos por qualquer um deles.
function acharEnv(exatos, fimRegex, filtroValor) {
  for (const k of exatos) if (process.env[k]) return { nome: k, valor: process.env[k] };
  for (const [k, v] of Object.entries(process.env)) {
    if (v && fimRegex.test(k) && (!filtroValor || filtroValor(v))) return { nome: k, valor: v };
  }
  return null;
}
export function envRedis() {
  const url = acharEnv(["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL"], /(_KV_REST_API_URL|_REDIS_REST_URL|_REST_API_URL)$/, (v) => /^https:\/\//.test(v));
  let token = null;
  if (url) {
    const base = url.nome.replace(/_URL$/, "_TOKEN");
    if (process.env[base]) token = { nome: base, valor: process.env[base] };
  }
  if (!token) token = acharEnv(["UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_TOKEN"], /(_KV_REST_API_TOKEN|_REDIS_REST_TOKEN|_REST_API_TOKEN)$/);
  return { url, token };
}
export function tokenBlob() {
  const t = acharEnv(["BLOB_READ_WRITE_TOKEN"], /_READ_WRITE_TOKEN$/, (v) => v.startsWith("vercel_blob_rw_"));
  return t ? t.valor : undefined;
}
const R = envRedis();
const REDIS_URL = R.url && R.url.valor;
const REDIS_TOKEN = R.token && R.token.valor;

export async function redis(...comandos) {
  if (!REDIS_URL || !REDIS_TOKEN) throw new ErroApp(500, "Banco de dados não configurado. Conecte o Upstash Redis ao projeto na Vercel.");
  const r = await fetch(REDIS_URL.replace(/\/$/, "") + "/pipeline", {
    method: "POST",
    headers: { Authorization: "Bearer " + REDIS_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(comandos),
    signal: AbortSignal.timeout(10000),
  }).catch(() => { throw new ErroApp(504, "O banco de dados demorou para responder. Tente de novo."); });
  if (!r.ok) throw new ErroApp(502, "Falha ao falar com o banco de dados.");
  const res = await r.json();
  return res.map((x) => {
    if (x.error) throw new ErroApp(502, "Erro no banco de dados: " + x.error);
    return x.result;
  });
}

// ---------- respostas ----------
export class ErroApp extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}
export const json = (dados, status = 200) =>
  new Response(JSON.stringify(dados), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

export function rota(handlers) {
  return async function handler(request) {
    try {
      const fn = handlers[request.method];
      if (!fn) return json({ erro: "Método não permitido" }, 405);
      return await fn(request);
    } catch (e) {
      if (e instanceof ErroApp) return json({ erro: e.message }, e.status);
      console.error(e);
      return json({ erro: "Erro inesperado no servidor." }, 500);
    }
  };
}

// ---------- admin ----------
export function senhaConfere(senha) {
  const certa = process.env.ADMIN_SENHA || "";
  if (!certa || typeof senha !== "string" || !senha) return false;
  const a = createHash("sha256").update(senha).digest();
  const b = createHash("sha256").update(certa).digest();
  return timingSafeEqual(a, b);
}
export function exigirAdmin(request) {
  if (!process.env.ADMIN_SENHA) throw new ErroApp(500, "Defina a variável ADMIN_SENHA na Vercel.");
  if (!senhaConfere(request.headers.get("x-admin-senha"))) throw new ErroApp(401, "Senha de admin incorreta.");
}

export const hashChave = (chave) => createHash("sha256").update(String(chave || "")).digest("hex");

// ---------- configuração da festa ----------
export const PADRAO = {
  nome: "Aylla", idade: 1, data: "", tituloLivre: "",
  sobreTitulo: "Álbum da festa",
  subtitulo: "Tirou uma foto ou gravou um vídeo na festa? Coloque aqui para todo mundo ver.",
  tituloEnvio: "Adicionar fotos e vídeos", tituloMural: "Mural",
  vazioTitulo: "O mural está esperando!",
  textoVazio: "As fotos e vídeos que os convidados enviarem aparecem aqui.",
  textoEncerrado: "O envio de fotos e vídeos foi encerrado. Obrigado a todos que participaram!",
  corPrincipal: "", corBalao1: "", corBalao2: "",
  imagem: "padrao",
  confete: true, baloes: true, numero: true, lacos: true, bandeirinhas: true, bebe: true,
  envioAberto: true, mostrarAutor: true, ordem: "novas",
};

export function limparConfig(x) {
  const c = {};
  x = x && typeof x === "object" ? x : {};
  for (const k of Object.keys(PADRAO)) {
    const p = PADRAO[k], v = x[k];
    if (typeof p === "boolean") c[k] = typeof v === "boolean" ? v : p;
    else if (k === "idade") c[k] = v === null || v === "" || v === undefined ? (k in x ? "" : p) : Math.max(0, Math.min(120, Math.round(Number(v)) || 0));
    else if (k.startsWith("cor")) c[k] = typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : "";
    else if (k === "imagem") c[k] = v === "nenhuma" || v === "padrao" || urlDoBlob(v) ? v : p;
    else if (k === "ordem") c[k] = v === "antigas" ? "antigas" : "novas";
    else if (k === "data") c[k] = typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
    else c[k] = typeof v === "string" ? v.slice(0, 300) : p;
  }
  return c;
}

export async function lerConfig() {
  const [bruto] = await redis(["GET", "config"]);
  let obj = {};
  try { obj = bruto ? JSON.parse(bruto) : {}; } catch {}
  return limparConfig(obj);
}

// só aceita arquivos do próprio armazenamento Blob público
// aceita arquivos do Cloudflare R2 (se configurado) ou do Vercel Blob público
export function urlDoBlob(u) {
  if (typeof u !== "string" || u.length > 600) return false;
  const r2 = (process.env.R2_PUBLIC_URL || "").trim().replace(/\/+$/, "");
  if (r2 && u.startsWith(r2 + "/")) return true;
  try {
    const url = new URL(u);
    return url.protocol === "https:" && url.hostname.endsWith(".public.blob.vercel-storage.com");
  } catch { return false; }
}

// apaga arquivos, cada um no armazenamento de onde veio
export async function apagarArquivos(urls) {
  const { r2Config, apagarR2 } = await import("./_r2.js");
  const cfg = r2Config();
  const doR2 = cfg ? urls.filter((u) => u.startsWith(cfg.publica + "/")) : [];
  const doBlob = urls.filter((u) => !doR2.includes(u) && /\.public\.blob\.vercel-storage\.com\//.test(u));
  if (doR2.length) await apagarR2(cfg, doR2);
  if (doBlob.length) {
    try {
      const { del } = await import("@vercel/blob");
      const t = tokenBlob();
      await del(doBlob, t ? { token: t } : undefined);
    } catch (e) { console.error("del blob", e); }
  }
}
