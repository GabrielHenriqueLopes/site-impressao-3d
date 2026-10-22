/* Avisos: notificações de prazo dos pedidos e próximos a produzir. */
import { S, marcarLidas, marcarNaoLida, atualizarAvisos, naoLidas, avisoVigente } from '../store.js';
import { situacao, ordenarFila, calcular, STATUS } from '../pedidos-calc.js';
import { esc, dataHora, dataBR } from '../format.js';
import { icon, vazio, erro, ocupado, toast } from '../ui.js';
import { abrirPedido, fmtGramas, fmtTempo } from './pedido-form.js';
import { permissaoNavegador, pedirPermissao } from '../notificar.js';

let el; let filtro = 'nao-lidas';
export function render(root) { el = root; desenhar(); }
export const atualizar = () => desenhar();

const ICONE = { atrasado: 'alert', prazo_proximo: 'clock', iniciar: 'printer' };
const NIVEL = { atrasado: 'critico', prazo_proximo: 'alerta', iniciar: 'alerta' };

function blocoNavegador() {
  const st = permissaoNavegador();
  const txt = {
    indisponivel: 'Este navegador não permite notificações. Os avisos continuam aparecendo aqui e no sino do topo.',
    granted: `${icon('check-circle')} Notificações do navegador ativas neste aparelho. Elas aparecem enquanto o aplicativo estiver aberto, mesmo em outra aba ou minimizado.`,
    denied: 'As notificações foram bloqueadas neste navegador. Para liberar, clique no cadeado ao lado do endereço do site e permita "Notificações".',
    default: 'Receba um alerta do navegador quando surgir um aviso novo (enquanto o aplicativo estiver aberto).',
  }[st];
  return `<section class="card"><div class="card-head"><h2>${icon('bell')} Notificações no aparelho</h2>
    ${st === 'default' ? '<button type="button" class="btn btn-sm btn-accent" data-permitir>Ativar neste aparelho</button>' : ''}</div>
    <p class="small">${txt}</p>
    <p class="hyp">${icon('info')} <span>Os avisos são verificados ao abrir o aplicativo e a cada 5 minutos. Com o aplicativo fechado, o navegador não recebe alertas: para isso seria preciso um serviço de envio (push ou e-mail) que não faz parte do plano gratuito usado aqui. Antecedência dos lembretes: <strong>${S.empresa.lembrete_horas || 24} h</strong> (muda em Configurações → Produção).</span></p>
  </section>`;
}

