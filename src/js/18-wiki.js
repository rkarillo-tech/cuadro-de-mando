/* =====================================================================
   WIKI: NOTAS EN ÁRBOL
   ===================================================================== */
/*
  Cada nota puede tener una nota madre (n.parent) y un orden entre hermanas (n.order).
  Una página de la wiki ES una nota: conserva enlaces [[ ]], grafo, búsqueda, historial y cifrado.
  La barra lateral de Notas alterna entre «Lista» (por fecha) y «Árbol» (wiki).
*/
let notesMode = 'list';
const wkOpen = new Set();
let wkDragId = null;

const wkParent = n => (n && n.parent && n.parent !== n.id && getNote(n.parent)) ? n.parent : null;
const wkKey = n => n.order != null ? n.order : 1e13 + (n.created || 0);
const wkKids = pid => S.notes.filter(n => wkParent(n) === (pid || null)).sort((a, b) => wkKey(a) - wkKey(b));
function wkAncestors(n) {
  const out = [], seen = new Set([n.id]);
  let p = wkParent(n);
  while (p && !seen.has(p)) { seen.add(p); const pn = getNote(p); if (!pn) break; out.unshift(pn); p = wkParent(pn); }
  return out;
}
function wkDescendants(id) {
  const out = []; const rec = pid => wkKids(pid).forEach(c => { out.push(c); rec(c.id); });
  rec(id); return out;
}
const wkIsInside = (id, ancestorId) => id === ancestorId || wkDescendants(ancestorId).some(d => d.id === id);
const wkPath = n => wkAncestors(n).map(a => a.title).join(' › ');
function wkNormalize(list) { list.forEach((n, i) => { n.order = i; }); }

