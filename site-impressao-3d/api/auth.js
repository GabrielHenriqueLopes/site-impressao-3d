/* =================================================================
   Login do painel com GitHub — PASSO 1 (função da Vercel)
   -----------------------------------------------------------------
   O painel (/admin) abre esta página numa janela. Ela:
     1. cria um código aleatório ("state") e guarda num cookie seguro;
     2. manda a pessoa para o GitHub autorizar o acesso.
   O GitHub devolve a pessoa para /api/callback (ver callback.js).

   Variáveis de ambiente (Vercel → Settings → Environment Variables):
     OAUTH_GITHUB_CLIENT_ID      — "Client ID" do OAuth App no GitHub
     OAUTH_GITHUB_CLIENT_SECRET  — usado só no callback.js
   Sem dependências: só módulos do próprio Node.
   ================================================================= */
const crypto = require("crypto");

const STATE_COOKIE = "decap_oauth_state";

/** endereço do site que recebeu o pedido (ex.: https://forgelab-sandy.vercel.app) */
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

function sendText(res, status, message) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(message);
}

module.exports = (req, res) => {
  const clientId = process.env.OAUTH_GITHUB_CLIENT_ID;
  if (!clientId) {
    return sendText(
      res,
      500,
      "Login ainda não configurado: falta a variável OAUTH_GITHUB_CLIENT_ID na Vercel (Settings → Environment Variables → Production) e um novo deploy.",
    );
  }

  const url = new URL(req.url, "http://localhost");
  const provider = url.searchParams.get("provider") || "github";
  if (provider !== "github") return sendText(res, 400, "Provedor de login não suportado.");

  // o Decap pede "repo" (precisa gravar no repositório); só aceitamos escopos simples
  const scope = url.searchParams.get("scope") || "repo";
  if (!/^[a-z_:,\s]{1,100}$/i.test(scope)) return sendText(res, 400, "Escopo inválido.");

  // código aleatório que o callback vai conferir (protege contra login forjado)
  const state = crypto.randomBytes(32).toString("hex");
  res.setHeader(
    "Set-Cookie",
    `${STATE_COOKIE}=${state}; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
  );

  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", `${siteOrigin(req)}/api/callback`);
  authorize.searchParams.set("scope", scope);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("allow_signup", "false");

  res.statusCode = 302;
  res.setHeader("Location", authorize.toString());
  res.setHeader("Cache-Control", "no-store");
  res.end();
};
