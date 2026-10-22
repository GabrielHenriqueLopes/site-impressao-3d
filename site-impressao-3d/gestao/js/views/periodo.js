/* Seletor de período reutilizado nas telas. */
import { hoje, inicioMes, fimMes, somaMeses, inicioSemana, somaDias, dataBR, mesLongo } from '../format.js';
import { esc } from '../format.js';

export const PRESETS = {
  hoje: 'Hoje',
  semana: 'Esta semana',
  mes: 'Este mês',
  mes_anterior: 'Mês passado',
  trimestre: 'Últimos 3 meses',
  ano: 'Este ano',
  personalizado: 'Personalizado',
};

export function resolver(preset = 'mes', inicio, fim, ref = hoje()) {
  switch (preset) {
    case 'hoje': return { preset, inicio: ref, fim: ref };
    case 'semana': return { preset, inicio: inicioSemana(ref), fim: somaDias(inicioSemana(ref), 6) };
    case 'mes_anterior': { const i = somaMeses(ref, -1); return { preset, inicio: i, fim: fimMes(i) }; }
    case 'trimestre': return { preset, inicio: somaMeses(ref, -2), fim: fimMes(ref) };
    case 'ano': return { preset, inicio: `${ref.slice(0, 4)}-01-01`, fim: `${ref.slice(0, 4)}-12-31` };
    case 'personalizado':
      if (inicio && fim && inicio <= fim) return { preset, inicio, fim };
      return { preset: 'mes', inicio: inicioMes(ref), fim: fimMes(ref) };
    default: return { preset: 'mes', inicio: inicioMes(ref), fim: fimMes(ref) };
  }
}

export function rotulo(p) {
  if (p.inicio === inicioMes(p.inicio) && p.fim === fimMes(p.inicio)) return mesLongo(p.inicio);
  if (p.inicio === p.fim) return dataBR(p.inicio);
  return `${dataBR(p.inicio)} a ${dataBR(p.fim)}`;
}

/** HTML do filtro. presets: lista de chaves permitidas. */
export function filtroHTML(p, presets = Object.keys(PRESETS)) {
  return `<div class="period" data-period>
    <label class="sr-only" for="per-sel">Período</label>
    <select id="per-sel" data-per-preset>${presets.map((k) => `<option value="${k}"${k === p.preset ? ' selected' : ''}>${PRESETS[k]}</option>`).join('')}</select>
    <span class="period-custom" data-per-custom ${p.preset === 'personalizado' ? '' : 'hidden'}>
      <label class="sr-only" for="per-ini">De</label><input type="date" id="per-ini" data-per-ini value="${esc(p.inicio)}">
      <span aria-hidden="true">até</span>
      <label class="sr-only" for="per-fim">Até</label><input type="date" id="per-fim" data-per-fim value="${esc(p.fim)}">
    </span>
    <span class="period-label" data-per-label>${esc(rotulo(p))}</span>
  </div>`;
}

export function ligarFiltro(root, aoMudar) {
  const sel = root.querySelector('[data-per-preset]');
  const ini = root.querySelector('[data-per-ini]');
  const fim = root.querySelector('[data-per-fim]');
  const custom = root.querySelector('[data-per-custom]');
  const emitir = () => {
    const p = resolver(sel.value, ini.value, fim.value);
    custom.hidden = sel.value !== 'personalizado';
    if (sel.value !== 'personalizado') { ini.value = p.inicio; fim.value = p.fim; }
    root.querySelector('[data-per-label]').textContent = rotulo(p);
    aoMudar(p);
  };
  sel.addEventListener('change', emitir);
  ini.addEventListener('change', () => { if (ini.value && fim.value && ini.value <= fim.value) emitir(); });
  fim.addEventListener('change', () => { if (ini.value && fim.value && ini.value <= fim.value) emitir(); });
}
