// 焼け方・余熱・採点・状態管理のテスト。`npm test` で動く
const test = require('node:test');
const assert = require('node:assert');
const YG = require('../src/sim.js');
const { CFG } = YG;
const DT = 1 / 60;

function run(g, sec, dt = DT) {
  const n = Math.round(sec / dt);
  for (let i = 0; i < n; i++) YG.step(g, dt);
}
// 客を席0に「待っている」状態で置く（テスト用）
function seatCustomer(g, order, i = 0) {
  const s = g.seats[i];
  s.state = 'wait';
  s.cust = { char: 0, order, patience: 999, maxPatience: 999, n: 0 };
}
function freezeCustomers(g) { g.seats.forEach((s) => { s.nextIn = 1e9; }); }

test('片面ナマ・片面コゲは、平均がちょうどよくても成功にならない', () => {
  const m = { side: [0.1, 1.5], warm: 1, type: 'kalbi' }; // 平均 0.8＝ほどよく
  const r = YG.grade(m, { type: null, target: 'hodo' });
  assert.equal(r.rank, 'fail');
  assert.equal(r.fail, 'halfraw');
  assert.equal(r.base, 0);
});

test('両面がちょうどよければ神焼き、少しずれても点は入る', () => {
  const T = CFG.targets.hodo;
  assert.equal(YG.grade({ side: [T, T + 0.02], warm: 1, type: 'tan' }, { type: null, target: 'hodo' }).rank, 'perfect');
  const g2 = YG.grade({ side: [T + 0.15, T], warm: 1, type: 'tan' }, { type: null, target: 'hodo' });
  assert.equal(g2.rank, 'good');
  assert.ok(g2.base > 0);
});

test('焼きすぎた肉も、こんがり派に回せば救える', () => {
  const m = { side: [1.02, 1.08], warm: 1, type: 'kalbi' };
  assert.ok(['meh', 'miss'].includes(YG.grade(m, { type: null, target: 'usu' }).rank));
  assert.equal(YG.grade(m, { type: null, target: 'kon' }).rank, 'perfect');
});

test('焦げは、どの客に出しても救えない', () => {
  const m = { side: [1.4, 1.2], warm: 1, type: 'kalbi' };
  for (const t of YG.TARGET_KEYS) assert.equal(YG.grade(m, { type: null, target: t }).fail, 'burnt');
});

test('冷めた肉は失敗、ぬるい肉は1段下がる', () => {
  const T = CFG.targets.hodo;
  assert.equal(YG.grade({ side: [T, T], warm: 0.05, type: 'tan' }, { type: null, target: 'hodo' }).fail, 'cold');
  assert.equal(YG.grade({ side: [T, T], warm: 0.3, type: 'tan' }, { type: null, target: 'hodo' }).rank, 'great');
});

test('網の上では下の面だけが大きく焼け、裏返すと反対の面が焼ける', () => {
  const g = YG.newGame({ seed: 1 });
  freezeCustomers(g);
  const id = YG.place(g, 'kalbi', 0);
  run(g, 3);
  const m = g.meats[id];
  assert.ok(m.side[1] > m.side[0] * 4, '下の面（1）が上の面（0）よりずっと焼けている');
  YG.flip(g, id);
  const before = m.side[0];
  run(g, 3);
  assert.ok(m.side[0] - before > 0.3, '裏返したら面0が焼ける');
});

test('強火は弱火より速く焼ける・肉の種類で速さが変わる', () => {
  const g = YG.newGame({ seed: 1 });
  freezeCustomers(g);
  const a = YG.place(g, 'kalbi', 0); // 強（左の列）
  const b = YG.place(g, 'kalbi', 2); // 弱
  const c = YG.place(g, 'tan', 4); // 中
  const d = YG.place(g, 'harami', 1); // 中
  run(g, 2);
  const M = g.meats;
  assert.ok(M[a].side[1] > M[b].side[1] * 2);
  assert.ok(M[c].side[1] > M[d].side[1] * 2, 'タンはハラミより速い');
});