/* ---------- Árbol lateral ---------- */
function wikiRenderTree() {
  const q = norm($('#noteSearch').value.trim());
  let visible = null;
  if (q) {
    visible = new Set();
    S.notes.filter(n => norm(n.title).includes(q) || norm(n.text || '').includes(q)).forEach(n => { visible.add(n.id); wkAncestors(n).forEach(a => visible.add(a.id)); });
  }
  const cur = getNote(currentNoteId);
  if (cur) wkAncestors(cur).forEach(a => wkOpen.add(a.id));
  const rows = [];
  const rec = (pid, d) => wkKids(pid).forEach(n => {
    if (visible && !visible.has(n.id)) return;
    const kids = wkKids(n.id), open = q ? true : wkOpen.has(n.id);
    rows.push(`<div class="wk-row${n.id === currentNoteId ? ' active' : ''}" data-id="${esc(n.id)}" draggable="true" tabindex="0" style="--d:${d}">
      ${kids.length ? `<button type="button" class="wk-tg" data-tg title="${open ? 'Plegar' : 'Desplegar'}">${open ? '▾' : '▸'}</button>` : '<span class="wk-tg wk-leaf">•</span>'}
      <span class="wk-t ellipsis">${n.pinned ? '📌 ' : ''}${esc(n.title)}</span>${kids.length ? `<span class="wk-n">${kids.length}</span>` : ''}
      <button type="button" class="wk-add" data-add title="Añadir subpágina">＋</button></div>`);
    if (open) rec(n.id, d + 1);
  });
  rec(null, 0);
  $('#notesList').innerHTML = (rows.join('') || `<div class="empty">${q ? 'Sin resultados' : 'No hay páginas todavía'}</div>`)
    + `<div class="wk-foot"><button type="button" class="btn sm ghost" data-wkroot>＋ Página en la raíz</button>${S.notes.some(n => wkKids(n.id).length) ? '<button type="button" class="btn sm ghost" data-wkall title="Desplegar o plegar todo">⇕</button>' : ''}</div>`;
  $('#notesTotal').textContent = `${S.notes.length} página${S.notes.length === 1 ? '' : 's'}`;
}
function setNotesMode(m) {
  notesMode = m === 'tree' ? 'tree' : 'list';
  if (store.get('notesMode', 'list') !== notesMode) store.set('notesMode', notesMode);
  $$('#notesMode button').forEach(b => b.classList.toggle('on', b.dataset.nm2 === notesMode));
  $('#view-notes').classList.toggle('wiki-mode', notesMode === 'tree');
  renderNoteList(); wkRenderCrumbs();
}
$('#notesMode').addEventListener('click', e => { const b = e.target.closest('[data-nm2]'); if (b) setNotesMode(b.dataset.nm2); });
$('#notesList').addEventListener('click', e => {
  if (notesMode !== 'tree') return;
  if (e.target.closest('[data-wkroot]')) { wkNewPage(null); return; }
  if (e.target.closest('[data-wkall]')) { const parents = S.notes.filter(n => wkKids(n.id).length); const allOpen = parents.every(n => wkOpen.has(n.id)); parents.forEach(n => allOpen ? wkOpen.delete(n.id) : wkOpen.add(n.id)); renderNoteList(); return; }
  const row = e.target.closest('.wk-row'); if (!row) return;
  e.stopImmediatePropagation();
  const id = row.dataset.id;
  if (e.target.closest('[data-tg]')) { wkOpen.has(id) ? wkOpen.delete(id) : wkOpen.add(id); renderNoteList(); return; }
  if (e.target.closest('[data-add]')) { wkNewPage(id); return; }
  openNote(id);
}, true);
$('#notesList').addEventListener('keydown', e => {
  const row = e.target.closest && e.target.closest('.wk-row'); if (!row) return;
  const id = row.dataset.id;
  if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); openNote(id); }
  else if (e.key === 'ArrowRight' && wkKids(id).length) { wkOpen.add(id); renderNoteList(); $(`#notesList .wk-row[data-id="${CSS.escape(id)}"]`).focus(); }
  else if (e.key === 'ArrowLeft') { wkOpen.delete(id); renderNoteList(); $(`#notesList .wk-row[data-id="${CSS.escape(id)}"]`).focus(); }
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const rows = $$('#notesList .wk-row'); const i = rows.indexOf(row) + (e.key === 'ArrowDown' ? 1 : -1); if (rows[i]) rows[i].focus(); }
}, true);
/* Arrastrar para reorganizar */
function wkClearDrop() { $$('#notesList .drop-child,#notesList .drop-before,#notesList .drop-after').forEach(r => r.classList.remove('drop-child', 'drop-before', 'drop-after')); }
function wkZone(row, e) { const r = row.getBoundingClientRect(), y = (e.clientY - r.top) / r.height; return y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'child'; }
$('#notesList').addEventListener('dragstart', e => {
  const row = e.target.closest && e.target.closest('.wk-row'); if (!row) return;
  wkDragId = row.dataset.id; e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', wkDragId); } catch {}
  row.classList.add('dragging');
});
$('#notesList').addEventListener('dragover', e => {
  const row = e.target.closest && e.target.closest('.wk-row'); if (!row || !wkDragId) return;
  wkClearDrop();
  if (wkIsInside(row.dataset.id, wkDragId)) return;
  e.preventDefault(); row.classList.add('drop-' + wkZone(row, e));
});
$('#notesList').addEventListener('dragleave', e => { if (!e.relatedTarget || !$('#notesList').contains(e.relatedTarget)) wkClearDrop(); });
$('#notesList').addEventListener('drop', e => {
  const row = e.target.closest && e.target.closest('.wk-row'); wkClearDrop();
  if (!row || !wkDragId) return;
  e.preventDefault();
  wkMove(wkDragId, row.dataset.id, wkZone(row, e));
});
$('#notesList').addEventListener('dragend', () => { wkDragId = null; wkClearDrop(); $$('#notesList .dragging').forEach(r => r.classList.remove('dragging')); });

/** Mueve una página: zone = 'child' | 'before' | 'after' respecto a targetId (null = raíz). */
function wkMove(id, targetId, zone = 'child') {
  const n = getNote(id); if (!n) return false;
  if (targetId && wkIsInside(targetId, id)) { toast('No puedes mover una página dentro de sí misma', 'warning'); return false; }
  flushNote();
  if (!targetId || zone === 'child') {
    const kids = wkKids(targetId || null).filter(k => k.id !== id);
    n.parent = targetId || null; kids.push(n); wkNormalize(kids);
    if (targetId) wkOpen.add(targetId);
  } else {
    const t = getNote(targetId); const pid = wkParent(t);
    const sib = wkKids(pid).filter(k => k.id !== id);
    const i = sib.indexOf(t) + (zone === 'after' ? 1 : 0);
    n.parent = pid; sib.splice(i, 0, n); wkNormalize(sib);
  }
  save.notes(); renderNoteList(); wkRenderCrumbs(); wkRenderSubpages();
  return true;
}
function wkNewPage(parentId) {
  flushNote();
  const n = createNote('Nueva página', '', false);
  n.parent = parentId || null;
  const sib = wkKids(n.parent).filter(k => k.id !== n.id); wkNormalize(sib); n.order = sib.length;
  if (parentId) wkOpen.add(parentId);
  save.notes();
  currentNoteId = n.id; renderNotesView();
  const t = $('#noteTitle'); t.focus(); t.select();
  return n;
}

