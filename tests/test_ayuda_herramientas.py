import os as _os, sys as _sys, tempfile as _tf
_ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), '..'))
_HTML = 'file://' + _os.path.join(_ROOT, 'CuadroDeMando.html')
if len(_sys.argv) < 2: _sys.argv.append(_tf.mkdtemp(prefix='cdm-test-'))
import sys
from playwright.sync_api import sync_playwright
SC=sys.argv[1]; fails=[]; errs=[]
def ok(c,m):
    print(('PASS ' if c else 'FAIL ')+m)
    if not c: fails.append(m)
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1400,'height':900})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append('console:'+m.text) if m.type=='error' else None)
    U=_HTML
    pg.goto(U); pg.evaluate("localStorage.clear(); indexedDB.deleteDatabase('cdm-data'); 0"); pg.goto('about:blank'); pg.goto(U+'#devtools'); pg.wait_for_timeout(400)
    tools=pg.evaluate("Object.keys(DEV_HELP)")
    ok(len(tools)==11 and pg.locator('details.tool-help').count()==11,'ayuda en las 11 herramientas')
    ok(pg.is_visible('.tool-pane[data-pane=json] .tool-help-body'),'ayuda abierta por defecto')
    def ex(tool, i=0):
        pg.click(f'#toolTabs [data-tool={tool}]'); pg.click(f'.tool-pane[data-pane={tool}] [data-example="{i}"]'); pg.wait_for_timeout(450)
    ex('json'); ok('JSON válido' in pg.inner_text('#jxStatus'),'json: ejemplo')
    ex('json',1); ok('línea 4' in pg.inner_text('#jxStatus'),'json: ejemplo con error → '+pg.inner_text('#jxStatus'))
    ex('json',2); ok('XML bien formado' in pg.inner_text('#jxStatus'),'xml: ejemplo')
    ex('b64'); ok(pg.input_value('#b64Plain')=='usuario:contraseña','base64: ejemplo')
    ex('url'); ok(pg.input_value('#urlPlain').startswith('https://ejemplo.es/buscar?q=días hábiles') and 'tipo' in pg.inner_text('#urlParts'),'url: ejemplo')
    ex('jwt'); ok('Válido hasta' in pg.inner_text('#jwtClaims') and 'Ana Pérez' in pg.inner_text('#jwtBody'),'jwt: ejemplo')
    ex('hash'); ok('Coincide con SHA-256' in pg.inner_text('#hashOut'),'hash: ejemplo')
    ex('diff'); ok('+3' in pg.inner_text('#diffStats') and '−2' in pg.inner_text('#diffStats'),'diff: ejemplo → '+pg.inner_text('#diffStats'))
    ex('regex'); ok(pg.inner_text('#rxReplOut')=='Presentado el 2026-10-13, plazo hasta el 2026-10-26.','regex: fechas')
    ex('regex',1); ok('2 coincidencias' in pg.inner_text('#rxStatus'),'regex: correos → '+pg.inner_text('#rxStatus'))
    ex('uuid'); ok(len(pg.input_value('#uuidOut').split('\n'))==10,'uuid: ejemplo')
    ex('time'); ok('2025' in pg.inner_text('#epOut') and 'Epoch (s)' in pg.inner_text('#epDateOut'),'fechas: ejemplo')
    for i,(lbl,expect) in enumerate([('DNI','✓ Válido'),('Letra','NIF completo'),('NIE','✓ Válido'),('CIF','Organismo público'),('IBAN','✓ Válido'),('CCC','ES91 2100 0418 4502 0005 1332')]):
        ex('valid',i); ok(expect in pg.inner_text('#valOut'),'validador ejemplo '+lbl)
    ex('text'); pg.click('#txBtns [data-tx="12"]'); ok(pg.input_value('#txIn').count('Fecha de Presentación')==1,'texto: ejemplo + quitar duplicadas')
    pg.screenshot(path=SC+'/help_valid.png')
    pg.click('#toolTabs [data-tool=regex]'); pg.screenshot(path=SC+'/help_regex.png')
    # plegar en una → todas plegadas y se recuerda
    pg.click('.tool-pane[data-pane=regex] .tool-help > summary'); pg.wait_for_timeout(150)
    ok(pg.evaluate("$$('details.tool-help').every(d=>!d.open)"),'plegar una pliega todas')
    pg.reload(); pg.wait_for_timeout(400)
    ok(pg.evaluate("$$('details.tool-help').every(d=>!d.open)"),'se recuerda plegada al recargar')
    pg.click('.tool-pane.active .tool-help > summary'); pg.wait_for_timeout(150)
    ok(pg.evaluate("$$('details.tool-help').every(d=>d.open)"),'desplegar de nuevo')
    m=b.new_page(viewport={'width':390,'height':844}); m.goto(U+'#devtools'); m.wait_for_timeout(300)
    over=[]
    for t in tools:
        m.click(f'#toolTabs [data-tool={t}]'); m.wait_for_timeout(60)
        w=m.evaluate("document.documentElement.scrollWidth")
        if w>390: over.append((t,w))
    m.screenshot(path=SC+'/help_mobile.png')
    ok(not over,'móvil sin scroll horizontal '+str(over))
    print('ERRORS',errs); print('FAILS',fails)
    b.close()
