/* هم‌نوا — پنل مشاور
   ورود، فهرست جلسه‌ها، دکمهٔ اتاق مشاوره، و فرم ثبت جلسه برای منشی.
   هیچ داده‌ای این‌جا نگه داشته نمی‌شود؛ همه‌چیز از پایگاه‌داده می‌آید و «چه کسی چه چیزی را ببیند»
   را خود پایگاه‌داده (RLS) تعیین می‌کند، نه این صفحه. */
(function () {
  'use strict';
  // the panel is never meant to be shown inside another site's frame (clickjacking)
  if (window.top !== window.self) { document.documentElement.textContent = ''; try { window.top.location = window.self.location; } catch (e) { /* blocked: the empty page is what stays */ } return; }

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

  var MARK = '<svg viewBox="0 0 84 84" fill="none" aria-hidden="true"><path d="M14 18 h56 a8 8 0 0 1 8 8 v28 a8 8 0 0 1 -8 8 h-30 l-16 14 v-14 h-10 a8 8 0 0 1 -8 -8 v-28 a8 8 0 0 1 8 -8 Z" fill="#3D6B61"/><rect x="28" y="34" width="6" height="14" rx="3" fill="#F1F4EF"/><rect x="39" y="28" width="6" height="26" rx="3" fill="#C2A06B"/><rect x="50" y="34" width="6" height="14" rx="3" fill="#FDFBF5"/></svg>';
  var VIDEO_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="6" width="14" height="12" rx="3"/><path d="M16 10l6-3v10l-6-3z"/></svg>';
  var MARK_LIGHT = MARK.replace('fill="#3D6B61"', 'fill="#F5F1E6"').replace('fill="#F1F4EF"', 'fill="#3D6B61"').replace('fill="#C2A06B"', 'fill="#B78A46"').replace('fill="#FDFBF5"', 'fill="#3D6B61"');
  var ICONS = {
    mail: '<rect x="2" y="4" width="20" height="16" rx="3"/><path d="m22 7-10 6L2 7"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="3"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A9.8 9.8 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    video: '<rect x="2" y="6" width="14" height="12" rx="3"/><path d="M16 10l6-3v10l-6-3z"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    plus: '<circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M10.8 12.2 21 2M16 7l3 3M14 9l2 2"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    wallet: '<path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1"/><path d="M3 7v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"/><path d="M21 10h-5a2.5 2.5 0 0 0 0 5h5z"/>'
  };
  function ico(name, cls) {
    return svgEl('<svg class="ico' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>');
  }
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
  var KIND = { intro: 'پیش‌مشاوره', session: 'جلسه' };

  /* مشاوره‌های اصلی و پیش‌مشاوره‌های رایگان (۱۵ دقیقه) دو فهرست جدا دارند؛
     وقتی روزی ده‌ها مورد باشد، هر دسته با شمارندهٔ خودش جدا دیده می‌شود. */
  function kindOf(s) { return s.kind === 'intro' ? 'intro' : 'session'; }
  function countKinds(list) { var c = { session: 0, intro: 0 }; list.forEach(function (s) { c[kindOf(s)]++; }); return c; }
  function ofKind(list, k) { return list.filter(function (s) { return kindOf(s) === k; }); }
  function kindSeg(counts, cur, pick) {
    return h('div', { class: 'seg', role: 'tablist', 'aria-label': 'نوع جلسه' }, [['session', 'مشاوره‌ها'], ['intro', 'پیش‌مشاوره‌ها']].map(function (k) {
      return h('button', { class: 'seg__b seg__b--' + k[0], type: 'button', role: 'tab', 'aria-selected': cur === k[0] ? 'true' : 'false', onclick: function () { pick(k[0]); } },
        h('span', { text: k[1] }), h('b', { text: n(counts[k[0]]) }));
    }));
  }

  /* ───────────── بسته و پرداخت (با migration-11) ───────────── */
  var PACKS = [['single', 'تک جلسه', 1], ['pack3', 'بستهٔ ۳ جلسه‌ای', 3], ['pack5', 'بستهٔ ۵ جلسه‌ای', 5],
               ['stu1', 'تک‌جلسهٔ دانشجویی', 1], ['stu3', 'بستهٔ ۳ جلسهٔ دانشجویی', 3]];
  function packOf(id) { return PACKS.filter(function (p) { return p[0] === id; })[0]; }
  function pkgReady() { return S.pkgCol === true; }
  function newGroupId() {
    try { return crypto.randomUUID(); } catch (e) {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
    }
  }
  function packLabel(s) {
    var p = packOf(s.package_id);
    if (!p) return '';
    return p[1] + (s.package_total > 1 ? ' — جلسهٔ ' + n(s.package_no) + ' از ' + n(s.package_total) : '');
  }
  // چیپ‌های «کدام بسته» و «پرداخت»؛ تا مهاجرت اجرا نشده چیزی نشان نمی‌دهد
  function payChips(s) {
    if (!pkgReady()) return [];
    var out = [], pl = s.package_id && s.package_id !== 'intro' ? packLabel(s) : '', st = s.paid || 'unpaid';
    if (pl) out.push(h('span', { class: 'chip chip--gold', text: pl }));
    out.push(h('span', { class: 'chip ' + (st === 'paid' ? 'chip--ok' : st === 'free' ? '' : 'chip--warn'), text: st === 'paid' ? 'پرداخت‌شده ✓' : st === 'free' ? 'رایگان' : 'پرداخت نشده' }));
    return out;
  }
  function loadPackages() {
    sb.from('sessions').select('package_group,package_id,package_no,package_total,client_label,counselor_id,paid').not('package_group', 'is', null).limit(1000).then(function (r) {
      var g = {};
      (r.data || []).forEach(function (x) {
        var e = g[x.package_group] || (g[x.package_group] = { id: x.package_group, pack: x.package_id, total: x.package_total, used: 0, label: x.client_label, counselor_id: x.counselor_id, paid: false });
        e.used++; if (x.paid === 'paid') e.paid = true;
      });
      S.pkgs = Object.keys(g).map(function (k) { return g[k]; });
      render();
    });
  }
  // انتخاب بسته: نوع بسته، و اگر چندجلسه‌ای است «اولین جلسه» یا «ادامهٔ بستهٔ قبلی همین مراجع»
  function packFields(getCounselor, withPaid) {
    var pack = h('select', { class: 'select', 'aria-label': 'بسته' }, PACKS.map(function (p) { return h('option', { value: p[0], text: p[1] }); }));
    var cont = h('select', { class: 'select', 'aria-label': 'ادامهٔ بسته' });
    var contField = h('div', { class: 'field' }, h('label', { text: 'این جلسه…' }), cont);
    var paidBox = withPaid ? h('input', { type: 'checkbox', id: 'pkgPaid' }) : null;
    var paidField = withPaid ? h('label', { class: 'field', for: 'pkgPaid' }, paidBox, ' پرداخت شده است') : null;
    var el = h('div', null, h('div', { class: 'field' }, h('label', { text: 'بسته' }), pack), contField, paidField);
    function openGroups() {
      var cid = getCounselor();
      return (S.pkgs || []).filter(function (g) { return g.pack === pack.value && g.total > 1 && g.used < g.total && (!cid || g.counselor_id === cid); });
    }
    function refresh() {
      var p = packOf(pack.value), multi = !!p && p[2] > 1;
      contField.hidden = !multi;
      cont.textContent = '';
      cont.appendChild(h('option', { value: '', text: 'اولین جلسهٔ یک بستهٔ تازه' }));
      openGroups().forEach(function (g) { cont.appendChild(h('option', { value: g.id, text: 'ادامهٔ بستهٔ ' + g.label + ' — ' + n(g.used) + ' از ' + n(g.total) + ' ثبت‌شده' + (g.paid ? ' (پرداخت‌شده)' : '') })); });
    }
    pack.addEventListener('change', refresh);
    cont.addEventListener('change', function () {
      var g = openGroups().filter(function (x) { return x.id === cont.value; })[0];
      if (paidBox) paidBox.checked = !!(g && g.paid);
    });
    refresh();
    return {
      el: el, refresh: refresh,
      setKind: function (k) { el.hidden = k === 'intro'; },
      values: function (kind) {
        if (kind === 'intro') return { package_id: 'intro', package_group: null, package_no: 1, package_total: 1, paid: 'free' };
        var p = packOf(pack.value), total = p[2], grp = null, no = 1;
        if (total > 1) {
          var g = cont.value ? openGroups().filter(function (x) { return x.id === cont.value; })[0] : null;
          if (g) { grp = g.id; no = g.used + 1; total = g.total; } else grp = newGroupId();
        }
        return { package_id: p[0], package_group: grp, package_no: no, package_total: total, paid: paidBox && paidBox.checked ? 'paid' : 'unpaid' };
      }
    };
  }
  // منشی/مدیر: پرداخت را برای همان جلسه، یا برای کل بسته ثبت یا لغو می‌کند
  function payBtn(s) {
    var isPaid = s.paid === 'paid', grp = !!s.package_group;
    return h('button', { class: 'btn btn--small' + (isPaid ? '' : ' btn--primary'), type: 'button', text: isPaid ? 'لغو ثبت پرداخت' : (grp ? 'ثبت پرداخت کل بسته' : 'ثبت پرداخت'), onclick: function () {
      var msg = isPaid ? 'ثبت پرداخت لغو شود؟' : (grp ? 'پرداخت کل این بسته (' + n(s.package_total) + ' جلسه) ثبت شود؟' : 'پرداخت این جلسه ثبت شود؟');
      if (!window.confirm(msg)) return;
      var now = new Date().toISOString();
      var q = sb.from('sessions').update({ paid: isPaid ? 'unpaid' : 'paid', paid_at: isPaid ? null : now, paid_by: isPaid ? null : S.user.id, updated_at: now });
      q = grp ? q.eq('package_group', s.package_group) : q.eq('id', s.id);
      q.then(function (r) { flash(r.error ? 'err' : 'ok', r.error ? explain(r.error) : (isPaid ? 'پرداخت لغو شد.' : 'پرداخت ثبت شد ✓')); loadStaff(); loadPackages(); });
    } });
  }
  // مشاور برای خودش جلسه ثبت می‌کند (تابع counselor_create_session؛ پرداخت را فقط منشی عوض می‌کند)
  function counselorBookCard() {
    if (!pkgReady()) return null;
    if (!S.cform) {
      return h('section', { class: 'card book' }, h('h2', { text: 'ثبت جلسهٔ جدید' }),
        h('p', { class: 'hint', text: 'برای مراجعِ خودتان وقت ثبت کنید. منشی همان‌جا در فهرست می‌بیند، شمارهٔ مراجع را ثبت می‌کند و پرداخت را علامت می‌زند.' }),
        h('div', { class: 'actions' }, h('button', { class: 'btn btn--primary', type: 'button', text: 'ثبت جلسه', onclick: function () { S.cform = true; S.cdone = null; render(); } })));
    }
    var f = {
      label: h('input', { class: 'input', maxlength: 60, required: true, placeholder: 'نام کوچک یا یک کد، نه نام کامل' }),
      dur: h('select', { class: 'select' }, [15, 30, 45, 60, 90].map(function (x) { return h('option', { value: x, text: nf.format(x) + ' دقیقه', selected: x === 45 }); })),
      mode: h('select', { class: 'select' }, h('option', { value: 'video', text: 'تصویری' }), h('option', { value: 'audio', text: 'صوتی' })),
      kind: h('select', { class: 'select' }, h('option', { value: 'session', text: 'جلسه' }), h('option', { value: 'intro', text: 'جلسهٔ رایگان پیش‌مشاوره' }))
    };
    var pf = packFields(function () { return S.user.id; }, false);
    var preview = h('p', { class: 'hint', text: '' });
    var whenLocal = function () { var d = f.date.value(), t = f.time.value(); return d && t ? d + 'T' + t : ''; };
    var showPreview = function () {
      var d = tehranToUtc(whenLocal());
      preview.textContent = '';
      if (d) { preview.appendChild(document.createTextNode('ثبت می‌شود: ')); preview.appendChild(dayNode(d)); preview.appendChild(document.createTextNode('، ساعت ' + timeOf(d) + ' به وقت ایران')); }
    };
    f.date = dateField('', showPreview);
    f.time = timeField(showPreview);
    f.kind.addEventListener('change', function () { f.dur.value = f.kind.value === 'intro' ? '15' : '45'; pf.setKind(f.kind.value); });
    var submit = h('button', { class: 'btn btn--primary', type: 'submit', text: 'ثبت جلسه' });
    return h('form', { class: 'card book', onsubmit: function (e) {
      e.preventDefault();
      var when = tehranToUtc(whenLocal());
      if (!when || !f.label.value.trim()) { flash('err', 'نام مراجع و زمان را کامل کنید.'); return render(); }
      submit.disabled = true;
      findConflict(S.user.id, when, +f.dur.value).then(function (cf) {
        if (cf && !window.confirm(conflictText(cf))) { submit.disabled = false; return; }
        var v = pf.values(f.kind.value);
        sb.rpc('counselor_create_session', { p_label: f.label.value.trim(), p_starts: when.toISOString(), p_duration: +f.dur.value, p_mode: f.mode.value, p_kind: f.kind.value,
          p_package_id: v.package_id, p_package_group: v.package_group, p_package_no: v.package_no, p_package_total: v.package_total }).then(function (r) {
          if (r.error) { submit.disabled = false; flash('err', explain(r.error)); return render(); }
          S.cform = false;
          S.cdone = { s: { id: r.data, counselor_id: S.user.id, client_label: f.label.value.trim(), starts_at: when.toISOString(), duration_min: +f.dur.value, mode: f.mode.value, kind: f.kind.value } };
          loadCounselor(); loadPackages();
        });
      });
    } },
      h('h2', { text: 'ثبت جلسهٔ جدید' }),
      h('div', { class: 'field' }, h('label', { text: 'مراجع (نام کوچک یا کد)' }), f.label),
      h('div', { class: 'row' },
        h('div', { class: 'field' }, h('label', { text: 'تاریخ' }), f.date.el),
        h('div', { class: 'field' }, h('label', { text: 'ساعت (به وقت ایران، ۲۴ ساعته)' }), f.time.el)),
      preview,
      h('div', { class: 'row' }, h('div', { class: 'field' }, h('label', { text: 'مدت' }), f.dur), h('div', { class: 'field' }, h('label', { text: 'نوع تماس' }), f.mode)),
      h('div', { class: 'field' }, h('label', { text: 'جلسه یا پیش‌مشاوره' }), f.kind),
      pf.el,
      h('p', { class: 'hint', text: 'محتوای جلسه یا یادداشت بالینی را هیچ‌جا این‌جا ننویسید.' }),
      h('div', { class: 'actions' }, submit, h('button', { class: 'btn', type: 'button', text: 'انصراف', onclick: function () { S.cform = false; render(); } })));
  }
  function counselorDoneCard() {
    if (!S.cdone) return null;
    var ds = S.cdone.s;
    return h('section', { class: 'card hero', role: 'status' }, h('h2', { text: 'جلسه ثبت شد ✓' }),
      h('p', { class: 'hint' }, ds.client_label + ' — ', dayNode(ds.starts_at), '، ساعت ' + timeOf(ds.starts_at) + '. منشی آن را در فهرست می‌بیند.'),
      h('p', { class: 'hint', text: 'شمارهٔ مراجع را فقط منشی ثبت می‌کند و تأیید را برای او می‌فرستد؛ مشاورها شماره‌ای نمی‌بینند و نمی‌نویسند.' }),
      h('div', { class: 'actions' }, h('button', { class: 'btn btn--small', type: 'button', text: 'بستن', onclick: function () { S.cdone = null; render(); } })));
  }

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
    if (/reason required/i.test(m)) return 'برای حذف مشاورهٔ اصلی نوشتن دلیل لازم است.';
    if (/not due yet|not found/i.test(m)) return 'جلسه پیدا نشد یا هنوز وقتش نشده است.';
    if (/profiles_phone_check/i.test(m)) return 'شماره معتبر نیست. فقط رقم، فاصله و + بنویسید.';
    if (/foreign key|violates|23503/i.test(m)) return 'این مورد به جلسه یا سابقه وصل است و حذف نمی‌شود. اول جلسه‌هایش را پاک کنید، یا او را غیرفعال کنید.';
    if (/invalid meet/i.test(m)) return 'لینک Meet معتبر نیست. باید شبیه meet.google.com/abc-defg-hij باشد.';
    if (/weak|at least|character/i.test(m)) return 'رمز عبور ضعیف است: دست‌کم ۱۲ نویسه و شامل حرف کوچک و بزرگ انگلیسی و عدد.';
    if (/failed to fetch|network|load failed/i.test(m)) return 'اتصال به سرور برقرار نشد. اینترنت را بررسی کنید؛ اگر سالم است، پایین همین صفحه «عیب‌یابی اتصال» را باز کنید.';
    return 'خطایی رخ داد. دوباره امتحان کنید.';
  }
  function flash(type, text) { S.flash = { type: type, text: text }; S.flashUntil = Date.now() + 3500; }   // چند بازنقاشی پشت‌سرهم پیام را نمی‌بلعد

  /* ───────────── اتصال ───────────── */
  function connect() {
    if (MOCK) { return window.__panelMock(/[?&]mock=(\w+)/.exec(location.search)[1]); }
    return window.supabase.createClient(CFG.url, CFG.key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'sb-bxrwcdonxeirhvpinwpz-auth-token' }   // همان کلید قبلی: عوض‌شدن مسیر (مستقیم یا واسطه) کسی را بیرون نمی‌اندازد
    });
  }

  /* مسیر سرور داده: اگر آدرس مستقیم (supabase.co) از شبکهٔ کاربر بسته باشد، از واسطهٔ Cloudflare (altUrl) می‌رویم.
     برنده‌ی آخرین آزمایش ۱۲ ساعت یادآوری می‌شود تا هر بار منتظر آزمایش نمانیم. */
  function probe(base, ms) {
    return new Promise(function (resolve) {
      var done = false, t = setTimeout(function () { if (!done) { done = true; resolve(false); } }, ms);
      function fin(ok) { if (done) return; done = true; clearTimeout(t); resolve(ok); }
      try { fetch(base + '/auth/v1/health', { headers: { apikey: CFG.key }, cache: 'no-store' }).then(function (r) { fin(r.status === 200 || r.status === 401); }, function () { fin(false); }); } catch (e) { fin(false); }
    });
  }
  function probeTwice(base, ms) { return probe(base, ms).then(function (ok) { return ok ? true : probe(base, ms); }); }
  function pickApi(done) {
    if (MOCK || !CFG.altUrl) return done(CFG.url);
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem('hn_api') || 'null'); } catch (e) { saved = null; }
    if (saved && saved.url === CFG.altUrl && Date.now() - saved.at < 12 * 3600 * 1000) return done(CFG.altUrl);
    // هر دو مسیر هم‌زمان آزمایش می‌شوند؛ اگر مستقیم جواب داد همان، وگرنه واسطه
    var dOk = null, aOk = null, fired = false;
    function decide() {
      if (fired) return;
      if (dOk === true) { fired = true; try { localStorage.removeItem('hn_api'); } catch (e) { /* مهم نیست */ } return done(CFG.url); }
      if (dOk === false && aOk !== null) {
        fired = true;
        if (aOk) { try { localStorage.setItem('hn_api', JSON.stringify({ url: CFG.altUrl, at: Date.now() })); } catch (e2) { /* مهم نیست */ } return done(CFG.altUrl); }
        return done(CFG.url);      // هیچ‌کدام جواب نداد: همان مسیر اصلی و پیام خطای معمول
      }
    }
    probe(CFG.url, 4500).then(function (ok) { dOk = ok; decide(); });
    probeTwice(CFG.altUrl, 7000).then(function (ok) { aOk = ok; decide(); });
  }

  function boot() {
    if (!MOCK && (!window.supabase || !CFG.url || !CFG.key)) {
      app.replaceChildren(h('div', { class: 'boot' }, h('p', { text: 'پنل روی این مرورگر اجرا نشد.' }),
        h('p', { class: 'hint', text: 'مرورگر گوشی را به‌روز کنید یا پنل را با مرورگر دیگری (مثلاً Chrome) باز کنید.' }),
        h('p', null, h('a', { href: 'diag.html', text: 'عیب‌یابی اتصال و مرورگر' }))));
      return;
    }
    pickApi(function (url) { CFG.url = url; boot2(); });
  }
  function boot2() {
    sb = connect();
    sb.auth.onAuthStateChange(function (event, session) {
      // درون این تابع به پایگاه‌داده زنگ نزنید؛ به یک چرخه بعد موکول می‌شود
      setTimeout(function () { onSession(event, session); }, 0);
    });
    sb.auth.getSession().then(function (r) { onSession('INITIAL', r.data && r.data.session); });
    // صفحهٔ مشاور هر دقیقه تازه می‌شود (پنجرهٔ ورود به اتاق)، ولی هرگز وسط نوشتن در یک فیلد
    setInterval(function () {
      var tag = (document.activeElement && document.activeElement.tagName) || '';
      if ((S.view === 'counselor' || (S.view === 'staff' && (S.tab === 'mine' || (S.tab === 'board' && S.profile && S.profile.takes_sessions)))) && !/INPUT|SELECT|TEXTAREA/.test(tag)) loadCounselor();
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
      try { if (!MOCK && !sessionStorage.getItem('hn_sig')) { sessionStorage.setItem('hn_sig', '1'); sb.rpc('record_signin', { p_ua: navigator.userAgent || '' }).then(function () {}, function () {}); } } catch (e) { /* ثبت ورود اختیاری است */ }
      S.view = (r.data.role === 'counselor') ? 'counselor' : 'staff';
      if (S.view === 'counselor') { loadCounselor(); refreshPush(); }
      else { S.tab = 'board'; startRealtime(); loadStaff(); refreshPush(); if (r.data.takes_sessions) loadCounselor(); }
      sb.from('sessions').select('paid').limit(1).then(function (q) { S.pkgCol = !q.error; if (S.pkgCol) loadPackages(); });
    });
  }

  /* ───────────── صفحه‌ها ───────────── */
  /* ───────────── عکس کنار نام (همان پرتره‌های صفحهٔ مشاورهای سایت) ───────────── */
  function nkey(s) {   // «دکتر»، فاصله، نیم‌فاصله و ی/ک عربی نادیده گرفته می‌شود
    return String(s || '').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/^\s*دکتر\s*/, '').replace(/[\s‌]+/g, '');
  }
  var PORTRAIT = {};
  [['آرمان سلیمی‌کوچی', 'arman-salimi-kouchi'], ['آناهیتا بهداروند', 'anahita-behdarvand'], ['ابوالفضل زارعی', 'abolfazl-zarei'],
   ['الناز زرین‌فر', 'elnaz-zarinfar'], ['حسین مختاری', 'hossein-mokhtari'], ['سارا فتاحی', 'sara-fattahi'],
   ['سارا منصفی', 'sara-monsefi'], ['ساناز زرین‌فر', 'sanaz-zarinfar'], ['سپیده وحید هرندی', 'sepideh-vahid-harandi'],
   ['صفا مصطفی‌زاده', 'safa-mostafazadeh'], ['محسن شاه ولی', 'mohsen-shahvali'],
   ['مرجان علی‌محمدی', 'marjan-alimohammadi'], ['مژگان سپاه‌منصور', 'mojgan-sepahmansour'], ['مهدی قنبری', 'mahdi-ghanbari'], ['لیلا جباری', 'leila-jabbari'],
   ['نشاط غلامی‌پور', 'neshat-gholamipour'], ['نگار تیموری', 'negar-teymouri'], ['نورا دهقان‌پور', 'nora-dehghanpour'],
   ['مدیر هم‌نوا', 'arash-modir'], ['منشی هم‌نوا', 'nazanin-monshi'], ['آرش', 'arash-modir'], ['نازنین', 'nazanin-monshi'], ['نازنین فتاحی', 'nazanin-monshi']
  ].forEach(function (p) { PORTRAIT[nkey(p[0])] = p[1]; });

  function avatar(name) {
    var f = PORTRAIT[nkey(name)], ini = nkey(name).charAt(0) || '؟';
    var box = h('span', { class: 'avatar', 'aria-hidden': 'true' });
    if (f) {
      var img = h('img', { src: '../assets/img/' + f + '-portrait.webp', alt: '', width: '64', height: '64', decoding: 'async' });
      img.addEventListener('error', function () { img.remove(); box.textContent = ini; });   // عکس نیامد: حرف اول اسم
      box.appendChild(img);
    } else box.textContent = ini;
    return box;
  }

  /* سلام، تاریخ شمسی و نقش — بالای صفحه، کنار عکس بزرگ */
  function salute() {
    try {
      var hr = +new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Tehran' }).format(new Date());
      return hr < 5 ? 'شب بخیر' : hr < 12 ? 'صبح بخیر' : hr < 17 ? 'ظهر بخیر' : hr < 20 ? 'عصر بخیر' : 'شب بخیر';
    } catch (e) { return 'سلام'; }
  }
  function dateFa() {
    try {
      var parts = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Tehran' }).formatToParts(new Date()), o = {};
      parts.forEach(function (x) { o[x.type] = x.value; });
      return o.weekday + ' ' + o.day + ' ' + o.month + ' ' + o.year;
    } catch (e) { return ''; }
  }
  function welcome(who) {
    var role = S.profile && S.profile.role, logo = logo3d();
    var sec = h('section', { class: 'welcome' }, avatar(who),
      h('div', { class: 'welcome__txt' },
        h('p', { class: 'welcome__hi', text: salute() }),
        h('h1', { class: 'welcome__name', text: who }),
        h('p', { class: 'welcome__meta' },
          role && ROLE_FA[role] ? h('span', { class: 'role', text: ROLE_FA[role] }) : null,
          h('span', { class: 'welcome__date welcome__date--in' }, ico('calendar'), h('span', { text: dateFa() })))),
      h('div', { class: 'welcome__art', 'aria-hidden': 'true' }, h('div', { class: 'auth__glow', 'data-per': '6' }), h('div', { class: 'auth__orbit auth__orbit--a', 'data-per': '26' }), h('div', { class: 'auth__orbit auth__orbit--b', 'data-per': '40' }), logo),
      h('p', { class: 'welcome__tag', text: 'مشاورهٔ روان‌شناسی آنلاین ویژهٔ ایرانیان خارج از کشور' }));
    sec.appendChild(h('span', { class: 'welcome__date welcome__date--row' }, ico('calendar'), h('span', { text: dateFa() })));
    tilt3d(logo, sec);
    return sec;
  }

  function counselorNav() {
    var items = [['video', 'اتاق مشاوره', 'sec-room'], ['calendar', 'جلسه‌های پیش‌رو', 'sec-up'], ['bell', 'لینک و اعلان', 'sec-link'], ['clock', 'جلسه‌های گذشته', 'sec-past']];
    return h('div', { class: 'tabs tabs--anchors', role: 'navigation', 'aria-label': 'بخش‌های صفحه' }, items.map(function (it, i) {
      return h('button', { class: 'tab', type: 'button', 'aria-current': i === 0 ? 'true' : null, onclick: function (e) {
        var el = document.getElementById(it[2]); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        Array.prototype.forEach.call(e.currentTarget.parentNode.children, function (x) { x.removeAttribute('aria-current'); });
        e.currentTarget.setAttribute('aria-current', 'true');
      } }, ico(it[0]), h('span', { text: it[1] }));
    }));
  }

  var WEBMAIL_URL = 'https://server126c.irwebspace.com/webmail';
  function shell(children) {
    var who = S.user ? ((S.profile && S.profile.full_name) || S.user.email) : '';
    var kids = (Array.isArray(children) ? children : [children]).filter(Boolean), nav = null;
    kids = kids.filter(function (c) { if (c.classList && c.classList.contains('tabs')) { nav = c; return false; } return true; });
    var staff = !!nav, active = !!(S.profile && S.profile.active);
    if (!nav && active && S.view === 'counselor') nav = counselorNav();
    var pwBtn = function (cls) {
      return S.profile ? h('button', { class: cls, type: 'button', title: 'تغییر رمز', 'aria-label': 'تغییر رمز', onclick: function () { S.view = 'setpw'; S.canCancel = true; render(); } }, ico('key'), h('span', { class: 'ibtn__t', text: 'تغییر رمز' })) : null;
    };
    var outBtn = function (cls) { return h('button', { class: cls + ' ibtn--out', type: 'button', title: 'خروج', 'aria-label': 'خروج', onclick: signOut }, ico('logout'), h('span', { class: 'ibtn__t', text: 'خروج' })); };
    /* ایمیل سازمانی هم‌نوا فعلاً فقط مدیر دارد؛ پس پیوند ورود به وب‌میل فقط به او نشان داده می‌شود (در تب تازه باز می‌شود) */
    var mailBtn = function (cls) {
      return S.profile && S.profile.active && S.profile.role === 'admin'
        ? h('a', { class: cls + ' ' + cls + '--mail', href: WEBMAIL_URL, target: '_blank', rel: 'noopener noreferrer', title: 'ورود به ایمیل هم‌نوا', 'aria-label': 'ورود به ایمیل هم‌نوا (در تب تازه باز می‌شود)' }, ico('mail'), h('span', { class: 'ibtn__t', text: cls === 'sbtn' ? 'ورود به ایمیل هم‌نوا' : 'ایمیل' })) : null;
    };
    var head = h('header', { class: 'top' }, h('div', { class: 'top__in' },
      h('div', { class: 'brand' }, svgEl(MARK), h('div', null, h('b', { text: 'هم‌نوا' }), h('span', { text: 'پنل مشاور' }))),
      S.user ? h('div', { class: 'top__acts' }, mailBtn('ibtn'), pwBtn('ibtn'), outBtn('ibtn')) : null));
    var role = S.profile && ROLE_FA[S.profile.role];
    var side = h('aside', { class: 'side' },
      h('div', { class: 'side__brand' }, svgEl(MARK_LIGHT), h('div', null, h('b', { text: 'هم‌نوا' }), h('span', { text: 'فضای کاری مشاوران' }))),
      nav ? h('p', { class: 'side__label', text: staff ? 'منوی اصلی' : 'در این صفحه' }) : null, nav,
      S.user ? h('div', { class: 'side__user' },
        h('div', { class: 'side__who' }, avatar(who), h('div', null, h('b', { text: who }), role ? h('span', { text: role }) : null)),
        h('div', { class: 'side__acts' }, mailBtn('sbtn'), pwBtn('sbtn'), outBtn('sbtn'))) : null);
    var nodes = [];
    if (active) nodes.push(welcome(who));
    if (S.flash) nodes.push(h('div', { class: 'flash flash--' + S.flash.type, role: 'status', text: S.flash.text }));
    if (Date.now() > (S.flashUntil || 0)) S.flash = null;
    kids.forEach(function (c) { nodes.push(c); });
    var inst = installCard();
    if (inst) nodes.push(inst);
    app.replaceChildren(h('div', { class: 'layout' + (staff ? ' layout--staff' : '') + (nav ? '' : ' layout--bare') }, side, h('div', { class: 'main' }, head, h('div', { class: 'wrap' }, nodes))));
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
    var counselorView = S.view === 'counselor' || S.tab === 'mine';
    var msg = {
      unsupported: 'این مرورگر اعلان نمی‌دهد. در اندروید از Chrome و در آیفون از Safari (پنل نصب‌شده) استفاده کنید.',
      'need-install': 'در آیفون اعلان فقط برای پنلِ نصب‌شده کار می‌کند: پنل را با «Add to Home Screen» به صفحهٔ اصلی اضافه کنید و از همان آیکون باز کنید؛ بعد این دکمه فعال می‌شود.',
      denied: 'اعلان برای هم‌نوا بسته است. در تنظیمات گوشی یا مرورگر، اعلان‌های این سایت را روشن کنید و صفحه را دوباره باز کنید.',
      checking: 'در حال بررسی…', busy: 'لطفاً صبر کنید…',
      off: counselorView ? 'وقتی برایتان جلسه‌ای ثبت شود، زمانش عوض شود یا مراجع لغو کند، حتی با بسته بودن پنل، روی همین گوشی اعلان (با صدای گوشی) می‌آید.'
        : 'وقتی مشاوری وارد اتاق شود، حتی اگر پنل بسته باشد، روی همین گوشی اعلان (با صدای گوشی) می‌آید.',
      on: counselorView ? 'اعلان روی این گوشی فعال است. جلسهٔ تازه، تغییر زمان و لغو جلسه را حتی با بسته بودن پنل، با اعلان می‌گیرید.'
        : 'اعلان روی این گوشی فعال است. وقتی مشاوری وارد اتاق شود، حتی با بسته بودن پنل، خبر می‌رسد.'
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
    } else if (ios && /crios|fxios|edgios/i.test(ua)) {
      // Chrome/Firefox/Edge on iPhone have no «Install app» item and no ⋮ menu; Safari is the reliable route
      body = [h('p', { class: 'hint', text: 'در آیفون بهترین راه Safari است: همین آدرس (hamnavaa.com/panel) را در Safari باز کنید ← دکمهٔ «اشتراک‌گذاری» (مربع با فلش رو به بالا) ← «Add to Home Screen» ← «Add».' }),
        h('p', { class: 'hint', text: 'اگر در همین Chrome می‌مانید: دکمهٔ «اشتراک‌گذاری» کنار نوار آدرس را بزنید و «Add to Home Screen» را پیدا کنید. اگر نبود، با Safari باز کنید.' })];
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
  function vLoading() { app.replaceChildren(h('div', { class: 'boot' }, svgEl(MARK), h('p', { text: 'در حال بارگذاری…' }))); }

  /* ───────────── ورود و ساخت رمز: چیدمان دو ستونی (روی گوشی: بنر بالا، فرم زیر) ───────────── */
  /* لوگوی سه‌بعدی: حباب و سه میله از لایه‌های SVG روی هم در فضای CSS-3D ساخته می‌شود (ضخامت واقعی)،
     با چرخش نرم دنبال ماوس/لمس و چرخش آرام وقتی کسی دست نمی‌زند. */
  var L3_BUB = 'M14 18 h56 a8 8 0 0 1 8 8 v28 a8 8 0 0 1 -8 8 h-30 l-16 14 v-14 h-10 a8 8 0 0 1 -8 -8 v-28 a8 8 0 0 1 8 -8 Z';
  function mix(c1, c2, t) {
    var a = [1, 3, 5].map(function (i) { return parseInt(c1.substr(i, 2), 16); }), b = [1, 3, 5].map(function (i) { return parseInt(c2.substr(i, 2), 16); });
    return '#' + a.map(function (v, i) { var x = Math.round(v + (b[i] - v) * t); return (x < 16 ? '0' : '') + x.toString(16); }).join('');
  }
  function logo3d() {
    var DEPTH = 24, LIFT = 7, out = [];
    var DEFS = '<defs>'
      + '<linearGradient id="l3Face" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFEFA"/><stop offset=".55" stop-color="#F6EEDA"/><stop offset="1" stop-color="#E4D4AE"/></linearGradient>'
      + '<linearGradient id="l3Rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#B78A46" stop-opacity=".55"/></linearGradient>'
      + '<linearGradient id="l3Teal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5E9C8E"/><stop offset="1" stop-color="#2D5D53"/></linearGradient>'
      + '<linearGradient id="l3Gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FBE7B8"/><stop offset=".5" stop-color="#E2B66C"/><stop offset="1" stop-color="#B78A46"/></linearGradient>'
      + '<linearGradient id="l3Sheen" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>'
      + '<clipPath id="l3Clip"><path d="' + L3_BUB + '"/></clipPath>'
      + '<filter id="l3Blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.1"/></filter></defs>';
    function ly(z, inner) { return '<i class="l3d__ly" style="--z:' + z + '"><svg viewBox="0 0 84 84" fill="none" aria-hidden="true">' + inner + '</svg></i>'; }
    // ضخامتِ حباب (از پشت به جلو): پایین‌ترین لایه تیره‌تر
    for (var i = DEPTH; i >= 1; i--) {
      var c = mix('#B8924B', '#4F3C1C', i / DEPTH);
      out.push(ly(-i, '<path d="' + L3_BUB + '" fill="' + c + '" stroke="' + c + '" stroke-width=".7" stroke-linejoin="round"/>'));
    }
    // رویهٔ حباب + لبهٔ براق + جلوهٔ نور
    out.push(ly(0, DEFS + '<path d="' + L3_BUB + '" fill="url(#l3Face)"/><path d="' + L3_BUB + '" stroke="url(#l3Rim)" stroke-width="1.1" stroke-linejoin="round"/>'
      + '<g clip-path="url(#l3Clip)"><g transform="rotate(24 42 42)"><rect x="6" y="-20" width="12" height="130" fill="url(#l3Sheen)" opacity=".5"/></g></g>'));
    // سایهٔ نرم میله‌ها روی رویهٔ حباب
    out.push(ly(0.9, '<g filter="url(#l3Blur)" fill="#163932" fill-opacity=".34"><rect x="29.4" y="36" width="6" height="14" rx="3"/><rect x="40.4" y="30" width="6" height="26" rx="3"/><rect x="51.4" y="36" width="6" height="14" rx="3"/></g>'));
    // میله‌ها: چند لایه، بالاترین لایه با گرادیان
    for (var j = 1; j <= LIFT; j++) {
      var top = j === LIFT, t = (j - 1) / (LIFT - 1);
      var ct = top ? 'url(#l3Teal)' : mix('#1D463F', '#2F6359', t), cg = top ? 'url(#l3Gold)' : mix('#8A6B39', '#C2994F', t);
      out.push(ly(j + 1.2, '<rect x="28" y="34" width="6" height="14" rx="3" fill="' + ct + '"/><rect x="39" y="28" width="6" height="26" rx="3" fill="' + cg + '"/><rect x="50" y="34" width="6" height="14" rx="3" fill="' + ct + '"/>'));
    }
    var root = document.createElement('div');
    root.className = 'l3d';
    root.setAttribute('role', 'img');
    root.setAttribute('aria-label', 'لوگوی هم‌نوا');
    root.setAttribute('data-per', '6');
    root.innerHTML = '<div class="l3d__shadow" data-per="6"></div><div class="l3d__body">' + out.join('') + '</div>';
    return root;
  }
  /* حالتِ چرخش بین بازسازی‌های صفحه حفظ می‌شود (پنل هر چند ثانیه صفحه را تازه می‌کند)؛
     وگرنه لوگو هر بار به حالت اول می‌پرید. فاز انیمیشن‌های CSS هم از ساعت مشترک می‌آید. */
  var POSE = { cx: -10, cy: -30, px: .5, py: .5, has: false }, PHASE0 = performance.now();
  function phase(root, period) { return '-' + (((performance.now() - PHASE0) / 1000) % period).toFixed(2) + 's'; }
  function syncPhases(root) {
    root.querySelectorAll('[data-per]').forEach(function (el) { el.style.animationDelay = phase(root, parseFloat(el.getAttribute('data-per'))); });
  }
  function tilt3d(root, scope) {
    var body = root.querySelector('.l3d__body');
    function pose() { body.style.transform = 'rotateX(' + POSE.cx.toFixed(2) + 'deg) rotateY(' + POSE.cy.toFixed(2) + 'deg)'; }
    pose();
    var host = scope.querySelector('.welcome__art, .auth__stage') || scope;
    syncPhases(host); syncPhases(root); root.style.animationDelay = phase(root, 6);
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    function move(e) { var r = scope.getBoundingClientRect(); POSE.px = (e.clientX - r.left) / r.width; POSE.py = (e.clientY - r.top) / r.height; POSE.has = true; }
    scope.addEventListener('pointermove', move);
    scope.addEventListener('pointerdown', move);
    scope.addEventListener('pointerleave', function () { POSE.has = false; });
    requestAnimationFrame(function tick(now) {
      if (!root.isConnected) return;
      var t = (now - PHASE0) / 1000, ty, tx;
      if (POSE.has) { ty = -30 + Math.max(-.5, Math.min(.5, POSE.px - .5)) * 52; tx = -10 - (POSE.py - .5) * 38; }
      else { ty = -30 + Math.sin(t * .75) * 20; tx = -10 + Math.sin(t * .95 + 1) * 5; }
      POSE.cx += (tx - POSE.cx) * .06; POSE.cy += (ty - POSE.cy) * .06; pose();
      requestAnimationFrame(tick);
    });
  }
  var AUTH_SPARKS = [[12, 22, 7, 0], [84, 16, 5, 1.4], [20, 74, 6, 2.2], [78, 70, 8, .7], [50, 8, 4, 3], [92, 46, 4, 2.6], [6, 50, 5, 1.9]];
  function authLayout(card, extra) {
    var logo = logo3d();
    var stage = h('div', { class: 'auth__stage' },
      h('div', { class: 'auth__glow', 'data-per': '6' }),
      h('div', { class: 'auth__orbit auth__orbit--a', 'data-per': '26' }), h('div', { class: 'auth__orbit auth__orbit--b', 'data-per': '40' }), h('div', { class: 'auth__orbit auth__orbit--c' }),
      AUTH_SPARKS.map(function (s) { return h('i', { class: 'spark', 'data-per': (5 + s[3] * .5).toFixed(1), style: 'left:' + s[0] + '%;top:' + s[1] + '%;width:' + s[2] + 'px;height:' + s[2] + 'px' }); }),
      logo);
    var side = h('aside', { class: 'auth__side' },
      stage,
      h('div', { class: 'auth__copy' },
        h('p', { class: 'auth__kicker', text: 'پنل مشاوران' }),
        h('h1', { text: 'فضای کاری مشاوران هم‌نوا' }),
        h('p', { class: 'auth__lead', text: 'جلسه‌ها، اتاق‌های مشاوره و هماهنگی تیم؛ همه در یک‌جا، ساده و امن.' }),
        h('ul', { class: 'auth__points' }, [['video', 'ورود به اتاق مشاوره با یک لمس'], ['calendar', 'برنامهٔ جلسه‌ها و یادآوری به‌موقع'], ['bell', 'اعلان فوری روی گوشی برای منشی']].map(function (x) {
          return h('li', null, h('span', { class: 'pt' }, ico(x[0])), x[1]);
        }))),
      h('p', { class: 'auth__foot', text: 'مشاورهٔ روان‌شناسی آنلاین ویژهٔ ایرانیان خارج از کشور' }));
    var foot = h('p', { class: 'auth__secure' }, ico('lock'), 'ورود امن · اطلاعات مراجعان محرمانه می‌ماند');
    app.replaceChildren(h('div', { class: 'auth' }, h('main', { class: 'auth__main' }, h('div', { class: 'auth__col' }, card, extra || null, foot)), side));
    tilt3d(logo, side);
  }
  function inpField(id, label, icon, input, toggle) {
    return h('div', { class: 'field' }, h('label', { for: id, text: label }),
      h('div', { class: 'inp' + (toggle ? ' inp--tg' : '') }, ico(icon, 'inp__ico'), input, toggle || null));
  }
  function pwToggle(input) {
    var on = false, b = h('button', { class: 'pwtoggle', type: 'button', 'aria-label': 'نمایش رمز', 'aria-pressed': 'false' }, ico('eye'));
    b.addEventListener('click', function () {
      on = !on; input.type = on ? 'text' : 'password';
      b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.setAttribute('aria-label', on ? 'پنهان کردن رمز' : 'نمایش رمز');
      b.replaceChildren(ico(on ? 'eyeoff' : 'eye')); input.focus();
    });
    return b;
  }

  function vLogin() {
    var email = h('input', { class: 'input', type: 'email', id: 'em', dir: 'ltr', autocomplete: 'username', required: true, placeholder: 'name@example.com', value: S.lastEmail || '' });
    var pass = h('input', { class: 'input', type: 'password', id: 'pw', dir: 'ltr', autocomplete: 'current-password', required: true, placeholder: '••••••••••' });
    var btn = h('button', { class: 'btn btn--primary btn--block', type: 'submit', text: 'ورود' });
    var form = h('form', { class: 'authcard', onsubmit: function (e) {
      e.preventDefault(); btn.disabled = true; btn.textContent = 'در حال ورود…'; S.lastEmail = email.value.trim();
      var slow = setTimeout(function () {       // سرور هیچ جوابی نداد (شبکه بسته است): تا ابد منتظر نمی‌مانیم
        btn.disabled = false; flash('err', 'از سرور جوابی نیامد. اگر اینترنت سالم است، پایین همین صفحه «عیب‌یابی اتصال» را باز کنید.'); vLogin();
      }, 15000);
      sb.auth.signInWithPassword({ email: email.value.trim(), password: pass.value }).then(function (r) {
        clearTimeout(slow);
        if (r.error) { btn.disabled = false; flash('err', explain(r.error)); return vLogin(); }
      }, function () { clearTimeout(slow); btn.disabled = false; flash('err', explain('network')); vLogin(); });
    } },
      h('div', { class: 'authcard__head' }, h('h2', { text: 'ورود به پنل' }), h('p', { class: 'hint', text: 'با ایمیل و رمز عبور خود وارد شوید.' })),
      S.flash ? h('div', { class: 'flash flash--' + S.flash.type, role: 'status', text: S.flash.text }) : null,
      inpField('em', 'ایمیل', 'mail', email),
      inpField('pw', 'رمز عبور', 'lock', pass, pwToggle(pass)),
      h('div', { class: 'authcard__row' }, h('button', { class: 'linkbtn', type: 'button', text: 'رمزم را فراموش کرده‌ام', onclick: function () {
        if (!email.value.trim()) { flash('info', 'اول ایمیل را بنویسید.'); return vLogin(); }
        S.lastEmail = email.value.trim();
        sb.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: location.origin + location.pathname }).then(function (r) {
          flash(r.error ? 'err' : 'ok', r.error ? explain(r.error) : 'اگر این ایمیل ثبت شده باشد، لینک تغییر رمز برایش فرستاده شد. پوشهٔ اسپم را هم نگاه کنید.');
          vLogin();
        });
      } })),
      btn,
      h('p', { class: 'hint authcard__note', text: 'ثبت‌نام آزاد وجود ندارد. حساب شما را هم‌نوا می‌سازد و دعوت‌نامه به ایمیلتان می‌رسد.' }),
      h('p', { class: 'hint authcard__note' }, 'پنل باز نمی‌شود یا وارد نمی‌شوید؟ ', h('a', { href: 'diag.html', text: 'عیب‌یابی اتصال' })),
      h('p', { class: 'authcard__back' }, h('a', { href: '../', text: '← بازگشت به سایت هم‌نوا' })));
    S.flash = null;
    var inst = installCard();
    if (inst) inst.classList.add('install--auth');
    authLayout(form, inst);
    if (window.innerWidth >= 860 && !S.lastEmail) email.focus();
  }

  function vSetPw() {
    var p1 = h('input', { class: 'input', type: 'password', id: 'np1', dir: 'ltr', autocomplete: 'new-password', minlength: 12, required: true, placeholder: 'دست‌کم ۱۲ نویسه؛ حرف بزرگ، کوچک و عدد' });
    var p2 = h('input', { class: 'input', type: 'password', id: 'np2', dir: 'ltr', autocomplete: 'new-password', minlength: 12, required: true });
    var form = h('form', { class: 'authcard', onsubmit: function (e) {
      e.preventDefault();
      if (p1.value !== p2.value) { flash('err', 'دو رمز یکی نیستند.'); return vSetPw(); }
      if (p1.value.length < 12 || !/[a-z]/.test(p1.value) || !/[A-Z]/.test(p1.value) || !/[0-9]/.test(p1.value)) { flash('err', 'رمز باید دست‌کم ۱۲ نویسه و شامل حرف کوچک و بزرگ انگلیسی و عدد باشد.'); return vSetPw(); }
      sb.auth.updateUser({ password: p1.value }).then(function (r) {
        if (r.error) { flash('err', explain(r.error)); return vSetPw(); }
        history.replaceState(null, '', location.pathname + location.search);
        LINK_TYPE = null; S.view = 'ready'; S.profile = null; S.canCancel = false;
        flash('ok', 'رمز شما ثبت شد.');
        loadProfile();
      });
    } },
      h('div', { class: 'authcard__head' }, h('h2', { text: S.canCancel ? 'رمز عبور تازه' : 'رمز عبور خود را بسازید' }),
        h('p', { class: 'hint', text: S.canCancel ? 'رمز تازه جایگزین رمز فعلی می‌شود.' : 'این رمز را برای ورودهای بعدی نگه دارید.' })),
      S.flash ? h('div', { class: 'flash flash--' + S.flash.type, role: 'status', text: S.flash.text }) : null,
      inpField('np1', 'رمز جدید (دست‌کم ۱۰ نویسه)', 'lock', p1, pwToggle(p1)),
      inpField('np2', 'تکرار رمز', 'lock', p2, pwToggle(p2)),
      h('button', { class: 'btn btn--primary btn--block', type: 'submit', text: 'ذخیره و ورود' }),
      S.canCancel ? h('button', { class: 'btn btn--block btn--ghost', type: 'button', text: 'انصراف', onclick: function () { S.canCancel = false; S.view = 'ready'; S.profile = null; loadProfile(); } }) : null);
    S.flash = null;
    authLayout(form);
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
        S.mine = r.data || [];
        render();
      });
  }
  function isProvider(p) { return p.role === 'counselor' || !!p.takes_sessions; }
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
      if (S.view === 'counselor' || S.tab === 'mine') render();
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
    var card = h('div', { class: 's' + (live ? ' s--live' : '') + (ok ? ' s--done' : (!live && s.status !== 'scheduled' ? ' s--warn' : '')) },
      h('div', { class: 's__head' },
        h('div', { class: 's__time' }, dayJ(s.starts_at), h('small', null, ltr(dayG(s.starts_at)), ' · ساعت ' + timeOf(s.starts_at) + ' — ' + n(s.duration_min) + ' دقیقه (به وقت ایران)')),
        h('div', { class: 'chips' },
          h('span', { class: 'chip chip--gold', text: KIND[s.kind] }), h('span', { class: 'chip', text: MODE[s.mode] }), payChips(s),
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

  function vCounselor() { shell(counselorBody()); }
  function counselorBody() {
    var all = S.mine || [];
    var now = Date.now();
    var upcoming = all.filter(function (s) { return s.status === 'scheduled' && endOf(s) + JOIN_AFTER_MIN * 60000 >= now; });
    var past = all.filter(function (s) { return upcoming.indexOf(s) < 0; }).reverse();
    var next = upcoming.filter(function (s) { return endOf(s) > now; })[0] || upcoming[0];
    var hasLink = !!S.profile.meet_url;

    var hero = h('section', { class: 'card hero' },
      h('h2', { text: 'اتاق مشاوره' }),
      h('p', { class: 'hint' }, next ? ['جلسهٔ بعدی: ', dayLabel(next.starts_at) + '، ساعت ' + timeOf(next.starts_at) + ' — ' + next.client_label + ' — ', h('b', { class: 'cd', text: countdown(next) })] : 'جلسهٔ برنامه‌ریزی‌شده‌ای ندارید.'),
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

    var today = tehranDateInput(0), cut = now - 30 * 86400000;
    var stats = h('div', { class: 'stats' }, [
      ['clock', all.filter(function (s) { return s.status === 'scheduled' && tehranISO(s.starts_at) === today; }).length, 'جلسهٔ امروز'],
      ['calendar', upcoming.length, 'جلسهٔ پیش‌رو'],
      ['check', all.filter(function (s) { return s.status === 'done' && new Date(s.starts_at).getTime() >= cut; }).length, 'انجام‌شده، ۳۰ روز اخیر']
    ].map(function (x) { return h('div', { class: 'stat' }, h('span', { class: 'stat__ic' }, ico(x[0])), h('div', null, h('b', { text: n(x[1]) }), h('span', { text: x[2] }))); }));

    hero.id = 'sec-room';
    var linkCard = roomLinkCard(hasLink), pushC = pushCard();
    if (linkCard) linkCard.id = 'sec-link';
    var upCard = h('section', { class: 'card', id: 'sec-up' }, h('h2', { text: 'جلسه‌های پیش‌رو' }),
        upcoming.length ? groupByDay(upcoming) : h('p', { class: 'empty', text: 'جلسه‌ای در پیش نیست.' }));
    var pastCard = h('section', { class: 'card', id: 'sec-past' }, h('h2', { text: 'جلسه‌های گذشته' }),
        past.length ? [past.slice(0, S.pastN || 30).map(function (s) { return sessionCard(s, true); }),
          past.length > (S.pastN || 30) ? h('div', { class: 'actions' }, h('button', { class: 'btn btn--small', type: 'button', text: 'نمایش جلسه‌های قدیمی‌تر (' + n(past.length - (S.pastN || 30)) + ')', onclick: function () { S.pastN = (S.pastN || 30) + 30; render(); } })) : null]
          : h('p', { class: 'empty', text: 'هنوز جلسه‌ای ثبت نشده.' }));
    return [hero, stats, h('div', { class: 'cols' + (hasLink ? '' : ' cols--bfirst') }, h('div', { class: 'cols__a' }, counselorDoneCard(), counselorBookCard(), upCard, pastCard), h('div', { class: 'cols__b' }, linkCard, pushC))];
  }

  function groupByDay(list) {
    var out = [], last = null;
    list.forEach(function (s) {
      var d = tehranISO(s.starts_at);
      if (d !== last) { out.push(h('h3', { class: 'dayhead' }, dayLabel(s.starts_at), d === tehranDateInput(0) || d === tehranDateInput(1) ? h('small', { text: ' · ' + dayJ(s.starts_at) }) : null)); last = d; }
      out.push(sessionCard(s, true));
    });
    return out;
  }

  function roomLinkCard(hasLink) {
    var input = h('input', { class: 'input', dir: 'ltr', type: 'url', placeholder: 'https://meet.google.com/abc-defg-hij', value: S.profile.meet_url || '' });
    var card = h('section', { class: 'card' }, h('h2', { text: 'لینک اتاق من' }),
      h('p', { class: 'hint' }, 'در ', ltr('meet.google.com'), ' گزینهٔ ', ltr('New meeting'), ' و سپس ', ltr('Create a meeting for later'),
        ' را بزنید و لینک را این‌جا بگذارید. مراجع با همین لینک می‌آید و شما او را می‌پذیرید.'),
      h('p', { class: 'hint' }, 'با گوشی (برنامهٔ ', ltr('Google Meet'), '): دکمهٔ تماس جدید ← ', ltr('Create link'), ' ← آیکون کپی کنار لینک. اگر در وب آن گزینه را نمی‌بینید: در ', ltr('meet.google.com'), ' روی ', ltr('New meeting'), ' ← ', ltr('Start an instant meeting'),
        ' بزنید، همان لحظه آدرس بالای مرورگر (شبیه ', ltr('meet.google.com/abc-defg-hij'), ') را کپی کنید و از جلسه بیرون بیایید. این لینک بعداً هم کار می‌کند و تا یک سال پس از آخرین استفاده معتبر می‌ماند. راه دوم: در ', ltr('Google Calendar'), ' یک رویداد بسازید، ', ltr('Add Google Meet video conferencing'), ' را بزنید و لینک را کپی کنید.'),
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

  function timeField(onChange, initial) {
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
    if (initial && /^\d\d:\d\d$/.test(initial)) {
      hh.value = initial.slice(0, 2);
      var mi = initial.slice(3);
      if (![].some.call(mm.options, function (o) { return o.value === mi; })) mm.appendChild(h('option', { value: mi, text: pad2(+mi) }));
      mm.value = mi;
    }
    return { el: wrap, value: function () { return hh.value && mm.value ? hh.value + ':' + mm.value : ''; } };
  }


  /* ───────────── ابزارهای تازه: امروز، رسیدگی، تداخل، جابه‌جایی ───────────── */
  function tehranISO(ts) { var d = tehranDate(ts); return isoOf(d.gy, d.gm, d.gd); }
  function tehranHM(ts) { var t = new Date(new Date(ts).getTime() + TEHRAN_MIN * 60000); return (t.getUTCHours() < 10 ? '0' : '') + t.getUTCHours() + ':' + (t.getUTCMinutes() < 10 ? '0' : '') + t.getUTCMinutes(); }
  function dayLabel(ts) {
    var d = tehranISO(ts);
    if (d === tehranDateInput(0)) return 'امروز';
    if (d === tehranDateInput(1)) return 'فردا';
    return dayJ(ts);
  }
  function countdown(s) {
    var m = Math.round((new Date(s.starts_at).getTime() - Date.now()) / 60000);
    if (m <= 0) return Date.now() <= endOf(s) ? 'الان در جریان است' : 'زمانش گذشته';
    if (m < 60) return n(m) + ' دقیقه دیگر';
    if (m < 60 * 24) return 'حدود ' + n(Math.round(m / 60)) + ' ساعت دیگر';
    return n(Math.round(m / 1440)) + ' روز دیگر';
  }
  function findConflict(counselorId, start, durMin, exceptId) {
    var a = start.getTime(), b = a + durMin * 60000;
    return sb.from('sessions').select('*').eq('counselor_id', counselorId).eq('status', 'scheduled')
      .gte('starts_at', new Date(a - 3 * 3600000).toISOString()).lte('starts_at', new Date(b).toISOString()).then(function (r) {
        return ((r && r.data) || []).filter(function (x) {
          if (exceptId && x.id === exceptId) return false;
          var xa = new Date(x.starts_at).getTime(), xb = xa + x.duration_min * 60000;
          return xa < b && xb > a;
        })[0] || null;
      });
  }
  function conflictText(c) {
    return 'این مشاور در همین ساعت جلسهٔ دیگری دارد (مراجع «' + c.client_label + '»، ' + dayLabel(c.starts_at) + ' ساعت ' + timeOf(c.starts_at) + ').\nباز هم ثبت شود؟';
  }

  function loadToday() {
    var from = tehranToUtc(tehranDateInput(0) + 'T00:00'), to = tehranToUtc(tehranDateInput(0) + 'T23:59');
    var aFrom = new Date(Date.now() - 14 * 86400000).toISOString(), aTo = new Date(Date.now() - 45 * 60000).toISOString();
    Promise.all([
      sb.from('sessions').select('*').gte('starts_at', from.toISOString()).lte('starts_at', to.toISOString()).order('starts_at', { ascending: true }).limit(200),
      sb.from('sessions').select('*').eq('status', 'scheduled').gte('starts_at', aFrom).lte('starts_at', aTo).order('starts_at', { ascending: false }).limit(100)
    ]).then(function (r) {
      S.data.today = (r[0] && r[0].data) || [];
      S.data.attention = ((r[1] && r[1].data) || []).filter(function (s) { return endOf(s) < Date.now() - 15 * 60000; });
      var ids = S.data.today.concat(S.data.attention).map(function (s) { return s.id; });
      S.data.tc = {};
      if (!ids.length) { if (S.view === 'staff') render(); return; }
      sb.from('session_contacts').select('*').in('session_id', ids).then(function (c) {
        ((c && c.data) || []).forEach(function (x) { S.data.tc[x.session_id] = x.client_phone; });
        if (S.view === 'staff') render();
      });
    });
  }
  function setStatus(s, status) {
    sb.from('sessions').update({ status: status, updated_at: new Date().toISOString() }).eq('id', s.id).then(function (r) {
      flash(r.error ? 'err' : 'ok', r.error ? explain(r.error) : 'ثبت شد.'); loadStaff();
    });
  }
  function agendaRow(s, mode) {
    var p = profileOf(s.counselor_id), phone = (S.data.tc && S.data.tc[s.id]) || (S.data.contacts && S.data.contacts[s.id]);
    var acts = h('div', { class: 'actions' });
    if (mode === 'attention') {
      acts.appendChild(h('button', { class: 'btn btn--primary btn--small', type: 'button', text: 'انجام شد', onclick: function () { if (window.confirm('این جلسه انجام شد؟')) setStatus(s, 'done'); } }));
      acts.appendChild(h('button', { class: 'btn btn--danger btn--small', type: 'button', text: 'غیبت مراجع', onclick: function () { if (window.confirm('مراجع در این جلسه حاضر نشد؟')) setStatus(s, 'client_no_show'); } }));
    } else if (s.status === 'scheduled') {
      if (phone) acts.appendChild(h('button', { class: 'btn btn--wa btn--small', type: 'button', text: 'یادآوری به مراجع', onclick: function () { sendReminder(s, p, phone); } }));
      var cr = counselorRemindBtn(s, p);
      if (cr) acts.appendChild(cr);
    }
    if (mode === 'today') {   // ردیف فشرده: ساعت | مراجع و مشاور | یادآوری یا وضعیت
      var ok = s.status === 'done', end = s.status === 'scheduled' ? null
        : h('span', { class: 'chip ' + (ok ? 'chip--ok' : 'chip--warn'), text: STATUS[s.status] });
      return h('div', { class: 'r r--' + kindOf(s) + (ok ? ' r--done' : s.status !== 'scheduled' ? ' r--warn' : '') },
        h('div', { class: 'r__head r__head--static' }, h('span', { class: 'r__time', text: timeOf(s.starts_at) }),
          h('span', { class: 'r__who' }, h('b', { text: s.client_label }), h('small', { text: nameOf(s.counselor_id) + (s.duration_min !== (kindOf(s) === 'intro' ? 15 : 45) ? ' · ' + n(s.duration_min) + ' د' : '') + (s.mode === 'audio' ? ' · صوتی' : '') })), end),
        acts.childNodes.length ? h('div', { class: 'r__acts' }, acts.childNodes.length > 1 ? Array.prototype.slice.call(acts.childNodes) : acts.firstChild) : null);
    }
    return h('div', { class: 's agenda' + (s.status === 'scheduled' ? '' : ' agenda--done') },
      h('div', { class: 's__head' },
        h('div', { class: 's__time' }, mode === 'attention' ? [dayJ(s.starts_at), h('small', null, 'ساعت ' + timeOf(s.starts_at))] : [timeOf(s.starts_at), h('small', { text: n(s.duration_min) + ' دقیقه · ' + KIND[s.kind] + ' · ' + MODE[s.mode] })]),
        h('span', { class: 'chip ' + (s.status === 'done' ? 'chip--ok' : (s.status === 'scheduled' ? '' : 'chip--warn')), text: STATUS[s.status] })),
      h('div', null, h('b', { text: nameOf(s.counselor_id) }), ' — ' + s.client_label, mode === 'attention' ? [' ', h('span', { class: 'chip chip--gold', text: KIND[s.kind] })] : null), acts);
  }
  function attentionCard() {
    var list = S.data.attention || [];
    if (!list.length) return null;
    return h('section', { class: 'card card--attn' }, h('h2', null, 'نیاز به رسیدگی ', h('span', { class: 'chip chip--warn', text: n(list.length) })),
      h('p', { class: 'hint', text: 'جلسه‌هایی که تمام شده‌اند ولی هنوز «برنامه‌ریزی‌شده» مانده‌اند. وضعیتشان را مشخص کنید تا آمار درست بماند.' }),
      list.map(function (s) { return agendaRow(s, 'attention'); }));
  }
  function todayCard() {
    var list = S.data.today || [], cnt = countKinds(list), k = S.data.tk || 'session', shown = ofKind(list, k);
    return h('section', { class: 'card' }, h('h2', null, 'جلسه‌های امروز ', h('small', { class: 'hint', text: dayJ(Date.now()) })),
      list.length ? [kindSeg(cnt, k, function (x) { S.data.tk = x; render(); }),
        shown.length ? h('div', { class: 'rows' }, shown.map(function (s) { return agendaRow(s, 'today'); })) : h('p', { class: 'empty', text: k === 'intro' ? 'امروز پیش‌مشاوره‌ای نیست.' : 'امروز مشاورهٔ اصلی‌ای نیست.' })]
        : h('p', { class: 'empty', text: 'امروز جلسه‌ای ثبت نشده.' }));
  }

  /* ───────────── صفحهٔ منشی / مدیر ───────────── */
  function loadStaff() {
    loadToday();
    var from = tehranToUtc((S.data.from || tehranDateInput(-7)) + 'T00:00');
    var to = tehranToUtc((S.data.to || tehranDateInput(30)) + 'T23:59');
    var q = sb.from('sessions').select('*').gte('starts_at', from.toISOString()).lte('starts_at', to.toISOString()).order('starts_at', { ascending: true }).limit(500);
    if (S.data.who) q = q.eq('counselor_id', S.data.who);
    Promise.all([q, sb.from('profiles').select('*').order('full_name', { ascending: true })]).then(function (res) {
      if (res[0].error || res[1].error) flash('err', explain(res[0].error || res[1].error));
      S.data.sessions = res[0].data || []; S.data.profiles = res[1].data || [];
      var ids = S.data.sessions.map(function (s) { return s.id; });
      loadFirstFlags();
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
  /* فهرست افراد فقط هنگام ورود بار می‌شد؛ در برنامهٔ گوشی که روزها باز می‌ماند کهنه می‌شد
     (مثلاً مدیرِ مشاور در فهرست «جلسهٔ جدید» نمی‌آمد). حالا با باز کردن تب‌ها و برگشتن به برنامه تازه می‌شود. */
  function refreshProfiles() {
    if (MOCK || S.view !== 'staff' || !S.user) return;
    sb.from('profiles').select('*').order('full_name', { ascending: true }).then(function (r) {
      if (r.error || !r.data) return;
      var sig = function (a) { return (a || []).map(function (p) { return [p.id, p.role, p.active, p.takes_sessions, p.full_name].join('|'); }).join(';'); };
      var changed = sig(r.data) !== sig(S.data.profiles);
      S.data.profiles = r.data;
      if (changed && S.view === 'staff') render();
    });
  }

  /* ───────────── حسابداری ساده (فقط مدیر و منشی؛ با migration-16) ─────────────
     دفتر کل: هر ردیف یک واریز یا برداشت در «حساب ارزی» یا «حساب تومانی». جمع‌ها در مرورگر حساب می‌شوند. */
  var ACC_FA = { fx: 'حساب ارزی', irr: 'حساب تومانی' };
  var ACC_WHERE = { fx: 'خارج از ایران', irr: 'ایران' };
  var FX_CUR = [['USD', 'دلار آمریکا'], ['EUR', 'یورو'], ['GBP', 'پوند'], ['CAD', 'دلار کانادا'], ['AUD', 'دلار استرالیا'], ['AED', 'درهم امارات'], ['TRY', 'لیر ترکیه'], ['USDT', 'تتر']];
  var ACC_CATS = { 'in': [['session', 'جلسهٔ مشاوره'], ['package', 'پکیج جلسه'], ['other_in', 'سایر دریافتی‌ها'], ['transfer', 'انتقال از حساب دیگر']],
                   out: [['counselor', 'حق‌الزحمهٔ مشاور'], ['ads', 'تبلیغات'], ['software', 'سرویس و نرم‌افزار (سرور، دامنه، اشتراک)'], ['bank', 'کارمزد بانکی و مالیات'], ['expense', 'هزینهٔ عمومی'], ['other_out', 'سایر هزینه‌ها'], ['transfer', 'انتقال به حساب دیگر']] };
  var CAT_FA = { session: 'جلسهٔ مشاوره', 'package': 'پکیج جلسه', other_in: 'سایر دریافتی‌ها', counselor: 'حق‌الزحمهٔ مشاور', ads: 'تبلیغات', software: 'سرویس و نرم‌افزار', bank: 'کارمزد بانکی و مالیات', expense: 'هزینهٔ عمومی', transfer: 'انتقال بین حساب‌ها', other_out: 'سایر هزینه‌ها', other: 'سایر' };
  var DOC_FA = { receipt: 'رسید پرداخت', invoice: 'فاکتور', other: 'سند' };
  var MAX_FILE = 8 * 1024 * 1024;
  var SVGH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var UP_ICON = SVGH + '<path d="M7 18a4 4 0 0 1-.6-7.96A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9H7z"/><path d="M12 12v6M9.5 14.5 12 12l2.5 2.5"/></svg>';
  var DOC_ICON = SVGH + '<rect x="4" y="3" width="16" height="18" rx="3"/><circle cx="9.5" cy="9" r="1.5"/><path d="m5 17 5-4.5 3.5 3L16 13l3 3"/></svg>';
  var PDF_ICON = SVGH + '<path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v5h5M8.5 15h1.8a1.2 1.2 0 0 0 0-2.4H8.5V17M13.5 17v-4.4h1c1.3 0 2 .8 2 2.2s-.7 2.2-2 2.2z"/></svg>';
  var CAM_ICON = SVGH + '<path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/></svg>';
  var X_ICON = SVGH + '<path d="M6 6l12 12M18 6 6 18"/></svg>';
  var accMf = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 });
  var accMf2 = new Intl.NumberFormat('fa-IR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function money(x) { var r = Math.round(x * 100) / 100; return (r % 1 === 0 ? accMf : accMf2).format(r); }
  function faDec(s) { return String(s).replace(/\d/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'.charAt(+d); }).replace('.', '٫'); }
  function accUnit(cur) { return cur === 'IRT' ? 'تومان' : ltr(cur); }
  function accAmt(x, cur) { var f = document.createDocumentFragment(); f.appendChild(document.createTextNode(money(x) + ' ')); f.appendChild(cur === 'IRT' ? document.createTextNode('تومان') : ltr(cur)); return f; }
  function accState() {
    return S.acc = S.acc || { sub: 'summary', cal: 'j', year: 0, acct: 'fx', cur: { fx: 'USD', irr: 'IRT' }, q: '', fa: '', fd: '', limit: 100, rows: null, form: false, edit: null, f: null };
  }
  function accYM(iso, cal) {
    var p = parseIso(iso); if (!p) return { y: 0, m: 0 };
    if (cal === 'j') { var j = toJalali(p.gy, p.gm, p.gd); return { y: j.jy, m: j.jm }; }
    return { y: p.gy, m: p.gm };
  }
  function accNow(cal) { return accYM(tehranDateInput(0), cal); }
  function accDateNode(iso) {
    var p = parseIso(iso), f = document.createDocumentFragment(); if (!p) return document.createTextNode(iso || '');
    var j = toJalali(p.gy, p.gm, p.gd), g = ltr(G_MONTHS[p.gm - 1] + ' ' + p.gd + ', ' + p.gy); g.style.whiteSpace = 'nowrap';
    f.appendChild(document.createTextNode(np(j.jd) + ' ' + J_MONTHS[j.jm - 1] + ' ' + np(j.jy) + ' ')); f.appendChild(h('small', { class: 'acc-g' }, g));
    return f;
  }
  function accSum(rows) {
    // انتقال بین دو حساب نه درآمد است نه هزینه: فقط در «موجودی» می‌آید
    var s = { 'in': 0, out: 0, n: 0, nin: 0, bal: 0 };
    rows.forEach(function (r) {
      var a = +r.amount;
      s.bal += r.direction === 'in' ? a : -a; s.n++;
      if (r.category === 'transfer') return;
      if (r.direction === 'in') { s['in'] += a; s.nin++; } else s.out += a;
    });
    s.net = s['in'] - s.out; return s;
  }
  function accRows(A, acct, cur) { return (A.rows || []).filter(function (r) { return r.account === acct && (!cur || r.currency === cur); }); }
  function accCurs(A, acct) {
    if (acct === 'irr') return ['IRT'];
    var tot = {}; (A.rows || []).forEach(function (r) { if (r.account === 'fx') tot[r.currency] = (tot[r.currency] || 0) + (r.direction === 'in' ? +r.amount : 0) + 0.001; });
    var list = Object.keys(tot).sort(function (a, b) { return tot[b] - tot[a]; });
    return list.length ? list : ['USD'];
  }
  function accYears(A) {
    var set = {}, now = accNow(A.cal).y; set[now] = 1;
    (A.rows || []).forEach(function (r) { set[accYM(r.entry_date, A.cal).y] = 1; });
    return Object.keys(set).map(Number).sort(function (a, b) { return b - a; });
  }
  function yLabel(A, y) { return A.cal === 'j' ? np(y) : String(y); }
  function mLabel(A, m) { return A.cal === 'j' ? J_MONTHS[m - 1] : G_MONTHS[m - 1]; }
  function normNum(s) {
    return String(s || '').replace(/[۰-۹]/g, function (c) { return c.charCodeAt(0) - 1776; }).replace(/[٠-٩]/g, function (c) { return c.charCodeAt(0) - 1632; })
      .replace(/[,٬\s]/g, '').replace(/٫/g, '.');
  }

  function loadLedger() {
    var A = accState(); A.loading = true;
    Promise.all([sb.from('ledger').select('*').order('entry_date', { ascending: false }).limit(5000), sb.from('ledger_files').select('*').order('created_at', { ascending: true }).limit(5000)]).then(function (res) {
      var r = res[0]; A.loading = false;
      if (r.error) { A.err = r.error; A.missing = /does not exist|Could not find|relation|schema cache/i.test(r.error.message || ''); }
      else {
        A.err = null; A.missing = false; A.rows = r.data || []; if (!A.year) A.year = accNow(A.cal).y;
        A.filesOk = !res[1].error; A.files = {};
        (res[1].data || []).forEach(function (x) { (A.files[x.ledger_id] = A.files[x.ledger_id] || []).push(x); });
      }
      if (S.view === 'staff' && S.tab === 'acc') render();
    });
  }

  /* ── سند (فاکتور / رسید): آپلود در Storage خصوصی و دیدن با لینک موقت ── */
  function shrinkImage(file) {
    return new Promise(function (ok) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1.5 * 1024 * 1024) return ok(file);
      try {
        var url = URL.createObjectURL(file), img = new Image();
        img.onload = function () {
          var k = Math.min(1, 2200 / Math.max(img.width, img.height)), c = document.createElement('canvas');
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
          c.toBlob(function (bl) { try { ok(bl && bl.size < file.size ? new File([bl], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file); } catch (e) { ok(file); } }, 'image/jpeg', 0.86);
        };
        img.onerror = function () { ok(file); };
        img.src = url;
      } catch (e) { ok(file); }
    });
  }
  function uploadDocs(ledgerId, files, kind, onState) {
    var done = 0, bad = 0, idx = -1, say = function (i, s) { if (onState) onState(i, s); };
    return files.reduce(function (p, f0) {
      return p.then(function () {
        idx++; var my = idx; say(my, 'up');
        return shrinkImage(f0).then(function (f) {
          var ext = (/\.(jpe?g|png|webp|pdf)$/i.exec(f.name) || [0, f.type === 'application/pdf' ? 'pdf' : 'jpg'])[1].toLowerCase();
          var path = ledgerId + '/' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + '.' + ext;
          return sb.storage.from('ledger-files').upload(path, f, { contentType: f.type || 'application/octet-stream', upsert: false }).then(function (u) {
            if (u.error) { bad++; say(my, 'bad'); return; }
            return sb.from('ledger_files').insert({ ledger_id: ledgerId, kind: kind, path: path, name: f0.name.slice(0, 120), mime: f.type || 'application/octet-stream', size: f.size, created_by: S.user.id }).then(function (r) { if (r.error) { bad++; say(my, 'bad'); } else { done++; say(my, 'ok'); } });
          });
        });
      });
    }, Promise.resolve()).then(function () { return { done: done, bad: bad }; });
  }
  function openDoc(x) {
    var w = null; try { w = window.open('', '_blank'); } catch (e) { w = null; }
    sb.storage.from('ledger-files').createSignedUrl(x.path, 300).then(function (r) {
      if (r.error || !r.data) { if (w) w.close(); flash('err', 'باز کردن فایل انجام نشد.'); return render(); }
      if (w) w.location.href = r.data.signedUrl; else window.location.href = r.data.signedUrl;
    });
  }
  function delDoc(A, x) {
    if (!window.confirm('این سند حذف شود؟\n' + x.name)) return;
    sb.storage.from('ledger-files').remove([x.path]).then(function () {
      sb.from('ledger_files').delete().eq('id', x.id).then(function (d) { flash(d.error ? 'err' : 'ok', d.error ? explain(d.error) : 'سند حذف شد.'); loadLedger(); render(); });
    });
  }
  function docCards(A, r) {
    var fl = (A.files && A.files[r.id]) || [];
    if (!fl.length) return null;
    return h('div', { class: 'fcards fcards--old' }, h('div', { class: 'fcards__t', text: 'سندهای ثبت‌شده' }), fl.map(function (x) {
      var pdf = x.mime === 'application/pdf';
      return h('div', { class: 'fcard' }, h('div', { class: 'fcard__th' + (pdf ? ' is-pdf' : '') }, svgEl(pdf ? PDF_ICON : DOC_ICON)),
        h('div', { class: 'fcard__m' }, h('b', { text: DOC_FA[x.kind] || 'سند' }), h('span', { text: (pdf ? 'PDF' : 'عکس') + ' · ' + x.name })),
        h('button', { class: 'btn btn--small', type: 'button', text: 'مشاهده', onclick: function () { openDoc(x); } }),
        h('button', { class: 'fcard__x', type: 'button', 'aria-label': 'حذف سند', onclick: function () { delDoc(A, x); } }, svgEl(X_ICON)));
    }));
  }
  function docChips(A, r, removable) {
    var fl = (A.files && A.files[r.id]) || [];
    if (!fl.length) return null;
    return h('div', { class: 'docs' }, fl.map(function (x) {
      var mine = S.user && x.created_by === S.user.id;
      return h('span', { class: 'doc' }, h('button', { class: 'doc__b', type: 'button', title: x.name, onclick: function () { openDoc(x); } }, '📎 ' + (DOC_FA[x.kind] || 'سند') + ' · ' + (x.mime === 'application/pdf' ? 'PDF' : 'تصویر')),
        removable ? h('button', { class: 'doc__x', type: 'button', 'aria-label': 'حذف سند', text: '×', onclick: function () { delDoc(A, x); } }) : null);
    }));
  }

  function accSeg(items, cur, pick, label) {
    return h('div', { class: 'seg acc-seg', role: 'tablist', 'aria-label': label }, items.map(function (k) {
      return h('button', { class: 'seg__b', type: 'button', role: 'tab', 'aria-selected': cur === k[0] ? 'true' : 'false', onclick: function () { pick(k[0]); } }, k[1]);
    }));
  }

  function accOpen(A, row, dir) {
    A.form = true; A.edit = row; A.f = null; A.pend = []; A.preset = dir || 'in'; render();
    setTimeout(function () { var el = document.getElementById('accForm'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 30);
  }

  function tAccounting() {
    var A = accState();
    if (A.rows === null && !A.err) { if (!A.loading) loadLedger(); return h('p', { class: 'empty', text: 'در حال بارگذاری…' }); }
    if (A.missing) return h('section', { class: 'card' }, h('h2', { text: 'حسابداری' }), h('p', { class: 'warnbox', text: 'بخش حسابداری هنوز در پایگاه‌داده نصب نشده است. فایل migration-16-accounting.sql را یک‌بار در Supabase اجرا کنید.' }));
    if (A.err) return h('p', { class: 'flash flash--err', text: explain(A.err) });
    if (!A.year) A.year = accNow(A.cal).y;
    var years = accYears(A);
    if (years.indexOf(A.year) < 0) A.year = years[0];
    var subs = [['summary', 'خلاصه'], ['monthly', 'درآمد ماهانه'], ['yearly', 'درآمد سالانه'], ['expenses', 'هزینه‌ها'], ['ledger', 'دفتر تراکنش‌ها']];
    var yearSel = h('select', { class: 'select acc-year', 'aria-label': 'سال', onchange: function (e) { A.year = +e.target.value; render(); } },
      years.map(function (y) { return h('option', { value: y, text: yLabel(A, y), selected: y === A.year }); }));
    var bar = h('div', { class: 'acc-top' },
      h('div', { class: 'subtabs', role: 'tablist' }, subs.map(function (t) {
        return h('button', { class: 'subtab', type: 'button', role: 'tab', 'aria-selected': A.sub === t[0] ? 'true' : 'false', onclick: function () { A.sub = t[0]; render(); } }, t[1]);
      })),
      h('div', { class: 'acc-ctl' },
        accSeg([['j', 'شمسی'], ['g', 'میلادی']], A.cal, function (c) { A.cal = c; A.year = accNow(c).y; render(); }, 'نوع تقویم'),
        yearSel,
        
        h('button', { class: 'btn btn--small', type: 'button', text: 'خروجی CSV', onclick: accCsv }),
        h('button', { class: 'btn btn--small', type: 'button', text: 'تازه‌سازی', onclick: function () { loadLedger(); } })));
    var body = A.sub === 'monthly' ? accMonthly(A) : A.sub === 'yearly' ? accYearly(A) : A.sub === 'expenses' ? accExpenses(A) : A.sub === 'ledger' ? accLedger(A) : accSummary(A);
    var cta = h('div', { class: 'acc-cta' },
      h('button', { class: 'btn btn--primary', type: 'button', text: '+ ثبت واریز (پول آمد)', onclick: function () { accOpen(A, null, 'in'); } }),
      h('button', { class: 'btn acc-cta__out', type: 'button', text: '+ ثبت هزینه (پول رفت)', onclick: function () { accOpen(A, null, 'out'); } }));
    return h('div', null, cta, bar, A.form ? accForm(A) : null, body);
  }

  /* ── خلاصه: دو حساب جدا ── */
  function accTile(label, val, cur, cls) {
    return h('div', { class: 'anum__t' + (cls ? ' ' + cls : '') }, h('span', { text: label }), h('b', null, accAmt(val, cur)));
  }
  function accPanel(A, acct) {
    var now = accNow(A.cal), curs = accCurs(A, acct);
    var blocks = curs.map(function (cur) {
      var rows = accRows(A, acct, cur), all = accSum(rows);
      var yr = accSum(rows.filter(function (r) { return accYM(r.entry_date, A.cal).y === A.year; }));
      var mo = accSum(rows.filter(function (r) { var k = accYM(r.entry_date, A.cal); return k.y === now.y && k.m === now.m; }));
      var ins = rows.filter(function (r) { return r.direction === 'in' && r.category !== 'transfer'; }).map(function (r) { return r.entry_date; }).sort();
      var first = ins[0], last = ins[ins.length - 1];
      return h('div', { class: 'acur' },
        acct === 'fx' ? h('div', { class: 'acur__h' }, h('b', null, ltr(cur)), h('span', { text: (FX_CUR.filter(function (c) { return c[0] === cur; })[0] || [0, ''])[1] })) : null,
        h('div', { class: 'anum' },
          accTile('کل واریزی تا امروز', all['in'], cur, 'big'),
          accTile('واریزی سال ' + yLabel(A, A.year), yr['in'], cur),
          accTile('واریزی این ماه (' + mLabel(A, now.m) + ')', mo['in'], cur),
          accTile('کل هزینه‌ها و برداشت‌ها', all.out, cur),
          accTile('موجودی حساب', all.bal, cur, all.bal < 0 ? 'neg' : '')),
        h('p', { class: 'hint' }, all.nin ? ['اولین واریز: ', accDateNode(first), ' · آخرین واریز: ', accDateNode(last), ' · ', n(all.nin) + ' بار واریز'] : 'هنوز واریزی ثبت نشده.'));
    });
    return h('section', { class: 'acct acct--' + acct },
      h('div', { class: 'acct__head' }, h('div', null, h('h2', { text: ACC_FA[acct] }), h('span', { text: ACC_WHERE[acct] })), h('span', { class: 'acct__n', text: n(accRows(A, acct).length) + ' تراکنش' })),
      h('div', { class: 'acct__body' }, blocks));
  }
  function accSummary(A) {
    var recent = (A.rows || []).slice(0, 6);
    return h('div', null,
      h('div', { class: 'acc-grid' }, accPanel(A, 'fx'), accPanel(A, 'irr')),
      h('section', { class: 'card' }, h('h2', { text: 'آخرین تراکنش‌ها' }),
        recent.length ? h('div', { class: 'lrows' }, recent.map(function (r) { return accRow(A, r, true); })) : h('p', { class: 'empty', text: 'هنوز تراکنشی ثبت نشده. با «+ ثبت تراکنش» شروع کنید.' })));
  }

  /* ── ماهانه ── */
  function accPick(A) {
    var curs = accCurs(A, A.acct);
    if (curs.indexOf(A.cur[A.acct]) < 0) A.cur[A.acct] = curs[0];
    var cs = A.acct === 'fx' ? h('select', { class: 'select acc-year', 'aria-label': 'ارز', onchange: function (e) { A.cur.fx = e.target.value; render(); } },
      curs.map(function (c) { return h('option', { value: c, text: c, selected: c === A.cur.fx }); })) : null;
    return h('div', { class: 'acc-ctl' }, accSeg([['fx', 'حساب ارزی'], ['irr', 'حساب تومانی']], A.acct, function (a) { A.acct = a; render(); }, 'حساب'), cs);
  }
  function accMonthly(A) {
    var cur = (accPick(A), A.cur[A.acct]), rows = accRows(A, A.acct, cur), months = [];
    var inYear = rows.filter(function (r) { return accYM(r.entry_date, A.cal).y === A.year; });
    var max = 0, i, tot = accSum(inYear);
    for (i = 1; i <= 12; i++) {
      var s = accSum(inYear.filter(function (r) { return accYM(r.entry_date, A.cal).m === i; })); s.m = i; months.push(s); if (s['in'] > max) max = s['in'];
    }
    var trs = months.map(function (s) {
      return h('tr', { class: s.n ? '' : 'is-zero' }, h('td', { text: mLabel(A, s.m) }), h('td', { class: 'acc-in' }, s.n ? accAmt(s['in'], cur) : '—'),
        h('td', null, h('span', { class: 'abar' }, h('i', { style: 'width:' + (max ? Math.round(s['in'] / max * 100) : 0) + '%' }))),
        h('td', null, s.out ? accAmt(s.out, cur) : '—'), h('td', { class: s.net < 0 ? 'acc-neg' : '' }, s.n ? accAmt(s.net, cur) : '—'), h('td', { text: s.n ? n(s.n) : '—' }));
    });
    var active = months.filter(function (s) { return s.nin; }).length;
    return h('section', { class: 'card' }, h('h2', { text: 'درآمد ماهانه، سال ' + yLabel(A, A.year) }), accPick(A),
      h('div', { class: 'tblwrap' }, h('table', { class: 'atbl' },
        h('thead', null, h('tr', null, ['ماه', 'واریز', '', 'برداشت', 'خالص', 'تعداد'].map(function (t) { return h('th', { text: t }); }))),
        h('tbody', null, trs),
        h('tfoot', null, h('tr', null, h('td', { text: 'جمع سال' }), h('td', { class: 'acc-in' }, accAmt(tot['in'], cur)), h('td'), h('td', null, accAmt(tot.out, cur)), h('td', { class: tot.net < 0 ? 'acc-neg' : '' }, accAmt(tot.net, cur)), h('td', { text: n(tot.n) }))))),
      h('p', { class: 'hint' }, active ? 'میانگین واریز در ماه‌هایی که واریز داشته: ' : 'در این سال واریزی ثبت نشده.', active ? accAmt(tot['in'] / active, cur) : null));
  }

  /* ── سالانه ── */
  function accYearly(A) {
    var secs = [];
    ['fx', 'irr'].forEach(function (acct) {
      accCurs(A, acct).forEach(function (cur) {
        var rows = accRows(A, acct, cur), by = {};
        rows.forEach(function (r) { var y = accYM(r.entry_date, A.cal).y; (by[y] = by[y] || []).push(r); });
        var ys = Object.keys(by).map(Number).sort(function (a, b) { return b - a; });
        var all = accSum(rows);
        var trs = ys.map(function (y) {
          var s = accSum(by[y]), mset = {}; by[y].forEach(function (r) { if (r.direction === 'in') mset[accYM(r.entry_date, A.cal).m] = 1; });
          var mc = Object.keys(mset).length;
          return h('tr', null, h('td', { text: yLabel(A, y) }), h('td', { class: 'acc-in' }, accAmt(s['in'], cur)), h('td', null, accAmt(s.out, cur)), h('td', { class: s.net < 0 ? 'acc-neg' : '' }, accAmt(s.net, cur)), h('td', { text: n(s.nin) }), h('td', null, mc ? accAmt(s['in'] / mc, cur) : '—'));
        });
        secs.push(h('section', { class: 'card' }, h('h2', null, ACC_FA[acct] + (acct === 'fx' ? ' · ' : ''), acct === 'fx' ? ltr(cur) : null),
          ys.length ? h('div', { class: 'tblwrap' }, h('table', { class: 'atbl' },
            h('thead', null, h('tr', null, ['سال', 'واریز', 'برداشت', 'خالص', 'تعداد واریز', 'میانگین ماهانه'].map(function (t) { return h('th', { text: t }); }))),
            h('tbody', null, trs),
            h('tfoot', null, h('tr', null, h('td', { text: 'مجموع' }), h('td', { class: 'acc-in' }, accAmt(all['in'], cur)), h('td', null, accAmt(all.out, cur)), h('td', { class: all.net < 0 ? 'acc-neg' : '' }, accAmt(all.net, cur)), h('td', { text: n(all.nin) }), h('td'))))) : h('p', { class: 'empty', text: 'هنوز تراکنشی ثبت نشده.' })));
      });
    });
    return h('div', null, secs, h('p', { class: 'hint', text: 'سال‌ها بر اساس تقویم انتخاب‌شده (' + (A.cal === 'j' ? 'شمسی' : 'میلادی') + ') گروه‌بندی شده‌اند. «میانگین ماهانه» یعنی جمع واریز تقسیم بر تعداد ماه‌هایی که واریز داشته‌اند.' }));
  }

  /* ── هزینه‌ها ── */
  function accExpenses(A) {
    var cur = (accPick(A), A.cur[A.acct]), now = accNow(A.cal);
    var rows = accRows(A, A.acct, cur).filter(function (r) { return r.direction === 'out' && r.category !== 'transfer'; });
    var inc = accSum(accRows(A, A.acct, cur).filter(function (r) { return accYM(r.entry_date, A.cal).y === A.year; }));
    var yr = rows.filter(function (r) { return accYM(r.entry_date, A.cal).y === A.year; });
    var all = accSum(rows), ys = accSum(yr), mo = accSum(rows.filter(function (r) { var k = accYM(r.entry_date, A.cal); return k.y === now.y && k.m === now.m; }));
    var tiles = h('div', { class: 'anum' }, accTile('کل هزینه‌ها تا امروز', all.out, cur, 'big'),
      accTile('هزینهٔ سال ' + yLabel(A, A.year), ys.out, cur), accTile('هزینهٔ این ماه (' + mLabel(A, now.m) + ')', mo.out, cur),
      accTile('درآمد سال ' + yLabel(A, A.year), inc['in'], cur), accTile('درآمد منهای هزینه', inc['in'] - ys.out, cur, inc['in'] - ys.out < 0 ? 'neg' : ''));
    var by = {}; yr.forEach(function (r) { by[r.category] = (by[r.category] || 0) + (+r.amount); });
    var cats = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; }), top = cats.length ? by[cats[0]] : 0;
    var catRows = cats.map(function (c) {
      return h('tr', null, h('td', { text: CAT_FA[c] || c }), h('td', null, accAmt(by[c], cur)), h('td', null, h('span', { class: 'abar abar--out' }, h('i', { style: 'width:' + Math.round(by[c] / top * 100) + '%' }))), h('td', { text: ys.out ? np(Math.round(by[c] / ys.out * 100)) + '٪' : '' }));
    });
    var months = [], mx = 0, i;
    for (i = 1; i <= 12; i++) {
      var inM = yr.filter(function (r) { return accYM(r.entry_date, A.cal).m === i; }), s = accSum(inM); s.m = i;
      s.docs = inM.filter(function (r) { return ((A.files || {})[r.id] || []).length; }).length; months.push(s); if (s.out > mx) mx = s.out;
    }
    var mRows = months.map(function (s) {
      return h('tr', { class: s.n ? '' : 'is-zero' }, h('td', { text: mLabel(A, s.m) }), h('td', null, s.n ? accAmt(s.out, cur) : '—'), h('td', null, h('span', { class: 'abar abar--out' }, h('i', { style: 'width:' + (mx ? Math.round(s.out / mx * 100) : 0) + '%' }))), h('td', { text: s.n ? n(s.n) : '—' }), h('td', { text: s.n ? n(s.docs) + ' از ' + n(s.n) : '—' }));
    });
    var list = yr.slice().sort(function (a, b) { return a.entry_date < b.entry_date ? 1 : -1; });
    var noDoc = list.filter(function (r) { return !((A.files || {})[r.id] || []).length; }).length;
    return h('div', null,
      h('section', { class: 'card' }, h('h2', { text: 'هزینه‌ها' }), accPick(A), tiles,
        h('p', { class: 'hint', text: 'انتقال بین دو حساب هزینه حساب نمی‌شود. برای هر هزینه می‌توانید فاکتور یا رسید پرداخت را پیوست کنید.' })),
      h('section', { class: 'card' }, h('h2', { text: 'هزینه به تفکیک دسته، سال ' + yLabel(A, A.year) }),
        cats.length ? h('div', { class: 'tblwrap' }, h('table', { class: 'atbl' }, h('thead', null, h('tr', null, ['دسته', 'مبلغ', '', 'سهم'].map(function (t) { return h('th', { text: t }); }))), h('tbody', null, catRows))) : h('p', { class: 'empty', text: 'در این سال هزینه‌ای ثبت نشده.' })),
      h('section', { class: 'card' }, h('h2', { text: 'هزینهٔ ماهانه، سال ' + yLabel(A, A.year) }),
        h('div', { class: 'tblwrap' }, h('table', { class: 'atbl' }, h('thead', null, h('tr', null, ['ماه', 'هزینه', '', 'تعداد', 'دارای سند'].map(function (t) { return h('th', { text: t }); }))), h('tbody', null, mRows),
          h('tfoot', null, h('tr', null, h('td', { text: 'جمع سال' }), h('td', null, accAmt(ys.out, cur)), h('td'), h('td', { text: n(ys.n) }), h('td')))))),
      h('section', { class: 'card' }, h('h2', { text: 'فهرست هزینه‌ها و سندها' }),
        list.length ? h('p', { class: noDoc ? 'warnbox' : 'hint', text: noDoc ? n(noDoc) + ' هزینه هنوز فاکتور یا رسید ندارد.' : 'همهٔ هزینه‌های این سال سند دارند ✓' }) : null,
        list.length ? h('div', { class: 'lrows' }, list.map(function (r) { return accRow(A, r, false); })) : h('p', { class: 'empty', text: 'هزینه‌ای در این سال ثبت نشده. با «+ ثبت هزینه» شروع کنید.' })));
  }

  /* ── دفتر تراکنش‌ها ── */
  function accRow(A, r, compact) {
    var who = r.counselor_id ? nameOf(r.counselor_id) : '';
    var acts = compact ? null : h('div', { class: 'lrow__act' },
      h('button', { class: 'btn btn--small', type: 'button', text: 'ویرایش', onclick: function () { accOpen(A, r); } }),
      h('button', { class: 'btn btn--small btn--danger', type: 'button', text: 'حذف', onclick: function () {
        if (!window.confirm('این تراکنش برای همیشه حذف شود؟\n' + (r.direction === 'in' ? 'واریز ' : 'برداشت ') + money(+r.amount) + ' ' + (r.currency === 'IRT' ? 'تومان' : r.currency))) return;
        sb.from('ledger').delete().eq('id', r.id).then(function (d) { flash(d.error ? 'err' : 'ok', d.error ? explain(d.error) : 'حذف شد.'); loadLedger(); render(); });
      } }));
    return h('div', { class: 'lrow lrow--' + r.direction },
      h('div', { class: 'lrow__d' }, accDateNode(r.entry_date)),
      h('div', { class: 'lrow__m' },
        h('div', { class: 'chips' }, h('span', { class: 'chip ' + (r.direction === 'in' ? 'chip--ok' : 'chip--warn'), text: r.direction === 'in' ? 'واریز' : 'برداشت' }),
          h('span', { class: 'chip ' + (r.account === 'fx' ? 'chip--fx' : 'chip--gold'), text: ACC_FA[r.account] }),
          h('span', { class: 'chip', text: CAT_FA[r.category] || r.category })),
        h('div', { class: 'lrow__n' }, [who, r.ref ? 'پیگیری: ' + r.ref : '', r.note].filter(Boolean).join(' · ') || ''),
        docChips(A, r, false)),
      h('div', { class: 'lrow__a ' + (r.direction === 'in' ? 'acc-in' : 'acc-out'), dir: 'ltr' }, (r.direction === 'in' ? '+' : '−') + ' ', accAmt(+r.amount, r.currency)),
      acts);
  }
  function accLedger(A) {
    var q = (A.q || '').trim().toLowerCase();
    var list = (A.rows || []).filter(function (r) {
      if (A.fa && r.account !== A.fa) return false;
      if (A.fd && r.direction !== A.fd) return false;
      if (q) { var hay = [r.note, r.ref, r.counselor_id ? nameOf(r.counselor_id) : '', CAT_FA[r.category] || '', r.currency, String(r.amount)].join(' ').toLowerCase(); if (hay.indexOf(q) < 0) return false; }
      return true;
    });
    var qi = h('input', { class: 'input', type: 'search', value: A.q || '', placeholder: 'جست‌وجو در توضیح، شمارهٔ پیگیری، مشاور…', 'aria-label': 'جست‌وجو' });
    qi.addEventListener('change', function () { A.q = qi.value; A.limit = 100; render(); });
    var shown = list.slice(0, A.limit), t = accSum(list);
    return h('section', { class: 'card' }, h('h2', { text: 'دفتر تراکنش‌ها' }),
      h('div', { class: 'acc-ctl acc-ctl--wrap' }, accSeg([['', 'همه حساب‌ها'], ['fx', 'ارزی'], ['irr', 'تومانی']], A.fa, function (v) { A.fa = v; A.limit = 100; render(); }, 'حساب'),
        accSeg([['', 'همه'], ['in', 'واریز'], ['out', 'برداشت']], A.fd, function (v) { A.fd = v; A.limit = 100; render(); }, 'نوع'), qi),
      h('p', { class: 'hint', text: n(list.length) + ' تراکنش' + (A.fa || A.fd || q ? ' (فیلترشده)' : '') + (A.fa && list.length ? '' : '') }),
      shown.length ? h('div', { class: 'lrows' }, shown.map(function (r) { return accRow(A, r, false); })) : h('p', { class: 'empty', text: 'تراکنشی پیدا نشد.' }),
      list.length > shown.length ? h('div', { class: 'actions' }, h('button', { class: 'btn btn--small', type: 'button', text: 'نمایش بیشتر', onclick: function () { A.limit += 100; render(); } })) : null);
  }

  /* ── فرم ثبت / ویرایش ── */
  function accForm(A) {
    var e = A.edit;
    if (!A.f) A.f = e ? { date: e.entry_date, account: e.account, currency: e.currency, direction: e.direction, amount: String(+e.amount), category: e.category, counselor: e.counselor_id || '', ref: e.ref || '', note: e.note || '' }
      : { date: tehranDateInput(0), account: A.acct || 'fx', currency: 'USD', direction: A.preset || 'in', amount: '', category: A.preset === 'out' ? 'expense' : 'session', counselor: '', ref: '', note: '', dkind: A.preset === 'out' ? 'invoice' : 'receipt' };
    var f = A.f, msg = h('p', { class: 'hint', role: 'status' }); A.pend = A.pend || [];
    var df = dateField(f.date, function () { f.date = df.value(); });
    var curSel = h('select', { class: 'select', 'aria-label': 'ارز' });
    var catSel = h('select', { class: 'select', 'aria-label': 'دسته' });
    function fillCur() {
      curSel.textContent = '';
      if (f.account === 'irr') { f.currency = 'IRT'; curSel.appendChild(h('option', { value: 'IRT', text: 'تومان' })); curSel.disabled = true; }
      else {
        curSel.disabled = false; if (f.currency === 'IRT') f.currency = 'USD';
        FX_CUR.forEach(function (c) { curSel.appendChild(h('option', { value: c[0], text: c[0] + ' · ' + c[1], selected: c[0] === f.currency })); });
      }
    }
    function fillCat() {
      catSel.textContent = '';
      if (!ACC_CATS[f.direction].some(function (c) { return c[0] === f.category; })) f.category = ACC_CATS[f.direction][0][0];
      ACC_CATS[f.direction].forEach(function (c) { catSel.appendChild(h('option', { value: c[0], text: c[1], selected: c[0] === f.category })); });
    }
    var accSel = h('select', { class: 'select', 'aria-label': 'حساب', onchange: function (ev) { f.account = ev.target.value; fillCur(); amtUi(); } },
      h('option', { value: 'fx', text: 'حساب ارزی (خارج از ایران)', selected: f.account === 'fx' }), h('option', { value: 'irr', text: 'حساب تومانی (ایران)', selected: f.account === 'irr' }));
    var dirSel = h('select', { class: 'select', 'aria-label': 'نوع', onchange: function (ev) { f.direction = ev.target.value; fillCat(); amtUi(); } },
      h('option', { value: 'in', text: 'واریز (پول آمد)', selected: f.direction === 'in' }), h('option', { value: 'out', text: 'برداشت (پول رفت)', selected: f.direction === 'out' }));
    curSel.addEventListener('change', function (ev) { f.currency = ev.target.value; if (typeof amtUi === 'function') amtUi(); });
    catSel.addEventListener('change', function (ev) { f.category = ev.target.value; });
    fillCur(); fillCat();
    var amt = h('input', { class: 'input', dir: 'ltr', inputmode: 'decimal', value: f.amount, placeholder: 'مثلاً 26.90', required: true, 'aria-label': 'مبلغ' });
    amt.addEventListener('input', function () { f.amount = amt.value; var v = parseFloat(normNum(amt.value)); msg.textContent = isFinite(v) && v > 0 ? 'مبلغ: ' + money(v) + ' ' + (f.currency === 'IRT' ? 'تومان' : f.currency) : ''; });
    var amtLbl = h('label', { text: 'مبلغ' }), presetBox = h('div', { class: 'presets', role: 'group', 'aria-label': 'مبلغ‌های آماده' });
    var PRESETS = [['26.90', 'تک‌جلسه', 'session'], ['71.70', 'پکیج ۳ جلسه', 'package'], ['109.50', 'پکیج ۵ جلسه', 'package'], ['15.90', 'دانشجو', 'session'], ['35.70', 'دانشجو ۳ جلسه', 'package']];
    function amtUi() {
      var irr = f.account === 'irr';
      amtLbl.textContent = irr ? 'مبلغ (به تومان)' : 'مبلغ (' + f.currency + ')';
      amt.placeholder = irr ? 'مثلاً 4,500,000 (تومان، نه ریال)' : 'مثلاً 26.90';
      presetBox.textContent = ''; presetBox.hidden = irr || f.direction !== 'in';
      if (presetBox.hidden) return;
      presetBox.appendChild(h('span', { class: 'presets__t', text: 'مبلغ آماده:' }));
      PRESETS.forEach(function (p) {
        presetBox.appendChild(h('button', { class: 'preset', type: 'button', onclick: function () {
          amt.value = p[0]; f.amount = p[0]; f.category = p[2]; fillCat();
          var v = parseFloat(p[0]); msg.textContent = 'مبلغ: ' + money(v) + ' ' + f.currency; amt.focus();
        } }, h('b', { text: faDec(p[0]) }), h('small', { text: p[1] })));
      });
    }
    amtUi();
    var who = h('select', { class: 'select', 'aria-label': 'مشاور', onchange: function (ev) { f.counselor = ev.target.value; } }, h('option', { value: '', text: 'بدون مشاور' }),
      (S.data.profiles || []).filter(isProvider).map(function (p) { return h('option', { value: p.id, text: p.full_name || 'بدون نام', selected: f.counselor === p.id }); }));
    var ref = h('input', { class: 'input', dir: 'ltr', maxlength: 80, value: f.ref, placeholder: 'شمارهٔ پیگیری / تراکنش (اختیاری)', 'aria-label': 'شمارهٔ پیگیری' });
    ref.addEventListener('input', function () { f.ref = ref.value; });
    var note = h('input', { class: 'input', maxlength: 300, value: f.note, placeholder: 'توضیح کوتاه (نام مراجع و مطلب بالینی ننویسید)', 'aria-label': 'توضیح' });
    note.addEventListener('input', function () { f.note = note.value; });
    var submit = h('button', { class: 'btn btn--primary', type: 'submit', text: e ? 'ذخیرهٔ تغییرات' : 'ثبت' });
    var plist = h('div', { class: 'fcards' });
    var pick = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,application/pdf', multiple: true, class: 'drop__in', 'aria-label': 'انتخاب فایل', tabindex: '-1' });
    var cam = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'drop__in', 'aria-label': 'گرفتن عکس', tabindex: '-1' });
    var drop = h('div', { class: 'drop' });
    function sizeFa(b) { return b >= 1048576 ? np(Math.round(b / 104857.6) / 10) + ' مگابایت' : np(Math.max(1, Math.round(b / 1024))) + ' کیلوبایت'; }
    function drawPend() {
      plist.textContent = '';
      A.pend.forEach(function (x, i) {
        var st = (A.pendState || {})[i], isImg = /^image\//.test(x.type);
        var th = h('div', { class: 'fcard__th' });
        if (isImg) { try { th.appendChild(h('img', { src: x.__url || (x.__url = URL.createObjectURL(x)), alt: '' })); } catch (e1) { th.appendChild(svgEl(DOC_ICON)); } } else { th.classList.add('is-pdf'); th.appendChild(svgEl(PDF_ICON)); }
        plist.appendChild(h('div', { class: 'fcard' + (st ? ' is-' + st : '') }, th,
          h('div', { class: 'fcard__m' }, h('b', { text: x.name }), h('span', { text: (isImg ? 'عکس' : 'PDF') + ' · ' + sizeFa(x.size) + (st === 'up' ? ' · در حال آپلود…' : st === 'ok' ? ' · آپلود شد ✓' : st === 'bad' ? ' · آپلود نشد' : '') })),
          st ? null : h('button', { class: 'fcard__x', type: 'button', 'aria-label': 'برداشتن فایل', onclick: function () { A.pend.splice(i, 1); drawPend(); } }, svgEl(X_ICON))));
      });
      drop.classList.toggle('has-files', A.pend.length > 0);
      count.textContent = A.pend.length ? np(A.pend.length) + ' فایل آمادهٔ آپلود' : '';
    }
    var count = h('div', { class: 'drop__count', role: 'status' });
    function addFiles(list) {
      var bad = '';
      Array.prototype.slice.call(list || []).forEach(function (x) {
        if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(x.type)) { bad = 'فقط عکس (JPG، PNG، WebP) یا PDF قابل قبول است.'; return; }
        if (x.size > MAX_FILE) { bad = 'هر فایل حداکثر ۸ مگابایت است.'; return; }
        A.pend.push(x);
      });
      drawPend(); msg.textContent = bad;
    }
    pick.addEventListener('change', function () { addFiles(pick.files); pick.value = ''; });
    cam.addEventListener('change', function () { addFiles(cam.files); cam.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (x) { x.preventDefault(); drop.classList.add('is-over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (x) { x.preventDefault(); drop.classList.remove('is-over'); }); });
    drop.addEventListener('drop', function (x) { addFiles(x.dataTransfer && x.dataTransfer.files); });
    var kinds = [['receipt', 'رسید پرداخت'], ['invoice', 'فاکتور'], ['other', 'سند دیگر']], pills = h('div', { class: 'kpills', role: 'radiogroup', 'aria-label': 'نوع سند' });
    function drawKinds() {
      pills.textContent = '';
      kinds.forEach(function (k) {
        pills.appendChild(h('button', { class: 'kpill', type: 'button', role: 'radio', 'aria-checked': (f.dkind || 'receipt') === k[0] ? 'true' : 'false', onclick: function () { f.dkind = k[0]; drawKinds(); } }, k[1]));
      });
    }
    drawKinds();
    var touch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    drop.appendChild(h('div', { class: 'drop__top' }, h('span', { class: 'drop__ic' }, svgEl(UP_ICON)),
      h('div', { class: 'drop__t' }, h('b', { text: 'فاکتور یا رسید پرداخت را اینجا بیندازید' }), h('span', { text: 'یا از دکمه‌های زیر انتخاب کنید' }))));
    drop.appendChild(h('div', { class: 'drop__lbl' }, 'این فایل چیست؟'));
    drop.appendChild(pills);
    drop.appendChild(h('div', { class: 'drop__btns' },
      h('button', { class: 'btn btn--small drop__btn', type: 'button', onclick: function () { pick.click(); } }, svgEl(DOC_ICON), 'انتخاب فایل (عکس یا PDF)'),
      touch ? h('button', { class: 'btn btn--small drop__btn', type: 'button', onclick: function () { cam.click(); } }, svgEl(CAM_ICON), 'گرفتن عکس') : null));
    drop.appendChild(h('small', { class: 'drop__h', text: 'JPG، PNG، WebP یا PDF · هر فایل تا ۸ مگابایت · عکس‌های بزرگ خودکار کوچک می‌شوند' }));
    drop.appendChild(pick); drop.appendChild(cam); drop.appendChild(count); drop.appendChild(plist);
    drawPend();
    var docs = h('div', { class: 'field docs-field' }, h('label', { text: 'فاکتور و رسید پرداخت (اختیاری)' }),
      A.filesOk === false ? h('p', { class: 'warnbox', text: 'بخش سندها هنوز نصب نیست (migration-16 را کامل اجرا کنید).' }) : null,
      e ? docCards(A, e) : null, A.filesOk === false ? null : drop);
    return h('form', { class: 'card', id: 'accForm', onsubmit: function (ev) {
      ev.preventDefault();
      var v = parseFloat(normNum(f.amount)), d = df.value() || f.date;
      if (!isFinite(v) || v <= 0) { flash('err', 'مبلغ را درست بنویسید (عدد بزرگ‌تر از صفر).'); return render(); }
      if (!parseIso(d)) { flash('err', 'تاریخ را انتخاب کنید.'); return render(); }
      var row = { entry_date: d, account: f.account, currency: f.account === 'irr' ? 'IRT' : f.currency, direction: f.direction, amount: Math.round(v * 100) / 100, category: f.category, counselor_id: f.counselor || null, ref: (f.ref || '').trim(), note: (f.note || '').trim() };
      submit.disabled = true;
      var q = e ? sb.from('ledger').update(row).eq('id', e.id) : sb.from('ledger').insert(Object.assign({ created_by: S.user.id }, row));
      (e ? q : q.select().single()).then(function (r) {
        if (r.error) { submit.disabled = false; flash('err', explain(r.error)); return render(); }
        var id = e ? e.id : (r.data && r.data.id), pend = A.pend.slice();
        var fin = function (up) {
          flash(up && up.bad ? 'err' : 'ok', (e ? 'تغییرات ذخیره شد ✓' : 'ثبت شد ✓') + (up && up.done ? ' · ' + n(up.done) + ' سند پیوست شد' : '') + (up && up.bad ? ' · ' + n(up.bad) + ' سند آپلود نشد' : ''));
          A.form = false; A.edit = null; A.f = null; A.pend = []; loadLedger(); render();
        };
        if (id && pend.length && A.filesOk !== false) { submit.textContent = 'در حال آپلود سند…'; A.pendState = {}; drawPend(); uploadDocs(id, pend, f.dkind || 'receipt', function (i, s) { A.pendState[i] = s; drawPend(); }).then(function (up) { A.pendState = null; fin(up); }); } else fin(null);
      });
    } },
      h('h2', { text: e ? 'ویرایش تراکنش' : (A.preset === 'out' ? 'ثبت هزینهٔ جدید' : 'ثبت واریز جدید') }),
      h('div', { class: 'row' }, h('div', { class: 'field' }, h('label', { text: 'نوع' }), dirSel), h('div', { class: 'field' }, h('label', { text: 'تاریخ' }), df.el)),
      h('div', { class: 'row' }, h('div', { class: 'field' }, h('label', { text: 'حساب' }), accSel), h('div', { class: 'field' }, h('label', { text: 'ارز' }), curSel)),
      h('div', { class: 'row' }, h('div', { class: 'field' }, amtLbl, amt), h('div', { class: 'field' }, h('label', { text: 'دسته' }), catSel)),
      presetBox, msg,
      h('div', { class: 'row' }, h('div', { class: 'field' }, h('label', { text: 'مشاور (اختیاری)' }), who), h('div', { class: 'field' }, h('label', { text: 'شمارهٔ پیگیری (اختیاری)' }), ref)),
      h('div', { class: 'field' }, h('label', { text: 'توضیح (اختیاری)' }), note), docs,
      h('div', { class: 'actions' }, submit, h('button', { class: 'btn', type: 'button', text: 'انصراف', onclick: function () { A.form = false; A.edit = null; A.f = null; A.pend = []; render(); } })));
  }

  function accCsv() {
    var A = accState(), out = [['تاریخ میلادی', 'تاریخ شمسی', 'حساب', 'ارز', 'نوع', 'مبلغ', 'دسته', 'مشاور', 'شمارهٔ پیگیری', 'توضیح']];
    (A.rows || []).forEach(function (r) {
      var p = parseIso(r.entry_date), j = p ? toJalali(p.gy, p.gm, p.gd) : null;
      out.push([r.entry_date, j ? j.jy + '-' + (j.jm < 10 ? '0' : '') + j.jm + '-' + (j.jd < 10 ? '0' : '') + j.jd : '', ACC_FA[r.account], r.currency, r.direction === 'in' ? 'واریز' : 'برداشت', r.amount, CAT_FA[r.category] || r.category, r.counselor_id ? nameOf(r.counselor_id) : '', r.ref, r.note]);
    });
    csvDownload('hamnavaa-accounting-' + tehranDateInput(0) + '.csv', out);
  }

  function vStaff() {
    var open = (S.data.board && S.data.board.events.length) || 0;
    var tabList = [['board', 'اتاق‌های باز'], ['sessions', 'جلسه‌ها'], ['new', 'جلسهٔ جدید'], ['people', 'مشاورها'], ['acc', 'حسابداری'], ['monitor', 'پایش']];
    if (S.profile.takes_sessions) tabList.push(['mine', 'جلسه‌های من']);
    var tabs = h('div', { class: 'tabs', role: 'tablist' }, tabList.map(function (t) {
      return h('button', { class: 'tab', role: 'tab', 'aria-selected': S.tab === t[0] ? 'true' : 'false', onclick: function () { S.tab = t[0]; if (t[0] !== 'new') S.booked = null; if (t[0] === 'mine') loadCounselor(); if (t[0] === 'monitor') loadMonitor(); if (t[0] === 'acc') loadLedger(); render(); if (t[0] === 'new' || t[0] === 'people' || t[0] === 'sessions') refreshProfiles(); } },
        ico({ board: 'video', sessions: 'calendar', 'new': 'plus', people: 'users', acc: 'wallet', monitor: 'activity', mine: 'user' }[t[0]] || 'calendar'),
        h('span', { text: t[1] }), t[0] === 'board' ? h('span', { class: 'badge', id: 'boardBadge', text: open ? n(open) : '' }) : null);
    }));
    var body = S.tab === 'board' ? tBoard() : S.tab === 'new' ? tNew() : S.tab === 'people' ? tPeople() : S.tab === 'mine' ? h('div', null, counselorBody()) : S.tab === 'monitor' ? tMonitor() : S.tab === 'acc' ? tAccounting() : tSessions();
    shell([tabs, body]);
    // روی گوشی نوار تب‌ها افقی اسکرول می‌شود؛ تب انتخاب‌شده باید دیده شود
    setTimeout(function () {
      var sel = document.querySelector('.tab[aria-selected="true"]');
      if (sel && sel.scrollIntoView) sel.scrollIntoView({ inline: 'center', block: 'nearest' });
    }, 0);
  }

  /* ───────────── اتاق‌های باز: مشاور دکمه را می‌زند، منشی همان لحظه می‌بیند ───────────── */
  var BASE_TITLE = document.title;
  function clientText(s, p) {
    return ['سلام ' + s.client_label + ' عزیز', 'لینک اتاق مشاورهٔ شما با ' + (p.full_name || 'مشاور هم‌نوا') + ':', p.meet_url,
      'زمان: ' + dayOf(s.starts_at) + '، ساعت ' + timeOf(s.starts_at) + ' (به وقت ایران)', 'سر وقت روی لینک بزنید؛ مشاور شما را به اتاق می‌پذیرد.'].join('\n');
  }
  /* راهنمای حضور در جلسه: فقط به پیام تأیید «مشاورهٔ اصلی» اضافه می‌شود، نه پیش‌مشاورهٔ ۱۵ دقیقه‌ای */
  var SESSION_GUIDE = ['🌿 راهنمای حضور در جلسه مشاوره آنلاین', '', 'مراجع گرامی،', 'برای برگزاری جلسه‌ای آرام و مؤثر، لطفاً به نکات زیر توجه کنید:', '',
    '۱. محیط آرام و خصوصی: در فضایی ساکت و بدون حضور یا رفت‌وآمد دیگران باشید.', '',
    '۲. دوربین ثابت: گوشی یا لپ‌تاپ را در فاصله مناسب روی سطحی ثابت قرار دهید؛ لطفاً گوشی را در دست نگیرید.', '',
    '۳. وسایل ضروری: حتماً کاغذ، خودکار و آب آشامیدنی در دسترس داشته باشید.', '',
    '۴. اینترنت و تجهیزات: اتصال اینترنت، شارژ دستگاه و عملکرد دوربین و میکروفون را بررسی کنید.', '',
    '۵. تمرکز کامل: زمان جلسه را به خود اختصاص دهید. از رانندگی، غذا خوردن، کار کردن، پاسخ دادن به پیام‌ها خودداری کنید.', '',
    '۶. زمان‌بندی: لطفاً ۵ دقیقه زودتر آماده باشید تا جلسه به‌موقع آغاز شود.', '',
    '۷. حریم خصوصی: از ضبط جلسه یا حضور افراد دیگر بدون هماهنگی قبلی خودداری کنید.', '',
    '🌱 سپاس از همراهی شما', '', 'تیم روان‌شناسی هم‌نوا'];
  /* راهنمای حضور فقط برای «اولین مشاورهٔ اصلی» هر مراجع می‌رود.
     مراجع با شمارهٔ تلفن شناخته می‌شود؛ اگر یکی از دو جلسه شماره نداشته باشد، نام کوچک/کد مراجع ملاک است.
     S.firstMain[sessionId] = true/false؛ تا حساب نشده، برای اطمینان راهنما ضمیمه می‌شود. */
  function loadFirstFlags() {
    return Promise.all([sb.from('sessions').select('id,client_label,starts_at,kind').eq('kind', 'session').limit(5000), sb.from('session_contacts').select('session_id,client_phone').limit(5000)]).then(function (r) {
      if (r[0].error) return;
      var ph = {}; (r[1].data || []).forEach(function (c) { var d = phoneDigits(c.client_phone); if (d) ph[c.session_id] = d.slice(-9); });
      var list = (r[0].data || []).map(function (x) { return { id: x.id, t: new Date(x.starts_at).getTime(), lab: nkey(x.client_label), ph: ph[x.id] || '' }; });
      var map = {};
      list.forEach(function (a) {
        map[a.id] = !list.some(function (b) {
          if (b.id === a.id) return false;
          var same = (a.ph && b.ph) ? a.ph === b.ph : (a.lab && a.lab === b.lab);
          return same && (b.t < a.t || (b.t === a.t && b.id < a.id));
        });
      });
      S.firstMain = map;
    });
  }
  function isFirstMain(s) { return !s || !S.firstMain || S.firstMain[s.id] !== false; }
  function confirmText(s, p, noGuide) {
    var lines = ['سلام ' + s.client_label + ' عزیز 🌿', 'جلسهٔ شما در هم‌نوا ثبت شد.',
      'مشاور: ' + ((p && p.full_name) || 'هم‌نوا'),
      'زمان: ' + dayOf(s.starts_at) + '، ساعت ' + timeOf(s.starts_at) + ' (به وقت ایران)',
      'نوع: ' + (s.kind === 'intro' ? 'جلسهٔ رایگان پیش‌مشاوره' : 'جلسهٔ مشاوره') + ' — ' + (s.mode === 'audio' ? 'تماس صوتی' : 'تماس تصویری')];
    if (p && p.meet_url) lines.push('لینک اتاق: ' + p.meet_url, 'سر وقت روی لینک بزنید؛ مشاور شما را به اتاق می‌پذیرد.');
    else lines.push('لینک اتاق پیش از جلسه برایتان فرستاده می‌شود.');
    if (s.kind !== 'intro' && !noGuide && isFirstMain(s)) lines.push('', '──────────', '', SESSION_GUIDE.join('\n'));
    return lines.join('\n');
  }
  function reminderText(s, p) {
    var lines = ['سلام ' + s.client_label + ' عزیز', 'یادآوری جلسهٔ شما با ' + ((p && p.full_name) || 'مشاور هم‌نوا') + ':',
      dayOf(s.starts_at) + '، ساعت ' + timeOf(s.starts_at) + ' (به وقت ایران)'];
    if (p && p.meet_url) lines.push(p.meet_url);
    return lines.join('\n');
  }
  function counselorText(s, p, moved, remind) {
    var lines = ['سلام ' + ((p && p.full_name) || '') + ' 🌿', moved ? 'زمان یکی از جلسه‌های شما عوض شد:' : remind ? 'یادآوری جلسهٔ شما:' : 'یک جلسهٔ تازه برای شما رزرو شد:',
      'زمان: ' + dayOf(s.starts_at) + '، ساعت ' + timeOf(s.starts_at) + ' (به وقت ایران)',
      'مدت: ' + n(s.duration_min) + ' دقیقه',
      'نوع: ' + (s.kind === 'intro' ? 'جلسهٔ رایگان پیش‌مشاوره' : 'جلسهٔ مشاوره') + ' — ' + (s.mode === 'audio' ? 'تماس صوتی' : 'تماس تصویری'),
      'مراجع: ' + s.client_label];
    lines.push(p && !p.no_login ? 'سر وقت از دکمهٔ «ورود به اتاق مشاوره» در پنل هم‌نوا وارد شوید.' : 'سر وقت لینک اتاق خودتان را باز کنید و مراجع را بپذیرید.');
    return lines.join('\n');
  }
  function sendToCounselor(s, p, moved, remind) { window.open(waLink(phoneDigits(p.phone), counselorText(s, p, moved, remind)), '_blank', 'noopener'); }
  // یادآوری جلسه به خود مشاور (واتساپ)؛ مثل خبر دادن، فقط وقتی شمارهٔ واتساپ مشاور ثبت شده باشد
  function counselorRemindBtn(s, p, label) {
    return phoneCol() && p && p.phone
      ? h('button', { class: 'btn btn--wa btn--small', type: 'button', text: label || 'یادآوری به مشاور', onclick: function () { sendToCounselor(s, p, false, true); } }) : null;
  }
  // ستون phone با migration-10 اضافه می‌شود؛ تا آن موقع هیچ دکمه یا فیلدی دربارهٔ آن نشان داده نمی‌شود
  function phoneCol() { return (S.data.profiles || []).some(function (x) { return 'phone' in x; }); }
  function counselorStep(s, p, moved, label) {
    return phoneCol() && p && p.phone ? { label: label || 'ارسال به مشاور (واتساپ)', run: function () { sendToCounselor(s, p, moved); } } : null;
  }
  // دو دکمهٔ جدا (مراجع و مشاور)، هر ترتیبی؛ بعد از باز کردن هر چت، همان دکمه ✓ می‌گیرد
  // (مرورگر اجازهٔ باز کردن دو پنجره با یک لمس را نمی‌دهد، و واتساپ پیام را خودکار نمی‌فرستد)
  function guidedSend(state, steps) {
    steps = steps.filter(Boolean);
    if (!steps.length) return null;
    state.sent = state.sent || {};
    return h('div', { class: 'sendpair' }, steps.map(function (st) {
      var done = !!state.sent[st.label];
      return h('button', { class: done ? 'btn btn--wa btn--block is-sent' : 'room-btn', type: 'button',
        onclick: function () { state.sent[st.label] = true; st.run(); render(); } },
        h('span', { text: (done ? '✓ ' : '') + st.label + (done ? ' — باز شد' : '') }));
    }));
  }
  function counselorBtns(s, p, moved, big) {
    if (!phoneCol() || !p) return null;
    return p.phone
      ? h('button', { class: big ? 'btn btn--wa btn--block' : 'btn btn--wa btn--small', type: 'button', text: big ? 'خبر دادن به مشاور (واتساپ)' : 'خبر به مشاور', onclick: function () { sendToCounselor(s, p, moved); } })
      : (big ? h('p', { class: 'hint', text: 'شمارهٔ واتساپ این مشاور ثبت نشده؛ در تب «مشاورها» ثبتش کنید تا پیام آماده برایش بفرستید.' }) : null);
  }
  function sendConfirm(s, p, phone, noGuide) { window.open(waLink(phoneDigits(phone), confirmText(s, p, noGuide)), '_blank', 'noopener'); }
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
    document.addEventListener('visibilitychange', function () { if (!document.hidden) refreshProfiles(); });
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

  /* مدیر یا منشی‌ای که خودش مشاور هم هست (مثل دکتر فتاحی): دکمهٔ ورود به اتاقِ خودش باید روی همین صفحهٔ اول باشد،
     نه فقط در تب آخرِ «جلسه‌های من». */
  function myRoomCard() {
    if (!S.profile || !S.profile.takes_sessions) return null;
    if (!S.mine) return h('section', { class: 'card hero' }, h('h2', { text: 'اتاق مشاورهٔ من' }), h('p', { class: 'hint', text: 'در حال بارگذاری جلسه‌های شما…' }));
    var now = Date.now();
    var upcoming = S.mine.filter(function (s) { return s.status === 'scheduled' && endOf(s) + JOIN_AFTER_MIN * 60000 >= now; });
    var next = upcoming.filter(function (s) { return endOf(s) > now; })[0] || upcoming[0];
    var hasLink = !!S.profile.meet_url;
    var card = h('section', { class: 'card hero', id: 'sec-room' },
      h('h2', { text: 'اتاق مشاورهٔ من' }),
      h('p', { class: 'hint' }, next ? ['جلسهٔ بعدی شما: ', dayLabel(next.starts_at) + '، ساعت ' + timeOf(next.starts_at) + ' — ' + next.client_label + ' — ', h('b', { class: 'cd', text: countdown(next) })] : 'جلسهٔ برنامه‌ریزی‌شده‌ای ندارید.'),
      h('button', { class: 'room-btn', type: 'button', disabled: !hasLink, onclick: function () { openRoom(next); } },
        svgEl(VIDEO_ICON), h('span', { text: 'ورود به اتاق مشاوره' })),
      !hasLink ? h('p', { class: 'hint', text: 'لینک اتاق شما ثبت نشده. از تب «جلسه‌های من» ثبتش کنید.' }) : null);
    if (S.room && hasLink) {
      card.appendChild(h('p', { class: 'hint', role: 'status', text: S.notified === 'ok' ? 'اتاق باز شد و برای منشی اعلام شد ✓' :
        S.notified === 'fail' ? 'اتاق باز شد، ولی اطلاع‌رسانی خودکار انجام نشد. از تب «جلسه‌های من» لینک را برای منشی بفرستید.' : 'اتاق باز شد. در حال اطلاع‌رسانی…' }));
    }
    return card;
  }
  function tBoard() {
    var B = S.data.board || { events: [], sessions: {}, contacts: {} };
    return h('div', { class: 'cols' }, h('div', { class: 'cols__a' }, myRoomCard(), pushCard(), h('section', { class: 'card' }, h('h2', { text: 'اتاق‌های باز' }),
      h('p', { class: 'hint', text: 'وقتی مشاوری دکمهٔ «ورود به اتاق مشاوره» را می‌زند، همین‌جا ظاهر می‌شود. این صفحه را باز نگه دارید.' }),
      h('div', { class: 'actions' }, h('button', { class: 'btn btn--small', type: 'button', disabled: !!S.alerts, onclick: enableAlerts,
        text: S.alerts ? 'صدا و اعلان فعال است ✓' : 'فعال‌سازی صدا و اعلان' })),
      B.events.length ? B.events.map(function (e) { return eventCard(e, B); }) : h('p', { class: 'empty', text: 'الان اتاق بازی نیست.' }))), h('div', { class: 'cols__b' }, attentionCard(), todayCard()));
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
    var counselors = (S.data.profiles || []).filter(isProvider);
    var from = dateField(S.data.from || tehranDateInput(-7));
    var to = dateField(S.data.to || tehranDateInput(30));
    var who = h('select', { class: 'select' }, h('option', { value: '', text: 'همهٔ مشاورها' }),
      counselors.map(function (p) { return h('option', { value: p.id, text: p.full_name || 'بدون نام', selected: S.data.who === p.id }); }));
    var apply = function () { S.data.from = from.value(); S.data.to = to.value(); S.data.who = who.value || null; loadStaff(); };
    var quick = [['امروز', 0, 0], ['فردا', 1, 1], ['۷ روز آینده', 0, 7], ['۳۰ روز آینده', 0, 30], ['۷ روز گذشته', -7, 0]];
    var chips = h('div', { class: 'qchips' }, quick.map(function (q) {
      return h('button', { class: 'qchip', type: 'button', text: q[0], onclick: function () { S.data.from = tehranDateInput(q[1]); S.data.to = tehranDateInput(q[2]); S.data.who = who.value || null; loadStaff(); } });
    }));
    var qin = h('input', { class: 'input', type: 'search', placeholder: 'جست‌وجو: نام مراجع، مشاور یا شماره', value: S.data.q || '', 'aria-label': 'جست‌وجو',
      oninput: function (e) { S.data.q = e.target.value; clearTimeout(S.qt); S.qt = setTimeout(render, 250); } });
    var stSel = h('select', { class: 'select', 'aria-label': 'وضعیت', onchange: function (e) { S.data.st = e.target.value; render(); } },
      h('option', { value: '', text: 'همهٔ وضعیت‌ها' }), Object.keys(STATUS).map(function (k) { return h('option', { value: k, text: STATUS[k], selected: S.data.st === k }); }));
    var list = (S.data.sessions || []).filter(function (s) {
      var q = (S.data.q || '').trim().toLowerCase(), phone = (S.data.contacts && S.data.contacts[s.id]) || '';
      if (S.data.st && s.status !== S.data.st) return false;
      return !q || (s.client_label || '').toLowerCase().indexOf(q) >= 0 || nameOf(s.counselor_id).toLowerCase().indexOf(q) >= 0 || phone.indexOf(q) >= 0;
    });
    var moved = null;
    if (S.moved) {
      var mp = profileOf(S.moved.s.counselor_id);
      moved = h('section', { class: 'card hero', role: 'status' }, h('h2', { text: 'زمان جلسه عوض شد ✓' }),
        h('p', { class: 'hint' }, nameOf(S.moved.s.counselor_id) + ' — ' + S.moved.s.client_label + ' — ', dayNode(S.moved.s.starts_at), '، ساعت ' + timeOf(S.moved.s.starts_at)),
        guidedSend(S.moved, [S.moved.phone ? { label: 'اطلاع زمان تازه به مراجع (واتساپ)', run: function () { sendConfirm(S.moved.s, mp, S.moved.phone, true); } } : null, counselorStep(S.moved.s, mp, true, 'اطلاع زمان تازه به مشاور (واتساپ)')]),
        S.moved.phone ? null : h('p', { class: 'hint', text: 'شمارهٔ مراجع ثبت نشده؛ زمان تازه را خودتان به او خبر بدهید.' }),
        phoneCol() && mp && !mp.phone ? h('p', { class: 'hint', text: 'شمارهٔ واتساپ این مشاور ثبت نشده؛ در تب «مشاورها» ثبتش کنید.' }) : null,
        h('div', { class: 'actions' }, h('button', { class: 'btn btn--small', type: 'button', text: 'بستن', onclick: function () { S.moved = null; render(); } })));
    }
    var cnt = countKinds(list), kt = S.data.kt || 'session', shown = ofKind(list, kt);
    var filtered = (S.data.q || S.data.st) ? ' با این فیلتر' : '';
    return h('div', null, moved, h('section', { class: 'card' }, h('h2', { text: 'جلسه‌ها' }),
      kindSeg(cnt, kt, function (x) { S.data.kt = x; render(); }),
      chips,
      h('div', { class: 'filters' },
        h('div', { class: 'field' }, h('label', { text: 'از تاریخ' }), from.el), h('div', { class: 'field' }, h('label', { text: 'تا تاریخ' }), to.el),
        h('div', { class: 'field' }, h('label', { text: 'مشاور' }), who),
        h('div', { class: 'field filters__go' }, h('button', { class: 'btn btn--primary', type: 'button', text: 'نمایش جلسه‌ها', onclick: apply })),
        h('div', { class: 'field filters__q' }, h('label', { text: 'جست‌وجو' }), qin), h('div', { class: 'field' }, h('label', { text: 'وضعیت' }), stSel)),
      shown.length ? dayRows(shown) : h('p', { class: 'empty', text: (kt === 'intro' ? 'پیش‌مشاوره‌ای' : 'مشاوره‌ای') + ' پیدا نشد' + filtered + '.' })),
      S.profile.role === 'admin' ? adminToolsCard() : null);
  }

  /* فهرست فشرده: هر روز یک سرتیتر با شمارش، هر جلسه یک ردیف یک‌خطی؛ با زدن ردیف، دکمه‌ها باز می‌شود */
  function dayRows(list) {
    var out = [], box = null, last = null, per = {};
    list.forEach(function (s) { var d = tehranISO(s.starts_at); per[d] = (per[d] || 0) + 1; });
    list.forEach(function (s) {
      var d = tehranISO(s.starts_at), lab = dayLabel(s.starts_at);
      if (d !== last) {
        out.push(h('h3', { class: 'dayhead' }, lab, lab !== dayJ(s.starts_at) ? h('small', { text: ' · ' + dayJ(s.starts_at) }) : null, h('span', { class: 'dayhead__n', text: n(per[d]) })));
        box = h('div', { class: 'rows' }); out.push(box); last = d;
      }
      box.appendChild(staffRow(s));
    });
    return out;
  }
  function staffRow(s) {
    var st = s.status, ok = st === 'done', bad = st !== 'scheduled' && !ok;
    var chips = [h('span', { class: 'chip', text: n(s.duration_min) + ' د · ' + MODE[s.mode] })];
    if (bad || ok) chips.push(h('span', { class: 'chip ' + (ok ? 'chip--ok' : 'chip--warn'), text: STATUS[st] }));
    if (kindOf(s) === 'session' && pkgReady() && s.paid && s.paid !== 'free') chips.push(h('span', { class: 'chip ' + (s.paid === 'paid' ? 'chip--ok' : 'chip--warn'), text: s.paid === 'paid' ? 'پرداخت‌شده ✓' : 'پرداخت نشده' }));
    S.data.open = S.data.open || {};
    var head = h('button', { class: 'r__head', type: 'button', 'aria-expanded': S.data.open[s.id] ? 'true' : 'false' },
      h('span', { class: 'r__time', text: timeOf(s.starts_at) }),
      h('span', { class: 'r__who' }, h('b', { text: s.client_label }), h('small', { text: nameOf(s.counselor_id) })),
      h('span', { class: 'chips r__chips' }, chips), h('span', { class: 'r__chev', 'aria-hidden': 'true' }));
    var row = h('div', { class: 'r r--' + kindOf(s) + (ok ? ' r--done' : bad ? ' r--warn' : '') + (S.data.open[s.id] ? ' r--open' : '') }, head,
      S.data.open[s.id] ? h('div', { class: 'r__body' }, staffBody(s)) : null);
    head.addEventListener('click', function () {
      var on = row.classList.toggle('r--open'), b = row.querySelector('.r__body');
      head.setAttribute('aria-expanded', on ? 'true' : 'false'); S.data.open[s.id] = on;
      if (on && !b) row.appendChild(h('div', { class: 'r__body' }, staffBody(s)));
      else if (!on && b) b.remove();
    });
    return row;
  }

  function staffBody(s) {
    var p = profileOf(s.counselor_id), phone = S.data.contacts && S.data.contacts[s.id];
    var sel = h('select', { class: 'select', 'aria-label': 'وضعیت', onchange: function (e) {
      sb.from('sessions').update({ status: e.target.value, updated_at: new Date().toISOString() }).eq('id', s.id).then(function (r) {
        flash(r.error ? 'err' : 'ok', r.error ? explain(r.error) : 'وضعیت به‌روز شد.'); loadStaff();
      });
    } }, Object.keys(STATUS).map(function (k) { return h('option', { value: k, text: STATUS[k], selected: s.status === k }); }));
    var acts = h('div', { class: 'actions' });
    if (phone) {
      acts.appendChild(h('button', { class: 'btn btn--wa btn--small', type: 'button', text: 'ارسال تأیید', onclick: function () { sendConfirm(s, p, phone); } }));
      if (s.status === 'scheduled') acts.appendChild(h('button', { class: 'btn btn--wa btn--small', type: 'button', text: 'یادآوری به مراجع', onclick: function () { sendReminder(s, p, phone); } }));
    } else acts.appendChild(h('span', { class: 'chip', text: 'شمارهٔ مراجع ثبت نشده' }));
    if (s.status === 'scheduled') { var cr = counselorRemindBtn(s, p); if (cr) acts.appendChild(cr); }
    if (s.status === 'scheduled') { var cb = counselorBtns(s, p, false, false); if (cb) acts.appendChild(cb); }
    if (!p || !p.meet_url) acts.appendChild(h('span', { class: 'chip chip--warn', text: 'مشاور هنوز لینک اتاق ثبت نکرده' }));
    if (s.status === 'scheduled') acts.appendChild(h('button', { class: 'btn btn--small', type: 'button', text: S.resched === s.id ? 'بستن' : 'تغییر زمان', onclick: function () { S.resched = S.resched === s.id ? null : s.id; render(); } }));
    if (pkgReady() && s.paid !== 'free') acts.appendChild(payBtn(s));
    acts.appendChild(h('button', { class: 'btn btn--danger btn--small', type: 'button', text: S.delFor === s.id ? 'انصراف از حذف' : 'حذف', onclick: function () {
      if (kindOf(s) === 'intro') { if (window.confirm('این پیش‌مشاوره حذف شود؟')) deleteSession(s, ''); return; }
      S.delFor = S.delFor === s.id ? null : s.id; render();      // مشاورهٔ اصلی: اول دلیل پرسیده می‌شود
    } }));
    return [
      h('div', { class: 'hint' }, dayJ(s.starts_at), ' · ', ltr(dayG(s.starts_at)), ' · ساعت ' + timeOf(s.starts_at) + ' — ' + n(s.duration_min) + ' دقیقه'),
      h('div', { class: 'chips' }, h('span', { class: 'chip chip--gold', text: KIND[s.kind] }), h('span', { class: 'chip', text: MODE[s.mode] }), payChips(s)),
      h('div', null, h('b', { text: 'مشاور: ' }), nameOf(s.counselor_id), '   ', h('b', { text: 'مراجع: ' }), s.client_label,
        phone ? h('span', { class: 'hint', dir: 'ltr', text: '   ' + phone }) : null),
      h('div', { class: 'field' }, sel), acts, S.resched === s.id ? reschedForm(s, phone) : null, S.delFor === s.id ? deleteForm(s) : null];
  }

  /* حذف جلسه: برای مشاورهٔ اصلی دلیل اجباری است و همراه نوع جلسه در «پایش» ثبت می‌شود؛ پیش‌مشاوره فقط با تأیید حذف می‌شود */
  var DEL_REASONS = ['لغو توسط مراجع', 'انصراف مراجع پیش از جلسه', 'ثبت اشتباه یا تکراری', 'تغییر مشاور یا بسته', 'پرداخت نشد', 'سایر (توضیح بنویسید)'];
  function deleteForm(s) {
    var sel = h('select', { class: 'select', 'aria-label': 'دلیل حذف' }, h('option', { value: '', text: 'دلیل حذف را انتخاب کنید…' }),
      DEL_REASONS.map(function (r) { return h('option', { value: r, text: r }); }));
    var note = h('input', { class: 'input', maxlength: 200, placeholder: 'توضیح (برای «سایر» لازم است)', 'aria-label': 'توضیح' });
    var msg = h('p', { class: 'hint', role: 'status' });
    var go = h('button', { class: 'btn btn--danger btn--small', type: 'button', text: 'حذف این مشاوره' });
    go.addEventListener('click', function () {
      var other = sel.value === DEL_REASONS[DEL_REASONS.length - 1], txt = note.value.trim();
      if (!sel.value) { msg.textContent = 'دلیل حذف را انتخاب کنید.'; return; }
      if (other && txt.length < 3) { msg.textContent = 'برای «سایر» دلیل را بنویسید.'; return; }
      var reason = other ? txt : sel.value + (txt ? ' — ' + txt : '');
      if (window.confirm('مشاورهٔ «' + s.client_label + '» با دلیل «' + reason + '» حذف شود؟ این کار برگشت‌پذیر نیست.')) deleteSession(s, reason);
    });
    return h('div', { class: 'resched' }, h('p', { class: 'hint', text: 'این یک مشاورهٔ اصلی است؛ پیش از حذف دلیلش را مشخص کنید. دلیل در «پایش ← گزارش فعالیت» می‌ماند.' }),
      h('div', { class: 'row' }, h('div', { class: 'field' }, h('label', { text: 'دلیل' }), sel), h('div', { class: 'field' }, h('label', { text: 'توضیح' }), note)),
      msg, h('div', { class: 'actions' }, go));
  }
  function deleteSession(s, reason) {
    sb.rpc('staff_delete_session', { p_session: s.id, p_reason: reason }).then(function (r) {
      if (r.error && /could not find the function|PGRST202|staff_delete_session/i.test(String(r.error.message || '') + String(r.error.code || ''))) {
        // دیتابیس هنوز migration-14 را ندارد: مثل قبل حذف می‌شود، ولی دلیل و نوع با ریز در گزارش ثبت نمی‌شود
        return sb.from('sessions').delete().eq('id', s.id).then(function (r2) {
          S.delFor = null; flash(r2.error ? 'err' : 'info', r2.error ? explain(r2.error) : 'حذف شد؛ ولی ثبت دلیل هنوز در دیتابیس فعال نشده است.'); loadStaff();
        });
      }
      S.delFor = null;
      if (S.data.open) delete S.data.open[s.id];
      flash(r.error ? 'err' : 'ok', r.error ? explain(r.error) : 'حذف شد.'); loadStaff();
    });
  }
  function reschedForm(s, phone) {
    var d = dateField(tehranISO(s.starts_at)), t = timeField(null, tehranHM(s.starts_at));
    var save = h('button', { class: 'btn btn--primary btn--small', type: 'button', text: 'ذخیرهٔ زمان تازه' });
    save.addEventListener('click', function () {
      var when = tehranToUtc(d.value() && t.value() ? d.value() + 'T' + t.value() : '');
      if (!when) { flash('err', 'تاریخ و ساعت را کامل کنید.'); return render(); }
      if (when.getTime() === new Date(s.starts_at).getTime()) { flash('info', 'زمان تغییری نکرده است.'); return render(); }
      save.disabled = true;
      findConflict(s.counselor_id, when, s.duration_min, s.id).then(function (c) {
        if (c && !window.confirm(conflictText(c))) { save.disabled = false; return; }
        sb.from('sessions').update({ starts_at: when.toISOString(), updated_at: new Date().toISOString() }).eq('id', s.id).then(function (r) {
          if (r.error) { save.disabled = false; flash('err', explain(r.error)); return render(); }
          S.resched = null; S.moved = { s: Object.assign({}, s, { starts_at: when.toISOString() }), phone: phone || '' }; loadStaff();
        });
      });
    });
    return h('div', { class: 'resched' }, h('p', { class: 'hint', text: 'زمان تازه (به وقت ایران، ۲۴ ساعته):' }),
      h('div', { class: 'row' }, h('div', { class: 'field' }, h('label', { text: 'تاریخ' }), d.el), h('div', { class: 'field' }, h('label', { text: 'ساعت' }), t.el)),
      h('div', { class: 'actions' }, save));
  }

  function tNew() {
    var noLogin = h('p', { class: 'warnbox', hidden: true, text: 'این مشاور هنوز حساب ورود ندارد: جلسه ثبت می‌شود و تأیید برای مراجع ارسال می‌شود، ولی مشاور اعلانی نمی‌گیرد. جلسه را خودتان به او خبر بدهید.' });
    var counselors = (S.data.profiles || []).filter(function (p) { return isProvider(p) && p.active; });
    var f = {
      who: h('select', { class: 'select', required: true }, h('option', { value: '', text: 'انتخاب مشاور…' }),
        counselors.map(function (p) { return h('option', { value: p.id, text: p.full_name || 'بدون نام', selected: S.lastWho === p.id }); })),
      label: h('input', { class: 'input', maxlength: 60, required: true, placeholder: 'نام کوچک یا یک کد، نه نام کامل' }),
      phone: h('input', { class: 'input', dir: 'ltr', placeholder: '+1 647 000 0000  یا  0912…' }),
      dur: h('select', { class: 'select' }, [15, 30, 45, 60, 90].map(function (n) { return h('option', { value: n, text: nf.format(n) + ' دقیقه', selected: n === 45 }); })),
      mode: h('select', { class: 'select' }, h('option', { value: 'video', text: 'تصویری' }), h('option', { value: 'audio', text: 'صوتی' })),
      kind: h('select', { class: 'select' }, h('option', { value: 'session', text: 'جلسه' }), h('option', { value: 'intro', text: 'جلسهٔ رایگان پیش‌مشاوره' }))
    };
    var pf = pkgReady() ? packFields(function () { return f.who.value; }, true) : null;
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
    f.kind.addEventListener('change', function () { f.dur.value = f.kind.value === 'intro' ? '15' : '45'; if (pf) pf.setKind(f.kind.value); });
    var form = h('form', { class: 'card', onsubmit: function (e) {
      e.preventDefault();
      var when = tehranToUtc(whenLocal());
      if (!f.who.value || !when) { flash('err', 'مشاور و زمان را کامل کنید.'); return render(); }
      submit.disabled = true;
      findConflict(f.who.value, when, +f.dur.value).then(function (cf) {
      if (cf && !window.confirm(conflictText(cf))) { submit.disabled = false; return; }
      sb.from('sessions').insert(Object.assign({ counselor_id: f.who.value, client_label: f.label.value.trim(), starts_at: when.toISOString(),
        duration_min: +f.dur.value, mode: f.mode.value, kind: f.kind.value, created_by: S.user.id }, pf ? pf.values(f.kind.value) : {})).select().single().then(function (r) {
        if (r.error) { submit.disabled = false; flash('err', explain(r.error)); return render(); }
        var phone = f.phone.value.trim();
        S.lastWho = f.who.value;
        var booked = function (saved) { S.booked = { s: r.data, phone: saved ? phone : '' }; loadStaff(); if (pf) loadPackages(); };
        if (!phone) return booked(false);
        sb.from('session_contacts').insert({ session_id: r.data.id, client_phone: phone }).then(function (c) {
          if (c.error) flash('err', 'جلسه ثبت شد ولی شمارهٔ مراجع ذخیره نشد.');
          booked(!c.error);
        });
      });
      });
    } },
      h('h2', { text: 'جلسهٔ جدید' }),
      counselors.length ? null : h('p', { class: 'flash flash--info', text: 'هنوز مشاور فعالی نیست. از تب «مشاورها» فعالشان کنید.' }),
      h('div', { class: 'field' }, h('label', { text: 'مشاور' }), f.who, noLogin),
      h('div', { class: 'field' }, h('label', { text: 'مراجع (نام کوچک یا کد)' }), f.label),
      h('div', { class: 'field' }, h('label', { text: 'شمارهٔ مراجع (برای ارسال تأیید با واتساپ؛ فقط منشی و مدیر می‌بینند)' }), f.phone),
      h('div', { class: 'row' },
        h('div', { class: 'field' }, h('label', { text: 'تاریخ' }), f.date.el),
        h('div', { class: 'field' }, h('label', { text: 'ساعت (به وقت ایران، ۲۴ ساعته)' }), f.time.el)),
      preview,
      h('div', { class: 'row' }, h('div', { class: 'field' }, h('label', { text: 'مدت' }), f.dur), h('div', { class: 'field' }, h('label', { text: 'نوع تماس' }), f.mode)),
      h('div', { class: 'field' }, h('label', { text: 'جلسه یا پیش‌مشاوره' }), f.kind),
      pf ? pf.el : null,
      h('p', { class: 'hint', text: 'محتوای جلسه یا یادداشت بالینی را هیچ‌جا این‌جا ننویسید.' }),
      h('div', { class: 'actions' }, submit));
    f.who.addEventListener('change', function () {
      if (pf) pf.refresh();
      var p = counselors.filter(function (x) { return x.id === f.who.value; })[0];
      noLogin.hidden = !(p && p.no_login);
    });
    var done = null;
    if (S.booked) {
      var bs = S.booked.s, bp = profileOf(bs.counselor_id);
      done = h('section', { class: 'card hero', role: 'status' },
        h('h2', { text: 'جلسه ثبت شد ✓' }),
        h('p', { class: 'hint' }, nameOf(bs.counselor_id) + ' — ' + bs.client_label + ' — ', dayNode(bs.starts_at), '، ساعت ' + timeOf(bs.starts_at)),
        guidedSend(S.booked, [S.booked.phone ? { label: 'ارسال به مراجع (واتساپ)', run: function () { sendConfirm(bs, bp, S.booked.phone); } } : null, counselorStep(bs, bp, false, 'ارسال به مشاور (واتساپ)')]),
        S.booked.phone ? null : h('p', { class: 'hint', text: 'شمارهٔ مراجع ثبت نشد؛ بعداً از تب «جلسه‌ها» می‌توانید تأیید بفرستید.' }),
        phoneCol() && bp && !bp.phone ? h('p', { class: 'hint', text: 'شمارهٔ واتساپ این مشاور ثبت نشده؛ در تب «مشاورها» ثبتش کنید تا پیام آماده برایش بفرستید.' }) : null,
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
      var guest = p.no_login ? guestBlock(p, isAdmin) : null;
      var wa = isProvider(p) && phoneCol() ? h('div', { class: 'field' }, h('label', { text: 'شمارهٔ واتساپ (برای خبر دادن جلسهٔ تازه؛ فقط منشی و مدیر می‌بینند)' }),
        h('input', { class: 'input', dir: 'ltr', value: p.phone || '', placeholder: '+1 647 000 0000  یا  0912…', disabled: !isAdmin, 'aria-label': 'شمارهٔ واتساپ',
          onchange: function (e) { upd(p.id, { phone: e.target.value.trim() || null }); } })) : null;
      var takes = p.role === 'counselor' ? null : h('label', null, h('input', { type: 'checkbox', checked: !!p.takes_sessions, disabled: !isAdmin, 'aria-label': 'جلسه می‌گیرد', onchange: function (e) { upd(p.id, { takes_sessions: e.target.checked }); } }), ' خودش هم جلسه می‌گیرد (مشاور است)');
      return h('div', { class: 's person' }, h('div', { class: 'person__head' }, avatar(p.full_name || '؟'), name),
        h('div', { class: 'row' }, role, h('label', null, active, ' فعال')), takes, wa, guest,
        h('div', { class: 'chips' }, h('span', { class: 'chip ' + (p.meet_url ? 'chip--ok' : 'chip--warn'), text: p.meet_url ? 'لینک اتاق ثبت شده' : 'لینک اتاق ندارد' }),
          isProvider(p) && phoneCol() ? h('span', { class: 'chip ' + (p.phone ? 'chip--ok' : 'chip--warn'), text: p.phone ? 'شمارهٔ واتساپ ثبت شده' : 'شمارهٔ واتساپ ندارد' }) : null),
        isAdmin && !self ? h('div', { class: 'actions' }, h('button', { class: 'btn btn--danger btn--small', type: 'button', text: 'حذف این فرد', onclick: function () { deletePerson(p); } })) : null);
    });
    return h('div', null, isAdmin ? addPersonCard() : null, h('section', { class: 'card' }, h('h2', { text: 'مشاورها و کارکنان' }),
      h('p', { class: 'hint' }, 'برای دعوت یک مشاور جدید: در داشبورد ', ltr('Supabase'), ' بخش ', ltr('Authentication'), ' ← ', ltr('Users'), ' ← ', ltr('Invite user'), ' را بزنید. بعد از اولین ورودش، این‌جا فعالش کنید. اگر مدیر یا منشی خودش مشاور هم هست، گزینهٔ «خودش هم جلسه می‌گیرد» را بزنید تا در فهرست مشاورهای ثبت جلسه بیاید.'),
      rows.length ? h('div', { class: 'grid2' }, rows) : h('p', { class: 'empty', text: 'هنوز کسی نیست.' })));
  }

  /* ───────────── ابزار مدیر: افزودن و حذف ───────────── */
  function deletePerson(p) {
    if (!window.confirm('«' + (p.full_name || 'بدون نام') + '» حذف شود؟\nاگر جلسه‌ای به او وصل باشد حذف نمی‌شود؛ در آن حالت غیرفعالش کنید.')) return;
    sb.from('profiles').delete().eq('id', p.id).then(function (r) {
      flash(r.error ? 'err' : 'ok', r.error ? explain(r.error) : 'حذف شد.'); loadStaff();
    });
  }
  function addPersonCard() {
    var name = h('input', { class: 'input', maxlength: 80, required: true, placeholder: 'مثلاً دکتر نام و نام‌خانوادگی' });
    var btn = h('button', { class: 'btn btn--primary', type: 'submit', text: 'افزودن مشاور' });
    return h('form', { class: 'card', onsubmit: function (e) {
      e.preventDefault();
      if (!name.value.trim()) return;
      btn.disabled = true;
      sb.from('profiles').insert({ full_name: name.value.trim(), role: 'counselor', active: true, no_login: true }).then(function (r) {
        flash(r.error ? 'err' : 'ok', r.error ? explain(r.error) : 'مشاور اضافه شد. بعد از دعوتش، ایمیل او را در کارتش «اتصال به حساب» کنید.'); loadStaff();
      });
    } },
      h('h2', { text: 'افزودن مشاور (بدون حساب ورود)' }),
      h('p', { class: 'hint', text: 'منشی می‌تواند برایش جلسه ثبت کند. وقتی دعوتش کردید، ایمیلش را در کارت او بزنید تا جلسه‌ها به حساب واقعی‌اش بروند.' }),
      h('div', { class: 'field' }, h('label', { text: 'نام' }), name), h('div', { class: 'actions' }, btn));
  }
  // پاک‌کردن جلسه‌های آزمایشی: همه‌چیزِ ساخته‌شده تا پایان یک تاریخ (جلسه، شمارهٔ مراجع، رویداد اتاق، لاگ جلسه)
  function adminToolsCard() {
    var d = dateField(tehranDateInput(0));
    var go = h('button', { class: 'btn btn--danger', type: 'button', text: 'پاک‌کردن جلسه‌های آزمایشی' });
    go.addEventListener('click', function () {
      var cutoff = tehranToUtc(d.value() + 'T23:59');
      if (!cutoff) { flash('err', 'تاریخ را انتخاب کنید.'); return render(); }
      if (window.prompt('همهٔ جلسه‌های ساخته‌شده تا پایان ' + d.value() + ' برای همیشه پاک می‌شود، با شمارهٔ مراجع‌ها و لاگ‌هایشان.\nبرای ادامه بنویسید: حذف') !== 'حذف') { flash('info', 'پاک نشد.'); return render(); }
      go.disabled = true;
      sb.rpc('admin_clear_sessions', { p_created_before: cutoff.toISOString() }).then(function (r) {
        var x = r.data || {};
        flash(r.error ? 'err' : 'ok', r.error ? explain(r.error) : 'پاک شد: ' + n(x.sessions || 0) + ' جلسه، ' + n(x.room_events || 0) + ' رویداد اتاق، ' + n(x.log_rows || 0) + ' ردیف لاگ.');
        loadStaff(); if (pkgReady()) loadPackages();
      });
    });
    return h('section', { class: 'card card--attn' }, h('h2', { text: 'ابزار مدیر' }),
      h('p', { class: 'hint', text: 'پاک‌کردنِ جلسه‌های آزمایشی. افراد، لینک اتاق‌ها، لاگ ورودها و اعلان‌ها دست نمی‌خورند. تاریخی را بزنید که تا پایانش هرچه ساخته شده آزمایشی بوده است.' }),
      h('div', { class: 'field' }, h('label', { text: 'پاک شود: همه‌چیزِ ساخته‌شده تا پایان این روز' }), d.el), h('div', { class: 'actions' }, go));
  }
  function guestBlock(p, isAdmin) {
    var meet = h('input', { class: 'input', dir: 'ltr', type: 'url', placeholder: 'https://meet.google.com/abc-defg-hij', value: p.meet_url || '', disabled: !isAdmin, 'aria-label': 'لینک اتاق' });
    var email = h('input', { class: 'input', dir: 'ltr', type: 'email', placeholder: 'ایمیلی که برایش دعوت فرستاده‌اید', disabled: !isAdmin, 'aria-label': 'ایمیل حساب' });
    return h('div', { class: 'guest' },
      h('p', { class: 'hint', text: 'این مشاور هنوز حساب ورود ندارد؛ منشی می‌تواند برایش جلسه ثبت کند، ولی خودش اعلان نمی‌گیرد و اتاق را از پنل باز نمی‌کند.' }),
      h('div', { class: 'field' }, h('label', { text: 'لینک اتاق او (Google Meet) برای پیام تأیید' }), meet),
      isAdmin ? h('div', { class: 'actions' }, h('button', { class: 'btn btn--small', type: 'button', text: 'ذخیرهٔ لینک', onclick: function () {
        var v = meet.value.trim().split('?')[0];
        if (v && !MEET_RE.test(v)) { flash('err', explain('invalid meet')); return render(); }
        upd(p.id, { meet_url: v || null });
      } })) : null,
      isAdmin ? h('div', { class: 'field' }, h('label', { text: 'وقتی او را دعوت کردید و حسابش ساخته شد، ایمیلش را اینجا بنویسید تا جلسه‌ها به حساب واقعی‌اش وصل شوند' }), email) : null,
      isAdmin ? h('div', { class: 'actions' }, h('button', { class: 'btn btn--small btn--primary', type: 'button', text: 'اتصال به حساب', onclick: function () {
        var e = email.value.trim();
        if (!e) { flash('err', 'ایمیل را بنویسید.'); return render(); }
        if (!window.confirm('همهٔ جلسه‌های ' + (p.full_name || 'این مشاور') + ' به حساب ' + e + ' منتقل شود؟')) return;
        sb.rpc('link_counselor_account', { p_placeholder: p.id, p_email: e }).then(function (r) {
          flash(r.error ? 'err' : 'ok', r.error ? (/no such account/.test(r.error.message || '') ? 'حسابی با این ایمیل پیدا نشد. اول باید دعوتش کنید.' : explain(r.error)) : 'متصل شد.');
          loadStaff();
        });
      } })) : null);
  }
  function upd(id, patch) {
    sb.from('profiles').update(patch).eq('id', id).then(function (r) {
      flash(r.error ? 'err' : 'ok', r.error ? explain(r.error) : 'ذخیره شد.'); loadStaff();
    });
  }


  /* ───────────── پایش: نمای کلی، ورودها، گزارش فعالیت (فقط مدیر و منشی) ───────────── */
  var ACTIONS = {
    session_created: 'جلسهٔ جدید', session_moved: 'جابه‌جایی جلسه', session_status: 'وضعیت جلسه', session_reassigned: 'انتقال جلسه', session_deleted: 'حذف جلسه',
    room_opened: 'باز شدن اتاق', signin: 'ورود به پنل', profile_created: 'پروفایل تازه', profile_changed: 'تغییر افراد', profile_deleted: 'حذف پروفایل', push_enabled: 'اعلان گوشی', account_linked: 'اتصال حساب'
  };
  var ACTION_GROUPS = { '': 'همه', sessions: 'جلسه‌ها', rooms: 'اتاق‌ها', people: 'افراد و حساب‌ها', push: 'اعلان‌ها', accounting: 'حسابداری' };
  var GROUP_OF = { session_created: 'sessions', session_moved: 'sessions', session_status: 'sessions', session_reassigned: 'sessions', session_deleted: 'sessions',
    room_opened: 'rooms', signin: 'people', profile_created: 'people', profile_changed: 'people', profile_deleted: 'people', account_linked: 'people', push_enabled: 'push', ledger_added: 'accounting', ledger_changed: 'accounting', ledger_deleted: 'accounting', ledger_file_added: 'accounting', ledger_file_deleted: 'accounting' };
  var SIGN_LABEL = { login: 'ورود', logout: 'خروج', user_signedup: 'ثبت‌نام', user_invited: 'دعوت', user_recovery_requested: 'درخواست بازیابی رمز', user_confirmation_requested: 'ایمیل تأیید' };
  var ROLE_FA = { counselor: 'مشاور', secretary: 'منشی', admin: 'مدیر' };

  function ago(ts) {
    if (!ts) return '—';
    var m = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
    if (m < 1) return 'همین حالا';
    if (m < 60) return n(m) + ' دقیقه پیش';
    if (m < 60 * 24) return n(Math.round(m / 60)) + ' ساعت پیش';
    return n(Math.round(m / 1440)) + ' روز پیش';
  }
  function stamp(ts) { return h('span', { class: 'stamp' }, dayNode(ts), ' · ' + timeOf(ts)); }
  function csvDownload(name, rows) {
    var body = rows.map(function (r) { return r.map(function (c) { c = String(c === null || c === undefined ? '' : c); return '"' + c.replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
    try {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['\ufeff' + body], { type: 'text/csv;charset=utf-8' }));
      a.download = name; document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { flash('err', 'ساخت فایل انجام نشد.'); render(); }
  }

  function loadMonitor() {
    var M = S.mon = S.mon || { sub: 'overview', group: '', q: '', limit: 200 };
    M.loading = true; M.err = null;
    var done = function () { M.loading = false; if (S.view === 'staff' && S.tab === 'monitor') render(); };
    if (M.sub === 'overview') {
      Promise.all([sb.rpc('staff_kpis'), sb.rpc('staff_counselor_stats'), sb.rpc('staff_daily', { p_days: 14 })]).then(function (r) {
        var bad = r.filter(function (x) { return x.error; })[0];
        if (bad) M.err = bad.error;
        M.kpi = (r[0].data && r[0].data[0]) || null; M.stats = r[1].data || []; M.daily = r[2].data || [];
        done();
      });
    } else if (M.sub === 'logins') {
      Promise.all([sb.rpc('staff_people'), sb.rpc('staff_signins', { p_limit: 300 }), sb.from('activity_log').select('*').eq('action', 'signin').order('at', { ascending: false }).limit(300)]).then(function (r) {
        if (r[0].error) M.err = r[0].error;
        M.people = r[0].data || []; M.signins = r[1].data || []; M.signinErr = r[1].error || null; M.panelSign = r[2].data || [];
        done();
      });
    } else {
      var q = sb.from('activity_log').select('*').order('at', { ascending: false }).limit(M.limit);
      var acts = Object.keys(GROUP_OF).filter(function (k) { return !M.group || GROUP_OF[k] === M.group; });
      if (M.group) q = q.in('action', acts);
      if (M.q) q = q.ilike('summary', '%' + M.q.replace(/[%_]/g, '') + '%');
      q.then(function (r) { if (r.error) M.err = r.error; M.log = r.data || []; done(); });
    }
  }

  function tMonitor() {
    var M = S.mon = S.mon || { sub: 'overview', group: '', q: '', limit: 200 };
    var subs = [['overview', 'نمای کلی'], ['logins', 'ورودها'], ['activity', 'گزارش فعالیت']];
    var bar = h('div', { class: 'subtabs', role: 'tablist' }, subs.map(function (t) {
      return h('button', { class: 'subtab', type: 'button', role: 'tab', 'aria-selected': M.sub === t[0] ? 'true' : 'false', onclick: function () { M.sub = t[0]; loadMonitor(); render(); } }, t[1]);
    }), h('button', { class: 'btn btn--small', type: 'button', text: 'تازه‌سازی', onclick: function () { loadMonitor(); render(); } }));
    var body;
    if (M.loading && !M.loaded) body = h('p', { class: 'empty', text: 'در حال بارگذاری…' });
    else if (M.err) body = h('p', { class: 'flash flash--err', text: /does not exist|Could not find|function/i.test(M.err.message || '') ? 'بخش پایش هنوز در پایگاه‌داده نصب نشده است (migration-08).' : explain(M.err) });
    else body = M.sub === 'overview' ? mOverview(M) : M.sub === 'logins' ? mLogins(M) : mActivity(M);
    if (M.sub === 'overview' ? M.kpi !== undefined : M.sub === 'logins' ? M.people !== undefined : M.log !== undefined) M.loaded = true;
    return h('div', null, bar, body);
  }

  function tile(label, value, note, cls) {
    return h('div', { class: 'tilekpi' + (cls ? ' ' + cls : '') }, h('b', { text: value }), h('span', { text: label }), note ? h('small', { text: note }) : null);
  }
  function mOverview(M) {
    var k = M.kpi || {};
    var sessions30 = (k.done_30 || 0) + (k.noshow_30 || 0);
    var rate = sessions30 ? Math.round((k.noshow_30 || 0) * 100 / sessions30) : 0;
    var tiles = h('div', { class: 'kpis' },
      tile('جلسهٔ امروز', n(k.today || 0)), tile('جلسهٔ ۷ روز آینده', n(k.upcoming_7d || 0)),
      tile('انجام‌شده، ۳۰ روز', n(k.done_30 || 0)), tile('غیبت مراجع، ۳۰ روز', n(k.noshow_30 || 0), sessions30 ? n(rate) + '٪ از جلسه‌های برگزارشده' : null, (k.noshow_30 || 0) ? 'warn' : ''),
      tile('لغو، ۳۰ روز', n(k.cancelled_30 || 0)), tile('پیش‌مشاورهٔ رایگان، ۳۰ روز', n(k.intro_30 || 0)),
      tile('اتاق باز', n(k.open_rooms || 0), null, (k.open_rooms || 0) ? 'live' : ''), tile('مشاور فعال', n(k.counselors || 0)),
      tile('هنوز وارد نشده', n(k.never_logged_in || 0), 'مشاور فعال با حساب', (k.never_logged_in || 0) ? 'warn' : ''));
    var d = M.daily || [], max = Math.max.apply(null, d.map(function (x) { return x.total; }).concat([1]));
    var chart = h('div', { class: 'bars', role: 'img', 'aria-label': 'جلسه‌ها در ۱۴ روز گذشته' }, d.map(function (x) {
      var dt = new Date(x.day + 'T12:00:00Z'), j = toJalali(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
      return h('div', { class: 'bar', title: np(j.jd) + ' ' + J_MONTHS[j.jm - 1] + ': ' + n(x.total) + ' جلسه' },
        h('i', { style: 'height:' + Math.round(x.total * 100 / max) + '%' }, h('u', { style: 'height:' + (x.total ? Math.round(x.done * 100 / x.total) : 0) + '%' })),
        h('span', { text: np(j.jd) }), h('em', { text: x.total ? n(x.total) : '' }));
    }));
    var rows = (M.stats || []).map(function (p) {
      var state = p.no_login ? ['chip chip--warn', 'بدون حساب ورود'] : (!p.last_sign_in_at ? ['chip chip--warn', 'هنوز وارد نشده'] : ['chip chip--ok', 'ورود: ' + ago(p.last_sign_in_at)]);
      return h('div', { class: 's' },
        h('div', { class: 's__head' }, h('div', { class: 's__time' }, p.full_name || 'بدون نام', h('small', { text: (ROLE_FA[p.role] || '') + (p.active ? '' : ' · غیرفعال') })),
          h('div', { class: 'chips' }, h('span', { class: state[0], text: state[1] }), h('span', { class: 'chip ' + (p.meet_set ? 'chip--ok' : 'chip--warn'), text: p.meet_set ? 'لینک اتاق دارد' : 'لینک اتاق ندارد' }),
            p.push_devices ? h('span', { class: 'chip chip--ok', text: 'اعلان گوشی ✓' }) : h('span', { class: 'chip', text: 'اعلان گوشی ندارد' }))),
        h('div', { class: 'nums' }, num('پیش‌رو', p.upcoming), num('انجام‌شده ۳۰ر', p.done_30), num('غیبت مراجع', p.noshow_30), num('لغو', p.cancelled_30),
          h('div', null, h('b', { text: p.last_room_at ? ago(p.last_room_at) : '—' }), h('span', { text: 'آخرین باز کردن اتاق' }))));
    });
    return h('div', null, tiles,
      h('section', { class: 'card' }, h('h2', { text: 'جلسه‌ها در ۱۴ روز گذشته' }), h('p', { class: 'hint', text: 'ستون روشن: همهٔ جلسه‌ها. بخش تیره: انجام‌شده.' }), chart),
      h('section', { class: 'card' }, h('h2', { text: 'مشاورها' }), h('p', { class: 'hint', text: 'وضعیت هر مشاور: ورود، لینک اتاق، اعلان گوشی و آمار ۳۰ روز اخیر.' }), rows.length ? rows : h('p', { class: 'empty', text: 'هنوز مشاوری نیست.' })));
  }
  function num(label, v) { return h('div', null, h('b', { text: n(v || 0) }), h('span', { text: label })); }

  function device(ua) {
    ua = ua || '';
    var os = /iPhone|iPad|iPod/.test(ua) ? 'آیفون/آیپد' : /Android/.test(ua) ? 'اندروید' : /Windows/.test(ua) ? 'ویندوز' : /Mac OS X|Macintosh/.test(ua) ? 'مک' : /Linux/.test(ua) ? 'لینوکس' : '';
    var br = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : '';
    return (os + (os && br ? ' · ' : '') + br) || 'دستگاه نامشخص';
  }
  function mLogins(M) {
    var people = (M.people || []).map(function (u) {
      var st = u.last_sign_in_at ? ['chip chip--ok', 'وارد شده'] : (u.confirmed ? ['chip chip--warn', 'ورود نکرده'] : ['chip chip--warn', 'دعوت‌شده، رمز نگذاشته']);
      return h('div', { class: 's' }, h('div', { class: 's__head' },
        h('div', { class: 's__time' }, u.full_name || 'بدون نام', h('small', null, ltr(u.email || ''), ' · ' + (ROLE_FA[u.role] || '—') + (u.active ? '' : ' · غیرفعال'))),
        h('div', { class: 'chips' }, h('span', { class: st[0], text: st[1] }))),
        h('div', { class: 'hint' }, u.last_sign_in_at ? ['آخرین ورود: ', stamp(u.last_sign_in_at), ' — ' + ago(u.last_sign_in_at)] : ['دعوت: ', u.invited_at ? stamp(u.invited_at) : '—']));
    });
    var ps = (M.panelSign || []).map(function (e) {
      return h('div', { class: 'logrow' }, stamp(e.at), h('b', { text: e.actor_name || '—' }), h('small', { text: device(e.meta && e.meta.ua) }));
    });
    var ev = (M.signins || []).map(function (e) {
      return h('div', { class: 'logrow' }, stamp(e.at), h('b', { text: SIGN_LABEL[e.action] || e.action }), ltr(e.email || ''), e.ip ? h('small', null, ltr(e.ip)) : null);
    });
    var exp = ev.length ? h('button', { class: 'btn btn--small', type: 'button', text: 'خروجی CSV', onclick: function () {
      csvDownload('hamnavaa-signins.csv', [['زمان (UTC)', 'رویداد', 'ایمیل', 'IP']].concat((M.signins || []).map(function (e) { return [e.at, SIGN_LABEL[e.action] || e.action, e.email, e.ip]; })));
    } }) : null;
    return h('div', null,
      h('section', { class: 'card' }, h('h2', { text: 'افراد و آخرین ورود' }), people.length ? people : h('p', { class: 'empty', text: 'کسی نیست.' })),
      h('section', { class: 'card' }, h('h2', { text: 'ورودهای ثبت‌شده در پنل' }),
        h('p', { class: 'hint', text: 'هر بار که کسی (در یک مرورگر یا اپ تازه) وارد پنل می‌شود، با ساعت و نوع دستگاه ثبت می‌شود. ساعت‌ها به وقت ایران است.' }),
        ps.length ? ps : h('p', { class: 'empty', text: 'هنوز ورودی ثبت نشده؛ از این به بعد ثبت می‌شود.' })),
      h('section', { class: 'card' }, h('h2', { text: 'رویدادهای سامانهٔ احراز هویت' }),
        h('p', { class: 'hint', text: 'ورود، خروج و دعوت‌ها، از گزارش داخلی سامانهٔ احراز هویت. ساعت‌ها به وقت ایران است.' }), exp,
        M.signinErr ? h('p', { class: 'hint', text: 'گزارش رویدادها در دسترس نیست؛ فقط «آخرین ورود» بالا نمایش داده می‌شود.' }) : (ev.length ? ev : h('p', { class: 'empty', text: 'رویدادی ثبت نشده.' }))));
  }

  function mActivity(M) {
    var group = h('select', { class: 'select', 'aria-label': 'نوع' }, Object.keys(ACTION_GROUPS).map(function (k) { return h('option', { value: k, text: ACTION_GROUPS[k], selected: M.group === k }); }));
    var q = h('input', { class: 'input', type: 'search', placeholder: 'جست‌وجو در شرح (نام مشاور، مراجع…)', value: M.q || '', 'aria-label': 'جست‌وجو' });
    var go = function () { M.group = group.value; M.q = q.value.trim(); M.limit = 200; loadMonitor(); render(); };
    group.addEventListener('change', go);
    q.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    var rows = (M.log || []).map(function (e) {
      var when = e.meta && e.meta.starts_at ? ['برای ', stamp(e.meta.starts_at)] : null;
      var del = e.action === 'session_deleted' && e.meta && e.meta.kind;           // حذف جلسه: نوع و دلیل
      var main = del && e.meta.kind !== 'intro';
      var label = del ? (main ? 'حذف مشاورهٔ اصلی' : 'حذف پیش‌مشاوره') : (ACTIONS[e.action] || e.action);
      return h('div', { class: 'logrow logrow--act' }, stamp(e.at), h('span', { class: 'chip' + (main ? ' chip--warn' : del ? ' chip--gold' : ''), text: label }),
        h('div', { class: 'logtxt' }, e.summary, when ? h('small', null, when) : null,
          main ? h('small', { text: 'دلیل حذف: ' + (e.meta.reason || 'ثبت نشده') }) : null,
          h('small', { text: 'توسط ' + (e.actor_name || '—') })));
    });
    var more = (M.log || []).length >= M.limit ? h('div', { class: 'actions' }, h('button', { class: 'btn btn--small', type: 'button', text: 'نمایش قدیمی‌تر', onclick: function () { M.limit += 200; loadMonitor(); render(); } })) : null;
    return h('section', { class: 'card' }, h('h2', { text: 'گزارش فعالیت' }),
      h('p', { class: 'hint', text: 'هر کار مهم خودکار ثبت می‌شود و قابل ویرایش یا حذف نیست: جلسه‌ها، اتاق‌ها، تغییر افراد و اعلان‌ها. شمارهٔ مراجع در این گزارش نیست.' }),
      h('div', { class: 'row' }, h('div', { class: 'field' }, h('label', { text: 'نوع' }), group), h('div', { class: 'field' }, h('label', { text: 'جست‌وجو' }), q)),
      h('div', { class: 'actions' }, h('button', { class: 'btn btn--primary btn--small', type: 'button', text: 'اعمال', onclick: go }),
        (M.log || []).length ? h('button', { class: 'btn btn--small', type: 'button', text: 'خروجی CSV', onclick: function () {
          csvDownload('hamnavaa-activity.csv', [['زمان (UTC)', 'نوع', 'شرح', 'توسط']].concat((M.log || []).map(function (e) { return [e.at, ACTIONS[e.action] || e.action, e.summary, e.actor_name]; })));
        } }) : null),
      rows.length ? rows : h('p', { class: 'empty', text: 'موردی پیدا نشد.' }), more);
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
