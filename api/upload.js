// Gera a autorização para o navegador enviar o arquivo direto ao Vercel Blob
import { handleUpload } from "@vercel/blob/client";
import { json, lerConfig, senhaConfere } from "./_lib.js";

const TIPOS = ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm", "video/quicktime"];

export default async function handler(request) {
  if (request.method !== "POST") return json({ erro: "Método não permitido" }, 405);
  let body;
  try { body = await request.json(); } catch { return json({ erro: "Pedido inválido" }, 400); }

  try {
    const resposta = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let p = {};
        try { p = JSON.parse(clientPayload || "{}"); } catch {}
        const admin = senhaConfere(p.senha);
        if (!admin) {
          const cfg = await lerConfig();
          if (!cfg.envioAberto) throw new Error("O envio de fotos está encerrado.");
          const codigo = process.env.CODIGO_FESTA || "";
          if (codigo && String(p.codigo || "").trim().toLowerCase() !== codigo.trim().toLowerCase())
            throw new Error("Código da festa incorreto.");
          if (!/^(midia|capas)\//.test(pathname)) throw new Error("Caminho não permitido.");
        }
        return {
          allowedContentTypes: TIPOS,
          maximumSizeInBytes: 500 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {},
    });
    return json(resposta);
  } catch (e) {
    return json({ erro: e.message || "Não foi possível autorizar o envio." }, 400);
  }
}
