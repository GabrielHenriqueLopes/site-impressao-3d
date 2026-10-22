/* Estado do aplicativo: carrega os dados do banco e mantém em memória. */
import * as api from './api.js';

export const S = {
  perfil: null,        // { id, nome, papel, ativo }
  empresa: { nome: '', alerta_orcamento_pct: 80, alerta_vencimento_dias: 7 },
  contas: [],
  categorias: [],
  cats: {},            // id → categoria
  lancamentos: [],
  recorrencias: [],
  orcamentos: [],
  metas: [],
  perfis: [],
  moduloPedidos: false,
  pedidos: [],
  filamentos: [],
  notificacoes: [],
  lidas: new Set(),    // ids de notificações lidas pelo usuário atual
  carregadoEm: null,
};

const ouvintes = new Set();
export const onMudanca = (fn) => { ouvintes.add(fn); return () => ouvintes.delete(fn); };
const avisar = () => ouvintes.forEach((fn) => fn());

export const pode = (...papeis) => Boolean(S.perfil && papeis.includes(S.perfil.papel));
export const podeGerir = () => pode('admin', 'gerente');
export const podeEditarLanc = (l) => podeGerir() || (S.perfil?.papel === 'funcionario' && l.criado_por === S.perfil.id);
export const podeEditarPedido = (p) => podeGerir() || (S.perfil?.papel === 'funcionario' && p.criado_por === S.perfil.id);

function indexar() {
  S.cats = Object.fromEntries(S.categorias.map((c) => [c.id, c]));
}

export async function carregarPerfil(userId) {
  const [p] = await api.listar('perfis', { id: `eq.${userId}` });
  S.perfil = p || null;
  return S.perfil;
}

/* O módulo de pedidos depende da 2ª parte do schema.sql. Se ela ainda não foi
   rodada no Supabase, o resto do aplicativo continua funcionando normalmente. */
const opcional = (prom) => prom.catch((e) => { if (e.status === 404 || /schema cache|does not exist|PGRST20/.test(`${e.code} ${e.detalhe} ${e.message}`)) return null; throw e; });

export async function carregarTudo() {
  // gera as despesas/receitas recorrentes do mês atual e do próximo (sem duplicar)
  try { await api.rpc('gerar_recorrencias', {}); } catch (e) { console.warn('[recorrências]', e); }
  try { await api.rpc('gerar_notificacoes', {}); } catch (e) { console.warn('[avisos]', e); }
  let [empresa, contas, categorias, lancamentos, recorrencias, orcamentos, metas, perfis, pedidos, filamentos, notificacoes, lidas] = await Promise.all([
    api.listar('empresa'),
    api.listar('contas', { order: 'nome' }),
    api.listar('categorias', { order: 'tipo,ordem,nome' }),
    api.listar('lancamentos', { order: 'data_competencia.desc,criado_em.desc' }),
    api.listar('recorrencias', { order: 'descricao' }),
    api.listar('orcamentos', { order: 'mes' }),
    api.listar('metas', { order: 'fim.desc' }),
    api.listar('perfis', { order: 'nome' }),
    opcional(api.listar('pedidos', { order: 'prazo,codigo' })),
    opcional(api.listar('filamentos', { order: 'tipo,cor' })),
    opcional(api.listar('notificacoes', { order: 'criado_em.desc', limit: 300 })),
    opcional(api.listar('notificacoes_lidas', { select: 'notificacao_id' })),
  ]);
  S.moduloPedidos = pedidos !== null;
  pedidos = pedidos || []; filamentos = filamentos || []; notificacoes = notificacoes || []; lidas = lidas || [];
  Object.assign(S, { empresa: empresa[0] || S.empresa, contas, categorias, lancamentos, recorrencias, orcamentos, metas, perfis,
    pedidos, filamentos, notificacoes, lidas: new Set(lidas.map((x) => x.notificacao_id)), carregadoEm: new Date() });
  indexar();
  avisar();
}

/* ---------- escrita: grava no banco e atualiza a memória ---------- */
const colecao = { lancamentos: 'lancamentos', contas: 'contas', categorias: 'categorias', recorrencias: 'recorrencias', orcamentos: 'orcamentos', metas: 'metas', perfis: 'perfis', pedidos: 'pedidos', filamentos: 'filamentos' };

