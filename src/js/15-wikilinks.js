/* =====================================================================
   ENLACES ENTRE NOTAS  [[Título]]
   ===================================================================== */
/*
  Un enlace se guarda como <a class="wl" data-note="ID" contenteditable="false">Título</a>.
  Va por ID, así que renombrar una nota no rompe los enlaces. Si se escribe [[Algo]] y no
  existe esa nota, queda como enlace «pendiente» (data-title) y se resuelve solo en cuanto
  se crea una nota con ese título. Compatible con Markdown/Obsidian: [[Nota]], [[Nota|alias]],
  [[Nota#sección]] al importar, y se exporta como [[Nota]].
*/
const wlPop = document.createElement('div');
wlPop.className = 'popover menu wl-pop'; wlPop.id = 'wlPop';
document.body.append(wlPop);
let wlState = null;   // { node, start, q, items, idx }

const wlCleanTitle = t => String(t || '').split('|')[0].split('#')[0].replace(/\s+/g, ' ').trim();
const noteByTitle = t => { const k = norm(wlCleanTitle(t)); return k ? S.notes.find(n => norm(n.title.trim()) === k) : null; };
const escRx = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function wlMakeChip(note, title) {
  const a = document.createElement('a');
  a.className = 'wl'; a.setAttribute('contenteditable', 'false');
  if (note) { a.dataset.note = note.id; a.textContent = note.title; }
  else { a.classList.add('missing'); a.dataset.title = wlCleanTitle(title); a.textContent = wlCleanTitle(title); }
  return a;
}
/** IDs de las notas a las que enlaza una nota (en orden, sin repetir). */
function wlLinksOf(n) {
  const out = new Set(); const re = /data-note="([^"]+)"/g; let m;
  while ((m = re.exec(n.html || ''))) out.add(m[1]);
  return [...out];
}
/** Referencias [[Título]] escritas en texto plano (tarjetas Kanban, tareas). */
function wlTextRefs(text) {
  const out = new Set(); const re = /\[\[([^\[\]\n]{1,120})\]\]/g; let m;
  while ((m = re.exec(text || ''))) { const n = noteByTitle(m[1]); if (n) out.add(n.id); }
  return [...out];
}

/* ---------- Conversión de [[...]] escrito o pegado ---------- */
/**
 * Pone un enlace en lugar del rango r. Se incluye el carácter anterior (o uno invisible al
 * principio de línea) porque Chrome saca de la línea un elemento no editable que vaya primero.
 */
