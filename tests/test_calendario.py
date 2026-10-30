import os as _os, sys as _sys, tempfile as _tf
_ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), '..'))
_HTML = 'file://' + _os.path.join(_ROOT, 'CuadroDeMando.html')
if len(_sys.argv) < 2: _sys.argv.append(_tf.mkdtemp(prefix='cdm-test-'))
# Calendario: abrir y arrastrar desde la cuadrícula, cambiar un solo día de una serie y vista del año
from playwright.sync_api import sync_playwright
URL = _HTML
errs = []; fails = []
def ok(c, m):
    print(('PASS ' if c else 'FAIL ') + m, flush=True)
    if not c: fails.append(m)

SEMANAL = """S.events=[{id:'r1',title:'Reunión semanal',date:'2026-10-05',allDay:false,start:'10:00',end:'11:00',
  color:COLORS[0],repeat:'weekly',until:'',notes:'',created:Date.now()}];
  S.holidays=[{id:'h1',date:'2026-11-02',name:'Festivo de prueba'}];
  S.todos=[{id:'t1',listId:'inbox',text:'Pagar el seguro',done:false,due:'2026-11-04',important:false,repeat:'',notes:'',steps:[],created:Date.now(),order:0}];
  S.tasks=[{id:'k1',title:'Entregar informe',desc:'',col:'todo',priority:'media',due:'2026-11-05',tags:[],subtasks:[],created:Date.now()}];
  save.events(); save.holidays(); save.todos(); save.tasks(); showTab('calendar'); calGoto('2026-11-01'); 0"""

def drag(pg, chip_sel, cell_sel):
    """Arrastra con los eventos de HTML5 (dragstart/dragover/drop) como lo haría el navegador."""
    pg.evaluate("""([a, b]) => {
      const chip = document.querySelector(a), cell = document.querySelector(b), dt = new DataTransfer();
      chip.dispatchEvent(new DragEvent('dragstart', {bubbles:true, dataTransfer:dt}));
      cell.dispatchEvent(new DragEvent('dragover', {bubbles:true, cancelable:true, dataTransfer:dt}));
      cell.dispatchEvent(new DragEvent('drop', {bubbles:true, cancelable:true, dataTransfer:dt}));
      chip.dispatchEvent(new DragEvent('dragend', {bubbles:true, dataTransfer:dt}));
    }""", [chip_sel, cell_sel])

