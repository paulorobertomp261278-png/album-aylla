// Salvar as configurações do painel admin
import { del } from "@vercel/blob";
import { rota, json, redis, ErroApp, exigirAdmin, limparConfig, lerConfig, urlDoBlob , tokenBlob } from "./_lib.js";

const handler = rota({
  PUT: async (request) => {
    exigirAdmin(request);
    let b;
    try { b = await request.json(); } catch { throw new ErroApp(400, "Pedido inválido."); }
    const antes = await lerConfig();
    const cfg = limparConfig(b);
    await redis(["SET", "config", JSON.stringify(cfg)], ["INCR", "versao"]);
    // se a imagem do topo foi trocada, apaga a antiga
    if (urlDoBlob(antes.imagem) && antes.imagem !== cfg.imagem) { try { await del(antes.imagem, tokenBlob() ? { token: tokenBlob() } : undefined); } catch {} }
    return json({ ok: true, config: cfg });
  },
});

export const PUT = handler;
