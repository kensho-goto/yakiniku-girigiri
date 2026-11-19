// 音はすべて WebAudio で作る（音のファイルは使わない）。音を消しても遊べるように、音だけの合図は作らない
(function (root) {
  'use strict';
  let ac = null, master = null, sizzleGain = null, sizzleSrc = null;
  let muted = false;
  try { muted = localStorage.getItem('yaki.mute') === '1'; } catch (e) { /* 保存できない環境 */ }

  function ensure() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return true; }
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return false;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.8;
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
    get muted() { return muted; },
    setMuted(v) {
      muted = v;
      try { localStorage.setItem('yaki.mute', v ? '1' : '0'); } catch (e) { /* なくてよい */ }
      if (master) master.gain.value = v ? 0 : 0.8;
    },
    // 毎コマ：網の上の量で、ジュージューの大きさを決める
    sizzle(level) {
      if (!sizzleGain) return;
      sizzleGain.gain.setTargetAtTime(Math.min(0.5, level * 0.06), ac.currentTime, 0.08);
    },
    silence() { if (sizzleGain) sizzleGain.gain.setTargetAtTime(0, ac.currentTime, 0.05); },
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
