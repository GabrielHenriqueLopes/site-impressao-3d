/* =================================================================
   Cálculos financeiros (funções puras, tudo em CENTAVOS inteiros)
   -----------------------------------------------------------------
   Conceitos que este módulo mantém separados:
   • FATURAMENTO  = vendas + frete cobrado, pela data da venda
                    (competência), recebido ou não. Cancelados não contam.
   • RECEBIDO / PAGO = dinheiro que de fato entrou/saiu (data de pagamento).
   • LUCRO (estimado) = faturamento + outras receitas
                       − custos de produção − despesas operacionais − impostos
                    (competência). Investimentos e retiradas do dono NÃO
                    reduzem o lucro; aportes do dono NÃO são receita.
   • SALDO DE CAIXA = saldo inicial das contas + tudo recebido − tudo pago.
   ================================================================= */
import { centavos, hoje, somaDias, inicioMes, fimMes, somaMeses, diasEntre, deIso, iso } from './format.js';

export const ativo = (l) => l.status !== 'cancelado';
export const estaPago = (l) => l.status === 'pago';
export const pendente = (l) => l.status === 'pendente';
export const vencido = (l, ref = hoje()) => l.status === 'pendente' && l.data_vencimento < ref;

/** Status exibido: pago | vencido | pendente | cancelado */
export const statusEfetivo = (l, ref = hoje()) => (vencido(l, ref) ? 'vencido' : l.status);

const dentro = (d, p) => d && d >= p.inicio && d <= p.fim;
const soma = (arr) => arr.reduce((t, l) => t + centavos(l.valor), 0);

/** Período anterior de mesma duração (ou o mês anterior inteiro, se o período for um mês cheio). */
export function periodoAnterior(p) {
  if (p.inicio === inicioMes(p.inicio) && p.fim === fimMes(p.inicio)) {
    const ini = somaMeses(p.inicio, -1);
    return { inicio: ini, fim: fimMes(ini) };
  }
  const dur = diasEntre(p.inicio, p.fim) + 1;
  return { inicio: somaDias(p.inicio, -dur), fim: somaDias(p.inicio, -1) };
}

