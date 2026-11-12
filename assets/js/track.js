/* شمارندهٔ بازدید هم‌نوا: بدون کوکی، بدون ذخیرهٔ IP، بدون سرویس خارجی.
   فقط مسیر صفحه، منبع ورود، منطقهٔ زمانی، زبان و نوع دستگاه را به پایگاه‌دادهٔ خودمان می‌فرستد.
   برای حذف بازدیدهای خودتان: یک بار این آدرس را در همان مرورگر باز کنید: https://www.hamnavaa.com/?notrack=1 */
(function () {
  'use strict';
  try {
    if (location.protocol === 'file:' || /^(localhost|127\.|0\.0\.0\.0|.*\.local)$/.test(location.hostname)) return;
    if (/[?&]notrack=1/.test(location.search)) { try { localStorage.setItem('hn_notrack', '1'); } catch (e) { /* مهم نیست */ } return; }
    try { if (localStorage.getItem('hn_notrack')) return; } catch (e) { /* مهم نیست */ }
    if (navigator.webdriver) return;
    var ua = navigator.userAgent || '';
    if (/bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|whatsapp|telegrambot|embedly|python|curl|wget/i.test(ua)) return;
    var URL_ = 'https://bxrwcdonxeirhvpinwpz.supabase.co', ALT = 'https://hamnavaa-relay.arieticlaude.workers.dev';
    var KEY = 'sb_publishable_j0TSi0ik_6HZ_EccF01wvg_Nifs-YXT';
    var path = (location.pathname || '/').replace(/index\.html$/, '').replace(/\/{2,}/g, '/') || '/';
    var ref = '', entry = true;
    if (document.referrer) {
      var a = document.createElement('a'); a.href = document.referrer;
      if (a.hostname === location.hostname || a.hostname === 'www.' + location.hostname || 'www.' + a.hostname === location.hostname) entry = false;
      else ref = (a.hostname || '').replace(/^www\./, '');
    } else if (/Instagram/i.test(ua)) ref = 'instagram';
    else if (/FBAN|FBAV/i.test(ua)) ref = 'facebook';
    var m = /[?&]utm_source=([^&#]+)/.exec(location.search);
    if (m) { try { ref = decodeURIComponent(m[1]).toLowerCase().slice(0, 40); } catch (e) { /* مهم نیست */ } entry = true; }
    var tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* مهم نیست */ }
    var body = JSON.stringify({ p_path: path, p_ref: ref, p_entry: entry, p_tz: tz, p_lang: (navigator.language || '').slice(0, 12), p_dev: /Mobi|Android|iPhone|iPad/i.test(ua) ? 'm' : 'd' });
    var send = function (base, ms) {
      return new Promise(function (ok, no) {
        var ctl = window.AbortController ? new AbortController() : null, to = setTimeout(function () { if (ctl) ctl.abort(); no(new Error('timeout')); }, ms);
        fetch(base + '/rest/v1/rpc/track_view', { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: body, keepalive: true, signal: ctl ? ctl.signal : undefined })
          .then(function (r) { clearTimeout(to); if (r.ok || r.status === 204) ok(); else no(new Error('status ' + r.status)); }, function (e) { clearTimeout(to); no(e); });
      });
    };
    var go = function () { send(URL_, 4000).catch(function () { return send(ALT, 6000); }).catch(function () { /* شمارنده نباید هیچ‌وقت مزاحم سایت شود */ }); };
    if (document.readyState === 'complete') setTimeout(go, 300); else window.addEventListener('load', function () { setTimeout(go, 300); });
  } catch (e) { /* شمارنده نباید هیچ‌وقت مزاحم سایت شود */ }
})();
