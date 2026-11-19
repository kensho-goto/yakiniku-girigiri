// 焼肉ギリギリ：画面の流れ・操作・演出。ゲームの中身は sim.js（YG）にある
(function () {
  'use strict';
  const { L, W, H } = YD;
  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const STEP = 1 / 60;

  let g = null; // いまのゲーム
  let mode = 'title'; // title / play / result
  let acc = 0, last = null, clock = 0;
  let held = null; // トングで持っているもの { kind:'new', type } / { kind:'meat', id }
  let ptr = null; // 押している指
  let fx = []; // 演出（文字・粒）
  const react = [null, null, null]; // 客ごとの反応
  let shake = 0;
  let endAt = 0;
  let tut = 0; // はじめての説明の段階（0〜4、4で終わり）
  let lastTick = -1;
  let banners = []; // 画面のまん中に出す大きな知らせ（操作は止めない）
  let rankIdx = 0, rankPop = 0;

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 保存できなくても遊べる */ } },
  };

  // ===== 画面の大きさ =====
  let scale = 1, ox = 0, oy = 0, dpr = 1;
  function resize() {
    dpr = Math.min(3, window.devicePixelRatio || 1);
    const cw = window.innerWidth, ch = window.innerHeight;
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    scale = Math.min(cw / W, ch / H);
    ox = (cw - W * scale) / 2; oy = Math.max(0, (ch - H * scale) / 2);
  }
  window.addEventListener('resize', resize);
  resize();
  function toLogical(e) {
    const r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left - ox) / scale, y: (e.clientY - r.top - oy) / scale };
  }

  // ===== はじまり・おわり =====
  function newRun() {
    tut = store.get('yaki.tut', 0) >= 4 ? 4 : 0;
    g = YG.newGame({ tutorial: tut < 4 });
    held = null; ptr = null; fx = []; react.fill(null); shake = 0; endAt = 0; lastTick = -1;
    banners = []; rankIdx = 0; rankPop = 0;
    acc = 0; last = null;
    mode = 'play';
    ['title', 'pause', 'result'].forEach((id) => { $(id).hidden = true; });
    YS.unlock();
  }
  function pause(on) {
    if (!g || mode !== 'play' || g.state === 'over') return;
    g.paused = on;
    $('pause').hidden = !on;
    held = null; ptr = null;
    if (on) YS.silence();
    last = null; // もどったときに、離れていた時間をまとめて足さない
  }
  function toTitle() {
    mode = 'title'; g = null;
    ['pause', 'result'].forEach((id) => { $(id).hidden = true; });
    $('title').hidden = false;
    YS.silence();
    showBest();
  }
  function showBest() {
    const b = store.get('yaki.best', 0);
    const br = store.get('yaki.bestRank', null);
    $('titleBest').innerHTML = b ? `自己ベスト <b>${b}</b>` + (br ? `　最高ランク <b>${br}</b>` : '') : '';
  }
  showBest();
  $('startBtn').onclick = newRun;
  $('againBtn').onclick = newRun;
  $('resumeBtn').onclick = () => pause(false);
  $('retryBtn').onclick = newRun;
  $('toTitleBtn').onclick = toTitle;
  $('rTitleBtn').onclick = toTitle;
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); });
  window.addEventListener('blur', () => pause(true));

  function showResult() {
    mode = 'result';
    YS.silence();
    const best = store.get('yaki.best', 0);
    const isNew = g.score > best;
    if (isNew) store.set('yaki.best', g.score);
    store.set('yaki.plays', store.get('yaki.plays', 0) + 1);
    $('rScore').textContent = g.score;
    // ランクの判子
    const rk = YG.shopRank(g);
    const order = ['kikaku', 'C', 'B', 'A3', 'A4', 'A5', 'tokusen'];
    const bestRank = store.get('yaki.bestRank', null);
    const rkName = rk.key === 'kikaku' ? null : rk.name;
    if (rkName && (!bestRank || order.indexOf(rk.key === 'tokusen' ? 'tokusen' : rk.key) > order.indexOf(bestRank === '特選A5' ? 'tokusen' : bestRank))) store.set('yaki.bestRank', rkName);
    const stamp = $('rRank');
    stamp.className = 'rank r-' + rk.key;
    stamp.innerHTML = `<span class="rk">${rk.name}</span><span class="rw">${rk.key === 'kikaku' ? '（売上だけなら ' + rk.byScore + '）' : rk.word}</span>`;
    stamp.classList.remove('go'); void stamp.offsetWidth; stamp.classList.add('go');
    const nx = rk.key !== 'tokusen' && rk.next;
    $('rNext').innerHTML = rk.key === 'kikaku' ? '焦がしすぎて格付けできません' : nx ? `${nx.key}まで あと <b>${nx.need}</b>点` : rk.key === 'A5' ? '失敗なし＋神焼き5枚で <b>特選A5</b>' : '最高ランク！';
    setTimeout(() => { if (mode === 'result') { YS.stamp(); YS.applause(Math.max(0, rk.index)); } }, 350);
    $('rNew').innerHTML = isNew && g.score > 0 ? '<span class="new">自己ベスト更新！</span>' : '';
    $('rBest').innerHTML = `自己ベスト <b>${Math.max(best, g.score)}</b>`;
    const tt = YG.title(g);
    $('rTitle').textContent = tt.name;
    $('rWhy').textContent = '（' + tt.why + '）';
    const st = g.stats;
    const cells = [['神焼き', st.perfect], ['うまい', st.great], ['フィーバー', g.fevers], ['審査員○', (st.vipWin || 0) + '/' + (st.vipCame || 0)],
      ['ナマ', st.raw + st.halfraw], ['コゲ・炭', st.burnt + st.char], ['冷め', st.cold], ['帰った', st.leave]];
    $('rStats').innerHTML = cells.map(([k, v]) => `<div><b>${v}</b>${k}</div>`).join('');
    const ls = YG.lessons(g).slice(0, 3);
    $('rLessons').innerHTML = ls.length
      ? '<div style="background:none;padding:0;color:#ffd9b0">ふりかえり</div>' + ls.map((l) => `<div><b>${l.text} ×${l.n}</b><small>${l.tip}</small></div>`).join('')
      : (st.served ? '<div>失敗なし！ 次はもっと置いてにぎやかに</div>' : '');
    $('result').hidden = false;
  }

  // ===== 当たり判定 =====
  function hit(x, y) {
    if (y < 46) {
      if (x > 340) return { kind: 'pause' };
      if (x > 290) return { kind: 'sound' };
      return null;
    }
    for (let i = 0; i < 6; i++) {
      const s = L.slot(i);
      if (Math.abs(x - s.x) < L.slotW / 2 && Math.abs(y - s.y) < L.slotH / 2) return { kind: 'slot', i, id: g.grill[i] };
    }
    for (let p = 0; p < 3; p++) {
      if (Math.abs(x - L.plateX[p]) < 46 && Math.abs(y - L.plateY) < 44) return { kind: 'plate', p, id: g.plates[p] };
    }
    const tb = L.trash;
    if (Math.abs(x - tb.x) < 40 && Math.abs(y - tb.y) < 52) return { kind: 'trash' };
    if (y > 46 && y < L.counterY + 8) {
      for (let i = 0; i < 3; i++) if (Math.abs(x - L.seatX[i]) < 66) return { kind: 'seat', i };
    }
    if (y > L.trayY - 56 && y < L.trayY + 60) {
      for (let i = 0; i < 4; i++) if (Math.abs(x - L.trayX[i]) < 47) return { kind: 'tray', type: YG.TRAY_KEYS[i] };
    }
    return null;
  }

  // ===== 操作 =====
  cv.addEventListener('pointerdown', (e) => {
    YS.unlock();
    if (mode !== 'play' || !g || g.paused || g.state === 'over') return;
    if (ptr) return; // 2本目の指は使わない
    cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
    const p = toLogical(e);
    const h = hit(p.x, p.y);
    ptr = { id: e.pointerId, sx: p.x, sy: p.y, x: p.x, y: p.y, h, drag: null, handled: false, t0: performance.now() };
    // 網の肉を長押し → トングで持つ（ドラッグしなくても動かせる）
    if (h && h.kind === 'slot' && h.id) {
      ptr.long = setTimeout(() => {
        if (ptr && !ptr.drag && ptr.h === h) { held = { kind: 'meat', id: h.id }; ptr.handled = true; navigator.vibrate && navigator.vibrate(15); }
      }, 380);
    }
    e.preventDefault();
  });
  cv.addEventListener('pointermove', (e) => {
    if (!ptr || e.pointerId !== ptr.id) return;
    const p = toLogical(e);
    ptr.x = p.x; ptr.y = p.y;
    if (!ptr.drag && Math.hypot(p.x - ptr.sx, p.y - ptr.sy) > 12) {
      const h = ptr.h;
      if (h && h.kind === 'tray' && (h.type !== 'toku' || g.toku > 0)) ptr.drag = { kind: 'new', type: h.type };
      else if (h && (h.kind === 'slot' || h.kind === 'plate') && h.id && g.meats[h.id] && g.meats[h.id].loc !== 'gone') ptr.drag = { kind: 'meat', id: h.id };
      if (ptr.drag) { clearTimeout(ptr.long); held = null; }
    }
  });
  function endPtr(e, cancel) {
    if (!ptr || e.pointerId !== ptr.id) return;
    clearTimeout(ptr.long);
    const p = toLogical(e);
    const P = ptr;
    ptr = null;
    if (cancel || !g || g.paused || g.state === 'over') return;
    if (P.drag) { drop(P.drag, hit(p.x, p.y)); return; }
    if (!P.handled) tap(P.h);
  }
  cv.addEventListener('pointerup', (e) => endPtr(e, false));
  cv.addEventListener('pointercancel', (e) => endPtr(e, true));

  function tap(h) {
    if (!h) { held = null; return; }
    if (h.kind === 'pause') { pause(true); return; }
    if (h.kind === 'sound') { YS.setMuted(!YS.muted); return; }
    if (h.kind === 'tray' && h.type === 'toku' && g.toku <= 0) { YS.deny(); float(L.trayX[3], L.trayY - 60, '審査員が来たら焼ける', '#ffd84d', 13); held = null; return; }
    if (h.kind === 'tray') { held = held && held.kind === 'new' && held.type === h.type ? null : { kind: 'new', type: h.type }; return; }
    if (h.kind === 'slot') {
      if (h.id) { // 置いてある肉：タップで裏返す
        if (held && held.kind === 'meat' && held.id === h.id) { held = null; return; }
        if (!(held && held.kind === 'new')) held = null;
        YG.flip(g, h.id);
        return;
      }
      if (held) return drop(held, h, true);
      return;
    }
    if (h.kind === 'plate') {
      if (h.id) { held = held && held.id === h.id ? null : { kind: 'meat', id: h.id }; return; }
      if (held && held.kind === 'meat') return drop(held, h, true);
      return;
    }
    if (h.kind === 'trash' || h.kind === 'seat') { if (held && held.kind === 'meat') return drop(held, h, true); }
    held = null;
  }

  function drop(src, h, viaTap) {
    if (!h) { if (!viaTap) held = null; return; }
    if (src.kind === 'new') {
      if (h.kind === 'slot' && !h.id) {
        if (!YG.place(g, src.type, h.i)) YS.deny();
        if (src.type === 'toku' && g.toku <= 0) held = null;
        if (!viaTap) held = null; // タップで持っているときは、続けて置ける
      } else if (h.kind === 'slot') YS.deny();
      return;
    }
    const m = g.meats[src.id];
    held = null;
    if (!m || m.loc === 'gone') return;
    if (h.kind === 'slot') { if (!h.id) YG.moveToSlot(g, m.id, h.i); else if (h.id !== m.id) YS.deny(); return; }
    if (h.kind === 'plate') {
      if (h.id == null) YG.toPlate(g, m.id, h.p);
      else if (h.id !== m.id) { YS.deny(); float(L.plateX[h.p], L.plateY - 40, '皿がいっぱい', '#ffb3a0', 13); }
      return;
    }
    if (h.kind === 'trash') { YG.discard(g, m.id); return; }
    if (h.kind === 'seat') {
      if (m.loc === 'grill') { YS.deny(); float(L.seatX[h.i], 130, 'まず皿へ', '#ffb3a0', 14); return; }
      const r = YG.serve(g, m.id, h.i);
      if (!r.ok && r.why === 'resting') { YS.deny(); float(L.plateX[m.plate], L.plateY - 44, '余熱中…まだ出せない', '#ffd0a0', 13); }
    }
  }

  // ===== 演出 =====
  function float(x, y, text, color, size, life) { fx.push({ k: 'text', x, y, text, color, size: size || 18, t: 0, life: life || 1.1 }); }
  function burst(x, y, n, color, spread, up) {
    for (let i = 0; i < n; i++) fx.push({ k: 'dot', x, y, vx: (Math.random() - 0.5) * spread, vy: -Math.random() * (up || 120), color, t: 0, life: 0.6 + Math.random() * 0.5, r: 2 + Math.random() * 3 });
  }
  function banner(text, sub, color, life) { banners = []; banners.push({ text, sub, color, t: 0, life: life || 1.6 }); }
  function smoke(x, y, dark) { fx.push({ k: 'smoke', x: x + (Math.random() - 0.5) * 40, y, vx: (Math.random() - 0.5) * 10, vy: -30 - Math.random() * 20, t: 0, life: 1.4, r: 8, dark }); }

  const RANK_TEXT = { perfect: '神焼き!!', great: 'うまい!', good: 'ふつう', meh: 'いまいち', miss: 'ちがう…', raw: 'ナマ!', halfraw: '片面ナマ', burnt: 'コゲ', char: '炭', cold: '冷めた', leave: '帰った' };
  const nReact = {};
  function handleEvents() {
    const evs = g.events; g.events = [];
    for (const ev of evs) {
      if (ev.type === 'place') { YS.place(); const s = L.slot(ev.slot); burst(s.x, s.y, 8, '#fff6', 60, 60); if (tut === 0) setTut(1); }
      else if (ev.type === 'flip') { YS.flip(); if (tut === 1) setTut(2); }
      else if (ev.type === 'move') YS.flip();
      else if (ev.type === 'plate') { YS.plate(); if (tut <= 2 && ev.fromGrill) setTut(3); }
      else if (ev.type === 'discard') YS.discard();
      else if (ev.type === 'rested') { YS.rested(); burst(L.plateX[ev.plate], L.plateY, 6, '#ffd84d', 80, 60); }
      else if (ev.type === 'burning') { YS.burning(); }
      else if (ev.type === 'fever') { YS.fever(); banner('フィーバー！', '10秒間 点数×' + YG.CFG.feverMult, '#ffd84d'); burst(200, 460, 50, '#ffd84d', 400, 300); }
      else if (ev.type === 'feverMore') { YS.fever(); banner('フィーバー延長！', '+' + YG.CFG.feverTime + '秒', '#ffd84d', 1.2); }
      else if (ev.type === 'feverEnd') { YS.feverEnd(); if (ev.broken) banner('フィーバー終了…', '失敗でメーターが0に', '#ff9a8a', 1.2); }
      else if (ev.type === 'vip') { YS.vip(); banner('審査員が来た！', '特上カルビで 点数×' + YG.CFG.vipMult, '#ffd84d', 2); }
      else if (ev.type === 'lastOrder') { YS.lastOrder(); banner('ラストオーダー！', '客がどっと来る', '#ff7a2f', 1.6); }
      else if (ev.type === 'leave') {
        YS.leave();
        if (ev.vip) banner('審査員が帰った…', '', '#ff9a8a', 1.2);
        const seat = g.seats[ev.seat];
        react[ev.seat] = YL.line({ fail: 'leave', rank: 'fail' }, seat.cust.char, bump('leave'));
      } else if (ev.type === 'serve') {
        const e = ev.entry, r = e.result;
        const info = YL.line(r, e.char, bump(YL.reactKey(r)));
        react[ev.seat] = info;
        const x = L.seatX[ev.seat];
        const key = r.fail || r.rank;
        const good = r.rank === 'perfect' || r.rank === 'great';
        float(x, 140, RANK_TEXT[key] || '', r.rank === 'perfect' ? '#ffd84d' : good ? '#fff' : r.rank === 'good' ? '#ffe9c0' : '#ff9a8a', r.rank === 'perfect' ? 28 : 22, 1.3);
        if (e.pts) float(x, 168, '+' + e.pts, '#ffd84d', 20, 1.3);
        if (e.combo >= 2 && good) float(200, 300, e.combo + 'コンボ!', '#ff7a2f', 26, 1.0);
        if (r.rank === 'perfect') { YS.perfect(); burst(x, 150, 40, '#ffd84d', 260, 220); burst(x, 150, 20, '#ff7a2f', 220, 180); }
        else if (r.rank === 'great') { YS.great(); burst(x, 150, 16, '#ffd84d', 160, 140); }
        else if (r.rank === 'good') YS.good();
        else if (r.fail === 'raw' || r.fail === 'halfraw') YS.moo();
        else if (r.fail === 'char') { YS.char(); shake = 0.35; }
        else if (r.fail === 'burnt') YS.char();
        else if (r.fail === 'cold') YS.cold();
        else if (r.rank === 'meh') YS.meh();
        else YS.fail();
        if (tut === 3) setTut(4);
      } else if (ev.type === 'end') { YS.end(); endAt = clock; }
    }
  }
  function bump(k) { nReact[k] = (nReact[k] || 0) + 1; return nReact[k] - 1; }
  function setTut(n) { tut = n; if (n >= 4) store.set('yaki.tut', 4); }

  // ===== まわす =====
  function frame(ts) {
    requestAnimationFrame(frame);
    const now = ts / 1000;
    let dt = last == null ? 0 : now - last;
    last = now;
    dt = Math.min(dt, 0.1); // 画面が止まっても、まとめて進めない
    clock += dt;
    const playing = mode === 'play' && g && !g.paused && g.state === 'play';
    YS.bgm(playing ? (g.feverLeft > 0 ? 'fever' : g.lastOrder ? 'last' : 'normal') : 'off');
    if (mode === 'play' && g && !g.paused) {
      acc += dt;
      while (acc >= STEP) { YG.step(g, STEP); acc -= STEP; }
      handleEvents();
      // ランクが上がったら、上の欄でポンと知らせる
      const ri = scoreRank(g.score);
      if (ri > rankIdx) { rankIdx = ri; rankPop = 1; YS.rankUp(); }
      // フィーバー中は火の粉が舞う
      if (g.feverLeft > 0 && Math.random() < dt * 30) fx.push({ k: 'dot', x: 20 + Math.random() * 360, y: 610, vx: (Math.random() - 0.5) * 30, vy: -260 - Math.random() * 120, color: Math.random() < 0.5 ? '#ffd84d' : '#ff7a2f', t: 0, life: 1.2, r: 2 + Math.random() * 2, float: true });
      // 煙（下の面が焦げはじめたら）
      for (let i = 0; i < 6; i++) {
        const id = g.grill[i]; if (!id) continue;
        const m = g.meats[id];
        const b = m.side[1 - m.up];
        const s = L.slot(i);
        if (b > 1.15 && Math.random() < dt * (b > YG.CFG.burnt ? 14 : 5)) smoke(s.x, s.y - 10, b > YG.CFG.burnt);
        if (YG.fireName(i) === 'strong' && (m.type === 'kalbi' || m.type === 'toku') && Math.random() < dt * 3) burst(s.x + (Math.random() - 0.5) * 50, s.y + 20, 2, '#ffb030', 40, 120);
      }
      let sz = 0;
      g.grill.forEach((id, i) => { if (id) sz += YG.CFG.fires[i] * (1 + (g.meats[id].side[1 - g.meats[id].up] > 1.2 ? 0.8 : 0)); });
      if (g.state === 'over') YS.silence(); else YS.sizzle(sz);
      // 残り5秒の音
      if (g.state === 'play' && g.timeLeft <= 5) { const s = Math.ceil(g.timeLeft); if (s !== lastTick) { lastTick = s; YS.tick(); } }
      if (g.state === 'over' && endAt && clock - endAt > 1.4 && mode === 'play') showResult();
    }
    for (const f of fx) { f.t += dt; if (f.k !== 'text') { f.x += (f.vx || 0) * dt; f.y += (f.vy || 0) * dt; if (f.k === 'dot' && !f.float) f.vy += 300 * dt; } }
    for (const b of banners) b.t += dt;
    banners = banners.filter((b) => b.t < b.life);
    rankPop = Math.max(0, rankPop - dt * 0.8);
    fx = fx.filter((f) => f.t < f.life);
    shake = Math.max(0, shake - dt);
    render();
  }

  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#1a100c';
    ctx.fillRect(0, 0, cv.width, cv.height);
    const sx = shake ? (Math.random() - 0.5) * 8 : 0, sy = shake ? (Math.random() - 0.5) * 8 : 0;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (ox + sx), dpr * (oy + sy));
    const t = clock;
    YD.drawBackground(ctx, t);
    if (!g) { renderIdle(t); return; }
    const dragging = ptr && ptr.drag;
    const carrying = dragging || held;
    const carryMeat = carrying && carrying.kind === 'meat' ? g.meats[carrying.id] : null;
    // 客
    for (let i = 0; i < 3; i++) {
      const seat = g.seats[i];
      if (seat.state === 'empty') react[i] = null;
      YD.drawCustomer(ctx, seat, i, t, react[i]);
    }
    for (let i = 0; i < 3; i++) {
      const seat = g.seats[i];
      const target = carryMeat && carryMeat.loc === 'plate' && seat.state === 'wait' && (!dragging || hitSeat(ptr, i));
      YD.drawOrder(ctx, seat, i, t, { target });
      if (seat.state === 'react' || seat.state === 'leave') YD.drawReact(ctx, seat, i, react[i], t);
    }
    // 皿・炭入れ
    for (let p = 0; p < 3; p++) {
      const id = g.plates[p];
      const m = id ? g.meats[id] : null;
      const hint = carryMeat && carryMeat.loc === 'grill' && !id;
      YD.drawPlate(ctx, p, m, t, { hint, selected: held && held.kind === 'meat' && held.id === id, hideMeat: dragging && ptr.drag.id === id });
    }
    YD.drawTrash(ctx, t, { hint: !!carryMeat });
    // 網
    const hint = carrying ? g.grill.map((id) => !id) : null;
    YD.drawGrill(ctx, t, { hint, fever: g.feverLeft > 0 });
    for (let i = 0; i < 6; i++) {
      const id = g.grill[i]; if (!id) continue;
      if (dragging && ptr.drag.id === id) continue;
      const s = L.slot(i);
      const m = g.meats[id];
      const bob = Math.sin(t * 12 + id) * 0.4;
      YD.drawMeat(ctx, m, s.x, s.y + 6 + bob, { scale: 1.12, onGrill: true, t, selected: held && held.kind === 'meat' && held.id === id });
    }
    YD.drawTray(ctx, t, held && held.kind === 'new' ? held.type : null, g.toku);
    // 演出
    for (const f of fx) {
      const a = 1 - f.t / f.life;
      if (f.k === 'smoke') {
        ctx.fillStyle = f.dark ? `rgba(30,30,30,${0.55 * a})` : `rgba(200,200,200,${0.35 * a})`;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r + f.t * 16, 0, 7); ctx.fill();
      } else if (f.k === 'dot') {
        ctx.globalAlpha = a; ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
      }
    }
    // ドラッグ中の肉（指で隠れないよう少し上に）
    if (dragging) {
      if (ptr.drag.kind === 'new') YD.drawMeat(ctx, YD.trayMeat(ptr.drag.type), ptr.x, ptr.y - 34, { scale: 1, lift: 6, t });
      else YD.drawMeat(ctx, g.meats[ptr.drag.id], ptr.x, ptr.y - 34, { scale: 1, lift: 6, t });
    }
    for (const f of fx) {
      if (f.k !== 'text') continue;
      const a = Math.min(1, (1 - f.t / f.life) * 2.5);
      const pop = Math.min(1, f.t * 8);
      ctx.save(); ctx.globalAlpha = a; ctx.translate(f.x, f.y - f.t * 26); ctx.scale(0.6 + 0.4 * pop, 0.6 + 0.4 * pop);
      ctx.font = `${f.size}px "Dela Gothic One", "Hiragino Sans", sans-serif`; ctx.textAlign = 'center';
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(40,10,0,0.9)'; ctx.strokeText(f.text, 0, 0);
      ctx.fillStyle = f.color; ctx.fillText(f.text, 0, 0);
      ctx.restore();
    }
    // 大きな知らせ（網の上に重ねる。操作は止めない）
    for (const b of banners) {
      const k = b.t / b.life;
      const pop = Math.min(1, b.t * 7);
      const a = Math.min(1, (1 - k) * 4);
      ctx.save(); ctx.globalAlpha = a;
      ctx.translate(200, 218 - k * 10); ctx.scale(0.5 + 0.5 * pop + (pop < 1 ? 0.2 : 0), 0.5 + 0.5 * pop);
      ctx.fillStyle = 'rgba(30,10,0,0.78)'; YD.roundRect(ctx, -170, -40, 340, b.sub ? 76 : 56, 18); ctx.fill();
      ctx.font = '34px "Dela Gothic One", "Hiragino Sans", sans-serif'; ctx.textAlign = 'center';
      ctx.lineWidth = 7; ctx.strokeStyle = '#3a0e00'; ctx.strokeText(b.text, 0, 0);
      ctx.fillStyle = b.color; ctx.fillText(b.text, 0, 0);
      if (b.sub) { ctx.font = 'bold 15px "Hiragino Sans", sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(b.sub, 0, 26); }
      ctx.restore();
    }
    renderHud(t);
    renderTutorial(t);
    if (g.state === 'over') {
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, H);
      bigText('そこまで！', 200, 380, 52, '#ffd84d');
    }
  }
  function hitSeat(p, i) { return p && p.y < L.counterY + 8 && Math.abs(p.x - L.seatX[i]) < 66; }
  function bigText(text, x, y, size, color) {
    ctx.font = `${size}px "Dela Gothic One", "Hiragino Sans", sans-serif`; ctx.textAlign = 'center';
    ctx.lineWidth = 8; ctx.strokeStyle = '#3a0e00'; ctx.strokeText(text, x, y);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  }
  function scoreRank(score) { let i = 0; YG.CFG.ranks.forEach((r, k) => { if (score >= r.min) i = k; }); return i; }
  const RANK_COLOR = { C: ['#6b6b6b', '#fff'], B: ['#b0703a', '#fff'], A3: ['#c9ced6', '#2a2a2a'], A4: ['#ffd84d', '#3a1a00'], A5: ['#ff5a8a', '#fff'] };
  function renderHud(t) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, W, 44);
    // フィーバーのメーター（上の欄の下の細い帯）
    const F = YG.CFG;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 44, W, 6);
    if (g.feverLeft > 0) {
      ctx.fillStyle = `hsl(${(t * 400) % 360},90%,60%)`;
      ctx.fillRect(0, 44, W * Math.min(1, g.feverLeft / F.feverTime), 6);
    } else {
      ctx.fillStyle = '#ff7a2f'; ctx.fillRect(0, 44, W * Math.min(1, g.feverGauge / F.feverNeed), 6);
    }
    // いまのランクと、次までの近さ
    const ri = scoreRank(g.score);
    const rk = F.ranks[ri];
    const nx = F.ranks[ri + 1];
    const col = RANK_COLOR[rk.key];
    const pop = 1 + rankPop * 0.5;
    ctx.save(); ctx.translate(262, 18); ctx.scale(pop, pop);
    ctx.fillStyle = col[0]; YD.roundRect(ctx, -24, -12, 48, 22, 7); ctx.fill();
    ctx.font = '15px "Dela Gothic One", "Hiragino Sans", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = col[1];
    ctx.fillText(rk.key, 0, 5);
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(238, 34, 48, 4);
    if (nx) { ctx.fillStyle = col[0]; ctx.fillRect(238, 34, 48 * Math.min(1, (g.score - rk.min) / (nx.min - rk.min)), 4); }
    else { ctx.fillStyle = col[0]; ctx.fillRect(238, 34, 48, 4); }
    if (rankPop > 0) { // ランクアップの知らせ
      ctx.save(); ctx.globalAlpha = Math.min(1, rankPop * 2);
      ctx.font = '14px "Dela Gothic One", "Hiragino Sans", sans-serif'; ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = '#3a0e00'; ctx.strokeText('ランクUP!', 262, 66 - (1 - rankPop) * 8);
      ctx.fillStyle = '#ffd84d'; ctx.fillText('ランクUP!', 262, 66 - (1 - rankPop) * 8);
      ctx.restore();
    }
    const tl = Math.ceil(g.timeLeft);
    const hurry = g.state === 'play' && g.timeLeft <= 10;
    ctx.save(); ctx.translate(200, 32);
    if (hurry) { const p = 1 + 0.12 * Math.max(0, Math.sin(t * 12)); ctx.scale(p, p); }
    ctx.font = '30px "Dela Gothic One", "Hiragino Sans", sans-serif'; ctx.textAlign = 'center';
    ctx.lineWidth = 5; ctx.strokeStyle = '#3a0e00'; ctx.strokeText(String(tl), 0, 0);
    ctx.fillStyle = hurry ? '#ff5a3a' : '#fff'; ctx.fillText(String(tl), 0, 0);
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.font = '11px "Hiragino Sans", sans-serif'; ctx.fillStyle = '#ffd9b0'; ctx.fillText('売上', 10, 16);
    ctx.font = '20px "Dela Gothic One", "Hiragino Sans", sans-serif'; ctx.fillStyle = '#ffd84d'; ctx.fillText(String(g.score), 10, 38);
    if (g.combo >= 2) { ctx.font = '14px "Dela Gothic One", "Hiragino Sans", sans-serif'; ctx.fillStyle = '#ff7a2f'; ctx.fillText(g.combo + 'コンボ', 82, 20); }
    const busy = YG.onGrillCount(g);
    if (busy >= 3) { ctx.font = 'bold 11px "Hiragino Sans", sans-serif'; ctx.fillStyle = '#ffd9b0'; ctx.textAlign = 'left'; ctx.fillText('にぎわい×' + (1 + YG.CFG.busyStep * (busy - 1)).toFixed(1), 82, 38); }
    // 音・一時停止ボタン
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    YD.roundRect(ctx, 296, 6, 38, 32, 10); ctx.fill();
    YD.roundRect(ctx, 344, 6, 46, 32, 10); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(360, 13, 5, 18); ctx.fillRect(370, 13, 5, 18);
    // スピーカー
    ctx.beginPath(); ctx.moveTo(303, 18); ctx.lineTo(309, 18); ctx.lineTo(316, 12); ctx.lineTo(316, 32); ctx.lineTo(309, 26); ctx.lineTo(303, 26); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    if (YS.muted) { ctx.beginPath(); ctx.moveTo(319, 16); ctx.lineTo(327, 28); ctx.moveTo(327, 16); ctx.lineTo(319, 28); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(316, 22, 7, -0.8, 0.8); ctx.stroke(); ctx.beginPath(); ctx.arc(316, 22, 12, -0.8, 0.8); ctx.stroke(); }
    if (g.state === 'ready') {
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; YD.roundRect(ctx, 70, 228, 260, 34, 17); ctx.fill();
      ctx.font = 'bold 14px "Hiragino Sans", sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.fillText('最初の1枚を置いたらスタート', 200, 250);
    }
  }
  // はじめての1回：やることを、その場所に1つずつ出す
  function renderTutorial(t) {
    if (tut >= 4 || g.state === 'over') return;
    let x, y, text, dir = 1;
    if (tut === 0) { x = L.trayX[1]; y = L.trayY - 62; text = 'カルビを網へドラッグ'; }
    else if (tut === 1) {
      const id = g.grill.find((v) => v); if (!id) return;
      const m = g.meats[id]; const s = L.slot(g.grill.indexOf(id));
      if (m.side[1 - m.up] < 0.45) { x = s.x; y = s.y + 66; text = '肉汁が浮いてきたら…'; dir = -1; }
      else { x = s.x; y = s.y + 66; text = 'タップで裏返す！'; dir = -1; }
    } else if (tut === 2) {
      const id = g.grill.find((v) => v); if (!id) return;
      const m = g.meats[id]; const s = L.slot(g.grill.indexOf(id));
      if (Math.min(m.side[0], m.side[1]) < 0.55) { x = s.x; y = s.y + 66; text = '裏も焼けるまで待つ'; dir = -1; }
      else { x = L.plateX[1]; y = L.plateY + 56; text = '皿へドラッグ（余熱で少し焼ける）'; dir = -1; }
    } else if (tut === 3) {
      const pid = g.plates.find((v) => v);
      const m = pid && g.meats[pid];
      if (m && m.restDone) { x = 200; y = 232; text = '注文した客へドラッグ'; dir = -1; }
      else { x = 200; y = 232; text = '余熱が終わるまで待つ'; }
    }
    if (!text) return;
    ctx.font = 'bold 15px "Hiragino Sans", sans-serif';
    const w = ctx.measureText(text).width + 24;
    const bx = Math.max(8, Math.min(W - 8 - w, x - w / 2));
    const bob = Math.sin(t * 5) * 3;
    ctx.fillStyle = '#ffd84d';
    YD.roundRect(ctx, bx, y - 16 + bob, w, 32, 16); ctx.fill();
    ctx.beginPath();
    const ay = dir > 0 ? y + 16 + bob : y - 16 + bob;
    ctx.moveTo(x - 8, ay); ctx.lineTo(x, ay + 10 * dir); ctx.lineTo(x + 8, ay); ctx.fill();
    ctx.fillStyle = '#3a1a00'; ctx.textAlign = 'center';
    ctx.fillText(text, bx + w / 2, y + 5 + bob);
  }

  // タイトルの後ろ：網の上で肉が焼けていく
  const demo = YG.newGame({ seed: 7 });
  [[0, 'tan'], [1, 'kalbi'], [2, 'harami'], [4, 'kalbi'], [5, 'tan']].forEach(([s, ty]) => YG.place(demo, ty, s));
  demo.seats.forEach((s) => { s.nextIn = 1e9; });
  function renderIdle(t) {
    YD.drawGrill(ctx, t);
    // 焼けすぎないよう、ときどき裏返して、炭になったら生に戻す（見本だけ）
    for (let i = 0; i < 6; i++) {
      const id = demo.grill[i]; if (!id) continue;
      const m = demo.meats[id];
      if (m.side[1 - m.up] > 0.9) YG.flip(demo, id);
      if (Math.min(...m.side) > 1.0) { m.side = [0, 0]; }
    }
    demo.t = 0; YG.step(demo, 1 / 60);
    demo.events = [];
    for (let i = 0; i < 6; i++) { const id = demo.grill[i]; if (id) { const s = L.slot(i); YD.drawMeat(ctx, demo.meats[id], s.x, s.y, { onGrill: true, t }); } }
    YD.drawTray(ctx, t, null);
  }

  // テスト用（ブラウザの開発ツールから触る）
  window.__yaki = { get g() { return g; }, newRun, YG, pause, store, get mode() { return mode; } };
  requestAnimationFrame(frame);
})();
