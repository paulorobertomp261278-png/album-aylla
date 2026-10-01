// Autoriza um envio. Com o Cloudflare R2 configurado, devolve um endereço assinado
// para o navegador enviar o arquivo direto ao R2. Sem ele, manda usar o Vercel Blob.
import { randomUUID } from "node:crypto";
import { rota, json, ErroApp, lerConfig, senhaConfere } from "./_lib.js";
import { r2Config, urlR2, publicaDe } from "./_r2.js";

const TIPOS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };
const MAXIMO = 500 * 1024 * 1024;

const handler = rota({
  POST: async (request) => {
    const cfg = r2Config();
    if (!cfg) return json({ modo: "blob" });
    let b;
    try { b = await request.json(); } catch { throw new ErroApp(400, "Pedido inválido."); }
    const admin = senhaConfere(b.senha);
    const pasta = String(b.pasta || "");
    if (!["midia", "capas", "topo"].includes(pasta) || (pasta === "topo" && !admin)) throw new ErroApp(400, "Pasta não permitida.");
    if (!admin) {
      const festa = await lerConfig();
      if (!festa.envioAberto) throw new ErroApp(403, "O envio de fotos está encerrado.");
      const codigo = process.env.CODIGO_FESTA || "";
      if (codigo && String(b.codigo || "").trim().toLowerCase() !== codigo.trim().toLowerCase())
        throw new ErroApp(403, "Código da festa incorreto.");
    }
    const ext = TIPOS[b.tipo];
    if (!ext) throw new ErroApp(400, "Formato de arquivo não aceito.");
    if (!(Number(b.tamanho) > 0) || Number(b.tamanho) > MAXIMO) throw new ErroApp(400, "Arquivo grande demais.");
    const nome = String(b.nome || "arquivo").toLowerCase().replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "arquivo";
    const chave = `${pasta}/${randomUUID().slice(0, 12)}-${nome}.${ext}`;
    return json({ modo: "r2", urlEnvio: urlR2(cfg, "PUT", chave, 3600), urlPublica: publicaDe(cfg, chave) });
  },
});
export const POST = handler;
