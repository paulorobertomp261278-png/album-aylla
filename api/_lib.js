// Funções compartilhadas pelas rotas da API (arquivos com "_" não viram rotas na Vercel)
import { createHash, timingSafeEqual } from "node:crypto";

// ---------- Redis (Upstash) via REST, sem dependências ----------
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

export async function redis(...comandos) {
  if (!REDIS_URL || !REDIS_TOKEN) throw new ErroApp(500, "Banco de dados não configurado. Conecte o Upstash Redis ao projeto na Vercel.");
  const r = await fetch(REDIS_URL.replace(/\/$/, "") + "/pipeline", {
    method: "POST",
    headers: { Authorization: "Bearer " + REDIS_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(comandos),
  });
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
  confete: true, baloes: true, numero: true, lacos: true, bandeirinhas: true,
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
export function urlDoBlob(u) {
  if (typeof u !== "string" || u.length > 600) return false;
  try {
    const url = new URL(u);
    return url.protocol === "https:" && url.hostname.endsWith(".public.blob.vercel-storage.com");
  } catch { return false; }
}
