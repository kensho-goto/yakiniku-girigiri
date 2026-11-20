// ジュー：ことばの切りかえ（日本語 / 英語）
// きめかた：URL の ?lang=ja|en → 前に選んだもの → 端末のことば（日本語なら日本語、それ以外は英語）
// つかいかた：jaen('焼く', 'GRILL') … 英語のときは2つめを返す
// HTML は data-en（中身）・data-en-ph（入力欄のうすい字）・data-en-title（ふきだしの説明）に英語を書いておく
// node（テスト）では window が無いので、いつも日本語
(function (root) {
  'use strict';
  const KEY = 'yaki.lang';
  const ok = (l) => l === 'ja' || l === 'en';
  let q = null, saved = null, nav = 'ja';
  try { q = new URLSearchParams(location.search).get('lang'); } catch (e) { /* なくてよい */ }
  try { saved = localStorage.getItem(KEY); } catch (e) { /* 保存できない環境 */ }
  if (ok(q)) { try { localStorage.setItem(KEY, q); } catch (e) { /* 保存できなくても遊べる */ } }
  try { nav = (navigator.languages && navigator.languages[0]) || navigator.language || 'ja'; } catch (e) { /* なくてよい */ }
  const lang = ok(q) ? q : ok(saved) ? saved : /^ja\b/i.test(nav) ? 'ja' : 'en';
  const en = lang === 'en';

  // ことばを変えて開き直す（URL に ?lang= を付ける。保存できない端末でも切りかわる）
  function set(l) {
    if (!ok(l) || l === lang) return;
    try { localStorage.setItem(KEY, l); } catch (e) { /* なくてよい */ }
    try { const u = new URL(location.href); u.searchParams.set('lang', l); location.replace(u.toString()); } catch (e) { location.reload(); }
  }
  function applyDom(r) {
    if (!en || typeof document === 'undefined') return;
    r = r || document;
    r.querySelectorAll('[data-en]').forEach((el) => { el.innerHTML = el.getAttribute('data-en'); });
    r.querySelectorAll('[data-en-ph]').forEach((el) => { el.setAttribute('placeholder', el.getAttribute('data-en-ph')); });
    r.querySelectorAll('[data-en-title]').forEach((el) => { el.setAttribute('title', el.getAttribute('data-en-title')); });
  }

  root.YI = { lang, en, set, applyDom };
  root.jaen = (ja, e) => (en ? e : ja);
  if (typeof document !== 'undefined') { document.documentElement.lang = lang; applyDom(); }
})(window);