/** Resumo do período: faturamento, lucro estimado, caixa, pendências e avisos. */
export function resumo(lancs, cats, p, ref = hoje()) {
  const g = (l) => cats[l.categoria_id]?.grupo;
  const comp = lancs.filter((l) => ativo(l) && dentro(l.data_competencia, p));
  const rec = comp.filter((l) => l.tipo === 'receita');
  const des = comp.filter((l) => l.tipo === 'despesa');
  const porGrupo = (arr, grupo) => soma(arr.filter((l) => g(l) === grupo));

  const vendas = porGrupo(rec, 'venda');
  const frete = porGrupo(rec, 'frete');
  const outras = porGrupo(rec, 'outra');
  const aportes = porGrupo(rec, 'aporte');
  const faturamento = vendas + frete;

  const custos = porGrupo(des, 'custo_producao');
  const operacionais = porGrupo(des, 'operacional');
  const impostos = porGrupo(des, 'imposto');
  const investimentos = porGrupo(des, 'investimento');
  const retiradas = porGrupo(des, 'retirada');
  const despesasResultado = custos + operacionais + impostos;    // o que reduz o lucro

  const lucroBruto = faturamento - custos;
  const lucro = faturamento + outras - despesasResultado;
  const margem = faturamento > 0 ? lucro / faturamento : null;
  const margemBruta = faturamento > 0 ? lucroBruto / faturamento : null;

  // caixa (regime de caixa): o que foi efetivamente recebido/pago no período
  const pagos = lancs.filter((l) => estaPago(l) && dentro(l.data_pagamento, p));
  const recebido = soma(pagos.filter((l) => l.tipo === 'receita'));
  const recebidoOperacional = soma(pagos.filter((l) => l.tipo === 'receita' && g(l) !== 'aporte'));
  const pago = soma(pagos.filter((l) => l.tipo === 'despesa'));
  const pagoOperacional = soma(pagos.filter((l) => l.tipo === 'despesa' && !['investimento', 'retirada'].includes(g(l))));

  // faturamento já recebido x a receber (das vendas do período)
  const faturadoRecebido = soma(rec.filter((l) => ['venda', 'frete'].includes(g(l)) && estaPago(l)));

  const avisos = [];
  if (faturamento > 0 && custos === 0) {
    avisos.push({ id: 'sem-custos', texto: 'Nenhum custo de produção registrado no período (filamento, resina, tinta, embalagem, frete de envio). O lucro e a margem estão superestimados até esses gastos serem lançados.' });
  }
  if (faturamento > 0 && operacionais === 0) {
    avisos.push({ id: 'sem-operacionais', texto: 'Nenhuma despesa operacional no período (energia, internet, manutenção…). Se houve, cadastre-as para o lucro ficar real.' });
  }
  if (faturamento === 0 && despesasResultado === 0) {
    avisos.push({ id: 'sem-dados', texto: 'Ainda não há lançamentos neste período.' });
  }
  const pendentesPeriodo = comp.filter(pendente).length;
  if (pendentesPeriodo) {
    avisos.push({ id: 'pendentes', texto: `${pendentesPeriodo} lançamento(s) do período ainda pendente(s): entram no lucro estimado (competência), mas ainda não no caixa.` });
  }

  return {
    vendas, frete, outras, aportes, faturamento, faturadoRecebido,
    custos, operacionais, impostos, investimentos, retiradas, despesasResultado,
    despesasTotal: despesasResultado + investimentos + retiradas,
    lucroBruto, lucro, margem, margemBruta,
    recebido, recebidoOperacional, pago, pagoOperacional,
    resultadoCaixa: recebido - pago,
    resultadoCaixaOperacional: recebidoOperacional - pagoOperacional,
    qtdVendas: rec.filter((l) => g(l) === 'venda').length,
    avisos,
  };
}

/** Saldo de cada conta em uma data (inclusive). Pagamentos anteriores à
    data do saldo inicial são ignorados (já estão dentro do saldo inicial). */
export function saldos(lancs, contas, ate = hoje()) {
  const porConta = contas.map((c) => {
    const movs = lancs.filter((l) => estaPago(l) && l.conta_id === c.id
      && l.data_pagamento >= c.data_saldo_inicial && l.data_pagamento <= ate);
    const entradas = soma(movs.filter((l) => l.tipo === 'receita'));
    const saidas = soma(movs.filter((l) => l.tipo === 'despesa'));
    const inicial = c.data_saldo_inicial <= ate ? centavos(c.saldo_inicial) : 0;
    return { conta: c, inicial, entradas, saidas, saldo: inicial + entradas - saidas };
  });
  return { porConta, total: porConta.reduce((t, c) => t + c.saldo, 0) };
}

/** Pendências (a receber / a pagar) */
export function pendencias(lancs, ref = hoje(), diasAlerta = 7) {
  const pend = lancs.filter(pendente);
  const montar = (tipo) => {
    const arr = pend.filter((l) => l.tipo === tipo);
    const venc = arr.filter((l) => l.data_vencimento < ref);
    const prox = arr.filter((l) => l.data_vencimento >= ref && l.data_vencimento <= somaDias(ref, diasAlerta));
    return {
      total: soma(arr), qtd: arr.length,
      vencido: soma(venc), qtdVencido: venc.length,
      proximos: soma(prox), qtdProximos: prox.length,
      itens: arr,
    };
  };
  return { receber: montar('receita'), pagar: montar('despesa') };
}

/** Série mensal (competência para resultado; pagamento para caixa). */
export function serieMensal(lancs, cats, meses = 12, ate = hoje()) {
  const out = [];
  for (let i = meses - 1; i >= 0; i--) {
    const ini = somaMeses(ate, -i);
    const p = { inicio: ini, fim: fimMes(ini) };
    const r = resumo(lancs, cats, p, ate);
    out.push({
      mes: ini, faturamento: r.faturamento, despesas: r.despesasResultado, lucro: r.lucro,
      recebido: r.recebido, pago: r.pago, custos: r.custos, operacionais: r.operacionais, impostos: r.impostos,
      parcial: ini === inicioMes(ate),
    });
  }
  return out;
}