test('余熱：上げたあと少し焼ける→止まる→冷める。冷めても焼け具合は戻らない', () => {
  const g = YG.newGame({ seed: 1 });
  freezeCustomers(g);
  const id = YG.place(g, 'harami', 1);
  run(g, 5);
  const m = g.meats[id];
  assert.ok(YG.toPlate(g, id, 0));
  const at = m.side.slice();
  assert.equal(YG.servable(m), false, '余熱中は出せない');
  run(g, YG.TYPES.harami.rest + 0.05);
  assert.ok(m.restDone);
  assert.ok(m.side[1] > at[1] + 0.05, '余熱で焼けた');
  const rested = m.side.slice();
  const warm0 = m.warm;
  run(g, 6);
  assert.deepEqual(m.side, rested, '余熱が終わったら焼け具合は変わらない');
  assert.ok(m.warm < warm0 - 0.3, '冷めていく');
});

test('強火から上げると、弱火から上げるより余熱が大きい', () => {
  const carryFrom = (slot) => {
    const g = YG.newGame({ seed: 1 });
    freezeCustomers(g);
    const id = YG.place(g, 'harami', slot);
    run(g, 4);
    const m = g.meats[id];
    YG.toPlate(g, id, 0);
    const at = m.side[1];
    run(g, 4);
    return m.side[1] - at;
  };
  assert.ok(carryFrom(0) > carryFrom(2) * 2.5);
});

test('余熱の量は、1コマの長さ（端末の速さ）でほぼ変わらない', () => {
  const play = (dt) => {
    const g = YG.newGame({ seed: 3 });
    freezeCustomers(g);
    const id = YG.place(g, 'kalbi', 1);
    run(g, 3, dt); YG.flip(g, id); run(g, 3, dt);
    YG.toPlate(g, id, 0); run(g, 5, dt);
    return g.meats[id];
  };
  const a = play(1 / 30), b = play(1 / 60), c = play(1 / 144);
  for (const k of [0, 1]) {
    assert.ok(Math.abs(a.side[k] - c.side[k]) < 0.02, 'side ' + k + ': ' + a.side[k] + ' vs ' + c.side[k]);
    assert.ok(Math.abs(b.side[k] - c.side[k]) < 0.01);
  }
  assert.ok(Math.abs(a.warm - c.warm) < 0.02);
});

test('皿が満杯なら置けず、肉は消えない・上書きされない', () => {
  const g = YG.newGame({ seed: 1 });
  freezeCustomers(g);
  const ids = [0, 1, 2, 3].map((s) => YG.place(g, 'tan', s));
  for (let p = 0; p < 3; p++) assert.ok(YG.toPlate(g, ids[p], p));
  assert.equal(YG.toPlate(g, ids[3], 0), false);
  assert.equal(g.meats[ids[3]].loc, 'grill');
  assert.equal(g.grill[3], ids[3]);
  assert.deepEqual(g.plates, ids.slice(0, 3));
});

test('同じ肉は二度出せない・余熱中は出せない', () => {
  const g = YG.newGame({ seed: 1 });
  freezeCustomers(g);
  const id = YG.place(g, 'tan', 0);
  run(g, 2.2); YG.flip(g, id); run(g, 2.2);
  YG.toPlate(g, id, 0);
  seatCustomer(g, { type: null, target: 'hodo' }, 0);
  seatCustomer(g, { type: null, target: 'hodo' }, 1);
  assert.equal(YG.serve(g, id, 0).why, 'resting');
  run(g, 2);
  const r1 = YG.serve(g, id, 0);
  assert.ok(r1.ok);
  const score = g.score;
  const r2 = YG.serve(g, id, 1);
  assert.equal(r2.ok, false);
  assert.equal(g.score, score);
  assert.equal(g.stats.served, 1);
});

test('一時停止中は、焼け・余熱・冷め・客の待ち時間・残り時間がすべて止まる', () => {
  const g = YG.newGame({ seed: 1 });
  const a = YG.place(g, 'kalbi', 0);
  const b = YG.place(g, 'kalbi', 1);
  run(g, 3);
  YG.toPlate(g, b, 0);
  run(g, 0.5);
  const snap = JSON.stringify({ m: g.meats, s: g.seats, t: g.timeLeft });
  g.paused = true;
  run(g, 10);
  assert.equal(JSON.stringify({ m: g.meats, s: g.seats, t: g.timeLeft }), snap);
  assert.equal(YG.flip(g, a), false, '止まっている間は操作もできない');
});

