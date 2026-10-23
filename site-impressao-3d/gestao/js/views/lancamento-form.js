/* Formulário de receita/despesa, baixa de pagamento e histórico. */
import * as api from '../api.js';
import { S, criar, alterar, remover, podeEditarLanc, podeGerir, novoId, gerarRecorrencias } from '../store.js';
import { modal, confirmar, campo, erroCampo, limparErros, ligarDinheiro, dinheiro, ocupado, toast, erro, icon, $, selo } from '../ui.js';
import { esc, hoje, brl, centavos, dataBR, dataHora, FORMAS, ORIGENS, GRUPOS, inicioMes, somaDias } from '../format.js';
import { possiveisDuplicados, statusEfetivo, gerarParcelas, descricaoParcela } from '../finance.js';
import { lerValor, valorInput } from '../format.js';

const opcoesCategoria = (tipo, atual) => [{ valor: '', rotulo: 'Escolha…' }].concat(
  S.categorias.filter((c) => c.tipo === tipo && (c.ativo || c.id === atual))
    .map((c) => ({ valor: c.id, rotulo: c.nome + (c.ativo ? '' : ' (inativa)') })));
const opcoesConta = (atual) => [{ valor: '', rotulo: 'Escolha…' }].concat(
  S.contas.filter((c) => c.ativo || c.id === atual).map((c) => ({ valor: c.id, rotulo: c.nome })));
const opcoes = (obj, vazio) => (vazio ? [{ valor: '', rotulo: vazio }] : []).concat(Object.entries(obj).map(([valor, rotulo]) => ({ valor, rotulo })));
const contaPadrao = () => S.contas.find((c) => c.ativo)?.id || '';

/**
 * Abre o formulário. opts: { tipo, lanc (para editar), preset (valores iniciais), aoSalvar }
 */
