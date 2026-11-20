// ジュー：絵をかく。すべて sim.js の状態（面の焼け具合・温かさ・余熱）から描く。
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
    trayY: 680, trayX: [57, 152, 247, 342],
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
    toku: [[0, [232, 120, 130]], [0.35, [214, 140, 120]], [0.6, [196, 128, 86]], [0.85, [168, 98, 52]], [1.1, [124, 66, 30]], [1.35, [62, 38, 20]], [1.7, [22, 18, 16]]],
    harami: [[0, [160, 26, 44]], [0.35, [162, 70, 70]], [0.6, [148, 82, 62]], [0.85, [124, 66, 40]], [1.1, [94, 50, 26]], [1.35, [54, 32, 20]], [1.7, [20, 18, 16]]],
  };
  const FAT = [[0, [252, 236, 232]], [0.5, [250, 226, 190]], [0.9, [236, 192, 112]], [1.3, [130, 80, 36]], [1.7, [30, 24, 20]]];
  function meatColor(type, d) { return ramp(RAMP[type], d); }

  // ===== 肉の形（肉ごとに少しずつちがう。id から作って覚えておく） =====
  const shapes = new WeakMap(); // 肉そのものに結びつける（見本の肉と id が重なっても混ざらない）
  function shapeOf(m) {
    let s = shapes.get(m);
    if (s) return s;
    const rnd = YG.mulberry32(Math.floor(m.detail * 1e9) + 7);
    const pts = [];
    const N = 28;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      let x, y;
      if (m.type === 'tan') { x = Math.cos(a) * 40; y = Math.sin(a) * 30; }
      else if (m.type === 'kalbi' || m.type === 'toku') {
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
    if (m.type === 'toku') {
      // 霜降り：細かいサシが網の目のように入る
      for (let i = 0; i < 9; i++) fat.push({ x: -42 + rnd() * 50, y: -24 + rnd() * 44, len: 14 + rnd() * 30, w: 1.5 + rnd() * 2.5, bend: (rnd() - 0.5) * 16 });
      for (let i = 0; i < 6; i++) fat.push({ x: -40 + rnd() * 60, y: -20 + rnd() * 40, len: 6 + rnd() * 10, w: 2 + rnd() * 2, bend: (rnd() - 0.5) * 6 });
    }
    if (m.type === 'kalbi') {
      for (let i = 0; i < 4; i++) fat.push({ x: -38 + i * 22 + rnd() * 8, y: -20 + rnd() * 10, len: 20 + rnd() * 26, w: 3 + rnd() * 4, bend: (rnd() - 0.5) * 14 });
      fat.push({ x: -44, y: 18 + rnd() * 4, len: 88, w: 6 + rnd() * 3, bend: 2, edge: true });
    }
    const spots = [];
    for (let i = 0; i < 7; i++) spots.push({ x: (rnd() - 0.5) * 60, y: (rnd() - 0.5) * 36, r: 5 + rnd() * 9 });
    const beads = [];
    for (let i = 0; i < 7; i++) beads.push({ x: (rnd() - 0.5) * 56, y: (rnd() - 0.5) * 30, r: 1.6 + rnd() * 1.8, ph: rnd() * 6 });
    s = { pts, fat, spots, beads, tilt: (rnd() - 0.5) * 0.25 };
    shapes.set(m, s);
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
    if (m.type === 'kalbi' || m.type === 'toku') {
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
  // e：画面の端まで（論理座標の外も）塗る範囲 { x0, x1, y0, y1 }
  // noLantern：タイトルのロゴと重なるときは、ちょうちんを描かない
  function drawBackground(ctx, t, e, noLantern) {
    e = e || { x0: 0, x1: W, y0: 0, y1: H };
    const X0 = Math.min(0, e.x0), X1 = Math.max(W, e.x1), Y0 = Math.min(0, e.y0), Y1 = Math.max(H, e.y1);
    // 暗い店内
    const g = ctx.createLinearGradient(0, 0, 0, L.counterY);
    g.addColorStop(0, '#2a1a14');
    g.addColorStop(1, '#3a2218');
    ctx.fillStyle = g;
    ctx.fillRect(X0, Y0, X1 - X0, L.counterY - Y0);
    // ちょうちん
    for (const [x, c] of noLantern ? [] : [[16, '#d8402c'], [384, '#d8402c']]) {
      const sw = Math.sin(t * 1.3 + x) * 0.05;
      ctx.save(); ctx.translate(x, 56); ctx.rotate(sw); ctx.scale(0.82, 0.82);
      const glow = ctx.createRadialGradient(0, 20, 8, 0, 20, 46);
      glow.addColorStop(0, 'rgba(255,140,60,0.28)'); glow.addColorStop(1, 'rgba(255,140,60,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 20, 46, 0, 7); ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(0, 20, 16, 22, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
      for (let i = -12; i <= 12; i += 6) { ctx.beginPath(); ctx.ellipse(0, 20 + i, 16 * Math.sqrt(1 - (i / 22) ** 2), 1, 0, 0, 7); ctx.stroke(); }
      ctx.fillStyle = '#222'; ctx.fillRect(-8, -3, 16, 4); ctx.fillRect(-8, 40, 16, 4);
      ctx.fillStyle = '#fff3d6'; ctx.font = '13px "Yusei Magic", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('肉', 0, 25);
      ctx.restore();
    }
    // 横に広い画面：焼肉屋の排気ダクトと柱で、左右の空きを店にする
    if (X0 < -24 || X1 > W + 24) {
      ctx.save(); ctx.lineJoin = 'round';
      [[-8, -1], [W + 8, 1]].forEach(([px, side]) => { // 柱
        if ((side < 0 && X0 > -10) || (side > 0 && X1 < W + 10)) return;
        const pw = 16, xx = side < 0 ? px - pw : px;
        const pg = ctx.createLinearGradient(xx, 0, xx + pw, 0); pg.addColorStop(0, '#3a2010'); pg.addColorStop(0.5, '#5a3418'); pg.addColorStop(1, '#2e180a');
        ctx.fillStyle = pg; ctx.fillRect(xx, Y0, pw, Y1 - Y0);
      });
      for (let k = 1; k < 8; k++) for (const side of [-1, 1]) {
        const dx = side < 0 ? -k * 150 + 40 : W + k * 150 - 40;
        if (dx < X0 - 60 || dx > X1 + 60) continue;
        const hood = 96 + 14 * Math.sin(k * 2.1), dy = 120 + 16 * Math.cos(k);
        // 天井からのパイプ
        const pg = ctx.createLinearGradient(dx - 14, 0, dx + 14, 0); pg.addColorStop(0, '#5d646b'); pg.addColorStop(0.45, '#c3cad1'); pg.addColorStop(1, '#6b737a');
        ctx.fillStyle = pg; ctx.fillRect(dx - 14, Y0, 28, dy - Y0);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
        for (let yy = dy - 30; yy > Y0; yy -= 46) { ctx.beginPath(); ctx.moveTo(dx - 14, yy); ctx.lineTo(dx + 14, yy); ctx.stroke(); }
        // ラッパのような吸い込み口
        const hg = ctx.createLinearGradient(dx - hood / 2, 0, dx + hood / 2, 0); hg.addColorStop(0, '#59606a'); hg.addColorStop(0.4, '#d3d9df'); hg.addColorStop(1, '#5f666d');
        ctx.fillStyle = hg; ctx.strokeStyle = '#1c1612'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(dx - 14, dy - 2); ctx.lineTo(dx - hood / 2, dy + 40); ctx.lineTo(dx + hood / 2, dy + 40); ctx.lineTo(dx + 14, dy - 2); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#1c1612'; ctx.beginPath(); ctx.ellipse(dx, dy + 40, hood / 2, 6, 0, 0, 7); ctx.fill();
        // 下に七輪（よその席）の明かり
        const lg = ctx.createRadialGradient(dx, L.counterY - 6, 4, dx, L.counterY - 6, 70); lg.addColorStop(0, 'rgba(255,120,40,0.32)'); lg.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(dx, L.counterY - 6, 70, 0, 7); ctx.fill();
        ctx.strokeStyle = `rgba(255,255,255,${0.12 + 0.06 * Math.sin(t * 1.5 + k)})`; ctx.lineWidth = 6; ctx.lineCap = 'round'; // 立ちのぼる煙
        ctx.beginPath(); ctx.moveTo(dx, L.counterY - 20); ctx.bezierCurveTo(dx - 16, L.counterY - 50, dx + 16, dy + 80, dx, dy + 46); ctx.stroke();
      }
      ctx.restore();
    }
    // カウンター
    ctx.fillStyle = '#6b3d22';
    ctx.fillRect(X0, L.counterY, X1 - X0, 30);
    ctx.fillStyle = '#8a5230';
    ctx.fillRect(X0, L.counterY, X1 - X0, 6);
    ctx.fillStyle = '#4a2a18';
    ctx.fillRect(X0, L.counterY + 30, X1 - X0, Y1 - L.counterY - 30);
    // 木目
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
    for (let y = L.counterY + 40; y < Y1; y += 22) { ctx.beginPath(); ctx.moveTo(X0, y); ctx.bezierCurveTo(120, y + 6, 260, y - 6, X1, y + 3); ctx.stroke(); }
  }

  // ===== 網と炭火 =====
  const FIRE_LABEL = { strong: '強火', mid: '中火', weak: '弱火' };
  const FIRE_FLAMES = { strong: 3, mid: 2, weak: 1 };
  function drawGrill(ctx, t, opts) {
    const G = L.grill;
    // 七輪の枠
    const fever = opts && opts.fever;
    if (fever) { // フィーバー：七輪のまわりが金色に燃える
      ctx.save();
      ctx.shadowColor = '#ffb000'; ctx.shadowBlur = 30 + 10 * Math.sin(t * 10);
      ctx.fillStyle = '#ffcc33';
      roundRect(ctx, G.x - 10, G.y - 10, G.w + 20, G.h + 20, 26); ctx.fill();
      ctx.restore();
    }
    // 枠の色＝店の格（道具を強くした段の数。本番でも見た目だけ出る）：ふつう→銅→銀→金
    const gr = (opts && opts.grade) || 0;
    const rim = gr >= 12 ? ['#f3d36b', '#a8801c'] : gr >= 8 ? ['#d9dde2', '#7d838a'] : gr >= 4 ? ['#c98a5a', '#7a4524'] : null;
    if (rim) {
      const rg2 = ctx.createLinearGradient(0, G.y - 6, 0, G.y + G.h + 6);
      rg2.addColorStop(0, rim[0]); rg2.addColorStop(1, rim[1]);
      ctx.fillStyle = rg2;
    } else ctx.fillStyle = '#2b2b2b';
    roundRect(ctx, G.x - 6, G.y - 6, G.w + 12, G.h + 12, 22); ctx.fill();
    ctx.fillStyle = '#121010';
    roundRect(ctx, G.x, G.y, G.w, G.h, 16); ctx.fill();
    // 炭（列ごとに火力が見える）
    const fires = opts && opts.fires;
    for (let c = 0; c < 3; c++) {
      const fn = YG.fireName(c, fires);
      const k = (fn === 'strong' ? 1 : fn === 'mid' ? 0.62 : 0.3) * (fever ? 1.25 : 1);
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
  // 火力の札：肉と煙の上に描く（隠れないように）。暗い台に、火の色の文字
  const FIRE_COLOR = { strong: '#ff6a3a', mid: '#ffc23d', weak: '#8fc3ff' };
  function drawFireTags(ctx, fires) {
    const G = L.grill;
    // 火が全部同じ強さ（ステージ1〜3）なら、札は何も伝えないので出さない
    const names = [0, 1, 2].map((c) => YG.fireName(c, fires));
    if (names.every((n) => n === names[0])) return;
    for (let c = 0; c < 3; c++) {
      const fn = names[c];
      const x = L.slotX[c], y = G.y + 14;
      const nf = FIRE_FLAMES[fn];
      for (let i = 0; i < nf; i++) drawFlame(ctx, x - 24 + i * 10, y + 8, 5, 14, 1);
      say(ctx, FIRE_LABEL[fn], x - 24 + nf * 10 + 1, y + 7, 15, FIRE_COLOR[fn], { align: 'left', lw: 5.5 });
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
    if (m.reserved) { // 出す予定の客：矢印で向きを見せる
      const tx = L.seatX[m.reserved.seat];
      const dir = tx < x - 20 ? '↖' : tx > x + 20 ? '↗' : '↑';
      pill(ctx, x, y - r * 0.8 - 6, dir + ' 出す予定', '#ffe14d', '#3a1a00');
    }
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
  // 焼け具合のひとこと：箱に入れず、ふち文字（おいしい＝明るい黄、生＝桃、だめ＝灰、冷めた＝水色）
  function pill(ctx, x, y, text, bg, fg, mark) {
    const col = bg === '#a9d6ff' ? '#bfe4ff' : bg === '#ffb3c0' ? '#ff9db0' : bg === '#555' ? '#d0c8c0' : '#ffe58a';
    say(ctx, (mark ? '× ' : '') + text, x, y + 5, 14, col, { lw: 4.5 });
  }
  // 焦げ・冷めた肉の「×」（タップで捨てる）
  function drawJunkBadge(ctx, x, y, t) {
    const p = 1 + 0.1 * Math.max(0, Math.sin(t * 7));
    ctx.save(); ctx.translate(x, y); ctx.scale(p, p);
    ctx.rotate(-0.12); ctx.lineCap = 'round';
    const xs = () => { ctx.beginPath(); ctx.moveTo(-11, -12); ctx.quadraticCurveTo(-1, -2, 12, 11); ctx.moveTo(11, -12); ctx.quadraticCurveTo(2, -1, -10, 12); };
    ctx.strokeStyle = '#2a1206'; ctx.lineWidth = 11; xs(); ctx.stroke();
    ctx.strokeStyle = '#ff3b2a'; ctx.lineWidth = 6; xs(); ctx.stroke();
    ctx.restore();
  }
  function drawTrash(ctx, t, o) {
    const b = L.trash;
    ctx.save(); ctx.translate(b.x, b.y);
    if (o && o.shake) ctx.rotate(Math.sin(t * 40) * 0.08);
    if (o && o.hint) { ctx.shadowColor = `rgba(255,216,77,${0.6 + 0.4 * Math.sin(t * 8)})`; ctx.shadowBlur = 22; }
    ctx.fillStyle = '#7d858c';
    ctx.beginPath(); ctx.moveTo(-26, -22); ctx.lineTo(26, -22); ctx.lineTo(21, 30); ctx.lineTo(-21, 30); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5b6268';
    for (let i = -14; i <= 14; i += 9) ctx.fillRect(i - 1.5, -16, 3, 42);
    ctx.fillStyle = '#9aa3aa'; ctx.fillRect(-29, -28, 58, 8);
    ctx.fillStyle = '#222';
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(-14 + i * 9, -27, 6, 4, i, 0, 7); ctx.fill(); }
    ctx.save(); ctx.rotate(-0.06); say(ctx, 'すてる', 0, 14, 14, '#f4f1ea', { lw: 4, stroke: '#3c4247' }); ctx.restore();
    ctx.restore();
  }
  const UNLOCK_AT = { kalbi: 2, harami: 5 }; // ステージで使えるようになる肉
  const trayMeats = {};
  function trayMeat(type) {
    const k = YG.TRAY_KEYS.indexOf(type);
    if (!trayMeats[type]) trayMeats[type] = { id: -1 - k, type, side: [0, 0], up: 0, detail: 0.31 + k * 0.17, warm: 0 };
    return trayMeats[type];
  }
  // toku＝いま置ける特上カルビの枚数（0なら鍵がかかって見える）
  // allowed：このステージで使える肉（無ければ全部）。使えない肉は鍵と「ステージN〜」
  function drawTray(ctx, t, held, toku, allowed) {
    const y = L.trayY;
    // 木の盆：墨の線のふち・木目・板の継ぎ目
    ctx.save(); ctx.lineJoin = 'round';
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; roundRect(ctx, 12, y - 46, 380, 106, 16); ctx.fill();
    const wg = ctx.createLinearGradient(0, y - 52, 0, y + 54);
    wg.addColorStop(0, '#d6a86c'); wg.addColorStop(1, '#b8874f');
    ctx.fillStyle = wg; roundRect(ctx, 10, y - 52, 380, 106, 16); ctx.fill();
    ctx.strokeStyle = '#2a1206'; ctx.lineWidth = 3; ctx.stroke();
    ctx.save(); roundRect(ctx, 10, y - 52, 380, 106, 16); ctx.clip();
    ctx.strokeStyle = 'rgba(90,50,18,0.28)'; ctx.lineWidth = 1.2;
    for (let j = 0; j < 7; j++) { const yy = y - 44 + j * 15; ctx.beginPath(); ctx.moveTo(10, yy); ctx.bezierCurveTo(110, yy + 5 * Math.sin(j), 260, yy - 5, 390, yy + 2 * Math.cos(j)); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(70,36,10,0.45)'; ctx.lineWidth = 2;
    [104.5, 199.5, 294.5].forEach((xx) => { ctx.beginPath(); ctx.moveTo(xx, y - 52); ctx.lineTo(xx, y + 54); ctx.stroke(); });
    ctx.restore(); ctx.restore();
    for (let i = 0; i < 4; i++) {
      const type = YG.TRAY_KEYS[i];
      const x = L.trayX[i];
      const special = type === 'toku';
      const locked = !special && allowed && !allowed.includes(type);
      const open = special ? toku > 0 : !locked;
      if (special && open) { // 特上：審査員がいるときだけ、金色の光
        const gl = ctx.createRadialGradient(x, y - 6, 6, x, y - 6, 52);
        gl.addColorStop(0, `rgba(255,226,110,${0.75 + 0.2 * Math.sin(t * 6)})`); gl.addColorStop(1, 'rgba(255,200,60,0)');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, y - 6, 52, 0, 7); ctx.fill();
      }
      ctx.save();
      if (!open) ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#4f8a3a';
      ctx.beginPath(); ctx.ellipse(x + 18, y - 16, 18, 8, -0.5, 0, 7); ctx.fill();
      drawMeat(ctx, trayMeat(type), x, y - 6, { scale: 0.66, t, selected: held === type });
      ctx.restore();
      // 盆に焼印で書いたような名前
      ctx.fillStyle = open ? 'rgba(58,28,8,0.92)' : 'rgba(58,28,8,0.45)'; ctx.textAlign = 'center';
      ctx.font = `${special ? 14 : 17}px "Yusei Magic", "Hiragino Sans", sans-serif`;
      ctx.fillText(special ? '特上カルビ' : YG.TYPES[type].name, x, y + 36);
      if (special && open) say(ctx, '×' + toku, x + 30, y - 22, 16, '#ffe58a', { big: true, lw: 4 });
      if (!open) { // 鍵。開くステージの数字を鍵に書く
        ctx.save(); ctx.lineJoin = 'round';
        ctx.strokeStyle = '#2a1206'; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(x, y - 14, 8, Math.PI, 0); ctx.stroke();
        ctx.strokeStyle = '#c9a44a'; ctx.lineWidth = 3.5; ctx.stroke();
        ctx.fillStyle = '#e0b84e'; ctx.strokeStyle = '#2a1206'; ctx.lineWidth = 2.5;
        roundRect(ctx, x - 13, y - 15, 26, 22, 4); ctx.fill(); ctx.stroke();
        if (locked && UNLOCK_AT[type]) { ctx.fillStyle = '#2a1206'; ctx.font = '15px "Potta One", "Hiragino Sans", sans-serif'; ctx.fillText(String(UNLOCK_AT[type]), x, y + 3); }
        else { ctx.fillStyle = '#2a1206'; ctx.beginPath(); ctx.arc(x, y - 6, 3, 0, 7); ctx.fill(); }
        ctx.restore();
      }
    }
  }

  // ===== 客 =====
  const SKIN = ['#f2c9a0', '#c98a5a', '#f5d5b8', '#efc49a', '#f7d2b0', '#f0a24a', '#e8c09a'];
  function drawCustomer(ctx, seat, i, t, react) {
    if (seat.state === 'closed') { // このステージでは使わない席：のれんに「準備中」
      const x = L.seatX[i];
      return; // 使わない席：何も置かない（暗い店の奥）
    }
    if (seat.state === 'empty') { // 空いた席：いすの背もたれと「空席」
      const x = L.seatX[i];
      // 空いた席：カウンターに湯のみとおしぼり（次の客を待っている）
      const cy = L.counterY + 2;
      ctx.save(); ctx.lineJoin = 'round';
      ctx.fillStyle = '#f2ece0'; ctx.strokeStyle = '#2a1206'; ctx.lineWidth = 2; // おしぼり
      ctx.beginPath(); ctx.ellipse(x + 16, cy - 4, 14, 5, -0.08, 0, 7); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(42,18,6,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 6, cy - 6); ctx.lineTo(x + 26, cy - 4); ctx.stroke();
      ctx.fillStyle = '#5c7a5a'; ctx.strokeStyle = '#2a1206'; ctx.lineWidth = 2; // 湯のみ
      ctx.beginPath(); ctx.moveTo(x - 24, cy - 26); ctx.lineTo(x - 22, cy - 2); ctx.quadraticCurveTo(x - 16, cy + 1, x - 8, cy - 2); ctx.lineTo(x - 6, cy - 26); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#7d9a78'; ctx.beginPath(); ctx.ellipse(x - 15, cy - 26, 9, 3, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${0.25 + 0.1 * Math.sin(t * 2 + i)})`; ctx.lineWidth = 2; // 湯気
      ctx.beginPath(); ctx.moveTo(x - 15, cy - 32); ctx.bezierCurveTo(x - 20, cy - 40, x - 10, cy - 44, x - 15, cy - 54); ctx.stroke();
      ctx.restore();
      return;
    }
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
    const bodyCol = ['#4a5260', '#e8e8e8', '#8a5aa6', '#1e1e24', '#f2c230', '#f0a24a', '#15151c'][ch];
    ctx.fillStyle = bodyCol;
    const sw = ch === 1 ? 50 : ch === 4 ? 32 : 40;
    ctx.beginPath(); ctx.moveTo(x - sw, L.counterY + 4); ctx.quadraticCurveTo(x - sw, y + 30, x, y + 28); ctx.quadraticCurveTo(x + sw, y + 30, x + sw, L.counterY + 4); ctx.fill();
    if (ch === 1) { ctx.fillStyle = SKIN[1]; ctx.beginPath(); ctx.ellipse(x - 34, y + 40, 14, 12, 0, 0, 7); ctx.ellipse(x + 34, y + 40, 14, 12, 0, 0, 7); ctx.fill(); }
    if (ch === 0) { ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.moveTo(x - 5, y + 30); ctx.lineTo(x + 5, y + 30); ctx.lineTo(x + 3, L.counterY); ctx.lineTo(x - 3, L.counterY); ctx.fill(); }
    if (ch === 3) { ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.moveTo(x, y + 32); ctx.lineTo(x - 12, y + 26); ctx.lineTo(x - 12, y + 38); ctx.closePath(); ctx.moveTo(x, y + 32); ctx.lineTo(x + 12, y + 26); ctx.lineTo(x + 12, y + 38); ctx.fill(); }
    if (ch === 5) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y + 34, 18, 0, Math.PI); ctx.fill(); }
    if (ch === 6) { // 審査員：金のたすき
      ctx.save(); ctx.beginPath(); ctx.rect(x - 60, y + 26, 120, L.counterY - y - 22); ctx.clip();
      ctx.strokeStyle = '#d4af37'; ctx.lineWidth = 12;
      ctx.beginPath(); ctx.moveTo(x - 30, y + 28); ctx.lineTo(x + 34, L.counterY + 4); ctx.stroke();
      ctx.restore();
      ctx.save(); ctx.translate(x + 2, y + 44); ctx.rotate(0.6);
      ctx.fillStyle = '#5a3a00'; ctx.font = '8px "Yusei Magic", "Hiragino Sans", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('審査員', 0, 3);
      ctx.restore();
    }
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
      say(ctx, 'モー', 14, -6, 14, '#fff', { align: 'left', lw: 4 });
      ctx.restore();
    }
    ctx.restore();
  }
  // 店長：ねじり鉢巻・紺の作務衣・ひげ。お客と同じ描き方（平たい形）
  // mood：say（話す）・grin（ほめる）・hmm（むっ）
  function drawBoss(ctx, x, y, mood, t) {
    t = t || 0; mood = mood || 'say';
    ctx.save();
    // 体（作務衣）
    ctx.fillStyle = '#22314a';
    ctx.beginPath(); ctx.moveTo(x - 50, y + 84); ctx.quadraticCurveTo(x - 48, y + 30, x, y + 28); ctx.quadraticCurveTo(x + 48, y + 30, x + 50, y + 84); ctx.fill();
    ctx.strokeStyle = '#f4efe6'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - 16, y + 30); ctx.lineTo(x + 4, y + 66); ctx.moveTo(x + 16, y + 30); ctx.lineTo(x + 2, y + 50); ctx.stroke();
    // 首にタオル
    ctx.fillStyle = '#e9e3d6'; ctx.beginPath(); ctx.ellipse(x - 26, y + 40, 9, 16, 0.35, 0, 7); ctx.fill();
    // 頭
    const r = 30;
    ctx.fillStyle = '#efc296'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x - r + 1, y + 4, 6, 8, 0, 0, 7); ctx.ellipse(x + r - 1, y + 4, 6, 8, 0, 0, 7); ctx.fill(); // 耳
    // 刈り上げの髪
    ctx.fillStyle = '#1c1612';
    ctx.beginPath(); ctx.arc(x, y - 2, r + 1, Math.PI * 1.02, Math.PI * 1.98); ctx.lineTo(x + r - 2, y - 8); ctx.lineTo(x - r + 2, y - 8); ctx.closePath(); ctx.fill();
    // ねじり鉢巻（白と赤のねじれ）＋ 結び目
    ctx.fillStyle = '#f7f2ea'; ctx.beginPath(); ctx.moveTo(x - r - 2, y - 12); ctx.quadraticCurveTo(x, y - 20, x + r + 2, y - 12); ctx.lineTo(x + r + 1, y - 2); ctx.quadraticCurveTo(x, y - 10, x - r - 1, y - 2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#d23a2a'; ctx.lineWidth = 3; ctx.lineCap = 'butt';
    for (let k = -r + 4; k < r; k += 9) { ctx.beginPath(); ctx.moveTo(x + k, y - 3 - 7 * (1 - (k / r) ** 2)); ctx.lineTo(x + k + 6, y - 14 - 6 * (1 - (k / r) ** 2)); ctx.stroke(); }
    ctx.fillStyle = '#f7f2ea'; ctx.beginPath(); ctx.ellipse(x + r - 2, y - 9, 7, 6, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + r + 2, y - 8); ctx.lineTo(x + r + 18, y - 18 + Math.sin(t * 6) * 2); ctx.lineTo(x + r + 14, y - 4); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#d23a2a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + r + 6, y - 12); ctx.lineTo(x + r + 12, y - 8); ctx.stroke();
    // まゆ
    ctx.strokeStyle = '#1c1612'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    const lift = mood === 'hmm' ? 4 : 0;
    ctx.beginPath(); ctx.moveTo(x - 17, y + 3 - (mood === 'grin' ? 2 : 0)); ctx.lineTo(x - 6, y + 1 + (mood === 'hmm' ? 2 : 0)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 6, y + 1 - lift); ctx.lineTo(x + 17, y + 3 - lift - (mood === 'grin' ? 2 : 0)); ctx.stroke();
    // 目
    ctx.fillStyle = '#1c1612';
    if (mood === 'grin') { ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x - 11, y + 11, 4, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); ctx.beginPath(); ctx.arc(x + 11, y + 11, 4, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(x - 11, y + 10, 3, 0, 7); ctx.arc(x + 11, y + 10, 3, 0, 7); ctx.fill(); }
    // ひげ
    ctx.beginPath(); ctx.moveTo(x, y + 17); ctx.quadraticCurveTo(x - 12, y + 15, x - 15, y + 22); ctx.quadraticCurveTo(x - 6, y + 20, x, y + 21); ctx.quadraticCurveTo(x + 6, y + 20, x + 15, y + 22); ctx.quadraticCurveTo(x + 12, y + 15, x, y + 17); ctx.fill();
    // 口
    if (mood === 'grin') { ctx.fillStyle = '#7a1e14'; ctx.beginPath(); ctx.arc(x, y + 23, 7, 0, Math.PI); ctx.fill(); }
    else if (mood === 'hmm') { ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x - 5, y + 26); ctx.lineTo(x + 5, y + 25); ctx.stroke(); }
    else { const o = 2.5 + Math.abs(Math.sin(t * 9)) * 2.5; ctx.fillStyle = '#7a1e14'; ctx.beginPath(); ctx.ellipse(x, y + 25, 4, o, 0, 0, 7); ctx.fill(); }
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
    } else if (ch === 6) { // 審査員：七三分けと金の王冠
      ctx.fillStyle = '#222';
      ctx.beginPath(); ctx.arc(x, y - 4, r + 1, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
      ctx.fillStyle = '#ffd84d';
      ctx.beginPath(); ctx.moveTo(x - 16, y - r + 2); ctx.lineTo(x - 16, y - r - 14); ctx.lineTo(x - 8, y - r - 6); ctx.lineTo(x, y - r - 18); ctx.lineTo(x + 8, y - r - 6); ctx.lineTo(x + 16, y - r - 14); ctx.lineTo(x + 16, y - r + 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e0302a'; ctx.beginPath(); ctx.arc(x, y - r - 6, 3, 0, 7); ctx.fill();
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
    const w = 114, h = 70;
    const k = Math.max(0, Math.min(1, c.patience / c.maxPatience));
    ctx.save();
    if (k < 0.4) ctx.translate(Math.sin(t * (k < 0.15 ? 40 : 22)) * (k < 0.15 ? 2.5 : 1.2), 0); // 待ちきれない：ふるえる
    if (opts && opts.target) { ctx.translate(x, y); ctx.scale(1.06, 1.06); ctx.translate(-x, -y); }
    blob(ctx, x, y, w, h, i + 1, 3);
    ctx.lineJoin = 'round'; ctx.lineWidth = 6; ctx.strokeStyle = opts && opts.target ? '#ffcf1f' : c.vip ? `rgba(196,150,30,${0.75 + 0.25 * Math.sin(t * 8)})` : '#2a1206'; ctx.stroke();
    ctx.fillStyle = c.vip ? '#fff0b8' : '#fffaf0'; ctx.fill();
    if (opts && opts.target) { ctx.lineWidth = 1.5; ctx.strokeStyle = '#2a1206'; blob(ctx, x, y, w + 7, h + 7, i + 1, 0); ctx.stroke(); }
    if (c.vip) say(ctx, '点×' + YG.CFG.vipMult, x + 44, y + h / 2 + 18, 15, '#ffd84d', { big: true, lw: 4.5 });
    // 焼き色の見本（どの肉でも同じ目安として、カルビで見せる）
    drawMeat(ctx, sampleMeat(c.order.target), x - 31, y - 7, { scale: 0.44 });
    ctx.fillStyle = '#2a1a10'; ctx.textAlign = 'center';
    ctx.font = '16px "Yusei Magic", "Hiragino Sans", sans-serif';
    ctx.fillText(YG.TARGET_NAME[c.order.target], x + 20, y - 4);
    ctx.font = '13.5px "Yusei Magic", "Hiragino Sans", sans-serif';
    ctx.fillStyle = ctx.strokeStyle = c.order.type ? '#a3261b' : '#5a4a3a'; ctx.lineWidth = 0.7;
    const tyText = c.order.type ? (c.order.type === 'toku' ? '特上で' : YG.TYPES[c.order.type].name + 'で') : 'なんでも';
    ctx.strokeText(tyText, x + 21, y + 13); ctx.fillText(tyText, x + 21, y + 13);

    if (k < 0.15) { // もう帰る：頭の左上に赤い「！」
      const ex = x - 44, ey = L.headY - 34;
      ctx.fillStyle = '#e0302a'; ctx.beginPath(); ctx.arc(ex, ey, 11, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '16px "Yusei Magic", "Hiragino Sans", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', ex, ey + 6);
    }
    // 待ちの残り（長さと色）
    for (let j = 0; j < 4; j++) {
      const fill = Math.max(0, Math.min(1, k * 4 - j));
      const hx = x - 27 + j * 18, hy = y + h / 2 - 12;
      const blink = k < 0.15 && fill > 0 && Math.sin(t * 16) > 0;
      heart(ctx, hx, hy, 6.5, '#d8cbb8', 1);
      if (fill > 0 && !blink) heart(ctx, hx, hy, 6.5, k < 0.4 ? '#ff7a3a' : '#e8344a', fill);
    }
    ctx.restore();
  }
  // ハート（fill：左から何割まで塗るか）
  function heart(ctx, x, y, r, col, fill) {
    ctx.save();
    if (fill < 1) { ctx.beginPath(); ctx.rect(x - r - 2, y - r - 2, (r * 2 + 4) * fill, r * 2 + 4); ctx.clip(); }
    ctx.beginPath();
    ctx.moveTo(x, y + r * 0.9);
    ctx.bezierCurveTo(x - r * 1.5, y - r * 0.1, x - r * 0.7, y - r * 1.2, x, y - r * 0.45);
    ctx.bezierCurveTo(x + r * 0.7, y - r * 1.2, x + r * 1.5, y - r * 0.1, x, y + r * 0.9);
    ctx.fillStyle = col; ctx.fill();
    if (fill >= 1) { ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(42,18,6,0.55)'; ctx.stroke(); }
    ctx.restore();
  }
  // 反応の吹き出し
  function drawReact(ctx, seat, i, info, t) {
    if (!info) return;
    const x = L.seatX[i];
    const rt = YG.CFG.reactTime - seat.timer;
    const pop = Math.min(1, rt * 6);
    ctx.font = '13px "Yusei Magic", "Hiragino Sans", sans-serif';
    const lines0 = wrap(ctx, info.text + (info.extra || ''), 120).slice(0, 3);
    const h0 = 14 + (info.head ? 24 : 0) + lines0.length * 17;
    const y = Math.max(82, 54 + h0 / 2); // 上の欄にかからない
    ctx.save(); ctx.translate(x, y); ctx.scale(pop, pop);
    const good = ['perfect', 'great', 'good'].includes(info.key);
    ctx.fillStyle = info.key === 'perfect' ? '#fff3a0' : good ? '#ffffff' : info.key === 'leave' ? '#ffd0d0' : '#f0f0f0';
    ctx.font = '13px "Yusei Magic", "Hiragino Sans", sans-serif';
    const lines = lines0;
    const head = info.head ? 24 : 0;
    const h = h0;
    blob(ctx, 0, 0, 140, h + 6, i + 4, 0); ctx.fill();
    ctx.strokeStyle = '#2a1206'; ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.stroke();
    ctx.textAlign = 'center';
    if (head) { // 評価のひとこと（大きく）
      ctx.font = '19px "Potta One", "Hiragino Sans", sans-serif';
      ctx.fillStyle = info.key === 'perfect' ? '#d97a00' : good ? '#3d7a1a' : '#c0282a';
      ctx.fillText(info.head, 0, -h / 2 + 25);
    }
    ctx.font = '13px "Yusei Magic", "Hiragino Sans", sans-serif';
    ctx.fillStyle = '#2a1a10';
    lines.forEach((ln, j) => ctx.fillText(ln, 0, -h / 2 + head + 21 + j * 17));
    ctx.restore();
  }
  function wrap(ctx, text, w) {
    const out = []; let cur = '';
    // 行のはじめに「！」「。」などが来ないようにする（前の行にぶら下げる）
    for (const ch of text) { if (ctx.measureText(cur + ch).width > w && !'！？。、…）」!?ー'.includes(ch)) { out.push(cur); cur = ch; } else cur += ch; }
    if (cur) out.push(cur);
    return out.slice(0, 4);
  }

  // 箱に入れず、ふちの太い文字で書く（Penguin Diner・にゃんこ大戦争の見せ方）
  function say(ctx, text, x, y, size, fill, o) {
    o = o || {};
    ctx.font = size + 'px ' + (o.big ? '"Potta One", "Hiragino Sans", sans-serif' : '"Yusei Magic", "Hiragino Sans", sans-serif');
    const ls = 'letterSpacing' in ctx; if (ls) ctx.letterSpacing = o.big ? '-0.04em' : '0px'; // 太い字は字の間があきすぎるので詰める
    ctx.textAlign = o.align || 'center'; ctx.lineJoin = 'round';
    ctx.lineWidth = o.lw != null ? o.lw : Math.max(3, size * 0.32); ctx.strokeStyle = o.stroke || '#2a1206';
    if (ctx.lineWidth > 0) ctx.strokeText(text, x, y);
    ctx.fillStyle = fill; ctx.fillText(text, x, y);
    if (ls) ctx.letterSpacing = '0px';
  }
  // 手で描いたような吹き出し（少しゆがんだ丸み・太い墨の線・しっぽ）。seed で形が席ごとに変わる
  function blob(ctx, x, y, w, h, seed, tail) {
    const n = 28, rx = w / 2, ry = h / 2;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const c = Math.cos(a), sn = Math.sin(a);
      // 角の丸い四角と楕円のあいだ（文字が入る）＋ほんの少しのゆらぎ
      const k = 1 + 0.025 * Math.sin(a * 3 + seed * 1.7) + 0.015 * Math.sin(a * 5 + seed);
      const px = x + Math.sign(c) * Math.pow(Math.abs(c), 0.55) * rx * k;
      const py = y + Math.sign(sn) * Math.pow(Math.abs(sn), 0.55) * ry * k;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    if (tail) { ctx.moveTo(x - 9, y + ry - 3); ctx.quadraticCurveTo(x - 2, y + ry + 8, x - 6 + tail, y + ry + 13); ctx.quadraticCurveTo(x + 6, y + ry + 4, x + 9, y + ry - 3); }
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  root.YD = { L, W, H, drawMeat, drawBackground, drawGrill, drawFireTags, drawPlate, drawTrash, drawJunkBadge, drawTray, drawCustomer, drawOrder, drawReact, drawFlame, roundRect, meatColor, trayMeat, rgb, mix, pill, say, blob, drawBoss, sampleMeat, };
})(window);
