/* Aplicativo de gestão — inicialização, login e navegação. */
import * as api from './api.js';
import { S, carregarPerfil, carregarTudo, onMudanca, onAvisos, atualizarAvisos, naoLidas } from './store.js';
import { notificarNovos, registrarServiceWorker } from './notificar.js';
import { $, $$, icon, toast, erro, ocupado } from './ui.js';
import { esc, PAPEIS } from './format.js';
import { abrirLancamento } from './views/lancamento-form.js';
import { rotaAtual } from './nav.js';

const ROTAS = {
  '': { titulo: 'Painel', icone: 'grid', mod: () => import('./views/painel.js') },
  pedidos: { titulo: 'Pedidos e produção', curto: 'Pedidos', icone: 'printer', mod: () => import('./views/pedidos.js') },
  avisos: { titulo: 'Avisos', icone: 'bell', mod: () => import('./views/avisos.js') },
  lancamentos: { titulo: 'Lançamentos', icone: 'list', mod: () => import('./views/lancamentos.js') },
  contas: { titulo: 'Contas a pagar e receber', curto: 'A pagar e receber', icone: 'calendar', mod: () => import('./views/contas.js') },
  orcamento: { titulo: 'Orçamento', icone: 'wallet', mod: () => import('./views/orcamento.js') },
  resultados: { titulo: 'Lucro e fluxo de caixa', curto: 'Lucro e caixa', icone: 'chart', mod: () => import('./views/resultados.js') },
  metas: { titulo: 'Metas e insights', curto: 'Metas', icone: 'target', mod: () => import('./views/metas.js') },
  config: { titulo: 'Configurações', icone: 'settings', mod: () => import('./views/config.js') },
};

const app = $('#app');

/* ---------------- telas fora do sistema ---------------- */
function telaCentral(html) {
  app.innerHTML = `<main class="auth"><div class="auth-card">
    <div class="auth-brand">${marca()}</div>${html}</div>
    <p class="auth-foot">Área restrita · gestão administrativa e financeira</p></main>`;
}
const marca = () => `<span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32" width="30" height="30"><g fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 24h20M8 20h16M10 16h12"/><path d="M16 4c3.5 4.2 5 6.6 5 8.6a5 5 0 0 1-10 0c0-2 1.5-4.4 5-8.6Z" fill="var(--accent)" stroke="none"/></g></svg></span>
  <span class="brand-txt"><strong>${esc(S.empresa?.nome && S.empresa.nome !== 'Meu ateliê' ? S.empresa.nome : 'Ateliê')}</strong><small>Gestão</small></span>`;

function telaNaoConfigurado() {
  telaCentral(`<h1>Falta conectar o banco de dados</h1>
    <p>O aplicativo está instalado, mas ainda não sabe qual projeto do Supabase usar.</p>
    <ol class="setup-steps">
      <li>Crie o projeto gratuito no Supabase e rode o arquivo <code>gestao/supabase/schema.sql</code> no <em>SQL Editor</em>.</li>
      <li>Copie a <em>Project URL</em> e a chave pública (<em>publishable</em> ou <em>anon</em>) para <code>gestao/js/config.js</code>.</li>
      <li>Publique o site de novo e recarregue esta página.</li>
    </ol>
    <p class="muted">O passo a passo completo está em <code>gestao/LEIA-ME.md</code>.</p>`);
}

function telaLogin(msg = '') {
  telaCentral(`<h1>Entrar</h1>
    ${msg ? `<p class="auth-msg">${esc(msg)}</p>` : ''}
    <form class="form" data-login novalidate>
      <div class="field"><label for="l-email">E-mail</label><input id="l-email" name="email" type="email" autocomplete="username" required></div>
      <div class="field"><label for="l-senha">Senha</label><input id="l-senha" name="senha" type="password" autocomplete="current-password" required></div>
      <p class="field-error" data-erro role="alert" hidden></p>
      <button class="btn btn-accent btn-block" type="submit" data-busy="Entrando…">Entrar</button>
      <button class="btn-link" type="button" data-esqueci>Esqueci minha senha</button>
    </form>`);
  const form = $('[data-login]');
  const err = $('[data-erro]');
  form.email.focus();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    err.hidden = true;
    if (!form.email.value.includes('@') || !form.senha.value) { err.textContent = 'Informe e-mail e senha.'; err.hidden = false; return; }
    ocupado(form.querySelector('[type=submit]'), async () => {
      try { await api.entrar(form.email.value, form.senha.value); await iniciar(); } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    });
  });
  $('[data-esqueci]').addEventListener('click', () => telaRecuperar(form.email.value));
}

