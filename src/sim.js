// 焼肉ギリギリ：ゲームの中身（焼け方・余熱・冷め・客・採点）。
// 画面や音には触らない。ブラウザでは window.YG、node（テスト）では require で使う。
// 見た目と採点は、どちらもこのファイルの状態（meat.side / meat.warm など）だけを見る。
(function (root) {
  'use strict';

  // ===== 調整する数字はここにまとめる =====
  const CFG = {
    duration: 75, // 1プレイの秒数
    raw: 0.3, // これより下の面は「生」
    burnt: 1.32, // これより上の面は「焦げ」
    char: 1.62, // これより上の面は「炭」
    targets: { usu: 0.55, hodo: 0.8, kon: 1.05 }, // 客の好みの焼け具合
    tol: { perfect: 0.05, great: 0.11, good: 0.2, meh: 0.32 }, // 好みからのずれの許し幅（両面の悪い方で見る）
    points: { perfect: 100, great: 70, good: 45, meh: 15 },
    perfectBonus: 30, // 神焼きのおまけ
    comboStep: 0.1, // コンボ1つで +10%
    comboCap: 10,
    busyStep: 0.1, // 一緒に焼いていた肉1枚で +10%（にぎわい）
    busyFresh: 20, // 置いてからこの秒数までの肉だけ「にぎわい」に数える（置きっぱなしのズルを防ぐ）
    meatCost: 15, // 捨てた肉・最後に残した肉は、この点だけ売上から引く（肉代）
    warmLuke: 0.45, // 温かさがこれより下は「ぬるい」（1段下がる）
    warmCold: 0.15, // これより下は「冷めた」（失敗）
    wrongTypeMult: 0.6, // 頼んだ肉とちがう
    // 網の6枠の火力（上の段・下の段、左から 強・中・弱。縦の列で火が同じ）
    fires: [1.7, 1.0, 0.5, 1.7, 1.0, 0.5],
    fireTau: 1.2, // 肉にたまる熱が火力に追いつく速さ（秒）。余熱の大きさを決める
    warmTau: 0.8, // 網の上で温まる速さ（秒）
    plates: 3,
    patienceStart: 28, // はじめの客の待てる秒数
    patienceEnd: 18, // 終わりごろの客の待てる秒数
    firstArrivals: [0, 6, 14], // 3つの席に最初の客が来る時刻（スタートからの秒）
    arriveGap: [2, 4], // 客が帰ってから次が来るまで（本番。ステージでは長め）
    anyTypeRate: 0.3, // 「どの肉でも」の注文の割合
    anyTypeMult: 0.8, // 「どの肉でも」の客は点がひかえめ（合う肉を頼んだ客に出すほうが得）
    reactTime: 1.6, // 客が反応している秒数（このあいだも他の操作はできる）
    // フィーバー：うまい以上が続くと点が倍。コンボが切れたら終わる
    feverNeed: 4, // メーターがここまでたまると始まる
    feverGain: { perfect: 2, great: 1, good: 0.5 }, // 1枚でたまる量（ナマ・コゲ・冷め・帰った客で0に戻り、フィーバーも終わる）
    feverTime: 10, // 秒
    feverMult: 2,
    feverArriveMul: 0.4, // フィーバー中は客が早く来る
    // 審査員：決まった時刻に来て「特上カルビ」を頼む。出せば点が何倍にもなる
    vipTimes: [22, 48],
    vipPatience: 20,
    vipMult: 3,
    vipStock: 2, // 審査員1人につき、特上カルビを網に置ける枚数
    // ラストオーダー：残りこの秒数から客がどっと来る
    lastOrder: 15,
    lastArriveGap: [0.3, 0.9],
    // ランク（売上で決まる）。特選A5・規格外は shopRank() で決める
    ranks: [
      { key: 'C', min: 0, word: 'スーパーの見切り品' },
      { key: 'B', min: 300, word: '町の焼肉屋' },
      { key: 'A3', min: 700, word: 'ちょっといい店' },
      { key: 'A4', min: 1100, word: '予約がとれない店' },
      { key: 'A5', min: 1600, word: '霜降りの神' },
    ],
  };

  // 肉の種類。rate＝下の面の焼ける速さ、through＝上の面に伝わる割合、carry＝余熱の大きさ、
  // rest＝余熱の秒数、cool＝余熱のあと冷めきるまでの秒数、strongBoost＝強火で脂が燃える倍率
  const TYPES = {
    tan: { name: 'タン', rate: 0.26, through: 0.18, carry: 0.045, rest: 1.5, cool: 8, strongBoost: 1.0, thick: 3 },
    kalbi: { name: 'カルビ', rate: 0.15, through: 0.12, carry: 0.07, rest: 2.0, cool: 10, strongBoost: 1.2, thick: 6 },
    harami: { name: 'ハラミ', rate: 0.1, through: 0.08, carry: 0.12, rest: 2.8, cool: 12, strongBoost: 1.0, thick: 11 },
    // 審査員が来たときだけ置ける。脂が多く、速く焼けて、強火でよく燃える
    toku: { name: '特上カルビ', rate: 0.19, through: 0.12, carry: 0.08, rest: 1.8, cool: 8, strongBoost: 1.3, thick: 7, special: true },
  };
  const TRAY_KEYS = ['tan', 'kalbi', 'harami', 'toku'];
  const TYPE_KEYS = ['tan', 'kalbi', 'harami'];
  const TARGET_KEYS = ['usu', 'hodo', 'kon'];
  const TARGET_NAME = { usu: 'うす焼き', hodo: 'ほどよく', kon: 'こんがり' };
  const RANKS = ['perfect', 'great', 'good', 'meh', 'miss'];

  // ===== ステージ：1つずつ覚えることを足していく =====
  // rule にないものは本番（FULL）と同じ。stars は ★1・★2・★3 の点（自動の遊び手で決めた。tools/bot.js --stages）
  const MID = [1.0, 1.0, 1.0, 1.0, 1.0, 1.0];
  const FULL = {
    duration: CFG.duration, seats: 3, types: TYPE_KEYS.slice(), targets: TARGET_KEYS.slice(), anyRate: CFG.anyTypeRate,
    fires: CFG.fires.slice(), arriveGap: CFG.arriveGap.slice(), fever: true, busy: true, vip: true, lastOrder: true, meatCost: true, coolMul: 1,
    patience: [CFG.patienceStart, CFG.patienceEnd], firstArrivals: CFG.firstArrivals.slice(),
  };
  const STAGES = [
    { name: '屋台', learn: '置く → 返す → 皿 → 客',
      intro: ['トレーのタンを、網へドラッグ', '肉汁が浮いたら、タップで裏返す', '両面が焼けたら、皿へ。そして客へ'],
      rule: { arriveGap: [4, 6], duration: 45, seats: 1, types: ['tan'], targets: ['hodo'], anyRate: 0, fires: MID, fever: false, busy: false, vip: false, lastOrder: false, meatCost: false, coolMul: 2, patience: [40, 34], firstArrivals: [0] },
      stars: [60, 170, 300] },
    { name: '裏を読む', learn: '肉汁と煙で、見えない裏を読む',
      intro: ['上から見えるのは、上の面だけ', '肉汁が浮いたら、下が焼けた合図', '煙が出たら、下が焦げはじめた合図'],
      rule: { arriveGap: [4, 6], duration: 45, seats: 2, types: ['tan', 'kalbi'], targets: ['hodo'], anyRate: 0.3, fires: MID, fever: false, busy: false, vip: false, lastOrder: false, meatCost: false, coolMul: 1.6, patience: [36, 30], firstArrivals: [0, 8] },
      stars: [80, 290, 700] },
    { name: '好みを聞く', learn: 'うす焼き・ほどよく・こんがり',
      intro: ['客ごとに、好みの焼き加減がちがう', '吹き出しの焼き色の見本に合わせる', '少し焼きすぎた肉は、こんがり派へ'],
      rule: { arriveGap: [3.5, 5.5], duration: 60, seats: 2, types: ['tan', 'kalbi'], fires: MID, fever: false, busy: false, vip: false, lastOrder: false, meatCost: false, coolMul: 1.4, patience: [32, 26], firstArrivals: [0, 8] },
      stars: [100, 220, 420] },
    { name: '火を使い分ける', learn: '中火・強火・弱火',
      intro: ['列ごとに、火の強さがちがう（上の札）', '強火は速いが、焦げやすい', '焦げそうなら、弱火へドラッグで逃がす'],
      rule: { arriveGap: [3.5, 5.5], duration: 60, seats: 2, types: ['tan', 'kalbi'], fever: false, busy: false, vip: false, lastOrder: false, meatCost: false, coolMul: 1.2, patience: [30, 24], firstArrivals: [0, 8] },
      stars: [90, 210, 420] },
    { name: '余熱を読む', learn: '上げたあとも焼ける',
      intro: ['皿へ上げても、しばらく焼ける（余熱）', '厚いハラミ・強火から上げた肉ほど、よく進む', 'ねらいより少し手前で上げる'],
      rule: { arriveGap: [3, 5], duration: 60, seats: 3, fever: false, busy: false, vip: false, lastOrder: false, meatCost: false, patience: [30, 22] },
      stars: [100, 380, 620] },
    { name: '満席', learn: 'たくさん焼く・フィーバー・肉代',
      intro: ['同時にたくさん焼くほど、点が増える', 'うまい以上を続けると、フィーバー（点が2倍）', '捨てた肉・残した肉は、肉代を引かれる'],
      rule: { arriveGap: [2.5, 4.5], vip: false },
      stars: [120, 600, 1250] },
    { name: '審査員', learn: '特上カルビで3倍',
      intro: ['審査員が来たら、特上カルビが焼ける', '好みどおりに出すと、点が3倍', '残り15秒は、ラストオーダー'],
      rule: {},
      stars: [150, 750, 1600] },
  ];
  // stage：1〜7 はステージ、0（または無し）は本番（自由に焼く。ランクで評価）
  function ruleOf(stage) {
    const st = STAGES[stage - 1];
    return Object.assign({}, FULL, st ? st.rule : {});
  }
  function starsOf(g) {
    const st = STAGES[g.stage - 1];
    if (!st) return 0;
    return st.stars.filter((v) => g.score >= v).length;
  }
  const CHARS = 6; // ふつうの客の種類の数（見た目とセリフは lines.js / draw.js）
  const VIP_CHAR = 6; // 審査員

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function strongAt(g, slot) { return g.R.fires[slot] >= 1.5; }
  // fires を渡さないときは本番の火力
  function fireName(slot, fires) { const f = (fires || CFG.fires)[slot]; return f >= 1.5 ? 'strong' : f >= 0.8 ? 'mid' : 'weak'; }

  function newGame(opts) {
    opts = opts || {};
    const seed = opts.seed != null ? opts.seed : (Date.now() & 0x7fffffff);
    const stage = opts.stage > 0 && opts.stage <= STAGES.length ? opts.stage : 0;
    const R = ruleOf(stage);
    const g = {
      stage, R,
      seed,
      rng: mulberry32(seed),
      state: 'ready', // ready（最初の1枚を置くまで時間は進まない）→ play → over
      paused: false,
      t: 0, // スタートからの秒
      timeLeft: R.duration,
      grill: new Array(6).fill(null), // 肉の id
      plates: new Array(CFG.plates).fill(null),
      meats: {},
      nextId: 1,
      // 使わない席は「準備中」（closed）
      seats: [0, 1, 2].map((i) => ({ state: i < R.seats ? 'empty' : 'closed', cust: null, nextIn: R.firstArrivals[i] != null ? R.firstArrivals[i] : 6 + i * 8, react: null, timer: 0 })),
      score: 0,
      combo: 0,
      maxCombo: 0,
      log: [], // 出した肉の記録（ふりかえり用）
      stats: { served: 0, perfect: 0, great: 0, good: 0, meh: 0, miss: 0, raw: 0, halfraw: 0, burnt: 0, char: 0, cold: 0, luke: 0, leave: 0, wrong: 0, discard: 0, carryOver: 0, maxBusy: 0, placed: 0, burnedOnStrong: 0 },
      events: [], // 画面・音へ知らせる出来事（main.js が取り出す）
      tutorial: !!opts.tutorial,
      custCount: 0,
      feverLeft: 0, // フィーバーの残り秒
      feverGauge: 0, // フィーバーのメーター
      fevers: 0,
      vipIdx: 0, vipPending: false,
      toku: 0, // いま網に置ける特上カルビの枚数
      lastOrder: false,
    };
    return g;
  }

  function emit(g, type, data) { g.events.push(Object.assign({ type }, data || {})); }
  function canAct(g) { return (g.state === 'ready' || g.state === 'play') && !g.paused; }
  function onGrillCount(g) { return g.grill.reduce((n, id) => n + (id ? 1 : 0), 0); }
  // 「にぎわい」に数える肉：置いてから busyFresh 秒以内で、まだ焦げていないもの
  function isActive(g, m) { return m.loc === 'grill' && g.t - m.placedAt < CFG.busyFresh && Math.max(m.side[0], m.side[1]) < CFG.burnt; }
  function activeCount(g) { return g.grill.reduce((n, id) => n + (id && isActive(g, g.meats[id]) ? 1 : 0), 0); }

  function start(g) {
    if (g.state !== 'ready') return;
    g.state = 'play';
    emit(g, 'start');
  }

  // ===== 操作 =====
  function place(g, type, slot) {
    if (!canAct(g) || !TYPES[type] || slot < 0 || slot > 5 || g.grill[slot]) return null;
    if (TYPES[type].special) { if (g.toku <= 0) return null; g.toku--; }
    else if (!g.R.types.includes(type)) return null; // このステージではまだ使えない肉
    const id = g.nextId++;
    const m = {
      id, type,
      side: [0, 0], // 2つの面の焼け具合（0＝生、0.8 くらい＝ほどよく、1.32〜＝焦げ）
      up: 0, // 上を向いている面（0 か 1）。下の面＝1-up が網に当たる
      loc: 'grill', slot, plate: -1,
      warm: 0.3, // 温かさ（焼け具合とは別）
      fireHeat: 0, // 肉にたまった熱。網から上げたときの余熱の大きさになる
      rest: null, // 余熱中 { t, dur, carry:[a,b] }
      restDone: false,
      cookTime: 0, busyInt: 0, flips: 0, placedAt: g.t,
      reserved: null, // 出す予定の席 { seat, n }（網や皿から客へ運んだが、余熱がまだのとき）
      atRemoval: null, // 網から上げた瞬間の両面
      burnedOnStrong: false, burnedAt: null,
      detail: g.rng(), // 見た目の模様（サシ・焦げ跡の位置）の種
    };
    g.meats[id] = m;
    g.grill[slot] = id;
    g.stats.placed++;
    start(g);
    g.stats.maxBusy = Math.max(g.stats.maxBusy, onGrillCount(g));
    emit(g, 'place', { id, slot });
    return id;
  }

  function flip(g, id) {
    const m = g.meats[id];
    if (!canAct(g) || !m || m.loc === 'gone') return false;
    m.up = 1 - m.up;
    m.flips++;
    emit(g, 'flip', { id, loc: m.loc });
    return true;
  }

  function moveToSlot(g, id, slot) {
    const m = g.meats[id];
    if (!canAct(g) || !m || m.loc === 'gone' || slot < 0 || slot > 5 || g.grill[slot]) return false;
    detach(g, m);
    m.loc = 'grill'; m.slot = slot; m.plate = -1;
    m.rest = null; m.restDone = false;
    g.grill[slot] = id;
    g.stats.maxBusy = Math.max(g.stats.maxBusy, onGrillCount(g));
    emit(g, 'move', { id, slot });
    return true;
  }

  function toPlate(g, id, p) {
    const m = g.meats[id];
    if (!canAct(g) || !m || m.loc === 'gone' || p < 0 || p >= CFG.plates || g.plates[p] != null) return false;
    const fromGrill = m.loc === 'grill';
    detach(g, m);
    m.loc = 'plate'; m.plate = p; m.slot = -1;
    g.plates[p] = id;
    if (fromGrill) {
      // 網から上げた瞬間：たまった熱の分だけ、このあと少し焼ける（下の面ほど多く）
      const T = TYPES[m.type];
      const c = T.carry * m.fireHeat;
      const carry = [0, 0];
      carry[1 - m.up] = c;
      carry[m.up] = c * 0.6;
      m.rest = { t: 0, dur: T.rest, carry };
      m.restDone = false;
      m.atRemoval = m.side.slice();
    }
    emit(g, 'plate', { id, plate: p, fromGrill });
    return true;
  }

  function discard(g, id) {
    const m = g.meats[id];
    if (!canAct(g) || !m || m.loc === 'gone') return false;
    detach(g, m);
    m.loc = 'gone';
    g.stats.discard++;
    const cost = g.R.meatCost ? Math.min(g.score, CFG.meatCost) : 0;
    g.score -= cost;
    g.wasteCost = (g.wasteCost || 0) + cost;
    emit(g, 'discard', { id, burnt: Math.max(m.side[0], m.side[1]) >= CFG.burnt, cost });
    return true;
  }

  function detach(g, m) {
    m.reserved = null;
    if (m.loc === 'grill' && g.grill[m.slot] === m.id) g.grill[m.slot] = null;
    if (m.loc === 'plate' && g.plates[m.plate] === m.id) g.plates[m.plate] = null;
  }

  // 出せるか（余熱が終わっていること）。食べごろかどうかとは別
  function servable(m) { return !!m && m.loc === 'plate' && m.restDone; }

  function serve(g, id, seatIdx) {
    const m = g.meats[id];
    const seat = g.seats[seatIdx];
    if (!canAct(g) || g.state !== 'play') return { ok: false, why: 'state' };
    if (!m || m.loc !== 'plate') return { ok: false, why: 'gone' };
    if (!m.restDone) return { ok: false, why: 'resting' };
    if (!seat || seat.state !== 'wait') return { ok: false, why: 'noone' };
    const order = seat.cust.order;
    const r = grade(m, order);
    // 余熱で焼けすぎたか：上げた瞬間の両面なら、今より良い評価だった
    if (m.atRemoval) {
      const before = grade({ side: m.atRemoval, warm: 1, type: m.type }, order);
      if (rankIndex(before) < rankIndex(r) && Math.max(...m.side) > Math.max(...m.atRemoval) && r.over) r.carryOver = true;
    }
    const comboBefore = g.combo;
    const busyAvg = m.cookTime > 0 ? m.busyInt / m.cookTime : 0;
    const vip = !!seat.cust.vip;
    const fever = g.feverLeft > 0;
    let pts = 0;
    if (r.base > 0) {
      const mult = (1 + CFG.comboStep * Math.min(comboBefore, CFG.comboCap)) * (g.R.busy ? 1 + CFG.busyStep * busyAvg : 1) * (fever ? CFG.feverMult : 1) * (vip ? CFG.vipMult : 1);
      pts = Math.round(r.base * mult) + (r.rank === 'perfect' ? CFG.perfectBonus : 0);
    }
    if (r.rank === 'perfect' || r.rank === 'great') g.combo++;
    if (CFG.feverGain[r.rank] && !r.fail) {
      if (g.R.fever) g.feverGauge += CFG.feverGain[r.rank];
      if (g.feverGauge >= CFG.feverNeed) {
        g.feverGauge = 0;
        if (g.feverLeft <= 0) { g.fevers++; emit(g, 'fever'); } else emit(g, 'feverMore');
        g.feverLeft += CFG.feverTime;
      }
    } else if (!r.fail) {
      g.combo = 0; // いまいち・ちがうはコンボだけ切れる（メーターとフィーバーは残る）
    } else breakCombo(g);
    if (vip) { g.toku = 0; g.stats.vip = (g.stats.vip || 0) + 1; if (r.rank === 'perfect' || r.rank === 'great') g.stats.vipWin = (g.stats.vipWin || 0) + 1; }
    g.maxCombo = Math.max(g.maxCombo, g.combo);
    g.score += pts;
    // 記録
    const st = g.stats;
    st.served++;
    if (RANKS.includes(r.rank)) st[r.rank]++;
    if (r.fail) st[r.fail]++;
    if (r.luke) st.luke++;
    if (r.wrongType) st.wrong++;
    if (r.carryOver) st.carryOver++;
    if (r.fail === 'burnt' || r.fail === 'char') { if (m.burnedOnStrong) st.burnedOnStrong++; }
    detach(g, m);
    m.loc = 'gone';
    const entry = { id, type: m.type, side: m.side.slice(), atRemoval: m.atRemoval, warm: m.warm, order: Object.assign({}, order), char: seat.cust.char, result: r, pts, combo: g.combo, busyAvg, burnedOnStrong: m.burnedOnStrong, flips: m.flips, vip, fever };
    g.log.push(entry);
    seat.state = 'react';
    seat.timer = CFG.reactTime;
    seat.react = entry;
    emit(g, 'serve', { seat: seatIdx, entry });
    return { ok: true, entry };
  }

  // 客へ運んだが、まだ出せない（網の上・余熱中）：皿に置いて、余熱が終わったら自動で出す
  function reserve(g, id, seatIdx) {
    const m = g.meats[id];
    const seat = g.seats[seatIdx];
    if (!canAct(g) || g.state !== 'play' || !m || m.loc === 'gone') return { ok: false, why: 'state' };
    if (!seat || seat.state !== 'wait') return { ok: false, why: 'noone' };
    if (m.loc === 'grill') {
      const p = g.plates.indexOf(null);
      if (p < 0) return { ok: false, why: 'full' };
      toPlate(g, id, p);
    }
    if (m.restDone) return serve(g, id, seatIdx);
    // 同じ客への予定は1枚だけ（あとから運んだ肉に入れかえる）
    for (const pid of g.plates) { const o = pid && g.meats[pid]; if (o && o !== m && o.reserved && o.reserved.seat === seatIdx) o.reserved = null; }
    m.reserved = { seat: seatIdx, n: seat.cust.n };
    emit(g, 'reserve', { id, seat: seatIdx, plate: m.plate });
    return { ok: true, reserved: true };
  }

  function breakCombo(g) {
    g.combo = 0;
    g.feverGauge = 0;
    if (g.feverLeft > 0) { g.feverLeft = 0; emit(g, 'feverEnd', { broken: true }); }
  }

  // ===== 採点 =====
  function sideClass(d) {
    if (d >= CFG.char) return 'char';
    if (d >= CFG.burnt) return 'burnt';
    if (d < CFG.raw) return 'raw';
    return 'ok';
  }
  function rankIndex(r) { return r.fail ? 9 : RANKS.indexOf(r.rank); }

  // 両面を別々に見る。平均はとらない（片面生・片面焦げは失敗）
  function grade(m, order) {
    const s = m.side;
    const cls = s.map(sideClass);
    const T = CFG.targets[order.target];
    const res = { rank: 'miss', base: 0, fail: null, over: false, under: false, luke: false, wrongType: false, sides: cls, worstDev: 0 };
    if (cls.includes('char')) { res.fail = 'char'; }
    else if (cls[0] === 'raw' && cls[1] === 'raw') { res.fail = 'raw'; }
    else if (cls.includes('raw')) { res.fail = cls.includes('burnt') ? 'rawburnt' : 'halfraw'; }
    else if (cls.includes('burnt')) { res.fail = 'burnt'; }
    if (res.fail === 'rawburnt') res.fail = 'halfraw', res.alsoBurnt = true;
    if (res.fail) { res.rank = 'fail'; return finishWarm(res, m, order); }
    const devs = s.map((d) => d - T);
    const worst = Math.abs(devs[0]) >= Math.abs(devs[1]) ? devs[0] : devs[1];
    res.worstDev = worst;
    res.over = worst > 0; res.under = worst < 0;
    const a = Math.abs(worst);
    const tol = CFG.tol;
    let ri = a <= tol.perfect ? 0 : a <= tol.great ? 1 : a <= tol.good ? 2 : a <= tol.meh ? 3 : 4;
    res.rank = RANKS[ri];
    return finishWarm(res, m, order);
  }
  function finishWarm(res, m, order) {
    // 温かさ：冷めたら失敗、ぬるいと1段下がる
    if (m.warm < CFG.warmCold && !res.fail) { res.fail = 'cold'; res.rank = 'fail'; }
    else if (m.warm < CFG.warmLuke && !res.fail) {
      res.luke = true;
      const ri = Math.min(4, RANKS.indexOf(res.rank) + 1);
      res.rank = RANKS[ri];
    }
    if (!order.type) res.anyType = true;
    if (order.type && order.type !== m.type) {
      res.wrongType = true;
      if (res.rank === 'perfect') res.rank = 'great';
    }
    res.base = res.fail || res.rank === 'miss' ? 0 : CFG.points[res.rank] * (res.wrongType ? CFG.wrongTypeMult : 1) * (res.anyType ? CFG.anyTypeMult : 1);
    return res;
  }

  // 皿の上で、余熱のあとに出す短い状態表示（数字は出さない）
  function bucket(d) {
    if (d >= CFG.char) return 'char';
    if (d >= CFG.burnt) return 'burnt';
    if (d < CFG.raw) return 'raw';
    if (d < 0.68) return 'usu';
    if (d < 0.93) return 'hodo';
    return 'kon';
  }
  const BUCKET_NAME = { raw: 'ナマ', usu: 'うす焼き', hodo: 'ほどよく', kon: 'こんがり', burnt: 'コゲ', char: '炭' };
  function label(m) {
    const b = m.side.map(bucket);
    if (b[0] === b[1]) return { text: BUCKET_NAME[b[0]], kind: b[0] };
    if (b.includes('char')) return { text: '炭', kind: 'char' };
    if (b.includes('raw')) return { text: b.includes('burnt') ? '表コゲ裏ナマ' : '片面ナマ', kind: 'raw' };
    if (b.includes('burnt')) return { text: '片面コゲ', kind: 'burnt' };
    const order = ['usu', 'hodo', 'kon'];
    const i0 = order.indexOf(b[0]), i1 = order.indexOf(b[1]);
    return { text: BUCKET_NAME[order[Math.min(i0, i1)]] + '〜' + BUCKET_NAME[order[Math.max(i0, i1)]], kind: 'mix' };
  }

  // ===== 時間を進める（main.js は 1/60 秒ずつ呼ぶ。dt を変えても結果がほぼ同じになるように書く） =====
  function step(g, dt) {
    if (g.paused || g.state === 'over') return;
    if (g.state === 'ready') return; // 最初の1枚を置くまで、焼け具合も客も止まっている
    g.t += dt;
    g.timeLeft = Math.max(0, g.R.duration - g.t);
    const busy = activeCount(g);
    if (g.feverLeft > 0) { g.feverLeft = Math.max(0, g.feverLeft - dt); if (g.feverLeft === 0) emit(g, 'feverEnd', { broken: false }); }
    if (g.R.lastOrder && !g.lastOrder && g.timeLeft <= CFG.lastOrder) { g.lastOrder = true; emit(g, 'lastOrder'); }
    if (g.R.vip && g.vipIdx < CFG.vipTimes.length && g.t >= CFG.vipTimes[g.vipIdx]) { g.vipIdx++; g.vipPending = true; }
    // 網の上
    for (let s = 0; s < 6; s++) {
      const id = g.grill[s];
      if (!id) continue;
      const m = g.meats[id];
      const T = TYPES[m.type];
      const f = g.R.fires[s];
      const eff = f * (strongAt(g, s) ? T.strongBoost : 1);
      const r = T.rate * eff;
      const bottom = 1 - m.up;
      const wasBurnt = m.side[bottom] >= CFG.burnt;
      m.side[bottom] += r * dt;
      m.side[m.up] += r * T.through * dt;
      m.fireHeat += (f - m.fireHeat) * (1 - Math.exp(-dt / CFG.fireTau));
      m.warm += (1 - m.warm) * (1 - Math.exp(-dt / CFG.warmTau));
      m.cookTime += dt;
      m.busyInt += (busy - (isActive(g, m) ? 1 : 0)) * dt;
      if (!wasBurnt && m.side[bottom] >= CFG.burnt) {
        m.burnedOnStrong = m.burnedOnStrong || strongAt(g, s);
        m.burnedAt = fireName(s, g.R.fires);
        emit(g, 'burning', { id, slot: s });
      }
    }
    // 皿の上：余熱（焼け具合が少し進む）→ 冷める（焼け具合は変わらない）
    for (let p = 0; p < CFG.plates; p++) {
      const id = g.plates[p];
      if (!id) continue;
      const m = g.meats[id];
      const T = TYPES[m.type];
      if (m.rest && !m.restDone) {
        const R = m.rest.dur;
        const t0 = m.rest.t, t1 = Math.min(R, t0 + dt);
        // 余熱の勢いは上げた直後が強く、だんだん0へ（直線）。区間で積分するので dt に左右されない
        const frac = (t1 - t0) * (2 / R) - (t1 * t1 - t0 * t0) / (R * R);
        m.side[0] += m.rest.carry[0] * frac;
        m.side[1] += m.rest.carry[1] * frac;
        m.rest.t = t1;
        const left = t0 + dt - R;
        if (m.rest.t >= R) {
          m.restDone = true;
          emit(g, 'rested', { id, plate: p });
          if (left > 0) m.warm = Math.max(0, m.warm - left / (T.cool * g.R.coolMul));
        }
      } else {
        m.warm = Math.max(0, m.warm - dt / (T.cool * g.R.coolMul));
      }
      // 出す予定の客がいれば、余熱が終わったところで出す
      if (m.reserved && m.restDone) {
        const seat = g.seats[m.reserved.seat];
        if (seat.state === 'wait' && seat.cust.n === m.reserved.n) serve(g, id, m.reserved.seat);
        else { m.reserved = null; emit(g, 'reserveLost', { id, plate: p }); }
      }
    }
    // 客
    const progress = Math.min(1, g.t / g.R.duration);
    g.seats.forEach((seat, i) => {
      if (seat.state === 'closed') return; // このステージでは使わない席
      if (seat.state === 'empty') {
        seat.nextIn -= dt;
        if (g.vipPending && g.timeLeft > 8 && !g.seats.some((o) => o.state === 'wait' && o.cust.vip)) { spawnVip(g, i); }
        else if (seat.nextIn <= 0 && g.timeLeft > 4) spawn(g, i, progress);
      } else if (seat.state === 'wait') {
        seat.cust.patience -= dt;
        if (seat.cust.patience <= 0) {
          seat.state = 'leave';
          seat.timer = CFG.reactTime;
          seat.react = { result: { fail: 'leave', rank: 'fail' }, order: seat.cust.order, char: seat.cust.char };
          g.stats.leave++;
          if (seat.cust.vip) g.toku = 0;
          breakCombo(g);
          emit(g, 'leave', { seat: i, vip: !!seat.cust.vip });
        }
      } else {
        seat.timer -= dt;
        if (seat.timer <= 0) {
          seat.state = 'empty';
          seat.cust = null; seat.react = null;
          const [a, b] = g.lastOrder ? CFG.lastArriveGap : g.R.arriveGap;
          seat.nextIn = (a + g.rng() * (b - a)) * (g.feverLeft > 0 && !g.lastOrder ? CFG.feverArriveMul : 1);
        }
      }
    });
    if (g.t >= g.R.duration) end(g);
  }

  function spawn(g, i, progress) {
    const seat = g.seats[i];
    const n = g.custCount++;
    let order;
    const R = g.R;
    if (g.tutorial && n === 0) order = { type: R.types.includes('kalbi') ? 'kalbi' : R.types[0], target: R.targets.includes('hodo') ? 'hodo' : R.targets[0] };
    else {
      const anyRate = R.anyRate > 0 && progress < 0.15 ? Math.max(0.4, R.anyRate) : R.anyRate;
      // となりの客と同じ注文にならないように引き直す
      for (let k = 0; k < 6; k++) {
        order = {
          type: g.rng() < anyRate ? null : R.types[Math.floor(g.rng() * R.types.length)],
          target: R.targets[Math.floor(g.rng() * R.targets.length)],
        };
        if (!g.seats.some((o) => o.state === 'wait' && o.cust.order.type === order.type && o.cust.order.target === order.target)) break;
      }
    }
    const patience = (R.patience[0] + (R.patience[1] - R.patience[0]) * progress) * (g.tutorial && n === 0 ? 1.6 : 1);
    seat.cust = { char: Math.floor(g.rng() * CHARS), order, patience, maxPatience: patience, n };
    seat.state = 'wait';
    emit(g, 'arrive', { seat: i });
  }

  function spawnVip(g, i) {
    const seat = g.seats[i];
    g.vipPending = false;
    const order = { type: 'toku', target: TARGET_KEYS[Math.floor(g.rng() * 3)] };
    seat.cust = { char: VIP_CHAR, vip: true, order, patience: CFG.vipPatience, maxPatience: CFG.vipPatience, n: g.custCount++ };
    seat.state = 'wait';
    g.toku = CFG.vipStock;
    g.stats.vipCame = (g.stats.vipCame || 0) + 1;
    emit(g, 'vip', { seat: i });
  }

  // ランク：売上で C〜A5。失敗なしで神焼きが多ければ特選A5、焦がしすぎは規格外（炭）
  function shopRank(g) {
    const st = g.stats;
    const R = CFG.ranks;
    let i = 0;
    for (let k = 0; k < R.length; k++) if (g.score >= R[k].min) i = k;
    const base = R[i];
    const next = R[i + 1] ? { key: R[i + 1].key, need: R[i + 1].min - g.score } : null;
    const fails = st.raw + st.halfraw + st.burnt + st.char + st.cold + st.leave;
    if (st.burnt + st.char >= 4) return { key: 'kikaku', name: '規格外', word: '炭', byScore: base.key, next, index: -1 };
    if (base.key === 'A5' && fails === 0 && st.perfect >= 5) return { key: 'tokusen', name: '特選A5', word: '伝説の網', byScore: base.key, next: null, index: R.length };
    return { key: base.key, name: base.key, word: base.word, next, index: i };
  }

  function end(g) {
    if (g.state === 'over') return;
    g.state = 'over';
    g.timeLeft = 0;
    g.feverLeft = 0;
    g.leftover = onGrillCount(g) + g.plates.filter((x) => x != null).length;
    g.stats.leftover = g.leftover;
    g.leftoverCost = g.R.meatCost ? Math.min(g.score, g.leftover * CFG.meatCost) : 0;
    g.score -= g.leftoverCost;
    emit(g, 'end', { leftoverCost: g.leftoverCost });
  }

  // ふりかえり：実際の記録から、多かった失敗の理由を出す（根拠のないことは書かない）
  function lessons(g) {
    const st = g.stats;
    const L = [];
    if (st.carryOver) L.push({ n: st.carryOver, key: 'carry', text: '網から上げたあとの余熱で焼けすぎた', tip: '網から上げても少し焼ける。強火から上げるときほど早めに' });
    if (st.burnedOnStrong) L.push({ n: st.burnedOnStrong, key: 'strong', text: '強火の上で焦げた', tip: '焦げそうなら弱火へ逃がせる' });
    const otherBurnt = st.burnt + st.char - st.burnedOnStrong;
    if (otherBurnt > 0) L.push({ n: otherBurnt, key: 'burnt', text: '焦げた肉を出した', tip: '煙が出たら裏が焦げはじめた合図' });
    if (st.halfraw) L.push({ n: st.halfraw, key: 'halfraw', text: '片面がナマのまま出した', tip: 'タップで裏返して、両面を焼く' });
    if (st.raw) L.push({ n: st.raw, key: 'raw', text: '両面ナマで出した', tip: '色が変わるまで待つ' });
    if (st.cold) L.push({ n: st.cold, key: 'cold', text: '皿で待たせて冷めた', tip: '皿は置きすぎない。湯気が消えたら急いで' });
    if (st.luke) L.push({ n: st.luke, key: 'luke', text: 'ぬるくなってから出した', tip: '湯気があるうちに出す' });
    if (st.leave) L.push({ n: st.leave, key: 'leave', text: '待たせて帰らせた', tip: '待ちが短い客から焼く' });
    if (st.wrong) L.push({ n: st.wrong, key: 'wrong', text: '頼まれたのとちがう肉を出した', tip: '吹き出しの肉を見る' });
    if (g.leftover) L.push({ n: g.leftover, key: 'left', text: '時間切れで出せずに残った', tip: '終わりぎわは置きすぎない' });
    L.sort((a, b) => b.n - a.n);
    return L;
  }

  // 称号：その回に実際に起きたことから決める
  function title(g) {
    const st = g.stats;
    if (st.char >= 2 || st.burnt + st.char >= 4) return { name: '炭の錬金術師', why: '焦がした肉 ' + (st.burnt + st.char) + '枚' };
    if (st.raw + st.halfraw >= 3) return { name: '生肉ソムリエ', why: 'ナマで出した肉 ' + (st.raw + st.halfraw) + '枚' };
    if (st.cold >= 2) return { name: '冷めた関係', why: '冷めた肉 ' + st.cold + '枚' };
    if (st.leave >= 3) return { name: '閉店の達人', why: '帰った客 ' + st.leave + '人' };
    if (st.served === 0) return { name: 'ただ肉を眺める人', why: 'だれにも出さなかった' };
    if (st.perfect >= 5) return { name: '神のトング', why: '神焼き ' + st.perfect + '枚' };
    if (st.maxBusy >= 6 && st.great + st.perfect >= 6) return { name: '網の支配者', why: '6枚同時に焼いた' };
    if ((g.stats.vipWin || 0) >= 2) return { name: '審査員キラー', why: '審査員を2回うならせた' };
    if (g.fevers >= 3) return { name: 'フィーバー職人', why: 'フィーバー ' + g.fevers + '回' };
    if (g.maxCombo >= 6) return { name: 'コンボ焼き師', why: '最大 ' + g.maxCombo + 'コンボ' };
    if (g.score >= 2000) return { name: '肉神', why: g.score + '点' };
    if (g.score >= 1100) return { name: '焼肉の鬼', why: g.score + '点' };
    if (g.score >= 400) return { name: '町の焼き係', why: g.score + '点' };
    return { name: '見習いトング', why: g.score + '点' };
  }

  const YG = { CFG, TYPES, STAGES, ruleOf, starsOf, TYPE_KEYS, TRAY_KEYS, VIP_CHAR, shopRank, reserve, isActive, activeCount, TARGET_KEYS, TARGET_NAME, RANKS, CHARS, newGame, step, place, flip, moveToSlot, toPlate, discard, serve, servable, grade, label, bucket, sideClass, lessons, title, fireName, onGrillCount, mulberry32, end };
  if (typeof module !== 'undefined' && module.exports) module.exports = YG;
  else root.YG = YG;
})(typeof window !== 'undefined' ? window : globalThis);
