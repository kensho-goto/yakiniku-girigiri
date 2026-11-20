// アイコンを作り直す：node tools/icon.js（Playwright と Chrome が要る。PLAYWRIGHT=Playwright のパス）
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  for (const size of [512, 192, 180]) {
    const p = await b.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: size / 512 });
    await p.goto('file://' + path.join(__dirname, 'icon.html'));
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(300);
    await p.locator('.ic').screenshot({ path: path.join(__dirname, '..', `icon-${size}.png`) });
    await p.close();
  }
  await b.close();
})();