export function abrirLancamento(opts = {}) {
  const l = opts.lanc || null;
  const editando = Boolean(l);
  if (editando && !podeEditarLanc(l)) { detalhes(l); return; }
  const v = { tipo: opts.tipo || 'receita', status: 'pago', data_competencia: hoje(), forma_pagamento: 'pix', ...(opts.preset || {}), ...(l || {}) };
  let tipo = v.tipo;
  const semCategorias = !S.categorias.some((c) => c.tipo === tipo && c.ativo);

  const corpo = `
  <form class="form" data-form novalidate>
    ${editando ? '' : `<div class="segmented seg-tipo" role="radiogroup" aria-label="Tipo de lançamento">
      <label class="seg ${tipo === 'receita' ? 'on' : ''}"><input type="radio" name="tipo" value="receita" ${tipo === 'receita' ? 'checked' : ''}>${icon('arrow-down')} Receita</label>
      <label class="seg ${tipo === 'despesa' ? 'on' : ''}"><input type="radio" name="tipo" value="despesa" ${tipo === 'despesa' ? 'checked' : ''}>${icon('arrow-up')} Despesa</label>
    </div>`}
    ${semCategorias ? '<p class="note note-alerta">Nenhuma categoria ativa para este tipo. Cadastre em Configurações → Categorias.</p>' : ''}
    <div class="grid-2">
      ${campo({ nome: 'descricao', rotulo: 'Descrição', valor: v.descricao || '', obrig: true, attrs: 'maxlength="120" autocomplete="off" list="sug-desc"', cls: 'span-2' })}
      ${campo({ nome: 'valor', rotulo: 'Valor', tipo: 'dinheiro', valor: v.valor !== undefined ? centavos(v.valor) : '', obrig: true })}
      <div data-cat-wrap>${campo({ nome: 'categoria_id', rotulo: 'Categoria', valor: v.categoria_id || '', obrig: true, opcoes: opcoesCategoria(tipo, v.categoria_id) })}</div>
      ${campo({ nome: 'data_competencia', rotulo: tipo === 'receita' ? 'Data da venda' : 'Data da despesa', tipo: 'date', valor: v.data_competencia, obrig: true, ajuda: 'Quando aconteceu. É a data usada no faturamento e no lucro.' })}
      ${campo({ nome: 'data_vencimento', rotulo: 'Vencimento', tipo: 'date', valor: v.data_vencimento || v.data_competencia, obrig: true, ajuda: 'Quando deve ser pago ou recebido.' })}
    </div>

    <fieldset class="field">
      <legend>Situação</legend>
      <div class="chips" data-status>
        <label class="chip"><input type="radio" name="status" value="pendente" ${v.status === 'pendente' ? 'checked' : ''}><span>${tipo === 'receita' ? 'A receber' : 'A pagar'}</span></label>
        <label class="chip"><input type="radio" name="status" value="pago" ${v.status === 'pago' ? 'checked' : ''}><span>${tipo === 'receita' ? 'Recebido' : 'Pago'}</span></label>
        ${editando ? `<label class="chip"><input type="radio" name="status" value="cancelado" ${v.status === 'cancelado' ? 'checked' : ''}><span>Cancelado</span></label>` : ''}
      </div>
    </fieldset>

    ${editando || v.recorrencia_id ? '' : `<label class="check" data-parc-toggle><input type="checkbox" name="parcelar" value="1"> <span>Parcelar <small>(dividir em várias vezes: 3x no cartão, sinal + restante, boleto mensal…)</small></span></label>
    <div class="parc-box" data-parc hidden>
      <div class="grid-4">
        ${campo({ nome: 'parc_n', rotulo: 'Nº de parcelas', tipo: 'number', valor: 3, attrs: 'min="2" max="60" step="1" inputmode="numeric"' })}
        ${campo({ nome: 'parc_modo', rotulo: 'Intervalo', valor: 'mensal', opcoes: [{ valor: 'mensal', rotulo: 'Mensal' }, { valor: 'dias', rotulo: 'A cada X dias' }] })}
        <div data-parc-dias-wrap hidden>${campo({ nome: 'parc_dias', rotulo: 'A cada quantos dias', tipo: 'number', valor: 30, attrs: 'min="1" max="365" step="1" inputmode="numeric"' })}</div>
        ${campo({ nome: 'parc_primeira', rotulo: '1ª parcela vence em', tipo: 'date', valor: v.data_vencimento || v.data_competencia })}
      </div>
      <label class="check"><input type="checkbox" name="parc_entrada" value="1"> <span data-parc-entrada-txt>A 1ª parcela já foi ${tipo === 'receita' ? 'recebida' : 'paga'} (entrada)</span></label>
      <div class="table-wrap"><table class="tbl compact parc-tbl"><thead><tr><th>Parcela</th><th>Vencimento</th><th class="num">Valor</th></tr></thead><tbody data-parc-linhas></tbody></table></div>
      <p class="parc-soma" data-parc-soma aria-live="polite"></p>
      <p class="hyp">${icon('info')} <span>Datas e valores de cada parcela podem ser ajustados acima. No faturamento, no lucro e no orçamento, o valor total conta na data da ${tipo === 'receita' ? 'venda' : 'compra'}. No caixa, cada parcela conta quando for paga.</span></p>
    </div>`}
    ${v.parcela_grupo ? `<p class="note">${icon('list')} Parcela <strong>${v.parcela_num} de ${v.parcela_total}</strong>. Alterar aqui muda só esta parcela. <button type="button" class="btn-link" data-ver-parcelas>Ver todas as parcelas</button></p>` : ''}

    <div class="grid-3" data-pago-box ${v.status === 'pago' ? '' : 'hidden'}>
      ${campo({ nome: 'data_pagamento', rotulo: tipo === 'receita' ? 'Recebido em' : 'Pago em', tipo: 'date', valor: v.data_pagamento || hoje(), attrs: `max="${hoje()}"` })}
      ${campo({ nome: 'conta_id', rotulo: 'Conta', valor: v.conta_id || contaPadrao(), opcoes: opcoesConta(v.conta_id) })}
      ${campo({ nome: 'forma_pagamento', rotulo: 'Forma de pagamento', valor: v.forma_pagamento || 'pix', opcoes: opcoes(FORMAS, '—') })}
    </div>

    <div class="grid-2" data-so-receita ${tipo === 'receita' ? '' : 'hidden'}>
      ${campo({ nome: 'origem', rotulo: 'Origem da venda', valor: v.origem || '', opcoes: opcoes(ORIGENS, '—') })}
      ${campo({ nome: 'cliente', rotulo: 'Cliente', valor: v.cliente || '', attrs: 'maxlength="120" autocomplete="off" list="sug-cli"' })}
    </div>
    <div class="grid-2" data-so-despesa ${tipo === 'despesa' ? '' : 'hidden'}>
      ${campo({ nome: 'natureza', rotulo: 'Classificação', valor: v.natureza || 'variavel', opcoes: [{ valor: 'variavel', rotulo: 'Variável (muda conforme a produção)' }, { valor: 'fixa', rotulo: 'Fixa (todo mês)' }] })}
    </div>

    ${editando || v.recorrencia_id ? '' : `<label class="check"><input type="checkbox" name="repetir" value="1"> <span>Repetir todo mês <small>(ex.: internet, DAS, assinatura)</small></span></label>`}
    ${v.recorrencia_id ? `<p class="note">${icon('repeat')} Gerado automaticamente por uma recorrência mensal. Alterar aqui muda só este mês.</p>` : ''}

    ${campo({ nome: 'observacoes', rotulo: 'Observações', tipo: 'textarea', valor: v.observacoes || '', attrs: 'maxlength="1000"' })}

    <div class="field">
      <label for="f-comp">Comprovante <small>(PDF ou imagem, até 5 MB)</small></label>
      ${v.comprovante_path ? `<p class="file-atual" data-comp-atual>${icon('file')} <button type="button" class="btn-link" data-ver-comp>Ver comprovante</button> · <button type="button" class="btn-link perigo" data-tirar-comp>remover</button></p>` : ''}
      <input id="f-comp" name="comprovante" type="file" accept="application/pdf,image/jpeg,image/png,image/webp">
    </div>
    <datalist id="sug-desc">${[...new Set(S.lancamentos.slice(0, 300).map((x) => x.descricao))].slice(0, 60).map((d) => `<option value="${esc(d)}">`).join('')}</datalist>
    <datalist id="sug-cli">${[...new Set(S.lancamentos.filter((x) => x.cliente).map((x) => x.cliente))].slice(0, 80).map((d) => `<option value="${esc(d)}">`).join('')}</datalist>
  </form>`;

  const rodape = `
    ${editando && podeGerir() ? `<button type="button" class="btn btn-ghost perigo mr-auto" data-excluir>${icon('trash')} Excluir</button>` : ''}
    ${editando && podeGerir() ? `<button type="button" class="btn btn-ghost" data-historico>${icon('history')} Histórico</button>` : ''}
    <button type="button" class="btn btn-ghost" data-fechar>Cancelar</button>
    <button type="submit" class="btn btn-accent" data-salvar>${editando ? 'Salvar alterações' : 'Salvar'}</button>`;

  modal({
    titulo: editando ? `Editar ${l.tipo}` : 'Novo lançamento', corpo, rodape, largura: 'lg',
    aoAbrir: (dlg, fechar) => {
      const form = $('[data-form]', dlg);
      ligarDinheiro(form);
      let tirarComp = false;
      const parcelando = () => Boolean(form.parcelar?.checked);
      let parcelas = [];
      const desenharParcelas = () => {
        const corpoT = $('[data-parc-linhas]', dlg);
        if (!corpoT) return;
        corpoT.innerHTML = parcelas.map((x, i) => `<tr><td>${i + 1}/${parcelas.length}${i === 0 && form.parc_entrada.checked ? ' <span class="tag tag-ok">entrada</span>' : ''}</td>
          <td><input type="date" data-pv="${i}" value="${x.vencimento}" aria-label="Vencimento da parcela ${i + 1}"></td>
          <td class="num"><div class="input-money sm"><span aria-hidden="true">R$</span><input type="text" inputmode="decimal" data-pval="${i}" value="${valorInput(x.valor)}" aria-label="Valor da parcela ${i + 1}"></div></td></tr>`).join('');
        somarParcelas();
      };
      const somarParcelas = () => {
        const total = dinheiro(form, 'valor');
        const soma = parcelas.reduce((t, x) => t + (Number.isFinite(x.valor) ? x.valor : 0), 0);
        const el = $('[data-parc-soma]', dlg);
        if (!el) return;
        if (!Number.isFinite(total) || total <= 0) { el.innerHTML = 'Informe o valor total para dividir.'; el.className = 'parc-soma'; return; }
        const dif = total - soma;
        el.className = `parc-soma ${dif ? 'neg' : 'pos'}`;
        el.innerHTML = dif ? `${icon('alert')} As parcelas somam ${brl(soma)}, ${dif > 0 ? 'faltam' : 'sobram'} ${brl(Math.abs(dif))} para o total de ${brl(total)}.`
          : `${icon('check')} ${parcelas.length} parcelas somando ${brl(soma)}${parcelas.length && new Set(parcelas.map((x) => x.valor)).size === 1 ? ` (${parcelas.length}x de ${brl(parcelas[0].valor)})` : ''}.`;
      };
      let assinatura = '';
      const regerar = () => {
        if (!form.parc_n) return;
        const total = dinheiro(form, 'valor');
        const n = Math.min(60, Math.max(2, Math.floor(Number(form.parc_n.value) || 2)));
        const prim = form.parc_primeira.value || form.data_competencia.value;
        // só refaz a tabela quando algo que define as parcelas mudou (preserva ajustes manuais e o foco)
        const nova = [total, n, prim, form.parc_modo.value, form.parc_dias.value].join('|');
        if (nova === assinatura && parcelas.length) return;
        assinatura = nova;
        parcelas = gerarParcelas(Number.isFinite(total) && total > 0 ? total : 0, n, prim, { modo: form.parc_modo.value, dias: Number(form.parc_dias.value) || 30 });
        desenharParcelas();
      };
      const sincronizar = () => {
        const st = form.status.value;
        const parc = parcelando();
        if (form.parc_n) {
          $('[data-parc]', dlg).hidden = !parc;
          $('[data-parc-dias-wrap]', dlg).hidden = form.parc_modo.value !== 'dias';
          form.querySelector('fieldset.field').hidden = parc;
          form.querySelector('[data-field="data_vencimento"]').hidden = parc;
          const rep = form.repetir?.closest('label'); if (rep) rep.hidden = parc;
          form.querySelector('[data-field="valor"] label').firstChild.textContent = parc ? 'Valor total' : 'Valor';
          const txt = $('[data-parc-entrada-txt]', dlg); if (txt) txt.textContent = `A 1ª parcela já foi ${tipo === 'receita' ? 'recebida' : 'paga'} (entrada)`;
        }
        if (form.parcelar) form.parcelar.closest('label').hidden = Boolean(form.repetir?.checked);
        $('[data-pago-box]', dlg).hidden = parc ? false : st !== 'pago';
        form.querySelector('[data-field="data_pagamento"]').hidden = parc && !form.parc_entrada.checked;
        $('[data-so-receita]', dlg).hidden = tipo !== 'receita';
        $('[data-so-despesa]', dlg).hidden = tipo !== 'despesa';
        dlg.querySelectorAll('.seg').forEach((s) => s.classList.toggle('on', s.querySelector('input').checked));
      };
      form.addEventListener('change', (e) => {
        if (e.target.name === 'tipo') {
          tipo = e.target.value;
          $('[data-cat-wrap]', dlg).innerHTML = campo({ nome: 'categoria_id', rotulo: 'Categoria', obrig: true, opcoes: opcoesCategoria(tipo) });
          const chips = $('[data-status]', dlg).querySelectorAll('.chip span');
          chips[0].textContent = tipo === 'receita' ? 'A receber' : 'A pagar';
          chips[1].textContent = tipo === 'receita' ? 'Recebido' : 'Pago';
          form.querySelector('[data-field="data_competencia"] label').firstChild.textContent = tipo === 'receita' ? 'Data da venda' : 'Data da despesa';
        }
        if (e.target.name === 'categoria_id' && tipo === 'despesa' && !editando) {
          const g = S.cats[e.target.value]?.grupo;
          if (g) form.natureza.value = ['operacional', 'imposto'].includes(g) ? 'fixa' : 'variavel';
        }
        if (e.target.name === 'data_competencia' && !editando) {
          // vencimento acompanha a data enquanto o usuário não mexer nele
          if (!form.data_vencimento.dataset.mexeu) form.data_vencimento.value = e.target.value;
        }
        if (e.target.name === 'data_vencimento') form.data_vencimento.dataset.mexeu = '1';
        if (e.target.name === 'data_competencia' && form.parc_primeira && !form.parc_primeira.dataset.mexeu) form.parc_primeira.value = e.target.value;
        if (e.target.name === 'parc_primeira') form.parc_primeira.dataset.mexeu = '1';
        if (['parcelar', 'parc_n', 'parc_modo', 'parc_dias', 'parc_primeira', 'valor', 'data_competencia'].includes(e.target.name) && parcelando()) regerar();
        if (e.target.name === 'parc_entrada') desenharParcelas();
        if (e.target.dataset?.pv !== undefined) parcelas[Number(e.target.dataset.pv)].vencimento = e.target.value;
        if (e.target.dataset?.pval !== undefined) { const c = lerValor(e.target.value); parcelas[Number(e.target.dataset.pval)].valor = c; if (Number.isFinite(c)) e.target.value = valorInput(c); somarParcelas(); }
        sincronizar();
      });
      form.addEventListener('input', (e) => {
        if (e.target.dataset?.pval !== undefined) { parcelas[Number(e.target.dataset.pval)].valor = lerValor(e.target.value); somarParcelas(); }
        if (['valor', 'parc_n', 'parc_dias', 'parc_primeira'].includes(e.target.name) && parcelando()) regerar();
      });
      $('[data-ver-parcelas]', dlg)?.addEventListener('click', () => { fechar(''); verParcelas(v.parcela_grupo); });
      $('[data-ver-comp]', dlg)?.addEventListener('click', () => verComprovante(v.comprovante_path));
      $('[data-tirar-comp]', dlg)?.addEventListener('click', () => { tirarComp = true; $('[data-comp-atual]', dlg).innerHTML = '<span class="muted">O comprovante será removido ao salvar.</span>'; });
      $('[data-excluir]', dlg)?.addEventListener('click', async () => {
        if (await excluirLancamento(l)) fechar('');
      });
      $('[data-historico]', dlg)?.addEventListener('click', () => historico('lancamentos', l.id, l.descricao));
      const salvar = () => ocupado($('[data-salvar]', dlg), async () => {
        limparErros(form);
        if (parcelando()) { await salvarParcelado(form, tipo, parcelas, v, fechar, opts); return; }
        const d = lerForm(form, tipo);
        const falha = validar(d);
        if (falha) { erroCampo(form, falha[0], falha[1]); return; }
        if (!editando) {
          const dups = possiveisDuplicados({ ...d, id: null }, S.lancamentos);
          if (dups.length && !(await confirmar({
            titulo: 'Possível lançamento repetido',
            texto: `Já existe ${dups.length === 1 ? 'um lançamento' : `${dups.length} lançamentos`} de <strong>${brl(centavos(d.valor))}</strong> em ${dataBR(d.data_competencia)}: <em>${esc(dups[0].descricao)}</em>. Deseja salvar mesmo assim?`,
            botao: 'Salvar mesmo assim',
          }))) return;
        }
        try {
          const arquivo = form.comprovante.files[0];
          if (arquivo) {
            d.comprovante_path = await api.enviarComprovante(arquivo, `${d.data_competencia.slice(0, 7)}`);
          } else if (tirarComp) d.comprovante_path = null;

          let salvo;
          if (editando) {
            salvo = await alterar('lancamentos', l.id, d);
            if ((arquivo || tirarComp) && l.comprovante_path) api.apagarComprovante(l.comprovante_path).catch(() => {});
            toast('Lançamento atualizado.');
          } else if (form.repetir?.checked) {
            salvo = await criarRecorrente(d);
          } else {
            salvo = await criar('lancamentos', { id: novoId(), ...d, ...(v.pedido_id && !l ? { pedido_id: v.pedido_id } : {}) });
            toast(`${tipo === 'receita' ? 'Receita' : 'Despesa'} registrada.`);
          }
          fechar('ok');
          opts.aoSalvar?.(salvo);
        } catch (ex) { erro(ex); }
      });
      $('[data-salvar]', dlg).addEventListener('click', salvar);
      form.addEventListener('submit', (e) => { e.preventDefault(); salvar(); });
    },
  });
}