/** Fluxo de caixa diário: realizado até hoje e previsto (pendentes por vencimento) depois. */
export function fluxoDiario(lancs, contas, p, ref = hoje()) {
  const saldoAntes = saldos(lancs, contas, somaDias(p.inicio, -1)).total;
  // contas cujo saldo inicial começa dentro do período entram nesse dia
  const iniciais = contas.filter((c) => dentro(c.data_saldo_inicial, p));
  const dias = [];
  let saldo = saldoAntes;
  let saldoPrevisto = saldoAntes;
  const pendVencidos = lancs.filter((l) => pendente(l) && l.data_vencimento < ref);
  for (let d = p.inicio; d <= p.fim; d = somaDias(d, 1)) {
    const ini = iniciais.filter((c) => c.data_saldo_inicial === d).reduce((t, c) => t + centavos(c.saldo_inicial), 0);
    const real = lancs.filter((l) => estaPago(l) && l.data_pagamento === d
      && contas.some((c) => c.id === l.conta_id && l.data_pagamento >= c.data_saldo_inicial));
    const entradas = soma(real.filter((l) => l.tipo === 'receita'));
    const saidas = soma(real.filter((l) => l.tipo === 'despesa'));
    // previsto: pendências que vencem no dia (as já vencidas são consideradas para hoje)
    let prev = lancs.filter((l) => pendente(l) && l.data_vencimento === d && d >= ref);
    if (d === ref) prev = prev.concat(pendVencidos);
    const entradasPrev = soma(prev.filter((l) => l.tipo === 'receita'));
    const saidasPrev = soma(prev.filter((l) => l.tipo === 'despesa'));
    saldo += ini + entradas - saidas;
    saldoPrevisto += ini + entradas - saidas + (d >= ref ? entradasPrev - saidasPrev : 0);
    dias.push({ dia: d, entradas, saidas, entradasPrev, saidasPrev, saldo: d <= ref ? saldo : null, saldoPrevisto });
  }
  const futuro = p.fim >= ref;
  return {
    saldoInicial: saldoAntes,
    entradas: dias.reduce((t, x) => t + x.entradas, 0),
    saidas: dias.reduce((t, x) => t + x.saidas, 0),
    entradasPrev: dias.reduce((t, x) => t + x.entradasPrev, 0),
    saidasPrev: dias.reduce((t, x) => t + x.saidasPrev, 0),
    saldoFinal: dias.length ? (dias.filter((x) => x.saldo !== null).pop()?.saldo ?? saldoAntes) : saldoAntes,
    saldoFinalPrevisto: dias.length ? dias[dias.length - 1].saldoPrevisto : saldoAntes,
    futuro,
    dias,
  };
}

