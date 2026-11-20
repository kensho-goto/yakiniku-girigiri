# ゲームサイトに出す版をつくる。使い方: python3 tools/build-portal.py
# ふつうの公開版との違い：数える仕組み・電波なし用・試遊会・貼ったときの絵の設定・アプリの設定なし
#   web（itch.io・ふりーむ!）… 自慢するボタンはそのまま
#   crazygames … サイトの道具（SDK）と src/portal.js を入れる。外の URL（自慢する・このゲームについて）は外す
# 出来上がり: dist/<名前>/ と dist/ju-<名前>.zip
import os, re, shutil, subprocess, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
SDK = '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>'
DROP_JS = {'count.js', 'playtest.js'}
try:
    ver = subprocess.run(['git', 'rev-parse', '--short', 'HEAD'], capture_output=True, text=True).stdout.strip() or 'portal'
except Exception:
    ver = 'portal'


def build(name, crazy):
    out = f'dist/{name}'
    zp = f'dist/ju-{name}.zip'
    if os.path.isdir(out):
        shutil.rmtree(out)
    os.makedirs(out + '/src')
    s = open('index.html', encoding='utf-8').read()

    def drop(pattern, need=True):
        nonlocal s
        s2, n = re.subn(pattern, '', s, flags=re.S)
        if need and n == 0:
            raise SystemExit('見つからない: ' + pattern)
        s = s2

    drop(r'<link rel="canonical"[^>]*>\s*')
    drop(r'<meta property="og:[^>]*>\s*')
    drop(r'<meta name="twitter:[^>]*>\s*')
    drop(r'<link rel="manifest"[^>]*>\s*')
    for js in DROP_JS:
        drop(r'<script src="src/' + re.escape(js) + r'[^"]*"></script>\s*')
    if crazy:
        if 'id="rShare">' not in s:
            raise SystemExit('自慢するボタンが見つからない')
        s = s.replace('id="rShare">', 'id="rShare" hidden>')  # 消すと main.js が困るので、隠すだけ
        drop(r'<a class="tiny about"[^>]*>[^<]*</a>\s*')
        first = s.index('<script src="src/')
        s = s[:first] + SDK + '\n<script src="src/portal.js?v=dev"></script>\n' + s[first:]
    else:
        drop(r'<a class="tiny about"[^>]*>[^<]*</a>\s*')  # 数える話が書いてあるので、ゲームサイト版には出さない
    s = s.replace('?v=dev', '?v=' + ver)
    open(out + '/index.html', 'w', encoding='utf-8').write(s)

    for f in sorted(os.listdir('src')):
        if f.endswith('.js') and f not in DROP_JS and (crazy or f != 'portal.js'):
            t = open('src/' + f, encoding='utf-8').read()
            if crazy and f == 'main.js':  # 自慢するボタンは外したので、行き先の URL も消す
                t = re.sub(r"'https://(kensho-goto\.github\.io/yakiniku-girigiri/|x\.com/intent/post\?text=)'", "''", t)
            open(out + '/src/' + f, 'w', encoding='utf-8').write(t)
    shutil.copytree('fonts', out + '/fonts')
    for f in ['icon-192.png', 'icon-512.png', 'icon-180.png']:
        shutil.copy(f, out + '/' + f)

    # ページが読むファイルがそろっているか
    for f in re.findall(r'(?:src|href)="((?:src|fonts)/[^"?]+|icon-[^"?]+)', s):
        if not os.path.exists(os.path.join(out, f)):
            raise SystemExit(f'ない: {f}')
    # 外の URL が残っていないか（CrazyGames の決まり：よその場所へ誘わない）
    if crazy:
        for dp, _, fs in os.walk(out):
            for f in fs:
                if f.endswith(('.html', '.js')):
                    t = open(os.path.join(dp, f), encoding='utf-8').read()
                    for u in re.findall(r'https?://[^\s"\'`)<]+', t):
                        if not re.match(r'https?://(sdk\.crazygames\.com|www\.w3\.org)', u):
                            raise SystemExit(f'外のURLが残っている: {f}: {u}')
    if os.path.exists(zp):
        os.remove(zp)
    with zipfile.ZipFile(zp, 'w', zipfile.ZIP_DEFLATED) as z:
        for dp, _, fs in os.walk(out):
            for f in fs:
                p = os.path.join(dp, f)
                z.write(p, os.path.relpath(p, out))
    n = sum(len(fs) for _, _, fs in os.walk(out))
    print(f'ok {zp}  {n} files  {os.path.getsize(zp) // 1024}KB  ver {ver}')


build('web', False)
build('crazygames', True)
