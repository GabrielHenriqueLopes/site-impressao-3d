/* =================================================================
   Cliente do Supabase (Auth + banco + arquivos) sem bibliotecas.
   Usa as APIs HTTP oficiais: /auth/v1 (login), /rest/v1 (banco,
   via PostgREST) e /storage/v1 (comprovantes).
   ================================================================= */
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const BASE = (SUPABASE_URL || '').replace(/\/+$/, '');
const SESSION_KEY = 'gestao.sessao';
const PAGE = 1000;               // limite padrão de linhas por resposta do Supabase

export const configurado = () => Boolean(BASE && SUPABASE_KEY);

export class ApiError extends Error {
  constructor(message, { status = 0, code = '', detalhe = '' } = {}) {
    super(message);
    this.status = status; this.code = code; this.detalhe = detalhe;
  }
}

/* ---------- sessão (guardada no navegador do usuário) ---------- */
let sessao = null;
const ouvintes = new Set();

function lerSessao() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}
function gravarSessao(s) {
  sessao = s;
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* navegador sem armazenamento: a sessão dura até fechar a aba */ }
  ouvintes.forEach((fn) => fn(s));
}
sessao = lerSessao();

export const onSessao = (fn) => { ouvintes.add(fn); return () => ouvintes.delete(fn); };
export const usuarioAtual = () => sessao?.user || null;

function normalizarSessao(d) {
  return {
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600),
    user: d.user,
  };
}

/* ---------- tradução de erros para mensagens claras ---------- */
function traduzir(status, body) {
  const code = body?.error_code || (typeof body?.code === 'string' ? body.code : '') || body?.error || '';
  const msg = body?.message || body?.msg || body?.error_description || '';
  const detalhe = [body?.details, body?.hint].filter(Boolean).join(' ');
  const map = {
    invalid_credentials: 'E-mail ou senha incorretos.',
    invalid_grant: 'E-mail ou senha incorretos.',
    email_not_confirmed: 'Confirme seu e-mail antes de entrar (veja a caixa de entrada).',
    user_banned: 'Este usuário está bloqueado.',
    over_request_rate_limit: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
    over_email_send_rate_limit: 'Muitos e-mails enviados. Aguarde alguns minutos.',
    weak_password: 'Senha fraca: use pelo menos 8 caracteres, misturando letras e números.',
    same_password: 'A nova senha precisa ser diferente da atual.',
    '23505': 'Já existe um registro igual (nome ou período repetido).',
    '23503': 'Este item está sendo usado por outros registros e não pode ser excluído. Você pode desativá-lo.',
    '23514': 'Algum valor informado é inválido. Confira os campos.',
    '42501': 'Você não tem permissão para esta ação.',
    PGRST301: 'Sua sessão expirou. Entre novamente.',
    PGRST204: 'O banco de dados está desatualizado para este recurso. No Supabase, rode de novo o arquivo gestao/supabase/schema.sql (SQL Editor → Run).',
    PGRST205: 'O banco de dados está desatualizado para este recurso. No Supabase, rode de novo o arquivo gestao/supabase/schema.sql (SQL Editor → Run).',
  };
  let texto = map[code];
  if (!texto && code === 'P0001') texto = msg;          // mensagens escritas no próprio banco
  if (!texto && /row-level security/i.test(msg)) texto = map['42501'];
  if (!texto && status === 401) texto = 'Sua sessão expirou. Entre novamente.';
  if (!texto && status === 403) texto = map['42501'];
  if (!texto && status === 413) texto = 'Arquivo grande demais (máximo 5 MB).';
  if (!texto) texto = msg || `Erro inesperado (${status}).`;
  return new ApiError(texto, { status, code: String(code), detalhe: detalhe || msg });
}

