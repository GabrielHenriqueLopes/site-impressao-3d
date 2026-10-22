/* Orçamento: limites por categoria, planejado × realizado e despesas futuras. */
import { S, podeGerir, criar, alterar, remover, novoId } from '../store.js';
import * as F from '../finance.js';
import { brl, pct, centavos, esc, hoje, inicioMes, fimMes, somaMeses, mesLongo, mesCurto, valorInput, lerValor, dataBR, GRUPOS, somaDias } from '../format.js';
import { icon, toast, erro, ocupado, confirmar, vazio } from '../ui.js';
import { colunas, medidor } from '../charts.js';
import { trocarParams } from '../nav.js';
import { abrirLancamento } from './lancamento-form.js';

let el; let mes = inicioMes(hoje());

export function render(root, params) {
  el = root;
  mes = params.mes ? inicioMes(params.mes) : inicioMes(hoje());
  desenhar();
}
export const atualizar = () => { if (!el.querySelector('[data-sujo="1"]')) desenhar(); };

const SIT = { ok: ['Dentro', 'ok', 'check'], alerta: ['Atenção', 'alerta', 'alert'], estourado: ['Acima', 'critico', 'alert'], 'sem-limite': ['Sem limite', 'apagado', ''] };

function desenhar() {
  const ref = hoje();
  const alerta = S.empresa.alerta_orcamento_pct;
  const o = F.orcamentoMes(S.lancamentos, S.cats, S.orcamentos, mes, alerta);
  const edit = podeGerir();
  const temAnterior = S.orcamentos.some((x) => x.mes === somaMeses(mes, -1));
  const historico = [5, 4, 3, 2, 1, 0].map((n) => F.orcamentoMes(S.lancamentos, S.cats, S.orcamentos, somaMeses(mes, -n), alerta));
  const futuras = S.lancamentos.filter((l) => l.tipo === 'despesa' && F.pendente(l) && l.data_vencimento >= ref && l.data_vencimento <= fimMes(somaMeses(ref, 1)))
    .sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento));
  const ordemGrupo = ['custo_producao', 'operacional', 'imposto', 'investimento', 'retirada'];
  const linhas = o.linhas.sort((a, b) => ordemGrupo.indexOf(a.categoria.grupo) - ordemGrupo.indexOf(b.categoria.grupo) || a.categoria.ordem - b.categoria.ordem);
  const usoTotal = o.planejado ? o.gastoPlanejado / o.planejado : null;

  el.innerHTML = `
  <div class="toolbar wrap">
    <div class="month-nav">
      <button type="button" class="icon-btn" data-mes="-1" aria-label="Mês anterior">${icon('chevron-left')}</button>
      <h2 class="month-title">${mesLongo(mes)}</h2>
      <button type="button" class="icon-btn" data-mes="1" aria-label="Próximo mês">${icon('chevron')}</button>
      ${mes !== inicioMes(ref) ? '<button type="button" class="btn btn-ghost btn-sm" data-mes="0">Mês atual</button>' : ''}
    </div>
    ${edit ? `<div class="row-gap">
      ${temAnterior && !S.orcamentos.some((x) => x.mes === mes) ? `<button type="button" class="btn btn-ghost btn-sm" data-copiar>${icon('copy')} Copiar de ${mesCurto(somaMeses(mes, -1))}</button>` : ''}
      <button type="button" class="btn btn-ghost btn-sm" data-sugerir title="Preenche os campos vazios com a média de gastos dos 3 meses anteriores">${icon('spark')} Sugerir pela média</button>
    </div>` : ''}
  </div>

  <section class="kpis kpis-3">
    <div class="kpi"><span class="kpi-label">Planejado</span><strong class="kpi-value">${brl(o.planejado)}</strong><span class="kpi-sub">${o.linhas.filter((x) => x.limite !== null).length} categoria(s) com limite</span></div>
    <div class="kpi"><span class="kpi-label">Gasto nas categorias planejadas</span><strong class="kpi-value">${brl(o.gastoPlanejado)}</strong>
      ${usoTotal !== null ? `${medidor(usoTotal, usoTotal > 1 ? 'estourado' : usoTotal >= alerta / 100 ? 'alerta' : 'ok')}<span class="kpi-sub">${pct(usoTotal)} do planejado</span>` : '<span class="kpi-sub">defina limites abaixo</span>'}</div>
    <div class="kpi ${o.disponivel < 0 ? 'kpi-neg' : ''}"><span class="kpi-label">${o.disponivel < 0 ? 'Acima do planejado' : 'Ainda disponível'}</span><strong class="kpi-value">${brl(Math.abs(o.disponivel))}</strong>
      <span class="kpi-sub">${o.foraDoPlano ? `+ ${brl(o.foraDoPlano)} em categorias sem limite` : 'Nada gasto fora do plano'}</span></div>
  </section>
  ${o.estourados.length || o.emAlerta.length ? `<div class="note note-alerta">${icon('alert')}<div>${o.estourados.length ? `<strong>${o.estourados.length} categoria(s) acima do limite:</strong> ${o.estourados.map((x) => esc(x.categoria.nome)).join(', ')}. ` : ''}${o.emAlerta.length ? `<strong>${o.emAlerta.length} perto do limite</strong> (≥ ${alerta}%): ${o.emAlerta.map((x) => esc(x.categoria.nome)).join(', ')}.` : ''}</div></div>` : ''}

  <section class="card">
    <div class="card-head"><h2>Limites por categoria</h2><span class="muted small">Gasto = despesas do mês, pagas ou a pagar (cancelados fora)</span></div>
    <form data-orc novalidate>
    <div class="table-wrap"><table class="tbl tbl-cards budget">
      <thead><tr><th>Categoria</th><th class="num">Limite</th><th class="num">Gasto</th><th>Uso</th><th class="num">Disponível</th><th>Situação</th></tr></thead>
      <tbody>${linhas.map((x) => {
        const [st, cls, ic] = SIT[x.situacao];
        return `<tr>
          <td data-th="Categoria" class="td-main"><span class="cat"><i class="swatch" style="--k:${x.categoria.cor}"></i><strong>${esc(x.categoria.nome)}</strong></span><small>${esc(GRUPOS[x.categoria.grupo])}${x.aPagar ? ` · ${brl(x.aPagar)} a pagar` : ''}</small></td>
          <td data-th="Limite" class="num">${edit ? `<div class="input-money sm"><span aria-hidden="true">R$</span><input type="text" inputmode="decimal" aria-label="Limite para ${esc(x.categoria.nome)}" data-lim="${x.categoria.id}" value="${x.limite === null ? '' : valorInput(x.limite)}" placeholder="—"></div>` : (x.limite === null ? '—' : brl(x.limite))}</td>
          <td data-th="Gasto" class="num">${brl(x.gasto)}</td>
          <td data-th="Uso">${x.limite !== null ? `${medidor(x.uso, x.situacao)}<small class="muted">${pct(x.uso === Infinity ? 1 : x.uso)}</small>` : ''}</td>
          <td data-th="Disponível" class="num ${x.disponivel !== null && x.disponivel < 0 ? 'neg' : ''}">${x.disponivel === null ? '—' : brl(x.disponivel)}</td>
          <td data-th="Situação"><span class="tag tag-${cls}">${ic ? icon(ic) : ''}${st}</span></td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>
    ${edit ? `<div class="form-actions"><span class="muted small" data-aviso-sujo hidden>${icon('alert')} Alterações não salvas</span><button type="submit" class="btn btn-accent" data-salvar>Salvar orçamento</button></div>` : '<p class="muted small">Só administradores e gerentes alteram o orçamento.</p>'}
    </form>
  </section>

  <section class="card">
    <div class="card-head"><h2>Planejado × realizado — últimos 6 meses</h2></div>
    ${historico.some((h) => h.planejado || h.gastoTotal) ? `<div class="chart" data-chart-orc></div>
    <details class="table-view"><summary>Ver como tabela</summary><div class="table-wrap"><table class="tbl compact"><thead><tr><th>Mês</th><th class="num">Planejado</th><th class="num">Realizado (planejadas)</th><th class="num">Fora do plano</th><th class="num">Diferença</th></tr></thead>
      <tbody>${historico.map((h) => `<tr><td>${mesCurto(h.mes)}</td><td class="num">${brl(h.planejado)}</td><td class="num">${brl(h.gastoPlanejado)}</td><td class="num">${brl(h.foraDoPlano)}</td><td class="num ${h.disponivel < 0 ? 'neg' : ''}">${h.planejado ? brl(h.disponivel) : '—'}</td></tr>`).join('')}</tbody></table></div></details>`
    : '<p class="muted">O comparativo aparece depois do primeiro mês com orçamento e despesas.</p>'}
  </section>

  <section class="card">
    <div class="card-head"><h2>Despesas futuras planejadas</h2><button type="button" class="btn btn-sm btn-ghost" data-planejar>${icon('plus')} Planejar despesa</button></div>
    <p class="muted small">Contas a pagar já lançadas até o fim do próximo mês. Para planejar uma compra (ex.: resina, uma impressora nova), lance como despesa "A pagar" com a data prevista.</p>
    ${futuras.length ? `<ul class="list">${futuras.map((l) => `<li class="list-item"><span class="li-date">${dataBR(l.data_vencimento).slice(0, 5)}</span>
      <span class="li-main"><button type="button" class="row-open" data-abrir="${l.id}"><strong>${esc(l.descricao)}</strong></button><small>${esc(S.cats[l.categoria_id]?.nome || '')}${l.recorrencia_id ? ' · mensal' : ''}</small></span>
      <span class="li-val neg">${brl(centavos(l.valor))}</span></li>`).join('')}</ul>
      <p class="totals-line">Total: <strong>${brl(futuras.reduce((t, l) => t + centavos(l.valor), 0))}</strong></p>` : vazio({ icone: 'calendar', titulo: 'Nenhuma despesa futura lançada' })}
  </section>`;

  if (el.querySelector('[data-chart-orc]')) {
    colunas(el.querySelector('[data-chart-orc]'), {
      titulo: 'Planejado e realizado por mês', altura: 210,
      rotulos: historico.map((h) => mesCurto(h.mes)),
      series: [
        { nome: 'Planejado', cor: 'var(--c-plan)', valores: historico.map((h) => h.planejado) },
        { nome: 'Realizado (todas as despesas)', cor: 'var(--c-saida)', valores: historico.map((h) => h.gastoTotal) },
      ],
    });
  }

  el.querySelectorAll('[data-mes]').forEach((b) => b.addEventListener('click', async () => {
    if (el.querySelector('[data-orc]')?.dataset.sujo === '1' && !(await confirmar({ titulo: 'Descartar alterações?', texto: 'Os limites alterados ainda não foram salvos.', botao: 'Descartar' }))) return;
    const n = Number(b.dataset.mes); mes = n === 0 ? inicioMes(hoje()) : somaMeses(mes, n); trocarParams({ mes }); desenhar();
  }));
  el.querySelectorAll('[data-abrir]').forEach((b) => b.addEventListener('click', () => abrirLancamento({ lanc: S.lancamentos.find((l) => l.id === b.dataset.abrir) })));
  el.querySelector('[data-planejar]').addEventListener('click', () => abrirLancamento({ tipo: 'despesa', preset: { status: 'pendente', data_competencia: somaDias(hoje(), 7), data_vencimento: somaDias(hoje(), 7) } }));

  const form = el.querySelector('[data-orc]');
  if (!edit) return;
  const marcarSujo = () => { form.dataset.sujo = '1'; el.querySelector('[data-aviso-sujo]').hidden = false; };
  form.querySelectorAll('[data-lim]').forEach((i) => {
    i.addEventListener('input', marcarSujo);
    i.addEventListener('blur', () => { const c = lerValor(i.value); if (Number.isFinite(c)) i.value = valorInput(c); });
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); ocupado(el.querySelector('[data-salvar]'), () => salvar(form)); });
  el.querySelector('[data-copiar]')?.addEventListener('click', (e) => ocupado(e.currentTarget, copiarAnterior));
  el.querySelector('[data-sugerir]')?.addEventListener('click', () => {
    let n = 0;
    form.querySelectorAll('[data-lim]').forEach((i) => {
      if (i.value.trim()) return;
      const media = [1, 2, 3].map((k) => {
        const m = somaMeses(mes, -k);
        return S.lancamentos.filter((l) => l.tipo === 'despesa' && F.ativo(l) && l.categoria_id === i.dataset.lim && l.data_competencia >= m && l.data_competencia <= fimMes(m))
          .reduce((t, l) => t + centavos(l.valor), 0);
      }).reduce((a, b) => a + b, 0) / 3;
      if (media > 0) { i.value = valorInput(Math.ceil(media / 1000) * 1000); n++; }
    });
    if (n) { marcarSujo(); toast(`${n} limite(s) sugerido(s) pela média dos 3 meses anteriores (arredondada para cima). Revise e salve.`, 'aviso'); }
    else toast('Sem histórico suficiente de gastos para sugerir limites.', 'aviso');
  });
}

async function salvar(form) {
  const ops = [];
  for (const i of form.querySelectorAll('[data-lim]')) {
    const cat = i.dataset.lim;
    const atual = S.orcamentos.find((x) => x.mes === mes && x.categoria_id === cat);
    const txt = i.value.trim();
    if (!txt) { if (atual) ops.push(() => remover('orcamentos', atual.id)); continue; }
    const c = lerValor(txt);
    if (!Number.isFinite(c) || c < 0) { i.focus(); i.setAttribute('aria-invalid', 'true'); toast(`Limite inválido em "${S.cats[cat]?.nome}". Use números, ex.: 250,00.`, 'erro'); return; }
    if (!atual) ops.push(() => criar('orcamentos', { id: novoId(), mes, categoria_id: cat, limite: c / 100 }));
    else if (centavos(atual.limite) !== c) ops.push(() => alterar('orcamentos', atual.id, { limite: c / 100 }));
  }
  if (!ops.length) { toast('Nada a salvar.', 'aviso'); return; }
  form.dataset.sujo = '1';
  try {
    for (const op of ops) await op();       // em sequência, para mensagens de erro claras
    form.dataset.sujo = '';
    toast('Orçamento salvo.');
    desenhar();
  } catch (e) { erro(e); }
}

async function copiarAnterior() {
  const ant = S.orcamentos.filter((x) => x.mes === somaMeses(mes, -1));
  try {
    await criar('orcamentos', ant.map((x) => ({ id: novoId(), mes, categoria_id: x.categoria_id, limite: x.limite })));
    toast(`${ant.length} limite(s) copiado(s) de ${mesCurto(somaMeses(mes, -1))}.`);
    desenhar();
  } catch (e) { erro(e); }
}
