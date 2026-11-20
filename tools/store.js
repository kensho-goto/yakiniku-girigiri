// ゲームサイトに載せる絵を作る：node tools/ogp.js のあとに node tools/store.js（PLAYWRIGHT=Playwright のパス）
// itch.io の表紙 630×500、CrazyGames の横長 1920×1080・縦長 800×1200・正方形 800×800（日本語・英語・中国語）
const path = require('path'), fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const SIZES = [[630, 500], [1920, 1080], [800, 1200], [800, 800]];
(async () => {
  const out = path.join(__dirname, '..', 'docs', 'store'); fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ channel: 'chrome' });
  for (const lang of ['ja', 'en', 'zh']) for (const [w, h] of SIZES) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto('file://' + path.join(__dirname, 'store.html') + `?w=${w}&h=${h}&lang=${lang}`);
    await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
    await p.locator('.og').screenshot({ path: path.join(out, `cover-${w}x${h}-${lang}.png`) });
    await p.close();
  }
  await b.close();
})();
