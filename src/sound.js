// 音はすべて WebAudio で作る（音のファイルは使わない）。音を消しても遊べるように、音だけの合図は作らない
(function (root) {
  'use strict';
  let ac = null, master = null, sizzleGain = null, sizzleSrc = null, bgmGain = null;
  let bgmMode = 'off', nextNote = 0, stepN = 0, bgmTimer = null;
  // 音の段階：0＝全部 / 1＝音楽だけ消す / 2＝全部消す
  let level = 0;
  let held = false; // ゲームサイトの広告のあいだ・サイトの「音を消す」のときは止めておく
  try { const v = localStorage.getItem('yaki.sound'); level = v != null ? Number(v) || 0 : localStorage.getItem('yaki.mute') === '1' ? 2 : 0; } catch (e) { /* 保存できない環境 */ }
  const BGM_VOL = 0.55;

  function ensure() {
    if (ac) { if (ac.state === 'suspended' && !held) ac.resume(); return true; }
    // iPhone：消音スイッチが入っていても鳴るように（Safari 16.4 以降）
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* 古い端末 */ }
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return false;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = level >= 2 ? 0 : 0.8;
    const comp = ac.createDynamicsCompressor();
    master.connect(comp); comp.connect(ac.destination);
    // ジュージュー（ずっと鳴らして、網の肉の数と火力で大きさを変える）
    const len = ac.sampleRate * 2;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (Math.random() < 0.02 ? 1 : 0.35);
    sizzleSrc = ac.createBufferSource(); sizzleSrc.buffer = buf; sizzleSrc.loop = true;
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    sizzleGain = ac.createGain(); sizzleGain.gain.value = 0;
    sizzleSrc.connect(hp); hp.connect(sizzleGain); sizzleGain.connect(master);
    sizzleSrc.start();
    bgmGain = ac.createGain(); bgmGain.gain.value = level >= 1 ? 0 : BGM_VOL; bgmGain.connect(master);
    bgmTimer = setInterval(schedule, 25);
    return true;
  }
  function noise(dur, f, q, vol, type) {
    if (!ac) return;
    const n = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = ac.createBufferSource(); s.buffer = buf;
    const bf = ac.createBiquadFilter(); bf.type = type || 'bandpass'; bf.frequency.value = f; bf.Q.value = q;
    const g = ac.createGain(); g.gain.value = vol;
    s.connect(bf); bf.connect(g); g.connect(master); s.start();
  }
  function tone(freq, dur, vol, type, at, slideTo) {
    if (!ac) return;
    const t0 = ac.currentTime + (at || 0);
    const o = ac.createOscillator(); o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  // 決まった時刻に鳴らす（音楽用）
  function hitAt(t, f, q, vol, dur, type, out) {
    const n = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
    const s = ac.createBufferSource(); s.buffer = buf;
    const bf = ac.createBiquadFilter(); bf.type = type || 'bandpass'; bf.frequency.value = f; bf.Q.value = q;
    const g = ac.createGain(); g.gain.value = vol;
    s.connect(bf); bf.connect(g); g.connect(out || master); s.start(t);
  }
  function noteAt(t, freq, dur, vol, type, out, slideTo) {
    const o = ac.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out || master); o.start(t); o.stop(t + dur + 0.05);
  }
  // 祭りばやし風の音楽。D・E・G・A・B（ヨナ抜きに近い音）だけを使う
  const SC = [293.66, 329.63, 392.0, 440.0, 493.88, 587.33, 659.25, 783.99, 880.0];
  const MEL = [5, -1, 4, 5, 7, -1, 5, 4, 3, -1, 2, 3, 4, -1, -1, -1, 5, -1, 4, 5, 7, -1, 8, 7, 5, -1, 4, 3, 2, -1, -1, -1];
  const BASS = [0, 0, 2, 3]; // 1小節ごとの根の音
  function schedule() {
    if (!ac || bgmMode === 'off') return;
    const fever = bgmMode === 'fever', last = bgmMode === 'last';
    const tempo = fever ? 152 : last ? 140 : 116;
    const dt = 60 / tempo / 2; // 8分
    if (nextNote < ac.currentTime) nextNote = ac.currentTime + 0.05;
    while (nextNote < ac.currentTime + 0.12) {
      const i = stepN % 32, b = i % 8, t = nextNote;
      // 太鼓（ドン・ドドン）とふち（カッ）
      if (b === 0 || b === 3 || b === 4) noteAt(t, 110, 0.22, 0.5, 'sine', bgmGain, 55);
      if (b % 2 === 1) hitAt(t, 3200, 2, fever ? 0.35 : 0.2, 0.04, 'bandpass', bgmGain);
      if (last && b % 2 === 0) hitAt(t, 8000, 1, 0.12, 0.03, 'highpass', bgmGain);
      // ベース
      if (b === 0 || b === 4) noteAt(t, SC[BASS[Math.floor(i / 8)]] / 4, 0.3, 0.22, 'triangle', bgmGain);
      // 笛の旋律（ふだんは半分だけ）
      const m = MEL[i];
      if (m >= 0 && (fever || last || i % 4 === 0)) noteAt(t, SC[m] * (fever ? 2 : 1), dt * 1.6, fever ? 0.07 : 0.05, fever ? 'square' : 'triangle', bgmGain);
      // フィーバー：手拍子
      if (fever && (b === 2 || b === 6)) { hitAt(t, 1500, 0.8, 0.5, 0.06, 'bandpass', bgmGain); hitAt(t + 0.012, 1800, 0.8, 0.3, 0.05, 'bandpass', bgmGain); }
      nextNote += dt;
      stepN++;
    }
  }

  // トロンボーンのような「ぷぉ〜ん」（失敗の音）
  function wah(from, to, dur, vol) {
    if (!ac) return;
    const t0 = ac.currentTime;
    const o = ac.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(from, t0);
    o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    const vib = ac.createOscillator(); vib.frequency.value = 6;
    const vg = ac.createGain(); vg.gain.value = 6; vib.connect(vg); vg.connect(o.frequency);
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(1600, t0); lp.frequency.linearRampToValueAtTime(500, t0 + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.05); g.gain.setValueAtTime(vol, t0 + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(lp); lp.connect(g); g.connect(master);
    o.start(t0); vib.start(t0); o.stop(t0 + dur + 0.05); vib.stop(t0 + dur + 0.05);
  }

  const S = {
    unlock: ensure,
    hold(on) { held = !!on; try { if (ac) { if (held) ac.suspend(); else ac.resume(); } } catch (e) { /* 止められなくても遊べる */ } },
    get muted() { return level >= 2; },
    get level() { return level; },
    // 押すたびに：全部 → 音楽だけ消す → 全部消す → 全部
    cycle() {
      level = (level + 1) % 3;
      try { localStorage.setItem('yaki.sound', String(level)); } catch (e) { /* なくてよい */ }
      if (master) master.gain.value = level >= 2 ? 0 : 0.8;
      if (bgmGain) bgmGain.gain.value = level >= 1 ? 0 : BGM_VOL;
      return level;
    },
    // ふるえ（Android など。iPhone のブラウザはふるえない）
    buzz(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* ふるえない端末 */ } },
    // 毎コマ：網の上の量で、ジュージューの大きさを決める
    sizzle(level) {
      if (!sizzleGain) return;
      sizzleGain.gain.setTargetAtTime(Math.min(0.5, level * 0.06), ac.currentTime, 0.08);
    },
    silence() { if (sizzleGain) sizzleGain.gain.setTargetAtTime(0, ac.currentTime, 0.05); },
    // 音楽：off / normal / fever / last
    bgm(mode) {
      if (mode === bgmMode) return;
      if (bgmMode === 'off' && mode !== 'off') { stepN = 0; if (ac) nextNote = ac.currentTime + 0.05; }
      bgmMode = mode;
    },
    fever() { if (!ac) return; const t = ac.currentTime; [0, 2, 4, 5, 7].forEach((k, i) => noteAt(t + i * 0.06, SC[k] * 2, 0.25, 0.14, 'square')); hitAt(t, 2000, 0.5, 0.8, 0.4, 'highpass'); },
    feverEnd() { if (!ac) return; const t = ac.currentTime; noteAt(t, 587, 0.2, 0.1, 'triangle'); noteAt(t + 0.15, 440, 0.35, 0.1, 'triangle'); },
    vip() { if (!ac) return; const t = ac.currentTime; [[392, 0], [392, 0.12], [392, 0.24], [523, 0.36]].forEach(([f, d]) => noteAt(t + d, f, d === 0.36 ? 0.6 : 0.1, 0.16, 'sawtooth')); noteAt(t + 0.36, 659, 0.6, 0.1, 'sawtooth'); },
    lastOrder() { if (!ac) return; const t = ac.currentTime; for (let i = 0; i < 3; i++) { noteAt(t + i * 0.18, 1568, 0.3, 0.12, 'sine'); noteAt(t + i * 0.18, 2349, 0.2, 0.05, 'sine'); } },
    rankUp() { if (!ac) return; const t = ac.currentTime; [523, 659, 784, 1047].forEach((f, i) => noteAt(t + i * 0.05, f, 0.2, 0.12, 'triangle')); },
    // 拍手：ランクが高いほど人数が多い
    applause(n) {
      if (!ac) return;
      const t = ac.currentTime;
      const claps = 6 + n * 14;
      for (let i = 0; i < claps; i++) hitAt(t + 0.1 + Math.random() * (0.8 + n * 0.35), 1200 + Math.random() * 1500, 0.9, 0.25 + Math.random() * 0.2, 0.05);
      if (n >= 4) [523, 659, 784, 1047, 1319].forEach((f, i) => noteAt(t + i * 0.09, f, 0.5, 0.12, 'triangle'));
    },
    stamp() { if (!ac) return; noteAt(ac.currentTime, 90, 0.3, 0.5, 'sine', null, 40); hitAt(ac.currentTime, 400, 1, 0.8, 0.15); },
    place() { noise(0.35, 4000, 0.8, 0.9, 'highpass'); tone(180, 0.08, 0.15, 'sine'); },
    flip() { noise(0.08, 900, 1.2, 0.6); noise(0.25, 5000, 0.7, 0.6, 'highpass'); },
    plate() { tone(1900, 0.18, 0.12, 'sine'); tone(2600, 0.14, 0.06, 'sine', 0.01); },
    discard() { noise(0.2, 300, 1, 0.8); tone(90, 0.2, 0.2, 'square'); },
    rested() { tone(1320, 0.09, 0.08, 'triangle'); },
    burning() { noise(0.5, 1200, 0.5, 0.5); },
    deny() { tone(220, 0.09, 0.12, 'square'); tone(180, 0.12, 0.12, 'square', 0.09); },
    perfect() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.35, 0.16, 'triangle', i * 0.07)); tone(2093, 0.6, 0.05, 'sine', 0.35); },
    great() { tone(784, 0.18, 0.15, 'triangle'); tone(1047, 0.28, 0.15, 'triangle', 0.09); },
    good() { tone(659, 0.2, 0.12, 'triangle'); },
    meh() { tone(330, 0.25, 0.1, 'triangle', 0, 290); },
    fail() { wah(330, 150, 0.9, 0.18); },
    moo() { wah(150, 110, 0.8, 0.22); },
    char() { noise(0.6, 200, 0.7, 0.9); wah(200, 70, 0.9, 0.15); },
    cold() { tone(1800, 0.7, 0.07, 'sine', 0, 500); },
    leave() { tone(880, 0.25, 0.1, 'sine'); tone(698, 0.4, 0.1, 'sine', 0.2); },
    tick() { tone(1000, 0.05, 0.08, 'square'); },
    end() { tone(392, 0.8, 0.15, 'triangle'); tone(523, 0.9, 0.12, 'triangle', 0.15); tone(196, 1.2, 0.15, 'sine'); },
  };
  root.YS = S;
})(window);
