/*
 * pacman.js — «Luffy come carne» (mundo One Piece). Minijuego tipo Pac-Man para móvil.
 * Script plano, sin módulos ni librerías. Contrato: window.MiniGames.pacman.start(container, opts) → { stop() }.
 * Control: deslizar el dedo sobre el canvas (giro en cola, como el Pac-Man real), 4 botones grandes abajo y flechas del teclado.
 */
(function () {
  'use strict';
  window.MiniGames = window.MiniGames || {};

  // ---------- Laberinto (15 columnas × 17 filas) ----------
  // '#' muro · '.' carne · 'o' Gear 5 (píldora de poder) · ' ' pasillo sin carne (fila del túnel) · '-' puerta del cuartel · 'P' cuartel de los Marines
  var MAZE = [
    '###############',
    '#......#......#',
    '#.##.#.#.#.##.#',
    '#o##.#...#.##o#',
    '#.............#',
    '##.#.#...#.#.##',
    '##.#.##-##.#.##',
    '     #PPP#     ',
    '##..#######..##',
    '#.............#',
    '#.##.##.##.##.#',
    '#....#...#....#',
    '#.##.#.#.#.##.#',
    '#o...#.#.#...o#',
    '#.##.#.#.#.##.#',
    '#.............#',
    '###############'
  ];
  var COLS = 15, ROWS = MAZE.length, T = 24, HUD_H = 40;
  var W = COLS * T, H = HUD_H + ROWS * T;                 // tamaño lógico del canvas: 360 × 448 (vertical)
  var DIRS = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, up: { x: 0, y: -1 }, down: { x: 0, y: 1 } };
  var OPPOSITE = { left: 'right', right: 'left', up: 'down', down: 'up' };
  var DIR_ORDER = ['up', 'left', 'down', 'right'];       // orden de desempate de los Marines (como el original)
  var LUFFY_START = { c: 7, r: 11 };
  var PEN_EXIT = { c: 7, r: 5 };                           // casilla justo encima de la puerta del cuartel
  var PEN_CENTER = { x: 7.5, y: 7.5 };                     // centro del cuartel (coordenadas de casilla)
  var PEN_SLOTS = [6.5, 7.5, 8.5];
  var SPEED = { luffy: 5.5, fright: 3, eyes: 9 };          // casillas por segundo
  var FRIGHT_SECS = 6, STEP = 1 / 120;
  var FONT = '-apple-system, "SF Pro Text", "Segoe UI", Roboto, sans-serif';
  var MARINES = [                                          // tres Marines: persigue · se adelanta · aleatorio
    { ai: 'chase', speed: 4.8, body: '#ffffff', brim: '#1d3a8a', release: 0.8 },
    { ai: 'ahead', speed: 4.5, body: '#e9f0ff', brim: '#2b5fd9', release: 4.5 },
    { ai: 'random', speed: 4.2, body: '#fff4e3', brim: '#163070', release: 8.5 }
  ];

  function tileAt(c, r) { if (r < 0 || r >= ROWS) return '#'; return MAZE[r][((c % COLS) + COLS) % COLS]; }
  function isOpen(c, r) { var ch = tileAt(c, r); return ch !== '#' && ch !== 'P' && ch !== '-'; }

  // Mapa de distancias (BFS) hasta la salida del cuartel: lo usan los ojos de los Marines comidos para volver a casa.
  var DIST = (function () {
    var d = [], r, c, k;
    for (r = 0; r < ROWS; r++) { d.push([]); for (c = 0; c < COLS; c++) d[r].push(Infinity); }
    var q = [[PEN_EXIT.c, PEN_EXIT.r]]; d[PEN_EXIT.r][PEN_EXIT.c] = 0;
    while (q.length) {
      var cur = q.shift();
      for (k in DIRS) {
        var nc = ((cur[0] + DIRS[k].x) % COLS + COLS) % COLS, nr = cur[1] + DIRS[k].y;
        if (isOpen(nc, nr) && d[nr][nc] === Infinity) { d[nr][nc] = d[cur[1]][cur[0]] + 1; q.push([nc, nr]); }
      }
    }
    return d;
  })();

  function start(container, opts) {
    opts = opts || {};
    var th = { accent: '#E4002B', accent2: '#FFC72C', bg: '#0b1a33', text: '#fff' }, k;
    if (opts.theme) for (k in opts.theme) if (opts.theme[k]) th[k] = opts.theme[k];
    var durationMs = typeof opts.durationMs === 'number' && opts.durationMs > 0 ? opts.durationMs : 75000;
    function sfx(name) { try { if (opts.sfx && opts.sfx.play) opts.sfx.play(name); } catch (e) { /* el sonido nunca rompe el juego */ } }
    function buzz(ms) { try { if (typeof opts.vibrate === 'function') opts.vibrate(ms); } catch (e) { /* idem */ } }

    // ---------- DOM: raíz, canvas y botonera ----------
    var root = document.createElement('div');
    root.className = 'mg-pacman-root';
    root.style.cssText = 'position:relative;width:100%;height:100%;display:flex;flex-direction:column;box-sizing:border-box;overflow:hidden;' +
      'background:' + th.bg + ';color:' + th.text + ';font-family:' + FONT + ';touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;';
    var area = document.createElement('div');
    area.style.cssText = 'flex:1 1 auto;min-height:0;display:flex;align-items:center;justify-content:center;overflow:hidden;';
    var canvas = document.createElement('canvas');
    canvas.className = 'mg-pacman-canvas';
    canvas.style.cssText = 'display:block;touch-action:none;user-select:none;-webkit-user-select:none;';
    area.appendChild(canvas);
    var bar = document.createElement('div');
    bar.style.cssText = 'flex:0 0 auto;display:flex;gap:8px;padding:6px 8px 8px;box-sizing:border-box;';
    var BTN_BG = 'rgba(255,255,255,.12)';
    [['left', '◀', 'Izquierda'], ['up', '▲', 'Arriba'], ['down', '▼', 'Abajo'], ['right', '▶', 'Derecha']].forEach(function (b) {
      var el = document.createElement('button');
      el.type = 'button'; el.textContent = b[1]; el.setAttribute('aria-label', b[2]);
      el.style.cssText = 'flex:1 1 0;height:60px;min-width:56px;font-size:26px;line-height:1;border-radius:16px;border:2px solid rgba(255,255,255,.28);' +
        'background:' + BTN_BG + ';color:' + th.text + ';touch-action:none;user-select:none;-webkit-user-select:none;cursor:pointer;padding:0;';
      el.addEventListener('pointerdown', function (ev) {
        ev.preventDefault(); want(b[0]);
        el.style.background = th.accent; setTimeout(function () { el.style.background = BTN_BG; }, 140);
      });
      bar.appendChild(el);
    });
    root.appendChild(area); root.appendChild(bar); container.appendChild(root);
    if (root.clientHeight < 240) root.style.height = Math.round(window.innerHeight * 0.7) + 'px';   // el contenedor no tenía alto fijo
    var ctx = canvas.getContext('2d');
    var layer = document.createElement('canvas'), lctx = layer.getContext('2d');   // capa estática (muros) prerrenderizada
    var scaleX = 1, scaleY = 1;

    // Encaja el canvas en el área (letterbox) y usa devicePixelRatio para que se vea nítido.
    function resize() {
      var aw = Math.max(1, area.clientWidth), ah = Math.max(1, area.clientHeight);
      var s = Math.min(aw / W, ah / H), cw = Math.max(1, Math.floor(W * s)), chh = Math.max(1, Math.floor(H * s));
      var dpr = Math.min(3, window.devicePixelRatio || 1);
      canvas.style.width = cw + 'px'; canvas.style.height = chh + 'px';
      canvas.width = layer.width = Math.round(cw * dpr);
      canvas.height = layer.height = Math.round(chh * dpr);
      scaleX = canvas.width / W; scaleY = canvas.height / H;
      drawStatic();
    }

    // ---------- Entrada: deslizar, botones y teclado ----------
    var queued = null;                                     // giro en cola: se aplica en el primer cruce donde sea posible
    function want(dir) { if (ended || phase === 'over') return; queued = dir; }
    var sx = 0, sy = 0, swiping = false;
    function onTouchStart(ev) { ev.preventDefault(); if (ev.touches.length) { sx = ev.touches[0].clientX; sy = ev.touches[0].clientY; swiping = true; } }
    function onTouchMove(ev) {
      ev.preventDefault(); if (!swiping || !ev.touches.length) return;
      var dx = ev.touches[0].clientX - sx, dy = ev.touches[0].clientY - sy;
      if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return;
      want(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
      sx = ev.touches[0].clientX; sy = ev.touches[0].clientY;   // el origen se reinicia: se pueden encadenar giros sin levantar el dedo
    }
    function onTouchEnd() { swiping = false; }
    var KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down' };
    function onKey(ev) { var d = KEYS[ev.key]; if (d) { ev.preventDefault(); want(d); } }
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    canvas.addEventListener('touchcancel', onTouchEnd);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    var ro = null;
    if (window.ResizeObserver) { ro = new ResizeObserver(function () { resize(); }); ro.observe(area); }

    // ---------- Estado ----------
    var phase = 'countdown', phaseT = 0, ended = false, wonFlag = false, raf = 0, capTimer = 0, overTimer = 0;
    var score = 0, lives = 3, gameTime = 0, frightUntil = -1, lastCoin = -1, yaUntil = -1;
    var dots = [], dotsLeft = 0, pops = [], r, c;   // pops: textos flotantes («+200»)
    for (r = 0; r < ROWS; r++) dots.push(MAZE[r].split(''));
    dots[LUFFY_START.r][LUFFY_START.c] = ' ';
    for (r = 0; r < ROWS; r++) for (c = 0; c < COLS; c++) if (dots[r][c] === '.' || dots[r][c] === 'o') dotsLeft++;
    var luffy = { x: 0, y: 0, dir: null, face: 'left', mouth: 0.2, chomp: 0 };
    var marines = MARINES.map(function (m, i) {
      return { ai: m.ai, speed: m.speed, body: m.body, brim: m.brim, release: m.release, slot: i, x: 0, y: 0, dir: null, state: 'pen', releaseAt: 0, bob: i * 1.1 };
    });
    var t0 = performance.now();

    function addScore(n) { score += n; if (typeof opts.onScore === 'function') opts.onScore(score); }
    function resetPositions() {
      luffy.x = LUFFY_START.c + 0.5; luffy.y = LUFFY_START.r + 0.5; luffy.dir = null; luffy.face = 'left'; luffy.mouth = 0.2; queued = null;
      marines.forEach(function (m) { m.x = PEN_SLOTS[m.slot]; m.y = PEN_CENTER.y; m.dir = null; m.state = 'pen'; m.releaseAt = gameTime + m.release; });
      frightUntil = -1;
    }

    // Movimiento por casillas: avanza `dist` casillas; en cada centro de casilla llama a `decide` (puede cambiar e.dir).
    function advance(e, dist, decide) {
      var guard = 0;
      while (dist > 0 && guard++ < 6) {
        var cx = Math.floor(e.x), cy = Math.floor(e.y);
        if (Math.abs(e.x - cx - 0.5) < 1e-6 && Math.abs(e.y - cy - 0.5) < 1e-6) {
          e.x = cx + 0.5; e.y = cy + 0.5;
          decide(e, cx, cy);
          if (!e.dir) return;
          var d = DIRS[e.dir];
          if (!isOpen(cx + d.x, cy + d.y)) { e.dir = null; return; }
        }
        if (!e.dir) return;
        var v = DIRS[e.dir], next, gap;
        if (v.x) { next = v.x > 0 ? Math.floor(e.x + 0.5) + 0.5 : Math.ceil(e.x - 0.5) - 0.5; gap = Math.abs(next - e.x); }
        else { next = v.y > 0 ? Math.floor(e.y + 0.5) + 0.5 : Math.ceil(e.y - 0.5) - 0.5; gap = Math.abs(next - e.y); }
        if (dist >= gap) { if (v.x) e.x = next; else e.y = next; dist -= gap; }
        else { e.x += v.x * dist; e.y += v.y * dist; dist = 0; }
        if (e.x < 0) e.x += COLS; else if (e.x >= COLS) e.x -= COLS;   // túnel lateral
      }
    }

    function decideLuffy(e, cx, cy) {
      if (queued) { var d = DIRS[queued]; if (isOpen(cx + d.x, cy + d.y)) { e.dir = queued; queued = null; } }
    }
    function updateLuffy(dt) {
      if (queued === luffy.dir) queued = null;
      else if (queued && luffy.dir && queued === OPPOSITE[luffy.dir]) { luffy.dir = queued; queued = null; }   // dar la vuelta vale en cualquier momento
      advance(luffy, SPEED.luffy * dt, decideLuffy);
      if (luffy.dir) { luffy.face = luffy.dir; luffy.chomp += dt * 14; luffy.mouth = 0.12 + 0.5 * Math.abs(Math.sin(luffy.chomp)); }
      var cc = Math.floor(luffy.x), rr = Math.floor(luffy.y), ch = dots[rr] && dots[rr][cc];
      if (ch === '.' || ch === 'o') {
        dots[rr][cc] = ' '; dotsLeft--;
        if (ch === '.') { addScore(10); if (gameTime - lastCoin > 0.12) { lastCoin = gameTime; sfx('coin'); } }
        else {   // Gear 5: los Marines se asustan 6 s y dan media vuelta
          addScore(50); sfx('whoosh'); buzz(40); frightUntil = gameTime + FRIGHT_SECS;
          marines.forEach(function (m) { if (m.state === 'active' || m.state === 'frightened') { m.state = 'frightened'; if (m.dir) m.dir = OPPOSITE[m.dir]; } });
        }
        if (dotsLeft <= 0) finish(true);
      }
    }

    function decideMarine(m, cx, cy) {
      if (m.state === 'eyes' && cx === PEN_EXIT.c && cy === PEN_EXIT.r) { m.state = 'entering'; m.dir = null; return; }
      var options = [], i, kk;
      for (i = 0; i < 4; i++) {
        kk = DIR_ORDER[i];
        if ((m.state === 'eyes' || kk !== OPPOSITE[m.dir]) && isOpen(cx + DIRS[kk].x, cy + DIRS[kk].y)) options.push(kk);
      }
      if (!options.length) { m.dir = m.dir ? OPPOSITE[m.dir] : null; return; }
      if (options.length === 1 || m.state === 'frightened' || (m.ai === 'random' && m.state !== 'eyes') || (m.state !== 'eyes' && Math.random() < 0.2)) {
        m.dir = options[Math.floor(Math.random() * options.length)]; return;
      }
      var best = null, bestV = Infinity;   // persigue: la opción que más acerca a Luffy · ojos: la que más acerca al cuartel
      for (i = 0; i < options.length; i++) {
        kk = options[i];
        var nx = cx + DIRS[kk].x, ny = cy + DIRS[kk].y, v;
        if (m.state === 'eyes') v = DIST[ny][((nx % COLS) + COLS) % COLS];
        else { var ddx = nx + 0.5 - luffy.x, ddy = ny + 0.5 - luffy.y; v = ddx * ddx + ddy * ddy; }
        if (v < bestV) { bestV = v; best = kk; }
      }
      m.dir = best;
    }
    function updateMarine(m, dt) {
      if (m.state === 'pen') { if (gameTime >= m.releaseAt) m.state = 'exiting'; return; }
      if (m.state === 'exiting' || m.state === 'entering') {   // recorrido guiado por la puerta del cuartel
        var tx = PEN_CENTER.x, ty = m.state === 'exiting' ? PEN_EXIT.r + 0.5 : PEN_CENTER.y, step = 3.5 * dt;
        if (Math.abs(m.x - tx) > 1e-6) { m.x += Math.max(-step, Math.min(step, tx - m.x)); if (Math.abs(m.x - tx) < 1e-6) m.x = tx; }
        else if (Math.abs(m.y - ty) > 1e-6) { m.y += Math.max(-step, Math.min(step, ty - m.y)); if (Math.abs(m.y - ty) < 1e-6) m.y = ty; }
        else if (m.state === 'exiting') { m.state = frightUntil > gameTime ? 'frightened' : 'active'; m.dir = Math.random() < 0.5 ? 'left' : 'right'; }
        else { m.state = 'pen'; m.x = PEN_SLOTS[m.slot]; m.releaseAt = gameTime + 1.2; }
        return;
      }
      if (m.state === 'frightened' && frightUntil <= gameTime) m.state = 'active';
      var sp = m.state === 'frightened' ? SPEED.fright : m.state === 'eyes' ? SPEED.eyes : m.speed;
      advance(m, sp * dt, decideMarine);
    }
    function checkCollisions() {
      for (var i = 0; i < marines.length; i++) {
        var m = marines[i];
        if (m.state !== 'active' && m.state !== 'frightened') continue;
        var dx = m.x - luffy.x, dy = m.y - luffy.y;
        if (dx * dx + dy * dy > 0.3) continue;
        if (m.state === 'frightened') { addScore(200); m.state = 'eyes'; sfx('punch'); buzz(80); pops.push({ x: m.x, y: m.y, text: '+200', until: gameTime + 0.9 }); }
        else { phase = 'dying'; phaseT = 0; sfx('lose'); buzz(200); return; }
      }
    }

    function update(dt) {
      phaseT += dt;
      if (phase === 'countdown') { if (phaseT >= 1.95) { phase = 'play'; phaseT = 0; yaUntil = gameTime + 0.6; } return; }
      if (phase === 'ready') { if (phaseT >= 0.9) { phase = 'play'; phaseT = 0; } return; }
      if (phase === 'dying') {
        if (phaseT >= 1.1) { lives--; if (lives <= 0) finish(false); else { resetPositions(); phase = 'ready'; phaseT = 0; } }
        return;
      }
      if (phase !== 'play') return;
      gameTime += dt;
      updateLuffy(dt);
      if (phase !== 'play') return;   // pudo terminar al comer la última carne
      marines.forEach(function (m) { updateMarine(m, dt); });
      checkCollisions();
      while (pops.length && pops[0].until < gameTime) pops.shift();
    }

    function finish(won) {
      if (phase === 'over' || ended) return;
      phase = 'over'; phaseT = 0; wonFlag = !!won; queued = null;
      if (won) { sfx('win'); buzz(120); }
      overTimer = setTimeout(endNow, 1300);
    }
    function endNow() {
      if (ended) return;
      ended = true; cleanup();
      if (typeof opts.onEnd === 'function') opts.onEnd({ score: score, won: wonFlag });
    }
    function cleanup() {
      cancelAnimationFrame(raf); clearTimeout(capTimer); clearTimeout(overTimer);
      window.removeEventListener('keydown', onKey); window.removeEventListener('resize', resize); window.removeEventListener('orientationchange', resize);
      canvas.removeEventListener('touchstart', onTouchStart); canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd); canvas.removeEventListener('touchcancel', onTouchEnd);
      if (ro) ro.disconnect();
      if (root.parentNode) root.parentNode.removeChild(root);
    }

    // ---------- Dibujo ----------
    function drawStatic() {   // muros: líneas redondeadas entre centros de casillas de muro vecinas, con halo
      var g = lctx; g.setTransform(scaleX, 0, 0, scaleY, 0, 0);
      g.fillStyle = th.bg; g.fillRect(0, 0, W, H);
      [[T * 0.62, 'rgba(70,130,255,0.28)'], [T * 0.36, '#2457d6'], [T * 0.14, '#7aa8ff']].forEach(function (p) {
        g.lineWidth = p[0]; g.strokeStyle = p[1]; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath();
        for (var rr = 0; rr < ROWS; rr++) for (var cc = 0; cc < COLS; cc++) {
          if (tileAt(cc, rr) !== '#') continue;
          var x = cc * T + T / 2, y = HUD_H + rr * T + T / 2;
          if (cc + 1 < COLS && tileAt(cc + 1, rr) === '#') { g.moveTo(x, y); g.lineTo(x + T, y); }
          if (rr + 1 < ROWS && tileAt(cc, rr + 1) === '#') { g.moveTo(x, y); g.lineTo(x, y + T); }
        }
        g.stroke();
      });
      g.strokeStyle = '#ff9fb8'; g.lineWidth = 4; g.beginPath();   // puerta del cuartel
      g.moveTo(7 * T + 3, HUD_H + 6 * T + T / 2); g.lineTo(8 * T - 3, HUD_H + 6 * T + T / 2); g.stroke();
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
    function drawMeat(g, x, y, s) {   // muslo de carne: óvalo tostado + huesito blanco
      g.save(); g.translate(x, y); g.rotate(-0.7);
      g.fillStyle = '#c96a3b'; g.beginPath(); g.ellipse(s * 0.2, 0, s * 1.3, s * 0.95, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#e8936a'; g.beginPath(); g.ellipse(s * 0.35, -s * 0.2, s * 0.6, s * 0.35, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#fff4e6'; g.lineWidth = s * 0.45; g.lineCap = 'round'; g.beginPath(); g.moveTo(-s, 0); g.lineTo(-s * 1.7, 0); g.stroke();
      g.fillStyle = '#fff4e6'; g.beginPath(); g.arc(-s * 1.8, -s * 0.25, s * 0.3, 0, Math.PI * 2); g.arc(-s * 1.8, s * 0.25, s * 0.3, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    var meat = document.createElement('canvas'), mg = meat.getContext('2d');   // sprite de la carne (16×16 lógico, 3x) para no redibujar 113 muslos por frame
    meat.width = meat.height = 48; mg.setTransform(3, 0, 0, 3, 0, 0); drawMeat(mg, 8, 8, T * 0.17);
    function drawHat(s) {   // sombrero de paja centrado en (0,0): copa, cinta roja y ala
      ctx.fillStyle = '#e9b949'; ctx.beginPath(); ctx.ellipse(0, -s * 0.2, s * 0.62, s * 0.45, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = th.accent; ctx.fillRect(-s * 0.62, -s * 0.56, s * 1.24, s * 0.16);
      ctx.fillStyle = '#e9b949'; ctx.beginPath(); ctx.ellipse(0, -s * 0.16, s * 1.15, s * 0.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#b07f27'; ctx.lineWidth = 1; ctx.stroke();
    }
    function drawDots(now) {
      var pulse = 0.75 + 0.25 * Math.sin(now / 160);
      for (var rr = 0; rr < ROWS; rr++) for (var cc = 0; cc < COLS; cc++) {
        var ch = dots[rr][cc]; if (ch !== '.' && ch !== 'o') continue;
        var x = cc * T + T / 2, y = HUD_H + rr * T + T / 2;
        if (ch === '.') { ctx.drawImage(meat, x - 8, y - 8, 16, 16); continue; }
        var rad = T * 0.48 * pulse, gr = ctx.createRadialGradient(x, y, 0, x, y, rad);   // Gear 5: orbe brillante
        gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.45, '#ffd27a'); gr.addColorStop(1, 'rgba(255,140,40,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
      }
    }
    function drawLuffy() {
      var x = luffy.x * T, y = HUD_H + luffy.y * T, rad = T * 0.44, m = luffy.mouth, sc = 1;
      var ang = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[luffy.face];
      if (phase === 'dying') { sc = Math.max(0, 1 - phaseT); ang += phaseT * 9; m = 0.9; }   // gira y se encoge
      if (sc <= 0) return;
      ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
      ctx.save(); ctx.rotate(ang); ctx.fillStyle = '#ffc93c'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, rad, m, Math.PI * 2 - m); ctx.closePath(); ctx.fill(); ctx.restore();
      var f = DIRS[luffy.face], ex = f.y === 0 ? f.x * rad * 0.25 : rad * 0.42, ey = f.y === 0 ? -rad * 0.45 : f.y * rad * 0.15;
      ctx.fillStyle = '#1b1b1b'; ctx.beginPath(); ctx.arc(ex, ey, rad * 0.11, 0, Math.PI * 2); ctx.fill();
      ctx.rotate(-0.15); ctx.translate(0, -rad * 0.72); drawHat(rad);
      ctx.restore();
    }
    function drawMarine(m, now) {
      var x = m.x * T, y = HUD_H + m.y * T, rad = T * 0.42, i, s;
      if (m.state === 'pen') y += Math.sin(now / 250 + m.bob) * 2;
      var fr = m.state === 'frightened', eyes = m.state === 'eyes', d = m.dir ? DIRS[m.dir] : { x: 0, y: 0 };
      var blink = fr && frightUntil - gameTime < 2 && Math.floor(gameTime * 6) % 2 === 0;
      if (!eyes) {
        ctx.fillStyle = fr ? (blink ? '#e8edff' : '#2e45d4') : m.body;
        ctx.beginPath(); ctx.arc(x, y - rad * 0.15, rad, Math.PI, 0); ctx.lineTo(x + rad, y + rad * 0.75);
        for (i = 1; i <= 4; i++) ctx.lineTo(x + rad - 2 * rad * i / 4, y + (i % 2 ? rad * 0.5 : rad * 0.75));
        ctx.closePath(); ctx.fill();
        if (!fr) {   // gorra blanca con visera azul
          ctx.fillStyle = '#ffffff'; ctx.strokeStyle = m.brim; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.ellipse(x, y - rad * 1.05, rad * 0.78, rad * 0.34, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.strokeStyle = m.brim; ctx.lineWidth = rad * 0.26; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - rad * 0.85, y - rad * 0.8); ctx.lineTo(x + rad * 0.85, y - rad * 0.8); ctx.stroke();
          ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(x, y - rad * 1.08, rad * 0.1, 0, Math.PI * 2); ctx.fill();
        }
      }
      if (fr) {   // cara asustada
        ctx.fillStyle = blink ? '#2e45d4' : '#fff';
        ctx.beginPath(); ctx.arc(x - rad * 0.33, y - rad * 0.2, rad * 0.13, 0, Math.PI * 2); ctx.arc(x + rad * 0.33, y - rad * 0.2, rad * 0.13, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1.5; ctx.beginPath();
        for (i = 0; i <= 4; i++) ctx.lineTo(x - rad * 0.5 + rad * 0.25 * i, y + rad * 0.3 + (i % 2 ? rad * 0.15 : 0));
        ctx.stroke();
        return;
      }
      for (s = -1; s <= 1; s += 2) {   // ojos (miran hacia donde van)
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x + s * rad * 0.36, y - rad * 0.2, rad * 0.22, rad * 0.27, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1d3a8a'; ctx.beginPath(); ctx.arc(x + s * rad * 0.36 + d.x * rad * 0.1, y - rad * 0.2 + d.y * rad * 0.1, rad * 0.12, 0, Math.PI * 2); ctx.fill();
      }
    }
    function drawHUD(now) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, W, HUD_H);
      drawMeat(ctx, 18, 20, 5.5);
      ctx.fillStyle = th.accent2; ctx.font = 'bold 17px ' + FONT; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillText(String(score), 34, 21);
      for (var i = 0; i < 3; i++) { ctx.save(); ctx.globalAlpha = i < lives ? 1 : 0.2; ctx.translate(W / 2 - 26 + i * 26, 25); drawHat(9); ctx.restore(); }
      var left = Math.max(0, Math.ceil((durationMs - (now - t0)) / 1000));
      ctx.textAlign = 'right'; ctx.fillStyle = left <= 10 ? th.accent : th.text; ctx.fillText(left + ' s', W - 12, 21);
    }
    function drawOverlay() {
      var msg = null, sub = [], big = false, dim = false;
      if (phase === 'countdown') { msg = String(3 - Math.floor(phaseT / 0.65)); big = true; dim = true; sub = ['Luffy come carne']; }
      else if (phase === 'play' && gameTime < yaUntil) { msg = '¡Ya!'; big = true; }
      else if (phase === 'ready') { msg = '¡Vamos!'; big = true; }
      else if (phase === 'over') { dim = true; if (wonFlag) { msg = '¡Toda la carne!'; sub = ['¡Has comido toda la carne!', 'Puntos: ' + score]; } else { msg = '¡Fin!'; sub = ['Puntos: ' + score]; } }
      pops.forEach(function (p) {   // textos flotantes
        var kk = 1 - (p.until - gameTime) / 0.9;
        ctx.font = 'bold 14px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.globalAlpha = 1 - kk * 0.6;
        ctx.fillText(p.text, p.x * T, HUD_H + p.y * T - 10 - kk * 14); ctx.globalAlpha = 1;
      });
      if (!msg) return;
      if (dim) { ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, HUD_H, W, H - HUD_H); }
      var cy = HUD_H + (H - HUD_H) / 2, pulse = big ? 1 + 0.25 * Math.max(0, 1 - (phaseT % 0.65) / 0.25) : 1;
      ctx.save(); ctx.translate(W / 2, cy); ctx.scale(pulse, pulse);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.fillStyle = big ? th.accent2 : '#fff'; ctx.font = 'bold ' + (big ? 64 : 36) + 'px ' + FONT;
      ctx.strokeText(msg, 0, 0); ctx.fillText(msg, 0, 0); ctx.restore();
      ctx.font = 'bold 16px ' + FONT; ctx.fillStyle = th.text; ctx.textAlign = 'center';
      sub.forEach(function (line, i) { ctx.fillText(line, W / 2, cy + 48 + i * 22); });
    }
    function render(now) {
      ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
      ctx.drawImage(layer, 0, 0, layer.width, layer.height, 0, 0, W, H);
      drawDots(now);
      marines.forEach(function (m) { drawMarine(m, now); });
      drawLuffy();
      drawHUD(now);
      drawOverlay();
    }

    // ---------- Bucle: paso fijo para la lógica, dibujo por frame ----------
    var last = t0, acc = 0;
    function frame(now) {
      raf = requestAnimationFrame(frame);
      var dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now; acc += dt;
      while (acc >= STEP && !ended) { update(STEP); acc -= STEP; }
      if (ended) return;
      if (phase !== 'over' && now - t0 >= durationMs) finish(false);   // tope de tiempo
      render(now);
    }
    resize(); resetPositions();
    raf = requestAnimationFrame(frame);
    capTimer = setTimeout(function () { finish(false); }, durationMs + 60);   // respaldo si la pestaña se queda en segundo plano
    return { stop: function () { if (ended) return; clearTimeout(overTimer); endNow(); } };
  }

  window.MiniGames.pacman = { id: 'pacman', title: 'Luffy come carne', world: 'onepiece', start: start };
})();
