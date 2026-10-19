import os as _os, sys as _sys, tempfile as _tf
_ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), '..'))
_HTML = 'file://' + _os.path.join(_ROOT, 'CuadroDeMando.html')
if len(_sys.argv) < 2: _sys.argv.append(_tf.mkdtemp(prefix='cdm-test-'))
# Deshacer / rehacer en el editor de notas y selector de etiquetas en el móvil
from playwright.sync_api import sync_playwright
URL = _HTML
errs = []; fails = []
def ok(c, m):
    print(('PASS ' if c else 'FAIL ') + m, flush=True)
    if not c: fails.append(m)
H = lambda pg: pg.eval_on_selector('#editor', 'e=>e.innerHTML')
T = lambda pg: pg.eval_on_selector('#editor', 'e=>e.innerText.replace(/[\\u00a0\\u200b]/g," ").replace(/\\s+/g," ").trim()')

def fresh(b, html='<div>Hola</div>', **kw):
    pg = b.new_page(**({'viewport': {'width': 1300, 'height': 850}} | kw))
    pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
    pg.goto(URL); pg.wait_for_timeout(700)
    pg.evaluate("localStorage.clear(); indexedDB.deleteDatabase('cdm-data'); indexedDB.deleteDatabase('cdm-hist'); 0")
    pg.goto('about:blank'); pg.goto(URL); pg.wait_for_timeout(900)
    pg.evaluate("([h])=>{createNote('Destino','<div>x</div>',false); const n=createNote('Prueba',h,false); showTab('notes'); openNote(n.id)}", [html])
    pg.wait_for_timeout(250)
    return pg

def z(pg, k='Control+z'): pg.keyboard.press(k); pg.wait_for_timeout(60)

