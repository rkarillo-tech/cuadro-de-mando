import os as _os, sys as _sys, tempfile as _tf, json
_ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), '..'))
_HTML = 'file://' + _os.path.join(_ROOT, 'CuadroDeMando.html')
if len(_sys.argv) < 2: _sys.argv.append(_tf.mkdtemp(prefix='cdm-test-'))
# Dos dispositivos vinculados al mismo archivo (como Drive en dos portátiles):
# los cambios tienen que llegar y la sincronización tiene que PARAR cuando ya están iguales.
from playwright.sync_api import sync_playwright
URL = _HTML
errs = []; fails = []
def ok(c, m):
    print(('PASS ' if c else 'FAIL ') + m, flush=True)
    if not c: fails.append(m)

FILE = {'txt': '', 'm': 1000}
WRITES = []
# El archivo compartido vive en Python; cada navegador lo ve a través de un «fsHandle» simulado.
INIT = """
  addEventListener('load', () => { try { window.__reloads = (+sessionStorage.getItem('rl') || 0) + 1; sessionStorage.setItem('rl', window.__reloads); } catch (e) { window.__reloads = 1; } });
  setInterval(async () => {
    try { if (typeof fsState === 'undefined' || !APP_READY || fsHandle || window.__busy) return; } catch (e) { return; }
    window.__busy = 1;
    fsHandle = { name: 'cdm.json',
      getFile: async () => { const f = JSON.parse(await window.__rd()); return { lastModified: f.m, text: async () => f.txt }; },
      createWritable: async () => ({ write: async t => { window.__pend = t; }, close: async () => { await window.__wr(window.__pend); } }),
      queryPermission: async () => 'granted', requestPermission: async () => 'granted' };
    fsState = 'ok';
    try { fsSeenMtime = +(await idbGet('seenMtime')) || 0; fsSeenLc = +(await idbGet('seenLc')) || 0; } catch (e) {}
    if (fsSeenLc) await fsCheckNewer();     // lo que hace la aplicación al arrancar
    window.__busy = 0;
  }, 60);
"""
with sync_playwright() as p:
    b = p.chromium.launch()
    def device(name):
        ctx = b.new_context(viewport={'width': 1200, 'height': 800})
        ctx.expose_function('__rd', lambda: json.dumps(FILE))
        def wr(txt):
            FILE['txt'] = txt; FILE['m'] += 1
            WRITES.append((name, json.loads(txt).get('lastChange')))
            return FILE['m']
        ctx.expose_function('__wr', wr)
        ctx.add_init_script(INIT)
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errs.append(name + ' PAGEERR ' + str(e)))
        pg.goto(URL); pg.wait_for_timeout(1400)
        return pg
    def check(*pgs):
        for pg in pgs:
            pg.evaluate("(async()=>{ if (await fsExternallyChanged()) await fsCheckNewer(true); else await fsSyncNow(); })(); 0")
            pg.wait_for_timeout(1800)
    def dialogs(pgs):
        n = 0
        for pg in pgs:
            if pg.is_visible('#modal'): n += 1; pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        return n
    titles = lambda pg: sorted(pg.evaluate("S.notes.map(n=>n.title)"))

    A = device('A'); B = device('B')
    # ===== Huella de contenido =====
    r = A.evaluate("""()=>{
      const x={lastChange:1, notes:[{id:'a',title:'A',_m:10},{id:'b',title:'B',_m:20}], prefs:{p:1}, tombstones:{'notes:z':5}};
      const y={lastChange:999, notes:[{id:'b',title:'B',_m:77},{id:'a',title:'A',_m:88}], prefs:{p:1}, tombstones:{'notes:z':9}, lastTab:'notes'};
      const z=JSON.parse(JSON.stringify(x)); z.notes[0].title='Otro';
      return [sameData(x,y), sameData(x,z)]}""")
    ok(r == [True, False], 'dos versiones con el mismo contenido se reconocen iguales aunque cambien el orden, las fechas internas y la pestaña abierta')

    # ===== Vincular un segundo dispositivo =====
    A.evaluate("createNote('Nota de A','<div>a</div>',false); fsWrite(); 0"); A.wait_for_timeout(800)
    ok(len(WRITES) == 1 and 'Nota de A' in [n['title'] for n in json.loads(FILE['txt'])['data']['notes']], 'el primer dispositivo guarda en el archivo')
    B.evaluate("fsCheckNewer(true); 0"); B.wait_for_timeout(1500)
    ok(B.is_visible('#modal'), 'al vincular el segundo dispositivo, pregunta qué hacer')
    B.click('.modal-foot .btn.primary'); B.wait_for_timeout(3200)
    ok(titles(B) == ['Bienvenida', 'Nota de A'], 'combina sin duplicar la nota de bienvenida: ' + str(titles(B)))

    # ===== Ya están iguales: la sincronización se para (no hay bucle) =====
    n0 = len(WRITES); extra = 0
    for _ in range(4):
        check(A, B); extra += dialogs([A, B])
    ok(len(WRITES) == n0, f'con los dos dispositivos iguales no se reescribe el archivo una y otra vez (escrituras extra: {len(WRITES) - n0})')
    ok(extra == 0, 'y no vuelve a preguntar nada')
    ok('Al día' in A.inner_text('#syncPill') and 'Al día' in B.inner_text('#syncPill'), 'los dos marcan «Al día»')

    # ===== Un cambio real sigue llegando =====
    n0 = len(WRITES)
    A.evaluate("createNote('Nueva en A','<div>n</div>',false); 0"); A.wait_for_timeout(2500)
    for _ in range(3): check(B, A)
    ok('Nueva en A' in titles(B), 'lo que se crea en un dispositivo llega al otro')
    ok(len(WRITES) - n0 <= 3, f'y se escribe lo justo, sin encadenar escrituras ({len(WRITES) - n0})')

    # ===== Cambios a la vez en los dos: se juntan y se para =====
    n0 = len(WRITES)
    A.evaluate("createNote('Desde A','<div>a</div>',false); 0")
    B.evaluate("createNote('Desde B','<div>b</div>',false); 0")
    A.wait_for_timeout(2500); B.wait_for_timeout(2500)
    for _ in range(8):
        check(A, B); dialogs([A, B])
        if 'Desde B' in titles(A) and 'Desde A' in titles(B): break
    ok(titles(A) == titles(B) and 'Desde A' in titles(A) and 'Desde B' in titles(A), 'con cambios en los dos sitios, ambos acaban con todo: ' + str(titles(A)))
    ok(len(WRITES) - n0 <= 4, f'y la sincronización termina en pocas escrituras ({len(WRITES) - n0})')
    n0 = len(WRITES)
    for _ in range(3): check(A, B)
    ok(len(WRITES) == n0, 'después de juntarlo todo, deja de escribir')
    # ===== Cortafuegos contra recargas encadenadas =====
    r = A.evaluate("()=>{ syncLoopReset(); return [syncLoopOk(),syncLoopOk(),syncLoopOk(),syncLoopOk(),syncLoopOk(),syncLoopOk()] }")
    ok(r[:4] == [True] * 4 and r[4] is False, 'si la sincronización automática se repitiera sin parar, se corta sola: ' + str(r))
    ok(A.evaluate("()=>{ syncLoopReset(); return syncLoopOk() }") is True, 'y al revisarlo a mano vuelve a empezar')
    A.screenshot(path=_sys.argv[1] + '/sync_dos_equipos.png')

    # ===== Bloqueo con contraseña y archivo compartido =====
    CLAVE = 'contrasena-larga'
    enc = lambda: bool(json.loads(FILE['txt']).get('encrypted'))
    A.evaluate("(async()=>{ await enableLock('%s'); touchData(); renderSettings(); fileSyncSchedule(); })(); 0" % CLAVE)
    A.wait_for_timeout(2600)
    ok(enc(), 'al activar el bloqueo, el archivo pasa a guardarse cifrado')
    ok(B.evaluate("fsExternallyChanged()") is True, 'el otro equipo se entera de que el archivo ha cambiado')
    B.evaluate("fsSyncNow(); 0"); B.wait_for_timeout(1600)
    ok(B.is_visible('#modal') and 'cifrad' in B.inner_text('#modal'), 'y le pide la contraseña del archivo')
    B.fill('#modal input[type=password]', CLAVE); B.click('.modal-foot .btn.primary'); B.wait_for_timeout(1400)
    ok(B.is_visible('#modal') and 'bloqueo' in B.inner_text('#modal'), 'tras acertarla, ofrece activar el bloqueo también en este equipo')
    B.click('.modal-foot .btn.primary'); B.wait_for_timeout(2600)
    ok(B.evaluate("lockEnabled()") is True and B.evaluate("CRYPT && CRYPT.salt") == json.loads(FILE['txt'])['kdf']['salt'], 'queda bloqueado con la misma clave que el archivo (así no la pide cada vez)')
    n0 = len(WRITES)
    B.evaluate("createNote('Cifrada en B','<div>b</div>',false); 0"); B.wait_for_timeout(2800)
    ok(enc() and len(WRITES) > n0, 'y lo que guarda el segundo equipo sigue yendo cifrado')
    A.evaluate("(async()=>{ if (await fsExternallyChanged()) await fsCheckNewer(true); })(); 0"); A.wait_for_timeout(3000)
    ok(not A.is_visible('#modal'), 'el primer equipo recibe los cambios sin volver a pedir la contraseña')
    A.wait_for_timeout(1200)
    if A.is_visible('#lockScreen'):
        A.fill('#lockPass', CLAVE); A.keyboard.press('Enter'); A.wait_for_timeout(2200)
    ok('Cifrada en B' in titles(A), 'y los recibe bien: ' + str(titles(A)))

    # ===== Un equipo sin bloqueo no deja el archivo sin cifrar =====
    C = device('C')
    C.evaluate("createNote('Nota de C','<div>c</div>',false); 0"); C.wait_for_timeout(700)
    C.evaluate("(async()=>{ fsSeenMtime=1; fsSeenLc=1; await fsCheckNewer(true); })(); 0"); C.wait_for_timeout(2000)
    ok(C.is_visible('#modal'), 'un equipo nuevo sin bloqueo pide la contraseña del archivo cifrado')
    C.fill('#modal input[type=password]', CLAVE); C.click('.modal-foot .btn.primary'); C.wait_for_timeout(1400)
    C.click('.modal-foot .btn.ghost'); C.wait_for_timeout(2000)       # dice que no al bloqueo
    if C.is_visible('#modal'): C.keyboard.press('Escape'); C.wait_for_timeout(300)
    n0 = len(WRITES)
    C.evaluate("createNote('Otra de C','<div>c</div>',false); 0"); C.wait_for_timeout(3000)
    ok(enc() and len(WRITES) == n0, 'si no activa el bloqueo, NO escribe en el archivo ni lo deja sin cifrar')
    ok(C.evaluate("fsState") == 'enc' and 'cifrado' in C.inner_text('#syncPill'), 'el semáforo avisa: «Archivo cifrado»: ' + C.inner_text('#syncPill'))
    C.screenshot(path=_sys.argv[1] + '/sync_cifrado.png')
    C.click('#syncPill'); C.wait_for_timeout(1500)
    ok(C.is_visible('#modal'), 'pulsando el semáforo se puede introducir la contraseña')
    C.fill('#modal input[type=password]', CLAVE); C.click('.modal-foot .btn.primary'); C.wait_for_timeout(3000)
    ok(C.evaluate("lockEnabled()") is True, 'y entonces sí queda bloqueado')
    C.wait_for_timeout(2500)
    ok(enc(), 'el archivo sigue cifrado en todo momento')

    # ===== Llega lo del otro equipo sin recargar la pestaña (y sin volver a pedir la contraseña) =====
    r0 = B.evaluate("window.__reloads")
    B.evaluate("showTab('todos'); 0"); B.wait_for_timeout(400)
    A.evaluate("createNote('Sin recargar','<div>x</div>',false); 0"); A.wait_for_timeout(2600)
    n0 = len(WRITES)
    B.evaluate("(async()=>{ if (await fsExternallyChanged()) await fsCheckNewer(true); })(); 0"); B.wait_for_timeout(3200)
    ok(B.evaluate("window.__reloads") == r0 and not B.is_visible('#lockScreen'), 'al combinar no se recarga la pestaña, así que el bloqueo no vuelve a pedir la contraseña')
    ok('Sin recargar' in titles(B) and B.evaluate("currentTab") == 'todos', 'llegan los cambios y se sigue en la misma pestaña')
    ok(len(WRITES) == n0, 'y refrescar no provoca escrituras en el archivo')
    ok('Sincronizado' in B.inner_text('body'), 'avisa de lo que ha llegado')

    # ===== Se puede escribir mientras llega una sincronización =====
    B.evaluate("showTab('notes'); openNote(S.notes.find(n=>n.title==='Bienvenida').id); 0"); B.wait_for_timeout(500)
    B.click('#editor'); B.keyboard.press('Control+End'); B.keyboard.type('escribiendo aqui'); B.wait_for_timeout(300)
    A.evaluate("createNote('Mientras escribo','<div>x</div>',false); 0"); A.wait_for_timeout(2600)
    B.evaluate("(async()=>{ if (await fsExternallyChanged()) await fsCheckNewer(true); })(); 0"); B.wait_for_timeout(3200)
    ok('escribiendo aqui' in B.inner_text('#editor') and B.evaluate("document.activeElement && document.activeElement.id") == 'editor', 'no se pierde lo que estabas escribiendo ni el cursor')
    ok('Mientras escribo' in titles(B), 'y aun así llega lo del otro equipo')

    # ===== Botón de bloquear y pantalla de bloqueo =====
    ok(B.is_visible('#lockNowBtn') and 'Bloquear' in B.inner_text('#lockNowBtn'), 'con el bloqueo activado hay un botón «Bloquear» arriba')
    B.click('#lockNowBtn'); B.wait_for_timeout(2600)
    ok(B.is_visible('#lockScreen'), 'y bloquea la aplicación al momento')
    B.click('#lockForgot'); B.wait_for_timeout(700)
    caja = B.evaluate("()=>{const b=[...document.querySelectorAll('.modal-foot button')].pop(); const r=b.getBoundingClientRect(); return [r.x+r.width/2, r.y+r.height/2];}")
    encima = B.evaluate("([x,y])=>{const e=document.elementFromPoint(x,y); return e ? (e.id || String(e.className) || e.tagName) : 'nada'}", caja)
    ok('btn' in encima, '«¿Has olvidado la contraseña?» se ve por encima de la pantalla de bloqueo y se puede pulsar: ' + str(encima))
    B.screenshot(path=_sys.argv[1] + '/olvido_contrasena.png')
    B.keyboard.press('Escape'); B.wait_for_timeout(300)
    B.fill('#lockPass', CLAVE); B.keyboard.press('Enter'); B.wait_for_timeout(2600)
    ok(not B.is_visible('#lockScreen') and 'Sin recargar' in titles(B), 'y con la contraseña se vuelve a entrar con todos los datos')

    print('ERRORS', [e for e in errs if 'Failed to load resource' not in e])
