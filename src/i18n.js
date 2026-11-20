// ジュー：ことばの切りかえ（日本語 / 英語 / 中国語＝簡体字）
// きめかた：URL の ?lang=ja|en|zh → 前に選んだもの → 端末のことば（日本語は日本語、中国語は zh-TW・zh-HK も中国語、それ以外は英語）
// つかいかた：jaen('焼く', 'GRILL') … 英語のときは2つめを返す
//   中国語は英語の文を src/zh.js の表（window.ZH）で置きかえる。表にない文は英語のまま出る
//   数や名前が入る文は、3つめに中国語を書く：jaen(`${n}枚`, `${n} done`, `${n}片`)
//   並び・もの（['…', '…'] や { perfect: '…' }）は、中の文をまとめて表で置きかえる
//   数（字の大きさなど）は、中国語では日本語のほうを使う（漢字は日本語と同じくらいの幅）
// HTML は data-en（中身）・data-en-ph（入力欄のうすい字）・data-en-title（ふきだしの説明）に英語を書いておく
//   中国語は表から引く。長い文や、表に入れにくいものは data-zh に直接書いてよい
// YI.en … 英語だけ（単語で折り返す・字を小さくする、など英語の見た目の調整用）
// YI.zh … 中国語
// node（テスト）では window が無いので、いつも日本語
(function (root) {
  'use strict';
  const KEY = 'yaki.lang';
  const LANGS = ['ja', 'en', 'zh'];
  const ok = (l) => LANGS.includes(l);
  let q = null, saved = null, nav = 'ja';
  try { q = new URLSearchParams(location.search).get('lang'); } catch (e) { /* なくてよい */ }
  try { saved = localStorage.getItem(KEY); } catch (e) { /* 保存できない環境 */ }
  if (ok(q)) { try { localStorage.setItem(KEY, q); } catch (e) { /* 保存できなくても遊べる */ } }
  try { nav = (navigator.languages && navigator.languages[0]) || navigator.language || 'ja'; } catch (e) { /* なくてよい */ }
  const fromNav = /^ja\b/i.test(nav) ? 'ja' : /^zh\b/i.test(nav) ? 'zh' : 'en';
  const lang = ok(q) ? q : ok(saved) ? saved : fromNav;
  const en = lang === 'en', zh = lang === 'zh';
  const ZH = root.ZH || {};

  // 中国語に置きかえる（表になければそのまま）
  const tr = (s) => (zh && typeof s === 'string' && Object.prototype.hasOwnProperty.call(ZH, s) ? ZH[s] : s);
  // 並び・ものの中の文をまとめて置きかえる
  function deep(x) {
    if (typeof x === 'string') return tr(x);
    if (Array.isArray(x)) return x.map(deep);
    if (x && typeof x === 'object' && Object.getPrototypeOf(x) === Object.prototype) {
      const o = {};
      for (const k of Object.keys(x)) o[k] = deep(x[k]);
      return o;
    }
    return x;
  }

  // ことばを変えて開き直す（URL に ?lang= を付ける。保存できない端末でも切りかわる）
  function set(l) {
    if (!ok(l) || l === lang) return;
    try { localStorage.setItem(KEY, l); } catch (e) { /* なくてよい */ }
    try { const u = new URL(location.href); u.searchParams.set('lang', l); location.replace(u.toString()); } catch (e) { location.reload(); }
  }
  function applyDom(r) {
    if (lang === 'ja' || typeof document === 'undefined') return;
    r = r || document;
    r.querySelectorAll('[data-en]').forEach((el) => { el.innerHTML = zh && el.hasAttribute('data-zh') ? el.getAttribute('data-zh') : tr(el.getAttribute('data-en')); });
    r.querySelectorAll('[data-en-ph]').forEach((el) => { el.setAttribute('placeholder', tr(el.getAttribute('data-en-ph'))); });
    r.querySelectorAll('[data-en-title]').forEach((el) => { el.setAttribute('title', tr(el.getAttribute('data-en-title'))); });
  }

  const NAMES = { ja: '日本語', en: 'English', zh: '中文' };
  root.YI = { lang, en, zh, set, applyDom, tr, t: (x) => (zh ? deep(x) : x), LANGS, NAMES };
  root.jaen = (ja, e, z) => (zh ? (z != null ? z : typeof e === 'number' ? ja : deep(e)) : en ? e : ja);
  if (typeof document !== 'undefined') { document.documentElement.lang = zh ? 'zh-CN' : lang; applyDom(); }
})(window);
