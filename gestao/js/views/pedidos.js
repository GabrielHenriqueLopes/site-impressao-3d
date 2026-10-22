/* Pedidos: indicadores, fila de produção (quadro), prioridades e histórico. */
import { S, podeEditarPedido } from '../store.js';
import { calcular, situacao, ordenarFila, resumo, STATUS, ATIVOS, PRIORIDADES, isoLocal } from '../pedidos-calc.js';
import { brl, esc, norm, dataBR, dataCurta, hoje, somaDias, pct } from '../format.js';
import { icon, vazio } from '../ui.js';
import { trocarParams } from '../nav.js';
import { abrirPedido, moverPedido, ajustarProntas, fmtGramas, fmtTempo, receitaDoPedido } from './pedido-form.js';

const COLUNAS = ['aguardando', 'producao', 'pronto', 'entregue'];
let el; let aba = 'fila'; let busca = '';
let f = { status: 'ativos', cliente: '', produto: '', recIni: '', recFim: '', przIni: '', przFim: '', so: '' };
let hist = { ini: '', fim: '', status: '' };

export function render(root, params) {
  el = root;
  aba = ['fila', 'lista', 'historico'].includes(params.aba) ? params.aba : 'fila';
  busca = params.q || '';
  if (params.so) f.so = params.so;
  desenhar();
}
export const atualizar = () => desenhar();

const casa = (p) => !busca || norm(`${p.codigo} ${p.produto} ${p.cliente}`).includes(norm(busca));

function prazoTxt(p, s) {
  if (p.status === 'entregue') return `entregue ${p.entregue_em ? dataCurta(isoLocal(new Date(p.entregue_em))) : ''}`;
  if (p.status === 'cancelado') return 'cancelado';
  if (s.atrasado) { const d = -s.diasRestantes; return `atrasado ${d <= 1 ? 'desde ontem' : `há ${d} dias`}`; }
  if (s.diasRestantes === 0) return 'vence hoje';
  if (s.diasRestantes === 1) return 'vence amanhã';
  return `vence em ${s.diasRestantes} dias`;
}

function indicadores() {
  const r = resumo(S.pedidos, S.empresa);
  const lm = r.lucroEntreguesMes;
  return `<section class="kpis kpis-ped" aria-label="Indicadores de pedidos">
    <div class="kpi"><span class="kpi-label">${icon('list')} Pedidos ativos</span><strong class="kpi-value">${r.aguardando + r.producao + r.pronto}</strong>
      <span class="kpi-sub">${r.aguardando} aguardando · ${r.producao} em produção · ${r.pronto} prontos</span></div>
    <a class="kpi ${r.atrasados ? 'kpi-neg' : ''}" href="#/pedidos?aba=lista&so=atrasados"><span class="kpi-label">${icon('alert')} Atrasados</span><strong class="kpi-value">${r.atrasados}</strong>
      <span class="kpi-sub">${r.proximos} com prazo nas próximas ${S.empresa.lembrete_horas || 24} h · ${r.iniciar} precisam começar</span></a>
    <div class="kpi"><span class="kpi-label">${icon('printer')} Filamento a usar</span><strong class="kpi-value">${fmtGramas(r.filamentoPendente)}</strong>
      <span class="kpi-sub">nos pedidos ativos${r.semGramas ? ` · ${r.semGramas} sem gramas informadas` : ''}</span></div>
    <div class="kpi"><span class="kpi-label">${icon('wallet')} Valor dos pedidos ativos</span><strong class="kpi-value">${brl(r.valorAtivos)}</strong>
      <span class="kpi-sub">${r.total} pedido(s) no total · ${brl(r.valorTotal)}${r.cancelados ? ` · ${r.cancelados} cancelado(s) fora da conta` : ''}</span></div>
    <div class="kpi"><span class="kpi-label">${icon('check-circle')} Entregues no mês</span><strong class="kpi-value">${brl(r.receitaEntreguesMes)}</strong>
      <span class="kpi-sub">${r.entreguesMes} pedido(s) · lucro estimado ${lm.com ? brl(lm.valor) : '—'}${lm.sem ? ` (${lm.sem} sem custos/preço)` : ''} · ${r.entregues} entregue(s) no total</span></div>
  </section>`;
}

