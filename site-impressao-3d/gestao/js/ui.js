/* Componentes de interface: avisos, diálogos, confirmação, campos e tabelas. */
import { esc, lerValor, valorInput } from './format.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export const icon = (id, cls = '') => `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;

/* ---------- avisos (toasts) ---------- */
export function toast(msg, tipo = 'ok', ms = 4200) {
  let box = $('#toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('aria-live', 'polite'); document.body.append(box); }
  const el = document.createElement('div');
  el.className = `toast toast-${tipo}`;
  el.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
  el.innerHTML = `${icon(tipo === 'erro' ? 'alert' : tipo === 'aviso' ? 'alert' : 'check')}<span>${esc(msg)}</span>`;
  box.append(el);
  setTimeout(() => { el.classList.add('saindo'); setTimeout(() => el.remove(), 300); }, tipo === 'erro' ? ms + 2500 : ms);
}
export const erro = (e) => { console.error(e); toast(e?.message || String(e), 'erro'); };

/* ---------- diálogos ---------- */
export function modal({ titulo, corpo, largura = 'md', rodape = '', aoAbrir, aoFechar }) {
  const dlg = document.createElement('dialog');
  dlg.className = `dlg dlg-${largura}`;
  const tid = `dlg-t-${Math.random().toString(36).slice(2, 8)}`;
  dlg.setAttribute('aria-labelledby', tid);
  dlg.innerHTML = `
    <div class="dlg-head"><h2 id="${tid}">${titulo}</h2>
      <button type="button" class="icon-btn" data-fechar aria-label="Fechar">${icon('x')}</button></div>
    <div class="dlg-body">${corpo}</div>
    ${rodape ? `<div class="dlg-foot">${rodape}</div>` : ''}`;
  document.body.append(dlg);
  const fechar = (v) => { if (dlg.open) dlg.close(v); };
  dlg.addEventListener('close', () => { aoFechar?.(dlg.returnValue); dlg.remove(); });
  dlg.addEventListener('click', (e) => {
    if (e.target.closest('[data-fechar]')) fechar('');
    if (e.target === dlg) fechar('');            // clique fora
  });
  dlg.showModal();
  aoAbrir?.(dlg, fechar);
  const primeiro = dlg.querySelector('[autofocus], .dlg-body input:not([type=hidden]), .dlg-body select, .dlg-body textarea');
  primeiro?.focus();
  return { dlg, fechar };
}

export function confirmar({ titulo = 'Confirmar', texto, botao = 'Confirmar', perigo = false }) {
  return new Promise((resolve) => {
    modal({
      titulo, largura: 'sm',
      corpo: `<p class="dlg-texto">${texto}</p>`,
      rodape: `<button type="button" class="btn btn-ghost" data-fechar>Cancelar</button>
               <button type="button" class="btn ${perigo ? 'btn-perigo' : 'btn-accent'}" data-ok>${botao}</button>`,
      aoAbrir: (dlg, fechar) => {
        dlg.querySelector('[data-ok]').addEventListener('click', () => fechar('ok'));
        dlg.querySelector('[data-ok]').focus();
      },
      aoFechar: (v) => resolve(v === 'ok'),
    });
  });
}

/* ---------- campos ---------- */
export function campo({ nome, rotulo, tipo = 'text', valor = '', obrig = false, ajuda = '', attrs = '', opcoes = null, cls = '' }) {
  const id = `f-${nome}-${Math.random().toString(36).slice(2, 7)}`;
  const req = obrig ? ' required' : '';
  let input;
  if (opcoes) {
    input = `<select id="${id}" name="${nome}"${req} ${attrs}>${opcoes.map((o) =>
      `<option value="${esc(o.valor)}"${String(o.valor) === String(valor ?? '') ? ' selected' : ''}${o.disabled ? ' disabled' : ''}>${esc(o.rotulo)}</option>`).join('')}</select>`;
  } else if (tipo === 'textarea') {
    input = `<textarea id="${id}" name="${nome}" rows="3"${req} ${attrs}>${esc(valor)}</textarea>`;
  } else if (tipo === 'dinheiro') {
    input = `<div class="input-money"><span aria-hidden="true">R$</span><input id="${id}" name="${nome}" type="text" inputmode="decimal" autocomplete="off" value="${valor === '' || valor === null ? '' : esc(valorInput(valor))}" placeholder="0,00"${req} data-money ${attrs}></div>`;
  } else {
    input = `<input id="${id}" name="${nome}" type="${tipo}" value="${esc(valor ?? '')}"${req} ${attrs}>`;
  }
  return `<div class="field ${cls}" data-field="${nome}">
    <label for="${id}">${esc(rotulo)}${obrig ? ' <span class="req" aria-hidden="true">*</span>' : ''}</label>
    ${input}
    ${ajuda ? `<p class="field-help">${ajuda}</p>` : ''}
    <p class="field-error" hidden></p>
  </div>`;
}

export function erroCampo(form, nome, msg) {
  const f = form.querySelector(`[data-field="${nome}"]`);
  if (!f) { toast(msg, 'erro'); return; }
  const p = f.querySelector('.field-error');
  p.textContent = msg; p.hidden = false;
  const inp = f.querySelector('input,select,textarea');
  inp?.setAttribute('aria-invalid', 'true');
  inp?.focus();
}
export function limparErros(form) {
  $$('.field-error', form).forEach((p) => { p.hidden = true; });
  $$('[aria-invalid]', form).forEach((i) => i.removeAttribute('aria-invalid'));
}
export const dados = (form) => Object.fromEntries(new FormData(form).entries());
export const dinheiro = (form, nome) => lerValor(form.elements[nome]?.value);

/** Formata o campo de valor ao sair dele (1234,5 → 1.234,50). */
export function ligarDinheiro(root) {
  $$('[data-money]', root).forEach((inp) => {
    inp.addEventListener('blur', () => {
      const c = lerValor(inp.value);
      if (Number.isFinite(c)) inp.value = valorInput(c);
    });
  });
}

/** Botão em estado "salvando…" enquanto a promessa roda (evita clique duplo). */
export async function ocupado(btn, fn) {
  if (btn.disabled) return undefined;
  const txt = btn.innerHTML;
  btn.disabled = true; btn.setAttribute('aria-busy', 'true');
  btn.innerHTML = `<span class="spinner" aria-hidden="true"></span> ${btn.dataset.busy || 'Salvando…'}`;
  try { return await fn(); } finally { btn.disabled = false; btn.removeAttribute('aria-busy'); btn.innerHTML = txt; }
}

export function vazio({ icone = 'inbox', titulo, texto = '', acao = '' }) {
  return `<div class="empty">${icon(icone, 'empty-icon')}<h3>${titulo}</h3>${texto ? `<p>${texto}</p>` : ''}${acao}</div>`;
}

export const selo = (status) => {
  const m = { pago: ['Pago', 'ok'], vencido: ['Vencido', 'critico'], pendente: ['Pendente', 'neutro'], cancelado: ['Cancelado', 'apagado'],
    recebido: ['Recebido', 'ok'] };
  const [t, c] = m[status] || [status, 'neutro'];
  return `<span class="tag tag-${c}">${status === 'vencido' ? icon('alert') : status === 'pago' ? icon('check') : ''}${t}</span>`;
};

export function baixarArquivo(nome, conteudo, tipo = 'text/plain') {
  const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export const csv = (linhas) => '﻿' + linhas.map((r) => r.map((v) => {
  const s = String(v ?? '');
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}).join(';')).join('\r\n');
