// ジュー — ゲームサイト（CrazyGames）につなぐ部分（よろよろおつかいの src/portal.js と同じ作り）
// サイトの道具（SDK）が読みこまれていないとき（ふつうの公開版・手元・itch.io など）は、何もしない
// 広告のあいだは音を止める。サイトの「音を消す」設定にも従う
(function () {
  let sdk = null, playing = false, adOn = false, siteMute = false;
  const safe = (fn) => { try { return fn(); } catch (e) { console.warn('portal', e); return undefined; } };
  const quiet = () => { if (window.YS && YS.hold) YS.hold(adOn || siteMute); };
  async function init() {
    const C = window.CrazyGames && window.CrazyGames.SDK;
    if (!C) return false;
    try { await C.init(); } catch (e) { console.warn('portal init', e); return false; }
    if (C.environment === 'disabled') return false;
    sdk = C;
    safe(() => sdk.game.loadingStart());
    const readMute = () => { siteMute = !!safe(() => sdk.game.settings && sdk.game.settings.muteAudio); quiet(); };
    readMute();
    safe(() => sdk.game.addSettingsChangeListener(readMute));
    return true;
  }
  // サイトの返事がなくても、6秒で始める（読みこみで止まらない）
  const ready = Promise.race([init().catch(() => false), new Promise((r) => setTimeout(() => r(false), 6000))]);
  const YQ = {
    ready,
    get active() { return !!sdk; },
    loaded() { if (sdk) safe(() => sdk.game.loadingStop()); },
    start() { if (!sdk || playing) return; playing = true; safe(() => sdk.game.gameplayStart()); },
    stop() { if (!sdk || !playing) return; playing = false; safe(() => sdk.game.gameplayStop()); },
    happy() { if (sdk) safe(() => sdk.game.happytime()); },
    // 区切りの広告（もう一回・次のステージへ のとき）。広告が出なくても、終わったら done を1回だけ呼ぶ。出す間かくはサイトが決める
    breakAd(done) {
      let fin = false;
      const end = () => { if (fin) return; fin = true; done(); };
      if (!sdk) { end(); return; }
      YQ.stop();
      const off = () => { adOn = false; quiet(); end(); };
      const r = safe(() => sdk.ad.requestAd('midgame', { adStarted: () => { adOn = true; quiet(); }, adFinished: off, adError: off }));
      if (r && r.catch) r.catch(off);
      setTimeout(() => { if (!adOn) end(); }, 6000);
    },
  };
  window.YQ = YQ;
})();