function aplicar(tabela, linhas, remover = false) {
  const arr = S[colecao[tabela]];
  for (const l of linhas) {
    const i = arr.findIndex((x) => x.id === l.id);
    if (remover) { if (i >= 0) arr.splice(i, 1); }
    else if (i >= 0) arr[i] = l; else arr.unshift(l);
  }
  if (tabela === 'categorias') indexar();
  avisar();
}

export async function criar(tabela, dados) {
  const linhas = await api.inserir(tabela, Array.isArray(dados) ? dados : [dados]);
  aplicar(tabela, linhas);
  return Array.isArray(dados) ? linhas : linhas[0];
}
export async function alterar(tabela, id, patch) {
  const [l] = await api.atualizar(tabela, { id: `eq.${id}` }, patch);
  aplicar(tabela, [l]);
  return l;
}
export async function remover(tabela, id) {
  const linhas = await api.excluir(tabela, { id: `eq.${id}` });
  aplicar(tabela, linhas, true);
}
export async function salvarEmpresa(patch) {
  const [e] = await api.atualizar('empresa', { id: 'eq.1' }, patch);
  S.empresa = e; avisar(); return e;
}
export async function gerarRecorrencias() {
  const n = await api.rpc('gerar_recorrencias', {});
  if (n) S.lancamentos = await api.listar('lancamentos', { order: 'data_competencia.desc,criado_em.desc' });
  avisar();
  return n;
}
/** Gera avisos de prazo no banco e busca os novos (sem duplicar). Retorna os ainda não lidos. */
export async function atualizarAvisos() {
  if (!S.moduloPedidos) return [];
  try { await api.rpc('gerar_notificacoes', {}); } catch (e) { console.warn('[avisos]', e); return naoLidas(); }
  const [notificacoes, lidas] = await Promise.all([
    api.listar('notificacoes', { order: 'criado_em.desc', limit: 300 }),
    api.listar('notificacoes_lidas', { select: 'notificacao_id' }),
  ]);
  const antes = S.notificacoes.length;
  S.notificacoes = notificacoes; S.lidas = new Set(lidas.map((x) => x.notificacao_id));
  if (notificacoes.length !== antes) avisar(); else ouvintesAvisos.forEach((fn) => fn());
  return naoLidas();
}
const ouvintesAvisos = new Set();
export const onAvisos = (fn) => { ouvintesAvisos.add(fn); return () => ouvintesAvisos.delete(fn); };
/** Avisos ainda relevantes: não lidos e de pedidos que continuam em aberto com o mesmo prazo. */
export const avisoVigente = (n) => {
  const p = S.pedidos.find((x) => x.id === n.pedido_id);
  if (!p || !['aguardando', 'producao', 'pronto'].includes(p.status) || p.prazo !== n.referencia) return false;
  if (n.tipo === 'iniciar') return p.status === 'aguardando';
  if (n.tipo === 'prazo_proximo') return !S.notificacoes.some((x) => x.pedido_id === p.id && x.tipo === 'atrasado' && x.referencia === p.prazo);
  return true;
};
export const naoLidas = () => S.notificacoes.filter((n) => !S.lidas.has(n.id) && avisoVigente(n));
export async function marcarLidas(ids) {
  const novos = ids.filter((id) => !S.lidas.has(id));
  if (!novos.length) return;
  await api.inserir('notificacoes_lidas', novos.map((id) => ({ notificacao_id: id })));
  novos.forEach((id) => S.lidas.add(id));
  ouvintesAvisos.forEach((fn) => fn());
  avisar();
}
export async function marcarNaoLida(id) {
  await api.excluir('notificacoes_lidas', { notificacao_id: `eq.${id}` });
  S.lidas.delete(id);
  ouvintesAvisos.forEach((fn) => fn());
  avisar();
}

export async function recarregarLancamentos() {
  S.lancamentos = await api.listar('lancamentos', { order: 'data_competencia.desc,criado_em.desc' });
  avisar();
}

export const novoId = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 15); return (c === 'x' ? r : (r & 3) | 8).toString(16); }));
