// Confere a senha do painel admin
import { rota, json, ErroApp, senhaConfere } from "./_lib.js";

export default rota({
  POST: async (request) => {
    if (!process.env.ADMIN_SENHA) throw new ErroApp(500, "Defina a variável ADMIN_SENHA na Vercel.");
    let b = {};
    try { b = await request.json(); } catch {}
    await new Promise((r) => setTimeout(r, 400)); // freia tentativas repetidas
    if (!senhaConfere(b.senha)) throw new ErroApp(401, "Senha incorreta.");
    return json({ ok: true });
  },
});
