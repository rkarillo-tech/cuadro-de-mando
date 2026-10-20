import os as _os, sys as _sys, tempfile as _tf, json
_ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), '..'))
_HTML = 'file://' + _os.path.join(_ROOT, 'CuadroDeMando.html')
if len(_sys.argv) < 2: _sys.argv.append(_tf.mkdtemp(prefix='cdm-test-'))
# Copias automáticas con fecha en una carpeta elegida por el usuario
from playwright.sync_api import sync_playwright
URL = _HTML
errs = []; fails = []
def ok(c, m):
    print(('PASS ' if c else 'FAIL ') + m, flush=True)
    if not c: fails.append(m)
def sin_avisos(pg):
    for _ in range(50):
        if pg.locator('.toast').count() == 0: return
        pg.wait_for_timeout(200)

MOCK = """
  window.__dir = { files: {} };
  window.__mkDir = () => ({
    name: 'Copias CDM',
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
    getFileHandle: async (n) => ({ name: n, createWritable: async () => ({ write: async t => { window.__pend = t; }, close: async () => { window.__dir.files[n] = window.__pend; } }) }),
    removeEntry: async n => { delete window.__dir.files[n]; },
    keys: async function* () { for (const k of Object.keys(window.__dir.files)) yield k; }
  });
  window.showDirectoryPicker = async () => window.__mkDir();
"""
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1300, 'height': 950})
    ctx.add_init_script(MOCK)
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
    pg.goto(URL); pg.wait_for_timeout(900)
    pg.evaluate("localStorage.clear(); indexedDB.deleteDatabase('cdm-data'); indexedDB.deleteDatabase('cdm-fs'); 0")
    pg.goto('about:blank'); pg.goto(URL); pg.wait_for_timeout(1200)
    files = lambda: sorted(pg.evaluate("Object.keys(__dir.files)"))

    pg.evaluate("createNote('Nota de prueba','<div>x</div>',false); showTab('settings'); 0"); pg.wait_for_timeout(500)
    ok('Sin carpeta' in pg.inner_text('#cpStatus') and pg.locator('#cpBtns [data-cp=choose]').count() == 1, 'sin configurar: ofrece elegir carpeta')
    ok(not pg.is_visible('#cpOpts'), 'las opciones no estorban hasta que hay carpeta')

    sin_avisos(pg)
    pg.click('#cpBtns [data-cp=choose]'); pg.wait_for_timeout(1400)
    ok(len(files()) == 1 and files()[0].startswith('cuadro-de-mando-') and files()[0].endswith('.json'), 'al elegir la carpeta hace la primera copia con fecha: ' + str(files()))
    r = pg.evaluate("(()=>{const k=Object.keys(__dir.files)[0]; const o=JSON.parse(__dir.files[k]); return [o.app, o.data.notes.some(n=>n.title==='Nota de prueba'), !!o.encrypted]})()")
    ok(r[0] == 'cuadro-de-mando' and r[1] is True and r[2] is False, 'la copia contiene los datos y, sin bloqueo, va sin cifrar')
    ok(pg.is_visible('#cpOpts') and pg.input_value('#cpEvery') == 'day' and pg.input_value('#cpKeep') == '10', 'por defecto: una al día, 10 copias')
    ok('Copias en «Copias CDM»' in pg.inner_text('#cpStatus') and '1 guardada' in pg.inner_text('#cpStatus'), 'el estado dice carpeta, frecuencia y cuántas hay')

    # ===== Rotación =====
    pg.evaluate("for (let i=1;i<=12;i++) __dir.files['cuadro-de-mando-2026-09-'+String(i).padStart(2,'0')+'.json']='{}'; 0")
    pg.fill('#cpKeep', '5'); pg.dispatch_event('#cpKeep', 'change'); pg.wait_for_timeout(1000)
    n = files()
    ok(len(n) == 5 and n[-1].startswith('cuadro-de-mando-2026-10'), 'conserva solo las N últimas y borra las más antiguas: ' + str(n))

    # ===== Copiar ahora =====
    pg.evaluate("createNote('Otra nota','<div>y</div>',false); 0"); pg.wait_for_timeout(300)
    sin_avisos(pg)
    pg.click('#cpBtns [data-cp=now]'); pg.wait_for_timeout(1500)
    ok(pg.evaluate("(()=>{const ks=Object.keys(__dir.files).sort(); const o=JSON.parse(__dir.files[ks[ks.length-1]]); return (o.data&&o.data.notes||[]).some(n=>n.title==='Otra nota')})()"), '«Copiar ahora» guarda el estado actual')

    # ===== Cuándo toca =====
    ok(pg.evaluate("(()=>{ cpSave({every:'day', last:Date.now()}); return cpDue() })()") is False, 'con «una vez al día» y copia reciente, no vuelve a copiar')
    ok(pg.evaluate("(()=>{ cpSave({every:'day', last:Date.now()-2*864e5}); return cpDue() })()") is True, 'pasado un día, toca copia')
    ok(pg.evaluate("(()=>{ cpSave({every:'week', last:Date.now()-2*864e5}); return cpDue() })()") is False, 'con «una vez a la semana», dos días no bastan')
    ok(pg.evaluate("(()=>{ cpSave({every:'open', last:Date.now()}); return cpDue() })()") is True, 'con «cada vez que abro», siempre toca')

    # ===== Al abrir la app, si toca, copia sola =====
    pg.evaluate("Object.keys(__dir.files).forEach(k=>delete __dir.files[k]); cpSave({every:'day', last:Date.now()-3*864e5}); 0")
    pg.evaluate("(async()=>{ await cpMaybe(); })(); 0"); pg.wait_for_timeout(1200)
    ok(len(files()) == 1, 'al arrancar hace la copia pendiente sin pedir nada')
    n0 = len(files())
    pg.evaluate("(async()=>{ await cpMaybe(); })(); 0"); pg.wait_for_timeout(800)
    ok(len(files()) == n0, 'y no la repite el mismo día')

    # ===== Con bloqueo, copias cifradas =====
    pg.evaluate("(async()=>{ await enableLock('contrasena-larga'); renderSettings(); })(); 0"); pg.wait_for_timeout(2600)
    pg.evaluate("(async()=>{ await cpRun({manual:true}); })(); 0"); pg.wait_for_timeout(1500)
    r = pg.evaluate("(()=>{const ks=Object.keys(__dir.files).sort(); const o=JSON.parse(__dir.files[ks[ks.length-1]]); return [!!o.encrypted, !!o.kdf, JSON.stringify(o).includes('Nota de prueba')]})()")
    ok(r[0] is True and r[1] is True and r[2] is False, 'con el bloqueo activado, la copia va cifrada y no se lee el contenido')
    ok('cifradas' in pg.inner_text('#cpStatus'), 'y el estado lo indica')
    pg.screenshot(path=_sys.argv[1] + '/copias.png')

    # ===== Desactivar =====
    sin_avisos(pg)
    pg.click('#cpBtns [data-cp=forget]'); pg.wait_for_timeout(400)
    pg.click('.modal-foot .btn.primary'); pg.wait_for_timeout(600)
    ok('Sin carpeta' in pg.inner_text('#cpStatus'), 'se puede desactivar')
    ok(len(files()) > 0, 'y las copias que ya estaban en la carpeta no se borran')

    print('ERRORS', [e for e in errs if 'Failed to load resource' not in e])
