const editor = $('#editor');
let currentNoteId = null;
let noteDirty = false;
let savedRange = null;

/* ---------- Limpieza de HTML por LISTA BLANCA ----------
   Solo sobreviven las etiquetas y atributos que el editor necesita; lo demás se elimina
   (con su contenido, si es peligroso) o se desenvuelve (si es solo envoltorio). */
const SAFE_TAGS = new Set(['DIV', 'P', 'BR', 'SPAN', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'INS', 'SUB', 'SUP', 'SMALL', 'MARK', 'CODE', 'KBD', 'PRE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'HR', 'A', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'CAPTION', 'FONT', 'INPUT']);
const DROP_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'FRAME', 'FRAMESET', 'OBJECT', 'EMBED', 'APPLET', 'LINK', 'META', 'BASE', 'TITLE', 'HEAD', 'FORM', 'TEXTAREA', 'SELECT', 'OPTION', 'BUTTON', 'SVG', 'MATH', 'TEMPLATE', 'NOSCRIPT', 'IMG', 'PICTURE', 'SOURCE', 'VIDEO', 'AUDIO', 'TRACK', 'CANVAS', 'MAP', 'AREA', 'PORTAL', 'DIALOG', 'SLOT']);
const SAFE_ATTRS = { '*': ['class', 'style', 'title', 'data-note', 'data-title', 'data-lang'], A: ['href', 'contenteditable'], INPUT: ['type', 'checked'], TD: ['colspan', 'rowspan'], TH: ['colspan', 'rowspan'], FONT: ['color'], OL: ['start'] };
const SAFE_CSS = new Set(['color', 'background-color', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'text-align', 'margin-left', 'padding-left']);
function parseHtml(html) { return new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html').body; }
const safeUrl = u => /^(https?:|mailto:|file:|#)/i.test(String(u || '').trim());
function sanitize(html) {
  const body = parseHtml(html);
  const clean = el => {
    for (const c of Array.from(el.childNodes)) {
      if (c.nodeType === 8) { c.remove(); continue; }           // comentarios
      if (c.nodeType !== 1) continue;
      const tag = c.tagName.toUpperCase();
      if (DROP_TAGS.has(tag) || (tag === 'INPUT' && (c.getAttribute('type') || '').toLowerCase() !== 'checkbox')) { c.remove(); continue; }
      if (!SAFE_TAGS.has(tag)) { clean(c); c.replaceWith(...c.childNodes); continue; }   // desconocida: se desenvuelve
      const ok = new Set([...SAFE_ATTRS['*'], ...(SAFE_ATTRS[tag] || [])]);
      for (const a of Array.from(c.attributes)) {
        const nm = a.name.toLowerCase();
        if (!ok.has(nm)) { c.removeAttribute(a.name); continue; }
        if (nm === 'href' && !safeUrl(a.value)) c.removeAttribute(a.name);
        if (nm === 'contenteditable' && !(a.value === 'false' && c.classList.contains('wl'))) c.removeAttribute(a.name);
        if (nm === 'color' && !/^#?[\da-z]+$/i.test(a.value)) c.removeAttribute(a.name);
      }
      if (c.hasAttribute('style')) {
        const keep = [];
        for (let i = 0; i < c.style.length; i++) { const p = c.style[i], v = c.style.getPropertyValue(p); if (SAFE_CSS.has(p) && !/url\s*\(|expression|javascript:|@import/i.test(v)) keep.push(`${p}:${v}`); }
        if (keep.length) c.setAttribute('style', keep.join(';')); else c.removeAttribute('style');
      }
      if (tag === 'INPUT') c.classList.add('chk');
      if (tag === 'SPAN' && !c.attributes.length) { clean(c); c.replaceWith(...c.childNodes); continue; } // <span> vacío (lo deja el editor al insertar)
      clean(c);
    }
  };
  clean(body);
  return body.innerHTML;
}
const htmlText = html => (parseHtml(html).textContent || '').replace(/\s+/g, ' ').trim();
const sortedNotes = () => [...S.notes].sort((a, b) => (!!b.pinned - !!a.pinned) || (b.updated - a.updated));
const getNote = id => S.notes.find(n => n.id === id);
function initNotes() {
  currentNoteId = store.get('currentNote', null);
  S.notes.forEach(n => { if (!n.text) n.text = htmlText(n.html); });
}

function renderNoteList() {
  if (notesMode === 'tree') { wikiRenderTree(); return; }
  const q = $('#noteSearch').value.trim().toLowerCase();
  renderTagFilter('notes');
  const tf = tagFilters.notes, tok = n => !tf || tagMatch(allNoteTags(n), tf);
  let list = sortedNotes().filter(n => tok(n) && (!q || n.title.toLowerCase().includes(q) || (n.text || '').toLowerCase().includes(q)));
  let fuzzy = false;
  if (q.length >= 3 && list.length < 3) {
    const nq = norm(q), seen = new Set(list.map(n => n.id));
    const extra = S.notes.filter(n => !seen.has(n.id) && tok(n)).map(n => ({ n, s: fuzzyScore(nq, n.title) * 2 + fuzzyScore(nq, n.text || '') })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 10).map(x => x.n);
    if (extra.length) { fuzzy = true; list = list.concat(extra); }
  }
  $('#notesList').innerHTML = list.length ? list.map(n => `<div class="note-item${n.id === currentNoteId ? ' active' : ''}" data-id="${esc(n.id)}" tabindex="0">
      <div class="t">${n.pinned ? '📌' : ''}<span class="ellipsis">${esc(n.title)}</span></div>${wkParent(n) ? `<div class="p ellipsis">📚 ${esc(wkPath(n))}</div>` : ''}
      <div class="s">${esc((n.text || '').slice(0, 90)) || '<i>Vacía</i>'}</div>
      <div class="d">${relTime(n.updated)}${tagPills(allNoteTags(n), 3)}</div></div>`).join('')
    : `<div class="empty">${q || tf ? 'Sin resultados' + tagFilterEmpty('notes') : 'No hay notas todavía'}</div>`;
  if (fuzzy) $('#notesList').insertAdjacentHTML('beforeend', '<div class="muted small" style="padding:4px 8px">≈ Incluye resultados parecidos (erratas o abreviaturas)</div>');
  $('#notesTotal').textContent = `${S.notes.length} nota${S.notes.length === 1 ? '' : 's'}`;
}
function renderNotesView() {
  let n = getNote(currentNoteId);
  if (!n && S.notes.length) { n = sortedNotes()[0]; currentNoteId = n.id; }
  $('#editorCard').hidden = !n;
  $('#noteEmpty').hidden = !!n;
  if (n) {
    $('#noteTitle').value = n.title;
    editor.innerHTML = sanitize(n.html) || '<div><br></div>';
    $('#pinNoteBtn').classList.toggle('on', !!n.pinned);
    $('#pinNoteBtn').title = n.pinned ? 'Desfijar' : 'Fijar arriba';
    $('#noteSaved').textContent = `Editada ${relTime(n.updated)}`;
    savedRange = null;
    wlClose(); wlRefreshEditor(); highlightAllPre(); tagDecorateEditor();
    updateCount(); updateEmpty();
  }
  store.set('currentNote', currentNoteId);
  renderNoteList();
  wkRenderCrumbs(); wkRenderSubpages(); renderNoteTags();
  renderBacklinks();
}
function updateEmpty() { editor.classList.toggle('is-empty', !editor.textContent.trim() && !editor.querySelector('input,hr,li')); }
function updateCount() {
  const t = editor.innerText || '';
  const words = (t.match(/\S+/g) || []).length;
  const chk = editor.querySelectorAll('input.chk').length, done = editor.querySelectorAll('input.chk[checked]').length;
  setText($('#noteCount'), `${words} palabra${words === 1 ? '' : 's'} · ${t.replace(/\s/g, '').length} caracteres${chk ? ` · ☑ ${done}/${chk} tareas` : ''}`);
}
function flushNote(force = false) {
  if (!noteDirty && !force) return;
  const n = getNote(currentNoteId);
  noteDirty = false;
  if (!n) return;
  if (typeof tagRefreshEditorKeys === 'function') tagRefreshEditorKeys();
  n.html = editor.innerHTML;
  n.text = htmlText(n.html);
  n.updated = Date.now();
  save.notes();
  setText($('#noteSaved'), '✓ Guardado a las ' + fmtTime(Date.now()));
  renderNoteList();
  renderBacklinks(); renderNoteTags();
}
const saveNoteSoon = debounce(() => flushNote(), 600);
function markDirty() { noteDirty = true; setText($('#noteSaved'), 'Guardando…'); updateEmpty(); updateCount(); saveNoteSoon(); }

function uniqueTitle(base, exceptId) {
  const ex = new Set(S.notes.filter(n => n.id !== exceptId).map(n => n.title.trim().toLowerCase()));
  let t = base, i = 2;
  while (ex.has(t.toLowerCase())) t = `${base} (${i++})`;
  return t;
}
function createNote(title = 'Nota sin título', html = '', open = true) {
  flushNote();
  const now = Date.now();
  const n = { id: uid(), title: uniqueTitle(title), html, text: htmlText(html), pinned: false, created: now, updated: now };
  S.notes.push(n); save.notes();
  if (S.notes.some(x => (x.html || '').includes('data-title='))) wlResolveAll();
  if (open) { currentNoteId = n.id; renderNotesView(); } else renderNoteList();
  return n;
}
function createNoteAndFocus() {
  createNote();
  const t = $('#noteTitle'); t.focus(); t.select();
}
function openNote(id) {
  if (id === currentNoteId && !$('#editorCard').hidden) return;
  flushNote();
  currentNoteId = id;
  renderNotesView();
}
function deleteCurrentNote() {
  const n = getNote(currentNoteId); if (!n) return;
  flushNote();
  const idx = S.notes.indexOf(n);
  const undoKids = wkOrphanChildren(n);
  S.notes.splice(idx, 1); save.notes();
  currentNoteId = (notesMode === 'tree' && wkParent(n)) || sortedNotes()[0]?.id || null;
  renderNotesView();
  toast(`Nota «${n.title}» eliminada${undoKids ? ' (sus subpáginas suben un nivel)' : ''}`, 'info', 6000, { label: 'Deshacer', fn: () => { S.notes.push(n); if (undoKids) undoKids(); save.notes(); currentNoteId = n.id; renderNotesView(); } });
}

$('#newNoteBtn').addEventListener('click', createNoteAndFocus);
$('#emptyNewNote').addEventListener('click', createNoteAndFocus);
$('#noteSearch').addEventListener('input', debounce(renderNoteList, 150));
$('#notesList').addEventListener('click', e => { const it = e.target.closest('.note-item'); if (it) openNote(it.dataset.id); });
$('#notesList').addEventListener('keydown', e => { if (e.key === 'Enter') { const it = e.target.closest('.note-item'); if (it) openNote(it.dataset.id); } });
$('#pinNoteBtn').addEventListener('click', () => {
  const n = getNote(currentNoteId); if (!n) return;
  n.pinned = !n.pinned; save.notes();
  $('#pinNoteBtn').classList.toggle('on', n.pinned);
  renderNoteList();
  toast(n.pinned ? 'Nota fijada arriba' : 'Nota desfijada', 'info', 1400);
});
$('#noteTitle').addEventListener('change', e => {
  const n = getNote(currentNoteId); if (!n) return;
  const v = e.target.value.trim();
  if (!v) { e.target.value = n.title; toast('El título no puede estar vacío', 'warning'); return; }
  if (S.notes.some(x => x.id !== n.id && x.title.trim().toLowerCase() === v.toLowerCase())) { e.target.value = n.title; toast('Ya existe otra nota con ese título', 'warning'); return; }
  const oldTitle = n.title;
  n.title = v; n.updated = Date.now(); save.notes();
  const k = wlRenameEverywhere(n.id, v) + wlRenameTextRefs(oldTitle, v);
  wlResolveAll(); renderNoteList(); renderBacklinks(); wkRenderCrumbs();
  if (k) toast(`Enlaces actualizados en ${k} sitio${k === 1 ? '' : 's'}`, 'info', 2200);
});
$('#noteTitle').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); editor.focus(); } });

