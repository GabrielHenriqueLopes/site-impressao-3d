/* Gráficos em SVG puro, leves, acessíveis e com dica ao passar o mouse/tocar. */
import { brl, brlCurto, esc } from './format.js';

function escala(min, max, n = 4) {
  if (min === max) { max = min + 100; }
  const bruto = (max - min) / n;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= bruto) || bruto;
  const ini = Math.floor(min / passo) * passo;
  const fim = Math.ceil(max / passo) * passo;
  const ticks = [];
  for (let v = ini; v <= fim + passo / 2; v += passo) ticks.push(Math.round(v));
  return { ini, fim, ticks };
}

const largura = (el) => Math.max(280, Math.floor(el.clientWidth || el.parentElement?.clientWidth || 640));
/** Redesenha quando a largura do contêiner muda (gráfico sempre nítido, sem distorção). */
function observar(el, redesenhar) {
  if (el._obs || typeof ResizeObserver === 'undefined') return;
  let w = el.clientWidth; let t;
  el._obs = new ResizeObserver(() => {
    if (Math.abs(el.clientWidth - w) < 8) return;
    w = el.clientWidth; clearTimeout(t); t = setTimeout(() => { if (el.isConnected) redesenhar(); else el._obs.disconnect(); }, 120);
  });
  el._obs.observe(el);
}

function dica(root) {
  let t = root.querySelector('.chart-tip');
  if (!t) { t = document.createElement('div'); t.className = 'chart-tip'; t.hidden = true; root.append(t); }
  return {
    mostrar(html, x, y) {
      t.innerHTML = html; t.hidden = false;
      const w = root.clientWidth; const tw = t.offsetWidth;
      t.style.left = `${Math.max(4, Math.min(w - tw - 4, x - tw / 2))}px`;
      t.style.top = `${Math.max(0, y - t.offsetHeight - 10)}px`;
    },
    esconder() { t.hidden = true; },
  };
}

const legenda = (itens) => `<ul class="chart-legend">${itens.map((i) =>
  `<li><span class="key ${i.linha ? 'key-line' : ''}" style="--k:${i.cor}"></span>${esc(i.nome)}</li>`).join('')}</ul>`;

/**
 * Colunas agrupadas por período (+ linha opcional na MESMA escala, em R$).
 * series: [{ nome, cor, valores[] }]  linha: { nome, cor, valores[] }
 */
