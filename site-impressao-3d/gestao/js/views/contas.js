/* Contas a pagar e a receber: pendências, calendário, previsão e histórico. */
import { S, podeEditarLanc } from '../store.js';
import * as F from '../finance.js';
import { brl, centavos, dataBR, dataCurta, esc, norm, hoje, somaDias, somaMeses, inicioMes, mesLongo, diasEntre, FORMAS } from '../format.js';
import { icon, selo, vazio } from '../ui.js';
import { trocarParams } from '../nav.js';
import { filtroHTML, ligarFiltro, resolver } from './periodo.js';
import { abrirLancamento, baixar } from './lancamento-form.js';

let el; let aba = 'receber'; let mesCal = inicioMes(hoje()); let diaSel = null; let busca = ''; let catF = ''; let perHist;

export function render(root, params) {
  el = root;
  aba = ['receber', 'pagar', 'calendario', 'historico'].includes(params.aba) ? params.aba : 'receber';
  if (params.mes) mesCal = inicioMes(params.mes);
  perHist = resolver(params.periodo || 'mes', params.inicio, params.fim);
  busca = ''; catF = '';
  desenhar();
}
export const atualizar = () => desenhar();

function previsao() {
  const ref = hoje();
  const saldo = F.saldos(S.lancamentos, S.contas, ref).total;
  const pend = S.lancamentos.filter(F.pendente);
  const ate = (dias) => {
    const lim = somaDias(ref, dias);
    const arr = pend.filter((l) => l.data_vencimento <= lim);   // inclui vencidas: ainda precisam ser pagas/recebidas
    const ent = arr.filter((l) => l.tipo === 'receita').reduce((t, l) => t + centavos(l.valor), 0);
    const sai = arr.filter((l) => l.tipo === 'despesa').reduce((t, l) => t + centavos(l.valor), 0);
    return { dias, ent, sai, saldo: saldo + ent - sai };
  };
  const linhas = [ate(30), ate(60), ate(90)];
  return `<section class="card">
    <div class="card-head"><h2>Previsão de caixa</h2><span class="muted small">saldo hoje: <strong>${brl(saldo)}</strong></span></div>
    <div class="table-wrap"><table class="tbl compact"><thead><tr><th>Próximos</th><th class="num">Entradas previstas</th><th class="num">Saídas previstas</th><th class="num">Saldo projetado</th></tr></thead>
    <tbody>${linhas.map((x) => `<tr><td>${x.dias} dias</td><td class="num pos">${brl(x.ent)}</td><td class="num neg">${brl(x.sai)}</td><td class="num ${x.saldo < 0 ? 'neg strong' : 'strong'}">${brl(x.saldo)}${x.saldo < 0 ? ` ${icon('alert')}` : ''}</td></tr>`).join('')}</tbody></table></div>
    <p class="muted small">Considera somente o que está lançado como pendente (incluindo atrasados). Recorrências mensais são geradas até o fim do próximo mês.</p>
  </section>`;
}

function itemHTML(l, ref) {
  const atraso = F.vencido(l, ref) ? diasEntre(l.data_vencimento, ref) : 0;
  const falta = !atraso ? diasEntre(ref, l.data_vencimento) : 0;
  return `<li class="list-item">
    <span class="li-date ${atraso ? 'late' : ''}">${dataCurta(l.data_vencimento)}<small>${atraso ? `${atraso}d atraso` : falta === 0 ? 'hoje' : `em ${falta}d`}</small></span>
    <span class="li-main"><button type="button" class="row-open" data-abrir="${l.id}"><strong>${esc(l.descricao)}</strong></button>
      <small>${esc(S.cats[l.categoria_id]?.nome || '')}${l.cliente ? ` · ${esc(l.cliente)}` : ''}${l.recorrencia_id ? ' · mensal' : ''}</small></span>
    <span class="li-val ${l.tipo === 'receita' ? 'pos' : 'neg'}">${brl(centavos(l.valor))}</span>
    ${podeEditarLanc(l) ? `<button type="button" class="btn btn-sm btn-accent" data-baixar="${l.id}">${icon('check')}<span>${l.tipo === 'receita' ? 'Recebi' : 'Paguei'}</span></button>` : ''}
  </li>`;
}