function telaRecuperar(email = '') {
  telaCentral(`<h1>Recuperar senha</h1>
    <p>Enviaremos um link para você criar uma nova senha.</p>
    <form class="form" data-rec novalidate>
      <div class="field"><label for="r-email">E-mail</label><input id="r-email" name="email" type="email" value="${esc(email)}" required></div>
      <p class="field-error" data-erro role="alert" hidden></p>
      <button class="btn btn-accent btn-block" type="submit" data-busy="Enviando…">Enviar link</button>
      <button class="btn-link" type="button" data-voltar>Voltar para o login</button>
    </form>`);
  const form = $('[data-rec]');
  form.email.focus();
  $('[data-voltar]').addEventListener('click', () => telaLogin());
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    ocupado(form.querySelector('[type=submit]'), async () => {
      try { await api.recuperarSenha(form.email.value); telaLogin('Se o e-mail estiver cadastrado, o link chega em alguns minutos. Confira também o spam.'); } catch (ex) { const p = $('[data-erro]'); p.textContent = ex.message; p.hidden = false; }
    });
  });
}

function telaNovaSenha(tipo) {
  telaCentral(`<h1>${tipo === 'invite' ? 'Bem-vindo! Crie sua senha' : 'Criar nova senha'}</h1>
    <form class="form" data-senha novalidate>
      <div class="field"><label for="s1">Nova senha</label><input id="s1" name="s1" type="password" autocomplete="new-password" minlength="8" required>
        <p class="field-help">Mínimo de 8 caracteres, com letras e números.</p></div>
      <div class="field"><label for="s2">Repita a senha</label><input id="s2" name="s2" type="password" autocomplete="new-password" required></div>
      <p class="field-error" data-erro role="alert" hidden></p>
      <button class="btn btn-accent btn-block" type="submit">Salvar senha e entrar</button>
    </form>`);
  const form = $('[data-senha]');
  const err = $('[data-erro]');
  form.s1.focus();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const a = form.s1.value; const b = form.s2.value;
    const falha = a.length < 8 ? 'A senha precisa ter pelo menos 8 caracteres.'
      : !/[a-zA-Z]/.test(a) || !/\d/.test(a) ? 'Use letras e números na senha.'
      : a !== b ? 'As duas senhas não são iguais.' : '';
    if (falha) { err.textContent = falha; err.hidden = false; return; }
    ocupado(form.querySelector('[type=submit]'), async () => {
      try { await api.definirSenha(a); toast('Senha salva.'); await iniciar(); } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    });
  });
}

function telaSemAcesso(perfil) {
  telaCentral(`<h1>Acesso aguardando liberação</h1>
    <p>Sua conta${perfil?.email ? ` (<strong>${esc(perfil.email)}</strong>)` : ''} foi criada, mas um administrador ainda precisa liberar o acesso em <em>Configurações → Usuários</em>.</p>
    <button class="btn btn-ghost btn-block" type="button" data-sair>Sair</button>`);
  $('[data-sair]').addEventListener('click', async () => { await api.sair(); telaLogin(); });
}

/* ---------------- sistema ---------------- */
function montarShell() {
  const nav = Object.entries(ROTAS).map(([k, r]) => `<li><a href="#/${k}" data-rota="${k}">${icon(r.icone)}<span>${esc(r.curto || r.titulo)}</span>${k === 'avisos' ? '<span class="badge" data-badge hidden></span>' : ''}</a></li>`).join('');
  app.innerHTML = `
  <div class="shell">
    <aside class="sidebar" data-sidebar>
      <a class="brand" href="#/">${marca()}</a>
      <nav aria-label="Módulos"><ul class="nav">${nav}</ul></nav>
      <div class="side-foot">
        <div class="me"><span class="avatar" aria-hidden="true">${esc((S.perfil.nome || '?').slice(0, 1).toUpperCase())}</span>
          <span><strong>${esc(S.perfil.nome || S.perfil.email || '')}</strong><small>${PAPEIS[S.perfil.papel]}</small></span></div>
        <button class="btn btn-ghost btn-sm" type="button" data-sair>${icon('logout')} Sair</button>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="icon-btn menu-btn" type="button" data-menu aria-label="Abrir menu" aria-expanded="false">${icon('menu')}</button>
        <h1 class="page-title" data-titulo></h1>
        <div class="top-actions">
          <a class="icon-btn bell" href="#/avisos" aria-label="Avisos" data-sino>${icon('bell')}<span class="badge" data-badge hidden></span></a>
          <button class="btn btn-sm btn-accent" type="button" data-novo-pedido>${icon('plus')}<span>Pedido</span></button>
          <button class="btn btn-sm btn-outline-ok" type="button" data-novo="receita">${icon('plus')}<span>Receita</span></button>
          <button class="btn btn-sm btn-outline-bad" type="button" data-novo="despesa">${icon('plus')}<span>Despesa</span></button>
        </div>
      </header>
      <main id="conteudo" class="content" tabindex="-1"></main>
    </div>
    <nav class="bottom-nav" aria-label="Atalhos">
      ${[['', 'Painel'], ['pedidos', 'Pedidos'], ['lancamentos', 'Lançamentos'], ['contas', 'Contas']].map(([k, t]) => `<a href="#/${k}" data-rota="${k}">${icon(ROTAS[k].icone)}<span>${t}</span></a>`).join('')}
      <button type="button" data-menu>${icon('menu')}<span>Mais</span></button>
    </nav>
    <div class="scrim" data-scrim hidden></div>
  </div>`;
  $('[data-sair]').addEventListener('click', async () => { await api.sair(); location.hash = ''; telaLogin(); });
  $$('[data-novo]').forEach((b) => b.addEventListener('click', () => abrirLancamento({ tipo: b.dataset.novo })));
  $('[data-novo-pedido]').addEventListener('click', async () => {
    if (!S.moduloPedidos) { location.hash = '#/pedidos'; return; }
    (await import('./views/pedido-form.js')).abrirPedido();
  });
  if (!S.moduloPedidos) $('[data-novo-pedido]').hidden = true;
  atualizarSino();
  const side = $('[data-sidebar]');
  const scrim = $('[data-scrim]');
  const abrir = (v) => {
    side.classList.toggle('aberta', v); scrim.hidden = !v;
    $$('[data-menu]').forEach((b) => b.setAttribute('aria-expanded', String(v)));
    if (v) side.querySelector('a')?.focus();
  };
  $$('[data-menu]').forEach((b) => b.addEventListener('click', () => abrir(!side.classList.contains('aberta'))));
  scrim.addEventListener('click', () => abrir(false));
  side.addEventListener('click', (e) => { if (e.target.closest('a')) abrir(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && side.classList.contains('aberta')) abrir(false); });
}