test('最初の1枚を置くまで時間は進まない', () => {
  const g = YG.newGame({ seed: 1 });
  run(g, 5);
  assert.equal(g.timeLeft, CFG.duration);
  assert.equal(g.seats[0].state, 'empty');
  YG.place(g, 'tan', 0);
  run(g, 0.1);
  assert.equal(g.seats[0].state, 'wait');
});

test('時間が終わったら、操作しても時間がたっても得点は変わらない', () => {
  const g = YG.newGame({ seed: 1 });
  const id = YG.place(g, 'tan', 0);
  run(g, 2.2); YG.flip(g, id); run(g, 2.2); YG.toPlate(g, id, 0);
  run(g, CFG.duration);
  assert.equal(g.state, 'over');
  const score = g.score;
  seatCustomer(g, { type: null, target: 'hodo' });
  assert.equal(YG.serve(g, id, 0).ok, false);
  assert.equal(YG.place(g, 'tan', 1), null);
  run(g, 5);
  assert.equal(g.score, score);
  assert.equal(g.timeLeft, 0);
});

test('やり直しは、前回の肉・時間・得点を持ちこさない', () => {
  const g = YG.newGame({ seed: 1 });
  YG.place(g, 'tan', 0);
  run(g, 10);
  g.score = 999;
  const h = YG.newGame({ seed: 2 });
  assert.equal(h.score, 0);
  assert.equal(h.timeLeft, CFG.duration);
  assert.equal(Object.keys(h.meats).length, 0);
  assert.ok(h.grill.every((x) => x === null));
});

test('待たせすぎると客は帰り、コンボが切れる', () => {
  const g = YG.newGame({ seed: 1 });
  YG.place(g, 'tan', 2);
  g.combo = 4;
  run(g, 0.1);
  g.seats[0].cust.patience = 0.05;
  run(g, 0.2);
  assert.equal(g.seats[0].state, 'leave');
  assert.equal(g.combo, 0);
  assert.equal(g.stats.leave, 1);
});

// 各肉×各好みで、裏返す時刻と火の場所を探して、神焼きが本当に作れるかを確かめる
test('どの肉・どの好みでも、ねらえば神焼きにできる', () => {
  for (const type of YG.TYPE_KEYS) {
    for (const target of YG.TARGET_KEYS) {
      let found = null;
      outer: for (const slot of [0, 1, 2]) {
        for (let t1 = 0.5; t1 <= 14 && !found; t1 += 0.25) {
          for (let t2 = 0.5; t2 <= 14; t2 += 0.25) {
            const g = YG.newGame({ seed: 1 });
            freezeCustomers(g);
            const id = YG.place(g, type, slot);
            run(g, t1); YG.flip(g, id); run(g, t2);
            YG.toPlate(g, id, 0); run(g, YG.TYPES[type].rest + 0.1);
            const r = YG.grade(g.meats[id], { type, target });
            if (r.rank === 'perfect') { found = { slot, t1, t2 }; break outer; }
          }
        }
      }
      assert.ok(found, type + ' ' + target + ' の神焼きが作れない');
    }
  }
});

test('余熱で焼けすぎたことを、実際の値から見分ける', () => {
  const g = YG.newGame({ seed: 1 });
  freezeCustomers(g);
  const id = YG.place(g, 'harami', 1);
  const m = g.meats[id];
  // 下の面が「うす焼き」ちょうどまで焼けたら、強火から上げる
  while (m.side[1] < CFG.targets.usu) YG.step(g, DT);
  YG.flip(g, id);
  while (m.side[0] < CFG.targets.usu) YG.step(g, DT);
  YG.toPlate(g, id, 0);
  run(g, 4);
  seatCustomer(g, { type: null, target: 'usu' });
  const r = YG.serve(g, id, 0);
  assert.ok(r.ok);
  assert.equal(r.entry.result.carryOver, true);
  assert.ok(YG.lessons(g).some((l) => l.key === 'carry'));
});

