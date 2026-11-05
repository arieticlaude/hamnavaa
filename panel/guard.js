/* هم‌نوا — پنل: «نگهبان» بارگذاری. فقط ES5 است تا روی مرورگرهای قدیمی موبایل هم اجرا شود.
   ۱) فرمان‌هایی که مرورگرهای قدیمی ندارند را جایگزین می‌کند (replaceChildren).
   ۲) اگر پنل بعد از چند ثانیه هنوز روی «در حال بارگذاری…» ماند، به‌جای انتظار بی‌پایان، دلیل محتمل و چند دکمهٔ کمکی نشان می‌دهد.
   ۳) خطای اجرای جاوااسکریپت را، اگر پنل باز نشده باشد، روی صفحه می‌نویسد تا قابل گزارش باشد. */
(function () {
  'use strict';
  try {
    if (typeof Element !== 'undefined' && !Element.prototype.replaceChildren) {
      Element.prototype.replaceChildren = function () {
        while (this.firstChild) this.removeChild(this.firstChild);
        for (var i = 0; i < arguments.length; i++) {
          var n = arguments[i];
          this.appendChild(typeof n === 'string' ? document.createTextNode(n) : n);
        }
      };
    }
  } catch (e) { /* بدون جایگزین هم ادامه می‌دهیم */ }

  var lastError = '';
  function stuck() { return !!document.querySelector('#app .boot'); }

  function clearOldLogin() {
    try {
      var ks = [];
      for (var i = 0; i < localStorage.length; i++) ks.push(localStorage.key(i));
      ks.forEach(function (k) { if (/^sb-|supabase/i.test(k)) localStorage.removeItem(k); });
    } catch (e) { /* حافظه در دسترس نیست */ }
    try { sessionStorage.clear(); } catch (e2) { /* مهم نیست */ }
  }

  function el(tag, text, css) {
    var e = document.createElement(tag);
    if (text) e.textContent = text;
    if (css) e.style.cssText = css;
    return e;
  }
  function btn(label, fn, primary) {
    var b = el('button', label, 'font:inherit;font-weight:700;padding:10px 16px;margin:6px;border-radius:12px;cursor:pointer;border:1px solid #3A6259;'
      + (primary ? 'background:#3A6259;color:#fff' : 'background:#fff;color:#163932'));
    b.type = 'button';
    b.onclick = fn;
    return b;
  }

  function show() {
    if (!stuck() || document.getElementById('guard')) return;
    var box = el('div', '', 'max-width:460px;margin:18px auto;padding:16px;border-radius:16px;background:#fff;border:1px solid rgba(27,43,38,.15);text-align:center;line-height:1.9;font-size:15px');
    box.id = 'guard';
    box.appendChild(el('b', 'پنل دیر باز می‌شود.', 'display:block;font-size:17px;color:#163932'));
    box.appendChild(el('p', lastError
      ? 'مرورگر شما هنگام اجرای پنل خطا داد: ' + lastError
      : 'معمولاً یعنی اتصال به سرور داده کند یا از این شبکه بسته است (روی بعضی اپراتورهای موبایل پیش می‌آید).', 'margin:6px 0 10px;color:#55655E'));
    box.appendChild(btn('تلاش دوباره', function () { location.reload(); }, true));
    box.appendChild(btn('پاک‌کردن ورود قبلی و دوباره', function () { clearOldLogin(); location.reload(); }));
    var a = el('a', 'عیب‌یابی اتصال (نتیجه را برای مدیر بفرستید)', 'display:block;margin-top:10px;color:#3A6259;font-weight:700');
    a.href = 'diag.html';
    box.appendChild(a);
    box.appendChild(el('p', 'اگر با فیلترشکن باز می‌شود، به مدیر بگویید.', 'margin:10px 0 0;font-size:13px;color:#7a8a83'));
    var app = document.getElementById('app');
    if (app) app.appendChild(box);
  }

  window.addEventListener('error', function (ev) {
    try { lastError = String((ev && ev.message) || '').slice(0, 160); } catch (e) { lastError = ''; }
    setTimeout(show, 1200);
  });
  setTimeout(show, 8000);
  setTimeout(show, 20000);
})();
