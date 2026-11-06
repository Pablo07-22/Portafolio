/* =====================================================================
   PABLO RUNNER - Endless runner en HTML5 Canvas + JavaScript puro.
   Sin librerías. Récord guardado en LocalStorage.

   Organización del archivo:
     1. Configuración y estado
     2. Sprites (pixel art generado por código)
     3. Fondo con parallax
     4. Generación de obstáculos y coleccionables
     5. Actualización (física, colisiones, puntaje)
     6. Dibujo
     7. Pantallas (inicio / partida / pausa / game over)
     8. Controles (teclado, táctil) y ciclo de vida
   ===================================================================== */
(() => {
    'use strict';

    const root = document.getElementById('game-root');
    const canvas = document.getElementById('game-canvas');
    if (!root || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const $ = id => document.getElementById(id);
    const el = {
        menu: $('gm-menu'), over: $('gm-over'), pause: $('gm-pause'),
        play: $('gm-play'), retry: $('gm-retry'), resume: $('gm-resume'),
        recMenu: $('gm-record-menu'), recOver: $('gm-record-over'),
        final: $('gm-final'), newRec: $('gm-new'), live: $('gm-live'),
        tJump: $('gt-jump'), tDuck: $('gt-duck'), tPause: $('gt-pause'), tStart: $('gt-start')
    };

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ac = new AbortController();            // permite quitar todos los eventos de una vez
    const opt = { signal: ac.signal };

    /* ---------------------------------------------------------------
       1. CONFIGURACIÓN Y ESTADO
       --------------------------------------------------------------- */
    const W = 800, H = 300;          // tamaño lógico del juego (se escala con CSS)
    const GROUND = 250;              // línea del suelo
    const U = 4;                     // tamaño de un "pixel" de los sprites
    const PLAYER_X = 90;
    const GRAVITY = 2400;            // px/s²
    const JUMP_V = -840;             // salto de ~147 px de alto y ~0.7 s en el aire
    const AIR_BOTTOM = 40;           // los obstáculos aéreos pasan 40 px sobre el suelo
    const BASE_SPEED = 380, MAX_EXTRA_SPEED = 520;
    const MAX_PARTICLES = 160;
    const KEY = 'pabloRunner.record';

    let state = 'menu';              // menu | playing | paused | over
    let rafId = null, lastTs = 0;
    let visible = false;             // la sección está en pantalla
    let record = loadRecord();

    const keys = { down: false };
    let jumpBuf = 0;

    let t, speed, scoreF, score, bgX, runT, distSince, nextGapPx, nextDef, lastKey;
    let player, obstacles, colls, particles, texts;
    let shakeT, flashT, crashT, overShown, newRecord, hudPulse, lastMilestone;

    const rand = (a, b) => a + Math.random() * (b - a);
    const lerp = (a, b, k) => a + (b - a) * k;

    function loadRecord() {
        try { return parseInt(localStorage.getItem(KEY), 10) || 0; } catch (e) { return 0; }
    }
    function saveRecord(v) {
        try { localStorage.setItem(KEY, String(v)); } catch (e) { /* modo privado: se ignora */ }
    }
    const pad = n => String(Math.floor(n)).padStart(5, '0');

    /* ---------------------------------------------------------------
       2. SPRITES (pixel art)
       --------------------------------------------------------------- */
    function fromMap(map, pal) {
        const w = Math.max(...map.map(r => r.length));
        const c = document.createElement('canvas');
        c.width = w * U; c.height = map.length * U;
        const g = c.getContext('2d');
        map.forEach((row, y) => {
            for (let x = 0; x < row.length; x++) {
                const k = row[x];
                if (k !== '.' && pal[k]) { g.fillStyle = pal[k]; g.fillRect(x * U, y * U, U, U); }
            }
        });
        return c;
    }
    function draw2d(wu, hu, fn) {
        const c = document.createElement('canvas');
        c.width = wu * U; c.height = hu * U;
        fn(c.getContext('2d'));
        return c;
    }
    const px = (g, x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x * U, y * U, w * U, h * U); };

    /* --- Robot programador --- */
    const ROBOT_PAL = { K: '#050b16', B: '#00a6ff', D: '#0b6fb0', G: '#00e5a8', Y: '#ffd25e' };
    const ROBOT_TOP = [
        '.....Y......',
        '.....K......',
        '..KKKKKKKK..',
        '.KBBBBBBBBK.',
        '.KBKKKKKKBK.',
        '.KBKGKKGKBK.',
        '.KBKKKKKKBK.',
        '.KBBBBBBBBK.',
        '..KKKKKKKK..',
        '.KDDDDDDDDK.',
        'KBKDDGGDDKBK',
        '.KKDDDDDDKK.'
    ];
    const LEGS = [
        ['.KBBK..KBBK.', '.KKKK..KKKK.'],   // piernas abiertas
        ['...KBBBBK...', '...KKKKKK...'],   // piernas juntas
        ['..KBBK.KBBK.', '..KKKK.KKKK.']    // intermedia
    ];
    const runFrames = LEGS.map(l => fromMap(ROBOT_TOP.concat(l), ROBOT_PAL));
    const RUN_SEQ = [0, 2, 1, 2];
    const jumpSprite = runFrames[0];

    const DUCK_TOP = [
        '...KKKKKKKK...',
        '..KBBBBBBBBK..',
        '..KBKKKKKKBK..',
        '..KBKGKKGKBK..',
        '.KBBBBBBBBBBK.',
        'KBKDDDGGDDDKBK',
        '.KKDDDDDDDDKK.'
    ];
    const duckFrames = [
        fromMap(DUCK_TOP.concat(['..KBBK..KBBK..']), ROBOT_PAL),
        fromMap(DUCK_TOP.concat(['...KBBBBBBK...']), ROBOT_PAL)
    ];

    /* --- Obstáculos --- */
    const BUG_MAP = [
        '..K......K..',
        '...K....K...',
        '..KKKKKKKK..',
        '.KRRRRRRRRK.',
        'KRRWKRRKWRRK',
        'KRRRRRRRRRRK',
        '.KRRKRRKRRK.'
    ];
    const bugFrames = pal => [
        fromMap(BUG_MAP.concat(['..K.K..K.K..']), pal),
        fromMap(BUG_MAP.concat(['.K..K..K..K.']), pal)
    ];
    const bugRed = bugFrames({ K: '#050b16', R: '#ff4d6d', W: '#ffffff' });
    const bugPurple = bugFrames({ K: '#050b16', R: '#b84dff', W: '#ffffff' });

    const DRONE_BODY = [
        '..KKKKKKKK..',
        '.KOOOOOOOOK.',
        'KOOWKOOKWOOK',
        '.KOOOOOOOOK.',
        '..KKKKKKKK..',
        '...K....K...'
    ];
    const DRONE_PAL = { K: '#050b16', O: '#ffb020', W: '#bfe9ff' };
    const droneFrames = [
        fromMap(['..WW....WW..', '.WWWW..WWWW.'].concat(DRONE_BODY), DRONE_PAL),
        fromMap(['............', '.WWW....WWW.'].concat(DRONE_BODY), DRONE_PAL)
    ];

    const serverSprite = draw2d(10, 16, g => {
        px(g, 0, 0, 10, 16, '#050b16'); px(g, 1, 1, 8, 14, '#1b2a4a');
        for (let i = 0; i < 3; i++) {
            const y = 2 + i * 4;
            px(g, 2, y, 6, 3, '#2a3f6a'); px(g, 2, y, 6, 1, '#3a5a96');
            px(g, 3, y + 1, 2, 1, '#0d1a2e');
            px(g, 6, y + 1, 1, 1, i === 1 ? '#ff4d6d' : '#00e5a8');
        }
        px(g, 3, 14, 4, 1, '#0d1a2e');
    });

    const dbSprite = draw2d(12, 14, g => {
        for (let d = 0; d < 3; d++) {
            const y = 1 + d * 4;
            px(g, 1, y, 10, 4, '#0b3a73'); px(g, 0, y + 1, 12, 3, '#0b3a73');
            px(g, 1, y + 1, 10, 2, '#2a8cff'); px(g, 2, y, 8, 1, '#7fc4ff'); px(g, 2, y + 3, 8, 1, '#1b64c4');
        }
        px(g, 2, 13, 8, 1, '#0b3a73');
    });

    const errorSprite = draw2d(14, 9, g => {
        px(g, 0, 0, 14, 9, '#050b16'); px(g, 1, 1, 12, 7, '#ff3b3b'); px(g, 1, 1, 12, 1, '#ff8a8a');
        g.fillStyle = '#fff'; g.font = 'bold 19px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('404', 7 * U, 5 * U + 1);
    });

    const codeSprite = draw2d(13, 11, g => {
        px(g, 0, 0, 13, 11, '#00e5a8'); px(g, 1, 1, 11, 9, '#0d1a2e');
        px(g, 2, 2, 1, 1, '#ff4d6d'); px(g, 4, 2, 1, 1, '#ffd25e'); px(g, 6, 2, 1, 1, '#00e5a8');
        g.fillStyle = '#00e5a8'; g.font = 'bold 17px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('</>', 6.5 * U, 6.6 * U);
    });

    const techSprite = draw2d(10, 15, g => {
        for (let i = 0; i < 2; i++) {
            const y0 = i * 8;
            px(g, 1, y0, 8, 7, '#3b2a8c'); px(g, 2, y0 + 1, 6, 5, '#7c5cff'); px(g, 4, y0 + 2, 2, 3, '#bda8ff');
            for (let k = 0; k < 3; k++) { px(g, 0, y0 + 1 + k * 2, 1, 1, '#c9d6ea'); px(g, 9, y0 + 1 + k * 2, 1, 1, '#c9d6ea'); }
        }
    });

    const popupSprite = draw2d(16, 8, g => {
        px(g, 0, 0, 16, 8, '#050b16'); px(g, 1, 1, 14, 6, '#0d1a2e'); px(g, 1, 1, 14, 2, '#ff3b3b');
        px(g, 13, 1, 1, 1, '#fff');
        g.textBaseline = 'middle'; g.textAlign = 'left';
        g.fillStyle = '#ffd25e'; g.font = 'bold 16px monospace'; g.fillText('!', 3 * U + 2, 5.2 * U);
        g.fillStyle = '#ff8a9b'; g.font = 'bold 11px monospace'; g.fillText('ERROR', 7 * U - 2, 5.4 * U);
    });

    /* Definición de obstáculos.
       hit = recorte [izq, arriba, der, abajo] para que la colisión sea justa.
       vx  = velocidad extra hacia el jugador (comportamiento distinto).
       min = segundos de partida a partir de los cuales puede aparecer. */
    const DEFS = [
        { key: 'bug',    frames: bugRed,       w: 48, h: 32, hit: [8, 8, 8, 0],  vx: 0,   min: 0,  weight: 3,   air: false },
        { key: 'server', frames: [serverSprite], w: 40, h: 64, hit: [6, 4, 6, 0],  vx: 0,   min: 0,  weight: 2,   air: false },
        { key: 'db',     frames: [dbSprite],   w: 48, h: 56, hit: [7, 4, 7, 0],  vx: 0,   min: 0,  weight: 2,   air: false },
        { key: 'error',  frames: [errorSprite], w: 56, h: 36, hit: [4, 4, 4, 0],  vx: 0,   min: 3,  weight: 2,   air: false },
        { key: 'code',   frames: [codeSprite], w: 52, h: 44, hit: [4, 4, 4, 0],  vx: 0,   min: 5,  weight: 2,   air: false },
        { key: 'tech',   frames: [techSprite], w: 40, h: 60, hit: [6, 4, 6, 0],  vx: 0,   min: 12, weight: 2,   air: false },
        { key: 'fastbug', frames: bugPurple,   w: 48, h: 32, hit: [8, 8, 8, 0],  vx: 120, min: 16, weight: 1.5, air: false },
        { key: 'drone',  frames: droneFrames,  w: 48, h: 32, hit: [8, 6, 8, 6],  vx: 80,  min: 8,  weight: 2,   air: true },
        { key: 'popup',  frames: [popupSprite], w: 64, h: 32, hit: [4, 4, 4, 4],  vx: 0,   min: 14, weight: 1.5, air: true }
    ];

    const starSprite = fromMap([
        '....Y....', '....Y....', '...YYY...', 'YYYYYYYYY', '.YYYYYYY.',
        '..YYYYY..', '..YYYYY..', '.YYY.YYY.', '.YY...YY.'
    ], { Y: '#ffd25e' });
    const SYMBOLS = ['</>', '{}', ';', '#', '()'];

    /* ---------------------------------------------------------------
       3. FONDO CON PARALLAX (se dibuja una sola vez en canvas "tile")
       --------------------------------------------------------------- */
    function tile(w, h, fn) {
        const c = document.createElement('canvas');
        c.width = w; c.height = h; fn(c.getContext('2d')); return c;
    }
    function skyline(color, minH, maxH, lit) {
        return tile(W, GROUND, g => {
            let x = 0;
            while (x < W) {
                let bw = Math.round(rand(30, 70));
                if (W - x < bw + 30) bw = W - x;      // el último edificio cierra el tile sin cortes
                const bh = Math.round(rand(minH, maxH));
                g.fillStyle = color; g.fillRect(x, GROUND - bh, bw, bh);
                for (let wy = GROUND - bh + 8; wy < GROUND - 8; wy += 12) {
                    for (let wx = x + 6; wx < x + bw - 8; wx += 10) {
                        if (Math.random() < 0.2) { g.fillStyle = lit[Math.floor(Math.random() * lit.length)]; g.fillRect(wx, wy, 4, 5); }
                    }
                }
                x += bw;
            }
        });
    }
    const layerFar = skyline('#0a1a35', 50, 120, ['rgba(0,166,255,.35)', 'rgba(0,229,168,.3)']);
    const layerMid = skyline('#0f2548', 30, 90, ['rgba(0,229,168,.55)', 'rgba(0,166,255,.5)', 'rgba(255,210,94,.4)']);
    const layerBinary = tile(W, 150, g => {
        g.font = '12px monospace'; g.fillStyle = 'rgba(0,229,168,.22)';
        for (let i = 0; i < 38; i++) g.fillText(Math.random() < 0.5 ? '0' : '1', Math.floor(rand(0, W - 8)), Math.floor(rand(12, 146)));
    });
    const groundTile = tile(W, H - GROUND, g => {
        g.fillStyle = '#09162b'; g.fillRect(0, 0, W, H - GROUND);
        g.fillStyle = '#00e5a8'; g.fillRect(0, 0, W, 2);
        g.fillStyle = 'rgba(0,166,255,.5)'; g.fillRect(0, 2, W, 2);
        g.fillStyle = '#12335c';
        for (let x = 0; x < W; x += 40) g.fillRect(x, 14, 18, 3);
        g.fillStyle = '#10294d';
        for (let i = 0; i < 22; i++) g.fillRect(Math.floor(rand(0, W - 6)), Math.floor(rand(22, 46)), 6, 3);
        g.font = '10px monospace'; g.fillStyle = 'rgba(0,229,168,.28)';
        ['01', '</>', '{}', '1010', ';', '0x'].forEach((s, i) => g.fillText(s, 60 + i * 125, 38));
    });
    let skyGrad = null;
    const sunTile = tile(120, 120, g => {          // sol retro con rayas
        const gr = g.createLinearGradient(0, 0, 0, 120);
        gr.addColorStop(0, '#00a6ff'); gr.addColorStop(1, '#00e5a8');
        g.fillStyle = gr; g.beginPath(); g.arc(60, 60, 54, 0, Math.PI * 2); g.fill();
        g.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < 6; i++) g.fillRect(0, 60 + i * 10, 120, 2 + i);
    });

    /* ---------------------------------------------------------------
       4. OBSTÁCULOS Y COLECCIONABLES
       --------------------------------------------------------------- */
    function chooseDef() {
        const pool = DEFS.filter(d => t >= d.min);
        const pickOne = () => {
            let total = 0; pool.forEach(d => total += d.weight);
            let r = Math.random() * total;
            for (const d of pool) { r -= d.weight; if (r <= 0) return d; }
            return pool[0];
        };
        let d = pickOne();
        if (d.key === lastKey && Math.random() < 0.6) d = pickOne();   // menos repetición
        lastKey = d.key;
        return d;
    }

    function addColl(kind, x, y) {
        const c = { kind, x, y, phase: Math.random() * 6, val: 10, w: 24, h: 24, sym: '' };
        if (kind === 'star') { c.val = 50; c.w = c.h = 27; }
        if (kind === 'sym')  { c.val = 25; c.w = 34; c.h = 22; c.sym = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]; }
        colls.push(c);
    }

    // Coleccionables colocados DENTRO del hueco entre obstáculos, nunca encima de ellos
    function spawnCollectibles(o, gapClear) {
        const r = Math.random();
        if (!o.def.air && o.def.h <= 64 && r < 0.35) {          // arco de monedas sobre el obstáculo
            const cx = o.x + o.def.w / 2;
            for (let i = -1; i <= 1; i++) addColl('coin', cx + i * 34, GROUND - o.def.h - (i === 0 ? 70 : 48));
        } else if (r < 0.8 && gapClear > 200) {
            const mid = o.x + o.def.w + gapClear / 2;
            const k = Math.random();
            if (k < 0.4) {                                       // fila de monedas en el suelo
                const n = 3 + Math.floor(Math.random() * 3);
                for (let i = 0; i < n; i++) addColl('coin', mid + (i - (n - 1) / 2) * 32, GROUND - 28);
            } else if (k < 0.7) {                                // arco de monedas en el aire
                const hs = [80, 100, 110, 100, 80];
                for (let i = 0; i < 5; i++) addColl('coin', mid + (i - 2) * 32, GROUND - hs[i]);
            } else if (k < 0.85) {
                addColl('star', mid, GROUND - rand(110, 130));
            } else {
                addColl('sym', mid, GROUND - rand(40, 70));
            }
        }
    }

    function spawnObstacle() {
        const def = nextDef || chooseDef();
        const o = { def, x: W + 40, y: def.air ? GROUND - AIR_BOTTOM - def.h : GROUND - def.h, age: 0 };
        obstacles.push(o);
        nextDef = chooseDef();

        // Separación en TIEMPO: mínimo 1.05 s (siempre hay margen para reaccionar).
        // Con la dificultad el rango se reduce, así aparecen con más frecuencia.
        const diff = 1 - Math.exp(-t / 45);
        const timeGap = 1.05 + Math.random() * lerp(1.0, 0.45, diff);
        // Si el siguiente es más rápido que el mundo, se le suma distancia para que no alcance al anterior
        const gapClear = speed * timeGap + (nextDef.vx ? nextDef.vx * 1.9 : 0);
        nextGapPx = def.w + gapClear;
        distSince = 0;
        spawnCollectibles(o, gapClear);
    }

    /* ---------------------------------------------------------------
       5. ACTUALIZACIÓN
       --------------------------------------------------------------- */
    function resetGame() {
        t = 0; speed = BASE_SPEED; scoreF = 0; score = 0; bgX = 0; runT = 0;
        player = { y: GROUND, vy: 0, onGround: true, duck: false };
        obstacles = []; colls = []; particles = []; texts = [];
        distSince = 0; nextGapPx = 0; nextDef = null; lastKey = '';
        shakeT = 0; flashT = 0; crashT = 0; overShown = false; newRecord = false;
        hudPulse = 0; lastMilestone = 0; jumpBuf = 0;
    }

    function emit(n, x, y, o) {
        for (let i = 0; i < n && particles.length < MAX_PARTICLES; i++) {
            particles.push({
                x, y, vx: rand(o.vx0, o.vx1), vy: rand(o.vy0, o.vy1), life: 0, max: rand(o.l0, o.l1),
                s: o.s || 3, c: o.colors[Math.floor(Math.random() * o.colors.length)], g: o.g || 0
            });
        }
    }
    const dust = () => emit(6, PLAYER_X + 24, GROUND, { vx0: -speed * 0.5 - 40, vx1: -speed * 0.2, vy0: -120, vy1: -20, l0: 0.25, l1: 0.5, s: 3, g: 300, colors: ['#93a8c4', '#4a5f80'] });

    function playerBox() {
        const d = player.duck;
        const w = d ? 40 : 28, h = d ? 24 : 48, left = PLAYER_X + (d ? 4 : 10);
        return { l: left, r: left + w, t: player.y - h, b: player.y };
    }
    const hitBox = o => ({ l: o.x + o.def.hit[0], t: o.y + o.def.hit[1], r: o.x + o.def.w - o.def.hit[2], b: o.y + o.def.h - o.def.hit[3] });
    const overlap = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;

    function updateBackground(dt, s) { bgX += s * dt; }

    function updateParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.life += dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
            if (p.life >= p.max) { particles[i] = particles[particles.length - 1]; particles.pop(); }
        }
        for (let i = texts.length - 1; i >= 0; i--) {
            const f = texts[i]; f.life += dt; f.y -= 40 * dt;
            if (f.life > 0.8) { texts[i] = texts[texts.length - 1]; texts.pop(); }
        }
        if (shakeT > 0) shakeT = Math.max(0, shakeT - dt);
        if (flashT > 0) flashT = Math.max(0, flashT - dt);
        if (hudPulse > 0) hudPulse = Math.max(0, hudPulse - dt);
    }

    function update(dt) {
        if (state === 'menu') {
            runT += dt * 12; updateBackground(dt, 160); return;
        }
        if (state === 'over') {
            crashT += dt; updateParticles(dt);
            if (!overShown && crashT > 0.7) { overShown = true; setScreen('over'); }
            return;
        }
        if (state !== 'playing') return;

        t += dt;
        const diff = 1 - Math.exp(-t / 45);               // 0 → 1 de forma suave
        speed = BASE_SPEED + MAX_EXTRA_SPEED * diff;      // la velocidad sube hasta un tope
        scoreF += speed * 0.03 * dt;
        score = Math.floor(scoreF);
        if (Math.floor(score / 500) > lastMilestone) { lastMilestone = Math.floor(score / 500); hudPulse = 0.6; }
        updateBackground(dt, speed);
        runT += dt * (9 + speed / 90);

        // --- Jugador ---
        if (jumpBuf > 0) {
            jumpBuf -= dt;
            if (player.onGround) {                      // salto (con pequeño buffer para que se sienta bien)
                player.vy = JUMP_V; player.onGround = false; jumpBuf = 0; dust();
            }
        }
        if (!player.onGround) {
            player.vy += GRAVITY * (keys.down ? 2.4 : 1) * dt;      // ↓ en el aire = caída rápida
            player.y += player.vy * dt;
            if (player.y >= GROUND) { player.y = GROUND; player.vy = 0; player.onGround = true; dust(); }
        }
        player.duck = keys.down && player.onGround;

        // --- Obstáculos ---
        distSince += speed * dt;
        if (distSince >= nextGapPx) spawnObstacle();
        for (let i = obstacles.length - 1; i >= 0; i--) {
            const o = obstacles[i];
            o.age += dt; o.x -= (speed + o.def.vx) * dt;
            if (o.x + o.def.w < -20) obstacles.splice(i, 1);
        }
        for (let i = colls.length - 1; i >= 0; i--) {
            colls[i].x -= speed * dt;
            if (colls[i].x < -60) colls.splice(i, 1);
        }

        // --- Colisiones (rectángulos recortados = hitbox justa) ---
        const pb = playerBox();
        for (const o of obstacles) {
            if (o.x > PLAYER_X + 90 || o.x + o.def.w < PLAYER_X - 10) continue;
            if (overlap(pb, hitBox(o))) { crash(pb); return; }
        }
        const pg = { l: pb.l - 6, r: pb.r + 6, t: pb.t - 6, b: pb.b + 6 };   // más permisivo al recoger
        for (let i = colls.length - 1; i >= 0; i--) {
            const c = colls[i];
            if (overlap(pg, { l: c.x - c.w / 2, r: c.x + c.w / 2, t: c.y - c.h / 2, b: c.y + c.h / 2 })) collect(c, i);
        }
        updateParticles(dt);
    }

    function collect(c, i) {
        scoreF += c.val; score = Math.floor(scoreF);
        const col = c.kind === 'star' ? '#ffd25e' : c.kind === 'sym' ? '#00e5a8' : '#ffd25e';
        emit(8, c.x, c.y, { vx0: -90, vx1: 90, vy0: -130, vy1: 30, l0: 0.25, l1: 0.5, s: 3, g: 200, colors: [col, '#ffffff'] });
        texts.push({ x: c.x, y: c.y - 10, s: '+' + c.val, life: 0, c: col });
        colls.splice(i, 1);
    }

    function crash(pb) {
        state = 'over'; crashT = 0; overShown = false;
        if (!reduceMotion) { shakeT = 0.45; flashT = 0.2; }
        emit(34, (pb.l + pb.r) / 2, (pb.t + pb.b) / 2, { vx0: -260, vx1: 260, vy0: -420, vy1: 80, l0: 0.5, l1: 1.1, s: 4, g: 1100, colors: ['#00a6ff', '#00e5a8', '#0b6fb0', '#ffd25e', '#ff4d6d'] });
        score = Math.floor(scoreF);
        newRecord = score > record;
        if (newRecord) { record = score; saveRecord(record); }
        keys.down = false;
        el.final.textContent = pad(score);
        el.recOver.textContent = pad(record);
        el.recMenu.textContent = pad(record);
        el.newRec.hidden = !newRecord;
        if (el.live) el.live.textContent = 'Game over. Puntuación ' + score + (newRecord ? '. Nuevo récord.' : '.');
        syncTouch();
    }

    /* ---------------------------------------------------------------
       6. DIBUJO
       --------------------------------------------------------------- */
    function tileX(img, off, y, factor) {
        const x = -Math.floor((off * factor) % W);
        ctx.drawImage(img, x, y); ctx.drawImage(img, x + W, y);
    }

    function drawBackground() {
        if (!skyGrad) {
            skyGrad = ctx.createLinearGradient(0, 0, 0, GROUND);
            skyGrad.addColorStop(0, '#050b16'); skyGrad.addColorStop(1, '#0f2a52');
        }
        ctx.fillStyle = skyGrad; ctx.fillRect(0, 0, W, GROUND);
        ctx.globalAlpha = 0.9; ctx.drawImage(sunTile, 620, 40); ctx.globalAlpha = 1;
        tileX(layerBinary, bgX, 20, 0.12);
        tileX(layerFar, bgX, 0, 0.1);
        tileX(layerMid, bgX, 0, 0.25);
        ctx.fillStyle = '#09162b'; ctx.fillRect(0, GROUND, W, H - GROUND);
        tileX(groundTile, bgX, GROUND, 1);
    }

    function drawPlayer() {
        const menu = state === 'menu';
        const x = menu ? 376 : PLAYER_X;
        let spr;
        if (state === 'over') {
            // animación de choque: parpadea y se "desintegra"
            if (crashT > 0.35) return;
            if (Math.floor(crashT * 24) % 2) return;
            spr = player.duck ? duckFrames[0] : jumpSprite;
        } else if (!menu && !player.onGround) spr = jumpSprite;
        else if (!menu && player.duck) spr = duckFrames[Math.floor(runT / 1.5) % 2];
        else spr = runFrames[RUN_SEQ[Math.floor(runT) % 4]];

        const feetY = menu ? GROUND : player.y;
        const lift = Math.max(0, GROUND - feetY);
        ctx.fillStyle = 'rgba(0,0,0,.4)';                         // sombra
        const sw = Math.max(14, 40 - lift * 0.15);
        ctx.fillRect(Math.round(x + 24 - sw / 2), GROUND + 2, Math.round(sw), 4);
        ctx.drawImage(spr, Math.round(x), Math.round(feetY - spr.height));
    }

    function drawCollectible(c) {
        const a = c.phase + performance.now() / 1000;
        if (c.kind === 'coin') {
            const sx = Math.max(0.18, Math.abs(Math.cos(a * 4)));
            ctx.save(); ctx.translate(Math.round(c.x), Math.round(c.y)); ctx.scale(sx, 1);
            ctx.fillStyle = '#b8860b'; ctx.fillRect(-9, -12, 18, 24); ctx.fillRect(-12, -9, 24, 18);
            ctx.fillStyle = '#ffd25e'; ctx.fillRect(-7, -10, 14, 20); ctx.fillRect(-10, -7, 20, 14);
            ctx.fillStyle = '#fff3b0'; ctx.fillRect(-4, -7, 3, 10);
            ctx.restore();
        } else if (c.kind === 'star') {
            const bob = Math.sin(a * 3) * 3;
            ctx.globalAlpha = 0.75 + 0.25 * Math.sin(a * 8);
            ctx.drawImage(starSprite, Math.round(c.x - 13.5), Math.round(c.y - 13.5 + bob), 27, 27);
            ctx.globalAlpha = 1;
        } else {
            const bob = Math.sin(a * 3) * 3;
            ctx.font = 'bold 18px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(0,229,168,.25)'; ctx.fillText(c.sym, c.x + 1, c.y + bob + 1);
            ctx.fillStyle = '#00e5a8'; ctx.fillText(c.sym, Math.round(c.x), Math.round(c.y + bob));
        }
    }

    function drawHUD() {
        const font = '"Press Start 2P", monospace';
        ctx.textBaseline = 'top'; ctx.font = '12px ' + font;
        const shown = state === 'menu' ? 0 : score;
        const rec = Math.max(record, shown);
        ctx.textAlign = 'left';
        ctx.fillStyle = hudPulse > 0 && Math.floor(hudPulse * 10) % 2 ? '#ffd25e' : '#e6f1ff';
        ctx.fillText('SCORE ' + pad(shown), 16, 14);
        ctx.textAlign = 'right';
        ctx.fillStyle = shown > record && record > 0 ? '#ffd25e' : '#00e5a8';
        ctx.fillText('REC ' + pad(rec), W - 16, 14);
        if (state === 'paused') {
            ctx.textAlign = 'center'; ctx.fillStyle = '#ffd25e';
            ctx.fillText('|| PAUSA', W / 2, 14);
        }
    }

    function draw() {
        ctx.save();
        if (shakeT > 0 && !reduceMotion) ctx.translate(rand(-1, 1) * 5 * (shakeT / 0.45), rand(-1, 1) * 5 * (shakeT / 0.45));
        drawBackground();
        if (state !== 'menu') {
            colls.forEach(drawCollectible);
            for (const o of obstacles) {
                const f = o.def.frames[o.def.frames.length > 1 ? Math.floor(o.age * 8) % o.def.frames.length : 0];
                const bob = o.def.air ? Math.round(Math.sin(o.age * 6) * 2) : 0;   // vuelo ondulante (solo visual)
                ctx.drawImage(f, Math.round(o.x), Math.round(o.y + bob));
            }
        }
        drawPlayer();
        for (const p of particles) {
            ctx.globalAlpha = Math.max(0, 1 - p.life / p.max); ctx.fillStyle = p.c;
            ctx.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
        }
        ctx.globalAlpha = 1;
        ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (const f of texts) { ctx.globalAlpha = 1 - f.life / 0.8; ctx.fillStyle = f.c; ctx.fillText(f.s, f.x, f.y); }
        ctx.globalAlpha = 1;
        ctx.restore();
        if (flashT > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (flashT / 0.2 * 0.45) + ')'; ctx.fillRect(0, 0, W, H); }
        drawHUD();
    }

    /* ---------------------------------------------------------------
       7. PANTALLAS Y CICLO DE JUEGO
       --------------------------------------------------------------- */
    function setScreen(name) {
        el.menu.hidden = name !== 'menu';
        el.over.hidden = name !== 'over';
        el.pause.hidden = name !== 'pause';
        syncTouch();
    }

    function syncTouch() {
        if (!el.tStart) return;
        el.tStart.textContent = state === 'menu' ? 'JUGAR' : state === 'over' ? 'VOLVER A JUGAR' : 'REINICIAR';
        el.tPause.textContent = state === 'paused' ? 'SEGUIR' : 'PAUSA';
        el.tPause.disabled = state !== 'playing' && state !== 'paused';
    }

    function focusGame() { try { root.focus({ preventScroll: true }); } catch (e) { root.focus(); } }

    function startGame() {
        resetGame();
        state = 'playing';
        focusGame();                      // primero movemos el foco, luego ocultamos el botón
        setScreen(null);
        if (el.live) el.live.textContent = 'Partida iniciada.';
        startLoop();
    }

    function pauseGame() {
        if (state !== 'playing') return;
        state = 'paused'; keys.down = false;
        setScreen('pause');
        draw();                           // deja dibujado el último fotograma
    }

    function resumeGame() {
        if (state !== 'paused') return;
        state = 'playing';
        focusGame();
        setScreen(null);
        startLoop();
    }

    function pressJump() {
        if (state === 'playing') jumpBuf = 0.12;
    }

    /* --- Ciclo con requestAnimationFrame: nunca hay dos a la vez --- */
    function frame(ts) {
        rafId = null;
        const dt = Math.min((ts - lastTs) / 1000, 0.033);   // delta time limitado (evita saltos al volver de otra pestaña)
        lastTs = ts;
        update(dt > 0 ? dt : 0);
        draw();
        if (rafId === null && visible && state !== 'paused') rafId = requestAnimationFrame(frame);
    }
    function startLoop() {
        if (rafId !== null || !visible) return;
        lastTs = performance.now();
        rafId = requestAnimationFrame(frame);
    }
    function stopLoop() {
        if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    }

    /* ---------------------------------------------------------------
       8. CONTROLES Y CICLO DE VIDA
       --------------------------------------------------------------- */
    const typing = e => { const n = e.target; return n && (n.tagName === 'INPUT' || n.tagName === 'TEXTAREA' || n.tagName === 'SELECT' || n.isContentEditable); };
    // El juego solo captura el teclado cuando el foco está dentro de su tarjeta.
    // Así ↑ ↓ y ESPACIO siguen moviendo la página con normalidad fuera del juego.
    const gameFocused = () => root.contains(document.activeElement);
    const GAME_KEYS = ['ArrowUp', 'ArrowDown', 'Space', 'KeyP'];

    window.addEventListener('keydown', e => {
        if (e.ctrlKey || e.metaKey || e.altKey || typing(e)) return;
        if (!GAME_KEYS.includes(e.code) || !gameFocused()) return;
        e.preventDefault();
        switch (e.code) {
            case 'ArrowUp': if (!e.repeat) pressJump(); break;        // sin repetición: no hay saltos múltiples
            case 'ArrowDown': keys.down = true; break;
            case 'KeyP': if (!e.repeat) { state === 'playing' ? pauseGame() : resumeGame(); } break;
            case 'Space':
                if (e.repeat) break;
                if (state === 'menu' || (state === 'over' && overShown)) startGame();
                else if (state === 'paused') resumeGame();
                break;
        }
    }, opt);

    window.addEventListener('keyup', e => {
        if (e.code === 'ArrowDown') keys.down = false;
        // evita que ESPACIO "haga clic" en el botón enfocado después de haber iniciado la partida
        if (e.code === 'Space' && gameFocused() && !typing(e)) e.preventDefault();
    }, opt);

    // Botones del juego
    el.play.addEventListener('click', startGame, opt);
    el.retry.addEventListener('click', startGame, opt);
    el.resume.addEventListener('click', resumeGame, opt);

    // Controles táctiles
    function hold(btn, on, off) {
        if (!btn) return;
        btn.addEventListener('pointerdown', e => {
            e.preventDefault();
            try { btn.setPointerCapture(e.pointerId); } catch (err) { /* no soportado */ }
            on();
        }, opt);
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(n => btn.addEventListener(n, off, opt));
    }
    hold(el.tJump, pressJump, () => {});
    hold(el.tDuck, () => { if (state === 'playing') keys.down = true; }, () => { keys.down = false; });
    if (el.tPause) el.tPause.addEventListener('click', () => { state === 'playing' ? pauseGame() : resumeGame(); }, opt);
    if (el.tStart) el.tStart.addEventListener('click', () => {
        if (state === 'over' && !overShown) return;
        startGame();
    }, opt);

    // Pausa automática si el jugador sale del juego (otro clic, otra pestaña, scroll fuera de la sección)
    root.addEventListener('focusout', () => {
        setTimeout(() => { if (state === 'playing' && !root.contains(document.activeElement)) pauseGame(); }, 0);
    }, opt);
    window.addEventListener('blur', () => pauseGame(), opt);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) { pauseGame(); stopLoop(); }
        else if (visible) startLoop();
    }, opt);

    const io = new IntersectionObserver(entries => {
        visible = entries[0].isIntersecting;
        if (visible) startLoop();
        else { pauseGame(); stopLoop(); }
    }, { threshold: 0.05 });
    io.observe(root);

    // Resolución nítida: el canvas se redibuja a un múltiplo entero del tamaño lógico
    function resize() {
        const cssW = canvas.clientWidth || W;
        const dpr = window.devicePixelRatio || 1;
        const s = Math.max(1, Math.round(cssW * dpr / W));
        if (canvas.width !== W * s) { canvas.width = W * s; canvas.height = H * s; }
        ctx.setTransform(s, 0, 0, s, 0, 0);
        ctx.imageSmoothingEnabled = cssW * dpr < W;      // al reducir se suaviza; al ampliar se mantiene el pixel art
        draw();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Guardar récord y liberar recursos al cerrar la página
    window.addEventListener('pagehide', e => {
        if (state === 'playing' && Math.floor(scoreF) > record) saveRecord(Math.floor(scoreF));
        if (!e.persisted) { stopLoop(); io.disconnect(); ro.disconnect(); ac.abort(); }
    });

    /* --- Inicio --- */
    resetGame();
    el.recMenu.textContent = pad(record);
    el.recOver.textContent = pad(record);
    setScreen('menu');
    resize();
    if (document.fonts && document.fonts.load) {
        document.fonts.load('12px "Press Start 2P"').then(() => { if (rafId === null) draw(); }).catch(() => {});
    }
})();