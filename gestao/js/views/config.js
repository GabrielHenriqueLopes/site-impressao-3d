/* Configurações: negócio, contas, categorias, recorrências, usuários, histórico, backup. */
import * as api from '../api.js';
import { S, pode, podeGerir, criar, alterar, remover, novoId, salvarEmpresa, carregarTudo, gerarRecorrencias } from '../store.js';
import * as F from '../finance.js';
import { brl, centavos, esc, dataBR, dataHora, hoje, GRUPOS, GRUPOS_RECEITA, GRUPOS_DESPESA, PAPEIS, FORMAS, valorInput } from '../format.js';
import { icon, modal, campo, ligarDinheiro, dinheiro, erroCampo, limparErros, ocupado, toast, erro, confirmar, vazio, baixarArquivo, $ } from '../ui.js';
import { trocarParams } from '../nav.js';
import { custoKgFilamento } from '../pedidos-calc.js';
import { historico, descreverAuditoria } from './lancamento-form.js';

let el; let aba = 'negocio'; let tipoCat = 'despesa'; let filtroAud = '';
const ABAS = [['negocio', 'Negócio'], ['producao', 'Produção'], ['contas', 'Contas'], ['categorias', 'Categorias'], ['recorrencias', 'Recorrências'], ['usuarios', 'Usuários'], ['historico', 'Histórico'], ['backup', 'Backup'], ['conta', 'Minha senha']];

export function render(root, params) { el = root; aba = ABAS.some(([k]) => k === params.aba) ? params.aba : 'negocio'; desenhar(); }
export const atualizar = () => { if (aba !== 'historico' && !el.querySelector('[data-sujo="1"]')) desenhar(); };

function desenhar() {
  el.innerHTML = `<div class="tabs tabs-scroll" role="tablist">${ABAS.map(([k, t]) => `<button type="button" role="tab" aria-selected="${aba === k}" data-aba="${k}">${t}</button>`).join('')}</div><div class="tab-body" data-body></div>`;
  el.querySelectorAll('[data-aba]').forEach((b) => b.addEventListener('click', () => { aba = b.dataset.aba; trocarParams({ aba }); desenhar(); }));
  const body = el.querySelector('[data-body]');
  ({ negocio, producao, contas, categorias, recorrencias, usuarios, historico: auditoria, backup, conta: minhaConta })[aba](body);
}

const soLeitura = (quem = 'administradores e gerentes') => `<p class="note">${icon('lock')} Somente ${quem} podem alterar esta área.</p>`;

/* ---------------- Negócio ---------------- */
function negocio(b) {
  const e = S.empresa; const ed = pode('admin');
  b.innerHTML = `<section class="card narrow">
    <div class="card-head"><h2>Dados do negócio</h2></div>
    ${ed ? '' : soLeitura('administradores')}
    <form class="form" data-emp novalidate>
      ${campo({ nome: 'nome', rotulo: 'Nome do negócio', valor: e.nome, obrig: true, attrs: `maxlength="60" ${ed ? '' : 'disabled'}` })}
      <div class="grid-2">
        ${campo({ nome: 'alerta_orcamento_pct', rotulo: 'Avisar quando o orçamento chegar a (%)', tipo: 'number', valor: e.alerta_orcamento_pct, attrs: `min="50" max="100" ${ed ? '' : 'disabled'}` })}
        ${campo({ nome: 'alerta_vencimento_dias', rotulo: 'Avisar vencimentos com antecedência de (dias)', tipo: 'number', valor: e.alerta_vencimento_dias, attrs: `min="1" max="60" ${ed ? '' : 'disabled'}` })}
      </div>
      ${ed ? '<div class="form-actions"><button type="submit" class="btn btn-accent">Salvar</button></div>' : ''}
    </form></section>
    <section class="card narrow"><div class="card-head"><h2>Como os números são calculados</h2></div>
      <ul class="explica">
        <li><strong>Faturamento</strong>: vendas + frete cobrado, pela data da venda — recebidas ou não. Cancelados não contam.</li>
        <li><strong>Recebido / pago</strong>: só o que tem data de pagamento (dinheiro que de fato entrou ou saiu).</li>
        <li><strong>Lucro estimado</strong>: faturamento + outras receitas − custos de produção − despesas operacionais − impostos.</li>
        <li><strong>Fora do lucro</strong>: compra de equipamentos (investimento), retiradas do dono e aportes do dono. Eles mudam o caixa, não o lucro.</li>
        <li><strong>Saldo de caixa</strong>: saldo inicial de cada conta + tudo recebido − tudo pago a partir da data do saldo inicial.</li>
      </ul></section>`;
  const f = b.querySelector('[data-emp]');
  f.addEventListener('submit', (ev) => {
    ev.preventDefault();
    ocupado(f.querySelector('[type=submit]'), async () => {
      limparErros(f);
      const d = { nome: f.nome.value.trim(), alerta_orcamento_pct: Number(f.alerta_orcamento_pct.value), alerta_vencimento_dias: Number(f.alerta_vencimento_dias.value) };
      if (!d.nome) return erroCampo(f, 'nome', 'Informe o nome.');
      if (!(d.alerta_orcamento_pct >= 50 && d.alerta_orcamento_pct <= 100)) return erroCampo(f, 'alerta_orcamento_pct', 'Use um valor entre 50 e 100.');
      if (!(d.alerta_vencimento_dias >= 1 && d.alerta_vencimento_dias <= 60)) return erroCampo(f, 'alerta_vencimento_dias', 'Use um valor entre 1 e 60.');
      try { await salvarEmpresa(d); toast('Dados salvos.'); } catch (e) { erro(e); }
    });
  });
}