function lerForm(form, tipo) {
  const st = form.status.value;
  const d = {
    tipo,
    descricao: form.descricao.value.trim(),
    valor: dinheiro(form, 'valor') / 100,
    categoria_id: form.categoria_id.value,
    data_competencia: form.data_competencia.value,
    data_vencimento: form.data_vencimento.value,
    status: st,
    data_pagamento: st === 'pago' ? form.data_pagamento.value : null,
    conta_id: st === 'pago' ? form.conta_id.value || null : (form.conta_id.value || null),
    forma_pagamento: form.forma_pagamento.value || null,
    origem: tipo === 'receita' ? (form.origem.value || null) : null,
    cliente: tipo === 'receita' ? (form.cliente.value.trim() || null) : null,
    natureza: tipo === 'despesa' ? form.natureza.value : null,
    observacoes: form.observacoes.value.trim() || null,
  };
  return d;
}

function validar(d) {
  if (!d.descricao) return ['descricao', 'Informe uma descrição.'];
  if (!Number.isFinite(d.valor) || d.valor <= 0) return ['valor', 'Informe um valor maior que zero (ex.: 150,00).'];
  if (d.valor > 10000000) return ['valor', 'Valor alto demais. Confira os números.'];
  if (!d.categoria_id) return ['categoria_id', 'Escolha uma categoria.'];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.data_competencia)) return ['data_competencia', 'Informe a data.'];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.data_vencimento)) return ['data_vencimento', 'Informe o vencimento.'];
  if (d.data_competencia < '2000-01-01' || d.data_competencia > somaDias(hoje(), 3660)) return ['data_competencia', 'Data fora do intervalo aceito.'];
  if (d.data_vencimento < somaDias(d.data_competencia, -366)) return ['data_vencimento', 'Vencimento muito anterior à data do lançamento.'];
  if (d.status === 'pago') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.data_pagamento || '')) return ['data_pagamento', 'Informe a data do pagamento.'];
    if (d.data_pagamento > hoje()) return ['data_pagamento', 'A data do pagamento não pode estar no futuro.'];
    if (!d.conta_id) return ['conta_id', 'Escolha em qual conta o dinheiro entrou/saiu.'];
  }
  return null;
}

