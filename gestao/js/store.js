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
  carregadoEm: null,
};

const ouvintes = new Set();
export const onMudanca = (fn) => { ouvintes.add(fn); return () => ouvintes.delete(fn); };
const avisar = () => ouvintes.forEach((fn) => fn());

export const pode = (...papeis) => Boolean(S.perfil && papeis.includes(S.perfil.papel));
export const podeGerir = () => pode('admin', 'gerente');
export const podeEditarLanc = (l) => podeGerir() || (S.perfil?.papel === 'funcionario' && l.criado_por === S.perfil.id);

function indexar() {
  S.cats = Object.fromEntries(S.categorias.map((c) => [c.id, c]));
}

export async function carregarPerfil(userId) {
  const [p] = await api.listar('perfis', { id: `eq.${userId}` });
  S.perfil = p || null;
  return S.perfil;
}

export async function carregarTudo() {
  // gera as despesas/receitas recorrentes do mês atual e do próximo (sem duplicar)
  try { await api.rpc('gerar_recorrencias', {}); } catch (e) { console.warn('[recorrências]', e); }
  const [empresa, contas, categorias, lancamentos, recorrencias, orcamentos, metas, perfis] = await Promise.all([
    api.listar('empresa'),
    api.listar('contas', { order: 'nome' }),
    api.listar('categorias', { order: 'tipo,ordem,nome' }),
    api.listar('lancamentos', { order: 'data_competencia.desc,criado_em.desc' }),
    api.listar('recorrencias', { order: 'descricao' }),
    api.listar('orcamentos', { order: 'mes' }),
    api.listar('metas', { order: 'fim.desc' }),
    api.listar('perfis', { order: 'nome' }),
  ]);
  Object.assign(S, { empresa: empresa[0] || S.empresa, contas, categorias, lancamentos, recorrencias, orcamentos, metas, perfis, carregadoEm: new Date() });
  indexar();
  avisar();
}

/* ---------- escrita: grava no banco e atualiza a memória ---------- */
const colecao = { lancamentos: 'lancamentos', contas: 'contas', categorias: 'categorias', recorrencias: 'recorrencias', orcamentos: 'orcamentos', metas: 'metas', perfis: 'perfis' };

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
export async function recarregarLancamentos() {
  S.lancamentos = await api.listar('lancamentos', { order: 'data_competencia.desc,criado_em.desc' });
  avisar();
}

export const novoId = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 15); return (c === 'x' ? r : (r & 3) | 8).toString(16); }));
