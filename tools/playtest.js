#!/usr/bin/env node
// 試遊会サーバー：ゲームを配り、遊んだ記録と感想を playtest-data/log.jsonl に集める。
//   node tools/playtest.js            … この Mac で動かして、期間限定の URL（cloudflared）を作り、QR の画面を開く
//   node tools/playtest.js --no-tunnel … URL を作らず、この Mac だけで動かす
// 見る画面：http://127.0.0.1:8140/qr（配る QR）、http://127.0.0.1:8140/playtest（集計）
// 変わらない入口：https://kensho-goto.github.io/yakiniku-girigiri/play/
//   URL を作るたびに、GitHub の playtest-url ブランチの url.json へ今の URL を書く（入口のページがそれを読んで飛ぶ）。
//   書くには gh に kensho-goto でログインしていること。書かないときは --no-publish
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execFile, execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
// 試しに動かすときは PLAYTEST_DATA で記録の置き場を変えられる（本番の記録を汚さない）
const DATA = process.env.PLAYTEST_DATA ? path.resolve(process.env.PLAYTEST_DATA) : path.join(ROOT, 'playtest-data');
const LOG = path.join(DATA, 'log.jsonl');
const PORT = Number(process.env.PORT || 8140);
const TUNNEL = !process.argv.includes('--no-tunnel');
const MAX_LOG = 50 * 1024 * 1024; // 記録はここまで（いたずらでディスクがあふれないように）
const RATE = { win: 10 * 60 * 1000, max: 400 }; // 1つの通信元から 10分で 400件まで
fs.mkdirSync(DATA, { recursive: true });
let publicUrl = null;

