// ジュー：画面の流れ・操作・演出。ゲームの中身は sim.js（YG）にある
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
  let rankIdx = 0, rankPop = 0, comboPop = 0;
  let resumeT = 0; // 一時停止から戻るときの 3・2・1
  let demoAcc = 0; // タイトルの見本を、画面の速さに関係なく進める
  let stage = 1; // いま（次に）遊ぶステージ。0＝本番
  let tip = null, tipsDone = {}; // ステージで新しく覚えることを、その場で1回だけ教える { x, y, text, t }
  let prevState = null, warned10 = false; // 「スタート！」「のこり10秒！」を1回だけ出す

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 保存できなくても遊べる */ } },
  };

  // ===== 画面の大きさ =====
  let scale = 1, ox = 0, oy = 0, dpr = 1;
  let ext = { x0: 0, x1: W, y0: 0, y1: H }; // 画面の端（論理座標）。背景はここまで塗る
  function resize() {
    dpr = Math.min(3, window.devicePixelRatio || 1);
    const cw = window.innerWidth, ch = window.innerHeight;
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    scale = Math.min(cw / W, ch / H);
    // 縦に余るときは、4割を上（梁と天井が伸びる）・6割を下に回す。下の暗い空きを減らし、トレーも指に近くなる
    const safeTop = (document.getElementById('safe') || {}).offsetHeight || 0;
    const free = Math.max(0, ch - H * scale);
    ox = (cw - W * scale) / 2; oy = Math.min(free, Math.max(safeTop, free * 0.4));
    ext = { x0: -ox / scale, x1: (cw - ox) / scale, y0: -oy / scale, y1: (ch - oy) / scale };
    const tf = document.getElementById('titleFrame');
    if (tf) tf.style.transform = `translate(${ox}px, ${oy}px) scale(${scale})`;
    checkRotate();
  }
  // 横向きのスマホ：「縦にしてね」を出して止める（パソコンでは出さない）
  function checkRotate() {
    const el = document.getElementById('rotate');
    if (!el) return;
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const bad = coarse && window.innerWidth > window.innerHeight;
    el.hidden = !bad;
    if (bad && typeof pause === 'function') pause(true);
  }
  window.addEventListener('resize', resize);
  resize0();
  function resize0() { // 最初の大きさ（checkRotate は pause ができてから）
    dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.width = Math.round(window.innerWidth * dpr); cv.height = Math.round(window.innerHeight * dpr);
  }
  function toLogical(e) {
    const r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left - ox) / scale, y: (e.clientY - r.top - oy) / scale };
  }

  // ===== 画面で使う絵（ゲームと同じ描き方で作る。絵文字は使わない） =====
  const PIC = {};
  function pic(key, w, h, draw) {
    if (!PIC[key]) { const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2; const x = c.getContext('2d'); x.scale(2, 2); draw(x); PIC[key] = c.toDataURL(); }
    return PIC[key];
  }
  const bossImg = (mood) => pic('boss-' + mood, 120, 118, (x) => YD.drawBoss(x, 60, 40, mood, 0.3));
  function boss(id, lines, mood) { $(id).innerHTML = `<img src="${bossImg(mood || 'say')}" alt=""><div class="say">${lines.map((l) => `<p>${l}</p>`).join('')}</div>`; }
  const meatImg = (type, d, n) => pic('meat-' + type + d, 84, 62, (x) => YD.drawMeat(x, { id: -80 - (n || 0), type, side: [d, d], up: 0, detail: 0.5, warm: 1 }, 42, 32, { scale: 0.62 }));
  function toolImg(k) {
    return pic('tool-' + k, 84, 62, (x) => {
      x.lineJoin = 'round'; x.lineCap = 'round';
      if (k === 'sumi') { // 炭と火
        [[26, 44, 15], [46, 46, 16], [62, 42, 13], [38, 34, 13], [55, 33, 11]].forEach(([cx, cy, r], j) => {
          x.fillStyle = j % 2 ? '#2b2522' : '#3a322e'; x.strokeStyle = '#120c08'; x.lineWidth = 2.5;
          x.beginPath(); x.ellipse(cx, cy, r, r * 0.72, j, 0, 7); x.fill(); x.stroke();
          x.strokeStyle = '#ff7a2f'; x.lineWidth = 2; x.beginPath(); x.moveTo(cx - r * 0.5, cy); x.lineTo(cx, cy - 3); x.lineTo(cx + r * 0.4, cy + 2); x.stroke();
        });
        YD.drawFlame(x, 34, 30, 6, 20, 1); YD.drawFlame(x, 50, 28, 7, 26, 1);
      } else if (k === 'ami') { // 丸い網
        x.save(); x.beginPath(); x.ellipse(42, 32, 34, 24, 0, 0, 7); x.fillStyle = '#2a1a12'; x.fill(); x.clip();
        x.strokeStyle = '#c9ced6'; x.lineWidth = 2;
        for (let i = 8; i < 80; i += 9) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 62); x.stroke(); x.beginPath(); x.moveTo(0, i - 6); x.lineTo(84, i - 6); x.stroke(); }
        x.restore(); x.strokeStyle = '#120c08'; x.lineWidth = 4; x.beginPath(); x.ellipse(42, 32, 34, 24, 0, 0, 7); x.stroke();
      } else if (k === 'sara') { // 皿
        x.fillStyle = 'rgba(0,0,0,.35)'; x.beginPath(); x.ellipse(43, 38, 34, 18, 0, 0, 7); x.fill();
        x.fillStyle = '#fbf8f0'; x.strokeStyle = '#120c08'; x.lineWidth = 2.5; x.beginPath(); x.ellipse(42, 33, 34, 18, 0, 0, 7); x.fill(); x.stroke();
        x.strokeStyle = '#2f5d9a'; x.lineWidth = 3; x.beginPath(); x.ellipse(42, 33, 25, 12, 0, 0, 7); x.stroke();
      } else { // トング
        x.strokeStyle = '#120c08'; x.lineWidth = 9; x.beginPath(); x.moveTo(12, 50); x.lineTo(72, 14); x.moveTo(12, 50); x.lineTo(76, 26); x.stroke();
        x.strokeStyle = '#cfd5dc'; x.lineWidth = 5; x.beginPath(); x.moveTo(12, 50); x.lineTo(72, 14); x.moveTo(12, 50); x.lineTo(76, 26); x.stroke();
        x.fillStyle = '#7a3a1a'; x.strokeStyle = '#120c08'; x.lineWidth = 2.5; x.beginPath(); x.ellipse(18, 46, 10, 7, -0.5, 0, 7); x.fill(); x.stroke();
      }
    });
  }
  // 道具の段：マーカーで引いた線（正の字のように）
  function tally(n) {
    let p = '';
    for (let i = 0; i < 3; i++) p += `<path d="M${6 + i * 17} 17 L${13 + i * 17} 3" stroke="${i < n ? '#ffd84d' : '#6a5040'}" stroke-width="5" stroke-linecap="round"/><path d="M${6 + i * 17} 17 L${13 + i * 17} 3" stroke="#2a1206" stroke-width="9" stroke-linecap="round" style="mix-blend-mode:normal" opacity="0"/>`;
    return `<svg viewBox="0 0 56 20" aria-label="${n}/3">${p}</svg>`;
  }

  // ===== はじまり・おわり =====
  // ===== ステージの進み具合（★はステージごとの最高） =====
  const NS = YG.STAGES.length;
  function starsMap() { return store.get('yaki.stars', {}) || {}; }
  // 腕前（はじめに選ぶ）：1＝初心者（ステージ1から）・4＝中級者（ステージ4から）・0＝上級者（本番から。ステージは全部開く）
  function fromLv() { const v = store.get('yaki.from', null); return v === 0 || v === 1 || v === 4 ? v : null; }
  function openUpTo() { const f = fromLv(); return f === 0 ? NS : f || 1; }
  function unlocked(k) { return k === 0 || k <= openUpTo() || (starsMap()[k - 1] || 0) >= 1; }
  function nextStage() { if (fromLv() === 0) return 0; const sm = starsMap(); for (let k = Math.max(1, fromLv() || 1); k <= NS; k++) if (!(sm[k] >= 1)) return k; return 0; }
  const LVPICK = [{ v: 1, d: 0.55, name: jaen('ぜんぜん', 'Not at all'), sub: jaen('初心者。焼き方から', 'Beginner. Start from scratch') }, { v: 4, d: 0.8, name: jaen('ふつう', 'Kinda'), sub: jaen('中級者。火と余熱から', 'Intermediate. Fire and carryover') }, { v: 0, d: 1.05, name: jaen('まかせろ', 'Leave it to me'), sub: jaen('上級者。いきなり本番', 'Expert. Straight to Showtime') }];
  function showLevels() {
    if (window.YP && !YP.canStart()) return;
    const cur = fromLv();
    boss('levelBoss', jaen(['で、あんた。', '肉は焼けるのかい？'], ['So, you.', 'Can you even grill meat?']));
    $('levelList').innerHTML = LVPICK.map((l, j) => `<button class="srow${cur === l.v ? ' cur' : ''}" data-v="${l.v}"><span class="no lvi"><img src="${meatImg('kalbi', l.d, j)}" alt=""></span><span class="tx"><b>${l.name}</b><small>${l.sub}</small></span></button>`).join('');
    $('levelList').querySelectorAll('.srow').forEach((b) => { b.onclick = () => { store.set('yaki.from', Number(b.dataset.v)); $('levels').hidden = true; showBest(); begin(nextStage()); }; });
    ['title', 'stages', 'result'].forEach((id) => { $(id).hidden = true; });
    $('levels').hidden = false;
  }
  function starHtml(n) { return '★'.repeat(n) + '<i>' + '★'.repeat(3 - n) + '</i>'; }
  function stageLabel(k) { return k ? jaen(`ステージ${k}「${YG.STAGES[k - 1].name}」`, `Stage ${k}: ${YG.STAGES[k - 1].name}`) : jaen('本番', 'Showtime'); }

  // はじめて遊ぶステージは、先に「新しく覚えること」を見せる
  function begin(k) {
    if (window.YP && !YP.canStart()) return; // 試遊会：名前を入れてから
    if (!unlocked(k)) return;
    stage = k;
    const seen = store.get('yaki.seen', {}) || {};
    if (k > 0 && !seen[k]) { showIntro(k); return; }
    newRun(k);
  }
  function showIntro(k) {
    const st = YG.STAGES[k - 1];
    $('introNo').textContent = jaen('ステージ ', 'Stage ') + k + ' / ' + NS;
    $('introName').textContent = st.name;
    boss('introBoss', st.intro);
    const nd = YG.starNeed(k, toolSteps()), plus = nd[2] - st.stars[2];
    $('introGoal').innerHTML = jaen(`<div class="goalbig">うまく焼いて <b>${nd[0]}</b>枚 出せ！</div>★2 <b>${nd[1]}</b>枚　★3 <b>${nd[2]}</b>枚${plus ? ` <small>道具ぶん+${plus}</small>` : ''}　${YG.ruleOf(k).duration}秒`,
      `<div class="goalbig">Serve <b>${nd[0]}</b> done right!</div>★2 <b>${nd[1]}</b> &nbsp; ★3 <b>${nd[2]}</b>${plus ? ` <small>+${plus} for tools</small>` : ''} &nbsp; ${YG.ruleOf(k).duration} sec`);
    ['title', 'stages', 'result', 'pause'].forEach((id) => { $(id).hidden = true; });
    $('intro').hidden = false;
  }
  $('introGo').onclick = () => {
    const seen = store.get('yaki.seen', {}) || {};
    seen[stage] = 1; store.set('yaki.seen', seen);
    newRun(stage);
  };
  const LEVELS = [{ from: 1, name: jaen('初心者', 'Beginner'), sub: jaen('焼き方をおぼえる', 'Learn to grill') }, { from: 4, name: jaen('中級者', 'Intermediate'), sub: jaen('火と余熱を使いこなす', 'Master fire and carryover') }, { from: 7, name: jaen('上級者', 'Expert'), sub: jaen('本番と同じ', 'Same as Showtime') }];
  function showStages() {
    if (window.YP && !YP.canStart()) return;
    const sm = starsMap();
    const cur = nextStage();
    let html = '';
    for (let k = 1; k <= NS; k++) {
      const st = YG.STAGES[k - 1], open = unlocked(k);
      const lv = LEVELS.find((l) => l.from === k); if (lv) html += `<div class="lvhead">${lv.name}<small>${lv.sub}</small></div>`;
      html += `<button class="srow${open ? '' : ' lock'}${k === cur ? ' cur' : ''}" data-k="${k}"${open ? '' : ' disabled'}><span class="no">${open ? k : '?'}</span><span class="tx"><b>${st.name}</b><small>${st.learn}</small></span><span class="st"><span class="stars">${starHtml(sm[k] || 0)}</span><small class="goaln">${st.stars[0]}${jaen('枚〜', '+')}</small></span></button>`;
    }
    const total = Object.values(sm).reduce((a, b) => a + b, 0);
    html += `<button class="srow free" data-k="0"><span class="no">${jaen('本番', 'GO')}</span><span class="tx"><b>${jaen('本番', 'Showtime')}</b><small>${cur ? jaen('自信があれば、とばしてここへ', 'Feeling bold? Skip straight here') : jaen('道具なし。腕だけでランク勝負', 'No tools. Rank on skill alone')}</small></span><span class="st">${store.get('yaki.best', 0) || ''}</span></button>`;
    html += `<div class="goal" style="text-align:center">★ ${total} / ${NS * 3}</div>`;
    $('stageList').innerHTML = html;
    $('stageList').querySelectorAll('.srow').forEach((b) => { b.onclick = () => { if (!b.disabled) begin(Number(b.dataset.k)); }; });
    ['title', 'result'].forEach((id) => { $(id).hidden = true; });
    $('stages').hidden = false;
  }
  $('stageBtn').onclick = showStages;
  $('rStages').onclick = showStages;
  $('stagesClose').onclick = () => { $('stages').hidden = true; if (mode === 'result') $('result').hidden = false; else toTitle(); };

  function newRun(k) {
    if (window.YP && !YP.canStart()) return; // 試遊会：名前を入れてから
    if (g && mode === 'play' && window.YP) YP.quit(g, 'retry');
    if (k != null) stage = k;
    // 説明：ステージ1は★1を取るまで毎回。本番などは、はじめての1回だけ
    tut = (stage === 1 && !(starsMap()[1] >= 1)) || store.get('yaki.tut', 0) < 4 ? 0 : 4;
    g = YG.newGame({ tutorial: tut < 4 && stage <= 1, stage, tools: store.get('yaki.tools', {}) });
    held = null; ptr = null; fx = []; react.fill(null); shake = 0; endAt = 0; lastTick = -1;
    banners = []; rankIdx = 0; rankPop = 0; comboPop = 0; resumeT = 0; tip = null; tipsDone = {}; prevState = null; warned10 = false;
    acc = 0; last = null;
    mode = 'play';
    ['title', 'pause', 'result', 'stages', 'intro', 'levels', 'tools'].forEach((id) => { $(id).hidden = true; });
    YS.unlock();
    if (window.YP) YP.start(g);
    if (window.YC) YC.hit(stage ? 'start-s' + stage : 'start-honban');
  }
  function pause(on) {
    if (!g || mode !== 'play' || g.state === 'over') return;
    held = null; ptr = null;
    last = null; // もどったときに、離れていた時間をまとめて足さない
    if (on) { g.paused = true; resumeT = 0; $('pause').hidden = false; YS.silence(); return; }
    if (!g.paused) return;
    $('pause').hidden = true;
    // すぐには動かさない：3・2・1 のあとで再開（遊ぶ前の「ready」なら待たない）
    if (g.state === 'ready') g.paused = false; else resumeT = 1.5;
  }
  function toTitle() {
    if (g && mode === 'play' && window.YP) YP.quit(g, 'title');
    mode = 'title'; g = null;
    ['pause', 'result', 'stages', 'intro', 'levels', 'tools'].forEach((id) => { $(id).hidden = true; });
    $('title').hidden = false;
    YS.silence();
    showBest();
  }
  // ===== 店のレベルと道具 =====
  function shopState() {
    const exp = store.get('yaki.exp', 0) || 0, lv = YG.levelOf(exp);
    const tools = store.get('yaki.tools', {}) || {};
    const used = YG.TOOL_KEYS.reduce((a, k) => a + (tools[k] || 0), 0);
    return { exp, lv, tools, tickets: Math.max(0, lv - 1 - used), next: YG.LV_EXP[lv] };
  }
  function toolSteps() { return YG.toolUp(store.get('yaki.tools', {})).steps; }
  function lvHtml(sh, gained) {
    const lo = YG.LV_EXP[sh.lv - 1], hi = sh.next;
    const pct = hi ? Math.round((sh.exp - lo) / (hi - lo) * 100) : 100;
    return jaen(`店 <span class="lvl">Lv${sh.lv}</span>　${hi ? `あと${hi - sh.exp}枚で Lv${sh.lv + 1}` : 'これ以上ない店'}`, `Shop <span class="lvl">Lv${sh.lv}</span> &nbsp; ${hi ? `${hi - sh.exp} more to Lv${sh.lv + 1}` : 'Maxed out'}`) + `<div class="bar"><i style="width:${pct}%"></i></div>`;
  }
  // 結果のあと：うまく焼けた枚数を経験に足す。レベルが上がったら道具を強くできる
  function addExp(n) {
    const before = shopState();
    store.set('yaki.exp', before.exp + n);
    const sh = shopState();
    let html = lvHtml(sh, n);
    if (sh.lv > before.lv) { html += `<span class="up">${jaen('店が育った！ 道具を1つ強くできる', 'Shop leveled up! Upgrade a tool')}</span>`; YS.rankUp(); }
    if (sh.tickets > 0) html += `<button class="btn2" id="rTools">${jaen('道具を強くする！', 'Upgrade tools!')}</button>`;
    $('rLevel').innerHTML = html;
    if ($('rTools')) $('rTools').onclick = () => showTools(true);
  }
  // 道具の画面：1つ選んで強くする
  let toolsFromResult = false;
  function showTools(fromResult) {
    toolsFromResult = !!fromResult;
    const sh = shopState();
    boss('toolBoss', sh.tickets > 0 ? [jaen(`どれを強くする？ あと<b>${sh.tickets}</b>つだ。`, `Pick one to upgrade. <b>${sh.tickets}</b> left.`)] : jaen(['うまく焼けば店が育つ。', '育ったら道具を強くしてやる。'], ['Grill it right and the shop grows.', "Then I'll upgrade your gear."]), sh.tickets > 0 ? 'grin' : 'say');
    $('toolInfo').innerHTML = lvHtml(sh) + '<small class="lvrule">' + jaen('道具が効くのはステージだけ。本番は腕だけの勝負。<br>強い店ほど客が多く来て、★3の目標も上がる', 'Tools only work in Stages. Showtime is pure skill.<br>Better shop, more customers, tougher ★3.') + '</small>';
    $('toolList').innerHTML = YG.TOOL_KEYS.map((k) => {
      const T = YG.TOOLS[k], n = sh.tools[k] || 0, max = n >= 3;
      const can = !max && sh.tickets > 0;
      const now = n ? T.effect[n] : '';
      const nx = max ? '' : `${n ? '<br>' : ''}${n ? jaen('次は ', 'Next: ') : ''}<span class="nx">${T.effect[n + 1]}</span>`;
      return `<button class="srow tool${max ? ' max' : ''}${can ? '' : ' cant'}" data-k="${k}"><span class="no lvi"><img src="${toolImg(k)}" alt=""></span><span class="tx"><b>${T.lvName[n]}</b><small>${now}${nx}</small></span><span class="pips">${tally(n)}${max ? `<small>${jaen('最高', 'MAX')}</small>` : can ? `<small>${jaen('強くする！', 'Upgrade!')}</small>` : ''}</span></button>`;
    }).join('');
    $('toolList').querySelectorAll('.tool').forEach((b) => {
      b.onclick = () => {
        const s2 = shopState(), k = b.dataset.k;
        if (s2.tickets <= 0 || (s2.tools[k] || 0) >= 3) { YS.deny(); return; }
        s2.tools[k] = (s2.tools[k] || 0) + 1; store.set('yaki.tools', s2.tools);
        YS.rankUp(); showTools(toolsFromResult); showBest();
        if (mode === 'result') addExpRefresh();
      };
    });
    ['title', 'result', 'stages'].forEach((id) => { $(id).hidden = true; });
    $('tools').hidden = false;
  }
  function addExpRefresh() { // 結果画面の「道具を強くする（あと○）」を今の数に
    const sh = shopState();
    $('rLevel').innerHTML = lvHtml(sh) + (sh.tickets > 0 ? `<button class="btn2" id="rTools">${jaen('道具を強くする！', 'Upgrade tools!')}</button>` : '');
    if ($('rTools')) $('rTools').onclick = () => showTools(true);
  }
  $('toolBtn').onclick = () => showTools(false);
  $('langBtn').onclick = () => { if (window.YI) YI.set(YI.en ? 'ja' : 'en'); };
  $('toolsClose').onclick = () => { $('tools').hidden = true; if (toolsFromResult && mode === 'result') $('result').hidden = false; else toTitle(); };
  // トング：返しどき（下が焼けて上がまだ）に肉が跳ねる。名人のトングは焦げそうなときも
  function tongHop(m, t) {
    const lv = g.up.lv.tong; if (!lv || g.state !== 'play') return 0;
    const b = m.side[1 - m.up], top = m.side[m.up];
    const flipTime = b >= 0.6 && b < 1.0 && top < 0.6;
    const danger = lv >= 3 && b >= 1.12 && b < YG.CFG.burnt;
    if (!flipTime && !danger) return 0;
    return -Math.max(0, Math.sin(t * (danger ? 14 : 9))) * (danger ? 9 : 6);
  }
  function showBest() {
    const b = store.get('yaki.best', 0);
    const br = store.get('yaki.bestRank', null);
    const k = nextStage();
    const sm = starsMap();
    const total = Object.values(sm).reduce((a, c) => a + c, 0);
    $('titleStage').innerHTML = k ? jaen(`つぎは <b>${YG.STAGES[k - 1].name}</b>`, `Next up: <b>${YG.STAGES[k - 1].name}</b>`) : (fromLv() === 0 && !(starsMap()[NS] >= 1) ? jaen('つぎは <b>本番</b>', 'Next up: <b>Showtime</b>') : jaen('<b>全部クリア！</b> 本番で自己ベストを', '<b>All clear!</b> Go beat your Showtime best'));
    const sh = shopState();
    $('toolBtn').innerHTML = sh.tickets > 0 ? jaen('道具<span class="badge">を強くできる！</span>', 'Tools <span class="badge">upgrade!</span>') : jaen('道具', 'Tools');
    const brName = br === '特選A5' || br === 'A5+' ? jaen('特選A5', 'A5+') : br; // 特選A5 は今のことばで
    $('titleBest').innerHTML = (total ? `★ <b>${total}</b>/${NS * 3}${jaen('　', ' &nbsp; ')}` : '') + (b ? jaen(`本番の自己ベスト <b>${b}</b>`, `Showtime best <b>${b}</b>`) + (br ? jaen(`　最高ランク <b>${brName}</b>`, ` &nbsp; Top rank <b>${brName}</b>`) : '') : '');
  }
  showBest();
  $('titleBoss').src = bossImg('grin');
  // 文字の形（Potta One・Yusei Magic）が届くまで「焼く」を待たせる（届かなくても 2.5 秒で始められる）
  (function waitFont() {
    const sb = $('startBtn');
    sb.disabled = true; sb.textContent = jaen('準備中…', '...');
    const ready = document.fonts && document.fonts.load ? document.fonts.load('20px "Potta One"', '焼肉0123') : Promise.resolve();
    Promise.race([ready.catch(() => {}), new Promise((r) => setTimeout(r, 2500))]).then(() => { sb.disabled = false; sb.textContent = jaen('焼く', 'GRILL'); });
  })();
  $('startBtn').onclick = () => { if (fromLv() == null && !Object.keys(starsMap()).length) showLevels(); else begin(nextStage()); };
  $('levelsClose').onclick = () => { $('levels').hidden = true; toTitle(); };
  $('lvBtn').onclick = showLevels;
  $('againBtn').onclick = () => { const a = $('againBtn').dataset.next; if (a) begin(Number(a)); else newRun(stage); };
  $('rRetry').onclick = () => newRun(stage);
  $('resumeBtn').onclick = () => pause(false);
  $('retryBtn').onclick = () => newRun(stage);
  $('toTitleBtn').onclick = toTitle;
  $('rTitleBtn').onclick = toTitle;
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); });
  window.addEventListener('blur', () => pause(true));

  function showResult() {
    mode = 'result';
    YS.silence();
    store.set('yaki.plays', store.get('yaki.plays', 0) + 1);
    $('rScore').textContent = g.stage ? jaen('うまく焼けた ' + g.stats.ok + '枚', g.stats.ok + ' done right') : g.score;
    $('rScore').style.fontSize = g.stage ? '32px' : '44px';
    $('rCost').textContent = g.stage ? '' : (g.leftoverCost || 0) + (g.wasteCost || 0) > 0 ? jaen('捨てた・残した肉代 −', 'Wasted meat −') + ((g.leftoverCost || 0) + (g.wasteCost || 0)) : '';
    $('againBtn').textContent = jaen('もう一回', 'Again'); delete $('againBtn').dataset.next;
    $('rRetry').hidden = true; $('rStages').hidden = false;
    addExp(g.stats.ok);
    if (g.stage) showStageResult(); else showFreeResult();
    const tt = YG.title(g);
    $('rTitle').textContent = tt.name;
    $('rWhy').textContent = tt.why;
    const st = g.stats, R = g.R;
    const cells = [[jaen('神焼き', 'Godly'), st.perfect], [jaen('うまい', 'Tasty'), st.great], R.fever && [jaen('フィーバー', 'Fever'), g.fevers], R.vip && st.vipCame && [jaen('審査員の満足', 'Critic happy'), (st.vipWin || 0) + '/' + st.vipCame],
      [jaen('生', 'Raw'), st.raw + st.halfraw, 1], [jaen('焦げ', 'Burnt'), st.burnt + st.char, 1], [jaen('冷め', 'Cold'), st.cold, 1], [jaen('帰った客', 'Walkouts'), st.leave, 1]].filter((c) => c && c[1] && c[1] !== '0');
    $('rStats').innerHTML = cells.map(([k, v, bad]) => `<div${bad ? ' class="bad"' : ''}>${k}<b>${v}</b></div>`).join('');
    const ls = YG.lessons(g).slice(0, 2);
    $('rLessons').innerHTML = '<div class="boss" id="resultBoss"></div>';
    if (ls.length) boss('resultBoss', ls.map((l) => jaen(`${l.text}のが <b>${l.n}</b>${l.key === 'leave' ? '人' : '枚'}。${l.tip}。`, `${l.text}: <b>${l.n}</b>. ${l.tip}.`)), 'hmm');
    else boss('resultBoss', st.served ? jaen(['失敗なし。やるじゃないか。', '次はもっと置いて、にぎやかに。'], ['Zero flops. Not bad, kid.', 'Next time, load up the grill.']) : jaen(['だれにも出してないぞ。', '焼けたら皿へ。そして客へ。'], ["You didn't feed a soul.", 'Grill it. Plate it. Serve it.']), st.served ? 'grin' : 'hmm');
    $('ptFeedback').hidden = true;
    if (window.YP) YP.end(g, g.stage ? { key: 'S' + g.stage } : YG.shopRank(g), tt);
    shareText = brag(tt);
    if (window.YC) YC.hit(g.stage ? `end-s${g.stage}-star${YG.starsOf(g)}` : 'end-honban-' + YG.shopRank(g).key);
    $('result').hidden = false;
  }
  // 自慢する：結果を X・LINE などに送る文
  const GAME_URL = 'https://kensho-goto.github.io/yakiniku-girigiri/';
  let shareText = '';
  function brag(tt) {
    if (g.stage) {
      const k = g.stage, n = YG.starsOf(g);
      return jaen(`焼肉のクソゲー「ジュー」\nステージ${k}「${YG.STAGES[k - 1].name}」${'★'.repeat(n)}${'☆'.repeat(3 - n)}\nうまく焼けた ${g.stats.ok}枚\n称号「${tt.name}」`,
        `JUU, the dumbest yakiniku game\nStage ${k}: ${YG.STAGES[k - 1].name} ${'★'.repeat(n)}${'☆'.repeat(3 - n)}\nGrilled ${g.stats.ok} right\nTitle: ${tt.name}`);
    }
    const rk = YG.shopRank(g);
    return jaen(`焼肉のクソゲー「ジュー」\n本番 ${rk.name}「${rk.word}」\n売上 ¥${g.score}\n称号「${tt.name}」`,
      `JUU, the dumbest yakiniku game\nShowtime rank ${rk.name}: ${rk.word}\nSales ¥${g.score}\nTitle: ${tt.name}`);
  }
  $('rShare').onclick = () => {
    const text = shareText + jaen('\n#ジュー焼肉', '\n#JuuYakiniku');
    if (window.YC) YC.hit('share');
    if (navigator.share && matchMedia('(pointer: coarse)').matches) { navigator.share({ text, url: GAME_URL }).catch(() => {}); return; }
    open('https://x.com/intent/post?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(GAME_URL), '_blank', 'noopener');
  };
  // ステージの結果：★と、次のステージが開いたか
  function showStageResult() {
    const k = g.stage, st = YG.STAGES[k - 1];
    const n = YG.starsOf(g);
    const sm = starsMap();
    const before = sm[k] || 0;
    if (n > before) { sm[k] = n; store.set('yaki.stars', sm); }
    const sb = store.get('yaki.stageBestN', {}) || {};
    const bestBefore = sb[k] || 0;
    const got = g.stats.ok;
    if (got > bestBefore) { sb[k] = got; store.set('yaki.stageBestN', sb); }
    const stamp = $('rRank');
    stamp.className = 'rank r-stage' + (n ? '' : ' r-stage0');
    stamp.innerHTML = `<span class="rk">${starHtml(n)}</span><span class="rw">${stageLabel(k)}</span>`;
    stamp.classList.remove('go'); void stamp.offsetWidth; stamp.classList.add('go');
    const opened = n >= 1 && before === 0 && k < NS;
    const nd = YG.starNeed(k, g.up.steps), need = nd[n];
    $('rNext').innerHTML = jaen(opened ? `ステージ${k + 1}「${YG.STAGES[k].name}」が開いた！` : n === 0 ? `目標まで あと <b>${need - got}</b>枚（目標 ${nd[0]}枚）` : n < 3 ? `★${n + 1}まで あと <b>${need - got}</b>枚` : '★3 達成！',
      opened ? `Stage ${k + 1}: ${YG.STAGES[k].name} unlocked!` : n === 0 ? `<b>${need - got}</b> short. The goal is ${nd[0]}` : n < 3 ? `<b>${need - got}</b> more for ★${n + 1}` : '★3. Respect.');
    if (n >= 1 && before === 0 && k === NS) $('rNext').innerHTML = jaen('全ステージ クリア！ 本番が待っている', 'Every stage cleared! Showtime awaits');
    setTimeout(() => { if (mode === 'result') { YS.stamp(); YS.applause(n * 1.5); } }, 350);
    $('rNew').innerHTML = n > before && before > 0 ? `<span class="new">${jaen('★更新！', 'New ★!')}</span>` : got > bestBefore && bestBefore > 0 ? `<span class="new">${jaen('ステージの自己ベスト！', 'Stage best!')}</span>` : '';
    $('rBest').innerHTML = bestBefore > 0 ? jaen(`このステージの自己ベスト <b>${Math.max(bestBefore, got)}</b>枚`, `Stage best <b>${Math.max(bestBefore, got)}</b>`) : '';
    // 次へ進めるなら、大きいボタンは「次のステージへ」
    if (n >= 1) {
      const nk = k < NS ? k + 1 : 0;
      $('againBtn').textContent = nk ? jaen('次のステージへ', 'Next stage') : jaen('本番へ', 'Showtime');
      $('againBtn').dataset.next = String(nk);
      $('rRetry').hidden = false;
    }
  }
  function showFreeResult() {
    const best = store.get('yaki.best', 0);
    const isNew = g.score > best && best > 0;
    if (g.score > best) store.set('yaki.best', g.score);
    // ランクの判子
    const rk = YG.shopRank(g);
    const order = ['kikaku', 'C', 'B', 'A3', 'A4', 'A5', 'tokusen'];
    const bestRank = store.get('yaki.bestRank', null);
    const rkName = rk.key === 'kikaku' ? null : rk.name;
    if (rkName && (!bestRank || order.indexOf(rk.key === 'tokusen' ? 'tokusen' : rk.key) > order.indexOf(bestRank === '特選A5' || bestRank === 'A5+' ? 'tokusen' : bestRank))) store.set('yaki.bestRank', rkName);
    const stamp = $('rRank');
    stamp.className = 'rank r-' + rk.key;
    stamp.innerHTML = `<span class="rk">${rk.name}</span><span class="rw">${rk.key === 'kikaku' ? jaen('（売上だけなら ' + rk.byScore + '）', 'Sales alone: ' + rk.byScore) : rk.word}</span>`;
    stamp.classList.remove('go'); void stamp.offsetWidth; stamp.classList.add('go');
    const nx = rk.key !== 'tokusen' && rk.next;
    $('rNext').innerHTML = jaen(rk.key === 'kikaku' ? '焦がしすぎて格付けできません' : nx ? `${nx.key}まで あと <b>${nx.need}</b>点` : rk.key === 'A5' ? '失敗なし＋神焼き5枚で <b>特選A5</b>' : '最高ランク！',
      rk.key === 'kikaku' ? 'Too burnt to grade' : nx ? `<b>${nx.need}</b> more for ${nx.key}` : rk.key === 'A5' ? 'Zero flops and 5 Godly for <b>A5+</b>' : 'Top rank!');
    setTimeout(() => { if (mode === 'result') { YS.stamp(); YS.applause(Math.max(0, rk.index)); } }, 350);
    $('rNew').innerHTML = isNew && g.score > 0 ? `<span class="new">${jaen('自己ベスト更新！', 'New best!')}</span>` : '';
    $('rBest').innerHTML = best > 0 ? jaen(`本番の自己ベスト <b>${Math.max(best, g.score)}</b>`, `Showtime best <b>${Math.max(best, g.score)}</b>`) : jaen('はじめての本番の記録', 'Your first Showtime score');
  }

  // ===== 当たり判定 =====
  function hit(x, y) {
    if (y < 46) {
      if (x > 340) return { kind: 'pause' };
      if (x > 290) return { kind: 'sound' };
      return null;
    }
    for (const j of junkBadges()) if (Math.hypot(x - j.x, y - j.y) < 24) return { kind: 'junk', id: j.id };
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

  // 焦げた肉・冷めた肉（出しても失敗）には「×」を付けて、タップで捨てられるようにする
  function isJunk(m) { return m && m.loc !== 'gone' && (Math.max(m.side[0], m.side[1]) >= YG.CFG.burnt || (m.loc === 'plate' && m.restDone && m.warm < YG.CFG.warmCold)); }
  function junkBadges() {
    const out = [];
    if (!g) return out;
    g.grill.forEach((id, i) => { if (id && isJunk(g.meats[id])) { const s = L.slot(i); out.push({ id, x: s.x + 44, y: s.y - 36 }); } });
    g.plates.forEach((id, p) => { if (id && isJunk(g.meats[id])) out.push({ id, x: L.plateX[p] + 34, y: L.plateY - 30 }); });
    return out;
  }

  // ===== 操作 =====
  // 長押しで「持つ」までの時間（ゆっくりのタップを裏返しと取りちがえないよう長め）。軽いトング（2段）なら短い
  function longMs() { return g && g.up.lv.tong >= 2 ? 220 : 600; }
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
        if (ptr && !ptr.drag && ptr.h === h) { held = { kind: 'meat', id: h.id }; ptr.handled = true; YS.buzz(15); }
      }, longMs());
    }
    e.preventDefault();
  });
  cv.addEventListener('pointermove', (e) => {
    if (!ptr || e.pointerId !== ptr.id) return;
    const p = toLogical(e);
    ptr.x = p.x; ptr.y = p.y;
    if (!ptr.drag && Math.hypot(p.x - ptr.sx, p.y - ptr.sy) > 12) {
      const h = ptr.h;
      if (h && h.kind === 'tray' && (h.type === 'toku' ? g.toku > 0 : g.R.types.includes(h.type))) ptr.drag = { kind: 'new', type: h.type };
      else if (h && (h.kind === 'slot' || h.kind === 'plate' || h.kind === 'junk') && h.id && g.meats[h.id] && g.meats[h.id].loc !== 'gone') ptr.drag = { kind: 'meat', id: h.id };
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
    if (h.kind === 'sound') { const lv = YS.cycle(); float(315, 64, jaen(['音あり', '音楽だけ消した', '音を消した'], ['Sound on', 'Music off', 'Muted'])[lv], '#fff', 13, 1.2); return; }
    if (h.kind === 'junk') { held = null; YG.discard(g, h.id); return; }
    if (h.kind === 'tray' && h.type === 'toku' && g.toku <= 0) { YS.deny(); float(L.trayX[3], L.trayY - 60, jaen('審査員が来たら焼ける', 'Critic only'), '#ffd84d', 13); held = null; return; }
    if (h.kind === 'tray' && h.type !== 'toku' && !g.R.types.includes(h.type)) { YS.deny(); float(L.trayX[YG.TRAY_KEYS.indexOf(h.type)], L.trayY - 60, jaen('このステージでは使わない', 'Not this stage'), '#ffd84d', 13); held = null; return; }
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
      else if (h.id !== m.id) { YS.deny(); float(L.plateX[h.p], L.plateY - 40, jaen('皿がいっぱい', 'Plates full'), '#ffb3a0', 13); }
      return;
    }
    if (h.kind === 'trash') { YG.discard(g, m.id); return; }
    if (h.kind === 'seat') {
      // 余熱がまだ（網の上・皿で余熱中）なら、皿に置いて「出す予定」にする。余熱が終わったら自動で出る
      const r = YG.reserve(g, m.id, h.i);
      if (!r.ok && r.why === 'full') { YS.deny(); float(L.seatX[h.i], 130, jaen('皿がいっぱい', 'Plates full'), '#ffb3a0', 14); }
      else if (!r.ok && r.why === 'noone') YS.deny();
    }
  }

  // ===== 演出 =====
  function float(x, y, text, color, size, life) { fx.push({ k: 'text', x, y, text, color, size: size || 18, t: 0, life: life || 1.1 }); }
  function burst(x, y, n, color, spread, up) {
    for (let i = 0; i < n; i++) fx.push({ k: 'dot', x, y, vx: (Math.random() - 0.5) * spread, vy: -Math.random() * (up || 120), color, t: 0, life: 0.6 + Math.random() * 0.5, r: 2 + Math.random() * 3 });
  }
  function banner(text, sub, color, life) { banners = []; banners.push({ text, sub, color, t: 0, life: Math.min(1.4, life || 1.4) }); }
  function smoke(x, y, dark) { fx.push({ k: 'smoke', x: x + (Math.random() - 0.5) * 40, y, vx: (Math.random() - 0.5) * 10, vy: -30 - Math.random() * 20, t: 0, life: 1.4, r: 8, dark }); }

  const RANK_TEXT = jaen({ perfect: '神焼き!!', great: 'うまい!', good: 'ふつう', meh: 'いまいち', miss: 'ちがう…', raw: 'ナマ!', halfraw: '片面ナマ', burnt: 'コゲ', char: '炭', cold: '冷めた', leave: '帰った' },
    { perfect: 'GODLY!!', great: 'Tasty!', good: 'Fine', meh: 'Meh', miss: 'Nope...', raw: 'RAW!', halfraw: 'Half raw', burnt: 'Burnt', char: 'Charcoal', cold: 'Cold', leave: 'Gone' });
  const nReact = {};
  function handleEvents() {
    const evs = g.events; g.events = [];
    for (const ev of evs) {
      if (ev.type === 'place') { YS.place(); const s = L.slot(ev.slot); burst(s.x, s.y, 8, '#fff6', 60, 60); if (tut === 0) setTut(1); }
      else if (ev.type === 'flip') { YS.flip(); if (tut === 1) setTut(2); }
      else if (ev.type === 'move') YS.flip();
      else if (ev.type === 'plate') { YS.plate(); if (tut <= 2 && ev.fromGrill) setTut(3); }
      else if (ev.type === 'discard') { YS.discard(); store.set('yaki.didDiscard', 1); burst(L.trash.x, L.trash.y - 24, 10, '#9aa3aa', 70, 90); float(L.trash.x, L.trash.y - 30, jaen('ポイ', 'Toss!'), '#fff', 14, 0.8); if (ev.cost) float(L.trash.x, L.trash.y - 50, jaen('肉代 −', 'Meat −') + ev.cost, '#ff9a8a', 15); }
      else if (ev.type === 'reserve') { YS.plate(); float(L.plateX[ev.plate], L.plateY - 50, jaen('余熱が終わったら出す', 'Serves once it rests'), '#ffe14d', 12); if (tut === 3) setTut(4); }
      else if (ev.type === 'reserveLost') { YS.deny(); float(L.plateX[ev.plate], L.plateY - 50, jaen('出す予定の客が帰った', 'They walked out'), '#ff9a8a', 12); }
      else if (ev.type === 'rested') { YS.rested(); burst(L.plateX[ev.plate], L.plateY, 6, '#ffd84d', 80, 60); }
      else if (ev.type === 'burning') { YS.burning(); }
      else if (ev.type === 'fever') { YS.fever(); YS.buzz([30, 30, 30]); banner(jaen('フィーバー！', 'FEVER!'), jaen('10秒間 点数×', 'Points ×') + YG.CFG.feverMult + jaen('', ' for 10 sec'), '#ffd84d'); burst(200, 460, 50, '#ffd84d', 400, 300); }
      else if (ev.type === 'feverMore') { YS.fever(); banner(jaen('フィーバー延長！', 'MORE FEVER!'), '+' + YG.CFG.feverTime + jaen('秒', ' sec'), '#ffd84d', 1.2); }
      else if (ev.type === 'feverEnd') { YS.feverEnd(); if (ev.broken) banner(jaen('フィーバー終了…', 'Fever over...'), jaen('失敗でメーターが0に', 'A flop killed the meter'), '#ff9a8a', 1.2); }
      else if (ev.type === 'vip') { YS.vip(); banner(jaen('審査員が来た！', 'THE CRITIC IS HERE!'), jaen('特上カルビで 点数×', 'Prime Kalbi: points ×') + YG.CFG.vipMult, '#ffd84d', 2); }
      else if (ev.type === 'lastOrder') { YS.lastOrder(); banner(jaen('ラストオーダー！', 'LAST CALL!'), jaen('客がどっと来る', 'Here comes the rush'), '#ff7a2f', 1.6); }
      else if (ev.type === 'leave') {
        YS.leave(); YS.buzz(80);
        if (ev.vip) banner(jaen('審査員が帰った…', 'The critic left...'), '', '#ff9a8a', 1.2);
        const seat = g.seats[ev.seat];
        react[ev.seat] = YL.line({ fail: 'leave', rank: 'fail' }, seat.cust.char, bump('leave'));
      } else if (ev.type === 'serve') {
        const e = ev.entry, r = e.result;
        const info = YL.line(r, e.char, bump(YL.reactKey(r)));
        const key = r.fail || r.rank;
        info.head = RANK_TEXT[key] || ''; // 評価は吹き出しの中に大きく（同じ言葉を2回出さない）
        react[ev.seat] = info;
        const x = L.seatX[ev.seat];
        const good = r.rank === 'perfect' || r.rank === 'great';
        if (g.stage) { if (YG.goodRank(r)) float(x, L.counterY + 22, jaen('+1枚', '+1'), '#ffd84d', 20, 1.3); } // ステージは枚数で数える
        else if (e.pts) float(x, L.counterY + 22, '+' + e.pts, '#ffd84d', 20, 1.3); // 点はカウンターの上（顔に重ねない）
        if (e.combo >= 2 && good) comboPop = 1;
        if (r.fail) YS.buzz([60, 40, 60]); else if (r.rank === 'perfect') YS.buzz(25);
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
      } else if (ev.type === 'end') { YS.end(); endAt = clock; if (ev.leftoverCost) float(200, 440, jaen('残した肉 −', 'Leftovers −') + ev.leftoverCost, '#ff9a8a', 20, 1.4); }
    }
  }
  // ステージの案内：まだ★1を取っていないステージだけ、起きたときに1回だけ
  function showTip(key, x, y, text) { if (tipsDone[key]) return; tipsDone[key] = 1; tip = { x, y, text, t: 0 }; }
  function checkTips(dt) {
    if (tip) { tip.t += dt; if (tip.t > 3.2) tip = null; }
    if (g.state === 'play' && !store.get('yaki.didDiscard', 0)) { const j = junkBadges()[0]; if (j) showTip('junk', j.x - 30, j.y + 36, jaen('×をタップで すてる', 'Tap the × to toss it')); }
    if (!g.stage || tut < 4 || g.state !== 'play' || (starsMap()[g.stage] || 0) >= 1) return;
    const k = g.stage;
    for (let i = 0; i < 6; i++) {
      const id = g.grill[i]; if (!id) continue;
      const m = g.meats[id], b = m.side[1 - m.up], s = L.slot(i);
      if (k === 2 && b > 0.5 && b < 0.9) showTip('juice', s.x, s.y + 66, jaen('肉汁＝下が焼けた合図', "Juice means the bottom's done"));
      if (k === 2 && b > 1.15) showTip('smoke', s.x, s.y + 66, jaen('煙＝下が焦げはじめ！ 返すか上げる', 'Smoke! Flip it or pull it'));
      if (k === 4 && YG.fireName(i, g.R.fires) === 'strong' && b > 1.0) showTip('strong', s.x, s.y + 66, jaen('焦げそう？ 弱火へドラッグで逃がせる', 'Burning? Drag it to low heat'));
    }
    if (k === 3) g.seats.forEach((st, i) => { if (st.state === 'wait' && st.cust.order.target !== 'hodo') showTip('target', L.seatX[i], 232, jaen('焼き色の見本に合わせる', 'Match the color sample')); });
    if (k === 5) g.plates.forEach((id, p) => { if (id && g.meats[id].rest && !g.meats[id].restDone) showTip('carry', L.plateX[p], L.plateY + 56, jaen('輪が回るあいだは、まだ焼ける', 'Still cooking while the ring fills')); });
    if (k === 6 && YG.activeCount(g) >= 3) showTip('busy', 200, L.counterY + 50, jaen('3枚同時で 点×1.2！', '3 at once: points ×1.2!'));
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
    if (resumeT > 0 && g && mode === 'play') { resumeT -= dt; if (resumeT <= 0) { resumeT = 0; g.paused = false; last = null; } }
    const playing = mode === 'play' && g && !g.paused && g.state === 'play';
    YS.bgm(playing ? (g.feverLeft > 0 ? 'fever' : g.lastOrder ? 'last' : 'normal') : 'off');
    if (mode === 'play' && g && !g.paused) {
      acc += dt;
      while (acc >= STEP) { YG.step(g, STEP); acc -= STEP; }
      handleEvents();
      if (prevState === 'ready' && g.state === 'play') banner(jaen('スタート！', 'GO!'), g.stage ? jaen(g.R.duration + '秒で うまく焼いて ' + YG.STAGES[g.stage - 1].stars[0] + '枚！', 'Nail ' + YG.STAGES[g.stage - 1].stars[0] + ' in ' + g.R.duration + ' sec!') : jaen('道具なし・腕だけで ' + g.R.duration + '秒', 'No tools. Just skill. ' + g.R.duration + ' sec'), '#ffd84d', 1.4);
      if (g.state === 'play' && g.timeLeft <= 10 && !warned10) { warned10 = true; banner(jaen('のこり10秒！', '10 SEC LEFT!'), '', '#ff5a3a', 1.2); }
      prevState = g.state;
      checkTips(dt);
      // ランクが上がったら、上の欄でポンと知らせる
      const ri = g.stage ? YG.starsOf(g) : scoreRank(g.score);
      if (ri > rankIdx) { rankIdx = ri; rankPop = 1; YS.rankUp(); }
      // フィーバー中は火の粉が舞う
      if (g.feverLeft > 0 && Math.random() < dt * 30) fx.push({ k: 'dot', x: 20 + Math.random() * 360, y: 610, vx: (Math.random() - 0.5) * 30, vy: -260 - Math.random() * 120, color: Math.random() < 0.5 ? '#ffd84d' : '#ff7a2f', t: 0, life: 1.2, r: 2 + Math.random() * 2, float: true });
      // 煙（下の面が焦げはじめたら）
      for (let i = 0; i < 6; i++) {
        const id = g.grill[i]; if (!id) continue;
        const m = g.meats[id];
        const b = m.side[1 - m.up];
        const s = L.slot(i);
        if (b > 1.15 && Math.random() < dt * (b > YG.CFG.burnt ? 14 : 5)) smoke(s.x, s.y - 46, b > YG.CFG.burnt); // 肉の奥から立つ（表面を隠さない）
        if (YG.fireName(i, g.R.fires) === 'strong' && (m.type === 'kalbi' || m.type === 'toku') && Math.random() < dt * 3) burst(s.x + (Math.random() - 0.5) * 50, s.y + 20, 2, '#ffb030', 40, 120);
      }
      let sz = 0;
      g.grill.forEach((id, i) => { if (id) sz += g.R.fires[i] * (1 + (g.meats[id].side[1 - g.meats[id].up] > 1.2 ? 0.8 : 0)); });
      if (g.state === 'over') YS.silence(); else YS.sizzle(sz);
      // 残り5秒の音
      if (g.state === 'play' && g.timeLeft <= 5) { const s = Math.ceil(g.timeLeft); if (s !== lastTick) { lastTick = s; YS.tick(); } }
      if (g.state === 'over' && endAt && clock - endAt > 1.4 && mode === 'play') showResult();
    }
    for (const f of fx) { f.t += dt; if (f.k !== 'text') { f.x += (f.vx || 0) * dt; f.y += (f.vy || 0) * dt; if (f.k === 'dot' && !f.float) f.vy += 300 * dt; } }
    for (const b of banners) b.t += dt;
    banners = banners.filter((b) => b.t < b.life);
    rankPop = Math.max(0, rankPop - dt * 0.8);
    comboPop = Math.max(0, comboPop - dt * 2.5);
    fx = fx.filter((f) => f.t < f.life);
    shake = Math.max(0, shake - dt);
    render();
  }

  // タイトルのロゴが、ちょうちん（論理座標 x=30・370、y=36〜102）にかぶるか。0.5秒ごとに測る
  let lanternMemo = { at: -1, hit: false };
  function logoHitsLantern() {
    if (clock - lanternMemo.at < 0.5 && lanternMemo.at >= 0) return lanternMemo.hit;
    const el = document.querySelector('#title .logo');
    const r = el && !document.getElementById('title').hidden ? el.getBoundingClientRect() : null;
    let hit = false;
    if (r && r.width) {
      for (const x of [30, 370]) {
        const lx0 = ox + (x - 16) * scale, lx1 = ox + (x + 16) * scale, ly0 = oy + 30 * scale, ly1 = oy + 104 * scale;
        if (r.left < lx1 && r.right > lx0 && r.top < ly1 && r.bottom > ly0) hit = true;
      }
    }
    lanternMemo = { at: clock, hit };
    return hit;
  }

  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#1a100c';
    ctx.fillRect(0, 0, cv.width, cv.height);
    const sx = shake ? (Math.random() - 0.5) * 8 : 0, sy = shake ? (Math.random() - 0.5) * 8 : 0;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (ox + sx), dpr * (oy + sy));
    const t = clock;
    YD.drawBackground(ctx, t, ext, !g && logoHitsLantern());
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
      YD.drawOrder(ctx, seat, i, t, { target, noPts: !!g.stage });
      if (seat.state === 'react' || seat.state === 'leave') YD.drawReact(ctx, seat, i, react[i], t);
    }
    // 皿・炭入れ
    for (let p = 0; p < 3; p++) {
      const id = g.plates[p];
      const m = id ? g.meats[id] : null;
      const hint = carryMeat && carryMeat.loc === 'grill' && !id;
      YD.drawPlate(ctx, p, m, t, { hint, selected: held && held.kind === 'meat' && held.id === id, hideMeat: dragging && ptr.drag.id === id });
    }
    const junk = junkBadges();
    YD.drawTrash(ctx, t, { hint: !!carryMeat || junk.length > 0 });
    // 網
    const hint = carrying ? g.grill.map((id) => !id) : null;
    YD.drawGrill(ctx, t, { hint, fever: g.feverLeft > 0, fires: g.R.fires, grade: g.shopSteps });
    for (let i = 0; i < 6; i++) {
      const id = g.grill[i]; if (!id) continue;
      if (dragging && ptr.drag.id === id) continue;
      const s = L.slot(i);
      const m = g.meats[id];
      const bob = Math.sin(t * 12 + id) * 0.4;
      YD.drawMeat(ctx, m, s.x, s.y + 6 + bob + tongHop(m, t), { scale: 1.12, onGrill: true, t, selected: held && held.kind === 'meat' && held.id === id });
    }
    YD.drawTray(ctx, t, held && held.kind === 'new' ? held.type : null, g.toku, g.R.types);
    for (const j of junk) { if (!(dragging && ptr.drag.id === j.id)) YD.drawJunkBadge(ctx, j.x, j.y, t); }
    // 演出
    for (const f of fx) {
      const a = 1 - f.t / f.life;
      if (f.k === 'smoke') {
        ctx.fillStyle = f.dark ? `rgba(30,30,30,${0.45 * a})` : `rgba(200,200,200,${0.28 * a})`;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r + f.t * 16, 0, 7); ctx.fill();
      } else if (f.k === 'dot') {
        ctx.globalAlpha = a; ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
      }
    }
    YD.drawFireTags(ctx, g.R.fires);
    // 長押しで「持つ」までの輪
    if (ptr && !ptr.drag && !ptr.handled && ptr.h && ptr.h.kind === 'slot' && ptr.h.id) {
      const k = (performance.now() - ptr.t0 - Math.min(200, longMs() / 3)) / (longMs() - Math.min(200, longMs() / 3));
      if (k > 0 && k < 1) { const s = L.slot(ptr.h.i); ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(s.x, s.y, 46, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke(); }
    }
    // ドラッグ中の肉（指で隠れないよう少し上に）
    if (dragging) {
      if (ptr.drag.kind === 'new') YD.drawMeat(ctx, YD.trayMeat(ptr.drag.type), ptr.x, ptr.y - 34, { scale: 1, lift: 6, t });
      else YD.drawMeat(ctx, g.meats[ptr.drag.id], ptr.x, ptr.y - 34, { scale: 1, lift: 6, t });
    }
    drawBanners();
    for (const f of fx) {
      if (f.k !== 'text') continue;
      const a = Math.min(1, (1 - f.t / f.life) * 2.5);
      const pop = Math.min(1, f.t * 8);
      ctx.save(); ctx.globalAlpha = a; ctx.translate(f.x, f.y - f.t * 26); ctx.scale(0.6 + 0.4 * pop, 0.6 + 0.4 * pop);
      ctx.font = `${f.size}px "Potta One", "Hiragino Sans", sans-serif`; ctx.textAlign = 'center';
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(40,10,0,0.9)'; ctx.strokeText(f.text, 0, 0);
      ctx.fillStyle = f.color; ctx.fillText(f.text, 0, 0);
      ctx.restore();
    }
    renderHud(t);
    renderTutorial(t);
    if (tip && g.state !== 'over') bubble(tip.x, tip.y, tip.text, -1, t);
    if (resumeT > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(ext.x0, ext.y0, ext.x1 - ext.x0, ext.y1 - ext.y0);
      bigText(String(Math.ceil(resumeT / 0.5)), 200, 470, 90, '#ffd84d');
    }
    if (g.state === 'over') {
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(ext.x0, ext.y0, ext.x1 - ext.x0, ext.y1 - ext.y0);
      bigText(jaen('そこまで！', "TIME'S UP!"), 200, 380, jaen(52, 46), '#ffd84d');
    }
  }
  // 大きな知らせ（カウンターの帯に重ねる。操作は止めない）。点などの浮く文字はこの上に描く
  function drawBanners() {
    for (const b of banners) {
      const k = b.t / b.life;
      const pop = Math.min(1, b.t * 7);
      const a = Math.min(1, (1 - k) * 4);
      ctx.save(); ctx.globalAlpha = a;
      // カウンターの帯に重ねる（客の顔・注文・網を隠さない）
      ctx.translate(200, L.counterY + 8); ctx.scale(0.5 + 0.5 * pop + (pop < 1 ? 0.2 : 0), 0.5 + 0.5 * pop);
      ctx.rotate(-0.035);
      YD.say(ctx, b.text, 0, 4, 28, b.color, { big: true, lw: 8 });
      if (b.sub) YD.say(ctx, b.sub, 0, 28, 14, '#fff', { lw: 5 });
      ctx.restore();
    }
  }
  function hitSeat(p, i) { return p && p.y < L.counterY + 8 && Math.abs(p.x - L.seatX[i]) < 66; }
  function bigText(text, x, y, size, color) {
    ctx.font = `${size}px "Potta One", "Hiragino Sans", sans-serif`; ctx.textAlign = 'center';
    ctx.lineWidth = 8; ctx.strokeStyle = '#3a0e00'; ctx.strokeText(text, x, y);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  }
  function scoreRank(score) { let i = 0; YG.CFG.ranks.forEach((r, k) => { if (score >= r.min) i = k; }); return i; }
  const RANK_COLOR = { C: ['#6b6b6b', '#fff'], B: ['#b0703a', '#fff'], A3: ['#c9ced6', '#2a2a2a'], A4: ['#ffd84d', '#3a1a00'], A5: ['#ff5a8a', '#fff'] };
  function renderHud(t) {
    { // 上の帯は店の梁（はり）：木の板と木目
      const bx0 = ext.x0, bw = ext.x1 - ext.x0;
      const wg = ctx.createLinearGradient(0, ext.y0, 0, 44);
      wg.addColorStop(0, '#2c190d'); wg.addColorStop(0.55, '#4a2c17'); wg.addColorStop(1, '#3a2010');
      ctx.fillStyle = wg; ctx.fillRect(bx0, ext.y0, bw, 44 - ext.y0);
      ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 1;
      for (let j = 0; j < 3; j++) { const yy = 12 + j * 11; ctx.beginPath(); ctx.moveTo(bx0, yy); ctx.bezierCurveTo(90, yy + 3, 250, yy - 4, ext.x1, yy + 2); ctx.stroke(); }
      ctx.fillStyle = '#1c0f07'; ctx.fillRect(bx0, 41, bw, 3);
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(bx0, 44, bw, 6);
    }
    // フィーバーのメーター（上の欄の下の細い帯）
    const F = YG.CFG;
    if (g.R.fever) { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(ext.x0, 44, ext.x1 - ext.x0, 6); }
    if (!g.R.fever) { /* フィーバーのメーターはステージ6から */ } else if (g.feverLeft > 0) {
      ctx.fillStyle = `hsl(${(t * 400) % 360},90%,60%)`;
      ctx.fillRect(0, 44, W * Math.min(1, g.feverLeft / F.feverTime), 6);
    } else {
      ctx.fillStyle = '#ff7a2f'; ctx.fillRect(0, 44, W * Math.min(1, g.feverGauge / F.feverNeed), 6);
    }
    if (g.stage) renderStars(); else renderRank();
    function renderRank() {
    // いまのランクと、次までの近さ
    const ri = scoreRank(g.score);
    const rk = F.ranks[ri];
    const nx = F.ranks[ri + 1];
    const col = RANK_COLOR[rk.key];
    const pop = 1 + rankPop * 0.25;
    if (ri > 0) { // C のあいだは出さない（はじめから「見切り品」と言わない）
    ctx.save(); ctx.translate(262, 18); ctx.scale(pop, pop);
    YD.say(ctx, rk.key, 0, 7, 20, col[0] === '#6b6b6b' ? '#ddd' : col[0], { big: true, lw: 5.5 });
    ctx.restore();

    }
    if (rankPop > 0) { // ランクアップの知らせ
      ctx.save(); ctx.globalAlpha = Math.min(1, rankPop * 2);
      ctx.font = '14px "Potta One", "Hiragino Sans", sans-serif'; ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = '#3a0e00'; ctx.strokeText(jaen('ランクUP!', 'RANK UP!'), 262, 66 - (1 - rankPop) * 8);
      ctx.fillStyle = '#ffd84d'; ctx.fillText(jaen('ランクUP!', 'RANK UP!'), 262, 66 - (1 - rankPop) * 8);
      ctx.restore();
    }
    }
    // ステージ：★3つと、次の★までの近さ
    function renderStars() {
      const n = YG.starsOf(g);
      const pop = 1 + rankPop * 0.35;
      ctx.save(); ctx.translate(262, 20); ctx.scale(pop, pop);
      for (let i = 0; i < 3; i++) YD.say(ctx, '★', -17 + i * 17, 6, 18, i < n ? '#ffd84d' : '#6a5040', { big: true, lw: 4.5 });
      ctx.restore();
      const nd = YG.starNeed(g.stage, g.up.steps);
      const lo = n ? nd[n - 1] : 0, hi = nd[Math.min(2, n)];
      void lo; void hi;
      if (rankPop > 0) {
        ctx.save(); ctx.globalAlpha = Math.min(1, rankPop * 2);
        ctx.font = '14px "Potta One", "Hiragino Sans", sans-serif'; ctx.textAlign = 'center';
        const tx = n >= 3 ? '★3!' : '★' + n + '!';
        ctx.lineWidth = 4; ctx.strokeStyle = '#3a0e00'; ctx.strokeText(tx, 262, 66 - (1 - rankPop) * 8);
        ctx.fillStyle = '#ffd84d'; ctx.fillText(tx, 262, 66 - (1 - rankPop) * 8);
        ctx.restore();
      }
    }
    const tl = Math.ceil(g.timeLeft);
    const hurry = g.state === 'play' && g.timeLeft <= 10;
    const left = Math.max(0, Math.min(1, g.timeLeft / g.R.duration));
    { // 時計：白い盤が減っていく
      const cx = 172, cy = 22, r = 12;
      ctx.save(); ctx.translate(cx, cy);
      if (hurry) ctx.rotate(Math.sin(t * 30) * 0.12);
      ctx.fillStyle = '#2a1206'; ctx.beginPath(); ctx.arc(0, 0, r + 3, 0, 7); ctx.fill();
      ctx.fillStyle = '#5a3a28'; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
      ctx.fillStyle = left > 0.5 ? '#fff6e6' : left > 0.22 ? '#ffd84d' : '#ff6a4a';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#2a1206'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      const a = -Math.PI / 2 + Math.PI * 2 * left; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * (r - 2), Math.sin(a) * (r - 2)); ctx.stroke();
      ctx.fillStyle = '#2a1206'; ctx.fillRect(-3, -r - 7, 6, 4);
      ctx.restore();
    }
    ctx.save(); ctx.translate(208, 32);
    if (hurry) { const p = 1 + 0.12 * Math.max(0, Math.sin(t * 12)); ctx.scale(p, p); }
    YD.say(ctx, String(tl), 0, 0, 26, hurry ? '#ff5a3a' : '#fff', { big: true, lw: 6 });
    ctx.restore();
    ctx.textAlign = 'left';
    let lx;
    if (g.stage) {
      const n = YG.starsOf(g), goal = YG.starNeed(g.stage, g.up.steps)[Math.min(2, n)];
      const tx = g.stats.ok + '/' + goal;
      YD.say(ctx, tx, 12, 34, 22, n ? '#ffd84d' : '#fff', { big: true, align: 'left', lw: 6 });
      const w = ctx.measureText(tx).width; YD.say(ctx, jaen('枚', ''), 15 + w, 34, 13, '#ffe9cf', { align: 'left', lw: 4 });
      lx = Math.max(80, 12 + w + 32);
    } else {
    YD.say(ctx, '¥', 12, 34, 15, '#ffd84d', { big: true, align: 'left', lw: 5 });
    YD.say(ctx, String(g.score), 26, 34, 22, '#ffd84d', { big: true, align: 'left', lw: 6 });
    lx = Math.max(70, 26 + ctx.measureText(String(g.score)).width + 10); // 点の桁が増えても重ならない
    }
    if (g.combo >= 2) {
      ctx.save(); ctx.translate(lx, 24); ctx.rotate(-0.08); ctx.scale(1 + comboPop * 0.4, 1 + comboPop * 0.4);
      YD.say(ctx, g.combo + jaen('コンボ', ' combo'), 0, 0, 18, '#ff9a3f', { big: true, align: 'left', lw: 5.5 });
      ctx.restore();
    }
    const busy = YG.activeCount(g);
    if (g.R.busy && busy >= 2 && g.state === 'play') YD.say(ctx, busy + jaen('枚同時 ×', ' at once ×') + (1 + YG.CFG.busyStep * (busy - 1)).toFixed(1), lx, 40, 12, '#ffe9cf', { align: 'left', lw: 4 });
    // 音・一時停止ボタン
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#2a1206'; ctx.lineWidth = 4;
    [360, 371].forEach((px) => { ctx.beginPath(); ctx.rect(px, 12, 6, 20); ctx.stroke(); ctx.fill(); });
    // スピーカー
    ctx.beginPath(); ctx.moveTo(303, 18); ctx.lineTo(309, 18); ctx.lineTo(316, 12); ctx.lineTo(316, 32); ctx.lineTo(309, 26); ctx.lineTo(303, 26); ctx.closePath(); ctx.stroke(); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
    if (YS.level >= 2) { ctx.beginPath(); ctx.moveTo(319, 16); ctx.lineTo(327, 28); ctx.moveTo(327, 16); ctx.lineTo(319, 28); ctx.stroke(); }
    else {
      ctx.beginPath(); ctx.arc(316, 22, 7, -0.8, 0.8); ctx.stroke();
      if (YS.level === 0) { ctx.beginPath(); ctx.arc(316, 22, 12, -0.8, 0.8); ctx.stroke(); }
      else { ctx.font = '10px "Yusei Magic", "Hiragino Sans", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('♪', 327, 16); ctx.beginPath(); ctx.moveTo(322, 9); ctx.lineTo(332, 19); ctx.stroke(); } // 音楽だけ消した
    }
    if (g.state === 'ready') {
      const gy = L.grill.y + L.grill.h / 2, bob = Math.sin(t * 4) * 3;
      ctx.save(); ctx.translate(200, gy - 22 + bob); ctx.rotate(-0.04);
      if (g.stage) YD.say(ctx, YG.STAGES[g.stage - 1].name, 0, 0, 30, '#ffd84d', { big: true, lw: 8 });
      else YD.say(ctx, jaen('本番', 'Showtime'), 0, 0, 34, '#ffd84d', { big: true, lw: 8 });
      ctx.restore();
      YD.say(ctx, jaen('肉を1枚置いたら スタート', 'Drop one piece to start'), 200, gy + 20, 17, '#fff', { lw: 5.5 });
      YD.say(ctx, g.R.duration + jaen('秒', ' sec'), 200, gy + 46, 17, '#ffe2bf', { lw: 5.5 });
      if (!g.stage && g.shopSteps) YD.say(ctx, jaen('本番は道具なし。腕だけの勝負', 'No tools in Showtime. Just skill'), 200, gy + 76, 14, '#ffd84d', { lw: 4.5 }); // 道具を強くした人にだけ
    }
  }
  // 説明：やることを、その場所に1つずつ出す。指が動いて、どう触るかを見せる
  function renderTutorial(t) {
    if (g.state === 'over') return;
    if (tut >= 4) { serveHint(t); return; }
    let x, y, text, dir = 1;
    if (tut === 0) {
      const ty = g.R.types.includes('kalbi') ? 'kalbi' : g.R.types[0];
      const tx = L.trayX[YG.TRAY_KEYS.indexOf(ty)];
      const free = [1, 0, 2, 4, 3, 5].find((i) => !g.grill[i]);
      if (free != null && !(ptr && ptr.drag)) { const s = L.slot(free); guide(tx, L.trayY - 6, s.x, s.y, t, YD.trayMeat(ty)); }
      x = tx; y = L.trayY - 74; text = '① ' + jaen(YG.TYPES[ty].name + 'を網へドラッグ', 'Drag ' + YG.TYPES[ty].name + ' onto the grill');
    } else if (tut === 1) {
      const id = g.grill.find((v) => v); if (!id) return;
      const m = g.meats[id]; const s = L.slot(g.grill.indexOf(id));
      x = s.x; y = s.y + 76; dir = -1;
      if (m.side[1 - m.up] < 0.45) text = jaen('② 待つ：肉汁が浮いたら裏返しどき', '② Wait. Juice on top means flip');
      else { text = jaen('② 肉汁が出た！ タップで裏返す', '② Juice! Tap to flip'); tapGuide(s.x, s.y, t); }
    } else if (tut === 2) {
      const id = g.grill.find((v) => v); if (!id) return;
      const m = g.meats[id]; const s = L.slot(g.grill.indexOf(id));
      if (Math.min(m.side[0], m.side[1]) < 0.55) { x = s.x; y = s.y + 76; text = jaen('③ 裏も焼けるまで待つ', '③ Let the other side cook'); dir = -1; }
      else {
        const p = [1, 0, 2].find((k) => !g.plates[k]);
        if (p != null && !(ptr && ptr.drag)) guide(s.x, s.y, L.plateX[p], L.plateY, t, m);
        x = s.x; y = s.y + 76; text = jaen('③ 焼けた！ 皿へドラッグ', '③ Done! Drag it to a plate'); dir = -1;
      }
    } else if (tut === 3) {
      const r = serveRoute();
      if (!r) return;
      if (!(ptr && ptr.drag)) guide(L.plateX[r.p], L.plateY, L.seatX[r.seat], L.headY, t, g.meats[r.id]);
      x = L.seatX[r.seat]; y = L.counterY + 10; dir = -1; text = jaen('④ 顔へドラッグで食べさせる', '④ Drag it to their face');
    }
    if (!text) return;
    bubble(x, y, text, dir, t);
  }
  // 皿の肉と、それを待っている客（同じ肉を頼んだ客を先に）
  function serveRoute() {
    for (let p = 0; p < 3; p++) {
      const id = g.plates[p]; if (!id) continue;
      const m = g.meats[id]; if (m.reserved || isJunk(m)) continue;
      let best = null;
      g.seats.forEach((st, i) => { if (st.state !== 'wait') return; const want = st.cust.order.type; if (best == null || (want === m.type && g.seats[best].cust.order.type !== m.type)) best = i; });
      if (best != null) return { p, id, seat: best };
    }
    return null;
  }
  // まだ1枚も出していないのに皿で待たせているとき：出し方を見せる（説明が終わった人にも）
  function serveHint(t) {
    if (g.stats.served > 0 || g.state !== 'play' || (ptr && ptr.drag)) return;
    const r = serveRoute(); if (!r) return;
    const m = g.meats[r.id];
    if (!m.restDone) return;
    guide(L.plateX[r.p], L.plateY, L.seatX[r.seat], L.headY, t, m);
    bubble(L.seatX[r.seat], L.counterY + 10, jaen('顔へドラッグで食べさせる', 'Drag it to their face'), -1, t);
  }
  // 指の見本：(x0,y0) を押して (x1,y1) まで運ぶ。点線の道すじと矢印も出す
  function guide(x0, y0, x1, y1, t, meat) {
    const P = 1.9, k = (t % P) / P;
    const cx = (x0 + x1) / 2, cy = Math.min(y0, y1) - 50;
    ctx.save();
    ctx.setLineDash([7, 7]); ctx.lineDashOffset = -t * 30;
    ctx.strokeStyle = 'rgba(255,225,77,0.9)'; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, x1, y1); ctx.stroke(); ctx.setLineDash([]);
    const ang = Math.atan2(y1 - cy, x1 - cx);
    ctx.fillStyle = '#ffe14d'; ctx.beginPath(); ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - 16 * Math.cos(ang - 0.5), y1 - 16 * Math.sin(ang - 0.5)); ctx.lineTo(x1 - 16 * Math.cos(ang + 0.5), y1 - 16 * Math.sin(ang + 0.5)); ctx.fill();
    const u = Math.min(1, Math.max(0, (k - 0.18) / 0.6));
    const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    const px = (1 - e) * (1 - e) * x0 + 2 * (1 - e) * e * cx + e * e * x1;
    const py = (1 - e) * (1 - e) * y0 + 2 * (1 - e) * e * cy + e * e * y1;
    const a = k < 0.88 ? 1 : (1 - k) / 0.12;
    if (meat) { ctx.globalAlpha = a * 0.8; YD.drawMeat(ctx, meat, px, py - 34, { scale: 0.8, lift: 5, t }); }
    ctx.globalAlpha = a;
    finger(px, py, k < 0.18 || (k > 0.78 && k < 0.88), t);
    ctx.restore();
  }
  function tapGuide(x, y, t) {
    const k = (t % 1.1) / 1.1;
    ctx.save();
    if (k < 0.5) { ctx.strokeStyle = `rgba(255,225,77,${1 - k * 2})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, 14 + k * 70, 0, 7); ctx.stroke(); }
    finger(x, y + (k < 0.2 ? 0 : 8), k < 0.2, t);
    ctx.restore();
  }
  // 人さし指（指先が (x,y)）
  function finger(x, y, press, t) {
    ctx.save(); ctx.translate(x, y); if (press) ctx.scale(0.9, 0.9);
    if (press) { ctx.fillStyle = 'rgba(255,225,77,0.55)'; ctx.beginPath(); ctx.arc(0, 0, 16, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#ffe0c2'; ctx.strokeStyle = '#3a1a00'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-6, 4); ctx.lineTo(-6, 26); ctx.quadraticCurveTo(-18, 22, -20, 32); ctx.lineTo(-12, 50); ctx.quadraticCurveTo(-2, 62, 14, 58);
    ctx.quadraticCurveTo(26, 54, 24, 38); ctx.lineTo(24, 28); ctx.quadraticCurveTo(24, 22, 18, 22); ctx.quadraticCurveTo(16, 18, 10, 18);
    ctx.quadraticCurveTo(8, 14, 4, 14); ctx.lineTo(6, 4); ctx.quadraticCurveTo(6, -4, 0, -4); ctx.quadraticCurveTo(-6, -4, -6, 4);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  // 黄色い案内の吹き出し（dir：1＝下を指す、-1＝上を指す）
  function bubble(x, y, text, dir, t) {
    ctx.font = '15px "Yusei Magic", "Hiragino Sans", sans-serif';
    const w = ctx.measureText(text).width + 24;
    const bx = Math.max(8, Math.min(W - 8 - w, x - w / 2));
    const bob = Math.sin(t * 5) * 3;
    ctx.save();
    YD.blob(ctx, bx + w / 2, y + bob, w + 6, 36, 9, 0);
    const ay = dir > 0 ? y + 16 + bob : y - 16 + bob;
    ctx.moveTo(x - 8, ay); ctx.lineTo(x, ay + 12 * dir); ctx.lineTo(x + 8, ay);
    ctx.lineJoin = 'round'; ctx.lineWidth = 6; ctx.strokeStyle = '#2a1206'; ctx.stroke(); ctx.fillStyle = '#ffd84d'; ctx.fill();
    ctx.fillStyle = '#2a1206'; ctx.textAlign = 'center';
    ctx.fillText(text, bx + w / 2, y + 5 + bob);
    ctx.restore();
  }

  // タイトルの後ろ：網の上で肉が焼けていく
  const demo = YG.newGame({ seed: 7 });
  [[0, 'tan'], [1, 'kalbi'], [2, 'harami'], [4, 'kalbi'], [5, 'tan']].forEach(([s, ty]) => YG.place(demo, ty, s));
  demo.score = 1e9; // 見本は肉代を気にしない
  demo.seats.forEach((s) => { s.nextIn = 1e9; });
  const demoTypes = ['tan', 'kalbi', 'harami', null, 'kalbi', 'tan'];
  const demoGone = [0, 0, 0, 0, 0, 0]; // 焼き上がって消えたあと、次を置くまでの秒
  let demoLast = null;
  function renderIdle(t) {
    for (let p = 0; p < 3; p++) YD.drawPlate(ctx, p, null, t, {}); // 皿とすてる箱も描いて、ゲーム中と同じ店にする
    YD.drawTrash(ctx, t, {});
    YD.drawGrill(ctx, t, { grade: toolSteps() });
    // 画面の速さに関係なく進める。焼けたら湯気とともに消して、少し待って次を置く（見本だけ）
    const dt = demoLast == null ? 0 : Math.min(0.1, t - demoLast); demoLast = t;
    demoAcc += dt;
    while (demoAcc >= STEP) {
      demoAcc -= STEP;
      demo.t = 0; YG.step(demo, STEP);
      for (let i = 0; i < 6; i++) {
        const id = demo.grill[i];
        if (!id) { if (demoTypes[i] && (demoGone[i] -= STEP) <= 0) YG.place(demo, demoTypes[i], i); continue; }
        const m = demo.meats[id];
        if (m.side[1 - m.up] > 0.9) YG.flip(demo, id);
        if (Math.min(...m.side) > 0.85) { YG.discard(demo, id); demoGone[i] = 0.8; const s = L.slot(i); burst(s.x, s.y, 10, '#fff8', 60, 80); }
      }
    }
    demo.events = [];
    for (let i = 0; i < 6; i++) { const id = demo.grill[i]; if (id) { const s = L.slot(i); YD.drawMeat(ctx, demo.meats[id], s.x, s.y, { onGrill: true, t }); } }
    for (const f of fx) { if (f.k === 'dot') { ctx.globalAlpha = 1 - f.t / f.life; ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.fill(); ctx.globalAlpha = 1; } }
    YD.drawFireTags(ctx);
    // トレーはタイトルでは描かない（カードを置く場所）
  }

  resize();
  // テスト用（ブラウザの開発ツールから触る）
  window.__yaki = { get g() { return g; }, newRun, YG, pause, store, get mode() { return mode; } };
  requestAnimationFrame(frame);
})();
