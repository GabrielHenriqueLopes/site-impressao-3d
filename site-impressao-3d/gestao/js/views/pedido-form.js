/* Formulário de pedido, mudança de etapa e ligação com o financeiro. */
import { S, criar, alterar, remover, podeGerir, podeEditarPedido, novoId } from '../store.js';
import { calcular, custoKgFilamento, situacao, STATUS, PRIORIDADES } from '../pedidos-calc.js';
import { modal, confirmar, campo, erroCampo, limparErros, ligarDinheiro, ocupado, toast, erro, icon, $ } from '../ui.js';
import { esc, hoje, brl, centavos, dataBR, dataHora, ORIGENS, lerValor, valorInput, somaDias, pct } from '../format.js';
import { abrirLancamento, historico } from './lancamento-form.js';

const gramas = (g) => (g === null || g === undefined ? '—' : g >= 1000 ? `${(g / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg` : `${g.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} g`);
export const fmtGramas = gramas;
export const fmtTempo = (min) => {
  if (min === null || min === undefined) return '—';
  const h = Math.floor(min / 60); const m = Math.round(min % 60);
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
};
const dec = (v) => (v === null || v === undefined || v === '' ? '' : String(v).replace('.', ','));
const lerNum = (s) => { const t = String(s ?? '').trim().replace(/\./g, '').replace(',', '.'); if (!t) return null; const n = Number(t); return Number.isFinite(n) ? n : NaN; };
const lerDinheiro = (s) => { if (!String(s ?? '').trim()) return null; const c = lerValor(s); return Number.isFinite(c) ? c / 100 : NaN; };
export const receitaDoPedido = (p) => S.lancamentos.find((l) => l.pedido_id === p.id);

