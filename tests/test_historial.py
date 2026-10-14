import os as _os, sys as _sys, tempfile as _tf
_ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), '..'))
_HTML = 'file://' + _os.path.join(_ROOT, 'CuadroDeMando.html')
if len(_sys.argv) < 2: _sys.argv.append(_tf.mkdtemp(prefix='cdm-test-'))
import json, sys
from playwright.sync_api import sync_playwright
URL=_HTML
SC=sys.argv[1]
errs=[]; fails=[]
def ok(c,m):
    print(('PASS ' if c else 'FAIL ')+m)
    if not c: fails.append(m)
def modal_ok(pg): pg.click('.modal-foot .btn.primary, .modal-foot .btn.danger-solid'); pg.wait_for_timeout(150)
def snaps(pg): return pg.evaluate("histAll().then(a=>a.map(r=>({kind:r.kind,label:r.label,enc:r.enc,todos:r.counts.todos,raw:JSON.stringify(r.payload)})))")
def unlock(pg,p):
    pg.fill('#lockPass',p); pg.click('#lockBtn'); pg.wait_for_timeout(2000)
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':1400,'height':900}, accept_downloads=True)
    pg=ctx.new_page()
    pg.on('pageerror', lambda e: errs.append('PAGEERR '+str(e)))
    pg.on('console', lambda m: errs.append('console:'+m.text) if m.type=='error' else None)
    pg.goto(URL); pg.wait_for_timeout(900); pg.evaluate("localStorage.clear(); indexedDB.deleteDatabase('cdm-hist'); indexedDB.deleteDatabase('cdm-data'); 0"); pg.reload(); pg.wait_for_timeout(800)
    s=snaps(pg); ok(len(s)==1 and s[0]['kind']=='auto','al abrir se crea la primera versión automática: '+str([x['kind'] for x in s]))
    pg.reload(); pg.wait_for_timeout(700)
    ok(len(snaps(pg))==1,'sin cambios no se duplica la versión al reabrir')
    for t in ['Alfa secreta','Beta','Gamma']: pg.evaluate(f"addTodoFromText('{t}','inbox')")
    pg.evaluate("showTab('settings')"); pg.wait_for_timeout(200)
    ok(pg.is_visible('#protectCard') and 'Sin bloqueo' in pg.inner_text('#protectStatus'),'tarjeta de protección con estado')
    ok('recomiendo' in pg.inner_text('#protectStatus'),'recomendación cuando solo hay datos en el navegador')
    pg.click('#histSave'); pg.fill('.modal input[name=label]','Con tres tareas'); modal_ok(pg); pg.wait_for_timeout(500)
    s=snaps(pg); ok(s[0]['kind']=='manual' and s[0]['label']=='Con tres tareas' and s[0]['todos']==3,'versión manual con nombre')
    ok('Con tres tareas' in pg.inner_text('#histList') and 'Manual' in pg.inner_text('#histList'),'aparece en la lista')
    # restaurar
    pg.evaluate("S.todos=[]; save.todos()"); pg.wait_for_timeout(100)
    pg.click('#histList .ver-item >> nth=0 >> [data-h=restore]'); pg.wait_for_timeout(200)
    txt=pg.inner_text('#modal'); ok('Ahora' in txt and 'Esa versión' in txt and '+3' in txt,'comparación antes de restaurar')
    modal_ok(pg); pg.wait_for_timeout(1500)
    ok(pg.evaluate("S.todos.length")==3,'restaurar versión recupera las tareas')
    s=snaps(pg); ok(any(x['kind']=='before' and 'Antes de restaurar' in x['label'] and x['todos']==0 for x in s),'versión de seguridad antes de restaurar (deshacer posible)')
    # descargar
    pg.evaluate("showTab('settings')"); pg.wait_for_timeout(200)
    with pg.expect_download() as d: pg.click('#histList .ver-item >> nth=0 >> [data-h=dl]')
    o=json.load(open(d.value.path())); ok(o['app']=='cuadro-de-mando' and 'data' in o and d.value.suggested_filename.startswith('cuadro-de-mando_version_'),'descargar versión como copia: '+d.value.suggested_filename)
    # exportación: por defecto cifrada
    pg.click('#bkExport'); pg.wait_for_timeout(150)
    ok(pg.evaluate("document.querySelector('.modal input[name=mode]:checked').value")=='enc' and pg.is_visible('.modal input[name=p1]'),'exportar: cifrada por defecto, pide contraseña')
    pg.check('.modal input[name=mode][value=plain]'); ok(not pg.is_visible('.modal input[name=p1]'),'sin cifrar oculta la contraseña')
    with pg.expect_download() as d: modal_ok(pg)
    o=json.load(open(d.value.path())); ok(not o.get('encrypted') and 'Alfa secreta' in json.dumps(o),'copia sin cifrar')
    open(SC+'/plain.json','w').write(json.dumps(o))
    # importar crea versión de seguridad
    pg.evaluate("addTodoFromText('Delta','inbox')"); pg.wait_for_timeout(100)
    pg.set_input_files('#bkImportFile', SC+'/plain.json'); pg.wait_for_timeout(300); modal_ok(pg); pg.wait_for_timeout(1500)
    s=snaps(pg); ok(any(x['kind']=='before' and 'importar' in x['label'] and x['todos']==4 for x in s),'versión de seguridad antes de importar')
    ok(pg.evaluate("S.todos.length")==3,'importación aplicada')
    lc=pg.evaluate("MEM.lastChange"); ok(abs(lc-pg.evaluate("Date.now()"))<10000,'importar marca los datos como los más recientes')
    # bloqueo → versiones cifradas
    pg.evaluate("showTab('settings')")
    pg.click('#secBtns [data-sec=on]'); pg.fill('.modal input[name=p1]','clave-larga-123'); pg.fill('.modal input[name=p2]','clave-larga-123'); modal_ok(pg); pg.wait_for_timeout(4000)
    s=snaps(pg); ok(all(x['enc'] for x in s) and not any('Alfa secreta' in x['raw'] for x in s),'al activar el bloqueo todas las versiones se cifran (%d)'%len(s))
    pg.reload(); pg.wait_for_timeout(300); unlock(pg,'clave-larga-123')
    pg.evaluate("showTab('settings')"); pg.wait_for_timeout(200)
    ok('cifradas' in pg.inner_text('#histStatus'),'estado indica versiones cifradas')
    pg.evaluate("S.todos=[]; save.todos()"); pg.wait_for_timeout(300)
    # restaurar la versión manual (cifrada con la clave actual: sin pedir contraseña)
    idx=pg.evaluate("histCache.findIndex(r=>r.label==='Con tres tareas')")
    pg.click(f'#histList .ver-item >> nth={idx} >> [data-h=restore]'); pg.wait_for_timeout(200); modal_ok(pg); pg.wait_for_timeout(1500)
    ok(pg.is_visible('#lockScreen'),'tras restaurar con bloqueo, recarga y pide contraseña')
    unlock(pg,'clave-larga-123'); ok(pg.evaluate("S.todos.length")==3,'restaurar versión cifrada sin volver a pedir contraseña')
    # cambiar contraseña → re-cifrado
    pg.evaluate("showTab('settings')"); pg.click('#secBtns [data-sec=change]'); pg.fill('.modal input[name=p]','clave-larga-123'); modal_ok(pg); pg.wait_for_timeout(1500)
    pg.fill('.modal input[name=p1]','nueva-clave-456'); pg.fill('.modal input[name=p2]','nueva-clave-456'); modal_ok(pg); pg.wait_for_timeout(5000)
    salts=pg.evaluate("histAll().then(a=>[...new Set(a.map(r=>r.payload.kdf&&r.payload.kdf.salt))])")
    ok(salts==[pg.evaluate("CRYPT.salt")],'al cambiar la contraseña las versiones se re-cifran con la nueva')
    # desactivar → en claro
    pg.click('#secBtns [data-sec=off]'); pg.fill('.modal input[name=p]','nueva-clave-456'); modal_ok(pg); pg.wait_for_timeout(1500); modal_ok(pg); pg.wait_for_timeout(4000)
    s=snaps(pg); ok(not any(x['enc'] for x in s),'al desactivar el bloqueo las versiones vuelven a estar en claro')
    # versión cifrada con otra contraseña (ajena) → pide contraseña
    pg.evaluate("""(async()=>{const salt=randBytes(16);const key=await deriveKey('ajena99',salt,1000);const d=clone(MEM);d.todos=[];
      const payload=await backupEncrypted(key,b64enc(salt),1000,d);
      await histPut({id:Date.now()-5,at:Date.now()-5,kind:'manual',label:'Ajena',lastChange:1,counts:histCounts(d),size:10,enc:true,payload});await histRefresh();})()""")
    pg.wait_for_timeout(400)
    idx=pg.evaluate("histCache.findIndex(r=>r.label==='Ajena')")
    ok('otra contraseña' in pg.inner_text(f'#histList .ver-item >> nth={idx}'),'marca versiones cifradas con otra contraseña')
    pg.click(f'#histList .ver-item >> nth={idx} >> [data-h=restore]'); pg.wait_for_timeout(200); modal_ok(pg); pg.wait_for_timeout(300)
    ok('Copia cifrada' in pg.inner_text('#modal'),'pide la contraseña de esa versión')
    pg.fill('.modal input[name=p]','ajena99'); modal_ok(pg); pg.wait_for_timeout(1500)
    ok(pg.evaluate("S.todos.length")==0,'restaurada con su contraseña')
    # poda
    r=pg.evaluate("""(async()=>{await histClear();const H=3600e3,D=24*H,now=Date.now();let i=0;
      const mk=(at,kind)=>histPut({id:at+(i++)/1000,at,kind,label:'',lastChange:at,counts:{},size:1,enc:false,payload:{app:'cuadro-de-mando',data:{}}});
      for(let h=0;h<30;h++) await mk(now-h*H-1000,'auto');          // 30 en las últimas 30 h
      for(let d=2;d<40;d++){await mk(now-d*D,'auto');await mk(now-d*D-H,'auto');} // 2 por día durante 38 días
      for(let k=0;k<14;k++) await mk(now-k*H-500,'before');
      for(let k=0;k<33;k++) await mk(now-k*D-700,'manual');
      await histPrune(); const a=await histAll();
      const c=k=>a.filter(r=>r.kind===k).length;
      const autoOld=a.filter(r=>r.kind==='auto'&&now-r.at>=D);
      return {auto24:a.filter(r=>r.kind==='auto'&&now-r.at<D).length,autoOldDays:new Set(autoOld.map(r=>dayKey(new Date(r.at)))).size,autoOld:autoOld.length,maxAge:Math.max(...a.filter(r=>r.kind==='auto').map(r=>now-r.at))/D,before:c('before'),manual:c('manual')}})()""")
    ok(r['auto24']==24 and r['autoOld']==r['autoOldDays'] and r['maxAge']<30 and r['before']==10 and r['manual']==30,'retención: '+str(r))
    # borrar todo vacía el historial
    pg.evaluate("showTab('settings')"); pg.click('#wipeAll'); ok('historial de versiones' in pg.inner_text('#modal'),'borrar todo avisa del historial')
    pg.fill('.modal input[name=c]','BORRAR'); modal_ok(pg); pg.wait_for_timeout(1200)
    s=snaps(pg); ok(len(s)<=1 and all(x['todos']==0 for x in s),'borrar todo elimina el historial anterior')
    # paleta
    pg.keyboard.press('Control+k'); pg.keyboard.type('historial'); pg.wait_for_timeout(200)
    ok('Historial de versiones' in pg.inner_text('#paletteBack'),'paleta: comando historial')
    pg.keyboard.press('Escape')
    # móvil
    m=ctx.new_page(); m.set_viewport_size({'width':390,'height':844}); m.goto(URL); m.wait_for_timeout(600)
    m.evaluate("addTodoFromText('x','inbox')"); m.evaluate("histSnapshot('manual','Prueba móvil con un nombre bastante largo',{force:true}).then(histRefresh)"); m.wait_for_timeout(400)
    m.evaluate("showTab('settings')"); m.wait_for_timeout(300)
    ok(m.evaluate("document.documentElement.scrollWidth")<=390,'ajustes en móvil sin scroll horizontal')
    m.screenshot(path=SC+'/h_mobile.png', full_page=True)
    pg.evaluate("showTab('settings')"); pg.wait_for_timeout(200); pg.evaluate("document.querySelector('.prot-more').open=true")
    pg.screenshot(path=SC+'/h_settings.png', full_page=True)
    print('ERRORS:',errs); print('FAILS:',len(fails))
