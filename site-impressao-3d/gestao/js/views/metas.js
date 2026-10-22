/* Metas, projeções simples e insights. */
import { S, podeGerir, criar, alterar, remover, novoId } from '../store.js';
import * as F from '../finance.js';
import { brl, pct, esc, hoje, inicioMes, fimMes, somaMeses, dataBR, centavos, mesLongo, diasEntre } from '../format.js';
import { icon, modal, campo, ligarDinheiro, dinheiro, erroCampo, limparErros, ocupado, toast, erro, confirmar, vazio, $ } from '../ui.js';
import { medidor } from '../charts.js';
import { historico } from './lancamento-form.js';

let el;
export function render(root) { el = root; desenhar(); }
export const atualizar = () => desenhar();

const TIPOS = {
  faturamento: { nome: 'Atingir faturamento', unidade: 'valor', ajuda: 'Soma das vendas + frete cobrado no período.' },
  lucro: { nome: 'Alcançar lucro', unidade: 'valor', ajuda: 'Lucro estimado: faturamento − custos − despesas − impostos.' },
  reduzir_despesas: { nome: 'Reduzir despesas', unidade: 'percentual', ajuda: 'Comparado com o período anterior de mesma duração.' },
  economia: { nome: 'Economizar (guardar) um valor', unidade: 'valor', ajuda: 'Quanto o saldo das contas deve crescer no período.' },
  limite_gastos: { nome: 'Respeitar limite de gastos', unidade: 'valor', ajuda: 'Total gasto no período (ou em uma categoria) não pode passar do valor.' },
  superar_mes_anterior: { nome: 'Superar o período anterior', unidade: 'percentual-opcional', ajuda: 'Faturar mais que o período anterior (opcionalmente, X% a mais).' },
};

function cardMeta(p) {
  const m = p.meta;
  const t = TIPOS[m.tipo];
  const ref = hoje();
  const dias = diasEntre(ref, m.fim);
  let situacao; let cls;
  if (p.naoIniciada) { situacao = 'Ainda não começou'; cls = 'neutro'; }
  else if (p.melhorMenor) {
    if (p.estourada) { situacao = 'Limite ultrapassado'; cls = 'critico'; }
    else if (p.encerrada) { situacao = 'Cumprida'; cls = 'ok'; }
    else if (p.projecao !== null && p.alvo !== null && p.projecao > p.alvo) { situacao = 'Pelo ritmo atual, deve passar do limite'; cls = 'alerta'; }
    else { situacao = 'Dentro do limite'; cls = 'ok'; }
  } else if (p.atingida) { situacao = 'Meta atingida'; cls = 'ok'; }
  else if (p.encerrada) { situacao = 'Não atingida'; cls = 'critico'; }
  else if (p.projecao !== null && p.alvo !== null) { situacao = p.projecao >= p.alvo ? 'No ritmo para atingir' : 'Abaixo do ritmo necessário'; cls = p.projecao >= p.alvo ? 'ok' : 'alerta'; }
  else { situacao = 'Em andamento'; cls = 'neutro'; }
  const falta = !p.melhorMenor && p.alvo !== null && !p.atingida ? p.alvo - p.atual : null;
  const prog = p.progresso === null ? null : p.progresso;
  return `<article class="card goal ${m.ativo ? '' : 'goal-off'}">
    <div class="card-head"><div><span class="kpi-label">${esc(t.nome)}${m.categoria_id ? ` · ${esc(S.cats[m.categoria_id]?.nome || '')}` : ''}</span><h2>${esc(m.titulo)}</h2></div>
      ${podeGerir() ? `<button type="button" class="icon-btn" data-editar="${m.id}" aria-label="Editar meta ${esc(m.titulo)}">${icon('edit')}</button>` : ''}</div>
    <p class="goal-period">${dataBR(m.inicio)} a ${dataBR(m.fim)}${!p.encerrada && !p.naoIniciada ? ` · faltam ${dias} dia(s)` : ''}${m.ativo ? '' : ' · <em>pausada</em>'}</p>
    <div class="goal-num"><strong>${brl(p.atual)}</strong><span>${p.melhorMenor ? 'de no máximo' : 'de'} ${p.alvo === null ? '—' : brl(p.alvo)}</span></div>
    ${medidor(prog, p.melhorMenor ? (p.estourada ? 'estourado' : prog >= 0.9 ? 'alerta' : 'ok') : (p.atingida ? 'ok' : 'progresso'))}
    <p class="goal-meta"><span class="tag tag-${cls}">${cls === 'ok' ? icon('check') : cls === 'neutro' ? '' : icon('alert')}${situacao}</span> <span>${prog === null ? '' : pct(Math.min(prog, 9.99))}</span></p>
    ${falta !== null && falta > 0 && !p.encerrada ? `<p class="small">Faltam <strong>${brl(falta)}</strong>${dias > 0 ? ` · cerca de ${brl(Math.ceil(falta / Math.max(1, dias)))} por dia` : ''}.</p>` : ''}
    ${p.anterior !== undefined ? `<p class="small muted">Período anterior: ${brl(p.anterior)}${p.semBase ? ' — sem dados para comparar' : ''}</p>` : ''}
    ${p.projecao !== null && !p.encerrada ? `<p class="small">Projeção para o fim do período: <strong>${brl(p.projecao)}</strong></p><p class="hyp">${icon('info')} ${esc(p.hipotese)} Não é garantia de resultado.</p>` : ''}
    ${p.avisos?.some((a) => a.id === 'sem-custos') ? `<p class="hyp warn">${icon('alert')} Sem custos de produção lançados: o lucro está superestimado.</p>` : ''}
  </article>`;
}

