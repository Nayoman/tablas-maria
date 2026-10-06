/* ============================================================================
   Bloques Hashira — minijuego Tetris con tema Demon Slayer (Kimetsu no Yaiba)
   Recompensa entre rondas de tablas de multiplicar. Módulo autónomo, sin
   dependencias ni red: window.MiniGames.tetris.start(container, opts) → { stop() }
   ============================================================================ */
(function () {
  'use strict';

  window.MiniGames = window.MiniGames || {};

  // ---------- Constantes de juego y de dibujo ----------
  const COLS = 10, ROWS = 20;
  const W = 360, H = 540;                   // tamaño lógico del canvas (retrato)
  const CELL = 24;                          // lado de cada celda (px lógicos)
  const BX = 10, BY = 44;                   // esquina superior izquierda del tablero
  const BW = COLS * CELL, BH = ROWS * CELL;
  const PX = BX + BW + 12, PW = W - PX - 8; // panel lateral (siguiente pieza, marcadores)
  const PANEL_Y = [56, 170, 240, 310, 380]; // alto de cada etiqueta del panel
  const FONT = '-apple-system, "SF Pro Text", "Segoe UI", Roboto, sans-serif';
  const LOCK_DELAY = 400, CLEAR_MS = 250, END_MS = 1300, SOFT_MS = 50;
  const DAS = 170, ARR = 50;                // auto-repetición al mantener ◀ ▶
  const GRAVITY = [800, 700, 600, 500, 420, 340, 260, 180]; // ms por fila, nivel 1..8 (tope)
  const LINE_POINTS = [0, 100, 300, 500, 800];
  const COUNTDOWN = [['3', 600], ['2', 600], ['1', 600], ['¡Ya!', 350]];
  const WATER = '79,195,247';               // azul "Respiración del Agua"

  // Piezas: forma en caja N×N (giran sobre su centro) y personaje que las viste
  const PIECES = [
    { name: 'Tanjiro', color: '#1E6F50', dark: '#111111', pattern: 'checker', shape: [[0, 1, 0], [1, 1, 1], [0, 0, 0]] }, // T
    { name: 'Nezuko',  color: '#F4A6C8', shape: [[1, 1], [1, 1]] },                                                        // O
    { name: 'Zenitsu', color: '#F7D22E', pattern: 'tri', shape: [[1, 1, 0], [0, 1, 1], [0, 0, 0]] },                        // Z
    { name: 'Shinobu', color: '#8E44AD', shape: [[0, 1, 1], [1, 1, 0], [0, 0, 0]] },                                       // S
    { name: 'Inosuke', color: '#6B8CA3', shape: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]] },                 // I
    { name: 'Giyu',    color: '#1F3A93', shape: [[1, 0, 0], [1, 1, 1], [0, 0, 0]] },                                       // J
    { name: 'Rengoku', color: '#FF5A1F', shape: [[0, 0, 1], [1, 1, 1], [0, 0, 0]] }                                        // L
  ];
  // Desplazamientos que se prueban al girar junto a una pared o el suelo
  const KICKS = [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1], [-1, -1], [1, -1]];

  // ---------- Utilidades puras ----------
  function rotateCW(m) {
    const n = m.length, r = [];
    for (let y = 0; y < n; y++) { r[y] = []; for (let x = 0; x < n; x++) r[y][x] = m[n - 1 - x][y]; }
    return r;
  }
  function eachCell(shape, fn) {
    for (let y = 0; y < shape.length; y++) for (let x = 0; x < shape.length; x++) if (shape[y][x]) fn(x, y);
  }
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function css(el, st) { for (const k in st) el.style[k] = st[k]; }
  function hexA(hex, a) {   // '#rrggbb' → 'rgba(r,g,b,a)'; si no es hex, devuelve el color tal cual
    const m = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function roundRect(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function tri(c, cx, top, s) {
    c.beginPath(); c.moveTo(cx, top); c.lineTo(cx + s, top + s * 1.3); c.lineTo(cx - s, top + s * 1.3); c.closePath(); c.fill();
  }
  // Celda con bisel; fantasma = solo contorno
  function drawCell(c, x, y, s, t, ghost) {
    const p = PIECES[t], w = s - 2; x += 1; y += 1;
    if (ghost) {
      c.strokeStyle = hexA(p.color, 0.8); c.lineWidth = 2; c.setLineDash([3, 2]);
      c.strokeRect(x + 1.5, y + 1.5, w - 3, w - 3); c.setLineDash([]);
      return;
    }
    c.fillStyle = p.color; c.fillRect(x, y, w, w);
    if (p.pattern === 'checker') {        // haori de Tanjiro: cuadros verde/negro
      const h = w / 2; c.fillStyle = p.dark; c.fillRect(x, y, h, h); c.fillRect(x + h, y + h, h, h);
    } else if (p.pattern === 'tri') {     // haori de Zenitsu: triángulos (escamas)
      c.fillStyle = 'rgba(255,255,255,0.85)';
      tri(c, x + w * 0.5, y + w * 0.1, w * 0.24); tri(c, x + w * 0.2, y + w * 0.55, w * 0.2); tri(c, x + w * 0.8, y + w * 0.55, w * 0.2);
    }
    c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(x + 3, y + 3, w - 6, (w - 6) / 2); // brillo suave
    c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(x, y, w, 2); c.fillRect(x, y, 2, w);  // bisel claro
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(x, y + w - 2, w, 2); c.fillRect(x + w - 2, y, 2, w); // bisel oscuro
  }

  // ---------- Partida ----------
  function start(container, opts) {
    opts = opts || {};
    const DEF = { accent: '#1E6F50', accent2: '#F4A6C8', bg: '#0f0f1a', text: '#fff' };
    const theme = {};
    for (const k in DEF) theme[k] = (opts.theme && opts.theme[k]) || DEF[k];
    const durationMs = (typeof opts.durationMs === 'number' && opts.durationMs > 0) ? opts.durationMs : 90000;
    const cdTotal = COUNTDOWN.reduce((s, c) => s + c[1], 0);

    // Estado
    let board = Array.from({ length: ROWS }, () => new Array(COLS).fill(0)); // 0 = vacío, n = pieza n-1
    let bag = [], cur = null, nextType = 0;
    let score = 0, lines = 0, level = 1;
    let state = 'countdown', stateT = 0;  // estado y ms dentro de él
    let playT = 0, gravAcc = 0, lockT = 0, soft = false, clearRows = [];
    let ended = false, rafId = 0, lastTs = 0, scale = 1, dpr = 1, bgLayer = null;
    const listeners = [], releases = [];

    function on(el, type, fn, o) { el.addEventListener(type, fn, o); listeners.push([el, type, fn, o]); }
    function sfx(n) { try { if (opts.sfx && typeof opts.sfx.play === 'function') opts.sfx.play(n); } catch (_) { /* silencio */ } }
    function vibrate(ms) { try { if (typeof opts.vibrate === 'function') opts.vibrate(ms); } catch (_) { /* silencio */ } }
    function addScore(n) {
      if (!n) return;
      score += n;
      try { if (typeof opts.onScore === 'function') opts.onScore(score); } catch (_) { /* silencio */ }
    }

    // ---------- DOM (estilos en línea; nada global) ----------
    const wrap = document.createElement('div');
    css(wrap, { position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      background: theme.bg, color: theme.text, fontFamily: FONT, touchAction: 'none', userSelect: 'none',
      webkitUserSelect: 'none', webkitTouchCallout: 'none', webkitTapHighlightColor: 'transparent', overflow: 'hidden', boxSizing: 'border-box' });
    const area = document.createElement('div');
    css(area, { flex: '1 1 auto', minHeight: '0', display: 'flex', alignItems: 'center', justifyContent: 'center' });
    const canvas = document.createElement('canvas');
    css(canvas, { display: 'block', touchAction: 'none' });
    const ctx = canvas.getContext('2d');
    const bar = document.createElement('div');
    css(bar, { flex: '0 0 auto', display: 'flex', gap: '6px', padding: '8px 8px 10px', boxSizing: 'border-box' });
    area.appendChild(canvas); wrap.appendChild(area); wrap.appendChild(bar); container.appendChild(wrap);

    // Botones táctiles: responden al tocar (pointerdown); ◀ ▶ repiten al mantener; ▼ baja mientras se mantiene.
    // Iconos en SVG en línea (no dependen de la fuente del móvil).
    const ICON = {
      left: '<path d="M16 4 5 12l11 8z"/>',
      right: '<path d="M8 4l11 8-11 8z"/>',
      rotate: '<path d="M19 12a7 7 0 1 1-2.05-4.95" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/><path d="M18 2.5v6.5h-6.5z"/>',
      down: '<path d="M4 8h16l-8 11z"/>',
      drop: '<path d="M12 3v11" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/><path d="M5.5 11h13L12 19z"/><path d="M5 22h14" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/>'
    };
    function makeButton(icon, aria, bg, fg, kind, act) {
      const b = document.createElement('button');
      b.type = 'button'; b.tabIndex = -1; b.setAttribute('aria-label', aria);
      b.innerHTML = '<svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor" aria-hidden="true" style="display:block;margin:0 auto;pointer-events:none">' + ICON[icon] + '</svg>';
      css(b, { flex: '1 1 0', minWidth: '56px', height: '64px', border: '0', borderRadius: '16px', background: bg, color: fg,
        padding: '0', margin: '0', outline: 'none', cursor: 'pointer', appearance: 'none', webkitAppearance: 'none',
        touchAction: 'none', userSelect: 'none', webkitUserSelect: 'none', webkitTapHighlightColor: 'transparent',
        boxShadow: 'inset 0 -4px 0 rgba(0,0,0,0.28), 0 2px 6px rgba(0,0,0,0.4)' });
      let timer = 0, held = false;
      const release = () => {
        if (!held) return;
        held = false; clearTimeout(timer); css(b, { transform: '', filter: '' });
        if (kind === 'hold') act(false);
      };
      on(b, 'pointerdown', (e) => {
        e.preventDefault();
        if (held) return;
        held = true; css(b, { transform: 'translateY(2px)', filter: 'brightness(1.15)' });
        try { b.setPointerCapture(e.pointerId); } catch (_) { /* sin captura */ }
        if (kind === 'hold') { act(true); return; }
        act();
        if (kind === 'repeat') timer = setTimeout(function rep() { act(); timer = setTimeout(rep, ARR); }, DAS);
      });
      on(b, 'pointerup', release); on(b, 'pointercancel', release); on(b, 'lostpointercapture', release);
      releases.push(release); bar.appendChild(b);
    }
    makeButton('left', 'Mover a la izquierda', theme.accent, '#fff', 'repeat', () => move(-1));
    makeButton('right', 'Mover a la derecha', theme.accent, '#fff', 'repeat', () => move(1));
    makeButton('rotate', 'Girar', theme.accent2, '#1a1a1a', 'tap', () => rotate());
    makeButton('down', 'Bajar deprisa', theme.accent, '#fff', 'hold', (v) => { soft = v; if (v) stepDown(1); });
    makeButton('drop', 'Soltar', theme.accent2, '#1a1a1a', 'tap', () => hardDrop());
    const releaseAll = () => { releases.forEach((r) => r()); soft = false; };
    on(window, 'pointerup', releaseAll); on(window, 'blur', releaseAll);

    // Sin scroll, zoom ni menú contextual dentro del juego
    const swallow = (e) => { e.preventDefault(); };
    on(wrap, 'touchstart', swallow, { passive: false }); on(wrap, 'touchmove', swallow, { passive: false });
    on(wrap, 'touchend', swallow, { passive: false }); on(wrap, 'contextmenu', swallow);

    // Gestos sobre el tablero: toque = girar, arrastre horizontal = mover (1 columna / 30 px),
    // arrastre hacia abajo = bajar (1 fila / 30 px), deslizar abajo rápido = soltar
    let g = null;
    on(canvas, 'pointerdown', (e) => {
      e.preventDefault();
      if (g) return;
      g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY, t0: performance.now(), axis: null, accX: 0, accY: 0 };
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* sin captura */ }
    });
    on(canvas, 'pointermove', (e) => {
      if (!g || e.pointerId !== g.id) return;
      e.preventDefault();
      const dx = e.clientX - g.lx, dy = e.clientY - g.ly; g.lx = e.clientX; g.ly = e.clientY;
      if (!g.axis) {
        const ax = Math.abs(e.clientX - g.x0), ay = Math.abs(e.clientY - g.y0);
        if (ax < 8 && ay < 8) return;
        g.axis = ax >= ay ? 'x' : 'y'; g.accX = e.clientX - g.x0; g.accY = e.clientY - g.y0;
      } else { g.accX += dx; g.accY += dy; }
      if (g.axis === 'x') {
        while (g.accX >= 30) { move(1); g.accX -= 30; }
        while (g.accX <= -30) { move(-1); g.accX += 30; }
      } else {
        g.accY = Math.max(0, g.accY);
        while (g.accY >= 30) { stepDown(1); g.accY -= 30; }
      }
    });
    on(canvas, 'pointerup', (e) => {
      if (!g || e.pointerId !== g.id) return;
      const dt = performance.now() - g.t0, dy = e.clientY - g.y0;
      if (!g.axis && dt < 350) rotate();
      else if (g.axis === 'y' && dy >= 50 && dt <= 350) hardDrop();
      g = null;
    });
    on(canvas, 'pointercancel', (e) => { if (g && e.pointerId === g.id) g = null; });

    // Teclado (escritorio)
    on(window, 'keydown', (e) => {
      const k = e.key;
      if (k === 'ArrowLeft') move(-1);
      else if (k === 'ArrowRight') move(1);
      else if (k === 'ArrowUp' || k === 'x' || k === 'X') { if (!e.repeat) rotate(); }
      else if (k === 'ArrowDown') { if (!e.repeat) { soft = true; stepDown(1); } }
      else if (k === ' ' || k === 'Spacebar') { if (!e.repeat) hardDrop(); }
      else return;
      e.preventDefault();
    });
    on(window, 'keyup', (e) => { if (e.key === 'ArrowDown') soft = false; });

    // ---------- Tamaño: encaja en la zona libre manteniendo proporción, nítido en pantallas retina ----------
    function resize() {
      const aw = area.clientWidth || container.clientWidth || W;
      const ah = area.clientHeight || Math.max(240, (container.clientHeight || 0) - bar.offsetHeight) || H;
      scale = Math.min(aw / W, ah / H);
      if (!(scale > 0)) scale = 1;
      dpr = window.devicePixelRatio || 1;
      canvas.style.width = Math.floor(W * scale) + 'px'; canvas.style.height = Math.floor(H * scale) + 'px';
      canvas.width = Math.round(W * scale * dpr); canvas.height = Math.round(H * scale * dpr);
      bgLayer = null; // la capa fija se repinta en el siguiente fotograma
    }
    on(window, 'resize', resize);
    const ro = (typeof ResizeObserver === 'function') ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(container);

    // ---------- Lógica ----------
    function takeFromBag() { if (!bag.length) bag = shuffle([0, 1, 2, 3, 4, 5, 6]); return bag.shift(); }
    function collides(shape, px, py) {
      for (let y = 0; y < shape.length; y++) for (let x = 0; x < shape.length; x++) {
        if (!shape[y][x]) continue;
        const bx = px + x, by = py + y;
        if (bx < 0 || bx >= COLS || by >= ROWS) return true;
        if (by >= 0 && board[by][bx]) return true;
      }
      return false;
    }
    function spawn() {
      const t = nextType; nextType = takeFromBag();
      const shape = PIECES[t].shape.map((r) => r.slice());
      cur = { t, shape, x: Math.floor((COLS - shape.length) / 2), y: shape.length === 4 ? -1 : 0 };
      gravAcc = 0; lockT = 0; soft = false;
      if (collides(cur.shape, cur.x, cur.y)) { cur = null; gameOver(); }
    }
    function move(dx) {
      if (state !== 'play' || !cur) return;
      if (!collides(cur.shape, cur.x + dx, cur.y)) { cur.x += dx; lockT = 0; }
    }
    function rotate() {
      if (state !== 'play' || !cur) return;
      const r = rotateCW(cur.shape);
      for (let i = 0; i < KICKS.length; i++) {
        const k = KICKS[i];
        if (!collides(r, cur.x + k[0], cur.y + k[1])) { cur.shape = r; cur.x += k[0]; cur.y += k[1]; lockT = 0; return; }
      }
    }
    function stepDown(points) {
      if (state !== 'play' || !cur || collides(cur.shape, cur.x, cur.y + 1)) return false;
      cur.y++; addScore(points); return true;
    }
    function hardDrop() {
      if (state !== 'play' || !cur) return;
      let n = 0;
      while (stepDown(0)) n++;
      addScore(n * 2); sfx('whoosh'); vibrate(15); lockPiece(true);
    }
    function lockPiece(fromHard) {
      let topOut = false;
      eachCell(cur.shape, (x, y) => { const by = cur.y + y; if (by < 0) topOut = true; else board[by][cur.x + x] = cur.t + 1; });
      cur = null;
      if (topOut) { gameOver(); return; }
      if (!fromHard) sfx('coin');
      const full = [];
      for (let y = 0; y < ROWS; y++) if (board[y].every((v) => v)) full.push(y);
      if (full.length) { clearRows = full; state = 'clearing'; stateT = 0; sfx('slash'); vibrate(30); }
      else spawn();
    }
    function finishClear() {
      const n = clearRows.length;
      board = board.filter((_, y) => clearRows.indexOf(y) < 0);
      while (board.length < ROWS) board.unshift(new Array(COLS).fill(0));
      clearRows = []; lines += n; addScore(LINE_POINTS[n] * level);
      level = 1 + Math.floor(lines / 8);
      state = 'play'; stateT = 0; spawn();
    }
    function gravityMs() { return GRAVITY[Math.min(level, GRAVITY.length) - 1]; }
    function updatePlay(dt) {
      if (!cur) return;
      if (collides(cur.shape, cur.x, cur.y + 1)) {       // apoyada: cuenta el retardo de bloqueo
        gravAcc = 0; lockT += dt;
        if (lockT >= LOCK_DELAY) lockPiece(false);
        return;
      }
      lockT = 0;
      const iv = soft ? Math.min(SOFT_MS, gravityMs()) : gravityMs();
      gravAcc += dt;
      while (gravAcc >= iv && stepDown(soft ? 1 : 0)) gravAcc -= iv;
      if (gravAcc >= iv) gravAcc = 0;
    }
    function gameOver() {
      if (state === 'over' || ended) return;
      state = 'over'; stateT = 0; soft = false; cur = null;
      const won = lines >= 10;
      sfx(won ? 'win' : 'lose'); vibrate(won ? 60 : 120);
    }
    function update(dt) {
      stateT += dt;
      if (state === 'countdown') {
        if (stateT >= cdTotal) { state = 'play'; stateT = 0; spawn(); }
      } else if (state === 'play' || state === 'clearing') {
        playT += dt;
        if (playT >= durationMs) { if (state === 'clearing') finishClear(); gameOver(); return; }
        if (state === 'play') updatePlay(dt);
        else if (stateT >= CLEAR_MS) finishClear();
      } else if (state === 'over' && stateT >= END_MS) finish();
    }

    // ---------- Dibujo ----------
    function paintStatic() {   // capa fija: fondo, título, marco, rejilla y etiquetas
      bgLayer = document.createElement('canvas'); bgLayer.width = canvas.width; bgLayer.height = canvas.height;
      const c = bgLayer.getContext('2d'); c.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
      c.fillStyle = theme.bg; c.fillRect(0, 0, W, H);
      const halo = c.createRadialGradient(W * 0.4, H * 0.5, 10, W * 0.4, H * 0.5, 380);
      halo.addColorStop(0, hexA(theme.accent, 0.22)); halo.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = halo; c.fillRect(0, 0, W, H);
      c.textBaseline = 'middle'; c.textAlign = 'left';
      c.fillStyle = theme.accent2; c.font = 'bold 20px ' + FONT; c.fillText('Bloques Hashira', BX + 2, 22);
      c.fillStyle = '#e53935'; c.font = 'bold 22px ' + FONT; c.textAlign = 'right'; c.fillText('滅', W - 10, 22);
      c.save(); c.shadowColor = theme.accent2; c.shadowBlur = 14; c.strokeStyle = theme.accent2; c.lineWidth = 2;
      roundRect(c, BX - 3, BY - 3, BW + 6, BH + 6, 8); c.stroke(); c.restore();
      c.fillStyle = 'rgba(255,255,255,0.04)'; c.fillRect(BX, BY, BW, BH);
      c.strokeStyle = 'rgba(255,255,255,0.07)'; c.lineWidth = 1; c.beginPath();
      for (let x = 1; x < COLS; x++) { c.moveTo(BX + x * CELL + 0.5, BY); c.lineTo(BX + x * CELL + 0.5, BY + BH); }
      for (let y = 1; y < ROWS; y++) { c.moveTo(BX, BY + y * CELL + 0.5); c.lineTo(BX + BW, BY + y * CELL + 0.5); }
      c.stroke();
      c.textAlign = 'left'; c.fillStyle = 'rgba(255,255,255,0.55)'; c.font = 'bold 11px ' + FONT;
      ['SIGUIENTE', 'PUNTOS', 'LÍNEAS', 'NIVEL', 'TIEMPO'].forEach((t, i) => c.fillText(t, PX, PANEL_Y[i]));
      roundRect(c, PX, 66, PW, 72, 8); c.fillStyle = 'rgba(255,255,255,0.06)'; c.fill();
      c.fillStyle = 'rgba(255,255,255,0.45)'; c.font = '11px ' + FONT;
      ['Toca: girar', 'Desliza: mover', 'Abajo rápido:', 'soltar'].forEach((t, i) => c.fillText(t, PX, 446 + i * 15));
    }
    function drawPanel() {
      const p = PIECES[nextType], sh = p.shape, n = sh.length;
      let x0 = n, x1 = -1, y0 = n, y1 = -1;
      eachCell(sh, (x, y) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); });
      const m = 15, ox = PX + (PW - (x1 - x0 + 1) * m) / 2, oy = 66 + (72 - (y1 - y0 + 1) * m) / 2;
      eachCell(sh, (x, y) => drawCell(ctx, ox + (x - x0) * m, oy + (y - y0) * m, m, nextType, false));
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = theme.text; ctx.font = 'bold 13px ' + FONT; ctx.fillText(p.name, PX, 152);
      ctx.font = 'bold 24px ' + FONT;
      ctx.fillText(String(score), PX, PANEL_Y[1] + 24); ctx.fillText(String(lines), PX, PANEL_Y[2] + 24); ctx.fillText(String(level), PX, PANEL_Y[3] + 24);
      const secs = Math.max(0, Math.ceil((durationMs - playT) / 1000));
      ctx.fillStyle = (secs <= 10 && state !== 'countdown') ? '#ff5252' : theme.text;
      ctx.fillText(secs + ' s', PX, PANEL_Y[4] + 24);
    }
    function drawSlash(p) {   // filas en blanco + tajo de katana en diagonal con remolinos de agua
      ctx.save(); ctx.beginPath(); ctx.rect(BX, BY, BW, BH); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,' + (0.9 * (1 - p)).toFixed(3) + ')';
      clearRows.forEach((y) => ctx.fillRect(BX, BY + y * CELL, BW, CELL));
      if (p < 0.2) { ctx.fillStyle = 'rgba(' + WATER + ',' + (0.25 * (1 - p / 0.2)).toFixed(3) + ')'; ctx.fillRect(BX, BY, BW, BH); }
      const ax = BX - 40, ay = BY + BH + 40, bx = BX + BW + 40, by = BY - 40;
      const head = Math.min(1, p * 1.25), tail = Math.max(0, head - 0.45);
      const hx = ax + (bx - ax) * head, hy = ay + (by - ay) * head, tx = ax + (bx - ax) * tail, ty = ay + (by - ay) * tail;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(' + WATER + ',0.35)'; ctx.lineWidth = 22;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
      const grad = ctx.createLinearGradient(tx, ty, hx, hy);
      grad.addColorStop(0, 'rgba(' + WATER + ',0)'); grad.addColorStop(0.7, 'rgba(' + WATER + ',0.7)'); grad.addColorStop(1, '#ffffff');
      ctx.strokeStyle = grad; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.strokeStyle = 'rgba(160,225,255,' + (0.9 * (1 - p)).toFixed(3) + ')'; ctx.lineWidth = 3;
      for (let i = 0; i < 5; i++) {
        const q = tail + (head - tail) * (i / 5), side = i % 2 ? 1 : -1;
        const cx = ax + (bx - ax) * q + side * 16, cy = ay + (by - ay) * q + side * 12;
        ctx.beginPath(); ctx.arc(cx, cy, 7 + i * 3, 0.3 + p * 7, 4.6 + p * 7); ctx.stroke();
      }
      ctx.restore();
    }
    function drawCountdown() {
      let t = stateT, i = 0;
      while (i < COUNTDOWN.length - 1 && t >= COUNTDOWN[i][1]) { t -= COUNTDOWN[i][1]; i++; }
      const prog = Math.min(1, t / COUNTDOWN[i][1]);
      const mx = BX + BW / 2, my = BY + BH / 2;   // textos centrados sobre el tablero
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = theme.accent2; ctx.font = 'bold 18px ' + FONT; ctx.fillText('¡Prepárate, Hashira!', mx, my - 80);
      ctx.fillStyle = theme.text; ctx.font = 'bold ' + Math.round(100 - 28 * prog) + 'px ' + FONT;
      ctx.globalAlpha = 1 - 0.6 * prog; ctx.fillText(COUNTDOWN[i][0], mx, my); ctx.globalAlpha = 1;
    }
    function drawEnd() {
      const won = lines >= 10, mx = BX + BW / 2, my = BY + BH / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = theme.accent2; ctx.font = 'bold 54px ' + FONT; ctx.fillText('¡Fin!', mx, my - 60);
      ctx.fillStyle = theme.text; ctx.font = 'bold 26px ' + FONT; ctx.fillText('Puntos: ' + score, mx, my);
      ctx.fillStyle = won ? '#ffd54f' : 'rgba(255,255,255,0.75)'; ctx.font = '17px ' + FONT;
      ctx.fillText(won ? '¡Has ganado! ' + lines + ' líneas' : 'Líneas: ' + lines, mx, my + 42);
    }
    function draw() {
      if (!bgLayer) paintStatic();
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(bgLayer, 0, 0);
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (board[y][x]) drawCell(ctx, BX + x * CELL, BY + y * CELL, CELL, board[y][x] - 1, false);
      if (cur) {
        let gy = cur.y;
        while (!collides(cur.shape, cur.x, gy + 1)) gy++;
        if (gy !== cur.y) eachCell(cur.shape, (x, y) => { if (gy + y >= 0) drawCell(ctx, BX + (cur.x + x) * CELL, BY + (gy + y) * CELL, CELL, cur.t, true); });
        eachCell(cur.shape, (x, y) => { if (cur.y + y >= 0) drawCell(ctx, BX + (cur.x + x) * CELL, BY + (cur.y + y) * CELL, CELL, cur.t, false); });
      }
      if (state === 'clearing') drawSlash(Math.min(1, stateT / CLEAR_MS));
      drawPanel();
      if (state === 'countdown') drawCountdown();
      else if (state === 'over') drawEnd();
    }

    // ---------- Bucle, fin y limpieza ----------
    function frame(ts) {
      if (ended) return;
      rafId = requestAnimationFrame(frame);
      const dt = lastTs ? Math.min(100, ts - lastTs) : 16; lastTs = ts;
      update(dt);
      if (!ended) draw();
    }
    function cleanup() {
      cancelAnimationFrame(rafId);
      releases.forEach((r) => r());
      listeners.forEach((l) => l[0].removeEventListener(l[1], l[2], l[3]));
      listeners.length = 0;
      if (ro) ro.disconnect();
      while (container.firstChild) container.removeChild(container.firstChild);
    }
    function finish() {   // onEnd se llama EXACTAMENTE una vez, con el contenedor ya vacío
      if (ended) return;
      ended = true; cleanup();
      try { if (typeof opts.onEnd === 'function') opts.onEnd({ score, won: lines >= 10 }); } catch (_) { /* silencio */ }
    }

    nextType = takeFromBag();
    resize();
    rafId = requestAnimationFrame(frame);
    return { stop() { finish(); } };
  }

  window.MiniGames.tetris = { id: 'tetris', title: 'Bloques Hashira', world: 'demonslayer', start };
})();
