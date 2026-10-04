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

  var fmtDay = new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', weekday: 'long', day: 'numeric', month: 'long' });
  var fmtTime = new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', hour12: false });
  var dayOf = function (ts) { return fmtDay.format(new Date(ts)); };
  var timeOf = function (ts) { return fmtTime.format(new Date(ts)); };

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
      else { S.tab = 'board'; startRealtime(); loadStaff(); }
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
    app.replaceChildren.apply(app, nodes);
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
      h('p', { class: 'hint', text: 'ثبت‌نام آزاد وجود ندارد. حساب شما را هم‌نوا می‌سازد و دعوت‌نامه به ایمیلتان می‌رسد.' }));
    S.flash = null;
    app.replaceChildren(form);
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
        h('div', { class: 's__time' }, dayOf(s.starts_at), h('small', { text: 'ساعت ' + timeOf(s.starts_at) + ' — ' + n(s.duration_min) + ' دقیقه (به وقت ایران)' })),
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
      h('p', { class: 'hint', text: next ? ('جلسهٔ بعدی: ' + dayOf(next.starts_at) + '، ساعت ' + timeOf(next.starts_at) + ' — ' + next.client_label) : 'جلسهٔ برنامه‌ریزی‌شده‌ای ندارید.' }),
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
    return h('section', { class: 'card' }, h('h2', { text: 'اتاق‌های باز' }),
      h('p', { class: 'hint', text: 'وقتی مشاوری دکمهٔ «ورود به اتاق مشاوره» را می‌زند، همین‌جا ظاهر می‌شود. این صفحه را باز نگه دارید.' }),
      h('div', { class: 'actions' }, h('button', { class: 'btn btn--small', type: 'button', disabled: !!S.alerts, onclick: enableAlerts,
        text: S.alerts ? 'صدا و اعلان فعال است ✓' : 'فعال‌سازی صدا و اعلان' })),
      B.events.length ? B.events.map(function (e) { return eventCard(e, B); }) : h('p', { class: 'empty', text: 'الان اتاق بازی نیست.' }));
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
      s ? h('div', null, h('b', { text: 'مراجع: ' }), s.client_label, ' — ', dayOf(s.starts_at), '، ساعت ', timeOf(s.starts_at))
        : h('p', { class: 'hint', text: 'این دکمه خارج از ساعت یک جلسهٔ ثبت‌شده زده شد.' }),
      acts);
  }

  function tSessions() {
    var counselors = (S.data.profiles || []).filter(function (p) { return p.role === 'counselor'; });
    var from = h('input', { class: 'input', type: 'date', value: S.data.from || tehranDateInput(-7) });
    var to = h('input', { class: 'input', type: 'date', value: S.data.to || tehranDateInput(30) });
    var who = h('select', { class: 'select' }, h('option', { value: '', text: 'همهٔ مشاورها' }),
      counselors.map(function (p) { return h('option', { value: p.id, text: p.full_name || 'بدون نام', selected: S.data.who === p.id }); }));
    var apply = function () { S.data.from = from.value; S.data.to = to.value; S.data.who = who.value || null; loadStaff(); };
    var list = S.data.sessions || [];
    return h('section', { class: 'card' }, h('h2', { text: 'جلسه‌ها' }),
      h('div', { class: 'row' }, h('div', { class: 'field' }, h('label', { text: 'از' }), from), h('div', { class: 'field' }, h('label', { text: 'تا' }), to)),
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
        h('div', { class: 's__time' }, dayOf(s.starts_at), h('small', { text: 'ساعت ' + timeOf(s.starts_at) + ' — ' + n(s.duration_min) + ' دقیقه' })),
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
      when: h('input', { class: 'input', type: 'datetime-local', required: true }),
      dur: h('select', { class: 'select' }, [30, 45, 60, 90].map(function (n) { return h('option', { value: n, text: nf.format(n) + ' دقیقه', selected: n === 45 }); })),
      mode: h('select', { class: 'select' }, h('option', { value: 'video', text: 'تصویری' }), h('option', { value: 'audio', text: 'صوتی' })),
      kind: h('select', { class: 'select' }, h('option', { value: 'session', text: 'جلسه' }), h('option', { value: 'intro', text: 'معارفه (رایگان)' }))
    };
    var preview = h('p', { class: 'hint', text: '' });
    f.when.addEventListener('input', function () {
      var d = tehranToUtc(f.when.value);
      preview.textContent = d ? ('ثبت می‌شود: ' + dayOf(d) + '، ساعت ' + timeOf(d) + ' به وقت ایران') : '';
    });
    var submit = h('button', { class: 'btn btn--primary', type: 'submit', text: 'ثبت جلسه' });
    var form = h('form', { class: 'card', onsubmit: function (e) {
      e.preventDefault();
      var when = tehranToUtc(f.when.value);
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
      h('div', { class: 'field' }, h('label', { text: 'زمان (به وقت ایران)' }), f.when, preview),
      h('div', { class: 'row' }, h('div', { class: 'field' }, h('label', { text: 'مدت' }), f.dur), h('div', { class: 'field' }, h('label', { text: 'نوع تماس' }), f.mode)),
      h('div', { class: 'field' }, h('label', { text: 'جلسه یا معارفه' }), f.kind),
      h('p', { class: 'hint', text: 'محتوای جلسه یا یادداشت بالینی را هیچ‌جا این‌جا ننویسید.' }),
      h('div', { class: 'actions' }, submit));
    var done = null;
    if (S.booked) {
      var bs = S.booked.s, bp = profileOf(bs.counselor_id);
      done = h('section', { class: 'card hero', role: 'status' },
        h('h2', { text: 'جلسه ثبت شد ✓' }),
        h('p', { class: 'hint', text: nameOf(bs.counselor_id) + ' — ' + bs.client_label + ' — ' + dayOf(bs.starts_at) + '، ساعت ' + timeOf(bs.starts_at) }),
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
})();
