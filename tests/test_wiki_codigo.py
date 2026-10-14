import os as _os, sys as _sys, tempfile as _tf
_ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), '..'))
_HTML = 'file://' + _os.path.join(_ROOT, 'CuadroDeMando.html')
if len(_sys.argv) < 2: _sys.argv.append(_tf.mkdtemp(prefix='cdm-test-'))
import sys, json, os
from playwright.sync_api import sync_playwright
URL=_HTML
SC=sys.argv[1]
errs=[]; fails=[]
def ok(c,m):
    print(('PASS ' if c else 'FAIL ')+m, flush=True)
    if not c: fails.append(m)
def modal_ok(pg): pg.click('.modal-foot .btn.primary, .modal-foot .btn.danger-solid'); pg.wait_for_timeout(150)
def caret_end(pg):
    pg.evaluate("""()=>{const r=document.createRange();r.selectNodeContents(editor);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r);editor.focus();}""")
# ---- .ctd de ejemplo, con offsets calculados como CherryTree
runs=[('scale="h1"','Proyecto X'),('','\nTexto normal con '),('weight="heavy"','negrita'),('',', un '),('link="webs https://example.org"','enlace'),('',' y otro a '),('link="node 2"','Arquitectura'),('','.\nAntes del código:\n'),('','Después del código.\n'),('foreground="#ffff00000000"','Fin en rojo')]
t1=sum(len(r[1]) for r in runs[:8]); t2=t1+len(runs[8][1])
esc=lambda s:s.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')
xml='<?xml version="1.0" encoding="UTF-8"?>\n<cherrytree><bookmarks list=""/>'
xml+='<node name="Proyecto X" unique_id="1" prog_lang="custom-colors" ts_creation="1700000000" ts_lastsave="1700000500">'
xml+=''.join(f'<rich_text {a}>{esc(t)}</rich_text>' for a,t in runs)
xml+=f'<codebox char_offset="{t1}" syntax_highlighting="sql">SELECT id FROM t;</codebox>'
xml+=f'<table char_offset="{t2+1}"><row><cell>1</cell><cell>Ana</cell></row><row><cell>Id</cell><cell>Nombre</cell></row></table>'
xml+=f'<encoded_png char_offset="{t2+2}">iVBORw0KGgo=</encoded_png>'
xml+='<node name="Arquitectura" unique_id="2" prog_lang="custom-colors"><rich_text>Capas &lt;y&gt; módulos</rich_text>'
xml+='<node name="script.py" unique_id="3" prog_lang="python"><rich_text>def f():\n    return 1</rich_text></node></node>'
xml+='<node name="Anexo" unique_id="4" prog_lang="custom-colors"><rich_text>Ver </rich_text><rich_text link="node 3">script</rich_text></node>'
xml+='</node></cherrytree>'
open(SC+'/demo.ctd','w').write(xml); open(SC+'/demo.ctb','w').write('x')
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1400,'height':900}, accept_downloads=True); pg=ctx.new_page()
    pg.on('pageerror', lambda e: errs.append('PAGEERR '+str(e)))
    pg.on('console', lambda m: errs.append('console:'+m.text) if m.type=='error' else None)
    pg.goto(URL); pg.wait_for_timeout(900); pg.evaluate("localStorage.clear(); indexedDB.deleteDatabase('cdm-data'); 0"); pg.reload(); pg.wait_for_timeout(700)
    pg.evaluate("showTab('notes')"); pg.wait_for_timeout(100)
    # ---------- Wiki ----------
    pg.click('#notesMode [data-nm2=tree]'); pg.wait_for_timeout(100)
    ok(pg.evaluate("notesMode")=='tree' and pg.is_visible('#notesList [data-wkroot]'),'modo árbol con botón de página raíz')
    pg.click('#notesList [data-wkroot]'); pg.wait_for_timeout(150); pg.keyboard.type('Manual del proyecto'); pg.keyboard.press('Enter'); pg.wait_for_timeout(100)
    root=pg.evaluate("currentNoteId")
    pg.click('#subPageBtn'); pg.wait_for_timeout(150); pg.keyboard.type('Instalación'); pg.keyboard.press('Enter'); pg.wait_for_timeout(100)
    inst=pg.evaluate("currentNoteId")
    pg.click('#subPageBtn'); pg.wait_for_timeout(150); pg.keyboard.type('Requisitos'); pg.keyboard.press('Enter'); pg.wait_for_timeout(100)
    req=pg.evaluate("currentNoteId")
    pg.evaluate(f"openNote('{root}')"); pg.click('#subpages [data-spnew]'); pg.wait_for_timeout(150); pg.keyboard.type('Operación'); pg.keyboard.press('Enter'); pg.wait_for_timeout(100)
    op=pg.evaluate("currentNoteId")
    r=pg.evaluate(f"({{p1:getNote('{inst}').parent,p2:getNote('{req}').parent,p3:getNote('{op}').parent,kids:wkKids('{root}').map(n=>n.title)}})")
    ok(r['p1']==root and r['p2']==inst and r['p3']==root and r['kids']==['Instalación','Operación'],'subpáginas anidadas y ordenadas: '+str(r))
    pg.evaluate(f"openNote('{req}')"); pg.wait_for_timeout(100)
    ok(pg.inner_text('#wikiCrumbs').replace('\n','')=='📚›Manual del proyecto›Instalación›Requisitos','migas de pan: '+pg.inner_text('#wikiCrumbs').replace('\n',''))
    rows=pg.evaluate("[...document.querySelectorAll('#notesList .wk-row')].map(r=>r.querySelector('.wk-t').textContent+':'+getComputedStyle(r).getPropertyValue('--d').trim())")
    rows=[x for x in rows if 'Bienvenida' not in x]
    ok(rows==['Manual del proyecto:0','Instalación:1','Requisitos:2','Operación:1'],'árbol con niveles: '+str(rows))
    pg.click('#wikiCrumbs [data-crumb]:nth-of-type(2)'); pg.wait_for_timeout(100)
    ok(pg.evaluate("currentNoteId")==root,'clic en la miga abre la página madre')
    ok('Subpáginas (2)' in pg.inner_text('#subpages'),'lista de subpáginas')
    # plegar
    pg.click(f'#notesList .wk-row[data-id="{root}"] [data-tg]'); pg.wait_for_timeout(100)
    ok(pg.locator('#notesList .wk-row').count()==2,'plegar rama')
    pg.click(f'#notesList .wk-row[data-id="{root}"] [data-tg]'); pg.wait_for_timeout(100)
    # arrastrar «Operación» dentro de «Instalación»
    pg.locator(f'#notesList .wk-row[data-id="{op}"]').drag_to(pg.locator(f'#notesList .wk-row[data-id="{inst}"]'))
    pg.wait_for_timeout(200)
    ok(pg.evaluate(f"getNote('{op}').parent")==inst,'arrastrar una página sobre otra la convierte en subpágina')
    # mover con diálogo a la raíz
    pg.evaluate(f"wkMoveDialog('{op}'); 0"); pg.wait_for_timeout(150); pg.select_option('.modal select[name=p]',''); modal_ok(pg)
    ok(pg.evaluate(f"getNote('{op}').parent") in (None,'') ,'«Mover a…» a la raíz')
    ok(not pg.evaluate(f"wkMove('{root}','{req}','child')"),'no permite mover una página dentro de su descendiente')
    # buscar en árbol
    pg.fill('#noteSearch','requisitos'); pg.wait_for_timeout(250)
    vis=pg.evaluate("[...document.querySelectorAll('#notesList .wk-row .wk-t')].map(x=>x.textContent)")
    ok(vis==['Manual del proyecto','Instalación','Requisitos'],'búsqueda muestra coincidencias con su ruta: '+str(vis))
    pg.fill('#noteSearch',''); pg.wait_for_timeout(200)
    # borrar madre: hijas suben
    pg.evaluate(f"openNote('{inst}'); deleteCurrentNote()"); pg.wait_for_timeout(150)
    ok(pg.evaluate(f"getNote('{req}').parent")==root,'al borrar una página sus subpáginas suben un nivel')
    pg.click('.toast button'); pg.wait_for_timeout(150)
    ok(pg.evaluate(f"!!getNote('{inst}') && getNote('{req}').parent==='{inst}'"),'deshacer restaura la página y su jerarquía')
    # código y enlaces en una página
    pg.evaluate(f"openNote('{req}')"); caret_end(pg)
    pg.keyboard.type('Necesitas Java. Ver [[Manu'); pg.wait_for_timeout(150); pg.keyboard.press('Enter'); pg.wait_for_timeout(100)
    pg.keyboard.press('Enter'); pg.keyboard.type('```sql'); pg.keyboard.press('Enter'); pg.wait_for_timeout(100)
    ok(pg.evaluate("!!editor.querySelector('pre[data-lang=sql]')"),'``` sql + Enter crea un bloque SQL')
    pg.keyboard.type("SELECT id FROM usuarios WHERE nombre = 'Ana'; -- todos"); pg.wait_for_timeout(800)
    r=pg.evaluate("(()=>{const p=editor.querySelector('pre');return {kw:p.querySelectorAll('.c-kw').length,str:p.querySelectorAll('.c-str').length,com:p.querySelectorAll('.c-com').length,txt:preText(p)}})()")
    ok(r['kw']>=3 and r['str']==1 and r['com']==1,'resaltado SQL mientras escribes: '+str(r))
    pg.keyboard.type(' y más'); pg.wait_for_timeout(700)
    ok(pg.evaluate("preText(editor.querySelector('pre'))").rstrip('\n').endswith('-- todos y más'),'el cursor se mantiene al re-colorear')
    pg.keyboard.press('Enter'); pg.keyboard.press('Tab'); pg.keyboard.type('ORDER BY id;'); pg.wait_for_timeout(100)
    ok('\n  ORDER BY id;' in pg.evaluate("preText(editor.querySelector('pre'))"),'Enter = nueva línea y Tab = 2 espacios dentro del bloque')
    pg.keyboard.press('Enter'); pg.keyboard.press('Enter'); pg.wait_for_timeout(100); pg.keyboard.type('Fuera del bloque')
    ok(pg.evaluate("(()=>{const p=editor.querySelector('pre');return !p.textContent.includes('Fuera') && p.nextElementSibling && p.nextElementSibling.textContent.includes('Fuera del bloque')})()"),'Enter dos veces al final sale del bloque')
    pg.hover('#editor pre'); pg.wait_for_timeout(100)
    ok(pg.is_visible('.code-bar') and 'SQL' in pg.inner_text('.code-bar'),'barra del bloque con lenguaje y copiar')
    pg.click('.code-bar [data-cb=lang]'); pg.click('#codeLangPop [data-cl=py]'); pg.wait_for_timeout(100)
    ok(pg.evaluate("editor.querySelector('pre').dataset.lang")=='py','cambiar el lenguaje del bloque')
    pg.click('.code-bar [data-cb=copy]'); pg.wait_for_timeout(200)
    ok('Código copiado' in pg.inner_text('#toasts') or 'No se pudo copiar' not in pg.inner_text('#toasts'),'copiar el código')
    # código en línea
    pg.evaluate("""()=>{const d=[...editor.querySelectorAll('div')].find(x=>x.textContent.includes('Necesitas Java'));const t=[...d.childNodes].find(n=>n.nodeType===3&&n.nodeValue.includes('Java'));const i=t.nodeValue.indexOf('Java');const r=document.createRange();r.setStart(t,i);r.setEnd(t,i+4);const s=getSelection();s.removeAllRanges();s.addRange(r);savedRange=r.cloneRange();}""")
    pg.click('#toolbar [data-action=icode]'); pg.wait_for_timeout(100)
    ok(pg.evaluate("[...editor.querySelectorAll('code')].some(c=>c.textContent==='Java'&&!c.closest('pre'))"),'código en línea con ‹/›')
    pg.evaluate("flushNote(true)")
    md=pg.evaluate(f"noteToMd(getNote('{req}'))"); ok('```py\n' in md and "-- todos y más" in md and '`Java`' in md and '[[Manual del proyecto]]' in md,'Markdown con bloque ```lenguaje y código en línea')
    h=pg.evaluate("mdToHtml('```python\\nprint(1)\\n```')"); ok('data-lang="py"' in h,'importar Markdown conserva el lenguaje del bloque')
    # detector y resaltadores
    r=pg.evaluate("""[detectLang('{"a": 1}'), detectLang('<root><a/></root>'), detectLang('SELECT * FROM t'), detectLang('def f():\\n    return 1'), detectLang('public class A { }'), detectLang('const x = () => 1'), detectLang('sudo apt install git'), detectLang('Get-ChildItem -Path C:\\\\'), detectLang('hola mundo')]""")
    ok(r==['json','xml','sql','py','java','js','sh','ps','text'],'detección automática del lenguaje: '+str(r))
    h=pg.evaluate("""hlCode('{"k": "v", "n": 2, "b": true}','json')"""); ok('c-key' in h and 'c-str' in h and 'c-num' in h and 'c-kw' in h,'resaltado JSON')
    h=pg.evaluate("""hlCode('<a href="x">t</a><!-- c -->','xml')"""); ok('c-tag' in h and 'c-attr' in h and 'c-com' in h,'resaltado XML')
    h=pg.evaluate("""hlCode('<script>alert(1)</script>','text')"""); ok('&lt;script&gt;' in h,'el código se escapa siempre')
    # exportar rama
    html=pg.evaluate(f"wkExportHtml('{root}')")
    ok(html.count('<section')==3 and 'nav' in html and 'href="#p-' in html and 'c-kw' in html and '.c-kw' in html,'manual HTML con índice, secciones y código coloreado')
    md=pg.evaluate(f"wkExportMd('{root}')"); ok(md.startswith('# Manual del proyecto') and '\n## Instalación' in md and '\n### Requisitos' in md,'Markdown de la rama con títulos por nivel')
    open(SC+'/manual.html','w').write(html)
    pg.evaluate(f"wkToMindmap('{root}')"); pg.wait_for_timeout(300)
    ok(pg.evaluate("currentTab")=='maps' and pg.evaluate("mmCount(mmCur().root)")==3 and pg.evaluate(f"mmCur().root.note")==root,'rama → mapa mental con enlaces a las páginas')
    pg.evaluate("showMapsMode('graph')"); pg.wait_for_timeout(500)
    ok(pg.evaluate("grEdges.filter(e=>e.h).length")>=2,'el grafo dibuja la jerarquía de la wiki')
    # ---------- CherryTree ----------
    pg.evaluate("showTab('notes')"); pg.wait_for_timeout(100)
    pg.set_input_files('#importNoteFile', SC+'/demo.ctd'); pg.wait_for_timeout(500)
    r=pg.evaluate("""(()=>{const c=getNote(currentNoteId);const px=wkKids(c.id)[0];const ar=wkKids(px.id).find(n=>n.title==='Arquitectura');const sc=wkKids(ar.id)[0];const an=wkKids(px.id).find(n=>n.title==='Anexo');
      return {cont:c.title,px:px.title,kids:wkKids(px.id).map(n=>n.title),sc:sc.title,schtml:sc.html,html:px.html,arid:ar.id,scid:sc.id,an:an.html,arhtml:ar.html,mode:notesMode}})()""")
    ok(r['cont']=='demo' and r['px']=='Proyecto X' and r['kids']==['Arquitectura','Anexo'] and r['sc']=='script.py' and r['mode']=='tree','importar .ctd crea la rama con su jerarquía: '+str({k:r[k] for k in ('cont','px','kids','sc')}))
    h=r['html']
    ok('<h1>Proyecto X</h1>' in h and '<b>negrita</b>' in h and 'href="https://example.org"' in h,'formato, títulos y enlaces web')
    ok(f'data-note="{r["arid"]}"' in h,'enlace entre nodos → enlace [[ ]] a la página')
    ok('<pre data-lang="sql">SELECT id FROM t;</pre>' in h and h.index('Antes del código') < h.index('<pre') < h.index('Después del código'),'bloque de código en su sitio')
    ok('<th>Id</th>' in h and h.index('<th>Id</th>') < h.index('<td>1</td>'),'tabla con su cabecera')
    ok('[imagen omitida]' in h and ('color:#ff0000' in h or 'rgb(255, 0, 0)' in h),'imágenes omitidas y colores convertidos')
    ok('<pre data-lang="py">def f():' in r['schtml'],'nodo de código Python → bloque Python')
    ok(f'data-note="{r["scid"]}"' in r['an'] and '&lt;y&gt;' in r['arhtml'],'enlace al nodo de código y texto escapado')
    pg.set_input_files('#importNoteFile', SC+'/demo.ctb'); pg.wait_for_timeout(300)
    ok('SQLite' in pg.inner_text('#toasts'),'.ctb: explica cómo convertirlo')
    pg.evaluate(f"openNote(wkKids(wkKids(currentNoteId)[0]?.id||currentNoteId)[0]?.id||currentNoteId)"); pg.wait_for_timeout(200)
    pg.evaluate("openNote(S.notes.find(n=>n.title==='Proyecto X').id)"); pg.wait_for_timeout(300)
    pg.screenshot(path=SC+'/wiki_desktop.png')
    pg.evaluate(f"openNote('{req}')"); pg.wait_for_timeout(300); pg.hover('#editor pre'); pg.wait_for_timeout(100); pg.screenshot(path=SC+'/wiki_code.png')
    m=ctx.new_page(); m.set_viewport_size({'width':390,'height':844}); m.goto(URL); m.wait_for_timeout(700); m.evaluate("showTab('notes')"); m.wait_for_timeout(200)
    ok(m.evaluate("document.documentElement.scrollWidth")<=390,'notas en árbol en móvil sin scroll horizontal'); m.screenshot(path=SC+'/wiki_mobile.png')
    mp=ctx.new_page(); mp.goto('file://'+os.path.abspath(SC)+'/manual.html'); mp.wait_for_timeout(300); mp.fill('#q','requisitos'); mp.wait_for_timeout(100)
    ok(mp.evaluate("[...document.querySelectorAll('section')].filter(s=>!s.classList.contains('hide')).length")==1,'el manual exportado tiene buscador que funciona')
    mp.fill('#q',''); mp.screenshot(path=SC+'/manual.png')
    print('ERRORS:',errs); print('FAILS:',len(fails))
