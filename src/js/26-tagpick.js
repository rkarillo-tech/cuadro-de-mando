/* =====================================================================
   ETIQUETAS: COLORES · SELECTOR VISUAL · CAMPO DE ETIQUETAS · FILTROS
   ===================================================================== */
/*
  Además de escribir #etiqueta en el texto, cada nota, tarea, tarjeta, evento y marcador
  tiene un campo «tags» (lista de nombres) que se rellena con el selector visual.
  Las dos fuentes se suman: el selector no toca el texto y el texto no toca el campo.
  Colores: S.tagColors = { clave: idPaleta }. Sin color propio, una subetiqueta hereda el
  de su padre y, si nadie lo tiene, se asigna un tono fijo calculado a partir del nombre.
*/
const TAG_PALETTE = [
  { id: 'rojo', name: 'Rojo', h: 356, s: '78%' },
  { id: 'naranja', name: 'Naranja', h: 22, s: '88%' },
  { id: 'ambar', name: 'Ámbar', h: 42, s: '92%' },
  { id: 'lima', name: 'Lima', h: 82, s: '62%' },
  { id: 'verde', name: 'Verde', h: 145, s: '58%' },
  { id: 'turquesa', name: 'Turquesa', h: 172, s: '64%' },
  { id: 'cian', name: 'Cian', h: 194, s: '80%' },
  { id: 'azul', name: 'Azul', h: 216, s: '84%' },
  { id: 'indigo', name: 'Índigo', h: 242, s: '74%' },
  { id: 'violeta', name: 'Violeta', h: 270, s: '72%' },
  { id: 'rosa', name: 'Rosa', h: 322, s: '72%' },
  { id: 'gris', name: 'Gris', h: 220, s: '9%' }
];
const tagHash = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
/** Color elegido para la etiqueta o heredado de un nivel superior; null = automático. */
function tagColorId(key) {
  const C = S.tagColors || {};
  if (C[key]) return C[key];
  const ps = tagParents(key).reverse();
  for (const p of ps) if (C[p]) return C[p];
  return null;
}
function tagColorSrc(key) {
  const C = S.tagColors || {};
  if (C[key]) return { own: true };
  const p = tagParents(key).reverse().find(x => C[x]);
  return p ? { from: p } : { auto: true };
}
function tagPal(key) {
  const id = tagColorId(key);
  return (id && TAG_PALETTE.find(p => p.id === id)) || TAG_PALETTE[tagHash(String(key).split('/')[0]) % (TAG_PALETTE.length - 1)];
}
/** Color CSS para el lienzo del grafo (según el tema). */
function tagColorCss(key) {
  const p = tagPal(key), light = document.documentElement.dataset.theme === 'light';
  return `hsl(${p.h} ${p.s} ${light ? 44 : 66}%)`;
}
const tagStyleEl = document.createElement('style');
tagStyleEl.id = 'tagColorCss';
document.head.append(tagStyleEl);
let tagStyleSig = '';
/** Regenera las reglas [data-tag="clave"]{--h;--s} para todas las etiquetas conocidas. */
function tagStyleRefresh(extra = []) {
  const keys = new Set([...(tagIdxCache ? tagIdxCache.map.keys() : []), ...Object.keys(S.tagColors || {}), ...Object.values(tagFilters).filter(Boolean), ...extra]);
  const q = k => String(k).replace(/["\\]/g, '\\$&');
  const css = [...keys].map(k => { const p = tagPal(k); return `[data-tag="${q(k)}"],[data-tk="${q(k)}"]{--h:${p.h};--s:${p.s}}`; }).join('\n');
  if (css !== tagStyleSig) { tagStyleSig = css; tagStyleEl.textContent = css; }
}
function tagSetColor(key, id) {
  S.tagColors = S.tagColors || {};
  if (!id || id === 'auto') delete S.tagColors[key]; else S.tagColors[key] = id;
  save.tagColors();
  tagStyleRefresh();
  if (tpState) tpRender();
  if (currentTab === 'tags') renderTagView();
  if (currentTab === 'maps' && typeof grDraw === 'function' && $('#grCanvas') && !$('#grCanvas').closest('[hidden]')) try { grDraw(); } catch {}
}
function tagPaletteHtml(key, { small = false } = {}) {
  const cur = (S.tagColors || {})[key] || 'auto', src = tagColorSrc(key);
  return `<div class="tp-pal${small ? ' small' : ''}" data-palkey="${esc(key)}">`
    + `<button type="button" class="tp-sw auto${cur === 'auto' ? ' on' : ''}" data-col="auto" data-tk="${esc(key)}" title="${src.from ? 'Heredar el color de #' + esc((tagIndex().get(src.from) || { name: src.from }).name) : 'Automático (un tono fijo según el nombre)'}">A</button>`
    + TAG_PALETTE.map(p => `<button type="button" class="tp-sw${cur === p.id ? ' on' : ''}" data-col="${p.id}" style="--h:${p.h};--s:${p.s}" title="${p.name}"></button>`).join('')
    + `</div>`;
}

/* ---------- Etiquetas de cada elemento (campo + texto) ---------- */
const tagUniq = names => { const m = new Map(); (names || []).forEach(n => { const k = tagKey(n); if (k && !m.has(k)) m.set(k, String(n).replace(/^#/, '')); }); return [...m.values()]; };
const allNoteTags = n => (n.tags || []).concat(noteTags(n));
const todoTags = t => (t.tags || []).concat(tagsIn([t.text, t.notes || '', ...(t.steps || []).map(s => s.text)].join('\n')));
const taskTags = t => (t.tags || []).concat(tagsIn([t.title, t.desc || '', ...(t.subtasks || []).map(s => s.text)].join('\n')));
const eventTags = ev => (ev.tags || []).concat(tagsIn(ev.title + '\n' + (ev.notes || '')));
const bmTags = b => (b.tags || []).concat(tagsIn(b.title + '\n' + (b.notes || '')));
/** ¿Alguna de estas etiquetas es «key» o una subetiqueta suya? */
const tagMatch = (names, key) => !key || (names || []).some(n => { const k = tagKey(n); return k === key || k.startsWith(key + '/'); });
const tagsFromField = v => tagUniq(String(v || '').split(',').map(s => s.trim().replace(/^#/, '')).filter(Boolean));
const TAG_NAME_OK = /^[\p{L}_][\p{L}\p{N}_-]*(?:\/[\p{L}\p{N}_-]+)*$/u;
const tagCleanName = s => String(s || '').trim().replace(/^#+/, '').replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_\-/]/gu, '').replace(/\/{2,}/g, '/').replace(/^\/|\/$/g, '');
/** Etiquetas pequeñas de color (para listas y tarjetas). */
const tagPills = (names, max = 4) => {
  const u = tagUniq(names); if (!u.length) return '';
  return `<span class="tg-line">${u.slice(0, max).map(n => `<span class="tg-mini tg-pill" data-tag="${esc(tagKey(n))}" title="Ver #${esc(n)}">#${esc(n)}</span>`).join('')}${u.length > max ? `<span class="muted small">+${u.length - max}</span>` : ''}</span>`;
};

/* ---------- Selector visual (desplegable) ---------- */
const tagPick = document.createElement('div');
tagPick.className = 'popover tag-picker'; tagPick.id = 'tagPicker';
document.body.append(tagPick);
let tpState = null;
/*
  tpOpen(anchor, opts)
   · modo 'multi': opts.selected (nombres), opts.locked (nombres escritos en el texto), opts.onChange(nombres)
   · modo 'filter': opts.current (clave o null), opts.onChange(clave|null) y se cierra
*/
function tpOpen(anchor, opts) {
  tpClose();
  tpState = { anchor, mode: opts.mode || 'multi', sel: tagUniq(opts.selected || []), locked: new Set((opts.locked || []).map(tagKey)), lockedNames: tagUniq(opts.locked || []), current: opts.current || null, onChange: opts.onChange || (() => {}), onClose: opts.onClose, title: opts.title, q: '', idx: 0, palette: null, order: [] };
  tagPick.innerHTML = `<div class="tp-head"><input class="field tp-q" type="text" placeholder="${tpState.mode === 'filter' ? 'Buscar etiqueta…' : 'Buscar o crear etiqueta…'}" spellcheck="false" autocomplete="off"></div><div class="tp-list" role="listbox"></div>
    <div class="tp-foot"><span class="muted small">${tpState.mode === 'filter' ? 'Incluye sus subetiquetas' : '<kbd>Enter</kbd> marcar'}</span><button type="button" class="btn sm ghost" data-tpa="manage" title="Abrir la sección Etiquetas (nube, renombrar, colores)">🏷️ Gestionar</button></div>`;
  tagPick.classList.add('open');
  tpOrder(); tpRender(); tpPlace();
  const q = $('.tp-q', tagPick);
  q.addEventListener('input', () => { tpState.q = q.value; tpState.idx = 0; tpState.palette = null; tpOrder(); tpRender(); });
  setTimeout(() => q.focus(), 0);
}
function tpPlace() {
  if (!tpState) return;
  const r = tpState.anchor.getBoundingClientRect(), w = tagPick.offsetWidth, h = tagPick.offsetHeight;
  let top = r.bottom + 6; if (top + h > innerHeight - 10) top = Math.max(10, r.top - h - 6);
  tagPick.style.left = Math.max(10, Math.min(r.left, innerWidth - w - 12)) + 'px';
  tagPick.style.top = top + 'px';
}
function tpClose() {
  if (!tpState) return;
  const s = tpState; tpState = null;
  tagPick.classList.remove('open');
  if (s.onClose) s.onClose();
  try { if (s.anchor.isConnected) s.anchor.focus({ preventScroll: true }); } catch {}
}
/** Calcula el orden de las filas (se mantiene estable al marcar/desmarcar). */
function tpOrder() {
  const s = tpState, idx = tagIndex(), nq = norm(s.q.trim().replace(/^#/, ''));
  const entries = new Map();
  idx.forEach((e, k) => entries.set(k, { key: k, name: e.name, count: tagItemsOf(k).length }));
  s.sel.concat(s.lockedNames).forEach(n => { const k = tagKey(n); if (!entries.has(k)) entries.set(k, { key: k, name: n, count: 0 }); });
  let list = [...entries.values()];
  if (nq) {
    let hit = list.filter(e => e.key.includes(nq));
    if (!hit.length && nq.length >= 2) hit = list.map(e => ({ e, sc: fuzzyScore(nq, e.key) })).filter(x => x.sc > 0).sort((a, b) => b.sc - a.sc).map(x => x.e);
    list = hit.sort((a, b) => (b.key.startsWith(nq) - a.key.startsWith(nq)) || (b.key.split('/').pop().startsWith(nq) - a.key.split('/').pop().startsWith(nq)) || a.key.localeCompare(b.key, 'es'));
  } else {
    const on = new Set(s.mode === 'filter' ? [s.current] : s.sel.map(tagKey).concat([...s.locked]));
    list.sort((a, b) => (on.has(b.key) - on.has(a.key)) || a.key.localeCompare(b.key, 'es'));
  }
  const rows = list.map(e => ({ type: 'tag', ...e }));
  if (s.mode === 'filter' && !nq) rows.unshift({ type: 'all' });
  const fresh = tagCleanName(s.q);
  if (s.mode === 'multi' && fresh && TAG_NAME_OK.test(fresh) && !entries.has(tagKey(fresh))) rows.push({ type: 'new', name: fresh });
  s.order = rows;
}
function tpRender() {
  const s = tpState; if (!s) return;
  const selK = new Set(s.sel.map(tagKey));
  const list = $('.tp-list', tagPick);
  if (!s.order.length) { list.innerHTML = `<div class="muted small" style="padding:10px">${s.q.trim() ? 'Escribe solo letras, números, «-», «_» o «/»' : 'Todavía no hay etiquetas. Escribe una para crearla.'}</div>`; return; }
  s.idx = Math.max(0, Math.min(s.idx, s.order.length - 1));
  list.innerHTML = s.order.map((r, i) => {
    const act = i === s.idx ? ' act' : '';
    if (r.type === 'all') return `<div class="tp-row${act}${!s.current ? ' on' : ''}" data-i="${i}" role="option"><span class="tp-check">✓</span><span class="tp-name"><i>Todas (sin filtro)</i></span></div>`;
    if (r.type === 'new') return `<div class="tp-row tp-new${act}" data-i="${i}" role="option"><span class="tp-check">＋</span><span class="tp-name">Crear <b data-tk="${esc(tagKey(r.name))}" class="tp-newname">#${esc(r.name)}</b></span></div>`;
    const locked = s.locked.has(r.key) && !selK.has(r.key);
    const on = s.mode === 'filter' ? s.current === r.key : selK.has(r.key) || s.locked.has(r.key);
    const parts = r.name.split('/'), depth = s.q.trim() ? 0 : parts.length - 1;
    return `<div class="tp-row${act}${on ? ' on' : ''}${locked ? ' locked' : ''}" data-i="${i}" role="option" style="--d:${depth}" title="${locked ? 'Está escrita en el texto: para quitarla, bórrala del texto' : ''}">
      <span class="tp-check">${locked ? '✎' : '✓'}</span><button type="button" class="tp-dot" data-tk="${esc(r.key)}" data-dot="${esc(r.key)}" title="Cambiar el color"></button>
      <span class="tp-name" data-tk="${esc(r.key)}">${depth ? `<span class="tp-pre">#${esc(parts.slice(0, -1).join('/'))}/</span>${esc(parts[parts.length - 1])}` : '#' + esc(r.name)}</span><span class="tp-n">${r.count || ''}</span></div>`
      + (s.palette === r.key ? `<div class="tp-palrow">${tagPaletteHtml(r.key, { small: true })}</div>` : '');
  }).join('');
  const a = $('.tp-row.act', list); if (a) a.scrollIntoView({ block: 'nearest' });
}
function tpActivate(i) {
  const s = tpState; if (!s) return;
  const r = s.order[i]; if (!r) return;
  if (s.mode === 'filter') { const k = r.type === 'all' ? null : r.key; const cb = s.onChange; tpClose(); cb(k); return; }
  if (r.type === 'new') {
    s.sel.push(r.name); s.onChange(s.sel.slice());
    s.q = ''; $('.tp-q', tagPick).value = ''; tpStyleFor(r.name); tpOrder(); s.idx = s.order.findIndex(x => x.key === tagKey(r.name)); tpRender(); return;
  }
  if (r.type !== 'tag') return;
  const selK = s.sel.map(tagKey);
  if (selK.includes(r.key)) s.sel.splice(selK.indexOf(r.key), 1);
  else if (s.locked.has(r.key)) { toast('Esa etiqueta está escrita en el texto: para quitarla, bórrala del texto', 'info', 3500); return; }
  else s.sel.push(r.name);
  s.onChange(s.sel.slice());
  s.idx = i; tpRender();
}
function tpStyleFor(name) { tagStyleRefresh([tagKey(name)]); }
tagPick.addEventListener('mousedown', e => { if (!e.target.closest('input')) e.preventDefault(); });
tagPick.addEventListener('click', e => {
  if (!tpState) return;
  const sw = e.target.closest('[data-col]');
  if (sw) { const k = sw.closest('[data-palkey]').dataset.palkey; tagSetColor(k, sw.dataset.col); return; }
  const dot = e.target.closest('[data-dot]');
  if (dot) { tpState.palette = tpState.palette === dot.dataset.dot ? null : dot.dataset.dot; tpRender(); tpPlace(); return; }
  if (e.target.closest('[data-tpa="manage"]')) { tpClose(); if ($('#modalBack').classList.contains('open')) { const b = $('#modal .modal-foot .btn.primary'); if (b) b.click(); } setTimeout(() => openTagView(null), 30); return; }
  const row = e.target.closest('.tp-row'); if (row) tpActivate(+row.dataset.i);
});
window.addEventListener('keydown', e => {
  if (!tpState) return;
  const n = tpState.order.length;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); tpClose(); return; }
  if (!tagPick.contains(e.target)) return;
  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && n) { e.preventDefault(); e.stopPropagation(); tpState.idx = (tpState.idx + (e.key === 'ArrowDown' ? 1 : -1) + n) % n; tpRender(); }
  else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (n) tpActivate(tpState.idx); }
  else if (e.key === 'Tab') { tpClose(); }
}, true);
document.addEventListener('mousedown', e => { if (tpState && !tagPick.contains(e.target) && !tpState.anchor.contains(e.target)) tpClose(); }, true);
window.addEventListener('resize', () => tpPlace());

/* ---------- Campo de etiquetas para formularios (tarea, tarjeta, evento, marcador) ---------- */
/** src: nombres de campos del formulario cuyo texto también aporta #etiquetas. */
function tagFieldHtml(name, tags, { label = 'Etiquetas', src = '' } = {}) {
  return `<div class="tag-field" data-name="${esc(name)}" data-src="${esc(src)}"><label class="lbl">${esc(label)}</label>
    <div class="tf-box"><input type="hidden" name="${esc(name)}" value="${esc(tagUniq(tags).join(','))}"><span class="tf-chips"></span><button type="button" class="btn sm ghost tf-add" title="Elegir etiquetas de una lista o crear una nueva">＋ Etiqueta</button></div></div>`;
}
function tfInline(tf) {
  const form = tf.closest('form'); if (!form) return [];
  return tagsIn(tf.dataset.src.split(',').filter(Boolean).map(n => { const el = form.elements.namedItem(n); return el ? el.value : ''; }).join('\n'));
}
function tfRender(tf) {
  const hid = $('input[type=hidden]', tf), sel = tagsFromField(hid.value), selK = new Set(sel.map(tagKey));
  const inl = tagUniq(tfInline(tf)).filter(n => !selK.has(tagKey(n)));
  tagStyleRefresh(sel.concat(inl).map(tagKey));
  $('.tf-chips', tf).innerHTML = sel.map(n => `<span class="tf-chip" data-tk="${esc(tagKey(n))}">#${esc(n)}<button type="button" class="tf-x" data-x="${esc(n)}" title="Quitar #${esc(n)}">×</button></span>`).join('')
    + inl.map(n => `<span class="tf-chip inline" data-tk="${esc(tagKey(n))}" title="Escrita en el texto (se quita borrándola del texto)">#${esc(n)}</span>`).join('')
    || '<span class="muted small">Sin etiquetas</span>';
}
function tfSet(tf, names) { $('input[type=hidden]', tf).value = tagUniq(names).join(','); tfRender(tf); }
function tagFieldInit(form) {
  $$('.tag-field', form).forEach(tf => {
    tfRender(tf);
    const upd = debounce(() => tfRender(tf), 250);
    tf.dataset.src.split(',').filter(Boolean).forEach(n => { const el = form.elements.namedItem(n); if (el) el.addEventListener('input', upd); });
  });
}
document.addEventListener('click', e => {
  const tf = e.target.closest('.tag-field'); if (!tf) return;
  const x = e.target.closest('.tf-x');
  if (x) { const k = tagKey(x.dataset.x); tfSet(tf, tagsFromField($('input[type=hidden]', tf).value).filter(n => tagKey(n) !== k)); return; }
  const add = e.target.closest('.tf-add');
  if (add) {
    if (tpState && tpState.anchor === add) { tpClose(); return; }
    tpOpen(add, { selected: tagsFromField($('input[type=hidden]', tf).value), locked: tfInline(tf), onChange: names => tfSet(tf, names) });
  }
});

/* ---------- Barra de etiquetas de la nota abierta ---------- */
function renderNoteTags() {
  const box = $('#noteTags'); if (!box) return;
  const n = getNote(currentNoteId);
  if (!n) { box.hidden = true; return; }
  box.hidden = false;
  const own = tagUniq(n.tags || []), ownK = new Set(own.map(tagKey));
  const inl = tagUniq(noteTags(n)).filter(t => !ownK.has(tagKey(t)));
  tagStyleRefresh(own.concat(inl).map(tagKey));
  const cnt = t => { const c = tagItemsOf(tagKey(t)).length; return c > 1 ? ` <span class="tf-n">${c}</span>` : ''; };
  box.innerHTML = `<span class="tf-ico" title="Etiquetas de la nota">🏷️</span>`
    + own.map(t => `<span class="tf-chip" data-tk="${esc(tagKey(t))}"><button type="button" class="tf-go" data-tag="${esc(tagKey(t))}" title="Ver todo lo etiquetado con #${esc(t)}">#${esc(t)}${cnt(t)}</button><button type="button" class="tf-x" data-x="${esc(t)}" title="Quitar #${esc(t)} de esta nota">×</button></span>`).join('')
    + inl.map(t => `<span class="tf-chip inline" data-tk="${esc(tagKey(t))}" title="Escrita en el texto de la nota"><button type="button" class="tf-go" data-tag="${esc(tagKey(t))}" title="Ver todo lo etiquetado con #${esc(t)} (escrita en el texto)">#${esc(t)}${cnt(t)}</button></span>`).join('')
    + `<button type="button" class="btn sm ghost tf-add" id="noteTagAdd" title="Añadir o quitar etiquetas (también puedes escribir #etiqueta en el texto)">${own.length || inl.length ? '＋' : '＋ Añadir etiqueta'}</button>`;
}
function setNoteTags(id, names) {
  const n = getNote(id); if (!n) return;
  n.tags = tagUniq(names);
  if (!n.tags.length) delete n.tags;
  n.updated = Date.now();
  save.notes();
  renderNoteTags(); renderNoteList();
}
$('#noteTags').addEventListener('click', e => {
  const n = getNote(currentNoteId); if (!n) return;
  const x = e.target.closest('.tf-x');
  if (x) { const k = tagKey(x.dataset.x); setNoteTags(n.id, (n.tags || []).filter(t => tagKey(t) !== k)); return; }
  const add = e.target.closest('.tf-add');
  if (add) {
    if (tpState && tpState.anchor === add) { tpClose(); return; }
    const id = n.id;
    tpOpen(add, { selected: n.tags || [], locked: noteTags(n), onChange: names => { setNoteTags(id, names); const b = $('#noteTagAdd'); if (b && tpState) { tpState.anchor = b; tpPlace(); } } });
  }
});

/* ---------- Filtros por etiqueta en Notas, Tareas, Kanban y Marcadores ---------- */
const tagFilters = { notes: null, todos: null, kanban: null, bookmarks: null };
const TAGF_RENDER = { notes: () => renderNoteList(), todos: () => renderTodos(), kanban: () => renderBoard(), bookmarks: () => renderBookmarks() };
function renderTagFilter(scope) {
  const box = $(`[data-tagf="${scope}"]`); if (!box) return;
  const k = tagFilters[scope];
  if (!k) { box.innerHTML = `<button type="button" class="btn sm ghost tagf-btn" data-tagf-open title="Mostrar solo lo que lleva una etiqueta (y sus subetiquetas)">🏷️ Etiqueta ▾</button>`; return; }
  const e = tagIndex().get(k);
  tagStyleRefresh([k]);
  box.innerHTML = `<span class="tf-chip tagf-on" data-tk="${esc(k)}"><button type="button" class="tf-go" data-tagf-open title="Cambiar la etiqueta del filtro">🏷️ #${esc(e ? e.name : k)} ▾</button><button type="button" class="tf-x" data-tagf-clear title="Quitar el filtro">×</button></span>`;
}
function setTagFilter(scope, key) {
  tagFilters[scope] = key || null;
  renderTagFilter(scope);
  TAGF_RENDER[scope]();
}
document.addEventListener('click', e => {
  const box = e.target.closest('[data-tagf]'); if (!box) return;
  const scope = box.dataset.tagf;
  if (e.target.closest('[data-tagf-clear]')) { setTagFilter(scope, null); return; }
  const b = e.target.closest('[data-tagf-open]');
  if (b) { if (tpState && tpState.anchor === b) { tpClose(); return; } tpOpen(b, { mode: 'filter', current: tagFilters[scope], onChange: k => setTagFilter(scope, k) }); }
});
const tagFilterEmpty = scope => tagFilters[scope] ? ` con #${esc((tagIndex().get(tagFilters[scope]) || { name: tagFilters[scope] }).name)}` : '';

/* ---------- Markdown: etiquetas del campo como «tags:» en el frontmatter (compatible con Obsidian) ---------- */
function mdFrontTags(text) {
  const m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!m) return { tags: [], body: text };
  const y = m[1], out = [];
  const inline = /^tags:[ \t]*\[?([^\]\n]*)\]?[ \t]*$/m.exec(y);
  if (inline && inline[1].trim()) out.push(...inline[1].split(/[,\s]+/));
  else { const blk = /^tags:\s*\n((?:[ \t]*-[ \t]*.+\n?)+)/m.exec(y); if (blk) out.push(...blk[1].split('\n').map(l => l.replace(/^[ \t]*-[ \t]*/, ''))); }
  return { tags: tagUniq(out.map(s => tagCleanName(s.replace(/^["']|["']$/g, ''))).filter(s => TAG_NAME_OK.test(s))), body: text.slice(m[0].length) };
}
const mdFrontFor = n => (n.tags && n.tags.length) ? `---\ntags: [${tagUniq(n.tags).join(', ')}]\n---\n` : '';