/* ---------- Editor: selección, comandos y barra ---------- */
try { document.execCommand('defaultParagraphSeparator', false, 'div'); } catch {}
document.addEventListener('selectionchange', () => {
  const sel = getSelection();
  if (sel.rangeCount && editor.contains(sel.anchorNode)) { savedRange = sel.getRangeAt(0).cloneRange(); updateToolbarState(); }
});
function restoreSel() {
  editor.focus({ preventScroll: true });
  const sel = getSelection();
  if (savedRange && editor.contains(savedRange.startContainer)) { sel.removeAllRanges(); sel.addRange(savedRange); }
  else if (!sel.rangeCount || !editor.contains(sel.anchorNode)) {
    const r = document.createRange(); r.selectNodeContents(editor); r.collapse(false);
    sel.removeAllRanges(); sel.addRange(r);
  }
}
function exec(cmd, val = null) {
  restoreSel();
  try { document.execCommand('styleWithCSS', false, cmd === 'foreColor' || cmd === 'hiliteColor'); } catch {}
  document.execCommand(cmd, false, val);
  markDirty();
  updateToolbarState();
}
function updateToolbarState() {
  ['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList'].forEach(c => {
    const b = $(`#toolbar [data-cmd="${c}"]`); let on = false;
    try { on = document.queryCommandState(c); } catch {}
    if (b) b.classList.toggle('on', on);
  });
  let v = '';
  try { v = String(document.queryCommandValue('formatBlock') || '').toLowerCase().replace(/[<>]/g, ''); } catch {}
  $('#blockSelect').value = ['h1', 'h2', 'h3', 'blockquote', 'pre'].includes(v) ? v : 'div';
}
/**
 * Sustituye un rango del editor por HTML pasando por execCommand, para que el navegador
 * lo apunte en su historial y Ctrl+Z / «Deshacer» puedan revertirlo. (Tocar el DOM a mano
 * —insertNode, innerHTML…— deja el historial del editor bloqueado.)
 */