test('皿の表示：余熱が終わっても、ナマやコゲを食べごろと言わない', () => {
  assert.equal(YG.label({ side: [0.1, 0.9] }).text, '片面ナマ');
  assert.equal(YG.label({ side: [1.5, 1.4] }).text, 'コゲ');
  assert.equal(YG.label({ side: [0.8, 0.82] }).text, 'ほどよく');
  assert.equal(YG.label({ side: [1.7, 1.0] }).text, '炭');
});

test('称号は実際の出来事から決まる', () => {
  const g = YG.newGame({ seed: 1 });
  g.stats.burnt = 3; g.stats.char = 1;
  assert.equal(YG.title(g).name, '炭の錬金術師');
  const h = YG.newGame({ seed: 1 });
  assert.equal(YG.title(h).name, 'ただ肉を眺める人');
});

// ===== ランク・フィーバー・審査員・ラストオーダー =====
function perfectMeat(g, target, type = 'tan') {
  const id = g.nextId++;
  const d = CFG.targets[target];
  g.meats[id] = { id, type, side: [d, d], up: 0, loc: 'plate', plate: 0, warm: 1, rest: null, restDone: true, atRemoval: null, cookTime: 1, busyInt: 0, flips: 1, detail: 0.5, fireHeat: 0 };
  g.plates[0] = id;
  return id;
}

test('ランク：売上で C〜A5、あと何点も出る', () => {
  const g = YG.newGame({ seed: 1 });
  g.score = 100; assert.equal(YG.shopRank(g).key, 'C');
  assert.equal(YG.shopRank(g).next.need, CFG.ranks[1].min - 100);
  g.score = CFG.ranks[3].min; assert.equal(YG.shopRank(g).key, 'A4');
  g.score = 99999; assert.equal(YG.shopRank(g).key, 'A5');
  assert.equal(YG.shopRank(g).next, null);
});

test('ランク：失敗なしで神焼き5枚以上なら特選A5、焦がしすぎは規格外', () => {
  const g = YG.newGame({ seed: 1 });
  g.score = 99999; g.stats.perfect = 5;
  assert.equal(YG.shopRank(g).key, 'tokusen');
  g.stats.cold = 1;
  assert.equal(YG.shopRank(g).key, 'A5');
  g.stats.burnt = 4;
  const r = YG.shopRank(g);
  assert.equal(r.key, 'kikaku');
  assert.equal(r.byScore, 'A5');
});

test('フィーバー：メーターがたまると始まり、点が倍になり、失敗で終わる', () => {
  const g = YG.newGame({ seed: 1 });
  YG.place(g, 'tan', 0);
  freezeCustomers(g);
  const serveOne = (target, side) => {
    const id = perfectMeat(g, 'hodo');
    if (side) g.meats[id].side = side;
    seatCustomer(g, { type: null, target });
    return YG.serve(g, id, 0).entry;
  };
  serveOne('hodo'); // 神焼き1枚＝2
  serveOne('kon'); // ちがう：コンボは切れるがメーターは残る
  assert.equal(g.combo, 0);
  assert.equal(g.feverLeft, 0);
  assert.equal(g.feverGauge, 2);
  const e3 = serveOne('hodo'); // 4 → 始まる
  assert.ok(g.feverLeft > 0);
  assert.equal(e3.fever, false, '始まった1枚はまだ倍にならない');
  assert.equal(g.feverGauge, 0);
  const e4 = serveOne('hodo');
  assert.equal(e4.fever, true);
  const comboMult = 1 + CFG.comboStep * 1;
  assert.equal(e4.pts, Math.round(CFG.points.perfect * CFG.anyTypeMult * comboMult * CFG.feverMult) + CFG.perfectBonus);
  serveOne('hodo', [0.1, 0.1]); // ナマ → コンボが切れる
  assert.equal(g.combo, 0);
  assert.equal(g.feverLeft, 0);
});

test('フィーバーは時間がたつと終わり、一時停止中は減らない', () => {
  const g = YG.newGame({ seed: 1 });
  YG.place(g, 'tan', 0);
  g.feverLeft = 3;
  g.paused = true; run(g, 5); assert.equal(g.feverLeft, 3);
  g.paused = false; run(g, 3.1); assert.equal(g.feverLeft, 0);
});

