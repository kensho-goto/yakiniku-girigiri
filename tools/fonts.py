"""字を、ゲームで使う字だけに切りつめて fonts/ に入れる。
  日本語と英語：Potta One（太い字）・Yusei Magic（手書きの字）
  中国語：站酷快乐体（ZCOOL KuaiLe）。太い字も手書きの字もこれ1つ
文言を変えて新しい字を使ったら、もう一度動かす：
  python3 -m venv /tmp/ft && /tmp/ft/bin/pip install fonttools brotli && /tmp/ft/bin/python tools/fonts.py
元の字（ttf）は Google Fonts の GitHub から取る（どれも OFL）。

どの字を入れるか：
  中国語の字 … src/zh.js・HTML の data-zh="…"（tools/store.html も）・jaen() の3つめに出てくる字
  日本語の字 … それ以外のすべて（src/*.js・*.html・play/*.html から、上の中国語の部分をのぞいたもの）
  記号・英数字はどちらにも入れる
"""
import glob, os, re, sys, urllib.request, tempfile
from fontTools import subset

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GF = 'https://raw.githubusercontent.com/google/fonts/main/ofl/'
JA = {
    'PottaOne': GF + 'pottaone/PottaOne-Regular.ttf',
    'YuseiMagic': GF + 'yuseimagic/YuseiMagic-Regular.ttf',
}
ZH = {
    'ZCOOLKuaiLe': GF + 'zcoolkuaile/ZCOOLKuaiLe-Regular.ttf',
}


def split_args(s, i):
    """s[i] は '(' の次。閉じかっこまでの引数を、いちばん外の , で分けて返す（文字列・テンプレート・かっこは数える）"""
    args, cur, depth, n = [], [], 0, len(s)
    while i < n:
        c = s[i]
        if c in '\'"':
            j = i + 1
            while s[j] != c:
                j += 2 if s[j] == '\\' else 1
            cur.append(s[i:j + 1]); i = j + 1; continue
        if c == '`':
            j, d = i + 1, 0
            while True:
                if s[j] == '\\': j += 2; continue
                if s.startswith('${', j): d += 1; j += 2; continue
                if s[j] == '}' and d: d -= 1; j += 1; continue
                if s[j] == '`' and not d: break
                if s[j] == '`':  # ${ } の中のテンプレート
                    k = j + 1
                    while s[k] != '`': k += 2 if s[k] == '\\' else 1
                    j = k + 1; continue
                j += 1
            cur.append(s[i:j + 1]); i = j + 1; continue
        if c in '([{': depth += 1
        elif c in ')]}':
            if depth == 0:
                args.append(''.join(cur)); return args
            depth -= 1
        elif c == ',' and depth == 0:
            args.append(''.join(cur)); cur = []; i += 1; continue
        cur.append(c); i += 1
    return args


def zh_parts(text):
    """中国語の部分（jaen() の3つめ・data-zh="…"）を取り出す"""
    parts = []
    for m in re.finditer(r'\bjaen\(', text):
        a = split_args(text, m.end())
        if len(a) >= 3:
            parts.append(a[2])
    parts += re.findall(r'data-zh="([^"]*)"', text)
    return parts


def is_cjk(c):
    o = ord(c)
    return 0x3040 <= o <= 0x30ff or 0x3400 <= o <= 0x9fff or 0xf900 <= o <= 0xfaff


def used_chars():
    ja, zh, every = set(), set(), set()
    for f in glob.glob(ROOT + '/src/*.js') + glob.glob(ROOT + '/*.html') + glob.glob(ROOT + '/play/*.html'):
        t = open(f, encoding='utf-8').read()
        every |= set(t)
        if os.path.basename(f) == 'zh.js':  # 表の中身だけ（日本語の説明 // … はのぞく）
            zh |= set(re.sub(r'^\s*//.*$', '', t, flags=re.M)); continue
        for p in zh_parts(t):
            zh |= set(p); t = t.replace(p, '')
        ja |= set(t)
    for p in zh_parts(open(ROOT + '/tools/store.html', encoding='utf-8').read()):  # ゲームサイトに載せる絵
        zh |= set(p)
    common = set(chr(c) for c in range(0x20, 0x7f))
    common |= set(chr(c) for c in range(0xff01, 0xff5f))   # 全角英数・記号
    common |= set(c for c in every if not is_cjk(c))       # ★ × − ① などの記号
    ja |= common | set(chr(c) for c in range(0x3000, 0x3100))  # 記号・ひらがな・カタカナ
    zh |= common | set(chr(c) for c in range(0x3000, 0x3040))  # 中国語の句読点・かっこ
    pick = lambda s: ''.join(sorted(c for c in s if c >= ' '))
    return pick(ja), pick(zh)


def make(name, url, text, tmp):
    ttf = os.path.join(tmp, name + '.ttf')
    urllib.request.urlretrieve(url, ttf)
    opt = subset.Options(); opt.flavor = 'woff2'; opt.layout_features = ['*']; opt.name_IDs = ['*']; opt.notdef_outline = True
    font = subset.load_font(ttf, opt)
    have = set(font.getBestCmap())
    sub = subset.Subsetter(opt); sub.populate(text=text); sub.subset(font)
    out = os.path.join(ROOT, 'fonts', name + '.woff2')
    subset.save_font(font, out, opt)
    print(name, os.path.getsize(out), 'bytes', len([c for c in text if ord(c) in have]), 'chars')
    return have


def main():
    ja, zh = used_chars()
    tmp = tempfile.mkdtemp()
    for name, url in JA.items():
        make(name, url, ja, tmp)
    for name, url in ZH.items():
        have = make(name, url, zh, tmp)
        miss = [c for c in zh if is_cjk(c) and ord(c) not in have and not ('぀' <= c <= 'ヿ')]
        if miss:  # 中国語の字にない漢字（日本語の字だけが混ざっている、など）
            print('  この字にない漢字:', ''.join(miss))


if __name__ == '__main__':
    sys.exit(main())
