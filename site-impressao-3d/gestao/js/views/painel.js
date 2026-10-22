/* Painel inicial: visão geral do negócio. */
import { S, carregarTudo } from '../store.js';
import * as F from '../finance.js';
import { brl, pct, hoje, inicioMes, fimMes, inicioSemana, somaDias, somaMeses, diasEntre, dataCurta, mesCurto, esc, centavos } from '../format.js';
import { icon, ocupado, erro, selo, vazio, toast } from '../ui.js';
import { colunas, medidor } from '../charts.js';
import { filtroHTML, ligarFiltro, resolver, rotulo } from './periodo.js';
import { trocarParams } from '../nav.js';
import { abrirLancamento, baixar } from './lancamento-form.js';

let el; let per;

export function render(root, params) {
  el = root;
  per = resolver(params.periodo || 'mes', params.inicio, params.fim);
  desenhar();
}
export const atualizar = () => desenhar();

/** Variação em relação ao período anterior. */
export function variacao(atual, anterior, { melhorMaior = true, rotuloAnt = 'período anterior' } = {}) {
  if (!anterior) return `<span class="delta delta-neutro">sem base de comparação</span>`;
  const d = (atual - anterior) / Math.abs(anterior);
  if (Math.abs(d) < 0.005) return `<span class="delta delta-neutro">igual ao ${rotuloAnt}</span>`;
  const bom = melhorMaior ? d > 0 : d < 0;
  return `<span class="delta ${bom ? 'delta-bom' : 'delta-ruim'}">${icon(d > 0 ? 'trend-up' : 'trend-down')}${d > 0 ? '+' : ''}${pct(d)} <small>vs ${rotuloAnt}</small></span>`;
}

function rotuloAnterior(p) {
  if (p.preset === 'hoje') return 'ontem';
  if (p.preset === 'semana') return 'semana passada';
  if (p.preset === 'mes' || p.preset === 'mes_anterior') return 'mês anterior';
  if (p.preset === 'ano') return 'ano anterior';
  return 'período anterior';
}

function anteriorDe(p) {
  if (p.preset === 'ano') { const a = Number(p.inicio.slice(0, 4)) - 1; return { inicio: `${a}-01-01`, fim: `${a}-12-31` }; }
  return F.periodoAnterior(p);
}

function primeirosPassos() {
  const temLanc = S.lancamentos.length > 0;
  const passos = [
    { ok: S.contas.some((c) => Number(c.saldo_inicial) !== 0) || temLanc, txt: 'Informe quanto há hoje em cada conta (saldo inicial)', link: '#/config?aba=contas' },
    { ok: S.recorrencias.length > 0, txt: 'Cadastre as despesas fixas mensais (energia, internet, DAS…)', link: '#/config?aba=recorrencias' },
    { ok: S.lancamentos.some((l) => l.tipo === 'receita'), txt: 'Registre as vendas e os sinais recebidos por Pix', acao: 'receita' },
    { ok: S.lancamentos.some((l) => l.tipo === 'despesa' && S.cats[l.categoria_id]?.grupo === 'custo_producao'), txt: 'Lance os gastos com material (filamento, resina, tinta, embalagem)', acao: 'despesa' },
    { ok: S.orcamentos.some((o) => o.mes === inicioMes(hoje())), txt: 'Defina o orçamento do mês', link: '#/orcamento' },
    { ok: S.metas.length > 0, txt: 'Crie uma meta (ex.: faturamento do mês)', link: '#/metas' },
  ];
  if (passos.every((p) => p.ok)) return '';
  const feitos = passos.filter((p) => p.ok).length;
  return `<section class="card onboarding">
    <div class="card-head"><h2>Primeiros passos</h2><span class="muted">${feitos} de ${passos.length}</span></div>
    <p class="muted">O painel fica completo à medida que os dados reais forem cadastrados. Nada aqui é estimado sem dados.</p>
    <ol class="checklist">${passos.map((p) => `<li class="${p.ok ? 'done' : ''}">${icon(p.ok ? 'check-circle' : 'circle')}
      ${p.ok ? `<span>${p.txt}</span>` : p.acao ? `<button type="button" class="btn-link" data-novo-lanc="${p.acao}">${p.txt}</button>` : `<a href="${p.link}">${p.txt}</a>`}</li>`).join('')}</ol>
  </section>`;
}