// ===== 変わらない入口（GitHub に今の URL を書く） =====
const REPO = process.env.PLAYTEST_REPO || 'kensho-goto/yakiniku-girigiri';
const URL_BRANCH = 'playtest-url';
const FIXED_URL = process.env.PLAYTEST_FIXED_URL || 'https://kensho-goto.github.io/yakiniku-girigiri/play/';
const PUBLISH = !process.argv.includes('--no-publish') && !process.argv.includes('--no-tunnel');
let ghToken = null, fixedReady = false, published = null;
function token() {
  if (ghToken !== null) return ghToken;
  try { ghToken = execFileSync('gh', ['auth', 'token', '-u', REPO.split('/')[0]], { encoding: 'utf8', env: Object.assign({}, process.env, { GITHUB_TOKEN: '' }) }).trim(); }
  catch (e) { ghToken = ''; console.log('GitHub に今の URL を書けません（gh に ' + REPO.split('/')[0] + ' でログインしていない）。入口は使えず、QR は毎回変わります'); }
  return ghToken;
}
async function gh(method, p, body) {
  const r = await fetch('https://api.github.com/repos/' + REPO + p, { method, headers: { Authorization: 'Bearer ' + token(), Accept: 'application/vnd.github+json', 'User-Agent': 'yakiniku-playtest' }, body: body && JSON.stringify(body), signal: AbortSignal.timeout(8000) });
  return { ok: r.ok, status: r.status, json: await r.json().catch(() => ({})) };
}
// on=false は「いまは試遊会をしていない」
async function publish(url, on) {
  if (!PUBLISH || !token()) return false;
  try {
    let cur = await gh('GET', '/contents/url.json?ref=' + URL_BRANCH);
    if (cur.status === 404) {
      const ref = await gh('GET', '/git/ref/heads/' + URL_BRANCH);
      if (ref.status === 404) {
        const main = await gh('GET', '/git/ref/heads/main');
        await gh('POST', '/git/refs', { ref: 'refs/heads/' + URL_BRANCH, sha: main.json.object.sha });
      }
    }
    const content = Buffer.from(JSON.stringify({ url, on, at: new Date().toISOString() }, null, 1) + '\n').toString('base64');
    const put = await gh('PUT', '/contents/url.json', { message: on ? '試遊会の URL を更新' : '試遊会を終了', content, branch: URL_BRANCH, sha: cur.ok ? cur.json.sha : undefined });
    if (!put.ok) throw new Error(put.status + ' ' + (put.json.message || ''));
    published = on ? url : null;
    console.log(on ? `入口（変わらない URL）：${FIXED_URL} → ${url}` : '入口を「いまは試遊会をしていません」にしました');
    return true;
  } catch (e) { console.log('GitHub に今の URL を書けませんでした：' + e.message); return false; }
}
// 入口のページが公開されているか（公開前は、QR にその日の URL をそのまま出す）
async function checkFixed() {
  try { const r = await fetch(FIXED_URL, { method: 'HEAD', signal: AbortSignal.timeout(8000) }); fixedReady = r.ok; } catch (e) { fixedReady = false; }
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8' };
const ALLOW = /^\/(index\.html|robots\.txt|manifest\.json|icon-\d+\.png|src\/[\w.-]+\.js)?$/; // 配るのはゲームの部品だけ

function readLog() {
  if (!fs.existsSync(LOG)) return [];
  return fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
}
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function send(res, code, type, body) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

const hits = new Map(); // 通信元 → 受け取った時刻の一覧
function allowed(ip) {
  const now = Date.now();
  const a = (hits.get(ip) || []).filter((t) => now - t < RATE.win);
  a.push(now); hits.set(ip, a);
  return a.length <= RATE.max;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);
  const ip = req.headers['cf-connecting-ip'] || 'local';
  const local = ip === 'local';
  if (p === '/favicon.ico') return send(res, 204, 'text/plain', '');
  if (p === '/api/ping') return send(res, 200, TYPES['.json'], JSON.stringify({ playtest: true }));
  if (p === '/api/log' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 60000) req.destroy(); });
    req.on('end', () => {
      try {
        if (!allowed(ip)) return send(res, 429, 'text/plain', '');
        if (fs.existsSync(LOG) && fs.statSync(LOG).size > MAX_LOG) return send(res, 507, 'text/plain', '');
        const j = JSON.parse(body);
        j.recv = new Date().toISOString();
        fs.appendFileSync(LOG, JSON.stringify(j) + '\n');
        if (j.kind === 'end') console.log(`🍖 ${j.name || '名無し'}：${j.stage ? 'ステージ' + j.stage + ' ★' + j.stars : '本番'} ${j.score}点${j.stage ? '' : '（' + j.rank + '）'}`);
        if (j.kind === 'feedback') console.log(`💬 ${j.name || '名無し'}：${j.face} ${j.text || ''}`);
      } catch (e) { /* こわれた記録は捨てる */ }
      send(res, 204, 'text/plain', '');
    });
    return;
  }
  // 集計と QR は、この Mac から開いたときだけ見せる（期間限定URLの先の人には見せない）
  if (p === '/playtest' || p === '/qr') {
    if (!local) return send(res, 404, 'text/plain', 'not found');
    return send(res, 200, TYPES['.html'], p === '/qr' ? qrPage() : reportPage());
  }
  if (p === '/api/url') return send(res, 200, TYPES['.json'], JSON.stringify(local ? { url: publicUrl, fixed: fixedReady && published && published === publicUrl ? FIXED_URL : null } : { url: null }));
  if (!ALLOW.test(p)) return send(res, 404, 'text/plain', 'not found');
  const file = path.join(ROOT, p === '/' ? 'index.html' : p);
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'text/plain', 'not found');
    send(res, 200, TYPES[path.extname(file)] || 'application/octet-stream', buf);
  });
});