let viewAtual = null;
let token = 0;
async function renderRota() {
  const { nome, params } = rotaAtual();
  const r = ROTAS[nome];
  $$('[data-rota]').forEach((a) => (a.dataset.rota === nome ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  $('[data-titulo]').textContent = r.titulo;
  document.title = `${r.titulo} · Gestão`;
  const el = $('#conteudo');
  const meu = ++token;
  try {
    const mod = await r.mod();
    if (meu !== token) return;
    viewAtual?.sair?.();
    el.innerHTML = '';
    viewAtual = mod;
    mod.render(el, params);
  } catch (e) {
    erro(e);
    el.innerHTML = '<p class="muted">Não foi possível abrir esta tela. Recarregue a página.</p>';
  }
}
function rerender() {
  if (!viewAtual || !$('#conteudo')) return;
  viewAtual.atualizar ? viewAtual.atualizar() : renderRota();
}

function atualizarSino() {
  const n = naoLidas().length;
  $$('[data-badge]').forEach((b) => { b.hidden = !n; b.textContent = n > 99 ? '99+' : String(n); });
  const sino = $('[data-sino]');
  if (sino) sino.setAttribute('aria-label', n ? `Avisos: ${n} não lido(s)` : 'Avisos');
}

async function verificarAvisos() {
  if (!S.moduloPedidos || !$('.shell')) return;
  try {
    const nl = await atualizarAvisos();
    notificarNovos(nl, () => { location.hash = '#/avisos'; });
    atualizarSino();
  } catch (e) { console.warn('[avisos]', e); }
}

let iniciado = false;
async function iniciar() {
  if (!api.configurado()) { telaNaoConfigurado(); return; }
  const link = api.sessaoDoLink();
  if (link?.erro) { telaLogin(`O link não é mais válido: ${link.erro}`); return; }
  if (!api.usuarioAtual() && !link) {
    try { if (!localStorage.getItem('gestao.sessao')) { telaLogin(); return; } } catch { telaLogin(); return; }
  }
  let user;
  try { user = await api.carregarUsuario(); } catch (e) { if (e.status === 401 || e.status === 403) { await api.sair(); telaLogin('Sua sessão expirou. Entre novamente.'); return; } throw e; }
  if (!user) { telaLogin(); return; }
  if (link && (link.tipo === 'recovery' || link.tipo === 'invite')) { telaNovaSenha(link.tipo); return; }

  telaCentral('<p class="loading"><span class="spinner"></span> Carregando…</p>');
  const perfil = await carregarPerfil(user.id);
  if (!perfil || !perfil.ativo) { telaSemAcesso(perfil || { email: user.email }); return; }
  await carregarTudo();
  montarShell();
  await renderRota();
  if (!iniciado) {
    iniciado = true;
    window.addEventListener('hashchange', () => { if ($('.shell')) renderRota(); });
    onMudanca(() => { rerender(); atualizarSino(); });
    onAvisos(() => atualizarSino());
    registrarServiceWorker();
    setInterval(verificarAvisos, 5 * 60 * 1000);
    api.onSessao((s) => { if (!s && $('.shell')) telaLogin('Sua sessão terminou. Entre novamente.'); });
    // recarrega os dados quando a aba volta a ficar visível depois de um tempo (outro usuário pode ter lançado algo)
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible' && $('.shell') && Date.now() - S.carregadoEm > 5 * 60 * 1000) {
        try { await carregarTudo(); } catch (e) { console.warn(e); }
      } else if (document.visibilityState === 'visible') verificarAvisos();
    });
  }
  notificarNovos(naoLidas(), () => { location.hash = '#/avisos'; });
}

iniciar().catch((e) => {
  console.error(e);
  telaCentral(`<h1>Algo deu errado</h1><p>${esc(e.message || e)}</p><button class="btn btn-accent btn-block" onclick="location.reload()">Tentar de novo</button>`);
});