function edReplace(range, html) {
  const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
  let ok = false;
  try { ok = document.execCommand(html ? 'insertHTML' : 'delete', false, html); } catch {}
  if (!ok) { // respaldo (navegadores sin execCommand): no se podrá deshacer, pero funciona
    const r = sel.rangeCount ? sel.getRangeAt(0) : range; r.deleteContents();
    if (html) { const f = r.createContextualFragment(html), last = f.lastChild; r.insertNode(f); if (last) r.setStartAfter(last); }
    r.collapse(false); sel.removeAllRanges(); sel.addRange(r);
  }
  if (sel.rangeCount) savedRange = sel.getRangeAt(0).cloneRange();
}
// Inserta la casilla en el cursor
function insertChkAtCaret() {
  const sel = getSelection(); if (!sel.rangeCount) return;
  const r = sel.getRangeAt(0);
  if (!editor.contains(r.startContainer)) return;
  edReplace(r, '<input type="checkbox" class="chk">&nbsp;');
}
function insertChecklist() { restoreSel(); insertChkAtCaret(); markDirty(); }

$('#toolbar').addEventListener('mousedown', e => { if (e.target.closest('button.tb')) e.preventDefault(); });
$('#toolbar').addEventListener('click', e => {
  const b = e.target.closest('button.tb'); if (!b) return;
  if (b.dataset.cmd) exec(b.dataset.cmd);
  else toolAction(b.dataset.action, b);
});
$('#blockSelect').addEventListener('change', e => exec('formatBlock', `<${e.target.value}>`));
$('#foreColor').addEventListener('change', e => exec('foreColor', e.target.value));
$('#hiliteColor').addEventListener('change', e => exec('hiliteColor', e.target.value));

