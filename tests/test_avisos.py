import os as _os, sys as _sys, tempfile as _tf
_ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), '..'))
_HTML = 'file://' + _os.path.join(_ROOT, 'CuadroDeMando.html')
if len(_sys.argv) < 2: _sys.argv.append(_tf.mkdtemp(prefix='cdm-test-'))
# Avisos de eventos: hora concreta, cartel que se queda en pantalla, posponer y .ics
from playwright.sync_api import sync_playwright
URL = _HTML
errs = []; fails = []
def ok(c, m):
    print(('PASS ' if c else 'FAIL ') + m, flush=True)
    if not c: fails.append(m)

with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1400, 'height': 950})
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
    pg.goto(URL); pg.wait_for_timeout(900)
    pg.evaluate("localStorage.clear(); indexedDB.deleteDatabase('cdm-data'); 0")
    pg.goto('about:blank'); pg.goto(URL); pg.wait_for_timeout(1200)

    # ===== Cuentas de la hora del aviso =====
    ok(pg.evaluate("alarmValue('custom','-1','20:00')") == '-1@20:00', 'una hora concreta del día antes se guarda como «-1@20:00»')
    ok(pg.evaluate("alarmValue('custom','0','7:5')") == '', 'una hora mal escrita no se guarda')
    ok(pg.evaluate("alarmValue('15m','0','09:00')") == '15m', 'los avisos «antes» se guardan tal cual')
    ok(pg.evaluate("alarmValue('loquesea','0','09:00')") == '', 'un valor inventado se descarta')
    ok(pg.evaluate("JSON.stringify(alarmParts('-2@08:30'))") == '{"preset":"custom","day":-2,"time":"08:30"}', 'y al editar el evento se vuelven a separar en día y hora')
    ok(pg.evaluate("alarmLabel('-1@20:00')") == '20:00 · el día antes' and pg.evaluate("alarmLabel('30m')") == '30 minutos antes', 'cada aviso se enseña en palabras')
    ok(pg.evaluate("""(() => {
        const ev = {alarm:'@07:30', allDay:false, start:'10:00'};
        const d = new Date(alarmAt(ev,'2026-12-01'));
        return [d.getFullYear(), d.getMonth()+1, d.getDate(), d.getHours(), d.getMinutes()].join('-');
      })()""") == '2026-12-1-7-30', 'la hora concreta cae ese día a esa hora exacta')
    ok(pg.evaluate("""(() => {
        const d = new Date(alarmAt({alarm:'-1@20:00'}, '2026-12-01'));
        return [d.getMonth()+1, d.getDate(), d.getHours()].join('-');
      })()""") == '11-30-20', 'y «el día antes a las 20:00» cae en el día anterior')
    ok(pg.evaluate("""(() => {
        const d = new Date(alarmAt({alarm:'30m', allDay:false, start:'10:00'}, '2026-12-01'));
        return d.getHours()+':'+d.getMinutes();
      })()""") == '9:30', '«30 minutos antes» se cuenta desde la hora de inicio')
    ok(pg.evaluate("""(() => {
        const d = new Date(alarmAt({alarm:'at', allDay:true}, '2026-12-01'));
        return d.getHours()+':'+d.getMinutes();
      })()""") == '9:0', 'en un evento de todo el día, el aviso sale a las 9:00')
    ok(pg.evaluate("alarmAt({alarm:''},'2026-12-01')") == 0, 'sin aviso no hay hora que calcular')

    # ===== El formulario del evento =====
    pg.evaluate("showTab('calendar'); openEvent(); 0"); pg.wait_for_timeout(500)
    ok(pg.locator('.modal select[name=alarm]').count() == 1, 'el formulario del evento tiene el campo «Aviso»')
    ok(not pg.is_visible('#evAlarmWhen'), 'la hora concreta está escondida mientras no se pide')
    pg.select_option('.modal select[name=alarm]', 'custom'); pg.wait_for_timeout(250)
    ok(pg.is_visible('#evAlarmWhen') and pg.locator('.modal input[name=alarmTime]').count() == 1, 'al elegir «A una hora concreta…» aparecen el día y la hora')
    pg.fill('.modal input[name=title]', 'Reunión con sistemas')
    pg.fill('.modal input[name=date]', '2026-12-01')
    pg.fill('.modal input[name=alarmTime]', '')
    pg.locator('.modal button:has-text("Crear")').click(); pg.wait_for_timeout(350)
    ok(pg.locator('.modal').count() > 0 and 'hora del aviso' in pg.inner_text('.modal'), 'si falta la hora del aviso, avisa y no crea el evento')
    pg.select_option('.modal select[name=alarmDay]', '-1')
    pg.fill('.modal input[name=alarmTime]', '20:00')
    pg.locator('.modal button:has-text("Crear")').click(); pg.wait_for_timeout(500)
    ok(pg.evaluate("(S.events.find(e=>e.title==='Reunión con sistemas')||{}).alarm") == '-1@20:00', 'el evento se guarda con el aviso elegido')
    ok('⏰' in pg.inner_text('#calDayList, #calUpcoming'), 'en la agenda se ve que ese evento lleva aviso')
    pg.evaluate("openEvent(S.events.find(e=>e.title==='Reunión con sistemas').id); 0"); pg.wait_for_timeout(450)
    ok(pg.input_value('.modal select[name=alarm]') == 'custom' and pg.input_value('.modal input[name=alarmTime]') == '20:00' and pg.input_value('.modal select[name=alarmDay]') == '-1', 'al reabrirlo, el aviso sale tal como se dejó')
    pg.select_option('.modal select[name=alarm]', '')
    pg.locator('.modal button:has-text("Guardar")').click(); pg.wait_for_timeout(400)
    ok(pg.evaluate("'alarm' in S.events.find(e=>e.title==='Reunión con sistemas')") is False, 'quitar el aviso lo borra del evento')
    pg.evaluate("S.events = []; save.events(); 0")

    # ===== El cartel se queda en pantalla =====
    pg.evaluate("""(() => {
      const ayer = dayKey(addDays(new Date(), 0));
      const h = new Date(Date.now() - 10*60000);
      S.events = [{id:'e1', title:'Llamar al cliente', date:ayer, allDay:false,
                   start:pad(h.getHours())+':'+pad(h.getMinutes()), end:'23:59', color:COLORS[0],
                   repeat:'', until:'', alarm:'at', notes:'Pendiente la factura', created:Date.now()}];
      save.events(); avCheck(); 0})()"""); pg.wait_for_timeout(500)
    ok(pg.is_visible('#avisos .aviso'), 'cuando pasa la hora, el aviso aparece en pantalla')
    ok('Llamar al cliente' in pg.inner_text('#avisos') and 'Pendiente la factura' in pg.inner_text('#avisos'), 'con el título del evento y sus notas')
    import re as _re
    ok(bool(_re.search(r'hace 1[012] min', pg.inner_text('#avisos'))), 'y dice de cuándo era el aviso')
    ok('⏰ (1)' in pg.title(), 'el título de la pestaña lleva el contador de avisos')
    pg.evaluate("showTab('notes'); avCheck(); 0"); pg.wait_for_timeout(300)
    ok(pg.is_visible('#avisos .aviso'), 'cambiar de sección no se lo lleva: se queda hasta cerrarlo')
    pg.evaluate("avCheck(); avCheck(); 0"); pg.wait_for_timeout(200)
    ok(pg.locator('#avisos .aviso').count() == 1, 'y no se duplica por mucho que se compruebe')

    # ===== Ver en el calendario, posponer y cerrar =====
    pg.locator('#avisos [data-av-go]').click(); pg.wait_for_timeout(500)
    ok(pg.evaluate("currentTab") == 'calendar' and pg.evaluate("calSel") == pg.evaluate("dayKey(new Date())"), '«Ver en el calendario» lleva al día del evento')
    pg.select_option('#avisos [data-av-snooze]', '30'); pg.wait_for_timeout(400)
    ok(not pg.is_visible('#avisos .aviso') and pg.evaluate("store.get('alarmSnooze',{})['e1|'+dayKey(new Date())] > Date.now()") is True, 'posponer lo quita de la pantalla y lo deja para más tarde')
    pg.evaluate("const v=store.get('alarmSnooze',{}); delete v['e1|'+dayKey(new Date())]; store.set('alarmSnooze',v); avCheck(); 0"); pg.wait_for_timeout(400)
    ok(pg.is_visible('#avisos .aviso'), 'cuando vence lo pospuesto, vuelve a avisar')
    pg.locator('#avisos [data-av-close]').click(); pg.wait_for_timeout(400)
    ok(not pg.is_visible('#avisos .aviso') and pg.title().startswith('Cuadro'), 'al cerrarlo desaparece y el título vuelve a la normalidad')
    pg.evaluate("avCheck(); 0"); pg.wait_for_timeout(300)
    ok(not pg.is_visible('#avisos .aviso'), 'y ya no vuelve a salir')
    ok(pg.evaluate("Object.keys(store.get('alarmSeen',{})).length") == 1, 'queda apuntado que ese aviso ya se vio')
    ok(pg.evaluate("(() => { const a = dataSig(MEM); const v = store.get('alarmSeen',{}); v['zz|2026-01-01'] = Date.now(); store.set('alarmSeen', v); return sameData(MEM, {...MEM, alarmSeen:{}}) && dataSig(MEM) === a; })()") is True, 'lo cerrado no cuenta como cambio de datos (no reescribe el archivo compartido)')
    ok(pg.evaluate("VOLATILE_KEYS.has('alarmSeen') && VOLATILE_KEYS.has('alarmSnooze')") is True, 'y por eso no viaja al otro portátil ni lo reescribe')

    # ===== Varios avisos a la vez =====
    pg.evaluate("""(() => {
      const hoy = dayKey(new Date()), h = pad(new Date(Date.now()-5*60000).getHours())+':'+pad(new Date(Date.now()-5*60000).getMinutes());
      S.events = [1,2,3].map(n => ({id:'m'+n, title:'Evento '+n, date:hoy, allDay:false, start:h, end:'23:59',
                                    color:COLORS[1], repeat:'', until:'', alarm:'at', notes:'', created:Date.now()}));
      save.events(); store.set('alarmSeen',{}); avCheck(); 0})()"""); pg.wait_for_timeout(500)
    ok(pg.locator('#avisos .aviso').count() == 3 and '3 avisos' in pg.inner_text('#avisos'), 'si coinciden varios, se ven todos con su cabecera')
    pg.locator('#avisos [data-av-all]').click(); pg.wait_for_timeout(400)
    ok(not pg.is_visible('#avisos .aviso'), '«Cerrar todos» los cierra de una vez')

    # ===== Avisos muy viejos y eventos periódicos =====
    pg.evaluate("""(() => {
      S.events = [{id:'v1', title:'Aviso antiguo', date:dayKey(addDays(new Date(),-5)), allDay:true,
                   start:'09:00', end:'10:00', color:COLORS[2], repeat:'', until:'', alarm:'at', notes:'', created:Date.now()}];
      save.events(); store.set('alarmSeen',{}); store.set('alarmSnooze',{}); avInit(); 0})()"""); pg.wait_for_timeout(500)
    ok(not pg.is_visible('#avisos .aviso'), 'un aviso de hace días no salta al abrir la app (se da por visto)')
    pg.evaluate("""(() => {
      const h = new Date(Date.now()-3*60000);
      S.events = [{id:'r1', title:'Diario', date:dayKey(addDays(new Date(),-30)), allDay:false,
                   start:pad(h.getHours())+':'+pad(h.getMinutes()), end:'23:59', color:COLORS[3],
                   repeat:'daily', until:'', alarm:'at', notes:'', created:Date.now()}];
      save.events(); store.set('alarmSeen',{}); avCheck(); 0})()"""); pg.wait_for_timeout(500)
    ok(pg.locator('#avisos .aviso').count() == 1, 'en un evento que se repite, avisa solo la repetición de hoy')
    pg.evaluate("avCloseAll(); S.events=[]; save.events(); 0"); pg.wait_for_timeout(300)

    # ===== Ajustes: próximos avisos =====
    pg.evaluate("""(() => {
      S.events = [{id:'p1', title:'Revisión del coche', date:dayKey(addDays(new Date(),3)), allDay:true,
                   start:'09:00', end:'10:00', color:COLORS[0], repeat:'', until:'', alarm:'-1@20:00', notes:'', created:Date.now()}];
      save.events(); showTab('settings'); 0})()"""); pg.wait_for_timeout(600)
    ok(pg.is_visible('#avCard'), 'Ajustes tiene su apartado de avisos')
    ok('Revisión del coche' in pg.inner_text('#avNext') and '20:00' in pg.inner_text('#avNext'), 'y lista los próximos avisos con su hora')
    ok(pg.is_visible('#avSound'), 'con el interruptor de sonido')
    pg.uncheck('#avSound'); pg.wait_for_timeout(300)
    ok(pg.evaluate("avPrefs().sound") is False, 'que se guarda')
    pg.check('#avSound'); pg.wait_for_timeout(300)

    # ===== .ics: el aviso va y viene =====
    ics = pg.evaluate("buildIcs(false)")
    ok('BEGIN:VALARM' in ics and 'TRIGGER;VALUE=DATE-TIME:' in ics, 'al exportar el calendario, el aviso viaja en el .ics')
    pg.evaluate("S.events=[{id:'x1',title:'Con aviso',date:'2026-12-01',allDay:false,start:'10:00',end:'11:00',color:COLORS[0],repeat:'',until:'',alarm:'15m',notes:'',created:Date.now()}]; save.events(); 0")
    ok('TRIGGER:-PT15M' in pg.evaluate("buildIcs(false)"), 'y los avisos «antes» salen como los entienden Outlook o Google')
    ok(pg.evaluate("(parseIcs(buildIcs(false))[0]||{}).alarm") == '15m', 'si se vuelve a importar, el aviso se recupera igual')
    ok(pg.evaluate("""(parseIcs(['BEGIN:VCALENDAR','BEGIN:VEVENT','UID:a','DTSTART:20261201T100000','DTEND:20261201T110000','SUMMARY:Ajeno','DESCRIPTION:Texto del evento','BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:Recordatorio','TRIGGER:-PT1H','END:VALARM','END:VEVENT','END:VCALENDAR'].join('\\r\\n'))[0]||{}).alarm""") == '1h', 'un .ics de fuera con aviso de 1 hora se importa bien')
    ok(pg.evaluate("""(parseIcs(['BEGIN:VCALENDAR','BEGIN:VEVENT','UID:a','DTSTART:20261201T100000','SUMMARY:Ajeno','DESCRIPTION:Texto del evento','BEGIN:VALARM','DESCRIPTION:Recordatorio','TRIGGER:-PT1H','END:VALARM','END:VEVENT','END:VCALENDAR'].join('\\r\\n'))[0]||{}).notes""") == 'Texto del evento', 'y el texto del aviso ya no se come la descripción del evento')

    # ===== Con la app bloqueada no se enseña nada =====
    pg.evaluate("""(() => {
      const h = new Date(Date.now()-4*60000);
      S.events=[{id:'b1',title:'Cita privada',date:dayKey(new Date()),allDay:false,
                 start:pad(h.getHours())+':'+pad(h.getMinutes()),end:'23:59',color:COLORS[0],
                 repeat:'',until:'',alarm:'at',notes:'',created:Date.now()}];
      save.events(); store.set('alarmSeen',{}); avCheck(); 0})()"""); pg.wait_for_timeout(400)
    ok(pg.is_visible('#avisos .aviso'), 'el aviso se ve con la app abierta')
    pg.evaluate("showLockScreen(); avCheck(); 0"); pg.wait_for_timeout(300)
    ok(not pg.is_visible('#avisos .aviso'), 'pero si bloqueas la app, el aviso no asoma por encima de la pantalla de bloqueo')
    pg.evaluate("$('#lockScreen').hidden = true; avCheck(); 0"); pg.wait_for_timeout(300)
    ok(pg.is_visible('#avisos .aviso'), 'y vuelve al desbloquear')
    pg.evaluate("avCloseAll(); S.events=[]; save.events(); 0"); pg.wait_for_timeout(200)

    # ===== Tareas: aviso a una hora concreta del día en que vencen =====
    pg.evaluate("""(() => { S.todos=[{id:'t1', listId:'inbox', text:'Pagar el seguro', done:false, due:'', important:false,
        repeat:'', notes:'', steps:[], created:Date.now(), order:0}]; save.todos(); showTab('todos'); openTodo('t1'); 0})()"""); pg.wait_for_timeout(500)
    ok(pg.locator('.modal select[name=alarmDay]').count() == 1, 'el formulario de la tarea tiene el campo «Aviso»')
    ok(not pg.is_visible('.modal input[name=alarmTime]'), 'la hora está escondida mientras no hay aviso')
    pg.select_option('.modal select[name=alarmDay]', '-1'); pg.wait_for_timeout(200)
    ok(pg.is_visible('.modal input[name=alarmTime]'), 'al elegir el día aparece la hora')
    pg.fill('.modal input[name=alarmTime]', '20:00')
    pg.locator('.modal button:has-text("Guardar")').click(); pg.wait_for_timeout(350)
    ok(pg.locator('.modal').count() > 0 and 'fecha' in pg.inner_text('.modal'), 'sin fecha no deja poner aviso')
    pg.fill('.modal input[name=due]', '2026-12-01')
    pg.locator('.modal button:has-text("Guardar")').click(); pg.wait_for_timeout(450)
    ok(pg.evaluate("S.todos[0].alarm") == '-1@20:00', 'la tarea se guarda con su aviso')
    pg.evaluate("todoView='all'; renderTodos(); 0"); pg.wait_for_timeout(200)
    ok('⏰ 20:00' in pg.locator('.todo-item[data-id=t1]').inner_text(), 'en la lista se ve que la tarea lleva aviso')
    pg.evaluate("openTodo('t1'); 0"); pg.wait_for_timeout(400)
    ok(pg.input_value('.modal select[name=alarmDay]') == '-1' and pg.input_value('.modal input[name=alarmTime]') == '20:00', 'al reabrirla, el aviso sale tal como se dejó')
    pg.select_option('.modal select[name=alarmDay]', '')
    pg.locator('.modal button:has-text("Guardar")').click(); pg.wait_for_timeout(400)
    ok(pg.evaluate("'alarm' in S.todos[0]") is False, 'quitar el aviso lo borra de la tarea')

    pg.evaluate("""(() => { const h = new Date(Date.now()-6*60000);
        S.todos=[{id:'t2', listId:'inbox', text:'Llamar al gestor', done:false, due:dayKey(new Date()), important:false,
          repeat:'', notes:'Lo del IVA', steps:[], created:Date.now(), order:0, alarm:'@'+pad(h.getHours())+':'+pad(h.getMinutes())}];
        S.events=[]; save.todos(); save.events(); store.set('alarmSeen',{}); store.set('alarmSnooze',{}); avCheck(); 0})()"""); pg.wait_for_timeout(450)
    ok(pg.is_visible('#avisos .aviso') and 'Llamar al gestor' in pg.inner_text('#avisos') and 'Vence hoy' in pg.inner_text('#avisos'), 'el aviso de una tarea sale en pantalla, con cuándo vence')
    ok(pg.locator('#avisos [data-av-go]').inner_text().find('tarea') >= 0, 'con un botón para abrir la tarea')
    pg.locator('#avisos [data-av-done]').click(); pg.wait_for_timeout(450)
    ok(pg.evaluate("S.todos.find(t=>t.id==='t2').done") is True and not pg.is_visible('#avisos .aviso'), '«✓ Hecha» la completa y cierra el aviso')

    pg.evaluate("""(() => { const h = new Date(Date.now()-3*60000);
        S.todos=[{id:'t3', listId:'inbox', text:'Regar', done:false, due:dayKey(new Date()), important:false,
          repeat:'', notes:'', steps:[], created:Date.now(), order:0, alarm:'@'+pad(h.getHours())+':'+pad(h.getMinutes())}];
        save.todos(); store.set('alarmSeen',{}); avCheck(); 0})()"""); pg.wait_for_timeout(400)
    ok(pg.is_visible('#avisos .aviso'), 'otra tarea con aviso vencido sale en pantalla')
    pg.evaluate("completeTodo('t3'); 0"); pg.wait_for_timeout(400)
    ok(not pg.is_visible('#avisos .aviso'), 'y completarla desde la lista quita el aviso al momento')

    # ===== Kanban =====
    pg.evaluate("S.tasks=[]; save.tasks(); showTab('kanban'); openTask(null,'todo'); 0"); pg.wait_for_timeout(450)
    ok(pg.locator('.modal select[name=alarmDay]').count() == 1, 'el formulario de la tarjeta tiene el campo «Aviso»')
    pg.fill('.modal input[name=title]', 'Entregar informe')
    pg.fill('.modal input[name=due]', '2026-12-01')
    pg.select_option('.modal select[name=alarmDay]', '0'); pg.fill('.modal input[name=alarmTime]', '08:30')
    pg.locator('.modal button:has-text("Crear tarea")').click(); pg.wait_for_timeout(450)
    ok(pg.evaluate("S.tasks[0].alarm") == '@08:30', 'la tarjeta se guarda con su aviso')
    ok('⏰ 08:30' in pg.inner_text('#kbBoard'), 'y en el tablero se ve el aviso en la tarjeta')
    pg.evaluate("S.tasks[0].due = dayKey(addDays(new Date(), 2)); save.tasks(); showTab('settings'); 0"); pg.wait_for_timeout(400)
    ok('Entregar informe' in pg.inner_text('#avNext'), 'los avisos de tarjetas también salen en «Próximos avisos»')
    pg.evaluate("showTab('kanban'); openTask(S.tasks[0].id); 0"); pg.wait_for_timeout(400)
    pg.select_option('.modal select[name=alarmDay]', '')
    pg.locator('.modal button:has-text("Guardar")').click(); pg.wait_for_timeout(400)
    ok(pg.evaluate("'alarm' in S.tasks[0]") is False, 'quitar el aviso lo borra de la tarjeta')

    pg.evaluate("""(() => { const h = new Date(Date.now()-4*60000);
        S.tasks=[{id:'k1', title:'Revisar contrato', desc:'', col:'doing', priority:'alta', due:dayKey(new Date()), tags:[], subtasks:[],
          created:Date.now(), alarm:'@'+pad(h.getHours())+':'+pad(h.getMinutes())}];
        save.tasks(); store.set('alarmSeen',{}); avCheck(); 0})()"""); pg.wait_for_timeout(400)
    ok(pg.is_visible('#avisos .aviso') and 'Revisar contrato' in pg.inner_text('#avisos') and 'Kanban' in pg.inner_text('#avisos'), 'el aviso de una tarjeta sale en pantalla')
    pg.locator('#avisos [data-av-go]').click(); pg.wait_for_timeout(450)
    ok(pg.evaluate("currentTab") == 'kanban' and pg.locator('.modal input[name=title]').input_value() == 'Revisar contrato', '«Abrir la tarjeta» lleva a ella')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pg.locator('#avisos [data-av-done]').click(); pg.wait_for_timeout(400)
    ok(pg.evaluate("S.tasks[0].col") == 'done' and not pg.is_visible('#avisos .aviso'), '«✓ Hecha» la pasa a Hecho y cierra el aviso')

    # ===== El aviso viaja al pasar de Tareas al Kanban y viceversa, y en el .ics =====
    pg.evaluate("""S.todos=[{id:'t9', listId:'inbox', text:'Viajera', done:false, due:'2026-12-01', important:false, repeat:'', notes:'', steps:[], created:Date.now(), order:0, alarm:'-1@20:00'}];
        S.tasks=[]; save.todos(); save.tasks(); todoToKanban('t9'); 0"""); pg.wait_for_timeout(300)
    ok(pg.evaluate("(S.tasks.find(t=>t.title==='Viajera')||{}).alarm") == '-1@20:00', 'al pasar una tarea al Kanban conserva su aviso')
    pg.evaluate("taskToTodo(S.tasks.find(t=>t.title==='Viajera').id); 0"); pg.wait_for_timeout(300)
    ok(pg.evaluate("(S.todos.find(t=>t.text==='Viajera')||{}).alarm") == '-1@20:00', 'y al volver a Tareas también')
    ok('BEGIN:VALARM' in pg.evaluate("buildIcs(true)"), 'al exportar el .ics con tareas, su aviso va dentro')
    pg.evaluate("avPrune(); 0")
    ok(pg.evaluate("Object.keys(store.get('alarmSeen',{})).every(k => !k.startsWith('td:t2|') && !k.startsWith('kb:k1|'))") is True, 'lo cerrado de tareas y tarjetas que ya no existen se limpia')
    pg.evaluate("S.todos=[]; S.tasks=[]; save.todos(); save.tasks(); 0")

    # ===== Móvil =====
    m = ctx.new_page()
    m.on('pageerror', lambda e: errs.append('PAGEERR móvil ' + str(e)))
    m.set_viewport_size({'width': 390, 'height': 800})
    m.goto(URL); m.wait_for_timeout(1200)
    m.evaluate("""(() => {
      const h = new Date(Date.now()-2*60000);
      S.events=[{id:'mo1',title:'Aviso en el móvil',date:dayKey(new Date()),allDay:false,
                 start:pad(h.getHours())+':'+pad(h.getMinutes()),end:'23:59',color:COLORS[0],
                 repeat:'',until:'',alarm:'at',notes:'',created:Date.now()}];
      save.events(); store.set('alarmSeen',{}); avCheck(); 0})()"""); m.wait_for_timeout(500)
    caja = m.locator('#avisos').bounding_box()
    ok(m.is_visible('#avisos .aviso') and caja['width'] <= 390 and caja['x'] >= 0, 'en el móvil el aviso cabe en la pantalla')
    ok(caja['y'] + caja['height'] <= 800 - 50, 'y no se mete debajo de la barra de abajo')
    m.locator('#avisos [data-av-close]').click(); m.wait_for_timeout(300)
    ok(not m.is_visible('#avisos .aviso'), 'y se cierra con un toque')
    m.close()

    print('ERRORS', errs)
