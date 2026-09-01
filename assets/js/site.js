(function(){
  // shared motion flags: honor prefers-reduced-motion, and fall back gracefully
  // if the GSAP CDN failed to load (e.g. offline use of this file)
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasGsap = !reduceMotion && typeof gsap !== 'undefined';

  // hero entrance animation (home hero is always visible on load, so this
  // plays once immediately rather than being scroll-triggered)
  if (hasGsap) {
    gsap.timeline({ defaults:{ ease:'power2.out', duration:0.7 } })
      .fromTo('.hero .eyebrow', { opacity:0, y:14 }, { opacity:1, y:0 })
      .fromTo('.hero h1', { opacity:0, y:18 }, { opacity:1, y:0 }, '-=0.45')
      .fromTo('.hero p.lead', { opacity:0, y:16 }, { opacity:1, y:0 }, '-=0.45')
      .fromTo('.hero__ctas', { opacity:0, y:14 }, { opacity:1, y:0 }, '-=0.4')
      .fromTo('.hero__tags a', { opacity:0, y:10 }, { opacity:1, y:0, stagger:0.05 }, '-=0.35')
      .fromTo('.trust-strip', { opacity:0, y:12 }, { opacity:1, y:0 }, '-=0.3')
      .fromTo('.hero__visual', { opacity:0, y:20, scale:0.94 }, { opacity:1, y:0, scale:1, duration:0.8 }, '-=0.9');
  }

  // subtle scroll parallax on the decorative hero blobs only (never on text/
  // controls). Moves the whole blob cluster together so it never fights the
  // blobs' own CSS drift animation on the individual spans. Plain scroll +
  // rAF throttle, no ScrollTrigger needed for a one-element effect this small.
  if (hasGsap) {
    const heroBlobs = document.querySelector('.hero__blobs');
    if (heroBlobs) {
      let parallaxQueued = false;
      const applyHeroParallax = () => {
        gsap.to(heroBlobs, { y: window.scrollY * 0.08, duration: 0.6, ease: 'power1.out', overwrite: 'auto' });
        parallaxQueued = false;
      };
      window.addEventListener('scroll', () => {
        if (!parallaxQueued) { requestAnimationFrame(applyHeroParallax); parallaxQueued = true; }
      }, { passive: true });
    }
  }

  // ambient rotating wireframe globe behind the hero (decorative, non-interactive;
  // skipped entirely if the three.js CDN failed to load, e.g. offline use of this file)
  (function initHeroGlobe(){
    const mount = document.getElementById('heroGlobe');
    if (!mount || typeof THREE === 'undefined') return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    camera.position.z = 3.4;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    mount.appendChild(renderer.domElement);

    // mount can still be 0x0 on first layout pass (e.g. web-font reflow not yet
    // settled); resize() re-reads clientWidth/Height each call, and load/resize
    // listeners below keep it correct once real layout is available
    function resize(){
      const w = mount.clientWidth, h = mount.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      // pull the camera back on narrow viewports so the globe reads as a
      // smaller, calmer background element instead of dominating the tall
      // stacked mobile hero
      camera.position.z = w < 640 ? 5.8 : 3.4;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    resize();

    const group = new THREE.Group();
    group.rotation.z = THREE.MathUtils.degToRad(23.4); // fixed axial tilt, like Earth's — the group then only spins around its own Y axis, not tumbled on multiple axes
    const shells = [
      { radius: 1, color: 0x3A6259, opacity: 0.5 }  // --teal
    ];
    shells.forEach(({ radius, color, opacity }) => {
      const geometry = new THREE.SphereGeometry(radius, 24, 18);
      const material = new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity });
      group.add(new THREE.Mesh(geometry, material));
    });
    scene.add(group);

    // ---- Iran marker + incoming "contact" arcs from random points across the
    // globe converging on Iran (normal alpha blending: this canvas sits over a
    // light cream background, and additive blending washes light colors toward
    // white on light backgrounds instead of making them pop) ----
    const GLOBE_RADIUS = 1; // markers/arcs sit on the inner wireframe shell
    const IRAN = { lat: 32.4279, lon: 53.6880 };

    function latLonToVector3(lat, lon, radius){
      const phi = (90 - lat) * Math.PI / 180;
      const theta = (lon + 180) * Math.PI / 180;
      return new THREE.Vector3(
        -radius * Math.sin(phi) * Math.cos(theta),
         radius * Math.cos(phi),
         radius * Math.sin(phi) * Math.sin(theta)
      );
    }

    // one soft radial-gradient dot, reused (tinted per-instance) for every marker/ping
    const glowTexture = (() => {
      const size = 64;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      const g = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.4, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      return new THREE.CanvasTexture(c);
    })();

    function makeGlowSprite(colorHex, scale, opacity){
      const material = new THREE.SpriteMaterial({
        map: glowTexture, color: colorHex, transparent: true, opacity,
        depthWrite: false
      });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(scale, scale, 1);
      return sprite;
    }

    function hexToRgba(hex, alpha){
      const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
      return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }

    // white badge + stroked phone-handset glyph (same line-icon language as the
    // rest of the site, e.g. the hero call-card), used as the "calls land here" pin
    function makePhoneMarkerTexture(colorHex){
      const size = 128;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');

      const glow = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
      glow.addColorStop(0, hexToRgba(colorHex, 0.4));
      glow.addColorStop(1, hexToRgba(colorHex, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, size, size);

      ctx.beginPath();
      ctx.arc(size/2, size/2, size*0.3, 0, Math.PI*2);
      ctx.fillStyle = '#FDFBF5';
      ctx.fill();
      ctx.lineWidth = size*0.02;
      ctx.strokeStyle = hexToRgba(colorHex, 0.9);
      ctx.stroke();

      const iconSize = size*0.32, scale = iconSize/24;
      ctx.save();
      ctx.translate(size/2 - iconSize/2, size/2 - iconSize/2);
      ctx.scale(scale, scale);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = hexToRgba(colorHex, 1);
      const phonePath = new Path2D('M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z');
      ctx.stroke(phonePath);
      ctx.restore();

      return new THREE.CanvasTexture(canvas);
    }

    const CONNECT_GREEN_LIGHT = 0x4CAF7D; // arc/origin — lines connecting in
    const CONNECT_GREEN_DEEP  = 0x1E6F4A; // arc end / phone marker / ping — the answered call

    const MAP_RADIUS = GLOBE_RADIUS * 1.008; // slightly proud of the wireframe sphere, avoids z-fighting
    const iranPos = latLonToVector3(IRAN.lat, IRAN.lon, MAP_RADIUS);
    const iranMarker = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makePhoneMarkerTexture(CONNECT_GREEN_DEEP), transparent: true, opacity: 1, depthWrite: false
    }));
    iranMarker.scale.set(0.24, 0.24, 1);
    iranMarker.position.copy(iranPos);
    group.add(iranMarker);

    let iranOutline = null; // populated once the real border geometry has loaded

    function extractOuterRing(geometry){
      if (!geometry) return null;
      if (geometry.type === 'Polygon') return geometry.coordinates[0];
      if (geometry.type === 'MultiPolygon'){
        return geometry.coordinates.reduce(function(best, poly){
          return poly[0].length > best.length ? poly[0] : best;
        }, geometry.coordinates[0][0]);
      }
      return null;
    }

    // trace Iran's real border onto the globe, fetched live from a public GeoJSON
    // source (~60-point simplified polygon); silently keeps the plain marker
    // above as a fallback if this is ever offline/blocked (e.g. opened locally
    // without a network connection)
    fetch('https://raw.githubusercontent.com/johan/world.geo.json/master/countries/IRN.geo.json')
      .then(function(res){ return res.json(); })
      .then(function(geo){
        const ring = extractOuterRing(geo && geo.features && geo.features[0] && geo.features[0].geometry);
        if (!ring || ring.length < 3) return;

        // recenter the marker/arcs on the polygon's arithmetic centroid instead
        // of the hand-picked approximate point used before this loaded
        const uniquePts = ring.slice(0, -1);
        let sumLon = 0, sumLat = 0;
        uniquePts.forEach(function(p){ sumLon += p[0]; sumLat += p[1]; });
        iranPos.copy(latLonToVector3(sumLat / uniquePts.length, sumLon / uniquePts.length, MAP_RADIUS));
        iranMarker.position.copy(iranPos);

        const outlinePoints = ring.map(function(p){ return latLonToVector3(p[1], p[0], MAP_RADIUS); });
        const geometry = new THREE.BufferGeometry().setFromPoints(outlinePoints);
        const material = new THREE.LineBasicMaterial({ color: 0x9C4A44, transparent: true, opacity: 0.95, depthWrite: false });
        iranOutline = new THREE.LineLoop(geometry, material);
        group.add(iranOutline);
      })
      .catch(function(){ /* offline or blocked — the plain marker above still works fine */ });

    // fully random origin each time, anywhere on the globe (excluding a ring
    // around Iran itself so arcs are never degenerately short)
    function randomOriginPoint(){
      let pos, angle;
      do {
        const lat = Math.random() * 150 - 70;
        const lon = Math.random() * 360 - 180;
        pos = latLonToVector3(lat, lon, GLOBE_RADIUS);
        angle = pos.angleTo(iranPos);
      } while (angle < 0.5);
      return pos;
    }

    const ARC_SEGMENTS = 48;
    const arcColorStart = new THREE.Color(CONNECT_GREEN_LIGHT);
    const arcColorEnd = new THREE.Color(CONNECT_GREEN_DEEP);
    const activeArcs = [];
    const activePings = [];
    let spawnTimer = 0;

    function spawnConnection(){
      if (activeArcs.length >= 4) return;
      const p1 = randomOriginPoint(), p2 = iranPos;
      const angle = p1.angleTo(p2);
      const lift = GLOBE_RADIUS * (0.25 + angle * 0.22);
      const mid = p1.clone().add(p2).normalize().multiplyScalar(GLOBE_RADIUS + lift);
      const points = new THREE.CatmullRomCurve3([p1, mid, p2]).getPoints(ARC_SEGMENTS);

      const colors = [];
      for (let i = 0; i <= ARC_SEGMENTS; i++){
        const c = arcColorStart.clone().lerp(arcColorEnd, i / ARC_SEGMENTS);
        colors.push(c.r, c.g, c.b);
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.setDrawRange(0, 0);
      const material = new THREE.LineBasicMaterial({
        vertexColors: true, transparent: true, opacity: 1, depthWrite: false
      });
      const line = new THREE.Line(geometry, material);
      group.add(line);

      const originMarker = makeGlowSprite(CONNECT_GREEN_LIGHT, 0.08, 0);
      originMarker.position.copy(p1);
      group.add(originMarker);

      activeArcs.push({ line, geometry, material, originMarker, phase: 'growing', t: 0, pinged: false });
    }

    function spawnPing(){
      const sprite = makeGlowSprite(CONNECT_GREEN_DEEP, 0.06, 0.85);
      sprite.position.copy(iranPos);
      group.add(sprite);
      activePings.push({ sprite, t: 0 });
    }

    function updateConnections(dt){
      spawnTimer += dt;
      if (spawnTimer > 0.9 && activeArcs.length < 4){ spawnConnection(); spawnTimer = 0; }

      for (let i = activeArcs.length - 1; i >= 0; i--){
        const c = activeArcs[i];
        c.t += dt;
        if (c.phase === 'growing'){
          const progress = Math.min(c.t / 1.1, 1);
          c.geometry.setDrawRange(0, Math.floor(progress * (ARC_SEGMENTS + 1)));
          c.originMarker.material.opacity = progress * 0.9;
          if (progress >= 1){
            c.phase = 'holding'; c.t = 0;
            if (!c.pinged){ spawnPing(); c.pinged = true; }
          }
        } else if (c.phase === 'holding'){
          if (c.t > 0.5){ c.phase = 'fading'; c.t = 0; }
        } else {
          const progress = Math.min(c.t / 0.9, 1);
          c.material.opacity = 1 - progress;
          c.originMarker.material.opacity = 0.9 * (1 - progress);
          if (progress >= 1){
            group.remove(c.line);
            group.remove(c.originMarker);
            c.geometry.dispose(); c.material.dispose(); c.originMarker.material.dispose();
            activeArcs.splice(i, 1);
          }
        }
      }

      for (let i = activePings.length - 1; i >= 0; i--){
        const p = activePings[i];
        p.t += dt;
        const progress = Math.min(p.t / 1.2, 1);
        const scale = 0.06 + progress * 0.32;
        p.sprite.scale.set(scale, scale, 1);
        p.sprite.material.opacity = 0.85 * (1 - progress);
        if (progress >= 1){
          group.remove(p.sprite);
          p.sprite.material.dispose();
          activePings.splice(i, 1);
        }
      }
    }

    const rotationSpeed = 0.0015;
    const clock = new THREE.Clock();
    let elapsed = 0;
    let frameId = null;
    function animate(){
      frameId = requestAnimationFrame(animate);
      const dt = clock.getDelta();
      if (!reduceMotion) {
        elapsed += dt;
        group.rotation.y += rotationSpeed; // spin only around the tilted polar axis, like real Earth rotation
        updateConnections(dt);
        iranMarker.material.opacity = 0.85 + Math.sin(elapsed * 2) * 0.15;
        const phonePulse = 0.24 * (1 + Math.sin(elapsed * 2) * 0.06);
        iranMarker.scale.set(phonePulse, phonePulse, 1);
        if (iranOutline) iranOutline.material.opacity = 0.78 + Math.sin(elapsed * 1.4) * 0.17;
      }
      renderer.render(scene, camera);
    }
    animate();

    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('load', resize);
    if (window.ResizeObserver) new ResizeObserver(resize).observe(mount);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (frameId) cancelAnimationFrame(frameId); frameId = null; }
      else if (!frameId) { animate(); }
    });
  })();

  // header scroll shadow + back-to-top visibility
  const header = document.querySelector('.site-header');
  const backToTop = document.getElementById('backToTop');
  const onScroll = () => {
    if (header) header.classList.toggle('is-scrolled', window.scrollY > 12);
    if (backToTop) backToTop.classList.toggle('is-visible', window.scrollY > 480);
  };
  window.addEventListener('scroll', onScroll, { passive:true });
  onScroll();
  if (backToTop) backToTop.addEventListener('click', () => window.scrollTo({ top:0, behavior:'smooth' }));

  // ---------- Navigation ----------
  // Each page is its own document now, so there is no client-side routing left.
  // What remains: mark the current page in the nav, and make same-page anchors
  // scroll smoothly instead of reloading.
  //
  // Links between pages are relative ("services/index.html", "../about/index.html")
  // so the site also works opened straight from disk over file://, where a leading
  // "/" would point at the root of the drive. That means we cannot identify the
  // current page by comparing href strings — the same page is reached by different
  // relative paths depending on where you are. Each nav link carries data-page
  // instead, matched against the folder we are actually in.
  // 'pricing' is not here any more — it is its own page now, not a homepage anchor.
  const HOME_ANCHORS = ['process','faq','request','benefits','intro'];

  function currentPage(){
    const parts = location.pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1] || '';
    // .../services/index.html -> "services";  .../index.html or / -> "home"
    const dir = /\.html?$/i.test(last) ? parts[parts.length - 2] : last;
    const KNOWN = ['services','about','counselors','tests','reviews','pricing'];
    return KNOWN.includes(dir) ? dir : 'home';
  }

  (function setActiveNav(){
    const here = currentPage();
    document.querySelectorAll('.nav__links a[data-page]').forEach(a => {
      a.classList.toggle('is-active',
        a.dataset.page === here && !a.classList.contains('btn'));
    });
  })();

  function scrollToAnchor(id, instant){
    const target = document.getElementById(id);
    if (!target) return false;
    requestAnimationFrame(() => {
      const top = target.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top, behavior: instant ? 'auto' : 'smooth' });
    });
    return true;
  }

  document.addEventListener('click', e => {
    const link = e.target.closest('a[data-link], a[href*="#"]');
    if (!link) return;
    const href = link.getAttribute('href') || '';
    if (!href.includes('#') || link.target === '_blank') return;
    const [path, hash] = href.split('#');
    if (!hash) return;
    // Only hijack a link that stays on this page. A bare "#faq" always does;
    // anything with a path in front of it ("../index.html#faq") is a real
    // navigation and must be left alone so the browser follows it.
    if (path) return;
    if (!document.getElementById(hash)) return;
    e.preventDefault();
    scrollToAnchor(hash);
    try { history.replaceState(null, '', '#' + hash); } catch (err) {}
    const nl = document.getElementById('navLinks');
    if (nl) nl.classList.remove('is-open');
  });

  // honour a #hash on first load (e.g. someone lands on /#pricing)
  if (location.hash.length > 1){
    const id = location.hash.slice(1);
    if (HOME_ANCHORS.includes(id) || document.getElementById(id)) scrollToAnchor(id, true);
  }

  // language toggle
  const root = document.documentElement;
  const langButtons = document.querySelectorAll('.lang-toggle__btn');
  // Per-page titles/descriptions are declared in each document's <head> as
  // window.PAGE_I18N, so switching language updates the real SEO metadata too.
  const META = window.PAGE_I18N || { title:{}, desc:{} };
  function setLanguage(lang, opts){
    opts = opts || {};
    root.setAttribute('data-lang', lang);
    root.setAttribute('lang', lang);
    root.setAttribute('dir', lang === 'en' ? 'ltr' : 'rtl');
    if (META.title && META.title[lang]) document.title = META.title[lang];
    const d = document.querySelector('meta[name="description"]');
    if (d && META.desc && META.desc[lang]) d.setAttribute('content', META.desc[lang]);
    // keep the URL in sync so an English page can be linked to, shared and indexed
    if (!opts.initial){
      try {
        const u = new URL(location.href);
        if (lang === 'en') u.searchParams.set('lang', 'en'); else u.searchParams.delete('lang');
        history.replaceState(null, '', u.pathname + u.search + u.hash);
      } catch (err) {}
    }
    langButtons.forEach(b => b.classList.toggle('is-active', b.dataset.setLang === lang));
    const navToggleBtn = document.getElementById('navToggle');
    if (navToggleBtn) navToggleBtn.setAttribute('aria-label', lang === 'en' ? 'Open menu' : 'باز کردن منو');
    document.querySelectorAll('.faq-item.is-open .faq-item__a').forEach(a => {
      a.style.maxHeight = a.scrollHeight + 'px';
    });
    document.querySelectorAll('.stats-band .stat').forEach(el => {
      const val = el.dataset.done === 'true' ? parseInt(el.dataset.target, 10) : 0;
      renderStat(el, val);
    });
    labelSelectedCards();
    // Illustrations describe themselves in whichever language is showing. alt is a
    // plain attribute, so it cannot hold the two <span> twins the rest of the page
    // uses — the two readings ride along as data attributes instead. The Persian
    // one is already in the markup, so this still reads correctly without JS.
    document.querySelectorAll('img[data-alt-fa]').forEach(im => {
      const t = lang === 'en' ? im.dataset.altEn : im.dataset.altFa;
      if (t) im.setAttribute('alt', t);
    });

    // The date and time widgets render locale-formatted text nodes rather than
    // the usual fa/en span pair, so they have to be redrawn rather than toggled.
    buildDayPickers();
    buildTimePickers();
    // anything else that paints its own text (the chess panel) listens for this
    // rather than being called by name from here
    document.dispatchEvent(new CustomEvent('hamnava:lang', { detail: { lang: lang } }));
  }
  langButtons.forEach(btn => btn.addEventListener('click', () => setLanguage(btn.dataset.setLang)));

  // apply ?lang=en on load — this is the URL Google is told about via hreflang
  (function initLanguage(){
    let lang = 'fa';
    try { if (new URL(location.href).searchParams.get('lang') === 'en') lang = 'en'; } catch (e) {}
    if (lang === 'en') setLanguage('en', { initial:true });
  })();

  // mobile nav toggle
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  navToggle.addEventListener('click', () => {
    const open = navLinks.classList.toggle('is-open');
    navToggle.setAttribute('aria-expanded', open);
  });
  navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
    navLinks.classList.remove('is-open');
    navToggle.setAttribute('aria-expanded', 'false');
  }));

  // call timer
  const toPersianDigits = n => n.toString().padStart(2,'0').replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
  const faDigits = n => n.toString().replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
  let seconds = 0;
  const timerEl = document.getElementById('callTimer');
  if (timerEl) setInterval(() => {
    seconds++;
    const m = Math.floor(seconds/60) % 60;
    const s = seconds % 60;
    timerEl.textContent = toPersianDigits(m) + ':' + toPersianDigits(s);
  }, 1000);

  // stats band counter animation
  const statEls = document.querySelectorAll('.stats-band .stat');
  function renderStat(el, value){
    const lang = document.documentElement.getAttribute('data-lang');
    const prefix = (lang === 'en' ? el.dataset.prefixEn : el.dataset.prefixFa) || '';
    const suffix = (lang === 'en' ? el.dataset.suffixEn : el.dataset.suffixFa) || '';
    const num = lang === 'en' ? value : faDigits(value);
    el.querySelector('.stat__num').textContent = prefix + num + suffix;
  }
  function computeLiveTarget(el){
    // stats can optionally auto-grow by a fixed amount per real calendar day
    // since a given anchor date, so a base count like "sessions held" keeps
    // climbing on its own once the site is live, with no backend needed
    const base = parseInt(el.dataset.target, 10);
    const growth = parseInt(el.dataset.dailyGrowth, 10);
    if (!growth || !el.dataset.anchorDate) return base;
    const anchor = new Date(el.dataset.anchorDate + 'T00:00:00');
    const daysElapsed = Math.max(0, Math.floor((Date.now() - anchor.getTime()) / 86400000));
    return base + growth * daysElapsed;
  }
  function animateStat(el){
    const target = computeLiveTarget(el);
    if (reduceMotion){
      renderStat(el, target);
      el.dataset.done = 'true';
      return;
    }
    if (hasGsap){
      const proxy = { v: 0 };
      gsap.to(proxy, {
        v: target, duration: 1.4, ease: 'power3.out',
        onUpdate: () => renderStat(el, Math.round(proxy.v)),
        onComplete: () => { el.dataset.done = 'true'; }
      });
      return;
    }
    const duration = 1200;
    const start = performance.now();
    function tick(now){
      const progress = Math.min((now - start) / duration, 1);
      const value = Math.round(target * (1 - Math.pow(1 - progress, 3)));
      renderStat(el, value);
      if (progress < 1) requestAnimationFrame(tick);
      else el.dataset.done = 'true';
    }
    requestAnimationFrame(tick);
  }
  statEls.forEach(el => renderStat(el, 0));
  const statsBandEl = document.getElementById('statsBand');
  if (statsBandEl && 'IntersectionObserver' in window) {
    const statsObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          statEls.forEach(animateStat);
          statsObserver.disconnect();
        }
      });
    }, { threshold: 0.4 });
    statsObserver.observe(statsBandEl);
  }

  // ---------- Testimonials ----------
  const testimonials = [
    { name_fa:"مریم", name_en:"Maryam", r:5, fa:"صحبت کردن با دکتر فتاحی واقعاً به آرامش ذهنم کمک کرد. حس کردم بدون قضاوت گوش می‌دهد.", en:"Talking with Dr. Fattahi truly helped calm my mind. I felt genuinely heard, without judgment." },
    { name_fa:"علی", name_en:"Ali", r:5, fa:"جلسه‌ی تلفنی خیلی راحت‌تر از چیزی بود که فکر می‌کردم؛ نیازی به حضور حضوری نبود و همین خیلی کمک کرد.", en:"The phone session was easier than I expected — not needing to go anywhere made a real difference." },
    { name_fa:"نگار", name_en:"Negar", r:5, fa:"هماهنگی زمان تماس سریع انجام شد و در طول جلسه احساس امنیت و آرامش کامل داشتم.", en:"Scheduling was quick, and throughout the session I felt completely safe and at ease." },
    { name_fa:"سینا", name_en:"Sina", r:5, fa:"بعد از مدت‌ها تونستم درباره‌ی چیزی که اذیتم می‌کرد حرف بزنم. واقعاً سبک شدم.", en:"After a long time, I was finally able to talk about what was bothering me. I felt lighter." },
    { name_fa:"الهام", name_en:"Elham", r:4, fa:"فضای جلسه خیلی محترمانه بود. حس کردم حرف‌هام جدی گرفته می‌شه.", en:"The session felt very respectful. I felt my words were taken seriously." },
    { name_fa:"رضا", name_en:"Reza", r:5, fa:"جلسه‌ی آشنایی رایگان کمک کرد بدون استرس تصمیم بگیرم ادامه بدم.", en:"The free intro call helped me decide to continue without any pressure." },
    { name_fa:"شیما", name_en:"Shima", r:5, fa:"اینکه تلفنی بود باعث شد راحت‌تر و صادقانه‌تر صحبت کنم.", en:"Being on the phone made it easier for me to speak openly and honestly." },
    { name_fa:"امیر", name_en:"Amir", r:5, fa:"راهکارهایی که گرفتم خیلی عملی بودن و تو زندگی روزمره‌ام به کار اومدن.", en:"The guidance I received was practical and useful in my daily life." },
    { name_fa:"فاطمه", name_en:"Fatemeh", r:5, fa:"از اولین تماس تا پایان جلسه، همه‌چیز با آرامش و احترام پیش رفت.", en:"From the first call to the end of the session, everything went calmly and respectfully." },
    { name_fa:"حسین", name_en:"Hossein", r:4, fa:"کمکم کرد افکارم رو منظم‌تر کنم و دیدم نسبت به مشکلم عوض شد.", en:"It helped me organize my thoughts and changed how I saw my problem." },
    { name_fa:"زهرا", name_en:"Zahra", r:5, fa:"محرمانه بودن جلسه برام خیلی مهم بود و کاملاً رعایت شد.", en:"Confidentiality mattered a lot to me, and it was fully respected." },
    { name_fa:"کاوه", name_en:"Kaveh", r:5, fa:"دکتر فتاحی با حوصله گوش داد و اصلاً حس عجله نداشتم.", en:"Dr. Fattahi listened patiently — I never felt rushed at all." },
    { name_fa:"سحر", name_en:"Sahar", r:5, fa:"مشاوره‌ی پیش از ازدواج‌مون خیلی به درک بهتر همدیگه کمک کرد.", en:"Our premarital counseling really helped us understand each other better." },
    { name_fa:"بابک", name_en:"Babak", r:4, fa:"انتظار نداشتم یک تماس تلفنی این‌قدر آرامش‌بخش باشه.", en:"I didn't expect a phone call to be this calming." },
    { name_fa:"مینا", name_en:"Mina", r:5, fa:"بعد از جلسه احساس کردم تنها نیستم و یکی واقعاً درکم می‌کنه.", en:"After the session I felt I wasn't alone and that someone truly understood me." },
    { name_fa:"پویا", name_en:"Pouya", r:5, fa:"روند کار خیلی شفاف بود و دقیقاً می‌دونستم چه انتظاری داشته باشم.", en:"The process was very clear and I knew exactly what to expect." },
    { name_fa:"لیلا", name_en:"Leila", r:5, fa:"برای منی که وقت رفت‌وآمد ندارم، مشاوره‌ی تلفنی یه نعمت بود.", en:"For someone with no time to commute, phone counseling was a blessing." },
    { name_fa:"آرش", name_en:"Arash", r:4, fa:"کمکم کرد با اضطرابم کنار بیام و تکنیک‌های مفیدی یاد گرفتم.", en:"It helped me cope with my anxiety and I learned useful techniques." },
    { name_fa:"نسرین", name_en:"Nasrin", r:5, fa:"احساس کردم بدون اینکه قضاوت بشم می‌تونم هر چیزی رو بگم.", en:"I felt I could say anything without being judged." },
    { name_fa:"مهدی", name_en:"Mehdi", r:5, fa:"پاسخگویی سریع بود و خیلی زود تونستم جلسه‌ام رو بگیرم.", en:"The response was fast and I could book my session very quickly." },
    { name_fa:"ترانه", name_en:"Taraneh", r:5, fa:"حس کردم برای اولین بار کسی واقعاً به حرف‌هام اهمیت می‌ده.", en:"For the first time, I felt someone really cared about what I had to say." },
    { name_fa:"سعید", name_en:"Saeed", r:4, fa:"جلسه‌ی زوجین‌مون کمک کرد بهتر با هم گفت‌وگو کنیم.", en:"Our couples session helped us communicate better." },
    { name_fa:"رویا", name_en:"Roya", r:5, fa:"آرامشی که تو صدای مشاور بود از همون اول بهم اطمینان داد.", en:"The calm in the counselor's voice reassured me from the very start." },
    { name_fa:"فرهاد", name_en:"Farhad", r:5, fa:"خیلی راحت تونستم زمان مناسب خودم رو انتخاب کنم.", en:"I could easily choose a time that worked for me." },
    { name_fa:"پریسا", name_en:"Parisa", r:5, fa:"بعد از چند جلسه واقعاً تغییر مثبت رو تو خودم حس کردم.", en:"After a few sessions, I genuinely felt a positive change in myself." },
    { name_fa:"یاسر", name_en:"Yaser", r:4, fa:"حس همدلی واقعی داشت، نه فقط حرف‌های کلیشه‌ای.", en:"There was genuine empathy, not just clichéd advice." },
    { name_fa:"سمیرا", name_en:"Samira", r:5, fa:"اینکه می‌تونستم از خونه‌ی خودم صحبت کنم خیلی بهم امنیت می‌داد.", en:"Being able to talk from my own home gave me a real sense of safety." },
    { name_fa:"نیما", name_en:"Nima", r:5, fa:"کاملاً ارزش وقت و هزینه‌اش رو داشت. پیشنهاد می‌کنم.", en:"It was completely worth the time and cost. I'd recommend it." },
    { name_fa:"گلناز", name_en:"Golnaz", r:5, fa:"با مهربانی و بدون عجله بهم کمک کرد مسیرم رو پیدا کنم.", en:"With kindness and patience, it helped me find my way." },
    { name_fa:"مازیار", name_en:"Maziar", r:5, fa:"تجربه‌ای بود که حالم رو بهتر کرد و دوباره ازش استفاده می‌کنم.", en:"It was an experience that made me feel better, and I'll use it again." }
  ];

  const grid = document.getElementById('testimonialGrid');
  const showMoreBtn = document.getElementById('showMoreTestimonials');
  const STAR = '<svg width="15" height="15" viewBox="0 0 24 24" fill="#C2A06B"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
  const STAR_EMPTY = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#C2A06B" stroke-width="1.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
  const INITIAL_COUNT = 6;
  let expanded = false;

  function escapeHtml(s){ const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function makeCard(t, isNew){
    const lang = document.documentElement.getAttribute('data-lang');
    const stars = STAR.repeat(t.r) + STAR_EMPTY.repeat(5 - t.r);
    const card = document.createElement('div');
    card.className = 'testimonial-card' + (isNew ? ' testimonial-card--new' : '');
    if (isNew){
      const nm = escapeHtml(t.name || '');
      const txt = escapeHtml(t.text || '');
      const initial = nm.slice(0,1);
      card.innerHTML =
        (isNew ? '<span class="testimonial-card__tag"><span data-i18n="fa">جدید</span><span data-i18n="en">New</span></span>' : '') +
        '<div class="star-row" aria-hidden="true">'+stars+'</div>' +
        '<p class="testimonial-card__quote">'+txt+'</p>' +
        '<div class="testimonial-card__author"><span class="testimonial-card__avatar">'+initial+'</span><span>'+nm+'</span></div>';
    } else {
      const nm = lang === 'en' ? t.name_en : t.name_fa;
      const txt = lang === 'en' ? t.en : t.fa;
      card.innerHTML =
        '<div class="star-row" aria-hidden="true">'+stars+'</div>' +
        '<p class="testimonial-card__quote"><span data-i18n="fa">'+t.fa+'</span><span data-i18n="en">'+t.en+'</span></p>' +
        '<div class="testimonial-card__author"><span class="testimonial-card__avatar">'+(t.name_fa).slice(0,1)+'</span><span><span data-i18n="fa">'+t.name_fa+'</span><span data-i18n="en">'+t.name_en+'</span></span></div>';
    }
    return card;
  }

  function getStoredReviews(){
    try { return JSON.parse(localStorage.getItem('hamnava_reviews') || '[]'); }
    catch(e){ return []; }
  }

  function renderTestimonials(){
    grid.innerHTML = '';
    testimonials.forEach(t => grid.appendChild(makeCard(t, false)));
    const cards = [...grid.children];
    cards.forEach((c, i) => c.classList.toggle('is-hidden', !expanded && i >= INITIAL_COUNT));
    showMoreBtn.style.display = cards.length > INITIAL_COUNT ? '' : 'none';
  }

  if (grid){
    renderTestimonials();
    showMoreBtn.addEventListener('click', () => {
      expanded = !expanded;
      renderTestimonials();
      showMoreBtn.querySelector('[data-i18n="fa"]').textContent = expanded ? 'نمایش کمتر' : 'نمایش نظرات بیشتر';
      showMoreBtn.querySelector('[data-i18n="en"]').textContent = expanded ? 'Show fewer' : 'Show more reviews';
    });
  }

  // pricing tabs (standard / student discount)
  document.querySelectorAll('.pricing-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      document.querySelectorAll('.pricing-tab').forEach(t => t.classList.toggle('is-active', t === tab));
      document.querySelectorAll('.pricing-panel').forEach(p => p.classList.toggle('is-active', p.dataset.panel === target));
    });
  });

  // call type toggle (video / phone)
  document.querySelectorAll('.calltype-input').forEach(group => {
    const targetId = group.dataset.target;
    const hidden = document.getElementById(targetId);
    const btns = [...group.querySelectorAll('.calltype-btn')];
    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        btns.forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        if (hidden) hidden.value = btn.dataset.valueFa + ' / ' + btn.dataset.valueEn;
      });
    });
  });
  // Widgets that aren't <select>s stash both languages in one hidden input as
  // "فارسی / English" and this pulls out the side the visitor is reading.
  function pickLangValue(hiddenId, lang){
    const el = document.getElementById(hiddenId);
    if (!el || !el.value) return '';
    const parts = el.value.split(' / ');
    return lang === 'en' ? (parts[1] || parts[0]) : parts[0];
  }

  // ---------- preferred-day picker ----------
  // One trigger that reads like a form field, opening a month grid. Every date is
  // shown in BOTH calendars — Jalali and Gregorian — because visitors are split
  // between Iran and abroad and a bare "۲۴ مرداد" or "Aug 15" is ambiguous to
  // half of them.
  //
  // No calendar conversion is written by hand: dates are always plain Gregorian
  // Date objects, and Intl does the Jalali arithmetic when they are formatted.
  // That keeps leap years and month lengths correct for free.
  function currentLang(){
    return document.documentElement.getAttribute('data-lang') === 'en' ? 'en' : 'fa';
  }
  function fmtDate(d, opts, loc){
    try { return new Intl.DateTimeFormat(loc, opts).format(d); } catch (e) { return ''; }
  }
  // ---------- Iran clock ----------
  // Every date and time in the booking form means Iran wall-clock time. The
  // counsellor reads the request in Tehran, so a visitor in Toronto asking for
  // "today at 9" has to mean 9 in Tehran, not 9 where they are sitting. Reading
  // the visitor's own clock — which is what new Date() gives — silently mislabels
  // their local time as Iran time, and for anyone far enough east or west it also
  // puts them on the wrong DAY.
  //
  // `var`, and a function declaration, on purpose: setLanguage() runs during init
  // and calls dayLabels() -> iranNow() before the module body reaches this line.
  // A `const` here would still be in its temporal dead zone and throw.
  var iranFmt;
  function iranParts(){
    if (iranFmt === undefined){
      try {
        // en-US-u-ca-gregory, not fa-IR: fa-IR defaults to the Persian calendar
        // and would hand back 1405 for the year. h23 keeps midnight at 00, not 12.
        iranFmt = new Intl.DateTimeFormat('en-US-u-ca-gregory', {
          timeZone:'Asia/Tehran', hourCycle:'h23',
          year:'numeric', month:'2-digit', day:'2-digit',
          hour:'2-digit', minute:'2-digit', second:'2-digit'
        });
      } catch (e) { iranFmt = null; }   // no Intl, or no tz database
    }
    const now = new Date();
    if (iranFmt){
      try {
        const p = {};
        iranFmt.formatToParts(now).forEach(x => { if (x.type !== 'literal') p[x.type] = x.value; });
        const y = Number(p.year), mo = Number(p.month), d = Number(p.day);
        let h = Number(p.hour);
        if (h === 24) h = 0;             // some engines still emit 24 for midnight
        if (y && mo && d && isFinite(h)) return { y, mo, d, h, mi:Number(p.minute), s:Number(p.second) };
      } catch (e) { /* fall through to the offset maths below */ }
    }
    // Fallback: Iran abolished DST in 2022, so the offset is a flat +03:30.
    const shifted = new Date(now.getTime() + (210 + now.getTimezoneOffset()) * 60000);
    return { y:shifted.getFullYear(), mo:shifted.getMonth() + 1, d:shifted.getDate(),
             h:shifted.getHours(), mi:shifted.getMinutes(), s:shifted.getSeconds() };
  }
  // A Date whose LOCAL fields read out Tehran's wall clock, so every helper below
  // (midnight, addDays, Intl formatting of the date) keeps working unchanged.
  function iranNow(){
    const p = iranParts();
    return new Date(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
  }

  function midnight(d){ const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function addDays(d, n){ const x = new Date(d); x.setDate(x.getDate() + n); return midnight(x); }
  function sameDay(a, b){ return !!a && !!b && midnight(a).getTime() === midnight(b).getTime(); }

  // "en-u-ca-persian" is the Persian calendar with Latin digits — far easier to
  // parse back into numbers than fa-IR's Persian digits.
  function calParts(d, lang){
    const loc = lang === 'en' ? 'en-US' : 'en-u-ca-persian';
    try {
      const parts = new Intl.DateTimeFormat(loc, { year:'numeric', month:'numeric', day:'numeric' }).formatToParts(d);
      const get = t => parseInt((parts.find(p => p.type === t) || {}).value, 10);
      return { y: get('year'), m: get('month'), d: get('day') };
    } catch (e) {
      return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
    }
  }
  function startOfCalMonth(d, lang){ return addDays(d, -(calParts(d, lang).d - 1)); }
  function daysInCalMonth(first, lang){
    const m = calParts(first, lang).m;
    let n = 28;                                  // no calendar month is shorter
    while (n < 32 && calParts(addDays(first, n), lang).m === m) n++;
    return n;
  }
  // Persian weeks start on Saturday, Gregorian ones on Sunday
  function weekCol(d, lang){ return lang === 'en' ? d.getDay() : (d.getDay() + 1) % 7; }

  // Locale date PATTERNS cannot be trusted here: Chrome renders fa-IR full dates
  // year-first ("۱۴۰۵ مرداد ۲۴، شنبه"), which is not how Persian writes them, and
  // the Persian calendar in an English locale appends an "AP" era nobody wants to
  // read. So take the pieces from formatToParts and order them by hand.
  function datePieces(d, loc){
    try {
      const parts = new Intl.DateTimeFormat(loc, {
        weekday:'long', year:'numeric', month:'long', day:'numeric'
      }).formatToParts(d);
      const g = t => ((parts.find(p => p.type === t) || {}).value || '').trim();
      return { wd: g('weekday'), d: g('day'), m: g('month'), y: g('year') };
    } catch (e) { return { wd:'', d:'', m:'', y:'' }; }
  }

  // Both calendars, every time — the audience is split between Iran and abroad.
  function dayLabels(d){
    // kept local on purpose: setLanguage() runs during init and reaches this
    // function before the module body gets this far, so a module-level const
    // here is still in its temporal dead zone and throws on ?lang=en
    const DAY_MS = 86400000;
    const rel = Math.round((midnight(d) - midnight(iranNow())) / DAY_MS);
    const jf = datePieces(d, 'fa-IR');                 // Jalali, Persian script
    const gf = datePieces(d, 'fa-IR-u-ca-gregory');    // Gregorian, Persian script
    const ge = datePieces(d, 'en-US');                 // Gregorian, English
    const je = datePieces(d, 'en-u-ca-persian');       // Jalali, English
    return {
      relFa: rel === 0 ? 'امروز' : rel === 1 ? 'فردا' : '',
      relEn: rel === 0 ? 'Today' : rel === 1 ? 'Tomorrow' : '',
      wdFa: jf.wd,
      wdEn: ge.wd,
      // date only, no weekday — the trigger shows the weekday on its own line
      jalaliFaShort: (jf.d + ' ' + jf.m + ' ' + jf.y).trim(),
      gregEnShort:   (ge.d + ' ' + ge.m.slice(0, 3) + ' ' + ge.y).trim(),
      // full one-liners, for the hidden input and the accessible names
      jalaliFa: (jf.wd + ' ' + jf.d + ' ' + jf.m + ' ' + jf.y).trim(),
      gregFa:   (gf.d + ' ' + gf.m + ' ' + gf.y).trim(),
      gregEn:   (ge.wd.slice(0, 3) + ', ' + ge.d + ' ' + ge.m.slice(0, 3) + ' ' + ge.y).trim(),
      jalaliEn: (je.d + ' ' + je.m + ' ' + je.y).trim()
    };
  }
  // what goes into the hidden input (and therefore into the WhatsApp message)
  function daySummary(d){
    const l = dayLabels(d);
    return {
      fa: (l.relFa ? l.relFa + '، ' : '') + l.jalaliFa + ' — ' + l.gregFa,
      en: (l.relEn ? l.relEn + ', ' : '') + l.gregEn + ' — ' + l.jalaliEn
    };
  }

  function pickerDate(wrap){
    const iso = wrap.dataset.date;
    return iso ? midnight(new Date(iso)) : midnight(iranNow());
  }

  // Three short lines rather than one long one: on a phone the field has ~160px
  // of text width, and "امروز · شنبه ۲۴ مرداد ۱۴۰۵" wraps mid-date there. Split
  // into weekday / date / other-calendar and every line fits at any width.
  function paintTrigger(wrap){
    const lang = currentLang();
    const l = dayLabels(pickerDate(wrap));
    const set = (sel, text) => {
      const el = wrap.querySelector(sel);
      if (el) el.textContent = text;
    };
    set('.daypick__rel', lang === 'en' ? (l.relEn || l.wdEn) : (l.relFa || l.wdFa));
    set('.daypick__value', lang === 'en' ? l.gregEnShort : l.jalaliFaShort);
    set('.daypick__alt', lang === 'en' ? l.jalaliEn : l.gregFa);
  }

  function commitDay(wrap, date){
    wrap.dataset.date = midnight(date).toISOString();
    const s = daySummary(midnight(date));
    const hidden = document.getElementById(wrap.dataset.target);
    if (hidden) hidden.value = s.fa + ' / ' + s.en;
    paintTrigger(wrap);
  }

  function buildDayPickers(){
    document.querySelectorAll('.daypick-wrap').forEach(wrap => {
      const lang = currentLang();
      const trigger = wrap.querySelector('.daypick__trigger');
      if (trigger) trigger.setAttribute('aria-label',
        lang === 'en' ? 'Preferred day — open calendar' : 'روز مورد نظر — باز کردن تقویم');
      // default to today; a date already chosen survives a language rebuild
      commitDay(wrap, wrap.dataset.date ? new Date(wrap.dataset.date) : iranNow());
    });
    document.querySelectorAll('.daycal.is-open').forEach(cal => renderCalendar(cal));
  }

  // Both popovers hang below their trigger, which breaks when the field sits low
  // in the viewport: the panel runs off the bottom and its footer buttons — the
  // ones that confirm the choice — end up unreachable. Flip above when there is
  // more room there, and if neither side fits, cap the height and let the panel
  // scroll rather than spill off-screen.
  function placePopover(panel){
    const wrap = panel.closest('.daypick-wrap, .timepick-wrap');
    if (!wrap) return;
    panel.classList.remove('is-above');
    panel.style.maxHeight = '';
    const GAP = 8, EDGE = 12, MIN_H = 240;
    const t = wrap.getBoundingClientRect();
    const h = panel.getBoundingClientRect().height;
    const below = window.innerHeight - t.bottom - GAP - EDGE;
    const above = t.top - GAP - EDGE;
    if (h <= below) return;                       // default placement is fine
    if (h <= above){ panel.classList.add('is-above'); return; }
    if (above > below){
      panel.classList.add('is-above');
      panel.style.maxHeight = Math.max(MIN_H, above) + 'px';
    } else {
      panel.style.maxHeight = Math.max(MIN_H, below) + 'px';
    }
  }

  // an open panel has to be re-placed when the page moves under it
  let placeTimer = null;
  function replaceOpenPopovers(){
    clearTimeout(placeTimer);
    placeTimer = setTimeout(() => {
      document.querySelectorAll('.daycal.is-open, .timedial.is-open').forEach(placePopover);
    }, 60);
  }
  window.addEventListener('scroll', replaceOpenPopovers, { passive: true });
  window.addEventListener('resize', replaceOpenPopovers);

  // ---------- calendar popover ----------
  function renderCalendar(cal){
    const lang = currentLang();
    const wrap = cal.closest('.daypick-wrap');
    const today = midnight(iranNow());
    const chosen = pickerDate(wrap);
    const cursor = cal.dataset.cursor ? midnight(new Date(cal.dataset.cursor)) : chosen;
    const first = startOfCalMonth(cursor, lang);
    cal.dataset.cursor = first.toISOString();

    const total = daysInCalMonth(first, lang);
    const lead = weekCol(first, lang);
    const last = addDays(first, total - 1);
    const dows = lang === 'en'
      ? ['Su','Mo','Tu','We','Th','Fr','Sa']
      : ['ش','ی','د','س','چ','پ','ج'];

    // Chrome's fa-IR month+year pattern is "۱۴۰۵ مرداد" (year first), which is
    // not how Persian writes it — compose from the parts instead.
    const title = lang === 'en'
      ? fmtDate(first, { month:'long', year:'numeric' }, 'en-US')
      : fmtDate(first, { month:'long' }, 'fa-IR') + ' ' + fmtDate(first, { year:'numeric' }, 'fa-IR');
    // the other calendar's span, since one Jalali month straddles two Gregorian ones
    const altLoc = lang === 'en' ? 'fa-IR' : 'en-US';
    const altA = fmtDate(first, { month:'short' }, altLoc) || fmtDate(first, { month:'long' }, altLoc);
    const altB = fmtDate(last, { month:'short' }, altLoc) || fmtDate(last, { month:'long' }, altLoc);
    const altYear = fmtDate(last, { year:'numeric' }, altLoc);
    const subtitle = (altA === altB ? altA : altA + ' – ' + altB) + ' ' + altYear;

    // the roving-tabindex day: keyboard focus lands here when the grid is entered
    let focusDate = cal.dataset.focus ? midnight(new Date(cal.dataset.focus)) : null;
    if (!focusDate || focusDate < first || focusDate > last){
      focusDate = (chosen >= first && chosen <= last) ? chosen
                : (today >= first && today <= last) ? today : first;
    }
    if (focusDate < today) focusDate = (today >= first && today <= last) ? today : first;
    cal.dataset.focus = focusDate.toISOString();

    const atFloor = startOfCalMonth(today, lang).getTime() >= first.getTime();

    let cells = '';
    for (let i = 0; i < lead; i++) cells += '<span class="daycal__pad" aria-hidden="true"></span>';
    for (let i = 0; i < total; i++){
      const d = addDays(first, i);
      const past = d.getTime() < today.getTime();
      const isChosen = sameDay(chosen, d);
      const cls = 'daycal__day'
        + (isChosen ? ' is-chosen' : '')
        + (sameDay(today, d) ? ' is-today' : '')
        + (past ? ' is-past' : '');
      const main = fmtDate(d, { day:'numeric' }, lang === 'en' ? 'en-US' : 'fa-IR');
      // the secondary number is the OTHER calendar, in Latin digits so the two
      // readings never blur together
      const alt = fmtDate(d, { day:'numeric' }, lang === 'en' ? 'en-u-ca-persian' : 'en-GB');
      const s = daySummary(d);
      cells += '<button type="button" class="' + cls + '" data-date="' + d.toISOString() + '"'
        + ' role="gridcell" aria-label="' + (lang === 'en' ? s.en : s.fa) + '"'
        + ' aria-selected="' + (isChosen ? 'true' : 'false') + '"'
        + (sameDay(today, d) ? ' aria-current="date"' : '')
        + ' tabindex="' + (sameDay(focusDate, d) ? '0' : '-1') + '"'
        + (past ? ' disabled aria-disabled="true"' : '') + '>'
        + '<span class="daycal__n">' + main + '</span>'
        + '<span class="daycal__alt-n">' + alt + '</span>'
        + '</button>';
    }

    cal.innerHTML =
      '<div class="daycal__head">' +
        '<button type="button" class="daycal__nav" data-step="-1" aria-label="' + (lang === 'en' ? 'Previous month' : 'ماه قبل') + '"' + (atFloor ? ' disabled' : '') + '>' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
        '<span class="daycal__titles"><span class="daycal__title">' + title + '</span>' +
          '<span class="daycal__subtitle">' + subtitle + '</span></span>' +
        '<button type="button" class="daycal__nav" data-step="1" aria-label="' + (lang === 'en' ? 'Next month' : 'ماه بعد') + '">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
      '</div>' +
      '<div class="daycal__dows" aria-hidden="true">' + dows.map(x => '<span>' + x + '</span>').join('') + '</div>' +
      '<div class="daycal__grid" role="grid">' + cells + '</div>' +
      '<div class="daycal__foot">' +
        '<button type="button" class="daycal__today">' + (lang === 'en' ? 'Today' : 'امروز') + '</button>' +
        '<button type="button" class="daycal__close">' + (lang === 'en' ? 'Close' : 'بستن') + '</button>' +
      '</div>';
    placePopover(cal);
  }

  function focusCalDay(cal){
    const el = cal.querySelector('.daycal__day[tabindex="0"]');
    if (el) el.focus({ preventScroll: true });
  }
  function openCalendar(wrap){
    const cal = wrap.querySelector('.daycal');
    // always reopen on the month of the current choice, not wherever the visitor
    // browsed to last time
    cal.dataset.cursor = pickerDate(wrap).toISOString();
    cal.dataset.focus = '';
    closeAllCalendars(cal);
    cal.hidden = false;
    cal.classList.add('is-open');
    wrap.querySelector('.daypick__trigger').setAttribute('aria-expanded', 'true');
    renderCalendar(cal);
    focusCalDay(cal);
  }
  function closeCalendar(cal, returnFocus){
    if (!cal || !cal.classList.contains('is-open')) return;
    cal.classList.remove('is-open');
    cal.hidden = true;
    const trigger = cal.closest('.daypick-wrap').querySelector('.daypick__trigger');
    if (trigger){
      trigger.setAttribute('aria-expanded', 'false');
      if (returnFocus) trigger.focus({ preventScroll: true });
    }
  }
  function closeAllCalendars(except){
    document.querySelectorAll('.daycal.is-open').forEach(c => { if (c !== except) closeCalendar(c, false); });
  }
  function stepMonth(cal, step){
    const lang = currentLang();
    const first = midnight(new Date(cal.dataset.cursor));
    cal.dataset.cursor = (step > 0
      ? addDays(first, daysInCalMonth(first, lang))
      : startOfCalMonth(addDays(first, -1), lang)).toISOString();
    renderCalendar(cal);
  }

  document.addEventListener('click', e => {
    // scoped to .daypick-wrap: the time picker reuses .daypick__trigger for its
    // styling, so an unscoped match would grab that one too and then fail on the
    // wrapper lookup
    const trigger = e.target.closest('.daypick-wrap .daypick__trigger');
    if (trigger){
      const wrap = trigger.closest('.daypick-wrap');
      const cal = wrap.querySelector('.daycal');
      if (cal.classList.contains('is-open')) closeCalendar(cal, true); else openCalendar(wrap);
      return;
    }
    const cal = e.target.closest('.daycal');
    if (!cal){ closeAllCalendars(); return; }     // click outside dismisses

    const nav = e.target.closest('.daycal__nav');
    if (nav){ stepMonth(cal, Number(nav.dataset.step)); focusCalDay(cal); return; }

    const day = e.target.closest('.daycal__day');
    if (day && !day.disabled){
      commitDay(cal.closest('.daypick-wrap'), new Date(day.dataset.date));
      closeCalendar(cal, true);
      return;
    }
    if (e.target.closest('.daycal__today')){
      commitDay(cal.closest('.daypick-wrap'), iranNow());
      closeCalendar(cal, true);
      return;
    }
    if (e.target.closest('.daycal__close')) closeCalendar(cal, true);
  });

  // Full keyboard operation of the grid — a calendar that can only be clicked is
  // unusable without a pointer.
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape'){
      const open = document.querySelector('.daycal.is-open');
      if (open){ closeCalendar(open, true); e.preventDefault(); }
      return;
    }
    const day = e.target.closest && e.target.closest('.daycal__day');
    if (!day) return;
    const cal = day.closest('.daycal');
    const lang = currentLang();
    const from = midnight(new Date(day.dataset.date));
    let to = null;
    switch (e.key){
      // arrows follow visual direction: in RTL, "left" moves forward in time
      case 'ArrowLeft':  to = addDays(from, lang === 'en' ? -1 : 1); break;
      case 'ArrowRight': to = addDays(from, lang === 'en' ? 1 : -1); break;
      case 'ArrowUp':    to = addDays(from, -7); break;
      case 'ArrowDown':  to = addDays(from, 7); break;
      case 'Home':       to = startOfCalMonth(from, lang); break;
      case 'End':        to = addDays(startOfCalMonth(from, lang), daysInCalMonth(startOfCalMonth(from, lang), lang) - 1); break;
      case 'PageUp':     stepMonth(cal, -1); focusCalDay(cal); e.preventDefault(); return;
      case 'PageDown':   stepMonth(cal, 1); focusCalDay(cal); e.preventDefault(); return;
      default: return;
    }
    e.preventDefault();
    if (to < midnight(iranNow())) return;        // never walk into the past
    cal.dataset.focus = to.toISOString();
    // move the month view along if the target fell outside it
    const first = midnight(new Date(cal.dataset.cursor));
    const lastDay = addDays(first, daysInCalMonth(first, lang) - 1);
    if (to < first || to > lastDay) cal.dataset.cursor = startOfCalMonth(to, lang).toISOString();
    renderCalendar(cal);
    focusCalDay(cal);
  });

  buildDayPickers();

  // ---------- time picker ----------
  // An analogue dial rather than a dropdown of fixed windows, so any time can be
  // asked for. Two steps like a physical clock: hour first, then minutes.
  //
  // Every number on the face is a real <button>. Nothing here needs a drag —
  // WCAG 2.2 requires a single-pointer alternative for any drag-controlled
  // widget, and building it out of discrete targets avoids the problem entirely
  // instead of bolting an alternative on afterwards.
  const TIME_RING_OUTER = 12;                    // hours 12,1..11
  const MIN_STEP = 5;

  function timeState(wrap){
    const raw = wrap.dataset.time || '';
    const m = raw.match(/^(\d{1,2}):(\d{2})$/);
    if (m) return { h: Number(m[1]), m: Number(m[2]) };
    // default: the next round half-hour, which is what someone booking "a call"
    // usually means by "as soon as possible"
    const now = iranNow();
    let h = now.getHours(), mi = now.getMinutes() <= 30 ? 30 : 0;
    if (mi === 0) h = (h + 1) % 24;
    return { h, m: mi };
  }

  function timeLabels(t){
    const two = n => (n < 10 ? '0' : '') + n;
    const faDigit = s => String(s).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
    const h12 = t.h % 12 === 0 ? 12 : t.h % 12;
    const ampm = t.h < 12 ? 'AM' : 'PM';
    // a plain-language band so the counsellor reading the message on WhatsApp
    // immediately knows whether this is a morning or a late-evening request
    const bandFa = t.h < 5 ? 'بامداد' : t.h < 12 ? 'صبح' : t.h < 17 ? 'ظهر و بعدازظهر' : t.h < 21 ? 'عصر' : 'شب';
    const bandEn = t.h < 5 ? 'Early morning' : t.h < 12 ? 'Morning' : t.h < 17 ? 'Afternoon' : t.h < 21 ? 'Evening' : 'Night';
    return {
      fa: faDigit(two(t.h) + ':' + two(t.m)),
      en: h12 + ':' + two(t.m) + ' ' + ampm,
      bandFa, bandEn
    };
  }

  function paintTimeTrigger(wrap){
    const lang = currentLang();
    const l = timeLabels(timeState(wrap));
    const set = (sel, text) => { const el = wrap.querySelector(sel); if (el) el.textContent = text; };
    set('.daypick__rel', lang === 'en' ? l.bandEn : l.bandFa);
    set('.daypick__value', lang === 'en' ? l.en : l.fa);
  }

  function commitTime(wrap, h, m){
    wrap.dataset.time = h + ':' + (m < 10 ? '0' : '') + m;
    const l = timeLabels({ h, m });
    const hidden = document.getElementById(wrap.dataset.target);
    // "ساعت ۱۸:۳۰ (عصر) / 6:30 PM (Evening)" — same two-language convention the
    // rest of the form uses
    if (hidden) hidden.value = 'ساعت ' + l.fa + ' (' + l.bandFa + '، به وقت ایران) / ' + l.en + ' (' + l.bandEn + ', Iran time)';
    paintTimeTrigger(wrap);
  }

  function buildTimePickers(){
    document.querySelectorAll('.timepick-wrap').forEach(wrap => {
      const lang = currentLang();
      const trigger = wrap.querySelector('.daypick__trigger');
      if (trigger) trigger.setAttribute('aria-label',
        lang === 'en' ? 'Best time to call — open clock' : 'بهترین زمان تماس — باز کردن ساعت');
      const t = timeState(wrap);
      commitTime(wrap, t.h, t.m);
    });
    document.querySelectorAll('.timedial.is-open').forEach(d => renderDial(d));
  }

  // Places the ring labels on a circle. Index 0 sits at 12 o'clock and the rest
  // run clockwise, exactly like the face of a watch.
  function ringHtml(items, radiusPct, cls, activeValue){
    return items.map((item, i) => {
      const a = (i * 30) * Math.PI / 180;
      const x = 50 + radiusPct * Math.sin(a);
      const y = 50 - radiusPct * Math.cos(a);
      const on = item.value === activeValue;
      return '<button type="button" class="timedial__num ' + cls + (on ? ' is-on' : '') + '"'
        + ' style="left:' + x.toFixed(2) + '%; top:' + y.toFixed(2) + '%"'
        + ' data-value="' + item.value + '" aria-label="' + item.aria + '"'
        + ' aria-pressed="' + (on ? 'true' : 'false') + '">' + item.label + '</button>';
    }).join('');
  }

  function renderDial(dial){
    const lang = currentLang();
    const wrap = dial.closest('.timepick-wrap');
    const t = timeState(wrap);
    const mode = dial.dataset.mode === 'm' ? 'm' : 'h';
    const l = timeLabels(t);
    const faDigit = s => String(s).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
    const num = n => lang === 'en' ? String(n) : faDigit(n);
    const two = n => (n < 10 ? '0' : '') + n;

    let rings = '';
    let handAngle, handShort;
    if (mode === 'h'){
      // outer ring is 12,1..11 and the inner one 00,13..23 — the standard
      // 24-hour dial, so no AM/PM toggle is needed at all
      const outer = [], inner = [];
      for (let i = 0; i < TIME_RING_OUTER; i++){
        const ho = i === 0 ? 12 : i;
        const hi = i === 0 ? 0 : 12 + i;
        outer.push({ value: ho, label: num(ho), aria: (lang === 'en' ? 'Hour ' : 'ساعت ') + ho });
        inner.push({ value: hi, label: num(two(hi)), aria: (lang === 'en' ? 'Hour ' : 'ساعت ') + hi });
      }
      rings = ringHtml(outer, 39, 'timedial__num--outer', t.h)
            + ringHtml(inner, 24, 'timedial__num--inner', t.h);
      handAngle = (t.h % 12) * 30;
      handShort = !(t.h >= 1 && t.h <= 12);      // inner ring -> shorter hand
    } else {
      const mins = [];
      for (let i = 0; i < 12; i++){
        const v = i * MIN_STEP;
        mins.push({ value: v, label: num(two(v)), aria: (lang === 'en' ? 'Minute ' : 'دقیقه ') + v });
      }
      rings = ringHtml(mins, 39, 'timedial__num--outer', Math.round(t.m / MIN_STEP) * MIN_STEP % 60);
      handAngle = (t.m / 60) * 360;
      handShort = false;
    }

    // There is no confirm button: picking the hour moves to the minutes and
    // picking the minutes closes the dial. Anything below the face is at risk of
    // falling past the bottom of the window on a short screen, so the one
    // shortcut that remains ("soonest") sits in the header where it cannot.
    dial.innerHTML =
      '<div class="timedial__top">' +
        '<button type="button" class="timedial__now">' + (lang === 'en' ? 'Soonest' : 'نزدیک‌ترین') + '</button>' +
        '<div class="timedial__readout">' +
          '<button type="button" class="timedial__seg' + (mode === 'h' ? ' is-active' : '') + '" data-mode="h"' +
            ' aria-label="' + (lang === 'en' ? 'Set hour' : 'تنظیم ساعت') + '">' + num(two(t.h)) + '</button>' +
          '<span class="timedial__colon">:</span>' +
          '<button type="button" class="timedial__seg' + (mode === 'm' ? ' is-active' : '') + '" data-mode="m"' +
            ' aria-label="' + (lang === 'en' ? 'Set minutes' : 'تنظیم دقیقه') + '">' + num(two(t.m)) + '</button>' +
          '<span class="timedial__band">' + (lang === 'en' ? l.bandEn : l.bandFa) + '</span>' +
        '</div>' +
      '</div>' +
      '<p class="timedial__hint">' +
        (mode === 'h' ? (lang === 'en' ? 'Step 1 of 2 — pick the hour' : 'گام ۱ از ۲ — ساعت را انتخاب کنید')
                      : (lang === 'en' ? 'Step 2 of 2 — pick the minutes' : 'گام ۲ از ۲ — دقیقه را انتخاب کنید')) + '</p>' +
      '<div class="timedial__face" data-mode="' + mode + '">' +
        '<span class="timedial__hand' + (handShort ? ' is-short' : '') + '" style="transform:rotate(' + handAngle + 'deg)"></span>' +
        '<span class="timedial__pin"></span>' +
        rings +
      '</div>' +
      '<p class="timedial__tz">' +
        (lang === 'en' ? 'Iran time (IRST) — now ' : 'به وقت ایران — هم‌اکنون ') +
        '<span class="timedial__tz-time">' + iranClockText(lang) + '</span></p>';
    placePopover(dial);
  }

  function openDial(wrap){
    const dial = wrap.querySelector('.timedial');
    dial.dataset.mode = 'h';                     // always start on the hour
    closeAllDials(dial);
    closeAllCalendars();
    dial.hidden = false;
    dial.classList.add('is-open');
    wrap.querySelector('.daypick__trigger').setAttribute('aria-expanded', 'true');
    renderDial(dial);
    const on = dial.querySelector('.timedial__num.is-on') || dial.querySelector('.timedial__num');
    if (on) on.focus({ preventScroll: true });
  }
  function closeDial(dial, returnFocus){
    if (!dial || !dial.classList.contains('is-open')) return;
    dial.classList.remove('is-open');
    dial.hidden = true;
    const trigger = dial.closest('.timepick-wrap').querySelector('.daypick__trigger');
    if (trigger){
      trigger.setAttribute('aria-expanded', 'false');
      if (returnFocus) trigger.focus({ preventScroll: true });
    }
  }
  function closeAllDials(except){
    document.querySelectorAll('.timedial.is-open').forEach(d => { if (d !== except) closeDial(d, false); });
  }

  document.addEventListener('click', e => {
    const trigger = e.target.closest('.timepick-wrap .daypick__trigger');
    if (trigger){
      const wrap = trigger.closest('.timepick-wrap');
      const dial = wrap.querySelector('.timedial');
      if (dial.classList.contains('is-open')) closeDial(dial, true); else openDial(wrap);
      return;
    }
    const dial = e.target.closest('.timedial');
    if (!dial){ closeAllDials(); return; }
    const wrap = dial.closest('.timepick-wrap');
    const t = timeState(wrap);

    const seg = e.target.closest('.timedial__seg');
    if (seg){ dial.dataset.mode = seg.dataset.mode; renderDial(dial); return; }

    const numBtn = e.target.closest('.timedial__num');
    if (numBtn){
      const v = Number(numBtn.dataset.value);
      if (dial.dataset.mode === 'm'){
        commitTime(wrap, t.h, v);
        closeDial(dial, true);                   // minutes picked -> that's the answer
      } else {
        commitTime(wrap, v, t.m);
        dial.dataset.mode = 'm';                 // hour picked -> straight to minutes
        renderDial(dial);
        const next = dial.querySelector('.timedial__num.is-on') || dial.querySelector('.timedial__num');
        if (next) next.focus({ preventScroll: true });
      }
      return;
    }
    if (e.target.closest('.timedial__now')){
      const d = iranNow();
      let h = d.getHours(), mi = d.getMinutes() <= 30 ? 30 : 0;
      if (mi === 0) h = (h + 1) % 24;
      commitTime(wrap, h, mi);
      closeDial(dial, true);
      return;
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape'){
      const open = document.querySelector('.timedial.is-open');
      if (open){ closeDial(open, true); e.preventDefault(); }
      return;
    }
    const num = e.target.closest && e.target.closest('.timedial__num');
    if (!num) return;
    const dial = num.closest('.timedial');
    const wrap = dial.closest('.timepick-wrap');
    const t = timeState(wrap);
    const isMin = dial.dataset.mode === 'm';
    let dir = 0;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') dir = 1;
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') dir = -1;
    else return;
    e.preventDefault();
    if (isMin) commitTime(wrap, t.h, (t.m + dir * MIN_STEP + 60) % 60);
    else commitTime(wrap, (t.h + dir + 24) % 24, t.m);
    renderDial(dial);
    const on = dial.querySelector('.timedial__num.is-on');
    if (on) on.focus({ preventScroll: true });
  });

  buildTimePickers();

  // ---------- live Tehran clock ----------
  // Stating the zone in words was not enough: a visitor abroad still has to do
  // the arithmetic in their head to know whether "9" is a reasonable ask. Showing
  // Tehran's actual clock beside the field turns that into a glance.
  function iranClockText(lang){
    const p = iranParts();
    const l = timeLabels({ h: p.h, m: p.mi });
    return lang === 'en' ? l.en : l.fa;
  }
  function paintIranClocks(){
    const txt = iranClockText(currentLang());
    // only written when the minute actually rolls over, so the ticking costs
    // nothing and never interrupts a screen reader mid-sentence
    document.querySelectorAll('.timepick-now__time, .timedial__tz-time').forEach(el => {
      if (el.textContent !== txt) el.textContent = txt;
    });
  }
  if (document.querySelector('.timepick-wrap')){
    paintIranClocks();
    // once a second, not once a minute: a minute-aligned timer drifts whenever the
    // tab is throttled in the background and then shows a stale minute on return
    setInterval(paintIranClocks, 1000);
    document.addEventListener('hamnava:lang', paintIranClocks);
    document.addEventListener('visibilitychange', paintIranClocks);
  }

  // star rating input
  let selectedRating = 0;
  const ratingInput = document.getElementById('ratingInput');
  if (ratingInput){
    const starBtns = [...ratingInput.querySelectorAll('button')];
    function paint(n){ starBtns.forEach((b,i) => b.classList.toggle('is-active', i < n)); }
    starBtns.forEach(b => {
      b.addEventListener('click', () => { selectedRating = +b.dataset.value; paint(selectedRating); });
      b.addEventListener('mouseenter', () => paint(+b.dataset.value));
    });
    ratingInput.addEventListener('mouseleave', () => paint(selectedRating));
  }

  // review form submit -> send to the business via WhatsApp for moderation
  // (previously this only wrote to localStorage, which is never read anywhere
  // else on the site, so submitted reviews were never seen by anyone)
  const reviewForm = document.getElementById('reviewForm');
  const reviewSuccess = document.getElementById('reviewSuccess');
  if (reviewForm){
    reviewForm.addEventListener('submit', e => {
      e.preventDefault();
      const name = document.getElementById('reviewName').value.trim();
      const text = document.getElementById('reviewText').value.trim();
      if (!name || !text || selectedRating === 0){
        if (selectedRating === 0 && ratingInput) ratingInput.style.outline = '2px solid var(--gold-deep)';
        return;
      }
      const lang = document.documentElement.getAttribute('data-lang') === 'en' ? 'en' : 'fa';
      const labels = {
        fa: { head:'نظر جدید مراجع', name:'نام (یا حرف اول)', rating:'امتیاز', text:'متن نظر' },
        en: { head:'New review submitted', name:'Name (or initial)', rating:'Rating', text:'Review text' }
      }[lang];
      const lines = [
        labels.head, '',
        labels.name + ': ' + name,
        labels.rating + ': ' + selectedRating + '/5',
        labels.text + ': ' + text
      ];
      const url = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(lines.join('\n'));

      // keep a local copy too (handy for the reviewer's own records)
      const stored = getStoredReviews();
      stored.unshift({ name, text, r: selectedRating });
      try { localStorage.setItem('hamnava_reviews', JSON.stringify(stored)); } catch(e){}

      reviewForm.style.display = 'none';
      reviewSuccess.classList.add('is-visible');
      window.open(url, '_blank', 'noopener');
    });
  }

  // counselor detail modal
  const cModal = document.getElementById('counselorModal');
  const cModalContent = document.getElementById('counselorModalContent');
  const cModalClose = document.getElementById('counselorModalClose');
  let lastFocusedEl = null;
  // set by the marquee below, so opening a counselor modal freezes the strip
  // instead of letting the item you just clicked drift far off-screen
  let marqueeSetModalPaused = null;

  function openCounselorModal(modalId){
    const tpl = document.getElementById('modal-data-' + modalId);
    if (!tpl || !cModal) return;
    cModalContent.innerHTML = '';
    cModalContent.appendChild(tpl.content.cloneNode(true));
    lastFocusedEl = document.activeElement;
    cModal.classList.add('is-open');
    cModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    if (marqueeSetModalPaused) marqueeSetModalPaused(true);
    if (cModalClose) cModalClose.focus({ preventScroll: true });
  }
  function closeCounselorModal(){
    if (!cModal) return;
    cModal.classList.remove('is-open');
    cModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    // preventScroll is essential here, not cosmetic: when the restored element
    // is a marquee item that has scrolled out of view, a plain focus() makes
    // the browser scroll the marquee's overflow:hidden box to reveal it, which
    // silently corrupts every getBoundingClientRect() the recycler relies on.
    if (lastFocusedEl) lastFocusedEl.focus({ preventScroll: true });
    if (marqueeSetModalPaused) marqueeSetModalPaused(false);
  }
  document.querySelectorAll('[data-modal]').forEach(el => {
    // faces in the home-page strip take you to the counselors page instead of
    // popping a modal — handled by the marquee listener further down
    if (el.closest('.counselor-marquee')) return;
    el.addEventListener('click', () => openCounselorModal(el.getAttribute('data-modal')));
  });

  // A face in the home-page strip is a plain link to "counselors/#cns-N", so the
  // browser does the navigation on its own. Here we pick that fragment up on
  // arrival: scroll the matching card into view, flash it, and leave a standing
  // marker so it stays obvious which counselor was picked.
  // the standing marker's badge text is CSS content:attr(), so it lives here
  function labelSelectedCards(){
    const en = document.documentElement.getAttribute('data-lang') === 'en';
    document.querySelectorAll('.counselor-card.is-selected').forEach(el =>
      el.setAttribute('data-selected-label', en ? 'Selected' : 'انتخاب شما'));
  }

  function highlightCounselorCard(card, smooth){
    if (!card) return;
    document.querySelectorAll('.counselor-card.is-selected, .counselor-card.is-spotlit')
      .forEach(el => el.classList.remove('is-selected', 'is-spotlit'));

    const top = card.getBoundingClientRect().top + window.scrollY - 90;
    window.scrollTo({ top: Math.max(top, 0), behavior: smooth ? 'smooth' : 'auto' });

    void card.offsetWidth;           // restart the animation if it is re-picked
    card.classList.add('is-spotlit', 'is-selected');
    labelSelectedCards();
    card.addEventListener('animationend', function drop(){
      card.classList.remove('is-spotlit');   // the flash ends, the marker stays
      card.removeEventListener('animationend', drop);
    });
  }

  function spotlightFromHash(smooth){
    const id = (location.hash || '').slice(1);
    if (!/^cns-\d+$/.test(id)) return;
    const card = document.getElementById(id);
    if (!card) return;
    // wait for layout (web fonts and lazy avatars still shift things around),
    // otherwise we scroll to a position that is stale a frame later
    if (document.readyState === 'complete') requestAnimationFrame(() => highlightCounselorCard(card, smooth));
    else window.addEventListener('load', () => setTimeout(() => highlightCounselorCard(card, smooth), 60));
  }
  spotlightFromHash(false);

  // Going back/forward between two counselors, or following a second link while
  // already on this page, only changes the fragment — no reload, so the line
  // above never re-runs and the marker would sit on the previous card.
  window.addEventListener('hashchange', () => spotlightFromHash(true));

  // clicking a different card clears the standing marker
  document.addEventListener('click', e => {
    const card = e.target.closest('.counselor-card');
    document.querySelectorAll('.counselor-card.is-selected').forEach(el => {
      if (el !== card) el.classList.remove('is-selected');
    });
  });
  if (cModalClose) cModalClose.addEventListener('click', closeCounselorModal);
  if (cModal) cModal.addEventListener('click', e => { if (e.target === cModal) closeCounselorModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && cModal && cModal.classList.contains('is-open')) closeCounselorModal(); });

  // counselor marquee click ring feedback (marquee items are static HTML,
  // so a single delegated listener covers all of them)
  const marqueeTrack = document.getElementById('counselorMarqueeTrack');
  if (marqueeTrack){
    // Ring feedback only. The item is an <a href="counselors/#cns-N">, so the
    // browser handles the navigation — nothing here should preventDefault.
    marqueeTrack.addEventListener('click', e => {
      const item = e.target.closest('.counselor-marquee__item');
      if (!item) return;
      item.classList.remove('is-clicked');
      void item.offsetWidth;
      item.classList.add('is-clicked');
    });

    // Infinite marquee — LTR DOM recycling (marquee container has dir=ltr).
    // Items flow left→right. translateX(-offset) scrolls them leftward.
    // When an item fully exits the LEFT edge of the container,
    // it is appended to the END of the DOM (visual right), and the
    // offset is reduced by one slot-width so there is no visual jump.
    (function runMarquee(){
      var SPEED = 42; // px per second (frame-rate independent — see step())
      var currentSpeed = 0; // eased toward SPEED/0, so start, pause and resume all glide instead of snapping
      var offset = 0;
      var lastTs = null;

      var origItems = Array.from(marqueeTrack.children);
      var origCount = origItems.length;

      // The 36px between faces is padding INSIDE each item, so the flex gap is
      // genuinely zero and every width read below already contains the spacing.
      // Reading it as `parseInt(columnGap) || 36` turned the legitimate 0 into
      // 36 (0 is falsy), and recycle() then shifted the strip 36px further than
      // the item it had just moved — a visible lurch every time a face wrapped
      // around. Default to 0, and re-read it in case a breakpoint changes it.
      function readGap(){
        var g = parseFloat(window.getComputedStyle(marqueeTrack).columnGap);
        return isFinite(g) ? g : 0;   // "normal" on a non-flex context
      }
      var gapPx = readGap();
      var containerW = marqueeTrack.parentElement.offsetWidth;

      function itemWidth(el){
        // getBoundingClientRect is fractional; offsetWidth rounds to whole
        // pixels, and recycling by the rounded number leaves up to half a pixel
        // of error behind on every wrap, which accumulates into a drift.
        return el.getBoundingClientRect().width;
      }

      function wireItem(el){
        el.addEventListener('click', function(){
          this.classList.remove('is-clicked');
          void this.offsetWidth;
          this.classList.add('is-clicked');
        });
      }

      // Pre-fill: clone items until the track is wider than the container + 2
      // buffers. Faces are not all the same width — the name underneath sets it,
      // and those range from "دکتر الناز زرین‌فر" to "دکتر لیلی اسماعیل‌زاده" —
      // so size the target off the average rather than off whichever item
      // happens to be first.
      var idx = 0;
      function avgSlot(){
        if (!origCount) return 140;
        var sum = 0;
        for (var i = 0; i < origCount; i++) sum += itemWidth(origItems[i]);
        return (sum / origCount) + gapPx;
      }
      // Clone in WHOLE passes over the list. recycle() only ever rotates the
      // track, so whatever order fill() leaves behind IS the loop: stopping
      // part-way through a pass gave the first counselors an extra copy in the
      // cycle and they came round twice as often as everyone else.
      function fill(){
        gapPx = readGap();
        containerW = marqueeTrack.parentElement.offsetWidth;
        var slotW = avgSlot();
        var guard = 400;                    // never spin forever on a zero width
        while ((marqueeTrack.scrollWidth < containerW * 2 + slotW * 3 ||
                idx % origCount !== 0) && guard-- > 0) {
          // cloneNode(true) already carries href/data-counselor across
          var clone = origItems[idx % origCount].cloneNode(true);
          wireItem(clone);
          marqueeTrack.appendChild(clone);
          idx++;
        }
      }
      fill();

      // Wire click ring on the originals (clones are wired as they are made)
      origItems.forEach(wireItem);

      // Item widths depend on the counselor's name, so they change the moment
      // Vazirmatn finishes loading and the fallback font is swapped out. Measure
      // again then, and on resize, topping up the clones if the strip came up
      // short. recycle() re-measures every frame, so it needs no help.
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(fill).catch(function(){});
      var resizeTimer = null;
      window.addEventListener('resize', function(){
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(fill, 150);
      });

      // Pause on hover/focus so a visitor can actually read a name and click
      // it instead of chasing a moving target.
      var paused = false;
      var marqueeWrap = marqueeTrack.parentElement;
      // Only for a real pointing device. A touch tap also fires mouseenter,
      // but there is no matching mouseleave until the visitor happens to tap
      // somewhere else — so on a phone this left the strip parked forever
      // after the first time anyone touched it.
      var canHover = !window.matchMedia || window.matchMedia('(hover: hover)').matches;
      if (canHover){
        marqueeWrap.addEventListener('mouseenter', function(){ paused = true; });
        marqueeWrap.addEventListener('mouseleave', function(){ paused = false; });
      }
      marqueeWrap.addEventListener('focusin', function(){ paused = true; });
      marqueeWrap.addEventListener('focusout', function(){ paused = false; });

      // Held separately from `paused` so closing the modal can't resume the
      // strip while the pointer is still resting on it.
      var modalPaused = false;
      marqueeSetModalPaused = function(v){ modalPaused = v; };

      // An overflow:hidden box is still scrollable programmatically. Anything
      // that reveals a descendant (focus restore, find-in-page, a screen
      // reader) can scroll this container, and because every measurement below
      // is viewport-relative that offset desyncs the recycler — items stampede
      // and the strip ends up parked off-screen. Pin it at zero.
      marqueeWrap.addEventListener('scroll', function(){
        if (marqueeWrap.scrollLeft !== 0) marqueeWrap.scrollLeft = 0;
      });

      function apply(){
        // Negate the number rather than prefixing a literal "-": dragging
        // backwards drives offset below zero for the frames before recycle()
        // reseats the strip, and "translateX(-" + -120 + "px)" builds
        // "translateX(--120px)" — invalid CSS that the browser drops on the
        // floor, freezing the strip mid-drag.
        marqueeTrack.style.transform = 'translateX(' + (-offset) + 'px)';
      }

      // Keep the strip seamless in BOTH directions. The auto-scroll only ever
      // moves one way, so the original recycler only handled items leaving the
      // left edge. Dragging can also run the strip backwards, which opens a gap
      // at the left that has to be filled from the tail.
      function recycle(){
        var cLeft = marqueeWrap.getBoundingClientRect().left;
        var guard = marqueeTrack.children.length;
        while (guard-- > 0) {
          var firstEl = marqueeTrack.firstElementChild;
          if (!firstEl) break;
          // measured before the move: appending changes where it sits, not how
          // wide it is, and the offset has to be corrected by exactly that width
          // or the rest of the strip visibly steps sideways
          var firstW = itemWidth(firstEl);
          if (firstEl.getBoundingClientRect().right + gapPx >= cLeft) break;
          marqueeTrack.appendChild(firstEl);
          offset -= (firstW + gapPx);
          apply();
        }
        guard = marqueeTrack.children.length;
        while (guard-- > 0) {
          var head = marqueeTrack.firstElementChild;
          var tail = marqueeTrack.lastElementChild;
          if (!head || !tail || head === tail) break;
          if (head.getBoundingClientRect().left < cLeft) break;
          var tailW = itemWidth(tail);
          marqueeTrack.insertBefore(tail, head);
          offset += (tailW + gapPx);
          apply();
        }
      }

      // ---- drag to scrub the strip by hand ----
      // DRAG_SLOP also decides what counts as a click: below it the gesture was
      // a tap on a face and must be allowed to follow the link.
      var DRAG_SLOP = 6;
      var dragging = false, dragDist = 0, dragLastX = 0, captured = false;
      var touchDriven = false;            // a finger owns the strip; see below
      var vel = 0, velTs = 0, fling = 0;  // px/s, for the throw after release

      function dragBegin(x){
        dragging = true; dragDist = 0; dragLastX = x; captured = false;
        currentSpeed = 0;                 // hand over from the animation cleanly
        fling = 0; vel = 0; velTs = (window.performance || Date).now();
      }

      function dragTo(x){
        if (!dragging) return;
        var dx = x - dragLastX;
        dragLastX = x;
        dragDist += Math.abs(dx);

        // Smoothed rather than last-frame: one jittery sample as the finger
        // lifts should not decide how hard the strip gets thrown.
        var now = (window.performance || Date).now();
        var dt = now - velTs;
        if (dt > 0){
          vel = vel * 0.72 + (dx / (dt / 1000)) * 0.28;
          velTs = now;
        }

        offset -= dx;                     // drag right, strip follows right
        apply();
        recycle();
      }

      function dragEnd(){
        if (!dragging) return;
        dragging = false;
        marqueeWrap.classList.remove('is-dragging');
        // Carry the hand's speed on past the release, the way a native
        // carousel does, then let it decay back into the steady auto-scroll.
        if (dragDist > DRAG_SLOP && Math.abs(vel) > 60){
          fling = -vel;
          if (fling > 2600) fling = 2600;
          if (fling < -2600) fling = -2600;
        }
      }

      // ---- touch ----
      // Pointer events alone are not enough here. On a phone the browser first
      // has to decide whether a gesture belongs to the page or to us, and
      // several mobile browsers resolve "a sideways drag inside a vertically
      // scrolling page" in the page's favour and cancel the pointer stream —
      // which is exactly this strip. Raw touch events leave no room for that
      // negotiation: we pick the axis ourselves and preventDefault() the ones
      // we claim. passive:false is required or that preventDefault is ignored.
      var tStartX = 0, tStartY = 0, tAxis = '';

      marqueeWrap.addEventListener('touchstart', function(e){
        if (e.touches.length !== 1) return;
        touchDriven = true; tAxis = '';
        tStartX = e.touches[0].clientX;
        tStartY = e.touches[0].clientY;
        dragBegin(tStartX);
      }, {passive:true});

      marqueeWrap.addEventListener('touchmove', function(e){
        if (!touchDriven || e.touches.length !== 1) return;
        var t = e.touches[0];
        if (!tAxis){
          var adx = Math.abs(t.clientX - tStartX);
          var ady = Math.abs(t.clientY - tStartY);
          if (adx < 4 && ady < 4) return;          // too early to call it
          // Ties go to the strip: swiping across a row of faces reads as
          // sideways intent even when the finger wanders a little.
          tAxis = adx >= ady ? 'x' : 'y';
          if (tAxis === 'y'){                      // it's a page scroll, let go
            dragging = false; dragDist = 0; touchDriven = false;
            marqueeWrap.classList.remove('is-dragging');
            return;
          }
          marqueeWrap.classList.add('is-dragging');
        }
        if (tAxis !== 'x') return;
        e.preventDefault();                        // page must not scroll under us
        dragTo(t.clientX);
      }, {passive:false});

      marqueeWrap.addEventListener('touchend', function(){
        if (!touchDriven) return;
        dragEnd();
        touchDriven = false;
      });
      marqueeWrap.addEventListener('touchcancel', function(){
        if (!touchDriven) return;
        dragging = false; dragDist = 0; fling = 0; touchDriven = false;
        marqueeWrap.classList.remove('is-dragging');
      });

      // ---- mouse / pen ----
      // Touch is handled above; ignore the pointer events the browser also
      // synthesises for it so a finger drag is not applied twice.
      marqueeWrap.addEventListener('pointerdown', function(e){
        if (touchDriven || e.pointerType === 'touch') return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        dragBegin(e.clientX);
      });

      marqueeWrap.addEventListener('pointermove', function(e){
        if (touchDriven || e.pointerType === 'touch') return;
        if (!dragging) return;
        dragTo(e.clientX);

        // Capture is claimed only once this is unmistakably a drag, never on a
        // plain press. While a pointer is captured the browser retargets the
        // compatibility mouse events to the capturing element, so mousedown and
        // mouseup would both land on the wrapper instead of the <a> underneath —
        // and a click whose two halves share no target fires on the wrapper, so
        // the link never activates. Capturing on pointerdown therefore makes
        // every face unclickable.
        if (!captured && dragDist > DRAG_SLOP){
          captured = true;
          marqueeWrap.classList.add('is-dragging');
          try { marqueeWrap.setPointerCapture(e.pointerId); } catch (err) {}
        }
      });

      function endDrag(e){
        if (touchDriven || (e && e.pointerType === 'touch')) return;
        if (!dragging) return;
        dragEnd();
        if (captured){
          try { marqueeWrap.releasePointerCapture(e.pointerId); } catch (err) {}
          captured = false;
        }
      }
      marqueeWrap.addEventListener('pointerup', endDrag);
      marqueeWrap.addEventListener('pointercancel', endDrag);
      marqueeWrap.addEventListener('lostpointercapture', endDrag);

      // A drag that ends on a face would otherwise also fire that face's click
      // and navigate away. Swallow the click when the pointer actually travelled;
      // capture phase, so it never reaches the link.
      marqueeWrap.addEventListener('click', function(e){
        if (dragDist > DRAG_SLOP){ e.preventDefault(); e.stopPropagation(); }
        dragDist = 0;
      }, true);

      // the browser's own image/link dragging would fight the pointer handlers
      marqueeWrap.addEventListener('dragstart', function(e){ e.preventDefault(); });

      function step(ts){
        // Frame-rate independent: scale by real elapsed time instead of a
        // fixed per-frame amount, so the marquee moves at the same real-world
        // speed on a 60Hz display as on a 120/144Hz one. A stale/huge gap
        // (tab backgrounded, modal open, etc.) is clamped so it can't leap.
        if (lastTs === null) lastTs = ts;
        var dt = Math.min(ts - lastTs, 100);
        lastTs = ts;

        // A flick keeps the strip moving after the finger leaves and decays
        // back to the steady drift, instead of stopping dead the instant
        // contact is lost. While it is running it owns the offset outright —
        // easing the auto-scroll in underneath would fight it.
        if (!dragging && Math.abs(fling) > 20){
          offset += fling * (dt / 1000);
          fling *= Math.exp(-dt / 240);
          currentSpeed = 0;
          apply();
          recycle();
          requestAnimationFrame(step);
          return;
        }
        fling = 0;

        // ease current speed toward the target (0 while paused, full while running)
        // instead of a boolean on/off — glides to a stop and eases back up
        var target = (paused || modalPaused || dragging) ? 0 : SPEED;
        // Stop briskly but resume gently. The old symmetric 200ms constant let
        // the strip coast ~8px after the pointer arrived, which is enough for
        // the face you were aiming at to slide out from under the cursor.
        var ease = 1 - Math.exp(-dt / (target === 0 ? 70 : 200));
        currentSpeed += (target - currentSpeed) * ease;

        // While a drag is in flight the pointer owns the offset; the loop must
        // not also advance it or the strip fights the hand moving it.
        if (!dragging && Math.abs(currentSpeed) > 0.5){
          offset += currentSpeed * (dt / 1000);
          apply();
          // Recycle every item that has fully exited the container edge. A loop
          // rather than a single if: if the geometry is ever knocked out of sync,
          // the strip re-seats itself within one frame instead of visibly
          // stampeding one item per frame until it catches up.
          recycle();
        }
        requestAnimationFrame(step);
      }

      // Continuous auto-scroll is exactly the kind of motion
      // prefers-reduced-motion is meant to suppress; reduced-motion visitors
      // still get the pre-filled, static, clickable strip above.
      if (!reduceMotion) requestAnimationFrame(step);
    })();
  }

  // "انتخاب این درمانگر" -> take the visitor to the free intro form with that
  // counselor already picked.
  //
  // The cards live on the counselors page while both booking forms live on the
  // home page, so the choice has to survive a real page navigation. sessionStorage
  // carries it across and the home page applies it on arrival; the key is consumed
  // on use so a later visit starts from a clean form.
  const COUNSELOR_PICK_KEY = 'hamnava_counselor_pick';

  function applyCounselorSelection(faVal, enVal){
    [['counselor','counselor-en'], ['introCounselor','introCounselor-en']].forEach(pair => {
      const faSel = document.getElementById(pair[0]);
      const enSel = document.getElementById(pair[1]);
      if (faSel){ const o=[...faSel.options].find(x=>x.value===faVal); if(o) faSel.value=faVal; }
      if (enSel){ const o=[...enSel.options].find(x=>x.value===enVal); if(o) enSel.value=enVal; }
    });
  }

  // brief highlight so it is obvious the dropdown was filled in for you rather
  // than left on its default
  function flashIntroCounselorField(){
    ['introCounselor','introCounselor-en'].forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      const field = sel.closest('.field') || sel;
      field.classList.remove('is-autofilled');
      void field.offsetWidth;              // restart the animation on a repeat pick
      field.classList.add('is-autofilled');
      field.addEventListener('animationend', function drop(){
        field.classList.remove('is-autofilled');
        field.removeEventListener('animationend', drop);
      });
    });
  }

  function consumeCounselorPick(){
    let pick = null;
    try { pick = JSON.parse(sessionStorage.getItem(COUNSELOR_PICK_KEY) || 'null'); } catch(e){}
    if (!pick || !pick.fa) return false;
    try { sessionStorage.removeItem(COUNSELOR_PICK_KEY); } catch(e){}
    applyCounselorSelection(pick.fa, pick.en);
    flashIntroCounselorField();
    return true;
  }

  document.querySelectorAll('.counselor-card__select').forEach(btn => {
    btn.addEventListener('click', () => {
      const faVal = btn.getAttribute('data-counselor-fa');
      const enVal = btn.getAttribute('data-counselor-en');
      try { sessionStorage.setItem(COUNSELOR_PICK_KEY, JSON.stringify({ fa: faVal, en: enVal })); } catch(e){}

      // visual feedback on the card itself
      document.querySelectorAll('.counselor-card__select').forEach(b => b.classList.remove('is-selected'));
      btn.classList.add('is-selected');

      // the free intro form only exists on the home page: scroll to it if we are
      // already there, otherwise navigate (relative so file:// still works)
      if (document.getElementById('intro')){
        consumeCounselorPick();
        scrollToAnchor('intro');
        try { history.replaceState(null, '', '#intro'); } catch(e){}
      } else {
        window.location.href = (currentPage() === 'home' ? '' : '../') + 'index.html#intro';
      }
    });
  });

  // arriving on the home page after a pick on the counselors page
  if (document.getElementById('introForm')) consumeCounselorPick();

  // request form submit -> open WhatsApp with pre-filled message
  const form = document.getElementById('requestForm');
  const success = document.getElementById('formSuccess');
  const WHATSAPP_NUMBER = '989387148988';
  if (form){
    form.addEventListener('submit', e => {
      e.preventDefault();
      const lang = document.documentElement.getAttribute('data-lang') === 'en' ? 'en' : 'fa';
      const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };

      const name = val('fullname');
      const phone = val('phone');
      // read the field matching the active language
      const topic = lang === 'en' ? val('topic-en') : val('topic');
      const time = pickLangValue('reqTime', lang);
      const callType = pickLangValue('callType', lang);
      const day = pickLangValue('reqDay', lang);
      const counselor = lang === 'en' ? val('counselor-en') : val('counselor');
      const message = lang === 'en' ? val('message-en') : val('message');

      const labels = {
        fa: { head:'درخواست مشاوره جدید', name:'نام و نام خانوادگی', phone:'شماره تماس', topic:'موضوع مشاوره', callType:'نوع تماس', counselor:'درمانگر انتخابی', day:'روز مورد نظر', time:'بهترین زمان تماس', message:'توضیح' },
        en: { head:'New consultation request', name:'Full Name', phone:'Phone Number', topic:'Topic', callType:'Call Type', counselor:'Selected counselor', day:'Preferred day', time:'Best Time to Call', message:'Message' }
      }[lang];

      let lines = [];
      lines.push(labels.head);
      lines.push('');
      lines.push(labels.name + ': ' + name);
      lines.push(labels.phone + ': ' + phone);
      lines.push(labels.topic + ': ' + topic);
      lines.push(labels.callType + ': ' + callType);
      lines.push(labels.counselor + ': ' + counselor);
      if (day) lines.push(labels.day + ': ' + day);
      lines.push(labels.time + ': ' + time);
      if (message) lines.push(labels.message + ': ' + message);

      const text = encodeURIComponent(lines.join('\n'));
      const url = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + text;

      // set fallback button (in case popup is blocked)
      const fallback = document.getElementById('waFallback');
      if (fallback) fallback.href = url;

      form.style.display = 'none';
      success.classList.add('is-visible');

      // open WhatsApp in a new tab
      window.open(url, '_blank', 'noopener');
    });
  }

  // free intro session form submit -> open WhatsApp with "Free Intro Session" subject
  const introForm = document.getElementById('introForm');
  const introSuccess = document.getElementById('introSuccess');
  if (introForm){
    introForm.addEventListener('submit', e => {
      e.preventDefault();
      const lang = document.documentElement.getAttribute('data-lang') === 'en' ? 'en' : 'fa';
      const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };

      const name = val('introName');
      const phone = val('introPhone');
      const time = pickLangValue('introTime', lang);
      const callType = pickLangValue('introCallType', lang);
      const day = pickLangValue('introDay', lang);
      const counselor = lang === 'en' ? val('introCounselor-en') : val('introCounselor');

      const labels = {
        fa: { head:'درخواست جلسه معارفه رایگان', name:'نام و نام خانوادگی', phone:'شماره تماس', callType:'نوع تماس', counselor:'درمانگر انتخابی', day:'روز مورد نظر', time:'بهترین زمان تماس' },
        en: { head:'Free Intro Session request', name:'Full Name', phone:'Phone Number', callType:'Call Type', counselor:'Selected counselor', day:'Preferred day', time:'Best Time to Call' }
      }[lang];

      let lines = [];
      lines.push(labels.head);
      lines.push('');
      lines.push(labels.name + ': ' + name);
      lines.push(labels.phone + ': ' + phone);
      lines.push(labels.callType + ': ' + callType);
      lines.push(labels.counselor + ': ' + counselor);
      if (day) lines.push(labels.day + ': ' + day);
      lines.push(labels.time + ': ' + time);

      const text = encodeURIComponent(lines.join('\n'));
      const url = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + text;

      const fallback = document.getElementById('introWaFallback');
      if (fallback) fallback.href = url;

      introForm.style.display = 'none';
      introSuccess.classList.add('is-visible');

      window.open(url, '_blank', 'noopener');
    });
  }

  // faq accordion
  document.querySelectorAll('.faq-item').forEach(item => {
    const q = item.querySelector('.faq-item__q');
    const a = item.querySelector('.faq-item__a');
    q.addEventListener('click', () => {
      const isOpen = item.classList.contains('is-open');
      document.querySelectorAll('.faq-item').forEach(other => {
        other.classList.remove('is-open');
        other.querySelector('.faq-item__a').style.maxHeight = null;
      });
      if (!isOpen) {
        item.classList.add('is-open');
        a.style.maxHeight = a.scrollHeight + 'px';
      }
    });
  });

  // scroll reveal — GSAP-powered tween when available, CSS fallback otherwise
  // (kept on the same IntersectionObserver trigger as before, since IO already
  // correctly re-checks elements when the page router / pricing tabs toggle
  // display:none -> block, and a ScrollTrigger-based approach would need
  // manual .refresh() calls at every one of those toggle points)
  const revealEls = document.querySelectorAll('.reveal');

  function revealWithGsap(el){
    if (el.classList.contains('stagger') && el.children.length){
      gsap.fromTo(el, { opacity:0 }, { opacity:1, duration:0.01 });
      gsap.fromTo(el.children,
        { opacity:0, y:18 },
        { opacity:1, y:0, duration:0.6, ease:'power2.out', stagger:0.08 });
    } else {
      gsap.fromTo(el, { opacity:0, y:18 }, { opacity:1, y:0, duration:0.6, ease:'power2.out' });
    }
  }

  if (reduceMotion) {
    revealEls.forEach(el => el.classList.add('is-visible'));
  } else if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          if (hasGsap) revealWithGsap(entry.target);
          else entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    revealEls.forEach(el => io.observe(el));

    // Failsafe. .reveal starts at opacity:0, so anything the observer never
    // reports on would stay invisible forever — which is a blank page, not a
    // missing animation. This used to be covered by the SPA router force-showing
    // the active page's reveals; with real per-URL pages that safety net is gone.
    // Content correctness beats the animation, so shortly after load we reveal
    // whatever is still hidden and already within (or just below) the viewport.
    window.addEventListener('load', () => setTimeout(() => {
      revealEls.forEach(el => {
        if (el.classList.contains('is-visible')) return;
        if (parseFloat(getComputedStyle(el).opacity) > 0) return;
        if (el.getBoundingClientRect().top > window.innerHeight * 1.5) return;
        el.classList.add('is-visible');
        io.unobserve(el);
      });
    }, 600));
  } else {
    revealEls.forEach(el => el.classList.add('is-visible'));
  }

  // (The benefit cards used to hold line-art SVGs that drew themselves in on
  // scroll. They now carry full illustrations, whose entrance is handled by the
  // grid's own `reveal stagger`; a second GSAP tween here would also write an
  // inline transform and win over the CSS hover scale.)

  // ---------- Psychology self-assessment tests ----------
  // Three short, standardized, widely-used public-domain screening
  // instruments (PHQ-9, GAD-7, Rosenberg Self-Esteem Scale). These are
  // screening tools, not diagnoses — every results screen carries that
  // disclaimer. PHQ-9's item 9 (self-harm ideation) gets a dedicated,
  // always-shown crisis notice if answered above "not at all", regardless
  // of the total score, matching standard practice for digital PHQ-9 use.
  (function psychTests(){
    const grid = document.getElementById('testGrid');
    const overlay = document.getElementById('testModal');
    const content = document.getElementById('testModalContent');
    const closeBtn = document.getElementById('testModalClose');
    if (!grid || !overlay || !content) return;

    // Each test is fronted by its own illustration. This file is shared by pages
    // at different depths, so the folder is derived from the stylesheet link the
    // page already carries rather than hard-coded as ../assets/…
    const cssHref = (document.querySelector('link[rel="stylesheet"][href*="site.css"]') || {}).href || '';
    const IL = cssHref.replace(/css\/site\.css.*$/, 'img/il/');
    // Tests added after the illustration set was drawn fall back to their own line
    // icon on a tinted disc rather than pointing at a .webp that does not exist —
    // a deliberate placeholder, not a broken image.
    const artHtml = (test, cls) => test.art
      ? `<img class="${cls}" src="${IL}${test.art}.webp" alt="" width="360" height="360" decoding="async">`
      : `<span class="${cls} test-art-fallback" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none">${test.icon}</svg></span>`;

    const OPTS_FREQ = [
      { label: 'اصلاً', value: 0 },
      { label: 'چند روز', value: 1 },
      { label: 'بیشتر روزها', value: 2 },
      { label: 'تقریباً هر روز', value: 3 }
    ];
    const OPTS_AGREE = [
      { label: 'کاملاً موافقم', value: 3 },
      { label: 'موافقم', value: 2 },
      { label: 'مخالفم', value: 1 },
      { label: 'کاملاً مخالفم', value: 0 }
    ];
    const OPTS_DASS = [
      { label: 'اصلاً برایم صادق نبود', value: 0 },
      { label: 'تا حدی یا گاهی برایم صادق بود', value: 1 },
      { label: 'تا حد قابل‌توجهی یا بخش زیادی از زمان برایم صادق بود', value: 2 },
      { label: 'خیلی زیاد یا بیشتر اوقات برایم صادق بود', value: 3 }
    ];
    const OPTS_PANAS = [
      { label: 'اصلاً یا خیلی‌کم', value: 1 },
      { label: 'کمی', value: 2 },
      { label: 'تا حدی', value: 3 },
      { label: 'زیاد', value: 4 },
      { label: 'خیلی زیاد', value: 5 }
    ];
    const OPTS_BIGFIVE = [
      { label: 'کاملاً نادرست', value: 1 },
      { label: 'نسبتاً نادرست', value: 2 },
      { label: 'نه درست، نه نادرست', value: 3 },
      { label: 'نسبتاً درست', value: 4 },
      { label: 'کاملاً درست', value: 5 }
    ];
    // 16 Personalities uses a 7-point agree/disagree scale, so a neutral middle
    // point exists and every axis can land near 50/50 rather than being forced.
    // ASRS uses a five-point frequency scale, and its Part A scoring depends on
    // exactly where each answer falls on it — so the values must stay 0-4.
    const OPTS_ASRS = [
      { label: 'هرگز', value: 0 },
      { label: 'به‌ندرت', value: 1 },
      { label: 'گاهی اوقات', value: 2 },
      { label: 'اغلب', value: 3 },
      { label: 'خیلی زیاد', value: 4 }
    ];
    const OPTS_MBTI = [
      { label: 'کاملاً مخالفم', value: 1 },
      { label: 'مخالفم', value: 2 },
      { label: 'تا حدی مخالفم', value: 3 },
      { label: 'نظری ندارم', value: 4 },
      { label: 'تا حدی موافقم', value: 5 },
      { label: 'موافقم', value: 6 },
      { label: 'کاملاً موافقم', value: 7 }
    ];

    const TESTS = [
      // The first nine questions ARE the PHQ-9, kept word-for-word and scored on
      // its own 0-27 range with the published cutoffs — lengthening a validated
      // instrument would invalidate exactly the thing that makes it trustworthy.
      // The two sections after it are separate, separately-scored dimensions that
      // cover what a clinician asks next: how much daily life is affected, and
      // which associated symptoms are present.
      {
        id: 'phq9',
        art: 'test-phq9-w',
        name: 'آزمون جامع غربالگری افسردگی',
        subtitle: 'PHQ-9 +',
        short: 'در سه بخش: شدت نشانه‌ها با پرسشنامه استاندارد PHQ-9، میزان اثر آن بر زندگی روزمره، و نشانه‌های همراه — همان سه چیزی که یک روان‌شناس در جلسه اول بررسی می‌کند.',
        about: 'این آزمون از سه بخش تشکیل شده است. بخش اول، پرسشنامه سلامت بیمار ۹-سؤالی (PHQ-9) است؛ یکی از پرکاربردترین و معتبرترین ابزارهای غربالگری افسردگی در دنیا که در مطب‌ها و مراکز درمانی بسیاری از کشورها، از جمله ایران، استفاده می‌شود. این بخش عیناً و بدون تغییر اجرا می‌شود و با همان نقاط برش رسمی خودش (۰ تا ۲۷) نمره‌گذاری می‌شود. بخش دوم می‌سنجد این نشانه‌ها چه‌قدر کار، روابط و کارهای روزمره‌تان را مختل کرده‌اند — نکته‌ای که در تشخیص بالینی افسردگی به‌اندازه خودِ نشانه‌ها اهمیت دارد. بخش سوم به نشانه‌های همراهی می‌پردازد که در PHQ-9 نمی‌آیند اما در تجربه واقعی افسردگی بسیار رایج‌اند: ناامیدی، نشخوار فکری، بی‌حسی عاطفی و دردهای بدنی. هر بخش نتیجه جداگانه خودش را می‌گیرد تا تصویر دقیق‌تری داشته باشید.',
        icon: '<circle cx="12" cy="12" r="9" stroke="#FFFFFF" stroke-width="1.7"/><circle cx="8.5" cy="10" r="1" fill="#FFFFFF"/><circle cx="15.5" cy="10" r="1" fill="#FFFFFF"/><path d="M8 16c1-1.5 2.5-2 4-2s3 .5 4 2" stroke="#FFFFFF" stroke-width="1.7" stroke-linecap="round"/>',
        duration: 'حدود ۵ دقیقه',
        instruction: 'در طول ۲ هفته گذشته، چند بار از هر یک از موارد زیر رنج برده‌اید؟',
        options: OPTS_FREQ,
        questions: [
          // — بخش ۱: PHQ-9 اصلی (بدون تغییر) —
          'بی‌علاقگی یا نداشتن لذت در انجام کارها',
          'احساس غمگینی، افسردگی یا ناامیدی',
          'مشکل در به‌خواب‌رفتن، خواب‌ماندن یا خواب بیش از حد',
          'احساس خستگی یا کمبود انرژی',
          'کم‌اشتهایی یا پرخوری',
          'احساس بد نسبت به خودتان؛ یا اینکه فردی شکست‌خورده هستید یا خود و خانواده‌تان را ناامید کرده‌اید',
          'مشکل در تمرکز روی کارهایی مانند مطالعه یا تماشای تلویزیون',
          'آنقدر آهسته حرکت‌کردن یا صحبت‌کردن که دیگران متوجه شوند؛ یا برعکس، آنقدر بی‌قرار بودن که بیش از حد معمول در حال جنب‌وجوش باشید',
          'افکاری مبنی بر اینکه بهتر است بمیرید یا به‌نوعی به خودتان آسیب بزنید',
          // — بخش ۲: اثر بر زندگی روزمره —
          'این حال‌وهوا باعث شده کار یا تحصیل‌تان عقب بیفتد یا کیفیتش پایین بیاید',
          'انجام کارهای روزمره خانه (خرید، نظافت، غذا درست‌کردن) برایتان سنگین بوده',
          'از دیدن دوستان یا خانواده طفره رفته‌اید یا قرارها را به‌هم زده‌اید',
          'مراقبت از خودتان — خواب منظم، تغذیه، بهداشت شخصی، تحرک — را رها کرده‌اید',
          'برای انجام کارهای ساده هم به تلاش و انرژی بسیار بیشتری از حد معمول نیاز داشته‌اید',
          // — بخش ۳: نشانه‌های همراه —
          'احساس ناامیدی نسبت به آینده و اینکه چیزی بهتر نخواهد شد',
          'فکر کردن مکرر و بی‌پایان به یک موضوع، بدون رسیدن به هیچ نتیجه‌ای (نشخوار فکری)',
          'این احساس که باری بر دوش اطرافیانتان هستید',
          'زودرنجی، بی‌حوصلگی یا عصبانی‌شدن از چیزهای کوچک',
          'نگرانی یا دلشوره‌ای که کنترل‌کردنش سخت بوده',
          'دردهای بدنی، سردرد یا خستگی مزمن، بدون علت پزشکی مشخص',
          'احساس بی‌حسی عاطفی؛ انگار هیچ حسی — نه خوب و نه بد — ندارید',
          'بی‌قراری، یا این احساس که نمی‌توانید آرام بنشینید'
        ],
        crisisIndex: 8,
        // Impression written for the highest severity any sub-scale reached, then
        // the sub-scales that got it there are named above it by the renderer.
        report: {
          levels: [
            { headline: 'در حال حاضر نشانه قابل‌توجهی از افسردگی ثبت نشد',
              body: 'پاسخ‌های شما در هر سه بخش در محدوده‌ای است که معمولاً نگران‌کننده تلقی نمی‌شود. این به معنای «هیچ مشکلی ندارید» نیست؛ یعنی در این دو هفته، الگوی نشانه‌ها به سطحی که نیاز به مداخله داشته باشد نرسیده است. اگر با وجود این نتیجه احساس می‌کنید حالتان خوب نیست، به احساس خودتان اعتماد کنید — یک پرسشنامه فقط همان چیزی را می‌بیند که از آن پرسیده شده.' },
            { headline: 'نشانه‌های خفیف؛ در محدوده‌ای که با مراقبت از خود قابل مدیریت است',
              body: 'الگوی پاسخ‌ها نشان می‌دهد نشانه‌ها حضور دارند اما هنوز زندگی روزمره‌تان را از مسیر خارج نکرده‌اند. از نظر بالینی، این بهترین نقطه برای اقدام است: در این مرحله تغییرهای کوچک در خواب، تحرک و ارتباطات اثر نامتناسبی بزرگ دارند و معمولاً جلوی تبدیل‌شدن نشانه‌ها به یک دوره طولانی را می‌گیرند.' },
            { headline: 'نشانه‌های متوسط؛ نقطه‌ای که مداخله تخصصی بیشترین بازده را دارد',
              body: 'در این سطح، نشانه‌ها دیگر یک حال بدِ گذرا نیستند و روی انرژی، تمرکز و روابط شما اثر گذاشته‌اند. شواهد درمانی نشان می‌دهد شروع درمان در همین محدوده — نه بعدتر — کوتاه‌ترین مسیر بهبود را دارد؛ اغلب چند جلسه روان‌درمانی برای تغییر جهت کافی است. صبر کردن در این نقطه معمولاً فقط مسیر را طولانی‌تر می‌کند.' },
            { headline: 'نشانه‌های قابل‌توجه؛ ارزیابی تخصصی در کوتاه‌ترین زمان توصیه می‌شود',
              body: 'دست‌کم یکی از بخش‌ها در محدوده‌ای قرار گرفته که بررسی تخصصی می‌خواهد. این وضعیت با «تلاش بیشتر» یا «صبر کردن» بهتر نمی‌شود — اما با کمک حرفه‌ای کاملاً قابل‌درمان است؛ افسردگی از پاسخ‌دهنده‌ترین مشکلات روان‌شناختی به درمان است. لطفاً این نتیجه را به تعویق نیندازید.' }
          ],
          steps: [
            ['روال خواب، تحرک و ارتباط با آدم‌های نزدیک را همین‌طور حفظ کنید؛ همین‌ها محافظ اصلی‌اند.',
             'اگر در ماه‌های آینده تغییری در حالتان حس کردید، دوباره این آزمون را بدهید تا نقطه مقایسه داشته باشید.'],
            ['هر روز یک فعالیت کوچکِ لذت‌بخش را عمداً در برنامه بگذارید، حتی وقتی حسش را ندارید — در افسردگی، انگیزه بعد از عمل می‌آید نه قبل از آن.',
             'خواب را در اولویت بگذارید؛ ثابت‌بودن ساعت خواب و بیداری بیشتر از مدت خواب اهمیت دارد.',
             'موضوع را با یک نفر که به او اعتماد دارید در میان بگذارید.',
             'یک جلسه معارفه رایگان بگیرید تا ببینید ادامه‌دادن مسیر درمان برایتان مفید هست یا نه.'],
            ['با یک روان‌شناس وقت بگذارید؛ در این سطح، درمان معمولاً ظرف چند هفته اثر محسوس دارد.',
             'کارها را کوچک کنید و انتظارتان از خودتان را موقتاً پایین بیاورید؛ این تنبلی نیست، مدیریت انرژی است.',
             'بی‌نظمی خواب و مصرف الکل را حذف کنید — هر دو نشانه‌ها را مستقیماً تشدید می‌کنند.',
             'همین گزارش را در جلسه اول به درمانگرتان نشان دهید تا نقطه شروع مشخصی داشته باشید.'],
            ['در اسرع وقت با یک روان‌شناس یا روان‌پزشک وقت بگیرید.',
             'تنها نمانید؛ دست‌کم یک نفر از نزدیکانتان را در جریان حالتان بگذارید.',
             'اگر افکار آسیب‌زدن به خود دارید، همین حالا با اورژانس اجتماعی (۱۲۳) یا اورژانس (۱۱۵) تماس بگیرید.',
             'تصمیم‌های بزرگ زندگی (استعفا، جدایی، مهاجرت) را تا زمان بهبود به تعویق بیندازید؛ افسردگی قضاوت را موقتاً تیره می‌کند.']
          ]
        },
        dimensions: [
          {
            key: 'phq', label: 'شدت نشانه‌های افسردگی (PHQ-9)',
            icon: '<circle cx="12" cy="12" r="8" stroke="#FFFFFF" stroke-width="1.6"/><path d="M8.4 15.2c1-1.3 2.2-1.9 3.6-1.9s2.6.6 3.6 1.9" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round"/>',
            about: 'شدت نُه نشانه اصلی افسردگی در دو هفته گذشته؛ همان نُه معیاری که راهنمای تشخیصی DSM برای افسردگی بررسی می‌کند.',
            indices: [0,1,2,3,4,5,6,7,8], min: 0, max: 27,
            bands: [
              { min:0,  max:4,  label:'حداقلی',        color:'var(--teal)',  level:0, advice:'در پاسخ‌های شما در حال حاضر نشانه قابل‌توجهی از افسردگی دیده نمی‌شود. همین را غنیمت بدانید: خواب کافی، ارتباط با اطرافیان و فعالیت‌های لذت‌بخش را در برنامه‌تان حفظ کنید تا این حال خوب پایدار بماند.' },
              { min:5,  max:9,  label:'خفیف',           color:'var(--gold)',  level:1, advice:'نشانه‌های خفیفی از افسردگی در پاسخ‌های شما دیده می‌شود؛ چیزی که خیلی‌ها در دوره‌های پراسترس زندگی تجربه می‌کنند. معمولاً در این مرحله، چند جلسه صحبت با یک روان‌شناس و مراقبت از سبک زندگی (خواب، ورزش، ارتباطات) می‌تواند به‌خوبی کمک‌کننده باشد و از تشدید آن جلوگیری کند.' },
              { min:10, max:14, label:'متوسط',          color:'var(--gold-deep)', level:2, advice:'الگوی پاسخ‌های شما نشان می‌دهد این روزها افسردگی بخش قابل‌توجهی از انرژی و خلق‌وخوی روزمره‌تان را گرفته است. در این سطح، دریافت مشاوره تخصصی معمولاً تفاوت محسوسی ایجاد می‌کند؛ توصیه می‌شود این نتیجه را با یک روان‌شناس در میان بگذارید.' },
              { min:15, max:19, label:'نسبتاً شدید',    color:'var(--coral)', level:3, advice:'نشانه‌های قابل‌توجهی از افسردگی در پاسخ‌های شما دیده می‌شود که احتمالاً روی کار، روابط و زندگی روزمره‌تان اثر گذاشته است. در این مرحله دریافت مشاوره تخصصی توصیه اکید می‌شود؛ هرچه زودتر شروع کنید، مسیر بهبود کوتاه‌تر خواهد بود.' },
              { min:20, max:27, label:'شدید',           color:'var(--coral)', level:3, advice:'نتیجه شما نشان‌دهنده نشانه‌های شدید افسردگی است. لطفاً این موضوع را جدی بگیرید و در اسرع‌وقت با یک روان‌شناس یا روان‌پزشک صحبت کنید؛ این وضعیت با کمک تخصصی قابل‌درمان است.' }
            ]
          },
          {
            key: 'func', label: 'اثر بر زندگی روزمره',
            icon: '<path d="M4.6 19.4V9.8l7.4-5.2 7.4 5.2v9.6" stroke="#FFFFFF" stroke-width="1.5" stroke-linejoin="round"/><path d="M9.6 19.4v-5.2h4.8v5.2" stroke="#FFFFFF" stroke-width="1.4" stroke-linejoin="round"/>',
            about: 'میزان اختلال نشانه‌ها در کار، خانه، روابط و خودمراقبتی — چیزی که در تشخیص بالینی به‌اندازه خودِ نشانه‌ها وزن دارد.',
            indices: [9,10,11,12,13], min: 0, max: 15,
            bands: [
              { min:0,  max:3,  label:'بدون اختلال قابل‌توجه', color:'var(--teal)',      level:0, advice:'با وجود هر نشانه‌ای که تجربه می‌کنید، زندگی روزمره‌تان تا حد زیادی سرِ جای خودش مانده است. این یک منبع قدرت واقعی است؛ روال‌های روزانه‌تان را حفظ کنید.' },
              { min:4,  max:7,  label:'اختلال خفیف',           color:'var(--gold)',      level:1, advice:'بخشی از کارها و روابط روزمره‌تان تحت‌تأثیر قرار گرفته، اما هنوز از دستتان خارج نشده. کوچک‌کردن کارها و نگه‌داشتن حداقلِ روال روزانه، در این مرحله بیشترین اثر را دارد.' },
              { min:8,  max:11, label:'اختلال متوسط',          color:'var(--gold-deep)', level:2, advice:'نشانه‌ها به‌شکل محسوسی در کار، روابط و مراقبت از خودتان اختلال ایجاد کرده‌اند. وقتی کارکرد روزمره تا این حد آسیب می‌بیند، شروع درمان معمولاً سریع‌تر جواب می‌دهد تا صبر کردن.' },
              { min:12, max:15, label:'اختلال شدید',            color:'var(--coral)',     level:3, advice:'زندگی روزمره‌تان به‌طور جدی مختل شده است. این بخش از نتیجه به‌تنهایی دلیل کافی برای صحبت با یک روان‌شناس است، حتی اگر نمره بخش اول پایین‌تر باشد.' }
            ]
          },
          {
            key: 'assoc', label: 'نشانه‌های همراه',
            icon: '<path d="M12 20.2s-6.6-4-6.6-8.8c0-2.7 1.9-4.6 4.2-4.6 1.2 0 2.3.6 2.4 1.6.1-1 1.2-1.6 2.4-1.6 2.3 0 4.2 1.9 4.2 4.6 0 4.8-6.6 8.8-6.6 8.8Z" stroke="#FFFFFF" stroke-width="1.4" stroke-linejoin="round"/>',
            about: 'نشانه‌هایی که PHQ-9 نمی‌پرسد اما در تجربه واقعی افسردگی رایج‌اند: ناامیدی، نشخوار فکری، بی‌حسی عاطفی و علائم جسمی.',
            indices: [14,15,16,17,18,19,20,21], min: 0, max: 24,
            bands: [
              { min:0,  max:5,  label:'پایین',        color:'var(--teal)',      level:0, advice:'نشانه‌های همراهِ افسردگی در شما کم‌رنگ است؛ ناامیدی و نشخوار فکری فعلاً بخش پررنگی از تجربه‌تان نیست.' },
              { min:6,  max:11, label:'خفیف',          color:'var(--gold)',      level:1, advice:'برخی نشانه‌های همراه — مثل نگرانی، زودرنجی یا فکرهای تکراری — گاهی سراغتان می‌آید. شناختن الگوی آن‌ها معمولاً اولین قدم برای کم‌کردنشان است.' },
              { min:12, max:17, label:'متوسط',         color:'var(--gold-deep)', level:2, advice:'نشانه‌های همراه به‌اندازه‌ای هست که خودش انرژی‌بر باشد. ناامیدی و نشخوار فکری، حتی وقتی نمره افسردگی متوسط است، می‌توانند بهبود را کند کنند؛ این‌ها هدف‌های خوبی برای کار در جلسات درمان‌اند.' },
              { min:18, max:24, label:'بالا',          color:'var(--coral)',     level:3, advice:'سطح بالایی از نشانه‌های همراه را گزارش کرده‌اید. ترکیب ناامیدی، احساس باربودن و بی‌حسی عاطفی تجربه سنگینی است و بهتر است حتماً با یک روان‌شناس در میان گذاشته شود.' }
            ]
          }
        ]
      },
      // Same structure as the depression test: the ten Rosenberg items are the
      // published scale, scored 0-30 with its own cutoffs and its own reverse
      // keying. The two sections after it split what "low self-esteem" actually
      // feels like into the part that hurts (self-criticism) and the part that
      // protects (self-compassion) — two people can share an RSES score and need
      // completely different work.
      {
        id: 'rses',
        art: 'test-rses-w',
        name: 'آزمون جامع عزت‌نفس',
        subtitle: 'RSES +',
        short: 'در سه بخش: عزت‌نفس کلی با مقیاس استاندارد روزنبرگ، شدت خودانتقادی و شرم، و میزان خودشفقتی و پذیرش خود.',
        about: 'این آزمون از سه بخش تشکیل شده است. بخش اول، مقیاس عزت‌نفس روزنبرگ (RSES) است؛ یکی از شناخته‌شده‌ترین ابزارهای روان‌شناسی در دنیا که از دهه ۱۹۶۰ تاکنون در هزاران پژوهش استفاده شده و نگرش کلی شما نسبت به ارزش خودتان را می‌سنجد. این بخش عیناً و با نمره‌گذاری رسمی خودش (۰ تا ۳۰) اجرا می‌شود. اما یک نمره کلی، تمام ماجرا نیست: دو نفر می‌توانند عزت‌نفس یکسانی داشته باشند و کاملاً به کارهای متفاوتی نیاز داشته باشند. برای همین، بخش دوم شدت خودانتقادی، شرم و مقایسه با دیگران را می‌سنجد — یعنی آن صدای درونی سخت‌گیر — و بخش سوم خودشفقتی، مرزگذاری و پذیرش خود را، یعنی همان مهارت‌هایی که در درمان روی آن‌ها کار می‌شود. توجه کنید این آزمون دنبال نشانه بیماری نیست؛ نتیجه‌اش توصیفی از رابطه شما با خودتان است.',
        icon: '<circle cx="10" cy="9" r="3.5" stroke="#FFFFFF" stroke-width="1.7"/><path d="M4 20c0-3.6 2.7-6 6-6s6 2.4 6 6" stroke="#FFFFFF" stroke-width="1.7" stroke-linecap="round"/><path d="M19 4v3.6M17.2 5.8h3.6" stroke="#FFFFFF" stroke-width="1.4" stroke-linecap="round"/>',
        duration: 'حدود ۷ دقیقه',
        instruction: 'میزان موافقت خود را با هر یک از جملات زیر مشخص کنید. پاسخ درست یا غلط وجود ندارد؛ صادقانه‌ترین پاسخ، مفیدترین پاسخ است.',
        options: OPTS_AGREE,
        questions: [
          // — بخش ۱: مقیاس روزنبرگ (بدون تغییر) —
          'احساس می‌کنم فرد باارزشی هستم، دست‌کم به اندازه دیگران',
          'احساس می‌کنم ویژگی‌های خوب زیادی دارم',
          'به‌طور کلی تمایل دارم فکر کنم آدم ناموفقی هستم',
          'می‌توانم کارها را همان‌قدر خوب انجام دهم که اکثر افراد دیگر انجام می‌دهند',
          'احساس می‌کنم چیز زیادی برای افتخار کردن ندارم',
          'نگرش مثبتی نسبت به خودم دارم',
          'در مجموع از خودم راضی هستم',
          'ای‌کاش می‌توانستم احترام بیشتری برای خودم قائل شوم',
          'گاهی واقعاً احساس می‌کنم به‌دردنخور هستم',
          'گاهی فکر می‌کنم اصلاً آدم خوبی نیستم',
          // — بخش ۲: خودانتقادی و شرم —
          'وقتی اشتباهی می‌کنم، مدت‌ها خودم را سرزنش می‌کنم',
          'مدام خودم را با دیگران مقایسه می‌کنم و احساس می‌کنم کم می‌آورم',
          'می‌ترسم اگر دیگران من را واقعاً بشناسند، ناامید شوند',
          'صدای درونی سخت‌گیری دارم که مدام از من ایراد می‌گیرد',
          'اگر کاری را عالی انجام ندهم، احساس می‌کنم شکست خورده‌ام',
          'وقتی از من تعریف می‌شود، فکر می‌کنم اغراق است یا لیاقتش را ندارم',
          'از اینکه دیگران درباره‌ام قضاوت کنند خیلی نگرانم',
          'موفقیت‌هایم را بیشتر به شانس نسبت می‌دهم تا به توانایی خودم',
          // — بخش ۳: خودشفقتی و پذیرش خود —
          'وقتی سختی می‌کشم، با خودم مهربانم — همان‌طور که با یک دوست عزیز رفتار می‌کنم',
          'می‌پذیرم که نقص داشتن بخشی از انسان بودن است، نه نشانه بی‌ارزشی',
          'می‌توانم اشتباهم را بپذیرم و از آن عبور کنم، بدون اینکه ماه‌ها خودم را تنبیه کنم',
          'برای نیازهای خودم هم به‌اندازه نیازهای دیگران ارزش قائلم',
          'وقتی لازم باشد می‌توانم «نه» بگویم، بدون اینکه احساس گناه کنم',
          'باور دارم ارزش من به عملکرد و موفقیت‌هایم گره نخورده است',
          'می‌توانم در روابطم مرزهای سالمی بگذارم و از آن‌ها دفاع کنم',
          'وقتی حالم بد است، می‌توانم از دیگران کمک بخواهم'
        ],
        report: {
          levels: [
            { headline: 'رابطه شما با خودتان در وضعیت سالمی است',
              body: 'هم نگاه کلی‌تان به خودتان مثبت است و هم مهارت‌های محافظ — مهربانی با خود، مرزگذاری و جدا کردن ارزشتان از عملکردتان — در جای خوبی قرار دارند. این ترکیب یکی از قوی‌ترین سپرهای روانی در برابر بحران‌های زندگی است. کاری که لازم است انجام دهید، حفظ همین وضع است.' },
            { headline: 'عزت‌نفس در محدوده طبیعی، با فضایی برای تقویت',
              body: 'مثل بیشتر افراد، روزهای پراعتمادتر و روزهای کم‌اعتمادتر را تجربه می‌کنید. نکته‌ای که ارزش توجه دارد این است که عزت‌نفس پایدار معمولاً از «فکر خوب درباره خود» نمی‌آید، بلکه از کم‌شدن سرزنش درونی و بالا رفتن خودشفقتی می‌آید — یعنی دقیقاً همان دو چیزی که در بخش‌های دوم و سوم سنجیده شد.' },
            { headline: 'رابطه شما با خودتان این روزها زیر فشار است',
              body: 'الگوی پاسخ‌ها نشان می‌دهد نگاهتان به خودتان سخت‌گیرانه شده و منابع محافظ کافی در دسترس نیست. این ترکیب معمولاً خودش را به‌شکل خستگی مزمن، تعلل، یا سختی در پذیرفتن محبت دیگران نشان می‌دهد. مهم است بدانید عزت‌نفس یک ویژگی ثابت شخصیتی نیست؛ ساخته می‌شود و قابل بازسازی است.' },
            { headline: 'خودانتقادی در سطحی است که خودش نیاز به کار دارد',
              body: 'صدای درونی سرزنشگر در شما پررنگ است، و این معمولاً نه یک «ویژگی شخصیتی» بلکه الگویی است که در تجربه‌های گذشته یاد گرفته شده — و چیزی که یاد گرفته شده، قابل تغییر است. زندگی با چنین صدای درونی واقعاً فرساینده است و با «سخت‌گیری بیشتر به خود» درست نمی‌شود. طرحواره‌درمانی و درمان شناختی‌رفتاری دقیقاً برای همین ساخته شده‌اند.' }
          ],
          steps: [
            ['همین رابطه سالم با خودتان را حفظ کنید؛ به‌ویژه عادت‌هایی که باعث می‌شوند در سختی طرف خودتان بایستید.',
             'اگر دوره پرفشاری در پیش دارید، حواستان باشد اولین چیزی که قربانی می‌شود معمولاً همین مهربانی با خود است.'],
            ['یک هفته، هر بار که خودتان را سرزنش کردید یادداشت کنید؛ صرفِ دیدنِ الگو، شدتش را کم می‌کند.',
             'تمرین کنید همان جمله‌ای را به خودتان بگویید که به یک دوست در همان موقعیت می‌گفتید.',
             'یک «نه» کوچک در هفته تمرین کنید تا مرزگذاری از حالت تئوری خارج شود.'],
            ['این نتیجه را با یک روان‌شناس در میان بگذارید؛ کار روی عزت‌نفس یکی از روشن‌ترین اهداف درمانی است.',
             'موفقیت‌های کوچک روزانه را مکتوب کنید — ذهن خودانتقاد آن‌ها را سریع پاک می‌کند.',
             'از مقایسه در شبکه‌های اجتماعی فاصله بگیرید؛ اثرش روی این دو بخش مستقیم و قابل‌اندازه‌گیری است.',
             'به رابطه‌هایی که در آن‌ها مدام احساس ناکافی‌بودن می‌کنید نگاه دوباره‌ای بیندازید.'],
            ['برای کار روی خودانتقادی و شرم با یک روان‌شناس مشورت کنید؛ طرحواره‌درمانی و CBT رویکردهای اصلی این حوزه‌اند.',
             'وقتی صدای سرزنشگر بلند شد، به‌جای بحث با آن، فقط نام‌گذاری‌اش کنید: «این همان صدای منتقد است».',
             'شرم در سکوت رشد می‌کند؛ گفتنِ آنچه از آن خجالت می‌کشید به یک آدم امن، بیشترین اثر را دارد.',
             'اگر این الگو با احساس بی‌ارزشی یا افسردگی همراه شده، حتماً آن را هم ارزیابی کنید.']
          ]
        },
        dimensions: [
          {
            key: 'rses', label: 'عزت‌نفس کلی (روزنبرگ)',
            icon: '<circle cx="12" cy="9" r="3.4" stroke="#FFFFFF" stroke-width="1.6"/><path d="M5.6 19.6c0-3.5 2.9-5.8 6.4-5.8s6.4 2.3 6.4 5.8" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round"/>',
            about: 'نگرش کلی شما نسبت به ارزش خودتان؛ همان چیزی که مقیاس روزنبرگ از دهه ۱۹۶۰ تاکنون می‌سنجد.',
            indices: [0,1,2,3,4,5,6,7,8,9], reverse: [2,4,7,8,9], min: 0, max: 30, higherIsBetter: true,
            bands: [
              { min:0,  max:14, label:'پایین',  color:'var(--coral)', level:2, advice:'به‌نظر می‌رسد این روزها نگاه نسبتاً سخت‌گیرانه‌ای به خودتان دارید و عزت‌نفستان پایین‌تر از حد معمول است. این احساس ثابت یا ذاتی نیست؛ با کار روی الگوهای فکری منفی درباره خود، معمولاً قابل تقویت است. صحبت با یک روان‌شناس می‌تواند نقطه شروع خوبی برای این مسیر باشد.' },
              { min:15, max:25, label:'متوسط',  color:'var(--gold)',  level:1, advice:'عزت‌نفس شما در محدوده طبیعی و متوسطی قرار دارد؛ مثل بیشتر افراد، روزهای پراعتمادتر و روزهای کم‌اعتمادتر را تجربه می‌کنید. اگر دوست دارید این حس ارزشمندی را پایدارتر کنید، کار روی خودآگاهی و مهربانی با خود می‌تواند کمک‌کننده باشد.' },
              { min:26, max:30, label:'بالا',   color:'var(--teal)',  level:0, advice:'عزت‌نفس شما در سطح بالایی قرار دارد و به‌نظر می‌رسد نگاه نسبتاً پذیرا و مثبتی نسبت به خودتان دارید. همین رابطه سالم با خودتان را حفظ کنید؛ این یکی از مهم‌ترین سرمایه‌های روانی برای عبور از چالش‌های زندگی است.' }
            ]
          },
          {
            key: 'crit', label: 'خودانتقادی و شرم',
            icon: '<path d="M12 4.4 20 18.6H4L12 4.4Z" stroke="#FFFFFF" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 10v3.4" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="16" r="0.9" fill="#FFFFFF"/>',
            about: 'شدت صدای درونیِ سرزنشگر: خودانتقادی، شرم، مقایسه با دیگران و ترس از قضاوت شدن.',
            indices: [10,11,12,13,14,15,16,17], min: 0, max: 24, higherIsBetter: false,
            bands: [
              { min:0,  max:5,  label:'پایین',        color:'var(--teal)',      level:0, advice:'صدای درونی‌تان نسبتاً منصف است و به‌ندرت شما را زیر فشار سرزنش می‌گذارد. این یکی از مهم‌ترین محافظ‌های روانی است.' },
              { min:6,  max:11, label:'متوسط',        color:'var(--gold)',      level:1, advice:'گاهی سخت‌گیری با خودتان سراغتان می‌آید — چیزی که تقریباً همه تجربه می‌کنند. مراقب باشید در دوره‌های پرفشار، این صدا بلندتر نشود.' },
              { min:12, max:17, label:'نسبتاً بالا',  color:'var(--gold-deep)', level:2, advice:'خودانتقادی در شما پررنگ است و احتمالاً بخشی از انرژی روزانه‌تان را می‌گیرد. نکته مهم: این الگو معمولاً یاد گرفته شده — و چیزی که یاد گرفته شده، قابل تغییر است. طرحواره‌درمانی و درمان شناختی‌رفتاری دقیقاً روی همین کار می‌کنند.' },
              { min:18, max:24, label:'بالا',          color:'var(--coral)',     level:3, advice:'سطح بالایی از خودانتقادی و شرم را گزارش کرده‌اید. زندگی با چنین صدای درونی سختی واقعاً فرساینده است، و این چیزی نیست که با «تلاش بیشتر» حل شود. صحبت با یک روان‌شناس در این مورد توصیه می‌شود.' }
            ]
          },
          {
            key: 'comp', label: 'خودشفقتی و پذیرش خود',
            icon: '<path d="M12 20s-6.8-4.2-6.8-9C5.2 8.2 7.2 6.3 9.6 6.3c1.2 0 2.4.7 2.4 1.7 0-1 1.2-1.7 2.4-1.7 2.4 0 4.4 1.9 4.4 4.7 0 4.8-6.8 9-6.8 9Z" stroke="#FFFFFF" stroke-width="1.4" stroke-linejoin="round"/>',
            about: 'توانایی مهربانی با خود، مرزگذاری، و جدا کردن ارزش خود از عملکرد — مهارت‌هایی که در درمان روی آن‌ها کار می‌شود.',
            indices: [18,19,20,21,22,23,24,25], min: 0, max: 24, higherIsBetter: true,
            bands: [
              { min:0,  max:7,  label:'پایین',  color:'var(--coral)', level:2, advice:'مهربانی با خود و مرزگذاری هنوز جای کار دارد؛ احتمالاً نیازهای خودتان را آخر از همه می‌بینید و در سختی، اول سراغ سرزنش خودتان می‌روید. خبر خوب اینکه خودشفقتی یک ویژگی ذاتی نیست، یک مهارتِ آموختنی است.' },
              { min:8,  max:15, label:'متوسط',  color:'var(--gold)',  level:1, advice:'تا حدی می‌توانید با خودتان مهربان باشید و مرز بگذارید، اما این توانایی هنوز پایدار نیست و در فشار از دست می‌رود. تمرین‌های خودشفقتی معمولاً سریع‌تر از چیزی که فکر می‌کنید اثر می‌گذارند.' },
              { min:16, max:24, label:'بالا',    color:'var(--teal)',  level:0, advice:'رابطه‌ای پذیرا و حمایت‌گر با خودتان دارید: در سختی طرف خودتان می‌ایستید، بلدید «نه» بگویید و ارزشتان را به عملکردتان گره نزده‌اید. این قوی‌ترین سپر روانی در برابر بحران‌های زندگی است.' }
            ]
          }
        ]
      },
      {
        id: 'dass21',
        art: 'test-dass21-w',
        name: 'مقیاس افسردگی، اضطراب و استرس',
        subtitle: 'DASS-21',
        short: 'یکی از معتبرترین و پراستفاده‌ترین ابزارهای دنیا؛ هم‌زمان سه بعد افسردگی، اضطراب و استرس را در یک هفته اخیر می‌سنجد.',
        about: 'مقیاس افسردگی، اضطراب و استرس (DASS-21) یکی از معتبرترین و پراستفاده‌ترین ابزارهای روان‌شناسی در دنیاست که هم‌زمان سه بعد جداگانه اما مرتبط از تجربه هیجانی — افسردگی، اضطراب و استرس — را در یک هفته اخیر می‌سنجد. برخلاف بسیاری از تست‌ها که فقط یک بعد را بررسی می‌کنند، این آزمون سه امتیاز مجزا به شما می‌دهد تا تصویر کامل‌تری از وضعیت روانی‌تان داشته باشید.',
        icon: '<rect x="4.3" y="10" width="3.4" height="9" rx="1.2" stroke="#FFFFFF" stroke-width="1.5"/><rect x="10.3" y="5.5" width="3.4" height="13.5" rx="1.2" stroke="#FFFFFF" stroke-width="1.5"/><rect x="16.3" y="13" width="3.4" height="6" rx="1.2" stroke="#FFFFFF" stroke-width="1.5"/>',
        duration: 'حدود ۵ دقیقه',
        instruction: 'لطفاً میزان صدق هر جمله را درباره خودتان، در یک هفته گذشته، مشخص کنید. پاسخ «درست» یا «غلط» وجود ندارد؛ فقط بگویید هر جمله تا چه حد برایتان صادق بوده.',
        options: OPTS_DASS,
        questions: [
          'اصلاً نمی‌توانستم هیچ احساس مثبتی را تجربه کنم',
          'برایم سخت بود انگیزه پیدا کنم تا کاری را شروع کنم',
          'احساس می‌کردم چیزی برای امیدواری و انتظار ندارم',
          'احساس دل‌مردگی و غم داشتم',
          'نمی‌توانستم نسبت به هیچ‌چیز شور و اشتیاق پیدا کنم',
          'احساس می‌کردم به‌عنوان یک انسان چندان ارزشی ندارم',
          'احساس می‌کردم زندگی بی‌معناست',
          'متوجه خشکی دهانم می‌شدم',
          'دچار مشکل تنفسی می‌شدم (مثلاً نفس‌نفس‌زدن یا تنگی‌نفس بدون فعالیت بدنی)',
          'دست‌ها یا بدنم می‌لرزید',
          'نگران موقعیت‌هایی بودم که ممکن بود دچار وحشت‌زدگی شوم و خودم را دست‌پاچه نشان دهم',
          'احساس می‌کردم نزدیک است دچار وحشت‌زدگی شوم',
          'ضربان قلبم را حتی بدون فعالیت بدنی احساس می‌کردم (مثلاً افزایش ضربان یا جاافتادن یک ضربان)',
          'بدون دلیل موجه، احساس ترس می‌کردم',
          'برایم سخت بود که آرام بگیرم و از تنش خارج شوم',
          'در برابر موقعیت‌ها بیش‌ازحد واکنش نشان می‌دادم',
          'احساس می‌کردم انرژی عصبی زیادی مصرف می‌کنم',
          'زودتحریک و بی‌قرار می‌شدم',
          'برایم سخت بود که آرامش پیدا کنم',
          'نسبت به هر چیزی که مانع پیشرفت کارم می‌شد، بی‌تحمل بودم',
          'احساس می‌کردم زودرنج و حساس شده‌ام'
        ],
        report: {
          levels: [
            { headline: 'هر سه بُعد در محدوده طبیعی قرار دارند',
              body: 'در هفته گذشته، نه افسردگی، نه اضطراب و نه استرس به سطحی نرسیده‌اند که از نظر بالینی قابل‌توجه باشد. توجه کنید DASS-21 عمداً بازه کوتاهی (یک هفته) را می‌سنجد؛ اگر هفته آرامی داشته‌اید، نتیجه همین را نشان می‌دهد. برای دیدن روند واقعی، بهتر است آزمون را در چند مقطع تکرار کنید.' },
            { headline: 'نشانه‌های خفیف در دست‌کم یکی از سه بُعد',
              body: 'الگوی پاسخ‌ها در محدوده‌ای است که خیلی از افراد در دوره‌های پرفشار تجربه می‌کنند. نکته کلیدی در تفسیر DASS-21 این است که سه بُعد آن مستقل‌اند: بالا بودن استرس در کنار افسردگیِ طبیعی، معنایی کاملاً متفاوت از بالا بودن افسردگی دارد و مسیر مدیریت هرکدام فرق می‌کند.' },
            { headline: 'نشانه‌های متوسط؛ زمان مناسبی برای کمک گرفتن است',
              body: 'دست‌کم یکی از سه بُعد به سطحی رسیده که معمولاً روی خواب، تمرکز و روابط اثر می‌گذارد. در این محدوده، مداخله زودهنگام معمولاً کوتاه و مؤثر است — به این معنا که چند جلسه هدفمند اغلب کافی است و لازم نیست منتظر بمانید تا وضعیت بدتر شود.' },
            { headline: 'نشانه‌های شدید؛ ارزیابی تخصصی توصیه می‌شود',
              body: 'دست‌کم یکی از سه بُعد در محدوده شدید قرار گرفته است. وقتی نمره‌ها تا این حد بالا می‌روند، معمولاً یک چرخه شکل گرفته: تنش خواب را خراب می‌کند، بی‌خوابی تحمل را پایین می‌آورد و همین چرخه خودش را تقویت می‌کند. شکستن این چرخه معمولاً به کمک بیرونی نیاز دارد و کاملاً شدنی است.' }
          ],
          steps: [
            ['وضعیت فعلی‌تان خوب است؛ همین روال خواب، تحرک و استراحت را حفظ کنید.',
             'اگر دوره پرفشاری در پیش دارید، آزمون را بعد از آن تکرار کنید تا اثرش را ببینید.'],
            ['مشخص کنید کدام بُعد بالاتر است و همان را هدف بگیرید؛ راهکار استرس با راهکار افسردگی یکی نیست.',
             'تمرین تنفس یا آرام‌سازی روزی چند دقیقه، بیشترین اثر را روی بُعد استرس و اضطراب دارد.',
             'کافئین و بی‌نظمی خواب را کم کنید؛ هر دو مستقیماً روی بُعد اضطراب اثر می‌گذارند.'],
            ['یک جلسه با روان‌شناس بگذارید و همین گزارش سه‌بُعدی را با خود ببرید.',
             'برای بُعدی که بالاترین نمره را گرفته، یک تغییر مشخص و کوچک این هفته اجرا کنید.',
             'بار کاری و تعهدهایتان را موقتاً کم کنید؛ در این سطح، ظرفیت واقعاً کاهش پیدا کرده است.',
             'خواب را جدی بگیرید — تقریباً همیشه اولین چیزی است که در هر سه بُعد بهبود ایجاد می‌کند.'],
            ['در اولین فرصت با یک روان‌شناس یا روان‌پزشک مشورت کنید.',
             'اگر نشانه‌های جسمی اضطراب (تپش قلب، تنگی نفس) شدید است، بررسی پزشکی هم انجام دهید تا علل جسمانی کنار گذاشته شود.',
             'از خودتان انتظار عملکرد عادی نداشته باشید؛ در این سطح، کم‌کردن بار بخشی از درمان است.',
             'یک نفر امن را در جریان حالتان بگذارید و از او بخواهید پیگیرتان باشد.']
          ]
        },
        dimensions: [
          {
            key: 'dep', label: 'افسردگی', icon: '<path d="M8 15.5c1.2-1.6 2.7-2.2 4-2.2s2.8.6 4 2.2" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round"/>',
            about: 'بی‌لذتی، ناامیدی و احساس بی‌ارزشی در هفته گذشته. این زیرمقیاس روی نبودِ حس مثبت تمرکز دارد، نه بر غم به‌تنهایی.',
            indices: [0,1,2,3,4,5,6], multiplier: 2, min: 0, max: 42,
            bands: [
              { min:0,  max:9,  label:'طبیعی',        color:'var(--teal)',      level:0, advice:'در بُعد افسردگی، پاسخ‌های شما در محدوده طبیعی است. توجه کنید این زیرمقیاس بیشتر «نبودِ حس مثبت» را می‌سنجد تا غم؛ یعنی در هفته گذشته توانایی لذت بردن و امیدواری‌تان حفظ شده است.' },
              { min:10, max:13, label:'خفیف',          color:'var(--gold)',      level:1, advice:'نشانه‌های خفیفی از افسردگی دیده می‌شود؛ احتمالاً انگیزه و لذت کمی کم‌رنگ‌تر از حد معمول بوده است. در این محدوده سه اهرم بیشترین اثر را دارند و هر سه در دسترس شماست: نظم خواب، حرکت بدنی منظم، و ارتباط با آدم‌هایی که حالتان را بهتر می‌کنند.' },
              { min:14, max:20, label:'متوسط',         color:'var(--gold-deep)', level:2, advice:'سطح متوسطی از نشانه‌های افسردگی ثبت شده است. در این محدوده معمولاً کاهش انرژی و بی‌لذتی آن‌قدر هست که خودش مانع انجام همان کارهایی شود که حال آدم را بهتر می‌کنند — چرخه‌ای که شکستنش با کمک بیرونی بسیار ساده‌تر است. چند جلسه روان‌درمانی در این مرحله معمولاً تفاوت محسوسی می‌سازد.' },
              { min:21, max:27, label:'شدید',          color:'var(--coral)',     level:3, advice:'نشانه‌های قابل‌توجهی از افسردگی دیده می‌شود که به‌احتمال زیاد روی کار، خواب و روابط روزمره‌تان اثر گذاشته است. در این سطح توصیه بالینی روشن است: ارزیابی توسط روان‌شناس. مهم است بدانید شدت نشانه‌ها ربطی به «ضعف» ندارد و همین سطح هم به‌خوبی به درمان پاسخ می‌دهد.' },
              { min:28, max:42, label:'بسیار شدید',    color:'var(--coral)',     level:3, advice:'نمره این بُعد در محدوده بسیار شدید قرار دارد. لطفاً این نتیجه را جدی بگیرید و در اولین فرصت با یک روان‌شناس یا روان‌پزشک صحبت کنید. اگر افکار آسیب‌زدن به خود دارید، تماس با اورژانس اجتماعی (۱۲۳) یا اورژانس (۱۱۵) اقدام درست و فوری است.' }
            ]
          },
          {
            key: 'anx', label: 'اضطراب', icon: '<path d="M3 12h3l2-4.5 3 9 2-6 2 3.5h6" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
            about: 'برانگیختگی جسمانی و ترس: لرزش، تپش قلب، خشکی دهان و ترس بدون دلیل روشن.',
            indices: [7,8,9,10,11,12,13], multiplier: 2, min: 0, max: 42,
            bands: [
              { min:0,  max:7,  label:'طبیعی',        color:'var(--teal)',      level:0, advice:'در بُعد اضطراب، پاسخ‌های شما در محدوده طبیعی است. این زیرمقیاس بیشتر روی نشانه‌های جسمانی — تپش قلب، لرزش، خشکی دهان — تمرکز دارد تا نگرانی ذهنی؛ یعنی بدن شما این هفته در حالت آماده‌باش نبوده است.' },
              { min:8,  max:9,  label:'خفیف',          color:'var(--gold)',      level:1, advice:'نشانه‌های خفیفی از اضطراب دیده می‌شود. در این محدوده، تمرین تنفس با بازدمِ طولانی‌تر از دم مؤثرترین ابزار در دسترس است، چون مستقیماً روی همان بخشی از سیستم عصبی اثر می‌گذارد که این نشانه‌ها را می‌سازد. کم‌کردن کافئین هم اثر سریعی دارد.' },
              { min:10, max:14, label:'متوسط',         color:'var(--gold-deep)', level:2, advice:'سطح متوسطی از نشانه‌های جسمی و ذهنی اضطراب ثبت شده است. الگوی رایج در این محدوده این است که فرد کم‌کم موقعیت‌های اضطراب‌آور را دور می‌زند — و همین اجتناب، در کوتاه‌مدت آرام‌بخش اما در بلندمدت تقویت‌کننده اضطراب است. درمان شناختی‌رفتاری دقیقاً روی همین نقطه کار می‌کند.' },
              { min:15, max:19, label:'شدید',          color:'var(--coral)',     level:3, advice:'نشانه‌های قابل‌توجهی از اضطراب دیده می‌شود. در این سطح معمولاً بدن بخش زیادی از روز را در حالت آماده‌باش می‌گذراند، که خستگی و اختلال خواب به دنبال می‌آورد. دریافت مشاوره تخصصی توصیه اکید می‌شود؛ اضطراب از قابل‌درمان‌ترین مشکلات روان‌شناختی است.' },
              { min:20, max:42, label:'بسیار شدید',    color:'var(--coral)',     level:3, advice:'نمره این بُعد در محدوده بسیار شدید قرار دارد. اگر نشانه‌های جسمی مثل تپش قلب یا تنگی نفس پررنگ‌اند، در کنار مراجعه به روان‌شناس یک بررسی پزشکی هم انجام دهید تا علل جسمانی کنار گذاشته شود. لطفاً این را به تعویق نیندازید.' }
            ]
          },
          {
            key: 'str', label: 'استرس', icon: '<path d="M4 16a8 8 0 0 1 16 0" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round"/><path d="M12 16l4-5" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="16" r="1.2" fill="#FFFFFF"/>',
            about: 'تنش مزمن و تحریک‌پذیری: بی‌قراری، سخت آرام‌گرفتن و واکنش بیش‌ازحد به موقعیت‌ها.',
            indices: [14,15,16,17,18,19,20], multiplier: 2, min: 0, max: 42,
            bands: [
              { min:0,  max:14, label:'طبیعی',        color:'var(--teal)',      level:0, advice:'در بُعد استرس، پاسخ‌های شما در محدوده طبیعی است؛ یعنی این هفته توانسته‌اید بعد از فشارها به حالت آرام برگردید. همین توانایی «برگشتن»، مهم‌ترین چیزی است که این زیرمقیاس می‌سنجد.' },
              { min:15, max:18, label:'خفیف',          color:'var(--gold)',      level:1, advice:'سطح خفیفی از تنش و بی‌قراری دیده می‌شود. استرس در این محدوده معمولاً کارکردی است و لزوماً بد نیست؛ فقط حواستان به نشانه‌های هشدار باشد: کوتاه‌شدن فتیله، سخت‌تر به خواب رفتن، و بی‌حوصلگی نسبت به چیزهای کوچک.' },
              { min:19, max:25, label:'متوسط',         color:'var(--gold-deep)', level:2, advice:'سطح متوسطی از استرس و تحریک‌پذیری ثبت شده است. در این محدوده معمولاً چرخه‌ای شکل می‌گیرد: تنش خواب را کم می‌کند، کم‌خوابی تحمل را پایین می‌آورد و همین باعث تنش بیشتر می‌شود. شکستن یکی از حلقه‌های این چرخه — معمولاً خواب — بیشترین بازده را دارد.' },
              { min:26, max:33, label:'شدید',          color:'var(--coral)',     level:3, advice:'نشانه‌های قابل‌توجهی از استرس مزمن دیده می‌شود. استرس در این سطح معمولاً روی خلق و تمرکز هم سرریز می‌کند؛ بنابراین اگر بُعد افسردگی هم بالا رفته باشد، جای تعجب نیست. کم‌کردن واقعی بار کاری و تعهدها در این مرحله نه یک انتخاب، بلکه بخشی از درمان است.' },
              { min:34, max:42, label:'بسیار شدید',    color:'var(--coral)',     level:3, advice:'نمره این بُعد در محدوده بسیار شدید قرار دارد، که مرز نزدیکی با فرسودگی دارد. لطفاً هرچه زودتر با یک روان‌شناس صحبت کنید و هم‌زمان بار مسئولیت‌هایتان را به‌طور واقعی کم کنید؛ در این سطح، تکنیک‌های مدیریت استرس به‌تنهایی معمولاً کافی نیست.' }
            ]
          }
        ]
      },
      {
        id: 'panas',
        art: 'test-panas-w',
        name: 'مقیاس عاطفه مثبت و منفی',
        subtitle: 'PANAS',
        short: 'ابزاری معتبر و بسیار پراستفاده برای سنجش میزان احساسات مثبت (نشاط، اشتیاق) و منفی (تنش، نگرانی) که در هفته اخیر تجربه کرده‌اید.',
        about: 'مقیاس عاطفه مثبت و منفی (PANAS)، اثر واتسون و همکاران، یکی از پراستنادترین ابزارهای روان‌شناسی مثبت‌نگر در دنیاست. این آزمون، برخلاف تست‌های تشخیصی، دنبال «بیماری» نیست؛ بلکه می‌سنجد در هفته اخیر چه میزان احساسات مثبت (نشاط، اشتیاق، انرژی) و چه میزان احساسات منفی (تنش، نگرانی، دل‌خوری) را تجربه کرده‌اید — دو بعد کاملاً مستقل از هم که می‌توانند هم‌زمان بالا یا پایین باشند.',
        icon: '<circle cx="9" cy="9" r="4" stroke="#FFFFFF" stroke-width="1.5"/><path d="M9 2v1.6M9 14.4V16M2 9h1.6M14.4 9H16M4.3 4.3l1.1 1.1M4.3 13.7l1.1-1.1" stroke="#FFFFFF" stroke-width="1.3" stroke-linecap="round"/><path d="M13.5 17c1.9 0 3.4-1.3 3.4-3 0-1.5-1.2-2.8-2.7-3-.4-1.6-2-2.7-3.7-2.4" stroke="#FFFFFF" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>',
        duration: 'کمتر از ۵ دقیقه',
        instruction: 'در هفته گذشته، هر یک از این احساسات را چقدر تجربه کرده‌اید؟',
        options: OPTS_PANAS,
        questions: [
          'علاقه‌مند و کنجکاو',
          'هیجان‌زده',
          'قدرتمند و توانمند',
          'با اشتیاق',
          'مغرور و راضی از خودم',
          'هوشیار و گوش‌به‌زنگ',
          'الهام‌گرفته',
          'مصمم',
          'متمرکز و حواس‌جمع',
          'پرانرژی و فعال',
          'ناراحت و آشفته',
          'دل‌خور و برآشفته',
          'گناه‌کار',
          'ترسیده',
          'خصمانه و پرخاشگر',
          'زودرنج و تحریک‌پذیر',
          'شرمنده',
          'عصبی',
          'دستپاچه و بی‌قرار',
          'هراسان'
        ],
        report: {
          levels: [
            { headline: 'تعادل هیجانی مطلوب در هفته گذشته',
              body: 'ترکیب عاطفه مثبت و منفی شما در وضعیت سالمی است: به‌اندازه کافی انرژی و اشتیاق تجربه کرده‌اید و تنش و ناراحتی هم در حد متعارف بوده است. نکته مهم در تفسیر PANAS این است که این دو بُعد مستقل‌اند — هدف، صفر کردن هیجان منفی نیست (که نه ممکن است نه سالم)، بلکه حفظ منابعی است که هیجان مثبت را تغذیه می‌کنند.' },
            { headline: 'تعادل هیجانی نسبی، با یک بُعد قابل توجه',
              body: 'یکی از دو بُعد در محدوده متوسط است. این معمولاً یعنی هفته‌ای معمولی با فرازونشیب طبیعی داشته‌اید. اگر عاطفه مثبت پایین‌تر است، بیشتر از آنکه «مشکل» باشد، نشانه کم‌شدن سوخت است: فعالیت‌های معنادار، ارتباط و حرکت بدنی سه منبع اصلی این سوخت‌اند.' },
            { headline: 'الگوی هیجانی این هفته نامتعادل بوده است',
              body: 'یا سطح انرژی و اشتیاق شما پایین آمده، یا تنش و ناراحتی بالا رفته — یا هر دو. پایین بودن مداوم عاطفه مثبت (نه فقط بالا بودن عاطفه منفی) یکی از نشانه‌های کلیدی افسردگی است و اغلب از خودِ غم نامحسوس‌تر و مهم‌تر است. اگر این الگو چند هفته ادامه پیدا کرده، ارزش بررسی تخصصی دارد.' }
          ],
          steps: [
            ['منابعی که این حال خوب را می‌سازند — روابط، فعالیت‌ها، اهداف — بشناسید و عمداً حفظشان کنید.',
             'برای دیدن روند، آزمون را چند هفته دیگر تکرار کنید.'],
            ['در هفته پیش‌رو دو فعالیت را که قبلاً انرژی‌بخش بودند عمداً برنامه‌ریزی کنید.',
             'حرکت بدنی منظم، سریع‌ترین اهرم شناخته‌شده برای بالا بردن عاطفه مثبت است.',
             'به این توجه کنید کدام موقعیت‌ها تنش را بالا می‌برند؛ صرفِ شناسایی الگو کمک‌کننده است.'],
            ['اگر این الگو بیش از دو هفته ادامه داشته، آزمون افسردگی را هم انجام دهید یا با یک روان‌شناس صحبت کنید.',
             'روزی یک فعالیت کوچکِ معنادار را در برنامه بگذارید، حتی بدون انگیزه — انگیزه معمولاً بعد از شروع می‌آید.',
             'ارتباط انسانی را کم نکنید؛ انزوا سریع‌ترین راه پایین آوردن عاطفه مثبت است.',
             'خواب و تغذیه را تثبیت کنید؛ اثرشان روی هر دو بُعد مستقیم است.']
          ]
        },
        dimensions: [
          {
            key: 'pa', label: 'عاطفه مثبت (نشاط و انرژی)', icon: '<circle cx="12" cy="12" r="5" stroke="#FFFFFF" stroke-width="1.6"/><path d="M12 3v2.3M12 18.7V21M21 12h-2.3M5.3 12H3M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round"/>',
            about: 'میزان تجربه هیجان‌های مثبت در هفته گذشته: اشتیاق، تمرکز، انرژی و حس توانمندی.',
            indices: [0,1,2,3,4,5,6,7,8,9], min: 10, max: 50, higherIsBetter: true,
            bands: [
              { min:10, max:27, label:'پایین',  color:'var(--coral)',     level:2, advice:'سطح هیجان‌های مثبت شما این هفته پایین بوده است. این یافته از آنچه به‌نظر می‌رسد مهم‌تر است: در ارزیابی بالینی، پایین‌بودن مداوم عاطفه مثبت یکی از نشانه‌های کلیدی افسردگی است و اغلب زودتر از خودِ غم ظاهر می‌شود. سه منبع اصلی این سوخت عبارت‌اند از فعالیت معنادار، ارتباط انسانی و حرکت بدنی.' },
              { min:28, max:40, label:'متوسط',  color:'var(--gold)',      level:1, advice:'سطح هیجان‌های مثبت شما در محدوده متوسط و طبیعی است؛ گاهی پرانرژی و مشتاق بوده‌اید و گاهی کمتر. اگر می‌خواهید این عدد بالاتر برود، معمولاً افزودن فعالیت معنادار مؤثرتر از حذف عوامل منفی است.' },
              { min:41, max:50, label:'بالا',    color:'var(--teal)',      level:0, advice:'این هفته سرشار از نشاط، اشتیاق و انرژی بوده‌اید. ارزش این نتیجه در پایدار نگه‌داشتن آن است: دقیقاً بشناسید کدام روابط، کدام فعالیت‌ها و کدام اهداف این حس را ساختند، و عمداً در برنامه‌تان نگهشان دارید.' }
            ]
          },
          {
            key: 'na', label: 'عاطفه منفی (تنش و ناراحتی)', icon: '<path d="M4 16a8 8 0 0 1 16 0" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round"/><path d="M9 9.5l1.6 1.6M10.6 9.5 9 11.1M13.4 9.5 15 11.1M15 9.5l-1.6 1.6" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round"/>',
            about: 'میزان تجربه هیجان‌های منفی در هفته گذشته: تنش، ترس، شرم و تحریک‌پذیری. این دو بُعد مستقل‌اند و می‌توانند هم‌زمان بالا باشند.',
            indices: [10,11,12,13,14,15,16,17,18,19], min: 10, max: 50, higherIsBetter: false,
            bands: [
              { min:10, max:17, label:'پایین',  color:'var(--teal)',      level:0, advice:'سطح هیجان‌های منفی شما این هفته پایین بوده است — نشانه خوبی از ثبات هیجانی در این دوره. توجه کنید هدفِ سالم، صفر کردن هیجان منفی نیست؛ هیجان منفی کارکرد دارد و در حد متعارف بخشی از تجربه طبیعی انسان است.' },
              { min:18, max:27, label:'متوسط',  color:'var(--gold)',      level:1, advice:'میزانی متعارف از تنش، نگرانی یا دل‌خوری را این هفته تجربه کرده‌اید. برای بیشتر افراد این محدوده طبیعی است، به‌ویژه در هفته‌هایی که فشار بیرونی وجود داشته باشد.' },
              { min:28, max:50, label:'بالا',    color:'var(--coral)',     level:2, advice:'سطح قابل‌توجهی از هیجان‌های منفی — تنش، ترس، شرم یا تحریک‌پذیری — را این هفته تجربه کرده‌اید. اگر این الگو بیش از دو تا سه هفته ادامه پیدا کند، دیگر «یک هفته بد» نیست و ارزش بررسی تخصصی دارد؛ تکمیل آزمون DASS-21 می‌تواند تصویر دقیق‌تری بدهد.' }
            ]
          }
        ]
      },
      // ASRS v1.1 — the WHO adult ADHD self-report scale. All eighteen items map
      // onto the DSM criteria: nine inattention, nine hyperactivity/impulsivity.
      // Part A (the first six) is the validated screener and is scored by its own
      // published rule — a count of items crossing a per-item frequency threshold,
      // NOT a sum — which is why this test carries `thresholds` instead of relying
      // on the usual addition. The two symptom-domain totals after it are reported
      // as descriptive severity, never as a diagnosis.
      {
        id: 'asrs',
        art: 'test-asrs-w',
        name: 'آزمون غربالگری بیش‌فعالی و کم‌توجهی بزرگسالان',
        subtitle: 'ASRS v1.1',
        short: 'پرسشنامه رسمی سازمان جهانی بهداشت برای غربالگری ADHD در بزرگسالان؛ هر ۱۸ سؤال آن بر معیارهای تشخیصی DSM منطبق است و نتیجه در سه بخش گزارش می‌شود.',
        about: 'مقیاس خودگزارشی ADHD بزرگسالان (ASRS v1.1) توسط سازمان جهانی بهداشت با همکاری گروهی از پژوهشگران دانشگاه هاروارد تدوین شده و شناخته‌شده‌ترین ابزار غربالگری بیش‌فعالی و کم‌توجهی در بزرگسالان است. هر هجده سؤال آن مستقیماً از معیارهای تشخیصی DSM گرفته شده: نُه نشانه کم‌توجهی و نُه نشانه بیش‌فعالی و تکانشگری. شش سؤال اول، بخش A یا همان «غربالگر» رسمی است و با قاعده نمره‌گذاری اختصاصی خودش محاسبه می‌شود — یعنی شمردن سؤال‌هایی که از آستانه مشخص خود عبور کرده‌اند، نه جمع ساده نمره‌ها. دو بخش بعدی، بار نشانه‌ها را در دو حوزه اصلی نشان می‌دهند. نکته بسیار مهم: ADHD تنها زمانی تشخیص داده می‌شود که نشانه‌ها از کودکی وجود داشته باشند و در بیش از یک محیط زندگی (مثلاً هم خانه و هم محل کار) اختلال ایجاد کنند؛ هیچ پرسشنامه‌ای نمی‌تواند این دو شرط را بررسی کند. بسیاری از نشانه‌های این آزمون در بی‌خوابی مزمن، اضطراب، افسردگی و تجربه‌های آسیب‌زا هم دیده می‌شوند و افتراق آن‌ها فقط با ارزیابی تخصصی ممکن است.',
        icon: '<path d="M12 3.2c-2.4 0-4.2 1.7-4.2 3.9 0 .7.2 1.4.5 2-1.3.7-2.1 2-2.1 3.5 0 1.4.7 2.6 1.8 3.4-.2.5-.3 1-.3 1.5 0 2.1 1.9 3.8 4.3 3.8" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 3.2c2.4 0 4.2 1.7 4.2 3.9 0 .7-.2 1.4-.5 2 1.3.7 2.1 2 2.1 3.5 0 1.4-.7 2.6-1.8 3.4.2.5.3 1 .3 1.5 0 2.1-1.9 3.8-4.3 3.8" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 3.2v17.6" stroke="#FFFFFF" stroke-width="1.3" stroke-dasharray="2 2.4" opacity="0.75"/>',
        duration: 'حدود ۵ دقیقه',
        instruction: 'در ۶ ماه گذشته، هر یک از موارد زیر چند وقت یک‌بار برایتان پیش آمده است؟ به الگوی معمول زندگی‌تان فکر کنید، نه به یک روز خاص.',
        options: OPTS_ASRS,
        questions: [
          // — بخش A: غربالگر رسمی (سؤال ۱ تا ۶) —
          'وقتی بخش‌های سخت یک کار تمام شده، چند وقت یک‌بار در جمع‌کردن جزئیات پایانی آن مشکل دارید؟',
          'چند وقت یک‌بار در مرتب‌کردن کارهایی که به نظم و سازمان‌دهی نیاز دارند دچار مشکل می‌شوید؟',
          'چند وقت یک‌بار به‌یادآوردن قرارها یا تعهدهایتان برایتان مشکل‌ساز می‌شود؟',
          'وقتی کاری نیاز به فکر زیاد دارد، چند وقت یک‌بار شروع‌کردنش را به تعویق می‌اندازید یا از آن طفره می‌روید؟',
          'وقتی مجبورید مدت طولانی بنشینید، چند وقت یک‌بار دست‌ها یا پاهایتان بی‌قرار می‌شود و تکان می‌خورد؟',
          'چند وقت یک‌بار احساس می‌کنید بیش‌ازحد پرتحرک هستید و انگار موتوری شما را به انجام کارها وامی‌دارد؟',
          // — بخش B: نشانه‌های تکمیلی (سؤال ۷ تا ۱۸) —
          'وقتی روی کاری کسل‌کننده یا دشوار کار می‌کنید، چند وقت یک‌بار دچار اشتباهات ناشی از بی‌دقتی می‌شوید؟',
          'هنگام انجام کارهای کسل‌کننده یا تکراری، چند وقت یک‌بار حفظ تمرکز برایتان دشوار است؟',
          'چند وقت یک‌بار تمرکز روی حرف دیگران برایتان سخت است، حتی وقتی مستقیماً با شما صحبت می‌کنند؟',
          'چند وقت یک‌بار وسایلتان را در خانه یا محل کار گم می‌کنید یا در پیداکردنشان مشکل دارید؟',
          'چند وقت یک‌بار سروصدا یا رفت‌وآمد اطرافتان حواس شما را پرت می‌کند؟',
          'در جلسه‌ها یا موقعیت‌هایی که انتظار می‌رود سرجایتان بنشینید، چند وقت یک‌بار از جایتان بلند می‌شوید؟',
          'چند وقت یک‌بار احساس بی‌قراری یا ناآرامی می‌کنید؟',
          'وقتی وقت آزاد دارید، چند وقت یک‌بار آرام‌گرفتن و استراحت‌کردن برایتان دشوار است؟',
          'در موقعیت‌های اجتماعی، چند وقت یک‌بار متوجه می‌شوید بیش از حد حرف می‌زنید؟',
          'در گفت‌وگو، چند وقت یک‌بار جمله طرف مقابل را پیش از آنکه خودش تمام کند، شما تمام می‌کنید؟',
          'در موقعیت‌هایی که باید نوبت را رعایت کرد، چند وقت یک‌بار منتظرماندن برایتان سخت است؟',
          'چند وقت یک‌بار حرف دیگران را قطع می‌کنید، در حالی که آن‌ها مشغول کاری هستند؟'
        ],
        dimensions: [
          {
            key: 'partA', label: 'غربالگر رسمی (بخش A)',
            icon: '<path d="M5 12.4l4.4 4.4L19 7.2" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
            about: 'شش سؤال اول، غربالگر معتبر ASRS است. نمره‌گذاری آن شمارش است نه جمع: هر سؤال آستانه فراوانی مخصوص خودش را دارد و اینجا شمرده می‌شود چند سؤال از آستانه‌اش عبور کرده‌اند. عبور ۴ سؤال یا بیشتر، نقطه برش رسمی این ابزار است.',
            indices: [0,1,2,3,4,5],
            // items 1-3 count from "گاهی اوقات" upward, items 4-6 only from "اغلب"
            thresholds: { 0:2, 1:2, 2:2, 3:3, 4:3, 5:3 },
            min: 0, max: 6,
            bands: [
              { min:0, max:1, label:'منفی',            color:'var(--teal)',      level:0, advice:'تعداد نشانه‌های عبورکرده از آستانه، بسیار کمتر از نقطه برش است. الگوی پاسخ‌های شما با ADHD بزرگسالان همخوانی ندارد. اگر با این حال در تمرکز یا نظم مشکل دارید، علت را جای دیگری جست‌وجو کنید — کم‌خوابی، اضطراب و فشار کاری شایع‌ترین گزینه‌ها هستند.' },
              { min:2, max:3, label:'زیر نقطه برش',    color:'var(--gold)',      level:1, advice:'بخشی از نشانه‌ها را دارید، اما تعدادشان به نقطه برش رسمی (۴ از ۶) نمی‌رسد. این وضعیت نه رد و نه تأیید ADHD است. اگر همین نشانه‌ها در عمل برایتان دردسر می‌سازند، بخش‌های بعدی همین گزارش و صحبت با یک متخصص تصویر روشن‌تری می‌دهند.' },
              { min:4, max:5, label:'مثبت',            color:'var(--gold-deep)', level:2, advice:'الگوی پاسخ‌های شما با نشانه‌های ADHD بزرگسالان همخوانی دارد و نتیجه غربالگر مثبت است. دقت کنید معنای این نتیجه «شما ADHD دارید» نیست؛ معنایش این است که ارزیابی تخصصی توجیه دارد. تشخیص قطعی نیازمند مصاحبه بالینی، بررسی سابقه کودکی و کنار گذاشتن علل دیگر است.' },
              { min:6, max:6, label:'مثبت قوی',        color:'var(--coral)',     level:3, advice:'هر شش سؤال غربالگر از آستانه خود عبور کرده‌اند؛ یعنی نشانه‌ها هم پرشمار و هم پرتکرارند. این قوی‌ترین نتیجه‌ای است که این ابزار می‌تواند بدهد و انجام یک ارزیابی تخصصی کامل به‌طور جدی توصیه می‌شود.' }
            ]
          },
          {
            key: 'inat', label: 'بار نشانه‌های کم‌توجهی',
            icon: '<circle cx="12" cy="12" r="8" stroke="#FFFFFF" stroke-width="1.5" stroke-dasharray="3.4 2.6"/><path d="M12 8.4v4l2.6 1.6" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
            about: 'جمع نُه نشانه کم‌توجهی طبق معیارهای DSM: حواس‌پرتی، فراموشی، بی‌نظمی، تعلل و دشواری در حفظ تمرکز. این عدد شدت را نشان می‌دهد، نه تشخیص را.',
            indices: [0,1,2,3,6,7,8,9,10], min: 0, max: 36,
            bands: [
              { min:0,  max:9,  label:'پایین',        color:'var(--teal)',      level:0, advice:'نشانه‌های کم‌توجهی در شما کم‌رنگ است؛ تمرکز، نظم و پیگیری کارها به‌طور کلی برایتان قابل‌مدیریت است.' },
              { min:10, max:17, label:'خفیف',          color:'var(--gold)',      level:1, advice:'نشانه‌های خفیفی از کم‌توجهی دارید. این سطح در جمعیت عمومی بسیار شایع است و اغلب با ساختاردهی بیرونی — تقویم، فهرست کار، حذف عوامل حواس‌پرتی — قابل جبران است.' },
              { min:18, max:26, label:'متوسط',         color:'var(--gold-deep)', level:2, advice:'بار نشانه‌های کم‌توجهی در حد متوسط است و به احتمال زیاد روی بهره‌وری کاری یا تحصیلی‌تان اثر گذاشته. الگوی رایج در این سطح این است که فرد با تلاش مضاعف جبران می‌کند و همین جبرانِ دائمی، خودش خسته‌کننده می‌شود.' },
              { min:27, max:36, label:'بالا',          color:'var(--coral)',     level:3, advice:'بار نشانه‌های کم‌توجهی بالاست. در این سطح، مشکل معمولاً دیگر با «تلاش بیشتر» یا «نظم شخصی» حل نمی‌شود و ارزیابی تخصصی می‌تواند تفاوت واقعی ایجاد کند — چه تشخیص ADHD باشد و چه علت دیگری پشت آن.' }
            ]
          },
          {
            key: 'hyp', label: 'بار نشانه‌های بیش‌فعالی و تکانشگری',
            icon: '<path d="M13.4 3 5.6 13.6h5.1L10.6 21l7.8-10.6h-5.1L13.4 3Z" stroke="#FFFFFF" stroke-width="1.4" stroke-linejoin="round"/>',
            about: 'جمع نُه نشانه بیش‌فعالی و تکانشگری طبق معیارهای DSM: بی‌قراری، دشواری در آرام‌گرفتن، پرحرفی، قطع‌کردن حرف دیگران و سختی در رعایت نوبت.',
            indices: [4,5,11,12,13,14,15,16,17], min: 0, max: 36,
            bands: [
              { min:0,  max:9,  label:'پایین',        color:'var(--teal)',      level:0, advice:'نشانه‌های بیش‌فعالی و تکانشگری در شما کم‌رنگ است؛ آرام‌گرفتن، صبر کردن و رعایت نوبت معمولاً برایتان دشوار نیست.' },
              { min:10, max:17, label:'خفیف',          color:'var(--gold)',      level:1, advice:'نشانه‌های خفیفی از بی‌قراری یا تکانشگری دارید. در بزرگسالان، بیش‌فعالی معمولاً به‌شکل بی‌قراری درونی بروز می‌کند تا تحرک بیرونی — یعنی حسی که «نمی‌توانم واقعاً آرام بگیرم».' },
              { min:18, max:26, label:'متوسط',         color:'var(--gold-deep)', level:2, advice:'بار نشانه‌ها در حد متوسط است. تکانشگری در این سطح معمولاً بیش از خودِ فرد، روی روابط اثر می‌گذارد: قطع‌کردن حرف، تصمیم‌های عجولانه و کم‌صبری در گفت‌وگو از پیامدهای رایج آن است.' },
              { min:27, max:36, label:'بالا',          color:'var(--coral)',     level:3, advice:'بار نشانه‌های بیش‌فعالی و تکانشگری بالاست. در این سطح، پیامدهای عملی — تصمیم‌های ناگهانی، تنش در روابط و ناتوانی در استراحت — معمولاً محسوس‌اند و ارزیابی تخصصی توصیه می‌شود.' }
            ]
          }
        ],
        report: {
          // the verdict is Part A's alone — see impressionHtml
          levelFrom: 'partA',
          levels: [
            { headline: 'غربالگر منفی؛ الگوی پاسخ‌ها با ADHD بزرگسالان همخوانی ندارد',
              body: 'نه غربالگر رسمی و نه بار نشانه‌ها در محدوده‌ای نیست که ADHD را مطرح کند. اگر با وجود این نتیجه در تمرکز، نظم یا آرام‌گرفتن مشکل دارید، این را نادیده نگیرید — همین نشانه‌ها در کم‌خوابی مزمن، اضطراب، افسردگی و دوره‌های پرفشار زندگی هم دیده می‌شوند و مسیر رسیدگی به هرکدام متفاوت است.' },
            { headline: 'نشانه‌های خفیف؛ زیر نقطه برش رسمی',
              body: 'بخشی از نشانه‌ها وجود دارد اما به آستانه غربالگری نمی‌رسد. تعداد قابل‌توجهی از بزرگسالان در این محدوده قرار می‌گیرند بدون آنکه ADHD داشته باشند. معیار عملی ساده‌ای که می‌توانید به کار ببرید این است: آیا این نشانه‌ها در بیش از یک بخش زندگی‌تان — مثلاً هم کار و هم روابط — واقعاً هزینه ایجاد می‌کنند؟ اگر پاسخ بله است، ارزش پیگیری دارد.' },
            { headline: 'غربالگر مثبت؛ ارزیابی تخصصی توجیه دارد',
              body: 'الگوی پاسخ‌های شما با نشانه‌های ADHD بزرگسالان همخوانی دارد. مهم است این جمله دقیق خوانده شود: نتیجه مثبت در یک غربالگر به معنای تشخیص نیست، به معنای این است که بررسی دقیق‌تر منطقی است. تشخیص واقعی به مصاحبه بالینی، بررسی سابقه دوران کودکی و کنار گذاشتن علل دیگر نیاز دارد — و همین کنار گذاشتن علل دیگر است که کار را تخصصی می‌کند.' },
            { headline: 'نشانه‌های پرشمار و پرتکرار؛ ارزیابی تخصصی جداً توصیه می‌شود',
              body: 'هم غربالگر رسمی و هم بار نشانه‌ها در بالاترین محدوده‌اند. الگویی به این شدت معمولاً پیامدهای واقعی در کار، تحصیل یا روابط دارد. خبر خوب این است که ADHD بزرگسالان از قابل‌مدیریت‌ترین وضعیت‌هاست: ترکیب آموزش مهارت‌های سازمان‌دهی، روان‌درمانی و در صورت نیاز دارودرمانی، در بیشتر افراد تفاوت چشمگیری ایجاد می‌کند.' }
          ],
          steps: [
            ['اگر مشکل تمرکز دارید ولی این آزمون منفی شد، ابتدا خواب و سطح استرس را بررسی کنید؛ هر دو مستقیماً تمرکز را کاهش می‌دهند.',
             'آزمون DASS-21 می‌تواند نشان دهد آیا اضطراب یا افسردگی پشت این نشانه‌ها هست یا نه.'],
            ['یک هفته یادداشت کنید نشانه‌ها دقیقاً کجا هزینه ایجاد می‌کنند؛ همین یادداشت، مفیدترین چیزی است که می‌توانید به جلسه ارزیابی ببرید.',
             'ساختار بیرونی بسازید: تقویم، یادآور، فهرست کوتاه کار روزانه و حذف اعلان‌های غیرضروری.',
             'خواب منظم را جدی بگیرید؛ کم‌خوابی مزمن، نشانه‌های شبیه ADHD تولید می‌کند.'],
            ['برای ارزیابی تخصصی با یک روان‌شناس یا روان‌پزشک آشنا با ADHD بزرگسالان وقت بگیرید.',
             'پیش از جلسه، به یاد بیاورید نشانه‌ها از چه سنی شروع شده‌اند؛ سابقه دوران کودکی یکی از ارکان تشخیص است.',
             'اگر ممکن است، نظر یک نفر نزدیک (همسر، والدین، همکار) را هم بپرسید — گزارش دیگران بخش مهمی از ارزیابی است.',
             'همین گزارش سه‌بخشی را در جلسه اول همراه داشته باشید تا نقطه شروع مشخصی وجود داشته باشد.'],
            ['در اولین فرصت برای ارزیابی تخصصی اقدام کنید؛ در این سطح، صبر کردن معمولاً فقط هزینه‌های کاری و ارتباطی را بیشتر می‌کند.',
             'سابقه دوران کودکی و مدارک تحصیلی قدیمی را در صورت وجود همراه ببرید.',
             'تا زمان ارزیابی، بار کاری را ساده و کارها را کوچک کنید؛ سیستم‌های پیچیده مدیریت زمان معمولاً در این سطح شکست می‌خورند.',
             'اگر همراه با این نشانه‌ها خلق پایین یا اضطراب دارید، حتماً آن را هم مطرح کنید — همراهی این‌ها با ADHD بسیار شایع است و بر مسیر درمان اثر می‌گذارد.']
          ]
        }
      },
      {
        id: 'bigfive',
        art: 'test-bigfive-w',
        name: 'آزمون شخصیت پنج عامل بزرگ',
        subtitle: 'IPIP-50',
        short: 'معروف‌ترین و علمی‌ترین مدل شخصیت‌شناسی در روان‌شناسی امروز؛ شخصیت شما را در ۵ بعد اصلی توصیف می‌کند.',
        about: 'مدل پنج‌عاملی شخصیت (Big Five) پذیرفته‌شده‌ترین و علمی‌ترین چارچوب روان‌شناسی برای توصیف شخصیت انسان است. این نسخه از آزمون از مجموعه آزاد و عمومی IPIP گرفته شده و شخصیت شما را در پنج بعد اصلی — برون‌گرایی، دلپذیربودن، وظیفه‌شناسی، ثبات هیجانی و گشودگی به تجربه — توصیف می‌کند. توجه کنید این آزمون، برخلاف بقیه تست‌های این بخش، دنبال نشانه بیماری نیست؛ نتیجه‌اش فقط یک توصیف شخصیتی است، نه یک ارزیابی خوب یا بد.',
        icon: '<path d="M12 3l2.5 6 6.5.6-4.9 4.3 1.5 6.4L12 16.9l-5.6 3.4 1.5-6.4-4.9-4.3 6.5-.6L12 3Z" stroke="#FFFFFF" stroke-width="1.5" stroke-linejoin="round"/>',
        duration: 'حدود ۸ تا ۱۰ دقیقه',
        instruction: 'مشخص کنید هر جمله، به‌عنوان توصیفی از شما، چقدر درست یا نادرست است. پاسخ خوب یا بد وجود ندارد؛ فقط صادقانه پاسخ دهید.',
        options: OPTS_BIGFIVE,
        questions: [
          'در جمع، معمولاً روح و شور جمع هستم',
          'زیاد حرف نمی‌زنم',
          'در کنار دیگران احساس راحتی می‌کنم',
          'ترجیح می‌دهم در حاشیه بمانم و کمتر دیده شوم',
          'به‌راحتی گفت‌وگو را شروع می‌کنم',
          'حرف چندانی برای گفتن ندارم',
          'در مهمانی‌ها با آدم‌های زیادی صحبت می‌کنم',
          'دوست ندارم توجه دیگران را به خودم جلب کنم',
          'مشکلی ندارم که مرکز توجه باشم',
          'کنار افراد غریبه ساکت می‌شوم',
          'دغدغه چندانی نسبت به دیگران ندارم',
          'به آدم‌ها علاقه دارم',
          'به دیگران توهین می‌کنم',
          'با احساسات دیگران همدلی می‌کنم',
          'مشکلات دیگران برایم چندان مهم نیست',
          'دل‌نازکی دارم',
          'واقعاً به دیگران علاقه‌ای ندارم',
          'برای دیگران وقت می‌گذارم',
          'احساسات دیگران را درک می‌کنم',
          'باعث می‌شوم دیگران احساس راحتی کنند',
          'همیشه آماده و سروقت هستم',
          'وسایلم را همین‌جا و آن‌جا ول می‌کنم',
          'به جزئیات کارها دقت می‌کنم',
          'کارها را به‌هم می‌ریزم',
          'کارهایم را فوری و بدون معطلی انجام می‌دهم',
          'اغلب یادم می‌رود وسایل را سرجایشان برگردانم',
          'نظم و ترتیب را دوست دارم',
          'از زیر مسئولیت‌هایم شانه خالی می‌کنم',
          'طبق برنامه زمانی مشخص پیش می‌روم',
          'در کارهایم بسیار دقیق و موشکاف هستم',
          'به‌سرعت دچار استرس می‌شوم',
          'بیشتر اوقات آرام و ریلکس هستم',
          'نگران خیلی چیزها می‌شوم',
          'به‌ندرت غمگین می‌شوم',
          'به‌راحتی برانگیخته و ناآرام می‌شوم',
          'زود دل‌خور و ناراحت می‌شوم',
          'خلق‌وخویم زیاد تغییر می‌کند',
          'نوسانات خلقی زیادی دارم',
          'زود عصبانی می‌شوم',
          'اغلب احساس غمگینی می‌کنم',
          'دایره واژگان غنی‌ای دارم',
          'درک ایده‌های انتزاعی برایم سخت است',
          'تخیل قوی‌ای دارم',
          'به ایده‌های انتزاعی علاقه‌ای ندارم',
          'ایده‌های خیلی خوبی به ذهنم می‌رسد',
          'تخیل قوی‌ای ندارم',
          'زود متوجه منظور چیزها می‌شوم',
          'از کلمات پیچیده استفاده می‌کنم',
          'وقت زیادی صرف تأمل و تفکر می‌کنم',
          'ذهنم پر از ایده است'
        ],
        report: {
          levels: [
            { headline: 'پروفایل شخصیتی شما در پنج عامل بزرگ',
              body: 'این نتیجه یک ارزیابی سلامت روان نیست؛ توصیفی از سبک طبیعی شماست. در مدل پنج عامل بزرگ هیچ نمره‌ای «خوب» یا «بد» نیست — هر جایگاهی روی هر عامل، هم مزیت دارد و هم هزینه. آنچه ارزش توجه دارد، عامل‌هایی است که در دو سر طیف قرار گرفته‌اند: همان‌ها معمولاً هم بیشترین قدرت شما را می‌سازند و هم جایی هستند که الگوهای تکراری زندگی‌تان از آن‌جا می‌آیند.' },
            { headline: 'پروفایل شخصیتی شما در پنج عامل بزرگ',
              body: 'این نتیجه یک ارزیابی سلامت روان نیست؛ توصیفی از سبک طبیعی شماست. هیچ نمره‌ای در این مدل «خوب» یا «بد» نیست — هر جایگاهی روی هر عامل، هم مزیت دارد و هم هزینه.' },
            { headline: 'یک نکته در پروفایل شما ارزش توجه دارد',
              body: 'در بین پنج عامل، «ثبات هیجانی» شما در محدوده پایین قرار گرفته است. برخلاف چهار عامل دیگر که کاملاً توصیفی‌اند، این یکی با سلامت روان رابطه مستقیم دارد: نمره پایین یعنی این روزها نوسان خلقی و واکنش هیجانی را بیشتر از حد معمول تجربه می‌کنید. این یک عیب شخصیتی نیست و ثابت هم نیست — با تمرین‌های تنظیم هیجان و در صورت نیاز روان‌درمانی، قابل تغییر است.' }
          ],
          steps: [
            ['به دو عاملی که در انتهای طیف قرار گرفته‌اند نگاه کنید؛ معمولاً همان‌ها بیشترین توضیح را درباره الگوهای تکراری زندگی‌تان می‌دهند.',
             'شخصیت را به‌عنوان راهنما ببینید نه برچسب: دانستن سبک طبیعی‌تان کمک می‌کند محیط و شغلی انتخاب کنید که با آن بجنگید کمتر لازم باشد.',
             'این نتیجه را با یک آزمون سنجش وضعیت (مثل DASS-21) اشتباه نگیرید؛ آن یکی حالِ امروز شما را می‌سنجد، این یکی سبک پایدارتان را.'],
            ['به دو عاملی که در انتهای طیف قرار گرفته‌اند نگاه کنید؛ معمولاً همان‌ها بیشترین توضیح را درباره الگوهای تکراری زندگی‌تان می‌دهند.',
             'شخصیت را به‌عنوان راهنما ببینید نه برچسب.'],
            ['اگر نوسان هیجانی این روزها زندگی‌تان را سخت کرده، آزمون DASS-21 را هم انجام دهید تا تصویر دقیق‌تری از افسردگی، اضطراب و استرس داشته باشید.',
             'تمرین‌های تنظیم هیجان و ذهن‌آگاهی روی همین عامل بیشترین اثر مستقیم را دارند.',
             'اگر واکنش‌های هیجانی روی روابط یا کارتان اثر گذاشته، یک جلسه با روان‌شناس ارزشش را دارد.',
             'بقیه پروفایل را به دیده توصیف نگاه کنید؛ فقط همین یک عامل جنبه سلامت روان دارد.']
          ]
        },
        dimensions: [
          {
            key: 'ext', label: 'برون‌گرایی', icon: '<circle cx="9" cy="9" r="3" stroke="#FFFFFF" stroke-width="1.5"/><circle cx="16" cy="9" r="3" stroke="#FFFFFF" stroke-width="1.5"/><path d="M4 19c0-2.8 2.2-4.6 5-4.6s5 1.8 5 4.6M13.5 14.6c2.5.2 4.5 2 4.5 4.4" stroke="#FFFFFF" stroke-width="1.4" stroke-linecap="round"/>',
            about: 'منبع انرژی و سبک تعامل اجتماعی شما.',
            indices: [0,1,2,3,4,5,6,7,8,9], reverse: [1,3,5,7,9], min: 10, max: 50,
            bands: [
              { min:10, max:23, label:'درون‌گرا',  color:'var(--sky)',  level:0, advice:'گرایش درون‌گرایانه دارید؛ انرژی‌تان را بیشتر در خلوت به‌دست می‌آورید تا در جمع‌های شلوغ. مزیتش تمرکز عمیق و روابط کم اما باکیفیت است؛ هزینه‌اش این است که در محیط‌های پرهیاهو زودتر خالی می‌شوید و گاهی کمتر از آنچه لیاقتش را دارید دیده می‌شوید.' },
              { min:24, max:36, label:'متعادل',    color:'var(--gold)', level:0, advice:'ترکیبی متعادل از برون‌گرایی و درون‌گرایی دارید؛ بسته به موقعیت هم از حضور در جمع لذت می‌برید و هم به خلوت نیاز دارید. این انعطاف یک مزیت واقعی است، به شرطی که حواستان باشد کدام موقعیت دارد انرژی‌تان را می‌گیرد.' },
              { min:37, max:50, label:'برون‌گرا',   color:'var(--teal)', level:0, advice:'گرایش برون‌گرایانه دارید؛ از تعامل اجتماعی و حضور در جمع انرژی می‌گیرید. مزیتش شبکه ارتباطی گسترده و راحتی در موقعیت‌های تازه است؛ هزینه‌اش این است که تنهایی طولانی برایتان سخت می‌شود و گاهی پیش از آنکه فکر کنید حرف می‌زنید.' }
            ]
          },
          {
            key: 'agr', label: 'دلپذیربودن', icon: '<path d="M12 20s-7-4.4-7-9.6C5 7.4 7 5.5 9.5 5.5c1.3 0 2.5.7 3.2 1.7.7-1 1.9-1.7 3.2-1.7 2.5 0 4.5 1.9 4.5 4.9C21.4 15.6 12 20 12 20Z" stroke="#FFFFFF" stroke-width="1.4" stroke-linejoin="round"/>',
            about: 'گرایش شما به همدلی و همکاری، در برابر صراحت و استقلال رأی.',
            indices: [10,11,12,13,14,15,16,17,18,19], reverse: [10,12,14,16], min: 10, max: 50,
            bands: [
              { min:10, max:23, label:'صریح‌گو',    color:'var(--sky)',  level:0, advice:'در روابط صریح و مستقل‌فکر هستید و برای جلب رضایت دیگران کوتاه نمی‌آیید. مزیتش این است که در مذاکره و تصمیم‌های سخت قوی عمل می‌کنید؛ هزینه‌اش این است که صراحتتان گاهی سردتر از منظورتان برداشت می‌شود.' },
              { min:24, max:36, label:'متعادل',      color:'var(--gold)', level:0, advice:'بین همدلی و صراحت تعادل دارید؛ می‌توانید هم طرف دیگران را بگیرید و هم حرف خودتان را بزنید. این ترکیب در کار تیمی معمولاً بهترین جایگاه است.' },
              { min:37, max:50, label:'دلپذیر و همدل', color:'var(--teal)', level:0, advice:'فردی دلسوز، همدل و اهل همکاری هستید و به‌راحتی خودتان را جای دیگران می‌گذارید. مزیتش اعتمادسازی سریع در روابط است؛ هزینه‌اش این است که «نه گفتن» سخت می‌شود و ممکن است نیازهای خودتان آخر از همه دیده شود.' }
            ]
          },
          {
            key: 'csn', label: 'وظیفه‌شناسی', icon: '<path d="M5 5.5h14v13H5z" stroke="#FFFFFF" stroke-width="1.4" stroke-linejoin="round"/><path d="M8 10.3l2.3 2.3L16 7.3" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
            about: 'میزان نظم، برنامه‌ریزی و پایبندی شما به تعهدها.',
            indices: [20,21,22,23,24,25,26,27,28,29], reverse: [21,23,25,27], min: 10, max: 50,
            bands: [
              { min:10, max:23, label:'خودجوش',     color:'var(--sky)',  level:0, advice:'سبک زندگی منعطف و خودجوشی دارید و کمتر پایبند برنامه‌ریزی سخت‌گیرانه‌اید. مزیتش سازگاری سریع با تغییر است؛ هزینه‌اش این است که کارهای بلندمدت و جزئیات اداری معمولاً عقب می‌مانند.' },
              { min:24, max:36, label:'متعادل',      color:'var(--gold)', level:0, advice:'در نظم و انعطاف تعادل دارید؛ گاهی برنامه‌ریزی‌شده و گاهی خودجوش عمل می‌کنید. این ترکیب معمولاً بدون هزینهٔ فرسودگیِ کمال‌گرایی، نتیجه می‌دهد.' },
              { min:37, max:50, label:'منظم و هدف‌مدار', color:'var(--teal)', level:0, advice:'فردی منظم، مسئولیت‌پذیر و هدف‌مدار هستید. مزیتش قابل‌اتکا بودن و رسیدن به نتیجه است؛ هزینه‌اش این است که به‌هم‌خوردن برنامه بیشتر از حد معمول آزارتان می‌دهد و ممکن است استراحت خودتان را هم به تعویق بیندازید.' }
            ]
          },
          {
            key: 'est', label: 'ثبات هیجانی', icon: '<path d="M3 12h4l1.8-4 2.6 8 1.8-6 1.4 2h4.4" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
            about: 'پایداری شما در برابر فشار و نوسان هیجانی. (نقطه مقابل آن در ادبیات روان‌شناسی، روان‌رنجورخویی است.)',
            indices: [30,31,32,33,34,35,36,37,38,39], reverse: [30,32,34,35,36,37,38,39], min: 10, max: 50,
            bands: [
              { min:10, max:23, label:'حساس و هیجانی', color:'var(--coral)', level:2, advice:'این روزها نوسان خلقی و واکنش هیجانی را بیشتر از حد معمول تجربه می‌کنید. برخلاف چهار عامل دیگرِ این آزمون که کاملاً توصیفی‌اند، این یکی با سلامت روان رابطه مستقیم دارد و نمره پایین در آن اغلب با استرس یا افسردگی همراه است. تمرین‌های تنظیم هیجان و در صورت نیاز روان‌درمانی، بیشترین اثر را روی همین عامل دارند.' },
              { min:24, max:36, label:'متعادل',         color:'var(--gold)',  level:0, advice:'ثبات هیجانی شما در محدوده متوسط است؛ مثل بیشتر افراد، در برابر برخی موقعیت‌ها واکنش هیجانی نشان می‌دهید و در برخی دیگر آرام می‌مانید.' },
              { min:37, max:50, label:'باثبات',          color:'var(--teal)',  level:0, advice:'از ثبات هیجانی خوبی برخوردارید و معمولاً در موقعیت‌های پراسترس آرامشتان را حفظ می‌کنید. این یکی از قوی‌ترین محافظ‌های روانی است؛ فقط حواستان باشد آرام ماندن با نادیده‌گرفتن نیازهای هیجانی اشتباه گرفته نشود.' }
            ]
          },
          {
            key: 'opn', label: 'گشودگی به تجربه', icon: '<path d="M4 17c2-6 5-9 8-9s6 3 8 9" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round"/><circle cx="12" cy="8" r="1.4" fill="#FFFFFF"/>',
            about: 'کنجکاوی، تخیل و اشتیاق شما به ایده‌ها و تجربه‌های تازه.',
            indices: [40,41,42,43,44,45,46,47,48,49], reverse: [41,43,45], min: 10, max: 50,
            bands: [
              { min:10, max:23, label:'عملگرا',    color:'var(--sky)',  level:0, advice:'به روال‌های آشنا و ملموس علاقه دارید و کمتر جذب ایده‌های انتزاعی می‌شوید. مزیتش واقع‌بینی و اجرای مطمئن است؛ هزینه‌اش این است که فرصت‌های نامتعارف ممکن است از کنارتان رد شوند.' },
              { min:24, max:36, label:'متعادل',     color:'var(--gold)', level:0, advice:'ترکیبی از کنجکاوی و عملگرایی دارید؛ به ایده‌های نو باز هستید بدون اینکه دنبال هر تجربه تازه‌ای بروید.' },
              { min:37, max:50, label:'کنجکاو و خلاق', color:'var(--teal)', level:0, advice:'کنجکاو، خلاق و مشتاق ایده‌ها و تجربه‌های تازه هستید. مزیتش خلاقیت و انطباق‌پذیری فکری است؛ هزینه‌اش این است که کارهای تکراری زود خسته‌تان می‌کنند و ماندن روی یک مسیر دشوار می‌شود.' }
            ]
          }
        ]
      },
      // 16 Personalities. Unlike every other test here this one has no "score" —
      // it reports a *type*, so it carries `axes` (five dichotomies) instead of
      // `dimensions`, and is rendered by resultsHtmlType(). Each axis has 12
      // items; within a group every odd-numbered question is reverse-keyed, so
      // agreeing with everything can never push an axis to one extreme.
      {
        id: 'mbti16',
        art: 'test-mbti16-w',
        name: 'آزمون ۱۶ تیپ شخصیتی',
        subtitle: '16 Personalities',
        short: 'شناخته‌شده‌ترین آزمون تیپ‌شناسی شخصیت در دنیا؛ شما را در ۵ محور می‌سنجد و یکی از ۱۶ تیپ شخصیتی (مثل INFJ-A) را با توصیف کامل به شما می‌دهد.',
        about: 'آزمون ۱۶ تیپ شخصیتی — که با نام 16 Personalities شناخته می‌شود — بر پایه مدل دوگانه‌های یونگ و مایرز-بریگز ساخته شده و شخصیت شما را در پنج محور توصیف می‌کند: ذهن (درون‌گرا/برون‌گرا)، انرژی (شهودی/واقع‌گرا)، طبیعت (منطقی/احساسی)، تاکتیک (قاطع/منعطف) و هویت (مطمئن/پرتلاطم). حاصل این پنج محور، یکی از ۱۶ تیپ شخصیتی به‌همراه پسوند هویت است؛ مثل INFJ-A یا ESTP-T. توجه کنید این آزمون، مثل آزمون پنج عامل بزرگ، دنبال نشانه بیماری نیست و نتیجه‌اش خوب و بد ندارد؛ فقط توصیفی است از سبک طبیعی شما در فکر کردن، تصمیم گرفتن و ارتباط گرفتن با دیگران.',
        icon: '<rect x="3.6" y="3.6" width="7.4" height="7.4" rx="1.8" stroke="#FFFFFF" stroke-width="1.5"/><rect x="13" y="3.6" width="7.4" height="7.4" rx="1.8" stroke="#FFFFFF" stroke-width="1.5"/><rect x="3.6" y="13" width="7.4" height="7.4" rx="1.8" stroke="#FFFFFF" stroke-width="1.5"/><rect x="13" y="13" width="7.4" height="7.4" rx="1.8" fill="#FFFFFF"/>',
        duration: 'حدود ۱۰ تا ۱۲ دقیقه',
        instruction: 'میزان موافقت خود را با هر جمله مشخص کنید. پاسخ درست یا غلط وجود ندارد؛ به اولین حسی که به شما دست می‌دهد اعتماد کنید و زیاد فکر نکنید.',
        options: OPTS_MBTI,
        questions: [
          // ذهن — E/I
          'بعد از یک جمع شلوغ، معمولاً به چند ساعت خلوت نیاز دارم تا انرژی‌ام برگردد',
          'به‌راحتی با آدم‌های غریبه سر صحبت را باز می‌کنم',
          'ترجیح می‌دهم آخر هفته را با یکی دو دوست نزدیک بگذرانم تا در یک جمع بزرگ',
          'در جمع‌های تازه، معمولاً یکی از اولین کسانی هستم که خودش را معرفی می‌کند',
          'قبل از حرف‌زدن، معمولاً همه‌چیز را در ذهنم مرور می‌کنم',
          'از اینکه مرکز توجه باشم لذت می‌برم',
          'تماس تلفنی ناگهانی کمی معذبم می‌کند و ترجیح می‌دهم پیام بدهم',
          'در بحث‌های گروهی معمولاً زیاد صحبت می‌کنم',
          'برای فکر کردن به یک موضوع مهم، به تنهایی و سکوت نیاز دارم',
          'خیلی زود با آدم‌های جدید دوست می‌شوم',
          'معمولاً بیش از آنکه حرف بزنم، گوش می‌دهم',
          'حضور در مهمانی‌ها و رویدادهای شلوغ برایم انرژی‌بخش است',
          // انرژی — N/S
          'بیشتر به واقعیت‌های ملموسِ همین امروز فکر می‌کنم تا به احتمالات آینده',
          'اغلب خودم را در حال خیال‌پردازی درباره سناریوهایی می‌بینم که شاید هرگز اتفاق نیفتند',
          'وقتی چیزی یاد می‌گیرم، ترجیح می‌دهم کاربرد عملی‌اش را بدانم تا تئوری پشتش را',
          'گفت‌وگو درباره ایده‌های انتزاعی و نظریه‌ها برایم جذاب است',
          'به جزئیات دقیق و واقعیِ یک موضوع بیشتر توجه می‌کنم تا به تصویر کلی آن',
          'اغلب به این فکر می‌کنم که «چه می‌شد اگر...»',
          'روش‌های امتحان‌پس‌داده را به راه‌های نو و آزمایش‌نشده ترجیح می‌دهم',
          'معمولاً بین اتفاق‌های به‌ظاهر بی‌ربط، الگو و ارتباط پیدا می‌کنم',
          'کتاب یا فیلمی را می‌پسندم که داستانش واقع‌گرایانه باشد تا فانتزی و نمادین',
          'بیشتر به این فکر می‌کنم که چیزها در آینده چه شکلی می‌شوند تا اینکه الان چطورند',
          'توصیف دقیق آنچه دیده‌ام، برایم راحت‌تر از تفسیر معنای پنهان آن است',
          'کنجکاوی درباره ایده‌های عجیب و غیرمعمول، بخشی از شخصیت من است',
          // طبیعت — T/F
          'وقتی تصمیمی می‌گیرم، اثر آن روی احساسات آدم‌ها برایم از منطق خالص مهم‌تر است',
          'در بحث، رسیدن به پاسخ درست برایم از حفظ احساسات طرف مقابل مهم‌تر است',
          'به‌راحتی با ناراحتی دیگران هم‌دل می‌شوم، حتی اگر آن‌ها را نشناسم',
          'فکر می‌کنم بی‌طرفی و انصاف مهم‌تر از دلسوزی است',
          'فیلم‌ها یا داستان‌های احساسی به‌راحتی اشکم را درمی‌آورند',
          'انتقاد صریح و بی‌رودربایستی را به تعارف ترجیح می‌دهم',
          'سعی می‌کنم حرفم را طوری بزنم که کسی دلخور نشود، حتی اگر لازم باشد از صراحتش کم کنم',
          'تصمیم‌های سخت را با سرم می‌گیرم، نه با دلم',
          'هماهنگی و آرامش در یک جمع، برایم از برنده‌شدن در بحث مهم‌تر است',
          'معمولاً می‌توانم بدون درگیر شدن احساسی، مسائل را تحلیل کنم',
          'حال و هوای عاطفی آدم‌های اطرافم را خیلی سریع حس می‌کنم',
          'فکر می‌کنم گاهی باید حقیقت را گفت، حتی اگر آزاردهنده باشد',
          // تاکتیک — J/P
          'معمولاً کارها را به لحظه آخر موکول می‌کنم',
          'دوست دارم برای روزها و هفته‌های پیش‌رو برنامه مشخص داشته باشم',
          'ترجیح می‌دهم تصمیم‌هایم را باز نگه دارم تا شاید گزینه بهتری پیدا شود',
          'فهرست کارهای روزانه یا برنامه‌ریزی، بخشی از زندگی من است',
          'سفرِ بدون برنامهٔ از پیش تعیین‌شده برایم هیجان‌انگیزتر است',
          'میز کار و فضای زندگی‌ام معمولاً مرتب و منظم است',
          'اگر وسط کار چیز جالب‌تری پیش بیاید، به‌راحتی مسیرم را عوض می‌کنم',
          'دوست دارم کارها را زودتر از موعد تمام کنم تا خیالم راحت باشد',
          'قوانین و روال‌های ثابت، گاهی برایم دست‌وپاگیر است',
          'وقتی برنامه‌ای ناگهانی به‌هم می‌خورد، اذیت می‌شوم',
          'ترجیح می‌دهم چند کار را هم‌زمان و به‌شکل خودجوش پیش ببرم',
          'تا کارهای نیمه‌تمامم را تمام نکنم، آرام نمی‌گیرم',
          // هویت — A/T
          'بعد از یک تصمیم مهم، مدت‌ها به این فکر می‌کنم که نکند اشتباه کرده باشم',
          'به‌ندرت نگران نظر دیگران درباره خودم هستم',
          'اشتباه‌های کوچکم مدت‌ها در ذهنم می‌مانند',
          'حتی زیر فشار زیاد، معمولاً آرامشم را حفظ می‌کنم',
          'اغلب حس می‌کنم به‌اندازه کافی خوب عمل نکرده‌ام',
          'به توانایی‌های خودم اطمینان دارم',
          'انتقاد دیگران، حتی وقتی درست باشد، حالم را می‌گیرد',
          'به‌ندرت پیش می‌آید که از عملکردم پشیمان شوم',
          'قبل از موقعیت‌های مهم، استرس زیادی می‌گیرم',
          'معمولاً از خودم و مسیری که آمده‌ام راضی‌ام',
          'کمال‌گرایی گاهی نمی‌گذارد از نتیجه کارم راضی باشم',
          'به‌سختی می‌شود اعتمادبه‌نفسم را تکان داد'
        ],
        axes: [
          {
            key: 'mind', label: 'ذهن',
            icon: '<path d="M15.4 20.4v-2.8c2.3-1.2 3.8-3.6 3.8-6.3a7.2 7.2 0 1 0-14.4 0c0 1.6.6 2.6 1.5 3.3v2.4h2.3v3.4" stroke="#FFFFFF" stroke-width="1.5" stroke-linejoin="round"/>',
            indices: [0,1,2,3,4,5,6,7,8,9,10,11], reverse: [1,3,5,7,9,11],
            a: { letter:'E', label:'برون‌گرا', color:'var(--gold)' },
            b: { letter:'I', label:'درون‌گرا', color:'var(--teal)' }
          },
          {
            key: 'energy', label: 'انرژی',
            icon: '<path d="M13.4 3 5.6 13.6h5.1L10.6 21l7.8-10.6h-5.1L13.4 3Z" stroke="#FFFFFF" stroke-width="1.4" stroke-linejoin="round"/>',
            indices: [12,13,14,15,16,17,18,19,20,21,22,23], reverse: [13,15,17,19,21,23],
            a: { letter:'N', label:'شهودی', color:'var(--lavender)' },
            b: { letter:'S', label:'واقع‌گرا', color:'var(--sky)' }
          },
          {
            key: 'nature', label: 'طبیعت',
            icon: '<path d="M12 4.4v15.2M6.6 7.6h10.8M6.6 7.6 4 13.2h5.2L6.6 7.6ZM17.4 7.6l-2.6 5.6H20l-2.6-5.6Z" stroke="#FFFFFF" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>',
            indices: [24,25,26,27,28,29,30,31,32,33,34,35], reverse: [25,27,29,31,33,35],
            a: { letter:'T', label:'منطقی', color:'var(--sky)' },
            b: { letter:'F', label:'احساسی', color:'var(--coral)' }
          },
          {
            key: 'tactics', label: 'تاکتیک',
            icon: '<path d="M5 6.6h14M5 12h9.6M5 17.4h11.4" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round"/>',
            indices: [36,37,38,39,40,41,42,43,44,45,46,47], reverse: [37,39,41,43,45,47],
            a: { letter:'J', label:'قاطع', color:'var(--teal)' },
            b: { letter:'P', label:'منعطف', color:'var(--gold)' }
          },
          {
            key: 'identity', label: 'هویت',
            icon: '<path d="M12 3.6 18.6 6.4v5c0 4.1-2.8 7.5-6.6 8.6-3.8-1.1-6.6-4.5-6.6-8.6v-5L12 3.6Z" stroke="#FFFFFF" stroke-width="1.4" stroke-linejoin="round"/>',
            indices: [48,49,50,51,52,53,54,55,56,57,58,59], reverse: [49,51,53,55,57,59],
            a: { letter:'A', label:'مطمئن', color:'var(--teal)' },
            b: { letter:'T', label:'پرتلاطم', color:'var(--gold-deep)' }
          }
        ],
        // `note` is the group-level read used in the summary: how this family of
        // types typically behaves when something needs to change — the part of a
        // type description that is actually useful in a counselling context.
        groups: {
          analysts:  { label:'گروه تحلیل‌گران', color:'var(--lavender)',
            note:'تیپ‌های گروه تحلیل‌گر معمولاً پیش از عمل، مسئله را می‌فهمند: قبل از تغییر دادن چیزی، می‌خواهند بدانند چرا این‌طور است. همین باعث می‌شود در حل مسائل پیچیده قوی باشند، اما گاهی تحلیل جای تجربه‌کردن را بگیرد و احساسات — خودشان و اطرافیانشان — دیرتر وارد معادله شود.' },
          diplomats: { label:'گروه دیپلمات‌ها', color:'var(--teal)',
            note:'تیپ‌های دیپلمات با معنا و ارزش حرکت می‌کنند، نه با قاعده و سود. حساسیتشان به حال دیگران هم بزرگ‌ترین قدرتشان است و هم پرهزینه‌ترین ویژگی‌شان؛ رایج‌ترین چالش این گروه، مرزگذاری و نگه‌داشتن انرژی خودشان در روابط است.' },
          sentinels: { label:'گروه نگهبانان',   color:'var(--sky)',
            note:'تیپ‌های نگهبان با ثبات، تعهد و مسئولیت‌پذیری شناخته می‌شوند و معمولاً همان کسانی هستند که کارها را واقعاً به سرانجام می‌رسانند. در مقابل، تغییر و ابهام برایشان پرهزینه است و گاهی آن‌قدر بار دیگران را برمی‌دارند که خستگی خودشان را دیر می‌بینند.' },
          explorers: { label:'گروه کاوشگران',   color:'var(--gold-deep)',
            note:'تیپ‌های کاوشگر در لحظه زندگی می‌کنند و در موقعیت‌های واقعی و پرشتاب بهترین عملکردشان را دارند. آزادی عمل برایشان شرط است؛ در عوض، تعهد بلندمدت، برنامه‌ریزی و گفت‌وگوهای عاطفی طولانی معمولاً نقطه دشوارشان است.' }
        },
        identityNote: {
          A: 'پسوند «مطمئن» (A) نشان می‌دهد نسبت به توانایی‌ها و تصمیم‌هایتان آسوده‌خاطرید و استرس کمتر شما را از پا درمی‌آورد؛ حواستان باشد همین اطمینان گاهی می‌تواند بازخورد انتقادی را از شما پنهان کند.',
          T: 'پسوند «پرتلاطم» (T) نشان می‌دهد نسبت به عملکرد خودتان حساسید و کمال‌گرایی و نگرانی نقش پررنگی در تجربه‌تان دارند. این ویژگی معمولاً انگیزه پیشرفت بالایی می‌سازد، اما اگر با خودانتقادی همراه شود فرساینده است — و همان‌جاست که کار روی خودشفقتی بیشترین اثر را دارد.'
        },
        types: {
          INTJ: {
            name: 'معمار', group: 'analysts',
            desc: 'ذهنی راهبردی و آینده‌نگر دارید؛ پیش از آنکه دیگران مسئله را ببینند، نقشه حل آن را در سر می‌پرورانید. استقلال فکری برایتان ارزشمند است و ترجیح می‌دهید بر پایه تحلیل خودتان تصمیم بگیرید تا بر پایه عرف. در کار و زندگی دنبال معنا و کارآمدی هستید، نه تأیید گرفتن.',
            strengths: ['تفکر راهبردی و بلندمدت','استقلال رأی و اعتماد به تحلیل خود','توانایی حل مسئله‌های پیچیده','پشتکار در رسیدن به هدف'],
            growth: ['گاهی نسبت به خودتان و دیگران بیش‌ازحد سخت‌گیرید','ابراز احساسات و نیازهای عاطفی برایتان دشوار است','ممکن است انتقاد را زودتر از تحسین به زبان بیاورید']
          },
          INTP: {
            name: 'منطق‌دان', group: 'analysts',
            desc: 'کنجکاوی سیری‌ناپذیر و ذهنی تحلیلی دارید که از کشف نحوه کارکرد چیزها لذت می‌برد. بیش از آنکه به قواعد جاافتاده تن بدهید، دوست دارید خودتان منطق پشت هر چیزی را بسنجید. در گفت‌وگو دنبال دقت و صداقت فکری هستید، حتی اگر بحث پیچیده‌تر شود.',
            strengths: ['تحلیل عمیق و بی‌طرفانه','خلاقیت در یافتن راه‌حل‌های تازه','اشتیاق واقعی به یادگیری','گشودگی نسبت به ایده‌های متفاوت'],
            growth: ['تبدیل ایده به عمل گاهی طول می‌کشد','ممکن است از موقعیت‌های پرتنش احساسی فاصله بگیرید','جزئیات اجرایی و روزمره کمتر جدی گرفته می‌شوند']
          },
          ENTJ: {
            name: 'فرمانده', group: 'analysts',
            desc: 'رهبری برایتان طبیعی است؛ هدف را می‌بینید، مسیر را می‌سازید و دیگران را هم با خودتان همراه می‌کنید. تصمیم‌گیری قاطع و بیزاری از اتلاف وقت، از نشانه‌های همیشگی شماست. چالش، به‌جای آنکه شما را عقب بزند، معمولاً انگیزه‌تان را بیشتر می‌کند.',
            strengths: ['قاطعیت در تصمیم‌گیری','توانایی سازمان‌دهی و رهبری','اعتمادبه‌نفس و اراده قوی','نگاه هدف‌مدار و کارآمد'],
            growth: ['ممکن است بی‌آنکه بخواهید سلطه‌گر به‌نظر برسید','صبرتان در برابر سرعت پایین دیگران کم است','نیازهای عاطفی — خودتان و اطرافیان — گاهی نادیده می‌ماند']
          },
          ENTP: {
            name: 'مناظره‌گر', group: 'analysts',
            desc: 'ذهنی سریع و جرقه‌زن دارید که عاشق به‌چالش‌کشیدن فرض‌های بدیهی است. ایده‌های تازه را با سرعت تولید می‌کنید و از گفت‌وگوی زنده و حتی جدل فکری انرژی می‌گیرید. یکنواختی، سریع‌تر از هر چیز دیگری خسته‌تان می‌کند.',
            strengths: ['خلاقیت و ایده‌پردازی سریع','انعطاف ذهنی و سازگاری بالا','جسارت در زیر سؤال بردن روال‌ها','توانایی متقاعدسازی و گفت‌وگو'],
            growth: ['به‌پایان‌رساندن کارها به‌اندازه شروع‌کردن جذاب نیست','بحث گاهی به لجاجت کشیده می‌شود','برنامه‌ریزی و پیگیری جزئیات نقطه ضعف است']
          },
          INFJ: {
            name: 'مدافع', group: 'diplomats',
            desc: 'ترکیب کم‌یابی از آرمان‌گرایی و عمل‌گرایی دارید؛ هم آرزوی دنیایی بهتر را در سر می‌پرورانید و هم برای رسیدن به آن قدم برمی‌دارید. آدم‌ها را زود و عمیق می‌خوانید و به معنا و اصالت بیش از موفقیت بیرونی اهمیت می‌دهید. روابط کم اما بسیار عمیق، سبک همیشگی شماست.',
            strengths: ['بینش عمیق نسبت به آدم‌ها و انگیزه‌هایشان','همدلی همراه با اصولمندی','تعهد به ارزش‌ها و آرمان‌ها','خلاقیت در بیان و در کمک به دیگران'],
            growth: ['کمال‌گرایی می‌تواند فرسوده‌تان کند','مرزگذاری و «نه گفتن» برایتان دشوار است','ممکن است رنج‌های درونی‌تان را از همه پنهان نگه دارید']
          },
          INFP: {
            name: 'میانجی', group: 'diplomats',
            desc: 'دنیای درونی غنی و ارزش‌محوری دارید؛ آنچه برایتان مهم است از عمق باور می‌آید، نه از فشار بیرون. نسبت به رنج دیگران حساسید و دوست دارید کاری کنید که حال آدم‌ها بهتر شود. صداقت با خودتان برایتان از موفقیت ظاهری مهم‌تر است.',
            strengths: ['همدلی عمیق و پذیرندگی','خلاقیت و تخیل قوی','وفاداری به ارزش‌های شخصی','توانایی دیدن ظرفیت‌های نهفته در آدم‌ها'],
            growth: ['انتقاد را شخصی می‌گیرید','تصمیم‌های عملی و روزمره گاهی معطل می‌مانند','فاصله میان آرمان و واقعیت می‌تواند ناامیدتان کند']
          },
          ENFJ: {
            name: 'قهرمان', group: 'diplomats',
            desc: 'توانایی طبیعی برای الهام‌بخشیدن به دیگران دارید و در جمع، معمولاً کسی هستید که آدم‌ها را کنار هم نگه می‌دارد. رشد اطرافیانتان برایتان اهمیت واقعی دارد و برایش انرژی می‌گذارید. گرمی و قاطعیت را هم‌زمان دارید.',
            strengths: ['الهام‌بخشی و رهبری همدلانه','مهارت بالای ارتباطی','حساسیت به نیازهای دیگران','تعهد به رشد جمعی'],
            growth: ['ممکن است نیازهای خودتان را آخر از همه ببینید','به تأیید دیگران وابسته می‌شوید','مسئولیت حل مشکلات دیگران را بیش از سهم خود برمی‌دارید']
          },
          ENFP: {
            name: 'مبارز', group: 'diplomats',
            desc: 'شور، کنجکاوی و گرمای اجتماعی، سه ویژگی همیشگی شماست. آدم‌ها و امکان‌های تازه برایتان جذاب‌اند و خیلی زود با آن‌ها ارتباط می‌گیرید. آزادی و معنا را هم‌زمان می‌خواهید و از قفس روتین بیزارید.',
            strengths: ['اشتیاق و انرژی مسری','خلاقیت و ایده‌پردازی','مهارت در ساختن ارتباط انسانی','انعطاف‌پذیری در برابر تغییر'],
            growth: ['تمرکز بلندمدت روی یک مسیر دشوار است','کارهای اداری و جزئی رها می‌شوند','ممکن است بیش از توانتان قول بدهید']
          },
          ISTJ: {
            name: 'بازرس', group: 'sentinels',
            desc: 'مسئولیت‌پذیری و اتکاپذیری، امضای شخصیتی شماست؛ وقتی کاری را بر عهده می‌گیرید، انجام می‌شود. به واقعیت‌ها، تجربه و روش‌های امتحان‌پس‌داده اعتماد دارید. نظم و ثبات، هم در کار و هم در زندگی، به شما آرامش می‌دهد.',
            strengths: ['قابل‌اتکا بودن و پایبندی به تعهد','دقت در جزئیات','نظم و برنامه‌ریزی','آرامش و ثبات در بحران'],
            growth: ['پذیرش تغییر و روش‌های تازه زمان می‌برد','ممکن است انعطاف را با بی‌نظمی اشتباه بگیرید','ابراز احساسات کمتر از حد لازم است']
          },
          ISFJ: {
            name: 'حامی', group: 'sentinels',
            desc: 'مراقبت بی‌سروصدا از آدم‌هایی که دوستشان دارید، جوهره شخصیت شماست. جزئیاتی را به یاد می‌آورید که بقیه فراموش کرده‌اند و همان‌ها را به کار می‌گیرید تا حال کسی بهتر شود. وفاداری و ثبات، ارزش‌های اصلی شما هستند.',
            strengths: ['وفاداری و مسئولیت‌پذیری بالا','توجه به نیازهای واقعی اطرافیان','صبر و پشتکار','حافظه خوب برای جزئیات مهم'],
            growth: ['«نه گفتن» و مرزگذاری دشوار است','خستگی ناشی از مراقبت از دیگران را دیر متوجه می‌شوید','تعارض را به قیمت سکوتِ خودتان دور می‌زنید']
          },
          ESTJ: {
            name: 'مدیر اجرایی', group: 'sentinels',
            desc: 'ساختار می‌سازید و کارها را پیش می‌برید؛ جایی که هرج‌ومرج باشد، معمولاً شما هستید که سامانش می‌دهید. به قواعد روشن، مسئولیت‌پذیری و نتیجه ملموس باور دارید. صراحت و عمل‌گرایی از ویژگی‌های پررنگ شماست.',
            strengths: ['توانایی سازمان‌دهی و اجرا','صراحت و شفافیت','پایبندی به تعهد','تصمیم‌گیری سریع و عملی'],
            growth: ['انعطاف در برابر روش‌های غیرمتعارف کم است','صراحتتان گاهی تند برداشت می‌شود','احساسات — خودتان و دیگران — کمتر وارد معادله می‌شود']
          },
          ESFJ: {
            name: 'کنسول', group: 'sentinels',
            desc: 'گرم، اجتماعی و اهل رسیدگی هستید؛ ساختن حس تعلق در جمع را طبیعی انجام می‌دهید. به هماهنگی و روابط سالم اهمیت زیادی می‌دهید و برای حفظشان تلاش می‌کنید. عمل‌گرا هستید: محبتتان معمولاً شکل کارِ انجام‌شده به خود می‌گیرد.',
            strengths: ['مهارت اجتماعی و ساختن ارتباط','مسئولیت‌پذیری در قبال دیگران','حمایتگری عملی و وفادارانه','توجه به هماهنگی جمع'],
            growth: ['به نظر و تأیید دیگران حساسید','انتقاد را سخت می‌پذیرید','ممکن است برای حفظ آرامش، نیاز خودتان را نگویید']
          },
          ISTP: {
            name: 'استادکار', group: 'explorers',
            desc: 'با دست‌هایتان و با منطقتان مسئله حل می‌کنید؛ به‌جای نظریه‌پردازی ترجیح می‌دهید وارد عمل شوید و ببینید چه می‌شود. در بحران آرام می‌مانید و سریع واکنش درست را پیدا می‌کنید. آزادی عمل برایتان شرط اصلی است.',
            strengths: ['خونسردی و کارآمدی در بحران','مهارت عملی و حل مسئله ملموس','انعطاف و سازگاری بالا','نگاه واقع‌بینانه و بدون احساسات‌زدگی'],
            growth: ['تعهد بلندمدت گاهی محدودکننده حس می‌شود','ابراز احساسات کم و دیرهنگام است','ممکن است از گفت‌وگوهای عاطفی فرار کنید']
          },
          ISFP: {
            name: 'ماجراجو', group: 'explorers',
            desc: 'حساسیت زیبایی‌شناختی و صداقت عاطفی، شخصیت شما را می‌سازد. در لحظه زندگی می‌کنید و ترجیح می‌دهید به‌جای حرف زدن درباره ارزش‌هایتان، آن‌ها را زندگی کنید. آرام هستید، اما در آنچه برایتان مهم است سرسخت.',
            strengths: ['حس زیبایی‌شناسی و خلاقیت','همدلی بی‌سروصدا و صادقانه','انعطاف و زندگی در لحظه','وفاداری به ارزش‌های شخصی'],
            growth: ['برنامه‌ریزی بلندمدت دشوار است','انتقاد را عمیق حس می‌کنید','ممکن است در تعارض، سکوت را انتخاب کنید']
          },
          ESTP: {
            name: 'کارآفرین', group: 'explorers',
            desc: 'انرژی، جسارت و حضور در لحظه، از شما آدمی می‌سازد که وارد عمل می‌شود. ریسک شما را نمی‌ترساند و در موقعیت‌های پرشتاب بهترین عملکردتان را دارید. بیش از آنکه اهل نقشه کشیدن باشید، اهل امتحان کردن هستید.',
            strengths: ['جسارت و اقدام سریع','واقع‌بینی و حل مسئله در لحظه','انرژی اجتماعی بالا','سازگاری با موقعیت‌های غیرمنتظره'],
            growth: ['بی‌حوصلگی نسبت به برنامه‌ریزی بلندمدت','ریسک‌پذیری گاهی به بی‌احتیاطی می‌رسد','صبرتان در کارهای کند و تکراری کم است']
          },
          ESFP: {
            name: 'سرگرم‌کننده', group: 'explorers',
            desc: 'حضورتان در جمع حس می‌شود؛ شور، شوخ‌طبعی و گرمای شما فضا را عوض می‌کند. از تجربه‌های تازه و لحظه‌های زنده لذت می‌برید و دوست دارید دیگران هم لذت ببرند. صمیمیت و خودانگیختگی، امضای شماست.',
            strengths: ['شور و گرمای اجتماعی','توانایی بالا بردن حال دیگران','واقع‌گرایی و لذت از لحظه','سازگاری و خودانگیختگی'],
            growth: ['تمرکز روی اهداف بلندمدت دشوار است','از موضوعات سنگین و تعارض فاصله می‌گیرید','برنامه‌ریزی زمانی و مالی نقطه ضعف است']
          }
        },
        disclaimer: 'این آزمون یک ابزار خودشناسی است، نه یک تشخیص بالینی. تیپ شخصیتی خوب یا بد وجود ندارد و نتیجه شما در دوره‌های مختلف زندگی می‌تواند کمی تغییر کند؛ آن را یک توصیف بدانید، نه یک برچسب دائمی.'
      },
      // Enneagram and DISC both report a *ranked profile* rather than a score or a
      // set of dichotomies, so they carry `scales` and are drawn by
      // resultsHtmlProfile(). Nine (or four) independent scales are summed, ranked,
      // and the top one is named — with the runner-up reported too, because on both
      // instruments the second-highest scale is part of the real answer, not noise.
      //
      // Both are honestly framed in `about`: neither has the psychometric standing
      // of the clinical screeners above them on this page, and saying so is the
      // only way an "accurate" result means anything here.
      {
        id: 'enneagram',
        art: 'test-enneagram-w',
        name: 'آزمون انیاگرام',
        subtitle: 'Enneagram',
        short: 'نُه تیپ شخصیتی بر پایه انگیزه‌های درونی — نه رفتار بیرونی. تیپ اصلی، بال، و مرکز هیجانی شما را با توضیح کامل مشخص می‌کند.',
        about: 'انیاگرام شخصیت را بر پایه نُه الگوی انگیزشی توصیف می‌کند. تفاوت مهم آن با آزمون‌های صفت‌محور (مثل پنج عامل بزرگ) این است که به جای پرسیدن «چه می‌کنید»، می‌پرسد «چرا می‌کنید»: دو نفر می‌توانند رفتار یکسانی داشته باشند و تیپ کاملاً متفاوتی، چون ترس و انگیزه پشت آن رفتار فرق دارد. نتیجه شما شامل تیپ اصلی، «بال» (تیپ همسایه‌ای که بیشترین اثر را روی شماست) و مرکز هیجانی‌تان است. سؤال‌های این نسخه بر اساس توصیف‌های استاندارد نُه تیپ نوشته شده‌اند. یک نکته را صادقانه بدانید: انیاگرام یک چارچوب خودشناسی است و پشتوانه پژوهشی آن به‌اندازه ابزارهای بالینی این صفحه (مثل PHQ-9 یا DASS-21) نیست؛ آن را برای شناخت بهتر خودتان به کار ببرید، نه برای تشخیص.',
        icon: '<circle cx="12" cy="12" r="8.8" stroke="#FFFFFF" stroke-width="1.5"/><path d="M12 3.2 5.4 16.4h13.2L12 3.2Z" stroke="#FFFFFF" stroke-width="1.3" stroke-linejoin="round"/>',
        duration: 'حدود ۸ تا ۱۰ دقیقه',
        instruction: 'مشخص کنید هر جمله چقدر درباره شما درست است. به آنچه واقعاً هستید پاسخ دهید، نه به آنچه دوست دارید باشید.',
        options: OPTS_BIGFIVE,
        questions: [
          // تیپ ۱
          'وقتی کاری اشتباه انجام شده، حتی اگر به من ربطی نداشته باشد، نمی‌توانم از کنارش بگذرم',
          'یک صدای انتقادگر درونی دارم که مدام کارهایم را ارزیابی می‌کند',
          'درست و غلط برایم روشن است و کوتاه‌آمدن از اصولم برایم سخت است',
          'وقتی از دست کسی عصبانی می‌شوم، سعی می‌کنم خشمم را نشان ندهم چون به نظرم درست نیست',
          'اگر قرار است کاری را انجام دهم، باید بی‌عیب باشد؛ وگرنه ترجیح می‌دهم اصلاً انجامش ندهم',
          // تیپ ۲
          'نیازهای دیگران را زودتر از نیازهای خودم متوجه می‌شوم',
          'دوست دارم آدم‌ها احساس کنند به من نیاز دارند',
          'کمک‌کردن برایم آسان است، اما درخواست کمک برایم سخت',
          'وقتی محبتم را جبران نمی‌کنند، بیشتر از آنچه نشان می‌دهم دلخور می‌شوم',
          'رابطه‌های نزدیک، مهم‌ترین چیز در زندگی من هستند',
          // تیپ ۳
          'موفق‌بودن در نظر دیگران برایم اهمیت زیادی دارد',
          'می‌توانم خودم را با هر جمعی تطبیق دهم تا بهترین تصویر را از خودم بسازم',
          'وقتی کاری نمی‌کنم و دستاوردی ندارم، احساس بی‌ارزشی می‌کنم',
          'شکست را به‌سختی می‌پذیرم و ترجیح می‌دهم کسی از آن باخبر نشود',
          'اهدافم را با سرعت و کارآمدی دنبال می‌کنم، حتی به قیمت خستگی',
          // تیپ ۴
          'احساس می‌کنم با بقیه فرق دارم و کسی کاملاً درکم نمی‌کند',
          'احساس‌های عمیق، حتی وقتی غمگین باشند، برایم از حالِ خوبِ سطحی باارزش‌ترند',
          'اغلب حس می‌کنم چیزی در زندگی‌ام کم است که دیگران آن را دارند',
          'اصیل بودن و صادق ماندن با احساسم، مهم‌تر از خوشایند بودن است',
          'حال‌وهوایم زیاد تغییر می‌کند و این بخشی از من است',
          // تیپ ۵
          'پیش از وارد شدن به هر موقعیتی، دوست دارم اطلاعات کافی داشته باشم',
          'انرژی و وقتم محدود است و مراقبم کسی آن را از من نگیرد',
          'ترجیح می‌دهم ناظر باشم تا شرکت‌کننده',
          'وقتی کسی توقع عاطفی زیادی از من دارد، عقب می‌کشم',
          'مستقل بودن و نیاز نداشتن به دیگران برایم ارزش زیادی دارد',
          // تیپ ۶
          'ذهنم به‌طور خودکار به این فکر می‌کند که چه چیزی ممکن است اشتباه پیش برود',
          'به آدم‌ها و گروه‌هایی که به آن‌ها تعلق دارم بسیار وفادارم',
          'پیش از تصمیم‌گیری نظر چند نفر را می‌پرسم، چون به قضاوت خودم شک دارم',
          'اعتماد کردن برایم زمان می‌برد، اما وقتی اعتماد کنم پایدار است',
          'در موقعیت‌های نامطمئن، دنبال یک مرجع یا قاعده مطمئن می‌گردم',
          // تیپ ۷
          'ذهنم همیشه پر از برنامه‌ها و گزینه‌های هیجان‌انگیز برای آینده است',
          'وقتی حال بدی پیش می‌آید، سریع حواسم را با چیز دیگری پرت می‌کنم',
          'محدود شدن و گیر افتادن در یک روال ثابت، بدترین حس برای من است',
          'ترجیح می‌دهم چند کار جذاب را هم‌زمان داشته باشم تا یک کار را تا ته',
          'به آینده خوش‌بینم و معمولاً جنبه مثبت ماجرا را می‌بینم',
          // تیپ ۸
          'ترجیح می‌دهم کنترل اوضاع دست خودم باشد تا دست کس دیگری',
          'وقتی به کسی ظلم می‌شود، خودم را وسط ماجرا می‌اندازم',
          'حرفم را رک و بی‌رودربایستی می‌زنم، حتی اگر فضا را متشنج کند',
          'نشان دادن ضعف یا آسیب‌پذیری برایم بسیار سخت است',
          'انرژی و شدت من، گاهی برای اطرافیانم زیاد است',
          // تیپ ۹
          'برای اینکه آرامش حفظ شود، از خواسته خودم می‌گذرم',
          'تصمیم‌گیری برایم سخت است، چون همه طرف‌های ماجرا را می‌بینم',
          'از تعارض و بحث، تا جایی که بشود، فاصله می‌گیرم',
          'گاهی خودم هم نمی‌دانم واقعاً چه می‌خواهم',
          'کارهای مهم را به تعویق می‌اندازم و به کارهای کم‌اهمیت مشغول می‌شوم'
        ],
        wings: true,
        centers: {
          gut:   { label:'مرکز غریزه', core:'خشم',
            note:'تیپ‌های ۸، ۹ و ۱ از مرکز غریزه عمل می‌کنند و هسته هیجانی مشترکشان خشم است: هشت آن را بیرون می‌ریزد، یک آن را فرو می‌خورد و نه آن را بی‌حس می‌کند. کار اصلی این مرکز، ساختن رابطه‌ای سالم با خشم و با مرزهای خود است.' },
          heart: { label:'مرکز احساس', core:'شرم',
            note:'تیپ‌های ۲، ۳ و ۴ از مرکز احساس عمل می‌کنند و پرسش مشترکشان «آیا ارزشمندم؟» است: دو با محبت کردن به آن پاسخ می‌دهد، سه با موفقیت و چهار با اصالت. کار اصلی این مرکز، جدا کردن ارزش خود از تصویری است که دیگران می‌بینند.' },
          head:  { label:'مرکز ذهن', core:'ترس',
            note:'تیپ‌های ۵، ۶ و ۷ از مرکز ذهن عمل می‌کنند و هسته مشترکشان ترس است: پنج با دانستن به آن پاسخ می‌دهد، شش با آماده شدن و هفت با فاصله گرفتن. کار اصلی این مرکز، ساختن حس امنیت در درون است، به‌جای جست‌وجوی مداوم آن در بیرون.' }
        },
        scales: [
          { key:'۱', label:'اصلاح‌گر', tag:'تیپ ۱', color:'var(--teal)', center:'gut',
            indices:[0,1,2,3,4],
            desc:'انگیزه اصلی شما درست بودن است: می‌خواهید کار را همان‌طور که باید انجام دهید و آنچه اطرافتان غلط است را اصلاح کنید. یک ارزیابِ درونی مدام کارهایتان را قضاوت می‌کند — همان چیزی که هم دقت شما را می‌سازد و هم آرامش را از شما می‌گیرد. خشم را معمولاً فرو می‌خورید، چون ابراز آن به نظرتان درست نیست.',
            strengths:['دقت و مسئولیت‌پذیری بالا','پایبندی به اصول و صداقت','دیدن آنچه باید اصلاح شود','قابل‌اتکا بودن در تعهدها'],
            growth:['خودانتقادی مداوم و سخت‌گیری به خودتان','خشم فروخورده‌ای که به‌شکل دلخوری بیرون می‌زند','دشواری در پذیرفتن «به‌اندازه کافی خوب»'],
            advice:'تمرین اصلی شما جدا کردن «معیار» از «ارزش خودتان» است: می‌شود کار را با دقت انجام داد، بدون آنکه هر نقص کوچک به قضاوتی درباره خودتان تبدیل شود.' },
          { key:'۲', label:'یاری‌گر', tag:'تیپ ۲', color:'var(--coral)', center:'heart',
            indices:[5,6,7,8,9],
            desc:'انگیزه اصلی شما دوست‌داشته شدن و مورد نیاز بودن است. نیاز دیگران را سریع‌تر از نیاز خودتان می‌بینید و در نزدیک شدن به آدم‌ها مهارت دارید. هزینه پنهانش این است که خواسته‌های خودتان آن‌قدر عقب می‌افتند که گاهی دیگر نمی‌دانید چه هستند.',
            strengths:['همدلی و گرمای واقعی در روابط','دیدن نیازِ نگفته دیگران','سخاوت و حضور در سختی‌ها','ایجاد سریع صمیمیت'],
            growth:['نادیده گرفتن نیازهای خودتان','دشواری در «نه» گفتن','دلخوری وقتی محبت جبران نمی‌شود'],
            advice:'مهم‌ترین کار برای شما تمرین بیان مستقیم نیاز است — نه از راه محبت کردن، به این امید که طرف مقابل حدس بزند.' },
          { key:'۳', label:'موفقیت‌طلب', tag:'تیپ ۳', color:'var(--gold-deep)', center:'heart',
            indices:[10,11,12,13,14],
            desc:'انگیزه اصلی شما ارزشمند بودن است، و ارزش را در دستاورد و در تصویری که از شما دیده می‌شود می‌جویید. کارآمد، پرانرژی و هدف‌مدارید و می‌توانید خودتان را با هر محیطی تطبیق دهید. خطرش این است که بین «آنچه هستید» و «آنچه نشان می‌دهید» فاصله بیفتد.',
            strengths:['انرژی و کارآمدی بالا','هدف‌گذاری و رسیدن به نتیجه','انعطاف در موقعیت‌های مختلف','الهام‌بخشی برای دیگران'],
            growth:['گره خوردن ارزش خود به موفقیت','دشواری در دیدن و بیان احساسات','خستگی مزمن از متوقف نشدن'],
            advice:'تمرین شما پیدا کردن جایی است که در آن بدون هیچ دستاوردی هم پذیرفته می‌شوید؛ همان‌جا معلوم می‌شود ارزشتان به عملکردتان گره نخورده است.' },
          { key:'۴', label:'فردگرا', tag:'تیپ ۴', color:'var(--lavender)', center:'heart',
            indices:[15,16,17,18,19],
            desc:'انگیزه اصلی شما اصیل و بی‌همتا بودن است. عمق احساسی دارید و از سطحی بودن گریزانید؛ همین باعث می‌شود در هنر، در همدلی و در درک تجربه‌های دشوار قوی باشید. در مقابل، مقایسه با دیگران و حس «چیزی کم است» مدام برمی‌گردد.',
            strengths:['عمق عاطفی و خودآگاهی','اصالت و صداقت با احساسات','همراهی واقعی با درد دیگران','خلاقیت و حس زیبایی‌شناسی'],
            growth:['مقایسه مداوم و حس کمبود','نوسان خلقی و غرق شدن در احساس','دوری از کارهای عادی و روزمره'],
            advice:'برای شما تمرین روی «همین‌که هست» بیشترین اثر را دارد: دیدن آنچه دارید، پیش از رفتن سراغ آنچه ندارید.' },
          { key:'۵', label:'پژوهشگر', tag:'تیپ ۵', color:'var(--sky)', center:'head',
            indices:[20,21,22,23,24],
            desc:'انگیزه اصلی شما توانمند و بی‌نیاز بودن است. با فهمیدن و دانستن احساس امنیت می‌کنید و انرژی و حریم شخصی‌تان را با دقت محافظت می‌کنید. تحلیل عمیق نقطه قوت شماست؛ فاصله گرفتن از احساس و از آدم‌ها، هزینه‌اش.',
            strengths:['تحلیل عمیق و تفکر مستقل','آرامش در بحران','تخصص در حوزه‌های موردعلاقه','خودکفایی'],
            growth:['فاصله گرفتن عاطفی از نزدیکان','جایگزین کردن تجربه کردن با فکر کردن','ته کشیدن انرژی در تعامل‌های طولانی'],
            advice:'تمرین شما ورود به موقعیت است پیش از آنکه کاملاً آماده باشید — چون بخشی از آنچه لازم دارید فقط در خودِ تجربه به دست می‌آید.' },
          { key:'۶', label:'وفادار', tag:'تیپ ۶', color:'var(--teal-deep)', center:'head',
            indices:[25,26,27,28,29],
            desc:'انگیزه اصلی شما امنیت و داشتن تکیه‌گاه است. ذهنتان به‌طور خودکار خطرها را می‌بیند و همین شما را در پیش‌بینی مشکلات و در بحران فوق‌العاده می‌کند. در مقابل، شک و تردید — به خودتان و به دیگران — می‌تواند فرساینده شود.',
            strengths:['وفاداری و تعهد کم‌نظیر','پیش‌بینی خطر و آماده‌سازی','مسئولیت‌پذیری در بحران','شجاعت در دفاع از جمع'],
            growth:['اضطراب و سناریوهای بدترین‌حالت','شک به قضاوت خودتان','آزمودن مکرر اعتماد دیگران'],
            advice:'مهم‌ترین تمرین شما اعتماد به قضاوت خودتان است: تصمیم‌های کوچک را بدون مشورت بگیرید تا به خودتان نشان دهید ذهنتان قابل‌اتکاست.' },
          { key:'۷', label:'مشتاق', tag:'تیپ ۷', color:'var(--gold)', center:'head',
            indices:[30,31,32,33,34],
            desc:'انگیزه اصلی شما آزادی و دور ماندن از محدودیت و درد است. ذهنی سریع، خوش‌بین و پر از گزینه دارید و در ساختن شور و انرژی در جمع بی‌نظیرید. نقطه دشوارتان ماندن است: ماندن در یک کار، در یک رابطه، و به‌ویژه در یک احساس ناخوشایند.',
            strengths:['انرژی و خوش‌بینی مسری','ذهن سریع و چندوجهی','دیدن فرصت در هر موقعیت','شجاعت در شروع کارهای تازه'],
            growth:['گریز از احساسات ناخوشایند','نیمه‌کاره ماندن کارها','بی‌قراری و ترس از محدود شدن'],
            advice:'برای شما، ماندن در یک احساس ناخوشایند بدون فرار کردن — حتی چند دقیقه — بیشترین رشد را می‌سازد.' },
          { key:'۸', label:'چالش‌گر', tag:'تیپ ۸', color:'var(--coral)', center:'gut',
            indices:[35,36,37,38,39],
            desc:'انگیزه اصلی شما محافظت از خود و کنترل داشتن بر سرنوشتتان است. قوی، رک و بی‌واسطه‌اید و در برابر بی‌عدالتی می‌ایستید. زیر این قدرت، معمولاً مقاومتی جدی در برابر نشان دادن آسیب‌پذیری وجود دارد.',
            strengths:['قاطعیت و شجاعت در تصمیم','حمایت واقعی از افراد تحت مسئولیت','صراحت و شفافیت','ایستادگی در برابر فشار'],
            growth:['دشواری در نشان دادن آسیب‌پذیری','شدت لحن که گاهی دیگران را عقب می‌راند','مقاومت در برابر کنترل شدن، حتی وقتی لازم است'],
            advice:'تمرین شما این است که در یک رابطه امن، نرمی و نیاز خودتان را نشان دهید؛ این تضعیف قدرت نیست، تکمیل آن است.' },
          { key:'۹', label:'صلح‌طلب', tag:'تیپ ۹', color:'var(--teal)', center:'gut',
            indices:[40,41,42,43,44],
            desc:'انگیزه اصلی شما آرامش و حفظ پیوند است. حضوری آرام‌بخش دارید، همه طرف‌های ماجرا را می‌بینید و در میانجی‌گری بی‌نظیرید. هزینه‌اش این است که خواسته خودتان کم‌رنگ می‌شود — گاهی تا جایی که خودتان هم آن را گم می‌کنید.',
            strengths:['آرامش و پذیرش دیگران','دیدن همه طرف‌های یک ماجرا','صبر و پایداری','ایجاد حس امنیت در روابط'],
            growth:['گم کردن خواسته خود برای حفظ آرامش','به تعویق انداختن کارهای مهم','پرهیز از تعارض حتی وقتی لازم است'],
            advice:'برای شما، بیان یک ترجیح کوچک و روشن در هر روز — حتی درباره غذا یا برنامه — تمرین اصلی است.' }
        ],
        steps: [
          'تیپ خود را از روی انگیزه‌تان بسنجید، نه رفتارتان؛ اگر توضیح تیپ دوم بیشتر با «چرا»ی شما جور است، احتمالاً آن تیپ اصلی شماست.',
          'روی «زمینه‌های رشد» تمرکز کنید، نه روی نقاط قوت — همان‌ها معمولاً همان الگوهایی هستند که در روابط برایتان تکرار می‌شوند.',
          'بال شما یک تیپ دوم نیست؛ رنگی است که روی تیپ اصلی‌تان می‌نشیند و توضیح می‌دهد چرا با هم‌تیپ‌های خودتان هم فرق دارید.',
          'انیاگرام حالِ امروز شما را نمی‌سنجد. اگر این روزها حالتان خوب نیست، آزمون DASS-21 یا PHQ-9 پاسخ مفیدتری به شما می‌دهد.'
        ],
        disclaimer: 'انیاگرام یک چارچوب خودشناسی است، نه ابزار تشخیص بالینی، و اعتبار پژوهشی آن به‌اندازه پرسشنامه‌های استاندارد این صفحه نیست. نتیجه را توصیفی از انگیزه‌های خودتان بدانید، نه برچسبی ثابت.'
      },
      {
        id: 'disc',
        art: 'test-disc-w',
        name: 'آزمون سبک رفتاری DISC',
        subtitle: 'DISC',
        short: 'پرکاربردترین مدل سبک ارتباطی در محیط کار؛ سبک غالب و سبک دوم شما را در چهار بعد قاطعیت، تأثیرگذاری، ثبات و دقت مشخص می‌کند.',
        about: 'مدل DISC رفتار قابل‌مشاهده را در چهار سبک توصیف می‌کند: قاطعیت (D)، تأثیرگذاری (I)، ثبات (S) و دقت (C). برخلاف آزمون‌های شخصیت، DISC ادعا نمی‌کند «شما که هستید» را می‌سنجد؛ می‌گوید در تعامل با دیگران و به‌ویژه در محیط کار چطور رفتار می‌کنید — و همین آن را برای بهبود ارتباط، کار تیمی و مدیریت تعارض مفید کرده است. نتیجه شما سبک غالب و سبک دومتان را مشخص می‌کند، چون تقریباً هیچ‌کس فقط یک سبک ندارد. این نسخه با مقیاس درجه‌ای اجرا می‌شود (نه انتخاب اجباری)، بنابراین چهار سبک مستقل از هم سنجیده می‌شوند و می‌توانید در بیش از یکی نمره بالا بگیرید. صادقانه بدانید که DISC یک ابزار توسعه فردی و سازمانی است، نه یک آزمون بالینی؛ برای غربالگری سلامت روان از آن استفاده نکنید.',
        icon: '<circle cx="12" cy="12" r="8.8" stroke="#FFFFFF" stroke-width="1.5"/><path d="M12 3.2v17.6M3.2 12h17.6" stroke="#FFFFFF" stroke-width="1.3"/>',
        duration: 'حدود ۵ دقیقه',
        instruction: 'مشخص کنید هر جمله چقدر درباره شما درست است. به رفتار واقعی‌تان در محیط کار و در تعامل با دیگران فکر کنید.',
        options: OPTS_BIGFIVE,
        questions: [
          // D
          'در موقعیت‌های مبهم، معمولاً من هستم که تصمیم می‌گیرم و کار را جلو می‌برم',
          'رسیدن به نتیجه برایم از رعایت تشریفات مهم‌تر است',
          'مخالفت کردن و وارد بحث شدن برایم راحت است',
          'کندی و بلاتکلیفی دیگران زود کلافه‌ام می‌کند',
          'چالش و رقابت، انگیزه‌ام را بیشتر می‌کند',
          'ترجیح می‌دهم رئیس کار خودم باشم تا اینکه به من بگویند چه کنم',
          // I
          'به‌راحتی با آدم‌های تازه ارتباط می‌گیرم و فضا را گرم می‌کنم',
          'با حرف زدن و انرژی‌ام می‌توانم دیگران را همراه کنم',
          'کار کردن در جمع، بیشتر از تنهایی به من انرژی می‌دهد',
          'خوش‌بینم و معمولاً روی امکان‌ها تمرکز می‌کنم تا موانع',
          'دوست دارم دیده و تحسین شوم',
          'گاهی پیش از آنکه جزئیات را بسنجم، با اشتیاق قول می‌دهم',
          // S
          'محیط آرام و قابل‌پیش‌بینی را به محیط پرتغییر ترجیح می‌دهم',
          'شنونده صبوری هستم و آدم‌ها راحت با من درد دل می‌کنند',
          'وقتی تیم به‌هم می‌ریزد، من همان کسی هستم که فضا را آرام می‌کند',
          'تغییرهای ناگهانی، حتی وقتی خوب باشند، اول اذیتم می‌کنند',
          'به آدم‌ها و جاهایی که به آن‌ها تعلق دارم مدت‌ها وفادار می‌مانم',
          '«نه» گفتن برایم سخت است، چون نمی‌خواهم کسی را ناراحت کنم',
          // C
          'پیش از تصمیم‌گیری، اطلاعات و جزئیات را کامل بررسی می‌کنم',
          'کیفیت و درست بودن کار، برایم از سرعت آن مهم‌تر است',
          'وقتی چیزی با استاندارد من نمی‌خواند، نمی‌توانم رهایش کنم',
          'ترجیح می‌دهم قاعده و روال مشخصی برای کارها وجود داشته باشد',
          'از اشتباه کردن — به‌خصوص جلوی دیگران — بدم می‌آید',
          'انتقاد را وقتی با دلیل و داده همراه باشد بهتر می‌پذیرم'
        ],
        scales: [
          { key:'D', label:'قاطعیت', tag:'Dominance', color:'var(--coral)',
            indices:[0,1,2,3,4,5],
            desc:'سبک غالب شما قاطعیت است: مستقیم، نتیجه‌محور و سریع. در موقعیت‌های مبهم جلو می‌افتید، تصمیم می‌گیرید و کار را حرکت می‌دهید. چالش و رقابت به شما انرژی می‌دهد و از رودررویی نمی‌ترسید.',
            strengths:['تصمیم‌گیری سریع در شرایط مبهم','تمرکز بر نتیجه','شجاعت در رودررویی و مذاکره','رهبری طبیعی در بحران'],
            growth:['بی‌حوصلگی نسبت به سرعت دیگران','لحن مستقیم که گاهی تند برداشت می‌شود','کم‌توجهی به جزئیات و به حال‌وهوای جمع'],
            advice:'بیشترین رشد شما از یک مکث کوتاه پیش از پاسخ می‌آید: همان چند ثانیه، تفاوت میان قاطعیت و تندی است.',
            withYou:'مستقیم و کوتاه حرف بزنید، نتیجه را اول بگویید، و اختیار عمل بدهید.' },
          { key:'I', label:'تأثیرگذاری', tag:'Influence', color:'var(--gold)',
            indices:[6,7,8,9,10,11],
            desc:'سبک غالب شما تأثیرگذاری است: اجتماعی، خوش‌بین و متقاعدکننده. با انرژی و ارتباطتان دیگران را همراه می‌کنید و در ساختن فضای مثبت و شبکه ارتباطی مهارت دارید.',
            strengths:['ارتباط‌گیری سریع و گرم','همراه کردن و انگیزه دادن به دیگران','خوش‌بینی و انرژی در تیم','راحتی در بیان و ارائه'],
            growth:['کم‌توجهی به جزئیات و پیگیری','قول دادن بیش از توان اجرا','نیاز به تأیید و دیده شدن'],
            advice:'تمرین شما مکتوب کردن تعهدهاست: اشتیاق لحظه را نگه دارید، اما پیش از «بله» گفتن، به تقویم نگاه کنید.',
            withYou:'فضای گفت‌وگو بدهید، قدردانی را به زبان بیاورید، و جزئیات را مکتوب کنید.' },
          { key:'S', label:'ثبات', tag:'Steadiness', color:'var(--teal)',
            indices:[12,13,14,15,16,17],
            desc:'سبک غالب شما ثبات است: آرام، صبور و قابل‌اتکا. محیط پایدار را ترجیح می‌دهید، شنونده خوبی هستید و در نگه داشتن انسجام تیم نقش کلیدی دارید.',
            strengths:['صبر و شنیدن واقعی','وفاداری و پایداری بلندمدت','آرام کردن فضای متشنج','همکاری بدون رقابت'],
            growth:['دشواری در «نه» گفتن','مقاومت اولیه در برابر تغییر','نگه داشتن نارضایتی به‌جای بیان آن'],
            advice:'مهم‌ترین تمرین شما بیان زودهنگام نارضایتی است — پیش از آنکه روی هم جمع شود و به یک انفجار یا یک کناره‌گیری بی‌صدا برسد.',
            withYou:'تغییرها را از قبل اطلاع بدهید، برای تصمیم زمان بگذارید، و نظرشان را صریح بپرسید.' },
          { key:'C', label:'دقت', tag:'Conscientiousness', color:'var(--sky)',
            indices:[18,19,20,21,22,23],
            desc:'سبک غالب شما دقت است: تحلیلی، منظم و استانداردمحور. پیش از تصمیم، اطلاعات را کامل می‌کنید و کیفیت برایتان از سرعت مهم‌تر است.',
            strengths:['دقت و کیفیت بالای کار','تحلیل منطقی و مبتنی بر داده','نظم و پایبندی به روال','دیدن خطاها پیش از وقوع'],
            growth:['کمال‌گرایی و کندی در تصمیم','سخت‌گیری به خود و به دیگران','دشواری در پذیرش انتقادِ بدون دلیل'],
            advice:'تمرین شما تعیین یک سقف زمانی برای بررسی است: در بیشتر تصمیم‌ها، اطلاعاتِ کافی خیلی زودتر از اطلاعاتِ کامل به دست می‌آید.',
            withYou:'داده و دلیل بیاورید، انتظارات را دقیق مشخص کنید، و برای بررسی زمان بدهید.' }
        ],
        steps: [
          'سبک غالب و سبک دومتان را با هم بخوانید؛ رفتار واقعی شما ترکیب همان دو است، نه فقط اولی.',
          'بخش «برای کار کردن با شما» را با همکار یا همسرتان در میان بگذارید — بیشترین ارزش DISC دقیقاً همین‌جاست.',
          'سبکِ کم‌نمره را ضعف ندانید؛ فقط جایی است که رفتار طبیعی‌تان انرژی بیشتری از شما می‌گیرد.',
          'در محیط پرفشار، سبک غالب معمولاً پررنگ‌تر می‌شود. اگر این پررنگ شدن به تعارض می‌رسد، همان‌جا جای کار کردن است.'
        ],
        disclaimer: 'DISC یک ابزار توسعه فردی و سازمانی است، نه آزمون بالینی و نه سنجه هوش یا توانمندی. نتیجه آن سبک رفتاری شما را توصیف می‌کند و نباید مبنای تصمیم‌های استخدامی یا درمانی قرار بگیرد.'
      }
    ];

    let currentTest = null, qIndex = -1, answers = [];

    function scoredValueWith(test, i, reverseList){
      const raw = answers[i];
      if (!reverseList || !reverseList.includes(i)) return raw;
      const scaleMax = Math.max(...test.options.map(o => o.value));
      const scaleMin = Math.min(...test.options.map(o => o.value));
      return scaleMax + scaleMin - raw;
    }
    function computeTotal(test){
      return answers.reduce((sum, _, i) => sum + scoredValueWith(test, i, test.reverse), 0);
    }
    function computeDimTotal(test, dim){
      // ASRS Part A is not a sum. Its published scoring counts how many items
      // cross a per-item frequency threshold ("shaded box"), and the threshold is
      // deliberately different for different items — so this branch reproduces
      // the instrument's own rule rather than approximating it with a total.
      if (dim.thresholds){
        return dim.indices.reduce((n, i) => n + ((answers[i] != null && answers[i] >= dim.thresholds[i]) ? 1 : 0), 0);
      }
      const raw = dim.indices.reduce((sum, i) => sum + scoredValueWith(test, i, dim.reverse), 0);
      return raw * (dim.multiplier || 1);
    }
    function findBandIn(bands, total){
      return bands.find(b => total >= b.min && total <= b.max) || bands[bands.length - 1];
    }
    function findBand(test, total){
      return findBandIn(test.bands, total);
    }

    // --- type-based scoring (16 Personalities) ---
    // Each axis is a tug-of-war between two poles: the raw sum is mapped onto a
    // 0-100 scale where 100 means "fully pole b". A tie (exactly 50) resolves to
    // b, which only matters for a perfectly neutral answer sheet.
    function computeAxis(test, axis){
      const raw = axis.indices.reduce((sum, i) => sum + scoredValueWith(test, i, axis.reverse), 0);
      const scaleMin = Math.min(...test.options.map(o => o.value));
      const scaleMax = Math.max(...test.options.map(o => o.value));
      const lo = axis.indices.length * scaleMin;
      const hi = axis.indices.length * scaleMax;
      const pctB = Math.round(((raw - lo) / (hi - lo)) * 100);
      const bWins = pctB >= 50;
      return { raw, pctB, pctA: 100 - pctB, bWins, side: bWins ? axis.b : axis.a };
    }
    // --- profile scoring (Enneagram, DISC) ---
    // N independent scales, each summed and expressed as a percentage of its own
    // possible range so scales with different item counts stay comparable. The
    // ranking is what the result is built from.
    function computeProfile(test){
      const scaleMin = Math.min(...test.options.map(o => o.value));
      const scaleMax = Math.max(...test.options.map(o => o.value));
      const rows = test.scales.map((sc, i) => {
        const raw = sc.indices.reduce((sum, idx) => sum + scoredValueWith(test, idx, sc.reverse), 0);
        const lo = sc.indices.length * scaleMin;
        const hi = sc.indices.length * scaleMax;
        return { sc, i, raw, pct: Math.round(((raw - lo) / (hi - lo)) * 100) };
      });
      // ties break on the questionnaire's own order, so the same answer sheet always
      // produces the same result rather than depending on sort implementation
      const ranked = rows.slice().sort((a, b) => (b.raw - a.raw) || (a.i - b.i));
      const top = ranked[0], second = ranked[1];
      // a runner-up within 8 points is not meaningfully lower — reporting a single
      // winner there would invent a certainty the answers do not support
      const tied = (top.pct - second.pct) <= 8;
      let wing = null;
      if (test.wings){
        const n = test.scales.length;
        const left  = rows[(top.i - 1 + n) % n];
        const right = rows[(top.i + 1) % n];
        wing = left.raw >= right.raw ? left : right;
      }
      return { rows, ranked, top, second, tied, wing };
    }

    function computeType(test){
      const parts = test.axes.map(ax => computeAxis(test, ax));
      // first four axes spell the classic four-letter code; the fifth (identity)
      // is appended as the -A / -T suffix, the way 16 Personalities reports it
      const base = parts.slice(0, 4).map(p => p.side.letter).join('');
      return { parts, base, code: base + '-' + parts[4].side.letter, profile: test.types[base] };
    }

    function renderGrid(){
      grid.innerHTML = TESTS.map(t => `
        <div class="test-card">
          <span class="test-card__icon">${artHtml(t, 'test-card__art')}</span>
          <h3>${t.name} <span class="test-card__abbr">(${t.subtitle})</span></h3>
          <p>${t.short}</p>
          <div class="test-card__meta"><span>${t.questions.length} سؤال</span><span>${t.duration}</span></div>
          <button type="button" class="btn btn--primary" data-start-test="${t.id}">شروع تست</button>
        </div>
      `).join('');
      grid.querySelectorAll('[data-start-test]').forEach(btn => {
        btn.addEventListener('click', () => openTest(btn.getAttribute('data-start-test')));
      });
    }

    function introHtml(test){
      return `
        <div class="test-intro">
          <span class="test-intro__icon">${artHtml(test, 'test-intro__art')}</span>
          <h3>${test.name} <span class="test-card__abbr">(${test.subtitle})</span></h3>
          <p>${test.about || test.short}</p>
          <div class="test-intro__note">این تست ${test.questions.length} سؤال دارد و ${test.duration} زمان می‌برد. پاسخ‌های شما کاملاً خصوصی می‌مانند؛ فقط با انتخاب خودتان و در انتها می‌توانید نتیجه را برای ما در واتساپ ارسال کنید.</div>
          <button type="button" class="btn btn--primary" id="testStartBtn">شروع تست<svg class="btn__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M19 12H5M11 6l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        </div>`;
    }

    function questionHtml(test, i){
      const pct = Math.round((i / test.questions.length) * 100);
      const picked = answers[i];
      return `
        <div class="test-progress-track"><div class="test-progress-fill" style="width:${pct}%"></div></div>
        <div class="test-progress-label">سؤال ${i + 1} از ${test.questions.length}</div>
        <div class="test-question">${test.questions[i]}</div>
        <div class="test-options">
          ${test.options.map(o => `<button type="button" class="test-option${picked === o.value ? ' is-picked' : ''}" data-value="${o.value}">${o.label}</button>`).join('')}
        </div>
        <button type="button" class="test-back" id="testBackBtn"${i === 0 ? ' disabled' : ''}>&larr; سؤال قبلی</button>`;
    }

    function crisisHtml(test, delay){
      const crisisTriggered = test.crisisIndex != null && answers[test.crisisIndex] > 0;
      if (!crisisTriggered) return '';
      return `<div class="test-crisis test-reveal" style="animation-delay:${delay}s;"><strong>مهم — همین حالا بخوانید</strong><p>در یکی از پاسخ‌ها به افکار آسیب‌رساندن به خود اشاره کرده‌اید. اگر این افکار جدی یا فوری هستند، لطفاً تنها نمانید: با یکی از نزدیکان صحبت کنید، یا با اورژانس اجتماعی (۱۲۳) یا اورژانس (۱۱۵) تماس بگیرید. تیم ما هم آماده است در سریع‌ترین زمان ممکن با شما تماس بگیرد.</p></div>`;
    }

    function actionsHtml(delay){
      return `<div class="test-results__actions test-reveal" style="animation-delay:${delay}s;">
          <button type="button" class="btn btn--primary" id="testSendWa">ارسال نتیجه در واتساپ</button>
          <button type="button" class="btn btn--ghost" id="testRetake">شروع دوباره</button>
          <button type="button" class="btn btn--ghost" id="testBackToList">بازگشت به لیست تست‌ها</button>
        </div>`;
    }

    function resultsHtml(test){
      if (test.axes) return resultsHtmlType(test);
      if (test.scales) return resultsHtmlProfile(test);
      if (test.dimensions) return resultsHtmlMulti(test);
      const total = computeTotal(test);
      const band = findBand(test, total);
      const floor = test.min || 0;
      const pct = Math.max(0, Math.min(100, Math.round(((total - floor) / (test.max - floor)) * 100)));
      const gaugeBg = test.higherIsBetter
        ? 'linear-gradient(90deg, var(--coral) 0%, var(--gold) 50%, var(--teal) 100%)'
        : 'linear-gradient(90deg, var(--teal) 0%, var(--gold) 50%, var(--coral) 100%)';
      const crisis = crisisHtml(test, test.crisisIndex != null ? 0.4 : 0);
      const afterCrisisDelay = (test.crisisIndex != null && answers[test.crisisIndex] > 0) ? 0.48 : 0.4;
      return `
        <div class="test-results">
        <p class="test-reveal" style="color:var(--muted); font-weight:600; margin-bottom:2px; animation-delay:.02s;">نتیجه شما در ${test.name} (${test.subtitle})</p>
        <div class="test-results__score test-reveal" style="animation-delay:.08s;"><span id="testScoreNum" data-target="${total}">0</span><span class="test-results__scoreof"> / ${test.max}</span></div>
        <div class="test-gauge test-reveal" style="background:${gaugeBg}; animation-delay:.16s;"><div class="test-gauge__marker" id="testGaugeMarker" data-target-pct="${pct}" style="left:0%"></div></div>
        <span class="test-results__badge test-reveal" style="background:${band.color}; --glow:${band.color}; animation-delay:.24s;">${band.label}</span>
        <p class="test-results__text test-reveal" style="animation-delay:.32s;">${band.advice}</p>
        ${crisis}
        <p class="test-disclaimer test-reveal" style="animation-delay:${afterCrisisDelay}s;">این ابزار یک غربالگری اولیه علمی است، نه یک تشخیص قطعی؛ برای ارزیابی دقیق‌تر با یک روان‌شناس صحبت کنید.</p>
        ${actionsHtml(afterCrisisDelay + 0.08)}
        </div>`;
    }

    // ---- clinical-report presentation ----
    // Results are laid out the way a clinician writes up an assessment: an
    // identifying header, the measured findings one by one, then an impression
    // that reads ACROSS the findings, then recommendations. The synthesis is the
    // part a bare score can't give you — "moderate symptoms but severe functional
    // impairment" means something different from either number alone.

    function reportDate(){
      try { return new Intl.DateTimeFormat('fa-IR', { year:'numeric', month:'long', day:'numeric' }).format(new Date()); }
      catch(e){ return ''; }
    }

    function reportHeadHtml(test, delay){
      const d = reportDate();
      return `
        <div class="test-report__head test-reveal" style="animation-delay:${delay}s;">
          <span class="test-report__icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none">${test.icon}</svg></span>
          <div class="test-report__id">
            <h3>${test.name}</h3>
            <span class="test-report__sub">${test.subtitle}</span>
          </div>
          ${d ? `<span class="test-report__date">${d}</span>` : ''}
        </div>`;
    }

    // Every band carries a `level` 0-3 (0 = unremarkable … 3 = needs attention).
    // The impression is written for the HIGHEST level any dimension reached, and
    // then names the dimensions that got it there, so the text always matches the
    // numbers above it instead of being generic.
    function bandLevel(b){ return b && b.level != null ? b.level : 0; }

    // "الف، ب و ج" — a run of "و" between every item reads as a list of
    // afterthoughts rather than a sentence
    function faList(items){
      if (items.length <= 1) return items[0] || '';
      return items.slice(0, -1).join('، ') + ' و ' + items[items.length - 1];
    }

    function impressionHtml(test, parts, delay){
      const r = test.report;
      if (!r || !r.levels || !r.levels.length) return '';
      // Normally the impression is written for the worst finding. Some tests have
      // one sub-scale that is the actual verdict and the rest are supporting
      // detail — ASRS is the case: Part A is the validated screener, so a high
      // symptom load must never be allowed to report "screen positive" when the
      // screener itself came back under its cutoff. `levelFrom` names that
      // governing sub-scale; drivers still describe whatever stood out.
      const governing = r.levelFrom ? parts.find(p => p.dim.key === r.levelFrom) : null;
      const level = governing
        ? bandLevel(governing.band)
        : parts.reduce((mx, p) => Math.max(mx, bandLevel(p.band)), 0);
      const tier = r.levels[Math.min(level, r.levels.length - 1)];
      const topLevel = parts.reduce((mx, p) => Math.max(mx, bandLevel(p.band)), 0);
      const drivers = topLevel > 0 ? parts.filter(p => bandLevel(p.band) === topLevel) : [];
      const driverHtml = drivers.length
        ? `<p class="test-report__drivers">${drivers.length > 1 ? 'بارزترین یافته‌ها' : 'بارزترین یافته'}: ${drivers.map(p => `<b>${p.dim.label}</b> در محدوده «${p.band.label}»`).join('؛ ')}.</p>`
        : '';
      const steps = (r.steps && r.steps[Math.min(level, r.steps.length - 1)]) || [];
      return `
        <div class="test-report__impression test-reveal" style="animation-delay:${delay}s;">
          <span class="test-report__tag">جمع‌بندی</span>
          <h4>${tier.headline}</h4>
          ${driverHtml}
          <p>${tier.body}</p>
          ${steps.length ? `
          <div class="test-report__steps">
            <span class="test-report__steps-title">گام‌های پیشنهادی</span>
            <ul>${steps.map(s => `<li>${s}</li>`).join('')}</ul>
          </div>` : ''}
        </div>`;
    }

    const REPORT_DISCLAIMER = 'این گزارش حاصل یک پرسشنامه خودگزارشی است، نه معاینه بالینی. پرسشنامه‌ها وضعیت شما را در یک بازه زمانی مشخص می‌سنجند و جای گفت‌وگوی رو‌در‌رو با یک متخصص را نمی‌گیرند؛ تشخیص گذاشتن تنها بر عهده روان‌شناس یا روان‌پزشک است. اگر نتیجه با احساس واقعی شما نمی‌خواند، به احساس خودتان اعتماد کنید و آن را با یک متخصص در میان بگذارید.';

    function resultsHtmlMulti(test){
      const dims = test.dimensions.map(dim => {
        const total = computeDimTotal(test, dim);
        const band = findBandIn(dim.bands, total);
        const floor = dim.min || 0;
        const pct = Math.max(0, Math.min(100, Math.round(((total - floor) / (dim.max - floor)) * 100)));
        const gaugeBg = dim.higherIsBetter
          ? 'linear-gradient(90deg, var(--coral) 0%, var(--gold) 50%, var(--teal) 100%)'
          : 'linear-gradient(90deg, var(--teal) 0%, var(--gold) 50%, var(--coral) 100%)';
        return { dim, total, band, pct, gaugeBg };
      });
      const dimsDelay = 0.22;
      const lastDelay = dimsDelay + dims.length * 0.08;
      const crisis = crisisHtml(test, lastDelay);
      const afterCrisis = (test.crisisIndex != null && answers[test.crisisIndex] > 0) ? lastDelay + 0.08 : lastDelay;
      return `
        <div class="test-results test-report">
        ${reportHeadHtml(test, '.02')}
        <div class="test-report__section-label test-reveal" style="animation-delay:.10s;">یافته‌ها</div>
        <div class="test-dims">
          ${dims.map((d, idx) => `
          <div class="test-dim-card test-reveal" style="animation-delay:${(dimsDelay + idx * 0.08).toFixed(2)}s;">
            <div class="test-dim-card__head">
              <span class="test-dim-card__label">${d.dim.icon ? `<span class="test-dim-card__icon"><svg width="15" height="15" viewBox="0 0 24 24" fill="none">${d.dim.icon}</svg></span>` : ''}${d.dim.label}</span>
              <span class="test-dim-card__score"><span class="test-dim-count" data-target="${d.total}">0</span><span class="test-results__scoreof"> / ${d.dim.max}</span></span>
            </div>
            ${d.dim.about ? `<p class="test-dim-card__about">${d.dim.about}</p>` : ''}
            <div class="test-dim-card__gauge" style="background:${d.gaugeBg}"><div class="test-dim-card__marker" data-target-pct="${d.pct}" style="left:0%"></div></div>
            <span class="test-dim-card__badge" style="background:${d.band.color}">${d.band.label}</span>
            <p class="test-dim-card__text">${d.band.advice}</p>
          </div>`).join('')}
        </div>
        ${impressionHtml(test, dims, lastDelay.toFixed(2))}
        ${crisis}
        <p class="test-disclaimer test-reveal" style="animation-delay:${(afterCrisis + 0.08).toFixed(2)}s;">${REPORT_DISCLAIMER}</p>
        ${actionsHtml(afterCrisis + 0.16)}
        </div>`;
    }

    function resultsHtmlType(test){
      const res = computeType(test);
      const p = res.profile;
      const group = test.groups[p.group];
      const identity = res.parts[4].side;

      // The bar is drawn left-to-right regardless of page direction: pole a fills
      // from the left, pole b is the track colour showing through on the right.
      // The CSS pins these rows to direction:ltr so the labels line up with it.
      const axesHtml = test.axes.map((ax, idx) => {
        const a = res.parts[idx];
        return `
          <div class="test-axis test-reveal" style="animation-delay:${(0.38 + idx * 0.06).toFixed(2)}s;">
            <div class="test-axis__title">${ax.icon ? `<span class="test-axis__icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none">${ax.icon}</svg></span>` : ''}${ax.label}</div>
            <div class="test-axis__track" style="background:${ax.b.color}">
              <div class="test-axis__fill" data-target-w="${a.pctA}" style="width:0%; background:${ax.a.color}"></div>
            </div>
            <div class="test-axis__legend">
              <span class="test-axis__side${a.bWins ? '' : ' is-dom'}">${ax.a.label} (${ax.a.letter}) · ${faDigits(a.pctA)}٪</span>
              <span class="test-axis__side${a.bWins ? ' is-dom' : ''}">${ax.b.label} (${ax.b.letter}) · ${faDigits(a.pctB)}٪</span>
            </div>
          </div>`;
      }).join('');

      // The clearest axis is the one furthest from 50/50 — naming it makes the
      // four-letter code concrete instead of leaving it as a label.
      const strongest = res.parts.reduce((best, part, i) =>
        Math.abs(part.pctB - 50) > Math.abs(best.part.pctB - 50) ? { part, ax: test.axes[i] } : best,
        { part: res.parts[0], ax: test.axes[0] });
      const strongPct = Math.max(strongest.part.pctA, strongest.part.pctB);
      // an axis inside 60/40 is genuinely mixed and should be reported as such
      const balanced = res.parts.map((part, i) => ({ part, ax: test.axes[i] }))
        .filter(o => Math.abs(o.part.pctB - 50) <= 10);
      const strongestIsBalanced = Math.abs(strongest.part.pctB - 50) <= 10;

      const lastDelay = 0.38 + test.axes.length * 0.06;
      return `
        <div class="test-results test-report">
        ${reportHeadHtml(test, '.02')}
        <div class="test-type-hero test-reveal" style="--type-color:${group.color}; animation-delay:.08s;">
          <span class="test-type-hero__code">${res.code}</span>
          <span class="test-type-hero__name">${p.name}</span>
          <span class="test-type-hero__group">${group.label} · هویت ${identity.label} (${identity.letter})</span>
        </div>
        <p class="test-type-desc test-reveal" style="animation-delay:.18s;">${p.desc}</p>
        <div class="test-type-lists">
          <div class="test-type-list test-reveal" style="animation-delay:.24s;">
            <h4>نقاط قوت شما</h4>
            <ul>${p.strengths.map(s => `<li>${s}</li>`).join('')}</ul>
          </div>
          <div class="test-type-list test-type-list--growth test-reveal" style="animation-delay:.30s;">
            <h4>زمینه‌های رشد</h4>
            <ul>${p.growth.map(s => `<li>${s}</li>`).join('')}</ul>
          </div>
        </div>
        <div class="test-report__section-label test-reveal" style="animation-delay:.34s;">پروفایل پنج محور</div>
        <div class="test-axes">${axesHtml}</div>
        <div class="test-report__impression test-reveal" style="animation-delay:${(lastDelay + 0.04).toFixed(2)}s;">
          <span class="test-report__tag">جمع‌بندی</span>
          <h4>${p.name} (${res.code})</h4>
          <p class="test-report__drivers">${
            // when even the strongest axis sits inside the balanced band there is
            // no "clearest" axis to name — saying so is more honest than crowning
            // a 50/50 result
            strongestIsBalanced
              ? 'هیچ‌کدام از پنج محور شما به‌روشنی به یک سمت متمایل نیست؛ پروفایل شما در مجموع متعادل است. این یعنی سبک ثابتی ندارید و بسته به موقعیت رفتارتان تغییر می‌کند — که خودش یک ویژگی است، نه بی‌تصمیمی.'
              : `روشن‌ترین محور شما: <b>${strongest.ax.label}</b> — ${strongest.part.side.label} با ${faDigits(strongPct)}٪.`
          }${
            (!strongestIsBalanced && balanced.length)
              ? ` ${balanced.length > 1 ? 'محورهای' : 'محور'} ${faList(balanced.map(o => `<b>${o.ax.label}</b>`))} نزدیک به تعادل ${balanced.length > 1 ? 'هستند' : 'است'}؛ در ${balanced.length > 1 ? 'این محورها' : 'این محور'} بسته به موقعیت هر دو سبک را به کار می‌گیرید.`
              : ''}</p>
          <p>${group.note} ${test.identityNote[identity.letter]}</p>
          <div class="test-report__steps">
            <span class="test-report__steps-title">چطور از این نتیجه استفاده کنید</span>
            <ul>
              <li>تیپ شخصیتی، سبک طبیعی شماست نه سقف توانایی‌تان؛ هیچ تیپی برای هیچ شغل یا رابطه‌ای «مناسب‌تر» نیست.</li>
              <li>روی «زمینه‌های رشد» بالا تمرکز کنید — همان‌ها معمولاً همان چیزهایی هستند که در روابط برایتان تکرار می‌شوند.</li>
              <li>محورهای نزدیک به تعادل را دست‌کم نگیرید؛ انعطاف در آن‌ها یک مزیت است، نه بلاتکلیفی.</li>
              <li>اگر نتیجه با تصور خودتان نمی‌خواند، چند هفته بعد دوباره آزمون بدهید — حال‌وهوای روز روی پاسخ‌ها اثر می‌گذارد.</li>
            </ul>
          </div>
        </div>
        <p class="test-disclaimer test-reveal" style="animation-delay:${(lastDelay + 0.12).toFixed(2)}s;">${test.disclaimer}</p>
        ${actionsHtml(lastDelay + 0.2)}
        </div>`;
    }

    function resultsHtmlProfile(test){
      const res = computeProfile(test);
      const p = res.top.sc;
      const runnerUp = res.second.sc;
      const center = test.centers ? test.centers[p.center] : null;

      // every scale is shown, ranked, so the reader can see how close the call was
      // instead of being handed a winner with no context
      const barsHtml = res.ranked.map((row, idx) => `
          <div class="test-scale test-reveal${idx === 0 ? ' is-top' : ''}" style="animation-delay:${(0.36 + idx * 0.05).toFixed(2)}s;">
            <div class="test-scale__head">
              <span class="test-scale__name"><span class="test-scale__key" style="background:${row.sc.color}">${row.sc.key}</span>${row.sc.label}</span>
              <span class="test-scale__pct">${faDigits(row.pct)}٪</span>
            </div>
            <div class="test-scale__track">
              <div class="test-scale__fill" data-target-w="${row.pct}" style="width:0%; background:${row.sc.color}"></div>
            </div>
          </div>`).join('');

      const heroSub = test.wings
        ? `بال شما: ${res.wing.sc.tag} (${res.wing.sc.label})${center ? ` · ${center.label} — هسته ${center.core}` : ''}`
        : `سبک دوم شما: ${runnerUp.key} — ${runnerUp.label}`;

      const lastDelay = 0.36 + res.ranked.length * 0.05;
      return `
        <div class="test-results test-report">
        ${reportHeadHtml(test, '.02')}
        <div class="test-type-hero test-reveal" style="--type-color:${p.color}; animation-delay:.08s;">
          <span class="test-type-hero__code">${p.key}</span>
          <span class="test-type-hero__name">${p.label}</span>
          <span class="test-type-hero__group">${heroSub}</span>
        </div>
        <p class="test-type-desc test-reveal" style="animation-delay:.18s;">${p.desc}</p>
        <div class="test-type-lists">
          <div class="test-type-list test-reveal" style="animation-delay:.24s;">
            <h4>نقاط قوت شما</h4>
            <ul>${p.strengths.map(s => `<li>${s}</li>`).join('')}</ul>
          </div>
          <div class="test-type-list test-type-list--growth test-reveal" style="animation-delay:.30s;">
            <h4>زمینه‌های رشد</h4>
            <ul>${p.growth.map(s => `<li>${s}</li>`).join('')}</ul>
          </div>
        </div>
        ${p.withYou ? `<div class="test-scale-note test-reveal" style="animation-delay:.33s;"><strong>برای کار کردن با شما</strong><p>${p.withYou}</p></div>` : ''}
        <div class="test-report__section-label test-reveal" style="animation-delay:.34s;">${test.wings ? 'نمره شما در هر نُه تیپ' : 'نمره شما در هر چهار سبک'}</div>
        <div class="test-scales">${barsHtml}</div>
        <div class="test-report__impression test-reveal" style="animation-delay:${(lastDelay + 0.04).toFixed(2)}s;">
          <span class="test-report__tag">جمع‌بندی</span>
          <h4>${p.tag} — ${p.label}</h4>
          <p class="test-report__drivers">${
            res.tied
              ? `${p.label} و ${runnerUp.label} با فاصله بسیار کمی (${faDigits(res.top.pct)}٪ در برابر ${faDigits(res.second.pct)}٪) در صدر قرار گرفته‌اند. در این حالت، توصیف هر دو را بخوانید و ببینید کدام‌یک بهتر توضیح می‌دهد چرا کارهایتان را می‌کنید — همان، تیپ شماست.`
              : `${p.label} با ${faDigits(res.top.pct)}٪ روشن‌ترین الگوی شماست و ${runnerUp.label} با ${faDigits(res.second.pct)}٪ در جایگاه دوم قرار دارد.`
          }</p>
          <p>${test.wings && center ? center.note + ' ' : ''}${p.advice}</p>
          <div class="test-report__steps">
            <span class="test-report__steps-title">چطور از این نتیجه استفاده کنید</span>
            <ul>${test.steps.map(s => `<li>${s}</li>`).join('')}</ul>
          </div>
        </div>
        <p class="test-disclaimer test-reveal" style="animation-delay:${(lastDelay + 0.12).toFixed(2)}s;">${test.disclaimer}</p>
        ${actionsHtml(lastDelay + 0.2)}
        </div>`;
    }

    function animateResults(){
      const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const counters = content.querySelectorAll('[data-target]');
      const markers = content.querySelectorAll('[data-target-pct]');
      const fills = content.querySelectorAll('[data-target-w]');
      if (reduceMotion){
        counters.forEach(el => { el.textContent = el.getAttribute('data-target'); });
        markers.forEach(el => { el.style.left = el.getAttribute('data-target-pct') + '%'; });
        fills.forEach(el => { el.style.width = el.getAttribute('data-target-w') + '%'; });
        return;
      }
      requestAnimationFrame(() => requestAnimationFrame(() => {
        markers.forEach(el => { el.style.left = el.getAttribute('data-target-pct') + '%'; });
        fills.forEach(el => { el.style.width = el.getAttribute('data-target-w') + '%'; });
      }));
      counters.forEach(el => {
        const target = Number(el.getAttribute('data-target'));
        const duration = 900;
        const startTs = performance.now();
        function step(ts){
          const p = Math.min(1, (ts - startTs) / duration);
          const eased = 1 - Math.pow(1 - p, 3);
          el.textContent = Math.round(eased * target);
          if (p < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      });
    }

    function render(){
      if (!currentTest) return;
      if (qIndex === -1) content.innerHTML = introHtml(currentTest);
      else if (qIndex < currentTest.questions.length) content.innerHTML = questionHtml(currentTest, qIndex);
      else { content.innerHTML = resultsHtml(currentTest); animateResults(); }
      wire();
    }

    function wire(){
      const startBtn = document.getElementById('testStartBtn');
      if (startBtn) startBtn.addEventListener('click', () => { qIndex = 0; render(); });

      content.querySelectorAll('.test-option').forEach(btn => {
        btn.addEventListener('click', () => {
          answers[qIndex] = Number(btn.getAttribute('data-value'));
          btn.classList.add('is-picked');
          setTimeout(() => { qIndex++; render(); }, 220);
        });
      });

      const backBtn = document.getElementById('testBackBtn');
      if (backBtn) backBtn.addEventListener('click', () => { if (qIndex > 0){ qIndex--; render(); } });

      const sendWa = document.getElementById('testSendWa');
      if (sendWa) sendWa.addEventListener('click', () => {
        const lines = [
          'نتیجه یک تست خودارزیابی روان‌شناسی:',
          'تست: ' + currentTest.name + ' (' + currentTest.subtitle + ')'
        ];
        if (currentTest.axes){
          const res = computeType(currentTest);
          lines.push('تیپ شخصیتی: ' + res.code + ' — ' + res.profile.name);
          currentTest.axes.forEach((ax, i) => {
            const a = res.parts[i];
            lines.push(ax.label + ': ' + a.side.label + ' (' + a.side.letter + ') ' + (a.bWins ? a.pctB : a.pctA) + '٪');
          });
        } else if (currentTest.scales){
          const res = computeProfile(currentTest);
          // Enneagram names the type ("تیپ ۳"), DISC names the letter ("D") — the
          // same shorthand each model's own result line uses further down
          lines.push((currentTest.wings ? 'تیپ اصلی: ' : 'سبک غالب: ')
            + (currentTest.wings ? res.top.sc.tag : res.top.sc.key) + ' — ' + res.top.sc.label + ' (' + res.top.pct + '٪)');
          if (currentTest.wings) lines.push('بال: ' + res.wing.sc.tag + ' — ' + res.wing.sc.label);
          else lines.push('سبک دوم: ' + res.second.sc.key + ' — ' + res.second.sc.label + ' (' + res.second.pct + '٪)');
          if (res.tied) lines.push('توجه: دو مورد نخست فاصله بسیار کمی دارند.');
          res.ranked.forEach(row => { lines.push(row.sc.key + ' ' + row.sc.label + ': ' + row.pct + '٪'); });
        } else if (currentTest.dimensions){
          currentTest.dimensions.forEach(dim => {
            const dTotal = computeDimTotal(currentTest, dim);
            const dBand = findBandIn(dim.bands, dTotal);
            lines.push(dim.label + ': ' + dTotal + ' از ' + dim.max + ' (' + dBand.label + ')');
          });
        } else {
          const total = computeTotal(currentTest);
          const band = findBand(currentTest, total);
          lines.push('امتیاز: ' + total + ' از ' + currentTest.max);
          lines.push('دسته‌بندی: ' + band.label);
        }
        const crisisTriggered = currentTest.crisisIndex != null && answers[currentTest.crisisIndex] > 0;
        if (crisisTriggered) lines.push('⚠️ در یکی از پاسخ‌ها به افکار آسیب به خود اشاره شده — لطفاً در اولویت با من تماس بگیرید.');
        lines.push('لطفاً برای هماهنگی وقت مشاوره با من در تماس باشید.');
        const url = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(lines.join('\n'));
        window.open(url, '_blank', 'noopener,noreferrer');
      });

      const retake = document.getElementById('testRetake');
      if (retake) retake.addEventListener('click', () => { openTest(currentTest.id); });

      const backToList = document.getElementById('testBackToList');
      if (backToList) backToList.addEventListener('click', closeTest);
    }

    function openTest(testId){
      currentTest = TESTS.find(t => t.id === testId);
      if (!currentTest) return;
      qIndex = -1;
      answers = new Array(currentTest.questions.length).fill(null);
      render();
      overlay.classList.add('is-open');
      overlay.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }
    function closeTest(){
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }

    if (closeBtn) closeBtn.addEventListener('click', closeTest);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeTest(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay.classList.contains('is-open')) closeTest(); });

    renderGrid();
  })();

  // ---------- Hidden chess easter egg ----------
  // Full legal-move chess engine (check/checkmate/stalemate, castling, en
  // passant, auto-queen promotion) + a simple minimax AI for single-player.
  // Board convention: row 0 = rank 8 (black home row), row 7 = rank 1 (white
  // home row); col 0 = file a. Pieces are {t:'p'|'n'|'b'|'r'|'q'|'k', c:'w'|'b'}.
  (function chessGame(){
    // Only the shell is in markup — the panel is built in buildShell() below, so
    // the seven pages that carry this modal cannot drift apart.
    const trigger = document.getElementById('chessTrigger');
    const overlay = document.getElementById('chessModal');
    if (!trigger || !overlay || !overlay.querySelector('.modal-box')) return;

    // Both colors use the SAME (solid/"black-set") glyph shapes — the hollow
    // "white-set" Unicode chess codepoints (U+2654-2659) render inconsistently
    // across fonts (often collapsing into near-identical blobs), while the
    // solid set renders its distinct silhouettes reliably everywhere. Color is
    // applied purely via CSS fill, matching how most web chess boards do it.
    const SOLID_GLYPHS = { p:'♟', n:'♞', b:'♝', r:'♜', q:'♛', k:'♚' };
    const PIECE_VALUES = { p:100, n:320, b:330, r:500, q:900, k:20000 };

    let board, state, selected, legalTargets, gameOver, captured, lastMove;

    function inBounds(r, c){ return r >= 0 && r < 8 && c >= 0 && c < 8; }
    function cloneBoard(b){ return b.map(row => row.map(cell => cell ? { ...cell } : null)); }
    function cloneState(s){ return JSON.parse(JSON.stringify(s)); }
    function opponent(c){ return c === 'w' ? 'b' : 'w'; }

    function pseudoMoves(b, r, c, st){
      const piece = b[r][c];
      if (!piece) return [];
      const moves = [];
      if (piece.t === 'p'){
        const dir = piece.c === 'w' ? -1 : 1;
        const startRow = piece.c === 'w' ? 6 : 1;
        const oneR = r + dir;
        if (inBounds(oneR, c) && !b[oneR][c]){
          moves.push({ from:[r,c], to:[oneR,c] });
          const twoR = r + 2*dir;
          if (r === startRow && !b[twoR][c]) moves.push({ from:[r,c], to:[twoR,c], double:true });
        }
        for (const dc of [-1, 1]){
          const nr = r + dir, nc = c + dc;
          if (!inBounds(nr, nc)) continue;
          const target = b[nr][nc];
          if (target && target.c !== piece.c) moves.push({ from:[r,c], to:[nr,nc] });
          else if (!target && st.enPassant && st.enPassant[0] === nr && st.enPassant[1] === nc){
            moves.push({ from:[r,c], to:[nr,nc], enPassant:true });
          }
        }
      } else if (piece.t === 'n'){
        [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr,dc]) => {
          const nr = r+dr, nc = c+dc;
          if (!inBounds(nr,nc)) return;
          const target = b[nr][nc];
          if (!target || target.c !== piece.c) moves.push({ from:[r,c], to:[nr,nc] });
        });
      } else if (piece.t === 'k'){
        for (let dr=-1; dr<=1; dr++) for (let dc=-1; dc<=1; dc++){
          if (dr === 0 && dc === 0) continue;
          const nr = r+dr, nc = c+dc;
          if (!inBounds(nr,nc)) continue;
          const target = b[nr][nc];
          if (!target || target.c !== piece.c) moves.push({ from:[r,c], to:[nr,nc] });
        }
      } else {
        const dirs = piece.t === 'b' ? [[-1,-1],[-1,1],[1,-1],[1,1]]
                   : piece.t === 'r' ? [[-1,0],[1,0],[0,-1],[0,1]]
                   : [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]];
        dirs.forEach(([dr,dc]) => {
          let nr = r+dr, nc = c+dc;
          while (inBounds(nr,nc)){
            const target = b[nr][nc];
            if (!target){ moves.push({ from:[r,c], to:[nr,nc] }); }
            else { if (target.c !== piece.c) moves.push({ from:[r,c], to:[nr,nc] }); break; }
            nr += dr; nc += dc;
          }
        });
      }
      return moves;
    }

    function isSquareAttacked(b, r, c, byColor){
      for (const dc of [-1, 1]){
        const pr = byColor === 'w' ? r+1 : r-1, pc = c+dc;
        if (inBounds(pr,pc)){ const p=b[pr][pc]; if (p && p.c===byColor && p.t==='p') return true; }
      }
      for (const [dr,dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]){
        const nr=r+dr, nc=c+dc;
        if (inBounds(nr,nc)){ const p=b[nr][nc]; if (p && p.c===byColor && p.t==='n') return true; }
      }
      for (let dr=-1; dr<=1; dr++) for (let dc=-1; dc<=1; dc++){
        if (dr===0 && dc===0) continue;
        const nr=r+dr, nc=c+dc;
        if (inBounds(nr,nc)){ const p=b[nr][nc]; if (p && p.c===byColor && p.t==='k') return true; }
      }
      for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]){
        let nr=r+dr, nc=c+dc;
        while (inBounds(nr,nc)){
          const p=b[nr][nc];
          if (p){ if (p.c===byColor && (p.t==='r'||p.t==='q')) return true; break; }
          nr+=dr; nc+=dc;
        }
      }
      for (const [dr,dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]){
        let nr=r+dr, nc=c+dc;
        while (inBounds(nr,nc)){
          const p=b[nr][nc];
          if (p){ if (p.c===byColor && (p.t==='b'||p.t==='q')) return true; break; }
          nr+=dr; nc+=dc;
        }
      }
      return false;
    }

    function findKing(b, color){
      for (let r=0;r<8;r++) for (let c=0;c<8;c++){ const p=b[r][c]; if (p && p.t==='k' && p.c===color) return [r,c]; }
      return null;
    }
    function isInCheck(b, color){
      const kp = findKing(b, color);
      return kp ? isSquareAttacked(b, kp[0], kp[1], opponent(color)) : false;
    }

    // promoType is what a promoting pawn becomes; the search always passes
    // nothing and gets a queen, which is the right answer nearly every time.
    function applyMove(b, move, promoType){
      const nb = cloneBoard(b);
      const [fr,fc] = move.from, [tr,tc] = move.to;
      const piece = nb[fr][fc];
      let capturedPiece = nb[tr][tc] || null;
      if (move.enPassant){
        const capR = piece.c === 'w' ? tr+1 : tr-1;
        capturedPiece = nb[capR][tc];
        nb[capR][tc] = null;
      }
      nb[tr][tc] = piece;
      nb[fr][fc] = null;
      if (piece.t === 'p' && (tr === 0 || tr === 7)) nb[tr][tc] = { t:promoType || 'q', c:piece.c };
      if (move.castle === 'K'){ nb[fr][5] = nb[fr][7]; nb[fr][7] = null; }
      else if (move.castle === 'Q'){ nb[fr][3] = nb[fr][0]; nb[fr][0] = null; }
      return { board: nb, captured: capturedPiece };
    }

    function legalMovesForSquare(b, r, c, st){
      const piece = b[r][c];
      if (!piece) return [];
      let moves = pseudoMoves(b, r, c, st);
      if (piece.t === 'k'){
        const rank = piece.c === 'w' ? 7 : 0;
        if (r === rank && c === 4){
          const canK = piece.c === 'w' ? st.castling.wK : st.castling.bK;
          const canQ = piece.c === 'w' ? st.castling.wQ : st.castling.bQ;
          const enemy = opponent(piece.c);
          if (canK && !b[rank][5] && !b[rank][6] && b[rank][7] && b[rank][7].t==='r' && b[rank][7].c===piece.c &&
              !isSquareAttacked(b,rank,4,enemy) && !isSquareAttacked(b,rank,5,enemy) && !isSquareAttacked(b,rank,6,enemy)){
            moves.push({ from:[r,c], to:[rank,6], castle:'K' });
          }
          if (canQ && !b[rank][1] && !b[rank][2] && !b[rank][3] && b[rank][0] && b[rank][0].t==='r' && b[rank][0].c===piece.c &&
              !isSquareAttacked(b,rank,4,enemy) && !isSquareAttacked(b,rank,3,enemy) && !isSquareAttacked(b,rank,2,enemy)){
            moves.push({ from:[r,c], to:[rank,2], castle:'Q' });
          }
        }
      }
      return moves.filter(m => !isInCheck(applyMove(b, m).board, piece.c));
    }

    function allLegalMoves(b, color, st){
      const all = [];
      for (let r=0;r<8;r++) for (let c=0;c<8;c++){
        const p = b[r][c];
        if (p && p.c === color) all.push(...legalMovesForSquare(b, r, c, st));
      }
      return all;
    }

    function updateStateAfterMove(st, b, move, piece){
      const ns = cloneState(st);
      if (piece.t === 'k'){
        if (piece.c === 'w'){ ns.castling.wK=false; ns.castling.wQ=false; }
        else { ns.castling.bK=false; ns.castling.bQ=false; }
      }
      if (piece.t === 'r'){
        const [fr,fc] = move.from;
        if (piece.c==='w'){ if (fr===7&&fc===0) ns.castling.wQ=false; if (fr===7&&fc===7) ns.castling.wK=false; }
        else { if (fr===0&&fc===0) ns.castling.bQ=false; if (fr===0&&fc===7) ns.castling.bK=false; }
      }
      const [tr,tc] = move.to;
      if (tr===7&&tc===0) ns.castling.wQ=false;
      if (tr===7&&tc===7) ns.castling.wK=false;
      if (tr===0&&tc===0) ns.castling.bQ=false;
      if (tr===0&&tc===7) ns.castling.bK=false;
      if (move.double){ const [fr,fc]=move.from; ns.enPassant=[(fr+tr)/2, fc]; } else { ns.enPassant=null; }
      ns.turn = opponent(st.turn);
      return ns;
    }

    function evaluate(b){
      let score = 0;
      for (let r=0;r<8;r++) for (let c=0;c<8;c++){
        const p = b[r][c];
        if (!p) continue;
        let val = PIECE_VALUES[p.t];
        if (p.t==='n' || p.t==='p' || p.t==='b') val += (7 - (Math.abs(3.5-r)+Math.abs(3.5-c))) * 2;
        score += p.c==='w' ? val : -val;
      }
      return score;
    }

    function minimax(b, st, depth, alpha, beta){
      const color = st.turn;
      const moves = allLegalMoves(b, color, st);
      if (moves.length === 0) return isInCheck(b, color) ? (color==='w' ? -99000-depth : 99000+depth) : 0;
      if (depth === 0) return evaluate(b);
      const maximizing = color === 'w';
      let best = maximizing ? -Infinity : Infinity;
      for (const m of moves){
        const piece = b[m.from[0]][m.from[1]];
        const { board: nb } = applyMove(b, m);
        const ns = updateStateAfterMove(st, b, m, piece);
        const val = minimax(nb, ns, depth-1, alpha, beta);
        if (maximizing){ if (val>best) best=val; if (best>alpha) alpha=best; }
        else { if (val<best) best=val; if (best<beta) beta=best; }
        if (beta <= alpha) break;
      }
      return best;
    }

    function findBestMove(b, st, depth){
      const moves = allLegalMoves(b, st.turn, st);
      if (!moves.length) return null;
      const maximizing = st.turn === 'w';
      let bestMove = moves[0], bestVal = maximizing ? -Infinity : Infinity;
      for (const m of moves){
        const piece = b[m.from[0]][m.from[1]];
        const { board: nb } = applyMove(b, m);
        const ns = updateStateAfterMove(st, b, m, piece);
        const val = minimax(nb, ns, depth-1, -Infinity, Infinity);
        if (maximizing ? val>bestVal : val<bestVal){ bestVal=val; bestMove=m; }
      }
      return bestMove;
    }

    function piece(t, c){ return { t, c }; }
    // ---------- everything below the engine is presentation ----------
    // The whole panel is built here rather than in markup: the modal appears on
    // all seven pages, and seven hand-maintained copies of this much DOM would
    // drift apart on the first change.

    const T = {
      fa: {
        title:'شطرنج هم‌نوا', sub:'یک بازی کوتاه، همین‌جا',
        newGame:'بازی جدید', undo:'برگشت', flip:'چرخاندن', sound:'صدا', resign:'تسلیم',
        white:'سفید', black:'سیاه', you:'شما', bot:'ربات', p1:'بازیکن ۱', p2:'بازیکن ۲',
        thinking:'در حال فکر کردن…', turnOf:'نوبت ', check:' — کیش!',
        start:'شروع بازی', mode:'حریف', vsBot:'مقابل ربات', vsHuman:'دو نفره',
        level:'سطح', easy:'آسان', medium:'متوسط', hard:'سخت',
        side:'رنگ شما', playWhite:'سفید', playBlack:'سیاه',
        promoTitle:'ارتقای سرباز', promoText:'سرباز شما به انتهای صفحه رسید. مهره‌ی جانشین را انتخاب کنید.',
        mate:'کیش و مات', stale:'پات', resigned:'تسلیم شد', draw:'مساوی',
        wins:' برنده شد', drawText:'بازی مساوی تمام شد', again:'بازی دوباره', review:'دیدن صفحه',
        noMoves:'هنوز حرکتی انجام نشده — شروع کنید.', movesTitle:'حرکت‌ها',
        confirmResign:'از بازی انصراف می‌دهید؟'
      },
      en: {
        title:'Hamnavaa Chess', sub:'A quick game, right here',
        newGame:'New game', undo:'Undo', flip:'Flip', sound:'Sound', resign:'Resign',
        white:'White', black:'Black', you:'You', bot:'Computer', p1:'Player 1', p2:'Player 2',
        thinking:'Thinking…', turnOf:'Turn: ', check:' — check!',
        start:'Start game', mode:'Opponent', vsBot:'vs Computer', vsHuman:'Two players',
        level:'Level', easy:'Easy', medium:'Medium', hard:'Hard',
        side:'Your colour', playWhite:'White', playBlack:'Black',
        promoTitle:'Promote your pawn', promoText:'Your pawn reached the last rank. Choose what it becomes.',
        mate:'Checkmate', stale:'Stalemate', resigned:'Resigned', draw:'Draw',
        wins:' wins', drawText:'The game ended in a draw', again:'Play again', review:'Review board',
        noMoves:'No moves yet — make the first one.', movesTitle:'Moves',
        confirmResign:'Resign this game?'
      }
    };
    const L = () => T[currentLang()] || T.fa;

    const FILES = 'abcdefgh';
    // Algebraic notation stays in its international form in both languages.
    // Localising it would also mean a move list that reads half Persian and
    // half English the moment someone flips the language mid-game.
    const SAN_LETTER = { k:'K', q:'Q', r:'R', b:'B', n:'N' };
    const DEPTHS = { easy:1, medium:2, hard:3 };

    let opts = { vs:'ai', level:'medium', side:'w' };
    let flipped = false, soundOn = true, history = [], sanList = [], pendingPromo = null;
    let els = {};                       // built once, cached
    let pieceNodes = new Map();         // id -> element, so pieces persist across moves
    let nextPieceId = 1;

    // ----- sound: three short WebAudio blips, no asset files -----
    let audioCtx = null;
    function blip(freq, dur, type){
      if (!soundOn) return;
      try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = type || 'sine'; o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.09, audioCtx.currentTime + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(); o.stop(audioCtx.currentTime + dur + 0.02);
      } catch (err) { /* audio is a nicety; never let it break the game */ }
    }
    const sndMove    = () => blip(430, 0.07, 'triangle');
    const sndCapture = () => blip(240, 0.11, 'square');
    const sndEnd     = () => { blip(520, 0.16, 'sine'); setTimeout(() => blip(700, 0.22, 'sine'), 130); };

    function icon(d){
      return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="' + d +
             '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }
    const ICONS = {
      undo:  'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
      flip:  'M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7',
      sound: 'M11 5L6 9H3v6h3l5 4V5zM16 9a4 4 0 0 1 0 6',
      mute:  'M11 5L6 9H3v6h3l5 4V5zM17 9l4 6M21 9l-4 6',
      flag:  'M5 21V4M5 4h11l-2 4 2 4H5',
      plus:  'M12 5v14M5 12h14'
    };

    // ----- one-time DOM build -----
    function buildShell(){
      const box = overlay.querySelector('.modal-box');
      box.innerHTML =
        '<button type="button" class="modal-close" id="chessModalClose" aria-label="Close / بستن">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
        '</button>' +
        '<div class="chess-top">' +
          '<div><h3 id="chessTitle"></h3><div class="chess-top__sub" id="chessSub"></div></div>' +
          '<div class="chess-tools" id="chessTools"></div>' +
        '</div>' +
        '<div class="chess-layout">' +
          '<div class="chess-main">' +
            '<div class="chess-seat chess-seat--b" id="chessSeatTop">' +
              '<span class="chess-seat__badge">♚</span>' +
              '<span class="chess-seat__body"><span class="chess-seat__name"></span><span class="chess-seat__tray"></span></span>' +
            '</div>' +
            '<div class="chess-board-wrap" dir="ltr">' +
              '<div class="chess-board" id="chessBoard">' +
                '<div class="chess-layer chess-layer--sq" id="chessSquares"></div>' +
                '<div class="chess-layer chess-layer--hints" id="chessHints"></div>' +
                '<div class="chess-layer chess-layer--pieces" id="chessPieces"></div>' +
              '</div>' +
            '</div>' +
            '<div class="chess-seat chess-seat--w" id="chessSeatBottom">' +
              '<span class="chess-seat__badge">♚</span>' +
              '<span class="chess-seat__body"><span class="chess-seat__name"></span><span class="chess-seat__tray"></span></span>' +
            '</div>' +
          '</div>' +
          '<div class="chess-rail">' +
            '<p class="chess-status" id="chessStatusBox" role="status" aria-live="polite">' +
              '<span class="chess-status__dot" id="chessStatusDot" aria-hidden="true"></span>' +
              '<span id="chessStatus"></span></p>' +
            '<div class="chess-moves" id="chessMoves"></div>' +
          '</div>' +
        '</div>';

      els = {
        box: box,
        title: box.querySelector('#chessTitle'), sub: box.querySelector('#chessSub'),
        tools: box.querySelector('#chessTools'),
        squares: box.querySelector('#chessSquares'), hints: box.querySelector('#chessHints'),
        pieces: box.querySelector('#chessPieces'), board: box.querySelector('#chessBoard'),
        wrap: box.querySelector('.chess-board-wrap'),
        seatTop: box.querySelector('#chessSeatTop'), seatBottom: box.querySelector('#chessSeatBottom'),
        status: box.querySelector('#chessStatus'), statusDot: box.querySelector('#chessStatusDot'),
        moves: box.querySelector('#chessMoves'), close: box.querySelector('#chessModalClose')
      };

      // squares are laid out once and never rebuilt; only their classes change
      for (let i = 0; i < 64; i++){
        const sq = document.createElement('div');
        sq.className = 'chess-sq';
        els.squares.appendChild(sq);
      }

      els.board.setAttribute('tabindex', '0');
      els.board.setAttribute('role', 'application');
      els.close.addEventListener('click', closeChess);
      els.board.addEventListener('click', onBoardClick);
      els.board.addEventListener('keydown', onBoardKey);
      paintChrome();
    }

    function paintChrome(){
      const l = L();
      els.title.textContent = l.title;
      els.sub.textContent = l.sub;
      els.tools.innerHTML =
        '<button type="button" class="chess-tool" data-act="undo" ' + (history.length ? '' : 'disabled') + '>' +
          icon(ICONS.undo) + '<span>' + l.undo + '</span></button>' +
        '<button type="button" class="chess-tool" data-act="flip">' + icon(ICONS.flip) + '<span>' + l.flip + '</span></button>' +
        '<button type="button" class="chess-tool' + (soundOn ? '' : ' is-off') + '" data-act="sound" aria-pressed="' + soundOn + '">' +
          icon(soundOn ? ICONS.sound : ICONS.mute) + '<span>' + l.sound + '</span></button>' +
        '<button type="button" class="chess-tool is-danger" data-act="resign">' + icon(ICONS.flag) + '<span>' + l.resign + '</span></button>' +
        '<button type="button" class="chess-tool is-primary" data-act="new">' + icon(ICONS.plus) + '<span>' + l.newGame + '</span></button>';
    }

    // ----- geometry -----
    // Row/col are always board coordinates; the view flips by mapping them.
    function viewRC(r, c){ return flipped ? [7 - r, 7 - c] : [r, c]; }
    function place(el, r, c){
      const [vr, vc] = viewRC(r, c);
      el.style.transform = 'translate(' + (vc * 100) + '%,' + (vr * 100) + '%)';
    }

    function sizeBoard(){
      const boxW = els.box.clientWidth || 600;
      const wide = window.innerWidth > 760;
      // the rail needs ~250px beside the board on a wide window; on a narrow one
      // the board simply takes the column width
      const availW = wide ? Math.min(boxW - 40 - 258, 520) : boxW - 46;
      // and it must also fit the height, leaving room for the seats and header
      const availH = window.innerHeight * 0.94 - (wide ? 250 : 420);
      const size = Math.max(232, Math.min(availW, Math.max(availH, 232), 520));
      const px = Math.floor(size / 8) * 8;      // whole pixels per square
      els.board.style.setProperty('--bs', px + 'px');
      els.board.style.setProperty('--sq', (px / 8) + 'px');
    }

    // ----- rendering -----
    function renderSquares(){
      const lastFrom = lastMove && lastMove.from, lastTo = lastMove && lastMove.to;
      // shown on checkmate too — that is exactly the moment it matters most
      const kp = isInCheck(board, state.turn) ? findKing(board, state.turn) : null;
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++){
        const [vr, vc] = viewRC(r, c);
        const sq = els.squares.children[vr * 8 + vc];
        let cls = 'chess-sq ' + (((r + c) % 2 === 0) ? 'is-light' : 'is-dark');
        if (selected && selected[0] === r && selected[1] === c) cls += ' is-sel';
        if (lastFrom && ((lastFrom[0] === r && lastFrom[1] === c) || (lastTo[0] === r && lastTo[1] === c))) cls += ' is-last';
        if (kp && kp[0] === r && kp[1] === c) cls += ' is-check';
        sq.className = cls;
        sq.style.transform = 'translate(' + (vc * 100) + '%,' + (vr * 100) + '%)';
        sq.dataset.r = r; sq.dataset.c = c;
        // coordinates only along the two visible edges, like a real board
        let co = '';
        if (vc === 0) co += '<span class="chess-sq__co chess-sq__co--r">' + (8 - r) + '</span>';
        if (vr === 7) co += '<span class="chess-sq__co chess-sq__co--f">' + FILES[c] + '</span>';
        sq.innerHTML = co;
      }
    }

    function renderHints(){
      els.hints.innerHTML = '';
      legalTargets.forEach(m => {
        const [r, c] = m.to;
        const isTake = !!board[r][c] || m.enPassant;
        const h = document.createElement('div');
        h.className = 'chess-hint ' + (isTake ? 'chess-hint--take' : 'chess-hint--quiet');
        h.innerHTML = '<i></i>';
        place(h, r, c);
        els.hints.appendChild(h);
      });
    }

    // Pieces persist between renders and are moved by transform, which is what
    // makes a move slide. Each board cell carries the id of the node sitting on
    // it so a re-render can reuse the same element.
    let idBoard = null;
    function seedIds(){
      idBoard = board.map(row => row.map(() => 0));
      pieceNodes.forEach(n => n.remove());
      pieceNodes.clear();
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++){
        if (board[r][c]) idBoard[r][c] = spawn(board[r][c], r, c);
      }
    }
    function spawn(p, r, c, entering){
      const id = nextPieceId++;
      const el = document.createElement('div');
      el.className = 'chess-pc chess-pc--' + p.c;
      el.dataset.id = id;
      el.innerHTML = '<span class="chess-pc__in' + (entering ? ' is-promoted' : '') + '"><span class="chess-pc__g">' +
                     SOLID_GLYPHS[p.t] + '</span></span>';
      place(el, r, c);
      els.pieces.appendChild(el);
      pieceNodes.set(id, el);
      return id;
    }
    function refreshPieces(){
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++){
        const id = idBoard[r][c];
        if (!id) continue;
        const el = pieceNodes.get(id);
        if (!el) continue;
        place(el, r, c);
        const p = board[r][c];
        el.className = 'chess-pc chess-pc--' + p.c + (canTouch(p) ? ' is-mine' : '');
        el.querySelector('.chess-pc__g').textContent = SOLID_GLYPHS[p.t];
      }
    }
    function canTouch(p){
      if (gameOver || !p || p.c !== state.turn) return false;
      return opts.vs === 'two' || state.turn === opts.side;
    }

    function render(){
      renderSquares();
      renderHints();
      refreshPieces();
      renderCursor();
    }

    // ----- seats, status, move list -----
    const TRAY_ORDER = ['q','r','b','n','p'];
    function material(){
      let w = 0, b = 0;
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++){
        const p = board[r][c];
        if (!p || p.t === 'k') continue;
        if (p.c === 'w') w += PIECE_VALUES[p.t]; else b += PIECE_VALUES[p.t];
      }
      return Math.round((w - b) / 100);
    }
    function paintSeat(el, color){
      const l = L();
      const top = el === els.seatTop;
      el.className = 'chess-seat chess-seat--' + color + (state.turn === color && !gameOver ? ' is-turn' : '');
      const isBot = opts.vs === 'ai' && color !== opts.side;
      const who = opts.vs === 'ai' ? (isBot ? l.bot : l.you) : (color === 'w' ? l.p1 : l.p2);
      const thinking = isBot && state.turn === color && !gameOver;
      el.querySelector('.chess-seat__name').innerHTML =
        (color === 'w' ? l.white : l.black) + ' · ' + who +
        (thinking ? ' <span class="chess-seat__think" aria-hidden="true"></span>' : '');
      // a side's tray shows the enemy pieces it has taken
      const taken = captured[color === 'w' ? 'b' : 'w'];
      const edge = material() * (color === 'w' ? 1 : -1);
      el.querySelector('.chess-seat__tray').innerHTML =
        [...taken].sort((a, b) => TRAY_ORDER.indexOf(a) - TRAY_ORDER.indexOf(b))
          .map(t => SOLID_GLYPHS[t]).join('') +
        (edge > 0 ? '<span class="chess-seat__edge">+' + edge + '</span>' : '');
      el.querySelector('.chess-seat__badge').textContent = color === 'w' ? '♚' : '♚';
    }
    function paintSeats(){
      // the player's own colour always sits at the bottom
      const bottomColor = flipped ? 'b' : 'w';
      paintSeat(els.seatBottom, bottomColor);
      paintSeat(els.seatTop, bottomColor === 'w' ? 'b' : 'w');
    }

    function updateStatus(msg){
      const l = L();
      els.statusDot.classList.toggle('is-black', state.turn === 'b');
      els.status.textContent = msg != null ? msg
        : l.turnOf + (state.turn === 'w' ? l.white : l.black) + (isInCheck(board, state.turn) ? l.check : '');
    }

    function renderMoves(){
      const l = L();
      if (!sanList.length){ els.moves.innerHTML = '<div class="chess-moves__empty">' + l.noMoves + '</div>'; return; }
      let html = '';
      for (let i = 0; i < sanList.length; i += 2){
        const last = i + 1 >= sanList.length;
        html += '<div class="chess-moves__row">' +
          '<span class="chess-moves__n">' + (i / 2 + 1) + '.</span>' +
          '<span class="chess-moves__m' + (last ? ' is-latest' : '') + '">' + sanList[i] + '</span>' +
          '<span class="chess-moves__m' + (i + 1 === sanList.length - 1 ? ' is-latest' : '') + '">' +
            (sanList[i + 1] || '') + '</span>' +
        '</div>';
      }
      els.moves.innerHTML = html;
      els.moves.scrollTop = els.moves.scrollHeight;
    }

    // Standard algebraic notation, worked out before the move is played so the
    // disambiguation check can still see where every piece was.
    function toSan(b, st, move, promoType){
      const [fr, fc] = move.from, [tr, tc] = move.to;
      const p = b[fr][fc];
      const letters = SAN_LETTER;
      if (move.castle) return move.castle === 'K' ? '0-0' : '0-0-0';
      const isTake = !!b[tr][tc] || move.enPassant;
      let san = '';
      if (p.t === 'p'){
        if (isTake) san += FILES[fc] + 'x';
      } else {
        san += letters[p.t];
        // same piece type able to reach the same square from elsewhere?
        const rivals = [];
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++){
          const q = b[r][c];
          if (!q || q.c !== p.c || q.t !== p.t || (r === fr && c === fc)) continue;
          if (legalMovesForSquare(b, r, c, st).some(m => m.to[0] === tr && m.to[1] === tc)) rivals.push([r, c]);
        }
        if (rivals.length){
          san += rivals.every(([, c]) => c !== fc) ? FILES[fc] : String(8 - fr);
        }
        if (isTake) san += 'x';
      }
      san += FILES[tc] + (8 - tr);
      if (promoType) san += '=' + letters[promoType];
      const after = applyMove(b, move, promoType).board;
      const ns = updateStateAfterMove(st, b, move, p);
      if (isInCheck(after, ns.turn)) san += allLegalMoves(after, ns.turn, ns).length ? '+' : '#';
      return san;
    }

    // ----- playing a move -----
    function isPromotion(move){
      const p = board[move.from[0]][move.from[1]];
      return p && p.t === 'p' && (move.to[0] === 0 || move.to[0] === 7);
    }

    function doMove(move, promoType){
      const [fr, fc] = move.from, [tr, tc] = move.to;
      const movingPiece = board[fr][fc];
      const san = toSan(board, state, move, promoType);

      history.push({
        board: cloneBoard(board), state: cloneState(state),
        captured: { w: [...captured.w], b: [...captured.b] },
        lastMove: lastMove, ids: idBoard.map(row => row.slice()), san: san
      });

      const { board: nb, captured: cap } = applyMove(board, move, promoType);

      // move the DOM nodes to match, so the piece slides rather than blinking
      const movingId = idBoard[fr][fc];
      let takenId = 0;
      if (move.enPassant){
        const capR = movingPiece.c === 'w' ? tr + 1 : tr - 1;
        takenId = idBoard[capR][tc]; idBoard[capR][tc] = 0;
      } else if (idBoard[tr][tc]) takenId = idBoard[tr][tc];
      if (takenId){
        const el = pieceNodes.get(takenId);
        if (el){ el.classList.add('is-taken'); setTimeout(() => { el.remove(); pieceNodes.delete(takenId); }, 280); }
      }
      idBoard[tr][tc] = movingId; idBoard[fr][fc] = 0;
      if (move.castle === 'K'){ idBoard[fr][5] = idBoard[fr][7]; idBoard[fr][7] = 0; }
      else if (move.castle === 'Q'){ idBoard[fr][3] = idBoard[fr][0]; idBoard[fr][0] = 0; }
      const mv = pieceNodes.get(movingId);
      if (mv){
        mv.classList.add('is-lifting');
        setTimeout(() => mv.classList.remove('is-lifting'), 300);
        if (promoType) mv.querySelector('.chess-pc__in').classList.add('is-promoted');
      }

      if (cap) captured[cap.c].push(cap.t);
      state = updateStateAfterMove(state, board, move, movingPiece);
      board = nb;
      selected = null; legalTargets = [];
      lastMove = { from: [fr, fc], to: [tr, tc] };
      sanList.push(san);

      (cap ? sndCapture : sndMove)();
      render(); paintSeats(); renderMoves(); paintChrome();

      if (!checkGameEnd()){
        updateStatus();
        if (opts.vs === 'ai' && state.turn !== opts.side){
          updateStatus(L().thinking);
          setTimeout(aiMove, 260);
        }
      }
    }

    function aiMove(){
      if (gameOver) return;
      const mv = findBestMove(board, state, DEPTHS[opts.level] || 2);
      if (!mv) { checkGameEnd(); return; }
      // the engine always queens; that is also the right answer >98% of the time
      doMove(mv, isPromotion(mv) ? 'q' : null);
    }

    function checkGameEnd(){
      const l = L();
      const moves = allLegalMoves(board, state.turn, state);
      if (moves.length) return false;
      gameOver = true;
      const mated = isInCheck(board, state.turn);
      const winner = state.turn === 'w' ? 'b' : 'w';
      render();
      sndEnd();
      showResult(
        mated ? l.mate : l.stale,
        mated ? (winner === 'w' ? l.white : l.black) + l.wins : l.drawText,
        mated ? (winner === 'w' ? '1 - 0' : '0 - 1') : '½ - ½',
        mated ? '🏆' : '🤝'
      );
      updateStatus(mated ? l.mate : l.stale);
      return true;
    }

    // Which square was clicked is worked out from the pointer position rather
    // than from the event target: pieces sit on their own layer above the
    // squares, so hit-testing the target would miss every click on a piece.
    function squareFromPoint(x, y){
      const rect = els.board.getBoundingClientRect();
      const lx = x - rect.left, ly = y - rect.top;
      if (lx < 0 || ly < 0 || lx >= rect.width || ly >= rect.height) return null;
      const vc = Math.min(7, Math.floor(lx / (rect.width / 8)));
      const vr = Math.min(7, Math.floor(ly / (rect.height / 8)));
      return flipped ? [7 - vr, 7 - vc] : [vr, vc];
    }

    function onBoardClick(e){
      if (gameOver || pendingPromo) return;
      if (opts.vs === 'ai' && state.turn !== opts.side) return;
      const at = squareFromPoint(e.clientX, e.clientY);
      if (!at) return;
      const r = at[0], c = at[1];
      if (selected){
        const mv = legalTargets.find(m => m.to[0] === r && m.to[1] === c);
        if (mv){
          if (isPromotion(mv)) askPromotion(mv); else doMove(mv);
          return;
        }
        const p = board[r][c];
        if (p && p.c === state.turn){ selected = [r, c]; legalTargets = legalMovesForSquare(board, r, c, state); render(); return; }
        selected = null; legalTargets = []; render(); return;
      }
      const p = board[r][c];
      if (p && p.c === state.turn){ selected = [r, c]; legalTargets = legalMovesForSquare(board, r, c, state); render(); }
    }

    // Keyboard play: the board is one focusable control with a cursor square,
    // arrows to move it and Enter to pick up / put down. Without this the game
    // would be reachable by pointer only.
    let cursor = null;
    function activateSquare(r, c){
      if (gameOver || pendingPromo) return;
      if (opts.vs === 'ai' && state.turn !== opts.side) return;
      if (selected){
        const mv = legalTargets.find(m => m.to[0] === r && m.to[1] === c);
        if (mv){ if (isPromotion(mv)) askPromotion(mv); else doMove(mv); return; }
      }
      const p = board[r][c];
      if (p && p.c === state.turn){
        selected = (selected && selected[0] === r && selected[1] === c) ? null : [r, c];
        legalTargets = selected ? legalMovesForSquare(board, r, c, state) : [];
      } else { selected = null; legalTargets = []; }
      render();
    }
    function onBoardKey(e){
      const step = { ArrowUp:[-1,0], ArrowDown:[1,0], ArrowLeft:[0,-1], ArrowRight:[0,1] }[e.key];
      if (step){
        e.preventDefault();
        if (!cursor) cursor = flipped ? [0, 0] : [7, 4];
        // arrows follow what the player sees, so they still feel right when flipped
        const d = flipped ? [-step[0], -step[1]] : step;
        cursor = [Math.min(7, Math.max(0, cursor[0] + d[0])), Math.min(7, Math.max(0, cursor[1] + d[1]))];
        renderCursor();
        return;
      }
      if (e.key === 'Enter' || e.key === ' '){
        e.preventDefault();
        if (!cursor) cursor = flipped ? [0, 0] : [7, 4];
        activateSquare(cursor[0], cursor[1]);
        renderCursor();
      }
    }
    function renderCursor(){
      els.squares.querySelectorAll('.is-cursor').forEach(el => el.classList.remove('is-cursor'));
      if (!cursor) return;
      const [vr, vc] = viewRC(cursor[0], cursor[1]);
      els.squares.children[vr * 8 + vc].classList.add('is-cursor');
      els.board.setAttribute('aria-label', 'Board — ' + FILES[cursor[1]] + (8 - cursor[0]));
    }

    // ----- undo -----
    function undo(){
      if (!history.length) return;
      // against the computer, step back past its reply too, so the board returns
      // to a position where it is genuinely the player's move again
      const steps = (opts.vs === 'ai' && history.length > 1 && state.turn === opts.side) ? 2 : 1;
      for (let i = 0; i < steps && history.length; i++){
        const h = history.pop();
        board = h.board; state = h.state; captured = h.captured; lastMove = h.lastMove;
        sanList.pop();
      }
      gameOver = false; selected = null; legalTargets = []; pendingPromo = null;
      closeSheet();
      seedIds(); render(); paintSeats(); renderMoves(); paintChrome(); updateStatus();
    }

    // ----- overlay sheets -----
    function sheet(html){
      closeSheet();
      const s = document.createElement('div');
      s.className = 'chess-sheet';
      s.innerHTML = '<div class="chess-sheet__inner">' + html + '</div>';
      els.box.appendChild(s);
      const first = s.querySelector('button');
      if (first) first.focus({ preventScroll: true });
      return s;
    }
    function closeSheet(){
      const s = els.box.querySelector('.chess-sheet');
      if (s) s.remove();
    }

    function showStart(){
      const l = L();
      const pick = (name, items, cur) => '<div class="chess-pick">' + items.map(([v, label]) =>
        '<button type="button" data-opt="' + name + '" data-val="' + v + '"' +
        (cur === v ? ' class="is-on"' : '') + '>' + label + '</button>').join('') + '</div>';
      const s = sheet(
        '<h4>' + l.title + '</h4><p>' + l.sub + '</p>' +
        '<div class="chess-field"><div class="chess-field__label">' + l.mode + '</div>' +
          pick('vs', [['ai', l.vsBot], ['two', l.vsHuman]], opts.vs) + '</div>' +
        '<div class="chess-field" data-only="ai"><div class="chess-field__label">' + l.level + '</div>' +
          pick('level', [['easy', l.easy], ['medium', l.medium], ['hard', l.hard]], opts.level) + '</div>' +
        '<div class="chess-field" data-only="ai"><div class="chess-field__label">' + l.side + '</div>' +
          pick('side', [['w', l.playWhite], ['b', l.playBlack]], opts.side) + '</div>' +
        '<button type="button" class="chess-sheet__go" data-go>' + l.start + '</button>'
      );
      const syncOnly = () => s.querySelectorAll('[data-only="ai"]').forEach(
        el => { el.style.display = opts.vs === 'ai' ? '' : 'none'; });
      syncOnly();
      s.addEventListener('click', e => {
        const opt = e.target.closest('[data-opt]');
        if (opt){
          opts[opt.dataset.opt] = opt.dataset.val;
          opt.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('is-on', b === opt));
          syncOnly();
          return;
        }
        if (e.target.closest('[data-go]')) startGame();
      });
    }

    function askPromotion(move){
      const l = L();
      pendingPromo = move;
      const color = board[move.from[0]][move.from[1]].c;
      const s = sheet(
        '<h4>' + l.promoTitle + '</h4><p>' + l.promoText + '</p>' +
        '<div class="chess-promo">' + ['q','r','b','n'].map(t =>
          '<button type="button" class="for-' + color + '" data-promo="' + t + '" aria-label="' + t + '">' +
          SOLID_GLYPHS[t] + '</button>').join('') + '</div>'
      );
      s.addEventListener('click', e => {
        const b = e.target.closest('[data-promo]');
        if (!b) return;
        const mv = pendingPromo; pendingPromo = null; closeSheet();
        doMove(mv, b.dataset.promo);
      });
    }

    function showResult(line, sub, tag, mark){
      const l = L();
      const s = sheet(
        '<div class="chess-result__mark">' + mark + '</div>' +
        '<h4>' + line + '</h4><p>' + sub + '</p>' +
        '<div class="chess-result__tag">' + tag + '</div>' +
        '<button type="button" class="chess-sheet__go" data-again>' + l.again + '</button>' +
        '<button type="button" class="chess-sheet__link" data-review>' + l.review + '</button>'
      );
      s.addEventListener('click', e => {
        if (e.target.closest('[data-again]')) showStart();
        else if (e.target.closest('[data-review]')) closeSheet();
      });
    }

    function resign(){
      if (gameOver) return;
      const l = L();
      gameOver = true;
      const loser = opts.vs === 'ai' ? opts.side : state.turn;
      const winner = loser === 'w' ? 'b' : 'w';
      sndEnd();
      showResult(l.resigned, (winner === 'w' ? l.white : l.black) + l.wins,
                 winner === 'w' ? '1 - 0' : '0 - 1', '🏳️');
      updateStatus(l.resigned);
      render(); paintSeats();
    }

    // ----- game lifecycle -----
    function startGame(){
      closeSheet();
      board = [
        [piece('r','b'),piece('n','b'),piece('b','b'),piece('q','b'),piece('k','b'),piece('b','b'),piece('n','b'),piece('r','b')],
        Array.from({length:8}, () => piece('p','b')),
        Array(8).fill(null), Array(8).fill(null), Array(8).fill(null), Array(8).fill(null),
        Array.from({length:8}, () => piece('p','w')),
        [piece('r','w'),piece('n','w'),piece('b','w'),piece('q','w'),piece('k','w'),piece('b','w'),piece('n','w'),piece('r','w')]
      ];
      state = { turn:'w', castling:{ wK:true, wQ:true, bK:true, bQ:true }, enPassant:null };
      selected = null; legalTargets = []; gameOver = false;
      captured = { w:[], b:[] }; lastMove = null; history = []; sanList = []; pendingPromo = null;
      // playing black means looking at the board from black's side
      flipped = opts.vs === 'ai' && opts.side === 'b';
      seedIds();
      sizeBoard(); render(); paintSeats(); renderMoves(); paintChrome(); updateStatus();
      if (opts.vs === 'ai' && opts.side === 'b'){ updateStatus(L().thinking); setTimeout(aiMove, 400); }
    }

    els = els || {};
    function onToolClick(e){
      const btn = e.target.closest('.chess-tool');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'undo') undo();
      else if (act === 'flip'){ flipped = !flipped; render(); paintSeats(); }
      else if (act === 'sound'){ soundOn = !soundOn; paintChrome(); if (soundOn) sndMove(); }
      else if (act === 'resign'){ if (window.confirm(L().confirmResign)) resign(); }
      else if (act === 'new') showStart();
    }

    function openChess(){
      overlay.classList.add('is-open');
      overlay.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      sizeBoard(); render();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { sizeBoard(); render(); });
      setTimeout(() => { sizeBoard(); render(); }, 250);
      if (!sanList.length && !els.box.querySelector('.chess-sheet')) showStart();
    }
    function closeChess(){
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }

    buildShell();
    els.box.addEventListener('click', onToolClick);
    trigger.addEventListener('click', openChess);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeChess(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && overlay.classList.contains('is-open')) closeChess();
    });
    window.addEventListener('resize', () => {
      if (overlay.classList.contains('is-open')){ sizeBoard(); render(); }
    }, { passive: true });
    // the site is bilingual; the board has to follow the toggle like everything else
    document.addEventListener('hamnava:lang', () => {
      paintChrome(); paintSeats(); renderMoves(); if (!gameOver) updateStatus();
    });

    startGame();
  })();
})();
