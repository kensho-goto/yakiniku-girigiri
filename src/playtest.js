// 試遊会用：遊んだ記録と感想を、試遊サーバー（tools/playtest.js）へ送る。
// サーバーが無いところ（GitHub Pages など）では何もしない。
(function (root) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  let on = false;
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 保存できなくても遊べる */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* なくてよい */ } },
  };
  const newId = () => Math.random().toString(36).slice(2, 10);
  let pid = ls.get('yaki.pid');
  if (!pid) { pid = newId(); ls.set('yaki.pid', pid); }
  const sid = newId(); // このページを開いた回（同じ人の「何回目の訪問か」を分ける）
  let startedAt = 0, playNo = 0, lastEnd = null;

  function name() { return (ls.get('yaki.name') || '').slice(0, 20); }
  function send(kind, data) {
    if (!on) return;
    const body = JSON.stringify(Object.assign({ kind, pid, sid, name: name(), at: Date.now(), w: innerWidth, h: innerHeight, ua: navigator.userAgent.slice(0, 160) }, data));
    try {
      if (navigator.sendBeacon) navigator.sendBeacon('api/log', new Blob([body], { type: 'text/plain' }));
      else fetch('api/log', { method: 'POST', body, keepalive: true });
    } catch (e) { /* 送れなくても遊べる */ }
  }

  // 名前の欄（タイトル画面）。試遊会では名前を入れてから始める
  function setupName() {
    const box = $('ptNameBox'), input = $('ptName');
    box.hidden = false;
    input.value = name();
    input.addEventListener('input', () => { ls.set('yaki.name', input.value.trim()); input.classList.remove('need'); });
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') input.blur(); });
    input.addEventListener('pointerdown', (e) => e.stopPropagation());
  }
  // 次の人に渡す：名前・自己ベスト・説明済み・感想済みを消して、はじめから
  function nextPerson() {
    ['yaki.name', 'yaki.best', 'yaki.bestRank', 'yaki.tut', 'yaki.plays', 'yaki.fb', 'yaki.stars', 'yaki.seen', 'yaki.stageBest', 'yaki.stageBestN', 'yaki.from', 'yaki.exp', 'yaki.tools'].forEach(ls.del);
    ls.set('yaki.pid', newId());
    location.reload();
  }

  function summary(g) {
    const st = g.stats;
    return {
      stage: g.stage || 0, stars: g.stage ? root.YG.starsOf(g) : null,
      score: g.score, ok: g.stats.ok, tools: g.up.lv, t: Math.round(g.t * 10) / 10, tutorial: !!g.tutorial, fevers: g.fevers,
      served: st.served, perfect: st.perfect, great: st.great, good: st.good, meh: st.meh, miss: st.miss,
      raw: st.raw, halfraw: st.halfraw, burnt: st.burnt, char: st.char, cold: st.cold, luke: st.luke, leave: st.leave,
      carryOver: st.carryOver, vipCame: st.vipCame || 0, vipWin: st.vipWin || 0, maxBusy: st.maxBusy,
      leftover: g.leftover || 0, discard: st.discard, placed: st.placed,
    };
  }
  const r2 = (a) => a && a.map((v) => Math.round(v * 100) / 100);
  // 1枚ずつ：何をどう焼いて、どう判定されたか（どこで読みちがえたかを見る）
  function serves(g) {
    return g.log.map((e) => ({
      ty: e.type, want: e.order.target, wantTy: e.order.type || '', res: e.result.fail || e.result.rank,
      under: !!e.result.under, over: !!e.result.over, carry: !!e.result.carryOver, luke: !!e.result.luke,
      side: r2(e.side), up: r2(e.atRemoval), flips: e.flips, pts: e.pts,
    }));
  }

  const YP = {
    get on() { return on; },
    canStart() {
      if (!on || name()) return true;
      const input = $('ptName');
      input.classList.add('need'); input.placeholder = '名前を入れてね。あだ名でいい'; input.focus();
      return false;
    },
    start(g) { if (!on) return; playNo++; startedAt = Date.now(); send('start', { playNo, stage: g.stage || 0, tutorial: !!g.tutorial }); },
    quit(g, why) { if (!on || !g || g.state === 'over') return; send('quit', Object.assign({ playNo, why, sec: Math.round((Date.now() - startedAt) / 1000) }, summary(g))); },
    end(g, rank, title) {
      if (!on) return;
      lastEnd = { playNo, score: g.score, rank: rank.key };
      send('end', Object.assign({ playNo, rank: rank.key, title: title.name, sec: Math.round((Date.now() - startedAt) / 1000), serves: serves(g) }, summary(g)));
      // 感想は、1回目のあとと、3回以上遊んだあとにもう1回だけ聞く（毎回は聞かない）
      const fb = Number(ls.get('yaki.fb') || 0);
      const plays = Number(ls.get('yaki.plays') || 0);
      if (fb === 0 || (fb === 1 && plays >= 3)) showFeedback(fb);
    },
  };

  // 結果画面の「どうだった？」
  const FACES = [['again', '😆', 'またやりたい'], ['ok', '🙂', 'まあまあ'], ['confused', '😵', 'わかりにくい'], ['bored', '😴', 'つまらない']];
  function showFeedback(fbBefore) {
    const box = $('ptFeedback');
    let pick = null;
    box.hidden = false;
    box.innerHTML = `<div class="pt-q">${fbBefore ? '何回か遊んでみて、どう？' : 'どうだった？'}</div>` +
      '<div class="pt-faces">' + FACES.map(([k, e, t]) => `<button data-k="${k}"><span>${e}</span>${t}</button>`).join('') + '</div>' +
      '<textarea id="ptText" rows="2" placeholder="ひとこと。どこで笑った？ どこで困った？"></textarea>' +
      '<button class="btn2 pt-send" disabled>送る</button>';
    const btns = box.querySelectorAll('.pt-faces button');
    const sendBtn = box.querySelector('.pt-send');
    const text = box.querySelector('textarea');
    ['keydown', 'pointerdown'].forEach((ev) => text.addEventListener(ev, (e) => e.stopPropagation()));
    btns.forEach((b) => b.onclick = () => {
      pick = b.dataset.k;
      btns.forEach((x) => x.classList.toggle('sel', x === b));
      sendBtn.disabled = false;
    });
    sendBtn.onclick = () => {
      send('feedback', Object.assign({ face: pick, text: text.value.trim().slice(0, 500), round: fbBefore + 1 }, lastEnd));
      ls.set('yaki.fb', String(fbBefore + 1));
      box.innerHTML = '<div class="pt-thanks">ありがとう！ もう一回もどうぞ</div>';
    };
  }

  // サーバーがいるときだけ動く
  fetch('api/ping', { cache: 'no-store' }).then((r) => r.ok ? r.json() : null).then((j) => {
    if (!j || !j.playtest) return;
    on = true;
    setupName();
    ['ptNextTitle', 'ptNextResult'].forEach((id) => { const b = $(id); b.hidden = false; b.onclick = nextPerson; });
    send('open', {});
  }).catch(() => {});

  // 遊んでいる途中で、ほかのアプリへ移った・ページを閉じた（iPhone は閉じた知らせが来ないことがあるので両方送る）
  const away = (why) => {
    const y = root.__yaki;
    if (on && y && y.mode === 'play' && y.g && y.g.state !== 'over') send('hide', Object.assign({ playNo, why, sec: Math.round((Date.now() - startedAt) / 1000) }, summary(y.g)));
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden) away('hidden'); });
  addEventListener('pagehide', () => away('close'));

  root.YP = YP;
})(window);
