/* Service worker mínimo: só para exibir notificações no celular (Android exige)
   e abrir o aplicativo ao tocar nelas. Não guarda nada em cache. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const abertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const app = abertas.find((c) => c.url.includes('/gestao/'));
    if (app) { await app.focus(); app.navigate?.(new URL('./#/avisos', self.registration.scope).href); return; }
    await self.clients.openWindow(new URL('./#/avisos', self.registration.scope).href);
  })());
});