function faixaFaturamento() {
  const ref = hoje();
  const L = S.lancamentos; const C = S.cats;
  const fat = (ini, fim) => F.resumo(L, C, { inicio: ini, fim }, ref).faturamento;
  const iSem = inicioSemana(ref); const dSem = diasEntre(iSem, ref);
  const iMes = inicioMes(ref); const dMes = diasEntre(iMes, ref);
  const iMesAnt = somaMeses(ref, -1);
  const fimMesAntComparavel = (() => { const f = somaDias(iMesAnt, dMes); return f > fimMes(iMesAnt) ? fimMes(iMesAnt) : f; })();
  const itens = [
    { t: 'Hoje', v: fat(ref, ref), a: fat(somaDias(ref, -1), somaDias(ref, -1)), r: 'ontem', link: '#/lancamentos?tipo=receita&periodo=hoje' },
    { t: 'Esta semana', v: fat(iSem, ref), a: fat(somaDias(iSem, -7), somaDias(iSem, dSem - 7)), r: 'mesmo ponto da semana passada', link: '#/lancamentos?tipo=receita&periodo=semana' },
    { t: 'Este mês', v: fat(iMes, ref), a: fat(iMesAnt, fimMesAntComparavel), r: 'mesmo ponto do mês passado', link: '#/lancamentos?tipo=receita&periodo=mes' },
  ];
  return `<section class="fat-strip" aria-label="Faturamento">
    ${itens.map((i) => `<a class="fat-item" href="${i.link}"><span class="kpi-label"><span class="pre">Faturamento · </span>${i.t}</span>
      <strong class="kpi-value">${brl(i.v)}</strong>${variacao(i.v, i.a, { rotuloAnt: i.r })}</a>`).join('')}
  </section>`;
}