test('審査員：決まった時刻に来て、そのときだけ特上カルビを置ける。出すと点が3倍', () => {
  const g = YG.newGame({ seed: 5 });
  assert.equal(YG.place(g, 'toku', 0), null, '審査員が来る前は置けない');
  YG.place(g, 'tan', 5);
  // 席を全部空けておく
  g.seats.forEach((s) => { s.state = 'empty'; s.cust = null; s.nextIn = 1e9; });
  run(g, CFG.vipTimes[0] + 0.1);
  const vs = g.seats.findIndex((s) => s.state === 'wait' && s.cust.vip);
  assert.ok(vs >= 0, '審査員が席にいる');
  assert.equal(g.seats[vs].cust.order.type, 'toku');
  assert.equal(g.toku, CFG.vipStock);
  assert.ok(YG.place(g, 'toku', 0));
  assert.ok(YG.place(g, 'toku', 1));
  assert.equal(YG.place(g, 'toku', 2), null, '置ける枚数には上限がある');
  const id = perfectMeat(g, g.seats[vs].cust.order.target, 'toku');
  g.plates[0] = id;
  const e = YG.serve(g, id, vs).entry;
  assert.equal(e.vip, true);
  assert.ok(e.pts >= CFG.points.perfect * CFG.vipMult);
  assert.equal(g.toku, 0);
});

test('ラストオーダー：残り15秒で始まり、客が早く来る', () => {
  const g = YG.newGame({ seed: 1 });
  YG.place(g, 'tan', 0);
  run(g, CFG.duration - CFG.lastOrder - 0.5);
  assert.equal(g.lastOrder, false);
  run(g, 1);
  assert.equal(g.lastOrder, true);
  assert.ok(g.events.some((e) => e.type === 'lastOrder'));
});

test('置きっぱなしのズル：古い肉と焦げた肉は「にぎわい」に数えない', () => {
  const g = YG.newGame({ seed: 3 });
  freezeCustomers(g);
  const a = YG.place(g, 'harami', 2); // 弱火に置きっぱなし
  YG.place(g, 'harami', 5);
  assert.equal(YG.activeCount(g), 2);
  run(g, CFG.busyFresh + 1);
  assert.equal(YG.activeCount(g), 0, '置いてから時間がたった肉は数えない');
  const b = YG.place(g, 'tan', 0);
  assert.equal(YG.activeCount(g), 1);
  g.meats[b].side = [0.2, CFG.burnt + 0.01];
  assert.equal(YG.activeCount(g), 0, '焦げた肉は数えない');
  // 動かしても新しくはならない
  YG.moveToSlot(g, a, 1);
  assert.equal(YG.isActive(g, g.meats[a]), false);
});

test('肉代：捨てると売上から引かれ、最後に残した肉も引かれる（0より下にはならない）', () => {
  const g = YG.newGame({ seed: 4 });
  freezeCustomers(g);
  const a = YG.place(g, 'tan', 0);
  g.score = 100;
  YG.discard(g, a);
  assert.equal(g.score, 100 - CFG.meatCost);
  YG.place(g, 'tan', 0); YG.place(g, 'kalbi', 1);
  g.score = 20;
  YG.end(g);
  assert.equal(g.leftover, 2);
  assert.equal(g.leftoverCost, 20);
  assert.equal(g.score, 0);
  assert.equal(g.stats.leftover, 2);
});

test('「どの肉でも」の客は点がひかえめ', () => {
  const any = YG.grade({ side: [0.8, 0.8], warm: 1, type: 'tan' }, { type: null, target: 'hodo' });
  const exact = YG.grade({ side: [0.8, 0.8], warm: 1, type: 'tan' }, { type: 'tan', target: 'hodo' });
  assert.equal(any.base, exact.base * CFG.anyTypeMult);
});