/* ---------------- Produção: lembretes, energia e filamentos ---------------- */
const decBR = (v) => (v === null || v === undefined ? '' : String(v).replace('.', ','));
const numBR = (s) => { const t = String(s ?? '').trim().replace(',', '.'); if (!t) return null; const n = Number(t); return Number.isFinite(n) ? n : NaN; };
function producao(b) {
  if (!S.moduloPedidos) { b.innerHTML = '<p class="note">Rode de novo o <code>schema.sql</code> no Supabase para ativar pedidos e produção.</p>'; return; }
  const e = S.empresa; const ed = pode('admin');
  const fils = S.filamentos.slice().sort((a, x) => Number(x.ativo) - Number(a.ativo) || a.tipo.localeCompare(x.tipo));
  b.innerHTML = `<section class="card narrow">
    <div class="card-head"><h2>Prazos e lembretes</h2></div>
    ${ed ? '' : soLeitura('administradores')}
    <form class="form" data-prod novalidate>
      <div class="grid-2">
        ${campo({ nome: 'lembrete_horas', rotulo: 'Avisar com antecedência de', valor: e.lembrete_horas ?? 24, opcoes: [[12, '12 horas'], [24, '24 horas (1 dia)'], [48, '48 horas (2 dias)'], [72, '3 dias'], [120, '5 dias'], [168, '7 dias']].map(([v, t]) => ({ valor: v, rotulo: t })), attrs: ed ? '' : 'disabled', ajuda: 'Vale para "prazo chegando" e "hora de começar".' })}
        ${campo({ nome: 'folga_dias', rotulo: 'Folga para acabamento e envio (dias)', tipo: 'number', valor: e.folga_dias ?? 1, attrs: `min="0" max="30" ${ed ? '' : 'disabled'}`, ajuda: 'O app sugere começar a imprimir até: prazo − tempo de impressão − folga.' })}
      </div>
      <h3 class="h-sm">Energia (opcional, para calcular o custo sozinho)</h3>
      <div class="grid-2">
        ${campo({ nome: 'impressora_watts', rotulo: 'Potência média da impressora (W)', tipo: 'text', valor: decBR(e.impressora_watts), attrs: `inputmode="decimal" placeholder="Ex.: 150" ${ed ? '' : 'disabled'}`, ajuda: 'Veja na etiqueta ou no manual. Impressoras FDM pequenas costumam usar entre 100 e 300 W.' })}
        ${campo({ nome: 'tarifa_kwh', rotulo: 'Tarifa da energia (R$ por kWh)', tipo: 'text', valor: decBR(e.tarifa_kwh), attrs: `inputmode="decimal" placeholder="Ex.: 0,95" ${ed ? '' : 'disabled'}`, ajuda: 'Está na conta de luz (valor total ÷ kWh consumidos).' })}
      </div>
      ${ed ? '<div class="form-actions"><button type="submit" class="btn btn-accent">Salvar</button></div>' : ''}
    </form></section>
  <section class="card">
    <div class="card-head"><h2>Filamentos</h2>${podeGerir() ? `<button type="button" class="btn btn-sm btn-accent" data-novo-fil>${icon('plus')} Novo filamento</button>` : ''}</div>
    <p class="muted small">Cadastre os rolos que vocês usam com o preço pago. No pedido, basta escolher o filamento e o custo por grama é calculado: <strong>preço do rolo ÷ peso do rolo</strong>.</p>
    ${fils.length ? `<div class="table-wrap"><table class="tbl tbl-cards"><thead><tr><th>Filamento</th><th class="num">Rolo</th><th class="num">Preço do rolo</th><th class="num">Por kg</th><th class="num">Por grama</th><th></th></tr></thead><tbody>
      ${fils.map((f) => { const kg = custoKgFilamento(f); return `<tr class="${f.ativo ? '' : 'row-off'}"><td data-th="Filamento" class="td-main"><strong>${esc(f.tipo)}${f.cor ? ` ${esc(f.cor)}` : ''}</strong><small>${esc(f.marca || '')}${f.ativo ? '' : ' · inativo'}</small></td>
        <td data-th="Rolo" class="num">${Number(f.peso_rolo_g).toLocaleString('pt-BR')} g</td><td data-th="Preço do rolo" class="num">${brl(centavos(f.preco_rolo))}</td>
        <td data-th="Por kg" class="num strong">${brl(kg)}</td><td data-th="Por grama" class="num">R$ ${(kg / 100000).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td>
        <td class="actions">${podeGerir() ? `<button type="button" class="btn btn-sm btn-ghost" data-ed-fil="${f.id}">${icon('edit')}<span>Editar</span></button>` : ''}</td></tr>`; }).join('')}
    </tbody></table></div>` : vazio({ icone: 'printer', titulo: 'Nenhum filamento cadastrado', texto: 'Ex.: PLA preto, rolo de 1 kg, R$ 99,90.' })}
  </section>`;
  const f = b.querySelector('[data-prod]');
  f.addEventListener('submit', (ev) => {
    ev.preventDefault();
    ocupado(f.querySelector('[type=submit]'), async () => {
      limparErros(f);
      const d = { lembrete_horas: Number(f.lembrete_horas.value), folga_dias: Number(f.folga_dias.value), impressora_watts: numBR(f.impressora_watts.value), tarifa_kwh: numBR(f.tarifa_kwh.value) };
      if (!(d.folga_dias >= 0 && d.folga_dias <= 30)) return erroCampo(f, 'folga_dias', 'Use de 0 a 30 dias.');
      if (Number.isNaN(d.impressora_watts) || (d.impressora_watts !== null && !(d.impressora_watts >= 1 && d.impressora_watts <= 5000))) return erroCampo(f, 'impressora_watts', 'Use um valor entre 1 e 5000 W.');
      if (Number.isNaN(d.tarifa_kwh) || (d.tarifa_kwh !== null && !(d.tarifa_kwh >= 0.01 && d.tarifa_kwh <= 10))) return erroCampo(f, 'tarifa_kwh', 'Use um valor como 0,95.');
      try { await salvarEmpresa(d); toast('Ajustes de produção salvos.'); } catch (ex) { erro(ex); }
    });
  });
  b.querySelector('[data-novo-fil]')?.addEventListener('click', () => formFilamento());
  b.querySelectorAll('[data-ed-fil]').forEach((x) => x.addEventListener('click', () => formFilamento(S.filamentos.find((y) => y.id === x.dataset.edFil))));
}