function toolAction(a, btn) {
  if (a === 'checkbox') insertChecklist();
  else if (a === 'fore') exec('foreColor', $('#foreColor').value);
  else if (a === 'hilite') exec('hiliteColor', $('#hiliteColor').value);
  else if (a === 'link') insertLink();
  else if (a === 'icode') toggleInlineCode();
  else if (a === 'wikilink') { restoreSel(); document.execCommand('insertText', false, '[['); }
  else if (a === 'date') { restoreSel(); document.execCommand('insertText', false, new Date().toLocaleString('es-ES', { dateStyle: 'full', timeStyle: 'short' })); markDirty(); }
  else if (a === 'emoji') { const p = $('#emojiPop'); p.classList.contains('open') ? p.classList.remove('open') : openPopover(p, btn); }
}
async function insertLink() {
  const selected = savedRange && editor.contains(savedRange.startContainer) ? savedRange.toString() : '';
  const r = await modal({
    title: '🔗 Insertar enlace',
    body: `<div><label class="lbl">Dirección (URL)</label><input class="field" type="text" name="url" placeholder="https://…" value="https://"></div>${selected ? '' : '<div><label class="lbl">Texto a mostrar</label><input class="field" type="text" name="text" placeholder="Opcional"></div>'}`,
    actions: [{ label: 'Cancelar', value: null, cls: 'ghost' }, { label: 'Insertar', value: 'ok', cls: 'primary' }]
  });
  if (!r) return;
  let url = (r.data.url || '').trim();
  if (!url || url === 'https://') return;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) url = 'https://' + url;
  if (/^\s*(javascript|data|vbscript):/i.test(url)) { toast('Enlace no permitido', 'danger'); return; }
  if (selected) exec('createLink', url);
  else { restoreSel(); document.execCommand('insertHTML', false, `<a href="${esc(url)}">${esc(r.data.text || url)}</a>&nbsp;`); markDirty(); }
}

/* ---------- Editor: eventos ---------- */
editor.addEventListener('input', markDirty);
/* Arrastrar y soltar: dentro del editor se mueve con normalidad; desde fuera solo entra TEXTO
   (nada de HTML ajeno, imágenes ni archivos, que podrían cargar recursos de internet). */
let dragFromEditor = false;
editor.addEventListener('dragstart', () => { dragFromEditor = true; });
document.addEventListener('dragend', () => { dragFromEditor = false; });
editor.addEventListener('drop', e => {
  if (dragFromEditor) { dragFromEditor = false; setTimeout(() => { const clean = sanitize(editor.innerHTML); if (clean !== editor.innerHTML) editor.innerHTML = clean; markDirty(); }, 0); return; }
  e.preventDefault();
  const t = e.dataTransfer && e.dataTransfer.getData('text/plain');
  if (!t) { if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) toast('Las notas no admiten archivos ni imágenes. Para traer un .md o .ctd usa «Importar».', 'info', 3500); return; }
  let r = null;
  if (document.caretRangeFromPoint) r = document.caretRangeFromPoint(e.clientX, e.clientY);
  else if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(e.clientX, e.clientY); if (p) { r = document.createRange(); r.setStart(p.offsetNode, p.offset); } }
  if (r && editor.contains(r.startContainer)) { const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  else restoreSel();
  document.execCommand('insertText', false, t);
  markDirty();
});
editor.addEventListener('paste', e => {
  e.preventDefault();
  const t = (e.clipboardData || window.clipboardData).getData('text/plain');
  document.execCommand('insertText', false, t);
});
let chkPre = null;
editor.addEventListener('mousedown', e => { const cb = e.target.closest('input.chk'); chkPre = cb ? { cb, v: cb.checked } : null; });
editor.addEventListener('click', e => {
  const cb = e.target.closest('input.chk');
  if (cb) {
    const pre = chkPre && chkPre.cb === cb ? chkPre.v : null;
    setTimeout(() => {
      if (pre !== null && cb.checked === pre) cb.checked = !pre; // navegadores que no alternan dentro de contenteditable
      cb.toggleAttribute('checked', cb.checked);                 // el estado queda guardado en el HTML
      chkPre = null; markDirty();
    }, 0);
    return;
  }
  const a = e.target.closest('a');
  if (a && (e.ctrlKey || e.metaKey)) { e.preventDefault(); window.open(a.href, '_blank', 'noopener'); }
});
function currentLine() {
  const sel = getSelection(); if (!sel.rangeCount) return null;
  let n = sel.anchorNode;
  if (!n || n === editor || !editor.contains(n)) return null;
  while (n && n.parentNode !== editor) n = n.parentNode;
  return n && n.nodeType === 1 ? n : null;
}
function firstMeaningful(el) {
  for (const c of el.childNodes) { if (c.nodeType === 3 && !c.nodeValue.trim()) continue; return c.nodeType === 1 ? c : null; }
  return null;
}
editor.addEventListener('keydown', e => {
  if (wlKey(e)) return;
  if (tagAcKey(e)) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && k === 'k') { e.preventDefault(); insertLink(); return; }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && k === 'x') { e.preventDefault(); insertChecklist(); return; }
  if (e.key === 'Tab') {
    e.preventDefault();
    const sel = getSelection();
    const inLi = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement)?.closest('li');
    if (inLi) exec(e.shiftKey ? 'outdent' : 'indent');
    else if (!e.shiftKey) { document.execCommand('insertText', false, '\u00a0\u00a0\u00a0\u00a0'); }
    return;
  }
  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
    const line = currentLine();
    const first = line && firstMeaningful(line);
    if (first && first.matches && first.matches('input.chk')) {
      const txt = line.textContent.replace(/\u00a0/g, ' ').trim();
      if (!txt) { // casilla vacía: Enter la quita (fin de la lista de tareas)
        e.preventDefault();
        const r = document.createRange(); r.selectNodeContents(line);
        edReplace(r, '');
        markDirty();
        return;
      }
      setTimeout(() => { insertChkAtCaret(); markDirty(); }, 0);
    }
  }
});

