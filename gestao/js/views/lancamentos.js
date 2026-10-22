/* Lançamentos: lista com busca, filtros, totais e exportação. */
import { S, podeEditarLanc } from '../store.js';
import * as F from '../finance.js';
import { brl, centavos, dataBR, esc, norm, FORMAS, ORIGENS, hoje } from '../format.js';
import { icon, selo, vazio, baixarArquivo, csv } from '../ui.js';
import { filtroHTML, ligarFiltro, resolver } from './periodo.js';
import { trocarParams } from '../nav.js';
import { abrirLancamento, baixar, verComprovante } from './lancamento-form.js';

let el; let f; let limite = 60; let ordem = { campo: 'data', dir: -1 };

export function render(root, params) {
  el = root;
  f = {
    tipo: params.tipo || '', status: params.status || '', categoria: params.categoria || '', conta: params.conta || '',
    forma: params.forma || '', origem: params.origem || '', busca: params.q || '', data: params.data || 'competencia',
    per: resolver(params.periodo || (params.inicio ? 'personalizado' : 'mes'), params.inicio, params.fim),
  };
  limite = 60;
  estrutura();
  lista();
}
export const atualizar = () => lista();

function salvarURL() {
  trocarParams({ tipo: f.tipo, status: f.status, categoria: f.categoria, conta: f.conta, forma: f.forma, origem: f.origem, q: f.busca,
    data: f.data !== 'competencia' ? f.data : '', periodo: f.per.preset, inicio: f.per.preset === 'personalizado' ? f.per.inicio : '', fim: f.per.preset === 'personalizado' ? f.per.fim : '' });
}

const opt = (v, t, sel) => `<option value="${esc(v)}"${String(v) === String(sel) ? ' selected' : ''}>${esc(t)}</option>`;

function estrutura() {
  const cats = S.categorias.filter((c) => !f.tipo || c.tipo === f.tipo);
  el.innerHTML = `
  <div class="toolbar wrap">
    <div class="seg-tabs" role="tablist" aria-label="Tipo">
      ${[['', 'Todos'], ['receita', 'Receitas'], ['despesa', 'Despesas']].map(([v, t]) => `<button type="button" role="tab" aria-selected="${f.tipo === v}" data-tipo="${v}">${t}</button>`).join('')}
    </div>
    <div class="search"><label class="sr-only" for="busca">Pesquisar</label>${icon('search')}<input id="busca" type="search" placeholder="Pesquisar descrição, cliente, observação…" value="${esc(f.busca)}" data-busca></div>
    <button type="button" class="btn btn-ghost btn-sm" data-exportar>${icon('download')} Exportar CSV</button>
  </div>
  <div class="filters" data-filtros>
    ${filtroHTML(f.per, ['hoje', 'semana', 'mes', 'mes_anterior', 'trimestre', 'ano', 'personalizado'])}
    <label class="flt"><span>Data de</span><select data-f="data">${opt('competencia', 'venda/gasto', f.data)}${opt('vencimento', 'vencimento', f.data)}${opt('pagamento', 'pagamento', f.data)}</select></label>
    <label class="flt"><span>Situação</span><select data-f="status">${opt('', 'Todas', f.status)}${opt('pendente', 'Pendentes', f.status)}${opt('vencido', 'Vencidas', f.status)}${opt('pago', 'Pagas/recebidas', f.status)}${opt('cancelado', 'Canceladas', f.status)}</select></label>
    <label class="flt"><span>Categoria</span><select data-f="categoria">${opt('', 'Todas', f.categoria)}${cats.map((c) => opt(c.id, `${c.nome}${f.tipo ? '' : c.tipo === 'receita' ? ' (R)' : ' (D)'}`, f.categoria)).join('')}</select></label>
    <label class="flt"><span>Conta</span><select data-f="conta">${opt('', 'Todas', f.conta)}${S.contas.map((c) => opt(c.id, c.nome, f.conta)).join('')}</select></label>
    <label class="flt"><span>Forma</span><select data-f="forma">${opt('', 'Todas', f.forma)}${Object.entries(FORMAS).map(([k, v]) => opt(k, v, f.forma)).join('')}</select></label>
    ${f.tipo !== 'despesa' ? `<label class="flt"><span>Origem</span><select data-f="origem">${opt('', 'Todas', f.origem)}${Object.entries(ORIGENS).map(([k, v]) => opt(k, v, f.origem)).join('')}</select></label>` : ''}
    <button type="button" class="btn-link" data-limpar>Limpar filtros</button>
  </div>
  <div class="totals" data-totais aria-live="polite"></div>
  <div data-lista></div>`;

  el.querySelectorAll('[data-tipo]').forEach((b) => b.addEventListener('click', () => {
    f.tipo = b.dataset.tipo;
    if (f.categoria && S.cats[f.categoria]?.tipo !== f.tipo) f.categoria = '';
    if (f.tipo === 'despesa') f.origem = '';
    salvarURL(); estrutura(); lista();
  }));
  let t;
  el.querySelector('[data-busca]').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { f.busca = e.target.value; limite = 60; salvarURL(); lista(); }, 200); });
  el.querySelectorAll('[data-f]').forEach((s) => s.addEventListener('change', () => { f[s.dataset.f] = s.value; limite = 60; salvarURL(); lista(); }));
  ligarFiltro(el.querySelector('[data-period]'), (p) => { f.per = p; limite = 60; salvarURL(); lista(); });
  el.querySelector('[data-limpar]').addEventListener('click', () => {
    f = { tipo: f.tipo, status: '', categoria: '', conta: '', forma: '', origem: '', busca: '', data: 'competencia', per: resolver('mes') };
    salvarURL(); estrutura(); lista();
  });
  el.querySelector('[data-exportar]').addEventListener('click', exportar);
}