async function criarRecorrente(d) {
  const venc = d.data_vencimento;
  const rec = await criar('recorrencias', {
    id: novoId(), tipo: d.tipo, descricao: d.descricao, categoria_id: d.categoria_id, conta_id: d.conta_id,
    valor: d.valor, dia_vencimento: Number(venc.slice(8, 10)), natureza: d.natureza, forma_pagamento: d.forma_pagamento,
    inicio: venc, fim: null, ativo: true,
  });
  await gerarRecorrencias();
  // o lançamento deste mês foi gerado pelo banco; aplica situação/observações informadas
  const gerado = S.lancamentos.find((x) => x.recorrencia_id === rec.id && x.competencia_rec === inicioMes(venc));
  if (gerado && (d.status === 'pago' || d.observacoes || d.comprovante_path)) {
    await alterar('lancamentos', gerado.id, {
      status: d.status, data_pagamento: d.data_pagamento, conta_id: d.conta_id,
      observacoes: d.observacoes, comprovante_path: d.comprovante_path || null,
    });
  }
  toast('Recorrência mensal criada. Os próximos meses aparecem automaticamente em "A pagar e receber".');
  return gerado;
}

async function salvarParcelado(form, tipo, parcelas, v, fechar, opts) {
  const entrada = form.parc_entrada.checked;
  const base = lerForm(form, tipo);
  const total = dinheiro(form, 'valor');
  const n = parcelas.length;
  const falha = validar({ ...base, status: entrada ? 'pago' : 'pendente', data_vencimento: parcelas[0]?.vencimento || base.data_competencia, data_pagamento: entrada ? form.data_pagamento.value : null, conta_id: form.conta_id.value || null });
  if (falha) { erroCampo(form, falha[0], falha[1]); return; }
  if (!(n >= 2 && n <= 60)) { erroCampo(form, 'parc_n', 'Use de 2 a 60 parcelas.'); return; }
  for (let i = 0; i < n; i++) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(parcelas[i].vencimento || '')) { toast(`Informe o vencimento da parcela ${i + 1}.`, 'erro'); form.querySelector(`[data-pv="${i}"]`)?.focus(); return; }
    if (parcelas[i].vencimento < somaDias(base.data_competencia, -366)) { toast(`O vencimento da parcela ${i + 1} está antes demais da data do lançamento.`, 'erro'); return; }
    if (!Number.isFinite(parcelas[i].valor) || parcelas[i].valor <= 0) { toast(`Valor inválido na parcela ${i + 1}.`, 'erro'); form.querySelector(`[data-pval="${i}"]`)?.focus(); return; }
  }
  const soma = parcelas.reduce((t, x) => t + x.valor, 0);
  if (soma !== total) { toast(`As parcelas somam ${brl(soma)}, mas o total é ${brl(total)}. Ajuste os valores.`, 'erro'); return; }
  if (entrada && parcelas[0].vencimento > hoje() && !(await confirmar({ titulo: 'Entrada com vencimento futuro', texto: `A 1ª parcela vence em ${dataBR(parcelas[0].vencimento)}, mas foi marcada como já ${tipo === 'receita' ? 'recebida' : 'paga'} hoje. Continuar?`, botao: 'Continuar' }))) return;
  try {
    const arquivo = form.comprovante.files[0];
    const comp = arquivo ? await api.enviarComprovante(arquivo, base.data_competencia.slice(0, 7)) : null;
    const grupo = novoId();
    const linhas = parcelas.map((x, i) => {
      const paga = entrada && i === 0;
      return {
        ...base, id: novoId(),
        descricao: descricaoParcela(base.descricao, i + 1, n),
        valor: x.valor / 100,
        data_vencimento: x.vencimento,
        status: paga ? 'pago' : 'pendente',
        data_pagamento: paga ? form.data_pagamento.value : null,
        conta_id: form.conta_id.value || null,
        comprovante_path: i === 0 ? comp : null,
        parcela_grupo: grupo, parcela_num: i + 1, parcela_total: n,
        ...(v.pedido_id ? { pedido_id: v.pedido_id } : {}),
      };
    });
    const salvos = await criar('lancamentos', linhas);   // todas de uma vez: ou grava tudo, ou nada
    toast(`${tipo === 'receita' ? 'Receita' : 'Despesa'} dividida em ${n} parcelas.`);
    fechar('ok');
    opts.aoSalvar?.(salvos[0]);
  } catch (ex) { erro(ex); }
}