function formFilamento(fil = null) {
  modal({
    titulo: fil ? 'Editar filamento' : 'Novo filamento', largura: 'sm',
    corpo: `<form class="form" data-f novalidate>
      <div class="grid-2">
        ${campo({ nome: 'tipo', rotulo: 'Tipo', valor: fil?.tipo || '', obrig: true, attrs: 'maxlength="20" list="tipos-fil" placeholder="PLA"' })}
        ${campo({ nome: 'cor', rotulo: 'Cor', valor: fil?.cor || '', attrs: 'maxlength="40" placeholder="Preto"' })}
        ${campo({ nome: 'marca', rotulo: 'Marca (opcional)', valor: fil?.marca || '', attrs: 'maxlength="40"', cls: 'span-2' })}
        ${campo({ nome: 'preco_rolo', rotulo: 'Preço do rolo', tipo: 'dinheiro', valor: fil ? centavos(fil.preco_rolo) : '', obrig: true })}
        ${campo({ nome: 'peso_rolo_g', rotulo: 'Peso do rolo (g)', tipo: 'number', valor: fil?.peso_rolo_g ?? 1000, obrig: true, attrs: 'min="1" max="100000" step="1"' })}
      </div>
      <p class="muted small" data-custo></p>
      ${fil ? `<label class="check"><input type="checkbox" name="ativo" ${fil.ativo ? 'checked' : ''}> <span>Ativo (aparece nos pedidos)</span></label>` : ''}
      <datalist id="tipos-fil">${['PLA', 'PLA+', 'PETG', 'ABS', 'ASA', 'TPU', 'Resina'].map((t) => `<option value="${t}">`).join('')}</datalist>
    </form>`,
    rodape: `${fil ? `<button type="button" class="btn btn-ghost perigo mr-auto" data-del>${icon('trash')} Excluir</button>` : ''}<button type="button" class="btn btn-ghost" data-fechar>Cancelar</button><button type="button" class="btn btn-accent" data-ok>Salvar</button>`,
    aoAbrir: (dlg, fechar) => {
      const f = $('[data-f]', dlg); ligarDinheiro(f);
      const mostrar = () => { const kg = custoKgFilamento({ preco_rolo: dinheiro(f, 'preco_rolo') / 100, peso_rolo_g: Number(f.peso_rolo_g.value) }); $('[data-custo]', dlg).textContent = kg ? `= ${brl(kg)} por kg · R$ ${(kg / 100000).toLocaleString('pt-BR', { minimumFractionDigits: 3 })} por grama` : ''; };
      f.addEventListener('input', mostrar); mostrar();
      $('[data-del]', dlg)?.addEventListener('click', async () => {
        const usos = S.pedidos.filter((p) => p.filamento_id === fil.id).length;
        if (!(await confirmar({ titulo: 'Excluir filamento?', texto: usos ? `Ele aparece em ${usos} pedido(s). Os pedidos mantêm o tipo, a cor e o preço já registrados. Para só esconder da lista, prefira desativar.` : 'O filamento será removido do catálogo.', botao: 'Excluir', perigo: true }))) return;
        try { await remover('filamentos', fil.id); toast('Filamento excluído.'); fechar(''); } catch (ex) { erro(ex); }
      });
      $('[data-ok]', dlg).addEventListener('click', (ev) => ocupado(ev.currentTarget, async () => {
        limparErros(f);
        const preco = dinheiro(f, 'preco_rolo');
        const d = { tipo: f.tipo.value.trim().toUpperCase().replace('RESINA', 'Resina'), cor: f.cor.value.trim(), marca: f.marca.value.trim() || null, preco_rolo: preco / 100, peso_rolo_g: Number(f.peso_rolo_g.value) };
        if (!d.tipo) return erroCampo(f, 'tipo', 'Informe o tipo (ex.: PLA).');
        if (!Number.isFinite(preco) || preco <= 0) return erroCampo(f, 'preco_rolo', 'Informe o preço pago no rolo.');
        if (!(d.peso_rolo_g > 0 && d.peso_rolo_g <= 100000)) return erroCampo(f, 'peso_rolo_g', 'Informe o peso em gramas (1 kg = 1000).');
        if (fil) d.ativo = f.ativo.checked;
        try { if (fil) await alterar('filamentos', fil.id, d); else await criar('filamentos', { id: novoId(), ...d }); toast('Filamento salvo.'); fechar('ok'); } catch (ex) { erro(ex); }
      }));
    },
  });
}

/* ---------------- Contas financeiras ---------------- */
function contas(b) {
  const sal = F.saldos(S.lancamentos, S.contas, hoje());
  b.innerHTML = `<section class="card">
    <div class="card-head"><h2>Contas financeiras</h2>${podeGerir() ? `<button type="button" class="btn btn-sm btn-accent" data-nova>${icon('plus')} Nova conta</button>` : ''}</div>
    <p class="muted small">Onde o dinheiro fica: a conta do banco que recebe o Pix, o dinheiro em espécie, uma conta de reserva… O <strong>saldo inicial</strong> é quanto havia na conta na data informada; a partir dela, o app soma o que entra e subtrai o que sai.</p>
    ${S.contas.length ? `<div class="table-wrap"><table class="tbl tbl-cards"><thead><tr><th>Conta</th><th class="num">Saldo inicial</th><th>Desde</th><th class="num">Saldo hoje</th><th></th></tr></thead><tbody>
      ${sal.porConta.map((x) => `<tr class="${x.conta.ativo ? '' : 'row-off'}"><td data-th="Conta" class="td-main"><strong>${esc(x.conta.nome)}</strong>${x.conta.ativo ? '' : '<small>inativa</small>'}</td>
        <td data-th="Saldo inicial" class="num">${brl(centavos(x.conta.saldo_inicial))}</td><td data-th="Desde">${dataBR(x.conta.data_saldo_inicial)}</td>
        <td data-th="Saldo hoje" class="num strong ${x.saldo < 0 ? 'neg' : ''}">${brl(x.saldo)}</td>
        <td class="actions">${podeGerir() ? `<button type="button" class="btn btn-sm btn-ghost" data-ed="${x.conta.id}">${icon('edit')}<span>Editar</span></button>` : ''}</td></tr>`).join('')}
      <tr class="total"><td><strong>Total</strong></td><td></td><td></td><td class="num strong">${brl(sal.total)}</td><td></td></tr></tbody></table></div>`
      : vazio({ icone: 'wallet', titulo: 'Nenhuma conta', texto: 'Cadastre pelo menos a conta que recebe o Pix.' })}
    ${S.lancamentos.some((l) => F.estaPago(l) && S.contas.some((c) => c.id === l.conta_id && l.data_pagamento < c.data_saldo_inicial)) ? `<p class="note note-alerta">${icon('alert')} Há pagamentos com data anterior à data do saldo inicial da conta. Eles não entram no saldo (considera-se que já estão incluídos no saldo inicial). Ajuste a data do saldo inicial se não for o caso.</p>` : ''}
  </section>`;
  b.querySelector('[data-nova]')?.addEventListener('click', () => formConta());
  b.querySelectorAll('[data-ed]').forEach((x) => x.addEventListener('click', () => formConta(S.contas.find((c) => c.id === x.dataset.ed))));
}

