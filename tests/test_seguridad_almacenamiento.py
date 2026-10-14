import os as _os, sys as _sys, tempfile as _tf
_ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), '..'))
_HTML = 'file://' + _os.path.join(_ROOT, 'CuadroDeMando.html')
if len(_sys.argv) < 2: _sys.argv.append(_tf.mkdtemp(prefix='cdm-test-'))
import sys, json, time
from playwright.sync_api import sync_playwright
URL=_HTML
SC=sys.argv[1]
errs=[]; fails=[]; csp=[]
def ok(c,m):
    print(('PASS ' if c else 'FAIL ')+m, flush=True)
    if not c: fails.append(m)
def idb_dump(pg):
    return pg.evaluate("""new Promise(res=>{const r=indexedDB.open('cdm-data');r.onsuccess=()=>{const db=r.result;if(!db.objectStoreNames.contains('kv')){db.close();res({});return;}const tx=db.transaction('kv','readonly'),st=tx.objectStore('kv'),k=st.getAllKeys(),v=st.getAll();tx.oncomplete=()=>{const o={};k.result.forEach((x,i)=>o[x]=v.result[i]);db.close();res(o)}}})""")
def fresh(pg):
    pg.goto(URL); pg.wait_for_timeout(900); pg.evaluate("localStorage.clear(); indexedDB.deleteDatabase('cdm-data'); indexedDB.deleteDatabase('cdm-hist'); 0"); pg.goto('about:blank'); pg.goto(URL); pg.wait_for_timeout(900)
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1400,'height':900}); pg=ctx.new_page()
    pg.on('pageerror', lambda e: errs.append('PAGEERR '+str(e)))
    def con(m):
        if 'Content Security Policy' in m.text or 'Refused' in m.text: csp.append(m.text)
        elif m.type=='error': errs.append('console:'+m.text)
    pg.on('console', con)
    fresh(pg)
    # ---------- IndexedDB ----------
    ok(pg.evaluate("BACKEND.kind")=='idb','motor de almacenamiento: IndexedDB')
    pg.evaluate("addTodoFromText('Tarea en IndexedDB','inbox')"); pg.wait_for_timeout(300)
    d=idb_dump(pg); ok('Tarea en IndexedDB' in d.get('todos',''),'los datos se escriben en IndexedDB')
    ok(pg.evaluate("localStorage.getItem('cdm.todos')") is None,'y no en localStorage')
    pg.reload(); pg.wait_for_timeout(900)
    ok(pg.evaluate("S.todos.some(t=>t.text==='Tarea en IndexedDB')"),'persisten al recargar')
    # datos grandes: 8 MB de notas (localStorage no podría)
    pg.evaluate("""()=>{const big='x'.repeat(1000000);for(let i=0;i<8;i++)S.notes.push({id:'big'+i,title:'Grande '+i,html:'<div>'+big+'</div>',text:'',pinned:false,created:1,updated:1});save.notes();}"""); pg.wait_for_timeout(1500)
    pg.reload(); pg.wait_for_timeout(1500)
    ok(pg.evaluate("S.notes.filter(n=>n.id.startsWith('big')).length")==8 and not errs,'guarda más de 8 MB sin problemas (localStorage tiene ~5 MB)')
    pg.evaluate("S.notes=S.notes.filter(n=>!n.id.startsWith('big'));save.notes()"); pg.wait_for_timeout(500)
    pg.evaluate("showTab('settings')"); pg.wait_for_timeout(400)
    ok('IndexedDB' in pg.inner_text('#dataUsage'),'Ajustes muestra el motor: '+pg.inner_text('#dataUsage')[:60].replace('\n',' '))
    # migración desde localStorage
    pg.goto(URL); pg.wait_for_timeout(600)
    pg.evaluate("""()=>{indexedDB.deleteDatabase('cdm-data');localStorage.clear();const s=(k,v)=>localStorage.setItem('cdm.'+k,JSON.stringify(v));s('migrated',true);s('theme','light');s('todos',[{id:'m1',listId:'inbox',text:'Migrada de localStorage',done:false,due:'',important:false,repeat:'',notes:'',steps:[],created:1,order:0}]);s('notes',[{id:'n1',title:'Nota antigua',html:'<div>hola</div>',text:'hola',pinned:false,created:1,updated:1}]);return 0}""")
    pg.goto('about:blank'); pg.goto(URL); pg.wait_for_timeout(1200)
    ok(pg.evaluate("BACKEND.kind")=='idb' and pg.evaluate("S.todos.some(t=>t.text==='Migrada de localStorage')") and pg.evaluate("S.notes.some(n=>n.title==='Nota antigua')"),'migración automática desde localStorage')
    ok(pg.evaluate("localStorage.getItem('cdm.todos')") is None and pg.evaluate("localStorage.getItem('cdm.theme')")=='"light"','tras migrar se limpia localStorage (salvo el tema)')
    ok('trasladado a IndexedDB' in pg.inner_text('#toasts'),'aviso de la migración')
    # bloqueo con IndexedDB
    pg.evaluate("enableLock('clave-larga-123')"); pg.wait_for_timeout(2500)
    d=idb_dump(pg); ok(sorted(d.keys())==['enc','lock','migrated','theme'] and 'Migrada' not in json.dumps(d),'con bloqueo, IndexedDB solo guarda el bloque cifrado: '+str(sorted(d.keys())))
    pg.reload(); pg.wait_for_timeout(700); ok(pg.is_visible('#lockScreen'),'pide la contraseña al reabrir')
    pg.fill('#lockPass','clave-larga-123'); pg.click('#lockBtn'); pg.wait_for_timeout(2000)
    ok(pg.evaluate("S.todos.some(t=>t.text==='Migrada de localStorage')"),'desbloquea y recupera los datos')
    pg.evaluate("disableLock()"); pg.wait_for_timeout(1500)
    # respaldo: navegador sin IndexedDB
    p2=ctx.new_page(); p2.add_init_script("Object.defineProperty(window,'indexedDB',{get:()=>undefined})")
    p2.on('pageerror', lambda e: errs.append('p2:'+str(e)))
    p2.goto(URL); p2.wait_for_timeout(900); p2.evaluate("localStorage.clear(); 0"); p2.reload(); p2.wait_for_timeout(900)
    ok(p2.evaluate("BACKEND.kind")=='ls' and p2.evaluate("APP_READY"),'sin IndexedDB funciona con localStorage')
    p2.evaluate("addTodoFromText('En localStorage','inbox')"); p2.wait_for_timeout(200)
    ok('En localStorage' in (p2.evaluate("localStorage.getItem('cdm.todos')") or ''),'y guarda en localStorage')
    p2.close()
    # ---------- Seguridad ----------
    pg.goto(URL); pg.wait_for_timeout(900)
    payloads = {
      'script':'<script>window.__x=1</script>ok', 'img':'<img src=x onerror="window.__x=1">ok', 'svg':'<svg onload="window.__x=1"><a>ok</a></svg>',
      'jsurl':'<a href="javascript:alert(1)">ok</a>', 'dataurl':'<a href="data:text/html,hi">ok</a>', 'onclick':'<div onclick="x()">ok</div>',
      'style':'<span style="color:red;background-image:url(https://e.vil/x.png);position:fixed">ok</span>', 'iframe':'<iframe src="https://e.vil"></iframe>ok',
      'form':'<form action="https://e.vil"><button formaction="x">b</button></form>ok', 'unknown':'<custom-el foo="1"><b>ok</b></custom-el>', 'details':'<details open ontoggle="x()"><summary>ok</summary></details>',
      'meta':'<meta http-equiv="refresh" content="0;url=https://e.vil">ok', 'link':'<a href="https://example.org" target="_blank" ping="https://e.vil">ok</a>', 'wl':'<a class="wl" data-note="n1" contenteditable="false">ok</a><span contenteditable="true">x</span>'
    }
    r=pg.evaluate("p=>Object.fromEntries(Object.entries(p).map(([k,v])=>[k,sanitize(v)]))", payloads)
    bad=[k for k,v in r.items() if any(t in v.lower() for t in ['<script','onerror','onload','onclick','ontoggle','javascript:','data:text','<iframe','<form','<svg','<img','<meta','url(','position','ping=','target='])]
    ok(not bad,'el limpiador por lista blanca elimina todo lo peligroso '+str({k:r[k] for k in bad}))
    ok(r['style']=='<span style="color: red;">ok</span>' or 'color' in r['style'],'conserva los estilos seguros: '+r['style'])
    ok(r['unknown']=='<b>ok</b>' and 'href="https://example.org"' in r['link'] and 'data-note="n1"' in r['wl'] and 'contenteditable="false"' in r['wl'] and 'contenteditable="true"' not in r['wl'],'desenvuelve lo desconocido y respeta enlaces y [[ ]]')
    # arrastrar y soltar desde fuera
    pg.evaluate("showTab('notes'); createNote('Drop','<div>inicio</div>',true)"); pg.wait_for_timeout(200)
    pg.evaluate("""()=>{const dt=new DataTransfer();dt.setData('text/html','<img src="https://e.vil/t.png"><b onclick="x()">negrita</b>');dt.setData('text/plain','texto soltado');
      const r=editor.getBoundingClientRect();editor.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,clientX:r.left+60,clientY:r.top+25,bubbles:true,cancelable:true}));}""")
    pg.wait_for_timeout(200)
    h=pg.evaluate("editor.innerHTML"); ok('texto soltado' in h and '<img' not in h and '<b' not in h,'soltar desde fuera solo inserta texto: '+h[:120])
    # CSP: sin red y sin código inyectado
    r=pg.evaluate("""fetch('https://example.org').then(()=> 'conectó').catch(e=>'bloqueado')"""); pg.wait_for_timeout(200)
    ok(r=='bloqueado' and any('connect-src' in c for c in csp),'la CSP bloquea cualquier conexión de red')
    pg.evaluate("""()=>{window.__x=0;const d=document.createElement('div');d.setAttribute('onclick','window.__x=1');document.body.append(d);d.click();const i=new Image();i.src='https://example.org/t.png';document.body.append(i);}"""); pg.wait_for_timeout(300)
    ok(pg.evaluate("window.__x")==0,'la CSP impide ejecutar código inyectado en atributos')
    ok(any('img-src' in c for c in csp),'y cargar imágenes de internet')
    ok(pg.evaluate("APP_READY") and not errs,'la app funciona con la política activa')
    # ---------- Grafo grande ----------
    pg.evaluate("""()=>{const now=Date.now();for(let i=0;i<2500;i++){S.notes.push({id:'g'+i,title:'Nodo '+i,html:'',text:'',pinned:false,created:now,updated:now});}
      const M=new Map(S.notes.map(n=>[n.id,n]));for(let i=0;i<2500;i++){const n=M.get('g'+i);const t=['g'+((i*7+3)%2500),'g'+((i+1)%2500)];n.html=t.map(id=>`<a class="wl" data-note="${id}" contenteditable="false">x</a>`).join(' ');}save.notes();}""")
    pg.evaluate("openGraph(null)"); pg.wait_for_timeout(2500)
    r=pg.evaluate("(()=>{grRepN=0;grChooseRepel(grNodes);return {n:grNodes.length,bh:grBHActive,tick:grRepTimes.bh,pairs:grRepTimes.pairs}})()")
    ok(r['bh'] and r['n']>=2500,'con %d nodos elige solo Barnes-Hut'%r['n'])
    ok(r['tick']<r['pairs'],'cada paso es más rápido: %.1f ms frente a %.1f ms par a par'%(r['tick'],r['pairs']))
    pg.evaluate('grDraw()'); ok('optimizado' in pg.inner_text('#grPerf'),'indicador de modo optimizado')
    r=pg.evaluate("(()=>{const xs=grNodes.map(n=>n.x),ys=grNodes.map(n=>n.y);return {w:Math.max(...xs)-Math.min(...xs),nan:grNodes.some(n=>!isFinite(n.x)||!isFinite(n.y))}})()")
    ok(not r['nan'] and r['w']>200,'el diseño sigue siendo válido y extendido: '+str(r))
    pg.screenshot(path=SC+'/g_big.png')
    pg.evaluate("S.notes=S.notes.filter(n=>!n.id.startsWith('g'));save.notes()"); pg.wait_for_timeout(300)
    pg.evaluate("openGraph(null)"); pg.wait_for_timeout(500)
    ok(not pg.evaluate("grChooseRepel(grNodes)") and pg.inner_text('#grPerf')=='','con pocos nodos vuelve al cálculo exacto')
    # ---------- Búsqueda tolerante ----------
    pg.evaluate("""()=>{createNote('Patatas bravas','<div>receta</div>',false);createNote('Procedimiento de despliegue','<div>kubernetes y helm</div>',false);createNote('Reunión con el cliente','<div>acta</div>',false);}""")
    r=pg.evaluate("[fuzzyScore('ptas','Patatas bravas')>0, fuzzyScore('procedimeinto','Procedimiento')>0, fuzzyScore('kubernets','kubernetes y helm')>0, fuzzyScore('reunion','Reunión con el cliente')>0, fuzzyScore('zzzz','Patatas bravas')>0, fuzzyScore('casa','Cosas varias')>0]")
    ok(r==[True,True,True,True,False,False],'detecta abreviaturas, erratas y letras cambiadas: '+str(r))
    pg.keyboard.press('Escape'); pg.keyboard.press('Control+k'); pg.keyboard.type('procedimeinto'); pg.wait_for_timeout(300)
    t=pg.inner_text('#palList'); ok('PARECIDOS' in t.upper() and 'Procedimiento de despliegue' in t,'Ctrl+K muestra resultados parecidos')
    pg.keyboard.press('Escape')
    pg.evaluate("showTab('notes'); setNotesMode('list')"); pg.fill('#noteSearch','ptas'); pg.wait_for_timeout(300)
    ok('Patatas bravas' in pg.inner_text('#notesList') and 'parecidos' in pg.inner_text('#notesList'),'el buscador de notas también')
    print('CSP bloqueos registrados:',len(csp))
    print('ERRORS:',errs); print('FAILS:',len(fails))
