import os as _os, sys as _sys, tempfile as _tf
_ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), '..'))
_HTML = 'file://' + _os.path.join(_ROOT, 'CuadroDeMando.html')
if len(_sys.argv) < 2: _sys.argv.append(_tf.mkdtemp(prefix='cdm-test-'))
# Kanban: vistas (compacta / normal / detalle) y enviar una tarjeta a Tareas o a una nota
from playwright.sync_api import sync_playwright
URL = _HTML
errs = []; fails = []
def ok(c, m):
    print(('PASS ' if c else 'FAIL ') + m, flush=True)
    if not c: fails.append(m)
def deshacer(pg):
    pg.locator('.toast button:has-text("Deshacer")').last.click(); pg.wait_for_timeout(600)
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1400, 'height': 950})
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
    pg.goto(URL); pg.wait_for_timeout(900)
    pg.evaluate("localStorage.clear(); indexedDB.deleteDatabase('cdm-data'); 0")
    pg.goto('about:blank'); pg.goto(URL); pg.wait_for_timeout(1200)
    pg.evaluate("""S.tasks.push({id:'k1',title:'Migrar el portal',desc:'Revisar dependencias y avisar a sistemas',col:'doing',priority:'alta',due:'2026-12-01',tags:['portal'],subtasks:[{id:'s1',text:'Inventario',done:true},{id:'s2',text:'Pruebas',done:false}],created:Date.now()});
      S.tasks.push({id:'k2',title:'Otra tarjeta',desc:'',col:'todo',priority:'media',due:'',tags:[],subtasks:[],created:Date.now()});
      save.tasks(); showTab('kanban'); 0"""); pg.wait_for_timeout(600)
    alto = lambda: round(pg.locator('.kb-card[data-id=k1]').bounding_box()['height'])

    # ===== Vistas del tablero =====
    ok(pg.locator('#kbDens [data-d]').count() == 3, 'el tablero ofrece tres vistas')
    pg.click('#kbDens [data-d=normal]'); pg.wait_for_timeout(400)
    normal = alto()
    ok(pg.locator('.kb-card[data-id=k1] .desc').count() == 1 and not pg.evaluate("!!document.querySelector('.kb-card[data-id=k1] details.subs[open]')"), 'normal: se ve la descripción y las subtareas plegadas')
    pg.click('#kbDens [data-d=compact]'); pg.wait_for_timeout(400)
    compacta = alto()
    ok(pg.locator('.kb-card[data-id=k1] .desc').count() == 0 and compacta < normal, f'compacta: sin descripción y más baja ({compacta} < {normal})')
    ok('1/2' in pg.inner_text('.kb-card[data-id=k1]') and '#portal' in pg.inner_text('.kb-card[data-id=k1]'), 'pero mantiene lo importante: subtareas hechas, etiquetas y prioridad')
    pg.click('#kbDens [data-d=full]'); pg.wait_for_timeout(400)
    detalle = alto()
    ok(detalle > normal and pg.evaluate("!!document.querySelector('.kb-card[data-id=k1] details.subs[open]')"), f'detalle: subtareas desplegadas y más alta ({detalle} > {normal})')
    pg.click('#kbDens [data-d=normal]'); pg.wait_for_timeout(400)
    ok(not pg.evaluate("!!document.querySelector('.kb-card[data-id=k1] details.subs[open]')"), 'al volver a normal, las subtareas no se quedan abiertas')
    pg.click('#kbDens [data-d=compact]'); pg.wait_for_timeout(300)
    pg.reload(); pg.wait_for_timeout(1400); pg.evaluate("showTab('kanban')"); pg.wait_for_timeout(500)
    ok(pg.evaluate("kbDens") == 'compact' and pg.locator('#kbDens [data-d=compact].on').count() == 1, 'la vista elegida se recuerda al volver a abrir')
    pg.screenshot(path=_sys.argv[1] + '/kanban_compacta.png')
    pg.click('#kbDens [data-d=normal]'); pg.wait_for_timeout(400)

    # ===== Enviar una tarjeta =====
    pg.evaluate("openTask('k1'); 0"); pg.wait_for_timeout(600)
    ok(pg.locator('.modal-foot button:has-text("Enviar a")').count() == 1, 'la tarjeta tiene un botón «Enviar a…»')
    pg.click('.modal-foot button:has-text("Enviar a")'); pg.wait_for_timeout(600)
    t = pg.inner_text('.modal-foot')
    ok('Mover a Tareas' in t and 'Copiar a Tareas' in t and 'Volcar en una nota' in t, 'y ofrece mover, copiar o volcar en una nota')
    pg.click('.modal-foot button:has-text("Copiar a Tareas")'); pg.wait_for_timeout(700)
    td = pg.evaluate("S.todos.find(t=>t.text==='Migrar el portal')")
    ok(bool(td) and len(td['steps']) == 2 and td['important'] is True and td['tags'] == ['portal'] and td['due'] == '2026-12-01', 'copiar crea la tarea con pasos, fecha, etiquetas y prioridad')
    ok(pg.evaluate("S.tasks.some(t=>t.id==='k1')"), 'y la tarjeta sigue en el tablero')
    deshacer(pg)
    ok(pg.evaluate("S.todos.some(t=>t.text==='Migrar el portal')") is False, '«Deshacer» quita la tarea creada')

    pg.evaluate("taskSendAsk('k1'); 0"); pg.wait_for_timeout(600)
    pg.click('.modal-foot button:has-text("Volcar")'); pg.wait_for_timeout(800)
    n = pg.evaluate("S.notes.find(n=>n.title==='Migrar el portal')")
    ok(bool(n) and n['html'].count('type="checkbox"') == 2 and 'Revisar dependencias' in n['html'], 'volcar crea la nota con la descripción y las subtareas como casillas')
    ok(n.get('tags') == ['portal'] and '[[Migrar el portal]]' in pg.evaluate("S.tasks.find(t=>t.id==='k1').desc"), 'la nota hereda las etiquetas y queda enlazada en la tarjeta')

    pg.evaluate("taskSendAsk('k2'); 0"); pg.wait_for_timeout(600)
    pg.click('.modal-foot button:has-text("Mover")'); pg.wait_for_timeout(700)
    ok(pg.evaluate("S.tasks.some(t=>t.id==='k2')") is False and pg.evaluate("S.todos.some(t=>t.text==='Otra tarjeta')"), 'mover pasa la tarjeta a Tareas y la quita del tablero')
    deshacer(pg)
    ok(pg.evaluate("S.tasks.some(t=>t.id==='k2')") and pg.evaluate("S.todos.some(t=>t.text==='Otra tarjeta')") is False, 'y también se puede deshacer')

    # ===== En el móvil =====
    m = ctx.new_page(); m.set_viewport_size({'width': 390, 'height': 800})
    m.goto(URL); m.wait_for_timeout(1200); m.evaluate("showTab('kanban')"); m.wait_for_timeout(500)
    ok(m.is_visible('#kbDens') and m.evaluate("document.documentElement.scrollWidth") <= 390, 'el selector de vista cabe en el móvil sin scroll horizontal')
    m.close()
    print('ERRORS', [e for e in errs if 'Failed to load resource' not in e])
