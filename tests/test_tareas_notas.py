import os as _os, sys as _sys, tempfile as _tf
_ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), '..'))
_HTML = 'file://' + _os.path.join(_ROOT, 'CuadroDeMando.html')
if len(_sys.argv) < 2: _sys.argv.append(_tf.mkdtemp(prefix='cdm-test-'))
import sys
from playwright.sync_api import sync_playwright
URL=_HTML
SC=sys.argv[1]
errs=[]; fails=[]
def ok(c,m):
    print(('PASS ' if c else 'FAIL ')+m)
    if not c: fails.append(m)
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1400,'height':900}); pg=ctx.new_page()
    pg.on('pageerror', lambda e: errs.append('PAGEERR '+str(e)))
    pg.on('console', lambda m: errs.append('console:'+m.text) if m.type=='error' else None)
    pg.goto(URL); pg.wait_for_timeout(900); pg.evaluate("localStorage.clear(); indexedDB.deleteDatabase('cdm-data'); 0"); pg.reload(); pg.wait_for_timeout(700)
    ids=pg.evaluate("""()=>{const a=createNote('Cliente ACME','<div>Datos del cliente</div>',false);const t=addTodoFromText('Preparar oferta ACME','inbox');refreshTodoViews();return {a:a.id,t:t.id}}""")
    # --- Tareas: autocompletado [[ en notas
    pg.evaluate("showTab('todos')"); pg.evaluate(f"openTodo('{ids['t']}'); 0"); pg.wait_for_timeout(200)
    ok(pg.is_visible('.modal .wl-field [data-wlnew]'),'botón «Crear nota vinculada» en la tarea')
    pg.click('.modal textarea[name=notes]'); pg.keyboard.type('Revisar [[Clien'); pg.wait_for_timeout(150)
    ok(pg.is_visible('#wlfPop') and 'Cliente ACME' in pg.inner_text('#wlfPop'),'autocompletado [[ en las notas de la tarea')
    pg.keyboard.press('Enter'); pg.wait_for_timeout(100)
    ok(pg.input_value('.modal textarea[name=notes]')=='Revisar [[Cliente ACME]]','inserta [[Cliente ACME]]')
    ok(pg.is_visible('#modalBack.open'),'Enter elige la nota sin cerrar el diálogo')
    ok('Cliente ACME' in pg.inner_text('.modal .wl-field'),'muestra la nota enlazada como botón')
    pg.keyboard.type(' y [[Nueva'); pg.wait_for_timeout(100); pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
    ok(pg.is_visible('#modalBack.open') and not pg.is_visible('#wlfPop'),'Esc cierra el menú, no el diálogo')
    pg.keyboard.type(' cosa]]'); pg.wait_for_timeout(100)
    ok(pg.locator('.modal .chip.wl-missing').count()==1,'enlace a nota inexistente: botón para crearla')
    # clic en la nota enlazada: guarda y abre
    pg.click('.modal [data-wlo]'); pg.wait_for_timeout(300)
    ok(pg.evaluate("currentTab")=='notes' and pg.evaluate("currentNoteId")==ids['a'],'clic en la nota enlazada guarda la tarea y abre la nota')
    ok('[[Cliente ACME]]' in pg.evaluate(f"getTodo('{ids['t']}').notes"),'la tarea quedó guardada con el enlace')
    t=pg.inner_text('#backlinks'); ok('Tareas que la mencionan (1)' in t and 'Preparar oferta ACME' in t,'la nota muestra la tarea en su panel')
    pg.click('#backlinks [data-ref]'); pg.wait_for_timeout(300)
    ok(pg.evaluate("currentTab")=='todos' and pg.is_visible('#modalBack.open'),'clic en la tarea desde la nota la abre')
    # crear nota vinculada
    pg.click('.modal [data-wlnew]'); pg.wait_for_timeout(400)
    ok(pg.evaluate("currentTab")=='notes' and pg.evaluate("getNote(currentNoteId).title")=='Preparar oferta ACME','«Crear nota vinculada» crea la nota con el título de la tarea y la abre')
    ok('[[Preparar oferta ACME]]' in pg.evaluate(f"getTodo('{ids['t']}').notes"),'y enlaza la nota en la tarea')
    ok('Tareas que la mencionan (1)' in pg.inner_text('#backlinks'),'la nota nueva ya muestra su tarea')
    # renombrar la nota actualiza la tarea
    pg.fill('#noteTitle','Oferta ACME 2026'); pg.press('#noteTitle','Enter'); pg.wait_for_timeout(200)
    ok('[[Oferta ACME 2026]]' in pg.evaluate(f"getTodo('{ids['t']}').notes"),'renombrar la nota actualiza el enlace en la tarea')
    ok('Tareas que la mencionan (1)' in pg.inner_text('#backlinks'),'y sigue vinculada')
    # lista de tareas: insignia
    pg.evaluate("showTab('todos'); setTodoView('all')"); pg.wait_for_timeout(200)
    ok('🔗 2 notas' in pg.inner_text('#view-todos') or '🔗 3 notas' in pg.inner_text('#view-todos'),'la tarea muestra cuántas notas enlaza')
    # --- Kanban
    pg.evaluate("showTab('kanban'); openTask(null,'todo'); 0"); pg.wait_for_timeout(200)
    nb=pg.evaluate("S.notes.length"); pg.click('.modal [data-wlnew]'); pg.wait_for_timeout(200)
    ok(pg.is_visible('#modalBack.open') and pg.evaluate("S.notes.length")==nb,'sin título no crea la nota (avisa)')
    pg.fill('.modal input[name=title]','Migración servidor'); pg.click('.modal [data-wlnew]'); pg.wait_for_timeout(400)
    kt=pg.evaluate("S.tasks.find(t=>t.title==='Migración servidor')")
    ok(kt and '[[Migración servidor]]' in kt['desc'] and pg.evaluate("getNote(currentNoteId).title")=='Migración servidor','Kanban: crea la tarjeta, la nota vinculada y la abre')
    ok('Tarjeta' in pg.get_attribute('#backlinks [data-ref]','title'),'la nota muestra la tarjeta')
    pg.evaluate("showTab('kanban')"); pg.wait_for_timeout(200)
    ok(pg.locator('#view-kanban .wl-mini').count()>=1 and '[[' not in pg.inner_text('#view-kanban'),'la tarjeta muestra la nota sin corchetes')
    pg.evaluate("showTab('maps'); showMapsMode('graph')"); pg.wait_for_timeout(600)
    ok(pg.evaluate("grNodes.some(n=>n.kind==='kanban')") and pg.evaluate("grNodes.some(n=>n.kind==='todo')"),'tarea y tarjeta aparecen en el grafo')
    pg.evaluate(f"showTab('todos'); openTodo('{ids['t']}'); 0"); pg.wait_for_timeout(200)
    pg.locator('.modal').screenshot(path=SC+'/tl_modal.png')
    print('ERRORS:',errs); print('FAILS:',len(fails))
