# ゲームサイトに出すときのメモ

## 出す版のつくり方
```
python3 tools/build-portal.py
```
- `dist/ju-web.zip`：itch.io・ふりーむ! に上げるもの（合言葉・数える仕組み・電波なし用・試遊会なし）
- `dist/ju-crazygames.zip`：CrazyGames に上げるもの（上に加えて、サイトの道具 SDK と `src/portal.js`）
- 絵：`docs/store/cover-*.png`（`node tools/ogp.js` → `SHOT_LANG=en node tools/ogp.js` → `node tools/store.js` で作り直せる）

## サイトごとの決まり
| サイト | 上げるもの | 絵 | 画面の大きさ |
|---|---|---|---|
| itch.io | `ju-web.zip`（HTML として遊べる、にチェック） | 表紙 630×500 | 埋めこみ 420×800・スマホ対応・全画面ボタンあり |
| ふりーむ! | `ju-web.zip`（ブラウザゲーム） | 表紙 630×500 を使う | スマホ対応 |
| CrazyGames | `ju-crazygames.zip` | 横 1920×1080・縦 800×1200・正方形 800×800（英語） | 縦長のゲーム（スマホ向け） |

## 載せる文（日本語）
- **名前**：ジュー
- **ひとこと**：早いと生、遅いと焦げ。焼肉屋の網をまかされる、焼き加減のクソゲー。
- **説明**：
  焼肉屋の網をまかされた。客は「こんがり」「レア」と好きな焼き加減を言ってくる。
  肉を網に置き、裏返し、ちょうどいいところで皿へ。早いと生、遅いと焦げ、待たせると客は帰る。
  強火・弱火の使い分け、皿の上でも進む余熱、たまに来る審査員。7つのステージをこえたら、道具なしの本番。
  ランクは肉の格付け（C〜特選A5）。焦がしすぎると「規格外」。
- **あそびかた**：肉をトレーから網へ指で運ぶ。タップで裏返す。網から皿へ、皿から客へ運んで出す。焦げた肉は×をタップで捨てる。
- **ジャンル**：アクション・料理・クソゲー

## 載せる文（英語）
- **Title**: JUU — the yakiniku doneness game
- **Short description**: Too early, raw. Too late, burnt. Run the grill at a tiny yakiniku shop and serve every order just right.
- **Description**:
  You've been handed the grill at a busy yakiniku joint. Every customer wants their meat a certain way — rare, just right, well done.
  Drag the meat onto the grill, flip it, and pull it at the perfect moment. Too early and it's raw. Too late and it's charcoal. Too slow and they walk out.
  Juggle hot and low fires, watch the carry-over heat on the plate, and win over the food critic when they show up.
  Clear 7 stages, then take on the real shift with no upgrades. Your rank is a beef grade, from C all the way up to Prime A5.
- **Controls**: Drag meat from the tray to the grill. Tap to flip. Drag to a plate, then to the customer. Tap the × to toss burnt meat. (Mouse works too.)
- **Tags（候補）**: cooking, food, time management, casual, funny, mobile
- **Age rating**: PEGI 3 相当（暴力・血の表現なし）

## 使っているもの（使ってよいかの確認済み）
- 字：Potta One・Yusei Magic（SIL Open Font License。`fonts/OFL-*.txt`）
- 絵はすべてプログラムで描いている・音はすべてその場で作っている（素材ファイルなし）