export function verParcelas(grupo) {
  const itens = S.lancamentos.filter((x) => x.parcela_grupo === grupo).sort((a, b) => a.parcela_num - b.parcela_num);
  const total = itens.reduce((t, x) => t + (x.status === 'cancelado' ? 0 : centavos(x.valor)), 0);
  const pagos = itens.filter((x) => x.status === 'pago').reduce((t, x) => t + centavos(x.valor), 0);
  const { dlg, fechar } = modal({
    titulo: 'Parcelas', largura: 'md',
    corpo: `<div class="totals"><span><small>Total</small><strong>${brl(total)}</strong></span><span><small>${itens[0]?.tipo === 'receita' ? 'Recebido' : 'Pago'}</small><strong class="pos">${brl(pagos)}</strong></span><span><small>Falta</small><strong>${brl(total - pagos)}</strong></span></div>
      <ul class="list">${itens.map((x) => `<li class="list-item"><span class="li-date">${x.parcela_num}/${x.parcela_total}</span>
        <span class="li-main"><button type="button" class="row-open" data-abrir-parc="${x.id}"><strong>vence ${dataBR(x.data_vencimento)}</strong></button><small>${x.data_pagamento ? `${x.tipo === 'receita' ? 'recebida' : 'paga'} em ${dataBR(x.data_pagamento)}` : ''}</small></span>
        <span class="li-val">${brl(centavos(x.valor))}</span>${selo(x.tipo === 'receita' && x.status === 'pago' ? 'recebido' : statusEfetivo(x))}
        ${x.status === 'pendente' && podeEditarLanc(x) ? `<button type="button" class="btn btn-sm btn-ghost" data-baixar-parc="${x.id}">${icon('check')}<span class="sr-only">Registrar pagamento</span></button>` : ''}</li>`).join('')}</ul>`,
    rodape: '<button type="button" class="btn btn-accent" data-fechar>Fechar</button>',
  });
  dlg.querySelectorAll('[data-abrir-parc]').forEach((b) => b.addEventListener('click', () => { fechar(''); abrirLancamento({ lanc: S.lancamentos.find((x) => x.id === b.dataset.abrirParc) }); }));
  dlg.querySelectorAll('[data-baixar-parc]').forEach((b) => b.addEventListener('click', () => { fechar(''); baixar(S.lancamentos.find((x) => x.id === b.dataset.baixarParc)); }));
}