function formConta(c = null) {
  modal({
    titulo: c ? 'Editar conta' : 'Nova conta', largura: 'sm',
    corpo: `<form class="form" data-f novalidate>
      ${campo({ nome: 'nome', rotulo: 'Nome', valor: c?.nome || '', obrig: true, attrs: 'maxlength="60" placeholder="Ex.: Nubank (Pix)"' })}
      ${campo({ nome: 'saldo_inicial', rotulo: 'Saldo inicial', tipo: 'dinheiro', valor: c ? centavos(c.saldo_inicial) : 0, ajuda: 'Pode ser negativo se a conta estiver no vermelho (use o sinal de menos, ex.: -150,00).', attrs: '' })}
      ${campo({ nome: 'data_saldo_inicial', rotulo: 'Data desse saldo', tipo: 'date', valor: c?.data_saldo_inicial || hoje(), obrig: true })}
      ${c ? `<label class="check"><input type="checkbox" name="ativo" ${c.ativo ? 'checked' : ''}> <span>Conta ativa</span></label>` : ''}
    </form>`,
    rodape: `${c ? `<button type="button" class="btn btn-ghost perigo mr-auto" data-del>${icon('trash')} Excluir</button><button type="button" class="btn btn-ghost" data-hist>${icon('history')}</button>` : ''}<button type="button" class="btn btn-ghost" data-fechar>Cancelar</button><button type="button" class="btn btn-accent" data-ok>Salvar</button>`,
    aoAbrir: (dlg, fechar) => {
      const f = $('[data-f]', dlg); ligarDinheiro(f);
      $('[data-hist]', dlg)?.addEventListener('click', () => historico('contas', c.id, c.nome));
      $('[data-del]', dlg)?.addEventListener('click', async () => {
        if (S.lancamentos.some((l) => l.conta_id === c.id)) { toast('Esta conta tem lançamentos. Desative-a em vez de excluir.', 'aviso'); return; }
        if (!(await confirmar({ titulo: 'Excluir conta?', texto: `"${esc(c.nome)}" será removida.`, botao: 'Excluir', perigo: true }))) return;
        try { await remover('contas', c.id); toast('Conta excluída.'); fechar(''); } catch (e) { erro(e); }
      });
      $('[data-ok]', dlg).addEventListener('click', (e) => ocupado(e.currentTarget, async () => {
        limparErros(f);
        const v = dinheiro(f, 'saldo_inicial');
        const d = { nome: f.nome.value.trim(), saldo_inicial: Number.isFinite(v) ? v / 100 : NaN, data_saldo_inicial: f.data_saldo_inicial.value };
        if (!d.nome) return erroCampo(f, 'nome', 'Informe o nome.');
        if (!Number.isFinite(d.saldo_inicial)) return erroCampo(f, 'saldo_inicial', 'Valor inválido (ex.: 1.250,00).');
        if (!d.data_saldo_inicial) return erroCampo(f, 'data_saldo_inicial', 'Informe a data.');
        if (c) d.ativo = f.ativo.checked;
        try { if (c) await alterar('contas', c.id, d); else await criar('contas', { id: novoId(), ...d }); toast('Conta salva.'); fechar('ok'); } catch (ex) { erro(ex); }
      }));
    },
  });
}

/* ---------------- Categorias ---------------- */
function categorias(b) {
  const lista = S.categorias.filter((c) => c.tipo === tipoCat);
  const grupos = tipoCat === 'receita' ? GRUPOS_RECEITA : GRUPOS_DESPESA;
  b.innerHTML = `<section class="card">
    <div class="card-head"><div class="seg-tabs" role="tablist">${[['despesa', 'Despesas'], ['receita', 'Receitas']].map(([k, t]) => `<button type="button" role="tab" aria-selected="${tipoCat === k}" data-tc="${k}">${t}</button>`).join('')}</div>
      ${podeGerir() ? `<button type="button" class="btn btn-sm btn-accent" data-nova>${icon('plus')} Nova categoria</button>` : ''}</div>
    <p class="muted small">O <strong>grupo</strong> define como a categoria entra nos relatórios. Ex.: "Equipamentos" é investimento e não reduz o lucro; "Retirada do dono" também não.</p>
    ${grupos.map((g) => {
      const itens = lista.filter((c) => c.grupo === g);
      return itens.length ? `<h3 class="h-sm">${esc(GRUPOS[g])}</h3><ul class="cat-list">${itens.map((c) => `<li class="${c.ativo ? '' : 'off'}">
        <span class="cat"><i class="swatch" style="--k:${c.cor}"></i>${esc(c.nome)}</span>${c.ativo ? '' : '<span class="tag tag-apagado">inativa</span>'}
        <span class="muted small">${S.lancamentos.filter((l) => l.categoria_id === c.id).length} lançamento(s)</span>
        ${podeGerir() ? `<button type="button" class="btn btn-sm btn-ghost" data-ed="${c.id}">${icon('edit')}<span class="sr-only">Editar ${esc(c.nome)}</span></button>` : ''}</li>`).join('')}</ul>` : '';
    }).join('')}
  </section>`;
  b.querySelectorAll('[data-tc]').forEach((x) => x.addEventListener('click', () => { tipoCat = x.dataset.tc; categorias(b); }));
  b.querySelector('[data-nova]')?.addEventListener('click', () => formCategoria());
  b.querySelectorAll('[data-ed]').forEach((x) => x.addEventListener('click', () => formCategoria(S.cats[x.dataset.ed])));
}