function wlReplaceWithChip(r, chip, tail = '') {
  const t = r.startContainer, o = r.startOffset;
  let lead = '\u200b';
  if (t.nodeType === 3 && o > 0) { lead = t.nodeValue[o - 1]; r.setStart(t, o - 1); }
  edReplace(r, (lead === ' ' ? '&nbsp;' : esc(lead)) + chip.outerHTML + tail);
}
function wlConvertTyped() {
  const sel = getSelection();
  const caret = sel.rangeCount && sel.isCollapsed ? { node: sel.anchorNode, off: sel.anchorOffset } : null;
  let changed = false, guard = 50;
  while (guard--) {
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, { acceptNode: n => n.nodeValue.includes('[[') && !n.parentElement.closest('a,pre') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
    let t, m = null;
    while ((t = walker.nextNode())) { m = /\[\[([^\[\]\n]{1,120})\]\]/.exec(t.nodeValue); if (m && wlCleanTitle(m[1])) break; m = null; }
    if (!m) break;
    // se sustituye con execCommand para que Ctrl+Z pueda deshacerlo
    const atCaret = caret && caret.node === t && caret.off >= m.index + m[0].length;
    const keep = !atCaret && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    const r = document.createRange(); r.setStart(t, m.index); r.setEnd(t, m.index + m[0].length);
    // al final de la línea se deja un carácter invisible tras el enlace para poder seguir escribiendo
    const end = atCaret && m.index + m[0].length === t.nodeValue.length && !t.nextSibling;
    wlReplaceWithChip(r, wlMakeChip(noteByTitle(m[1]), m[1]), end ? '&#8203;' : '');
    if (keep && keep.startContainer.isConnected) { sel.removeAllRanges(); sel.addRange(keep); }
    changed = true;
  }
  if (changed) markDirty();
}

/* ---------- Autocompletado al escribir [[ ---------- */
function wlOnInput(e) {
  if (e && /^history/.test(e.inputType || '')) { wlClose(); return; } // deshacer/rehacer: no volver a convertir
  const sel = getSelection();
  if (!sel.rangeCount || !sel.isCollapsed) { wlClose(); return; }
  const node = sel.anchorNode, off = sel.anchorOffset;
  if (node && node.nodeType === 3 && editor.contains(node) && !node.parentElement.closest('pre')) {
    const before = node.nodeValue.slice(0, off);
    const m = before.match(/\[\[([^\[\]\n]{0,60})$/);
    if (m) { wlOpen(node, off - m[0].length, m[1]); return; }
  }
  wlClose();
  if (editor.textContent.includes('[[')) wlConvertTyped();
}
function wlItems(q) {
  const nq = norm(q.trim()), cur = currentNoteId;
  let list = S.notes.filter(n => n.id !== cur && (!nq || norm(n.title).includes(nq)));
  list.sort((a, b) => (nq ? (norm(b.title).startsWith(nq) - norm(a.title).startsWith(nq)) : 0) || b.updated - a.updated);
  const items = list.slice(0, 8).map(n => ({ note: n }));
  const t = wlCleanTitle(q);
  if (t && !noteByTitle(t)) items.push({ create: t });
  return items;
}
function wlOpen(node, start, q) {
  const items = wlItems(q);
  const idx = wlState && wlState.q === q ? Math.min(wlState.idx, items.length - 1) : 0;
  wlState = { node, start, q, items, idx: Math.max(0, idx) };
  wlPop.innerHTML = `<div class="muted small" style="padding:6px 10px">Enlazar con la nota… <span style="float:right"><kbd>↑</kbd><kbd>↓</kbd> <kbd>Enter</kbd></span></div>` + (items.length
    ? items.map((it, i) => `<button type="button" data-wl="${i}" class="${i === wlState.idx ? 'on' : ''}">${it.note ? `📄 ${esc(it.note.title)}` : `＋ Crear nota «${esc(it.create)}»`}</button>`).join('')
    : '<div class="muted small" style="padding:6px 10px">Escribe el título de una nota</div>');
  wlPop.classList.add('open');
  // posición junto al cursor
  let rect = null;
  try { const r = getSelection().getRangeAt(0).cloneRange(); r.collapse(true); rect = r.getClientRects()[0] || r.getBoundingClientRect(); } catch {}
  if (!rect || (!rect.top && !rect.left)) rect = editor.getBoundingClientRect();
  const w = wlPop.offsetWidth, h = wlPop.offsetHeight;
  let top = rect.bottom + 6; if (top + h > innerHeight - 10) top = Math.max(10, rect.top - h - 6);
  wlPop.style.left = Math.max(10, Math.min(rect.left, innerWidth - w - 12)) + 'px';
  wlPop.style.top = top + 'px';
}
function wlClose() { wlState = null; wlPop.classList.remove('open'); }
function wlChoose(i) {
  const st = wlState; if (!st) return;
  const it = st.items[i]; if (!it) return;
  wlClose();
  let note = it.note;
  if (it.create) {
    const keep = editor.innerHTML; // createNote guarda la nota actual antes de crear la nueva
    note = createNote(it.create, '', false);
    if (editor.innerHTML !== keep) return;
    toast(`Nota «${note.title}» creada y enlazada`, 'success', 2500);
  }
  const node = st.node;
  if (!node.isConnected) return;
  const sel = getSelection();
  let end = sel.rangeCount && sel.anchorNode === node ? sel.anchorOffset : Math.min(node.nodeValue.length, st.start + 2 + st.q.length);
  if (node.nodeValue.slice(end, end + 2) === ']]') end += 2;
  const r = document.createRange(); r.setStart(node, st.start); r.setEnd(node, end);
  editor.focus({ preventScroll: true });
  wlReplaceWithChip(r, wlMakeChip(note), '&nbsp;');
  markDirty(); flushNote(); renderBacklinks();
}
function wlKey(e) {
  if (!wlState || !wlPop.classList.contains('open')) return false;
  const n = wlState.items.length;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault(); if (!n) return true;
    wlState.idx = (wlState.idx + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
    $$('#wlPop [data-wl]').forEach(b => b.classList.toggle('on', +b.dataset.wl === wlState.idx));
    return true;
  }
  if ((e.key === 'Enter' || e.key === 'Tab') && n) { e.preventDefault(); wlChoose(wlState.idx); return true; }
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); wlClose(); return true; }
  return false;
}
wlPop.addEventListener('mousedown', e => e.preventDefault());
wlPop.addEventListener('click', e => { const b = e.target.closest('[data-wl]'); if (b) wlChoose(+b.dataset.wl); });
editor.addEventListener('input', wlOnInput);
editor.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== editor) wlClose(); }, 150));

