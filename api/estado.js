// Tudo o que a página precisa: configuração + fotos/vídeos. Responde só "igual" se nada mudou.
import { rota, json, redis, limparConfig } from "./_lib.js";
import { r2Config } from "./_r2.js";

const handler = rota({
  GET: async (request) => {
    const v = new URL(request.url).searchParams.get("v");
    const [versao] = await redis(["GET", "versao"]);
    const atual = String(versao || 0);
    if (v !== null && v === atual) return json({ versao: atual, igual: true });
    const [cfgBruto, hash, bytes] = await redis(["GET", "config"], ["HGETALL", "midia"], ["GET", "bytes"]);
    let cfg = {};
    try { cfg = cfgBruto ? JSON.parse(cfgBruto) : {}; } catch {}
    const itens = [];
    for (let i = 0; i < (hash || []).length; i += 2) {
      try { itens.push(JSON.parse(hash[i + 1])); } catch {}
    }
    itens.sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
    return json({
      versao: atual,
      config: limparConfig(cfg),
      precisaCodigo: !!process.env.CODIGO_FESTA,
      itens,
      bytes: Number(bytes || 0),
      armazenamento: r2Config() ? "cloudflare" : "vercel",
      limiteBytes: r2Config() ? 10 * 1024 ** 3 : 1024 ** 3,
    });
  },
});

export const GET = handler;