function proximosAProduzir() {
  const arr = ordenarFila(S.pedidos.filter((p) => p.status === 'aguardando'), S.empresa).slice(0, 8);
  return `<section class="card"><div class="card-head"><h2>${icon('list')} Próximos a produzir</h2><a class="btn-link" href="#/pedidos?aba=lista">Ver todos</a></div>
    ${arr.length ? `<ul class="list">${arr.map((p) => { const s = situacao(p, S.empresa); const c = calcular(p, S.empresa); return `
      <li class="list-item"><span class="li-date ${s.atrasado ? 'late' : ''}">${dataBR(p.prazo).slice(0, 5)}<small>prazo</small></span>
        <span class="li-main"><button type="button" class="row-open" data-ped="${p.id}"><strong>${esc(p.produto)}</strong></button>
          <small>${esc(p.codigo)} · ${esc(p.cliente)} · ${p.quantidade} un. · ${fmtGramas(c.gramasRestantes)}${c.tempoTotalMin ? ` · ${fmtTempo(c.tempoTotalMin)}` : ''}</small></span>
        <span class="li-val">${s.atrasado ? '<span class="tag tag-critico">Atrasado</span>' : s.precisaIniciar ? `<span class="tag tag-alerta">começar até ${s.inicioAte.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit' })}h</span>` : ''}</span>
      </li>`; }).join('')}</ul>` : '<p class="muted">Nenhum pedido aguardando início.</p>'}
  </section>`;
}

function desenhar() {
  if (!S.moduloPedidos) { el.innerHTML = '<p class="note">Os avisos dependem do módulo de pedidos. Rode de novo o <code>schema.sql</code> no Supabase (veja a tela Pedidos).</p>'; return; }
  const todas = S.notificacoes;
  const lista = filtro === 'nao-lidas' ? naoLidas() : todas;
  const nl = naoLidas().length;
  el.innerHTML = `
  <div class="toolbar">
    <div class="seg-tabs" role="tablist">${[['nao-lidas', `Não lidas (${nl})`], ['todas', 'Todas']].map(([k, t]) => `<button type="button" role="tab" aria-selected="${filtro === k}" data-filtro="${k}">${t}</button>`).join('')}</div>
    <div class="row-gap">
      <button type="button" class="btn btn-ghost btn-sm" data-verificar data-busy="Verificando…">${icon('refresh')} Verificar agora</button>
      ${nl ? `<button type="button" class="btn btn-ghost btn-sm" data-todas>${icon('check')} Marcar todas como lidas</button>` : ''}
    </div>
  </div>
  <section class="card">
    ${lista.length ? `<ul class="notifs">${lista.map((n) => {
      const lida = S.lidas.has(n.id);
      const p = S.pedidos.find((x) => x.id === n.pedido_id);
      const encerrado = !avisoVigente(n);
      return `<li class="notif notif-${NIVEL[n.tipo]} ${lida ? 'lida' : ''}">
        ${icon(ICONE[n.tipo])}
        <div class="notif-body">
          <p><strong>${esc(n.titulo)}</strong>${lida || encerrado ? '' : ' <span class="dot-new" aria-label="não lida"></span>'}</p>
          <p class="small">${esc(n.texto)}</p>
          <p class="muted small"><time>${dataHora(n.criado_em)}</time>${p ? ` · agora: ${STATUS[p.status].nome}` : ' · pedido excluído'}${p && encerrado ? (p.prazo !== n.referencia ? ' · prazo alterado' : ' (resolvido)') : ''}</p>
        </div>
        <div class="notif-acts">
          ${p ? `<button type="button" class="btn btn-sm btn-ghost" data-ped="${p.id}" data-ler="${n.id}">Abrir pedido</button>` : ''}
          <button type="button" class="btn btn-sm btn-ghost" data-alternar="${n.id}">${lida ? 'Marcar como não lida' : 'Marcar como lida'}</button>
        </div>
      </li>`;
    }).join('')}</ul>` : vazio({ icone: 'bell', titulo: filtro === 'nao-lidas' ? 'Nenhum aviso novo' : 'Nenhum aviso ainda', texto: 'Avisos aparecem quando um prazo se aproxima, quando um pedido atrasa e quando está na hora de começar a imprimir.' })}
  </section>
  <div class="duo">${proximosAProduzir()}${blocoNavegador()}</div>`;

  el.querySelectorAll('[data-filtro]').forEach((b) => b.addEventListener('click', () => { filtro = b.dataset.filtro; desenhar(); }));
  el.querySelector('[data-todas]')?.addEventListener('click', async () => { try { await marcarLidas(naoLidas().map((n) => n.id)); toast('Todos os avisos marcados como lidos.'); } catch (e) { erro(e); } });
  el.querySelector('[data-verificar]').addEventListener('click', (e) => ocupado(e.currentTarget, async () => { try { await atualizarAvisos(); desenhar(); } catch (ex) { erro(ex); } }));
  el.querySelectorAll('[data-alternar]').forEach((b) => b.addEventListener('click', async () => {
    try { if (S.lidas.has(b.dataset.alternar)) await marcarNaoLida(b.dataset.alternar); else await marcarLidas([b.dataset.alternar]); } catch (e) { erro(e); }
  }));
  el.querySelectorAll('[data-ped]').forEach((b) => b.addEventListener('click', async () => {
    const p = S.pedidos.find((x) => x.id === b.dataset.ped);
    if (b.dataset.ler && !S.lidas.has(b.dataset.ler)) marcarLidas([b.dataset.ler]).catch(() => {});
    if (p) abrirPedido(p);
  }));
  el.querySelector('[data-permitir]')?.addEventListener('click', async () => { await pedirPermissao(); desenhar(); });
}