test('となりの客と同じ注文にならない', () => {
  for (let seed = 1; seed < 40; seed++) {
    const g = YG.newGame({ seed });
    YG.place(g, 'tan', 0);
    for (let k = 0; k < 20 * 60; k++) { YG.step(g, DT); g.seats.forEach((st) => { if (st.state === 'wait') st.cust.patience = 999; }); }
    const w = g.seats.filter((s) => s.state === 'wait').map((s) => (s.cust.order.type || '-') + s.cust.order.target);
    assert.equal(new Set(w).size, w.length, 'seed ' + seed + ': ' + w.join(','));
  }
});

test('予約：網から客へ運ぶと皿へ上がり、余熱が終わったら自動で出る。客が帰ったら取り消し', () => {
  const g = YG.newGame({ seed: 5 });
  freezeCustomers(g);
  const id = YG.place(g, 'tan', 0);
  run(g, 1);
  g.meats[id].side = [0.6, 0.6];
  seatCustomer(g, { type: 'tan', target: 'hodo' }, 1);
  g.seats[1].cust.n = 77;
  const r = YG.reserve(g, id, 1);
  assert.ok(r.ok && r.reserved);
  assert.equal(g.meats[id].loc, 'plate');
  assert.equal(g.stats.served, 0, '余熱のあいだは出ない');
  run(g, YG.TYPES.tan.rest + 0.2);
  assert.equal(g.stats.served, 1, '余熱が終わったら出る');
  assert.equal(g.seats[1].state, 'react');
  // 客が帰ったら取り消し
  const id2 = YG.place(g, 'tan', 0);
  seatCustomer(g, { type: 'tan', target: 'hodo' }, 2);
  g.seats[2].cust.n = 78;
  YG.reserve(g, id2, 2);
  g.seats[2].cust.patience = 0.01;
  run(g, YG.TYPES.tan.rest + 0.2);
  assert.equal(g.meats[id2].loc, 'plate');
  assert.equal(g.meats[id2].reserved, null);
});

// ===== ステージ =====
test('ステージ1：タンだけ・中火だけ・客1人・45秒・フィーバーや肉代なし', () => {
  const g = YG.newGame({ seed: 3, stage: 1 });
  assert.equal(g.stage, 1);
  assert.equal(g.timeLeft, 45);
  assert.deepEqual(g.R.types, ['tan']);
  assert.ok(g.R.fires.every((f) => f === 1));
  assert.deepEqual(g.seats.map((s) => s.state), ['empty', 'closed', 'closed']);
  assert.equal(YG.place(g, 'kalbi', 0), null, 'カルビはまだ置けない');
  const id = YG.place(g, 'tan', 0);
  assert.ok(id);
  // 最後まで回しても、準備中の席に客は来ない・注文はタンのほどよくだけ
  const orders = new Set();
  for (let i = 0; i < 45 * 60 + 10; i++) { YG.step(g, 1 / 60); g.seats.forEach((s) => { if (s.state === 'wait') orders.add((s.cust.order.type || '') + ':' + s.cust.order.target); }); }
  assert.equal(g.state, 'over');
  assert.deepEqual(g.seats.slice(1).map((s) => s.state), ['closed', 'closed']);
  assert.deepEqual([...orders], ['tan:hodo']);
  assert.equal(g.fevers, 0);
  assert.equal(g.leftoverCost, 0, '肉代はステージ6から');
});

test('★は点で決まる（ステージの stars）・本番は0', () => {
  const g = YG.newGame({ seed: 1, stage: 2 });
  const [a, b, c] = YG.STAGES[1].stars;
  g.stats.ok = a - 1; assert.equal(YG.starsOf(g), 0);
  g.stats.ok = a; assert.equal(YG.starsOf(g), 1);
  g.stats.ok = b; assert.equal(YG.starsOf(g), 2);
  g.stats.ok = c + 3; assert.equal(YG.starsOf(g), 3);
  g.stats.ok = 0; g.score = 99999; assert.equal(YG.starsOf(g), 0, '★は点ではなく枚数で決まる');
  const f = YG.newGame({ seed: 1 });
  f.score = 99999; assert.equal(YG.starsOf(f), 0);
  assert.equal(f.stage, 0);
});

test('ステージ7と本番は、同じ決まり（審査員・ラストオーダー・肉代あり）', () => {
  const s7 = YG.ruleOf(7), free = YG.ruleOf(0);
  assert.deepEqual(s7, free);
  assert.ok(free.vip && free.lastOrder && free.meatCost && free.fever && free.busy);
  assert.equal(free.duration, YG.CFG.duration);
});

