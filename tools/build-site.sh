#!/usr/bin/env bash
# 公開するゲームのファイルだけを _site/ に集める。
# GitHub Pages（.github/workflows/pages.yml）と Cloudflare（npm run deploy:cf）の両方がこれを使う。
# 載せるファイルを足したときは、下の cp の行だけを直す。
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf _site
mkdir _site
cp -r index.html about.html sw.js ogp.png robots.txt manifest.json icon-180.png icon-192.png icon-512.png src play fonts _site/
V=${GITHUB_SHA:-$(git rev-parse HEAD)}
V=${V:0:7}
# macOS と Linux の両方で動く書き方（sed -i の違いを避ける）
perl -pi -e "s/\?v=dev/?v=$V/g" _site/index.html
perl -pi -e "s/\?v=dev/?v=$V/g; s/'ju-v1'/'ju-$V'/" _site/sw.js
# 載せ忘れを見つける：ページが読むファイルがすべてあるか
for f in $(grep -oE '(src|fonts)/[A-Za-z0-9_-]+[.](js|woff2)' _site/index.html _site/sw.js | cut -d: -f2 | sort -u) ogp.png about.html sw.js; do
  test -f "_site/$f" || { echo "ない: $f"; exit 1; }
done
echo "_site/ に集めました（版 ${V}）"
