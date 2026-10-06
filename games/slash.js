/* ============================================================================
   slash.js — «Corta demonios» (mundo Demon Slayer)
   Minijuego tipo Fruit Ninja: los demonios saltan desde abajo y se cortan
   deslizando el dedo (estela azul de «respiración del agua»). La caja de Nezuko
   NO se corta; la flor de glicinia da puntos extra.
   Contrato: window.MiniGames.slash.start(container, opts) devuelve { stop() }.
   Script plano, sin librerías, todo dibujado en un <canvas>.
   ============================================================================ */
(function () {
  'use strict';
  window.MiniGames = window.MiniGames || {};

  var W = 360, H = 560;                                   // tamaño lógico (vertical)
  var TAU = Math.PI * 2;
  var FONT = '-apple-system, "SF Pro Text", "Segoe UI", Roboto, sans-serif';
  var COUNTDOWN_MS = 2800, END_MS = 1300, TARGET = 1000;  // cuenta atrás, cartel final, meta
  var GRAVITY = 0.0011, TRAIL_MS = 260;                   // px/ms² y vida de la estela
  var DEFAULT_THEME = { accent: '#1E6F50', accent2: '#F4A6C8', bg: '#0f0f1a', text: '#fff' };
  var COMBO_TEXTS = ['¡Primera forma!', '¡Corte total!', '¡Respiración del agua!'];
  var DEMON_COLORS = [['#8a5cc7', '#5e3c8f'], ['#5cb85c', '#3b8a3b'], ['#b05cc7', '#7a3c8f']];
  var FLOWER_DOTS = [[-14, -12, 7], [0, -14, 7], [14, -12, 7], [-9, -2, 6.5], [5, -2, 6.5], [-3, 8, 6], [9, 8, 6], [2, 18, 5]];

  function start(container, opts) {
    opts = opts || {};
    var theme = {}, k;
    for (k in DEFAULT_THEME) theme[k] = (opts.theme && opts.theme[k]) || DEFAULT_THEME[k];
    var durationMs = opts.durationMs > 0 ? opts.durationMs : 60000;

    // ---------- DOM: envoltorio + canvas (estilos en línea, nada global) ----------
    var wrap = document.createElement('div');
    wrap.className = 'mg-slash-wrap';
    wrap.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;' +
      'overflow:hidden;background:' + theme.bg + ';touch-action:none;user-select:none;' +
      '-webkit-user-select:none;-webkit-tap-highlight-color:transparent;';
    var canvas = document.createElement('canvas');
    canvas.className = 'mg-slash-canvas';
    canvas.style.cssText = 'display:block;touch-action:none;user-select:none;-webkit-user-select:none;cursor:crosshair;';
    wrap.appendChild(canvas);
    container.appendChild(wrap);
    var ctx = canvas.getContext('2d');

    function resize() {
      var cw = container.clientWidth || window.innerWidth || W;
      var ch = container.clientHeight || Math.round((window.innerHeight || H) * 0.7);
      var s = Math.min(cw / W, ch / H), dpr = Math.min(3, window.devicePixelRatio || 1);
      canvas.style.width = Math.floor(W * s) + 'px';
      canvas.style.height = Math.floor(H * s) + 'px';
      canvas.width = Math.round(W * s * dpr);
      canvas.height = Math.round(H * s * dpr);
      ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    }
    resize();

    // ---------- estado ----------
    var score = 0, lives = 5, swipeCount = 0, bestCombo = 0;
    var phase = 'countdown';                    // countdown | play | end
    var t0 = performance.now(), now = t0, last = t0, elapsed = 0, playStart = 0;
    var objects = [], halves = [], sparks = [], msgs = [], trail = [], petals = [], stars = [];
    var dragging = false, flash = 0, nextSpawnAt = 0;
    var finished = false, raf = 0, capTimer = 0, endTimer = 0, ro = null;
    for (k = 0; k < 40; k++) stars.push({ x: Math.random() * W, y: Math.random() * 330, r: 0.6 + Math.random() * 1.2, p: Math.random() * 7 });
    for (k = 0; k < 18; k++) petals.push({ x: Math.random() * W, y: Math.random() * H, p: Math.random() * 7, r: 3 + Math.random() * 3 });

    function sfx(name) { try { if (opts.sfx && opts.sfx.play) opts.sfx.play(name); } catch (e) { /* silencio */ } }
    function buzz(ms) { try { if (opts.vibrate) opts.vibrate(ms); } catch (e) { /* silencio */ } }
    function addScore(n) { score += n; try { if (opts.onScore) opts.onScore(score); } catch (e) { /* silencio */ } }
    function say(str, x, y, color, size, life) {
      msgs.push({ str: str, x: Math.max(70, Math.min(W - 70, x)), y: y, color: color, size: size || 20, t: 0, life: life || 900 });
    }
    function loseLife(str, x, y) {
      lives--; flash = 1; say(str, x, y, '#ff6b6b', 22); sfx('lose'); buzz(80);
      if (lives <= 0) endGame();
    }

    // ---------- aparición y corte ----------
    function spawnOne(playT) {
      var roll = Math.random(), type = 'demon';
      if (playT > 5000) { if (roll < 0.12) type = 'box'; else if (roll < 0.25) type = 'flower'; }
      var x = 50 + Math.random() * (W - 100), c = DEMON_COLORS[Math.floor(Math.random() * DEMON_COLORS.length)];
      objects.push({ type: type, x: x, y: H + 40, vx: (W / 2 - x) / 1800 * (0.5 + Math.random() * 0.9),
        vy: -(0.88 + Math.random() * 0.17), r: type === 'demon' ? 26 + Math.random() * 6 : type === 'box' ? 26 : 22,
        rot: 0, vrot: (Math.random() - 0.5) * 0.003, color: c[0], dark: c[1], cut: false });
    }
    function spawnWave() {
      var playT = now - playStart, n = 1;
      if (Math.random() < Math.min(0.8, playT / 40000)) n++;          // sube poco a poco
      if (playT > 25000 && Math.random() < 0.35) n++;
      for (var i = 0; i < n; i++) spawnOne(playT);
      nextSpawnAt = now + Math.max(650, 1300 - playT / 60) + Math.random() * 300;
    }
    function segDist(ax, ay, bx, by, px, py) {         // distancia de un punto a un segmento
      var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      var t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
      var x = ax + dx * t - px, y = ay + dy * t - py;
      return Math.sqrt(x * x + y * y);
    }
    function cutObject(o, ax, ay, bx, by) {
      o.cut = true;
      var ang = Math.atan2(by - ay, bx - ax), nx = -Math.sin(ang), ny = Math.cos(ang), i;
      for (i = -1; i <= 1; i += 2) halves.push({ type: o.type, x: o.x, y: o.y, r: o.r, color: o.color, dark: o.dark, side: i,
        ang: ang - o.rot, rot: o.rot, vrot: o.vrot + i * 0.003, vx: o.vx + nx * 0.16 * i, vy: o.vy * 0.5 - 0.12 + ny * 0.16 * i, t: 0, life: 650 });
      var sparkColor = o.type === 'demon' ? '#9fe3ff' : o.type === 'box' ? '#ffb3d1' : '#d8bfff';
      for (i = 0; i < 10; i++) { var a = Math.random() * 7, v = 0.1 + Math.random() * 0.25;
        sparks.push({ x: o.x, y: o.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 400, color: sparkColor }); }
      if (o.type === 'demon') {
        swipeCount++; bestCombo = Math.max(bestCombo, swipeCount);
        var pts = 100 + 50 * (swipeCount - 1);
        addScore(pts); say('+' + pts, o.x, o.y - 30, '#fff', 18, 700);
        if (swipeCount >= 2) say(COMBO_TEXTS[Math.min(2, swipeCount - 2)], W / 2, 170, '#7fd1ff', 24, 1000);
        sfx('slash'); buzz(25);
      } else if (o.type === 'box') {
        loseLife('¡La caja de Nezuko no!', o.x, o.y - 30);
      } else {
        addScore(200); say('¡Glicinia! +200', o.x, o.y - 30, '#d8bfff', 20); sfx('coin'); buzz(20);
      }
    }
    function beginSwipe(p) { dragging = true; swipeCount = 0; trail = [{ x: p.x, y: p.y, t: performance.now() }]; }
    function moveSwipe(p) {
      var prev = trail[trail.length - 1];
      trail.push({ x: p.x, y: p.y, t: performance.now() });
      if (trail.length > 40) trail.shift();
      if (!prev || phase !== 'play') return;
      for (var i = 0; i < objects.length; i++) {
        var o = objects[i];
        if (!o.cut && segDist(prev.x, prev.y, p.x, p.y, o.x, o.y) <= o.r) cutObject(o, prev.x, prev.y, p.x, p.y);
      }
    }

    // ---------- actualización por fotograma ----------
    function age(list, dt) { for (var i = list.length - 1; i >= 0; i--) { list[i].t += dt; if (list[i].t > list[i].life) list.splice(i, 1); } }
    function update(dt) {
      var i, o;
      elapsed = now - t0;
      age(msgs, dt); age(sparks, dt); age(halves, dt);
      while (trail.length && now - trail[0].t > TRAIL_MS) trail.shift();
      flash = Math.max(0, flash - dt / 350);
      for (i = 0; i < sparks.length; i++) { o = sparks[i]; o.x += o.vx * dt; o.y += o.vy * dt; o.vy += GRAVITY * 0.5 * dt; }
      for (i = 0; i < halves.length; i++) { o = halves[i]; o.vy += GRAVITY * dt; o.x += o.vx * dt; o.y += o.vy * dt; o.rot += o.vrot * dt; }
      for (i = 0; i < petals.length; i++) { o = petals[i]; o.p += dt * 0.002; o.y += dt * 0.03; o.x += Math.sin(o.p) * 0.02 * dt;
        if (o.y > H + 10) { o.y = -10; o.x = Math.random() * W; } }

      if (phase === 'countdown') {
        if (elapsed >= COUNTDOWN_MS) { phase = 'play'; playStart = now; nextSpawnAt = now + 300; }
        return;
      }
      if (phase !== 'play') return;
      if (elapsed >= durationMs) { endGame(); return; }
      if (now >= nextSpawnAt) spawnWave();
      for (i = objects.length - 1; i >= 0; i--) {
        o = objects[i];
        if (o.cut) { objects.splice(i, 1); continue; }
        o.vy += GRAVITY * dt; o.x += o.vx * dt; o.y += o.vy * dt; o.rot += o.vrot * dt;
        if (o.y > H + 60 && o.vy > 0) {
          objects.splice(i, 1);
          if (o.type === 'demon') loseLife('¡Se escapó!', o.x, H - 80);
        }
      }
    }

    // ---------- dibujo ----------
    function rrect(x, y, w, h, r) {
      ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }
    function text(str, x, y, size, color, align, weight, outline) {
      ctx.font = (weight || 'bold') + ' ' + size + 'px ' + FONT;
      ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
      if (outline) { ctx.lineWidth = Math.max(3, size / 6); ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.lineJoin = 'round'; ctx.strokeText(str, x, y); }
      ctx.fillStyle = color; ctx.fillText(str, x, y);
    }
    function heart(x, y, r, on) {
      ctx.beginPath(); ctx.moveTo(x, y + r);
      ctx.bezierCurveTo(x - r * 1.5, y - r * 0.1, x - r * 0.7, y - r * 1.4, x, y - r * 0.5);
      ctx.bezierCurveTo(x + r * 0.7, y - r * 1.4, x + r * 1.5, y - r * 0.1, x, y + r);
      ctx.fillStyle = on ? '#ff3b5c' : 'rgba(255,255,255,0.18)'; ctx.fill();
    }
    function drawNight() {
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, theme.bg); g.addColorStop(1, '#1d1b3a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      var i, s;
      for (i = 0; i < stars.length; i++) { s = stars[i]; ctx.fillStyle = 'rgba(255,255,255,' + (0.4 + 0.4 * Math.sin(now / 700 + s.p)) + ')';
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill(); }
      var m = ctx.createRadialGradient(290, 120, 50, 290, 120, 120);                                  // luna con halo
      m.addColorStop(0, 'rgba(246,240,200,0.35)'); m.addColorStop(1, 'rgba(246,240,200,0)');
      ctx.fillStyle = m; ctx.fillRect(150, 0, 210, 260);
      ctx.fillStyle = '#f6f0c8'; ctx.beginPath(); ctx.arc(290, 120, 54, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.beginPath(); ctx.moveTo(282, 104); ctx.arc(272, 104, 10, 0, TAU);                        // cráteres (subtrazados sueltos)
      ctx.moveTo(319, 135); ctx.arc(305, 135, 14, 0, TAU); ctx.moveTo(288, 148); ctx.arc(282, 148, 6, 0, TAU); ctx.fill();
      ctx.fillStyle = '#16302a';                                                                        // colinas
      ctx.beginPath(); ctx.ellipse(70, H + 30, 220, 110, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = theme.accent; ctx.beginPath(); ctx.ellipse(330, H + 60, 240, 120, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#0d1f19'; ctx.fillRect(0, H - 22, W, 22);
      for (i = 0; i < petals.length; i++) { s = petals[i]; ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.p);   // pétalos de glicinia
        ctx.fillStyle = 'rgba(200,164,244,0.75)'; ctx.beginPath(); ctx.ellipse(0, 0, s.r, s.r * 0.55, 0, 0, TAU); ctx.fill(); ctx.restore(); }
    }
    function drawShape(o) {                     // objeto centrado en (0,0), sin girar
      var r = o.r, i;
      if (o.type === 'demon') {
        ctx.fillStyle = '#f7e7b4';                                                                      // cuernos
        ctx.beginPath(); ctx.moveTo(-r * 0.65, -r * 0.55); ctx.lineTo(-r * 0.5, -r * 1.25); ctx.lineTo(-r * 0.2, -r * 0.85); ctx.fill();
        ctx.beginPath(); ctx.moveTo(r * 0.65, -r * 0.55); ctx.lineTo(r * 0.5, -r * 1.25); ctx.lineTo(r * 0.2, -r * 0.85); ctx.fill();
        ctx.fillStyle = o.color; ctx.strokeStyle = o.dark; ctx.lineWidth = 3;                           // cuerpo
        ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,120,160,0.45)';                                                       // mofletes
        ctx.beginPath(); ctx.arc(-r * 0.62, r * 0.2, r * 0.16, 0, TAU); ctx.arc(r * 0.62, r * 0.2, r * 0.16, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff';                                                                         // ojos saltones
        ctx.beginPath(); ctx.arc(-r * 0.35, -r * 0.18, r * 0.27, 0, TAU); ctx.arc(r * 0.36, -r * 0.24, r * 0.34, 0, TAU); ctx.fill();
        ctx.fillStyle = '#1a1020';
        ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.14, r * 0.12, 0, TAU); ctx.arc(r * 0.42, -r * 0.2, r * 0.15, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#1a1020'; ctx.lineWidth = 2.5;                                               // sonrisa con colmillos
        ctx.beginPath(); ctx.arc(0, r * 0.22, r * 0.45, 0.25, Math.PI - 0.25); ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.moveTo(-r * 0.36, r * 0.36); ctx.lineTo(-r * 0.26, r * 0.6); ctx.lineTo(-r * 0.16, r * 0.42); ctx.fill();
        ctx.beginPath(); ctx.moveTo(r * 0.36, r * 0.36); ctx.lineTo(r * 0.26, r * 0.6); ctx.lineTo(r * 0.16, r * 0.42); ctx.fill();
      } else if (o.type === 'box') {                                                                    // caja de Nezuko
        ctx.fillStyle = theme.accent2; ctx.strokeStyle = '#c7628f'; ctx.lineWidth = 3;
        rrect(-23, -27, 46, 54, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#c7628f'; ctx.fillRect(-23, -14, 46, 3); ctx.fillRect(-23, 12, 46, 5);
        ctx.fillStyle = '#3a2340'; rrect(-13, -7, 26, 14, 3); ctx.fill();                                // ventanita con Nezuko
        ctx.fillStyle = '#ff7bb0'; ctx.beginPath(); ctx.arc(-5, 0, 3, 0, TAU); ctx.arc(5, 0, 3, 0, TAU); ctx.fill();
      } else {                                                                                          // flor de glicinia
        ctx.strokeStyle = '#6fbf73'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(0, -28); ctx.stroke();
        for (i = 0; i < FLOWER_DOTS.length; i++) { ctx.fillStyle = i % 2 ? '#d8bfff' : '#b48cff';
          ctx.beginPath(); ctx.arc(FLOWER_DOTS[i][0], FLOWER_DOTS[i][1], FLOWER_DOTS[i][2], 0, TAU); ctx.fill(); }
      }
    }
    function drawObjects() {
      var i, o;
      for (i = 0; i < objects.length; i++) { o = objects[i]; ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.rot); drawShape(o); ctx.restore(); }
      for (i = 0; i < halves.length; i++) {                                 // mitades: misma figura recortada por el plano del corte
        o = halves[i]; ctx.save(); ctx.globalAlpha = Math.min(1, 2 * (1 - o.t / o.life));
        ctx.translate(o.x, o.y); ctx.rotate(o.rot); ctx.rotate(o.ang);
        ctx.beginPath(); ctx.rect(-90, o.side > 0 ? 0 : -90, 180, 90); ctx.clip(); ctx.rotate(-o.ang);
        drawShape(o); ctx.restore();
      }
      for (i = 0; i < sparks.length; i++) { o = sparks[i]; ctx.globalAlpha = 1 - o.t / o.life; ctx.fillStyle = o.color;
        ctx.beginPath(); ctx.arc(o.x, o.y, 2.5, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    function drawTrail() {
      if (trail.length < 2) return;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (var pass = 0; pass < 2; pass++) for (var i = 1; i < trail.length; i++) {
        var a = Math.max(0, 1 - (now - trail[i].t) / TRAIL_MS);
        ctx.strokeStyle = pass ? 'rgba(228,246,255,' + (0.95 * a) + ')' : 'rgba(80,190,255,' + (0.4 * a) + ')';
        ctx.lineWidth = (pass ? 6 : 18) * a;
        ctx.beginPath(); ctx.moveTo(trail[i - 1].x, trail[i - 1].y); ctx.lineTo(trail[i].x, trail[i].y); ctx.stroke();
      }
    }
    function drawMsgs() {
      for (var i = 0; i < msgs.length; i++) {
        var m = msgs[i], f = m.t / m.life, pop = 1 + 0.35 * Math.max(0, 1 - m.t / 120);
        ctx.globalAlpha = f > 0.6 ? (1 - f) / 0.4 : 1;
        text(m.str, m.x, m.y - 30 * f, m.size * pop, m.color, 'center', 'bold', true);
      }
      ctx.globalAlpha = 1;
    }
    function drawHUD() {
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, 50);
      text('Puntos ' + score, 12, 19, 17, theme.accent2, 'left');
      if (dragging && swipeCount >= 2) text('Combo ×' + swipeCount, 12, 39, 12, '#7fd1ff', 'left', '600');
      else if (bestCombo >= 2) text('Mejor combo ' + bestCombo, 12, 39, 12, 'rgba(255,255,255,0.7)', 'left', '600');
      var secs = Math.max(0, Math.ceil((durationMs - elapsed) / 1000));
      ctx.fillStyle = secs <= 5 ? '#e53e3e' : 'rgba(255,255,255,0.15)'; rrect(150, 10, 60, 30, 15); ctx.fill();
      text(secs + ' s', 180, 25, 16, '#fff');
      for (var i = 0; i < 5; i++) heart(W - 16 - i * 22, 24, 7, i < lives);
    }
    function drawCountdown() {
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H);
      var i = Math.min(3, Math.floor(elapsed / 700)), f = (elapsed - i * 700) / 700;
      text(['3', '2', '1', '¡Ya!'][i], W / 2, H / 2 - 30, (i === 3 ? 64 : 96) * (1.25 - 0.25 * f), '#7fd1ff');
      text('Desliza el dedo para cortar demonios', W / 2, H / 2 + 50, 15, '#fff', 'center', '600');
      text('¡No cortes la caja de Nezuko!', W / 2, H / 2 + 74, 15, theme.accent2, 'center', '600');
    }
    function drawEnd() {
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, W, H);
      text('¡Fin!', W / 2, H / 2 - 50, 56, '#7fd1ff');
      text('Puntos: ' + score, W / 2, H / 2 + 10, 30, '#fff');
      text(score >= TARGET ? '¡Pilar del agua!' : '¡Buen intento!', W / 2, H / 2 + 55, 18, '#fff', 'center', '600');
    }
    function draw() {
      drawNight(); drawObjects(); drawTrail(); drawMsgs();
      if (flash > 0) { ctx.fillStyle = 'rgba(255,40,40,' + (0.35 * flash) + ')'; ctx.fillRect(0, 0, W, H); }
      drawHUD();
      if (phase === 'countdown') drawCountdown();
      if (phase === 'end') drawEnd();
    }

    // ---------- bucle, fin y limpieza ----------
    function frame(ts) {
      if (finished) return;
      now = ts; var dt = Math.min(50, Math.max(0, ts - last)); last = ts;
      update(dt); draw();
      raf = requestAnimationFrame(frame);
    }
    function endGame() {
      if (phase === 'end' || finished) return;
      phase = 'end'; dragging = false; clearTimeout(capTimer);
      if (score >= TARGET) sfx('win');
      endTimer = setTimeout(finish, END_MS);  // temporizador (no rAF) para que acabe aunque la pestaña esté oculta
    }
    function finish() {
      if (finished) return;
      finished = true; cleanup();
      try { if (opts.onEnd) opts.onEnd({ score: score, won: score >= TARGET }); } catch (e) { /* silencio */ }
    }
    function cleanup() {
      cancelAnimationFrame(raf); clearTimeout(capTimer); clearTimeout(endTimer);
      canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('mousedown', onDown); window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      canvas.removeEventListener('touchstart', onTouchStart); canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd); canvas.removeEventListener('touchcancel', onTouchEnd);
      canvas.removeEventListener('contextmenu', prevent);
      window.removeEventListener('resize', resize);
      if (ro) ro.disconnect();
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    }

    // ---------- entrada: toque primero (pointer events), con respaldo táctil y de ratón ----------
    function toLocal(e) { var r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; }
    function prevent(e) { e.preventDefault(); }
    function onDown(e) { e.preventDefault(); if (e.pointerId !== undefined) { try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* nada */ } } beginSwipe(toLocal(e)); }
    function onMove(e) { if (!dragging) return; e.preventDefault(); moveSwipe(toLocal(e)); }
    function onUp() { dragging = false; }
    function onTouchStart(e) { e.preventDefault(); if (!window.PointerEvent) beginSwipe(toLocal(e.touches[0])); }
    function onTouchMove(e) { e.preventDefault(); if (!window.PointerEvent && dragging && e.touches.length) moveSwipe(toLocal(e.touches[0])); }
    function onTouchEnd(e) { e.preventDefault(); if (!window.PointerEvent) dragging = false; }
    if (window.PointerEvent) {
      canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onUp);
    } else {
      canvas.addEventListener('mousedown', onDown); window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    }
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', onTouchEnd, { passive: false });
    canvas.addEventListener('contextmenu', prevent);
    window.addEventListener('resize', resize);
    if (window.ResizeObserver) { ro = new ResizeObserver(resize); ro.observe(container); }

    capTimer = setTimeout(endGame, durationMs);  // tope duro de tiempo
    raf = requestAnimationFrame(frame);

    return { stop: function () { finish(); } };
  }

  window.MiniGames.slash = { id: 'slash', title: 'Corta demonios', world: 'demonslayer', start: start };
})();
