/* Lucro e fluxo de caixa: DRE simplificada, caixa, evolução e maiores gastos. */
import { S } from '../store.js';
import * as F from '../finance.js';
import { brl, pct, centavos, esc, hoje, mesCurto, somaDias, ORIGENS, diasEntre } from '../format.js';
import { icon } from '../ui.js';
import { colunas, linhaSaldo, barrasH } from '../charts.js';
import { filtroHTML, ligarFiltro, resolver, rotulo } from './periodo.js';
import { trocarParams } from '../nav.js';

let el; let per;

export function render(root, params) {
  el = root;
  per = resolver(params.periodo || 'mes', params.inicio, params.fim);
  desenhar();
  if (location.hash.includes('#fluxo')) el.querySelector('#fluxo')?.scrollIntoView();
}
export const atualizar = () => desenhar();

const linhaDRE = (rot, v, va, { cls = '', sinal = '', nivel = 0, dica = '' } = {}) => `
  <tr class="${cls}"><th scope="row" class="lvl-${nivel}">${sinal ? `<span class="sinal">${sinal}</span>` : ''}${rot}${dica ? ` <small class="muted">${dica}</small>` : ''}</th>
  <td class="num">${brl(v)}</td><td class="num muted">${va === null ? '' : brl(va)}</td></tr>`;