/* ---------- Emojis ---------- */
const EMOJIS = {
  'Caras': '😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 😉 😍 🥰 😘 😋 😎 🤓 🧐 🤔 🤨 😐 😴 😮 😲 🥳 😤 😢 😭 😡 🤯 😱 🙄 🤗 🤫 🫡',
  'Gestos': '👍 👎 👌 ✌️ 🤞 👏 🙌 🙏 💪 👋 ✋ 👀 🧠 ❤️ 🧡 💛 💚 💙 💜 🖤 💯',
  'Trabajo': '✅ ☑️ ✔️ ❌ ⚠️ ❗ ❓ 💡 📌 📍 📎 🔗 📝 📋 📅 📆 ⏰ ⏳ 📊 📈 📉 💼 🗂️ 📁 📂 🔒 🔓 🔑 💾 🖥️ 💻 📱 📧 📞 🧾 💰 💶 🏷️',
  'Varios': '🔥 ⭐ 🌟 ✨ ⚡ ☀️ 🌙 ☁️ 🌧️ ❄️ 🌈 🌱 🌳 🍀 🌸 🍎 ☕ 🍕 🎉 🎁 🎯 🏆 🚀 ✈️ 🏠 🚗 🎵 📚 🎓 🐶 🐱'
};
function buildEmoji() {
  $('#emojiGrid').innerHTML = Object.entries(EMOJIS).map(([cat, list]) => `<div class="emoji-cat">${cat}</div>` + list.split(' ').map(em => `<button type="button" data-em="${em}">${em}</button>`).join('')).join('');
  $('#emojiGrid').addEventListener('mousedown', e => e.preventDefault());
  $('#emojiGrid').addEventListener('click', e => {
    const b = e.target.closest('[data-em]'); if (!b) return;
    restoreSel(); document.execCommand('insertText', false, b.dataset.em); markDirty();
    if (!e.shiftKey) $('#emojiPop').classList.remove('open');
  });
}

