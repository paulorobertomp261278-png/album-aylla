// Salvar, editar legenda e apagar fotos/vídeos
import { del } from "@vercel/blob";
import { rota, json, redis, ErroApp, lerConfig, senhaConfere, hashChave, urlDoBlob , tokenBlob } from "./_lib.js";
import { randomUUID } from "node:crypto";

async function corpo(request) {
  try { return await request.json(); } catch { throw new ErroApp(400, "Pedido inválido."); }
}
async function buscar(id) {
  if (typeof id !== "string" || !/^[\w-]{6,60}$/.test(id)) throw new ErroApp(400, "Item inválido.");
  const [bruto] = await redis(["HGET", "midia", id]);
  if (!bruto) throw new ErroApp(404, "Essa foto não existe mais.");
  return JSON.parse(bruto);
}
function podeMexer(request, item, chave) {
  if (senhaConfere(request.headers.get("x-admin-senha"))) return true;
  return !!chave && item.dono === hashChave(chave);
}

const handler = rota({
  // novo item, depois que o arquivo já foi enviado ao Blob
  POST: async (request) => {
    const b = await corpo(request);
    const admin = senhaConfere(request.headers.get("x-admin-senha"));
    if (!admin) {
      const cfg = await lerConfig();
      if (!cfg.envioAberto) throw new ErroApp(403, "O envio de fotos está encerrado.");
      const codigo = process.env.CODIGO_FESTA || "";
      if (codigo && String(b.codigo || "").trim().toLowerCase() !== codigo.trim().toLowerCase())
        throw new ErroApp(403, "Código da festa incorreto.");
    }
    const tipo = b.tipo === "video" ? "video" : "foto";
    if (!urlDoBlob(b.url)) throw new ErroApp(400, "Arquivo inválido.");
    if (b.miniatura && !urlDoBlob(b.miniatura)) throw new ErroApp(400, "Miniatura inválida.");
    if (typeof b.chave !== "string" || b.chave.length < 16) throw new ErroApp(400, "Chave inválida.");
    const bytes = Math.max(0, Math.min(1e9, Math.round(Number(b.bytes) || 0)));
    const item = {
      id: randomUUID(),
      tipo,
      url: b.url,
      miniatura: b.miniatura || "",
      legenda: String(b.legenda || "").slice(0, 120),
      autor: String(b.autor || "").slice(0, 40),
      dono: hashChave(b.chave),
      bytes,
      criadoEm: new Date().toISOString(),
    };
    await redis(["HSET", "midia", item.id, JSON.stringify(item)], ["INCRBY", "bytes", bytes], ["INCR", "versao"]);
    return json({ ok: true, item });
  },

  // editar legenda
  PATCH: async (request) => {
    const b = await corpo(request);
    const item = await buscar(b.id);
    if (!podeMexer(request, item, b.chave)) throw new ErroApp(403, "Você só pode editar o que você enviou.");
    item.legenda = String(b.legenda || "").slice(0, 120);
    await redis(["HSET", "midia", item.id, JSON.stringify(item)], ["INCR", "versao"]);
    return json({ ok: true, item });
  },

  // apagar (arquivo + miniatura + registro)
  DELETE: async (request) => {
    const b = await corpo(request);
    const item = await buscar(b.id);
    if (!podeMexer(request, item, b.chave)) throw new ErroApp(403, "Você só pode apagar o que você enviou.");
    const urls = [item.url, item.miniatura].filter(urlDoBlob);
    try { if (urls.length) await del(urls, { token: tokenBlob() }); } catch (e) { console.error("del", e); }
    await redis(["HDEL", "midia", item.id], ["DECRBY", "bytes", item.bytes || 0], ["INCR", "versao"]);
    return json({ ok: true });
  },
});

export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