function formCategoria(c = null) {
  const tipo = c?.tipo || tipoCat;
  const grupos = (tipo === 'receita' ? GRUPOS_RECEITA : GRUPOS_DESPESA).map((g) => ({ valor: g, rotulo: GRUPOS[g] }));
  const usos = c ? S.lancamentos.filter((l) => l.categoria_id === c.id).length : 0;
  modal({
    titulo: c ? 'Editar categoria' : `Nova categoria de ${tipo}`, largura: 'sm',
    corpo: `<form class="form" data-f novalidate>
      ${campo({ nome: 'nome', rotulo: 'Nome', valor: c?.nome || '', obrig: true, attrs: 'maxlength="60"' })}
      ${campo({ nome: 'grupo', rotulo: 'Grupo nos relatórios', valor: c?.grupo || grupos[0].valor, opcoes: grupos, ajuda: usos ? `Mudar o grupo altera os relatórios dos ${usos} lançamento(s) desta categoria, inclusive os antigos.` : '' })}
      ${campo({ nome: 'cor', rotulo: 'Cor', tipo: 'color', valor: c?.cor || '#8c867c' })}
      ${c ? `<label class="check"><input type="checkbox" name="ativo" ${c.ativo ? 'checked' : ''}> <span>Ativa (aparece nos formulários)</span></label>` : ''}
    </form>`,
    rodape: `${c ? `<button type="button" class="btn btn-ghost perigo mr-auto" data-del>${icon('trash')} Excluir</button>` : ''}<button type="button" class="btn btn-ghost" data-fechar>Cancelar</button><button type="button" class="btn btn-accent" data-ok>Salvar</button>`,
    aoAbrir: (dlg, fechar) => {
      const f = $('[data-f]', dlg);
      $('[data-del]', dlg)?.addEventListener('click', async () => {
        if (usos) { toast(`Categoria usada em ${usos} lançamento(s). Desative-a para que não apareça mais nos formulários.`, 'aviso'); return; }
        if (!(await confirmar({ titulo: 'Excluir categoria?', texto: `"${esc(c.nome)}" será removida.`, botao: 'Excluir', perigo: true }))) return;
        try { await remover('categorias', c.id); toast('Categoria excluída.'); fechar(''); } catch (e) { erro(e); }
      });
      $('[data-ok]', dlg).addEventListener('click', (e) => ocupado(e.currentTarget, async () => {
        limparErros(f);
        const d = { nome: f.nome.value.trim(), grupo: f.grupo.value, cor: f.cor.value };
        if (!d.nome) return erroCampo(f, 'nome', 'Informe o nome.');
        if (S.categorias.some((x) => x.tipo === tipo && x.id !== c?.id && x.nome.trim().toLowerCase() === d.nome.toLowerCase())) return erroCampo(f, 'nome', 'Já existe uma categoria com esse nome.');
        if (c) d.ativo = f.ativo.checked;
        try {
          if (c) await alterar('categorias', c.id, d);
          else await criar('categorias', { id: novoId(), tipo, ordem: S.categorias.filter((x) => x.tipo === tipo).length + 1, ...d });
          toast('Categoria salva.'); fechar('ok');
        } catch (ex) { erro(ex); }
      }));
    },
  });
}

/* ---------------- Recorrências ---------------- */
function recorrencias(b) {
  const rs = S.recorrencias.slice().sort((a, x) => Number(x.ativo) - Number(a.ativo) || a.dia_vencimento - x.dia_vencimento);
  const totalMes = rs.filter((r) => r.ativo && r.tipo === 'despesa' && (!r.fim || r.fim >= hoje())).reduce((t, r) => t + centavos(r.valor), 0);
  b.innerHTML = `<section class="card">
    <div class="card-head"><h2>Lançamentos que se repetem todo mês</h2>${podeGerir() ? `<button type="button" class="btn btn-sm btn-accent" data-nova>${icon('plus')} Nova recorrência</button>` : ''}</div>
    <p class="muted small">Energia, internet, DAS do MEI, assinaturas de modelos 3D… Cada mês o app cria a conta "A pagar" automaticamente (até o fim do mês seguinte), sem duplicar.</p>
    ${rs.length ? `<p class="totals-line">Despesas fixas mensais ativas: <strong>${brl(totalMes)}</strong></p><div class="table-wrap"><table class="tbl tbl-cards"><thead><tr><th>Descrição</th><th>Categoria</th><th>Dia</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead><tbody>
      ${rs.map((r) => `<tr class="${r.ativo ? '' : 'row-off'}"><td data-th="Descrição" class="td-main"><strong>${esc(r.descricao)}</strong><small>${r.tipo === 'receita' ? 'Receita' : 'Despesa'} · desde ${dataBR(r.inicio)}${r.fim ? ` até ${dataBR(r.fim)}` : ''}</small></td>
        <td data-th="Categoria">${esc(S.cats[r.categoria_id]?.nome || '')}</td><td data-th="Dia">dia ${r.dia_vencimento}</td>
        <td data-th="Valor" class="num ${r.tipo === 'receita' ? 'pos' : 'neg'}">${brl(centavos(r.valor))}</td>
        <td data-th="Situação">${r.ativo ? '<span class="tag tag-ok">Ativa</span>' : '<span class="tag tag-apagado">Pausada</span>'}</td>
        <td class="actions">${podeGerir() ? `<button type="button" class="btn btn-sm btn-ghost" data-ed="${r.id}">${icon('edit')}<span>Editar</span></button>` : ''}</td></tr>`).join('')}
    </tbody></table></div>` : vazio({ icone: 'repeat', titulo: 'Nenhuma recorrência', texto: 'Cadastre as despesas fixas para que apareçam sozinhas em "A pagar" e entrem na previsão de caixa.' })}
  </section>`;
  b.querySelector('[data-nova]')?.addEventListener('click', () => formRecorrencia());
  b.querySelectorAll('[data-ed]').forEach((x) => x.addEventListener('click', () => formRecorrencia(S.recorrencias.find((r) => r.id === x.dataset.ed))));
}