/** Abre o pedido (novo ou existente). */
export function abrirPedido(p = null) {
  const editando = Boolean(p);
  const somenteLeitura = editando && !podeEditarPedido(p);
  const v = p || { quantidade: 1, recebido_em: hoje(), prazo: somaDias(hoje(), 7), prioridade: 'normal', status: 'aguardando', margem_perda_pct: 0, origem: 'whatsapp' };
  const fils = S.filamentos.filter((f) => f.ativo || f.id === v.filamento_id);
  const tempoH = v.tempo_unidade_min ? Math.floor(v.tempo_unidade_min / 60) : '';
  const tempoM = v.tempo_unidade_min ? v.tempo_unidade_min % 60 : '';
  const rec = editando ? receitaDoPedido(p) : null;
  const sit = editando ? situacao(p, S.empresa) : null;

  const corpo = `
  ${editando ? `<div class="ped-head">
      <span class="tag tag-st-${p.status}">${icon(STATUS[p.status].icone)}${STATUS[p.status].nome}</span>
      ${sit?.atrasado ? `<span class="tag tag-critico">${icon('alert')}Atrasado</span>` : sit?.proximo ? `<span class="tag tag-alerta">${icon('clock')}Prazo próximo</span>` : ''}
      <ol class="timeline">
        <li class="done">Recebido ${dataBR(p.recebido_em)}</li>
        <li class="${p.iniciado_em ? 'done' : ''}">Início ${p.iniciado_em ? dataHora(p.iniciado_em) : '—'}</li>
        <li class="${p.concluido_em ? 'done' : ''}">Pronto ${p.concluido_em ? dataHora(p.concluido_em) : '—'}</li>
        <li class="${p.entregue_em ? 'done' : ''}">Entregue ${p.entregue_em ? dataHora(p.entregue_em) : '—'}</li>
      </ol>
    </div>` : ''}
  ${somenteLeitura ? '<p class="note">Só quem criou o pedido ou um gerente pode alterá-lo.</p>' : ''}
  <form class="form" data-ped novalidate ${somenteLeitura ? 'inert' : ''}>
    <div class="grid-2">
      ${campo({ nome: 'produto', rotulo: 'Produto', valor: v.produto || '', obrig: true, attrs: 'maxlength="120" list="sug-prod" autocomplete="off"', cls: 'span-2' })}
      ${campo({ nome: 'cliente', rotulo: 'Cliente', valor: v.cliente || '', obrig: true, attrs: 'maxlength="120" list="sug-cli-p" autocomplete="off"' })}
      ${campo({ nome: 'origem', rotulo: 'Pedido veio por', valor: v.origem || '', opcoes: [{ valor: '', rotulo: '—' }].concat(Object.entries(ORIGENS).map(([k, t]) => ({ valor: k, rotulo: t }))) })}
    </div>
    <div class="grid-4">
      ${campo({ nome: 'quantidade', rotulo: 'Unidades', tipo: 'number', valor: v.quantidade, obrig: true, attrs: 'min="1" max="10000" step="1" inputmode="numeric"' })}
      ${campo({ nome: 'recebido_em', rotulo: 'Recebido em', tipo: 'date', valor: v.recebido_em, obrig: true })}
      ${campo({ nome: 'prazo', rotulo: 'Prazo de entrega', tipo: 'date', valor: v.prazo, obrig: true })}
      ${campo({ nome: 'prioridade', rotulo: 'Prioridade', valor: v.prioridade, opcoes: Object.entries(PRIORIDADES).map(([k, t]) => ({ valor: k, rotulo: t })) })}
    </div>
    ${editando ? `<div class="grid-3">
      ${campo({ nome: 'status', rotulo: 'Etapa', valor: v.status, opcoes: Object.entries(STATUS).map(([k, t]) => ({ valor: k, rotulo: t.nome })) })}
      ${campo({ nome: 'unidades_prontas', rotulo: 'Unidades prontas', tipo: 'number', valor: v.unidades_prontas || 0, attrs: `min="0" max="${v.quantidade}" step="1" inputmode="numeric"` })}
      ${campo({ nome: 'codigo', rotulo: 'Código', valor: v.codigo, attrs: 'maxlength="20"' })}
    </div>` : ''}

    <details class="sec" open>
      <summary><h3>${icon('printer')} Impressão e filamento</h3><span class="muted small">estimativas — preencha o que souber</span></summary>
      <div class="grid-2">
        ${campo({ nome: 'filamento_id', rotulo: 'Filamento', valor: v.filamento_id || '', opcoes: [{ valor: '', rotulo: fils.length ? 'Informar manualmente' : 'Informar manualmente (cadastre filamentos em Configurações)' }].concat(fils.map((f) => ({ valor: f.id, rotulo: `${f.tipo}${f.cor ? ` ${f.cor}` : ''}${f.marca ? ` · ${f.marca}` : ''} — ${brl(custoKgFilamento(f))}/kg` }))), cls: 'span-2' })}
        ${campo({ nome: 'filamento_tipo', rotulo: 'Tipo', valor: v.filamento_tipo || '', attrs: 'maxlength="20" list="sug-tipo" placeholder="PLA, PETG, ABS…"' })}
        ${campo({ nome: 'filamento_cor', rotulo: 'Cor', valor: v.filamento_cor || '', attrs: 'maxlength="40" placeholder="Ex.: preto"' })}
        ${campo({ nome: 'custo_kg', rotulo: 'Preço do filamento por kg', tipo: 'dinheiro', valor: v.custo_kg !== null && v.custo_kg !== undefined ? centavos(v.custo_kg) : '', ajuda: 'Vem do catálogo quando escolhido acima. Rolo de 1 kg a R$ 100 = R$ 100/kg.' })}
        ${campo({ nome: 'gramas_unidade', rotulo: 'Gramas por unidade', tipo: 'text', valor: dec(v.gramas_unidade), attrs: 'inputmode="decimal" placeholder="Ex.: 85"', ajuda: 'Veja no fatiador (Cura, PrusaSlicer, Bambu Studio…).' })}
        ${campo({ nome: 'margem_perda_pct', rotulo: 'Margem para falhas (%)', tipo: 'number', valor: v.margem_perda_pct ?? 0, attrs: 'min="0" max="100" step="1" inputmode="numeric"', ajuda: 'Filamento extra para suportes, testes e falhas.' })}
        <div class="field" data-field="tempo"><label>Tempo de impressão por unidade</label>
          <div class="tempo-row"><input type="number" name="tempo_h" min="0" max="999" value="${tempoH}" aria-label="Horas" placeholder="0"> <span>h</span>
          <input type="number" name="tempo_m" min="0" max="59" value="${tempoM}" aria-label="Minutos" placeholder="0"> <span>min</span></div>
          <p class="field-error" hidden></p></div>
      </div>
    </details>

    <details class="sec" open>
      <summary><h3>${icon('wallet')} Preço e custos</h3></summary>
      <div class="grid-2">
        ${campo({ nome: 'preco_venda', rotulo: 'Preço de venda do pedido', tipo: 'dinheiro', valor: v.preco_venda !== null && v.preco_venda !== undefined ? centavos(v.preco_venda) : '', ajuda: 'Valor total cobrado pelo pedido inteiro.' })}
        ${campo({ nome: 'custo_energia', rotulo: 'Energia', tipo: 'dinheiro', valor: v.custo_energia !== null && v.custo_energia !== undefined ? centavos(v.custo_energia) : '', ajuda: '<span data-energia-ajuda></span>' })}
        ${campo({ nome: 'custo_acabamento', rotulo: 'Acabamento / pintura', tipo: 'dinheiro', valor: v.custo_acabamento !== null && v.custo_acabamento !== undefined ? centavos(v.custo_acabamento) : '' })}
        ${campo({ nome: 'custo_embalagem', rotulo: 'Embalagem', tipo: 'dinheiro', valor: v.custo_embalagem !== null && v.custo_embalagem !== undefined ? centavos(v.custo_embalagem) : '' })}
        ${campo({ nome: 'custo_outros', rotulo: 'Outros custos', tipo: 'dinheiro', valor: v.custo_outros !== null && v.custo_outros !== undefined ? centavos(v.custo_outros) : '', cls: 'span-2' })}
      </div>
    </details>

    <section class="calc-box" data-calc aria-live="polite"></section>
    ${campo({ nome: 'observacoes', rotulo: 'Descrição / observações', tipo: 'textarea', valor: v.observacoes || '', attrs: 'maxlength="2000" placeholder="Cores, tamanho, detalhes combinados com o cliente…"' })}
    ${rec ? `<p class="note">${icon('check-circle')} Receita lançada no financeiro: <strong>${esc(rec.descricao)}</strong> · ${brl(centavos(rec.valor))} (${rec.status === 'pago' ? 'recebida' : 'a receber'}).</p>` : ''}

    <datalist id="sug-prod">${[...new Set(S.pedidos.map((x) => x.produto))].slice(0, 80).map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
    <datalist id="sug-cli-p">${[...new Set(S.pedidos.map((x) => x.cliente).concat(S.lancamentos.filter((l) => l.cliente).map((l) => l.cliente)))].slice(0, 120).map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
    <datalist id="sug-tipo">${['PLA', 'PLA+', 'PETG', 'ABS', 'ASA', 'TPU', 'Resina'].map((x) => `<option value="${x}">`).join('')}</datalist>
  </form>`;

  const rodape = somenteLeitura ? '<button type="button" class="btn btn-accent" data-fechar>Fechar</button>' : `
    ${editando && podeGerir() ? `<button type="button" class="btn btn-ghost perigo mr-auto" data-excluir>${icon('trash')} Excluir</button>` : ''}
    ${editando && podeGerir() ? `<button type="button" class="btn btn-ghost" data-hist title="Histórico">${icon('history')}<span class="sr-only">Histórico</span></button>` : ''}
    ${editando && !rec && v.status !== 'cancelado' ? `<button type="button" class="btn btn-ghost" data-receita>${icon('arrow-down')} Lançar receita</button>` : ''}
    <button type="button" class="btn btn-ghost" data-fechar>Cancelar</button>
    <button type="button" class="btn btn-accent" data-salvar>${editando ? 'Salvar' : 'Cadastrar pedido'}</button>`;

  modal({
    titulo: editando ? `${esc(p.codigo)} · ${esc(p.produto)}` : 'Novo pedido', corpo, rodape, largura: 'lg',
    aoAbrir: (dlg, fechar) => {
      const f = $('[data-ped]', dlg);
      ligarDinheiro(f);
      const dados = () => lerForm(f, v);
      const atualizarCalc = () => {
        const d = dados();
        const c = calcular(d, S.empresa);
        const ajudaE = $('[data-energia-ajuda]', dlg);
        if (ajudaE) {
          const auto = calcular({ ...d, custo_energia: null }, S.empresa).energia;
          ajudaE.innerHTML = S.empresa.impressora_watts && S.empresa.tarifa_kwh
            ? (auto !== null ? `Calculada pelo tempo: ${brl(auto)} (deixe vazio para usar). ` : 'Informe o tempo de impressão para calcular. ') + `${S.empresa.impressora_watts} W × R$ ${dec(S.empresa.tarifa_kwh)}/kWh`
            : 'Para calcular sozinho, informe a potência da impressora e a tarifa em Configurações → Produção.';
        }
        $('[data-calc]', dlg).innerHTML = `
          <h3>Resumo do pedido <small class="muted">(estimativa)</small></h3>
          <dl class="calc-grid">
            <div><dt>Filamento total</dt><dd>${gramas(c.gramasTotal)}</dd>${c.gramasTotal !== null && d.margem_perda_pct ? `<small>${gramas(c.gramasBase)} + ${dec(d.margem_perda_pct)}%</small>` : ''}</div>
            <div><dt>Custo do filamento</dt><dd>${c.custoFilamento === null ? '—' : brl(c.custoFilamento)}</dd></div>
            <div><dt>Tempo total</dt><dd>${fmtTempo(c.tempoTotalMin)}</dd></div>
            <div><dt>Custo total</dt><dd>${c.custoTotal === null ? '—' : brl(c.custoTotal)}</dd></div>
            <div class="${c.lucro !== null && c.lucro < 0 ? 'neg' : ''}"><dt>Lucro estimado</dt><dd>${c.lucro === null ? '—' : brl(c.lucro)}</dd>${c.margem !== null ? `<small>margem ${pct(c.margem)}</small>` : ''}</div>
          </dl>
          ${c.faltando.length ? `<p class="hyp">${icon('info')} Para calcular tudo, falta: ${c.faltando.join(', ')}.</p>` : ''}`;
      };
      atualizarCalc();
      f.addEventListener('input', atualizarCalc);
      f.addEventListener('change', (e) => {
        if (e.target.name === 'filamento_id') {
          const fil = S.filamentos.find((x) => x.id === e.target.value);
          if (fil) {
            f.filamento_tipo.value = fil.tipo; f.filamento_cor.value = fil.cor || '';
            f.custo_kg.value = valorInput(custoKgFilamento(fil));
          }
        }
        if (e.target.name === 'status' && ['pronto', 'entregue'].includes(e.target.value)) f.unidades_prontas.value = f.quantidade.value;
        atualizarCalc();
      });
      $('[data-hist]', dlg)?.addEventListener('click', () => historico('pedidos', p.id, p.codigo));
      $('[data-excluir]', dlg)?.addEventListener('click', async () => {
        if (!(await confirmar({ titulo: 'Excluir pedido?', texto: `<strong>${esc(p.codigo)} · ${esc(p.produto)}</strong> para ${esc(p.cliente)}.<br>Se o pedido não vai mais acontecer, prefira mudar a etapa para <em>Cancelado</em> (fica no histórico).${rec ? '<br>A receita já lançada no financeiro <strong>não</strong> será apagada.' : ''}`, botao: 'Excluir', perigo: true }))) return;
        try { await remover('pedidos', p.id); toast('Pedido excluído.'); fechar(''); } catch (ex) { erro(ex); }
      });
      $('[data-receita]', dlg)?.addEventListener('click', () => { fechar(''); lancarReceita(p); });
      const salvar = () => ocupado($('[data-salvar]', dlg), async () => {
        limparErros(f);
        const d = dados();
        const falha = validar(d, editando ? p : null);
        if (falha) { erroCampo(f, falha[0], falha[1]); return; }
        try {
          if (editando) {
            const antes = p.status;
            const salvo = await alterar('pedidos', p.id, d);
            toast('Pedido atualizado.');
            fechar('ok');
            if (antes !== 'entregue' && salvo.status === 'entregue') sugerirReceita(salvo);
          } else {
            const salvo = await criar('pedidos', { id: novoId(), ...d });
            toast(`Pedido ${salvo.codigo} cadastrado.`);
            fechar('ok');
          }
        } catch (ex) { erro(ex); }
      });
      $('[data-salvar]', dlg)?.addEventListener('click', salvar);
      f.addEventListener('submit', (e) => { e.preventDefault(); salvar(); });
    },
  });
}

