/* Formulário de pedido, mudança de etapa e ligação com o financeiro. */
import { S, criar, alterar, remover, podeGerir, podeEditarPedido, novoId } from '../store.js';
import { calcular, custoKgFilamento, situacao, STATUS, PRIORIDADES } from '../pedidos-calc.js';
import { modal, confirmar, campo, erroCampo, limparErros, ligarDinheiro, ocupado, toast, erro, icon, $ } from '../ui.js';
import { esc, hoje, brl, centavos, dataBR, dataHora, ORIGENS, lerValor, valorInput, somaDias, pct } from '../format.js';
import { abrirLancamento, historico, verParcelas } from './lancamento-form.js';
import { gerarParcelas, descricaoParcela } from '../finance.js';
import { FORMAS } from '../format.js';

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
export const receitasDoPedido = (p) => S.lancamentos.filter((l) => l.pedido_id === p.id).sort((a, b) => (a.parcela_num || 1) - (b.parcela_num || 1));

/** Resumo do pagamento já lançado de um pedido: "3x · 1 de 3 recebida", etc. */
export function resumoPagamento(p) {
  const rs = receitasDoPedido(p).filter((l) => l.status !== 'cancelado');
  if (!rs.length) return null;
  const pagas = rs.filter((l) => l.status === 'pago');
  const total = rs.reduce((t, l) => t + centavos(l.valor), 0);
  const recebido = pagas.reduce((t, l) => t + centavos(l.valor), 0);
  return { qtd: rs.length, pagas: pagas.length, total, recebido, falta: total - recebido, grupo: rs[0].parcela_grupo, primeira: rs[0],
    texto: rs.length > 1 ? `${rs.length}x · ${pagas.length} de ${rs.length} recebida${pagas.length === 1 ? '' : 's'}` : pagas.length ? 'recebido' : 'a receber' };
}

const opcoesVenda = () => S.categorias.filter((c) => c.tipo === 'receita' && c.ativo && ['venda', 'frete', 'outra'].includes(c.grupo));