/** Orçamento x realizado de um mês. Gasto = despesas não canceladas do mês (pagas + a pagar). */
export function orcamentoMes(lancs, cats, orcamentos, mes, alertaPct = 80) {
  const p = { inicio: inicioMes(mes), fim: fimMes(mes) };
  const desp = lancs.filter((l) => l.tipo === 'despesa' && ativo(l) && dentro(l.data_competencia, p));
  const doMes = orcamentos.filter((o) => o.mes === p.inicio);
  const linhas = Object.values(cats).filter((c) => c.tipo === 'despesa')
    .map((c) => {
      const o = doMes.find((x) => x.categoria_id === c.id);
      const arr = desp.filter((l) => l.categoria_id === c.id);
      const gasto = soma(arr);
      const pago = soma(arr.filter(estaPago));
      const limite = o ? centavos(o.limite) : null;
      const uso = limite ? gasto / limite : (limite === 0 && gasto > 0 ? Infinity : null);
      let situacao = 'sem-limite';
      if (limite !== null) situacao = gasto > limite ? 'estourado' : uso >= alertaPct / 100 ? 'alerta' : 'ok';
      return { categoria: c, orcamento: o || null, limite, gasto, pago, aPagar: gasto - pago, disponivel: limite === null ? null : limite - gasto, uso, situacao };
    })
    .filter((x) => x.limite !== null || x.gasto > 0 || x.categoria.ativo);
  const comLimite = linhas.filter((x) => x.limite !== null);
  const planejado = comLimite.reduce((t, x) => t + x.limite, 0);
  const gastoPlanejado = comLimite.reduce((t, x) => t + x.gasto, 0);
  const foraDoPlano = linhas.filter((x) => x.limite === null).reduce((t, x) => t + x.gasto, 0);
  return {
    mes: p.inicio, linhas, planejado, gastoPlanejado, foraDoPlano,
    gastoTotal: gastoPlanejado + foraDoPlano,
    disponivel: planejado - gastoPlanejado,
    estourados: linhas.filter((x) => x.situacao === 'estourado'),
    emAlerta: linhas.filter((x) => x.situacao === 'alerta'),
  };
}

/** Projeção linear simples até o fim do período (hipótese: o ritmo diário atual se mantém). */
export function projetar(valorAteHoje, p, ref = hoje()) {
  if (ref < p.inicio) return null;
  if (ref >= p.fim) return valorAteHoje;
  const decorridos = diasEntre(p.inicio, ref) + 1;
  const total = diasEntre(p.inicio, p.fim) + 1;
  if (decorridos < 3) return null;     // poucos dias para projetar com algum sentido
  return Math.round((valorAteHoje / decorridos) * total);
}

/** Progresso de uma meta. Retorna atual, alvo, progresso (0..1+), projeção e a hipótese usada. */
export function progressoMeta(meta, lancs, cats, contas, ref = hoje()) {
  const p = { inicio: meta.inicio, fim: meta.fim };
  const pAte = { inicio: p.inicio, fim: ref < p.fim ? ref : p.fim };
  const r = resumo(lancs, cats, pAte, ref);
  const alvo = meta.valor_alvo !== null && meta.valor_alvo !== undefined ? centavos(meta.valor_alvo) : null;
  const encerrada = ref > p.fim;
  const naoIniciada = ref < p.inicio;
  const HIP = 'Projeção linear: supõe que o ritmo diário registrado até hoje se mantém até o fim do período.';
  const base = { meta, encerrada, naoIniciada, hipotese: null, projecao: null, melhorMenor: false };

  switch (meta.tipo) {
    case 'faturamento': {
      const atual = r.faturamento;
      return { ...base, atual, alvo, progresso: alvo ? atual / alvo : null, projecao: projetar(atual, p, ref), hipotese: HIP, atingida: alvo !== null && atual >= alvo };
    }
    case 'lucro': {
      const atual = r.lucro;
      return { ...base, atual, alvo, progresso: alvo ? atual / alvo : null, projecao: projetar(atual, p, ref), hipotese: HIP, atingida: alvo !== null && atual >= alvo, avisos: r.avisos };
    }
    case 'economia': {
      const ini = saldos(lancs, contas, somaDias(p.inicio, -1)).total;
      const agora = saldos(lancs, contas, pAte.fim).total;
      const atual = agora - ini;
      return { ...base, atual, alvo, progresso: alvo ? atual / alvo : null, projecao: projetar(atual, p, ref), hipotese: 'Economia = quanto o saldo das contas cresceu desde o início do período. ' + HIP, atingida: alvo !== null && atual >= alvo };
    }
    case 'limite_gastos': {
      const filtro = (l) => l.tipo === 'despesa' && ativo(l) && dentro(l.data_competencia, pAte)
        && (meta.categoria_id ? l.categoria_id === meta.categoria_id : !['investimento', 'retirada'].includes(cats[l.categoria_id]?.grupo));
      const atual = soma(lancs.filter(filtro));
      return { ...base, melhorMenor: true, atual, alvo, progresso: alvo ? atual / alvo : null, projecao: projetar(atual, p, ref), hipotese: HIP, atingida: encerrada && alvo !== null && atual <= alvo, estourada: alvo !== null && atual > alvo };
    }
    case 'reduzir_despesas': {
      // compara com o período anterior de mesma duração
      const ant = periodoAnterior(p);
      const antR = resumo(lancs, cats, ant, ref);
      const alvoPct = Number(meta.percentual || 0) / 100;
      const limite = Math.round(antR.despesasResultado * (1 - alvoPct));
      const atual = r.despesasResultado;
      const proj = projetar(atual, p, ref);
      const reducao = antR.despesasResultado > 0 && proj !== null ? 1 - proj / antR.despesasResultado : null;
      return { ...base, melhorMenor: true, atual, alvo: limite, anterior: antR.despesasResultado, progresso: limite ? atual / limite : null, projecao: proj, reducaoProjetada: reducao,
        hipotese: `Compara as despesas (custos + operacionais + impostos) com o período anterior de mesma duração. ${HIP}`,
        semBase: antR.despesasResultado === 0, atingida: encerrada && atual <= limite, estourada: atual > limite };
    }
    case 'superar_mes_anterior': {
      const ant = periodoAnterior(p);
      const antR = resumo(lancs, cats, ant, ref);
      const alvoPct = Number(meta.percentual || 0) / 100;
      const alvoV = Math.round(antR.faturamento * (1 + alvoPct));
      const atual = r.faturamento;
      return { ...base, atual, alvo: alvoV, anterior: antR.faturamento, progresso: alvoV ? atual / alvoV : null, projecao: projetar(atual, p, ref),
        hipotese: `Meta = faturamento do período anterior${alvoPct ? ` + ${meta.percentual}%` : ''}. ${HIP}`, semBase: antR.faturamento === 0, atingida: atual > antR.faturamento && atual >= alvoV };
    }
    default:
      return { ...base, atual: 0, alvo, progresso: null };
  }
}

