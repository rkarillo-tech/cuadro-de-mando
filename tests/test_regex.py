import os as _os, sys as _sys, tempfile as _tf
_ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), '..'))
_HTML = 'file://' + _os.path.join(_ROOT, 'CuadroDeMando.html')
if len(_sys.argv) < 2: _sys.argv.append(_tf.mkdtemp(prefix='cdm-test-'))
import sys, json, subprocess, re as pyre
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
    pg.click('#toolTabs [data-tool=regex]')
    # 1. El analizador coincide con el motor del navegador
    pats=[r'^\d{8}[A-Z]$', r'(\d{2})/(\d{2})/(\d{4})', r'a|b|', r'(?<año>\d{4})-\k<año>', r'[^\s,;]+', r'\bpalabra\b', r'(?:ab)+?c*?', r'x{2,}y{0,1}', r'[\]\\-]', r'(?=.*\d)(?!.*x)(?<=a)(?<!b)', r'á\x41\n\t', r'[a-zA-Z0-9._%+-]+@', r'(a)(b)\2\1', r'^$', r'\.', r'[-a]', r'[a-]', r'\/', r'\p{L}+',
          r'(', r')', r'[a-z', r'a**', r'*a', r'a{3,2}', r'(?<1x>a)', r'\\', '\\', r'[z-a]', r'(?<n>a)(?<n>b)', r'a{2}{3}', r'(?P<x>a)']
    res=pg.evaluate("""ps=>ps.map(p=>{let mine=true,nat=true;try{rxParse(p)}catch(e){mine=false}try{new RegExp(p,'u'.includes('')&&/\\\\p\\{/.test(p)?'u':'')}catch(e){nat=false}return [p,mine,nat]})""", pats)
    mism=[r for r in res if r[1]!=r[2]]
    ok(not mism,'analizador = motor del navegador en %d patrones %s'%(len(pats),mism))
    # 2. Explicación
    pg.fill('#rxPat', r'^(\d{2})/(\d{2})/(?<año>\d{4})$'); pg.wait_for_timeout(250)
    pg.click('#rxTabs [data-rt=explain]')
    ex=pg.inner_text('#rxExplain')
    ok('Grupo 1' in ex and 'exactamente 2 veces' in ex and 'Grupo 3 «año»' in ex and 'inicio del texto' in ex and 'el carácter «/»' in ex,'explicación pieza a pieza')
    ok('Valida el texto completo' in pg.inner_text('#rxSummary') and 'dígito ×2' in pg.inner_text('#rxSummary'),'resumen: '+pg.inner_text('#rxSummary'))
    pg.hover('#rxExplain .rx-row:nth-child(3)'); ok(pg.locator('#rxView span.hl').count()>0,'pasar el ratón por una fila resalta el patrón')
    ok('dígito' in (pg.get_attribute('#rxView span[data-i="2"]','title') or ''),'texto emergente al pasar por el patrón')
    pg.fill('#rxPat', r'www.boe.es|(a+)+'); pg.wait_for_timeout(250)
    w=pg.inner_text('#rxWarnings')
    ok('www.boe' in w and 'backtracking' in w and 'Sin ^' in w,'avisos: punto sin escapar, backtracking y anclas')
    pg.fill('#rxPat', r'(\d{2}'); pg.wait_for_timeout(250)
    ok('Falta cerrar este paréntesis' in pg.inner_text('#rxExplain') and pg.locator('#rxView .t-err').count()==1,'error localizado y marcado en el patrón')
    pg.fill('#rxPat', r'^\w+[A-z]$'); pg.wait_for_timeout(250); w=pg.inner_text('#rxWarnings')
    ok('tilde' in w and '[A-Za-z]' in w,'avisos de \\w sin tildes y [A-z]')
    # 3. Construir con bloques
    pg.click('#rxClear'); pg.click('#rxTabs [data-rt=build]')
    def blk(label): pg.locator('.rx-blk', has_text=label).first.click()
    blk('Dígito'); pg.fill('#rxQMin','8'); pg.fill('#rxQMax','8'); pg.click('#rxQIns'); blk('Mayúscula'); blk('Todo el texto')
    ok(pg.input_value('#rxPat')==r'^\d{8}[A-Z]$','construir ^\\d{8}[A-Z]$ con bloques → '+pg.input_value('#rxPat'))
    pg.click('#rxUndo'); ok(pg.input_value('#rxPat')==r'\d{8}[A-Z]','deshacer')
    pg.evaluate("const i=$('#rxPat'); i.focus(); i.setSelectionRange(0,5); rxSel={s:0,e:5}")
    blk('Grupo sin captura'); ok(pg.input_value('#rxPat')==r'(?:\d{8})[A-Z]','envolver selección en grupo → '+pg.input_value('#rxPat'))
    pg.fill('#rxLit','www.boe.es'); ok('www\\.boe\\.es' in pg.inner_text('#rxLitPrev'),'literal escapado')
    pg.click('#rxLitIns'); ok(r'www\.boe\.es' in pg.input_value('#rxPat'),'insertar literal en el cursor → '+pg.input_value('#rxPat'))
    pg.click('#rxSetOpts [data-set="0-9"]'); pg.check('#rxSetNeg'); ok(pg.inner_text('#rxSetPrev')=='[^a-zA-Z0-9]','conjunto a medida: '+pg.inner_text('#rxSetPrev'))
    # 4. Desde ejemplos
    pg.click('#rxTabs [data-rt=infer]')
    def infer(pos,neg='',mode='exact'):
        pg.click(f'#rxInfMode [data-m={mode}]'); pg.fill('#rxInfPos',pos); pg.fill('#rxInfNeg',neg); pg.evaluate('rxInfer()'); return pg.evaluate('rxInfResult')
    r=infer('12345678Z\n87654321X'); ok(r==r'^\d{8}[A-Z]$','DNI → '+r)
    r=infer('2026/0042\n2025/1234\n2024/7','26/0042'); ok(r==r'^\d{4}/\d{1,4}$' and '✗ coincide' not in pg.inner_text('#rxInfOut'),'expedientes → '+r)
    r=infer('ES91 2100 0418 4502 0005 1332\nES12 0049 1500 0512 3456 7892'); ok(r==r'^ES\d{2} \d{4} \d{4} \d{4} \d{4} \d{4}$','IBAN con prefijo fijo → '+r)
    r=infer('Ana\nmaría\nJOSÉ'); ok(r=='^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,5}$','mayúsculas/minúsculas unificadas → '+r)
    r=infer('09:30\n23:59','',mode='loose'); ok(r==r'^\d+:\d+$','modo flexible → '+r)
    r=infer('abc\n12-x'); ok(r.startswith('^(?:') ,'estructuras distintas → alternativa literal: '+r)
    infer('2026/0042\n2025/1234'); pg.click('#rxInfUse'); pg.wait_for_timeout(150)
    ok(pg.evaluate('rxTab')=='test' and pg.input_value('#rxPat')==r'^\d{4}/\d{4}$' and '2 de 2 líneas' in pg.inner_text('#rxLines'),'usar patrón propuesto → pestaña Probar validando por línea')
    # 5. Biblioteca: cada patrón contra su muestra
    expect={'DNI / NIF (formato)':['12345678Z','87654321X'],'NIE':['X1234567L','Y7654321G'],'CIF / NIF de entidad':['B12345674','Q2826000H'],'Referencia catastral (urbana)':['9872023VH5797S0001WX'],
      'Correo electrónico':['ana.perez@ejemplo.es','soporte+web@ayto-ejemplo.org'],'Teléfono español':['+34 612 345 678','912345678','0034 712345678'],'Código postal':['28931','08001'],
      'Fecha dd/mm/aaaa':['13/10/2026','31/12/2025'],'Fecha ISO aaaa-mm-dd':['2026-10-13'],'Hora hh:mm (24 h)':['09:30','23:59'],'URL http(s)':['https://www.boe.es/buscar','http://localhost:8080/app','https://sede.ejemplo.gob.es:8443/tramite?id=7'] ,
      'Dirección IPv4':['192.168.1.10','8.8.8.8'],'Color hexadecimal':['#fff','#8b7cf6'],'Contraseña robusta':['Hola123!Mundo$'],'Matrícula de coche':['1234 BCD','1234BCD'],'Líneas vacías':['','   ']}
    lib=pg.evaluate("RX_LIB.map(x=>({name:x.name,pat:x.pat,flags:x.flags,sample:x.sample}))")
    for x in lib:
        if x['name'] not in expect: continue
        got=pg.evaluate("""x=>{const re=new RegExp(x.pat,x.flags.replace(/[gm]/g,'')); return x.sample.split('\\n').filter(l=>re.test(l))}""", x)
        ok(got==expect[x['name']], f"biblioteca «{x['name']}» → {got}")
    def finds(name):
        x=[e for e in lib if e['name']==name][0]
        return pg.evaluate("x=>[...x.sample.matchAll(new RegExp(x.pat,x.flags))].map(m=>m[0])", x)
    ok(finds('Importe en euros')==['1.250,50 €','30 €','12,5€'],'importes: '+str(finds('Importe en euros')))
    ok(finds('Nº de expediente aaaa/nnnn')==['2026/0042','2025/1234'],'expedientes en texto')
    ok(finds('Palabra repetida')==['es es','de de','el el'],'palabras repetidas: '+str(finds('Palabra repetida')))
    pg.click('#rxTabs [data-rt=library]'); pg.fill('#rxLibSearch','iban'); pg.wait_for_timeout(200)
    pg.fill('#rxLibSearch','fecha'); pg.wait_for_timeout(200)
    pg.locator('.rx-lib-card', has_text='Fecha dd/mm/aaaa').locator('[data-go=test]').click(); pg.wait_for_timeout(200)
    ok(pg.evaluate('rxTab')=='test' and pg.input_value('#rxRepl')=='$3-$2-$1' and '2 de 4 líneas' in pg.inner_text('#rxLines'),'«Probar» desde la biblioteca')
    # 6. Código: se ejecuta de verdad
    pg.evaluate("rxSetPattern('(\\\\d{2})/(\\\\d{2})/(\\\\d{4})','g')"); pg.fill('#rxRepl','$3-$2-$1'); pg.fill('#rxText','Plazo: 13/10/2026 y 26/10/2026'); pg.wait_for_timeout(200)
    pg.click('#rxTabs [data-rt=code]'); pg.click('#rxCodeMode [data-m=replace]'); pg.wait_for_timeout(100)
    codes={c.locator('b').inner_text(): c.locator('pre').inner_text() for c in pg.locator('.rx-code-card').all()}
    ok(set(codes)=={'JavaScript','Java','Python','C#','PHP','SQL · PostgreSQL','SQL · Oracle'},'7 lenguajes')
    py=codes['Python']+"\nprint(resultado)\n"; py='texto = "Plazo: 13/10/2026 y 26/10/2026"\n'+py
    out=subprocess.run(['python3','-I','-c',py],capture_output=True,text=True).stdout.strip()
    ok(out=='Plazo: 2026-10-13 y 2026-10-26','código Python ejecutado → '+out)
    js='const texto="Plazo: 13/10/2026 y 26/10/2026";\n'+codes['JavaScript']+'\nconsole.log(resultado);'
    out=subprocess.run(['node','-e',js],capture_output=True,text=True).stdout.strip()
    ok(out=='Plazo: 2026-10-13 y 2026-10-26','código JavaScript ejecutado → '+out)
    ok("'\\3-\\2-\\1'" in codes['SQL · PostgreSQL'] and 'replaceAll("$3-$2-$1")' in codes['Java'],'SQL usa \\1 y Java $1')
    pg.evaluate("rxSetPattern('^(?<usuario>[\\\\w.]+)@(?<dom>[\\\\w.]+)/x$','i')"); pg.click('#rxCodeMode [data-m=test]'); pg.wait_for_timeout(100)
    codes={c.locator('b').inner_text(): c.locator('pre').inner_text() for c in pg.locator('.rx-code-card').all()}
    ok('(?P<usuario>' in codes['Python'] and 'grupos con nombre' in pg.inner_text('#rxCode'),'Python convierte grupos con nombre y avisa para SQL')
    ok('\\/x$/i' in codes['JavaScript'],'JS escapa la barra: '+codes['JavaScript'].split('\n')[0])
    for t,sample,exp in [('ana.p@ej.es/x',True),('nada',False)][:0]: pass
    for val,exp in [('ana.p@ej.es/x',True),('nada',False)]:
        py=f'texto = {json.dumps(val)}\n'+codes['Python']+'\nprint(ok)\n'
        out=subprocess.run(['python3','-I','-c',py],capture_output=True,text=True)
        ok(out.stdout.strip()==str(exp),f'Python ¿coincide? {val} → {out.stdout.strip()} {out.stderr[-200:]}')
    pg.evaluate("rxSetPattern('\\\\bde\\\\b','g')"); pg.wait_for_timeout(100)
    ok("\\yde\\y" in pg.inner_text('#rxCode'),'PostgreSQL convierte \\b en \\y')
    # 7. Ayuda y ejemplos de la ayuda
    for i in range(4):
        pg.click(f'.tool-pane[data-pane=regex] .tool-help [data-example="{i}"]'); pg.wait_for_timeout(350)
    ok(pg.evaluate('rxTab')=='infer' and pg.evaluate('rxInfResult')==r'^\d{4}/\d{1,4}$','ejemplos de la ayuda funcionan')
    pg.click('#rxTabs [data-rt=explain]'); pg.evaluate("rxSetPattern('^(?=.*[a-z])(?=.*\\\\d).{8,}$|^admin$','gm')"); pg.wait_for_timeout(200)
    pg.screenshot(path=SC+'/rx_explain.png', full_page=True)
    pg.click('#rxTabs [data-rt=build]'); pg.screenshot(path=SC+'/rx_build.png', full_page=True)
    pg.click('#rxTabs [data-rt=infer]'); pg.screenshot(path=SC+'/rx_infer.png', full_page=True)
    pg.click('#rxTabs [data-rt=library]'); pg.fill('#rxLibSearch',''); pg.wait_for_timeout(150); pg.screenshot(path=SC+'/rx_lib.png')
    pg.click('#rxTabs [data-rt=code]'); pg.screenshot(path=SC+'/rx_code.png', full_page=True)
    pg.reload(); pg.wait_for_timeout(400); ok(pg.evaluate('rxTab')=='code','recuerda la pestaña')
    m=b.new_page(viewport={'width':390,'height':844}); m.goto(U+'#devtools'); m.wait_for_timeout(300); m.click('#toolTabs [data-tool=regex]')
    over=[]
    for t in ['test','explain','build','infer','library','code']:
        m.click(f'#rxTabs [data-rt={t}]'); m.wait_for_timeout(80); w=m.evaluate('document.documentElement.scrollWidth')
        if w>390: over.append((t,w))
    ok(not over,'móvil sin desbordes '+str(over)); m.screenshot(path=SC+'/rx_mobile.png')
    print('ERRORS',errs); print('FAILS',len(fails),fails)
    b.close()
