/* ============================================================================
   volley.js — «Remate de Hinata» (mundo Haikyuu!!)
   Minijuego de ritmo: Kageyama coloca el balón y hay que TOCAR justo cuando
   pasa por el aro de remate. Contrato: window.MiniGames.volley.start(container, opts)
   devuelve { stop() }. Script plano, sin librerías, todo dibujado en un <canvas>.
   ============================================================================ */
(function () {
  'use strict';
  window.MiniGames = window.MiniGames || {};

  var W = 360, H = 560;                                   // tamaño lógico (vertical)
  var TAU = Math.PI * 2;
  var FONT = '-apple-system, "SF Pro Text", "Segoe UI", Roboto, sans-serif';
  var FLOOR = 440, NET_X = 180, NET_TOP = 300;            // suelo y red (vista lateral)
  var SPOT = { x: 150, y: 232 };                          // punto de remate (sobre la red)
  var TOSS_FROM = { x: 50, y: 372 };                      // manos de Kageyama
  var COUNTDOWN_MS = 2800, END_MS = 1300, TARGET = 1500;  // cuenta atrás, cartel final, meta
  var PERFECT_MS = 60, GOOD_MS = 150;                     // ventanas de acierto
  var DEFAULT_THEME = { accent: '#F26A1B', accent2: '#111', bg: '#1a1a1f', text: '#fff' };
  var COMBO_TEXTS = ['¡Vuela alto!', '¡Estoy aquí!', '¡Imparable!'];

  function start(container, opts) {
    opts = opts || {};
    var theme = {}, k;
    for (k in DEFAULT_THEME) theme[k] = (opts.theme && opts.theme[k]) || DEFAULT_THEME[k];
    var durationMs = opts.durationMs > 0 ? opts.durationMs : 60000;

    // ---------- DOM: envoltorio + canvas (estilos en línea, nada global) ----------
    var wrap = document.createElement('div');
    wrap.className = 'mg-volley-wrap';
    wrap.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;' +
      'overflow:hidden;background:' + theme.bg + ';touch-action:none;user-select:none;' +
      '-webkit-user-select:none;-webkit-tap-highlight-color:transparent;';
    var canvas = document.createElement('canvas');
    canvas.className = 'mg-volley-canvas';
    canvas.style.cssText = 'display:block;touch-action:none;user-select:none;-webkit-user-select:none;';
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
    var score = 0, lives = 5, combo = 0, hits = 0, misses = 0;
    var phase = 'countdown';                    // countdown | play | end
    var t0 = performance.now(), now = t0, last = t0, elapsed = 0;
    var ball = null;                            // { state: toss|drop|spiked, start, T, x, y, vx, vy, spin, trail }
    var tossT = 1500, nextTossAt = 0;           // duración del pase (ms); baja un 5 % cada 5 remates
    var hinata = { jump: 0 }, blocker = { jump: 0, nextAt: 0 }, setter = { toss: 0 };
    var msgs = [];                              // textos flotantes
    var finished = false, raf = 0, capTimer = 0, endTimer = 0, ro = null;

    function sfx(name) { try { if (opts.sfx && opts.sfx.play) opts.sfx.play(name); } catch (e) { /* silencio */ } }
    function buzz(ms) { try { if (opts.vibrate) opts.vibrate(ms); } catch (e) { /* silencio */ } }
    function addScore(n) { score += n; try { if (opts.onScore) opts.onScore(score); } catch (e) { /* silencio */ } }
    function mult() { return combo >= 6 ? 3 : combo >= 3 ? 2 : 1; }
    function say(str, x, y, color, size, life) {
      msgs.push({ str: str, x: x, y: y, color: color, size: size || 20, t: 0, life: life || 900 });
    }

    // ---------- lógica del rally ----------
    function tossPos(u) {                       // parábola del pase; más allá de u=1 sigue cayendo sola
      return { x: TOSS_FROM.x + (SPOT.x - TOSS_FROM.x) * u,
               y: TOSS_FROM.y + (SPOT.y - TOSS_FROM.y) * u - 520 * u * (1 - u) };
    }
    function newToss() {
      ball = { state: 'toss', start: now, T: tossT, x: TOSS_FROM.x, y: TOSS_FROM.y, vx: 0, vy: 0, spin: 0, trail: [] };
      setter.toss = 1;
    }
    function hit(kind) {
      hits++; combo++;
      var pts = (kind === 'perfect' ? 300 : 150) * mult();
      addScore(pts);
      ball.state = 'spiked'; ball.x = SPOT.x; ball.y = SPOT.y; ball.vx = 0.975; ball.vy = 1.03;
      hinata.jump = 0.001;
      if (hits % 5 === 0) tossT = Math.max(700, tossT * 0.95);
      say(kind === 'perfect' ? '¡REMATE PERFECTO!' : '¡Buen remate!', W / 2, 150,
          kind === 'perfect' ? theme.accent : '#fff', kind === 'perfect' ? 26 : 20);
      say('+' + pts, SPOT.x + 70, SPOT.y - 20, '#ffd166', 18, 700);
      if (combo >= 3 && combo % 3 === 0) say(COMBO_TEXTS[(combo / 3 - 1) % COMBO_TEXTS.length], W / 2, 195, '#7fd1ff', 22, 1100);
      else if (blocker.jump > 0.25 && blocker.jump < 0.75) say('¡Supera el bloqueo!', W / 2, 195, '#fff', 16);
      sfx(kind === 'perfect' ? 'spike' : 'coin'); buzz(kind === 'perfect' ? 40 : 20);
    }
    function miss(str) {
      misses++; lives--; combo = 0;
      ball.state = 'drop';
      say(str, W / 2, 150, '#ff6b6b', 24);
      sfx('lose'); buzz(70);
      if (lives <= 0) endGame();
    }
    function onTap() {
      if (phase !== 'play') return;
      if (!ball || ball.state !== 'toss') {     // salto de adorno, sin penalización
        if (hinata.jump <= 0) { hinata.jump = 0.001; sfx('whoosh'); }
        return;
      }
      var delta = (performance.now() - ball.start) - ball.T;   // ms respecto al instante perfecto
      if (Math.abs(delta) <= PERFECT_MS) hit('perfect');
      else if (Math.abs(delta) <= GOOD_MS) hit('good');
      else { hinata.jump = 0.001; miss(delta < 0 ? '¡Muy pronto!' : '¡Tarde!'); }
    }

    // ---------- actualización por fotograma ----------
    function update(dt) {
      elapsed = now - t0;
      for (var i = msgs.length - 1; i >= 0; i--) { msgs[i].t += dt; if (msgs[i].t > msgs[i].life) msgs.splice(i, 1); }
      if (hinata.jump > 0) { hinata.jump += dt / 520; if (hinata.jump >= 1) hinata.jump = 0; }
      if (blocker.jump > 0) { blocker.jump += dt / 650; if (blocker.jump >= 1) blocker.jump = 0; }
      else if (phase === 'play' && now >= blocker.nextAt) { blocker.jump = 0.001; blocker.nextAt = now + 1500 + Math.random() * 2500; }
      if (setter.toss > 0) setter.toss = Math.max(0, setter.toss - dt / 450);

      if (phase === 'countdown') {
        if (elapsed >= COUNTDOWN_MS) { phase = 'play'; nextTossAt = now + 400; blocker.nextAt = now + 1200; }
        return;
      }
      if (phase !== 'play') return;
      if (elapsed >= durationMs) { endGame(); return; }
      if (!ball) { if (now >= nextTossAt) newToss(); return; }

      ball.spin += dt * 0.004;
      if (ball.state === 'spiked') {
        ball.trail.push({ x: ball.x, y: ball.y }); if (ball.trail.length > 8) ball.trail.shift();
        ball.x += ball.vx * dt; ball.y += ball.vy * dt;
        if (ball.y >= FLOOR - 8 || ball.x > W + 20) { ball = null; nextTossAt = now + 650; }
      } else {
        var u = (now - ball.start) / ball.T, p = tossPos(u);
        ball.x = p.x; ball.y = p.y;
        if (ball.state === 'toss' && (now - ball.start) > ball.T + GOOD_MS) miss('¡Tarde!');
        if (ball.y > FLOOR + 30) { ball = null; nextTossAt = now + 800; }
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
    function drawGym() {
      var g = ctx.createLinearGradient(0, 0, 0, FLOOR);
      g.addColorStop(0, theme.bg); g.addColorStop(1, '#2b2b36');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, FLOOR);
      ctx.fillStyle = 'rgba(255,255,255,0.045)';                          // gradas
      for (var i = 0; i < 4; i++) ctx.fillRect(0, 128 + i * 30, W, 14);
      ctx.fillStyle = theme.accent2; ctx.fillRect(110, 62, 140, 48);     // pancarta de Karasuno
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2; ctx.strokeRect(114, 66, 132, 40);
      text('¡VUELA!', 180, 86, 22, theme.text);
      ctx.fillStyle = '#c0834a'; ctx.fillRect(0, FLOOR, W, H - FLOOR);   // suelo de madera
      ctx.fillStyle = 'rgba(0,0,0,0.14)';
      for (var r = 0; r < 5; r++) {
        ctx.fillRect(0, FLOOR + 24 + r * 24, W, 2);
        for (var c = -1; c < 5; c++) ctx.fillRect(c * 90 + (r % 2) * 45, FLOOR + r * 24, 2, 24);
      }
      ctx.fillStyle = theme.accent; ctx.fillRect(0, FLOOR, W, 4);        // línea de banda
      ctx.fillStyle = '#fff'; ctx.fillRect(NET_X - 1, FLOOR + 4, 2, H - FLOOR);
    }
    function drawNet() {
      ctx.fillStyle = '#d9d9d9'; ctx.fillRect(NET_X - 3, NET_TOP - 12, 6, FLOOR - NET_TOP + 12);   // poste
      ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fillRect(NET_X - 9, NET_TOP, 18, 100);         // malla
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.beginPath();
      for (var y = NET_TOP + 10; y < NET_TOP + 100; y += 10) { ctx.moveTo(NET_X - 9, y); ctx.lineTo(NET_X + 9, y); }
      ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.fillRect(NET_X - 10, NET_TOP - 4, 20, 8);                        // cinta superior
    }
    // Jugador sencillo con los pies en (px, py). o = { hair, spike, jersey, trim, number, jump, flip, scale, armsUp }
    function drawPlayer(px, py, o) {
      var s = o.scale || 1, lift = Math.sin(Math.PI * (o.jump || 0)) * 95;
      ctx.save(); ctx.translate(px, py - lift); ctx.scale(o.flip ? -s : s, s);
      ctx.fillStyle = '#f3c9a4'; ctx.fillRect(-11, -38, 8, 34); ctx.fillRect(3, -38, 8, 34);       // piernas
      ctx.fillStyle = '#fff'; ctx.fillRect(-13, -7, 11, 7); ctx.fillRect(2, -7, 11, 7);           // zapatillas
      ctx.fillStyle = '#1a1a1a'; rrect(-15, -54, 30, 20, 4); ctx.fill();                          // pantalón
      ctx.fillStyle = o.jersey; rrect(-17, -94, 34, 44, 6); ctx.fill();                           // camiseta
      ctx.fillStyle = o.trim; ctx.fillRect(-17, -62, 34, 5); ctx.fillRect(-17, -94, 34, 4);
      ctx.save(); if (o.flip) ctx.scale(-1, 1); text(o.number, 0, -74, 15, '#fff'); ctx.restore();  // dorsal sin espejo
      ctx.fillStyle = '#f3c9a4';                                                                    // brazos
      if (o.armsUp) { ctx.fillRect(-26, -130, 8, 44); ctx.fillRect(18, -138, 8, 52); }
      else { ctx.fillRect(-25, -90, 8, 34); ctx.fillRect(17, -90, 8, 34); }
      ctx.beginPath(); ctx.arc(0, -110, 15, 0, TAU); ctx.fill();                                     // cabeza
      ctx.fillStyle = o.hair; ctx.beginPath(); ctx.arc(0, -115, 15, Math.PI, 0); ctx.fill();      // pelo
      for (var i = -2; i <= 2; i++) {                                                               // puntas
        ctx.beginPath(); ctx.moveTo(i * 6 - 5, -117); ctx.lineTo(i * 7, -119 - o.spike + Math.abs(i) * 4); ctx.lineTo(i * 6 + 5, -117); ctx.fill();
      }
      ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(4, -110, 1.8, 0, TAU); ctx.arc(-3, -110, 1.8, 0, TAU); ctx.fill();  // ojos
      ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(1, -105, 4, 0.3, Math.PI - 0.3); ctx.stroke();
      ctx.restore();
    }
    function drawBall() {
      if (!ball) return;
      var a = Math.max(0.1, 1 - (FLOOR - ball.y) / 300);                                           // sombra en el suelo
      ctx.fillStyle = 'rgba(0,0,0,' + (0.25 * a) + ')'; ctx.beginPath(); ctx.ellipse(ball.x, FLOOR + 6, 12 * a + 4, 4, 0, 0, TAU); ctx.fill();
      for (var i = 0; i < ball.trail.length; i++) {                                                 // estela del remate
        var p = ball.trail[i], f = (i + 1) / ball.trail.length;
        ctx.fillStyle = 'rgba(242,106,27,' + (f * 0.55) + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, 12 * f, 0, TAU); ctx.fill();
      }
      ctx.save(); ctx.translate(ball.x, ball.y); ctx.rotate(ball.spin);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 12, 0, TAU); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#2b6cb0'; ctx.beginPath(); ctx.arc(0, 0, 8, 0.3, 2.3); ctx.stroke();
      ctx.strokeStyle = '#f2c00c'; ctx.beginPath(); ctx.arc(0, 0, 8, 2.9, 5.2); ctx.stroke();
      ctx.restore();
    }
    function drawTarget() {
      if (!ball || ball.state !== 'toss') return;
      var u = (now - ball.start) / ball.T, pulse = 0.8 + 0.2 * Math.sin(now / 90);
      ctx.lineWidth = 12; ctx.strokeStyle = 'rgba(255,140,60,' + (0.25 * pulse) + ')';
      ctx.beginPath(); ctx.arc(SPOT.x, SPOT.y, 22, 0, TAU); ctx.stroke();                            // halo del aro
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,170,90,' + pulse + ')';
      ctx.beginPath(); ctx.arc(SPOT.x, SPOT.y, 22, 0, TAU); ctx.stroke();                            // aro fijo
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.arc(SPOT.x, SPOT.y, 22 + Math.max(0, 1 - u) * 95, 0, TAU); ctx.stroke();   // aro que encoge
      if (hits + misses < 2) text('¡Toca cuando llegue al aro!', SPOT.x + 30, SPOT.y - 50, 14, '#fff', 'center', '600', true);
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
      text('Puntos ' + score, 12, 19, 17, theme.accent, 'left');
      if (combo >= 2) text('Racha ' + combo + '  ×' + mult(), 12, 39, 12, '#fff', 'left', '600');
      var secs = Math.max(0, Math.ceil((durationMs - elapsed) / 1000));
      ctx.fillStyle = secs <= 5 ? '#e53e3e' : 'rgba(255,255,255,0.15)'; rrect(150, 10, 60, 30, 15); ctx.fill();
      text(secs + ' s', 180, 25, 16, '#fff');
      for (var i = 0; i < 5; i++) heart(W - 16 - i * 22, 24, 7, i < lives);
    }
    function drawCountdown() {
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H);
      var i = Math.min(3, Math.floor(elapsed / 700)), f = (elapsed - i * 700) / 700;
      text(['3', '2', '1', '¡Ya!'][i], W / 2, H / 2 - 20, (i === 3 ? 64 : 96) * (1.25 - 0.25 * f), theme.accent);
      text('Toca cuando el balón llegue al aro', W / 2, H / 2 + 60, 15, '#fff', 'center', '600');
    }
    function drawEnd() {
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, W, H);
      text('¡Fin!', W / 2, H / 2 - 50, 56, theme.accent);
      text('Puntos: ' + score, W / 2, H / 2 + 10, 30, '#fff');
      text(score >= TARGET ? '¡Remate ganador!' : '¡Buen intento!', W / 2, H / 2 + 55, 18, '#fff', 'center', '600');
    }
    function draw() {
      drawGym(); drawNet();
      drawPlayer(40, FLOOR, { hair: '#1b2a44', spike: 7, jersey: theme.accent2, trim: theme.accent, number: '9', scale: 0.8, armsUp: setter.toss > 0 });
      drawPlayer(268, FLOOR, { hair: '#1a1a1a', spike: 10, jersey: '#c1272d', trim: '#1a1a1a', number: '1', flip: true, jump: blocker.jump, armsUp: blocker.jump > 0 });
      drawPlayer(100, FLOOR, { hair: theme.accent, spike: 22, jersey: theme.accent2, trim: theme.accent, number: '10', jump: hinata.jump, armsUp: hinata.jump > 0 });
      drawTarget(); drawBall(); drawMsgs(); drawHUD();
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
      phase = 'end'; clearTimeout(capTimer);
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
      canvas.removeEventListener('pointerdown', onPointer);
      canvas.removeEventListener('mousedown', onPointer);
      canvas.removeEventListener('touchstart', onTouch);
      canvas.removeEventListener('touchmove', prevent);
      canvas.removeEventListener('touchend', prevent);
      canvas.removeEventListener('contextmenu', prevent);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', resize);
      if (ro) ro.disconnect();
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    }

    // ---------- entrada: toque primero, teclado y ratón para escritorio ----------
    function prevent(e) { e.preventDefault(); }
    function onPointer(e) { e.preventDefault(); onTap(); }
    function onTouch(e) { e.preventDefault(); if (!window.PointerEvent) onTap(); }
    function onKey(e) {
      var tg = e.target;
      if (e.repeat || (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable))) return;
      if (e.code === 'Space' || e.key === ' ' || e.code === 'Enter' || e.code === 'ArrowUp') { e.preventDefault(); onTap(); }
    }
    if (window.PointerEvent) canvas.addEventListener('pointerdown', onPointer);
    else canvas.addEventListener('mousedown', onPointer);
    canvas.addEventListener('touchstart', onTouch, { passive: false });
    canvas.addEventListener('touchmove', prevent, { passive: false });
    canvas.addEventListener('touchend', prevent, { passive: false });
    canvas.addEventListener('contextmenu', prevent);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', resize);
    if (window.ResizeObserver) { ro = new ResizeObserver(resize); ro.observe(container); }

    capTimer = setTimeout(endGame, durationMs);  // tope duro de tiempo
    raf = requestAnimationFrame(frame);

    return { stop: function () { finish(); } };
  }

  window.MiniGames.volley = { id: 'volley', title: 'Remate de Hinata', world: 'haikyuu', start: start };
})();