function blocoPagamento(v, rec, novo) {
  if (rec) {
    const r = resumoPagamento(v);
    return `<details class="sec" open><summary><h3>${icon('arrow-down')} Pagamento do cliente</h3></summary>
      <p class="note">${icon('check-circle')} Lançado no financeiro: <strong>${brl(r.total)}</strong> · ${r.texto}${r.falta ? ` · falta ${brl(r.falta)}` : ''}.
        ${r.grupo ? '<button type="button" class="btn-link" data-ver-pag>Ver parcelas</button>' : '<button type="button" class="btn-link" data-ver-pag>Ver lançamento</button>'}</p></details>`;
  }
  if (v.status === 'cancelado') return '';
  const cats = opcoesVenda();
  const conta = S.contas.find((c) => c.ativo)?.id || '';
  return `<details class="sec" open data-pag-sec><summary><h3>${icon('arrow-down')} Pagamento do cliente</h3><span class="muted small">entra em "A receber" no financeiro</span></summary>
    <div class="chips" role="radiogroup" aria-label="Como o cliente vai pagar">
      <label class="chip"><input type="radio" name="pg_modo" value="depois" ${novo ? '' : 'checked'}><span>Lançar depois</span></label>
      <label class="chip"><input type="radio" name="pg_modo" value="vista" ${novo ? 'checked' : ''}><span>À vista</span></label>
      <label class="chip"><input type="radio" name="pg_modo" value="parcelado"><span>Parcelado</span></label>
    </div>
    <p class="field-help" data-pg-ajuda>O aplicativo pergunta de novo quando o pedido for entregue.</p>
    <div data-pg-box hidden class="pag-box">
      <div class="grid-3">
        ${campo({ nome: 'pg_cat', rotulo: 'Categoria', valor: cats.find((c) => c.grupo === 'venda')?.id || '', opcoes: cats.map((c) => ({ valor: c.id, rotulo: c.nome })) })}
        ${campo({ nome: 'pg_conta', rotulo: 'Conta', valor: conta, opcoes: [{ valor: '', rotulo: 'Escolha…' }].concat(S.contas.filter((c) => c.ativo).map((c) => ({ valor: c.id, rotulo: c.nome }))) })}
        ${campo({ nome: 'pg_forma', rotulo: 'Forma', valor: 'pix', opcoes: Object.entries(FORMAS).map(([k, t]) => ({ valor: k, rotulo: t })) })}
      </div>
      <div class="grid-2" data-pg-vista>
        ${campo({ nome: 'pg_venc', rotulo: 'Recebe em', tipo: 'date', valor: v.prazo || hoje() })}
        <label class="check pg-check"><input type="checkbox" name="pg_pago"> <span>Já recebido (hoje)</span></label>
      </div>
      <div data-pg-parc hidden>
        <div class="grid-4">
          ${campo({ nome: 'pg_n', rotulo: 'Nº de parcelas', tipo: 'number', valor: 2, attrs: 'min="2" max="60" step="1" inputmode="numeric"' })}
          ${campo({ nome: 'pg_int', rotulo: 'Intervalo', valor: 'mensal', opcoes: [{ valor: 'mensal', rotulo: 'Mensal' }, { valor: 'dias', rotulo: 'A cada X dias' }] })}
          <div data-pg-dias-wrap hidden>${campo({ nome: 'pg_dias', rotulo: 'A cada quantos dias', tipo: 'number', valor: 30, attrs: 'min="1" max="365" step="1" inputmode="numeric"' })}</div>
          ${campo({ nome: 'pg_primeira', rotulo: '1ª parcela vence em', tipo: 'date', valor: hoje() })}
        </div>
        <label class="check"><input type="checkbox" name="pg_entrada"> <span>A 1ª parcela já foi recebida (sinal/entrada)</span></label>
        <div class="table-wrap"><table class="tbl compact parc-tbl"><thead><tr><th>Parcela</th><th>Vencimento</th><th class="num">Valor</th></tr></thead><tbody data-pg-linhas></tbody></table></div>
        <p class="parc-soma" data-pg-soma aria-live="polite"></p>
      </div>
      <p class="hyp">${icon('info')} <span>A venda entra no faturamento na data em que o pedido foi recebido. Cada parcela entra no caixa quando for recebida.</span></p>
    </div>
  </details>`;
}

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

    ${blocoPagamento(v, rec, !editando)}

    <section class="calc-box" data-calc aria-live="polite"></section>
    ${campo({ nome: 'observacoes', rotulo: 'Descrição / observações', tipo: 'textarea', valor: v.observacoes || '', attrs: 'maxlength="2000" placeholder="Cores, tamanho, detalhes combinados com o cliente…"' })}

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
      const pag = ligarPagamento(f, dlg);
      $('[data-ver-pag]', dlg)?.addEventListener('click', () => { fechar(''); const r = resumoPagamento(p); if (r.grupo) verParcelas(r.grupo); else abrirLancamento({ lanc: r.primeira }); });
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
        const falhaPag = pag.validar(d);
        if (falhaPag) { if (falhaPag[0]) erroCampo(f, falhaPag[0], falhaPag[1]); else toast(falhaPag[1], 'erro'); return; }
        let salvo;
        try {
          salvo = editando ? await alterar('pedidos', p.id, d) : await criar('pedidos', { id: novoId(), ...d });
        } catch (ex) { erro(ex); return; }
        let lancado = 0;
        if (pag.modo() !== 'depois') {
          try { lancado = (await criar('lancamentos', pag.linhas(salvo))).length; } catch (ex) {
            erro(new Error(`O pedido foi salvo, mas o pagamento não foi lançado no financeiro: ${ex.message}`)); fechar('ok'); return;
          }
        }
        toast(`${editando ? 'Pedido atualizado' : `Pedido ${salvo.codigo} cadastrado`}${lancado ? ` · ${lancado > 1 ? `${lancado} parcelas lançadas` : 'pagamento lançado'} em "A receber"` : ''}.`);
        fechar('ok');
        if (editando && p.status !== 'entregue' && salvo.status === 'entregue' && !lancado) sugerirReceita(salvo);
      });
      $('[data-salvar]', dlg)?.addEventListener('click', salvar);
      f.addEventListener('submit', (e) => { e.preventDefault(); salvar(); });
    },
  });
}