function formRecorrencia(r = null) {
  const v = r || { tipo: 'despesa', dia_vencimento: 10, inicio: hoje(), natureza: 'fixa', forma_pagamento: 'pix', ativo: true };
  const catOpts = (tipo) => [{ valor: '', rotulo: 'Escolha…' }].concat(S.categorias.filter((c) => c.tipo === tipo && (c.ativo || c.id === v.categoria_id)).map((c) => ({ valor: c.id, rotulo: c.nome })));
  modal({
    titulo: r ? 'Editar recorrência' : 'Nova recorrência mensal', largura: 'md',
    corpo: `<form class="form" data-f novalidate>
      ${r ? '' : campo({ nome: 'tipo', rotulo: 'Tipo', valor: v.tipo, opcoes: [{ valor: 'despesa', rotulo: 'Despesa' }, { valor: 'receita', rotulo: 'Receita' }] })}
      <div class="grid-2">
        ${campo({ nome: 'descricao', rotulo: 'Descrição', valor: v.descricao || '', obrig: true, attrs: 'maxlength="120" placeholder="Ex.: Internet"', cls: 'span-2' })}
        ${campo({ nome: 'valor', rotulo: 'Valor mensal', tipo: 'dinheiro', valor: v.valor ? centavos(v.valor) : '', obrig: true, ajuda: 'Se varia (ex.: energia), use uma média e ajuste o valor de cada mês ao pagar.' })}
        <div data-catw>${campo({ nome: 'categoria_id', rotulo: 'Categoria', valor: v.categoria_id || '', obrig: true, opcoes: catOpts(v.tipo) })}</div>
        ${campo({ nome: 'dia_vencimento', rotulo: 'Dia do vencimento', tipo: 'number', valor: v.dia_vencimento, obrig: true, attrs: 'min="1" max="31"', ajuda: 'Em meses mais curtos, usa o último dia.' })}
        ${campo({ nome: 'conta_id', rotulo: 'Conta usada', valor: v.conta_id || '', opcoes: [{ valor: '', rotulo: '—' }].concat(S.contas.filter((c) => c.ativo).map((c) => ({ valor: c.id, rotulo: c.nome }))) })}
        ${campo({ nome: 'inicio', rotulo: 'A partir de', tipo: 'date', valor: v.inicio, obrig: true })}
        ${campo({ nome: 'fim', rotulo: 'Até (opcional)', tipo: 'date', valor: v.fim || '' })}
        ${campo({ nome: 'forma_pagamento', rotulo: 'Forma de pagamento', valor: v.forma_pagamento || '', opcoes: [{ valor: '', rotulo: '—' }].concat(Object.entries(FORMAS).map(([k, t]) => ({ valor: k, rotulo: t }))) })}
      </div>
      ${r ? `<label class="check"><input type="checkbox" name="ativo" ${v.ativo ? 'checked' : ''}> <span>Ativa (gera os próximos meses)</span></label>
        <label class="check"><input type="checkbox" name="aplicar" checked> <span>Aplicar valor e descrição também às contas pendentes já geradas</span></label>` : ''}
    </form>`,
    rodape: `${r ? `<button type="button" class="btn btn-ghost perigo mr-auto" data-del>${icon('trash')} Excluir</button>` : ''}<button type="button" class="btn btn-ghost" data-fechar>Cancelar</button><button type="button" class="btn btn-accent" data-ok>Salvar</button>`,
    aoAbrir: (dlg, fechar) => {
      const f = $('[data-f]', dlg); ligarDinheiro(f);
      f.tipo?.addEventListener('change', () => { $('[data-catw]', dlg).innerHTML = campo({ nome: 'categoria_id', rotulo: 'Categoria', obrig: true, opcoes: catOpts(f.tipo.value) }); });
      $('[data-del]', dlg)?.addEventListener('click', async () => {
        const pend = S.lancamentos.filter((l) => l.recorrencia_id === r.id && F.pendente(l));
        if (!(await confirmar({ titulo: 'Excluir recorrência?', texto: `Os próximos meses deixam de ser gerados.${pend.length ? ` As ${pend.length} conta(s) pendente(s) já gerada(s) também serão excluídas; as pagas ficam no histórico.` : ''}`, botao: 'Excluir', perigo: true }))) return;
        try {
          for (const l of pend) await remover('lancamentos', l.id);
          await remover('recorrencias', r.id);
          toast('Recorrência excluída.'); fechar('');
        } catch (e) { erro(e); }
      });
      $('[data-ok]', dlg).addEventListener('click', (e) => ocupado(e.currentTarget, async () => {
        limparErros(f);
        const tipo = r ? r.tipo : f.tipo.value;
        const val = dinheiro(f, 'valor');
        const d = { descricao: f.descricao.value.trim(), valor: val / 100, categoria_id: f.categoria_id.value, dia_vencimento: Number(f.dia_vencimento.value),
          conta_id: f.conta_id.value || null, inicio: f.inicio.value, fim: f.fim.value || null, forma_pagamento: f.forma_pagamento.value || null,
          natureza: tipo === 'despesa' ? 'fixa' : null };
        if (!d.descricao) return erroCampo(f, 'descricao', 'Informe a descrição.');
        if (!Number.isFinite(val) || val <= 0) return erroCampo(f, 'valor', 'Informe um valor maior que zero.');
        if (!d.categoria_id) return erroCampo(f, 'categoria_id', 'Escolha a categoria.');
        if (!(d.dia_vencimento >= 1 && d.dia_vencimento <= 31)) return erroCampo(f, 'dia_vencimento', 'Use um dia entre 1 e 31.');
        if (!d.inicio) return erroCampo(f, 'inicio', 'Informe o início.');
        if (d.fim && d.fim < d.inicio) return erroCampo(f, 'fim', 'O fim precisa ser depois do início.');
        try {
          if (r) {
            d.ativo = f.ativo.checked;
            await alterar('recorrencias', r.id, d);
            if (f.aplicar.checked) {
              for (const l of S.lancamentos.filter((x) => x.recorrencia_id === r.id && F.pendente(x))) {
                await alterar('lancamentos', l.id, { valor: d.valor, descricao: d.descricao, categoria_id: d.categoria_id, conta_id: d.conta_id, forma_pagamento: d.forma_pagamento });
              }
            }
          } else {
            await criar('recorrencias', { id: novoId(), tipo, ativo: true, ...d });
          }
          const n = await gerarRecorrencias();
          toast(`Recorrência salva${n ? ` · ${n} conta(s) gerada(s)` : ''}.`); fechar('ok');
        } catch (ex) { erro(ex); }
      }));
    },
  });
}