function projecoes() {
  const ref = hoje();
  const mes = { inicio: inicioMes(ref), fim: fimMes(ref) };
  const ateHoje = { inicio: mes.inicio, fim: ref };
  const r = F.resumo(S.lancamentos, S.cats, ateHoje, ref);
  const ult = [1, 2, 3].map((n) => { const i = somaMeses(ref, -n); return F.resumo(S.lancamentos, S.cats, { inicio: i, fim: fimMes(i) }, ref); });
  const temHist = ult.every((x) => x.faturamento > 0 || x.despesasResultado > 0);
  const media = (k) => Math.round(ult.reduce((t, x) => t + x[k], 0) / 3);
  const pFat = F.projetar(r.faturamento, mes, ref);
  const pDes = F.projetar(r.despesasResultado, mes, ref);
  const pend = F.fluxoDiario(S.lancamentos, S.contas, mes, ref);
  const linha = (rot, atual, proj, med) => `<tr><th scope="row">${rot}</th><td class="num">${brl(atual)}</td><td class="num">${proj === null ? '—' : brl(proj)}</td><td class="num muted">${temHist ? brl(med) : '—'}</td></tr>`;
  return `<section class="card">
    <div class="card-head"><h2>Projeção de ${mesLongo(ref)}</h2><span class="muted small">dia ${diasEntre(mes.inicio, ref) + 1} de ${diasEntre(mes.inicio, mes.fim) + 1}</span></div>
    <div class="table-wrap"><table class="tbl compact"><thead><tr><th></th><th class="num">Até hoje</th><th class="num">Projeção linear</th><th class="num">Média 3 meses</th></tr></thead><tbody>
      ${linha('Faturamento', r.faturamento, pFat, media('faturamento'))}
      ${linha('Despesas (custos + operacionais + impostos)', r.despesasResultado, pDes, media('despesasResultado'))}
      ${linha('Lucro estimado', r.lucro, pFat !== null && pDes !== null ? pFat + r.outras - pDes : null, media('lucro'))}
      <tr><th scope="row">Saldo de caixa no fim do mês</th><td class="num">${brl(pend.saldoFinal)}</td><td class="num">${brl(pend.saldoFinalPrevisto)}</td><td class="num muted">—</td></tr>
    </tbody></table></div>
    <p class="hyp">${icon('info')} <span><strong>Hipóteses:</strong> a projeção linear supõe que o ritmo diário registrado até hoje continua até o fim do mês (precisa de pelo menos 3 dias). O saldo previsto soma ao saldo de hoje as contas pendentes lançadas até o fim do mês. São estimativas para orientar decisões, não resultados garantidos.</span></p>
  </section>`;
}

