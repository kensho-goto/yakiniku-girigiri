// X・LINE に貼ったときの絵（ogp.png）を作り直す：npm start でゲームを開いてから node tools/ogp.js
// 英語・中国語の見本だけ撮るときは SHOT_LANG=en・SHOT_LANG=zh（tools/store.js が使う）。Playwright と Chrome が要る。PLAYWRIGHT=Playwright のパス。GAME=ゲームの URL（ふだんは http://127.0.0.1:8130/）
const path = require('path'), fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const GAME = process.env.GAME || 'http://127.0.0.1:8130/';
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  // 1. ゲームの見本を撮る：客が3人いて、網に焼け具合のちがう肉が並んでいるところ
  const p = await b.newPage({ viewport: { width: 390, height: 760 }, deviceScaleFactor: 2 });
  await p.goto(GAME + '?lang=' + (process.env.SHOT_LANG || 'ja') + '&' + Date.now());
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('yaki.from', '1'); localStorage.setItem('yaki.tut', '4'); localStorage.setItem('yaki.stars', '{"1":3,"2":3,"3":3,"4":3,"5":3,"6":3,"7":3}'); });
  await p.reload(); await p.waitForSelector('#startBtn:not([disabled])'); await p.waitForTimeout(800);
  await p.evaluate(() => __yaki.newRun(0)); await p.waitForTimeout(400);
  await p.evaluate(() => { const g = __yaki.g, Y = __yaki.YG; Y.place(g, 'kalbi', 0); Y.place(g, 'harami', 1); Y.place(g, 'tan', 2); g.state = 'play'; });
  await p.waitForTimeout(5000);
  await p.evaluate(() => { const g = __yaki.g, Y = __yaki.YG; Y.place(g, 'kalbi', 3); Y.place(g, 'tan', 5); });
  await p.waitForTimeout(3500);
  await p.screenshot({ path: path.join(__dirname, 'shot.png') });
  fs.copyFileSync(path.join(__dirname, 'shot.png'), path.join(__dirname, 'shot-' + (process.env.SHOT_LANG || 'ja') + '.png'));
  await p.close();
  if (process.env.SHOT_LANG && process.env.SHOT_LANG !== 'ja') { await b.close(); return; } // 英語・中国語の見本だけ撮るとき
  // 2. 絵にする
  const q = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await q.goto('file://' + path.join(__dirname, 'ogp.html'));
  await q.evaluate(() => document.fonts.ready); await q.waitForTimeout(300);
  await q.locator('.og').screenshot({ path: path.join(__dirname, '..', 'ogp.png') });
  await b.close();
})();
