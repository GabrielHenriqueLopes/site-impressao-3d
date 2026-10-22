/* =================================================================
   Cálculos de pedidos de impressão 3D (funções puras, em CENTAVOS)
   -----------------------------------------------------------------
   Consumo total (g) = gramas por unidade × unidades × (1 + margem de perda)
   Custo por grama   = preço do rolo ÷ peso do rolo (g)
   Custo filamento   = consumo total × custo por grama
   Energia (auto)    = potência (kW) × horas de impressão × tarifa (R$/kWh)
   Lucro estimado    = preço de venda − (filamento + energia + acabamento + embalagem + outros)
   Tudo é ESTIMATIVA a partir do que foi informado; nada é inventado.
   ================================================================= */
import { centavos, deIso, hoje, somaDias } from './format.js';

export const STATUS = {
  aguardando: { nome: 'Aguardando início', curto: 'Aguardando', icone: 'clock' },
  producao: { nome: 'Em produção', curto: 'Produzindo', icone: 'printer' },
  pronto: { nome: 'Pronto para entrega', curto: 'Pronto', icone: 'box' },
  entregue: { nome: 'Entregue', curto: 'Entregue', icone: 'check-circle' },
  cancelado: { nome: 'Cancelado', curto: 'Cancelado', icone: 'x' },
};
export const ATIVOS = ['aguardando', 'producao', 'pronto'];
export const PRIORIDADES = { normal: 'Normal', alta: 'Alta', urgente: 'Urgente' };

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

/** Custo por kg de um filamento do catálogo, em centavos. */
export function custoKgFilamento(f) {
  if (!f || !(Number(f.preco_rolo) > 0) || !(Number(f.peso_rolo_g) > 0)) return null;
  return Math.round((centavos(f.preco_rolo) / Number(f.peso_rolo_g)) * 1000);
}

/** Cálculos de um pedido. empresa: { impressora_watts, tarifa_kwh } */
export function calcular(p, empresa = {}) {
  const qtd = Number(p.quantidade) || 0;
  const g = num(p.gramas_unidade);
  const margem = Number(p.margem_perda_pct || 0) / 100;
  const gramasBase = g === null ? null : g * qtd;
  const gramasTotal = g === null ? null : Math.round(gramasBase * (1 + margem) * 10) / 10;
  const restantes = Math.max(0, qtd - (Number(p.unidades_prontas) || 0));
  const gramasRestantes = g === null ? null : Math.round(g * restantes * (1 + margem) * 10) / 10;
  const custoKg = num(p.custo_kg) === null ? null : centavos(p.custo_kg);
  const custoFilamento = gramasTotal === null || custoKg === null ? null : Math.round((gramasTotal * custoKg) / 1000);
  const tempoTotalMin = num(p.tempo_unidade_min) === null ? null : Number(p.tempo_unidade_min) * qtd;
  const watts = num(empresa.impressora_watts); const tarifa = num(empresa.tarifa_kwh);
  const energiaAuto = tempoTotalMin !== null && watts && tarifa ? Math.round((watts / 1000) * (tempoTotalMin / 60) * tarifa * 100) : null;
  const energiaManual = num(p.custo_energia) === null ? null : centavos(p.custo_energia);
  const energia = energiaManual ?? energiaAuto;
  const extrasRaw = ['custo_acabamento', 'custo_embalagem', 'custo_outros'].map((k) => (num(p[k]) === null ? null : centavos(p[k])));
  const extras = extrasRaw.map((x) => x || 0);
  const partes = [custoFilamento, energia, ...extrasRaw];
  const custoTotal = partes.every((x) => x === null) ? null : partes.reduce((t, x) => t + (x || 0), 0);
  const preco = num(p.preco_venda) === null ? null : centavos(p.preco_venda);
  const lucro = preco !== null && custoTotal !== null ? preco - custoTotal : null;
  const faltando = [];
  if (g === null) faltando.push('gramas por unidade');
  if (custoKg === null) faltando.push('preço do filamento');
  if (preco === null) faltando.push('preço de venda');
  return {
    gramasBase, gramasTotal, gramasRestantes, custoKg, custoFilamento, tempoTotalMin,
    energia, energiaAuto: energiaManual === null && energiaAuto !== null,
    acabamento: extras[0], embalagem: extras[1], outros: extras[2],
    custoTotal, preco, lucro, margem: lucro !== null && preco > 0 ? lucro / preco : null,
    progresso: qtd ? Math.min(1, (Number(p.unidades_prontas) || 0) / qtd) : 0,
    faltando, completo: faltando.length === 0,
  };
}