function desenhar() {
  const ref = hoje();
  const lista = S.metas.map((m) => F.progressoMeta(m, S.lancamentos, S.cats, S.contas, ref));
  const ativas = lista.filter((p) => p.meta.ativo && !p.encerrada);
  const encerradas = lista.filter((p) => !p.meta.ativo || p.encerrada);
  const ins = F.insights(S.lancamentos, S.cats, S.orcamentos, ref, S.empresa.alerta_orcamento_pct);
  el.innerHTML = `
  <div class="toolbar">${podeGerir() ? `<button type="button" class="btn btn-accent btn-sm" data-nova>${icon('plus')} Nova meta</button>` : '<span></span>'}</div>
  ${ativas.length ? `<div class="goals">${ativas.map(cardMeta).join('')}</div>`
    : vazio({ icone: 'target', titulo: 'Nenhuma meta em andamento', texto: 'Exemplos: faturar R$ 5.000 no mês, manter os gastos com material abaixo de R$ 800 ou guardar R$ 1.000 até dezembro.', acao: podeGerir() ? '<button type="button" class="btn btn-accent btn-sm" data-nova>Criar a primeira meta</button>' : '' })}
  ${projecoes()}
  <section class="card">
    <div class="card-head"><h2>Insights</h2><span class="muted small">observações automáticas a partir dos lançamentos</span></div>
    ${ins.length ? `<ul class="insights">${ins.map((i) => `<li class="ins ins-${i.nivel}">${icon(i.nivel === 'bom' ? 'trend-up' : 'alert')}<div><a href="${i.link}"><strong>${esc(i.titulo)}</strong></a><p>${esc(i.texto)}</p></div></li>`).join('')}</ul>`
      : '<p class="muted">Nada fora do comum. Comparações de gastos precisam de pelo menos 3 meses de histórico; alertas de orçamento precisam de limites definidos.</p>'}
  </section>
  ${encerradas.length ? `<details class="card"><summary><h2 class="inline">Encerradas e pausadas (${encerradas.length})</h2></summary><div class="goals">${encerradas.map(cardMeta).join('')}</div></details>` : ''}`;

  el.querySelectorAll('[data-nova]').forEach((b) => b.addEventListener('click', () => formMeta()));
  el.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => formMeta(S.metas.find((m) => m.id === b.dataset.editar))));
}