with sync_playwright() as p:
    b = p.chromium.launch()

    # ===== Escribir y deshacer =====
    pg = fresh(b)
    pg.click('#editor'); pg.keyboard.press('Control+End'); pg.keyboard.type(' mundo bonito'); pg.wait_for_timeout(80)
    z(pg)
    ok(T(pg) == 'Hola', 'Ctrl+Z deshace lo escrito de una vez, no letra a letra')
    z(pg, 'Control+y')
    ok(T(pg) == 'Hola mundo bonito', 'Ctrl+Y lo rehace')
    pg.evaluate('flushNote(true)'); pg.keyboard.type(' mas'); pg.wait_for_timeout(80); z(pg)
    ok(T(pg) == 'Hola mundo bonito', 'después de guardar se sigue pudiendo deshacer')
    pg.click('#toolbar [data-cmd="undo"]'); pg.wait_for_timeout(60)
    ok(T(pg) == 'Hola', 'el botón «Deshacer» de la barra también funciona')
    pg.click('#toolbar [data-cmd="redo"]'); pg.wait_for_timeout(60)
    ok(T(pg) == 'Hola mundo bonito', 'y el de «Rehacer»')
    pg.close()

    # ===== Etiqueta que se resalta al escribir el espacio =====
    pg = fresh(b)
    pg.click('#editor'); pg.keyboard.press('Control+End'); pg.keyboard.type(' uno #proyecto dos'); pg.wait_for_timeout(100)
    ok(pg.locator('#editor span.tg').count() == 1 and pg.inner_text('#editor span.tg') == '#proyecto', 'la etiqueta se resalta al escribir el espacio')
    z(pg); z(pg)
    ok(pg.locator('#editor span.tg').count() == 0 and 'proyecto' in T(pg), 'Ctrl+Z quita el resaltado sin borrar el texto')
    for _ in range(14):
        if T(pg) == 'Hola': break
        z(pg)
    ok(T(pg) == 'Hola', 'y se puede seguir deshaciendo hasta el principio (no se queda atascado)')
    pg.close()

    # ===== Autocompletado de etiqueta =====
    pg = fresh(b, '<div>Hola #proyecto</div>')
    pg.click('#editor'); pg.keyboard.press('Control+End'); pg.keyboard.press('Enter'); pg.keyboard.type('#pro'); pg.wait_for_timeout(150)
    pg.keyboard.press('Enter'); pg.wait_for_timeout(100); pg.keyboard.type('fin'); pg.wait_for_timeout(60)
    ok(pg.locator('#editor span.tg').count() == 2 and T(pg).endswith('#proyecto fin'), 'el autocompletado inserta la etiqueta y se sigue escribiendo fuera de ella')
    z(pg); z(pg)
    ok(pg.locator('#editor span.tg').count() == 1 and T(pg).endswith('#pro'), 'Ctrl+Z deshace la etiqueta elegida')
    pg.close()

    # ===== Escribir dentro de una etiqueta ya resaltada =====
    pg = fresh(b, '<div>uno #abc</div><div>dos</div>')
    pg.click('#editor span.tg'); pg.keyboard.press('End'); pg.keyboard.type('de fg'); pg.wait_for_timeout(80)
    ok(pg.inner_text('#editor span.tg') == '#abcde' and T(pg).startswith('uno #abcde fg'), 'un espacio al final de una etiqueta cierra el resaltado')
    pg.close()
    pg = fresh(b, '<div>uno <span class="tg">#abc de</span></div>')
    ok(pg.inner_text('#editor span.tg') == '#abc', 'al abrir una nota, el resaltado se recorta a la etiqueta')
    pg.close()

    # ===== Casillas =====
    pg = fresh(b)
    pg.click('#editor'); pg.keyboard.press('Control+End'); pg.keyboard.press('Enter'); pg.wait_for_timeout(80)
    pg.evaluate('insertChecklist()'); pg.keyboard.type('tarea'); pg.wait_for_timeout(60)
    ok(pg.locator('#editor input.chk').count() == 1, 'se inserta la casilla')
    z(pg); z(pg)
    ok(pg.locator('#editor input.chk').count() == 0, 'Ctrl+Z quita también la casilla')
    pg.close()
    pg = fresh(b, '<div><input type="checkbox" class="chk">&nbsp;a</div>')
    pg.click('#editor'); pg.keyboard.press('Control+End'); pg.keyboard.press('Enter'); pg.wait_for_timeout(60)
    ok(pg.locator('#editor input.chk').count() == 2, 'Enter en una casilla crea otra')
    pg.keyboard.press('Enter'); pg.wait_for_timeout(60)
    ok(pg.locator('#editor input.chk').count() == 1, 'Enter en una casilla vacía la quita')
    z(pg)
    ok(pg.locator('#editor input.chk').count() == 2, 'y Ctrl+Z la recupera')
    pg.close()

    # ===== Enlaces [[ ]] =====
    pg = fresh(b)
    pg.click('#editor'); pg.keyboard.press('Control+End'); pg.keyboard.type(' [[Dest'); pg.wait_for_timeout(150)
    pg.keyboard.press('Enter'); pg.wait_for_timeout(150); pg.keyboard.type('y')
    ok(pg.locator('#editor div a.wl').count() == 1 and T(pg) == 'Hola Destino y', 'el enlace elegido queda dentro de la línea y se sigue escribiendo')
    z(pg); z(pg)
    ok(pg.locator('#editor a.wl').count() == 0 and '[[Dest' in T(pg), 'Ctrl+Z deshace el enlace')
    pg.close()
    pg = fresh(b)
    pg.click('#editor'); pg.keyboard.press('Control+End'); pg.keyboard.press('Enter'); pg.keyboard.type('[[Destino]] sigue'); pg.wait_for_timeout(100)
    ok(pg.locator('#editor div a.wl').count() == 1 and T(pg).endswith('Destino sigue'), 'un [[enlace]] escrito a mano se convierte y se puede seguir escribiendo detrás')
    z(pg); z(pg)
    ok(pg.locator('#editor a.wl').count() == 0 and '[[Destino]]' in T(pg), 'Ctrl+Z vuelve al texto [[…]] y no se reconvierte')
    pg.close()

    # ===== El HTML guardado no arrastra estilos del editor =====
    pg = fresh(b)
    ok(pg.evaluate("sanitize('<div>a<span style=\"font-size: 1rem;\">b</span><span class=\"tg\">#c</span></div>')") == '<div>ab<span class="tg">#c</span></div>', 'los <span> vacíos que deja el editor se limpian al guardar')
    pg.close()

    # ===== Móvil: el teclado no cierra el desplegable de etiquetas =====
    m = b.new_page(viewport={'width': 390, 'height': 800}, is_mobile=True, has_touch=True)
    m.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
    m.goto(URL); m.wait_for_timeout(900)
    m.evaluate("const n=createNote('P','<div>x</div>',false); showTab('notes'); openNote(n.id)"); m.wait_for_timeout(300)
    m.tap('#noteTagAdd'); m.wait_for_timeout(200)
    m.set_viewport_size({'width': 390, 'height': 480}); m.wait_for_timeout(300)
    ok(m.is_visible('#tagPicker'), 'nota: el desplegable sigue abierto cuando el teclado reduce la altura')
    m.keyboard.type('libros'); m.keyboard.press('Enter'); m.wait_for_timeout(200)
    ok(m.evaluate('getNote(currentNoteId).tags') == ['libros'], 'nota: se puede crear y añadir la etiqueta desde el móvil')
    m.set_viewport_size({'width': 390, 'height': 800}); m.wait_for_timeout(200)
    m.evaluate("tpClose && tpClose(); showTab('kanban'); openTask(); 0"); m.wait_for_timeout(300)
    m.tap('.modal .tf-add'); m.wait_for_timeout(200)
    m.set_viewport_size({'width': 390, 'height': 480}); m.wait_for_timeout(300)
    ok(m.is_visible('#tagPicker'), 'Kanban: el desplegable sigue abierto con el teclado')
    m.locator('#tagPicker .tp-row:has-text("libros")').tap(); m.wait_for_timeout(200)
    ok(m.locator('.modal .tf-chips .tf-chip').count() == 1, 'Kanban: se puede marcar una etiqueta')
    m.set_viewport_size({'width': 800, 'height': 390}); m.wait_for_timeout(300)
    ok(not m.is_visible('#tagPicker'), 'al girar el móvil (cambia el ancho) sí se cierra')
    m.close()

    print('ERRORS', errs)
