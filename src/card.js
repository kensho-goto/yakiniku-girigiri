// 自慢する絵：結果を 1080×1080 の画像にする（X・LINE に貼る用）。
// 主役は「今日の一枚」の断面。失敗があれば一番ひどい一枚、なければ一番うまく焼けた一枚。
(function (root) {
  'use strict';
  const jaen = root.jaen || ((ja) => ja);
  const S = 1080;
  const INK = '#2a1206';
  const URL_TEXT = 'kensho-goto.github.io/yakiniku-girigiri';

  // 今日の一枚と、店長のひとこと
  function pickCut(g) {
    const log = g.log || [];
    const by = (f) => log.filter(f);
    const fail = (k) => (e) => e.result && e.result.fail === k;
    const pick = [
      ['char', by(fail('char')), (a, b) => Math.max(...b.side) - Math.max(...a.side)],
      ['raw', by((e) => e.result && (e.result.fail === 'raw' || e.result.fail === 'halfraw')), (a, b) => Math.min(...a.side) - Math.min(...b.side)],
      ['burnt', by(fail('burnt')), (a, b) => Math.max(...b.side) - Math.max(...a.side)],
      ['perfect', by((e) => e.result && e.result.rank === 'perfect'), (a, b) => (a.result.worstDev || 0) - (b.result.worstDev || 0)],
      ['great', by((e) => e.result && e.result.rank === 'great'), (a, b) => (a.result.worstDev || 0) - (b.result.worstDev || 0)],
      ['other', log.slice(), () => 0],
    ].find(([, list]) => list.length);
    if (!pick) return { kind: 'none', e: null };
    return { kind: pick[0], e: pick[1].sort(pick[2])[0] };
  }
  const SAY = {
    char: () => jaen('炭を出した', 'Served actual charcoal', '端上了一块炭'),
    raw: () => jaen('生で出した', 'Served it raw', '端上了生肉'),
    burnt: () => jaen('焦がして出した', 'Served it burnt', '烤焦了还端上去'),
    perfect: () => jaen('神焼きの断面', 'A godly cut', '神级断面'),
    great: () => jaen('うまい断面', 'A tasty cut', '好吃的断面'),
    other: () => jaen('今日の一枚', "Today's cut", '今天的一片'),
    none: () => jaen('だれにも出してない', 'Fed nobody', '谁也没吃到'),
  };

  // ふちの太い文字（下に影の厚み）
  function inked(ctx, text, x, y, size, font, fill, o) {
    o = o || {};
    ctx.save();
    ctx.translate(x, y); ctx.rotate(o.rot || 0);
    ctx.font = `${size}px ${font}`;
    ctx.textAlign = o.align || 'center'; ctx.textBaseline = 'middle';
    if (o.maxW) { const w = ctx.measureText(text).width; if (w > o.maxW) { const k = o.maxW / w; ctx.scale(k, k); } }
    const lw = o.lw || Math.max(8, size * 0.16);
    ctx.lineJoin = 'round'; ctx.miterLimit = 2;
    ctx.strokeStyle = INK; ctx.lineWidth = lw;
    if (o.depth !== 0) { ctx.fillStyle = o.under || INK; ctx.strokeText(text, 0, o.depth || size * 0.07); ctx.fillText(text, 0, o.depth || size * 0.07); }
    ctx.strokeText(text, 0, 0);
    ctx.fillStyle = fill; ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  // 判子：少しかすれた赤い丸に、ランク
  function hanko(ctx, x, y, r, big, small, rnd) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(0.2);
    const red = '#ff4a36';
    ctx.strokeStyle = INK; ctx.lineWidth = 26; ring(ctx, r, rnd, 0); // 下地のふち（暗い背景でも読める）
    ctx.strokeStyle = red;
    for (let k = 0; k < 3; k++) { ctx.lineWidth = 9 - k * 2; ring(ctx, r + (rnd() - 0.5) * 4, rnd, k); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const F = root.YI && root.YI.zh ? '"ZCOOL KuaiLe"' : '"Potta One"';
    ctx.font = `${big.length > 3 ? 64 : 92}px ${F}`;
    let w = ctx.measureText(big).width; ctx.save(); if (w > r * 1.6) ctx.scale(r * 1.6 / w, r * 1.6 / w);
    ctx.lineJoin = 'round'; ctx.lineWidth = 14; ctx.strokeStyle = INK; ctx.strokeText(big, 0, small ? -14 : 0);
    ctx.fillStyle = red; ctx.fillText(big, 0, small ? -14 : 0); ctx.restore();
    if (small) {
      const H = root.YI && root.YI.zh ? '"ZCOOL KuaiLe"' : '"Yusei Magic"';
      ctx.font = `30px ${H}`; w = ctx.measureText(small).width;
      ctx.save(); if (w > r * 1.5) ctx.scale(r * 1.5 / w, r * 1.5 / w);
      ctx.lineWidth = 9; ctx.strokeText(small, 0, 52); ctx.fillStyle = '#ffd9c8'; ctx.fillText(small, 0, 52); ctx.restore();
    }
    ctx.restore();
  }
  function ring(ctx, r, rnd, k) {
    ctx.beginPath();
    const n = 36, a0 = rnd() * 6.28;
    for (let i = 0; i <= n; i++) {
      const a = a0 + (i / n) * Math.PI * 2, rr = r + Math.sin(a * 3 + k) * 3 + (rnd() - 0.5) * 3;
      if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.stroke();
  }

  // まな板（木の板・手で描いたような形）
  function board(ctx, x, y, w, h, rnd) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.03);
    const shape = () => {
      ctx.beginPath();
      ctx.moveTo(-w / 2 + 30, -h / 2 + rnd() * 4);
      ctx.bezierCurveTo(-w / 6, -h / 2 - 6, w / 6, -h / 2 + 6, w / 2 - 30, -h / 2);
      ctx.quadraticCurveTo(w / 2 + 4, -h / 2, w / 2 + 2, 0);
      ctx.quadraticCurveTo(w / 2, h / 2, w / 2 - 34, h / 2 + 2);
      ctx.bezierCurveTo(w / 6, h / 2 + 8, -w / 6, h / 2 - 4, -w / 2 + 30, h / 2);
      ctx.quadraticCurveTo(-w / 2 - 4, h / 2, -w / 2 - 2, 0);
      ctx.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + 30, -h / 2);
      ctx.closePath();
    };
    ctx.save(); ctx.translate(0, 22); shape(); ctx.fillStyle = '#5a2e14'; ctx.fill(); ctx.lineWidth = 10; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore();
    shape(); ctx.lineWidth = 10; ctx.strokeStyle = INK; ctx.stroke();
    const gr = ctx.createLinearGradient(0, -h / 2, 0, h / 2); gr.addColorStop(0, '#e6b878'); gr.addColorStop(1, '#c98d4e');
    ctx.fillStyle = gr; ctx.fill();
    ctx.save(); shape(); ctx.clip();
    ctx.strokeStyle = 'rgba(120,60,20,.28)'; ctx.lineWidth = 3;
    for (let i = 0; i < 7; i++) { const yy = -h / 2 + 18 + i * (h - 30) / 6 + (rnd() - 0.5) * 8; ctx.beginPath(); ctx.moveTo(-w / 2, yy); ctx.bezierCurveTo(-w / 4, yy + (rnd() - 0.5) * 14, w / 4, yy + (rnd() - 0.5) * 14, w / 2, yy + (rnd() - 0.5) * 8); ctx.stroke(); }
    ctx.restore(); ctx.restore();
  }

  function draw(g, cv) {
    const ctx = cv.getContext('2d');
    const zh = root.YI && root.YI.zh;
    const F = zh ? '"ZCOOL KuaiLe"' : '"Potta One"', H = zh ? '"ZCOOL KuaiLe"' : '"Yusei Magic"';
    const rnd = root.YG.mulberry32(Math.floor((g.score || 0) * 7 + (g.stats.ok || 0) * 131 + (g.stage || 0)));
    // 背景：炭火の明かり
    ctx.fillStyle = '#1a100c'; ctx.fillRect(0, 0, S, S);
    let rg = ctx.createRadialGradient(540, 640, 40, 540, 640, 620);
    rg.addColorStop(0, 'rgba(255,120,40,.55)'); rg.addColorStop(0.55, 'rgba(160,50,20,.25)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, S, S);
    // 火の粉
    for (let i = 0; i < 40; i++) { const x = rnd() * S, y = 280 + rnd() * 760, r = 2 + rnd() * 4; ctx.fillStyle = `rgba(255,${150 + rnd() * 80 | 0},60,${0.25 + rnd() * 0.5})`; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }

    // ロゴ（左上）
    inked(ctx, jaen('焼肉', 'YAKINIKU', '烤肉'), 120, 92, 50, F, '#ff5a3a', { rot: -0.07, align: 'left', depth: 5 });
    inked(ctx, jaen('ジュー', 'JUU', '滋滋'), 84, 196, 150, F, '#ffd84d', { rot: -0.09, align: 'left', lw: 26, depth: 16, under: '#a3261b' });

    // 判子（右上）：本番はランク、ステージは★
    const sr = rnd;
    if (g.stage) {
      const n = root.YG.starsOf(g);
      hanko(ctx, 868, 196, 136, '★'.repeat(n) + '☆'.repeat(3 - n), jaen(`ステージ${g.stage}`, `Stage ${g.stage}`, `第${g.stage}关`), sr);
    } else {
      const rk = root.YG.shopRank(g);
      hanko(ctx, 868, 196, 136, rk.name, rk.word, sr);
    }

    // まな板と今日の一枚
    const { kind, e } = pickCut(g);
    board(ctx, 540, 600, 820, 300, rnd);
    if (e) {
      ctx.save(); ctx.translate(540, 596); ctx.scale(4.2, 4.2);
      root.YD.drawCut(ctx, 0, 0, e, 1.0);
      ctx.restore();
    }
    inked(ctx, SAY[kind](), 540, 392, 74, H, kind === 'perfect' || kind === 'great' ? '#fff' : '#ffb0a0', { rot: -0.035, maxW: 900 });

    // 称号とスコア
    const tt = root.YG.title(g);
    inked(ctx, jaen('今日の称号', "Today's title", '今日称号'), 540, 806, 38, H, '#ffd84d', { depth: 0, lw: 9 });
    inked(ctx, tt.name, 540, 878, 86, F, '#fff', { maxW: 960 });
    const line = g.stage
      ? jaen(`うまく焼けた ${g.stats.ok}枚`, `Grilled ${g.stats.ok} right`, `烤好了 ${g.stats.ok} 片`)
      : jaen(`売上 ¥${g.score}`, `Sales ¥${g.score}`, `营业额 ¥${g.score}`);
    inked(ctx, line, 540, 968, 52, F, '#ffd84d', { maxW: 900 });
    ctx.font = `26px ${H}`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,240,220,.6)';
    ctx.fillText(URL_TEXT, 540, 1040);
    return cv;
  }

  // 画像のファイルを作る（字の形が届くのを待ってから描く）
  function make(g) {
    const zh = root.YI && root.YI.zh;
    const fonts = zh ? ['40px "ZCOOL KuaiLe"'] : ['40px "Potta One"', '40px "Yusei Magic"'];
    const wait = document.fonts && document.fonts.load ? Promise.all(fonts.map((f) => document.fonts.load(f, jaen('焼肉ジュー今日の称号', 'JUU Today', '滋滋今日称号')).catch(() => {}))) : Promise.resolve();
    return Promise.race([wait, new Promise((r) => setTimeout(r, 2000))]).then(() => {
      const cv = document.createElement('canvas'); cv.width = S; cv.height = S;
      draw(g, cv);
      return new Promise((res) => cv.toBlob((b) => res(b ? { blob: b, file: typeof File === 'function' ? new File([b], 'ju-yakiniku.png', { type: 'image/png' }) : null, url: URL.createObjectURL(b) } : null), 'image/png'));
    });
  }

  root.YK = { make, draw, pickCut, SIZE: S };
})(window);
