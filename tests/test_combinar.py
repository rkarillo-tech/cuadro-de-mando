import os as _os, sys as _sys, tempfile as _tf, json
_ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), '..'))
_HTML = 'file://' + _os.path.join(_ROOT, 'CuadroDeMando.html')
if len(_sys.argv) < 2: _sys.argv.append(_tf.mkdtemp(prefix='cdm-test-'))
import sys
from playwright.sync_api import sync_playwright
URL=_HTML
SC=sys.argv[1]
errs=[]; fails=[]
def ok(c,m):
    print(('PASS ' if c else 'FAIL ')+m, flush=True)
    if not c: fails.append(m)
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1300,'height':900}); pg=ctx.new_page()
    pg.on('pageerror', lambda e: errs.append('PAGEERR '+str(e)))
    pg.on('console', lambda m: errs.append('console:'+m.text) if m.type=='error' else None)
    pg.goto(URL); pg.wait_for_timeout(900); pg.evaluate("localStorage.clear(); indexedDB.deleteDatabase('cdm-data'); indexedDB.deleteDatabase('cdm-hist'); indexedDB.deleteDatabase('cdm-fs'); 0"); pg.goto('about:blank'); pg.goto(URL); pg.wait_for_timeout(900)

    # ===== Seguimiento de cambios =====
    r=pg.evaluate("""()=>{const a=createNote('Uno','<div>a</div>',false), b=createNote('Dos','<div>b</div>',false);
      addTodoFromText('Tarea A','inbox'); addTodoFromText('Tarea B','inbox');
      return [!!a._m, !!b._m, S.todos.every(t=>t._m>0)]}""")
    ok(all(r),'los elementos nuevos reciben fecha de modificación')
    m0=pg.evaluate("S.todos.find(t=>t.text==='Tarea A')._m"); pg.wait_for_timeout(20)
    pg.evaluate("S.todos.find(t=>t.text==='Tarea A').text='Tarea A2'; save.todos()")
    ok(pg.evaluate("S.todos.find(t=>t.text==='Tarea A2')._m")>m0,'modificar actualiza su fecha')
    m1=pg.evaluate("S.todos.find(t=>t.text==='Tarea B')._m"); pg.evaluate("save.todos()")
    ok(pg.evaluate("S.todos.find(t=>t.text==='Tarea B')._m")==m1,'guardar sin cambios no toca la fecha')
    bid=pg.evaluate("S.todos.find(t=>t.text==='Tarea B').id")
    pg.evaluate(f"deleteTodo({bid!r})")
    ok(pg.evaluate(f"!!(MEM.tombstones||{{}})['todos:{bid}']"),'borrar deja una lápida')
    pg.evaluate(f"S.todos.push({{id:{bid!r},listId:'inbox',text:'Tarea B',done:false,due:'',steps:[],created:1}}); save.todos()")
    ok(pg.evaluate(f"!(MEM.tombstones||{{}})['todos:{bid}']"),'si vuelve (deshacer), la lápida desaparece')

    # ===== Combinar: lógica =====
    r=pg.evaluate("""()=>{
      const L={lastChange:200, notes:[{id:'n1',title:'Solo aquí',_m:100},{id:'n2',title:'Ambos v-aquí',_m:150},{id:'n3',title:'Borrada allí',_m:50},{id:'n5',title:'Igual',_m:10}],
               prefs:{a:1,b:1}, calcHistory:[{e:'1+1'}], tombstones:{}};
      const R={lastChange:300, notes:[{id:'n2',title:'Ambos v-allí',_m:250},{id:'n4',title:'Nueva allí',_m:260},{id:'n5',title:'Igual',_m:10}],
               prefs:{b:2,c:3}, calcHistory:[{e:'1+1'},{e:'2+2'}], tombstones:{'notes:n3':280}};
      const M=mergeData(L,R), d=diffData(L,R,M);
      return {titles:M.notes.map(n=>n.title), prefs:M.prefs, calc:M.calcHistory.length, tomb:Object.keys(M.tombstones),
              lose:d.replaceLoses, adds:d.mergeAdds, upd:d.mergeUpdates, del:d.mergeDeletes}}""")
    ok(r['titles']==['Solo aquí','Ambos v-allí','Igual','Nueva allí'],'combinar conserva lo de los dos, gana lo más reciente y respeta borrados: '+str(r['titles']))
    ok(r['prefs']=={'a':1,'b':2,'c':3} and r['calc']==2 and r['tomb']==['notes:n3'],'objetos y listas sin id también se combinan')
    ok(r['lose']==1 and r['adds']==1 and r['upd']==1 and r['del']==1,'resumen de diferencias: '+str(r))
    r=pg.evaluate("""()=>{const L={lastChange:1,notes:[{id:'x',title:'Editada después',_m:500}]},R={lastChange:2,notes:[],tombstones:{'notes:x':400}};return mergeData(L,R).notes.length}""")
    ok(r==1,'si se editó después de borrarse en otro sitio, se conserva')

    # ===== Importar con vista previa: combinar =====
    other=pg.evaluate("""()=>{const d=JSON.parse(JSON.stringify(MEM)); const now=Date.now()+5000;
      d.notes.push({id:'movil1',title:'Nota del móvil',html:'<div>móvil</div>',text:'móvil',pinned:false,created:now,updated:now,_m:now});
      const t=d.todos.find(t=>t.text==='Tarea A2'); t.text='Tarea A3 (móvil)'; t._m=now;
      const dos=d.notes.find(n=>n.title==='Dos'); d.notes=d.notes.filter(n=>n!==dos); d.tombstones=Object.assign({},d.tombstones,{['notes:'+dos.id]:now});
      d.lastChange=now; return backupPlain(d)}""")
    pg.evaluate("createNote('Solo en el portátil','<div>p</div>',false); 0")
    f=_os.path.join(SC,'copia_movil.json'); open(f,'w').write(json.dumps(other))
    pg.evaluate("showTab('settings')"); pg.wait_for_timeout(200)
    pg.set_input_files('#bkImportFile', f); pg.wait_for_timeout(500)
    t=pg.inner_text('#modal')
    ok('Si combinas' in t and 'Si reemplazas' in t,'la importación muestra qué pasa al combinar y al reemplazar')
    ok('se perderían 1 elemento que solo está' in t,'avisa de lo que se perdería al reemplazar: '+t[:300].replace('\n',' '))
    ok('+1 nuevo' in t and '1 actualizado' in t and '1 borrado' in t,'resumen al combinar')
    pg.click('#modal .df-table tr:has-text("Notas") summary'); pg.wait_for_timeout(150)
    ok('Solo en el portátil' in pg.inner_text('#modal') and 'Nota del móvil' in pg.inner_text('#modal'),'detalle con los títulos')
    pg.screenshot(path=SC+'/combinar.png')
    pg.click('.modal-foot .btn.primary'); pg.wait_for_timeout(2200)
    r=pg.evaluate("[S.notes.map(n=>n.title).sort(), S.todos.map(t=>t.text).sort()]")
    ok('Nota del móvil' in r[0] and 'Solo en el portátil' in r[0] and 'Dos' not in r[0],'combinar: llega lo nuevo, se conserva lo local y se aplica el borrado: '+str(r[0]))
    ok('Tarea A3 (móvil)' in r[1],'combinar: gana la versión más reciente')
    hl=pg.evaluate("(async()=>{const l=await histAll(); return l.map(x=>x.label)})()")
    ok(any('Antes de combinar' in x for x in hl),'antes de combinar se guarda una versión')

    # ===== Reemplazar con pérdidas pide confirmación =====
    pg.evaluate("createNote('Otra local','<div>x</div>',false); 0")
    pg.evaluate("showTab('settings')"); pg.set_input_files('#bkImportFile', f); pg.wait_for_timeout(500)
    pg.click('.modal-foot button:has-text("Reemplazar todo")'); pg.wait_for_timeout(300)
    ok('Seguro que no prefieres combinar' in pg.inner_text('#modal'),'reemplazar con pérdidas pide confirmación')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    ok('Otra local' in pg.evaluate("S.notes.map(n=>n.title)"),'cancelar no cambia nada')

    # ===== Archivo vinculado modificado por otro dispositivo mientras la app está abierta =====
    pg.evaluate("""()=>{ window.__F={txt:JSON.stringify(backupPlain()), m:1000};
      fsHandle={name:'cdm.json', getFile:async()=>({lastModified:__F.m, text:async()=>__F.txt}),
        createWritable:async()=>({write:async t=>{__F.txt=t;}, close:async()=>{__F.m++;}}), queryPermission:async()=>'granted'};
      fsState='ok'; fsSeenMtime=1000; }""")
    pg.evaluate("createNote('Cambio local','<div>l</div>',false); fsWrite(); 0"); pg.wait_for_timeout(400)
    ok(pg.evaluate("JSON.parse(__F.txt).data.notes.some(n=>n.title==='Cambio local')"),'sin cambios externos, guarda en el archivo con normalidad')
    pg.evaluate("""()=>{const d=JSON.parse(__F.txt).data; const now=Date.now()+9000; d.notes.push({id:'otro1',title:'Del otro portátil',html:'',text:'',created:now,updated:now,_m:now}); d.lastChange=now; __F.txt=JSON.stringify(backupPlain(d)); __F.m+=50;}""")
    pg.evaluate("createNote('Otro cambio local','<div>l</div>',false); fsWrite(); 0"); pg.wait_for_timeout(600)
    t=pg.inner_text('#modal') if pg.is_visible('#modal') else ''
    ok('Combinar' in t and ('archivo' in t),'si otro dispositivo cambió el archivo, no lo pisa: pregunta')
    ok('Otro cambio local' not in pg.evaluate("__F.txt"),'el archivo no se ha sobrescrito')
    pg.click('.modal-foot .btn.primary'); pg.wait_for_timeout(2200)
    r=pg.evaluate("S.notes.map(n=>n.title)")
    ok('Del otro portátil' in r and 'Otro cambio local' in r,'combinar con el archivo junta los dos: '+str(r))
    m=ctx.new_page(); m.set_viewport_size({'width':390,'height':844}); m.goto(URL); m.wait_for_timeout(900)
    m.evaluate("showTab('settings')"); m.set_input_files('#bkImportFile', f); m.wait_for_timeout(500)
    ok(m.evaluate("document.documentElement.scrollWidth")<=390,'vista previa en móvil sin scroll horizontal')
    m.screenshot(path=SC+'/combinar_movil.png')
    print('ERRORS:',[e for e in errs if 'Failed to load resource' not in e]); print('FAILS:',len(fails))
