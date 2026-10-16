"""Une las piezas de src/ en un único HTML autocontenido."""
import glob, os, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
out_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'CuadroDeMando.html')

tpl = open(os.path.join(SRC, 'index.html'), encoding='utf-8').read()
css = ''.join(open(f, encoding='utf-8').read() for f in sorted(glob.glob(os.path.join(SRC, '*.css'))))
views = ''.join(open(f, encoding='utf-8').read() for f in sorted(glob.glob(os.path.join(SRC, 'views', '*.html'))))
js_files = sorted(glob.glob(os.path.join(SRC, 'js', '*.js')))
js = "'use strict';\n" + ''.join(open(f, encoding='utf-8').read().rstrip() + '\n' for f in js_files)
assert '</script' not in js.lower(), 'El JS contiene </script>'
for token in ('/*CSS*/', '<!--VIEWS-->', '/*JS*/'):
    assert tpl.count(token) == 1, token
# Política de seguridad: solo puede ejecutarse ESTE script (por su huella SHA-256) y la página
# no puede conectarse a ningún sitio (connect-src 'none'), ni cargar imágenes, marcos o fuentes externas.
import hashlib, base64, re
assert tpl.count('<!--CSP-->') == 1, 'CSP'
html = tpl.replace('/*CSS*/', css).replace('<!--VIEWS-->', views).replace('/*JS*/', js)
scripts = re.findall(r'<script>(.*?)</script>', html, re.S)
assert len(scripts) == 1, 'Debe haber un único <script>'
sha = base64.b64encode(hashlib.sha256(scripts[0].encode('utf-8')).digest()).decode()
csp = ("default-src 'none'; script-src 'sha256-%s'; style-src 'unsafe-inline'; img-src data: blob:; "
       "connect-src 'none'; font-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; "
       "worker-src 'none'; manifest-src 'none'; base-uri 'none'; form-action 'none'") % sha
html = html.replace('<!--CSP-->', '<meta http-equiv="Content-Security-Policy" content="%s">' % csp)

# Versión y aviso de licencia (fuera del <script>, no afecta a la huella de la CSP)
import datetime
version = open(os.path.join(ROOT, 'VERSION'), encoding='utf-8').read().strip()
html = html.replace('{{VERSION}}', version)
notice = ('<!--\n  Cuadro de Mando v%s (%s)\n  Copyright (c) 2026 Rafael Karino Arillo (rkarillo-tech)\n'
          '  Licencia MIT: https://github.com/rkarillo-tech/cuadro-de-mando/blob/main/LICENSE\n'
          '  Código fuente y descargas: https://github.com/rkarillo-tech/cuadro-de-mando\n-->\n') % (version, datetime.date.today().isoformat())
assert html.startswith('<!DOCTYPE html>\n')
html = html.replace('<!DOCTYPE html>\n', '<!DOCTYPE html>\n' + notice, 1)

open(out_path, 'w', encoding='utf-8').write(html)
print(f'{out_path}: {len(html.encode("utf-8")) / 1024:.0f} KB, {html.count(chr(10))} líneas, {len(js_files)} módulos JS')