function formMeta(m = null) {
  const ref = hoje();
  const v = m || { tipo: 'faturamento', titulo: '', inicio: inicioMes(ref), fim: fimMes(ref), ativo: true };
  const catOpts = [{ valor: '', rotulo: 'Todas as despesas (sem investimentos e retiradas)' }].concat(S.categorias.filter((c) => c.tipo === 'despesa' && c.ativo).map((c) => ({ valor: c.id, rotulo: c.nome })));
  modal({
    titulo: m ? 'Editar meta' : 'Nova meta', largura: 'md',
    corpo: `<form class="form" data-meta novalidate>
      ${campo({ nome: 'tipo', rotulo: 'Tipo de meta', valor: v.tipo, opcoes: Object.entries(TIPOS).map(([k, t]) => ({ valor: k, rotulo: t.nome })) })}
      <p class="field-help" data-ajuda>${TIPOS[v.tipo].ajuda}</p>
      ${campo({ nome: 'titulo', rotulo: 'Nome da meta', valor: v.titulo, obrig: true, attrs: 'maxlength="80" placeholder="Ex.: Faturar R$ 5 mil em novembro"' })}
      <div class="grid-2">
        <div data-box-valor>${campo({ nome: 'valor_alvo', rotulo: 'Valor', tipo: 'dinheiro', valor: v.valor_alvo !== null && v.valor_alvo !== undefined ? centavos(v.valor_alvo) : '' })}</div>
        <div data-box-pct>${campo({ nome: 'percentual', rotulo: 'Percentual (%)', tipo: 'number', valor: v.percentual ?? '', attrs: 'min="0.1" max="100" step="0.1" inputmode="decimal"' })}</div>
        <div data-box-cat class="span-2">${campo({ nome: 'categoria_id', rotulo: 'Aplicar a', valor: v.categoria_id || '', opcoes: catOpts })}</div>
        ${campo({ nome: 'inicio', rotulo: 'Início', tipo: 'date', valor: v.inicio, obrig: true })}
        ${campo({ nome: 'fim', rotulo: 'Fim', tipo: 'date', valor: v.fim, obrig: true })}
      </div>
      <div class="chips" aria-label="Atalhos de período">
        <button type="button" class="chip-btn" data-per="mes">Este mês</button><button type="button" class="chip-btn" data-per="prox">Próximo mês</button>
        <button type="button" class="chip-btn" data-per="tri">Próximos 3 meses</button><button type="button" class="chip-btn" data-per="ano">Até o fim do ano</button>
      </div>
      ${m ? `<label class="check"><input type="checkbox" name="ativo" ${v.ativo ? 'checked' : ''}> <span>Meta ativa</span></label>` : ''}
    </form>`,
    rodape: `${m ? `<button type="button" class="btn btn-ghost perigo mr-auto" data-excluir>${icon('trash')} Excluir</button><button type="button" class="btn btn-ghost" data-hist>${icon('history')}</button>` : ''}
      <button type="button" class="btn btn-ghost" data-fechar>Cancelar</button><button type="button" class="btn btn-accent" data-salvar>Salvar</button>`,
    aoAbrir: (dlg, fechar) => {
      const form = $('[data-meta]', dlg);
      ligarDinheiro(form);
      const sinc = () => {
        const t = TIPOS[form.tipo.value];
        $('[data-ajuda]', dlg).textContent = t.ajuda;
        $('[data-box-valor]', dlg).hidden = t.unidade !== 'valor';
        $('[data-box-pct]', dlg).hidden = !t.unidade.startsWith('percentual');
        $('[data-box-cat]', dlg).hidden = form.tipo.value !== 'limite_gastos';
        form.querySelector('[data-field="valor_alvo"] label').firstChild.textContent = form.tipo.value === 'limite_gastos' ? 'Gastar no máximo' : 'Valor-alvo';
        form.querySelector('[data-field="percentual"] label').firstChild.textContent = form.tipo.value === 'reduzir_despesas' ? 'Reduzir em (%)' : 'A mais que o anterior (%, opcional)';
      };
      sinc();
      form.tipo.addEventListener('change', sinc);
      dlg.querySelectorAll('[data-per]').forEach((b) => b.addEventListener('click', () => {
        const k = b.dataset.per;
        const [i, f] = k === 'mes' ? [inicioMes(ref), fimMes(ref)] : k === 'prox' ? [somaMeses(ref, 1), fimMes(somaMeses(ref, 1))]
          : k === 'tri' ? [inicioMes(ref), fimMes(somaMeses(ref, 2))] : [ref, `${ref.slice(0, 4)}-12-31`];
        form.inicio.value = i; form.fim.value = f;
      }));
      $('[data-hist]', dlg)?.addEventListener('click', () => historico('metas', m.id, m.titulo));
      $('[data-excluir]', dlg)?.addEventListener('click', async () => {
        if (!(await confirmar({ titulo: 'Excluir meta?', texto: `"${esc(m.titulo)}" será removida.`, botao: 'Excluir', perigo: true }))) return;
        try { await remover('metas', m.id); toast('Meta excluída.'); fechar(''); } catch (e) { erro(e); }
      });
      $('[data-salvar]', dlg).addEventListener('click', (e) => ocupado(e.currentTarget, async () => {
        limparErros(form);
        const tipo = form.tipo.value; const t = TIPOS[tipo];
        const d = { tipo, titulo: form.titulo.value.trim(), inicio: form.inicio.value, fim: form.fim.value,
          valor_alvo: null, percentual: null, categoria_id: tipo === 'limite_gastos' ? (form.categoria_id.value || null) : null };
        if (!d.titulo) return erroCampo(form, 'titulo', 'Dê um nome à meta.');
        if (t.unidade === 'valor') {
          const c = dinheiro(form, 'valor_alvo');
          if (!Number.isFinite(c) || c <= 0) return erroCampo(form, 'valor_alvo', 'Informe um valor maior que zero.');
          d.valor_alvo = c / 100;
        }
        if (t.unidade.startsWith('percentual')) {
          const p = Number(String(form.percentual.value).replace(',', '.'));
          if (form.percentual.value === '' && t.unidade === 'percentual-opcional') d.percentual = null;
          else if (!Number.isFinite(p) || p <= 0 || p > 100) return erroCampo(form, 'percentual', 'Informe um percentual entre 0,1 e 100.');
          else d.percentual = p;
        }
        if (!d.inicio || !d.fim) return erroCampo(form, 'inicio', 'Informe o período.');
        if (d.fim < d.inicio) return erroCampo(form, 'fim', 'O fim precisa ser depois do início.');
        if (m) d.ativo = form.ativo.checked;
        try {
          if (m) await alterar('metas', m.id, d); else await criar('metas', { id: novoId(), ...d, ativo: true });
          toast('Meta salva.'); fechar('ok');
        } catch (ex) { erro(ex); }
      }));
    },
  });
}