/* ---------- Seguir un enlace ---------- */
async function wlFollow(a) {
  const id = a.dataset.note, n = id && getNote(id);
  if (n) { flushNote(); openNote(n.id); return; }
  const title = a.dataset.title || a.textContent.trim();
  if (!title) return;
  if (!(await confirmDialog(`La nota «${title}» ${id ? 'se eliminó' : 'todavía no existe'}. ¿Quieres crearla?`, 'Crear nota', false))) return;
  flushNote();
  const created = createNote(title, '', false);
  wlResolveAll();
  if (id) wlRepoint(id, created.id);
  openNote(created.id);
}
editor.addEventListener('click', e => {
  const a = e.target.closest('a.wl'); if (!a) return;
  e.preventDefault(); e.stopImmediatePropagation();
  wlFollow(a);
}, true);

/* ---------- Mantenimiento de enlaces ---------- */
function wlMutate(n, fn) {
  const body = parseHtml(n.html);
  if (!fn(body)) return false;
  n.html = body.innerHTML; n.text = htmlText(n.html);
  return true;
}
/** Resuelve enlaces pendientes ([[Título]] sin nota) en todas las notas. */
function wlResolveAll() {
  let changed = 0;
  S.notes.forEach(n => {
    if (!(n.html || '').includes('data-title=')) return;
    if (n.id === currentNoteId && noteDirty) flushNote();
    if (wlMutate(n, body => {
      let c = false;
      body.querySelectorAll('a.wl[data-title]').forEach(a => { const t = noteByTitle(a.dataset.title); if (t && t.id !== n.id) { a.removeAttribute('data-title'); a.classList.remove('missing'); a.dataset.note = t.id; a.textContent = t.title; c = true; } });
      return c;
    })) changed++;
  });
  if (changed) { save.notes(); if (currentNoteId && getNote(currentNoteId) && currentTab === 'notes') wlRefreshEditor(); }
  return changed;
}
/** Tras renombrar una nota, actualiza el texto de los enlaces que apuntan a ella. */
function wlRenameEverywhere(id, title) {
  let changed = 0;
  S.notes.forEach(n => {
    if (n.id === id || !(n.html || '').includes(`data-note="${id}"`)) return;
    if (wlMutate(n, body => { body.querySelectorAll(`a.wl[data-note="${CSS.escape(id)}"]`).forEach(a => { a.textContent = title; }); return true; })) changed++;
  });
  if (changed) save.notes();
  return changed;
}
function wlRepoint(oldId, newId) {
  const nn = getNote(newId);
  S.notes.forEach(n => {
    if (!(n.html || '').includes(`data-note="${oldId}"`)) return;
    wlMutate(n, body => { body.querySelectorAll(`a.wl[data-note="${CSS.escape(oldId)}"]`).forEach(a => { a.dataset.note = newId; a.classList.remove('missing'); a.textContent = nn.title; }); return true; });
  });
  save.notes();
}
/** Actualiza los enlaces visibles del editor (títulos actuales, rotos, pendientes). */
function wlRefreshEditor() {
  let changed = false;
  editor.querySelectorAll('a.wl').forEach(a => {
    a.setAttribute('contenteditable', 'false');
    if (a.dataset.title) {
      const t = noteByTitle(a.dataset.title);
      if (t && t.id !== currentNoteId) { a.removeAttribute('data-title'); a.dataset.note = t.id; changed = true; }
    }
    const n = a.dataset.note && getNote(a.dataset.note);
    if (n) { if (a.textContent !== n.title) { a.textContent = n.title; changed = true; } a.classList.remove('missing', 'broken'); a.title = `Abrir «${n.title}»`; }
    else if (a.dataset.note) { a.classList.add('broken'); a.title = 'La nota enlazada se eliminó · clic para volver a crearla'; }
    else { a.classList.add('missing'); a.title = 'Esta nota aún no existe · clic para crearla'; }
  });
  if (changed) {
    const n = getNote(currentNoteId);
    if (n) { n.html = editor.innerHTML; n.text = htmlText(n.html); save.notes(); }
  }
}