export function colunas(el, opts) {
  observar(el, () => colunas(el, opts));
  const { rotulos, series, linha = null, altura = 240, titulo = '' } = opts;
  const W = largura(el); const H = altura; const M = { t: 12, r: 8, b: 26, l: 52 };
  const todos = series.flatMap((s) => s.valores).concat(linha ? linha.valores : []);
  const { ini, fim, ticks } = escala(Math.min(0, ...todos), Math.max(0, ...todos));
  const y = (v) => M.t + (H - M.t - M.b) * (1 - (v - ini) / (fim - ini));
  const n = rotulos.length;
  const banda = (W - M.l - M.r) / n;
  const larg = Math.min(18, (banda * 0.7) / series.length - 2);
  const x0 = (i) => M.l + banda * i + banda / 2;
  const r = 4;
  const barra = (cx, v) => {
    const y0 = y(0); const y1 = y(v); const h = Math.abs(y0 - y1);
    if (h < 0.5) return '';
    const rr = Math.min(r, h, larg / 2);
    const x = cx - larg / 2;
    // topo arredondado, base reta (positivo)
    return `<path d="M${x},${y0} V${y1 + rr} Q${x},${y1} ${x + rr},${y1} H${x + larg - rr} Q${x + larg},${y1} ${x + larg},${y1 + rr} V${y0} Z"/>`;
  };
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(titulo)}" width="${W}" height="${H}" class="chart-svg">`;
  svg += ticks.map((t) => `<line class="grid${t === 0 ? ' zero' : ''}" x1="${M.l}" x2="${W - M.r}" y1="${y(t)}" y2="${y(t)}"/>
    <text class="axis" x="${M.l - 6}" y="${y(t) + 4}" text-anchor="end">${brlCurto(t)}</text>`).join('');
  series.forEach((s, si) => {
    const off = (si - (series.length - 1) / 2) * (larg + 2);
    svg += `<g style="fill:${s.cor}">${s.valores.map((v, i) => barra(x0(i) + off, v)).join('')}</g>`;
  });
  if (linha) {
    const pts = linha.valores.map((v, i) => `${x0(i)},${y(v)}`).join(' ');
    svg += `<polyline class="line" style="stroke:${linha.cor}" points="${pts}"/>`;
    svg += linha.valores.map((v, i) => `<circle class="dot" cx="${x0(i)}" cy="${y(v)}" r="4" style="fill:${linha.cor}"/>`).join('');
  }
  const passoRot = Math.max(1, Math.ceil(46 / banda));
  svg += rotulos.map((rt, i) => ((n - 1 - i) % passoRot === 0 ? `<text class="axis" x="${x0(i)}" y="${H - 8}" text-anchor="middle">${esc(rt)}</text>` : '')).join('');
  svg += rotulos.map((_, i) => `<rect class="hit" data-i="${i}" x="${M.l + banda * i}" y="${M.t}" width="${banda}" height="${H - M.t - M.b}"/>`).join('');
  svg += '</svg>';
  const itensLeg = series.map((s) => ({ nome: s.nome, cor: s.cor })).concat(linha ? [{ nome: linha.nome, cor: linha.cor, linha: true }] : []);
  el.innerHTML = `${itensLeg.length > 1 ? legenda(itensLeg) : ''}<div class="chart-box">${svg}</div>`;
  const box = el.querySelector('.chart-box');
  const tip = dica(box);
  const mostrar = (i, ev) => {
    const html = `<strong>${esc(rotulos[i])}</strong>${series.map((s) => `<span><i style="--k:${s.cor}"></i>${esc(s.nome)}: ${brl(s.valores[i])}</span>`).join('')}${linha ? `<span><i class="l" style="--k:${linha.cor}"></i>${esc(linha.nome)}: ${brl(linha.valores[i])}</span>` : ''}`;
    const rect = box.getBoundingClientRect();
    const xPix = (x0(i) / W) * rect.width;
    tip.mostrar(html, xPix, ev ? Math.min(ev.clientY - rect.top, rect.height * 0.4) : rect.height * 0.3);
    box.querySelectorAll('.hit').forEach((h) => h.classList.toggle('on', Number(h.dataset.i) === i));
  };
  box.addEventListener('pointermove', (ev) => { const h = ev.target.closest('.hit'); if (h) mostrar(Number(h.dataset.i), ev); });
  box.addEventListener('pointerleave', () => { tip.esconder(); box.querySelectorAll('.hit.on').forEach((h) => h.classList.remove('on')); });
}