/* ---------- Migas, subpáginas e índice ---------- */
function wkRenderCrumbs() {
  const box = $('#wikiCrumbs'); if (!box) return;
  const n = getNote(currentNoteId);
  if (!n) { box.innerHTML = ''; box.hidden = true; return; }
  const anc = wkAncestors(n), kids = wkKids(n.id);
  const show = anc.length || kids.length || notesMode === 'tree';
  box.hidden = !show;
  if (!show) { box.innerHTML = ''; return; }
  box.innerHTML = `<button type="button" class="crumb" data-crumb="" title="Ver el árbol">📚</button>` + anc.map(a => `<span class="sep">›</span><button type="button" class="crumb" data-crumb="${esc(a.id)}">${esc(a.title)}</button>`).join('') + `<span class="sep">›</span><span class="crumb cur">${esc(n.title)}</span>`;
}
$('#wikiCrumbs').addEventListener('click', e => {
  const b = e.target.closest('[data-crumb]'); if (!b) return;
  if (!b.dataset.crumb) { setNotesMode('tree'); return; }
  openNote(b.dataset.crumb);
});
function wkRenderSubpages() {
  const box = $('#subpages'); if (!box) return;
  const n = getNote(currentNoteId);
  const kids = n ? wkKids(n.id) : [];
  if (!n || (!kids.length && notesMode !== 'tree')) { box.innerHTML = ''; box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<span class="bl-h">📚 Subpáginas (${kids.length})</span><div class="chips">${kids.map(k => `<button type="button" class="chip" data-sp="${esc(k.id)}">📄 ${esc(k.title)}${wkKids(k.id).length ? ` <span class="muted">· ${wkKids(k.id).length}</span>` : ''}</button>`).join('')}<button type="button" class="btn sm ghost" data-spnew>＋ Añadir subpágina</button></div>`;
}
$('#subpages').addEventListener('click', e => {
  const b = e.target.closest('[data-sp]'); if (b) { openNote(b.dataset.sp); return; }
  if (e.target.closest('[data-spnew]')) wkNewPage(currentNoteId);
});
const tocPop = document.createElement('div');
tocPop.className = 'popover menu'; tocPop.id = 'tocPop';
document.body.append(tocPop);
$('#tocBtn').addEventListener('click', e => {
  if (tocPop.classList.contains('open')) { tocPop.classList.remove('open'); return; }
  const hs = $$('h1,h2,h3', editor);
  tocPop.innerHTML = '<div class="muted small" style="padding:6px 10px">Índice de la página</div>' + (hs.length
    ? hs.map((h, i) => `<button type="button" data-toc="${i}" style="padding-left:${10 + (+h.tagName[1] - 1) * 14}px">${esc(h.textContent.trim() || '(sin texto)')}</button>`).join('')
    : '<div class="muted small" style="padding:6px 10px;max-width:260px">Sin títulos. Usa «Título 1/2/3» en el selector de estilo para crear un índice.</div>');
  openPopover(tocPop, e.currentTarget);
});
tocPop.addEventListener('mousedown', e => e.preventDefault());
tocPop.addEventListener('click', e => {
  const b = e.target.closest('[data-toc]'); if (!b) return;
  tocPop.classList.remove('open');
  const h = $$('h1,h2,h3', editor)[+b.dataset.toc];
  if (h) { h.scrollIntoView({ behavior: 'smooth', block: 'start' }); h.classList.add('flash'); setTimeout(() => h.classList.remove('flash'), 1200); }
});
$('#subPageBtn').addEventListener('click', () => { if (currentNoteId) wkNewPage(currentNoteId); });

/* ---------- Mover y borrar ---------- */
async function wkMoveDialog(id) {
  const n = getNote(id); if (!n) return;
  const opts = [];
  const rec = (pid, d) => wkKids(pid).forEach(k => { if (k.id === id) return; opts.push(`<option value="${esc(k.id)}"${wkParent(n) === k.id ? ' selected' : ''}>${'   '.repeat(d)}${d ? '└ ' : ''}${esc(k.title)}</option>`); rec(k.id, d + 1); });
  rec(null, 0);
  const r = await modal({
    title: '↪ Mover página',
    body: `<p class="small">Elige dónde colocar «<b>${esc(n.title)}</b>»${wkKids(id).length ? ` y sus ${wkDescendants(id).length} subpáginas` : ''}. También puedes arrastrarla en el árbol.</p>
      <div><label class="lbl">Dentro de</label><select class="field" name="p"><option value="">📚 (raíz de la wiki)</option>${opts.join('')}</select></div>`,
    actions: [{ label: 'Cancelar', value: null, cls: 'ghost' }, { label: 'Mover', value: 'ok', cls: 'primary' }]
  });
  if (!r) return;
  if (wkMove(id, r.data.p || null, 'child')) toast('Página movida', 'success', 1500);
}
/** Al borrar una página, sus subpáginas suben un nivel. Devuelve una función para deshacerlo. */
function wkOrphanChildren(n) {
  const kids = wkKids(n.id); if (!kids.length) return null;
  const pid = wkParent(n), prev = kids.map(k => ({ k, parent: k.parent, order: k.order }));
  const sib = wkKids(pid).filter(s => s.id !== n.id);
  const at = Math.max(0, wkKids(pid).indexOf(n));
  kids.forEach(k => { k.parent = pid; });
  sib.splice(at, 0, ...kids); wkNormalize(sib);
  return () => prev.forEach(p => { p.k.parent = p.parent; p.k.order = p.order; });
}

/* ---------- Exportar una rama ---------- */
function wkBranch(id) {
  const out = []; const rec = (n, d) => { out.push({ n, d }); wkKids(n.id).forEach(c => rec(c, d + 1)); };
  const root = getNote(id); if (root) rec(root, 0);
  return out;
}
function wkExportMd(id) {
  flushNote();
  const b = wkBranch(id);
  return b.map(({ n, d }) => `${'#'.repeat(Math.min(6, d + 1))} ${n.title}\n\n${htmlToMd(parseHtml(sanitize(n.html))).trim()}\n`).join('\n');
}
function wkExportHtml(id) {
  flushNote();
  const b = wkBranch(id); if (!b.length) return '';
  const inBranch = new Set(b.map(x => x.n.id));
  const root = b[0].n;
  const body = n => {
    const el = parseHtml(sanitize(n.html));
    el.querySelectorAll('a.wl').forEach(a => {
      const t = a.dataset.note && getNote(a.dataset.note);
      const s = document.createElement(t && inBranch.has(t.id) ? 'a' : 'span');
      s.className = 'wl'; s.textContent = t ? t.title : a.textContent;
      if (t && inBranch.has(t.id)) s.setAttribute('href', '#p-' + t.id);
      a.replaceWith(s);
    });
    el.querySelectorAll('[contenteditable]').forEach(x => x.removeAttribute('contenteditable'));
    el.querySelectorAll('input').forEach(i => { i.setAttribute('disabled', ''); });
    return el.innerHTML;
  };
  const toc = []; let lastD = -1;
  b.forEach(({ n, d }) => {
    while (lastD < d) { toc.push('<ul>'); lastD++; }
    while (lastD > d) { toc.push('</li></ul>'); lastD--; }
    if (toc.length && toc[toc.length - 1] !== '<ul>') toc.push('</li>');
    toc.push(`<li><a href="#p-${esc(n.id)}" data-t="${esc(norm(n.title + ' ' + (n.text || '')))}">${esc(n.title)}</a>`);
  });
  while (lastD >= 0) { toc.push('</li></ul>'); lastD--; }
  const sections = b.map(({ n, d }) => {
    const anc = wkAncestors(n).filter(a => inBranch.has(a.id));
    const h = Math.min(6, d + 1);
    return `<section id="p-${esc(n.id)}" data-t="${esc(norm(n.title + ' ' + (n.text || '')))}">${anc.length ? `<div class="crumbs">${anc.map(a => `<a href="#p-${esc(a.id)}">${esc(a.title)}</a>`).join(' › ')}</div>` : ''}<h${h} class="ptitle">${esc(n.title)}</h${h}><div class="body">${body(n)}</div></section>`;
  }).join('\n');
  const now = new Date().toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' });
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(root.title)}</title><style>
:root{--bg:#fff;--fg:#1c2030;--mut:#687087;--line:#dfe2ec;--side:#f3f4f9;--acc:#6c5ce7;--code:#f4f4f8}
@media (prefers-color-scheme:dark){:root{--bg:#141821;--fg:#e7e9f0;--mut:#8f97ab;--line:#2c3244;--side:#0e1016;--acc:#8b7cf6;--code:#0e1016}}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--fg);line-height:1.6}
nav{position:fixed;top:0;left:0;bottom:0;width:290px;overflow:auto;background:var(--side);border-right:1px solid var(--line);padding:16px}
nav h1{font-size:1.05rem;margin:0 0 10px}nav input{width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg);margin-bottom:10px}
nav ul{list-style:none;margin:0;padding-left:14px}nav>ul{padding-left:0}nav li{margin:2px 0}nav a{color:var(--fg);text-decoration:none;display:block;padding:3px 6px;border-radius:6px;font-size:.9rem}nav a:hover{background:var(--line)}nav a.hide{display:none}
main{margin-left:290px;padding:24px 40px 80px;max-width:980px}section{padding:18px 0 26px;border-bottom:1px solid var(--line);scroll-margin-top:12px}section.hide{display:none}
.crumbs{font-size:.8rem;color:var(--mut)}.crumbs a{color:var(--mut)}.ptitle{margin:.2em 0 .5em}
a{color:var(--acc)}.wl{color:var(--acc);font-weight:600}span.wl{color:var(--mut)}
blockquote{border-left:3px solid var(--acc);margin:.5em 0;padding:4px 12px;color:var(--mut)}
pre{background:var(--code);padding:12px 14px;border-radius:8px;overflow:auto;font:.86rem/1.5 ui-monospace,Consolas,monospace;position:relative;white-space:pre-wrap}code{background:var(--code);padding:1px 5px;border-radius:5px;font-family:ui-monospace,Consolas,monospace;font-size:.9em}pre code{padding:0}
pre button{position:absolute;top:6px;right:6px;font-size:.75rem;border:1px solid var(--line);background:var(--bg);color:var(--fg);border-radius:6px;padding:2px 8px;cursor:pointer;opacity:.7}
table{border-collapse:collapse}td,th{border:1px solid var(--line);padding:4px 8px}
${CODE_CSS_EXPORT}
footer{color:var(--mut);font-size:.8rem;margin-top:30px}
@media (max-width:800px){nav{position:static;width:auto;max-height:45vh;border-right:0;border-bottom:1px solid var(--line)}main{margin-left:0;padding:16px}}
@media print{nav{display:none}main{margin:0;max-width:none}pre button{display:none}}
</style></head><body><nav><h1>📚 ${esc(root.title)}</h1><input id="q" placeholder="🔍 Buscar en el manual…" autocomplete="off">${toc.join('')}</nav>
<main>${sections}<footer>Exportado desde Cuadro de Mando el ${esc(now)} · ${b.length} página${b.length === 1 ? '' : 's'}</footer></main>
<script>
const norm=s=>s.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase();
document.getElementById('q').addEventListener('input',e=>{const q=norm(e.target.value.trim());document.querySelectorAll('section').forEach(s=>s.classList.toggle('hide',!!q&&!s.dataset.t.includes(q)));document.querySelectorAll('nav a[data-t]').forEach(a=>a.classList.toggle('hide',!!q&&!a.dataset.t.includes(q)));});
document.querySelectorAll('pre').forEach(p=>{const b=document.createElement('button');b.textContent='Copiar';b.onclick=()=>{navigator.clipboard.writeText(p.innerText.replace(/Copiar$/,'').replace(/\\n$/,'')).then(()=>{b.textContent='Copiado';setTimeout(()=>b.textContent='Copiar',1200)})};p.appendChild(b);});
<\/script></body></html>`;
}
function wkToMindmap(id) {
  const rec = n => { const x = mmNewNode(n.title); x.note = n.id; wkKids(n.id).forEach(c => x.children.push(rec(c))); return x; };
  const root = getNote(id); if (!root) return;
  const r = rec(root);
  mmCreateMap(root.title, r);
  toast(`Mapa creado con ${mmCount(r)} páginas`, 'success');
}

/* ---------- Integración ---------- */
onShow.notes = () => { if (notesMode !== store.get('notesMode', 'list')) setNotesMode(store.get('notesMode', 'list')); };
setTimeout(() => { if (APP_READY) setNotesMode(store.get('notesMode', 'list')); }, 0);