function abaPendentes(tipo) {
  const ref = hoje();
  const dias = S.empresa.alerta_vencimento_dias;
  const q = norm(busca);
  const arr = S.lancamentos.filter((l) => F.pendente(l) && l.tipo === tipo && (!catF || l.categoria_id === catF)
    && (!q || norm(`${l.descricao} ${l.cliente || ''}`).includes(q)))
    .sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento));
  const grupos = [
    { t: 'Atrasadas', cls: 'critico', itens: arr.filter((l) => l.data_vencimento < ref) },
    { t: `Vencem nos próximos ${dias} dias`, cls: 'alerta', itens: arr.filter((l) => l.data_vencimento >= ref && l.data_vencimento <= somaDias(ref, dias)) },
    { t: 'Mais adiante', cls: 'neutro', itens: arr.filter((l) => l.data_vencimento > somaDias(ref, dias)) },
  ];
  const total = (xs) => xs.reduce((t, l) => t + centavos(l.valor), 0);
  const cats = S.categorias.filter((c) => c.tipo === tipo);
  return `
  <div class="toolbar wrap">
    <div class="search">${icon('search')}<label class="sr-only" for="b-c">Pesquisar</label><input id="b-c" type="search" data-busca placeholder="Pesquisar…" value="${esc(busca)}"></div>
    <label class="flt"><span>Categoria</span><select data-cat><option value="">Todas</option>${cats.map((c) => `<option value="${c.id}"${c.id === catF ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></label>
    <button type="button" class="btn btn-accent btn-sm" data-nova>${icon('plus')} ${tipo === 'receita' ? 'Nova conta a receber' : 'Nova conta a pagar'}</button>
  </div>
  <div class="totals"><span><small>Total ${tipo === 'receita' ? 'a receber' : 'a pagar'}</small><strong class="${tipo === 'receita' ? 'pos' : 'neg'}">${brl(total(arr))}</strong></span>
    <span><small>Atrasado</small><strong class="${grupos[0].itens.length ? 'neg' : ''}">${brl(total(grupos[0].itens))}</strong></span>
    <span><small>${arr.length} conta(s)</small></span></div>
  ${arr.length ? grupos.filter((g) => g.itens.length).map((g) => `
    <section class="card group group-${g.cls}">
      <div class="card-head"><h2>${g.cls === 'critico' ? icon('alert') : ''}${g.t}</h2><span>${g.itens.length} · <strong>${brl(total(g.itens))}</strong></span></div>
      <ul class="list">${g.itens.map((l) => itemHTML(l, ref)).join('')}</ul>
    </section>`).join('')
    : vazio({ icone: 'check-circle', titulo: tipo === 'receita' ? 'Nada a receber' : 'Nada a pagar', texto: tipo === 'receita'
      ? 'Quando um cliente pagar só o sinal, registre o restante como receita "A receber" com a data combinada.'
      : 'Contas futuras (boletos, fatura, DAS) lançadas como "A pagar" aparecem aqui com alerta de vencimento.' })}
  ${previsao()}`;
}

function abaCalendario() {
  const ref = hoje();
  const cal = F.calendarioMes(S.lancamentos, mesCal, ref);
  const dias = Object.keys(cal.dias);
  const tot = Object.values(cal.dias).reduce((t, d) => ({ r: t.r + d.receber + d.recebido, p: t.p + d.pagar + d.pago }), { r: 0, p: 0 });
  const sel = diaSel && cal.dias[diaSel] ? diaSel : null;
  return `
  <div class="toolbar">
    <div class="month-nav">
      <button type="button" class="icon-btn" data-mes="-1" aria-label="Mês anterior">${icon('chevron-left')}</button>
      <h2 class="month-title">${mesLongo(mesCal)}</h2>
      <button type="button" class="icon-btn" data-mes="1" aria-label="Próximo mês">${icon('chevron')}</button>
      ${mesCal !== inicioMes(ref) ? '<button type="button" class="btn btn-ghost btn-sm" data-mes="0">Hoje</button>' : ''}
    </div>
    <div class="cal-legend"><span><i class="dot dot-r"></i>Entradas</span><span><i class="dot dot-p"></i>Saídas</span><span><i class="dot dot-late"></i>Atrasado</span></div>
  </div>
  <div class="totals"><span><small>Entradas no mês</small><strong class="pos">${brl(tot.r)}</strong></span><span><small>Saídas no mês</small><strong class="neg">${brl(tot.p)}</strong></span></div>
  <div class="cal" role="grid" aria-label="Calendário financeiro de ${mesLongo(mesCal)}">
    ${['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((d) => `<div class="cal-dow" role="columnheader">${d}</div>`).join('')}
    ${'<div class="cal-pad"></div>'.repeat(cal.primeiroDow)}
    ${dias.map((d) => {
      const x = cal.dias[d];
      const ent = x.receber + x.recebido; const sai = x.pagar + x.pago;
      return `<button type="button" role="gridcell" class="cal-day ${d === ref ? 'today' : ''} ${d === sel ? 'sel' : ''} ${x.vencidos ? 'has-late' : ''}" data-dia="${d}" aria-label="${dataBR(d)}: entradas ${brl(ent)}, saídas ${brl(sai)}">
        <span class="cal-n">${Number(d.slice(8))}</span>
        ${ent ? `<span class="cal-v pos"><i class="dot dot-r"></i>${brl(ent).replace(/,\d\d$/, '')}</span>` : ''}
        ${sai ? `<span class="cal-v neg"><i class="dot ${x.vencidos ? 'dot-late' : 'dot-p'}"></i>${brl(sai).replace(/,\d\d$/, '')}</span>` : ''}
      </button>`;
    }).join('')}
  </div>
  <section class="card" data-dia-box>
    ${sel ? `<div class="card-head"><h2>${dataBR(sel)}</h2></div>${cal.dias[sel].itens.length ? `<ul class="list">${cal.dias[sel].itens.map((l) => `
      <li class="list-item"><span class="li-main"><button type="button" class="row-open" data-abrir="${l.id}"><strong>${esc(l.descricao)}</strong></button><small>${l.tipo === 'receita' ? 'Receita' : 'Despesa'} · ${esc(S.cats[l.categoria_id]?.nome || '')}</small></span>
      <span class="li-val ${l.tipo === 'receita' ? 'pos' : 'neg'}">${brl(centavos(l.valor))}</span>${selo(F.statusEfetivo(l, ref))}
      ${l.status === 'pendente' && podeEditarLanc(l) ? `<button type="button" class="btn btn-sm btn-ghost" data-baixar="${l.id}">${icon('check')}</button>` : ''}</li>`).join('')}</ul>` : '<p class="muted">Nenhum lançamento neste dia.</p>'}`
      : '<p class="muted">Toque em um dia para ver os lançamentos. Contas pendentes aparecem no vencimento; as pagas, na data do pagamento.</p>'}
  </section>`;
}

function abaHistorico() {
  const arr = S.lancamentos.filter((l) => F.estaPago(l) && l.data_pagamento >= perHist.inicio && l.data_pagamento <= perHist.fim
    && (!busca || norm(`${l.descricao} ${l.cliente || ''}`).includes(norm(busca))))
    .sort((a, b) => b.data_pagamento.localeCompare(a.data_pagamento) || b.atualizado_em.localeCompare(a.atualizado_em));
  const ent = arr.filter((l) => l.tipo === 'receita').reduce((t, l) => t + centavos(l.valor), 0);
  const sai = arr.filter((l) => l.tipo === 'despesa').reduce((t, l) => t + centavos(l.valor), 0);
  const atrasoMedio = (() => {
    const xs = arr.filter((l) => l.tipo === 'despesa');
    const atrasados = xs.filter((l) => l.data_pagamento > l.data_vencimento);
    return { qtd: atrasados.length, de: xs.length };
  })();
  return `
  <div class="toolbar wrap">${filtroHTML(perHist, ['semana', 'mes', 'mes_anterior', 'trimestre', 'ano', 'personalizado'])}
    <div class="search">${icon('search')}<label class="sr-only" for="b-h">Pesquisar</label><input id="b-h" type="search" data-busca placeholder="Pesquisar…" value="${esc(busca)}"></div></div>
  <div class="totals"><span><small>Recebido</small><strong class="pos">${brl(ent)}</strong></span><span><small>Pago</small><strong class="neg">${brl(sai)}</strong></span>
    ${atrasoMedio.de ? `<span><small>Contas pagas após o vencimento</small><strong>${atrasoMedio.qtd} de ${atrasoMedio.de}</strong></span>` : ''}</div>
  ${arr.length ? `<div class="table-wrap"><table class="tbl tbl-cards"><thead><tr><th>Pago em</th><th>Descrição</th><th>Vencimento</th><th>Conta · forma</th><th class="num">Valor</th></tr></thead><tbody>
    ${arr.map((l) => `<tr><td data-th="Pago em">${dataBR(l.data_pagamento)}</td>
      <td data-th="Descrição" class="td-main"><button type="button" class="row-open" data-abrir="${l.id}"><strong>${esc(l.descricao)}</strong></button><small>${esc(S.cats[l.categoria_id]?.nome || '')}</small></td>
      <td data-th="Vencimento">${dataBR(l.data_vencimento)}${l.data_pagamento > l.data_vencimento ? ` <span class="tag tag-alerta">${diasEntre(l.data_vencimento, l.data_pagamento)}d depois</span>` : ''}</td>
      <td data-th="Conta">${esc(S.contas.find((c) => c.id === l.conta_id)?.nome || '—')} · ${FORMAS[l.forma_pagamento] || '—'}</td>
      <td data-th="Valor" class="num ${l.tipo === 'receita' ? 'pos' : 'neg'}">${l.tipo === 'receita' ? '+' : '−'} ${brl(centavos(l.valor))}</td></tr>`).join('')}
  </tbody></table></div>` : vazio({ icone: 'history', titulo: 'Nenhum pagamento no período' })}`;
}

function desenhar() {
  const pend = F.pendencias(S.lancamentos, hoje(), S.empresa.alerta_vencimento_dias);
  const tabs = [['receber', 'A receber', pend.receber.qtdVencido], ['pagar', 'A pagar', pend.pagar.qtdVencido], ['calendario', 'Calendário', 0], ['historico', 'Histórico', 0]];
  el.innerHTML = `
  <div class="tabs" role="tablist">${tabs.map(([k, t, n]) => `<button type="button" role="tab" aria-selected="${aba === k}" data-aba="${k}">${t}${n ? `<span class="badge" aria-label="${n} atrasada(s)">${n}</span>` : ''}</button>`).join('')}</div>
  <div class="tab-body">${aba === 'receber' ? abaPendentes('receita') : aba === 'pagar' ? abaPendentes('despesa') : aba === 'calendario' ? abaCalendario() : abaHistorico()}</div>`;

  el.querySelectorAll('[data-aba]').forEach((b) => b.addEventListener('click', () => { aba = b.dataset.aba; busca = ''; catF = ''; trocarParams({ aba }); desenhar(); }));
  const achar = (id) => S.lancamentos.find((l) => l.id === id);
  el.querySelectorAll('[data-abrir]').forEach((b) => b.addEventListener('click', () => abrirLancamento({ lanc: achar(b.dataset.abrir) })));
  el.querySelectorAll('[data-baixar]').forEach((b) => b.addEventListener('click', () => baixar(achar(b.dataset.baixar))));
  el.querySelector('[data-nova]')?.addEventListener('click', () => abrirLancamento({ tipo: aba === 'receber' ? 'receita' : 'despesa', preset: { status: 'pendente', data_vencimento: somaDias(hoje(), 7) } }));
  let t;
  el.querySelector('[data-busca]')?.addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { busca = e.target.value; desenhar(); el.querySelector('[data-busca]').focus(); const i = el.querySelector('[data-busca]'); i.setSelectionRange(i.value.length, i.value.length); }, 250); });
  el.querySelector('[data-cat]')?.addEventListener('change', (e) => { catF = e.target.value; desenhar(); });
  el.querySelectorAll('[data-mes]').forEach((b) => b.addEventListener('click', () => {
    const n = Number(b.dataset.mes); mesCal = n === 0 ? inicioMes(hoje()) : somaMeses(mesCal, n); diaSel = null; trocarParams({ aba, mes: mesCal }); desenhar();
  }));
  el.querySelectorAll('[data-dia]').forEach((b) => b.addEventListener('click', () => { diaSel = b.dataset.dia; desenhar(); el.querySelector('[data-dia-box]').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }));
  const per = el.querySelector('[data-period]');
  if (per) ligarFiltro(per, (p) => { perHist = p; trocarParams({ aba, periodo: p.preset, inicio: p.preset === 'personalizado' ? p.inicio : '', fim: p.preset === 'personalizado' ? p.fim : '' }); desenhar(); });
}