async function http(path, { method = 'GET', headers = {}, body, auth = true, raw = false, tentou = false } = {}) {
  if (!configurado()) throw new ApiError('O aplicativo ainda não está conectado ao banco de dados (veja js/config.js).');
  if (auth) await garantirToken();
  const h = { apikey: SUPABASE_KEY, ...headers };
  if (auth && sessao?.access_token) h.Authorization = `Bearer ${sessao.access_token}`;
  if (body !== undefined && !(body instanceof Blob) && !(body instanceof FormData)) {
    h['Content-Type'] = h['Content-Type'] || 'application/json';
  }
  let res;
  try {
    res = await fetch(BASE + path, {
      method, headers: h,
      body: body === undefined ? undefined : (body instanceof Blob || body instanceof FormData || typeof body === 'string') ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Sem conexão com o servidor. Verifique a internet e tente novamente.');
  }
  if (res.status === 401 && auth && sessao && !tentou) {
    // token pode ter sido invalidado: tenta renovar uma vez
    if (await renovar().catch(() => false)) return http(path, { method, headers, body, auth, raw, tentou: true });
    gravarSessao(null);
  }
  if (raw) return res;
  const txt = await res.text();
  let data = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  if (!res.ok) throw traduzir(res.status, data);
  return { data, res };
}

/* =================================================================
   AUTENTICAÇÃO
   ================================================================= */
let renovando = null;
async function renovar() {
  if (!sessao?.refresh_token) return false;
  if (!renovando) {
    renovando = (async () => {
      const res = await fetch(`${BASE}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: sessao.refresh_token }),
      });
      if (!res.ok) { gravarSessao(null); return false; }
      gravarSessao(normalizarSessao(await res.json()));
      return true;
    })().finally(() => { renovando = null; });
  }
  return renovando;
}

async function garantirToken() {
  if (!sessao) return;
  if (sessao.expires_at - 60 < Date.now() / 1000) {
    try { await renovar(); } catch { /* segue; a requisição dirá se falhou */ }
  }
}

export async function entrar(email, senha) {
  const { data } = await http('/auth/v1/token?grant_type=password', {
    method: 'POST', auth: false, body: { email: email.trim(), password: senha },
  });
  gravarSessao(normalizarSessao(data));
  return data.user;
}

export async function sair() {
  try { if (sessao) await http('/auth/v1/logout', { method: 'POST' }); } catch { /* sai mesmo assim */ }
  gravarSessao(null);
}

export async function recuperarSenha(email) {
  const volta = location.href.split('#')[0];
  await http(`/auth/v1/recover?redirect_to=${encodeURIComponent(volta)}`, {
    method: 'POST', auth: false, body: { email: email.trim() },
  });
}

export async function definirSenha(senha) {
  const { data } = await http('/auth/v1/user', { method: 'PUT', body: { password: senha } });
  if (sessao) gravarSessao({ ...sessao, user: data });
  return data;
}

/** Links de convite/recuperação do Supabase chegam com #access_token=…&type=… */
export function sessaoDoLink() {
  const h = new URLSearchParams(location.hash.replace(/^#/, ''));
  if (h.get('error_description')) {
    history.replaceState(null, '', location.pathname);
    return { erro: h.get('error_description').replace(/\+/g, ' ') };
  }
  if (!h.get('access_token')) return null;
  const tipo = h.get('type');
  gravarSessao(normalizarSessao({
    access_token: h.get('access_token'),
    refresh_token: h.get('refresh_token'),
    expires_in: Number(h.get('expires_in')) || 3600,
    expires_at: Number(h.get('expires_at')) || undefined,
    user: null,
  }));
  history.replaceState(null, '', location.pathname);
  return { tipo };
}

export async function carregarUsuario() {
  if (!sessao) return null;
  const { data } = await http('/auth/v1/user');
  gravarSessao({ ...sessao, user: data });
  return data;
}

/* =================================================================
   BANCO DE DADOS (PostgREST)
   ================================================================= */
const qs = (params = {}) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.append(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};

/** Lê todas as linhas (com paginação automática). */
export async function listar(tabela, params = {}) {
  const linhas = [];
  for (let de = 0; ; de += PAGE) {
    const { data } = await http(`/rest/v1/${tabela}${qs({ select: '*', ...params })}`, {
      headers: { 'Range-Unit': 'items', Range: `${de}-${de + PAGE - 1}` },
    });
    linhas.push(...data);
    if (data.length < PAGE) break;
  }
  return linhas;
}

export async function inserir(tabela, linhas) {
  const { data } = await http(`/rest/v1/${tabela}`, {
    method: 'POST', headers: { Prefer: 'return=representation' }, body: linhas,
  });
  return data;
}

export async function salvarVarios(tabela, linhas) {
  // upsert por id (usado na restauração de backup)
  const { data } = await http(`/rest/v1/${tabela}?on_conflict=id`, {
    method: 'POST', headers: { Prefer: 'return=representation,resolution=merge-duplicates' }, body: linhas,
  });
  return data;
}

export async function atualizar(tabela, filtro, patch) {
  const { data } = await http(`/rest/v1/${tabela}${qs(filtro)}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body: patch,
  });
  if (!data || !data.length) throw new ApiError('Nada foi alterado: o registro não existe mais ou você não tem permissão.');
  return data;
}

export async function excluir(tabela, filtro) {
  const { data } = await http(`/rest/v1/${tabela}${qs(filtro)}`, {
    method: 'DELETE', headers: { Prefer: 'return=representation' },
  });
  if (!data || !data.length) throw new ApiError('Nada foi excluído: o registro não existe mais ou você não tem permissão.');
  return data;
}

export async function rpc(fn, args = {}) {
  const { data } = await http(`/rest/v1/rpc/${fn}`, { method: 'POST', body: args });
  return data;
}

/* =================================================================
   ARQUIVOS (comprovantes, bucket privado)
   ================================================================= */
const BUCKET = 'comprovantes';
const TIPOS_OK = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export async function enviarComprovante(arquivo, pasta) {
  if (!TIPOS_OK.includes(arquivo.type)) throw new ApiError('Formato não aceito. Envie PDF, JPG, PNG ou WebP.');
  if (arquivo.size > 5 * 1024 * 1024) throw new ApiError('Arquivo grande demais (máximo 5 MB).');
  const ext = (arquivo.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
  const caminho = `${pasta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  await http(`/storage/v1/object/${BUCKET}/${caminho}`, {
    method: 'POST', headers: { 'Content-Type': arquivo.type, 'x-upsert': 'false' }, body: arquivo,
  });
  return caminho;
}

export async function linkComprovante(caminho) {
  const { data } = await http(`/storage/v1/object/sign/${BUCKET}/${caminho}`, {
    method: 'POST', body: { expiresIn: 300 },
  });
  const url = data.signedURL || data.signedUrl;
  return url.startsWith('http') ? url : `${BASE}/storage/v1${url}`;
}

export async function apagarComprovante(caminho) {
  await http(`/storage/v1/object/${BUCKET}`, { method: 'DELETE', body: { prefixes: [caminho] } });
}