test('ステージ1〜5は、にぎわいの点が付かない', () => {
  for (const k of [1, 2, 3, 4, 5]) assert.equal(YG.ruleOf(k).busy, false, 'ステージ' + k);
  assert.equal(YG.ruleOf(6).busy, true);
});
test('火は左から 強・中・弱（上の段と下の段で同じ）', () => {
  const names = [0, 1, 2, 3, 4, 5].map((i) => YG.fireName(i));
  assert.deepStrictEqual(names, ['strong', 'mid', 'weak', 'strong', 'mid', 'weak']);
});
test('客の来る間隔は、はじめのステージほど長い', () => {
  const gap = (k) => YG.ruleOf(k).arriveGap[0];
  assert.ok(gap(1) > gap(5) && gap(5) > gap(7));
  assert.deepStrictEqual(YG.ruleOf(7).arriveGap, YG.CFG.arriveGap);
});
test('うまく焼けた枚数：頼んだ肉を「ふつう」以上で出したときだけ数える', () => {
  assert.ok(YG.goodRank({ rank: 'good' }));
  assert.ok(YG.goodRank({ rank: 'perfect' }));
  assert.ok(!YG.goodRank({ rank: 'meh' }));
  assert.ok(!YG.goodRank({ rank: 'fail', fail: 'burnt' }));
  assert.ok(!YG.goodRank({ rank: 'great', wrongType: true }));
});
test('店のレベル：うまく焼けた枚数の合計で上がる', () => {
  assert.equal(YG.levelOf(0), 1);
  assert.equal(YG.levelOf(4), 1);
  assert.equal(YG.levelOf(5), 2);
  assert.equal(YG.levelOf(999), YG.LV_EXP.length);
  assert.equal(YG.LV_EXP.length - 1, YG.TOOL_KEYS.length * 3, '最高レベルで全部の道具が3段になる');
});
test('炭：焼き始めだけ速い（焼き上がりのころは同じ速さ）', () => {
  const g0 = (tools) => { const g = YG.newGame({ seed: 1, stage: 4, tools }); freezeCustomers(g); return g; };
  const side = (tools) => { const g = g0(tools); const id = YG.place(g, 'kalbi', 1); run(g, 2); return g.meats[id].side[1]; };
  assert.ok(side({ sumi: 3 }) > side({}) * 1.25);
  // 焼き上がりのころ（0.5 を越えたあと）の進みは同じ
  const late = (tools) => { const g = g0(tools); const id = YG.place(g, 'kalbi', 1); const m = g.meats[id]; m.side[1] = 0.7; m.fireHeat = 1; const a = m.side[1]; YG.step(g, 0.5); return m.side[1] - a; };
  assert.ok(Math.abs(late({ sumi: 3 }) - late({})) < 1e-9);
});
test('本番は道具なし（腕だけの勝負）。店の格は見た目のために残る', () => {
  const tools = { sumi: 3, ami: 3, sara: 3, tong: 3 };
  const g = YG.newGame({ seed: 1, tools });
  assert.equal(g.up.speed, 1); assert.equal(g.up.over, 1); assert.equal(g.up.rest, 1); assert.equal(g.up.hanjo, 1); assert.equal(g.up.lv.tong, 0);
  assert.equal(g.shopSteps, 12);
  const s = YG.newGame({ seed: 1, stage: 3, tools });
  assert.equal(s.up.speed, YG.TOOLS.sumi.speed[3]); assert.equal(s.up.lv.tong, 3);
});
test('繁盛：道具が強いほどステージの客が早く来る', () => {
  assert.equal(YG.toolUp({}).hanjo, 1);
  assert.ok(Math.abs(YG.toolUp({ sumi: 3, ami: 3, sara: 3, tong: 3 }).hanjo - 0.7) < 1e-9);
  const gap = (tools) => { const g = YG.newGame({ seed: 5, stage: 1, tools }); g.state = 'play'; const seat = g.seats[0]; seat.state = 'react'; seat.cust = { order: {} }; seat.timer = 0.001; YG.step(g, 1 / 60); return seat.nextIn; };
  assert.ok(Math.abs(gap({ sumi: 3, ami: 3, sara: 3, tong: 3 }) / gap({}) - 0.7) < 1e-6);
});
test('網：焼けすぎてからの進みが遅い（ちょうどまでは同じ）', () => {
  const side = (tools, sec) => { const g = YG.newGame({ seed: 1, stage: 4, tools }); freezeCustomers(g); const id = YG.place(g, 'kalbi', 1); run(g, sec); return g.meats[id].side[1]; };
  assert.ok(Math.abs(side({ ami: 3 }, 2) - side({}, 2)) < 1e-9);
  assert.ok(side({ ami: 3 }, 12) < side({}, 12) - 0.2);
});
test('皿：余熱の待ちが短い・焼ける量は同じ', () => {
  const carry = (tools) => {
    const g = YG.newGame({ seed: 1, stage: 5, tools }); freezeCustomers(g);
    const id = YG.place(g, 'harami', 1); run(g, 4);
    const m = g.meats[id]; YG.toPlate(g, id, 0); const at = m.side[1];
    run(g, 0.5); const done = m.restDone; run(g, 4);
    return { amt: m.side[1] - at, done };
  };
  const a = carry({}), b = carry({ sara: 3 });
  assert.ok(!a.done && b.done, '職人の皿は0.5秒で余熱が終わる');
  assert.ok(Math.abs(a.amt - b.amt) < 0.01);
});
test('★の目標：★1・★2 は決まった数、★3 だけ道具ぶん上がる', () => {
  const base = YG.STAGES[1].stars;
  assert.deepEqual(YG.starNeed(2, 0), base);
  assert.deepEqual(YG.starNeed(2, 12), [base[0], base[1], base[2] + 3]);
  assert.equal(YG.starNeed(0, 5), null);
  const g = YG.newGame({ seed: 1, stage: 2, tools: { sumi: 3, ami: 3, sara: 3, tong: 3 } });
  g.stats.ok = base[2]; assert.equal(YG.starsOf(g), 2, '道具が最高なら、元の★3の枚数では★2');
  g.stats.ok = base[2] + 3; assert.equal(YG.starsOf(g), 3);
});

