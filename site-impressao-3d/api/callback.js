/* =================================================================
   Login do painel com GitHub — PASSO 2 (função da Vercel)
   -----------------------------------------------------------------
   O GitHub devolve a pessoa para cá com um "code". Esta função:
     1. confere o "state" com o cookie criado em /api/auth;
     2. troca o "code" por um token de acesso (usando o segredo,
        que fica só aqui no servidor — nunca vai para o navegador
        de ninguém além da própria pessoa que fez login);
     3. entrega o token para a janela do painel com postMessage,
        SOMENTE para a origem do próprio site.

   Variáveis de ambiente: OAUTH_GITHUB_CLIENT_ID e OAUTH_GITHUB_CLIENT_SECRET.
   Sem dependências: só módulos do próprio Node (fetch nativo).
   ================================================================= */
const crypto = require("crypto");

const STATE_COOKIE = "decap_oauth_state";
const PROVIDER = "github";

function siteOrigin(req) {
  // na Vercel o cabeçalho x-forwarded-proto sempre vem ("https")
  const proto = String(
    req.headers["x-forwarded-proto"] || (req.socket && req.socket.encrypted ? "https" : "http"),
  )
    .split(",")[0]
    .trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  return `${proto}://${host}`;
}

function parseCookies(header) {
  const out = {};
  String(header || "")
    .split(";")
    .forEach((part) => {
      const i = part.indexOf("=");
      if (i <= 0) return;
      try {
        out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
      } catch (e) {
        /* cookie malformado: ignora */
      }
    });
  return out;
}

function sameText(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

/** JSON seguro para colocar dentro de <script> */
function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(new RegExp(String.fromCharCode(0x2028), "g"), "\\u2028")
    .replace(new RegExp(String.fromCharCode(0x2029), "g"), "\\u2029");
}

/**
 * Página que conversa com o painel (protocolo do Decap CMS):
 *  - avisa o painel "authorizing:github";
 *  - quando o painel responde (e só se a resposta vier da origem do site),
 *    envia "authorization:github:success:{token}" ou ":error:{mensagem}".
 */
function sendResult(res, origin, status, payload) {
  const message = `authorization:${PROVIDER}:${status}:${JSON.stringify(payload)}`;
  const ok = status === "success";
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${ok ? "Login concluído" : "Não foi possível entrar"}</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0d0b11;color:#efeaf7;
       font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:center;padding:24px}
  p{max-width:34ch} .erro{color:#ff8a8a}
</style>
</head>
<body>
<p id="msg" class="${ok ? "" : "erro"}">${
    ok
      ? "Login concluído. Esta janela vai fechar sozinha…"
      : "Não foi possível entrar. Feche esta janela e tente de novo pelo painel."
  }</p>
<script>
(function () {
  var origin = ${jsonForScript(origin)};
  var message = ${jsonForScript(message)};
  if (!window.opener) {
    document.getElementById("msg").textContent =
      "Abra o painel pelo endereço /admin e clique em entrar com o GitHub.";
    return;
  }
  function receive(e) {
    if (e.origin !== origin) return;          // só conversa com o próprio site
    window.removeEventListener("message", receive, false);
    window.opener.postMessage(message, origin);
    ${ok ? "setTimeout(function () { window.close(); }, 600);" : ""}
  }
  window.addEventListener("message", receive, false);
  window.opener.postMessage("authorizing:${PROVIDER}", origin);
})();
</script>
</body>
</html>`;
  res.statusCode = ok ? 200 : 400;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
  );
  res.setHeader("Referrer-Policy", "no-referrer");
  res.end(html);
}

module.exports = async (req, res) => {
  const origin = siteOrigin(req);
  // o cookie só vale para uma tentativa: apaga sempre
  res.setHeader("Set-Cookie", `${STATE_COOKIE}=; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);

  const fail = (msg) => sendResult(res, origin, "error", { message: msg });

  const clientId = process.env.OAUTH_GITHUB_CLIENT_ID;
  const clientSecret = process.env.OAUTH_GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return fail("Login não configurado: faltam as variáveis OAUTH_GITHUB_CLIENT_ID / OAUTH_GITHUB_CLIENT_SECRET na Vercel.");
  }

  const url = new URL(req.url, "http://localhost");
  const error = url.searchParams.get("error");
  if (error) {
    return fail(
      error === "access_denied"
        ? "O acesso não foi autorizado no GitHub."
        : `O GitHub recusou o login (${error}).`,
    );
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const savedState = parseCookies(req.headers.cookie)[STATE_COOKIE];
  if (!code || !state || !savedState || !sameText(state, savedState)) {
    return fail("A tentativa de login expirou ou é inválida. Feche esta janela e entre de novo pelo painel.");
  }

  try {
    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "forgelab-painel",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: `${origin}/api/callback`,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) {
      console.error("GitHub token error:", response.status, data.error, data.error_description);
      return fail(
        data.error === "bad_verification_code"
          ? "O código de login expirou. Tente entrar de novo."
          : "Não foi possível concluir o login com o GitHub. Confira o Client ID e o Client Secret na Vercel.",
      );
    }
    return sendResult(res, origin, "success", { token: data.access_token, provider: PROVIDER });
  } catch (err) {
    console.error("Erro no login:", err);
    return fail("Não foi possível falar com o GitHub agora. Tente de novo em instantes.");
  }
};
