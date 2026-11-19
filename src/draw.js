// 焼肉ギリギリ：絵をかく。すべて sim.js の状態（面の焼け具合・温かさ・余熱）から描く。
(function (root) {
  'use strict';
  const YG = root.YG;
  const W = 400, H = 760;

  // ===== 配置（論理座標 400×760。main.js が画面に合わせて拡大する） =====
  const L = {
    W, H,
    seatX: [72, 200, 328], headY: 168, counterY: 210,
    plateY: 272, plateX: [64, 160, 256], plateR: 38,
    trash: { x: 350, y: 272, w: 64, h: 70 },
    grill: { x: 12, y: 320, w: 376, h: 292 },
    slotX: [76, 200, 324], slotY: [398, 540], slotW: 118, slotH: 136,
    trayY: 680, trayX: [76, 200, 324],
  };
  L.slot = (i) => ({ x: L.slotX[i % 3], y: L.slotY[Math.floor(i / 3)] });

  // ===== 色 =====
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function rgb(c, a) { return a == null ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; }
  function ramp(stops, d) {
    if (d <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) {
      if (d <= stops[i][0]) { const [d0, c0] = stops[i - 1], [d1, c1] = stops[i]; return mix(c0, c1, (d - d0) / (d1 - d0)); }
    }
    return stops[stops.length - 1][1];
  }
  // 焼け具合 → 面の色（肉ごと）
  const RAMP = {
    tan: [[0, [236, 150, 160]], [0.35, [232, 186, 178]], [0.6, [214, 186, 160]], [0.85, [196, 150, 104]], [1.1, [160, 104, 56]], [1.35, [84, 52, 30]], [1.7, [28, 22, 20]]],
    kalbi: [[0, [206, 52, 66]], [0.35, [196, 96, 86]], [0.6, [178, 104, 72]], [0.85, [150, 82, 44]], [1.1, [112, 58, 26]], [1.35, [60, 36, 20]], [1.7, [22, 18, 16]]],
    harami: [[0, [160, 26, 44]], [0.35, [162, 70, 70]], [0.6, [148, 82, 62]], [0.85, [124, 66, 40]], [1.1, [94, 50, 26]], [1.35, [54, 32, 20]], [1.7, [20, 18, 16]]],
  };
  const FAT = [[0, [252, 236, 232]], [0.5, [250, 226, 190]], [0.9, [236, 192, 112]], [1.3, [130, 80, 36]], [1.7, [30, 24, 20]]];
  function meatColor(type, d) { return ramp(RAMP[type], d); }

  // ===== 肉の形（肉ごとに少しずつちがう。id から作って覚えておく） =====
  const shapes = new Map();
  function shapeOf(m) {
    let s = shapes.get(m.id);
    if (s) return s;
    const rnd = YG.mulberry32(Math.floor(m.detail * 1e9) + 7);
    const pts = [];
    const N = 28;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      let x, y;
      if (m.type === 'tan') { x = Math.cos(a) * 40; y = Math.sin(a) * 30; }
      else if (m.type === 'kalbi') {
        // 角の丸い長方形
        const c = Math.cos(a), si = Math.sin(a);
        const k = 1 / Math.max(Math.abs(c) / 44, Math.abs(si) / 27);
        const r = Math.min(k, 44 / Math.abs(c || 1e-6), 27 / Math.abs(si || 1e-6));
        x = c * r * 0.97; y = si * r * 0.97;
        const rr = Math.hypot(x, y), rc = Math.hypot(44, 27) * 0.88;
        if (rr > rc) { x *= rc / rr; y *= rc / rr; }
      } else {
        const c = Math.cos(a), si = Math.sin(a);
        const r = 1 / Math.pow(Math.pow(Math.abs(c) / 42, 3) + Math.pow(Math.abs(si) / 25, 3), 1 / 3);
        x = c * r; y = si * r;
      }
      const j = m.type === 'kalbi' ? 2.6 : 1.6;
      pts.push([x + (rnd() - 0.5) * j, y + (rnd() - 0.5) * j]);
    }
    const fat = [];
    if (m.type === 'kalbi') {
      for (let i = 0; i < 4; i++) fat.push({ x: -38 + i * 22 + rnd() * 8, y: -20 + rnd() * 10, len: 20 + rnd() * 26, w: 3 + rnd() * 4, bend: (rnd() - 0.5) * 14 });
      fat.push({ x: -44, y: 18 + rnd() * 4, len: 88, w: 6 + rnd() * 3, bend: 2, edge: true });
    }
    const spots = [];
    for (let i = 0; i < 7; i++) spots.push({ x: (rnd() - 0.5) * 60, y: (rnd() - 0.5) * 36, r: 5 + rnd() * 9 });
    const beads = [];
    for (let i = 0; i < 7; i++) beads.push({ x: (rnd() - 0.5) * 56, y: (rnd() - 0.5) * 30, r: 1.6 + rnd() * 1.8, ph: rnd() * 6 });
    s = { pts, fat, spots, beads, tilt: (rnd() - 0.5) * 0.25 };
    shapes.set(m.id, s);
    return s;
  }
  function pathPts(ctx, pts, dx, dy) {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      const mx = (p[0] + q[0]) / 2 + dx, my = (p[1] + q[1]) / 2 + dy;
      if (i === 0) ctx.moveTo(mx, my); else ctx.quadraticCurveTo(p[0] + dx, p[1] + dy, mx, my);
    }
    const p = pts[0], q = pts[1];
    ctx.quadraticCurveTo(p[0] + dx, p[1] + dy, (p[0] + q[0]) / 2 + dx, (p[1] + q[1]) / 2 + dy);
    ctx.closePath();
  }

  // 1枚の肉。上の面を見せ、厚みの帯に下の面の色を出す（裏の焼け具合のヒント）
  function drawMeat(ctx, m, x, y, o) {
    o = o || {};
    const sc = (o.scale || 1);
    const T = YG.TYPES[m.type];
    const sh = shapeOf(m);
    const top = m.side[m.up], bot = m.side[1 - m.up];
    const shrink = 1 - 0.1 * Math.min(1, Math.max(top, bot) / 1.2);
    const t = o.t || 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(sh.tilt + (o.rot || 0));
    ctx.scale(sc * shrink, sc * shrink);
    const thick = T.thick * 1.5 * (o.lift ? 1.2 : 1);
    // 影
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    pathPts(ctx, sh.pts, 3, 5 + (o.lift || 0));
    ctx.fill();
    // 厚み（下の面の色）
    const bc = meatColor(m.type, bot);
    for (let i = 0; i <= thick; i += 1.5) {
      ctx.fillStyle = rgb(mix(bc, [0, 0, 0], 0.18 + 0.2 * (i / Math.max(1, thick))));
      pathPts(ctx, sh.pts, 0, thick - i);
      ctx.fill();
    }
    // 上の面
    const tc = meatColor(m.type, top);
    const grd = ctx.createRadialGradient(-10, -10, 4, 0, 0, 52);
    grd.addColorStop(0, rgb(mix(tc, [255, 255, 255], 0.12)));
    grd.addColorStop(1, rgb(mix(tc, [0, 0, 0], 0.12)));
    ctx.fillStyle = grd;
    pathPts(ctx, sh.pts, 0, 0);
    ctx.fill();
    ctx.save();
    pathPts(ctx, sh.pts, 0, 0);
    ctx.clip();
    // 肉ごとの模様
    if (m.type === 'kalbi') {
      const fc = ramp(FAT, top);
      ctx.lineCap = 'round';
      for (const f of sh.fat) {
        ctx.strokeStyle = rgb(fc, f.edge ? 0.95 : 0.85);
        ctx.lineWidth = f.w;
        ctx.beginPath();
        ctx.moveTo(f.x, f.y);
        ctx.quadraticCurveTo(f.x + f.len / 2, f.y + f.bend, f.x + f.len, f.y + (f.edge ? 0 : f.bend * 0.3));
        ctx.stroke();
      }
    } else if (m.type === 'harami') {
      ctx.strokeStyle = rgb(mix(tc, [0, 0, 0], 0.25), 0.55);
      ctx.lineWidth = 1.4;
      for (let i = -50; i < 60; i += 7) { ctx.beginPath(); ctx.moveTo(i, -30); ctx.lineTo(i + 18, 30); ctx.stroke(); }
    } else {
      ctx.fillStyle = rgb(mix(tc, [255, 255, 255], 0.3), 0.5);
      for (const b of sh.beads) { ctx.beginPath(); ctx.arc(b.x * 0.9, b.y * 0.9, 1.3, 0, 7); ctx.fill(); }
      // 焼けると端が反る（明るい縁）
      if (Math.max(top, bot) > 0.75) {
        ctx.strokeStyle = rgb(mix(tc, [255, 230, 200], 0.35), Math.min(0.8, (Math.max(top, bot) - 0.75) * 2));
        ctx.lineWidth = 6;
        pathPts(ctx, sh.pts, 0, 0);
        ctx.stroke();
      }
    }
    // 焼き目（網の跡）：上の面がしっかり焼けているほど濃い
    const mark = Math.min(0.7, Math.max(0, (top - 0.4) * 1.3));
    if (mark > 0) {
      ctx.strokeStyle = `rgba(40,20,8,${mark})`;
      ctx.lineWidth = 4.5;
      for (let i = -60; i < 70; i += 17) { ctx.beginPath(); ctx.moveTo(i, -36); ctx.lineTo(i - 22, 36); ctx.stroke(); }
    }
    // 焦げ跡
    const burn = Math.min(1, Math.max(0, (top - 1.1) / 0.45));
    if (burn > 0) {
      for (const sp of sh.spots) {
        ctx.fillStyle = `rgba(15,10,8,${0.85 * burn})`;
        ctx.beginPath(); ctx.arc(sp.x, sp.y, sp.r * (0.5 + burn), 0, 7); ctx.fill();
      }
    }
    if (top >= YG.CFG.char) {
      ctx.strokeStyle = 'rgba(120,120,120,0.6)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(-30 + i * 14, -20); ctx.lineTo(-24 + i * 14, 0); ctx.lineTo(-30 + i * 14, 20); ctx.stroke(); }
    }
    // 生のつや
    const gloss = Math.max(0, 0.45 - top) * 1.4;
    if (gloss > 0) {
      ctx.fillStyle = `rgba(255,255,255,${gloss * 0.6})`;
      ctx.beginPath(); ctx.ellipse(-14, -10, 16, 6, -0.4, 0, 7); ctx.fill();
    }
    // 肉汁：下の面が焼けてくると、上の面に浮いてくる（裏返しの合図）
    if (o.onGrill && bot > 0.45 && bot < 1.15 && top < 0.95) {
      const k = Math.min(1, (bot - 0.45) / 0.35);
      const n = Math.round(k * sh.beads.length);
      for (let i = 0; i < n; i++) {
        const b = sh.beads[i];
        const pulse = 0.8 + 0.25 * Math.sin(t * 6 + b.ph);
        ctx.fillStyle = 'rgba(255,240,215,0.75)';
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r * pulse, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath(); ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.35, 0, 7); ctx.fill();
      }
    }
    ctx.restore();
    // ふち
    ctx.strokeStyle = rgb(mix(tc, [0, 0, 0], 0.45), 0.7);
    ctx.lineWidth = 1.5;
    pathPts(ctx, sh.pts, 0, 0);
    ctx.stroke();
    if (o.selected) {
      ctx.strokeStyle = '#ffe14d';
      ctx.lineWidth = 4;
      ctx.setLineDash([8, 6]);
      ctx.lineDashOffset = -t * 30;
      pathPts(ctx, sh.pts, 0, 0);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  // ===== 背景・カウンター =====
  function drawBackground(ctx, t) {
    // 暗い店内
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#2a1a14');
    g.addColorStop(0.3, '#3a2218');
    g.addColorStop(1, '#1a100c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // ちょうちん
    for (const [x, c] of [[30, '#d8402c'], [370, '#d8402c']]) {
      const sw = Math.sin(t * 1.3 + x) * 0.05;
      ctx.save(); ctx.translate(x, 58); ctx.rotate(sw);
      ctx.fillStyle = 'rgba(255,120,60,0.18)'; ctx.beginPath(); ctx.arc(0, 20, 40, 0, 7); ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(0, 20, 16, 22, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
      for (let i = -12; i <= 12; i += 6) { ctx.beginPath(); ctx.ellipse(0, 20 + i, 16 * Math.sqrt(1 - (i / 22) ** 2), 1, 0, 0, 7); ctx.stroke(); }
      ctx.fillStyle = '#222'; ctx.fillRect(-8, -3, 16, 4); ctx.fillRect(-8, 40, 16, 4);
      ctx.fillStyle = '#fff3d6'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('肉', 0, 25);
      ctx.restore();
    }
    // カウンター
    ctx.fillStyle = '#6b3d22';
    ctx.fillRect(0, L.counterY, W, 30);
    ctx.fillStyle = '#8a5230';
    ctx.fillRect(0, L.counterY, W, 6);
    ctx.fillStyle = '#4a2a18';
    ctx.fillRect(0, L.counterY + 30, W, H - L.counterY - 30);
    // 木目
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
    for (let y = L.counterY + 40; y < H; y += 22) { ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(120, y + 6, 260, y - 6, W, y + 3); ctx.stroke(); }
  }

  // ===== 網と炭火 =====
  const FIRE_LABEL = { strong: '強火', mid: '中火', weak: '弱火' };
  const FIRE_FLAMES = { strong: 3, mid: 2, weak: 1 };
  function drawGrill(ctx, t, opts) {
    const G = L.grill;
    // 七輪の枠
    ctx.fillStyle = '#2b2b2b';
    roundRect(ctx, G.x - 6, G.y - 6, G.w + 12, G.h + 12, 22); ctx.fill();
    ctx.fillStyle = '#121010';
    roundRect(ctx, G.x, G.y, G.w, G.h, 16); ctx.fill();
    // 炭（列ごとに火力が見える）
    for (let c = 0; c < 3; c++) {
      const fn = YG.fireName(c);
      const k = fn === 'strong' ? 1 : fn === 'mid' ? 0.62 : 0.3;
      const cx = L.slotX[c];
      for (let r = 0; r < 2; r++) {
        const cy = L.slotY[r];
        const fl = 0.85 + 0.15 * Math.sin(t * (3 + c) + r * 2) + 0.05 * Math.sin(t * 17 + c);
        const rg = ctx.createRadialGradient(cx, cy + 10, 6, cx, cy + 10, 78);
        rg.addColorStop(0, `rgba(255,${150 + 80 * k | 0},60,${0.85 * k * fl})`);
        rg.addColorStop(0.5, `rgba(220,60,20,${0.55 * k * fl})`);
        rg.addColorStop(1, 'rgba(60,10,0,0)');
        ctx.fillStyle = rg;
        ctx.fillRect(cx - 62, cy - 70, 124, 142);
        // 炭のかたまり
        const nCoal = 5;
        for (let i = 0; i < nCoal; i++) {
          const px = cx - 40 + ((i * 37 + r * 13) % 80), py = cy - 30 + ((i * 53 + c * 7) % 60);
          const glow = (0.4 + 0.6 * k) * (0.8 + 0.2 * Math.sin(t * 2 + i + c));
          ctx.fillStyle = rgb(mix([40, 30, 28], [255, 120, 40], glow * k + 0.1));
          ctx.beginPath(); ctx.ellipse(px, py, 13, 9, i, 0, 7); ctx.fill();
          ctx.strokeStyle = `rgba(255,220,120,${0.5 * k * glow})`; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(px - 8, py); ctx.lineTo(px + 2, py - 3); ctx.lineTo(px + 7, py + 2); ctx.stroke();
        }
        // 強火は炎の先が見える
        if (fn === 'strong') {
          for (let i = 0; i < 4; i++) {
            const fx = cx - 36 + i * 24, h = 14 + 8 * Math.sin(t * 9 + i * 1.7 + r);
            drawFlame(ctx, fx, cy + 46, 8, h, 0.55);
          }
        }
      }
    }
    // 網
    ctx.strokeStyle = 'rgba(170,170,170,0.85)';
    ctx.lineWidth = 2.2;
    for (let x = G.x + 14; x < G.x + G.w; x += 15) { ctx.beginPath(); ctx.moveTo(x, G.y + 6); ctx.lineTo(x, G.y + G.h - 6); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(130,130,130,0.7)';
    ctx.lineWidth = 1.4;
    for (let y = G.y + 14; y < G.y + G.h; y += 26) { ctx.beginPath(); ctx.moveTo(G.x + 6, y); ctx.lineTo(G.x + G.w - 6, y); ctx.stroke(); }
    // 火力の札（形と文字でも分かるように）
    for (let c = 0; c < 3; c++) {
      const fn = YG.fireName(c);
      const x = L.slotX[c], y = G.y + 16;
      ctx.fillStyle = fn === 'strong' ? '#e2481e' : fn === 'mid' ? '#d98a1c' : '#4a6b8a';
      roundRect(ctx, x - 34, y - 13, 68, 24, 12); ctx.fill();
      for (let i = 0; i < FIRE_FLAMES[fn]; i++) drawFlame(ctx, x - 22 + i * 9, y + 6, 4, 11, 1);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px "Hiragino Sans", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(FIRE_LABEL[fn], x - 22 + FIRE_FLAMES[fn] * 9 + 2, y + 4);
    }
    // 置ける場所の合図
    if (opts && opts.hint) {
      for (let i = 0; i < 6; i++) {
        if (!opts.hint[i]) continue;
        const s = L.slot(i);
        ctx.strokeStyle = `rgba(255,225,77,${0.5 + 0.4 * Math.sin(t * 8)})`;
        ctx.lineWidth = 3; ctx.setLineDash([10, 8]);
        roundRect(ctx, s.x - 50, s.y - 52, 100, 104, 14); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }
  function drawFlame(ctx, x, y, w, h, a) {
    const g = ctx.createLinearGradient(x, y, x, y - h);
    g.addColorStop(0, `rgba(255,90,20,${a})`);
    g.addColorStop(0.6, `rgba(255,190,60,${a})`);
    g.addColorStop(1, `rgba(255,250,200,${a * 0.6})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.quadraticCurveTo(x - w, y - h * 0.5, x, y - h);
    ctx.quadraticCurveTo(x + w, y - h * 0.5, x + w, y);
    ctx.closePath(); ctx.fill();
  }

  // ===== 皿・炭入れ・トレー =====
  function drawPlate(ctx, p, m, t, o) {
    const x = L.plateX[p], y = L.plateY, r = L.plateR;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(x + 2, y + 6, r, r * 0.8, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#f3efe6';
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.8, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#2c4f7a'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(x, y, r - 5, r * 0.8 - 5, 0, 0, 7); ctx.stroke();
    if (o && o.hint) {
      ctx.strokeStyle = `rgba(255,225,77,${0.5 + 0.4 * Math.sin(t * 8)})`; ctx.lineWidth = 3; ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.ellipse(x, y, r + 4, r * 0.8 + 4, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    }
    if (!m || (o && o.hideMeat)) return;
    drawMeat(ctx, m, x, y - 2, { scale: 0.66, t, selected: o && o.selected });
    // 湯気＝温かさ
    const steam = m.rest && !m.restDone ? 1 : m.warm;
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.8 + i / 3) % 1;
      const a = steam * (1 - ph) * 0.55;
      if (a < 0.03) continue;
      ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = 2.5;
      const sx = x - 14 + i * 14, sy = y - 12 - ph * 34;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(sx + 6 * Math.sin(t * 3 + i), sy - 7, sx, sy - 14); ctx.stroke();
    }
    // 余熱中：残りの輪
    if (m.rest && !m.restDone) {
      const k = m.rest.t / m.rest.dur;
      ctx.strokeStyle = '#ff9b3d'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(x, y, r + 8, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke();
      ctx.lineCap = 'butt';
      pill(ctx, x, y + r - 2, '余熱中', '#ff9b3d', '#3a1a00');
    } else if (m.restDone) {
      // 余熱が終わった＝出せる。おいしいかは別に表示
      const lb = YG.label(m);
      const good = ['usu', 'hodo', 'kon', 'mix'].includes(lb.kind);
      let text = lb.text, bg = good ? '#fff3c4' : lb.kind === 'raw' ? '#ffb3c0' : '#555', fg = good ? '#4a2a10' : lb.kind === 'raw' ? '#7a0020' : '#fff';
      if (m.warm < YG.CFG.warmCold) { text += '・冷めた'; bg = '#a9d6ff'; fg = '#0b2a4a'; }
      else if (m.warm < YG.CFG.warmLuke) text += '・ぬるい';
      pill(ctx, x, y + r - 2, text, bg, fg, !good ? 'bad' : null);
    }
  }
  function pill(ctx, x, y, text, bg, fg, mark) {
    ctx.font = 'bold 12px "Hiragino Sans", sans-serif';
    const w = ctx.measureText(text).width + 14 + (mark ? 12 : 0);
    ctx.fillStyle = bg;
    roundRect(ctx, x - w / 2, y - 9, w, 19, 9.5); ctx.fill();
    ctx.fillStyle = fg; ctx.textAlign = 'center';
    ctx.fillText((mark ? '× ' : '') + text, x, y + 5);
  }
  function drawTrash(ctx, t, o) {
    const b = L.trash;
    ctx.save(); ctx.translate(b.x, b.y);
    if (o && o.shake) ctx.rotate(Math.sin(t * 40) * 0.08);
    ctx.fillStyle = '#7d858c';
    ctx.beginPath(); ctx.moveTo(-26, -22); ctx.lineTo(26, -22); ctx.lineTo(21, 30); ctx.lineTo(-21, 30); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5b6268';
    for (let i = -14; i <= 14; i += 9) ctx.fillRect(i - 1.5, -16, 3, 42);
    ctx.fillStyle = '#9aa3aa'; ctx.fillRect(-29, -28, 58, 8);
    ctx.fillStyle = '#222';
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(-14 + i * 9, -27, 6, 4, i, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px "Hiragino Sans", sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; roundRect(ctx, -24, 0, 48, 18, 6); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText('炭入れ', 0, 14);
    if (o && o.hint) {
      ctx.strokeStyle = `rgba(255,225,77,${0.5 + 0.4 * Math.sin(t * 8)})`; ctx.lineWidth = 3; ctx.setLineDash([8, 6]);
      roundRect(ctx, -34, -36, 68, 90, 10); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();
  }
  const TRAY_NOTE = { tan: 'うすい・早い', kalbi: '脂・強火で燃える', harami: 'あつい・余熱大' };
  const trayMeats = {};
  function trayMeat(type) {
    if (!trayMeats[type]) trayMeats[type] = { id: -1 - YG.TYPE_KEYS.indexOf(type), type, side: [0, 0], up: 0, detail: 0.31 + YG.TYPE_KEYS.indexOf(type) * 0.17, warm: 0 };
    return trayMeats[type];
  }
  function drawTray(ctx, t, held) {
    const y = L.trayY;
    ctx.fillStyle = '#c99b62';
    roundRect(ctx, 10, y - 52, 380, 106, 14); ctx.fill();
    ctx.fillStyle = '#b4854f';
    roundRect(ctx, 18, y - 44, 364, 90, 10); ctx.fill();
    for (let i = 0; i < 3; i++) {
      const type = YG.TYPE_KEYS[i];
      const x = L.trayX[i];
      // 葉っぱ（盛りつけ）
      ctx.fillStyle = '#4f8a3a';
      ctx.beginPath(); ctx.ellipse(x + 20, y - 16, 22, 9, -0.5, 0, 7); ctx.fill();
      drawMeat(ctx, trayMeat(type), x, y - 6, { scale: 0.78, t, selected: held === type });
      ctx.fillStyle = '#2a1608'; ctx.textAlign = 'center';
      ctx.font = 'bold 16px "Hiragino Sans", sans-serif';
      ctx.fillText(YG.TYPES[type].name, x, y + 34);
      ctx.font = '11px "Hiragino Sans", sans-serif';
      ctx.fillStyle = '#4a2a10';
      ctx.fillText(TRAY_NOTE[type], x, y + 49);
    }
  }

  // ===== 客 =====
  const SKIN = ['#f2c9a0', '#c98a5a', '#f5d5b8', '#efc49a', '#f7d2b0', '#f0a24a'];
  function drawCustomer(ctx, seat, i, t, react) {
    if (seat.state === 'empty') return;
    const c = seat.cust || {};
    const ch = c.char != null ? c.char : (react && react.char) || 0;
    const x = L.seatX[i];
    let y = L.headY;
    let face = 'wait';
    let k = 1; // 待ちの残り
    if (seat.state === 'wait') {
      k = c.patience / c.maxPatience;
      face = k < 0.15 ? 'mad' : k < 0.4 ? 'sweat' : 'wait';
    } else if (react) face = react.face;
    const rt = seat.state === 'wait' ? 0 : (YG.CFG.reactTime - seat.timer);
    ctx.save();
    if (face === 'heaven') { y -= Math.min(18, rt * 30); }
    if (face === 'angry') { ctx.translate(Math.min(1, rt / 1.2) * (i === 0 ? -90 : 90), 0); ctx.globalAlpha = Math.max(0, 1 - rt / 1.4); }
    if (face === 'mad' || face === 'chew') ctx.translate(Math.sin(t * 30) * 1.5, 0);
    // 後光
    if (face === 'heaven') {
      ctx.save(); ctx.translate(x, y);
      for (let r = 0; r < 12; r++) {
        ctx.rotate(Math.PI / 6);
        ctx.fillStyle = `rgba(255,236,140,${0.35 + 0.15 * Math.sin(t * 6 + r)})`;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-10, -90); ctx.lineTo(10, -90); ctx.fill();
      }
      ctx.restore();
    }
    // 体
    const bodyCol = ['#4a5260', '#e8e8e8', '#8a5aa6', '#1e1e24', '#f2c230', '#f0a24a'][ch];
    ctx.fillStyle = bodyCol;
    const sw = ch === 1 ? 50 : ch === 4 ? 32 : 40;
    ctx.beginPath(); ctx.moveTo(x - sw, L.counterY + 4); ctx.quadraticCurveTo(x - sw, y + 30, x, y + 28); ctx.quadraticCurveTo(x + sw, y + 30, x + sw, L.counterY + 4); ctx.fill();
    if (ch === 1) { ctx.fillStyle = SKIN[1]; ctx.beginPath(); ctx.ellipse(x - 34, y + 40, 14, 12, 0, 0, 7); ctx.ellipse(x + 34, y + 40, 14, 12, 0, 0, 7); ctx.fill(); }
    if (ch === 0) { ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.moveTo(x - 5, y + 30); ctx.lineTo(x + 5, y + 30); ctx.lineTo(x + 3, L.counterY); ctx.lineTo(x - 3, L.counterY); ctx.fill(); }
    if (ch === 3) { ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.moveTo(x, y + 32); ctx.lineTo(x - 12, y + 26); ctx.lineTo(x - 12, y + 38); ctx.closePath(); ctx.moveTo(x, y + 32); ctx.lineTo(x + 12, y + 26); ctx.lineTo(x + 12, y + 38); ctx.fill(); }
    if (ch === 5) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y + 34, 18, 0, Math.PI); ctx.fill(); }
    // 頭
    const hr = ch === 4 ? 25 : 29;
    let skin = SKIN[ch];
    if (face === 'soot') skin = '#2a2522';
    if (face === 'frozen') skin = '#a8d8ff';
    if (face === 'mad' || face === 'angry') skin = mix(hexRgb(SKIN[ch]), [230, 60, 50], 0.45);
    ctx.fillStyle = typeof skin === 'string' ? skin : rgb(skin);
    if (ch === 5) { // ねこの耳
      ctx.beginPath(); ctx.moveTo(x - 26, y - 12); ctx.lineTo(x - 20, y - 40); ctx.lineTo(x - 6, y - 24); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + 26, y - 12); ctx.lineTo(x + 20, y - 40); ctx.lineTo(x + 6, y - 24); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(x, y, hr, 0, 7); ctx.fill();
    // 髪・小物
    if (face !== 'soot') drawHair(ctx, ch, x, y, hr);
    else { // アフロの煙
      ctx.fillStyle = '#333';
      for (let j = 0; j < 7; j++) { ctx.beginPath(); ctx.arc(x - 24 + j * 8, y - 26 - Math.sin(j) * 6, 12, 0, 7); ctx.fill(); }
    }
    drawFace(ctx, ch, x, y, face, t);
    if (face === 'frozen') {
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2;
      for (const [fx, fy] of [[x - 30, y - 20], [x + 28, y + 6]]) snow(ctx, fx, fy, 8);
    }
    if (face === 'shock') { // 牛が出てくる
      const p = Math.min(1, rt * 3);
      ctx.save(); ctx.translate(x + 30, y - 20 - p * 14); ctx.scale(p, p);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(0, 0, 14, 11, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#222'; ctx.beginPath(); ctx.ellipse(-5, -3, 5, 4, 0.3, 0, 7); ctx.fill();
      ctx.fillStyle = '#f4b6c2'; ctx.beginPath(); ctx.ellipse(0, 6, 8, 5, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#222'; ctx.fillRect(-3, 4, 2, 3); ctx.fillRect(2, 4, 2, 3);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('モー', 14, -6);
      ctx.restore();
    }
    ctx.restore();
  }
  function snow(ctx, x, y, r) {
    for (let a = 0; a < 3; a++) { const an = a * Math.PI / 3; ctx.beginPath(); ctx.moveTo(x - Math.cos(an) * r, y - Math.sin(an) * r); ctx.lineTo(x + Math.cos(an) * r, y + Math.sin(an) * r); ctx.stroke(); }
  }
  function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function drawHair(ctx, ch, x, y, r) {
    if (ch === 0) { // 部長：はげ頭にネクタイのはちまき
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(x - 8, y - 18, 8, 4, -0.4, 0, 7); ctx.fill();
      ctx.fillStyle = '#c0392b'; ctx.fillRect(x - r, y - 14, r * 2, 7);
      ctx.beginPath(); ctx.moveTo(x + r - 2, y - 12); ctx.lineTo(x + r + 16, y - 2); ctx.lineTo(x + r + 10, y + 6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#333'; ctx.fillRect(x - r, y - 4, 5, 10); ctx.fillRect(x + r - 5, y - 4, 5, 10);
    } else if (ch === 1) { // マッチョ：角刈り
      ctx.fillStyle = '#1a1a1a'; ctx.fillRect(x - r + 3, y - r - 4, r * 2 - 6, 14);
    } else if (ch === 2) { // おばあちゃん：白髪のおだんご
      ctx.fillStyle = '#e8e8e8';
      ctx.beginPath(); ctx.arc(x, y - r - 6, 12, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y - 6, r + 2, Math.PI, 0); ctx.fill();
    } else if (ch === 3) { // 美食家：ベレー帽
      ctx.fillStyle = '#7b1e3c'; ctx.beginPath(); ctx.ellipse(x + 4, y - r + 4, r + 4, 10, -0.15, 0, 7); ctx.fill();
      ctx.fillRect(x + 2, y - r - 10, 3, 6);
    } else if (ch === 4) { // ちびっこ：ぼうし
      ctx.fillStyle = '#2e86de'; ctx.beginPath(); ctx.arc(x, y - 6, r + 1, Math.PI, 0); ctx.fill();
      ctx.fillRect(x - r - 12, y - 9, 20, 5);
    }
  }
  function drawFace(ctx, ch, x, y, face, t) {
    const ink = face === 'soot' ? '#fff' : '#2a1a10';
    ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    const ey = y - 3, ex = 10;
    const eye = (dx, kind) => {
      const cx = x + dx;
      if (kind === 'closed') { ctx.beginPath(); ctx.arc(cx, ey + 2, 5, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
      else if (kind === 'big') { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, ey, 6.5, 0, 7); ctx.fill(); ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(cx, ey, 2.5, 0, 7); ctx.fill(); }
      else if (kind === 'line') { ctx.beginPath(); ctx.moveTo(cx - 5, ey); ctx.lineTo(cx + 5, ey); ctx.stroke(); }
      else { ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(cx, ey, 3, 0, 7); ctx.fill(); }
    };
    let ek = 'dot';
    if (face === 'heaven' || face === 'happy') ek = 'closed';
    if (face === 'shock' || face === 'soot') ek = 'big';
    if (face === 'meh' || face === 'frozen') ek = 'line';
    eye(-ex, ek); eye(ex, ek);
    // まゆ（怒り）
    if (face === 'mad' || face === 'angry') {
      ctx.beginPath(); ctx.moveTo(x - 16, ey - 10); ctx.lineTo(x - 5, ey - 6); ctx.moveTo(x + 16, ey - 10); ctx.lineTo(x + 5, ey - 6); ctx.stroke();
    }
    // 口
    const my = y + 12;
    ctx.beginPath();
    if (face === 'heaven') { ctx.fillStyle = '#7a1e1e'; ctx.ellipse(x, my, 8, 7, 0, 0, 7); ctx.fill(); }
    else if (face === 'happy' || face === 'smile') { ctx.arc(x, my - 4, 8, 0.2, Math.PI - 0.2); ctx.stroke(); }
    else if (face === 'shock') { ctx.fillStyle = '#5a1010'; ctx.ellipse(x, my + 1, 5, 7, 0, 0, 7); ctx.fill(); }
    else if (face === 'chew') { const w = Math.sin(t * 20) * 3; ctx.moveTo(x - 8, my); ctx.lineTo(x - 4, my + w); ctx.lineTo(x, my); ctx.lineTo(x + 4, my - w); ctx.lineTo(x + 8, my); ctx.stroke(); }
    else if (face === 'mad' || face === 'angry' || face === 'meh' || face === 'frozen') { ctx.arc(x, my + 6, 7, Math.PI + 0.3, -0.3); ctx.stroke(); }
    else if (face === 'soot') { ctx.moveTo(x - 6, my); ctx.lineTo(x + 6, my); ctx.stroke(); }
    else { ctx.moveTo(x - 5, my); ctx.lineTo(x + 5, my); ctx.stroke(); }
    // 小物
    if (ch === 3 && face !== 'soot') { // ひげと片めがね
      ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x, y + 5); ctx.quadraticCurveTo(x - 10, y + 2, x - 16, y - 2); ctx.moveTo(x, y + 5); ctx.quadraticCurveTo(x + 10, y + 2, x + 16, y - 2); ctx.stroke();
      ctx.strokeStyle = '#d4af37'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x + ex, ey, 8, 0, 7); ctx.stroke();
    }
    if (ch === 2 && face !== 'soot') { ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x - ex, ey, 7, 0, 7); ctx.moveTo(x + ex + 7, ey); ctx.arc(x + ex, ey, 7, 0, 7); ctx.moveTo(x - 3, ey); ctx.lineTo(x + 3, ey); ctx.stroke(); }
    if (ch === 5) { ctx.strokeStyle = face === 'soot' ? '#fff' : '#5a3a10'; ctx.lineWidth = 1; for (const s of [-1, 1]) for (let j = -1; j <= 1; j++) { ctx.beginPath(); ctx.moveTo(x + s * 8, y + 7); ctx.lineTo(x + s * 26, y + 4 + j * 5); ctx.stroke(); } }
    if (face === 'sweat' || face === 'mad') {
      ctx.fillStyle = '#7fc8ff';
      const dy = (t * 20) % 10;
      ctx.beginPath(); ctx.moveTo(x + 24, y - 16 + dy); ctx.quadraticCurveTo(x + 30, y - 6 + dy, x + 24, y - 4 + dy); ctx.quadraticCurveTo(x + 18, y - 6 + dy, x + 24, y - 16 + dy); ctx.fill();
    }
    ctx.lineCap = 'butt';
  }

  // 注文の吹き出し：肉の絵＋好みのことば＋焼き色の見本。下に待ちの残り
  const SAMPLE = {};
  function sampleMeat(target) {
    if (!SAMPLE[target]) { const d = YG.CFG.targets[target]; SAMPLE[target] = { id: -10 - YG.TARGET_KEYS.indexOf(target), type: 'kalbi', side: [d, d], up: 0, detail: 0.77, warm: 1 }; }
    return SAMPLE[target];
  }
  function drawOrder(ctx, seat, i, t, opts) {
    if (seat.state !== 'wait') return;
    const c = seat.cust;
    const x = L.seatX[i], y = 82;
    const w = 118, h = 70;
    const k = c.patience / c.maxPatience;
    ctx.save();
    if (opts && opts.target) { ctx.translate(x, y); ctx.scale(1.06, 1.06); ctx.translate(-x, -y); }
    ctx.fillStyle = '#fffaf0';
    roundRect(ctx, x - w / 2, y - h / 2, w, h, 14); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 8, y + h / 2 - 1); ctx.lineTo(x, y + h / 2 + 10); ctx.lineTo(x + 8, y + h / 2 - 1); ctx.fill();
    if (opts && opts.target) { ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 4; roundRect(ctx, x - w / 2, y - h / 2, w, h, 14); ctx.stroke(); }
    // 焼き色の見本（どの肉でも同じ目安として、カルビで見せる）
    drawMeat(ctx, sampleMeat(c.order.target), x - 30, y - 6, { scale: 0.36 });
    ctx.fillStyle = '#2a1a10'; ctx.textAlign = 'center';
    ctx.font = 'bold 16px "Hiragino Sans", sans-serif';
    ctx.fillText(YG.TARGET_NAME[c.order.target], x + 20, y - 4);
    ctx.font = 'bold 12px "Hiragino Sans", sans-serif';
    ctx.fillStyle = c.order.type ? '#a3261b' : '#6a5a4a';
    ctx.fillText(c.order.type ? YG.TYPES[c.order.type].name + 'で' : '肉はなんでも', x + 20, y + 14);
    // 待ちの残り（長さと色）
    const bw = w - 20;
    ctx.fillStyle = '#e6dccb'; roundRect(ctx, x - bw / 2, y + h / 2 - 12, bw, 6, 3); ctx.fill();
    ctx.fillStyle = k < 0.15 ? '#e0302a' : k < 0.4 ? '#f0a020' : '#4caf50';
    roundRect(ctx, x - bw / 2, y + h / 2 - 12, Math.max(4, bw * k), 6, 3); ctx.fill();
    ctx.restore();
  }
  // 反応の吹き出し
  function drawReact(ctx, seat, i, info, t) {
    if (!info) return;
    const x = L.seatX[i], y = 82;
    const rt = YG.CFG.reactTime - seat.timer;
    const pop = Math.min(1, rt * 6);
    ctx.save(); ctx.translate(x, y); ctx.scale(pop, pop);
    const good = ['perfect', 'great', 'good'].includes(info.key);
    ctx.fillStyle = info.key === 'perfect' ? '#fff3a0' : good ? '#ffffff' : info.key === 'leave' ? '#ffd0d0' : '#f0f0f0';
    ctx.font = 'bold 14px "Hiragino Sans", sans-serif';
    const lines = wrap(ctx, info.text + (info.extra || ''), 116);
    const h = 18 + lines.length * 18;
    roundRect(ctx, -66, -h / 2, 132, h, 12); ctx.fill();
    ctx.strokeStyle = info.key === 'perfect' ? '#ffb000' : good ? '#8bc34a' : '#e0302a'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#2a1a10'; ctx.textAlign = 'center';
    lines.forEach((ln, j) => ctx.fillText(ln, 0, -h / 2 + 23 + j * 18));
    ctx.restore();
  }
  function wrap(ctx, text, w) {
    const out = []; let cur = '';
    for (const ch of text) { if (ctx.measureText(cur + ch).width > w) { out.push(cur); cur = ch; } else cur += ch; }
    if (cur) out.push(cur);
    return out.slice(0, 4);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  root.YD = { L, W, H, drawMeat, drawBackground, drawGrill, drawPlate, drawTrash, drawTray, drawCustomer, drawOrder, drawReact, drawFlame, roundRect, meatColor, trayMeat, rgb, mix, pill, forget: (id) => shapes.delete(id) };
})(window);