function filtrados() {
  const ref = hoje();
  const campoData = { competencia: 'data_competencia', vencimento: 'data_vencimento', pagamento: 'data_pagamento' }[f.data];
  const q = norm(f.busca);
  let arr = S.lancamentos.filter((l) => {
    if (f.tipo && l.tipo !== f.tipo) return false;
    const d = l[campoData];
    if (!d || d < f.per.inicio || d > f.per.fim) return false;
    if (f.status) {
      const st = F.statusEfetivo(l, ref);
      if (f.status === 'pendente' ? l.status !== 'pendente' : st !== f.status) return false;
    }
    if (f.categoria && l.categoria_id !== f.categoria) return false;
    if (f.conta && l.conta_id !== f.conta) return false;
    if (f.forma && l.forma_pagamento !== f.forma) return false;
    if (f.origem && l.origem !== f.origem) return false;
    if (q && !norm(`${l.descricao} ${l.cliente || ''} ${l.observacoes || ''} ${S.cats[l.categoria_id]?.nome || ''}`).includes(q)) return false;
    return true;
  });
  const chave = {
    data: (l) => l[campoData] || '', descricao: (l) => norm(l.descricao), categoria: (l) => norm(S.cats[l.categoria_id]?.nome),
    valor: (l) => (l.tipo === 'receita' ? 1 : -1) * centavos(l.valor), status: (l) => F.statusEfetivo(l, ref),
  }[ordem.campo];
  arr = arr.sort((a, b) => { const x = chave(a); const y = chave(b); return (x < y ? -1 : x > y ? 1 : 0) * ordem.dir || (b.criado_em || '').localeCompare(a.criado_em || ''); });
  return arr;
}