/** Observações automáticas — sempre baseadas em dados registrados, nunca garantias. */
export function insights(lancs, cats, orcamentos, ref = hoje(), alertaPct = 80) {
  const out = [];
  const mesAtual = { inicio: inicioMes(ref), fim: ref };
  const decorridos = diasEntre(mesAtual.inicio, ref) + 1;
  const totalMes = diasEntre(mesAtual.inicio, fimMes(ref)) + 1;
  const anteriores = [1, 2, 3].map((n) => { const i = somaMeses(ref, -n); return { inicio: i, fim: fimMes(i) }; });
  const desp = lancs.filter((l) => l.tipo === 'despesa' && ativo(l));
  const temHistorico = anteriores.every((p) => lancs.some((l) => dentro(l.data_competencia, p)));

  // 1) despesas por categoria acima da média dos 3 meses anteriores
  if (temHistorico) {
    for (const c of Object.values(cats).filter((x) => x.tipo === 'despesa')) {
      const media = anteriores.map((p) => soma(desp.filter((l) => l.categoria_id === c.id && dentro(l.data_competencia, p)))).reduce((a, b) => a + b, 0) / 3;
      const atual = soma(desp.filter((l) => l.categoria_id === c.id && dentro(l.data_competencia, mesAtual)));
      if (media > 0 && atual > media * 1.3 && atual - media >= 5000) {
        out.push({ nivel: 'alerta', titulo: `${c.nome}: gasto acima do normal`,
          texto: `Neste mês já foram ${fmt(atual)}, contra uma média de ${fmt(Math.round(media))} nos 3 meses anteriores (+${Math.round((atual / media - 1) * 100)}%).`,
          link: `#/lancamentos?tipo=despesa&categoria=${c.id}&inicio=${mesAtual.inicio}&fim=${fimMes(ref)}` });
      }
    }
  }

  // 2) orçamento
  const o = orcamentoMes(lancs, cats, orcamentos, ref, alertaPct);
  for (const x of o.estourados) {
    out.push({ nivel: 'critico', titulo: `${x.categoria.nome}: orçamento ultrapassado`, texto: `Gasto de ${fmt(x.gasto)} para um limite de ${fmt(x.limite)} (${fmt(x.gasto - x.limite)} acima).`, link: '#/orcamento' });
  }
  for (const x of o.emAlerta) {
    out.push({ nivel: 'alerta', titulo: `${x.categoria.nome}: ${Math.round(x.uso * 100)}% do orçamento usado`, texto: `Restam ${fmt(x.disponivel)} para o mês.`, link: '#/orcamento' });
  }

  // 3) clientes com pagamento atrasado
  const atrasadas = lancs.filter((l) => l.tipo === 'receita' && vencido(l, ref));
  if (atrasadas.length) {
    out.push({ nivel: 'alerta', titulo: `${atrasadas.length} recebimento(s) atrasado(s)`, texto: `Total de ${fmt(soma(atrasadas))} que já deveria ter entrado.`, link: '#/contas?aba=receber' });
  }

  // 4) tendência de faturamento (3 meses fechados)
  const fats = anteriores.map((p) => resumo(lancs, cats, p, ref).faturamento).reverse(); // mais antigo → mais recente
  if (fats.every((v) => v > 0)) {
    if (fats[0] < fats[1] && fats[1] < fats[2]) out.push({ nivel: 'bom', titulo: 'Faturamento em alta', texto: 'O faturamento cresceu em cada um dos últimos 3 meses fechados.', link: '#/resultados' });
    if (fats[0] > fats[1] && fats[1] > fats[2]) out.push({ nivel: 'alerta', titulo: 'Faturamento em queda', texto: 'O faturamento caiu em cada um dos últimos 3 meses fechados.', link: '#/resultados' });
  }

  // 5) despesas do mês correndo mais rápido que o faturamento
  const rAtual = resumo(lancs, cats, mesAtual, ref);
  if (decorridos >= 7 && rAtual.faturamento > 0 && rAtual.despesasResultado > rAtual.faturamento) {
    out.push({ nivel: 'alerta', titulo: 'Despesas acima do faturamento no mês', texto: `Até hoje: ${fmt(rAtual.despesasResultado)} em despesas para ${fmt(rAtual.faturamento)} faturados (dia ${decorridos} de ${totalMes}).`, link: '#/resultados' });
  }
  return out;
}