with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1350, 'height': 900})
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
    pg.goto(URL); pg.wait_for_timeout(900)
    pg.evaluate("localStorage.clear(); indexedDB.deleteDatabase('cdm-data'); 0")
    pg.goto('about:blank'); pg.goto(URL); pg.wait_for_timeout(1200)
    pg.evaluate(SEMANAL); pg.wait_for_timeout(400)

    # ===== Abrir desde la cuadrícula =====
    ok(pg.locator('.cal-cell[data-day="2026-11-04"] .cal-chip[data-kind=todo]').count() == 1, 'la tarea sale en su día de la cuadrícula')
    pg.locator('.cal-cell[data-day="2026-11-04"] .cal-chip').click(); pg.wait_for_timeout(450)
    ok(pg.locator('.modal input[name=text]').count() == 1 and pg.input_value('.modal input[name=text]') == 'Pagar el seguro', 'pinchar una tarea en la cuadrícula la abre')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(250)
    ok(pg.evaluate("calSel") == '2026-11-04', 'y deja elegido ese día')
    pg.locator('.cal-cell[data-day="2026-11-05"] .cal-chip').click(); pg.wait_for_timeout(450)
    ok(pg.input_value('.modal input[name=title]') == 'Entregar informe', 'pinchar una tarjeta del Kanban la abre')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(250)
    pg.locator('.cal-cell[data-day="2026-11-09"] .cal-chip').click(); pg.wait_for_timeout(450)
    ok(pg.input_value('.modal input[name=title]') == 'Reunión semanal', 'pinchar un evento lo abre')
    ok('lunes, 9 de noviembre' in pg.inner_text('.modal .ev-occ'), 'y si se repite, dice desde qué día se ha abierto')
    ok(pg.locator('.modal-foot button:has-text("Saltar este día")').count() == 1 and pg.locator('.modal-foot button:has-text("Mover solo este")').count() == 1, 'con los botones para cambiar solo ese día')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(250)
    pg.evaluate("openEvent('r1'); 0"); pg.wait_for_timeout(400)
    ok(pg.locator('.modal .ev-occ').count() == 0 and 'toda la serie' in pg.inner_text('.modal'), 'abierto sin día concreto (desde el buscador), avisa de que cambia toda la serie')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(250)

    # ===== Saltar un día de la serie (el lunes festivo) =====
    pg.locator('.cal-cell[data-day="2026-11-02"] .cal-chip').click(); pg.wait_for_timeout(450)
    pg.locator('.modal-foot button:has-text("Saltar este día")').click(); pg.wait_for_timeout(400)
    ok(pg.evaluate("S.events[0].skip") == ['2026-11-02'], 'saltar ese día lo apunta en la serie')
    ok(pg.evaluate("eventDates(S.events[0],'2026-11-02','2026-11-02').length") == 0 and pg.evaluate("eventDates(S.events[0],'2026-11-09','2026-11-09').length") == 1, 'ese lunes ya no cuenta, el siguiente sí')
    ok(pg.locator('.cal-cell[data-day="2026-11-02"] .cal-chip.skip').count() == 1, 'en la cuadrícula sale tachado')
    ok('cancelado este día' in pg.inner_text('#calDayList'), 'y en la lista del día dice que está cancelado')
    ok(pg.evaluate("calDayItems('2026-11-02').some(i => i.kind==='event')") is False, 'fuera del calendario (Inicio) no aparece')
    pg.locator('.cal-cell[data-day="2026-11-02"] .cal-chip.skip').click(); pg.wait_for_timeout(450)
    ok('cancelado' in pg.inner_text('.modal .ev-occ') and pg.locator('.modal-foot button:has-text("Recuperar este día")').count() == 1, 'al abrirlo dice que está cancelado y deja recuperarlo')
    pg.locator('.modal-foot button:has-text("Recuperar este día")').click(); pg.wait_for_timeout(400)
    ok(pg.evaluate("'skip' in S.events[0]") is False and pg.locator('.cal-cell[data-day="2026-11-02"] .cal-chip.skip').count() == 0, 'recuperarlo lo deja como el resto')

    # ===== Mover solo ese día =====
    pg.locator('.cal-cell[data-day="2026-11-02"] .cal-chip').click(); pg.wait_for_timeout(450)
    pg.locator('.modal-foot button:has-text("Mover solo este")').click(); pg.wait_for_timeout(400)
    pg.fill('.modal input[name=date]', '2026-11-03'); pg.fill('.modal input[name=start]', '12:00'); pg.fill('.modal input[name=end]', '13:00')
    pg.locator('.modal-foot button:has-text("Mover")').last.click(); pg.wait_for_timeout(450)
    mv = pg.evaluate("S.events.find(e => e.from)")
    ok(mv and mv['date'] == '2026-11-03' and mv['start'] == '12:00' and mv['repeat'] == '' and mv['from'] == {'id': 'r1', 'date': '2026-11-02'}, 'mover solo ese día crea uno suelto en la nueva fecha y hora, que recuerda de dónde viene')
    ok(pg.evaluate("S.events.find(e=>e.id==='r1').skip") == ['2026-11-02'], 'y la serie salta el día original')
    pg.evaluate("calGoto('2026-11-02'); 0"); pg.wait_for_timeout(300)
    ok('aplazado al martes, 3 de noviembre' in pg.inner_text('#calDayList'), 'el día original dice a dónde se ha aplazado')
    ok(pg.evaluate("eventDates(S.events.find(e=>e.id==='r1'),'2026-11-09','2026-11-09').length") == 1, 'el resto de lunes sigue igual')
    pg.locator('.cal-cell[data-day="2026-11-03"] .cal-chip').click(); pg.wait_for_timeout(450)
    ok('movido a este día' in pg.inner_text('.modal .ev-occ'), 'el movido explica que es un día de la serie')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(250)
    pg.locator('.cal-cell[data-day="2026-11-02"] .cal-chip.skip').click(); pg.wait_for_timeout(450)
    ok('aplazado al martes' in pg.inner_text('.modal .ev-occ'), 'al abrir el día original, dice que está aplazado')
    pg.locator('.modal-foot button:has-text("Recuperar este día")').click(); pg.wait_for_timeout(400)
    ok(pg.evaluate("S.events.length") == 1 and pg.evaluate("'skip' in S.events[0]") is False, 'recuperarlo quita también el movido')

    # ===== El .ics lleva los días saltados =====
    pg.evaluate("calSkipAdd(S.events[0], '2026-11-02'); save.events(); 0")
    ics = pg.evaluate("buildIcs(false)")
    ok('EXDATE:20261102T100000' in ics, 'al exportar, el día saltado viaja como EXDATE')
    ok(pg.evaluate("(parseIcs(buildIcs(false))[0]||{}).skip") == ['2026-11-02'], 'y al importarlo se recupera')
    ok(pg.evaluate("""(parseIcs(['BEGIN:VCALENDAR','BEGIN:VEVENT','DTSTART;VALUE=DATE:20261005','RRULE:FREQ=WEEKLY','EXDATE;VALUE=DATE:20261012,20261019','EXDATE;VALUE=DATE:20261026','SUMMARY:Ajeno','END:VEVENT','END:VCALENDAR'].join('\\r\\n'))[0]||{}).skip""") == ['2026-10-12', '2026-10-19', '2026-10-26'], 'un .ics de fuera con varios EXDATE también')
    pg.evaluate("delete S.events[0].skip; save.events(); 0")

    # ===== Un día saltado no avisa =====
    pg.evaluate("""(() => { const h = new Date(Date.now()-5*60000), hoy = dayKey(new Date());
      S.events=[{id:'a1',title:'Semanal',date:dayKey(addDays(new Date(),-7)),allDay:false,start:pad(h.getHours())+':'+pad(h.getMinutes()),end:'23:59',
        color:COLORS[0],repeat:'weekly',until:'',alarm:'at',notes:'',skip:[hoy],created:Date.now()}];
      save.events(); store.set('alarmSeen',{}); avCheck(); 0})()"""); pg.wait_for_timeout(400)
    ok(not pg.is_visible('#avisos .aviso'), 'un día cancelado no hace saltar el aviso')
    pg.evaluate("delete S.events[0].skip; save.events(); avCheck(); 0"); pg.wait_for_timeout(300)
    ok(pg.is_visible('#avisos .aviso'), 'y al recuperarlo, sí')
    pg.evaluate("avCloseAll(); 0")
    pg.evaluate(SEMANAL); pg.wait_for_timeout(400)

    # ===== Arrastrar =====
    drag(pg, '.cal-cell[data-day="2026-11-04"] .cal-chip', '.cal-cell[data-day="2026-11-06"]'); pg.wait_for_timeout(400)
    ok(pg.evaluate("S.todos[0].due") == '2026-11-06', 'arrastrar una tarea a otro día le cambia la fecha')
    ok(pg.locator('.cal-cell[data-day="2026-11-06"] .cal-chip[data-kind=todo]').count() == 1, 'y se ve en el día nuevo')
    pg.locator('.toast button:has-text("Deshacer")').last.click(); pg.wait_for_timeout(300)
    ok(pg.evaluate("S.todos[0].due") == '2026-11-04', 'con «Deshacer» vuelve a su día')
    drag(pg, '.cal-cell[data-day="2026-11-05"] .cal-chip', '.cal-cell[data-day="2026-11-10"]'); pg.wait_for_timeout(400)
    ok(pg.evaluate("S.tasks[0].due") == '2026-11-10', 'arrastrar una tarjeta del Kanban le cambia la fecha límite')
    pg.evaluate("S.events.push({id:'u1',title:'Dentista',date:'2026-11-12',allDay:true,start:'09:00',end:'10:00',color:COLORS[2],repeat:'',until:'',notes:'',created:Date.now()}); save.events(); renderCalendar(); 0"); pg.wait_for_timeout(300)
    drag(pg, '.cal-cell[data-day="2026-11-12"] .cal-chip', '.cal-cell[data-day="2026-11-13"]'); pg.wait_for_timeout(400)
    ok(pg.evaluate("S.events.find(e=>e.id==='u1').date") == '2026-11-13', 'arrastrar un evento suelto lo cambia de día sin preguntar')
    drag(pg, '.cal-cell[data-day="2026-11-16"] .cal-chip', '.cal-cell[data-day="2026-11-17"]'); pg.wait_for_timeout(400)
    ok(pg.locator('.modal-foot button:has-text("Solo este día")').count() == 1 and pg.locator('.modal-foot button:has-text("Toda la serie")').count() == 1, 'arrastrar uno que se repite pregunta si solo ese día o toda la serie')
    pg.locator('.modal-foot button:has-text("Solo este día")').click(); pg.wait_for_timeout(400)
    ok(pg.evaluate("S.events.find(e=>e.id==='r1').skip") == ['2026-11-16'] and pg.evaluate("(S.events.find(e=>e.from && e.from.date==='2026-11-16')||{}).date") == '2026-11-17', '«Solo este día» lo aplaza al día donde se suelta')
    drag(pg, '.cal-cell[data-day="2026-11-23"] .cal-chip', '.cal-cell[data-day="2026-11-24"]'); pg.wait_for_timeout(400)
    pg.locator('.modal-foot button:has-text("Toda la serie")').click(); pg.wait_for_timeout(400)
    r1 = pg.evaluate("S.events.find(e=>e.id==='r1')")
    ok(r1['date'] == '2026-10-06' and r1['skip'] == ['2026-11-17'], '«Toda la serie» desplaza la serie (y sus días saltados) un día')
    ok(pg.locator('.cal-chip.skip[draggable]').count() == 0, 'lo tachado no se puede arrastrar')

    # ===== Vista del año =====
    pg.evaluate(SEMANAL); pg.wait_for_timeout(300)
    pg.click('#calYearBtn'); pg.wait_for_timeout(450)
    ok(pg.locator('.modal .yc-m').count() == 12, 'el botón «Año» enseña los 12 meses')
    ok(pg.inner_text('#ycTitle') == '2026', 'del año que estás viendo')
    ok('l1' in (pg.get_attribute('.modal .yc-d[data-day="2026-11-09"]', 'class') or ''), 'los días con cosas se marcan')
    ok('hol' in (pg.get_attribute('.modal .yc-d[data-day="2026-11-02"]', 'class') or ''), 'y los festivos van en rojo')
    ok('l' not in (pg.get_attribute('.modal .yc-d[data-day="2026-09-28"]', 'class') or '').replace('yc-d', '').split(), 'antes de empezar la serie no hay marcas')
    pg.locator('.modal [data-y="1"]').click(); pg.wait_for_timeout(250)
    ok(pg.inner_text('#ycTitle') == '2027' and pg.locator('.modal .yc-d[data-day="2027-01-04"]').count() == 1, 'con las flechas se cambia de año')
    ok('l1' in (pg.get_attribute('.modal .yc-d[data-day="2027-01-04"]', 'class') or ''), 'y las repeticiones siguen en el año siguiente')
    pg.locator('.modal .yc-d[data-day="2027-03-15"]').click(); pg.wait_for_timeout(450)
    ok(pg.locator('#modalBack.open').count() == 0 and pg.evaluate("calSel") == '2027-03-15' and pg.evaluate("[calY, calM]") == [2027, 2], 'pinchar un día cierra la vista y lleva a ese día')
    pg.click('#calYearBtn'); pg.wait_for_timeout(400)
    pg.locator('.modal .yc-mt[data-month="6"]').click(); pg.wait_for_timeout(400)
    ok(pg.evaluate("[calY, calM]") == [2027, 6], 'pinchar el nombre de un mes lleva a ese mes')

    # ===== Móvil =====
    m = ctx.new_page()
    m.on('pageerror', lambda e: errs.append('PAGEERR móvil ' + str(e)))
    m.set_viewport_size({'width': 390, 'height': 800})
    m.goto(URL); m.wait_for_timeout(1100)
    m.evaluate(SEMANAL); m.wait_for_timeout(300)
    m.locator('.cal-cell[data-day="2026-11-04"] .cal-chip').click(force=True); m.wait_for_timeout(400)
    ok(m.locator('#modalBack.open').count() == 0 and m.evaluate("calSel") == '2026-11-04', 'en el móvil, tocar una rayita elige el día sin abrir nada')
    m.click('#calYearBtn'); m.wait_for_timeout(400)
    caja = m.locator('.modal').bounding_box()
    ok(caja['x'] >= 0 and caja['x'] + caja['width'] <= 390, 'la vista del año cabe en el móvil')
    ok(m.evaluate("document.querySelector('.yc-grid').scrollWidth <= document.querySelector('.yc-grid').clientWidth"), 'sin desbordarse de lado')
    m.close()

    print('ERRORS', errs)
    print('FAILS:', len(fails), fails)