function desenhar() {
  const ref = hoje();
  const L = S.lancamentos; const C = S.cats;
  const r = F.resumo(L, C, per, ref);
  const ant = F.periodoAnterior(per);
  const ra = F.resumo(L, C, ant, ref);
  const fx = F.fluxoDiario(L, S.contas, per, ref);
  const serie = F.serieMensal(L, C, 12, per.fim < ref ? per.fim : ref);
  const desp = L.filter((l) => l.tipo === 'despesa' && F.ativo(l) && l.data_competencia >= per.inicio && l.data_competencia <= per.fim);
  const porCat = Object.values(desp.reduce((acc, l) => { const c = C[l.categoria_id]; const k = l.categoria_id; acc[k] = acc[k] || { rotulo: c?.nome || '—', cor: c?.cor || '#999', valor: 0 }; acc[k].valor += centavos(l.valor); return acc; }, {}))
    .sort((a, b) => b.valor - a.valor);
  const totalDesp = porCat.reduce((t, x) => t + x.valor, 0);
  const vendas = L.filter((l) => l.tipo === 'receita' && F.ativo(l) && ['venda', 'frete'].includes(C[l.categoria_id]?.grupo) && l.data_competencia >= per.inicio && l.data_competencia <= per.fim);
  const porOrigem = Object.values(vendas.reduce((acc, l) => { const k = l.origem || 'nao'; acc[k] = acc[k] || { rotulo: ORIGENS[l.origem] || 'Não informada', cor: k === 'whatsapp' ? '#2a8a68' : k === 'instagram' ? '#c94a1f' : '#8c867c', valor: 0 }; acc[k].valor += centavos(l.valor); return acc; }, {})).sort((a, b) => b.valor - a.valor);
  const porCatRec = Object.values(vendas.reduce((acc, l) => { const c = C[l.categoria_id]; acc[l.categoria_id] = acc[l.categoria_id] || { rotulo: c?.nome, cor: c?.cor, valor: 0 }; acc[l.categoria_id].valor += centavos(l.valor); return acc; }, {})).sort((a, b) => b.valor - a.valor);
  const ticket = r.qtdVendas ? Math.round(r.vendas / r.qtdVendas) : null;
  const faltando = [];
  if (r.faturamento > 0 && r.custos === 0) faltando.push('custos de material e envio (filamento, resina, tintas, embalagens, frete pago)');
  if (r.faturamento > 0 && r.operacionais === 0) faltando.push('despesas operacionais (energia, internet, manutenção, assinaturas)');
  if (r.faturamento > 0 && r.impostos === 0) faltando.push('impostos (DAS do MEI, se houver)');
  const futuro = per.fim > ref;

  el.innerHTML = `
  <div class="toolbar wrap">
    ${filtroHTML(per, ['mes', 'mes_anterior', 'trimestre', 'ano', 'personalizado'])}
    <button type="button" class="btn btn-ghost btn-sm no-print" data-imprimir>${icon('print')} Imprimir / PDF</button>
  </div>

  <section class="duo duo-wide">
    <div class="card">
      <div class="card-head"><h2>Resultado do período <small class="muted">(lucro estimado)</small></h2></div>
      <p class="muted small">Regime de competência: vendas e gastos pela data em que aconteceram, recebidos/pagos ou não.</p>
      <div class="table-wrap"><table class="tbl dre">
        <thead><tr><th></th><th class="num">${esc(rotulo(per))}</th><th class="num muted">${esc(rotulo(ant))}</th></tr></thead>
        <tbody>
          ${linhaDRE('Vendas', r.vendas, ra.vendas, { nivel: 1 })}
          ${linhaDRE('Frete cobrado do cliente', r.frete, ra.frete, { nivel: 1 })}
          ${linhaDRE('Faturamento', r.faturamento, ra.faturamento, { cls: 'sub' })}
          ${linhaDRE('Custos de produção e envio', r.custos, ra.custos, { sinal: '−', nivel: 1 })}
          ${linhaDRE(`Lucro bruto <small class="muted">margem ${pct(r.margemBruta)}</small>`, r.lucroBruto, ra.lucroBruto, { cls: 'sub' })}
          ${linhaDRE('Despesas operacionais', r.operacionais, ra.operacionais, { sinal: '−', nivel: 1 })}
          ${linhaDRE('Impostos', r.impostos, ra.impostos, { sinal: '−', nivel: 1 })}
          ${r.outras || ra.outras ? linhaDRE('Outras receitas', r.outras, ra.outras, { sinal: '+', nivel: 1 }) : ''}
          ${linhaDRE(`Lucro estimado <small class="muted">margem ${pct(r.margem)}</small>`, r.lucro, ra.lucro, { cls: `total ${r.lucro < 0 ? 'neg' : ''}` })}
        </tbody>
      </table></div>
      <div class="fora">
        <h3>Fora do lucro <small class="muted">(mexem no caixa, não no resultado)</small></h3>
        <ul>
          <li><span>Investimentos em equipamentos</span><strong>${brl(r.investimentos)}</strong></li>
          <li><span>Retiradas do dono (pró-labore)</span><strong>${brl(r.retiradas)}</strong></li>
          <li><span>Aportes do dono</span><strong>${brl(r.aportes)}</strong></li>
        </ul>
      </div>
      ${faltando.length ? `<div class="note note-alerta">${icon('alert')}<div><strong>Lucro incompleto:</strong> há faturamento, mas não há lançamentos de ${faltando.join('; ')}. Sem eles, o lucro e a margem acima aparecem maiores do que são. Cadastre esses gastos para obter o lucro real.</div></div>` : ''}
      ${r.avisos.some((a) => a.id === 'pendentes') ? `<p class="muted small">${icon('info')} ${esc(r.avisos.find((a) => a.id === 'pendentes').texto)}</p>` : ''}
    </div>

    <div class="card">
      <div class="card-head"><h2>Indicadores de venda</h2></div>
      <dl class="stats">
        <div><dt>Vendas registradas</dt><dd>${r.qtdVendas}</dd></div>
        <div><dt>Ticket médio</dt><dd>${ticket === null ? '—' : brl(ticket)}</dd></div>
        <div><dt>Já recebido das vendas</dt><dd>${brl(r.faturadoRecebido)} <small>${r.faturamento ? pct(r.faturadoRecebido / r.faturamento) : ''}</small></dd></div>
        <div><dt>Custo por R$ 1 faturado</dt><dd>${r.faturamento ? brl(Math.round((r.custos / r.faturamento) * 100)) : '—'}</dd></div>
      </dl>
      <h3 class="h-sm">Faturamento por origem</h3>
      ${porOrigem.length ? '<div data-origem></div>' : '<p class="muted small">Sem vendas no período.</p>'}
      <h3 class="h-sm">Faturamento por categoria</h3>
      ${porCatRec.length ? '<div data-cat-rec></div>' : '<p class="muted small">Sem vendas no período.</p>'}
    </div>
  </section>

  <section class="card" id="fluxo">
    <div class="card-head"><h2>Fluxo de caixa</h2><span class="muted small">Regime de caixa: dinheiro que entrou e saiu das contas</span></div>
    <div class="flow">
      <div><small>Saldo inicial</small><strong>${brl(fx.saldoInicial)}</strong></div>
      <div class="op">+</div>
      <div><small>Entradas</small><strong class="pos">${brl(fx.entradas)}</strong></div>
      <div class="op">−</div>
      <div><small>Saídas</small><strong class="neg">${brl(fx.saidas)}</strong></div>
      <div class="op">=</div>
      <div class="flow-total"><small>Saldo ${futuro ? 'hoje' : 'final'}</small><strong>${brl(fx.saldoFinal)}</strong></div>
    </div>
    ${futuro ? `<div class="flow flow-prev">
      <div><small>Ainda a receber até ${esc(per.fim.split('-').reverse().join('/'))}</small><strong class="pos">${brl(fx.entradasPrev)}</strong></div>
      <div><small>Ainda a pagar</small><strong class="neg">${brl(fx.saidasPrev)}</strong></div>
      <div class="flow-total"><small>Saldo final previsto</small><strong class="${fx.saldoFinalPrevisto < 0 ? 'neg' : ''}">${brl(fx.saldoFinalPrevisto)}</strong></div>
    </div>` : ''}
    <div class="chart" data-chart-saldo></div>
    <div class="grid-2 cash-split">
      <div><h3 class="h-sm">Entradas por tipo</h3><ul class="kv">
        <li><span>Recebimentos de vendas e outras receitas</span><strong>${brl(r.recebidoOperacional)}</strong></li>
        <li><span>Aportes do dono</span><strong>${brl(r.recebido - r.recebidoOperacional)}</strong></li></ul></div>
      <div><h3 class="h-sm">Saídas por tipo</h3><ul class="kv">
        <li><span>Custos, despesas e impostos pagos</span><strong>${brl(r.pagoOperacional)}</strong></li>
        <li><span>Investimentos e retiradas pagos</span><strong>${brl(r.pago - r.pagoOperacional)}</strong></li></ul></div>
    </div>
    <p class="muted small">Resultado de caixa das operações (sem aportes, investimentos e retiradas): <strong>${brl(r.resultadoCaixaOperacional)}</strong>. Ele pode ser diferente do lucro: uma venda feita e ainda não recebida entra no lucro, mas não no caixa.</p>
  </section>

  <section class="duo">
    <div class="card">
      <div class="card-head"><h2>Maiores gastos por categoria</h2><span class="muted small">${esc(rotulo(per))}</span></div>
      ${porCat.length ? '<div data-gastos></div>' : '<p class="muted">Nenhuma despesa no período.</p>'}
    </div>
    <div class="card">
      <div class="card-head"><h2>Faturamento × custos × despesas</h2><span class="muted small">12 meses</span></div>
      <div class="chart" data-chart-comp></div>
    </div>
  </section>

  <section class="card">
    <div class="card-head"><h2>Evolução mensal</h2><span class="muted small">até 12 meses, a partir do primeiro mês com lançamentos</span></div>
    <div class="table-wrap"><table class="tbl compact evol">
      <thead><tr><th>Mês</th><th class="num">Faturamento</th><th class="num">Custos</th><th class="num">Despesas op.</th><th class="num">Impostos</th><th class="num">Lucro</th><th class="num">Margem</th><th class="num">Recebido</th><th class="num">Pago</th><th class="num">Caixa (±)</th></tr></thead>
      <tbody>${serie.slice(Math.max(0, Math.min(serie.findIndex((x) => x.faturamento || x.despesas || x.recebido || x.pago), serie.length - 1))).reverse().map((s) => `<tr><td>${mesCurto(s.mes)}${s.parcial ? ' <small class="muted">parcial</small>' : ''}</td><td class="num">${brl(s.faturamento)}</td><td class="num">${brl(s.custos)}</td><td class="num">${brl(s.operacionais)}</td><td class="num">${brl(s.impostos)}</td><td class="num ${s.lucro < 0 ? 'neg' : ''}">${brl(s.lucro)}</td><td class="num">${s.faturamento ? pct(s.lucro / s.faturamento) : '—'}</td><td class="num">${brl(s.recebido)}</td><td class="num">${brl(s.pago)}</td><td class="num ${s.recebido - s.pago < 0 ? 'neg' : ''}">${brl(s.recebido - s.pago)}</td></tr>`).join('')}</tbody>
    </table></div>
  </section>`;

  if (fx.dias.length > 1) linhaSaldo(el.querySelector('[data-chart-saldo]'), { dias: fx.dias.length > 400 ? fx.dias.filter((_, i) => i % 7 === 0 || i === fx.dias.length - 1) : fx.dias, hoje: ref });
  if (porCat.length) barrasH(el.querySelector('[data-gastos]'), porCat.slice(0, 10), { total: totalDesp });
  if (porOrigem.length) barrasH(el.querySelector('[data-origem]'), porOrigem, { total: r.faturamento });
  if (porCatRec.length) barrasH(el.querySelector('[data-cat-rec]'), porCatRec, { total: r.faturamento });
  colunas(el.querySelector('[data-chart-comp]'), {
    titulo: 'Faturamento, custos de produção e despesas por mês', altura: 220,
    rotulos: serie.map((s) => mesCurto(s.mes)),
    series: [
      { nome: 'Faturamento', cor: 'var(--c-entrada)', valores: serie.map((s) => s.faturamento) },
      { nome: 'Custos de produção', cor: 'var(--c-saida)', valores: serie.map((s) => s.custos) },
      { nome: 'Despesas op. + impostos', cor: 'var(--c-lucro)', valores: serie.map((s) => s.operacionais + s.impostos) },
    ],
  });
  ligarFiltro(el.querySelector('[data-period]'), (p) => { per = p; trocarParams({ periodo: p.preset, inicio: p.preset === 'personalizado' ? p.inicio : '', fim: p.preset === 'personalizado' ? p.fim : '' }); desenhar(); });
  el.querySelector('[data-imprimir]').addEventListener('click', () => window.print());
}