/** Linha do saldo diário: realizado (contínuo) e previsto (tracejado). */
export function linhaSaldo(el, opts) {
  observar(el, () => linhaSaldo(el, opts));
  const { dias, altura = 220, hoje } = opts;
  const W = largura(el); const H = altura; const M = { t: 12, r: 10, b: 26, l: 56 };
  const vals = dias.flatMap((d) => [d.saldo, d.saldoPrevisto]).filter((v) => v !== null);
  const { ini, fim, ticks } = escala(Math.min(0, ...vals), Math.max(0, ...vals));
  const y = (v) => M.t + (H - M.t - M.b) * (1 - (v - ini) / (fim - ini));
  const n = dias.length;
  const x = (i) => M.l + (n === 1 ? (W - M.l - M.r) / 2 : ((W - M.l - M.r) * i) / (n - 1));
  const real = dias.map((d, i) => (d.saldo === null ? null : `${x(i)},${y(d.saldo)}`)).filter(Boolean);
  const iHoje = dias.findIndex((d) => d.dia === hoje);
  const prev = dias.map((d, i) => ({ d, i })).filter(({ d }) => d.dia >= hoje).map(({ d, i }) => `${x(i)},${y(d.saldoPrevisto)}`);
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="chart-svg" role="img" aria-label="Evolução do saldo de caixa">`;
  svg += ticks.map((t) => `<line class="grid${t === 0 ? ' zero' : ''}" x1="${M.l}" x2="${W - M.r}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${M.l - 6}" y="${y(t) + 4}" text-anchor="end">${brlCurto(t)}</text>`).join('');
  if (real.length > 1) svg += `<polyline class="area" points="${x(0)},${y(Math.max(ini, 0))} ${real.join(' ')} ${real[real.length - 1].split(',')[0]},${y(Math.max(ini, 0))}"/>`;
  if (real.length) svg += `<polyline class="line" style="stroke:var(--c-saldo)" points="${real.join(' ')}"/>`;
  if (prev.length > 1) svg += `<polyline class="line line-prev" style="stroke:var(--c-saldo)" points="${prev.join(' ')}"/>`;
  if (iHoje >= 0) svg += `<line class="today" x1="${x(iHoje)}" x2="${x(iHoje)}" y1="${M.t}" y2="${H - M.b}"/><text class="axis" x="${x(iHoje)}" y="${M.t + 10}" text-anchor="middle">hoje</text>`;
  const marcas = [0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i);
  svg += marcas.map((i) => `<text class="axis" x="${x(i)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${dias[i].dia.slice(8, 10)}/${dias[i].dia.slice(5, 7)}</text>`).join('');
  svg += `<line class="cross" x1="0" x2="0" y1="${M.t}" y2="${H - M.b}" visibility="hidden"/>`;
  svg += '</svg>';
  el.innerHTML = `<ul class="chart-legend"><li><span class="key key-line" style="--k:var(--c-saldo)"></span>Saldo realizado</li><li><span class="key key-line key-prev" style="--k:var(--c-saldo)"></span>Saldo previsto (com contas pendentes)</li></ul><div class="chart-box">${svg}</div>`;
  const box = el.querySelector('.chart-box');
  const tip = dica(box);
  const svgEl = box.querySelector('svg');
  const cross = svgEl.querySelector('.cross');
  box.addEventListener('pointermove', (ev) => {
    const rect = svgEl.getBoundingClientRect();
    const xv = ((ev.clientX - rect.left) / rect.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.round(((xv - M.l) / (W - M.l - M.r)) * (n - 1))));
    const d = dias[i];
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
    const linhas = [`<strong>${d.dia.slice(8, 10)}/${d.dia.slice(5, 7)}</strong>`];
    if (d.saldo !== null) linhas.push(`<span>Saldo: ${brl(d.saldo)}</span>`);
    if (d.dia >= hoje) linhas.push(`<span>Previsto: ${brl(d.saldoPrevisto)}</span>`);
    if (d.entradas || d.saidas) linhas.push(`<span>Entrou ${brl(d.entradas)} · saiu ${brl(d.saidas)}</span>`);
    if (d.entradasPrev || d.saidasPrev) linhas.push(`<span>A receber ${brl(d.entradasPrev)} · a pagar ${brl(d.saidasPrev)}</span>`);
    tip.mostrar(linhas.join(''), (x(i) / W) * rect.width, 40);
  });
  box.addEventListener('pointerleave', () => { tip.esconder(); cross.setAttribute('visibility', 'hidden'); });
}

/** Barras horizontais em HTML (ranking de categorias). */
export function barrasH(el, itens, { total = null } = {}) {
  const max = Math.max(1, ...itens.map((i) => i.valor));
  el.innerHTML = `<ul class="hbars">${itens.map((i) => `
    <li title="${esc(i.rotulo)}: ${brl(i.valor)}">
      <span class="hb-label"><i class="swatch" style="--k:${i.cor}"></i>${esc(i.rotulo)}</span>
      <span class="hb-track"><span class="hb-fill" style="width:${(i.valor / max) * 100}%;--k:${i.cor}"></span></span>
      <span class="hb-val">${brl(i.valor)}${total ? `<small>${Math.round((i.valor / total) * 100)}%</small>` : ''}</span>
    </li>`).join('')}</ul>`;
}

/** Barra de progresso / uso de orçamento. */
export function medidor(uso, situacao) {
  const w = uso === null || !Number.isFinite(uso) ? (uso === Infinity ? 100 : 0) : Math.min(100, uso * 100);
  return `<span class="meter meter-${situacao}" role="img" aria-label="${uso === null ? 'sem limite' : `${Math.round((uso === Infinity ? 1 : uso) * 100)}% usado`}"><span style="width:${w}%"></span></span>`;
}