/** Pergunta com três saídas: cancelar, só esta, todas. Retorna '', 'uma' ou 'todas'. */
function escolherExclusao(l, qtd) {
  return new Promise((resolve) => {
    modal({
      titulo: 'Excluir parcela?', largura: 'sm',
      corpo: `<p class="dlg-texto"><strong>${esc(l.descricao)}</strong> — ${brl(centavos(l.valor))}.<br>Este lançamento faz parte de um parcelamento com ${qtd} parcelas. A exclusão não pode ser desfeita (fica no histórico). Se a ${l.tipo === 'receita' ? 'venda' : 'compra'} não aconteceu, prefira marcar como <em>Cancelado</em>.</p>`,
      rodape: `<button type="button" class="btn btn-ghost mr-auto" data-fechar>Voltar</button>
        <button type="button" class="btn btn-ghost perigo" data-r="uma">Só esta parcela</button>
        <button type="button" class="btn btn-perigo" data-r="todas">Todas as ${qtd}</button>`,
      aoAbrir: (dlg, fechar) => dlg.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => fechar(b.dataset.r))),
      aoFechar: (r) => resolve(r || ''),
    });
  });
}

export async function excluirLancamento(l) {
  if (l.parcela_grupo) {
    const grupo = S.lancamentos.filter((x) => x.parcela_grupo === l.parcela_grupo);
    const r = grupo.length > 1 ? await escolherExclusao(l, grupo.length) : 'uma';
    if (!r) return false;
    try {
      const alvo = r === 'todas' ? grupo : [l];
      for (const x of alvo) {
        await remover('lancamentos', x.id);
        if (x.comprovante_path) api.apagarComprovante(x.comprovante_path).catch(() => {});
      }
      toast(r === 'todas' ? `${alvo.length} parcelas excluídas.` : 'Parcela excluída.');
      return true;
    } catch (e) { erro(e); return false; }
  }
  const ok = await confirmar({
    titulo: 'Excluir lançamento?',
    texto: `<strong>${esc(l.descricao)}</strong> — ${brl(centavos(l.valor))} em ${dataBR(l.data_competencia)}.<br>Essa ação não pode ser desfeita (fica registrada no histórico). Se a venda ou o gasto não aconteceu, prefira marcar como <em>Cancelado</em>.`,
    botao: 'Excluir', perigo: true,
  });
  if (!ok) return false;
  try {
    await remover('lancamentos', l.id);
    if (l.comprovante_path) api.apagarComprovante(l.comprovante_path).catch(() => {});
    toast('Lançamento excluído.');
    return true;
  } catch (e) { erro(e); return false; }
}