/** Fim do dia do prazo (horário local). */
export const fimDoPrazo = (p) => { const d = deIso(p.prazo); d.setDate(d.getDate() + 1); return d; };

/** Situação do prazo: atrasado, próximo, precisa começar, data limite para começar. */
export function situacao(p, empresa = {}, agora = new Date()) {
  const ativo = ATIVOS.includes(p.status);
  const fim = fimDoPrazo(p);
  const horas = Number(empresa.lembrete_horas || 24);
  const folga = Number(empresa.folga_dias ?? 1);
  const restantes = Math.max(0, (Number(p.quantidade) || 0) - (Number(p.unidades_prontas) || 0));
  const minImp = (num(p.tempo_unidade_min) || 0) * restantes;
  const inicioAte = new Date(fim.getTime() - folga * 86400000 - minImp * 60000);
  const msFalta = fim - agora;
  const atrasado = ativo && msFalta <= 0;
  const proximo = ativo && !atrasado && msFalta <= horas * 3600000;
  const precisaIniciar = p.status === 'aguardando' && !atrasado && agora >= new Date(inicioAte.getTime() - horas * 3600000);
  const diasRestantes = Math.ceil(msFalta / 86400000) - 1;     // 0 = vence hoje
  return { ativo, atrasado, proximo, precisaIniciar, inicioAte, diasRestantes };
}

/** Ordem de prioridade da fila: atrasados → precisam começar/prazo próximo → urgência → prazo. */
export function ordenarFila(pedidos, empresa = {}, agora = new Date()) {
  const peso = { urgente: 0, alta: 1, normal: 2 };
  return pedidos.slice().sort((a, b) => {
    const sa = situacao(a, empresa, agora); const sb = situacao(b, empresa, agora);
    const ra = sa.atrasado ? 0 : sa.proximo || sa.precisaIniciar ? 1 : 2;
    const rb = sb.atrasado ? 0 : sb.proximo || sb.precisaIniciar ? 1 : 2;
    return ra - rb || peso[a.prioridade] - peso[b.prioridade] || a.prazo.localeCompare(b.prazo) || a.codigo.localeCompare(b.codigo);
  });
}

/** Indicadores. Cancelados nunca entram nos totais; cada pedido conta uma vez. */
export function resumo(pedidos, empresa = {}, agora = new Date(), mes = hoje().slice(0, 7)) {
  const validos = pedidos.filter((p) => p.status !== 'cancelado');
  const ativos = validos.filter((p) => ATIVOS.includes(p.status));
  const sit = new Map(ativos.map((p) => [p.id, situacao(p, empresa, agora)]));
  const calc = new Map(validos.map((p) => [p.id, calcular(p, empresa)]));
  const entregues = validos.filter((p) => p.status === 'entregue');
  const entreguesMes = entregues.filter((p) => (p.entregue_em ? isoLocal(new Date(p.entregue_em)) : '').startsWith(mes));
  const somaPreco = (arr) => arr.reduce((t, p) => t + (calc.get(p.id).preco || 0), 0);
  const lucroDe = (arr) => {
    const com = arr.filter((p) => calc.get(p.id).lucro !== null);
    return { valor: com.reduce((t, p) => t + calc.get(p.id).lucro, 0), com: com.length, sem: arr.length - com.length };
  };
  return {
    total: validos.length,
    cancelados: pedidos.length - validos.length,
    aguardando: validos.filter((p) => p.status === 'aguardando').length,
    producao: validos.filter((p) => p.status === 'producao').length,
    pronto: validos.filter((p) => p.status === 'pronto').length,
    entregues: entregues.length,
    atrasados: ativos.filter((p) => sit.get(p.id).atrasado).length,
    proximos: ativos.filter((p) => sit.get(p.id).proximo).length,
    iniciar: ativos.filter((p) => sit.get(p.id).precisaIniciar).length,
    filamentoPendente: ativos.reduce((t, p) => t + (calc.get(p.id).gramasRestantes || 0), 0),
    semGramas: ativos.filter((p) => calc.get(p.id).gramasRestantes === null).length,
    valorAtivos: somaPreco(ativos),
    valorTotal: somaPreco(validos),
    receitaEntregues: somaPreco(entregues),
    receitaEntreguesMes: somaPreco(entreguesMes),
    entreguesMes: entreguesMes.length,
    lucroEntreguesMes: lucroDe(entreguesMes),
    lucroAtivos: lucroDe(ativos),
  };
}

const pad = (n) => String(n).padStart(2, '0');
export const isoLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export { somaDias };
