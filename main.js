/* Interactivity for the personal site:
   theme toggle, scroll progress, reveal-on-scroll, active nav,
   back-to-top, and the rotating 3D point-cloud hero. */
(function () {
  'use strict';
  var root = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var cloud = null;

  /* ---------- Theme toggle ---------- */
  var toggle = document.querySelector('.theme-toggle');
  function syncToggle() {
    var dark = root.getAttribute('data-theme') === 'dark';
    if (toggle) {
      toggle.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
      toggle.setAttribute('aria-pressed', String(dark));
    }
  }
  syncToggle();
  if (toggle) {
    toggle.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
      syncToggle();
      if (cloud) cloud.recolor();
    });
  }

  /* ---------- Scroll progress + back-to-top ---------- */
  var bar = document.querySelector('.scroll-progress');
  var toTop = document.querySelector('.to-top');
  function onScroll() {
    var el = document.documentElement;
    var max = el.scrollHeight - el.clientHeight;
    var top = el.scrollTop || document.body.scrollTop;
    var p = max > 0 ? top / max : 0;
    if (bar) bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
    if (toTop) toTop.classList.toggle('show', top > 480);
  }
  document.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  if (toTop) {
    toTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    });
  }

  /* ---------- Reveal on scroll ---------- */
  var reveals = document.querySelectorAll('.reveal');
  if (reduce || !('IntersectionObserver' in window)) {
    reveals.forEach(function (el) { el.classList.add('visible'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  }

  /* ---------- Active nav link ---------- */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav-links a'));
  if ('IntersectionObserver' in window && navLinks.length) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          var id = '#' + e.target.id;
          navLinks.forEach(function (a) {
            a.classList.toggle('active', a.getAttribute('href') === id);
          });
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
    navLinks.forEach(function (a) {
      var sec = document.querySelector(a.getAttribute('href'));
      if (sec) spy.observe(sec);
    });
  }

  /* ---------- Rotating point-cloud globe (a wireframe halo around the photo) ---------- */
  var canvas = document.querySelector('.hero-cloud');
  if (canvas && canvas.getContext) {
    cloud = createCloud(canvas);
  }

  function createCloud(canvas) {
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var photoEl = canvas.parentElement.querySelector('.photo-frame');
    var w = 0, h = 0;
    var rgb = [47, 111, 237];
    var N = 320;

    // points on a Fibonacci sphere
    var pts = [];
    var golden = Math.PI * (3 - Math.sqrt(5));
    for (var i = 0; i < N; i++) {
      var y = 1 - (i / (N - 1)) * 2;
      var r = Math.sqrt(Math.max(0, 1 - y * y));
      var th = golden * i;
      pts.push({ x: Math.cos(th) * r, y: y, z: Math.sin(th) * r });
    }

    // precompute a few nearest-neighbour edges so it reads as a mesh, not confetti
    var edges = [];
    (function () {
      var seen = {};
      for (var a = 0; a < N; a++) {
        var near = [];
        for (var b = 0; b < N; b++) {
          if (b === a) continue;
          var dx = pts[a].x - pts[b].x, dy = pts[a].y - pts[b].y, dz = pts[a].z - pts[b].z;
          near.push({ b: b, d: dx * dx + dy * dy + dz * dz });
        }
        near.sort(function (m, n) { return m.d - n.d; });
        for (var k = 0; k < 3; k++) {
          var j = near[k].b;
          var lo = Math.min(a, j), hi = Math.max(a, j);
          var key = lo + '_' + hi;
          if (!seen[key]) { seen[key] = 1; edges.push([lo, hi]); }
        }
      }
    })();

    var rot = 0, mx = 0, my = 0, tx = 0, ty = 0, raf = 0;
    var proj = [];
    for (var pi = 0; pi < N; pi++) proj.push({ x: 0, y: 0, z: 0, depth: 0, persp: 1, fade: 0 });
    var order = proj.map(function (_, idx) { return idx; });

    function hexToRgb(c) {
      c = (c || '').trim();
      if (c.charAt(0) === '#') {
        if (c.length === 4) c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
        return [parseInt(c.substr(1, 2), 16), parseInt(c.substr(3, 2), 16), parseInt(c.substr(5, 2), 16)];
      }
      var m = c.match(/\d+/g);
      return m ? [+m[0], +m[1], +m[2]] : [47, 111, 237];
    }
    function recolor() {
      var cs = getComputedStyle(root);
      rgb = hexToRgb(cs.getPropertyValue('--cloud') || cs.getPropertyValue('--accent'));
      if (reduce) draw();
    }

    function resize() {
      var rect = canvas.getBoundingClientRect();
      w = rect.width; h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduce) draw();
    }

    function draw() {
      if (!w || !h) return;
      ctx.clearRect(0, 0, w, h);
      var mobile = w < 720;

      // anchor the globe on the portrait so it tracks the photo at any width
      var cx, cy, R;
      if (photoEl) {
        var cr = canvas.getBoundingClientRect();
        var pr = photoEl.getBoundingClientRect();
        cx = pr.left + pr.width / 2 - cr.left;
        cy = pr.top + pr.height / 2 - cr.top;
        R = pr.width * (mobile ? 0.8 : 0.95);
      } else {
        cx = w * 0.78; cy = h * 0.5; R = Math.min(h * 0.42, 240);
      }
      // fade out toward the bio text on the left (desktop); subtle + even on mobile
      var fadeEnd = cx - R * 0.15;
      var fadeStart = cx - R;

      var ax = rot + tx * 0.5;
      var ay = -ty * 0.4;
      var cosx = Math.cos(ax), sinx = Math.sin(ax);
      var cosy = Math.cos(ay), siny = Math.sin(ay);

      for (var i = 0; i < N; i++) {
        var p = pts[i];
        var x = p.x * cosx + p.z * sinx;
        var z = -p.x * sinx + p.z * cosx;
        var yy = p.y * cosy - z * siny;
        var zz = p.y * siny + z * cosy;
        var persp = 1.8 / (1.8 - zz);
        var sx = cx + x * R * persp;
        var sy = cy + yy * R * persp;
        var fade = mobile ? 0.4 : Math.min(1, Math.max(0, (sx - fadeStart) / (fadeEnd - fadeStart)));
        var pr = proj[i];
        pr.x = sx; pr.y = sy; pr.z = zz;
        pr.depth = (zz + 1) / 2; pr.persp = persp; pr.fade = fade;
      }

      // fine ink linework — edges are the main feature
      ctx.lineWidth = 0.85;
      for (var e = 0; e < edges.length; e++) {
        var pa = proj[edges[e][0]], pb = proj[edges[e][1]];
        var f = Math.min(pa.fade, pb.fade);
        if (f <= 0.002) continue;
        var la = (0.07 + ((pa.depth + pb.depth) / 2) * 0.18) * f;
        ctx.strokeStyle = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + la.toFixed(3) + ')';
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }

      // points, back-to-front
      order.sort(function (a, b) { return proj[a].z - proj[b].z; });
      for (var o = 0; o < order.length; o++) {
        var q = proj[order[o]];
        if (q.fade <= 0.002) continue;
        var alpha = (0.06 + q.depth * 0.34) * q.fade;
        var size = (0.45 + q.depth * 1.0) * q.persp;
        ctx.beginPath();
        ctx.fillStyle = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha.toFixed(3) + ')';
        ctx.arc(q.x, q.y, size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function frame() {
      tx += (mx - tx) * 0.05;
      ty += (my - ty) * 0.05;
      rot += 0.0018;
      draw();
      raf = requestAnimationFrame(frame);
    }

    recolor();
    resize();
    window.addEventListener('resize', resize);

    var hero = canvas.parentElement;
    hero.addEventListener('pointermove', function (e) {
      var rect = hero.getBoundingClientRect();
      mx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      my = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    });
    hero.addEventListener('pointerleave', function () { mx = 0; my = 0; });

    if (reduce) {
      draw();
    } else {
      raf = requestAnimationFrame(frame);
      document.addEventListener('visibilitychange', function () {
        cancelAnimationFrame(raf);
        if (!document.hidden) raf = requestAnimationFrame(frame);
      });
    }

    return { recolor: recolor };
  }
})();
