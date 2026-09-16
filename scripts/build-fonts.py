"""Embed the official Paperlogy font in the offline app.

Requires fonttools[woff] / brotli. The source ZIP and original OFL license
are kept in assets/fonts; conversion preserves every glyph and font metadata.
"""
from pathlib import Path
from io import BytesIO
import base64
import sys
import zipfile

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / '.cache/font-tools'))
from fontTools.ttLib import TTFont

font_dir = ROOT / 'assets/fonts'
license_text = (font_dir / 'OFL-license.txt').read_text(encoding='utf-8-sig')
rules = ['/* Paperlogy 1.001 — https://freesentation.blog/paperlogyfont\n' + license_text + '\n*/']
with zipfile.ZipFile(font_dir / 'Paperlogy-1.001.zip') as archive:
    for number, style in [(4, 'Regular'), (5, 'Medium'), (6, 'SemiBold'), (7, 'Bold'), (8, 'ExtraBold')]:
        name = f'Paperlogy-{number}{style}'
        font = TTFont(BytesIO(archive.read(name + '.ttf')))
        font.flavor = 'woff2'
        dest = font_dir / (name + '.woff2')
        font.save(dest)
        encoded = base64.b64encode(dest.read_bytes()).decode('ascii')
        rules.append(f'@font-face{{font-family:Paperlogy;font-style:normal;font-weight:{number * 100};font-display:swap;src:url(data:font/woff2;base64,{encoded}) format("woff2")}}')
        print(name, dest.stat().st_size, 'bytes')
rules.append('''
:root{--font-ui:"Paperlogy","Malgun Gothic","Apple SD Gothic Neo",sans-serif;font-family:var(--font-ui)}
body{font-family:var(--font-ui);letter-spacing:0}
button,input,select,textarea,code,pre,kbd,samp,.brand-mark,.panel-heading>span,.bonus-number{font-family:var(--font-ui)}
''')
(ROOT / 'dist/fonts.css').write_text('\n'.join(rules), encoding='utf-8')
