/* Formatação e datas (sempre no fuso local, datas como 'AAAA-MM-DD'). */

export const centavos = (v) => Math.round(Number(v || 0) * 100);
export const reais = (c) => c / 100;

const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtBRLc = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
export const brl = (c) => fmtBRL.format(c / 100);
export const brlCurto = (c) => (Math.abs(c) >= 1000000 ? fmtBRLc.format(c / 100) : fmtBRL.format(c / 100).replace(/,00$/, ''));
export const pct = (x, casas = 0) => (x === null || x === undefined || !Number.isFinite(x) ? '—'
  : `${(x * 100).toLocaleString('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: casas })}%`);

/** "1.234,56" | "1234.56" | "R$ 12" → centavos (ou NaN). */
export function lerValor(txt) {
  let s = String(txt ?? '').replace(/[R$\s]/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return NaN;
  return Math.round(Number(s) * 100);
}
export const valorInput = (c) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const pad = (n) => String(n).padStart(2, '0');
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const deIso = (s) => { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d); };
export const hoje = () => iso(new Date());
export const somaDias = (s, n) => { const d = deIso(s); d.setDate(d.getDate() + n); return iso(d); };
export const inicioMes = (s) => `${s.slice(0, 7)}-01`;
export const fimMes = (s) => { const d = deIso(inicioMes(s)); d.setMonth(d.getMonth() + 1, 0); return iso(d); };
export const somaMeses = (s, n) => { const d = deIso(inicioMes(s)); d.setMonth(d.getMonth() + n); return iso(d); };
export const diasEntre = (a, b) => Math.round((deIso(b) - deIso(a)) / 86400000);
export const inicioSemana = (s) => { const d = deIso(s); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return iso(d); }; // segunda-feira

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const dataBR = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '—');
export const dataCurta = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '—');
export const mesCurto = (s) => `${MESES[Number(s.slice(5, 7)) - 1]}/${s.slice(2, 4)}`;
export const mesLongo = (s) => `${MESES_LONGO[Number(s.slice(5, 7)) - 1]} de ${s.slice(0, 4)}`;
export const dataHora = (ts) => new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export const esc = (str = '') => String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const FORMAS = {
  pix: 'Pix', dinheiro: 'Dinheiro', cartao_credito: 'Cartão de crédito', cartao_debito: 'Cartão de débito',
  boleto: 'Boleto', transferencia: 'Transferência', outro: 'Outro',
};
export const ORIGENS = {
  whatsapp: 'WhatsApp', instagram: 'Instagram', site: 'Site', indicacao: 'Indicação', feira: 'Feira/evento', outro: 'Outro',
};
export const GRUPOS = {
  venda: 'Venda (faturamento)',
  frete: 'Frete cobrado (faturamento)',
  outra: 'Outra receita (fora do faturamento)',
  aporte: 'Aporte do dono (não é receita)',
  custo_producao: 'Custo de produção/venda',
  operacional: 'Despesa operacional',
  imposto: 'Imposto',
  investimento: 'Investimento (fora do lucro)',
  retirada: 'Retirada do dono (fora do lucro)',
};
export const GRUPOS_RECEITA = ['venda', 'frete', 'outra', 'aporte'];
export const GRUPOS_DESPESA = ['custo_producao', 'operacional', 'imposto', 'investimento', 'retirada'];
export const PAPEIS = { admin: 'Administrador', gerente: 'Gerente', funcionario: 'Funcionário' };