/** Registrar pagamento/recebimento de uma conta pendente. */
export function baixar(l, aoSalvar) {
  if (!podeEditarLanc(l)) { toast('Você não tem permissão para alterar este lançamento.', 'erro'); return; }
  const rec = l.tipo === 'receita';
  modal({
    titulo: rec ? 'Registrar recebimento' : 'Registrar pagamento', largura: 'sm',
    corpo: `<p class="dlg-texto"><strong>${esc(l.descricao)}</strong><br>${brl(centavos(l.valor))} · vencimento ${dataBR(l.data_vencimento)}</p>
      <form class="form" data-baixa novalidate>
        ${campo({ nome: 'data_pagamento', rotulo: rec ? 'Recebido em' : 'Pago em', tipo: 'date', valor: hoje(), obrig: true, attrs: `max="${hoje()}"` })}
        ${campo({ nome: 'conta_id', rotulo: 'Conta', valor: l.conta_id || contaPadrao(), obrig: true, opcoes: opcoesConta(l.conta_id) })}
        ${campo({ nome: 'forma_pagamento', rotulo: 'Forma de pagamento', valor: l.forma_pagamento || 'pix', opcoes: opcoes(FORMAS) })}
      </form>`,
    rodape: `<button type="button" class="btn btn-ghost" data-fechar>Cancelar</button><button type="button" class="btn btn-accent" data-ok>${icon('check')} Confirmar</button>`,
    aoAbrir: (dlg, fechar) => {
      const form = $('[data-baixa]', dlg);
      const go = () => ocupado($('[data-ok]', dlg), async () => {
        limparErros(form);
        if (!form.data_pagamento.value) return erroCampo(form, 'data_pagamento', 'Informe a data.');
        if (form.data_pagamento.value > hoje()) return erroCampo(form, 'data_pagamento', 'A data não pode estar no futuro.');
        if (!form.conta_id.value) return erroCampo(form, 'conta_id', 'Escolha a conta.');
        try {
          const s = await alterar('lancamentos', l.id, { status: 'pago', data_pagamento: form.data_pagamento.value, conta_id: form.conta_id.value, forma_pagamento: form.forma_pagamento.value });
          toast(rec ? 'Recebimento registrado.' : 'Pagamento registrado.');
          fechar('ok'); aoSalvar?.(s);
        } catch (e) { erro(e); }
      });
      $('[data-ok]', dlg).addEventListener('click', go);
      form.addEventListener('submit', (e) => { e.preventDefault(); go(); });
    },
  });
}

export async function verComprovante(caminho) {
  try {
    const url = await api.linkComprovante(caminho);
    window.open(url, '_blank', 'noopener');
  } catch (e) { erro(e); }
}

