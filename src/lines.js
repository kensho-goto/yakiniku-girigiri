// 客の反応。失敗の種類ごとにセリフと顔・演出を決める（ランダムな一言ではなく、起きたことに対応させる）
(function (root) {
  'use strict';
  const CHAR_NAMES = ['部長', 'マッチョ', 'おばあちゃん', '美食家', 'ちびっこ', 'ねこ', '審査員'];

  // key → 共通のセリフ。CHAR[key][char] があればその人らしい言い方を優先する
  const BASE = {
    perfect: ['これが…肉…！？', '口の中で、牛が歌ってる', '人生で一番の一枚'],
    great: ['いい焼き加減！', 'わかってるねえ', 'これこれ！'],
    good: ['うん、ふつうにうまい', 'まあ、肉だね', '悪くない'],
    meh_under: ['もうちょい攻めてよ', 'あと少し焼いてほしかった'],
    meh_over: ['ちょっと固い…', '焼きすぎかな…'],
    miss_under: ['頼んだのと全然ちがう', 'これ、まだ途中だよね？'],
    miss_over: ['靴底みたい', 'アゴが筋トレしてる'],
    raw: ['まだ始まってない', 'これ、さっきまで牛だった'],
    halfraw: ['片面だけ、まだ牛だった', '裏が「モー」って言った'],
    halfraw_burnt: ['表は炭、裏はナマ。天才か', '一枚で二度まずい'],
    burnt: ['炭としては一級品', 'これは…よく燃えそう'],
    char: ['これでバーベキューができる', '炭を炭火で焼いたの？'],
    cold: ['肉も気持ちも冷めた', '冷蔵庫の味がする'],
    luke: ['ぬるい…人肌…'],
    wrong: ['頼んだのと違う肉だけど…食べる'],
    leave: ['帰ります', 'もうコンビニ行く', 'お腹すいて帰る'],
  };
  const CHAR = {
    perfect: ['部長、泣いてもいいですか', '筋肉が…喜んでいる！', '長生きはするもんだねえ', 'ブラボー！五つ星！', 'ママより上手！', 'にゃ（昇天）'],
    burnt: ['これは始末書ものだね', 'プロテインより苦い', '昔の家の竈を思い出すねえ', 'ノン。これは炭の芸術', 'まっくろ！かっこいい！', 'にゃ…（引っかく）'],
    raw: ['会議はまだ始まってない', '生はタンパク質が…いやダメ', 'おばあちゃん、お腹こわすよ', 'タルタルですか？', 'うごいた！', 'にゃ！（喜ぶ）'],
    cold: ['部下の目より冷たい', '筋肉も冷えた', '昔の弁当の味だねえ', '冷製…を頼んだ覚えはない', 'つめたーい', 'にゃ（ふて寝）'],
    leave: ['次の会議があるので', 'ジム行くわ', 'もう寝る時間だよ', '星ゼロ', 'ママに言いつける', 'にゃ（帰る）'],
  };

  // 審査員はいつもこの言い方（格付けの言葉）
  const VIP = {
    perfect: ['満点。この店に星をつけます'], great: ['合格。いい仕事です'], good: ['及第点、といったところ'],
    meh_under: ['減点。火入れが甘い'], meh_over: ['減点。火を入れすぎ'], miss_under: ['注文書を読みましたか？'], miss_over: ['注文書を読みましたか？'],
    raw: ['この店は、生で出すのですか'], halfraw: ['裏が冷蔵庫でした'], halfraw_burnt: ['表は炭、裏は冷蔵庫。新しい'],
    burnt: ['特上を…炭に…'], char: ['評価不能。燃料です'], cold: ['冷えた特上は、ただの脂です'], leave: ['審査は終了です'],
  };

  // 結果 → 反応の種類（セリフ・顔・演出・音をそろえる）
  function reactKey(r) {
    if (r.fail === 'leave') return 'leave';
    if (r.fail === 'halfraw') return r.alsoBurnt ? 'halfraw_burnt' : 'halfraw';
    if (r.fail) return r.fail; // raw / burnt / char / cold
    if (r.rank === 'meh') return r.under ? 'meh_under' : 'meh_over';
    if (r.rank === 'miss') return r.under ? 'miss_under' : 'miss_over';
    return r.rank; // perfect / great / good
  }
  // 顔と演出（draw.js が使う）
  const FACE = {
    perfect: 'heaven', great: 'happy', good: 'smile', meh_under: 'meh', meh_over: 'chew', miss_under: 'meh', miss_over: 'chew',
    raw: 'shock', halfraw: 'shock', halfraw_burnt: 'shock', burnt: 'soot', char: 'soot', cold: 'frozen', leave: 'angry',
  };

  function line(r, char, n) {
    const key = reactKey(r);
    const own = CHAR[key] && CHAR[key][char];
    const base = BASE[key] || ['…'];
    let text = char === 6 && VIP[key] ? VIP[key][0] : own && n % 2 === 0 ? own : base[n % base.length];
    // 付け足し：実際に起きたことだけ
    const extra = [];
    if (r.carryOver) extra.push('（余熱で焼けすぎ）');
    if (r.luke && key !== 'cold') extra.push('…ぬるい');
    if (r.wrongType) extra.push('（頼んだ肉とちがう）');
    return { key, face: FACE[key] || 'smile', text, extra: extra.join('') };
  }

  const YL = { CHAR_NAMES, BASE, CHAR, VIP, reactKey, line, FACE };
  if (typeof module !== 'undefined' && module.exports) module.exports = YL;
  else root.YL = YL;
})(typeof window !== 'undefined' ? window : globalThis);
