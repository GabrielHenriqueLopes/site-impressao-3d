/* Formulário de receita/despesa, baixa de pagamento e histórico. */
import * as api from '../api.js';
import { S, criar, alterar, remover, podeEditarLanc, podeGerir, novoId, gerarRecorrencias } from '../store.js';
import { modal, confirmar, campo, erroCampo, limparErros, ligarDinheiro, dinheiro, ocupado, toast, erro, icon, $, selo } from '../ui.js';
import { esc, hoje, brl, centavos, dataBR, dataHora, FORMAS, ORIGENS, GRUPOS, inicioMes, somaDias } from '../format.js';
import { possiveisDuplicados, statusEfetivo } from '../finance.js';

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
      const sincronizar = () => {
        const st = form.status.value;
        $('[data-pago-box]', dlg).hidden = st !== 'pago';
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
        sincronizar();
      });
      $('[data-ver-comp]', dlg)?.addEventListener('click', () => verComprovante(v.comprovante_path));
      $('[data-tirar-comp]', dlg)?.addEventListener('click', () => { tirarComp = true; $('[data-comp-atual]', dlg).innerHTML = '<span class="muted">O comprovante será removido ao salvar.</span>'; });
      $('[data-excluir]', dlg)?.addEventListener('click', async () => {
        if (await excluirLancamento(l)) fechar('');
      });
      $('[data-historico]', dlg)?.addEventListener('click', () => historico('lancamentos', l.id, l.descricao));
      const salvar = () => ocupado($('[data-salvar]', dlg), async () => {
        limparErros(form);
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
            salvo = await criar('lancamentos', { id: novoId(), ...d });
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

export async function excluirLancamento(l) {
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
