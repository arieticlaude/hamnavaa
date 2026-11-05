/* هم‌نوا — عیب‌یابی اتصال پنل (ES5). هیچ داده‌ای نمی‌فرستد؛ فقط به آدرس‌های خود پنل و سرور داده درخواست آزمایشی می‌زند. */
(function () {
  'use strict';
  var CFG = window.PANEL_CONFIG || {};
  var rowsEl = document.getElementById('rows'), sumEl = document.getElementById('sum'), repEl = document.getElementById('rep');
  var results = [];

  function row(id, title) {
    var d = document.createElement('div'); d.className = 'row wait'; d.id = id;
    var b = document.createElement('b'); b.textContent = '…';
    var t = document.createElement('div'); t.innerHTML = '<span></span><small></small>';
    t.firstChild.textContent = title;
    d.appendChild(b); d.appendChild(t); rowsEl.appendChild(d);
    return d;
  }
  function set(d, ok, text, tech) {
    d.className = 'row ' + (ok ? 'ok' : 'bad'); d.firstChild.textContent = ok ? '✓' : '✕';
    d.lastChild.firstChild.textContent = text; d.lastChild.lastChild.textContent = tech || '';
    results.push({ id: d.id, ok: ok, text: text, tech: tech || '' });
  }
  function timeout(ms, p) {
    return new Promise(function (res, rej) {
      var t = setTimeout(function () { rej(new Error('timeout ' + ms + 'ms')); }, ms);
      p.then(function (v) { clearTimeout(t); res(v); }, function (e) { clearTimeout(t); rej(e); });
    });
  }
  function ms(t0) { return Math.round(Date.now() - t0) + ' ms'; }

  function run() {
    rowsEl.innerHTML = ''; results = []; sumEl.textContent = 'در حال آزمایش…'; repEl.textContent = '';
    var rBrowser = row('browser', 'مرورگر شما'), rSite = row('site', 'بارگذاری فایل‌های پنل از سایت هم‌نوا'),
        rApi = row('api', 'ارتباط مستقیم با سرور داده (برای ورود و فهرست جلسه‌ها)'), rWs = row('ws', 'ارتباط زنده با سرور (برای اعلان «اتاق باز شد»)'),
        rRelay = CFG.altUrl ? row('relay', 'مسیر جایگزین (واسطهٔ هم‌نوا روی Cloudflare)') : null;

    // 1) مرورگر
    var feats = [], miss = [];
    [['fetch', typeof fetch === 'function'], ['Promise', typeof Promise === 'function'], ['localStorage', (function () { try { localStorage.setItem('t', '1'); localStorage.removeItem('t'); return true; } catch (e) { return false; } })()],
     ['WebSocket', typeof WebSocket === 'function'], ['Intl', typeof Intl === 'object'], ['URLSearchParams', typeof URLSearchParams === 'function']].forEach(function (f) { (f[1] ? feats : miss).push(f[0]); });
    set(rBrowser, miss.length === 0, miss.length ? 'مرورگر این امکان‌ها را ندارد: ' + miss.join('، ') + '. مرورگر را به‌روز کنید یا Chrome را امتحان کنید.' : 'مرورگر مشکلی ندارد.', navigator.userAgent);

    // 2) فایل‌های خود سایت
    var t0 = Date.now();
    var p1 = timeout(12000, fetch('panel.js?d=' + Date.now(), { cache: 'no-store' })).then(function (r) { set(rSite, r.ok, r.ok ? 'فایل‌های پنل از سایت هم‌نوا بالا آمد (' + ms(t0) + ').' : 'سایت جواب داد ولی خطا داد.', 'HTTP ' + r.status); },
      function (e) { set(rSite, false, 'سایت هم‌نوا از این شبکه باز نشد یا خیلی کند است.', String(e.message || e)); });

    // 3) سرور داده
    var t1 = Date.now();
    var p2 = timeout(12000, fetch(CFG.url + '/auth/v1/health', { headers: { apikey: CFG.key }, cache: 'no-store' })).then(function (r) {
      var ok = r.status === 200 || r.status === 401;     // ۴۰۱ هم یعنی سرور رسیده و جواب داده
      set(rApi, ok, ok ? 'سرور داده در دسترس است (' + ms(t1) + ').' : 'سرور جواب داد ولی خطا داد.', 'HTTP ' + r.status);
    }, function (e) { set(rApi, false, 'سرور داده از این شبکه بسته است یا خیلی کند است. معمولاً علت همین است که پنل باز نمی‌شود.', String(e.message || e)); });

    // 4) WebSocket
    var p3 = new Promise(function (resolve) {
      var done = false, t2 = Date.now(), ws;
      function fin(ok, text, tech) { if (done) return; done = true; try { ws && ws.close(); } catch (e) { /* مهم نیست */ } set(rWs, ok, text, tech); resolve(); }
      try {
        ws = new WebSocket(CFG.url.replace(/^https/, 'wss') + '/realtime/v1/websocket?apikey=' + encodeURIComponent(CFG.key) + '&vsn=1.0.0');
        ws.onopen = function () { fin(true, 'ارتباط زنده برقرار شد (' + ms(t2) + ').', ''); };
        ws.onerror = function () { fin(false, 'ارتباط زنده برقرار نشد. پنل باز می‌شود ولی اعلان‌های لحظه‌ای ممکن است دیر برسد.', 'websocket error'); };
        setTimeout(function () { fin(false, 'ارتباط زنده در ۱۰ ثانیه برقرار نشد.', 'timeout 10000ms'); }, 10000);
      } catch (e) { fin(false, 'ارتباط زنده در این مرورگر ممکن نیست.', String(e.message || e)); }
    });

    var p4 = Promise.resolve();
    if (rRelay) {
      var t3 = Date.now();
      p4 = timeout(12000, fetch(CFG.altUrl + '/health', { cache: 'no-store' })).then(function (r) {
        set(rRelay, r.ok, r.ok ? 'مسیر جایگزین در دسترس است (' + ms(t3) + ').' : 'مسیر جایگزین جواب داد ولی خطا داد.', 'HTTP ' + r.status);
      }, function (e) { set(rRelay, false, 'مسیر جایگزین هم از این شبکه باز نشد.', String(e.message || e)); });
    }
    Promise.all([p1, p2, p3, p4]).then(summary);
  }

  function summary() {
    var by = {}; results.forEach(function (r) { by[r.id] = r; });
    var msg;
    if (!by.browser.ok) msg = 'مشکل از مرورگر است: آن را به‌روز کنید، یا پنل را با Chrome روی گوشی باز کنید.';
    else if (!by.site.ok) msg = 'خود سایت هم‌نوا از این شبکه باز نمی‌شود. اینترنت دیگری (مثلاً وای‌فای به‌جای سیم‌کارت) را امتحان کنید و این گزارش را به مدیر بدهید.';
    else if (!by.api.ok && by.relay && by.relay.ok) msg = 'سرور داده از این شبکه مستقیم بسته است، ولی مسیر جایگزین باز است؛ پنل خودش از همان مسیر می‌رود. «برگشت به پنل» را بزنید.';
    else if (!by.api.ok) msg = 'سایت باز می‌شود ولی سرور داده از این شبکه بسته است؛ علت اصلی باز نشدن پنل همین است. این گزارش را برای مدیر بفرستید تا راه جایگزین بسازد. فعلاً اینترنت دیگری یا فیلترشکن را امتحان کنید.';
    else if (!by.ws.ok) msg = 'پنل باید باز شود. فقط ارتباط زنده کند است (اعلان‌ها ممکن است دیر برسند).';
    else msg = 'همه‌چیز سالم است. اگر پنل هنوز باز نمی‌شود، «برگشت به پنل» را بزنید و در صفحهٔ ورود «پاک‌کردن ورود قبلی» را امتحان کنید.';
    sumEl.textContent = msg;
    var lines = ['Hamnavaa panel diagnostics', new Date().toISOString(), 'UA: ' + navigator.userAgent, 'online: ' + navigator.onLine];
    results.forEach(function (r) { lines.push((r.ok ? 'OK   ' : 'FAIL ') + r.id + ' | ' + r.text + (r.tech ? ' | ' + r.tech : '')); });
    repEl.textContent = lines.join('\n');
  }

  document.getElementById('again').onclick = run;
  document.getElementById('back').onclick = function () { location.href = './'; };
  document.getElementById('copy').onclick = function () {
    var txt = repEl.textContent, b = this;
    function done() { b.textContent = 'کپی شد ✓'; setTimeout(function () { b.textContent = 'کپی گزارش'; }, 2000); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () { window.getSelection().selectAllChildren(repEl); });
    else { var r = document.createRange(); r.selectNodeContents(repEl); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); try { document.execCommand('copy'); done(); } catch (e) { /* خودتان متن را انتخاب و کپی کنید */ } }
  };
  run();
})();
