"""本番の index.html と gas/Code.gs から、模擬データ側つきのテスト用ページ tests/out/test.html を作る。
データはブラウザのメモリの中だけ（本番のスプレッドシートには一切触れない）。"""
import re, os, shutil
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(root, 'tests', 'out'); os.makedirs(out, exist_ok=True)
src = open(os.path.join(root, 'index.html'), encoding='utf-8').read()
gs = open(os.path.join(root, 'gas', 'Code.gs'), encoding='utf-8').read()
src = re.sub(r"const API_URL='[^']*';", "const API_URL='https://mock';", src)
src = src.replace('<script>\n', '<script src="shim.js"></script><script>\n' + gs + '\nsetup();\n</script><script>\n', 1)
open(os.path.join(out, 'test.html'), 'w', encoding='utf-8').write(src)
for f in ['shim.js', 'dummy.pdf']: shutil.copy(os.path.join(root, 'tests', f), out)
for f in ['logo.png', 'icon.png']: shutil.copy(os.path.join(root, f), out)
print(os.path.join(out, 'test.html'))
