// 電波がなくても遊べるように、一度開いたゲームの中身をとっておく
// いつもは新しいものを取りに行き（直したらすぐ届く）、つながらないときだけとっておいたものを出す
const CACHE = 'ju-v1';
const FILES = ['./', 'index.html', 'about.html', 'manifest.json', 'icon-192.png', 'icon-512.png', 'icon-180.png',
  'fonts/PottaOne.woff2', 'fonts/YuseiMagic.woff2', 'fonts/ZCOOLKuaiLe.woff2',
  'src/zh.js?v=dev', 'src/i18n.js?v=dev', 'src/sim.js?v=dev', 'src/lines.js?v=dev', 'src/draw.js?v=dev', 'src/sound.js?v=dev', 'src/playtest.js?v=dev', 'src/main.js?v=dev', 'src/count.js?v=dev'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return; // 数える・試遊会の送信には手を出さない
  e.respondWith(fetch(r).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(r, copy)); }
    return res;
  }).catch(() => caches.match(r, { ignoreSearch: r.mode === 'navigate' }).then((m) => m || caches.match('./'))));
});
