// 自動で遊ぶ役。難しさ・点の出方を確かめる。 `node tools/bot.js`
// maxGrill＝同時に焼く上限、err＝人の目のずれ（焼け具合の見まちがいの幅）、react＝反応の遅れ（秒）
const YG = require('../src/sim.js');
const { CFG, TYPES } = YG;

function play(seed, maxGrill, err, react, useCarry) {
  const g = YG.newGame({ seed });
  const rnd = YG.mulberry32(seed * 7 + 1);
  const plan = {}; // meat id → { seat, target, flipAt, offAt }
  const busySeat = new Set();
  let cool = 0;
  const dt = 1 / 60;
  while (g.state !== 'over' && g.t < 200) {
    cool -= dt;
    if (cool <= 0) {
      cool = react * (1 + 0.35 * Math.max(0, YG.onGrillCount(g) - 1)); // 枚数が多いほど目が届かない
      // 1. 待っている客のために肉を置く
      const waiting = g.seats.map((s, i) => [s, i]).filter(([s, i]) => s.state === 'wait' && !busySeat.has(i));
      const free = g.grill.map((id, i) => (id ? -1 : i)).filter((i) => i >= 0);
      if (YG.onGrillCount(g) < maxGrill && free.length) {
        if (waiting.length) {
          const [s, i] = waiting.sort((a, b) => a[0].cust.patience - b[0].cust.patience)[0];
          const type = s.cust.order.type || 'kalbi';
          const slot = free.includes(0) ? 0 : free.includes(3) ? 3 : free[0];
          const id = YG.place(g, type, slot);
          if (id) { plan[id] = { seat: i, target: s.cust.order.target }; busySeat.add(i); }
        } else if (g.state === 'ready' || YG.onGrillCount(g) + g.plates.filter(Boolean).length < maxGrill) {
          // 注文の前に先に焼いておく（よくばり）
          const tg = ['hodo', 'usu', 'kon'][g.stats.placed % 3];
          const slot = free.includes(0) ? 0 : free.includes(3) ? 3 : free[0];
          const id = YG.place(g, ['kalbi', 'tan', 'harami'][g.stats.placed % 3], slot);
          if (id) plan[id] = { seat: -1, target: tg };
        }
      }
      // 2. 網の上の肉：裏返す・上げる
      for (const id of g.grill.filter(Boolean)) {
        const m = g.meats[id], p = plan[id];
        if (!p) continue;
        const T = CFG.targets[p.target];
        const carry = useCarry ? TYPES[m.type].carry * m.fireHeat : 0;
        const bot = 1 - m.up;
        const seen = (v) => v + (rnd() - 0.5) * 2 * err;
        if (m.flips === 0 && seen(m.side[bot]) >= T - carry * 0.8 - 0.02) YG.flip(g, id);
        else if (m.flips >= 1 && seen(m.side[bot]) >= T - carry - 0.02) {
          const p2 = g.plates.indexOf(null);
          if (p2 >= 0) YG.toPlate(g, id, p2);
        }
      }
      // 3. 皿の肉を出す
      for (const id of g.plates.filter(Boolean)) {
        const m = g.meats[id], p = plan[id];
        if (!m.restDone) continue;
        let seat = p && p.seat;
        if (seat < 0 || !g.seats[seat] || g.seats[seat].state !== 'wait') {
          // 一番合う客を探す
          let best = -1, bs = -1;
          g.seats.forEach((s, i) => { if (s.state === 'wait') { const r = YG.grade(m, s.cust.order); if (r.base > bs) { bs = r.base; best = i; } } });
          seat = best;
        }
        if (seat >= 0) { const r = YG.serve(g, id, seat); if (r.ok) busySeat.delete(p ? p.seat : -1); }
        else if (m.warm < CFG.warmCold) YG.discard(g, id);
      }
      g.seats.forEach((s, i) => { if (s.state !== 'wait') busySeat.delete(i); });
    }
    YG.step(g, dt);
  }
  return g;
}

const rows = [];
for (const [label, maxGrill, err, react, carry] of [
  ['ていねい（1枚）・余熱を読む', 1, 0.03, 0.25, true],
  ['ふつう（3枚）・余熱を読む', 3, 0.03, 0.25, true],
  ['よくばり（6枚）・余熱を読む', 6, 0.03, 0.25, true],
  ['ふつう（3枚）・余熱を読まない', 3, 0.03, 0.25, false],
  ['ふつう（3枚）・目が粗い', 3, 0.1, 0.4, true],
]) {
  let sum = 0, st = { perfect: 0, great: 0, good: 0, served: 0, leave: 0, carryOver: 0, fail: 0 };
  const N = 40;
  for (let s = 1; s <= N; s++) {
    const g = play(s, maxGrill, err, react, carry);
    sum += g.score;
    for (const k of ['perfect', 'great', 'good', 'served', 'leave', 'carryOver']) st[k] += g.stats[k];
    st.fail += g.stats.raw + g.stats.halfraw + g.stats.burnt + g.stats.char + g.stats.cold;
  }
  rows.push([label, Math.round(sum / N), ...['served', 'perfect', 'great', 'good', 'leave', 'carryOver', 'fail'].map((k) => (st[k] / N).toFixed(1))]);
}
console.log('作戦\t平均点\t出した\t神焼き\tうまい\tふつう\t帰った\t余熱焼けすぎ\t失敗');
for (const r of rows) console.log(r.join('\t'));
