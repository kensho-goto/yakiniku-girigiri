#!/usr/bin/env node
// 試遊会サーバー：ゲームを配り、遊んだ記録と感想を playtest-data/log.jsonl に集める。
//   node tools/playtest.js          … この Mac で動かして、期間限定の URL（cloudflared）を作り、QR の画面を開く
//   node tools/playtest.js --no-tunnel … URL を作らず、この Mac だけで動かす
// 見る画面：http://127.0.0.1:8140/qr（配る QR）、http://127.0.0.1:8140/playtest（集計）
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'playtest-data');
const LOG = path.join(DATA, 'log.jsonl');
const PORT = Number(process.env.PORT || 8140);
const TUNNEL = !process.argv.includes('--no-tunnel');
fs.mkdirSync(DATA, { recursive: true });
let publicUrl = null;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8' };
const ALLOW = /^\/(index\.html|robots\.txt|src\/[\w.-]+\.js)?$/; // 配るのはゲームの部品だけ

function readLog() {
  if (!fs.existsSync(LOG)) return [];
  return fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
}
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function send(res, code, type, body) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);
  if (p === '/favicon.ico' || p.startsWith('/apple-touch-icon')) return send(res, 204, 'text/plain', '');
  if (p === '/api/ping') return send(res, 200, TYPES['.json'], JSON.stringify({ playtest: true }));
  if (p === '/api/log' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 20000) req.destroy(); });
    req.on('end', () => {
      try {
        const j = JSON.parse(body);
        j.recv = new Date().toISOString();
        fs.appendFileSync(LOG, JSON.stringify(j) + '\n');
        if (j.kind === 'end') console.log(`🍖 ${j.name || '名無し'}：${j.score}点（${j.rank}）`);
        if (j.kind === 'feedback') console.log(`💬 ${j.name || '名無し'}：${j.face} ${j.text || ''}`);
      } catch (e) { /* こわれた記録は捨てる */ }
      send(res, 204, 'text/plain', '');
    });
    return;
  }
  // 集計と QR は、この Mac から開いたときだけ見せる（期間限定URLの先の人には見せない）
  const local = !req.headers['cf-connecting-ip'];
  if (p === '/playtest' || p === '/qr') {
    if (!local) return send(res, 404, 'text/plain', 'not found');
    return send(res, 200, TYPES['.html'], p === '/qr' ? qrPage() : reportPage());
  }
  if (p === '/api/url') return send(res, 200, TYPES['.json'], JSON.stringify({ url: local ? publicUrl : null }));
  if (!ALLOW.test(p)) return send(res, 404, 'text/plain', 'not found');
  const file = path.join(ROOT, p === '/' ? 'index.html' : p);
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'text/plain', 'not found');
    send(res, 200, TYPES[path.extname(file)] || 'application/octet-stream', buf);
  });
});