function lista() {
  if (!el.querySelector('[data-lista]')) return;
  const ref = hoje();
  const arr = filtrados();
  const ativos = arr.filter(F.ativo);
  const rec = ativos.filter((l) => l.tipo === 'receita').reduce((t, l) => t + centavos(l.valor), 0);
  const des = ativos.filter((l) => l.tipo === 'despesa').reduce((t, l) => t + centavos(l.valor), 0);
  el.querySelector('[data-totais]').innerHTML = `
    <span><small>${arr.length} lançamento(s)</small></span>
    ${f.tipo !== 'despesa' ? `<span><small>Receitas</small><strong class="pos">${brl(rec)}</strong></span>` : ''}
    ${f.tipo !== 'receita' ? `<span><small>Despesas</small><strong class="neg">${brl(des)}</strong></span>` : ''}
    ${!f.tipo ? `<span><small>Diferença</small><strong>${brl(rec - des)}</strong></span>` : ''}
    <span class="muted small">Cancelados não entram nos totais.</span>`;

  const box = el.querySelector('[data-lista]');
  if (!arr.length) {
    const nada = !S.lancamentos.length;
    box.innerHTML = vazio({
      icone: nada ? 'inbox' : 'search',
      titulo: nada ? 'Nenhum lançamento ainda' : 'Nada encontrado com esses filtros',
      texto: nada ? 'Comece registrando uma venda recebida por Pix ou um gasto com material.' : 'Tente outro período ou limpe os filtros.',
      acao: nada ? '<div class="row-gap"><button class="btn btn-accent btn-sm" data-n="receita">Nova receita</button><button class="btn btn-ghost btn-sm" data-n="despesa">Nova despesa</button></div>' : '',
    });
    box.querySelectorAll('[data-n]').forEach((b) => b.addEventListener('click', () => abrirLancamento({ tipo: b.dataset.n })));
    return;
  }
  const th = (campo, t, cls = '') => `<th class="${cls}" aria-sort="${ordem.campo === campo ? (ordem.dir > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" data-ord="${campo}">${t}${ordem.campo === campo ? icon(ordem.dir > 0 ? 'sort-up' : 'sort-down') : ''}</button></th>`;
  const rotData = { competencia: 'Data', vencimento: 'Vencimento', pagamento: 'Pagamento' }[f.data];
  box.innerHTML = `<div class="table-wrap"><table class="tbl tbl-cards">
    <thead><tr>${th('data', rotData)}${th('descricao', 'Descrição')}${th('categoria', 'Categoria')}${th('status', 'Situação')}${th('valor', 'Valor', 'num')}<th><span class="sr-only">Ações</span></th></tr></thead>
    <tbody>${arr.slice(0, limite).map((l) => {
      const c = S.cats[l.categoria_id];
      const st = F.statusEfetivo(l, ref);
      const d = l[{ competencia: 'data_competencia', vencimento: 'data_vencimento', pagamento: 'data_pagamento' }[f.data]];
      return `<tr class="${l.status === 'cancelado' ? 'row-off' : ''}" data-id="${l.id}">
        <td data-th="${rotData}">${dataBR(d)}</td>
        <td data-th="Descrição" class="td-main"><button type="button" class="row-open" data-abrir="${l.id}"><strong>${esc(l.descricao)}</strong></button>
          <small>${[l.cliente && esc(l.cliente), l.origem && ORIGENS[l.origem], l.forma_pagamento && FORMAS[l.forma_pagamento], l.recorrencia_id && 'mensal'].filter(Boolean).join(' · ')}${l.comprovante_path ? ` · <button type="button" class="btn-link" data-comp="${l.id}">${icon('file')}comprovante</button>` : ''}</small></td>
        <td data-th="Categoria"><span class="cat"><i class="swatch" style="--k:${c?.cor || '#999'}"></i>${esc(c?.nome || '—')}</span></td>
        <td data-th="Situação">${selo(st)}${l.status === 'pendente' && f.data !== 'vencimento' ? `<small class="muted d-block">vence ${dataBR(l.data_vencimento)}</small>` : ''}</td>
        <td data-th="Valor" class="num ${l.tipo === 'receita' ? 'pos' : 'neg'}">${l.tipo === 'receita' ? '+' : '−'} ${brl(centavos(l.valor))}</td>
        <td class="actions">${l.status === 'pendente' && podeEditarLanc(l) ? `<button type="button" class="btn btn-sm btn-ghost" data-baixar="${l.id}" title="${l.tipo === 'receita' ? 'Registrar recebimento' : 'Registrar pagamento'}">${icon('check')}<span>${l.tipo === 'receita' ? 'Receber' : 'Pagar'}</span></button>` : ''}
          <button type="button" class="btn btn-sm btn-ghost" data-dup="${l.id}" title="Duplicar">${icon('copy')}<span class="sr-only">Duplicar</span></button></td>
      </tr>`;
    }).join('')}</tbody></table></div>
    ${arr.length > limite ? `<button type="button" class="btn btn-ghost btn-block" data-mais>Mostrar mais (${arr.length - limite} restantes)</button>` : ''}`;

  const achar = (id) => S.lancamentos.find((l) => l.id === id);
  box.querySelectorAll('[data-abrir]').forEach((b) => b.addEventListener('click', () => abrirLancamento({ lanc: achar(b.dataset.abrir) })));
  box.querySelectorAll('[data-baixar]').forEach((b) => b.addEventListener('click', () => baixar(achar(b.dataset.baixar))));
  box.querySelectorAll('[data-comp]').forEach((b) => b.addEventListener('click', () => verComprovante(achar(b.dataset.comp).comprovante_path)));
  box.querySelectorAll('[data-dup]').forEach((b) => b.addEventListener('click', () => {
    const o = achar(b.dataset.dup);
    abrirLancamento({ tipo: o.tipo, preset: { tipo: o.tipo, descricao: o.descricao, valor: o.valor, categoria_id: o.categoria_id, conta_id: o.conta_id, forma_pagamento: o.forma_pagamento, origem: o.origem, cliente: o.cliente, natureza: o.natureza, data_competencia: hoje(), data_vencimento: hoje(), status: 'pendente' } });
  }));
  box.querySelectorAll('[data-ord]').forEach((b) => b.addEventListener('click', () => {
    const c = b.dataset.ord; ordem = { campo: c, dir: ordem.campo === c ? -ordem.dir : (c === 'descricao' || c === 'categoria' ? 1 : -1) }; lista();
  }));
  box.querySelector('[data-mais]')?.addEventListener('click', () => { limite += 100; lista(); });
}

function exportar() {
  const arr = filtrados();
  const conta = (id) => S.contas.find((c) => c.id === id)?.nome || '';
  const linhas = [['Tipo', 'Descrição', 'Categoria', 'Grupo', 'Valor', 'Data', 'Vencimento', 'Pagamento', 'Situação', 'Conta', 'Forma', 'Origem', 'Cliente', 'Classificação', 'Observações']]
    .concat(arr.map((l) => [l.tipo, l.descricao, S.cats[l.categoria_id]?.nome, S.cats[l.categoria_id]?.grupo, String(l.valor).replace('.', ','),
      dataBR(l.data_competencia), dataBR(l.data_vencimento), l.data_pagamento ? dataBR(l.data_pagamento) : '', F.statusEfetivo(l), conta(l.conta_id),
      FORMAS[l.forma_pagamento] || '', ORIGENS[l.origem] || '', l.cliente || '', l.natureza || '', l.observacoes || '']));
  baixarArquivo(`lancamentos-${f.per.inicio}-a-${f.per.fim}.csv`, csv(linhas), 'text/csv;charset=utf-8');
}
