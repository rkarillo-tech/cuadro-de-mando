/* =====================================================================
   ETIQUETAS (#etiqueta) EN TODA LA APLICACIÓN
   ===================================================================== */
/*
  Una etiqueta es «#» + letra + letras/números/_/- (p. ej. #portal-ciudadano, #reunión).
  Admite niveles con «/»: #proyecto/portal también aparece al filtrar por #proyecto.
  Mayúsculas y tildes no distinguen: #Reunión = #reunion (se muestra la forma más usada).
  Se reconocen en: notas (salvo dentro de código y enlaces), tareas (texto, notas y pasos),
  tarjetas Kanban (campo Etiquetas, título, descripción y subtareas), eventos, marcadores
  y mapas mentales. En Tareas, «#Nombre» de una lista existente sigue eligiendo esa lista.
*/
const TAG_RX = /(^|[\s([{,;:¡¿"'«>])#([\p{L}_][\p{L}\p{N}_-]*(?:\/[\p{L}\p{N}_-]+)*)/gu;
const tagKey = t => norm(String(t).replace(/^#/, '')).replace(/-+$/, '');
const tagParents = k => { const out = []; const p = k.split('/'); for (let i = 1; i < p.length; i++) out.push(p.slice(0, i).join('/')); return out; };
function tagsIn(text) {
  const out = []; let m; TAG_RX.lastIndex = 0;
  while ((m = TAG_RX.exec(text || ''))) out.push(m[2].replace(/-+$/, ''));
  return out;
}
const noteTagCache = new Map();
function noteTags(n) {
  const sig = (n.updated || 0) + ':' + (n.html || '').length;
  const c = noteTagCache.get(n.id);
  if (c && c.sig === sig) return c.tags;
  const html = String(n.html || '').replace(/<pre[\s\S]*?<\/pre>/gi, ' ').replace(/<code[\s\S]*?<\/code>/gi, ' ').replace(/<a\b[\s\S]*?<\/a>/gi, ' ');
  const tags = tagsIn(htmlText(html.replace(/<(div|p|li|h\d|br|tr|td)\b/gi, ' <$1')));
  noteTagCache.set(n.id, { sig, tags });
  return tags;
}
/** Elementos etiquetados: { kind, id, label, sub, done, tags:[nombres] } */
function taggedItems() {
  const out = [];
  const listName = id => (S.todoLists.find(l => l.id === id) || {}).name || '';
  S.notes.forEach(n => { const t = allNoteTags(n); if (t.length) out.push({ kind: 'note', id: n.id, label: n.title, sub: wkParent(n) ? '📚 ' + wkPath(n) : '', tags: t, own: n.tags || [] }); });
  S.todos.forEach(t => { const tg = todoTags(t); if (tg.length) out.push({ kind: 'todo', id: t.id, label: t.text, sub: [listName(t.listId), t.due ? fmtDayLabel(t.due) : ''].filter(Boolean).join(' · '), done: !!t.done, tags: tg, own: t.tags || [] }); });
  S.tasks.forEach(t => { const tg = taskTags(t); if (tg.length) out.push({ kind: 'kanban', id: t.id, label: t.title, sub: (COLS.find(c => c.id === t.col) || {}).name || '', done: t.col === 'done', tags: tg, own: t.tags || [] }); });
  S.events.forEach(ev => { const tg = eventTags(ev); if (tg.length) out.push({ kind: 'event', id: ev.id, label: ev.title, sub: fmtDayLabel(ev.date), tags: tg, own: ev.tags || [] }); });
  S.bookmarks.forEach(b => { const tg = bmTags(b); if (tg.length) out.push({ kind: 'bookmark', id: b.id, label: b.title, sub: b.url, tags: tg, own: b.tags || [] }); });
  S.mindmaps.forEach(m => { const tg = []; mmWalk(m.root, x => { tg.push(...tagsIn(x.text)); }); if (tg.length) out.push({ kind: 'map', id: m.id, label: m.title, sub: `${mmCount(m.root)} ideas`, tags: tg, own: [] }); });
  return out;
}
let tagIdxCache = null;
/** Índice: clave normalizada → { key, name, items:[…], count } */
function tagIndex() {
  const stamp = (MEM.lastChange || 0) + ':' + S.notes.length + ':' + S.todos.length + ':' + S.tasks.length;
  if (tagIdxCache && tagIdxCache.stamp === stamp) return tagIdxCache.map;
  const map = new Map(), names = new Map();
  taggedItems().forEach(it => {
    const seen = new Set();
    it.tags.forEach(name => {
      const k = tagKey(name); if (!k || seen.has(k)) return; seen.add(k);
      if (!map.has(k)) map.set(k, { key: k, items: [] });
      map.get(k).items.push(it);
      const nm = names.get(k) || new Map(); nm.set(name, (nm.get(name) || 0) + 1); names.set(k, nm);
    });
  });
  map.forEach((e, k) => { const nm = names.get(k); e.name = [...nm.entries()].sort((a, b) => b[1] - a[1])[0][0]; e.count = e.items.length; });
  // etiquetas creadas a mano (aunque todavía no las use nada)
  Object.entries(S.tagMeta || {}).forEach(([k, m]) => { if (m && m.name && !map.has(k)) map.set(k, { key: k, name: m.name, items: [], count: 0, defined: true }); });
  // padres implícitos (#proyecto para #proyecto/portal)
  [...map.keys()].forEach(k => tagParents(k).forEach(pk => { if (!map.has(pk)) map.set(pk, { key: pk, name: map.get(k).name.split('/').slice(0, pk.split('/').length).join('/'), items: [], count: 0, implicit: true }); }));
  tagIdxCache = { stamp, map };
  try { tagStyleRefresh(); } catch {}
  return map;
}
/** Elementos de una etiqueta, incluidos los de sus subetiquetas. */
function tagItemsOf(key) {
  const idx = tagIndex(), seen = new Set(), out = [];
  idx.forEach((e, k) => { if (k === key || k.startsWith(key + '/')) e.items.forEach(it => { const id = it.kind + ':' + it.id; if (!seen.has(id)) { seen.add(id); out.push(it); } }); });
  return out;
}
const tagChip = (name, extra = '') => `<button type="button" class="tag-chip" data-tag="${esc(tagKey(name))}" title="Ver todo lo etiquetado con #${esc(name)}">#${esc(name)}${extra}</button>`;
/** Resalta las #etiquetas de un texto YA escapado (para listas de tareas, tarjetas…). */
function tagHighlight(escaped) {
  return escaped.replace(TAG_RX, (m, pre, name) => `${pre}<span class="tg-mini" data-tag="${esc(tagKey(name))}" title="Ver #${esc(name)}">#${name}</span>`);
}

/* ---------- Autocompletado al escribir # ---------- */
const tagPop = document.createElement('div');
tagPop.className = 'popover menu wl-pop'; tagPop.id = 'tagPop';
document.body.append(tagPop);
let tagAc = null;   // { kind:'editor'|'field', el, node?, start, q, items, idx }
function tagSuggest(q, withLists) {
  const nq = norm(q), idx = tagIndex();
  let items = [...idx.values()].filter(e => !e.implicit || true).filter(e => !nq || e.key.includes(nq)).sort((a, b) => (b.key.startsWith(nq) - a.key.startsWith(nq)) || b.count - a.count).slice(0, 8).map(e => ({ tag: e.name, count: e.count }));
  if (withLists) items = S.todoLists.filter(l => !nq || norm(l.name).replace(/\s+/g, '').includes(nq)).slice(0, 4).map(l => ({ list: l })).concat(items);
  const exact = q && [...idx.keys()].includes(tagKey(q));
  if (q && !exact && /^[\p{L}_][\p{L}\p{N}_\-/]*$/u.test(q)) items.push({ fresh: q });
  return items;
}
function tagAcOpen(ctx, rect) {
  const items = tagSuggest(ctx.q, ctx.lists);
  if (!items.length) { tagAcClose(); return; }
  tagAc = { ...ctx, items, idx: 0 };
  tagPop.innerHTML = `<div class="muted small" style="padding:6px 10px">Etiquetas <span style="float:right"><kbd>↑</kbd><kbd>↓</kbd> <kbd>Enter</kbd></span></div>` + items.map((it, i) => `<button type="button" data-tg="${i}" class="${i === 0 ? 'on' : ''}">${it.list ? `${esc(it.list.emoji || '📋')} Lista «${esc(it.list.name)}»` : it.fresh ? `＋ Nueva etiqueta #${esc(it.fresh)}` : `🏷️ #${esc(it.tag)} <span class="muted small">· ${it.count}</span>`}</button>`).join('');
  tagPop.classList.add('open');
  const w = tagPop.offsetWidth, h = tagPop.offsetHeight;
  let top = rect.bottom + 6; if (top + h > innerHeight - 10) top = Math.max(10, rect.top - h - 6);
  tagPop.style.left = Math.max(10, Math.min(rect.left, innerWidth - w - 12)) + 'px';
  tagPop.style.top = top + 'px';
}
function tagAcClose() { tagAc = null; tagPop.classList.remove('open'); }
function tagAcChoose(i) {
  const a = tagAc; if (!a) return;
  const it = a.items[i]; if (!it) return;
  tagAcClose();
  const word = it.list ? it.list.name.replace(/\s+/g, '') : (it.tag || it.fresh);
  if (a.kind === 'editor') {
    const node = a.node; if (!node.isConnected) return;
    const sel = getSelection();
    const end = sel.rangeCount && sel.anchorNode === node ? sel.anchorOffset : a.start + 1 + a.q.length;
    const r = document.createRange(); r.setStart(node, a.start); r.setEnd(node, end);
    edReplace(r, `<span class="tg" data-tk="${esc(tagKey(word))}">#${esc(word)}</span>&nbsp;`);
    markDirty();
  } else {
    const el = a.el, v = el.value, end = el.selectionStart;
    const ins = '#' + word + ' ';
    el.value = v.slice(0, a.start) + ins + v.slice(end);
    const pos = a.start + ins.length; el.focus(); el.setSelectionRange(pos, pos);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
function tagAcKey(e) {
  if (!tagAc || !tagPop.classList.contains('open')) return false;
  const n = tagAc.items.length;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); tagAc.idx = (tagAc.idx + (e.key === 'ArrowDown' ? 1 : -1) + n) % n; $$('#tagPop [data-tg]').forEach(b => b.classList.toggle('on', +b.dataset.tg === tagAc.idx)); return true; }
  if ((e.key === 'Enter' || e.key === 'Tab') && n) { e.preventDefault(); e.stopImmediatePropagation(); tagAcChoose(tagAc.idx); return true; }
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); tagAcClose(); return true; }
  return false;
}
tagPop.addEventListener('mousedown', e => e.preventDefault());
tagPop.addEventListener('click', e => { const b = e.target.closest('[data-tg]'); if (b) tagAcChoose(+b.dataset.tg); });
const TAG_TYPING = /(^|[\s([{,;:¡¿"'«])#([\p{L}\p{N}_\-/]{0,40})$/u;
/* En el editor de notas */
editor.addEventListener('input', e => {
  const sel = getSelection();
  if (!sel.rangeCount || !sel.isCollapsed || /^history/.test(e.inputType || '')) { tagAcClose(); return; }
  const node = sel.anchorNode, off = sel.anchorOffset;
  if (!node || node.nodeType !== 3 || !editor.contains(node) || node.parentElement.closest('pre,code,a')) { tagAcClose(); return; }
  const before = node.nodeValue.slice(0, off);
  const m = TAG_TYPING.exec(before);
  if (m && !(wlState && wlPop.classList.contains('open'))) {
    let rect; try { const r = sel.getRangeAt(0).cloneRange(); rect = r.getClientRects()[0] || r.getBoundingClientRect(); } catch {}
    tagAcOpen({ kind: 'editor', node, start: off - m[2].length - 1, q: m[2] }, rect && (rect.top || rect.left) ? rect : editor.getBoundingClientRect());
    return;
  }
  tagAcClose();
  // al terminar de escribir una etiqueta (espacio), se resalta
  const t = /(^|[\s([{,;:¡¿"'«])#([\p{L}_][\p{L}\p{N}_-]*(?:\/[\p{L}\p{N}_-]+)*)[\s ]$/u.exec(before);
  if (t && !node.parentElement.closest('.tg')) {
    const start = off - 1 - t[2].length - 1;
    // se envuelve con execCommand para que Ctrl+Z pueda deshacerlo
    const r = document.createRange(); r.setStart(node, start); r.setEnd(node, off);
    const word = node.nodeValue.slice(start, off - 1), gap = node.nodeValue[off - 1];
    edReplace(r, `<span class="tg" data-tk="${esc(tagKey(word))}">${esc(word)}</span>${gap === ' ' ? '&nbsp;' : esc(gap)}`);
    markDirty();
  }
});
/* Si al escribir dentro de una etiqueta resaltada deja de serlo (un espacio al final, por ejemplo),
   el resaltado se recorta a la parte que sigue siendo etiqueta. Con execCommand, para poder deshacerlo. */
const TAG_WHOLE = /^#[\p{L}_][\p{L}\p{N}_-]*(?:\/[\p{L}\p{N}_-]+)*/u;
editor.addEventListener('input', e => {
  if (e.isComposing || /^history/.test(e.inputType || '')) return;
  const sel = getSelection(), a = sel.rangeCount && sel.isCollapsed && sel.anchorNode;
  const sp = a && (a.nodeType === 3 ? a.parentElement : a).closest('span.tg');
  if (!sp || !editor.contains(sp)) return;
  const txt = sp.textContent, m = TAG_WHOLE.exec(txt);
  if (m && m[0].length === txt.length) return;
  let caret = txt.length;
  if (a.nodeType === 3 && sp.contains(a)) { const r = document.createRange(); r.selectNodeContents(sp); r.setEnd(a, sel.anchorOffset); caret = r.toString().length; }
  const keep = m ? m[0] : '', rest = txt.slice(keep.length);
  const r = document.createRange(); r.selectNode(sp);
  edReplace(r, (keep ? `<span class="tg" data-tk="${esc(tagKey(keep))}">${esc(keep)}</span>` : '') + esc(rest).replace(/^ | $/g, '&nbsp;'));
  for (let i = txt.length - caret; i > 0; i--) sel.modify('move', 'backward', 'character');
  markDirty();
});
/** Actualiza el color de las etiquetas del editor que han cambiado de nombre (se hace al guardar,
    no a cada tecla, porque tocar el DOM mientras se escribe estropea el «deshacer» por palabras). */
function tagRefreshEditorKeys() {
  const fresh = [];
  editor.querySelectorAll('span.tg').forEach(s => { const k = tagKey(s.textContent); if (s.dataset.tk !== k) { s.dataset.tk = k; fresh.push(k); } });
  if (fresh.length) try { tagStyleRefresh(fresh); } catch {}
}
editor.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== editor) tagAcClose(); }, 150));
/** Marca visualmente las etiquetas del editor (al abrir una nota). */
function tagDecorateEditor() {
  editor.querySelectorAll('span.tg').forEach(s => {
    const m = TAG_WHOLE.exec(s.textContent);
    if (!m) { s.replaceWith(...s.childNodes); return; }
    if (m[0].length < s.textContent.length && s.childNodes.length === 1 && s.firstChild.nodeType === 3) s.after(s.firstChild.splitText(m[0].length));
  });
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, { acceptNode: n => n.nodeValue.includes('#') && !n.parentElement.closest('pre,code,a,.tg') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(t => {
    let node = t, m;
    TAG_RX.lastIndex = 0;
    while (node && (m = new RegExp(TAG_RX.source, 'u').exec(node.nodeValue))) {
      const start = m.index + m[1].length, len = m[2].length + 1;
      const mid = node.splitText(start), rest = mid.splitText(len);
      const span = document.createElement('span'); span.className = 'tg'; mid.replaceWith(span); span.append(mid);
      node = rest;
    }
  });
  editor.querySelectorAll('span.tg').forEach(s => { s.dataset.tk = tagKey(s.textContent); });
}
editor.addEventListener('click', e => {
  const t = e.target.closest('span.tg'); if (!t || !(e.ctrlKey || e.metaKey)) return;
  e.preventDefault(); openTagView(tagKey(t.textContent));
}, true);
/* En campos de texto (tarea rápida, notas de tarea, descripción de tarjeta, captura rápida…) */
function tagAttachField(el, { lists = false } = {}) {
  if (!el || el.dataset.tagac) return;
  el.dataset.tagac = '1';
  el.addEventListener('input', () => {
    if (el.selectionStart !== el.selectionEnd) { tagAcClose(); return; }
    const m = TAG_TYPING.exec(el.value.slice(0, el.selectionStart));
    if (m && !(typeof wlfState !== 'undefined' && wlfState && wlfPop.classList.contains('open'))) tagAcOpen({ kind: 'field', el, start: el.selectionStart - m[2].length - 1, q: m[2], lists }, el.getBoundingClientRect());
    else if (tagAc && tagAc.el === el) tagAcClose();
  });
  el.addEventListener('blur', () => setTimeout(() => { if (tagAc && tagAc.el === el && document.activeElement !== el) tagAcClose(); }, 150));
}
window.addEventListener('keydown', e => { if (tagAc && tagAc.kind === 'field' && e.target === tagAc.el) tagAcKey(e); }, true);
document.addEventListener('focusin', e => {
  const el = e.target;
  if (el.matches && el.matches('.modal textarea[name=notes], .modal textarea[name=desc], .modal textarea[name=t], .modal input[name=title], .modal input[name=text]')) tagAttachField(el);
});
tagAttachField($('#todoInput'), { lists: true });
tagAttachField($('#quickText'));

/* ---------- Clic en cualquier etiqueta → vista de etiquetas ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-tag]');
  if (!t || t.closest('#view-tags .tag-cloud') || t.closest('#tagPop')) return;
  e.preventDefault(); e.stopPropagation();
  if ($('#modalBack').classList.contains('open')) { const b = $('#modal .modal-foot .btn.primary'); if (b) b.click(); }
  setTimeout(() => openTagView(t.dataset.tag), 30);
}, true);

/* ---------- Renombrar / fusionar ---------- */
function tagReplaceIn(text, oldKey, newName) {
  let n = 0;
  const out = String(text || '').replace(TAG_RX, (m, pre, name) => {
    const k = tagKey(name);
    if (k === oldKey || k.startsWith(oldKey + '/')) { n++; return `${pre}#${newName}${name.slice(name.split('/').slice(0, oldKey.split('/').length).join('/').length)}`; }
    return m;
  });
  return [out, n];
}
async function tagRenameDialog(key) {
  const e = tagIndex().get(key); if (!e) return;
  const total = tagItemsOf(key).length;
  const r = await modal({
    title: `✏️ Renombrar #${e.name}`,
    body: `<p class="small">Se cambiará en los <b>${total}</b> elementos que la usan${key.includes('/') ? '' : ' (y en sus subetiquetas)'}. Si escribes el nombre de otra etiqueta existente, <b>se fusionarán</b>. Antes se guarda una versión en el historial por si quieres deshacerlo.</p>
      <div><label class="lbl">Nuevo nombre</label><input class="field" name="v" value="${esc(e.name)}" spellcheck="false"></div><div class="small muted" id="tgMergeInfo" style="min-height:1.3em;margin-top:6px"></div>`,
    actions: [{ label: 'Cancelar', value: null, cls: 'ghost' }, { label: 'Aplicar', value: 'ok', cls: 'primary', validate: f => /^#?[\p{L}_][\p{L}\p{N}_-]*(?:\/[\p{L}\p{N}_-]+)*$/u.test(f.elements.namedItem('v').value.trim()) ? null : 'Usa letras, números, guiones o «/» (sin espacios), empezando por una letra' }],
    onOpen: f => { const i = f.elements.namedItem('v'), info = $('#tgMergeInfo', f); i.addEventListener('input', () => { const k = tagKey(i.value.trim()); const ex = tagIndex().get(k); info.textContent = ex && k !== key ? `Se fusionará con #${ex.name} (${ex.count} elementos)` : ''; }); }
  });
  if (!r) return;
  const newName = r.data.v.trim().replace(/^#/, '');
  if (tagKey(newName) === key && newName === e.name) return;
  await histSnapshot('before', `Antes de renombrar #${e.name} → #${newName}`, { force: true });
  const n = tagRename(key, newName);
  toast(`#${e.name} → #${newName}: ${n} cambio${n === 1 ? '' : 's'}`, 'success', 4000);
  openTagView(tagKey(newName));
}
/**
 * Recorre todos los textos y campos de etiquetas de la aplicación.
 * textFix(texto) → texto nuevo; arrFix(lista) → lista nueva; wants(nombres) → ¿hay que tocar esta nota?
 */
function tagEditAll(textFix, arrFix, wants) {
  flushNote();
  const arr = o => { if (o.tags && o.tags.length) { const a = arrFix(o.tags); if (a.length) o.tags = a; else delete o.tags; } };
  let notes = false;
  S.notes.forEach(n => {
    const before = JSON.stringify(n.tags || []); arr(n); if (JSON.stringify(n.tags || []) !== before) notes = true;
    if (!wants(noteTags(n))) return;
    const body = parseHtml(n.html);
    const w = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, { acceptNode: x => x.parentElement.closest('pre,code,a') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
    nodes.forEach(t => { t.nodeValue = textFix(t.nodeValue); });
    n.html = body.innerHTML; n.text = htmlText(n.html); notes = true;
  });
  S.todos.forEach(t => { t.text = textFix(t.text); t.notes = textFix(t.notes); (t.steps || []).forEach(x => { x.text = textFix(x.text); }); arr(t); });
  S.tasks.forEach(t => { t.title = textFix(t.title); t.desc = textFix(t.desc); (t.subtasks || []).forEach(x => { x.text = textFix(x.text); }); if (t.tags) { t.tags = arrFix(t.tags); } });
  S.events.forEach(ev => { ev.title = textFix(ev.title); ev.notes = textFix(ev.notes); arr(ev); });
  S.bookmarks.forEach(b => { b.title = textFix(b.title); b.notes = textFix(b.notes); arr(b); });
  S.mindmaps.forEach(m => mmWalk(m.root, x => { x.text = textFix(x.text); }));
  if (notes) save.notes();
  save.todos(); save.tasks(); save.events(); save.bookmarks(); save.mindmaps();
  tagIdxCache = null;
  if (currentNoteId && getNote(currentNoteId)) renderNotesView();
}
const tagHitFn = (key, subs = true) => k => k === key || (subs && k.startsWith(key + '/'));
function tagRename(key, newName) {
  let total = 0;
  const hit = tagHitFn(key);
  const fix = s => { const [o, n] = tagReplaceIn(s, key, newName); total += n; return o; };
  const fixArr = arr => { const seen = new Set(); return arr.map(g => { const k = tagKey(g); if (hit(k)) { total++; return newName + g.slice(g.split('/').slice(0, key.split('/').length).join('/').length); } return g; }).filter(g => { const k = tagKey(g); if (seen.has(k)) return false; seen.add(k); return true; }); };
  tagEditAll(fix, fixArr, names => names.some(t => hit(tagKey(t))));
  // color, descripción y nombre pasan al nuevo nombre (si el destino ya tenía los suyos, se conservan)
  const M = S.tagMeta || {}, nk = tagKey(newName); let meta = false;
  Object.keys(M).forEach(k => {
    if (!hit(k)) return;
    const to = nk + k.slice(key.length); if (to === k && !M[k].name) return;
    const m = Object.assign({}, M[k]);
    if (m.name) m.name = newName + m.name.slice(m.name.split('/').slice(0, key.split('/').length).join('/').length);
    delete M[k]; M[to] = Object.assign(m, M[to] || {}); meta = true;
  });
  if (meta) save.tagMeta();
  Object.keys(tagFilters).forEach(sc => { const f = tagFilters[sc]; if (f && hit(f)) tagFilters[sc] = nk + f.slice(key.length); });
  tagIdxCache = null;
  return total;
}
/** Elimina una etiqueta (y, si subs, sus subetiquetas): la quita de los campos y en los textos deja la palabra sin «#». */
function tagDelete(key, subs = true) {
  let total = 0;
  const hit = tagHitFn(key, subs);
  const fix = s => String(s || '').replace(TAG_RX, (m, pre, name) => { if (hit(tagKey(name))) { total++; return pre + name; } return m; });
  const fixArr = arr => arr.filter(g => { if (hit(tagKey(g))) { total++; return false; } return true; });
  tagEditAll(fix, fixArr, names => names.some(t => hit(tagKey(t))));
  const M = S.tagMeta || {}; let meta = false;
  Object.keys(M).forEach(k => { if (hit(k)) { delete M[k]; meta = true; } });
  if (meta) save.tagMeta();
  Object.keys(tagFilters).forEach(sc => { if (tagFilters[sc] && hit(tagFilters[sc])) tagFilters[sc] = null; });
  tagIdxCache = null;
  return total;
}