function lerForm(f, v) {
  const h = lerNum(f.tempo_h.value); const m = lerNum(f.tempo_m.value);
  const tempo = (h === null && m === null) ? null : Math.round((h || 0) * 60 + (m || 0));
  const d = {
    produto: f.produto.value.trim(),
    cliente: f.cliente.value.trim(),
    origem: f.origem.value || null,
    quantidade: Number(f.quantidade.value),
    recebido_em: f.recebido_em.value,
    prazo: f.prazo.value,
    prioridade: f.prioridade.value,
    filamento_id: f.filamento_id.value || null,
    filamento_tipo: f.filamento_tipo.value.trim() || null,
    filamento_cor: f.filamento_cor.value.trim() || null,
    custo_kg: lerDinheiro(f.custo_kg.value),
    gramas_unidade: lerNum(f.gramas_unidade.value),
    margem_perda_pct: f.margem_perda_pct.value === '' ? 0 : Number(f.margem_perda_pct.value),
    tempo_unidade_min: tempo === 0 ? null : tempo,
    preco_venda: lerDinheiro(f.preco_venda.value),
    custo_energia: lerDinheiro(f.custo_energia.value),
    custo_acabamento: lerDinheiro(f.custo_acabamento.value),
    custo_embalagem: lerDinheiro(f.custo_embalagem.value),
    custo_outros: lerDinheiro(f.custo_outros.value),
    observacoes: f.observacoes.value.trim() || null,
    unidades_prontas: v.unidades_prontas || 0,
    status: v.status || 'aguardando',
  };
  if (f.status) { d.status = f.status.value; d.unidades_prontas = Number(f.unidades_prontas.value || 0); d.codigo = f.codigo.value.trim().toUpperCase(); }
  return d;
}