/* ---------- Conversión HTML ⇄ Markdown ---------- */
const BLOCK_TAGS = new Set(['DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'HR', 'TABLE', 'SECTION', 'ARTICLE']);
function htmlToMd(root) {
  const inline = el => Array.from(el.childNodes).map(inlineNode).join('');
  function inlineNode(n) {
    if (n.nodeType === 3) return n.nodeValue.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ');
    if (n.nodeType !== 1) return '';
    const t = n.tagName;
    if (t === 'BR') return '\n';
    if (t === 'INPUT') return n.type === 'checkbox' ? (n.hasAttribute('checked') || n.checked ? '[x] ' : '[ ] ') : '';
    if (BLOCK_TAGS.has(t)) return '\n' + block(n) + '\n';
    const inner = inline(n);
    const wrap = m => { const mm = inner.match(/^(\s*)([\s\S]*?)(\s*)$/); return mm[2] ? mm[1] + m + mm[2] + m + mm[3] : inner; };
    switch (t) {
      case 'B': case 'STRONG': return wrap('**');
      case 'I': case 'EM': return wrap('*');
      case 'S': case 'STRIKE': case 'DEL': return wrap('~~');
      case 'CODE': return inner ? '`' + inner + '`' : '';
      case 'A': { if (n.classList.contains('wl')) { const ln = n.dataset.note && getNote(n.dataset.note); return `[[${ln ? ln.title : (n.dataset.title || n.textContent.trim())}]]`; }
        const h = n.getAttribute('href'); return h ? `[${inner.trim() || h}](${h})` : inner; }
      default: return inner;
    }
  }
  function blocks(el) {
    const parts = []; let buf = '';
    const flush = () => { const b = buf.replace(/\n$/, ''); if (b.trim()) parts.push(b.split('\n').map(l => l.trim()).join('\n')); buf = ''; };
    for (const ch of el.childNodes) {
      if (ch.nodeType === 1 && BLOCK_TAGS.has(ch.tagName)) { flush(); parts.push(block(ch)); }
      else buf += inlineNode(ch);
    }
    flush();
    return parts.join('\n');
  }
  function block(n) {
    const t = n.tagName;
    if (/^H[1-6]$/.test(t)) return '#'.repeat(+t[1]) + ' ' + inline(n).trim();
    if (t === 'HR') return '---';
    if (t === 'PRE') return '```' + (n.dataset.lang && n.dataset.lang !== 'auto' ? n.dataset.lang : '') + '\n' + preText(n).replace(/\n$/, '') + '\n```';
    if (t === 'BLOCKQUOTE') return blocks(n).split('\n').map(l => '> ' + l).join('\n');
    if (t === 'UL' || t === 'OL') return list(n);
    return blocks(n);
  }
  function list(n) {
    const out = []; let i = 0;
    for (const ch of n.children) {
      if (ch.tagName === 'LI') {
        i++;
        const lines = blocks(ch).split('\n');
        out.push((n.tagName === 'OL' ? `${i}. ` : '- ') + lines.shift());
        lines.forEach(l => out.push('   ' + l));
      } else if (ch.tagName === 'UL' || ch.tagName === 'OL') list(ch).split('\n').forEach(l => out.push('   ' + l));
    }
    return out.join('\n');
  }
  const md = blocks(root).split('\n').map(l => l.replace(/^(\s*)\[( |x)\] +/, '$1- [$2] ').replace(/(\[[ x]\]) {2,}/g, '$1 ').replace(/\s+$/, '')).join('\n');
  return md.replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
function mdInline(s) {
  return esc(s)
    .replace(/\[\[([^\[\]\n]{1,120})\]\]/g, (m, t) => { const ti = wlCleanTitle(parseHtml(t).textContent); return ti ? `<a class="wl missing" data-title="${esc(ti)}" contenteditable="false">${esc(ti)}</a>` : m; })
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
}
function mdToHtml(md) {
  const lines = md.replace(/\r/g, '').split('\n');
  let html = '', inCode = false, code = [], listType = null, codeLang = '';
  const closeList = () => { if (listType) { html += `</${listType}>`; listType = null; } };
  for (const line of lines) {
    let m;
    if (line.trim().startsWith('```')) {
      if (inCode) { html += `<pre${codeLang ? ` data-lang="${codeLang}"` : ''}>${esc(code.join('\n'))}</pre>`; code = []; inCode = false; }
      else { closeList(); inCode = true; const lg = line.trim().slice(3).trim().toLowerCase(); codeLang = CODE_RULES[lg] || lg === 'text' ? lg : ({ javascript: 'js', typescript: 'js', ts: 'js', python: 'py', bash: 'sh', shell: 'sh', html: 'xml', powershell: 'ps' })[lg] || ''; }
      continue;
    }
    if (inCode) { code.push(line); continue; }
    if ((m = line.match(/^\s*[-*+] \[( |x|X)\] (.*)$/))) { closeList(); html += `<div><input type="checkbox" class="chk"${m[1] !== ' ' ? ' checked' : ''}>&nbsp;${mdInline(m[2])}</div>`; continue; }
    if ((m = line.match(/^(#{1,6}) (.*)$/))) { closeList(); const l = Math.min(3, m[1].length); html += `<h${l}>${mdInline(m[2])}</h${l}>`; continue; }
    if ((m = line.match(/^\s*[-*+] (.*)$/))) { if (listType !== 'ul') { closeList(); html += '<ul>'; listType = 'ul'; } html += `<li>${mdInline(m[1])}</li>`; continue; }
    if ((m = line.match(/^\s*\d+[.)] (.*)$/))) { if (listType !== 'ol') { closeList(); html += '<ol>'; listType = 'ol'; } html += `<li>${mdInline(m[1])}</li>`; continue; }
    if ((m = line.match(/^>\s?(.*)$/))) { closeList(); html += `<blockquote>${mdInline(m[1])}</blockquote>`; continue; }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) { closeList(); html += '<hr>'; continue; }
    closeList();
    html += line.trim() ? `<div>${mdInline(line)}</div>` : '<div><br></div>';
  }
  if (inCode) html += `<pre>${esc(code.join('\n'))}</pre>`;
  closeList();
  return html;
}
const noteToMd = n => mdFrontFor(n) + `# ${n.title}\n\n` + htmlToMd(parseHtml(sanitize(n.html)));
const noteToHtmlDoc = n => `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${esc(n.title)}</title><style>body{font-family:system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;line-height:1.6;color:#222}a.wl{color:#6c5ce7;font-weight:600;text-decoration:none}a.wl::before{content:"[["}a.wl::after{content:"]]"}blockquote{border-left:3px solid #6c5ce7;margin:0;padding:4px 12px;color:#555}pre{background:#f4f4f8;padding:10px;border-radius:6px;white-space:pre-wrap}code{background:#f4f4f8;padding:1px 4px;border-radius:4px}${CODE_CSS_EXPORT}</style></head><body><h1>${esc(n.title)}</h1>${sanitize(n.html)}</body></html>`;

/* ---------- Menú de nota ---------- */
$('#noteMenuBtn').addEventListener('click', e => { const p = $('#noteMenu'); p.classList.contains('open') ? p.classList.remove('open') : openPopover(p, e.currentTarget); });
$('#noteMenu').addEventListener('click', async e => {
  const b = e.target.closest('[data-nm]'); if (!b) return;
  $('#noteMenu').classList.remove('open');
  flushNote();
  const n = getNote(currentNoteId); if (!n) return;
  switch (b.dataset.nm) {
    case 'md': download(`${safeName(n.title)}.md`, noteToMd(n), 'text/markdown;charset=utf-8'); break;
    case 'copymd': copyText(noteToMd(n), 'Markdown copiado'); break;
    case 'html': download(`${safeName(n.title)}.html`, noteToHtmlDoc(n), 'text/html;charset=utf-8'); break;
    case 'print':
      $('#printArea').innerHTML = `<h1>${esc(n.title)}</h1>${sanitize(n.html)}`;
      window.print();
      break;
    case 'dup': { const c = createNote(n.title + ' (copia)', n.html); toast(`Creada «${c.title}»`, 'success'); break; }
    case 'encrypt':
      $('#cIn').value = noteToMd(n);
      setCryptoMode('text');
      showTab('crypto');
      $('#cPass').focus();
      toast('Escribe una contraseña y pulsa «Encriptar»', 'info', 3500);
      break;
    case 'template': saveAsTemplate(n); break;
    case 'graph': openGraph(n.id); break;
    case 'move': wkMoveDialog(n.id); break;
    case 'branchhtml': download(`${safeName(n.title)}_manual.html`, wkExportHtml(n.id), 'text/html;charset=utf-8'); toast(`Manual con ${wkBranch(n.id).length} página(s) descargado`, 'success'); break;
    case 'branchmd': download(`${safeName(n.title)}.md`, wkExportMd(n.id), 'text/markdown;charset=utf-8'); break;
    case 'branchmap': wkToMindmap(n.id); break;
    case 'mindmap': mmFromNote(n.id); break;
    case 'delete': deleteCurrentNote(); break;
  }
});

/* ---------- Importar notas ---------- */
$('#importNoteBtn').addEventListener('click', () => $('#importNoteFile').click());
$('#importNoteFile').addEventListener('change', async e => {
  const files = Array.from(e.target.files || []); e.target.value = '';
  let last = null, wikiRoot = null;
  for (const f of files) {
    if (/\.ct[bdzx]$/i.test(f.name)) { const r = await importWikiFile(f); if (r) wikiRoot = r; continue; }
    try {
      let text = await f.text();
      const isMd = /\.(md|markdown)$/i.test(f.name);
      let front = [];
      if (isMd) { const fm = mdFrontTags(text); front = fm.tags; text = fm.body.replace(/^\s*\n/, ''); }
      let title = f.name.replace(/\.[^.]+$/, '');
      let body = text;
      const h = text.match(/^#\s+(.+)\n/);
      if (isMd && h) { title = h[1].trim(); body = text.slice(h[0].length).replace(/^\n+/, ''); }
      const html = isMd ? mdToHtml(body) : body.split(/\r?\n/).map(l => l.trim() ? `<div>${esc(l)}</div>` : '<div><br></div>').join('');
      last = createNote(title, html, false);
      if (front.length) { last.tags = front; save.notes(); }
    } catch { toast(`No se pudo leer ${f.name}`, 'danger'); }
  }
  if (wikiRoot) { setNotesMode('tree'); currentNoteId = wikiRoot.id; renderNotesView(); }
  if (last) { wlResolveAll(); currentNoteId = last.id; renderNotesView(); toast(`${files.length} archivo(s) importado(s)`, 'success'); }
});

window.addEventListener('beforeunload', () => flushNote());
document.addEventListener('visibilitychange', () => { if (document.hidden) flushNote(); });


/* ---------- Plantillas de notas ---------- */
const BUILTIN_TEMPLATES = [
  { id: 'b-acta', name: 'Acta de reunión', title: 'Reunión · {{fecha}}', html: '<h2>Reunión · {{fecha}}</h2><div><b>Asistentes:</b> </div><div><b>Objetivo:</b> </div><h3>Orden del día</h3><ol><li><br></li></ol><h3>Notas</h3><div><br></div><h3>Acuerdos</h3><ul><li><br></li></ul><h3>Tareas</h3><div><input type="checkbox" class="chk">&nbsp;Responsable — tarea — fecha</div><div><br></div><div><b>Próxima reunión:</b> </div>' },
  { id: 'b-diario', name: 'Diario', title: 'Diario · {{fecha}}', html: '<h2>{{dia}}</h2><h3>🎯 Hoy quiero conseguir</h3><div><input type="checkbox" class="chk">&nbsp;</div><div><input type="checkbox" class="chk">&nbsp;</div><div><input type="checkbox" class="chk">&nbsp;</div><h3>📝 Notas del día</h3><div><br></div><h3>🙏 Algo bueno de hoy</h3><div><br></div><h3>💭 Para mañana</h3><div><br></div>' },
  { id: 'b-semana', name: 'Plan semanal', title: 'Semana {{semana}} · {{fecha}}', html: '<h2>Semana {{semana}}</h2><h3>⭐ Prioridades</h3><ol><li><br></li><li><br></li><li><br></li></ol><h3>Lunes</h3><div><br></div><h3>Martes</h3><div><br></div><h3>Miércoles</h3><div><br></div><h3>Jueves</h3><div><br></div><h3>Viernes</h3><div><br></div><h3>📌 Pendiente para la próxima semana</h3><div><br></div>' },
  { id: 'b-deploy', name: 'Checklist de despliegue', title: 'Despliegue · {{fecha}}', html: '<h2>Despliegue · {{fecha}}</h2><div><b>Versión:</b> &nbsp; <b>Entorno:</b> </div><h3>Antes</h3><div><input type="checkbox" class="chk">&nbsp;Pruebas superadas</div><div><input type="checkbox" class="chk">&nbsp;Copia de seguridad de base de datos</div><div><input type="checkbox" class="chk">&nbsp;Ventana de despliegue comunicada</div><div><input type="checkbox" class="chk">&nbsp;Plan de marcha atrás preparado</div><h3>Durante</h3><div><input type="checkbox" class="chk">&nbsp;Despliegue ejecutado</div><div><input type="checkbox" class="chk">&nbsp;Migraciones aplicadas</div><h3>Después</h3><div><input type="checkbox" class="chk">&nbsp;Pruebas de humo</div><div><input type="checkbox" class="chk">&nbsp;Revisión de logs y monitorización</div><div><input type="checkbox" class="chk">&nbsp;Comunicado el cierre</div><h3>Incidencias</h3><div><br></div>' },
  { id: 'b-incid', name: 'Informe de incidencia', title: 'Incidencia · {{fecha}}', html: '<h2>Informe de incidencia</h2><div><b>Fecha y hora:</b> {{fecha}} {{hora}}</div><div><b>Gravedad:</b> </div><h3>Resumen</h3><div><br></div><h3>Impacto</h3><div><br></div><h3>Cronología</h3><ul><li>{{hora}} — </li></ul><h3>Causa raíz</h3><div><br></div><h3>Acciones correctoras</h3><div><input type="checkbox" class="chk">&nbsp;</div><h3>Lecciones aprendidas</h3><div><br></div>' }
];
function fillTemplate(s) {
  const now = new Date();
  return String(s || '')
    .replace(/\{\{fecha\}\}/g, now.toLocaleDateString('es-ES'))
    .replace(/\{\{hora\}\}/g, now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))
    .replace(/\{\{dia\}\}/g, fmtLongDay(todayKey()))
    .replace(/\{\{semana\}\}/g, String(isoWeek(now)));
}
function renderTplPop() {
  const user = S.templates.map(t => `<div class="row" style="flex-wrap:nowrap;gap:2px"><button data-tpl="${esc(t.id)}" class="grow">📄 ${esc(t.name)}</button><button data-tpldel="${esc(t.id)}" class="btn icon sm ghost" title="Eliminar plantilla" style="width:28px;justify-content:center">✕</button></div>`).join('');
  $('#tplPop').innerHTML = '<div class="muted small" style="padding:6px 10px">Nueva nota desde plantilla</div>' + BUILTIN_TEMPLATES.map(t => `<button data-tpl="${t.id}">📋 ${esc(t.name)}</button>`).join('') + (user ? '<hr><div class="muted small" style="padding:4px 10px">Tus plantillas</div>' + user : '') + '<hr><div class="muted small" style="padding:4px 10px;max-width:260px">Crea las tuyas desde una nota: menú ⋯ → «Guardar como plantilla». Puedes usar {{fecha}}, {{hora}}, {{dia}} y {{semana}}.</div>';
}
$('#tplBtn').addEventListener('click', e => { const p = $('#tplPop'); if (p.classList.contains('open')) { p.classList.remove('open'); return; } renderTplPop(); openPopover(p, e.currentTarget); });
$('#tplPop').addEventListener('click', async e => {
  const del = e.target.closest('[data-tpldel]');
  if (del) {
    const t = S.templates.find(x => x.id === del.dataset.tpldel);
    if (t && await confirmDialog(`¿Eliminar la plantilla «${t.name}»?`)) { S.templates = S.templates.filter(x => x !== t); save.templates(); renderTplPop(); }
    return;
  }
  const b = e.target.closest('[data-tpl]'); if (!b) return;
  $('#tplPop').classList.remove('open');
  const t = BUILTIN_TEMPLATES.find(x => x.id === b.dataset.tpl) || S.templates.find(x => x.id === b.dataset.tpl);
  if (!t) return;
  createNote(fillTemplate(t.title || t.name), fillTemplate(t.html));
  editor.focus();
});
async function saveAsTemplate(n) {
  const name = await askText('📄 Guardar como plantilla', 'Nombre de la plantilla', n.title);
  if (!name) return;
  S.templates.push({ id: uid(), name: name.slice(0, 60), title: n.title, html: sanitize(n.html), created: Date.now() });
  save.templates();
  toast(`Plantilla «${name}» guardada. Úsala con el botón 📄`, 'success', 3500);
}
