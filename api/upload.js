// Gera o endereço assinado para o navegador enviar o arquivo direto ao Vercel Blob
import { issueSignedToken } from "@vercel/blob";
import { handleUploadPresigned } from "@vercel/blob/client";
import { json, lerConfig, senhaConfere, tokenBlob } from "./_lib.js";

const TIPOS = ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm", "video/quicktime"];
const MAXIMO = 500 * 1024 * 1024;

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ erro: "Pedido inválido" }, 400); }

  try {
    const resposta = await handleUploadPresigned({
      body,
      request,
      getSignedToken: async (pathname, clientPayload) => {
        let p = {};
        try { p = JSON.parse(clientPayload || "{}"); } catch {}
        if (!senhaConfere(p.senha)) {
          const cfg = await lerConfig();
          if (!cfg.envioAberto) throw new Error("O envio de fotos está encerrado.");
          const codigo = process.env.CODIGO_FESTA || "";
          if (codigo && String(p.codigo || "").trim().toLowerCase() !== codigo.trim().toLowerCase())
            throw new Error("Código da festa incorreto.");
          if (!/^(midia|capas)\//.test(pathname)) throw new Error("Caminho não permitido.");
        }
        const extra = tokenBlob() ? { token: tokenBlob() } : {};
        const token = await issueSignedToken({
          pathname,
          operations: ["put"],
          allowedContentTypes: TIPOS,
          maximumSizeInBytes: MAXIMO,
          validUntil: Date.now() + 60 * 60 * 1000,
          ...extra,
        });
        return {
          token,
          urlOptions: {
            allowedContentTypes: TIPOS,
            maximumSizeInBytes: MAXIMO,
            validUntil: Date.now() + 30 * 60 * 1000,
            addRandomSuffix: true,
            allowOverwrite: false,
            cacheControlMaxAge: 365 * 24 * 60 * 60,
          },
        };
      },
      onUploadCompleted: async () => {},
    });
    return json(resposta);
  } catch (e) {
    console.error("upload", e);
    return json({ erro: e.message || "Não foi possível autorizar o envio." }, 400);
  }
}