function validar(d, original) {
  const editando = Boolean(original);
  if (!d.produto) return ['produto', 'Informe o produto.'];
  if (!d.cliente) return ['cliente', 'Informe o cliente.'];
  if (!Number.isInteger(d.quantidade) || d.quantidade < 1 || d.quantidade > 10000) return ['quantidade', 'Use um número inteiro de unidades (1 ou mais).'];
  if (!d.recebido_em) return ['recebido_em', 'Informe quando o pedido chegou.'];
  if (!d.prazo) return ['prazo', 'Informe o prazo de entrega.'];
  if (d.prazo < somaDias(d.recebido_em, -1)) return ['prazo', 'O prazo não pode ser antes do dia em que o pedido chegou.'];
  if (Number.isNaN(d.custo_kg) || (d.custo_kg !== null && d.custo_kg < 0)) return ['custo_kg', 'Valor inválido (ex.: 99,90).'];
  if (Number.isNaN(d.gramas_unidade) || (d.gramas_unidade !== null && (d.gramas_unidade <= 0 || d.gramas_unidade > 100000))) return ['gramas_unidade', 'Informe as gramas como número maior que zero (ex.: 85 ou 12,5).'];
  if (!(d.margem_perda_pct >= 0 && d.margem_perda_pct <= 100)) return ['margem_perda_pct', 'Use um percentual entre 0 e 100.'];
  if (d.tempo_unidade_min !== null && (!Number.isFinite(d.tempo_unidade_min) || d.tempo_unidade_min < 0 || d.tempo_unidade_min > 100000)) return ['tempo', 'Tempo inválido.'];
  for (const k of ['preco_venda', 'custo_energia', 'custo_acabamento', 'custo_embalagem', 'custo_outros']) {
    if (Number.isNaN(d[k]) || (d[k] !== null && d[k] < 0)) return [k, 'Valor inválido (ex.: 25,00).'];
  }
  if (editando) {
    if (!Number.isInteger(d.unidades_prontas) || d.unidades_prontas < 0 || d.unidades_prontas > d.quantidade) return ['unidades_prontas', `Use um número entre 0 e ${d.quantidade}.`];
    if (!d.codigo) return ['codigo', 'Informe um código.'];
    if (S.pedidos.some((x) => x.id !== original.id && x.codigo.toUpperCase() === d.codigo)) return ['codigo', 'Já existe um pedido com esse código.'];
  }
  return null;
}

