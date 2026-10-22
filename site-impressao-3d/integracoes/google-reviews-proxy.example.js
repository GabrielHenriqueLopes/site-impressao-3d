/**
 * EXEMPLO (opcional) — Proxy seguro para avaliações do Google
 * ------------------------------------------------------------
 * Por que um proxy? A chave da Google Maps Platform NÃO deve ficar no
 * JavaScript do navegador. Este pequeno servidor guarda a chave em uma
 * variável de ambiente, consulta a Places API (New) e devolve ao site
 * apenas os dados públicos necessários.
 *
 * Como usar:
 *   1. No Google Cloud, ative a "Places API (New)" e crie uma chave restrita
 *      a essa API (e, se possível, ao IP/domínio do seu servidor).
 *   2. Descubra o Place ID do estabelecimento (ferramenta "Place ID Finder"
 *      na documentação da Google Maps Platform).
 *   3. Rode com Node 18+:
 *        GOOGLE_MAPS_API_KEY=suachave PLACE_ID=seuplaceid ALLOWED_ORIGIN=https://seusite.com.br node google-reviews-proxy.example.js
 *   4. Em script.js, defina SITE_CONFIG.reviews.proxyEndpoint = 'https://seu-servidor/avaliacoes'
 *
 * Também pode ser adaptado para funções serverless (Vercel, Netlify, Cloudflare Workers).
 * Observações: a API devolve no máximo 5 avaliações por consulta; respeite os
 * termos da Google Maps Platform (atribuição "Google", nome do autor e limites de cache).
 */
const http = require('node:http');

const API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const PLACE_ID = process.env.PLACE_ID;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const PORT = process.env.PORT || 8787;
const CACHE_MS = 60 * 60 * 1000; // 1 hora

let cache = { at: 0, body: null };

async function fetchReviews() {
  if (cache.body && Date.now() - cache.at < CACHE_MS) return cache.body;
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(PLACE_ID)}?languageCode=pt-BR`, {
    headers: {
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': 'rating,userRatingCount,reviews,googleMapsUri',
    },
  });
  if (!res.ok) throw new Error(`Places API: HTTP ${res.status}`);
  const place = await res.json();
  const body = {
    rating: place.rating ?? null,
    count: place.userRatingCount ?? null,
    url: place.googleMapsUri || '',
    reviews: (place.reviews || []).map((r) => ({
      author: r.authorAttribution?.displayName || '',
      rating: r.rating ?? null,
      text: r.text?.text || r.originalText?.text || '',
      date: r.relativePublishTimeDescription || '',
    })).filter((r) => r.text),
  };
  cache = { at: Date.now(), body };
  return body;
}

http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (!req.url.startsWith('/avaliacoes')) { res.statusCode = 404; return res.end('{}'); }
  try {
    res.end(JSON.stringify(await fetchReviews()));
  } catch (err) {
    console.error(err);
    res.statusCode = 502;
    res.end(JSON.stringify({ error: 'Não foi possível obter as avaliações.' }));
  }
}).listen(PORT, () => console.log(`Proxy de avaliações em http://localhost:${PORT}/avaliacoes`));