/** Controla a área "Pagamento do cliente" do formulário de pedido. */
function ligarPagamento(f, dlg) {
  const sec = $('[data-pag-sec]', dlg);
  let parcelas = []; let assinatura = '';
  const modo = () => (sec ? f.querySelector('[name=pg_modo]:checked')?.value || 'depois' : 'depois');
  const total = () => lerValor(f.preco_venda.value);
  const desenhar = () => {
    $('[data-pg-linhas]', dlg).innerHTML = parcelas.map((x, i) => `<tr><td>${i + 1}/${parcelas.length}${i === 0 && f.pg_entrada.checked ? ' <span class="tag tag-ok">entrada</span>' : ''}</td>
      <td><input type="date" data-gv="${i}" value="${x.vencimento}" aria-label="Vencimento da parcela ${i + 1}"></td>
      <td class="num"><div class="input-money sm"><span aria-hidden="true">R$</span><input type="text" inputmode="decimal" data-gval="${i}" value="${valorInput(x.valor)}" aria-label="Valor da parcela ${i + 1}"></div></td></tr>`).join('');
    somar();
  };
  const somar = () => {
    const t = total(); const el = $('[data-pg-soma]', dlg);
    if (!Number.isFinite(t) || t <= 0) { el.className = 'parc-soma'; el.textContent = 'Informe o preço de venda para dividir.'; return; }
    const soma = parcelas.reduce((a, x) => a + (Number.isFinite(x.valor) ? x.valor : 0), 0); const dif = t - soma;
    el.className = `parc-soma ${dif ? 'neg' : 'pos'}`;
    el.innerHTML = dif ? `${icon('alert')} As parcelas somam ${brl(soma)}; ${dif > 0 ? 'faltam' : 'sobram'} ${brl(Math.abs(dif))} para ${brl(t)}.`
      : `${icon('check')} ${parcelas.length} parcelas somando ${brl(soma)}${new Set(parcelas.map((x) => x.valor)).size === 1 ? ` (${parcelas.length}x de ${brl(parcelas[0].valor)})` : ''}.`;
  };
  const regerar = (forcar) => {
    const t = total(); const n = Math.min(60, Math.max(2, Math.floor(Number(f.pg_n.value) || 2)));
    const nova = [t, n, f.pg_primeira.value, f.pg_int.value, f.pg_dias.value].join('|');
    if (!forcar && nova === assinatura && parcelas.length) return;
    assinatura = nova;
    parcelas = gerarParcelas(Number.isFinite(t) && t > 0 ? t : 0, n, f.pg_primeira.value || hoje(), { modo: f.pg_int.value, dias: Number(f.pg_dias.value) || 30 });
    desenhar();
  };
  const sinc = () => {
    if (!sec) return;
    const m = modo();
    $('[data-pg-box]', dlg).hidden = m === 'depois';
    $('[data-pg-vista]', dlg).hidden = m !== 'vista';
    $('[data-pg-parc]', dlg).hidden = m !== 'parcelado';
    $('[data-pg-dias-wrap]', dlg).hidden = f.pg_int.value !== 'dias';
    $('[data-pg-ajuda]', dlg).textContent = m === 'depois' ? 'O aplicativo pergunta de novo quando o pedido for entregue.'
      : m === 'vista' ? 'Lança o valor total em "A receber" na data escolhida (marque se já recebeu). Sem preço informado, nada é lançado.' : 'Cada parcela vira uma conta a receber, com o próprio vencimento.';
    if (m === 'parcelado') regerar();
  };
  if (sec) {
    f.addEventListener('change', (e) => {
      if (e.target.dataset?.gv !== undefined) parcelas[Number(e.target.dataset.gv)].vencimento = e.target.value;
      if (e.target.dataset?.gval !== undefined) { const c = lerValor(e.target.value); parcelas[Number(e.target.dataset.gval)].valor = c; if (Number.isFinite(c)) e.target.value = valorInput(c); somar(); }
      if (e.target.name === 'pg_entrada') desenhar();
      if (e.target.name === 'pg_modo') f.dataset.pgEscolhido = '1';
      if (['pg_modo', 'pg_int', 'pg_n', 'pg_dias', 'pg_primeira', 'preco_venda'].includes(e.target.name)) sinc();
    });
    f.addEventListener('input', (e) => {
      if (e.target.dataset?.gval !== undefined) { parcelas[Number(e.target.dataset.gval)].valor = lerValor(e.target.value); somar(); }
      if (['preco_venda', 'pg_n', 'pg_dias', 'pg_primeira'].includes(e.target.name) && modo() === 'parcelado') regerar();
    });
    sinc();
  }
  // padrão automático (à vista) só vale quando há preço; sem preço, fica para depois
  const efetivo = () => { const m = modo(); const t = total(); return m !== 'depois' && !f.dataset.pgEscolhido && !(Number.isFinite(t) && t > 0) ? 'depois' : m; };
  return {
    modo: efetivo,
    validar(d) {
      const m = efetivo();
      if (m === 'depois') return null;
      const t = total();
      if (!Number.isFinite(t) || t <= 0) return ['preco_venda', 'Para lançar o pagamento, informe o preço de venda.'];
      if (!f.pg_cat.value) return ['pg_cat', 'Cadastre uma categoria de venda em Configurações → Categorias.'];
      if (m === 'vista') {
        if (!f.pg_venc.value) return ['pg_venc', 'Informe a data.'];
        if (f.pg_venc.value < somaDias(d.recebido_em, -366)) return ['pg_venc', 'Data muito anterior ao pedido.'];
        if (f.pg_pago.checked && !f.pg_conta.value) return ['pg_conta', 'Escolha a conta que recebeu.'];
        return null;
      }
      if (f.pg_entrada.checked && !f.pg_conta.value) return ['pg_conta', 'Escolha a conta que recebeu a entrada.'];
      for (let i = 0; i < parcelas.length; i++) {
        if (!parcelas[i].vencimento) return [null, `Informe o vencimento da parcela ${i + 1}.`];
        if (parcelas[i].vencimento < somaDias(d.recebido_em, -366)) return [null, `O vencimento da parcela ${i + 1} está antes demais do pedido.`];
        if (!Number.isFinite(parcelas[i].valor) || parcelas[i].valor <= 0) return [null, `Valor inválido na parcela ${i + 1}.`];
      }
      const soma = parcelas.reduce((a, x) => a + x.valor, 0);
      if (soma !== t) return [null, `As parcelas somam ${brl(soma)}, mas o preço é ${brl(t)}. Ajuste os valores.`];
      return null;
    },
    linhas(ped) {
      const base = {
        tipo: 'receita', categoria_id: f.pg_cat.value, data_competencia: ped.recebido_em, conta_id: f.pg_conta.value || null,
        forma_pagamento: f.pg_forma.value || null, origem: ped.origem || null, cliente: ped.cliente, natureza: null,
        observacoes: null, comprovante_path: null, pedido_id: ped.id,
      };
      const desc = `${ped.codigo} · ${ped.produto}`;
      if (efetivo() === 'vista') {
        const pago = f.pg_pago.checked;
        return [{ ...base, id: novoId(), descricao: desc.slice(0, 120), valor: total() / 100, data_vencimento: f.pg_venc.value,
          status: pago ? 'pago' : 'pendente', data_pagamento: pago ? hoje() : null, parcela_grupo: null, parcela_num: null, parcela_total: null }];
      }
      const grupo = novoId(); const n = parcelas.length;
      return parcelas.map((x, i) => {
        const pago = i === 0 && f.pg_entrada.checked;
        return { ...base, id: novoId(), descricao: descricaoParcela(desc, i + 1, n), valor: x.valor / 100, data_vencimento: x.vencimento,
          status: pago ? 'pago' : 'pendente', data_pagamento: pago ? hoje() : null, parcela_grupo: grupo, parcela_num: i + 1, parcela_total: n };
      });
    },
  };
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
