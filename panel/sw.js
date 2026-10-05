/* هم‌نوا — پنل: سرویس‌ورکر کوچک برای «نصب روی گوشی».
   فقط فایل‌های خود پنل (/panel/) را، اول از شبکه و در صورت قطعی از حافظه، می‌دهد.
   هیچ درخواستی به Supabase یا هر آدرس دیگر را دست نمی‌زند و هیچ داده‌ای نگه نمی‌دارد. */
var V = 'hamnavaa-panel-v2';
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== V; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== self.location.origin || u.pathname.indexOf('/panel/') !== 0) return;
  e.respondWith(fetch(e.request).then(function (r) {
    if (r && r.ok) { var c = r.clone(); caches.open(V).then(function (x) { x.put(e.request, c); }); }
    return r;
  }).catch(function () {
    return caches.match(e.request).then(function (m) { return m || caches.match('/panel/'); });
  }));
});

/* اعلان‌های Web Push: «اتاق باز شد» برای منشی و مدیر */
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'هم‌نوا', {
    body: d.body || '', icon: 'icons/icon-192.png', tag: d.tag || 'hamnavaa', renotify: true,
    dir: 'rtl', lang: 'fa', requireInteraction: true, data: { url: d.url || '/panel/' }
  }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = new URL((e.notification.data && e.notification.data.url) || '/panel/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
    for (var i = 0; i < cs.length; i++) if (cs[i].url.indexOf('/panel/') >= 0 && 'focus' in cs[i]) return cs[i].focus();
    return self.clients.openWindow(url);
  }));
});
