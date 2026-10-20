import os as _os, sys as _sys, tempfile as _tf
_ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), '..'))
_HTML = 'file://' + _os.path.join(_ROOT, 'CuadroDeMando.html')
if len(_sys.argv) < 2: _sys.argv.append(_tf.mkdtemp(prefix='cdm-test-'))
# Bloc rápido (post-it) y enlace [[ ]] dentro de los diálogos
from playwright.sync_api import sync_playwright
URL = _HTML
errs = []; fails = []
def ok(c, m):
    print(('PASS ' if c else 'FAIL ') + m, flush=True)
    if not c: fails.append(m)
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1350, 'height': 900})
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
    pg.goto(URL); pg.wait_for_timeout(900)
    pg.evaluate("localStorage.clear(); indexedDB.deleteDatabase('cdm-data'); 0")
    pg.goto('about:blank'); pg.goto(URL); pg.wait_for_timeout(1200)

    # ===== El desplegable [[ ]] se ve dentro de un diálogo =====
    pg.evaluate("createNote('Informe portal','<div>x</div>',false); addTodoFromText('Revisar algo','inbox'); 0"); pg.wait_for_timeout(400)
    tid = pg.evaluate("S.todos[0].id")
    pg.evaluate(f"openTodo({tid!r}); 0"); pg.wait_for_timeout(500)
    pg.click('.modal textarea[name=notes]')
    pg.type('.modal textarea[name=notes]', 'ver [[Inf', delay=30); pg.wait_for_timeout(500)
    ok(pg.is_visible('#wlfPop') and 'Informe portal' in pg.inner_text('#wlfPop'), 'escribir [[ en una tarea propone las notas')
    z = pg.evaluate("[+getComputedStyle(document.getElementById('wlfPop')).zIndex, +getComputedStyle(document.querySelector('.modal-back')).zIndex]")
    ok(z[0] > z[1], f'y el desplegable queda por encima del diálogo ({z[0]} > {z[1]})')
    pg.locator('#wlfPop [data-wl="0"]').click(); pg.wait_for_timeout(400)
    ok(pg.input_value('.modal textarea[name=notes]') == 'ver [[Informe portal]]', 'al elegirla, se escribe el enlace')
    ok('Informe portal' in pg.inner_text('.modal .wl-field'), 'y aparece como nota enlazada')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)

    # ===== Bloc rápido =====
    ok(pg.is_visible('#blocBtn') and not pg.is_visible('#blocDot'), 'el botón del bloc está en la barra, sin aviso si está vacío')
    pg.click('#blocBtn'); pg.wait_for_timeout(400)
    ok(pg.is_visible('#blocPop') and pg.evaluate("document.activeElement.id") == 'blocPad', 'se abre con el cursor dentro')
    pg.type('#blocPad', 'Llamar a Ana\nMirar el expediente', delay=20); pg.wait_for_timeout(900)
    ok(pg.evaluate("store.get('scratch','')") == 'Llamar a Ana\nMirar el expediente', 'lo escrito se guarda solo')
    ok(pg.is_visible('#blocDot') and '2 líneas' in pg.inner_text('#blocSaved'), 'avisa de que hay algo apuntado')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    ok(not pg.is_visible('#blocPop'), 'Esc lo cierra')
    pg.keyboard.press('Alt+b'); pg.wait_for_timeout(400)
    ok(pg.is_visible('#blocPop'), 'Alt+B lo abre')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)

    # ===== La misma caja en Inicio =====
    pg.evaluate("showTab('dashboard')"); pg.wait_for_timeout(500)
    ok(pg.input_value('#dashBloc') == 'Llamar a Ana\nMirar el expediente', 'en Inicio se ve lo mismo')
    pg.fill('#dashBloc', 'Comprar pan\nRevisar la factura'); pg.wait_for_timeout(900)
    pg.click('#blocBtn'); pg.wait_for_timeout(400)
    ok(pg.input_value('#blocPad') == 'Comprar pan\nRevisar la factura', 'y lo que escribes en Inicio sale también en el bloc flotante')

    # ===== Convertir en tareas =====
    pg.click('#blocPop [data-bloc=todo]'); pg.wait_for_timeout(700)
    ok(pg.evaluate("S.todos.filter(t=>['Comprar pan','Revisar la factura'].includes(t.text)).length") == 2, 'cada línea se convierte en una tarea')
    ok(pg.evaluate("store.get('scratch','')") == '', 'y el bloc se queda limpio')
    pg.locator('.toast button:has-text("Deshacer")').last.click(); pg.wait_for_timeout(600)
    ok(pg.evaluate("S.todos.filter(t=>['Comprar pan','Revisar la factura'].includes(t.text)).length") == 0 and pg.evaluate("store.get('scratch','')") == 'Comprar pan\nRevisar la factura', '«Deshacer» quita las tareas y devuelve el texto')

    # ===== Convertir en nota =====
    pg.click('#blocBtn'); pg.wait_for_timeout(300)
    pg.click('#blocPop [data-bloc=note]'); pg.wait_for_timeout(700)
    n = pg.evaluate("S.notes.find(n=>n.title==='Comprar pan')")
    ok(bool(n) and 'Revisar la factura' in n['html'], 'la nota usa la primera línea como título y el resto como contenido')
    pg.locator('.toast button:has-text("Deshacer")').last.click(); pg.wait_for_timeout(600)
    ok(pg.evaluate("S.notes.some(n=>n.title==='Comprar pan')") is False and pg.evaluate("store.get('scratch','')") != '', 'también se puede deshacer')

    # ===== Vaciar y persistencia =====
    pg.click('#blocBtn'); pg.wait_for_timeout(300)
    pg.click('#blocPop [data-bloc=clear]'); pg.wait_for_timeout(500)
    ok(pg.evaluate("store.get('scratch','')") == '', 'el botón de la papelera lo vacía')
    pg.locator('.toast button:has-text("Deshacer")').last.click(); pg.wait_for_timeout(500)
    ok(pg.evaluate("store.get('scratch','')") != '', 'y eso también se deshace')
    pg.reload(); pg.wait_for_timeout(1400)
    ok(pg.evaluate("store.get('scratch','')") != '' and pg.is_visible('#blocDot'), 'lo apuntado sigue ahí al volver a abrir')
    pg.screenshot(path=_sys.argv[1] + '/bloc.png')

    # ===== En el móvil cabe =====
    m = ctx.new_page(); m.set_viewport_size({'width': 390, 'height': 800})
    m.goto(URL); m.wait_for_timeout(1200)
    m.click('#blocBtn'); m.wait_for_timeout(400)
    caja = m.locator('#blocPop').bounding_box()
    ok(m.is_visible('#blocPop') and caja['x'] >= 0 and caja['x'] + caja['width'] <= 390, 'en el móvil el bloc cabe en la pantalla')
    ok(m.evaluate("document.documentElement.scrollWidth") <= 390, 'y no provoca scroll horizontal')
    m.close()
    print('ERRORS', [e for e in errs if 'Failed to load resource' not in e])
