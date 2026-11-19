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
  const a = YG.place(g, 'kalbi', 1); // 強
  const b = YG.place(g, 'kalbi', 2); // 弱
  const c = YG.place(g, 'tan', 3); // 中
  const d = YG.place(g, 'harami', 0); // 中
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
  assert.ok(carryFrom(1) > carryFrom(2) * 2.5);
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