const fmt = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Possível duplicidade: mesmo tipo, valor e data de competência e descrição parecida. */
export function possiveisDuplicados(novo, lancs) {
  const v = centavos(novo.valor);
  const d = String(novo.descricao || '').trim().toLowerCase();
  return lancs.filter((l) => l.id !== novo.id && l.tipo === novo.tipo && centavos(l.valor) === v
    && l.data_competencia === novo.data_competencia && ativo(l)
    && (String(l.descricao || "").trim().toLowerCase() === d || l.categoria_id === novo.categoria_id));
}

/** Calendário: totais por dia de um mês (pendentes por vencimento + pagos por pagamento). */
export function calendarioMes(lancs, mes, ref = hoje()) {
  const ini = inicioMes(mes);
  const fim = fimMes(mes);
  const dias = {};
  for (let d = ini; d <= fim; d = somaDias(d, 1)) dias[d] = { receber: 0, pagar: 0, recebido: 0, pago: 0, vencidos: 0, itens: [] };
  for (const l of lancs) {
    if (l.status === 'cancelado') continue;
    const d = l.status === 'pago' ? l.data_pagamento : l.data_vencimento;
    if (!dias[d]) continue;
    const c = centavos(l.valor);
    if (l.status === 'pago') dias[d][l.tipo === 'receita' ? 'recebido' : 'pago'] += c;
    else { dias[d][l.tipo === 'receita' ? 'receber' : 'pagar'] += c; if (vencido(l, ref)) dias[d].vencidos += 1; }
    dias[d].itens.push(l);
  }
  const primeiroDow = (deIso(ini).getDay() + 6) % 7;
  return { ini, fim, dias, primeiroDow };
}

export { iso };