test('今日の網：同じ日は同じお題・同じ並び、7日でお題が全部出る', () => {
  const a = YG.dailyOf(20261120), b = YG.dailyOf(20261120);
  assert.strictEqual(a.twist, b.twist);
  assert.strictEqual(a.seed, b.seed);
  assert.notStrictEqual(YG.dailyOf(20261121).seed, a.seed);
  // 区切りの7日（1970年1月1日から数えた7日ごと）では、7つのお題が1回ずつ出る
  for (const wk of [2916, 2917, 2918]) {
    const seen = new Set();
    for (let i = 0; i < 7; i++) {
      const dt = new Date((wk * 7 + i) * 864e5), key = dt.getUTCFullYear() * 10000 + (dt.getUTCMonth() + 1) * 100 + dt.getUTCDate();
      seen.add(YG.dailyOf(key).twist);
    }
    assert.strictEqual(seen.size, YG.DAILY.length);
  }
  const g1 = YG.newGame({ daily: 20261120 }), g2 = YG.newGame({ daily: 20261120 });
  assert.strictEqual(g1.stage, 0);
  assert.strictEqual(g1.seed, g2.seed);
  assert.deepStrictEqual(g1.R.types, Object.assign(YG.ruleOf(0), a.rule).types);
  assert.strictEqual(g1.daily.twist, a.twist);
});

test('今日の網：同じ日・同じ遊び方なら、客の注文の並びが同じ', () => {
  const run = () => {
    const g = YG.newGame({ daily: 20261120 });
    YG.place(g, 'kalbi', 0);
    const orders = [];
    for (let i = 0; i < 400; i++) {
      YG.step(g, 0.05);
      g.seats.forEach((s) => { if (s.cust && !s.cust._seen) { s.cust._seen = 1; orders.push(s.cust.order.type + ':' + s.cust.order.target); } });
    }
    return orders.join(',');
  };
  assert.strictEqual(run(), run());
});