function cartao(p) {
  const s = situacao(p, S.empresa);
  const c = calcular(p, S.empresa);
  const i = COLUNAS.indexOf(p.status);
  const edit = podeEditarPedido(p);
  const fil = [p.filamento_tipo, p.filamento_cor].filter(Boolean).join(' ');
  return `<li class="kcard ${s.atrasado ? 'k-late' : s.proximo ? 'k-soon' : ''}" data-id="${p.id}" ${edit ? 'draggable="true"' : ''} aria-label="${esc(p.codigo)} ${esc(p.produto)}">
    <div class="k-top"><span class="k-code">${esc(p.codigo)}</span>${p.prioridade !== 'normal' ? `<span class="tag tag-${p.prioridade === 'urgente' ? 'critico' : 'alerta'}">${PRIORIDADES[p.prioridade]}</span>` : ''}
      ${edit ? `<span class="k-grip" aria-hidden="true">${icon('grip')}</span>` : ''}</div>
    <button type="button" class="row-open k-title" data-abrir="${p.id}"><strong>${esc(p.produto)}</strong></button>
    <p class="k-cli">${esc(p.cliente)} · ${p.quantidade} un.</p>
    <p class="k-due ${s.atrasado ? 'late' : s.proximo ? 'soon' : ''}">${icon(s.atrasado ? 'alert' : 'calendar')}${dataBR(p.prazo).slice(0, 5)} · ${prazoTxt(p, s)}</p>
    ${s.precisaIniciar ? `<p class="k-due soon">${icon('clock')}começar até ${s.inicioAte.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit' })}h</p>` : ''}
    ${p.status === 'producao' ? `<div class="k-prog"><span class="meter meter-progresso" role="img" aria-label="${p.unidades_prontas} de ${p.quantidade} prontas"><span style="width:${c.progresso * 100}%"></span></span>
      <span>${p.unidades_prontas}/${p.quantidade}</span>${edit ? `<button type="button" class="icon-btn sm" data-mais="${p.id}" aria-label="Mais uma unidade pronta" ${p.unidades_prontas >= p.quantidade ? 'disabled' : ''}>${icon('plus')}</button>` : ''}</div>` : ''}
    <p class="k-meta">${c.gramasTotal !== null ? `${icon('printer')}${fmtGramas(p.status === 'entregue' ? c.gramasTotal : c.gramasRestantes)}${fil ? ` ${esc(fil)}` : ''}` : '<span class="muted">sem gramas</span>'}${c.tempoTotalMin ? ` · ${fmtTempo(c.tempoTotalMin)}` : ''}${c.preco !== null ? ` · ${brl(c.preco)}` : ''}</p>
    ${p.status === 'entregue' && c.preco !== null && !receitaDoPedido(p) ? '<p class="k-meta warn-inline">receita não lançada</p>' : ''}
    ${edit ? `<div class="k-move">
      ${i > 0 ? `<button type="button" class="btn btn-sm btn-ghost" data-mover="${p.id}" data-para="${COLUNAS[i - 1]}" aria-label="Voltar para ${STATUS[COLUNAS[i - 1]].nome}">${icon('chevron-left')}</button>` : '<span></span>'}
      ${i < COLUNAS.length - 1 ? `<button type="button" class="btn btn-sm btn-ghost k-next" data-mover="${p.id}" data-para="${COLUNAS[i + 1]}">${['Iniciar', 'Concluir', 'Entregar'][i]} ${icon('chevron')}</button>` : ''}
    </div>` : ''}
  </li>`;
}

function abaFila() {
  const limiteEntregues = somaDias(hoje(), -14);
  const cols = COLUNAS.map((st) => {
    let itens = S.pedidos.filter((p) => p.status === st && casa(p));
    itens = st === 'entregue'
      ? itens.filter((p) => !p.entregue_em || isoLocal(new Date(p.entregue_em)) >= limiteEntregues).sort((a, b) => (b.entregue_em || '').localeCompare(a.entregue_em || ''))
      : ordenarFila(itens, S.empresa);
    return { st, itens };
  });
  if (!S.pedidos.length) {
    return vazio({ icone: 'printer', titulo: 'Nenhum pedido ainda', texto: 'Cadastre os pedidos que chegam pelo WhatsApp ou Instagram. Eles aparecem aqui em colunas, da fila até a entrega.', acao: '<button type="button" class="btn btn-accent btn-sm" data-novo-ped>Cadastrar o primeiro pedido</button>' });
  }
  return `<p class="muted small kanban-hint">${icon('grip')} Arraste os cartões entre as colunas ou use os botões. As mudanças são salvas na hora.</p>
  <div class="kanban">${cols.map(({ st, itens }) => `
    <section class="kcol kcol-${st}" data-col="${st}" aria-label="${STATUS[st].nome}">
      <header><h2>${icon(STATUS[st].icone)}${STATUS[st].nome}</h2><span class="kcount">${itens.length}</span></header>
      ${st === 'entregue' ? '<p class="muted small">últimos 14 dias · os antigos ficam no Histórico</p>' : ''}
      <ul class="klist">${itens.map(cartao).join('') || `<li class="kempty">${st === 'aguardando' ? 'Nenhum pedido na fila' : 'Vazio'}</li>`}</ul>
    </section>`).join('')}</div>`;
}

function filtrarLista() {
  const agora = new Date();
  let arr = S.pedidos.filter((p) => {
    if (f.status === 'ativos' ? !ATIVOS.includes(p.status) : f.status && p.status !== f.status) return false;
    if (!casa(p)) return false;
    if (f.cliente && !norm(p.cliente).includes(norm(f.cliente))) return false;
    if (f.produto && !norm(p.produto).includes(norm(f.produto))) return false;
    if (f.recIni && p.recebido_em < f.recIni) return false;
    if (f.recFim && p.recebido_em > f.recFim) return false;
    if (f.przIni && p.prazo < f.przIni) return false;
    if (f.przFim && p.prazo > f.przFim) return false;
    const s = situacao(p, S.empresa, agora);
    if (f.so === 'atrasados' && !s.atrasado) return false;
    if (f.so === 'iniciar' && !(s.precisaIniciar || (p.status === 'aguardando' && s.proximo))) return false;
    if (f.so === 'proximos' && !s.proximo) return false;
    return true;
  });
  arr = ordenarFila(arr, S.empresa, agora);
  return arr;
}

function abaLista() {
  const arr = filtrarLista();
  const opt = (v, t, sel) => `<option value="${v}"${v === sel ? ' selected' : ''}>${t}</option>`;
  return `
  <div class="filters">
    <label class="flt"><span>Etapa</span><select data-f="status">${opt('ativos', 'Ativos (não entregues)', f.status)}${opt('', 'Todos', f.status)}${Object.entries(STATUS).map(([k, t]) => opt(k, t.nome, f.status)).join('')}</select></label>
    <label class="flt"><span>Cliente</span><input type="text" data-f="cliente" value="${esc(f.cliente)}" placeholder="nome"></label>
    <label class="flt"><span>Produto</span><input type="text" data-f="produto" value="${esc(f.produto)}" placeholder="produto"></label>
    <label class="flt"><span>Recebido de</span><input type="date" data-f="recIni" value="${f.recIni}"></label>
    <label class="flt"><span>até</span><input type="date" data-f="recFim" value="${f.recFim}"></label>
    <label class="flt"><span>Prazo de</span><input type="date" data-f="przIni" value="${f.przIni}"></label>
    <label class="flt"><span>até</span><input type="date" data-f="przFim" value="${f.przFim}"></label>
    <div class="chips" role="group" aria-label="Atalhos">
      ${[['', 'Todos'], ['atrasados', 'Atrasados'], ['proximos', 'Prazo próximo'], ['iniciar', 'Começar em breve']].map(([k, t]) => `<button type="button" class="chip-btn ${f.so === k ? 'on' : ''}" data-so="${k}" aria-pressed="${f.so === k}">${t}</button>`).join('')}
    </div>
    <button type="button" class="btn-link" data-limpar>Limpar</button>
  </div>
  <div class="totals"><span><small>${arr.length} pedido(s)</small></span><span><small>Filamento</small><strong>${fmtGramas(arr.reduce((t, p) => t + (calcular(p, S.empresa).gramasRestantes || 0), 0))}</strong></span>
    <span><small>Valor</small><strong>${brl(arr.reduce((t, p) => t + (calcular(p, S.empresa).preco || 0), 0))}</strong></span><span class="muted small">Ordem: atrasados, prazo próximo/precisam começar, prioridade e prazo.</span></div>
  ${arr.length ? `<div class="table-wrap"><table class="tbl tbl-cards">
    <thead><tr><th>Prazo</th><th>Pedido</th><th>Etapa</th><th>Situação</th><th class="num">Filamento</th><th class="num">Valor</th><th><span class="sr-only">Ações</span></th></tr></thead>
    <tbody>${arr.map((p) => {
      const s = situacao(p, S.empresa); const c = calcular(p, S.empresa); const i = COLUNAS.indexOf(p.status);
      return `<tr class="${p.status === 'cancelado' ? 'row-off' : ''}">
        <td data-th="Prazo"><span class="${s.atrasado ? 'neg strong' : s.proximo ? 'warn-inline' : ''}">${dataBR(p.prazo)}</span></td>
        <td data-th="Pedido" class="td-main"><button type="button" class="row-open" data-abrir="${p.id}"><strong>${esc(p.produto)}</strong></button><small>${esc(p.codigo)} · ${esc(p.cliente)} · ${p.quantidade} un.${p.prioridade !== 'normal' ? ` · prioridade ${PRIORIDADES[p.prioridade].toLowerCase()}` : ''}</small></td>
        <td data-th="Etapa"><span class="tag tag-st-${p.status}">${icon(STATUS[p.status].icone)}${STATUS[p.status].curto}</span>${p.status === 'producao' ? `<small class="muted d-block">${p.unidades_prontas}/${p.quantidade} prontas</small>` : ''}</td>
        <td data-th="Situação">${s.atrasado ? `<span class="tag tag-critico">${icon('alert')}${prazoTxt(p, s)}</span>` : s.proximo ? `<span class="tag tag-alerta">${icon('clock')}${prazoTxt(p, s)}</span>` : `<span class="muted small">${prazoTxt(p, s)}</span>`}
          ${s.precisaIniciar ? `<small class="d-block warn-inline">começar até ${s.inicioAte.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit' })}h</small>` : ''}</td>
        <td data-th="Filamento" class="num">${fmtGramas(c.gramasRestantes)}</td>
        <td data-th="Valor" class="num">${c.preco === null ? '—' : brl(c.preco)}</td>
        <td class="actions">${podeEditarPedido(p) && i >= 0 && i < 3 ? `<button type="button" class="btn btn-sm btn-ghost" data-mover="${p.id}" data-para="${COLUNAS[i + 1]}">${['Iniciar', 'Concluir', 'Entregar'][i]}</button>` : ''}</td>
      </tr>`;
    }).join('')}</tbody></table></div>` : vazio({ icone: 'search', titulo: 'Nenhum pedido com esses filtros' })}`;
}

function abaHistorico() {
  const arr = S.pedidos.filter((p) => ['entregue', 'cancelado'].includes(p.status) && casa(p)
    && (!hist.status || p.status === hist.status)
    && (() => { const d = p.entregue_em || p.cancelado_em; const di = d ? isoLocal(new Date(d)) : p.prazo; return (!hist.ini || di >= hist.ini) && (!hist.fim || di <= hist.fim); })())
    .sort((a, b) => (b.entregue_em || b.cancelado_em || '').localeCompare(a.entregue_em || a.cancelado_em || ''));
  const ent = arr.filter((p) => p.status === 'entregue');
  const cs = new Map(arr.map((p) => [p.id, calcular(p, S.empresa)]));
  const noPrazo = ent.filter((p) => p.entregue_em && isoLocal(new Date(p.entregue_em)) <= p.prazo).length;
  const com = ent.filter((p) => cs.get(p.id).lucro !== null);
  const d = (ts) => (ts ? dataBR(isoLocal(new Date(ts))) : '—');
  return `
  <div class="filters">
    <label class="flt"><span>Finalizados de</span><input type="date" data-h="ini" value="${hist.ini}"></label>
    <label class="flt"><span>até</span><input type="date" data-h="fim" value="${hist.fim}"></label>
    <label class="flt"><span>Situação</span><select data-h="status"><option value="">Entregues e cancelados</option><option value="entregue"${hist.status === 'entregue' ? ' selected' : ''}>Entregues</option><option value="cancelado"${hist.status === 'cancelado' ? ' selected' : ''}>Cancelados</option></select></label>
  </div>
  <div class="totals">
    <span><small>Entregues</small><strong>${ent.length}</strong></span>
    <span><small>No prazo</small><strong>${ent.length ? `${noPrazo} (${pct(noPrazo / ent.length)})` : '—'}</strong></span>
    <span><small>Receita</small><strong class="pos">${brl(ent.reduce((t, p) => t + (cs.get(p.id).preco || 0), 0))}</strong></span>
    <span><small>Lucro estimado</small><strong>${com.length ? brl(com.reduce((t, p) => t + cs.get(p.id).lucro, 0)) : '—'}</strong>${ent.length - com.length ? `<small>${ent.length - com.length} sem dados</small>` : ''}</span>
    <span><small>Filamento usado</small><strong>${fmtGramas(ent.reduce((t, p) => t + (cs.get(p.id).gramasTotal || 0), 0))}</strong></span>
  </div>
  ${arr.length ? `<div class="table-wrap"><table class="tbl tbl-cards compact">
    <thead><tr><th>Pedido</th><th>Recebido</th><th>Início</th><th>Pronto</th><th>Entregue</th><th>Prazo</th><th class="num">Filamento</th><th class="num">Custo</th><th class="num">Preço</th><th class="num">Lucro</th></tr></thead>
    <tbody>${arr.map((p) => { const c = cs.get(p.id); const atrasou = p.entregue_em && isoLocal(new Date(p.entregue_em)) > p.prazo; return `<tr class="${p.status === 'cancelado' ? 'row-off' : ''}">
      <td data-th="Pedido" class="td-main"><button type="button" class="row-open" data-abrir="${p.id}"><strong>${esc(p.produto)}</strong></button><small>${esc(p.codigo)} · ${esc(p.cliente)} · ${p.quantidade} un.${p.status === 'cancelado' ? ' · cancelado' : ''}</small></td>
      <td data-th="Recebido">${dataBR(p.recebido_em)}</td><td data-th="Início">${d(p.iniciado_em)}</td><td data-th="Pronto">${d(p.concluido_em)}</td>
      <td data-th="Entregue">${d(p.entregue_em)}${atrasou ? ' <span class="tag tag-alerta">após o prazo</span>' : ''}</td><td data-th="Prazo">${dataBR(p.prazo)}</td>
      <td data-th="Filamento" class="num">${fmtGramas(c.gramasTotal)}</td><td data-th="Custo" class="num">${c.custoTotal === null ? '—' : brl(c.custoTotal)}</td>
      <td data-th="Valor" class="num">${c.preco === null ? '—' : brl(c.preco)}</td><td data-th="Lucro" class="num ${c.lucro < 0 ? 'neg' : ''}">${c.lucro === null ? '—' : brl(c.lucro)}</td></tr>`; }).join('')}</tbody></table></div>`
    : vazio({ icone: 'history', titulo: 'Nenhum pedido finalizado', texto: 'Pedidos entregues e cancelados ficam guardados aqui, fora da fila de produção.' })}`;
}

function desenhar() {
  if (!S.moduloPedidos) {
    el.innerHTML = `<section class="card narrow"><div class="card-head"><h2>${icon('alert')} Falta atualizar o banco de dados</h2></div>
      <p>O módulo de pedidos precisa das tabelas novas. No Supabase, abra o <strong>SQL Editor</strong>, cole de novo o arquivo <code>gestao/supabase/schema.sql</code> inteiro e clique em <strong>Run</strong>. Seus dados atuais não são apagados.</p>
      <p>Depois, recarregue esta página.</p></section>`;
    return;
  }
  const tabs = [['fila', 'Fila de produção'], ['lista', 'Prioridades e filtros'], ['historico', 'Histórico']];
  el.innerHTML = `
  ${indicadores()}
  <div class="toolbar wrap">
    <div class="tabs" role="tablist">${tabs.map(([k, t]) => `<button type="button" role="tab" aria-selected="${aba === k}" data-aba="${k}">${t}</button>`).join('')}</div>
    <div class="search"><label class="sr-only" for="b-ped">Pesquisar pedidos</label>${icon('search')}<input id="b-ped" type="search" data-busca placeholder="Cliente, produto ou código…" value="${esc(busca)}"></div>
    <button type="button" class="btn btn-accent btn-sm" data-novo-ped>${icon('plus')} Novo pedido</button>
  </div>
  <div class="tab-body" data-corpo>${aba === 'fila' ? abaFila() : aba === 'lista' ? abaLista() : abaHistorico()}</div>`;
  ligar();
}

function ligar() {
  const achar = (id) => S.pedidos.find((p) => p.id === id);
  el.querySelectorAll('[data-aba]').forEach((b) => b.addEventListener('click', () => { aba = b.dataset.aba; trocarParams({ aba, q: busca }); desenhar(); }));
  el.querySelectorAll('[data-novo-ped]').forEach((b) => b.addEventListener('click', () => abrirPedido()));
  el.querySelectorAll('[data-abrir]').forEach((b) => b.addEventListener('click', () => abrirPedido(achar(b.dataset.abrir))));
  el.querySelectorAll('[data-mover]').forEach((b) => b.addEventListener('click', () => moverPedido(achar(b.dataset.mover), b.dataset.para)));
  el.querySelectorAll('[data-mais]').forEach((b) => b.addEventListener('click', () => ajustarProntas(achar(b.dataset.mais), 1)));
  let t;
  el.querySelector('[data-busca]').addEventListener('input', (e) => {
    clearTimeout(t);
    t = setTimeout(() => { busca = e.target.value; trocarParams({ aba, q: busca }); desenhar(); const i = el.querySelector('[data-busca]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250);
  });
  el.querySelectorAll('[data-f]').forEach((x) => x.addEventListener(x.tagName === 'INPUT' && x.type === 'text' ? 'input' : 'change', () => {
    clearTimeout(t);
    t = setTimeout(() => { f[x.dataset.f] = x.value; const foco = x.dataset.f; desenhar(); const n = el.querySelector(`[data-f="${foco}"]`); if (n && n.type === 'text') { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, x.type === 'text' ? 250 : 0);
  }));
  el.querySelectorAll('[data-so]').forEach((b) => b.addEventListener('click', () => { f.so = b.dataset.so; desenhar(); }));
  el.querySelector('[data-limpar]')?.addEventListener('click', () => { f = { status: 'ativos', cliente: '', produto: '', recIni: '', recFim: '', przIni: '', przFim: '', so: '' }; desenhar(); });
  el.querySelectorAll('[data-h]').forEach((x) => x.addEventListener('change', () => { hist[x.dataset.h] = x.value; desenhar(); }));

  // arrastar e soltar entre colunas
  let arrastando = null;
  el.querySelectorAll('.kcard[draggable]').forEach((c) => {
    c.addEventListener('dragstart', (e) => { arrastando = c.dataset.id; c.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.dataset.id); });
    c.addEventListener('dragend', () => { c.classList.remove('dragging'); el.querySelectorAll('.kcol').forEach((k) => k.classList.remove('over')); });
  });
  el.querySelectorAll('.kcol').forEach((col) => {
    col.addEventListener('dragover', (e) => { if (!arrastando) return; e.preventDefault(); col.classList.add('over'); });
    col.addEventListener('dragleave', (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('over'); });
    col.addEventListener('drop', (e) => {
      e.preventDefault(); col.classList.remove('over');
      const id = e.dataTransfer.getData('text/plain') || arrastando; arrastando = null;
      const p = achar(id);
      if (p && p.status !== col.dataset.col) moverPedido(p, col.dataset.col);
    });
  });
}