/** Visualização somente leitura (para quem não pode editar). */
export function detalhes(l) {
  const c = S.cats[l.categoria_id];
  const conta = S.contas.find((x) => x.id === l.conta_id);
  const linha = (k, v) => (v ? `<div><dt>${k}</dt><dd>${v}</dd></div>` : '');
  modal({
    titulo: esc(l.descricao), largura: 'sm',
    corpo: `<dl class="specs">
      ${linha('Tipo', l.tipo === 'receita' ? 'Receita' : 'Despesa')}
      ${linha('Valor', brl(centavos(l.valor)))}
      ${linha('Categoria', esc(c?.nome || '—'))}
      ${linha('Situação', selo(statusEfetivo(l)))}
      ${linha('Data', dataBR(l.data_competencia))}
      ${linha('Vencimento', dataBR(l.data_vencimento))}
      ${linha('Pagamento', l.data_pagamento ? dataBR(l.data_pagamento) : '')}
      ${linha('Conta', esc(conta?.nome || ''))}
      ${linha('Forma', FORMAS[l.forma_pagamento] || '')}
      ${linha('Origem', ORIGENS[l.origem] || '')}
      ${linha('Cliente', esc(l.cliente || ''))}
      ${linha('Observações', esc(l.observacoes || ''))}
    </dl>
    <p class="muted">Você pode ver este lançamento, mas só quem o criou ou um gerente pode alterá-lo.</p>`,
    rodape: '<button type="button" class="btn btn-accent" data-fechar>Fechar</button>',
  });
}

const ROTULOS = {
  descricao: 'Descrição', valor: 'Valor', categoria_id: 'Categoria', data_competencia: 'Data', data_vencimento: 'Vencimento',
  data_pagamento: 'Pagamento', status: 'Situação', conta_id: 'Conta', forma_pagamento: 'Forma', origem: 'Origem', cliente: 'Cliente',
  natureza: 'Classificação', observacoes: 'Observações', comprovante_path: 'Comprovante', nome: 'Nome', limite: 'Limite',
  saldo_inicial: 'Saldo inicial', data_saldo_inicial: 'Data do saldo', ativo: 'Ativo', papel: 'Papel', grupo: 'Grupo', cor: 'Cor',
  titulo: 'Título', valor_alvo: 'Valor-alvo', percentual: 'Percentual', inicio: 'Início', fim: 'Fim', tipo: 'Tipo', mes: 'Mês',
  dia_vencimento: 'Dia do vencimento',
};
const IGNORAR = ['id', 'criado_em', 'criado_por', 'atualizado_em', 'atualizado_por', 'recorrencia_id', 'competencia_rec', 'ordem'];

export function fmtCampo(k, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (k === 'valor' || k === 'limite' || k === 'saldo_inicial' || k === 'valor_alvo') return brl(centavos(v));
  if (k === 'categoria_id') return esc(S.cats[v]?.nome || 'categoria removida');
  if (k === 'conta_id') return esc(S.contas.find((c) => c.id === v)?.nome || 'conta removida');
  if (/^data_|^inicio$|^fim$|^mes$/.test(k)) return dataBR(String(v));
  if (k === 'forma_pagamento') return FORMAS[v] || v;
  if (k === 'origem') return ORIGENS[v] || v;
  if (k === 'grupo') return GRUPOS[v] || v;
  if (k === 'comprovante_path') return 'arquivo anexado';
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  return esc(String(v));
}

export function descreverAuditoria(a) {
  const acao = { insert: 'criou', update: 'alterou', delete: 'excluiu' }[a.acao] || a.acao;
  let difs = '';
  if (a.acao === 'update') {
    difs = Object.keys(a.depois || {}).filter((k) => !IGNORAR.includes(k))
      .map((k) => `<li><span>${ROTULOS[k] || k}</span> ${fmtCampo(k, a.antes?.[k])} → <strong>${fmtCampo(k, a.depois[k])}</strong></li>`).join('');
  } else {
    const obj = a.depois || a.antes || {};
    const resumoTxt = ['descricao', 'nome', 'titulo'].map((k) => obj[k]).find(Boolean);
    const val = obj.valor ?? obj.limite ?? obj.valor_alvo;
    difs = `<li>${esc(resumoTxt || '')}${val !== undefined && val !== null ? ` · ${brl(centavos(val))}` : ''}</li>`;
  }
  return { acao, difs };
}

export async function historico(tabela, id, titulo) {
  const { dlg } = modal({ titulo: `Histórico: ${esc(titulo || '')}`, corpo: '<p class="loading"><span class="spinner"></span> Carregando…</p>', largura: 'md', rodape: '<button type="button" class="btn btn-accent" data-fechar>Fechar</button>' });
  try {
    const itens = await api.listar('auditoria', { tabela: `eq.${tabela}`, registro_id: `eq.${id}`, order: 'em.desc' });
    dlg.querySelector('.dlg-body').innerHTML = itens.length ? `<ol class="audit">${itens.map((a) => {
      const { acao, difs } = descreverAuditoria(a);
      return `<li><p><strong>${esc(a.usuario_nome || 'Sistema')}</strong> ${acao} · <time>${dataHora(a.em)}</time></p><ul>${difs}</ul></li>`;
    }).join('')}</ol>` : '<p class="muted">Nenhuma alteração registrada.</p>';
  } catch (e) { dlg.querySelector('.dlg-body').innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
}
