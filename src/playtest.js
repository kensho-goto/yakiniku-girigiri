// 試遊会用：遊んだ記録と感想を、試遊サーバー（tools/playtest.js）へ送る。
// サーバーが無いところ（GitHub Pages など）では何もしない。
(function (root) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  let on = false;
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 保存できなくても遊べる */ } },
  };
  let pid = ls.get('yaki.pid');
  if (!pid) { pid = Math.random().toString(36).slice(2, 10); ls.set('yaki.pid', pid); }
  let startedAt = 0, playNo = 0, lastEnd = null;

  function name() { return (ls.get('yaki.name') || '').slice(0, 20); }
  function send(kind, data) {
    if (!on) return;
    const body = JSON.stringify(Object.assign({ kind, pid, name: name(), at: Date.now(), w: innerWidth, h: innerHeight, ua: navigator.userAgent.slice(0, 160) }, data));
    try {
      if (navigator.sendBeacon) navigator.sendBeacon('api/log', new Blob([body], { type: 'text/plain' }));
      else fetch('api/log', { method: 'POST', body, keepalive: true });
    } catch (e) { /* 送れなくても遊べる */ }
  }

  // 名前の欄（タイトル画面）
  function setupName() {
    const box = $('ptNameBox'), input = $('ptName');
    box.hidden = false;
    input.value = name();
    input.addEventListener('input', () => ls.set('yaki.name', input.value.trim()));
    input.addEventListener('keydown', (e) => e.stopPropagation());
    input.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  function summary(g) {
    const st = g.stats;
    return {
      score: g.score, t: Math.round(g.t * 10) / 10, tutorial: !!g.tutorial, fevers: g.fevers,
      served: st.served, perfect: st.perfect, great: st.great, good: st.good, meh: st.meh, miss: st.miss,
      raw: st.raw, halfraw: st.halfraw, burnt: st.burnt, char: st.char, cold: st.cold, luke: st.luke, leave: st.leave,
      carryOver: st.carryOver, vipCame: st.vipCame || 0, vipWin: st.vipWin || 0, maxBusy: st.maxBusy, leftover: st.leftover || 0,
    };
  }

  const YP = {
    get on() { return on; },
    start(g) { if (!on) return; playNo++; startedAt = Date.now(); send('start', { playNo, tutorial: !!g.tutorial }); },
    quit(g, why) { if (!on || !g || g.state === 'over') return; send('quit', Object.assign({ playNo, why, sec: Math.round((Date.now() - startedAt) / 1000) }, summary(g))); },
    end(g, rank, title) {
      if (!on) return;
      lastEnd = { playNo, score: g.score, rank: rank.key };
      send('end', Object.assign({ playNo, rank: rank.key, title: title.name, sec: Math.round((Date.now() - startedAt) / 1000) }, summary(g)));
      showFeedback();
    },
  };

  // 結果画面の「どうだった？」
  const FACES = [['again', '😆', 'またやりたい'], ['ok', '🙂', 'まあまあ'], ['confused', '😵', 'わかりにくい'], ['bored', '😴', 'つまらない']];
  function showFeedback() {
    const box = $('ptFeedback');
    let pick = null;
    box.hidden = false;
    box.innerHTML = '<div class="pt-q">どうだった？（試遊のアンケート）</div>' +
      '<div class="pt-faces">' + FACES.map(([k, e, t]) => `<button data-k="${k}"><span>${e}</span>${t}</button>`).join('') + '</div>' +
      '<textarea id="ptText" rows="2" placeholder="ひとこと（なくてもOK）例：どこで笑った？どこで困った？"></textarea>' +
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
      send('feedback', Object.assign({ face: pick, text: text.value.trim().slice(0, 500) }, lastEnd));
      box.innerHTML = '<div class="pt-thanks">ありがとう！ もう一回もどうぞ</div>';
    };
  }

  // サーバーがいるときだけ動く
  fetch('api/ping', { cache: 'no-store' }).then((r) => r.ok ? r.json() : null).then((j) => {
    if (!j || !j.playtest) return;
    on = true;
    setupName();
    send('open', {});
  }).catch(() => {});

  // 遊んでいる途中でページを閉じた
  addEventListener('pagehide', () => {
    const y = root.__yaki;
    if (y && y.mode === 'play' && y.g) YP.quit(y.g, 'close');
  });

  root.YP = YP;
})(window);
