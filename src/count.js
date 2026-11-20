// 何人が遊んで、どこでやめたかを数える（GoatCounter。クッキーを使わず、名前や端末の記録は送らない）
// 公開の場所（GitHub Pages）だけで数える。手元・試遊会・ゲームサイト版では何もしない
// 電波がなくても遊べるように、一度開いたら中身をとっておく（sw.js）
(function () {
  'use strict';
  const CODE = 'ju-yakiniku'; // GoatCounter のサイト名（https://ju-yakiniku.goatcounter.com）
  const PUBLIC = location.hostname === 'kensho-goto.github.io';
  let ready = null;
  function load() {
    if (ready) return ready;
    ready = new Promise((res) => {
      const s = document.createElement('script');
      s.async = true; s.src = 'https://gc.zgo.at/count.js';
      s.dataset.goatcounter = `https://${CODE}.goatcounter.com/count`;
      s.dataset.goatcounterSettings = '{"no_onload": true}';
      s.onload = () => res(window.goatcounter || null); s.onerror = () => res(null);
      document.head.appendChild(s);
    });
    return ready;
  }
  // できごと（ステージを始めた・終えた・自慢した）を数える。path は「どこで」を表す短い名前
  function hit(path, title) {
    if (!PUBLIC) return;
    load().then((gc) => { try { if (gc && gc.count) gc.count({ path, title: title || path, event: path !== '/' }); } catch (e) { /* 数えられなくても遊べる */ } });
  }
  window.YC = { hit };
  hit('/', 'ジュー');

  if (PUBLIC && 'serviceWorker' in navigator) {
    addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }
})();
