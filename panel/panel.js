/* هم‌نوا — پنل مشاور
   ورود، فهرست جلسه‌ها، دکمهٔ اتاق مشاوره، و فرم ثبت جلسه برای منشی.
   هیچ داده‌ای این‌جا نگه داشته نمی‌شود؛ همه‌چیز از پایگاه‌داده می‌آید و «چه کسی چه چیزی را ببیند»
   را خود پایگاه‌داده (RLS) تعیین می‌کند، نه این صفحه. */
(function () {
  'use strict';

  var CFG = window.PANEL_CONFIG || {};
  var LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  var MOCK = LOCAL && /[?&]mock=/.test(location.search);
  var TEHRAN_MIN = 210;                       // ایران دیگر ساعت تابستانی ندارد: همیشه UTC+3:30
  var JOIN_BEFORE_MIN = 15, JOIN_AFTER_MIN = 30;
  var MEET_RE = /^https:\/\/meet\.google\.com\/[a-z0-9-]+$/;

  // پیوند دعوت یا بازیابی رمز، قبل از آن‌که کتابخانه هش آدرس را پاک کند
  var LINK_TYPE = new URLSearchParams(location.hash.replace(/^#/, '')).get('type');

  var app = document.getElementById('app');
  var sb = null;
  var S = { user: null, profile: null, view: 'loading', tab: 'sessions', flash: null, data: {}, room: null };

  /* ───────────── ابزارهای کوچک ───────────── */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach(function (x) { add(el, x); });
    else el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
  }

  var MARK = '<svg viewBox="0 0 84 84" fill="none" aria-hidden="true"><path d="M14 18 h56 a8 8 0 0 1 8 8 v28 a8 8 0 0 1 -8 8 h-30 l-16 14 v-14 h-10 a8 8 0 0 1 -8 -8 v-28 a8 8 0 0 1 8 -8 Z" fill="#3A6259"/><rect x="28" y="34" width="6" height="14" rx="3" fill="#FDFBF5"/><rect x="39" y="28" width="6" height="26" rx="3" fill="#B78A46"/><rect x="50" y="34" width="6" height="14" rx="3" fill="#FDFBF5"/></svg>';
  var VIDEO_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="6" width="14" height="12" rx="3"/><path d="M16 10l6-3v10l-6-3z"/></svg>';
  var nf = new Intl.NumberFormat('fa-IR');
  function n(x) { return nf.format(x); }                       // رقم فارسی
  function ltr(t) { return h('bdi', { dir: 'ltr', text: t }); }  // عبارت انگلیسی میان متن فارسی به‌هم نریزد
  function svgEl(markup) { var d = document.createElement('span'); d.innerHTML = markup; return d.firstChild; }

  var fmtTime = new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', hour12: false });
  var timeOf = function (ts) { return fmtTime.format(new Date(ts)); };

  /* ───────────── تقویم شمسی ↔ میلادی ─────────────
     الگوریتم jalaali-js (MIT). درستی‌اش با Intl مقایسه و آزمون شده است. */
  var npf = new Intl.NumberFormat('fa-IR', { useGrouping: false });
  function np(x) { return npf.format(x); }                       // رقم فارسی بدون جداکنندهٔ هزارگان
  function pad2(x) { return (x < 10 ? '۰' : '') + np(x); }
  var J_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
  var J_WEEK = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
  var G_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function div(a, b) { return ~~(a / b); }
  function mod(a, b) { return a - ~~(a / b) * b; }
  var BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  function jalCal(jy) {
    var gy = jy + 621, leapJ = -14, jp = BREAKS[0], jm, jump = 0, leap, leapG, march, k, i;
    for (i = 1; i < BREAKS.length; i += 1) {
      jm = BREAKS[i]; jump = jm - jp;
      if (jy < jm) break;
      leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4); jp = jm;
    }
    k = jy - jp;
    leapJ = leapJ + div(k, 33) * 8 + div(mod(k, 33) + 3, 4);
    if (mod(jump, 33) === 4 && jump - k === 4) leapJ += 1;
    leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
    march = 20 + leapJ - leapG;
    if (jump - k < 6) k = k - jump + div(jump + 4, 33) * 33;
    leap = mod(mod(k + 1, 33) - 1, 4);
    if (leap === -1) leap = 4;
    return { leap: leap, gy: gy, march: march };
  }
  function g2d(gy, gm, gd) {
    var d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
    return d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  }
  function d2g(jdn) {
    var j = 4 * jdn + 139361631;
    j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
    var i = div(mod(j, 1461), 4) * 5 + 308;
    var gd = div(mod(i, 153), 5) + 1, gm = mod(div(i, 153), 12) + 1;
    return { gy: div(j, 1461) - 100100 + div(8 - gm, 6), gm: gm, gd: gd };
  }
  function j2d(jy, jm, jd) {
    var r = jalCal(jy);
    return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
  }
  function d2j(jdn) {
    var gy = d2g(jdn).gy, jy = gy - 621, r = jalCal(jy), jdn1f = g2d(gy, 3, r.march), k = jdn - jdn1f, jm, jd;
    if (k >= 0) {
      if (k <= 185) return { jy: jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
      k -= 186;
    } else {
      jy -= 1; k += 179;
      if (r.leap === 1) k += 1;
    }
    jm = 7 + div(k, 30); jd = mod(k, 30) + 1;
    return { jy: jy, jm: jm, jd: jd };
  }
  function toJalali(gy, gm, gd) { return d2j(g2d(gy, gm, gd)); }
  function toGregorian(jy, jm, jd) { return d2g(j2d(jy, jm, jd)); }
  function jMonthLen(jy, jm) { return jm <= 6 ? 31 : (jm <= 11 ? 30 : (jalCal(jy).leap === 0 ? 30 : 29)); }
  window.__panelCal = { toJalali: toJalali, toGregorian: toGregorian, jMonthLen: jMonthLen };   // برای آزمون

  function isoOf(gy, gm, gd) { return gy + '-' + (gm < 10 ? '0' : '') + gm + '-' + (gd < 10 ? '0' : '') + gd; }
  function tehranDate(ts) {
    var t = new Date(new Date(ts).getTime() + TEHRAN_MIN * 60000);
    return { gy: t.getUTCFullYear(), gm: t.getUTCMonth() + 1, gd: t.getUTCDate(), wd: t.getUTCDay() };
  }
  function dayJ(ts) {                       // «یکشنبه ۱۲ مهر ۱۴۰۵»
    var d = tehranDate(ts), j = toJalali(d.gy, d.gm, d.gd);
    return J_WEEK[(d.wd + 1) % 7] + ' ' + np(j.jd) + ' ' + J_MONTHS[j.jm - 1] + ' ' + np(j.jy);
  }
  function dayG(ts) { var d = tehranDate(ts); return G_MONTHS[d.gm - 1] + ' ' + d.gd + ', ' + d.gy; }   // «Oct 4, 2026»
  var dayOf = function (ts) { return dayJ(ts) + ' (' + dayG(ts) + ')'; };       // برای متن پیام‌ها
  // همان تاریخ برای نمایش در صفحه: بخش لاتین یک تکه می‌ماند و وسط خط شکسته نمی‌شود
  function dayNode(ts) { var f = document.createDocumentFragment(), g = ltr('(' + dayG(ts) + ')'); g.style.whiteSpace = 'nowrap'; f.appendChild(document.createTextNode(dayJ(ts) + ' ')); f.appendChild(g); return f; }

  /* «۲۰۲۶-۱۰-۰۴T۱۸:۳۰» که منشی به وقت تهران می‌نویسد ← لحظهٔ UTC */
  function tehranToUtc(local) {
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local || '');
    if (!m) return null;
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - TEHRAN_MIN * 60000);
  }
  function tehranDateInput(offsetDays) {
    var t = new Date(Date.now() + TEHRAN_MIN * 60000 + (offsetDays || 0) * 86400000);
    return t.toISOString().slice(0, 10);
  }

  var STATUS = { scheduled: 'برنامه‌ریزی‌شده', done: 'انجام‌شد', client_cancelled: 'لغو توسط مراجع',
    client_no_show: 'غیبت مراجع', counselor_absent: 'غیبت مشاور', counselor_cancelled: 'لغو توسط مشاور' };
  var MODE = { video: 'تصویری', audio: 'صوتی' };
  var KIND = { intro: 'معارفه', session: 'جلسه' };

  function phoneDigits(p) {
    var d = String(p || '').replace(/[^\d]/g, '');
    if (d.indexOf('00') === 0) d = d.slice(2);
    if (/^09\d{9}$/.test(d)) d = '98' + d.slice(1);
    return d;
  }
  function waLink(number, text) { return 'https://wa.me/' + number + '?text=' + encodeURIComponent(text); }

  function explain(err) {
    var m = String((err && (err.message || err.error_description)) || err || '');
    if (/invalid login/i.test(m)) return 'ایمیل یا رمز عبور اشتباه است.';
    if (/not confirmed/i.test(m)) return 'ایمیل هنوز تأیید نشده است.';
    if (/rate limit|too many/i.test(m)) return 'تلاش‌ها زیاد بود. چند دقیقه بعد دوباره امتحان کنید.';
    if (/not due yet|not found/i.test(m)) return 'جلسه پیدا نشد یا هنوز وقتش نشده است.';
    if (/invalid meet/i.test(m)) return 'لینک Meet معتبر نیست. باید شبیه meet.google.com/abc-defg-hij باشد.';
    if (/weak|at least/i.test(m)) return 'رمز عبور باید قوی‌تر باشد.';
    if (/failed to fetch|network|load failed/i.test(m)) return 'اتصال به سرور برقرار نشد. اینترنت را بررسی کنید.';
    return 'خطایی رخ داد. دوباره امتحان کنید.';
  }
  function flash(type, text) { S.flash = { type: type, text: text }; }

  /* ───────────── اتصال ───────────── */
  function connect() {
    if (MOCK) { return window.__panelMock(/[?&]mock=(\w+)/.exec(location.search)[1]); }
    return window.supabase.createClient(CFG.url, CFG.key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }

  function boot() {
    if (!MOCK && (!window.supabase || !CFG.url || !CFG.key)) { app.textContent = 'پیکربندی پنل کامل نیست.'; return; }
    sb = connect();
    sb.auth.onAuthStateChange(function (event, session) {
      // درون این تابع به پایگاه‌داده زنگ نزنید؛ به یک چرخه بعد موکول می‌شود
      setTimeout(function () { onSession(event, session); }, 0);
    });
    sb.auth.getSession().then(function (r) { onSession('INITIAL', r.data && r.data.session); });
    // صفحهٔ مشاور هر دقیقه تازه می‌شود (پنجرهٔ ورود به اتاق)، ولی هرگز وسط نوشتن در یک فیلد
    setInterval(function () {
      var tag = (document.activeElement && document.activeElement.tagName) || '';
      if (S.view === 'counselor' && !/INPUT|SELECT|TEXTAREA/.test(tag)) loadCounselor();
    }, 60000);
  }

  function onSession(event, session) {
    if (!session) { S.user = null; S.profile = null; S.view = 'login'; return render(); }
    S.user = session.user;
    if (S.view === 'setpw' && event !== 'PASSWORD_RECOVERY') return;   // فرم رمز باز است؛ دوباره نکشیمش
    if (event === 'PASSWORD_RECOVERY' || ((LINK_TYPE === 'invite' || LINK_TYPE === 'recovery') && S.view !== 'ready')) {
      S.view = 'setpw'; return render();
    }
    if (S.profile && S.profile.id === S.user.id) return;          // رویداد تکراری
    loadProfile();
  }

  function loadProfile() {
    sb.from('profiles').select('*').eq('id', S.user.id).maybeSingle().then(function (r) {
      if (r.error) { flash('err', explain(r.error)); S.view = 'login'; return render(); }
      S.profile = r.data;
      if (!r.data || !r.data.active) { S.view = 'pending'; return render(); }
      S.view = (r.data.role === 'counselor') ? 'counselor' : 'staff';
      if (S.view === 'counselor') loadCounselor();
      else { S.tab = 'board'; startRealtime(); loadStaff(); refreshPush(); }
    });
  }

  /* ───────────── صفحه‌ها ───────────── */
  function shell(children) {
    var head = h('header', { class: 'top' },
      h('div', { class: 'brand' }, svgEl(MARK), h('div', null, h('b', { text: 'هم‌نوا' }), h('br'), h('span', { text: 'پنل مشاور' }))),
      S.user ? h('div', { class: 'who' }, h('span', { text: (S.profile && S.profile.full_name) || S.user.email }),
        h('button', { class: 'btn btn--small', type: 'button', onclick: signOut, text: 'خروج' })) : null);
    var nodes = [head];
    if (S.flash) nodes.push(h('div', { class: 'flash flash--' + S.flash.type, role: 'status', text: S.flash.text }));
    S.flash = null;
    (Array.isArray(children) ? children : [children]).forEach(function (c) { if (c) nodes.push(c); });
    var inst = installCard();
    if (inst) nodes.push(inst);
    app.replaceChildren.apply(app, nodes);
  }

  /* ───────────── اعلان روی گوشی (Web Push) ───────────── */
  function b64ToBytes(b) {
    var s = (b + '='.repeat((4 - b.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'), raw = atob(s), out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function pushSupported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
  function refreshPush() {
    var ios = /iphone|ipad|ipod/i.test(navigator.userAgent || '');
    if (!CFG.vapidPublicKey) S.push = { state: 'unsupported' };
    else if (!pushSupported()) S.push = { state: (ios && !isStandalone()) ? 'need-install' : 'unsupported' };
    else if (Notification.permission === 'denied') S.push = { state: 'denied' };
    else {
      S.push = { state: 'checking' };
      navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) {
        S.push = { state: sub ? 'on' : 'off' }; render();
      }).catch(function () { S.push = { state: 'off' }; render(); });
    }
  }
  function enablePush() {
    S.push = { state: 'busy' }; render();
    Notification.requestPermission().then(function (perm) {
      if (perm !== 'granted') { S.push = { state: perm === 'denied' ? 'denied' : 'off' }; return render(); }
      return navigator.serviceWorker.ready.then(function (reg) {
        return reg.pushManager.getSubscription().then(function (old) {
          return old || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(CFG.vapidPublicKey) });
        });
      }).then(function (sub) {
        var j = sub.toJSON();
        return sb.from('push_subscriptions').upsert({ user_id: S.user.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth,
          user_agent: (navigator.userAgent || '').slice(0, 200) }, { onConflict: 'endpoint' });
      }).then(function (r) {
        if (r.error) { flash('err', 'ذخیرهٔ اعلان انجام نشد. دوباره امتحان کنید.'); S.push = { state: 'off' }; }
        else { flash('ok', 'اعلان روی این گوشی فعال شد.'); S.push = { state: 'on' }; }
        render();
      });
    }).catch(function () { S.push = { state: 'off' }; flash('err', 'فعال‌سازی اعلان انجام نشد.'); render(); });
  }
  function disablePush() {
    navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) {
      if (!sub) return null;
      var ep = sub.toJSON().endpoint;
      return sb.from('push_subscriptions').delete().eq('endpoint', ep).then(function () { return sub.unsubscribe(); });
    }).then(function () { S.push = { state: 'off' }; flash('ok', 'اعلان روی این گوشی خاموش شد.'); render(); })
      .catch(function () { flash('err', 'خاموش کردن انجام نشد.'); render(); });
  }
  function testPush() {
    navigator.serviceWorker.ready.then(function (reg) {
      return reg.showNotification('آزمایش اعلان', { body: 'اگر این را می‌بینید، اعلان‌ها روی همین گوشی کار می‌کنند.', icon: 'icons/icon-192.png', dir: 'rtl', lang: 'fa', tag: 'hn-test' });
    });
  }
  function pushCard() {
    var st = (S.push && S.push.state) || 'checking';
    var msg = {
      unsupported: 'این مرورگر اعلان نمی‌دهد. در اندروید از Chrome و در آیفون از Safari (پنل نصب‌شده) استفاده کنید.',
      'need-install': 'در آیفون اعلان فقط برای پنلِ نصب‌شده کار می‌کند: پنل را با «Add to Home Screen» به صفحهٔ اصلی اضافه کنید و از همان آیکون باز کنید؛ بعد این دکمه فعال می‌شود.',
      denied: 'اعلان برای هم‌نوا بسته است. در تنظیمات گوشی یا مرورگر، اعلان‌های این سایت را روشن کنید و صفحه را دوباره باز کنید.',
      checking: 'در حال بررسی…', busy: 'لطفاً صبر کنید…',
      off: 'وقتی مشاوری وارد اتاق شود، حتی اگر پنل بسته باشد، روی همین گوشی اعلان می‌آید.',
      on: 'اعلان روی این گوشی فعال است. وقتی مشاوری وارد اتاق شود، حتی با بسته بودن پنل، خبر می‌رسد.'
    }[st];
    var acts = h('div', { class: 'actions' });
    if (st === 'off') acts.appendChild(h('button', { class: 'btn btn--primary', type: 'button', text: 'فعال‌سازی اعلان روی گوشی', onclick: enablePush }));
    if (st === 'on') {
      acts.appendChild(h('button', { class: 'btn btn--small', type: 'button', text: 'اعلان آزمایشی', onclick: testPush }));
      acts.appendChild(h('button', { class: 'btn btn--small btn--danger', type: 'button', text: 'خاموش کردن', onclick: disablePush }));
    }
    return h('section', { class: 'card push' }, h('h3', null, 'اعلان روی گوشی ', st === 'on' ? h('span', { class: 'chip chip--ok', text: 'فعال ✓' }) : null),
      h('p', { class: 'hint', text: msg }), acts);
  }

  /* ───────────── نصب روی گوشی (مثل یک اپ) ───────────── */
  var deferredInstall = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredInstall = e; if (S.view !== 'loading') render(); });
  window.addEventListener('appinstalled', function () { deferredInstall = null; try { localStorage.setItem('hn_install_hide', '1'); } catch (x) { /* ok */ } render(); });
  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  }
  function installCard() {
    if (isStandalone()) return null;
    try { if (localStorage.getItem('hn_install_hide') === '1') return null; } catch (x) { /* ok */ }
    var ua = navigator.userAgent || '';
    var ios = /iphone|ipad|ipod/i.test(ua), android = /android/i.test(ua);
    if (!ios && !android && !(window.matchMedia && window.matchMedia('(max-width:700px)').matches)) return null;
    var body;
    if (deferredInstall) {
      body = [h('p', { class: 'hint', text: 'با یک لمس، پنل مثل یک اپ روی صفحهٔ اصلی گوشی‌تان می‌نشیند.' }),
        h('div', { class: 'actions' }, h('button', { class: 'btn btn--primary', type: 'button', text: 'نصب روی گوشی', onclick: function () {
          var d = deferredInstall; deferredInstall = null; d.prompt();
          if (d.userChoice) d.userChoice.then(function () { render(); });
        } }))];
    } else if (ios) {
      body = [h('p', { class: 'hint', text: 'در Safari: دکمهٔ «اشتراک‌گذاری» (مربع با فلش رو به بالا) ← «Add to Home Screen» (افزودن به صفحهٔ آغاز) ← «Add».' })];
    } else {
      body = [h('p', { class: 'hint', text: 'در Chrome: منوی ⋮ بالای صفحه ← «Install app» (نصب برنامه) یا «Add to Home screen» ← «Install».' })];
    }
    return h('section', { class: 'card install' }, h('h3', { text: 'پنل را روی گوشی نصب کنید' }), body,
      h('div', { class: 'actions' }, h('button', { class: 'btn btn--small', type: 'button', text: 'بعداً', onclick: function () {
        try { localStorage.setItem('hn_install_hide', '1'); } catch (x) { /* ok */ }
        render();
      } })));
  }

  function render() {
    ({ loading: vLoading, login: vLogin, setpw: vSetPw, pending: vPending, counselor: vCounselor, staff: vStaff }[S.view] || vLoading)();
  }
  function vLoading() { app.replaceChildren(h('p', { class: 'boot', text: 'در حال بارگذاری…' })); }

  function vLogin() {
    var email = h('input', { class: 'input', type: 'email', id: 'em', dir: 'ltr', autocomplete: 'username', required: true });
    var pass = h('input', { class: 'input', type: 'password', id: 'pw', dir: 'ltr', autocomplete: 'current-password', required: true });
    var btn = h('button', { class: 'btn btn--primary', type: 'submit', text: 'ورود' });
    var form = h('form', { class: 'card login', onsubmit: function (e) {
      e.preventDefault(); btn.disabled = true;
      sb.auth.signInWithPassword({ email: email.value.trim(), password: pass.value }).then(function (r) {
        if (r.error) { btn.disabled = false; flash('err', explain(r.error)); return vLogin(); }
      });
    } },
      h('div', { class: 'brand' }, svgEl(MARK), h('b', { text: 'هم‌نوا' })),
      h('h2', { class: 'center', text: 'ورود مشاورها' }),
      S.flash ? h('div', { class: 'flash flash--' + S.flash.type, text: S.flash.text }) : null,
      h('div', { class: 'field' }, h('label', { for: 'em', text: 'ایمیل' }), email),
      h('div', { class: 'field' }, h('label', { for: 'pw', text: 'رمز عبور' }), pass),
      h('div', { class: 'actions' }, btn,
        h('button', { class: 'btn btn--small', type: 'button', text: 'رمزم را فراموش کرده‌ام', onclick: function () {
          if (!email.value.trim()) { flash('info', 'اول ایمیل را بنویسید.'); return vLogin(); }
          sb.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: location.origin + location.pathname }).then(function (r) {
            flash(r.error ? 'err' : 'ok', r.error ? explain(r.error) : 'اگر این ایمیل ثبت شده باشد، لینک تغییر رمز برایش فرستاده شد. پوشهٔ اسپم را هم نگاه کنید.');
            vLogin();
          });
        } })),
      h('p', { class: 'hint', text: 'ثبت‌نام آزاد وجود ندارد. حساب شما را هم‌نوا می‌سازد و دعوت‌نامه به ایمیلتان می‌رسد.' }),
      h('p', { class: 'hint center' }, h('a', { href: '../', text: '← بازگشت به سایت هم‌نوا' })));
    S.flash = null;
    var inst = installCard();
    if (inst) { inst.classList.add('login'); app.replaceChildren(form, inst); } else app.replaceChildren(form);
  }

  function vSetPw() {
    var p1 = h('input', { class: 'input', type: 'password', dir: 'ltr', autocomplete: 'new-password', minlength: 10, required: true });
    var p2 = h('input', { class: 'input', type: 'password', dir: 'ltr', autocomplete: 'new-password', minlength: 10, required: true });
    var form = h('form', { class: 'card login', onsubmit: function (e) {
      e.preventDefault();
      if (p1.value !== p2.value) { flash('err', 'دو رمز یکی نیستند.'); return vSetPw(); }
      if (p1.value.length < 10) { flash('err', 'رمز باید دست‌کم ۱۰ نویسه باشد.'); return vSetPw(); }
      sb.auth.updateUser({ password: p1.value }).then(function (r) {
        if (r.error) { flash('err', explain(r.error)); return vSetPw(); }
        history.replaceState(null, '', location.pathname + location.search);
        LINK_TYPE = null; S.view = 'ready'; S.profile = null;
        flash('ok', 'رمز شما ثبت شد.');
        loadProfile();
      });
    } },
      h('div', { class: 'brand' }, svgEl(MARK), h('b', { text: 'هم‌نوا' })),
      h('h2', { class: 'center', text: 'رمز عبور خود را بسازید' }),
      S.flash ? h('div', { class: 'flash flash--' + S.flash.type, text: S.flash.text }) : null,
      h('div', { class: 'field' }, h('label', { text: 'رمز جدید (دست‌کم ۱۰ نویسه)' }), p1),
      h('div', { class: 'field' }, h('label', { text: 'تکرار رمز' }), p2),
      h('div', { class: 'actions' }, h('button', { class: 'btn btn--primary', type: 'submit', text: 'ذخیره و ورود' })));
    S.flash = null;
    app.replaceChildren(form);
  }

  function vPending() {
    shell(h('div', { class: 'card' }, h('h2', { text: 'حساب شما هنوز فعال نشده' }),
      h('p', { text: 'ورود شما انجام شد، ولی هم‌نوا هنوز حساب شما را فعال نکرده است. پس از فعال‌شدن، همین صفحه را دوباره باز کنید.' }),
      h('p', { class: 'hint', dir: 'ltr', text: 'id ' + ((S.user && S.user.id) || '?').slice(0, 8) + ' · profile: ' + (S.profile ? ('role=' + S.profile.role + ', active=' + S.profile.active) : 'none') })));
  }

  function signOut() { sb.auth.signOut().then(function () { S.profile = null; S.data = {}; S.view = 'login'; render(); }); }

  /* ───────────── صفحهٔ مشاور ───────────── */
  function loadCounselor() {
    sb.from('sessions').select('*').eq('counselor_id', S.user.id).order('starts_at', { ascending: true }).limit(300)
      .then(function (r) {
        if (r.error) flash('err', explain(r.error));
        S.data.sessions = r.data || [];
        render();
      });
  }
  function endOf(s) { return new Date(s.starts_at).getTime() + s.duration_min * 60000; }
  function inWindow(s) {
    var n = Date.now(), t = new Date(s.starts_at).getTime();
    return n >= t - JOIN_BEFORE_MIN * 60000 && n <= endOf(s) + JOIN_AFTER_MIN * 60000;
  }

  function openRoom(session) {
    var url = S.profile.meet_url;
    if (!url) { flash('info', 'اول لینک اتاق خودتان را ثبت کنید.'); return render(); }
    window.open(url, '_blank', 'noopener');                  // باید همین لحظه و داخل کلیک باشد
    S.room = session || true;
    S.notified = null;
    render();
    var sid = (session && session.id && inWindow(session)) ? session.id : null;
    sb.rpc('counselor_open_room', { p_session: sid }).then(function (r) {
      S.notified = r.error ? 'fail' : 'ok';
      if (S.view === 'counselor') render();
    });
  }
  function toSecretary(session) {
    var p = S.profile;
    var lines = ['لینک اتاق مشاوره — ' + (p.full_name || '')];
    if (session) lines.push('مراجع: ' + session.client_label, dayOf(session.starts_at) + '، ساعت ' + timeOf(session.starts_at) + ' (به وقت ایران)');
    lines.push(p.meet_url);
    window.open(waLink(CFG.secretaryWhatsApp, lines.join('\n')), '_blank', 'noopener');
  }

  function sessionCard(s, mine) {
    var live = s.status === 'scheduled' && inWindow(s);
    var due = s.status === 'scheduled' && new Date(s.starts_at).getTime() <= Date.now() + 15 * 60000;
    var ok = s.status === 'done';
    var card = h('div', { class: 's' + (live ? ' s--live' : '') },
      h('div', { class: 's__head' },
        h('div', { class: 's__time' }, dayJ(s.starts_at), h('small', null, ltr(dayG(s.starts_at)), ' · ساعت ' + timeOf(s.starts_at) + ' — ' + n(s.duration_min) + ' دقیقه (به وقت ایران)')),
        h('div', { class: 'chips' },
          h('span', { class: 'chip chip--gold', text: KIND[s.kind] }), h('span', { class: 'chip', text: MODE[s.mode] }),
          h('span', { class: 'chip ' + (ok ? 'chip--ok' : (s.status === 'scheduled' ? '' : 'chip--warn')), text: STATUS[s.status] }))),
      h('div', null, h('b', { text: 'مراجع: ' }), s.client_label));
    if (s.status === 'scheduled') {
      var acts = h('div', { class: 'actions' });
      acts.appendChild(h('button', { class: 'btn btn--primary btn--small', type: 'button', disabled: !live, text: 'ورود به اتاق', onclick: function () { openRoom(s); } }));
      if (S.profile.meet_url) acts.appendChild(h('button', { class: 'btn btn--wa btn--small', type: 'button', text: 'ارسال لینک به منشی', onclick: function () { toSecretary(s); } }));
      if (due) {
        acts.appendChild(h('button', { class: 'btn btn--small', type: 'button', text: 'انجام شد', onclick: function () { mark(s, 'done'); } }));
        acts.appendChild(h('button', { class: 'btn btn--danger btn--small', type: 'button', text: 'مراجع نیامد', onclick: function () { mark(s, 'client_no_show'); } }));
      }
      card.appendChild(acts);
    }
    return card;
  }
  function mark(s, status) {
    if (!window.confirm(status === 'done' ? 'این جلسه انجام شد؟' : 'مراجع در این جلسه حاضر نشد؟')) return;
    sb.rpc('counselor_set_status', { p_session: s.id, p_status: status }).then(function (r) {
      flash(r.error ? 'err' : 'ok', r.error ? explain(r.error) : 'ثبت شد.');
      loadCounselor();
    });
  }

  function vCounselor() {
    var all = S.data.sessions || [];
    var now = Date.now();
    var upcoming = all.filter(function (s) { return s.status === 'scheduled' && endOf(s) + JOIN_AFTER_MIN * 60000 >= now; });
    var past = all.filter(function (s) { return upcoming.indexOf(s) < 0; }).reverse();
    var next = upcoming[0];
    var hasLink = !!S.profile.meet_url;

    var hero = h('section', { class: 'card hero' },
      h('h2', { text: 'اتاق مشاوره' }),
      h('p', { class: 'hint' }, next ? ['جلسهٔ بعدی: ', dayNode(next.starts_at), '، ساعت ' + timeOf(next.starts_at) + ' — ' + next.client_label] : 'جلسهٔ برنامه‌ریزی‌شده‌ای ندارید.'),
      h('button', { class: 'room-btn', type: 'button', disabled: !hasLink, onclick: function () { openRoom(next); } },
        svgEl(VIDEO_ICON), h('span', { text: 'ورود به اتاق مشاوره' })),
      !hasLink ? h('p', { class: 'hint', text: 'برای فعال شدن، پایین‌تر لینک اتاقتان را ثبت کنید.' }) : null);
    if (S.room && hasLink) {
      hero.appendChild(h('p', { class: 'hint', role: 'status', text: S.notified === 'ok' ? 'اتاق باز شد و برای منشی اعلام شد ✓' :
        S.notified === 'fail' ? 'اتاق باز شد، ولی اطلاع‌رسانی خودکار به منشی انجام نشد. لینک را با دکمهٔ زیر بفرستید.' : 'اتاق باز شد. در حال اطلاع‌رسانی به منشی…' }));
      hero.appendChild(h('div', { class: 'actions' },
        h('button', { class: 'btn btn--wa', type: 'button', text: 'ارسال لینک به منشی (واتساپ)', onclick: function () { toSecretary(S.room === true ? null : S.room); } }),
        h('button', { class: 'btn btn--small', type: 'button', text: 'بستن', onclick: function () { S.room = null; render(); } })));
    }

    shell([hero, roomLinkCard(hasLink),
      h('section', { class: 'card' }, h('h2', { text: 'جلسه‌های پیش‌رو' }),
        upcoming.length ? upcoming.map(function (s) { return sessionCard(s, true); }) : h('p', { class: 'empty', text: 'جلسه‌ای در پیش نیست.' })),
      h('section', { class: 'card' }, h('h2', { text: 'جلسه‌های گذشته' }),
        past.length ? [past.slice(0, S.pastN || 30).map(function (s) { return sessionCard(s, true); }),
          past.length > (S.pastN || 30) ? h('div', { class: 'actions' }, h('button', { class: 'btn btn--small', type: 'button', text: 'نمایش جلسه‌های قدیمی‌تر (' + n(past.length - (S.pastN || 30)) + ')', onclick: function () { S.pastN = (S.pastN || 30) + 30; render(); } })) : null]
          : h('p', { class: 'empty', text: 'هنوز جلسه‌ای ثبت نشده.' }))]);
  }

  function roomLinkCard(hasLink) {
    var input = h('input', { class: 'input', dir: 'ltr', type: 'url', placeholder: 'https://meet.google.com/abc-defg-hij', value: S.profile.meet_url || '' });
    var card = h('section', { class: 'card' }, h('h2', { text: 'لینک اتاق من' }),
      h('p', { class: 'hint' }, 'در ', ltr('meet.google.com'), ' گزینهٔ ', ltr('New meeting'), ' و سپس ', ltr('Create a meeting for later'),
        ' را بزنید و لینک را این‌جا بگذارید. مراجع با همین لینک می‌آید و شما او را می‌پذیرید.'),
      h('div', { class: 'sp' }), input,
      h('div', { class: 'actions' }, h('button', { class: 'btn btn--primary', type: 'button', text: hasLink ? 'به‌روزرسانی لینک' : 'ثبت لینک', onclick: function () {
        var v = input.value.trim().split('?')[0];
        if (!MEET_RE.test(v)) { flash('err', explain('invalid meet')); return render(); }
        sb.rpc('set_my_meet_url', { p_url: v }).then(function (r) {
          if (r.error) { flash('err', explain(r.error)); return render(); }
          S.profile.meet_url = v; flash('ok', 'لینک اتاق ثبت شد.'); render();
        });
      } })));
    return card;
  }

  /* ───────────── انتخاب تاریخ (شمسی + میلادی) و ساعت ۲۴ساعته ───────────── */
  var CAL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>';
  var CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  function parseIso(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? { gy: +m[1], gm: +m[2], gd: +m[3] } : null; }

  function dateField(initial, onChange) {
    var st = { iso: initial || '', jy: 0, jm: 0, open: false };
    var wrap = h('div', { class: 'picker' });
    var btn = h('button', { class: 'input picker__btn', type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' });
    var pop = h('div', { class: 'picker__pop', role: 'dialog', 'aria-label': 'انتخاب تاریخ', hidden: true });
    wrap.appendChild(btn); wrap.appendChild(pop);

    function label() {
      var g = parseIso(st.iso);
      btn.textContent = '';
      if (!g) btn.appendChild(h('span', { class: 'picker__ph', text: 'انتخاب تاریخ' }));
      else {
        var j = toJalali(g.gy, g.gm, g.gd);
        btn.appendChild(h('span', { class: 'picker__j', text: np(j.jd) + ' ' + J_MONTHS[j.jm - 1] + ' ' + np(j.jy) }));
        btn.appendChild(h('span', { class: 'picker__g' }, ltr(g.gd + ' ' + G_MONTHS[g.gm - 1] + ' ' + g.gy)));
      }
      btn.appendChild(svgEl(CAL_ICON));
    }
    function shift(dm) {
      st.jm += dm;
      if (st.jm < 1) { st.jm = 12; st.jy -= 1; } else if (st.jm > 12) { st.jm = 1; st.jy += 1; }
      draw();
    }
    function draw() {
      pop.textContent = '';
      var first = toGregorian(st.jy, st.jm, 1), len = jMonthLen(st.jy, st.jm), last = toGregorian(st.jy, st.jm, len);
      var off = (new Date(Date.UTC(first.gy, first.gm - 1, first.gd)).getUTCDay() + 1) % 7;
      var sub = G_MONTHS[first.gm - 1] + (first.gm !== last.gm ? ' – ' + G_MONTHS[last.gm - 1] : '') + ' ' + last.gy;
      var today = tehranDateInput(0), cells = [];
      pop.appendChild(h('div', { class: 'picker__head' },
        h('button', { class: 'picker__nav', type: 'button', 'aria-label': 'ماه قبل', onclick: function () { shift(-1); } }, svgEl(CHEV)),
        h('div', { class: 'picker__title' }, h('b', { text: J_MONTHS[st.jm - 1] + ' ' + np(st.jy) }), h('small', null, ltr(sub))),
        h('button', { class: 'picker__nav picker__nav--next', type: 'button', 'aria-label': 'ماه بعد', onclick: function () { shift(1); } }, svgEl(CHEV))));
      var week = h('div', { class: 'picker__week', 'aria-hidden': 'true' });
      ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'].forEach(function (w, i) { week.appendChild(h('span', { class: i === 6 ? 'is-fri' : '', text: w })); });
      pop.appendChild(week);
      var grid = h('div', { class: 'picker__grid', role: 'grid' });
      for (var i = 0; i < off; i++) grid.appendChild(h('span', { class: 'picker__pad' }));
      for (var d = 1; d <= len; d++) {
        (function (d) {
          var g = toGregorian(st.jy, st.jm, d), iso = isoOf(g.gy, g.gm, g.gd), col = (off + d - 1) % 7;
          var cls = 'picker__day' + (col === 6 ? ' is-fri' : '') + (iso === today ? ' is-today' : '') + (iso === st.iso ? ' is-sel' : '');
          var b = h('button', { class: cls, type: 'button', 'aria-pressed': iso === st.iso ? 'true' : 'false',
            'aria-label': np(d) + ' ' + J_MONTHS[st.jm - 1] + ' ' + np(st.jy) + ' — ' + g.gd + ' ' + G_MONTHS[g.gm - 1] + ' ' + g.gy,
            onclick: function () { st.iso = iso; label(); close(); if (onChange) onChange(iso); } },
            h('span', { class: 'picker__jd', text: np(d) }),
            h('span', { class: 'picker__gd', text: g.gd === 1 ? G_MONTHS[g.gm - 1] + ' 1' : String(g.gd) }));
          grid.appendChild(b); cells.push(b);
        })(d);
      }
      pop.appendChild(grid);
      pop.appendChild(h('div', { class: 'picker__foot' },
        h('button', { class: 'btn btn--small', type: 'button', text: 'امروز', onclick: function () {
          var g = parseIso(today); st.iso = today; var j = toJalali(g.gy, g.gm, g.gd); st.jy = j.jy; st.jm = j.jm; label(); close(); if (onChange) onChange(today);
        } }),
        h('button', { class: 'btn btn--small', type: 'button', text: 'بستن', onclick: function () { close(); } })));
    }
    function outside(e) { if ((e.composedPath ? e.composedPath() : []).indexOf(wrap) < 0) close(); }   // composedPath: the clicked button may already be replaced by redraw
    function key(e) { if (e.key === 'Escape') { close(); btn.focus(); } }
    function open() {
      var g = parseIso(st.iso) || parseIso(tehranDateInput(0)), j = toJalali(g.gy, g.gm, g.gd);
      st.jy = j.jy; st.jm = j.jm; st.open = true; draw();
      pop.hidden = false; btn.setAttribute('aria-expanded', 'true');
      setTimeout(function () { document.addEventListener('click', outside); }, 0);
      document.addEventListener('keydown', key);
      var sel = pop.querySelector('.is-sel') || pop.querySelector('.is-today') || pop.querySelector('.picker__day');
      if (sel) sel.focus();
    }
    function close() {
      st.open = false; pop.hidden = true; btn.setAttribute('aria-expanded', 'false');
      document.removeEventListener('click', outside); document.removeEventListener('keydown', key);
    }
    btn.addEventListener('click', function () { if (st.open) close(); else open(); });
    label();
    return { el: wrap, value: function () { return st.iso; } };
  }

  function timeField(onChange) {
    function opts(count, step, ph) {
      var o = [h('option', { value: '', text: ph })];
      for (var i = 0; i < count; i += step) o.push(h('option', { value: (i < 10 ? '0' : '') + i, text: pad2(i) }));
      return o;
    }
    var hh = h('select', { class: 'select', 'aria-label': 'ساعت', required: true }, opts(24, 1, 'ساعت'));
    var mm = h('select', { class: 'select', 'aria-label': 'دقیقه', required: true }, opts(60, 5, 'دقیقه'));
    var fire = function () { if (onChange) onChange(); };
    hh.addEventListener('change', fire); mm.addEventListener('change', fire);
    var wrap = h('div', { class: 'timef', dir: 'ltr' }, hh, h('span', { class: 'timef__sep', text: ':' }), mm,
      h('span', { class: 'timef__note', dir: 'rtl', text: 'ساعت ۲۴ ساعته' }));
    return { el: wrap, value: function () { return hh.value && mm.value ? hh.value + ':' + mm.value : ''; } };
  }

  /* ───────────── صفحهٔ منشی / مدیر ───────────── */
  function loadStaff() {
    var from = tehranToUtc((S.data.from || tehranDateInput(-7)) + 'T00:00');
    var to = tehranToUtc((S.data.to || tehranDateInput(30)) + 'T23:59');
    var q = sb.from('sessions').select('*').gte('starts_at', from.toISOString()).lte('starts_at', to.toISOString()).order('starts_at', { ascending: true }).limit(500);
    if (S.data.who) q = q.eq('counselor_id', S.data.who);
    Promise.all([q, sb.from('profiles').select('*').order('full_name', { ascending: true })]).then(function (res) {
      if (res[0].error || res[1].error) flash('err', explain(res[0].error || res[1].error));
      S.data.sessions = res[0].data || []; S.data.profiles = res[1].data || [];
      var ids = S.data.sessions.map(function (s) { return s.id; });
      if (!ids.length) { S.data.contacts = {}; render(); return loadBoard(); }
      sb.from('session_contacts').select('*').in('session_id', ids).then(function (c) {
        S.data.contacts = {};
        (c.data || []).forEach(function (x) { S.data.contacts[x.session_id] = x.client_phone; });
        render(); loadBoard();
      });
    });
  }
  function nameOf(id) {
    var p = (S.data.profiles || []).filter(function (x) { return x.id === id; })[0];
    return p ? (p.full_name || 'بدون نام') : '—';
  }
  function profileOf(id) { return (S.data.profiles || []).filter(function (x) { return x.id === id; })[0]; }

  function vStaff() {
    var open = (S.data.board && S.data.board.events.length) || 0;
    var tabs = h('div', { class: 'tabs', role: 'tablist' }, [['board', 'اتاق‌های باز'], ['sessions', 'جلسه‌ها'], ['new', 'جلسهٔ جدید'], ['people', 'مشاورها']].map(function (t) {
      return h('button', { class: 'tab', role: 'tab', 'aria-selected': S.tab === t[0] ? 'true' : 'false', onclick: function () { S.tab = t[0]; if (t[0] !== 'new') S.booked = null; render(); } },
        t[1], t[0] === 'board' ? h('span', { class: 'badge', id: 'boardBadge', text: open ? n(open) : '' }) : null);
    }));
    var body = S.tab === 'board' ? tBoard() : S.tab === 'new' ? tNew() : S.tab === 'people' ? tPeople() : tSessions();
    shell([tabs, body]);
  }

  /* ───────────── اتاق‌های باز: مشاور دکمه را می‌زند، منشی همان لحظه می‌بیند ───────────── */
  var BASE_TITLE = document.title;
  function clientText(s, p) {
    return ['سلام ' + s.client_label + ' عزیز', 'لینک اتاق مشاورهٔ شما با ' + (p.full_name || 'مشاور هم‌نوا') + ':', p.meet_url,
      'زمان: ' + dayOf(s.starts_at) + '، ساعت ' + timeOf(s.starts_at) + ' (به وقت ایران)', 'سر وقت روی لینک بزنید؛ مشاور شما را به اتاق می‌پذیرد.'].join('\n');
  }
  function confirmText(s, p) {
    var lines = ['سلام ' + s.client_label + ' عزیز 🌿', 'جلسهٔ شما در هم‌نوا ثبت شد.',
      'مشاور: ' + ((p && p.full_name) || 'هم‌نوا'),
      'زمان: ' + dayOf(s.starts_at) + '، ساعت ' + timeOf(s.starts_at) + ' (به وقت ایران)',
      'نوع: ' + (s.kind === 'intro' ? 'جلسهٔ معارفهٔ رایگان' : 'جلسهٔ مشاوره') + ' — ' + (s.mode === 'audio' ? 'تماس صوتی' : 'تماس تصویری')];
    if (p && p.meet_url) lines.push('لینک اتاق: ' + p.meet_url, 'سر وقت روی لینک بزنید؛ مشاور شما را به اتاق می‌پذیرد.');
    else lines.push('لینک اتاق پیش از جلسه برایتان فرستاده می‌شود.');
    return lines.join('\n');
  }
  function reminderText(s, p) {
    var lines = ['سلام ' + s.client_label + ' عزیز', 'یادآوری جلسهٔ شما با ' + ((p && p.full_name) || 'مشاور هم‌نوا') + ':',
      dayOf(s.starts_at) + '، ساعت ' + timeOf(s.starts_at) + ' (به وقت ایران)'];
    if (p && p.meet_url) lines.push(p.meet_url);
    return lines.join('\n');
  }
  function sendConfirm(s, p, phone) { window.open(waLink(phoneDigits(phone), confirmText(s, p)), '_blank', 'noopener'); }
  function sendReminder(s, p, phone) { window.open(waLink(phoneDigits(phone), reminderText(s, p)), '_blank', 'noopener'); }
  function sendToClient(s, p, phone) { window.open(waLink(phoneDigits(phone), clientText(s, p)), '_blank', 'noopener'); }
  function copyText(t) {
    var done = function () { flash('ok', 'کپی شد.'); render(); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, function () { flash('err', 'کپی نشد.'); render(); });
    else { flash('info', t); render(); }
  }

  function loadBoard() {
    var since = new Date(Date.now() - 6 * 3600000).toISOString();
    return sb.from('room_events').select('*').eq('handled', false).gte('opened_at', since).order('opened_at', { ascending: false }).limit(50).then(function (r) {
      var evs = r.data || [], ids = evs.map(function (e) { return e.session_id; }).filter(Boolean);
      var board = { events: evs, sessions: {}, contacts: {} };
      if (!ids.length) return board;
      return Promise.all([sb.from('sessions').select('*').in('id', ids), sb.from('session_contacts').select('*').in('session_id', ids)]).then(function (res) {
        (res[0].data || []).forEach(function (x) { board.sessions[x.id] = x; });
        (res[1].data || []).forEach(function (x) { board.contacts[x.session_id] = x.client_phone; });
        return board;
      });
    }).then(function (board) {
      var fresh = S.seen ? board.events.filter(function (e) { return !S.seen[e.id]; }) : [];
      S.seen = S.seen || {};
      board.events.forEach(function (e) { S.seen[e.id] = 1; });
      S.data.board = board;
      if (S.view !== 'staff') return;
      if (S.tab === 'board') render();                                    // این تب فیلد ندارد؛ بی‌خطر
      else { var b = document.getElementById('boardBadge'); if (b) b.textContent = board.events.length ? n(board.events.length) : ''; }
      if (fresh.length) alertStaff(fresh);
    });
  }
  function startRealtime() {
    if (S.rt) return;
    S.rt = true;
    if (sb.channel) sb.channel('room-events').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_events' }, function () { loadBoard(); }).subscribe();
    setInterval(function () { if (S.view === 'staff') loadBoard(); }, 20000);      // اگر اتصال زنده قطع شد
    window.addEventListener('focus', function () { document.title = BASE_TITLE; });
  }
  function beep() {
    try {
      if (!S.audio) return;
      var a = S.audio, o = a.createOscillator(), g = a.createGain();
      o.type = 'sine'; o.frequency.value = 880;
      g.gain.setValueAtTime(0.001, a.currentTime); g.gain.exponentialRampToValueAtTime(0.25, a.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.7);
      o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + 0.75);
    } catch (e) { /* بی‌صدا */ }
  }
  function alertStaff(fresh) {
    if (!S.alerts) return;
    beep();
    document.title = '🔔 اتاق جدید — ' + BASE_TITLE;
    if (window.Notification && Notification.permission === 'granted') {
      try { new Notification('اتاق جدید باز شد', { body: fresh.map(function (e) { return nameOf(e.counselor_id); }).join('، ') }); } catch (e) { /* نادیده */ }
    }
  }
  function enableAlerts() {
    S.alerts = true;
    try { var C = window.AudioContext || window.webkitAudioContext; if (C) { S.audio = S.audio || new C(); if (S.audio.resume) S.audio.resume(); } } catch (e) { /* بی‌صدا */ }
    if (window.Notification && Notification.permission === 'default') Notification.requestPermission();
    beep(); render();
  }
  function handle(e) {
    sb.from('room_events').update({ handled: true, handled_by: S.user.id }).eq('id', e.id).then(function (r) {
      if (r.error) flash('err', explain(r.error));
      loadBoard();
    });
  }

  function tBoard() {
    var B = S.data.board || { events: [], sessions: {}, contacts: {} };
    return h('div', null, pushCard(), h('section', { class: 'card' }, h('h2', { text: 'اتاق‌های باز' }),
      h('p', { class: 'hint', text: 'وقتی مشاوری دکمهٔ «ورود به اتاق مشاوره» را می‌زند، همین‌جا ظاهر می‌شود. این صفحه را باز نگه دارید.' }),
      h('div', { class: 'actions' }, h('button', { class: 'btn btn--small', type: 'button', disabled: !!S.alerts, onclick: enableAlerts,
        text: S.alerts ? 'صدا و اعلان فعال است ✓' : 'فعال‌سازی صدا و اعلان' })),
      B.events.length ? B.events.map(function (e) { return eventCard(e, B); }) : h('p', { class: 'empty', text: 'الان اتاق بازی نیست.' })));
  }
  function eventCard(e, B) {
    var p = profileOf(e.counselor_id), s = e.session_id && B.sessions[e.session_id], phone = s && B.contacts[s.id];
    var acts = h('div', { class: 'actions' });
    if (s && phone && p && p.meet_url) acts.appendChild(h('button', { class: 'btn btn--wa', type: 'button', text: 'ارسال لینک به مراجع (واتساپ)', onclick: function () { sendToClient(s, p, phone); } }));
    else if (p && p.meet_url) acts.appendChild(h('button', { class: 'btn btn--small', type: 'button', text: 'کپی لینک اتاق', onclick: function () { copyText(p.meet_url); } }));
    if (s && !phone) acts.appendChild(h('span', { class: 'chip', text: 'شمارهٔ مراجع ثبت نشده' }));
    acts.appendChild(h('button', { class: 'btn btn--small', type: 'button', text: 'انجام شد', onclick: function () { handle(e); } }));
    return h('div', { class: 's s--live' },
      h('div', { class: 's__head' }, h('div', { class: 's__time' }, nameOf(e.counselor_id), h('small', { text: 'اتاق را باز کرد — ساعت ' + timeOf(e.opened_at) }))),
      s ? h('div', null, h('b', { text: 'مراجع: ' }), s.client_label, ' — ', dayNode(s.starts_at), '، ساعت ', timeOf(s.starts_at))
        : h('p', { class: 'hint', text: 'این دکمه خارج از ساعت یک جلسهٔ ثبت‌شده زده شد.' }),
      acts);
  }

  function tSessions() {
    var counselors = (S.data.profiles || []).filter(function (p) { return p.role === 'counselor'; });
    var from = dateField(S.data.from || tehranDateInput(-7));
    var to = dateField(S.data.to || tehranDateInput(30));
    var who = h('select', { class: 'select' }, h('option', { value: '', text: 'همهٔ مشاورها' }),
      counselors.map(function (p) { return h('option', { value: p.id, text: p.full_name || 'بدون نام', selected: S.data.who === p.id }); }));
    var apply = function () { S.data.from = from.value(); S.data.to = to.value(); S.data.who = who.value || null; loadStaff(); };
    var list = S.data.sessions || [];
    return h('section', { class: 'card' }, h('h2', { text: 'جلسه‌ها' }),
      h('div', { class: 'row' }, h('div', { class: 'field' }, h('label', { text: 'از تاریخ' }), from.el), h('div', { class: 'field' }, h('label', { text: 'تا تاریخ' }), to.el)),
      h('div', { class: 'field' }, h('label', { text: 'مشاور' }), who),
      h('div', { class: 'actions' }, h('button', { class: 'btn btn--primary btn--small', type: 'button', text: 'نمایش', onclick: apply })),
      list.length ? list.map(staffCard) : h('p', { class: 'empty', text: 'جلسه‌ای در این بازه نیست.' }));
  }

  function staffCard(s) {
    var p = profileOf(s.counselor_id), phone = S.data.contacts && S.data.contacts[s.id];
    var sel = h('select', { class: 'select', 'aria-label': 'وضعیت', onchange: function (e) {
      sb.from('sessions').update({ status: e.target.value, updated_at: new Date().toISOString() }).eq('id', s.id).then(function (r) {
        flash(r.error ? 'err' : 'ok', r.error ? explain(r.error) : 'وضعیت به‌روز شد.'); loadStaff();
      });
    } }, Object.keys(STATUS).map(function (k) { return h('option', { value: k, text: STATUS[k], selected: s.status === k }); }));
    var acts = h('div', { class: 'actions' });
    if (phone) {
      acts.appendChild(h('button', { class: 'btn btn--wa btn--small', type: 'button', text: 'ارسال تأیید', onclick: function () { sendConfirm(s, p, phone); } }));
      if (s.status === 'scheduled') acts.appendChild(h('button', { class: 'btn btn--wa btn--small', type: 'button', text: 'یادآوری', onclick: function () { sendReminder(s, p, phone); } }));
    } else acts.appendChild(h('span', { class: 'chip', text: 'شمارهٔ مراجع ثبت نشده' }));
    if (!p || !p.meet_url) acts.appendChild(h('span', { class: 'chip chip--warn', text: 'مشاور هنوز لینک اتاق ثبت نکرده' }));
    acts.appendChild(h('button', { class: 'btn btn--danger btn--small', type: 'button', text: 'حذف', onclick: function () {
      if (!window.confirm('این جلسه حذف شود؟')) return;
      sb.from('sessions').delete().eq('id', s.id).then(function (r) { flash(r.error ? 'err' : 'ok', r.error ? explain(r.error) : 'حذف شد.'); loadStaff(); });
    } }));
    return h('div', { class: 's' },
      h('div', { class: 's__head' },
        h('div', { class: 's__time' }, dayJ(s.starts_at), h('small', null, ltr(dayG(s.starts_at)), ' · ساعت ' + timeOf(s.starts_at) + ' — ' + n(s.duration_min) + ' دقیقه')),
        h('div', { class: 'chips' }, h('span', { class: 'chip chip--gold', text: KIND[s.kind] }), h('span', { class: 'chip', text: MODE[s.mode] }))),
      h('div', null, h('b', { text: 'مشاور: ' }), nameOf(s.counselor_id), '   ', h('b', { text: 'مراجع: ' }), s.client_label,
        phone ? h('span', { class: 'hint', dir: 'ltr', text: '   ' + phone }) : null),
      h('div', { class: 'field' }, sel), acts);
  }

  function tNew() {
    var counselors = (S.data.profiles || []).filter(function (p) { return p.role === 'counselor' && p.active; });
    var f = {
      who: h('select', { class: 'select', required: true }, h('option', { value: '', text: 'انتخاب مشاور…' }),
        counselors.map(function (p) { return h('option', { value: p.id, text: p.full_name || 'بدون نام', selected: S.lastWho === p.id }); })),
      label: h('input', { class: 'input', maxlength: 60, required: true, placeholder: 'نام کوچک یا یک کد، نه نام کامل' }),
      phone: h('input', { class: 'input', dir: 'ltr', placeholder: '+1 647 000 0000  یا  0912…' }),
      dur: h('select', { class: 'select' }, [30, 45, 60, 90].map(function (n) { return h('option', { value: n, text: nf.format(n) + ' دقیقه', selected: n === 45 }); })),
      mode: h('select', { class: 'select' }, h('option', { value: 'video', text: 'تصویری' }), h('option', { value: 'audio', text: 'صوتی' })),
      kind: h('select', { class: 'select' }, h('option', { value: 'session', text: 'جلسه' }), h('option', { value: 'intro', text: 'معارفه (رایگان)' }))
    };
    var preview = h('p', { class: 'hint', text: '' });
    var whenLocal = function () { var d = f.date.value(), t = f.time.value(); return d && t ? d + 'T' + t : ''; };
    var showPreview = function () {
      var d = tehranToUtc(whenLocal());
      preview.textContent = '';
      if (d) { preview.appendChild(document.createTextNode('ثبت می‌شود: ')); preview.appendChild(dayNode(d)); preview.appendChild(document.createTextNode('، ساعت ' + timeOf(d) + ' به وقت ایران')); }
    };
    f.date = dateField('', showPreview);
    f.time = timeField(showPreview);
    var submit = h('button', { class: 'btn btn--primary', type: 'submit', text: 'ثبت جلسه' });
    var form = h('form', { class: 'card', onsubmit: function (e) {
      e.preventDefault();
      var when = tehranToUtc(whenLocal());
      if (!f.who.value || !when) { flash('err', 'مشاور و زمان را کامل کنید.'); return render(); }
      submit.disabled = true;
      sb.from('sessions').insert({ counselor_id: f.who.value, client_label: f.label.value.trim(), starts_at: when.toISOString(),
        duration_min: +f.dur.value, mode: f.mode.value, kind: f.kind.value, created_by: S.user.id }).select().single().then(function (r) {
        if (r.error) { submit.disabled = false; flash('err', explain(r.error)); return render(); }
        var phone = f.phone.value.trim();
        S.lastWho = f.who.value;
        var booked = function (saved) { S.booked = { s: r.data, phone: saved ? phone : '' }; loadStaff(); };
        if (!phone) return booked(false);
        sb.from('session_contacts').insert({ session_id: r.data.id, client_phone: phone }).then(function (c) {
          if (c.error) flash('err', 'جلسه ثبت شد ولی شمارهٔ مراجع ذخیره نشد.');
          booked(!c.error);
        });
      });
    } },
      h('h2', { text: 'جلسهٔ جدید' }),
      counselors.length ? null : h('p', { class: 'flash flash--info', text: 'هنوز مشاور فعالی نیست. از تب «مشاورها» فعالشان کنید.' }),
      h('div', { class: 'field' }, h('label', { text: 'مشاور' }), f.who),
      h('div', { class: 'field' }, h('label', { text: 'مراجع (نام کوچک یا کد)' }), f.label),
      h('div', { class: 'field' }, h('label', { text: 'شمارهٔ مراجع (برای ارسال تأیید با واتساپ؛ فقط منشی و مدیر می‌بینند)' }), f.phone),
      h('div', { class: 'row' },
        h('div', { class: 'field' }, h('label', { text: 'تاریخ' }), f.date.el),
        h('div', { class: 'field' }, h('label', { text: 'ساعت (به وقت ایران، ۲۴ ساعته)' }), f.time.el)),
      preview,
      h('div', { class: 'row' }, h('div', { class: 'field' }, h('label', { text: 'مدت' }), f.dur), h('div', { class: 'field' }, h('label', { text: 'نوع تماس' }), f.mode)),
      h('div', { class: 'field' }, h('label', { text: 'جلسه یا معارفه' }), f.kind),
      h('p', { class: 'hint', text: 'محتوای جلسه یا یادداشت بالینی را هیچ‌جا این‌جا ننویسید.' }),
      h('div', { class: 'actions' }, submit));
    var done = null;
    if (S.booked) {
      var bs = S.booked.s, bp = profileOf(bs.counselor_id);
      done = h('section', { class: 'card hero', role: 'status' },
        h('h2', { text: 'جلسه ثبت شد ✓' }),
        h('p', { class: 'hint' }, nameOf(bs.counselor_id) + ' — ' + bs.client_label + ' — ', dayNode(bs.starts_at), '، ساعت ' + timeOf(bs.starts_at)),
        S.booked.phone
          ? h('button', { class: 'room-btn', type: 'button', onclick: function () { sendConfirm(bs, bp, S.booked.phone); } }, h('span', { text: 'ارسال تأیید به مراجع (واتساپ)' }))
          : h('p', { class: 'hint', text: 'شمارهٔ مراجع ثبت نشد؛ بعداً از تب «جلسه‌ها» می‌توانید تأیید بفرستید.' }),
        bp && bp.meet_url ? null : h('p', { class: 'hint', text: 'توجه: این مشاور هنوز لینک اتاق ثبت نکرده؛ پیام بدون لینک می‌رود.' }),
        h('div', { class: 'actions' }, h('button', { class: 'btn btn--small', type: 'button', text: 'ثبت جلسهٔ دیگر', onclick: function () { S.booked = null; render(); } })));
    }
    return h('div', null, done, form);
  }

  function tPeople() {
    var me = S.profile, isAdmin = me.role === 'admin';
    var rows = (S.data.profiles || []).map(function (p) {
      var self = p.id === me.id;
      var active = h('input', { type: 'checkbox', checked: p.active, disabled: !isAdmin || self, 'aria-label': 'فعال', onchange: function (e) { upd(p.id, { active: e.target.checked }); } });
      var role = h('select', { class: 'select', disabled: !isAdmin || self, 'aria-label': 'نقش', onchange: function (e) { upd(p.id, { role: e.target.value }); } },
        [['counselor', 'مشاور'], ['secretary', 'منشی'], ['admin', 'مدیر']].map(function (r) { return h('option', { value: r[0], text: r[1], selected: p.role === r[0] }); }));
      var name = h('input', { class: 'input', value: p.full_name || '', disabled: !isAdmin, 'aria-label': 'نام', onchange: function (e) { upd(p.id, { full_name: e.target.value.trim() }); } });
      return h('div', { class: 's' }, name,
        h('div', { class: 'row' }, role, h('label', null, active, ' فعال')),
        h('div', { class: 'chips' }, h('span', { class: 'chip ' + (p.meet_url ? 'chip--ok' : 'chip--warn'), text: p.meet_url ? 'لینک اتاق ثبت شده' : 'لینک اتاق ندارد' })));
    });
    return h('section', { class: 'card' }, h('h2', { text: 'مشاورها و کارکنان' }),
      h('p', { class: 'hint' }, 'برای دعوت یک مشاور جدید: در داشبورد ', ltr('Supabase'), ' بخش ', ltr('Authentication'), ' ← ', ltr('Users'), ' ← ', ltr('Invite user'), ' را بزنید. بعد از اولین ورودش، این‌جا فعالش کنید.'),
      rows.length ? rows : h('p', { class: 'empty', text: 'هنوز کسی نیست.' }));
  }
  function upd(id, patch) {
    sb.from('profiles').update(patch).eq('id', id).then(function (r) {
      flash(r.error ? 'err' : 'ok', r.error ? explain(r.error) : 'ذخیره شد.'); loadStaff();
    });
  }

  /* ───────────── شروع ───────────── */
  function start() {
    if (MOCK) {
      var s = document.createElement('script'); s.src = 'panel-mock.js';
      s.onload = boot; s.onerror = function () { app.textContent = 'mock not found'; };
      document.head.appendChild(s);
    } else boot();
  }
  start();
  if ('serviceWorker' in navigator && !MOCK) navigator.serviceWorker.register('sw.js').catch(function () { /* the panel works without it */ });
})();
