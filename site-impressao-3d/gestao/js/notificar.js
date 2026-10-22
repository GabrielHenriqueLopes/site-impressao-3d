/* Notificações do navegador (API Notification) — só com permissão do usuário.
   Funcionam enquanto o aplicativo está aberto (mesmo em segundo plano).
   Cada aviso é mostrado uma única vez por aparelho. */
const CHAVE = 'gestao.avisosMostrados';

export const permissaoNavegador = () => (typeof Notification === 'undefined' ? 'indisponivel' : Notification.permission);

export async function pedirPermissao() {
  if (typeof Notification === 'undefined') return 'indisponivel';
  try { return await Notification.requestPermission(); } catch { return Notification.permission; }
}

function mostrados() {
  try { return new Set(JSON.parse(localStorage.getItem(CHAVE) || '[]')); } catch { return new Set(); }
}
function guardar(set) {
  try { localStorage.setItem(CHAVE, JSON.stringify([...set].slice(-500))); } catch { /* sem armazenamento */ }
}

/** Mostra no aparelho os avisos não lidos que ainda não foram exibidos aqui. */
export function notificarNovos(naoLidas, aoClicar) {
  const vistos = mostrados();
  const primeiraVez = vistos.size === 0;
  const novos = naoLidas.filter((n) => !vistos.has(n.id));
  novos.forEach((n) => vistos.add(n.id));
  guardar(vistos);
  if (permissaoNavegador() !== 'granted' || !novos.length) return;
  // na primeira vez neste aparelho, um resumo em vez de vários alertas de uma vez
  const lista = primeiraVez && novos.length > 1 ? [{ id: 'resumo', titulo: `${novos.length} avisos de pedidos`, texto: 'Abra o aplicativo para ver os prazos.' }] : novos.slice(0, 3);
  for (const n of lista) {
    const opcoes = { body: n.texto, tag: `gestao-${n.id}`, icon: '../assets/icons/favicon.svg' };
    if (registro) { registro.showNotification(n.titulo, opcoes).catch(() => {}); continue; }
    try {
      const notif = new Notification(n.titulo, opcoes);
      notif.onclick = () => { window.focus(); aoClicar?.(n); notif.close(); };
    } catch { /* sem suporte */ }
  }
}

/* No Android, notificações só funcionam por meio de um service worker. */
let registro = null;
export async function registrarServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  try { registro = await navigator.serviceWorker.register('sw.js'); } catch { registro = null; }
}