/* ---------- Panel de enlaces entrantes y salientes ---------- */
function wlMentionRx(title) {
  return new RegExp(`(^|[^\\p{L}\\p{N}_])(${escRx(title)})(?=$|[^\\p{L}\\p{N}_])`, 'iu');
}
function renderBacklinks() {
  const box = $('#backlinks'); if (!box) return;
  const n = getNote(currentNoteId);
  if (!n) { box.innerHTML = ''; return; }
  const inc = S.notes.filter(x => x.id !== n.id && (x.html || '').includes(`data-note="${n.id}"`)).sort((a, b) => b.updated - a.updated);
  const out = wlLinksOf(n).filter(id => id !== n.id).map(getNote).filter(Boolean);
  const incIds = new Set(inc.map(x => x.id));
  const rx = n.title.trim().length >= 3 ? wlMentionRx(n.title.trim()) : null;
  const mentions = rx ? S.notes.filter(x => x.id !== n.id && !incIds.has(x.id) && rx.test(x.text || '')) : [];
  const chip = x => `<button type="button" class="chip" data-open="${esc(x.id)}" title="Abrir">📄 ${esc(x.title)}</button>`;
  const refs = wlTaskRefsTo(n.id);
  const refIcon = { todo: '☑️', kanban: '📋', map: '🧠' }, refName = { todo: 'Tarea', kanban: 'Tarjeta Kanban', map: 'Mapa mental' };
  const refsRow = refs.length ? `<div class="bl-row"><span class="bl-h" title="Tareas, tarjetas y mapas mentales que enlazan a esta nota">${refs.every(r => r.kind === 'map') ? '🧠 Mapas que la mencionan' : refs.some(r => r.kind === 'map') ? '☑️ Tareas y mapas que la mencionan' : '☑️ Tareas que la mencionan'} (${refs.length})</span><div class="chips">${refs.map(r => `<button type="button" class="chip${r.done ? ' done' : ''}" data-ref="${r.kind}:${esc(r.id)}" title="${refName[r.kind]}${r.done ? ' (hecha)' : ''}">${refIcon[r.kind]} ${esc(r.label.replace(/\[\[([^\[\]\n]+)\]\]/g, '$1').slice(0, 60))}</button>`).join('')}</div></div>` : '';
  if (!inc.length && !out.length && !mentions.length && !refs.length) {
    box.innerHTML = `<div class="muted small">🔗 Sin enlaces. Escribe <kbd>[[</kbd> para enlazar esta nota con otra y verlas conectadas en <a href="#" data-graph>🕸️ Conexiones</a>.</div>`;
    return;
  }
  box.innerHTML = `<div class="bl-row"><span class="bl-h" title="Notas que enlazan a esta">⬅️ Enlazada desde (${inc.length})</span><div class="chips">${inc.map(chip).join('') || '<span class="muted small">Ninguna</span>'}</div></div>
    <div class="bl-row"><span class="bl-h" title="Notas a las que enlaza esta">➡️ Enlaza a (${out.length})</span><div class="chips">${out.map(chip).join('') || '<span class="muted small">Ninguna</span>'}</div></div>
    ${refsRow}
    ${mentions.length ? `<details class="bl-row"><summary class="bl-h">💬 Menciones sin enlazar (${mentions.length})</summary><div class="list" style="margin-top:6px">${mentions.slice(0, 20).map(x => `<div class="list-item" style="cursor:default;padding:5px 8px"><span class="grow ellipsis">📄 ${esc(x.title)}</span><button class="btn sm ghost" data-open="${esc(x.id)}">Abrir</button><button class="btn sm" data-linkm="${esc(x.id)}" title="Convierte la primera mención en un enlace">🔗 Enlazar</button></div>`).join('')}</div></details>` : ''}
    <div class="muted small" style="margin-top:4px"><a href="#" data-graph>🕸️ Ver sus conexiones en el grafo</a> · <a href="#" data-tomap>🧠 Abrir como mapa mental</a></div>`;
}
function wlLinkMention(otherId) {
  const n = getNote(currentNoteId), o = getNote(otherId); if (!n || !o) return;
  const rx = wlMentionRx(n.title.trim());
  const ok = wlMutate(o, body => {
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, { acceptNode: t => t.parentElement.closest('a,pre,code') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    while (walker.nextNode()) {
      const t = walker.currentNode, m = rx.exec(t.nodeValue);
      if (!m) continue;
      const startIdx = m.index + m[1].length;
      const mid = t.splitText(startIdx); mid.splitText(m[2].length);
      mid.replaceWith(wlMakeChip(n));
      return true;
    }
    return false;
  });
  if (ok) { o.updated = Date.now(); save.notes(); renderBacklinks(); renderNoteList(); toast(`Mención enlazada en «${o.title}»`, 'success'); }
  else toast('No se encontró la mención (quizá está dentro de otro enlace o de un bloque de código)', 'warning', 3500);
}
$('#backlinks').addEventListener('click', e => {
  const o = e.target.closest('[data-open]'); if (o) { e.preventDefault(); flushNote(); openNote(o.dataset.open); return; }
  const l = e.target.closest('[data-linkm]'); if (l) { wlLinkMention(l.dataset.linkm); return; }
  const rf = e.target.closest('[data-ref]');
  if (rf) {
    flushNote();
    const [kind, id] = rf.dataset.ref.split(':');
    if (kind === 'todo') { showTab('todos'); openTodo(id); }
    else if (kind === 'kanban') { showTab('kanban'); openTask(id); }
    else { mmOpenMap(id, false); mapsMode = 'mind'; store.set('mapsMode', 'mind'); showTab('maps'); }
    return;
  }
  if (e.target.closest('[data-graph]')) { e.preventDefault(); openGraph(currentNoteId); return; }
  if (e.target.closest('[data-tomap]')) { e.preventDefault(); mmFromNote(currentNoteId); }
});

/* =====================================================================
   NOTAS VINCULADAS EN TAREAS Y KANBAN
   ===================================================================== */
/*
  En el campo «Notas» de una tarea y en la «Descripción» de una tarjeta Kanban:
   · [[ abre el autocompletado de notas (como en el editor de notas)
   · debajo se muestran las notas enlazadas como botones (clic = guardar y abrir la nota)
   · «📝 Crear nota vinculada» crea una nota con el título de la tarea, la enlaza y la abre
  Las notas, a su vez, muestran en su panel qué tareas y mapas las mencionan.
*/
const wlfPop = document.createElement('div');
wlfPop.className = 'popover menu wl-pop'; wlfPop.id = 'wlfPop';
document.body.append(wlfPop);
let wlfState = null;   // { ta, start, q, items, idx, refresh }

function wlTextTitles(text) {
  const out = []; const re = /\[\[([^\[\]\n]{1,120})\]\]/g; let m;
  while ((m = re.exec(text || ''))) { const t = wlCleanTitle(m[1]); if (t && !out.some(x => norm(x) === norm(t))) out.push(t); }
  return out;
}
function wlfClose() { wlfState = null; wlfPop.classList.remove('open'); }
function wlfOpen(ta, start, q, refresh) {
  const nq = norm(q.trim());
  const list = S.notes.filter(n => !nq || norm(n.title).includes(nq))
    .sort((a, b) => (nq ? (norm(b.title).startsWith(nq) - norm(a.title).startsWith(nq)) : 0) || b.updated - a.updated)
    .slice(0, 8).map(n => ({ note: n }));
  const t = wlCleanTitle(q);
  if (t && !noteByTitle(t)) list.push({ create: t });
  wlfState = { ta, start, q, items: list, idx: 0, refresh };
  wlfPop.innerHTML = '<div class="muted small" style="padding:6px 10px">Enlazar con la nota…</div>' + (list.length
    ? list.map((it, i) => `<button type="button" data-wl="${i}" class="${i === 0 ? 'on' : ''}">${it.note ? `📄 ${esc(it.note.title)}` : `＋ Crear nota «${esc(it.create)}»`}</button>`).join('')
    : '<div class="muted small" style="padding:6px 10px">Escribe el título de una nota</div>');
  wlfPop.classList.add('open');
  const r = ta.getBoundingClientRect(), h = wlfPop.offsetHeight, w = wlfPop.offsetWidth;
  let top = r.bottom + 4; if (top + h > innerHeight - 10) top = Math.max(10, r.top - h - 4);
  wlfPop.style.left = Math.max(10, Math.min(r.left, innerWidth - w - 12)) + 'px';
  wlfPop.style.top = top + 'px';
}
function wlfChoose(i) {
  const st = wlfState; if (!st) return;
  const it = st.items[i]; if (!it) return;
  wlfClose();
  const title = it.note ? it.note.title : createNote(it.create, '', false).title;
  if (it.create) toast(`Nota «${title}» creada`, 'success', 2000);
  const ta = st.ta, v = ta.value;
  let end = ta.selectionStart;
  if (v.slice(end, end + 2) === ']]') end += 2;
  const ins = `[[${title}]]`;
  ta.value = v.slice(0, st.start) + ins + v.slice(end);
  const pos = st.start + ins.length;
  ta.focus(); ta.setSelectionRange(pos, pos);
  st.refresh();
}
function wlfInput(ta, refresh) {
  const pos = ta.selectionStart, before = ta.value.slice(0, pos);
  const m = before.match(/\[\[([^\[\]\n]{0,60})$/);
  if (m && ta.selectionStart === ta.selectionEnd) wlfOpen(ta, pos - m[0].length, m[1], refresh); else wlfClose();
  refresh();
}
window.addEventListener('keydown', e => {
  if (!wlfState || !wlfPop.classList.contains('open') || e.target !== wlfState.ta) return;
  const n = wlfState.items.length;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault(); e.stopPropagation(); if (!n) return;
    wlfState.idx = (wlfState.idx + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
    $$('#wlfPop [data-wl]').forEach(b => b.classList.toggle('on', +b.dataset.wl === wlfState.idx));
  } else if ((e.key === 'Enter' || e.key === 'Tab') && n) { e.preventDefault(); e.stopPropagation(); wlfChoose(wlfState.idx); }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); wlfClose(); }
}, true);
wlfPop.addEventListener('mousedown', e => e.preventDefault());
wlfPop.addEventListener('click', e => { const b = e.target.closest('[data-wl]'); if (b) wlfChoose(+b.dataset.wl); });

/** Guarda el diálogo abierto (botón principal) y, si se cerró, ejecuta fn. */
function wlfSaveThen(fn) {
  const btn = $('#modal .modal-foot .btn.primary'); if (!btn) return;
  btn.click();
  setTimeout(() => { if (!$('#modalBack').classList.contains('open')) fn(); }, 30);
}
/**
 * Añade a un campo de texto de un diálogo (tarea o tarjeta) el autocompletado [[ ]], los botones
 * de notas enlazadas y «Crear nota vinculada».
 * opts: { kind: 'Tareas' | 'Kanban', titleField: nombre del campo con el título }
 */
function wlAttachField(form, name, opts) {
  const ta = form.elements.namedItem(name); if (!ta) return;
  const box = document.createElement('div');
  box.className = 'wl-field';
  ta.after(box);
  const refresh = () => {
    const titles = wlTextTitles(ta.value);
    box.innerHTML = `<div class="chips">${titles.map(t => { const n = noteByTitle(t); return n
      ? `<button type="button" class="chip" data-wlo="${esc(n.id)}" title="Guardar y abrir la nota">📄 ${esc(n.title)}</button>`
      : `<button type="button" class="chip wl-missing" data-wlc="${esc(t)}" title="Esta nota no existe: clic para crearla">＋ ${esc(t)}</button>`; }).join('')}
      <button type="button" class="btn sm" data-wlnew title="Crea una nota con el título de la ${opts.kind === 'Kanban' ? 'tarjeta' : 'tarea'}, la enlaza aquí y la abre">📝 Crear nota vinculada</button></div>
      <div class="muted small" style="margin-top:4px">Escribe <kbd>[[</kbd> para enlazar una nota existente. Las notas enlazadas muestran esta ${opts.kind === 'Kanban' ? 'tarjeta' : 'tarea'} en su panel.</div>`;
  };
  ta.addEventListener('input', () => wlfInput(ta, refresh));
  ta.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== ta) wlfClose(); }, 150));
  box.addEventListener('click', e => {
    const o = e.target.closest('[data-wlo]');
    if (o) { const id = o.dataset.wlo; wlfSaveThen(() => { showTab('notes'); openNote(id); }); return; }
    const c = e.target.closest('[data-wlc]');
    if (c) { const n = createNote(c.dataset.wlc, '', false); toast(`Nota «${n.title}» creada`, 'success', 2000); refresh(); return; }
    if (e.target.closest('[data-wlnew]')) {
      const title = (form.elements.namedItem(opts.titleField).value || '').trim();
      if (!title) { toast('Escribe primero el título', 'warning'); return; }
      const what = opts.kind === 'Kanban' ? 'la tarjeta del Kanban' : 'la tarea';
      const n = createNote(title, `<div class="muted">☑️ Nota vinculada a ${what} «<b>${esc(title)}</b>». La verás en el panel «Tareas que la mencionan», al pie de esta nota.</div><h3>Contexto</h3><div><br></div><h3>Detalles</h3><div><br></div><h3>Decisiones y siguientes pasos</h3><div><br></div>`, false);
      ta.value = (ta.value.trim() ? ta.value.replace(/\s+$/, '') + '\n' : '') + `📝 [[${n.title}]]`;
      refresh();
      wlfSaveThen(() => { showTab('notes'); openNote(n.id); toast(`Nota «${n.title}» creada y vinculada`, 'success', 3000); });
    }
  });
  refresh();
}
/** Al renombrar una nota, actualiza los [[Título]] escritos en tareas y tarjetas. */
function wlRenameTextRefs(oldT, newT) {
  if (!oldT || norm(oldT) === norm(newT)) return 0;
  const re = new RegExp(`\\[\\[\\s*${escRx(oldT)}\\s*((?:#[^\\[\\]|\\n]*)?(?:\\|[^\\[\\]\\n]*)?)\\]\\]`, 'gi');
  let c = 0;
  const fix = s => typeof s !== 'string' ? s : s.replace(re, (m, suf) => { c++; return `[[${newT}${suf}]]`; });
  let todos = false, tasks = false;
  S.todos.forEach(t => { const b = c; t.text = fix(t.text); t.notes = fix(t.notes); (t.steps || []).forEach(s => { s.text = fix(s.text); }); if (c > b) todos = true; });
  S.tasks.forEach(t => { const b = c; t.title = fix(t.title); t.desc = fix(t.desc); (t.subtasks || []).forEach(s => { s.text = fix(s.text); }); if (c > b) tasks = true; });
  if (todos) save.todos();
  if (tasks) save.tasks();
  return c;
}
/** Tareas, tarjetas y mapas que mencionan una nota. */
function wlTaskRefsTo(noteId) {
  const out = [];
  S.todos.forEach(t => { if (wlTextRefs([t.text, t.notes || '', ...(t.steps || []).map(s => s.text)].join('\n')).includes(noteId)) out.push({ kind: 'todo', id: t.id, label: t.text, done: !!t.done }); });
  S.tasks.forEach(t => { if (wlTextRefs([t.title, t.desc || '', ...(t.subtasks || []).map(s => s.text)].join('\n')).includes(noteId)) out.push({ kind: 'kanban', id: t.id, label: t.title, done: t.col === 'done' }); });
  S.mindmaps.forEach(m => { let hit = false; mmWalk(m.root, x => { if (x.note === noteId) { hit = true; return false; } }); if (hit) out.push({ kind: 'map', id: m.id, label: m.title }); });
  return out;
}
