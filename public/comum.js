/* Funções usadas pelo álbum (index.html) e pelo painel (admin.html) */
(function () {
  var A = (window.Album = {});
  A.$ = function (id) { return document.getElementById(id); };

  A.toast = function (msg) {
    var t = A.$("toast"); if (!t) return;
    t.textContent = msg; t.hidden = false;
    clearTimeout(A.toast._t); A.toast._t = setTimeout(function () { t.hidden = true; }, 3500);
  };
  A.hash = function (s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; };
  A.quando = function (iso) { try { return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } };
  A.mb = function (n) { return (n / 1048576).toFixed(n < 10485760 ? 1 : 0).replace(".", ",") + " MB"; };

  // chamada à API; lança Error com a mensagem do servidor
  A.api = async function (caminho, opcoes) {
    opcoes = opcoes || {};
    var headers = { "Content-Type": "application/json" };
    if (opcoes.senha) headers["x-admin-senha"] = opcoes.senha;
    var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, 25000), r;
    try { r = await fetch(caminho, { method: opcoes.metodo || "GET", headers: headers, body: opcoes.corpo ? JSON.stringify(opcoes.corpo) : undefined, cache: "no-store", signal: ctl.signal }); }
    catch (e) { throw new Error("O servidor não respondeu. Verifique a internet e tente de novo."); }
    finally { clearTimeout(t); }
    var d = {}; try { d = await r.json(); } catch (e) {}
    if (!r.ok) { var err = new Error(d.erro || "Algo deu errado. Tente de novo."); err.status = r.status; throw err; }
    return d;
  };

  A.guardar = function (k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} };
  A.ler = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };

  A.sha256 = async function (txt) {
    var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt));
    return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  };

  /* ---------- envio ao Vercel Blob ---------- */
  A.enviarBlob = async function (blob, pasta, nome, payload, progresso) {
    if (!window.enviarParaBlob) throw new Error("O envio ainda está carregando. Recarregue a página.");
    var ext = (blob.type.split("/")[1] || "bin").replace("quicktime", "mov").replace("jpeg", "jpg");
    var limpo = String(nome || "arquivo").toLowerCase().replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "arquivo";
    // cancela se ficar 45 s sem nenhum progresso
    var ctl = new AbortController(), parado = null;
    function vigiar() { clearTimeout(parado); parado = setTimeout(function () { ctl.abort(); }, 45000); }
    vigiar();
    try {
    var r = await window.enviarParaBlob(pasta + "/" + limpo + "." + ext, blob, {
      abortSignal: ctl.signal,
      access: "public",
      handleUploadUrl: "/api/upload",
      clientPayload: JSON.stringify(payload || {}),
      contentType: blob.type,
      multipart: blob.size > 100 * 1024 * 1024,
      onUploadProgress: function (e) { vigiar(); if (progresso) progresso(Math.round(e.percentage || 0)); },
    });
    } catch (e) {
      if (ctl.signal.aborted) throw new Error("O envio travou. Verifique a internet e toque em Tentar de novo.");
      throw e;
    } finally { clearTimeout(parado); }
    return r.url;
  };

  /* ---------- fotos: reduz no aparelho ---------- */
  A.reduzir = function (file, max, qualidade) {
    max = max || 2000; qualidade = qualidade || 0.82;
    return new Promise(function (res) {
      if (file.type === "image/gif") { res(file); return; }
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
        var c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        c.toBlob(function (b) { res(b || file); }, "image/jpeg", qualidade);
      };
      img.onerror = function () { URL.revokeObjectURL(url); res(null); };
      img.src = url;
    });
  };

  /* ---------- vídeos: recodifica em 720p no aparelho ---------- */
  var actx = null;
  A.prepararAudio = function () {
    try {
      if (!actx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC(); }
      if (actx && actx.state === "suspended") actx.resume();
    } catch (e) {}
  };
  A.escolherMime = function () {
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return "";
    var l = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    for (var i = 0; i < l.length; i++) { try { if (MediaRecorder.isTypeSupported(l[i])) return l[i]; } catch (e) {} }
    return "";
  };
  A.comprimirVideo = function (file, progresso) {
    return new Promise(function (resolve, reject) {
      var mime = A.escolherMime(); if (!mime) { reject({ code: "sem_suporte" }); return; }
      var base = mime.split(";")[0], url = URL.createObjectURL(file);
      var v = document.createElement("video"); v.playsInline = true; v.preload = "auto"; v.muted = false;
      v.setAttribute("playsinline", ""); v.style.cssText = "position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:.01;pointer-events:none";
      document.body.appendChild(v);
      var trava = null, terminou = false;
      function limpar() { terminou = true; try { v.pause(); } catch (e) {} v.removeAttribute("src"); v.remove(); URL.revokeObjectURL(url); if (trava) { try { trava.release(); } catch (e) {} } }
      v.onerror = function () { if (!terminou) { limpar(); reject({ code: "nao_decodifica" }); } };
      v.onloadedmetadata = function () {
        var w = v.videoWidth, h = v.videoHeight; if (!w || !h) { limpar(); reject({ code: "nao_decodifica" }); return; }
        var k = Math.min(1, 1280 / Math.max(w, h)), cw = Math.max(2, Math.round(w * k / 2) * 2), ch = Math.max(2, Math.round(h * k / 2) * 2);
        var cv = document.createElement("canvas"); cv.width = cw; cv.height = ch; var cx = cv.getContext("2d");
        var stream = cv.captureStream(30), temAudio = false;
        try { if (actx) { var f = actx.createMediaElementSource(v), d = actx.createMediaStreamDestination(); f.connect(d); d.stream.getAudioTracks().forEach(function (t) { stream.addTrack(t); }); temAudio = true; } } catch (e) {}
        if (!temAudio) v.muted = true;
        var dur = isFinite(v.duration) ? v.duration : 0, pedacos = [], capaP = null, desenhando = true;
        var rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1100000, audioBitsPerSecond: 96000 });
        rec.ondataavailable = function (e) { if (e.data && e.data.size) pedacos.push(e.data); };
        function desenhar() {
          if (!desenhando) return;
          if (v.readyState >= 2) cx.drawImage(v, 0, 0, cw, ch);
          if (!capaP && v.currentTime > 0.3) {
            var kc = Math.min(1, 640 / Math.max(cw, ch)), cc = document.createElement("canvas");
            cc.width = Math.round(cw * kc); cc.height = Math.round(ch * kc); cc.getContext("2d").drawImage(cv, 0, 0, cc.width, cc.height);
            capaP = new Promise(function (r) { cc.toBlob(r, "image/jpeg", 0.75); });
          }
          if (dur) progresso(Math.min(99, Math.round(v.currentTime / dur * 100)));
          requestAnimationFrame(desenhar);
        }
        v.onended = function () {
          desenhando = false;
          rec.onstop = async function () {
            stream.getTracks().forEach(function (t) { t.stop(); });
            var capa = capaP ? await capaP : null; limpar();
            if (!pedacos.length) { reject({ code: "nao_decodifica" }); return; }
            resolve({ video: new Blob(pedacos, { type: base }), capa: capa });
          };
          rec.stop();
        };
        try { if (navigator.wakeLock) navigator.wakeLock.request("screen").then(function (l) { trava = l; }).catch(function () {}); } catch (e) {}
        if (v.readyState >= 2) cx.drawImage(v, 0, 0, cw, ch);
        rec.start(1000);
        v.play().then(function () { requestAnimationFrame(desenhar); }).catch(function (e) {
          try { rec.stop(); } catch (x) {} stream.getTracks().forEach(function (t) { t.stop(); }); limpar();
          reject({ code: e && e.name === "NotAllowedError" ? "precisa_toque" : "nao_decodifica" });
        });
      };
      v.src = url;
    });
  };
  // primeiro quadro de um vídeo pequeno, para servir de capa
  A.capaDeVideo = function (file) {
    return new Promise(function (res) {
      var url = URL.createObjectURL(file), v = document.createElement("video"); v.muted = true; v.playsInline = true; v.preload = "auto";
      var feito = false; function fim(b) { if (feito) return; feito = true; URL.revokeObjectURL(url); res(b); }
      v.onloadeddata = function () { v.currentTime = Math.min(0.5, (v.duration || 1) / 2); };
      v.onseeked = function () {
        var k = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight)), c = document.createElement("canvas");
        c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
        try { c.getContext("2d").drawImage(v, 0, 0, c.width, c.height); c.toBlob(fim, "image/jpeg", 0.75); } catch (e) { fim(null); }
      };
      v.onerror = function () { fim(null); };
      setTimeout(function () { fim(null); }, 8000);
      v.src = url;
    });
  };

  /* ---------- confete ---------- */
  A.confete = function () {
    var cv = A.$("confete");
    var reduz = false; try { reduz = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
    if (reduz || !cv || !cv.getContext) { if (cv) cv.remove(); return; }
    var cx = cv.getContext("2d"), W, H, dpr = Math.min(2, window.devicePixelRatio || 1);
    function tam() { W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    tam(); addEventListener("resize", tam);
    var cs = getComputedStyle(document.documentElement);
    var cores = ["--accent", "--coral", "--sun", "--mint", "--sky"].map(function (v) { return cs.getPropertyValue(v).trim() || "#e86a9a"; }).concat(["#ffffff"]);
    var ps = []; for (var i = 0; i < 110; i++) ps.push({ x: Math.random() * W, y: -20 - Math.random() * H * 0.6, vx: (Math.random() - 0.5) * 1.2, vy: 1.6 + Math.random() * 2.2, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.2, w: 5 + Math.random() * 6, h: 7 + Math.random() * 8, c: cores[i % cores.length], bola: i % 4 === 0 });
    var t0 = performance.now();
    function passo(t) {
      var dt = t - t0; cx.clearRect(0, 0, W, H); var vivos = 0;
      ps.forEach(function (p) {
        p.x += p.vx + Math.sin(t / 400 + p.r) * 0.6; p.y += p.vy; p.r += p.vr; if (p.y < H + 20) vivos++;
        cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.fillStyle = p.c; cx.globalAlpha = dt > 3500 ? Math.max(0, 1 - (dt - 3500) / 1000) : 1;
        if (p.bola) { cx.beginPath(); cx.arc(0, 0, p.w / 2, 0, 6.28); cx.fill(); } else cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * 0.5);
        cx.restore();
      });
      if (vivos && dt < 4500) requestAnimationFrame(passo); else cv.remove();
    }
    requestAnimationFrame(passo);
  };
})();
