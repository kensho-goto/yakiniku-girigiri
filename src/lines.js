// 客の反応。失敗の種類ごとにセリフと顔・演出を決める（ランダムな一言ではなく、起きたことに対応させる）
(function (root) {
  'use strict';
  const EN = !!(root.YI && root.YI.en); // 英語（i18n.js）。node では日本語
  const ZH = !!(root.YI && root.YI.zh); // 中国語：英語のセリフを src/zh.js の表で置きかえる
  const t = ZH ? root.YI.t : (x) => x;
  const CHAR_NAMES = EN || ZH ? t(['Boss', 'Muscle guy', 'Granny', 'Gourmet', 'Kid', 'Cat', 'Critic']) : ['部長', 'マッチョ', 'おばあちゃん', '美食家', 'ちびっこ', 'ねこ', '審査員'];

  // key → 共通のセリフ。CHAR[key][char] があればその人らしい言い方を優先する
  const BASE_JA = {
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
  const CHAR_JA = {
    perfect: ['部長、泣いてもいいですか', '筋肉が…喜んでいる！', '長生きはするもんだねえ', 'ブラボー！五つ星！', 'ママより上手！', 'にゃ（昇天）'],
    burnt: ['これは始末書ものだね', 'プロテインより苦い', '昔の家の竈を思い出すねえ', 'ノン。これは炭の芸術', 'まっくろ！かっこいい！', 'にゃ…（引っかく）'],
    raw: ['会議はまだ始まってない', '生はタンパク質が…いやダメ', 'おばあちゃん、お腹こわすよ', 'タルタルですか？', 'うごいた！', 'にゃ！（喜ぶ）'],
    cold: ['部下の目より冷たい', '筋肉も冷えた', '昔の弁当の味だねえ', '冷製…を頼んだ覚えはない', 'つめたーい', 'にゃ（ふて寝）'],
    leave: ['次の会議があるので', 'ジム行くわ', 'もう寝る時間だよ', '星ゼロ', 'ママに言いつける', 'にゃ（帰る）'],
  };

  // 審査員はいつもこの言い方（格付けの言葉）
  const VIP_JA = {
    perfect: ['満点。この店に星をつけます'], great: ['合格。いい仕事です'], good: ['及第点、といったところ'],
    meh_under: ['減点。火入れが甘い'], meh_over: ['減点。火を入れすぎ'], miss_under: ['注文書を読みましたか？'], miss_over: ['注文書を読みましたか？'],
    raw: ['この店は、生で出すのですか'], halfraw: ['裏が冷蔵庫でした'], halfraw_burnt: ['表は炭、裏は冷蔵庫。新しい'],
    burnt: ['特上を…炭に…'], char: ['評価不能。燃料です'], cold: ['冷えた特上は、ただの脂です'], leave: ['審査は終了です'],
  };

  // 英語：がんこで おかしい焼肉屋の客。短く
  const BASE_EN = {
    perfect: ['This is... MEAT?!', 'A cow is singing in my mouth', 'Best bite of my life'],
    great: ['Now THAT is grilled!', 'You get it', 'Yes. This. More.'],
    good: ['Yep. Solid.', "Well, it's meat", 'Not bad'],
    meh_under: ['Be braver with it', 'Wanted it a bit more done'],
    meh_over: ['Kinda chewy...', 'Little overdone...'],
    miss_under: ['Not what I ordered. At all', 'Is this still loading?'],
    miss_over: ['Tastes like a shoe', 'My jaw is doing push-ups'],
    raw: ["It hasn't even started", 'This was a cow a minute ago'],
    halfraw: ['One side is still a cow', 'The bottom just said moo'],
    halfraw_burnt: ['Charcoal on top, raw below. Genius', 'Two kinds of bad in one bite'],
    burnt: ['Premium charcoal, at least', "Well, it'll burn nicely"],
    char: ['I could start a BBQ with this', 'Did you grill charcoal on charcoal?'],
    cold: ['The meat went cold. So did I', 'Tastes like the fridge'],
    luke: ['Lukewarm... body temp...'],
    wrong: ["Wrong meat. I'll eat it anyway"],
    leave: ["I'm out", 'Gas station hot dog it is', 'Too hungry. Bye'],
  };
  const CHAR_EN = {
    perfect: ['Permission to cry, sir', 'My muscles... rejoice!', 'Worth living this long, dear', 'Bravo! Five stars!', 'Better than Mom makes!', 'Purrrrrrrr...'],
    burnt: ["Someone's writing a report", 'More bitter than protein powder', 'Like the old wood stove, dear', 'Non. This is charcoal art', 'So black! So cool!', 'Hsssss!'],
    raw: ["The meeting hasn't started", 'Raw protein is... no. No.', "You'll get a tummy ache, dear", 'Tartare? I did not order tartare', 'It moved!', 'Nya! Raw! Yay!'],
    cold: ["Colder than my team's stares", 'My gains went cold', 'Like an old lunchbox, dear', 'I did not order it chilled', 'Brrr! Cold!', 'Nya. Sulking now.'],
    leave: ['I have another meeting', 'Gym time. Bye', 'Past my bedtime, dear', 'Zero stars', "I'm telling Mom", 'Nya. Bye.'],
  };
  const VIP_EN = {
    perfect: ['Flawless. This shop gets a star'], great: ['A pass. Fine work'], good: ['Passable. Barely'],
    meh_under: ['Points off. Undercooked'], meh_over: ['Points off. Overcooked'], miss_under: ['Did you read the order?'], miss_over: ['Did you read the order?'],
    raw: ['Does this shop serve it raw?'], halfraw: ['The underside was a fridge'], halfraw_burnt: ['Charcoal on top, fridge below. Novel'],
    burnt: ['Prime... into charcoal...'], char: ['Unratable. That is fuel'], cold: ['Cold Prime is just fat'], leave: ['This review is over'],
  };
  const BASE = EN ? BASE_EN : ZH ? t(BASE_EN) : BASE_JA, CHAR = EN ? CHAR_EN : ZH ? t(CHAR_EN) : CHAR_JA, VIP = EN ? VIP_EN : ZH ? t(VIP_EN) : VIP_JA;

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
    if (r.carryOver) extra.push(EN || ZH ? t(' Cooked on the plate.') : '（余熱で焼けすぎ）');
    if (r.luke && key !== 'cold') extra.push(EN || ZH ? t(' And lukewarm.') : '…ぬるい');
    if (r.wrongType) extra.push(EN || ZH ? t(' Wrong meat, too.') : '（頼んだ肉とちがう）');
    if (EN && extra.length && !/[.!?]$/.test(text)) text += '.'; // 英語：付け足しの前で文を切る
    if (ZH && extra.length && !/[。！？…]$/.test(text)) text += '。'; // 中国語も同じ
    return { key, face: FACE[key] || 'smile', text, extra: extra.join('') };
  }

  const YL = { CHAR_NAMES, BASE, CHAR, VIP, reactKey, line, FACE };
  if (typeof module !== 'undefined' && module.exports) module.exports = YL;
  else root.YL = YL;
})(typeof window !== 'undefined' ? window : globalThis);