// ===== 配る QR の画面 =====
function qrPage() {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>焼肉ギリギリ 試遊会</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
<style>body{margin:0;background:#2a1a14;color:#fff;font-family:'Hiragino Sans',sans-serif;text-align:center;padding:24px}
h1{color:#ffd84d;font-size:40px;margin:8px 0}#qr{display:inline-block;background:#fff;padding:18px;border-radius:16px;margin:16px 0}
.url{font-size:18px;word-break:break-all;color:#ffd9b0}.wait{font-size:20px;color:#ffb3a0}ol{display:inline-block;text-align:left;font-size:18px;line-height:1.8}
a{color:#ffd84d}</style></head><body>
<h1>焼肉ギリギリ 試遊会</h1>
<div id="wait" class="wait">URL を作っています…（10秒ほど）</div>
<div id="qr"></div><div class="url" id="url"></div>
<ol><li>スマホのカメラで QR を読む</li><li>名前（ニックネーム）を入れて「焼く」</li><li>終わったら「どうだった？」を押して送る</li></ol>
<p><a href="/playtest" target="_blank">集計を見る</a></p>
<script>
let made=false;
async function tick(){ if(made) return; const j=await (await fetch('/api/url')).json().catch(()=>({}));
 if(j.url){ made=true; document.getElementById('wait').remove(); new QRCode(document.getElementById('qr'),{text:j.url,width:320,height:320}); document.getElementById('url').textContent=j.url; }
 else setTimeout(tick,1500); }
tick();
</script></body></html>`;
}

// ===== 集計の画面 =====
const FACE = { again: '😆 またやりたい', ok: '🙂 まあまあ', confused: '😵 わかりにくい', bored: '😴 つまらない' };
const RANKS = ['kikaku', 'C', 'B', 'A3', 'A4', 'A5', 'tokusen'];
const RANK_NAME = { kikaku: '規格外', tokusen: '特選A5' };
function reportPage() {
  const ev = readLog();
  const people = new Map();
  const who = (e) => {
    if (!people.has(e.pid)) people.set(e.pid, { pid: e.pid, name: '', ends: [], quits: [], fbs: [], opened: 0, phone: '' });
    const p = people.get(e.pid);
    if (e.name) p.name = e.name;
    if (e.ua) p.phone = /iPhone/.test(e.ua) ? 'iPhone' : /Android/.test(e.ua) ? 'Android' : /iPad/.test(e.ua) ? 'iPad' : 'PC';
    return p;
  };
  for (const e of ev) {
    const p = who(e);
    if (e.kind === 'open') p.opened++;
    if (e.kind === 'end') p.ends.push(e);
    if (e.kind === 'quit') p.quits.push(e);
    if (e.kind === 'feedback') p.fbs.push(e);
  }
  const ps = [...people.values()].filter((p) => p.ends.length + p.quits.length > 0);
  const ends = ev.filter((e) => e.kind === 'end');
  const quits = ev.filter((e) => e.kind === 'quit');
  const fbs = ev.filter((e) => e.kind === 'feedback');
  const avg = (a) => a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : 0;
  const faceCount = {}; fbs.forEach((f) => { faceCount[f.face] = (faceCount[f.face] || 0) + 1; });
  const sum = (k) => ends.reduce((s, e) => s + (e[k] || 0), 0);
  const fails = [['ナマ・片面ナマ', sum('raw') + sum('halfraw')], ['コゲ・炭', sum('burnt') + sum('char')], ['冷めた', sum('cold')], ['待たせて帰った', sum('leave')], ['余熱で焼けすぎ', sum('carryOver')], ['時間切れで残った', sum('leftover')]].sort((a, b) => b[1] - a[1]);
  const rankCount = {}; ends.forEach((e) => { rankCount[e.rank] = (rankCount[e.rank] || 0) + 1; });
  const again = ps.filter((p) => p.ends.length + p.quits.length >= 2).length;
  const t = (ms) => new Date(ms).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

  const card = (n, label, sub) => `<div class="c"><b>${n}</b>${label}${sub ? `<small>${sub}</small>` : ''}</div>`;
  const rows = ps.sort((a, b) => b.ends.length - a.ends.length).map((p) => {
    const sc = p.ends.map((e) => e.score);
    const fb = p.fbs[p.fbs.length - 1];
    return `<tr><td>${esc(p.name || '名無し')}<small>${p.phone}</small></td><td>${p.ends.length}回${p.quits.length ? `<small>途中でやめた ${p.quits.length}</small>` : ''}</td>
<td>${sc.length ? Math.max(...sc) : '-'}</td><td>${sc.length >= 2 ? sc[0] + ' → ' + sc[sc.length - 1] : sc[0] ?? '-'}</td><td>${fb ? FACE[fb.face] || '' : ''}</td></tr>`;
  }).join('');
  const comments = fbs.slice().reverse().map((f) => `<li><span class="f">${FACE[f.face] || ''}</span> ${f.text ? esc(f.text) : '<i>（ひとことなし）</i>'}<small>${esc(f.name || '名無し')}・${f.score ?? '-'}点・${t(f.at)}</small></li>`).join('');
  const quitList = quits.slice().reverse().map((q) => `<li>${esc(q.name || '名無し')}：${q.t}秒目で${q.why === 'retry' ? 'やり直し' : q.why === 'title' ? 'タイトルへ' : 'ページを閉じた'}（その時 ${q.score}点${q.tutorial ? '・説明の途中' : ''}）<small>${t(q.at)}</small></li>`).join('');

  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>試遊会の集計</title>
<meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="refresh" content="10">
<style>body{margin:0;background:#1a100c;color:#fff;font-family:'Hiragino Sans',sans-serif;padding:20px;max-width:960px;margin:auto}
h1{color:#ffd84d;margin:0 0 4px}h2{color:#ffd9b0;font-size:18px;margin:26px 0 8px}.note{color:#d9b896;font-size:13px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.c{background:#2d1b12;border-radius:14px;padding:12px;font-size:13px;color:#ffd9b0}
.c b{display:block;font-size:32px;color:#fff}.c small,td small,li small{display:block;color:#a8896c;font-size:12px}
table{width:100%;border-collapse:collapse;background:#2d1b12;border-radius:12px;overflow:hidden}td,th{padding:8px 10px;border-bottom:1px solid #3d2417;text-align:left;font-size:14px}th{color:#ffd9b0;font-weight:normal}
ul{list-style:none;padding:0;margin:0}li{background:#2d1b12;border-radius:10px;padding:8px 12px;margin-bottom:6px;font-size:15px}.f{white-space:nowrap}
.bar{display:flex;align-items:center;gap:8px;font-size:14px;margin:4px 0}.bar i{display:block;height:14px;background:#ff7a2f;border-radius:7px}</style></head><body>
<h1>焼肉ギリギリ 試遊会の集計</h1><div class="note">10秒ごとに新しくなります。記録はこの Mac の playtest-data/log.jsonl にだけあります。</div>
<h2>ひと目で</h2><div class="cards">
${card(ps.length, '遊んだ人')}
${card(ends.length, '最後まで遊んだ回数', quits.length ? `途中でやめた ${quits.length}回` : '')}
${card(ps.length ? Math.round(again / ps.length * 100) + '%' : '-', '2回以上遊んだ人', '「もう一回」したくなったか')}
${card(fbs.length ? Math.round((faceCount.again || 0) / fbs.length * 100) + '%' : '-', '「またやりたい」', `感想 ${fbs.length}件`)}
${card(avg(ends.map((e) => e.score)) || '-', '平均の点')}
</div>
<h2>感想</h2>
${Object.keys(FACE).map((k) => `<div class="bar"><span style="width:130px">${FACE[k]}</span><i style="width:${(faceCount[k] || 0) * 30}px"></i>${faceCount[k] || 0}</div>`).join('')}
<ul style="margin-top:10px">${comments || '<li>まだありません</li>'}</ul>
<h2>人ごと</h2><table><tr><th>名前</th><th>遊んだ</th><th>最高点</th><th>最初 → 最後</th><th>感想</th></tr>${rows || '<tr><td colspan=5>まだいません</td></tr>'}</table>
<h2>多かった失敗（全員の合計）</h2>${fails.map(([k, n]) => `<div class="bar"><span style="width:130px">${k}</span><i style="width:${Math.min(600, n * 12)}px"></i>${n}</div>`).join('')}
<h2>ランク</h2>${RANKS.map((k) => `<div class="bar"><span style="width:130px">${RANK_NAME[k] || k}</span><i style="width:${(rankCount[k] || 0) * 30}px"></i>${rankCount[k] || 0}</div>`).join('')}
<h2>途中でやめたところ</h2><ul>${quitList || '<li>まだありません</li>'}</ul>
</body></html>`;
}

// ===== 起動 =====
server.listen(PORT, '127.0.0.1', () => {
  console.log(`試遊サーバー：http://127.0.0.1:${PORT}/  集計：http://127.0.0.1:${PORT}/playtest  QR：http://127.0.0.1:${PORT}/qr`);
  if (!TUNNEL) return;
  const cf = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${PORT}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  const watch = (buf) => {
    const m = String(buf).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m && !publicUrl) { publicUrl = m[0]; console.log(`配るURL：${publicUrl}`); fs.writeFileSync(path.join(DATA, 'url.txt'), publicUrl + '\n'); }
  };
  cf.stdout.on('data', watch); cf.stderr.on('data', watch);
  cf.on('exit', (code) => { console.log('URL の係が止まりました（' + code + '）'); publicUrl = null; });
  const stop = () => { cf.kill(); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  if (process.platform === 'darwin' && !process.argv.includes('--no-open')) execFile('open', ['-a', 'Google Chrome', `http://127.0.0.1:${PORT}/qr`]);
});