/** Muda a etapa de um pedido (arrastar no quadro ou botões). */
export async function moverPedido(p, status) {
  if (p.status === status) return;
  if (!podeEditarPedido(p)) { toast('Só quem criou o pedido ou um gerente pode alterá-lo.', 'erro'); return; }
  if (status === 'cancelado' && !(await confirmar({ titulo: 'Cancelar pedido?', texto: `${esc(p.codigo)} · ${esc(p.produto)} sai da fila e dos totais. Fica no histórico.`, botao: 'Cancelar pedido', perigo: true }))) return;
  try {
    const salvo = await alterar('pedidos', p.id, { status, ...(['pronto', 'entregue'].includes(status) ? { unidades_prontas: p.quantidade } : {}) });
    toast(`${salvo.codigo}: ${STATUS[status].nome}.`);
    if (status === 'entregue') sugerirReceita(salvo);
  } catch (e) { erro(e); }
}

export async function ajustarProntas(p, delta) {
  const n = Math.max(0, Math.min(p.quantidade, (p.unidades_prontas || 0) + delta));
  if (n === p.unidades_prontas) return;
  try { await alterar('pedidos', p.id, { unidades_prontas: n, ...(p.status === 'aguardando' && n > 0 ? { status: 'producao' } : {}) }); } catch (e) { erro(e); }
}

async function sugerirReceita(p) {
  if (receitaDoPedido(p) || p.preco_venda === null) return;
  const ok = await confirmar({ titulo: 'Pedido entregue', texto: `Quer registrar no financeiro o recebimento de <strong>${brl(centavos(p.preco_venda))}</strong> deste pedido?<br><small class="muted">Se o pagamento (ou o sinal) já foi lançado antes, não precisa.</small>`, botao: 'Lançar receita' });
  if (ok) lancarReceita(p);
}

export function lancarReceita(p) {
  const venda = S.categorias.find((c) => c.tipo === 'receita' && c.grupo === 'venda' && c.ativo);
  abrirLancamento({
    tipo: 'receita',
    preset: {
      tipo: 'receita', descricao: `${p.codigo} · ${p.produto}`.slice(0, 120), valor: p.preco_venda ?? undefined, categoria_id: venda?.id,
      cliente: p.cliente, origem: p.origem, data_competencia: hoje(), data_vencimento: hoje(), status: 'pago', pedido_id: p.id,
    },
  });
}