function desenhar() {
  const ref = hoje();
  const L = S.lancamentos; const C = S.cats;
  const r = F.resumo(L, C, per, ref);
  const ant = anteriorDe(per);
  const ra = F.resumo(L, C, ant, ref);
  const rotAnt = rotuloAnterior(per);
  const saldo = F.saldos(L, S.contas, ref);
  const saldoIni = F.saldos(L, S.contas, somaDias(per.inicio, -1)).total;
  const pend = F.pendencias(L, ref, S.empresa.alerta_vencimento_dias);
  const serie = F.serieMensal(L, C, 12, ref);
  const orc = F.orcamentoMes(L, C, S.orcamentos, ref, S.empresa.alerta_orcamento_pct);
  const ins = F.insights(L, C, S.orcamentos, ref, S.empresa.alerta_orcamento_pct);
  const metas = S.metas.filter((m) => m.ativo && m.fim >= somaDias(ref, -31)).slice(0, 4).map((m) => F.progressoMeta(m, L, C, S.contas, ref));
  const limiteVenc = somaDias(ref, S.empresa.alerta_vencimento_dias);
  const proximos = L.filter((l) => F.pendente(l) && l.data_vencimento <= limiteVenc)
    .sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento)).slice(0, 8);

  el.innerHTML = `
  <div class="toolbar">
    ${filtroHTML(per, ['hoje', 'semana', 'mes', 'mes_anterior', 'trimestre', 'ano', 'personalizado'])}
    <button type="button" class="btn btn-ghost btn-sm" data-recarregar data-busy="Atualizando…">${icon('refresh')} Atualizar</button>
  </div>
  ${primeirosPassos()}
  ${faixaFaturamento()}

  <section class="kpis" aria-label="Indicadores do período">
    <a class="kpi" href="#/resultados?periodo=${per.preset}&inicio=${per.inicio}&fim=${per.fim}">
      <span class="kpi-label">${icon('arrow-down')} Receitas recebidas</span>
      <strong class="kpi-value">${brl(r.recebido)}</strong>
      ${variacao(r.recebido, ra.recebido, { rotuloAnt: rotAnt })}
      <span class="kpi-sub">Faturado no período: ${brl(r.faturamento)}${r.aportes ? ` · aportes ${brl(r.aportes)}` : ''}</span>
    </a>
    <a class="kpi" href="#/lancamentos?tipo=despesa&status=pago&periodo=${per.preset}&inicio=${per.inicio}&fim=${per.fim}&data=pagamento">
      <span class="kpi-label">${icon('arrow-up')} Despesas pagas</span>
      <strong class="kpi-value">${brl(r.pago)}</strong>
      ${variacao(r.pago, ra.pago, { melhorMaior: false, rotuloAnt: rotAnt })}
      <span class="kpi-sub">Despesas do período (pagas + a pagar): ${brl(r.despesasTotal)}</span>
    </a>
    <a class="kpi ${r.lucro < 0 ? 'kpi-neg' : ''}" href="#/resultados?periodo=${per.preset}&inicio=${per.inicio}&fim=${per.fim}">
      <span class="kpi-label">${icon('chart')} Lucro estimado</span>
      <strong class="kpi-value">${brl(r.lucro)}</strong>
      ${variacao(r.lucro, ra.lucro, { rotuloAnt: rotAnt })}
      <span class="kpi-sub">Margem ${pct(r.margem)} · ${r.avisos.some((a) => a.id === 'sem-custos') ? `<span class="warn-inline">${icon('alert')} faltam custos</span>` : 'faturamento − custos − despesas'}</span>
    </a>
    <a class="kpi ${saldo.total < 0 ? 'kpi-neg' : ''}" href="#/resultados?periodo=${per.preset}&inicio=${per.inicio}&fim=${per.fim}#fluxo">
      <span class="kpi-label">${icon('wallet')} Saldo em caixa hoje</span>
      <strong class="kpi-value">${brl(saldo.total)}</strong>
      ${variacao(saldo.total, saldoIni, { rotuloAnt: `início do período` })}
      <span class="kpi-sub">${saldo.porConta.filter((c) => c.conta.ativo || c.saldo).map((c) => `${esc(c.conta.nome)}: ${brl(c.saldo)}`).join(' · ') || 'Cadastre uma conta'}</span>
    </a>
  </section>

  <section class="duo">
    <a class="card card-link pend pend-receber" href="#/contas?aba=receber">
      <div class="card-head"><h2>${icon('arrow-down')} A receber</h2>${icon('chevron')}</div>
      <strong class="big">${brl(pend.receber.total)}</strong>
      <p class="muted">${pend.receber.qtd} conta(s) pendente(s)</p>
      ${pend.receber.qtdVencido ? `<p class="flag flag-critico">${icon('alert')} ${pend.receber.qtdVencido} atrasada(s): ${brl(pend.receber.vencido)}</p>` : '<p class="flag flag-ok">Nenhum recebimento atrasado</p>'}
    </a>
    <a class="card card-link pend pend-pagar" href="#/contas?aba=pagar">
      <div class="card-head"><h2>${icon('arrow-up')} A pagar</h2>${icon('chevron')}</div>
      <strong class="big">${brl(pend.pagar.total)}</strong>
      <p class="muted">${pend.pagar.qtd} conta(s) · ${pend.pagar.qtdProximos} vencem em ${S.empresa.alerta_vencimento_dias} dias (${brl(pend.pagar.proximos)})</p>
      ${pend.pagar.qtdVencido ? `<p class="flag flag-critico">${icon('alert')} ${pend.pagar.qtdVencido} vencida(s): ${brl(pend.pagar.vencido)}</p>` : '<p class="flag flag-ok">Nenhuma conta vencida</p>'}
    </a>
  </section>

  <section class="card">
    <div class="card-head"><h2>Evolução dos últimos 12 meses</h2><a class="btn-link" href="#/resultados?periodo=ano">Ver relatório</a></div>
    <p class="muted small">Pela data da venda/gasto (competência). Despesas = custos + operacionais + impostos. O mês atual está em andamento.</p>
    <div class="chart" data-chart-evolucao></div>
    <details class="table-view"><summary>Ver como tabela</summary>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>Mês</th><th class="num">Faturamento</th><th class="num">Despesas</th><th class="num">Lucro</th></tr></thead>
      <tbody>${serie.map((s) => `<tr><td>${mesCurto(s.mes)}${s.parcial ? ' (parcial)' : ''}</td><td class="num">${brl(s.faturamento)}</td><td class="num">${brl(s.despesas)}</td><td class="num">${brl(s.lucro)}</td></tr>`).join('')}</tbody></table></div>
    </details>
  </section>

  <section class="duo">
    <div class="card">
      <div class="card-head"><h2>Vencimentos próximos</h2><a class="btn-link" href="#/contas">Calendário</a></div>
      ${proximos.length ? `<ul class="list">${proximos.map((l) => `
        <li class="list-item">
          <span class="li-date ${F.vencido(l, ref) ? 'late' : ''}">${dataCurta(l.data_vencimento)}</span>
          <span class="li-main"><strong>${esc(l.descricao)}</strong><small>${l.tipo === 'receita' ? 'A receber' : 'A pagar'} · ${esc(C[l.categoria_id]?.nome || '')}</small></span>
          <span class="li-val ${l.tipo === 'receita' ? 'pos' : 'neg'}">${brl(centavos(l.valor))}</span>
          ${selo(F.statusEfetivo(l, ref))}
          <button type="button" class="btn btn-sm btn-ghost" data-baixar="${l.id}">${icon('check')}<span class="sr-only">Registrar ${l.tipo === 'receita' ? 'recebimento' : 'pagamento'} de ${esc(l.descricao)}</span></button>
        </li>`).join('')}</ul>` : vazio({ icone: 'calendar', titulo: 'Nada vencendo', texto: `Nenhuma conta pendente vence nos próximos ${S.empresa.alerta_vencimento_dias} dias.` })}
    </div>
    <div class="card">
      <div class="card-head"><h2>Orçamento de ${mesCurto(ref)}</h2><a class="btn-link" href="#/orcamento">Detalhes</a></div>
      ${orc.planejado ? `
        <div class="budget-total"><span>${brl(orc.gastoPlanejado)} de ${brl(orc.planejado)}</span>${medidor(orc.gastoPlanejado / orc.planejado, orc.gastoPlanejado > orc.planejado ? 'estourado' : orc.gastoPlanejado / orc.planejado >= S.empresa.alerta_orcamento_pct / 100 ? 'alerta' : 'ok')}</div>
        <ul class="budget-mini">${orc.linhas.filter((x) => x.limite !== null).sort((a, b) => (b.uso || 0) - (a.uso || 0)).slice(0, 5).map((x) => `
          <li><span class="bm-name">${esc(x.categoria.nome)}</span>${medidor(x.uso, x.situacao)}<span class="bm-val">${pct(x.uso === Infinity ? 1 : x.uso)}</span>${x.situacao === 'estourado' ? `<span class="tag tag-critico">${icon('alert')}Acima</span>` : x.situacao === 'alerta' ? `<span class="tag tag-alerta">${icon('alert')}Atenção</span>` : ''}</li>`).join('')}</ul>
        ${orc.foraDoPlano ? `<p class="muted small">${brl(orc.foraDoPlano)} gastos em categorias sem limite definido.</p>` : ''}`
      : vazio({ icone: 'wallet', titulo: 'Sem orçamento para este mês', texto: 'Defina limites por categoria para acompanhar o planejado × realizado.', acao: '<a class="btn btn-sm btn-accent" href="#/orcamento">Definir orçamento</a>' })}
    </div>
  </section>

  <section class="duo">
    <div class="card">
      <div class="card-head"><h2>Metas</h2><a class="btn-link" href="#/metas">Todas</a></div>
      ${metas.length ? `<ul class="goals-mini">${metas.map((m) => `
        <li><div class="gm-top"><strong>${esc(m.meta.titulo)}</strong><span>${m.progresso === null ? '—' : pct(Math.min(m.progresso, 9.99))}</span></div>
        ${medidor(m.progresso, m.melhorMenor ? (m.estourada ? 'estourado' : m.progresso >= 0.9 ? 'alerta' : 'ok') : (m.atingida ? 'ok' : 'progresso'))}
        <small class="muted">${brl(m.atual)} de ${m.alvo === null ? '—' : brl(m.alvo)}${m.encerrada ? ' · encerrada' : ''}</small></li>`).join('')}</ul>`
      : vazio({ icone: 'target', titulo: 'Nenhuma meta ativa', acao: '<a class="btn btn-sm btn-accent" href="#/metas">Criar meta</a>' })}
    </div>
    <div class="card">
      <div class="card-head"><h2>Insights</h2><span class="muted small">baseados nos dados lançados</span></div>
      ${ins.length ? `<ul class="insights">${ins.slice(0, 5).map((i) => `<li class="ins ins-${i.nivel}">${icon(i.nivel === 'bom' ? 'trend-up' : 'alert')}<div><a href="${i.link}"><strong>${esc(i.titulo)}</strong></a><p>${esc(i.texto)}</p></div></li>`).join('')}</ul>`
      : `<p class="muted">Nenhum ponto de atenção agora. Os insights aparecem quando houver histórico de alguns meses e orçamento definido.</p>`}
    </div>
  </section>

  ${r.avisos.filter((a) => a.id !== 'sem-dados').length ? `<section class="note note-alerta">${icon('alert')}<div><strong>Sobre os números de ${esc(rotulo(per))}:</strong><ul>${r.avisos.filter((a) => a.id !== 'sem-dados').map((a) => `<li>${esc(a.texto)}</li>`).join('')}</ul></div></section>` : ''}
  <p class="muted small updated">Dados carregados às ${S.carregadoEm ? S.carregadoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}.</p>
  `;

  colunas(el.querySelector('[data-chart-evolucao]'), {
    titulo: 'Faturamento, despesas e lucro por mês',
    rotulos: serie.map((s) => mesCurto(s.mes)),
    series: [
      { nome: 'Faturamento', cor: 'var(--c-entrada)', valores: serie.map((s) => s.faturamento) },
      { nome: 'Despesas', cor: 'var(--c-saida)', valores: serie.map((s) => s.despesas) },
    ],
    linha: { nome: 'Lucro', cor: 'var(--c-lucro)', valores: serie.map((s) => s.lucro) },
  });

  ligarFiltro(el.querySelector('[data-period]'), (p) => { per = p; trocarParams({ periodo: p.preset, inicio: p.preset === 'personalizado' ? p.inicio : '', fim: p.preset === 'personalizado' ? p.fim : '' }); desenhar(); });
  el.querySelector('[data-recarregar]').addEventListener('click', (e) => ocupado(e.currentTarget, async () => { try { await carregarTudo(); toast('Dados atualizados.'); } catch (ex) { erro(ex); } }));
  el.querySelectorAll('[data-baixar]').forEach((b) => b.addEventListener('click', () => baixar(S.lancamentos.find((l) => l.id === b.dataset.baixar))));
  el.querySelectorAll('[data-novo-lanc]').forEach((b) => b.addEventListener('click', () => abrirLancamento({ tipo: b.dataset.novoLanc })));
}