// ===== 配る QR の画面（URL が変わったら描き直す） =====
function qrPage() {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>ジュー 試遊会</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
<style>body{margin:0;background:#2a1a14;color:#fff;font-family:'Hiragino Sans',sans-serif;text-align:center;padding:24px}
h1{color:#ffd84d;font-size:40px;margin:8px 0}#qr{display:inline-block;background:#fff;padding:18px;border-radius:16px;margin:16px 0;min-width:320px;min-height:320px}
.url{font-size:18px;word-break:break-all;color:#ffd9b0}.sub{font-size:13px;color:#b89a88;margin-top:6px;word-break:break-all}.fixed{display:inline-block;margin-top:8px;padding:4px 12px;border-radius:99px;background:#3d6b2a;font-size:14px}.wait{font-size:20px;color:#ffb3a0;min-height:1.4em}ol{display:inline-block;text-align:left;font-size:18px;line-height:1.8}
a{color:#ffd84d}</style></head><body>
<h1>ジュー 試遊会</h1>
<div id="wait" class="wait">URL を作っています…（10秒ほど）</div>
<div id="qr"></div><div class="url" id="url"></div><div class="sub" id="sub"></div>
<ol><li>スマホのカメラで QR を読む</li><li>名前（ニックネーム）を入れて「焼く」</li><li>終わったら「どうだった？」を押して送る</li><li>スマホを次の人に回すときは「次の人に渡す」</li></ol>
<p><a href="/playtest" target="_blank">集計を見る</a></p>
<script>
let shown=null;
async function tick(){
 const j=await (await fetch('/api/url')).json().catch(()=>({}));
 const w=document.getElementById('wait');
 const target=j.fixed||j.url;
 if(target && target!==shown){ shown=target; w.textContent=''; const q=document.getElementById('qr'); q.innerHTML=''; new QRCode(q,{text:target,width:320,height:320});
  document.getElementById('url').textContent=target;
  document.getElementById('sub').innerHTML=j.fixed?'<span class="fixed">この QR はずっと同じ（印刷してOK）</span><br>今つながる先：'+j.url:'この QR は、サーバーを動かし直すと変わります'; }
 if(!j.url){ w.textContent= shown && !j.fixed ? 'URL を作り直しています…（前のQRは使えません）' : shown ? 'つなぎ直しています…（QR はそのまま使えます）' : 'URL を作っています…（10秒ほど）'; }
 setTimeout(tick,2000);
}
tick();
</script></body></html>`;
}

// ===== 集計の画面 =====
const FACE = { again: '😆 またやりたい', ok: '🙂 まあまあ', confused: '😵 わかりにくい', bored: '😴 つまらない' };
const RANKS = ['kikaku', 'C', 'B', 'A3', 'A4', 'A5', 'tokusen'];
const RANK_NAME = { kikaku: '規格外', tokusen: '特選A5' };
const TYPE_NAME = { tan: 'タン', kalbi: 'カルビ', harami: 'ハラミ', toku: '特上' };
const phoneOf = (ua) => /iPhone/.test(ua || '') ? 'iPhone' : /Android/.test(ua || '') ? 'Android' : /iPad/.test(ua || '') ? 'iPad' : 'パソコン';

function reportPage() {
  const ev = readLog();
  const people = new Map();
  const plays = new Map(); // pid|sid|playNo → { start, end, quit, hide }
  for (const e of ev) {
    if (!people.has(e.pid)) people.set(e.pid, { pid: e.pid, name: '', ends: [], quits: [], fbs: [], phone: '', starts: 0 });
    const p = people.get(e.pid);
    if (e.name) p.name = e.name;
    if (e.ua) p.phone = phoneOf(e.ua);
    if (e.kind === 'end') p.ends.push(e);
    if (e.kind === 'quit') p.quits.push(e);
    if (e.kind === 'feedback') p.fbs.push(e);
    if (e.kind === 'start') p.starts++;
    if (['start', 'end', 'quit', 'hide'].includes(e.kind) && e.playNo) {
      const k = e.pid + '|' + (e.sid || '') + '|' + e.playNo;
      if (!plays.has(k)) plays.set(k, { pid: e.pid, name: e.name, phone: phoneOf(e.ua) });
      const pl = plays.get(k);
      pl[e.kind] = e;
      if (e.name) pl.name = e.name;
    }
  }
  const ps = [...people.values()].filter((p) => p.starts + p.ends.length > 0);
  const ends = ev.filter((e) => e.kind === 'end');
  const fbs = ev.filter((e) => e.kind === 'feedback');
  const avg = (a) => a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : 0;
  const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '-';
  const faceCount = {}; fbs.forEach((f) => { faceCount[f.face] = (faceCount[f.face] || 0) + 1; });
  const sum = (k) => ends.reduce((s, e) => s + (e[k] || 0), 0);
  const fails = [['ナマ・片面ナマ', sum('raw') + sum('halfraw')], ['コゲ・炭', sum('burnt') + sum('char')], ['冷めた', sum('cold')], ['待たせて帰った', sum('leave')], ['余熱で焼けすぎ', sum('carryOver')], ['時間切れで残った', sum('leftover')], ['捨てた', sum('discard')]].sort((a, b) => b[1] - a[1]);
  const rankCount = {}; ends.filter((e) => !e.stage).forEach((e) => { rankCount[e.rank] = (rankCount[e.rank] || 0) + 1; });
  // ステージごと：むずかしすぎ・やさしすぎを見る
  const stg = {};
  for (const pl of plays.values()) {
    if (!pl.start) continue;
    const k = pl.start.stage || 0;
    const r = stg[k] = stg[k] || { people: new Set(), ends: 0, clear: 0, stars: 0, scores: [], notDone: 0, confused: 0, tries: [] };
    r.people.add(pl.pid);
    if (pl.end) { r.ends++; r.scores.push(pl.end.score); r.stars += pl.end.stars || 0; if ((pl.end.stars || 0) >= 1) r.clear++; } else r.notDone++;
  }
  for (const f of fbs) { const m = /^S(\d)$/.exec(f.rank || ''); const k = m ? Number(m[1]) : 0; if (stg[k] && f.face === 'confused') stg[k].confused++; }
  // はじめて★1を取るまでに、何回最後まで遊んだか（人ごと）
  for (const p of ps) {
    const byStage = {};
    for (const e of p.ends) { if (!e.stage) continue; const b = byStage[e.stage] = byStage[e.stage] || { n: 0, done: false }; if (b.done) continue; b.n++; if ((e.stars || 0) >= 1) { b.done = true; stg[e.stage] && stg[e.stage].tries.push(b.n); } }
  }
  const STAGE_NAME = ['本番', '屋台', '裏を読む', '好みを聞く', '火を使い分ける', '余熱を読む', '満席', '審査員'];
  const again = ps.filter((p) => p.ends.length >= 2).length; // 最後まで2回以上
  const t = (ms) => new Date(ms).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  // 1回ごとの終わり方（最後まで / やり直し・タイトルへ / 別のアプリへ行ったまま）
  const all = [...plays.values()].filter((pl) => pl.start);
  const done = all.filter((pl) => pl.end).length;
  const quitN = all.filter((pl) => !pl.end && pl.quit).length;
  const gone = all.filter((pl) => !pl.end && !pl.quit);
  // 1枚ずつ：読みちがえの向き（肉の種類ごと）
  const per = {};
  for (const e of ends) for (const s of e.serves || []) {
    const k = s.ty; per[k] = per[k] || { n: 0, good: 0, under: 0, over: 0, carry: 0, raw: 0, burnt: 0 };
    const r = per[k]; r.n++;
    if (['perfect', 'great'].includes(s.res)) r.good++;
    else if (['raw', 'halfraw'].includes(s.res)) r.raw++;
    else if (['burnt', 'char'].includes(s.res)) r.burnt++;
    else if (s.under) r.under++;
    else if (s.over) r.over++;
    if (s.carry) r.carry++;
  }
  // 機種ごと
  const dev = {};
  for (const p of ps) { const d = dev[p.phone] = dev[p.phone] || { people: 0, ends: 0, again: 0, scores: [] }; d.people++; d.ends += p.ends.length; if (p.ends.length >= 2) d.again++; d.scores.push(...p.ends.map((e) => e.score)); }

  const card = (n, label, sub) => `<div class="c"><b>${n}</b>${label}${sub ? `<small>${sub}</small>` : ''}</div>`;
  const bar = (label, n, k) => `<div class="bar"><span style="width:150px">${label}</span><i style="width:${Math.min(600, n * k)}px"></i>${n}</div>`;
  const rows = ps.sort((a, b) => b.ends.length - a.ends.length).map((p) => {
    const sc = p.ends.map((e) => e.score);
    const fb = p.fbs[p.fbs.length - 1];
    return `<tr><td>${esc(p.name || '名無し')}<small>${p.phone}・${esc(p.pid.slice(0, 4))}</small></td><td>${p.ends.length}回${p.quits.length ? `<small>やり直し ${p.quits.length}</small>` : ''}</td>
<td>${sc.length ? Math.max(...sc) : '-'}</td><td>${sc.length >= 2 ? sc[0] + ' → ' + sc[sc.length - 1] : sc[0] ?? '-'}</td><td>${fb ? FACE[fb.face] || '' : ''}</td></tr>`;
  }).join('');
  const comments = fbs.slice().reverse().map((f) => `<li><span class="f">${FACE[f.face] || ''}</span>${f.round === 2 ? '（何回か遊んだあと）' : ''} ${f.text ? esc(f.text) : '<i>（ひとことなし）</i>'}<small>${esc(f.name || '名無し')}・${f.score ?? '-'}点・${t(f.at)}</small></li>`).join('');
  const quitList = all.filter((pl) => !pl.end).reverse().slice(0, 40).map((pl) => {
    const last = pl.quit || pl.hide;
    const how = pl.quit ? (pl.quit.why === 'retry' ? 'やり直した' : pl.quit.why === 'title' ? 'タイトルへもどった' : 'ページを閉じた') : pl.hide ? '別のアプリへ行ったまま' : '記録が途切れた';
    return `<li>${esc(pl.name || '名無し')}：${last ? last.t + '秒目で' : ''}${how}${last ? `（その時 ${last.score}点${last.tutorial ? '・説明の途中' : ''}）` : ''}<small>${pl.phone}・${t(pl.start.at)}</small></li>`;
  }).join('');
  const perRows = Object.entries(per).map(([k, r]) => `<tr><td>${TYPE_NAME[k] || k}</td><td>${r.n}</td><td>${pct(r.good, r.n)}</td><td>${r.under}</td><td>${r.over}</td><td>${r.carry}</td><td>${r.raw}</td><td>${r.burnt}</td></tr>`).join('');
  const stageRows = Object.keys(stg).map(Number).sort((a, b) => (a || 99) - (b || 99)).map((k) => {
    const r = stg[k];
    return `<tr><td>${k ? k + ' ' : ''}${STAGE_NAME[k] || k}</td><td>${r.people.size}</td><td>${r.ends}${r.notDone ? `<small>途中まで ${r.notDone}</small>` : ''}</td><td>${k ? pct(r.clear, r.ends) : '-'}</td><td>${k && r.ends ? (r.stars / r.ends).toFixed(1) : '-'}</td><td>${k && r.tries.length ? (r.tries.reduce((a, b) => a + b, 0) / r.tries.length).toFixed(1) + '回' : '-'}</td><td>${r.scores.length ? avg(r.scores) : '-'}</td><td>${r.confused || ''}</td></tr>`;
  }).join('');
  const devRows = Object.entries(dev).map(([k, d]) => `<tr><td>${k}</td><td>${d.people}</td><td>${d.ends}</td><td>${pct(d.again, d.people)}</td><td>${d.scores.length ? avg(d.scores) : '-'}</td></tr>`).join('');

  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>試遊会の集計</title>
<meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="refresh" content="10">
<style>body{margin:0;background:#1a100c;color:#fff;font-family:'Hiragino Sans',sans-serif;padding:20px;max-width:960px;margin:auto}
h1{color:#ffd84d;margin:0 0 4px}h2{color:#ffd9b0;font-size:18px;margin:26px 0 8px}.note{color:#d9b896;font-size:13px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.c{background:#2d1b12;border-radius:14px;padding:12px;font-size:13px;color:#ffd9b0}
.c b{display:block;font-size:32px;color:#fff}.c small,td small,li small{display:block;color:#a8896c;font-size:12px}
table{width:100%;border-collapse:collapse;background:#2d1b12;border-radius:12px;overflow:hidden}td,th{padding:8px 10px;border-bottom:1px solid #3d2417;text-align:left;font-size:14px}th{color:#ffd9b0;font-weight:normal}
ul{list-style:none;padding:0;margin:0}li{background:#2d1b12;border-radius:10px;padding:8px 12px;margin-bottom:6px;font-size:15px}.f{white-space:nowrap}
.bar{display:flex;align-items:center;gap:8px;font-size:14px;margin:4px 0}.bar i{display:block;height:14px;background:#ff7a2f;border-radius:7px}</style></head><body>
<h1>ジュー 試遊会の集計</h1><div class="note">10秒ごとに新しくなります。記録はこの Mac の playtest-data/log.jsonl にだけあります。</div>
<h2>ひと目で</h2><div class="cards">
${card(ps.length, '遊んだ人')}
${card(done, '最後まで遊んだ回数', `やり直し ${quitN}回・離れたまま ${gone.length}回`)}
${card(pct(again, ps.length), '最後まで2回以上遊んだ人', '「もう一回」したくなったか')}
${card(pct(faceCount.again || 0, fbs.length), '「またやりたい」', `感想 ${fbs.length}件`)}
${card(ends.length ? avg(ends.map((e) => e.score)) : '-', '平均の点')}
</div>
<h2>感想</h2>
${Object.keys(FACE).map((k) => bar(FACE[k], faceCount[k] || 0, 30)).join('')}
<ul style="margin-top:10px">${comments || '<li>まだありません</li>'}</ul>
<h2>ステージごと</h2><div class="note">★1を取れた割合が低い・★1までの回数が多い・「わかりにくい」が多いステージが、むずかしすぎるところ</div>
<table><tr><th>ステージ</th><th>人</th><th>最後まで</th><th>★1以上</th><th>平均★</th><th>★1までの回数</th><th>平均の点</th><th>😵</th></tr>${stageRows || '<tr><td colspan=8>まだありません</td></tr>'}</table>
<h2>人ごと</h2><table><tr><th>名前</th><th>最後まで</th><th>最高点</th><th>最初 → 最後</th><th>感想</th></tr>${rows || '<tr><td colspan=5>まだいません</td></tr>'}</table>
<h2>どこで読みちがえたか（出した肉1枚ずつ）</h2>
<table><tr><th>肉</th><th>出した</th><th>うまい以上</th><th>焼き足りない</th><th>焼きすぎ</th><th>余熱で焼けすぎ</th><th>ナマ</th><th>コゲ</th></tr>${perRows || '<tr><td colspan=8>まだありません</td></tr>'}</table>
<h2>多かった失敗（全員の合計）</h2>${fails.map(([k, n]) => bar(k, n, 12)).join('')}
<h2>ランク（本番だけ）</h2>${RANKS.map((k) => bar(RANK_NAME[k] || k, rankCount[k] || 0, 30)).join('')}
<h2>機種ごと</h2><table><tr><th>機種</th><th>人</th><th>最後まで</th><th>2回以上</th><th>平均の点</th></tr>${devRows || '<tr><td colspan=5>まだいません</td></tr>'}</table>
<h2>最後まで遊ばなかった回</h2><ul>${quitList || '<li>まだありません</li>'}</ul>
</body></html>`;
}

// ===== 起動 =====
// 新しい URL ができたら：外から開けるようになるのを待ってから、入口に書く
async function onNewUrl(url) {
  for (let i = 0; i < 15 && url === publicUrl; i++) {
    try { const r = await fetch(url + '/api/ping', { signal: AbortSignal.timeout(5000) }); if (r.ok) break; } catch (e) { /* まだつながらない */ }
    await new Promise((ok) => setTimeout(ok, 2000));
  }
  if (url === publicUrl && await publish(url, true)) await checkFixed();
}
let cf = null, stopping = false;
function startTunnel() {
  cf = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${PORT}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  const watch = (buf) => {
    const m = String(buf).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m && m[0] !== publicUrl) { publicUrl = m[0]; console.log(`配るURL：${publicUrl}`); fs.writeFileSync(path.join(DATA, 'url.txt'), publicUrl + '\n'); onNewUrl(publicUrl); }
  };
  cf.stdout.on('data', watch); cf.stderr.on('data', watch);
  cf.on('exit', (code) => {
    publicUrl = null;
    if (stopping) return;
    console.log('URL の係が止まりました（' + code + '）。10秒後に作り直します（URL は変わります）');
    setTimeout(startTunnel, 10000);
  });
}
server.listen(PORT, '127.0.0.1', () => {
  console.log(`試遊サーバー：http://127.0.0.1:${PORT}/  集計：http://127.0.0.1:${PORT}/playtest  QR：http://127.0.0.1:${PORT}/qr`);
  // 動いているあいだ Mac を眠らせない（ふたを閉じたときは眠る）
  if (process.platform === 'darwin') spawn('caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore', detached: true }).unref();
  if (!TUNNEL) return;
  startTunnel();
  const stop = async () => {
    if (stopping) return; stopping = true; if (cf) cf.kill();
    if (published) await publish('', false); // 入口を「いまは試遊会をしていません」に
    process.exit(0);
  };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  if (process.platform === 'darwin' && !process.argv.includes('--no-open')) execFile('open', ['-a', 'Google Chrome', `http://127.0.0.1:${PORT}/qr`]);
});
