"""字（Potta One・Yusei Magic）を、ゲームで使う字だけに切りつめて fonts/ に入れる。
文言を変えて新しい漢字を使ったら、もう一度動かす：
  python3 -m venv /tmp/ft && /tmp/ft/bin/pip install fonttools brotli && /tmp/ft/bin/python tools/fonts.py
元の字（ttf）は Google Fonts の GitHub から取る（どちらも OFL）。
"""
import glob, os, sys, urllib.request, tempfile
from fontTools import subset

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = {
    'PottaOne': 'https://raw.githubusercontent.com/google/fonts/main/ofl/pottaone/PottaOne-Regular.ttf',
    'YuseiMagic': 'https://raw.githubusercontent.com/google/fonts/main/ofl/yuseimagic/YuseiMagic-Regular.ttf',
}

def used_chars():
    chars = set()
    for f in glob.glob(ROOT + '/src/*.js') + glob.glob(ROOT + '/*.html') + glob.glob(ROOT + '/play/*.html'):
        chars |= set(open(f, encoding='utf-8').read())
    chars |= set(chr(c) for c in range(0x20, 0x7f))
    chars |= set(chr(c) for c in range(0x3000, 0x3100))   # 記号・ひらがな・カタカナ
    chars |= set(chr(c) for c in range(0xff01, 0xff5f))   # 全角英数・記号
    return ''.join(sorted(c for c in chars if c >= ' '))

def main():
    text = used_chars()
    tmp = tempfile.mkdtemp()
    for name, url in SRC.items():
        ttf = os.path.join(tmp, name + '.ttf')
        urllib.request.urlretrieve(url, ttf)
        opt = subset.Options(); opt.flavor = 'woff2'; opt.layout_features = ['*']; opt.name_IDs = ['*']; opt.notdef_outline = True
        font = subset.load_font(ttf, opt)
        sub = subset.Subsetter(opt); sub.populate(text=text); sub.subset(font)
        out = os.path.join(ROOT, 'fonts', name + '.woff2')
        subset.save_font(font, out, opt)
        print(name, os.path.getsize(out), 'bytes')

if __name__ == '__main__':
    sys.exit(main())
