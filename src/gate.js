// 合言葉の画面（メンバー用の試作版なので、URLが外にもれてもすぐ遊べないようにする目印）
(function () {
  const HASH = 'c6ba94d4d25addaa53479c5f0b3044386e5ac9da7214fea34476dcbb27d9f3f5'; // 合言葉（いいんじゃ）を変換した値
  const KEY = 'yaki.member';
  const gate = document.getElementById('gate');
  const input = document.getElementById('gateInput');
  const msg = document.getElementById('gateMsg');
  let ok = false;
  try { ok = localStorage.getItem(KEY) === HASH; } catch (e) { /* 保存できない環境では毎回聞く */ }
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname.endsWith('claude.ai') || location.hostname.endsWith('claudeusercontent.com')) ok = true; // 試遊会（trycloudflare）も合言葉を聞く。入口の URL は変わらず公開の場所にあるため
  if (ok) return;
  gate.hidden = false;
  // ローマ字・カタカナでも通るように、ひらがなにそろえる
  // スマホの変換で「良いんじゃ」「いいんじゃない」「いいんじゃ！」になっても通す
  function normalize(t) {
    t = t.normalize('NFKC').trim().toLowerCase().replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
    t = t.replace(/[\s\p{P}\p{S}ー〜]+/gu, '').replace(/^良い/, 'いい').replace(/^善い/, 'いい');
    if (/^(einja|iinja|iinjya|einjya|iinnja|iinnjya)/.test(t)) t = 'いいんじゃ';
    if (t.startsWith('いいんじゃ')) t = 'いいんじゃ';
    return t;
  }
  async function sha256(t) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  async function check() {
    if ((await sha256(normalize(input.value))) === HASH) {
      try { localStorage.setItem(KEY, HASH); } catch (e) { /* 保存できなくても入れる */ }
      gate.hidden = true;
    } else {
      msg.textContent = '合言葉がちがいます（ひらがなで「いいんじゃ」）';
      input.select();
    }
  }
  document.getElementById('gateBtn').onclick = check;
  // 変換の「確定」の Enter では答え合わせしない（日本語入力の途中）
  input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) check(); });
  input.addEventListener('input', () => { msg.textContent = ''; });
  input.addEventListener('pointerdown', (e) => e.stopPropagation());
})();