/* ---------------- Usuários ---------------- */
function usuarios(b) {
  const admin = pode('admin');
  b.innerHTML = `<section class="card">
    <div class="card-head"><h2>Usuários</h2></div>
    ${admin ? '' : soLeitura('administradores')}
    <div class="table-wrap"><table class="tbl tbl-cards"><thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Acesso</th><th></th></tr></thead><tbody>
      ${S.perfis.map((p) => `<tr data-p="${p.id}"><td data-th="Nome" class="td-main">${admin ? `<input type="text" class="inline-input" data-nome value="${esc(p.nome)}" maxlength="60" aria-label="Nome">` : `<strong>${esc(p.nome)}</strong>`}${p.id === S.perfil.id ? '<small>você</small>' : ''}</td>
        <td data-th="E-mail">${esc(p.email || '')}</td>
        <td data-th="Papel">${admin ? `<select data-papel aria-label="Papel">${Object.entries(PAPEIS).map(([k, t]) => `<option value="${k}"${p.papel === k ? ' selected' : ''}>${t}</option>`).join('')}</select>` : PAPEIS[p.papel]}</td>
        <td data-th="Acesso">${admin ? `<label class="switch"><input type="checkbox" data-ativo ${p.ativo ? 'checked' : ''}><span>${p.ativo ? 'Liberado' : 'Bloqueado'}</span></label>` : (p.ativo ? 'Liberado' : 'Bloqueado')}</td>
        <td class="actions">${admin ? `<button type="button" class="btn btn-sm btn-accent" data-salvar-p>Salvar</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div>
  </section>
  <section class="card narrow"><div class="card-head"><h2>Permissões</h2></div>
    <ul class="explica">
      <li><strong>Administrador</strong>: tudo, inclusive usuários, dados do negócio e restauração de backup.</li>
      <li><strong>Gerente</strong>: tudo, exceto usuários e dados do negócio.</li>
      <li><strong>Funcionário</strong>: vê os números e registra lançamentos; só altera os que ele mesmo criou; não exclui nem muda cadastros, orçamento ou metas.</li>
    </ul>
    <h3 class="h-sm">Como adicionar alguém</h3>
    <ol class="explica"><li>No Supabase: <em>Authentication → Users → Add user → Send invitation</em>, com o e-mail da pessoa.</li>
      <li>Ela recebe o link, cria a senha e entra. O acesso começa <strong>bloqueado</strong>.</li>
      <li>Aqui, escolha o papel, marque <em>Liberado</em> e salve.</li></ol>
  </section>`;
  b.querySelectorAll('[data-salvar-p]').forEach((btn) => btn.addEventListener('click', () => ocupado(btn, async () => {
    const tr = btn.closest('tr'); const id = tr.dataset.p;
    const d = { nome: tr.querySelector('[data-nome]').value.trim(), papel: tr.querySelector('[data-papel]').value, ativo: tr.querySelector('[data-ativo]').checked };
    if (!d.nome) { toast('Informe o nome.', 'erro'); return; }
    if (id === S.perfil.id && (!d.ativo || d.papel !== 'admin') && !(await confirmar({ titulo: 'Alterar o seu próprio acesso?', texto: 'Você pode perder acesso a esta tela.', botao: 'Alterar' }))) return;
    try { await alterar('perfis', id, d); toast('Usuário atualizado.'); if (id === S.perfil.id) location.reload(); } catch (e) { erro(e); }
  })));
  b.querySelectorAll('[data-ativo]').forEach((c) => c.addEventListener('change', () => { c.nextElementSibling.textContent = c.checked ? 'Liberado' : 'Bloqueado'; }));
}

/* ---------------- Histórico (auditoria) ---------------- */
const NOMES_T = { pedidos: 'Pedidos', filamentos: 'Filamentos', lancamentos: 'Lançamentos', categorias: 'Categorias', contas: 'Contas', orcamentos: 'Orçamento', metas: 'Metas', recorrencias: 'Recorrências', perfis: 'Usuários', empresa: 'Negócio' };
async function auditoria(b) {
  if (!podeGerir()) { b.innerHTML = soLeitura(); return; }
  b.innerHTML = `<section class="card"><div class="card-head"><h2>Histórico de alterações</h2>
    <label class="flt"><span>Área</span><select data-t><option value="">Todas</option>${Object.entries(NOMES_T).map(([k, t]) => `<option value="${k}"${filtroAud === k ? ' selected' : ''}>${t}</option>`).join('')}</select></label></div>
    <p class="muted small">Registrado automaticamente pelo banco de dados a cada criação, alteração ou exclusão. Não pode ser editado pelo aplicativo.</p>
    <div data-aud><p class="loading"><span class="spinner"></span> Carregando…</p></div></section>`;
  b.querySelector('[data-t]').addEventListener('change', (e) => { filtroAud = e.target.value; auditoria(b); });
  try {
    const params = { order: 'em.desc', limit: 200 };
    if (filtroAud) params.tabela = `eq.${filtroAud}`;
    const itens = await api.listar('auditoria', params);
    const box = b.querySelector('[data-aud]');
    if (!box) return;
    box.innerHTML = itens.length ? `<ol class="audit">${itens.map((a) => { const { acao, difs } = descreverAuditoria(a); return `<li><p><strong>${esc(a.usuario_nome || 'Sistema')}</strong> ${acao} em <em>${NOMES_T[a.tabela] || a.tabela}</em> · <time>${dataHora(a.em)}</time></p><ul>${difs}</ul></li>`; }).join('')}</ol><p class="muted small">Mostrando as 200 alterações mais recentes.</p>` : '<p class="muted">Nenhuma alteração registrada.</p>';
  } catch (e) { b.querySelector('[data-aud]').innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
}

/* ---------------- Backup ---------------- */
const TABELAS_BKP = ['empresa', 'contas', 'categorias', 'recorrencias', 'filamentos', 'pedidos', 'lancamentos', 'orcamentos', 'metas'];
function backup(b) {
  b.innerHTML = `<section class="card narrow"><div class="card-head"><h2>Cópia de segurança</h2></div>
    <p>O plano gratuito do Supabase não inclui backups automáticos para download. Baixe uma cópia completa com frequência (por exemplo, toda semana) e guarde em um lugar seguro, como o Google Drive.</p>
    <div class="row-gap"><button type="button" class="btn btn-accent" data-json>${icon('download')} Baixar backup completo (.json)</button>
      <button type="button" class="btn btn-ghost" data-csv>${icon('download')} Lançamentos para planilha (.csv)</button></div>
    <p class="muted small">Último backup baixado neste navegador: <span data-ultimo>—</span></p>
  </section>
  <section class="card narrow"><div class="card-head"><h2>Restaurar backup</h2></div>
    ${pode('admin') ? `<p>Envia de volta os dados de um arquivo de backup. Registros com o mesmo identificador são <strong>substituídos</strong> pela versão do arquivo; os demais são mantidos. Usuários e histórico não são restaurados.</p>
    <label class="btn btn-ghost file-btn">${icon('upload')} Escolher arquivo .json<input type="file" accept="application/json,.json" data-restaurar hidden></label>` : soLeitura('administradores')}
  </section>`;
  try { const u = localStorage.getItem('gestao.ultimoBackup'); if (u) b.querySelector('[data-ultimo]').textContent = dataHora(u); } catch { /* sem armazenamento */ }
  b.querySelector('[data-json]').addEventListener('click', (e) => ocupado(e.currentTarget, async () => {
    try {
      const dados = {};
      for (const t of TABELAS_BKP) { if (!S.moduloPedidos && ['filamentos', 'pedidos'].includes(t)) continue; dados[t] = await api.listar(t); }
      const arq = { app: 'gestao-atelie', versao: 1, gerado_em: new Date().toISOString(), dados };
      baixarArquivo(`backup-gestao-${hoje()}.json`, JSON.stringify(arq, null, 1), 'application/json');
      try { localStorage.setItem('gestao.ultimoBackup', new Date().toISOString()); } catch { /* ok */ }
      toast('Backup baixado.');
      backup(b);
    } catch (ex) { erro(ex); }
  }));
  b.querySelector('[data-csv]').addEventListener('click', () => { location.hash = '#/lancamentos?periodo=personalizado&inicio=2000-01-01&fim=2100-12-31'; setTimeout(() => document.querySelector('[data-exportar]')?.click(), 400); });
  b.querySelector('[data-restaurar]')?.addEventListener('change', async (e) => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    let arq;
    try { arq = JSON.parse(await file.text()); } catch { toast('Arquivo inválido: não é um JSON.', 'erro'); return; }
    if (arq?.app !== 'gestao-atelie' || !arq.dados) { toast('Este arquivo não é um backup deste aplicativo.', 'erro'); return; }
    const resumo = TABELAS_BKP.map((t) => `${(arq.dados[t] || []).length} ${t}`).join(', ');
    if (!(await confirmar({ titulo: 'Restaurar backup?', texto: `Backup de <strong>${dataHora(arq.gerado_em)}</strong>: ${esc(resumo)}.<br>Registros iguais serão substituídos. Recomenda-se baixar um backup atual antes.`, botao: 'Restaurar', perigo: true }))) return;
    try {
      toast('Restaurando…', 'aviso');
      for (const t of TABELAS_BKP) {
        const linhas = arq.dados[t] || [];
        if (!linhas.length) continue;
        const limpas = linhas.map((l) => { const x = { ...l }; delete x.criado_por; delete x.atualizado_por; return x; });
        if (t === 'empresa') { const { id, atualizado_em, ...resto } = limpas[0]; await api.atualizar('empresa', { id: 'eq.1' }, resto); continue; }
        for (let i = 0; i < limpas.length; i += 500) await api.salvarVarios(t, limpas.slice(i, i + 500));
      }
      await carregarTudo();
      toast('Backup restaurado.');
    } catch (ex) { erro(ex); }
  });
}

/* ---------------- Minha senha ---------------- */
function minhaConta(b) {
  b.innerHTML = `<section class="card narrow"><div class="card-head"><h2>Alterar minha senha</h2></div>
    <form class="form" data-f novalidate>
      ${campo({ nome: 's1', rotulo: 'Nova senha', tipo: 'password', obrig: true, attrs: 'autocomplete="new-password" minlength="8"', ajuda: 'Mínimo de 8 caracteres, com letras e números.' })}
      ${campo({ nome: 's2', rotulo: 'Repita a nova senha', tipo: 'password', obrig: true, attrs: 'autocomplete="new-password"' })}
      <div class="form-actions"><button type="submit" class="btn btn-accent">Alterar senha</button></div>
    </form></section>`;
  const f = b.querySelector('[data-f]');
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    ocupado(f.querySelector('[type=submit]'), async () => {
      limparErros(f);
      const a = f.s1.value;
      if (a.length < 8 || !/[a-zA-Z]/.test(a) || !/\d/.test(a)) return erroCampo(f, 's1', 'Use pelo menos 8 caracteres, com letras e números.');
      if (a !== f.s2.value) return erroCampo(f, 's2', 'As senhas não são iguais.');
      try { await api.definirSenha(a); f.reset(); toast('Senha alterada.'); } catch (ex) { erro(ex); }
    });
  });
}
