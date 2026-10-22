/* Navegação por hash: #/modulo?filtro=valor */
export const MODULOS = ['', 'lancamentos', 'contas', 'orcamento', 'resultados', 'metas', 'config'];
export function rotaAtual() {
  const h = location.hash.replace(/^#\/?/, '');
  const [nome, q = ''] = h.split('?');
  return { nome: MODULOS.includes(nome) ? nome : '', params: Object.fromEntries(new URLSearchParams(q)) };
}
const query = (params) => new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined && v !== null)).toString();
export const ir = (nome, params = {}) => { const q = query(params); location.hash = `#/${nome}${q ? `?${q}` : ''}`; };
/** Atualiza os filtros na URL sem recarregar a tela. */
export const trocarParams = (params) => { const q = query(params); history.replaceState(null, '', `#/${rotaAtual().nome}${q ? `?${q}` : ''}`); };
