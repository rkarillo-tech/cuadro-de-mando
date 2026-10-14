/* =====================================================================
   MAPAS MENTALES
   ===================================================================== */
/*
  Mapa = { id, title, root, created, updated }
  Idea = { id, text, children: [], color?, collapsed?, done?, note? (id de nota), todo? ({kind,id}) }
  Se dibuja en SVG con un diseño de árbol a dos lados (derecha/izquierda de la idea central).
  Los tamaños de cada idea se calculan con canvas.measureText, así que el mismo diseño sirve
  para pantalla y para exportar a SVG/PNG.
*/
const MM_COLORS = ['#8b7cf6', '#3ecf8e', '#f5b94a', '#4cb3f5', '#f2667a', '#f08c4a', '#2ec4b6', '#e36bd0'];
const MM_TEMPLATES = [
  { id: 'blank', name: 'En blanco', icon: '⬜', root: 'Idea central', kids: [] },
  { id: 'project', name: 'Proyecto', icon: '🗂️', root: 'Proyecto', kids: ['🎯 Objetivos', '✅ Tareas', '👥 Personas', '📅 Plazos', '⚠️ Riesgos', '💶 Recursos'] },
  { id: 'dafo', name: 'Análisis DAFO', icon: '⚖️', root: 'DAFO', kids: ['💪 Fortalezas', '🩹 Debilidades', '🚀 Oportunidades', '⚠️ Amenazas'] },
  { id: 'meeting', name: 'Reunión', icon: '👥', root: 'Reunión · {{fecha}}', kids: ['👥 Asistentes', '📋 Temas', '✅ Acuerdos', '➡️ Próximos pasos'] },
  { id: 'brain', name: 'Lluvia de ideas', icon: '💡', root: '¿Qué problema quiero resolver?', kids: ['Idea 1', 'Idea 2', 'Idea 3'] },
  { id: 'study', name: 'Estudio de un tema', icon: '📚', root: 'Tema', kids: ['Conceptos clave', 'Ejemplos', 'Dudas', 'Recursos'] },
  { id: 'outline', name: 'Desde un esquema (pegar texto)', icon: '📋' },
  { id: 'note', name: 'Desde una nota', icon: '📝' }
];
const mmStage = $('#mmStage'), mmSvg = $('#mmSvg'), mmEditEl = $('#mmEdit');
let mmCurId = null, mmSelId = null, mmEditing = null, mmL = null, mapsMode = 'mind';
const mmHistStacks = {};
const mmH = id => (mmHistStacks[id] = mmHistStacks[id] || { undo: [], redo: [] });

/* ---------- Acceso a datos ---------- */
const mmCur = () => S.mindmaps.find(m => m.id === mmCurId) || null;
const mmNewNode = (text = '') => ({ id: uid(), text, children: [] });
function mmWalk(n, fn, p = null, d = 0) {
  if (fn(n, p, d) === false) return false;
  for (const c of n.children || []) if (mmWalk(c, fn, n, d + 1) === false) return false;
  return true;
}
function mmFind(id, root) {
  root = root || (mmCur() || {}).root; if (!root || !id) return null;
  let r = null;
  mmWalk(root, (n, p, d) => { if (n.id === id) { r = { n, p, d, i: p ? p.children.indexOf(n) : -1 }; return false; } });
  return r;
}
const mmCount = n => { let c = 0; mmWalk(n, () => { c++; }); return c; };
function mmReId(n) { n.id = uid(); (n.children || []).forEach(mmReId); return n; }
function mmViews() { return store.get('mmViews', {}) || {}; }
function mmView() {
  const m = mmCur(); const v = m && mmViews()[m.id];
  return v && isFinite(v.k) ? v : null;
}
let mmViewCache = null;
function mmSetView(v) {
  mmViewCache = v;
  const m = mmCur(); if (!m) return;
  mmApplyView();
  mmSaveViewSoon();
}
const mmSaveViewSoon = debounce(() => { const m = mmCur(); if (!m || !mmViewCache) return; const all = mmViews(); all[m.id] = mmViewCache; store.set('mmViews', all); }, 400);
const mmV = () => mmViewCache || { x: mmStage.clientWidth / 2, y: mmStage.clientHeight / 2, k: 1 };

/** Aplica un cambio con deshacer, guarda y redibuja. fn devuelve false para cancelar. */
function mmChange(fn) {
  const m = mmCur(); if (!m) return false;
  const before = JSON.stringify(m.root);
  if (fn(m) === false) return false;
  const after = JSON.stringify(m.root);
  if (before !== after) {
    const h = mmH(m.id); h.undo.push(before); if (h.undo.length > 100) h.undo.shift(); h.redo = [];
    m.updated = Date.now(); save.mindmaps();
  }
  mmRender();
  return before !== after;
}
function mmUndo() {
  const m = mmCur(); if (!m) return; const h = mmH(m.id);
  if (!h.undo.length) { toast('No hay nada que deshacer', 'info', 1200); return; }
  h.redo.push(JSON.stringify(m.root)); m.root = JSON.parse(h.undo.pop());
  m.updated = Date.now(); save.mindmaps();
  if (!mmFind(mmSelId)) mmSelId = m.root.id;
  mmRender();
}
function mmRedo() {
  const m = mmCur(); if (!m) return; const h = mmH(m.id);
  if (!h.redo.length) return;
  h.undo.push(JSON.stringify(m.root)); m.root = JSON.parse(h.redo.pop());
  m.updated = Date.now(); save.mindmaps();
  if (!mmFind(mmSelId)) mmSelId = m.root.id;
  mmRender();
}

/* ---------- Medida y diseño ---------- */
const mmCtx = document.createElement('canvas').getContext('2d');
let mmFF = null;
function mmStyle(d) {
  return d === 0 ? { size: 18, weight: 700, max: 260, px: 18, py: 12, rx: 14 }
    : d === 1 ? { size: 15, weight: 600, max: 220, px: 14, py: 8, rx: 10 }
      : { size: 14, weight: 400, max: 210, px: 11, py: 6, rx: 8 };
}
function mmWrap(text, st) {
  mmCtx.font = `${st.weight} ${st.size}px ${mmFF}`;
  const W = s => mmCtx.measureText(s).width;
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const w of para.split(' ')) {
      const test = line ? line + ' ' + w : w;
      if (W(test) <= st.max) { line = test; continue; }
      if (line) out.push(line);
      if (W(w) <= st.max) { line = w; continue; }
      let chunk = '';
      for (const ch of Array.from(w)) { if (W(chunk + ch) > st.max && chunk) { out.push(chunk); chunk = ch; } else chunk += ch; }
      line = chunk;
    }
    out.push(line);
  }
  return out.slice(0, 12);
}
function mmLayout(m) {
  if (!mmFF) mmFF = (getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif');
  const L = new Map();
  const gapV = d => d <= 1 ? 16 : 8;
  function tree(n, d, color) {
    const st = mmStyle(d);
    const shown = n.text || (mmEditing && mmEditing.id === n.id ? ' ' : '…');
    const lines = mmWrap(shown, st);
    mmCtx.font = `${st.weight} ${st.size}px ${mmFF}`;
    const tw = Math.max(d === 0 ? 70 : 26, ...lines.map(l => mmCtx.measureText(l).width));
    const lh = Math.round(st.size * 1.35);
    const e = { n, d, st, lines, lh, w: Math.ceil(tw + st.px * 2), h: lines.length * lh + st.py * 2, color, kids: n.collapsed ? [] : n.children };
    L.set(n.id, e);
    let ch = 0;
    e.kids.forEach((c, i) => { const ce = tree(c, d + 1, c.color || (d === 0 ? MM_COLORS[i % MM_COLORS.length] : color)); ch += ce.th; });
    ch += Math.max(0, e.kids.length - 1) * gapV(d + 1);
    e.ch = ch; e.th = Math.max(e.h, ch);
    return e;
  }
  const root = tree(m.root, 0, 'var(--accent)');
  root.x = 0; root.y = 0; root.side = 1;
  const place = (pe, list, side) => {
    const total = list.reduce((a, c) => a + L.get(c.id).th, 0) + Math.max(0, list.length - 1) * gapV(pe.d + 1);
    let y = pe.y - total / 2;
    const hg = pe.d === 0 ? 50 : 32;
    list.forEach(c => {
      const ce = L.get(c.id);
      ce.side = side; ce.parent = pe;
      ce.x = pe.x + side * (pe.w / 2 + hg + ce.w / 2);
      ce.y = y + ce.th / 2;
      y += ce.th + gapV(pe.d + 1);
      place(ce, ce.kids, side);
    });
  };
  const nR = Math.ceil(root.kids.length / 2);
  place(root, root.kids.slice(0, nR), 1);
  place(root, root.kids.slice(nR), -1);
  return L;
}
function mmBounds(L) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const e of L.values()) { a = Math.min(a, e.x - e.w / 2 - 14); b = Math.min(b, e.y - e.h / 2 - 14); c = Math.max(c, e.x + e.w / 2 + 14); d = Math.max(d, e.y + e.h / 2 + 14); }
  return { x: a, y: b, w: c - a, h: d - b };
}

/* ---------- Dibujo SVG ---------- */
const MM_PAL_DOM = { accent: 'var(--accent)', text: 'var(--text)', surface: 'var(--surface)', muted: 'var(--muted)', font: 'var(--font)' };
function mmNodeSvg(e, pal, opt) {
  const n = e.n, x = e.x - e.w / 2, y = e.y - e.h / 2, sel = opt.sel === n.id;
  const col = e.d === 0 ? pal.accent : e.color;
  let s = `<g class="mm-n${sel ? ' sel' : ''}${n.done ? ' done' : ''}${opt.editing === n.id ? ' editing' : ''}" data-id="${esc(n.id)}">`;
  if (sel) s += `<rect x="${x - 5}" y="${y - 5}" width="${e.w + 10}" height="${e.h + 10}" rx="${e.st.rx + 5}" style="fill:none;stroke:${pal.accent};stroke-width:2.5;stroke-dasharray:6 4"/>`;
  if (e.d === 0) s += `<rect class="mm-box" x="${x}" y="${y}" width="${e.w}" height="${e.h}" rx="${e.st.rx}" style="fill:${pal.accent}"/>`;
  else {
    s += `<rect class="mm-box" x="${x}" y="${y}" width="${e.w}" height="${e.h}" rx="${e.st.rx}" style="fill:${pal.surface};stroke:${col};stroke-width:${e.d === 1 ? 2 : 1.3}"/>`;
    if (e.d === 1) s += `<rect x="${x}" y="${y}" width="${e.w}" height="${e.h}" rx="${e.st.rx}" style="fill:${col};fill-opacity:.16;pointer-events:none"/>`;
  }
  const tcol = e.d === 0 ? '#ffffff' : pal.text;
  s += `<text text-anchor="middle" style="fill:${tcol};font-family:${pal.font};font-size:${e.st.size}px;font-weight:${e.st.weight}${n.done ? ';text-decoration:line-through;opacity:.6' : ''}${!n.text ? ';opacity:.45' : ''}">`
    + e.lines.map((l, i) => `<tspan x="${e.x}" y="${(y + e.st.py + e.lh * i + e.lh * 0.74).toFixed(1)}">${esc(l) || ' '}</tspan>`).join('') + '</text>';
  const badges = [];
  if (n.done) badges.push(['done', '✓', 'Hecha']);
  if (n.note) badges.push(['note', '📝', getNote(n.note) ? `Abrir la nota «${getNote(n.note).title}»` : 'La nota enlazada ya no existe']);
  if (n.todo) badges.push(['todo', n.todo.kind === 'kanban' ? '📋' : '☑️', 'Abrir la tarea creada']);
  badges.forEach(([act, ic, title], i) => {
    const bx = x + e.w - 4 - i * 21, by = y + 1;
    s += `<g class="mm-badge" data-act="${act}"><title>${esc(title)}</title><circle cx="${bx}" cy="${by}" r="10" style="fill:${pal.surface};stroke:${col};stroke-width:1.3"/><text x="${bx}" y="${by + 4}" text-anchor="middle" style="font-size:11px;fill:${pal.text};font-family:${pal.font}">${ic}</text></g>`;
  });
  if (e.d > 0 && n.children.length && (n.collapsed || sel)) {
    const fx = e.x + e.side * (e.w / 2 + 11);
    const hidden = n.collapsed ? mmCount(n) - 1 : 0;
    s += `<g class="mm-fold" data-act="fold"><title>${n.collapsed ? `Desplegar (${hidden} ideas ocultas)` : 'Plegar'}</title><circle cx="${fx}" cy="${e.y}" r="${n.collapsed ? 10 : 8}" style="fill:${n.collapsed ? col : pal.surface};stroke:${col};stroke-width:1.5"/><text x="${fx}" y="${e.y + 3.5}" text-anchor="middle" style="font-size:${n.collapsed ? 9.5 : 12}px;font-weight:700;fill:${n.collapsed ? '#fff' : col};font-family:${pal.font}">${n.collapsed ? (hidden > 99 ? '99+' : hidden) : '−'}</text></g>`;
  }
  return s + '</g>';
}
function mmSvgInner(L, pal, opt = {}) {
  let edges = '', nodes = '';
  for (const e of L.values()) {
    if (!e.parent) continue;
    const p = e.parent, s = e.side;
    const x1 = p.x + s * (p.d === 0 ? p.w / 2 - 6 : p.w / 2), y1 = p.y, x2 = e.x - s * e.w / 2, y2 = e.y, mx = (x1 + x2) / 2;
    edges += `<path d="M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}" style="stroke:${e.color};stroke-width:${e.d === 1 ? 3 : 1.8};fill:none;stroke-linecap:round;opacity:.85"/>`;
  }
  for (const e of L.values()) nodes += mmNodeSvg(e, pal, opt);
  return edges + nodes;
}

/* ---------- Render ---------- */
function mmRender() {
  if (!$('#mmSelect')) return;
  const maps = [...S.mindmaps].sort((a, b) => b.updated - a.updated);
  if (mmCurId && !mmCur()) mmCurId = null;
  if (!mmCurId && maps.length) mmOpenMap(maps[0].id, false);
  const m = mmCur();
  $('#mmSelect').innerHTML = maps.map(x => `<option value="${esc(x.id)}"${x.id === mmCurId ? ' selected' : ''}>🧠 ${esc(x.title)}</option>`).join('');
  $('#mmSelect').hidden = !maps.length; $('#mmMenuBtn').hidden = !maps.length;
  $('#mmEmpty').hidden = !!m; $('#mmHint').hidden = !m;
  $('#mmTools').classList.toggle('disabled', !m);
  if (!m) { mmSvg.innerHTML = ''; mmL = null; return; }
  mmL = mmLayout(m);
  mmSvg.innerHTML = `<g id="mmWorld">${mmSvgInner(mmL, MM_PAL_DOM, { sel: mmSelId, editing: mmEditing && mmEditing.id })}</g>`;
  mmApplyView();
  mmToolState();
}
function mmApplyView() {
  const v = mmV(), w = $('#mmWorld');
  if (w) w.setAttribute('transform', `translate(${v.x.toFixed(1)} ${v.y.toFixed(1)}) scale(${v.k.toFixed(4)})`);
  $('#mmZoom').textContent = Math.round(v.k * 100) + '%';
  if (mmEditing) mmPlaceEditor();
}
function mmToolState() {
  const f = mmFind(mmSelId), has = !!f;
  $$('#mmTools [data-mm]').forEach(b => { b.disabled = !has && b.dataset.mm !== 'child'; });
  if (!f) return;
  const isRoot = !f.p;
  $('#mmTools [data-mm=sibling]').disabled = isRoot;
  $('#mmTools [data-mm=del]').disabled = isRoot;
  $('#mmTools [data-mm=color]').disabled = isRoot;
  $('#mmTools [data-mm=fold]').disabled = isRoot || !f.n.children.length;
  $('#mmTools [data-mm=fold]').textContent = f.n.collapsed ? '⊕' : '⊖';
  $('#mmTools [data-mm=done]').classList.toggle('on', !!f.n.done);
  $('#mmTools [data-mm=note]').classList.toggle('on', !!f.n.note);
  $('#mmTools [data-mm=todo]').classList.toggle('on', !!f.n.todo);
  const h = mmH(mmCurId);
  $('[data-mm=undo]').disabled = !h.undo.length; $('[data-mm=redo]').disabled = !h.redo.length;
}
function mmFit(animate = false) {
  if (!mmL) return;
  const b = mmBounds(mmL), W = mmStage.clientWidth || 800, H = mmStage.clientHeight || 500;
  const k = Math.max(0.2, Math.min(1.4, Math.min(W / b.w, (H - 30) / b.h)));
  mmSetView({ k, x: W / 2 - (b.x + b.w / 2) * k, y: (H - 30) / 2 - (b.y + b.h / 2) * k });
}
function mmZoomAt(f, cx, cy) {
  const v = mmV(); const k = Math.max(0.15, Math.min(3, v.k * f));
  if (cx == null) { cx = mmStage.clientWidth / 2; cy = mmStage.clientHeight / 2; }
  const wx = (cx - v.x) / v.k, wy = (cy - v.y) / v.k;
  mmSetView({ k, x: cx - wx * k, y: cy - wy * k });
}
function mmEnsureVisible(id) {
  const e = mmL && mmL.get(id); if (!e) return;
  const v = { ...mmV() }, W = mmStage.clientWidth, H = mmStage.clientHeight, pad = 40;
  const l = v.x + (e.x - e.w / 2) * v.k, r = v.x + (e.x + e.w / 2) * v.k, t = v.y + (e.y - e.h / 2) * v.k, b = v.y + (e.y + e.h / 2) * v.k;
  let moved = false;
  if (l < pad) { v.x += pad - l; moved = true; } else if (r > W - pad) { v.x -= r - (W - pad); moved = true; }
  if (t < pad) { v.y += pad - t; moved = true; } else if (b > H - pad - 30) { v.y -= b - (H - pad - 30); moved = true; }
  if (moved) mmSetView(v);
}
function mmOpenMap(id, render = true) {
  if (mmEditing) mmCommitEdit();
  mmCurId = id; store.set('mmCur', id);
  const m = mmCur();
  mmSelId = m ? m.root.id : null;
  mmViewCache = mmView();
  if (render) { mmRender(); if (!mmViewCache) mmFit(); }
}
/** ¿Se ve la idea central en el lienzo? (p. ej., una vista guardada en otra pantalla) */
function mmOnScreen() {
  const e = mmL && mmL.get((mmCur() || {}).root?.id); if (!e) return true;
  const v = mmV(), x = v.x + e.x * v.k, y = v.y + e.y * v.k;
  return x > 0 && y > 0 && x < mmStage.clientWidth && y < mmStage.clientHeight;
}
function mmSelect(id) { mmSelId = id; mmRender(); }

/* ---------- Edición de texto ---------- */
function mmStartEdit(id, { initial = null, isNew = false, prev = null } = {}) {
  const f = mmFind(id); if (!f) return;
  if (mmEditing) mmCommitEdit();
  mmSelId = id;
  mmEditing = { id, isNew, prev, old: f.n.text };
  mmRender();
  mmEnsureVisible(id);
  mmEditEl.hidden = false;
  mmEditEl.value = initial != null ? initial : f.n.text;
  mmPlaceEditor();
  mmEditEl.focus({ preventScroll: true });
  if (initial == null) mmEditEl.select(); else mmEditEl.setSelectionRange(mmEditEl.value.length, mmEditEl.value.length);
}
function mmPlaceEditor() {
  const e = mmL && mmEditing && mmL.get(mmEditing.id); if (!e) return;
  const v = mmV(), w = Math.max(e.w, 170);
  const s = mmEditEl.style;
  s.left = (v.x + (e.x - w / 2) * v.k) + 'px';
  s.top = (v.y + (e.y - e.h / 2) * v.k) + 'px';
  s.width = (w * v.k) + 'px';
  s.font = `${e.st.weight} ${e.st.size * v.k}px ${mmFF}`;
  s.padding = `${e.st.py * v.k}px ${e.st.px * v.k}px`;
  s.borderRadius = (e.st.rx * v.k) + 'px';
  s.lineHeight = (e.lh * v.k) + 'px';
  s.height = 'auto'; s.height = Math.max(e.h * v.k, mmEditEl.scrollHeight) + 'px';
}
function mmCommitEdit() {
  const ed = mmEditing; if (!ed) return;
  const text = mmEditEl.value.replace(/\s+$/, '').replace(/^\s+/, '').slice(0, 500);
  mmEditing = null; mmEditEl.hidden = true;
  const m = mmCur(); const f = mmFind(ed.id);
  if (!m || !f) { mmRender(); return; }
  if (!text) {
    if (ed.isNew) { mmCancelNew(ed); return; }
    mmRender(); return;
  }
  if (ed.isNew) { f.n.text = text; m.updated = Date.now(); save.mindmaps(); mmRender(); }
  else if (text !== ed.old) mmChange(() => { f.n.text = text; });
  else mmRender();
  mmStage.focus({ preventScroll: true });
}
function mmCancelNew(ed) {
  const m = mmCur(); const h = mmH(m.id);
  const f = mmFind(ed.id);
  if (h.undo.length) { m.root = JSON.parse(h.undo.pop()); m.updated = Date.now(); save.mindmaps(); }
  else if (f && f.p) f.p.children.splice(f.i, 1);
  mmSelId = ed.prev && mmFind(ed.prev) ? ed.prev : f && f.p ? f.p.id : m.root.id;
  if (!mmFind(mmSelId)) mmSelId = m.root.id;
  mmRender(); mmStage.focus({ preventScroll: true });
}
function mmCancelEdit() {
  const ed = mmEditing; if (!ed) return;
  mmEditing = null; mmEditEl.hidden = true;
  if (ed.isNew) mmCancelNew(ed); else { mmRender(); mmStage.focus({ preventScroll: true }); }
}
mmEditEl.addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); mmCommitEdit(); }
  else if (e.key === 'Tab') { e.preventDefault(); const id = mmEditing && mmEditing.id; mmCommitEdit(); if (id && mmFind(id)) { mmSelId = id; mmAdd(e.shiftKey ? 'sibling' : 'child'); } }
  else if (e.key === 'Escape') { e.preventDefault(); mmCancelEdit(); }
});
mmEditEl.addEventListener('input', () => { mmEditEl.style.height = 'auto'; mmEditEl.style.height = mmEditEl.scrollHeight + 'px'; });
mmEditEl.addEventListener('blur', () => setTimeout(() => { if (mmEditing && document.activeElement !== mmEditEl) mmCommitEdit(); }, 120));

/* ---------- Operaciones ---------- */
function mmAdd(kind) {
  const m = mmCur(); if (!m) return;
  const f = mmFind(mmSelId) || { n: m.root, p: null, i: -1 };
  const nn = mmNewNode(), prev = f.n.id;
  mmChange(() => {
    if (kind === 'child' || !f.p) { f.n.children.push(nn); f.n.collapsed = false; }
    else f.p.children.splice(f.i + 1, 0, nn);
  });
  mmStartEdit(nn.id, { isNew: true, prev });
}
function mmDelete() {
  const f = mmFind(mmSelId);
  if (!f) return;
  if (!f.p) { toast('La idea central no se puede eliminar (puedes borrar el mapa desde ⋯)', 'info', 3000); return; }
  const next = f.p.children[f.i + 1] || f.p.children[f.i - 1] || f.p;
  const c = mmCount(f.n);
  mmChange(() => { f.p.children.splice(f.i, 1); });
  mmSelId = next.id; mmRender();
  toast(c > 1 ? `Eliminada la rama con ${c} ideas` : 'Idea eliminada', 'info', 5000, { label: 'Deshacer', fn: mmUndo });
}
function mmMove(id, target) {
  return mmChange(() => {
    const a = mmFind(id), t = mmFind(target.id);
    if (!a || !t || !a.p || mmFind(target.id, a.n)) return false;
    a.p.children.splice(a.i, 1);
    if (target.zone === 'child' || !t.p) { t.n.children.push(a.n); t.n.collapsed = false; }
    else { const tt = mmFind(target.id); tt.p.children.splice(tt.i + (target.zone === 'after' ? 1 : 0), 0, a.n); }
  });
}
function mmReorder(dir) {
  const f = mmFind(mmSelId); if (!f || !f.p) return;
  const j = f.i + dir; if (j < 0 || j >= f.p.children.length) return;
  mmChange(() => { const arr = f.p.children; [arr[f.i], arr[j]] = [arr[j], arr[f.i]]; });
}
function mmToggleFold(id = mmSelId) {
  const f = mmFind(id); if (!f || !f.p || !f.n.children.length) return;
  mmChange(() => { f.n.collapsed = !f.n.collapsed; });
}
function mmToggleDone() { const f = mmFind(mmSelId); if (f) mmChange(() => { f.n.done = !f.n.done; if (!f.n.done) delete f.n.done; }); }
function mmNavSpatial(dir, cur) {
  let best = null, bs = Infinity;
  for (const e of mmL.values()) {
    if (e === cur) continue;
    const dx = e.x - cur.x, dy = e.y - cur.y;
    const [p, q] = dir === 'right' ? [dx, dy] : dir === 'left' ? [-dx, dy] : dir === 'down' ? [dy, dx] : [-dy, dx];
    if (p <= 4) continue;
    const sc = p + Math.abs(q) * (dir === 'up' || dir === 'down' ? 2.5 : 3);
    if (sc < bs) { bs = sc; best = e; }
  }
  return best && best.n;
}
/** Flechas: ← → siguen la estructura (hacia fuera = hijas, hacia dentro = madre); ↑ ↓ recorren las hermanas. */
function mmNav(dir) {
  if (!mmL) return;
  const m = mmCur(), f = mmFind(mmSelId);
  if (!f) { mmSelect(m.root.id); return; }
  const e = mmL.get(f.n.id); if (!e) return;
  const closest = list => list.reduce((a, c) => !a || Math.abs(mmL.get(c.id).y - e.y) < Math.abs(mmL.get(a.id).y - e.y) ? c : a, null);
  let t = null;
  if (dir === 'left' || dir === 'right') {
    if (!f.p) { const nR = Math.ceil(e.kids.length / 2); t = closest(dir === 'right' ? e.kids.slice(0, nR) : e.kids.slice(nR)); }
    else if ((dir === 'right') === (e.side === 1)) t = closest(e.kids);
    else t = f.p;
  } else {
    const sib = f.p ? f.p.children.filter(c => mmL.get(c.id) && mmL.get(c.id).side === e.side) : [];
    const j = sib.indexOf(f.n) + (dir === 'down' ? 1 : -1);
    t = sib[j] || mmNavSpatial(dir, e);
  }
  if (t) { mmSelect(t.id); mmEnsureVisible(t.id); }
}

/* ---------- Color, nota y tarea ---------- */
const mmColorPop = document.createElement('div');
mmColorPop.className = 'popover mm-color-pop'; mmColorPop.id = 'mmColorPop';
mmColorPop.innerHTML = '<div class="muted small" style="padding:2px 4px 6px">Color de la rama</div><div class="mm-swatches">' + MM_COLORS.map(c => `<button type="button" data-col="${c}" style="background:${c}" title="${c}"></button>`).join('') + '</div><button type="button" class="btn sm ghost" data-col="" style="width:100%;margin-top:6px">Automático</button>';
document.body.append(mmColorPop);
mmColorPop.addEventListener('click', e => {
  const b = e.target.closest('[data-col]'); if (!b) return;
  mmColorPop.classList.remove('open');
  const f = mmFind(mmSelId); if (!f || !f.p) return;
  mmChange(() => { if (b.dataset.col) f.n.color = b.dataset.col; else delete f.n.color; });
});
async function mmNoteDialog() {
  const f = mmFind(mmSelId); if (!f) return;
  const linked = f.n.note && getNote(f.n.note);
  const notes = [...S.notes].sort((a, b) => a.title.localeCompare(b.title, 'es'));
  const exact = noteByTitle(f.n.text);
  const r = await modal({
    title: '📝 Enlazar con una nota',
    body: `<p class="small">La idea «<b>${esc(f.n.text || '…')}</b>» mostrará un 📝: al pulsarlo se abre la nota. El enlace también aparece en <b>Conexiones</b>.</p>
      <div><label class="lbl">Nota</label><select class="field" name="note">
        <option value="__new">＋ Crear una nota nueva «${esc((f.n.text || 'Idea').slice(0, 60))}»</option>
        ${notes.map(n => `<option value="${esc(n.id)}"${(linked ? linked.id === n.id : exact && exact.id === n.id) ? ' selected' : ''}>📄 ${esc(n.title)}</option>`).join('')}
      </select></div>`,
    actions: [{ label: 'Cancelar', value: null, cls: 'ghost' }].concat(linked ? [{ label: 'Abrir la nota', value: 'open', cls: '' }, { label: 'Quitar enlace', value: 'unlink', cls: '' }] : []).concat([{ label: 'Enlazar', value: 'ok', cls: 'primary' }])
  });
  if (!r) return;
  if (r.action === 'open') { mmOpenNote(f.n.note); return; }
  if (r.action === 'unlink') { mmChange(() => { delete f.n.note; }); return; }
  let id = r.data.note;
  if (id === '__new') {
    const m = mmCur();
    const n = createNote(f.n.text || 'Idea', `<div>Creada desde el mapa mental <b>${esc(m.title)}</b>.</div><div><br></div>`, false);
    id = n.id; toast(`Nota «${n.title}» creada`, 'success');
  }
  mmChange(() => { f.n.note = id; });
}
function mmOpenNote(id) {
  if (!getNote(id)) { toast('La nota enlazada ya no existe', 'warning'); return; }
  showTab('notes'); openNote(id);
}
async function mmTodoDialog() {
  const f = mmFind(mmSelId); if (!f) return;
  if (f.n.todo) {
    const ex = f.n.todo.kind === 'kanban' ? S.tasks.find(t => t.id === f.n.todo.id) : S.todos.find(t => t.id === f.n.todo.id);
    if (ex) {
      const r = await modal({ title: '☑️ Tarea creada desde esta idea', body: `<p>Esta idea ya se envió a <b>${f.n.todo.kind === 'kanban' ? 'Kanban' : 'Tareas'}</b>: «${esc(ex.title || ex.text)}».</p>`, actions: [{ label: 'Cerrar', value: null, cls: 'ghost' }, { label: 'Quitar la marca', value: 'unlink', cls: '' }, { label: 'Abrirla', value: 'open', cls: 'primary' }] });
      if (r && r.action === 'open') mmOpenTodo(f.n.todo);
      if (r && r.action === 'unlink') mmChange(() => { delete f.n.todo; });
      return;
    }
  }
  const kids = f.n.children.filter(c => c.text);
  const r = await modal({
    title: '☑️ Convertir en tarea',
    body: `<p class="small">Se creará una tarea con el texto «<b>${esc(f.n.text || '…')}</b>». Las fechas como «mañana» o «el viernes» se reconocen igual que en Tareas.</p>
      <div class="bk-choice"><label class="bk-opt"><input type="radio" name="dest" value="todo" checked><span><b>☑️ Tareas</b><br><span class="muted small">En la bandeja de entrada${kids.length ? '; sus ideas hijas, como pasos' : ''}.</span></span></label>
      <label class="bk-opt"><input type="radio" name="dest" value="kanban"><span><b>📋 Kanban</b><br><span class="muted small">Tarjeta en «Por hacer»${kids.length ? '; sus ideas hijas, como subtareas' : ''}.</span></span></label></div>
      ${kids.length ? `<label class="check-row" style="margin-top:10px"><input type="checkbox" class="check" name="kids" checked> Incluir sus ${kids.length} ideas hijas</label>` : ''}`,
    actions: [{ label: 'Cancelar', value: null, cls: 'ghost' }, { label: 'Crear tarea', value: 'ok', cls: 'primary' }]
  });
  if (!r) return;
  const withKids = !!r.data.kids, text = (f.n.text || 'Idea').replace(/\n/g, ' ');
  let ref;
  if (r.data.dest === 'kanban') {
    const t = { id: uid(), title: text.slice(0, 200), desc: `Desde el mapa mental «${mmCur().title}»`, col: 'todo', priority: 'media', due: '', tags: [], subtasks: withKids ? kids.map(c => ({ id: uid(), text: c.text.replace(/\n/g, ' '), done: !!c.done })) : [], created: Date.now() };
    S.tasks.push(t); save.tasks(); ref = { kind: 'kanban', id: t.id };
  } else {
    const t = addTodoFromText(text, 'inbox');
    if (!t) return;
    if (withKids) { t.steps = kids.map(c => ({ id: uid(), text: c.text.replace(/\n/g, ' '), done: !!c.done })); }
    t.notes = `Desde el mapa mental «${mmCur().title}»`;
    save.todos(); ref = { kind: 'todo', id: t.id };
  }
  mmChange(() => { f.n.todo = ref; });
  toast(`Tarea creada en ${ref.kind === 'kanban' ? 'Kanban' : 'Tareas'}`, 'success', 4000, { label: 'Ver', fn: () => mmOpenTodo(ref) });
}
function mmOpenTodo(ref) {
  if (ref.kind === 'kanban') { if (!S.tasks.some(t => t.id === ref.id)) { toast('La tarjeta ya no existe', 'warning'); return; } showTab('kanban'); openTask(ref.id); }
  else { if (!S.todos.some(t => t.id === ref.id)) { toast('La tarea ya no existe', 'warning'); return; } showTab('todos'); openTodo(ref.id); }
}

/* ---------- Esquemas de texto ⇄ mapa ---------- */
function mmCleanInline(s) {
  let note = null;
  const t = String(s)
    .replace(/\[\[([^\[\]\n]{1,120})\]\]/g, (m, x) => { const n = noteByTitle(x); if (n && !note) note = n.id; return wlCleanTitle(x); })
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/__([^_]+)__/g, '$1').replace(/~~([^~]+)~~/g, '$1').replace(/`([^`]+)`/g, '$1')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1$2').trim();
  return { text: t, note };
}
/** Convierte texto con sangría, listas Markdown o títulos (#) en un árbol de ideas. */
function mmParseOutline(text, rootTitle) {
  const items = []; let head = 0, inCode = false;
  for (const raw of String(text).replace(/\r/g, '').split('\n')) {
    if (/^\s*```/.test(raw)) { inCode = !inCode; continue; }
    if (inCode || !raw.trim() || /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(raw)) continue;
    let m;
    if ((m = raw.match(/^(#{1,6})\s+(.*)$/))) { head = m[1].length; items.push({ lvl: head * 100, text: m[2] }); continue; }
    const ind = raw.match(/^[ \t]*/)[0].replace(/\t/g, '    ').length;
    let done = false;
    const t = raw.trim().replace(/^>\s?/, '').replace(/^([-*+•]|\d+[.)])\s+/, '').replace(/^\[( |x|X)\]\s*/, (mm, c) => { done = c !== ' '; return ''; });
    if (!t) continue;
    items.push({ lvl: head * 100 + 1 + Math.floor(ind / 2), text: t, done });
  }
  const root = mmNewNode(rootTitle || '');
  const stack = [{ lvl: -1, n: root }];
  for (const it of items) {
    const c = mmCleanInline(it.text);
    const n = mmNewNode(c.text.slice(0, 300));
    if (c.note) n.note = c.note;
    if (it.done) n.done = true;
    while (stack.length > 1 && stack[stack.length - 1].lvl >= it.lvl) stack.pop();
    stack[stack.length - 1].n.children.push(n);
    stack.push({ lvl: it.lvl, n });
  }
  if (!rootTitle) {
    if (root.children.length === 1) return root.children[0];
    root.text = 'Idea central';
  }
  return root;
}
function mmLinkedLabel(n) {
  const note = n.note && getNote(n.note);
  if (!note) return n.text.replace(/\n/g, ' ');
  return norm(note.title) === norm(n.text) ? `[[${note.title}]]` : `${n.text.replace(/\n/g, ' ')} ([[${note.title}]])`;
}
function mmToMd(m) {
  const rec = (n, d) => '  '.repeat(d) + '- ' + (n.done ? '[x] ' : '') + mmLinkedLabel(n) + '\n' + n.children.map(c => rec(c, d + 1)).join('');
  return `# ${m.root.text.replace(/\n/g, ' ')}\n\n` + m.root.children.map(c => rec(c, 0)).join('');
}
function mmToHtml(n) {
  if (!n.children.length) return '';
  return '<ul>' + n.children.map(c => {
    const note = c.note && getNote(c.note);
    let label = esc(c.text).replace(/\n/g, '<br>');
    if (note) label = norm(note.title) === norm(c.text) ? `<a class="wl" data-note="${esc(note.id)}" contenteditable="false">${esc(note.title)}</a>` : `${label} (<a class="wl" data-note="${esc(note.id)}" contenteditable="false">${esc(note.title)}</a>)`;
    if (c.done) label = `<s>${label}</s>`;
    return `<li>${label}${mmToHtml(c)}</li>`;
  }).join('') + '</ul>';
}

/* ---------- Gestión de mapas ---------- */
function mmCreateMap(title, root) {
  const now = Date.now();
  const m = { id: uid(), title: String(title || 'Mapa').slice(0, 80), root, created: now, updated: now };
  S.mindmaps.push(m); save.mindmaps();
  if (mmEditing) mmCommitEdit();
  mapsMode = 'mind'; store.set('mapsMode', 'mind');
  mmCurId = m.id; store.set('mmCur', m.id); mmSelId = m.root.id; mmViewCache = null;
  if (currentTab !== 'maps') showTab('maps'); else showMapsMode('mind');
  return m;
}
async function mmNewDialog(preset) {
  const notes = [...S.notes].sort((a, b) => b.updated - a.updated);
  const r = await modal({
    title: '🧠 Nuevo mapa mental', wide: true,
    body: `<div><label class="lbl">Empezar con</label><div class="mm-tpls">${MM_TEMPLATES.map((t, i) => `<label class="mm-tpl"><input type="radio" name="tpl" value="${t.id}"${(preset ? t.id === preset : i === 0) ? ' checked' : ''}><span>${t.icon} ${esc(t.name)}</span></label>`).join('')}</div></div>
      <div id="mmTplOutline" hidden><label class="lbl">Pega un esquema</label><textarea class="field" name="outline" rows="8" data-noenter placeholder="Una idea por línea. Usa sangría (espacios o tabulador), guiones «- » o títulos «#» para indicar la jerarquía.&#10;&#10;Viaje a Lisboa&#10;  Transporte&#10;    Vuelos&#10;  Alojamiento"></textarea></div>
      <div id="mmTplNote" hidden><label class="lbl">Nota</label><select class="field" name="note">${notes.map(n => `<option value="${esc(n.id)}">📄 ${esc(n.title)}</option>`).join('') || '<option value="">(no hay notas)</option>'}</select><p class="hint">Los títulos y las listas de la nota se convierten en ramas. Los enlaces [[…]] se mantienen.</p></div>
      <div id="mmTplTitle"><label class="lbl">Idea central</label><input class="field" name="title" maxlength="80" placeholder="¿De qué trata el mapa?"></div>`,
    actions: [{ label: 'Cancelar', value: null, cls: 'ghost' }, {
      label: 'Crear mapa', value: 'ok', cls: 'primary', validate: f => {
        const t = f.querySelector('[name=tpl]:checked').value;
        if (t === 'outline' && !f.elements.namedItem('outline').value.trim()) return 'Pega un esquema';
        if (t === 'note' && !f.elements.namedItem('note').value) return 'No hay notas que convertir';
        return null;
      }
    }],
    onOpen: form => {
      const sync = () => {
        const t = form.querySelector('[name=tpl]:checked').value;
        $('#mmTplOutline', form).hidden = t !== 'outline';
        $('#mmTplNote', form).hidden = t !== 'note';
        $('#mmTplTitle', form).hidden = t === 'note';
        const tp = MM_TEMPLATES.find(x => x.id === t);
        const ti = form.elements.namedItem('title');
        if (tp && tp.root && (!ti.value || ti.dataset.auto)) { ti.value = fillTemplate(tp.root); ti.dataset.auto = '1'; }
        if (t === 'outline' && ti.dataset.auto) { ti.value = ''; }
      };
      form.elements.namedItem('title').addEventListener('input', e => { delete e.target.dataset.auto; });
      form.addEventListener('change', sync); sync();
    }
  });
  if (!r) return;
  const t = r.data.tpl;
  if (t === 'note') { mmFromNote(r.data.note); return; }
  let root;
  if (t === 'outline') { root = mmParseOutline(r.data.outline, (r.data.title || '').trim()); }
  else { const tp = MM_TEMPLATES.find(x => x.id === t); root = mmNewNode((r.data.title || '').trim() || fillTemplate(tp.root)); tp.kids.forEach(k => root.children.push(mmNewNode(k))); }
  const m = mmCreateMap(root.text, root);
  if (t === 'blank') { mmSelId = m.root.id; mmRender(); setTimeout(() => mmAdd('child'), 50); }
}
function mmFromNote(id) {
  const n = getNote(id); if (!n) return;
  flushNote();
  const md = htmlToMd(parseHtml(sanitize(n.html)));
  const root = mmParseOutline(md, n.title);
  root.note = n.id;
  const m = mmCreateMap(n.title, root);
  toast(root.children.length ? `Mapa creado desde «${n.title}» con ${mmCount(root) - 1} ideas` : 'La nota no tiene listas ni títulos: el mapa empieza solo con la idea central', root.children.length ? 'success' : 'info', 4000);
  return m;
}
async function mmRename() {
  const m = mmCur(); if (!m) return;
  const t = await askText('✏️ Renombrar mapa', 'Nombre del mapa', m.title); if (!t) return;
  m.title = t.slice(0, 80); m.updated = Date.now(); save.mindmaps(); mmRender();
}
function mmDuplicate() {
  const m = mmCur(); if (!m) return;
  mmCreateMap(m.title + ' (copia)', mmReId(clone(m.root)));
  toast('Mapa duplicado', 'success');
}
async function mmDeleteMap() {
  const m = mmCur(); if (!m) return;
  if (!(await confirmDialog(`¿Eliminar el mapa «${m.title}» (${mmCount(m.root)} ideas)?`))) return;
  const idx = S.mindmaps.indexOf(m);
  S.mindmaps.splice(idx, 1); save.mindmaps();
  mmCurId = null; mmRender(); mmFit();
  toast(`Mapa «${m.title}» eliminado`, 'info', 6000, { label: 'Deshacer', fn: () => { S.mindmaps.push(m); save.mindmaps(); mmOpenMap(m.id); } });
}
function mmSaveAsNote() {
  const m = mmCur(); if (!m) return;
  const n = createNote(m.root.text.replace(/\n/g, ' ') || m.title, mmToHtml(m.root) || '<div><br></div>', false);
  toast(`Nota «${n.title}» creada a partir del mapa`, 'success', 4000, { label: 'Abrir', fn: () => { showTab('notes'); openNote(n.id); } });
  return n;
}
async function mmInsertOutline(text) {
  const f = mmFind(mmSelId) || { n: mmCur().root };
  const list = mmParseOutline(text, '·').children;
  if (!list.length) return;
  mmChange(() => { list.forEach(c => f.n.children.push(c)); f.n.collapsed = false; });
  toast(`${list.reduce((a, c) => a + mmCount(c), 0)} ideas añadidas`, 'success');
}
async function mmImportDialog() {
  const r = await modal({ title: '📋 Añadir ideas desde un esquema', body: '<p class="small">Se añaden como hijas de la idea seleccionada. Una idea por línea; la sangría o los guiones marcan la jerarquía.</p><textarea class="field" name="t" rows="10" data-noenter></textarea>', actions: [{ label: 'Cancelar', value: null, cls: 'ghost' }, { label: 'Añadir', value: 'ok', cls: 'primary' }] });
  if (r && r.data.t.trim()) mmInsertOutline(r.data.t);
}

/* ---------- Exportar SVG / PNG ---------- */
function mmExportSvg() {
  const m = mmCur(); if (!m) return null;
  const cs = getComputedStyle(document.documentElement);
  const v = k => cs.getPropertyValue(k).trim();
  const pal = { accent: v('--accent'), text: v('--text'), surface: v('--surface'), muted: v('--muted'), font: (mmFF || 'sans-serif').replace(/"/g, "'") };
  const keep = mmEditing; mmEditing = null;
  const L = mmLayout(m); mmEditing = keep;
  const b = mmBounds(L), pad = 24;
  const inner = mmSvgInner(L, pal, {}).replace(/var\(--accent\)/g, pal.accent);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(b.w + pad * 2)}" height="${Math.ceil(b.h + pad * 2)}" viewBox="0 0 ${Math.ceil(b.w + pad * 2)} ${Math.ceil(b.h + pad * 2)}"><rect width="100%" height="100%" fill="${v('--bg')}"/><g transform="translate(${(-b.x + pad).toFixed(1)} ${(-b.y + pad).toFixed(1)})">${inner}</g></svg>`;
}
function mmDownloadPng() {
  const svg = mmExportSvg(); if (!svg) return;
  const m = mmCur();
  const img = new Image();
  img.onload = () => {
    const sc = 2, c = document.createElement('canvas');
    c.width = img.width * sc; c.height = img.height * sc;
    const ctx = c.getContext('2d'); ctx.scale(sc, sc); ctx.drawImage(img, 0, 0);
    c.toBlob(b => { if (b) download(`${safeName(m.title)}.png`, b); else toast('No se pudo generar la imagen', 'danger'); }, 'image/png');
  };
  img.onerror = () => toast('No se pudo generar la imagen', 'danger');
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/* ---------- Menú del mapa ---------- */
const mmMenu = document.createElement('div');
mmMenu.className = 'popover menu'; mmMenu.id = 'mmMenu';
mmMenu.innerHTML = `<button data-mmm="rename">✏️ Renombrar mapa</button><button data-mmm="dup">🗐 Duplicar mapa</button><hr>
  <button data-mmm="png">🖼️ Descargar imagen (PNG)</button><button data-mmm="svg">📐 Descargar SVG</button><button data-mmm="md">⬇️ Descargar esquema Markdown (.md)</button><button data-mmm="copy">📋 Copiar como esquema</button><hr>
  <button data-mmm="note">📝 Guardar como nota</button><button data-mmm="import">➕ Añadir ideas desde un esquema</button><button data-mmm="expand">⊕ Desplegar todo</button><button data-mmm="collapse">⊖ Plegar todo (desde el 2.º nivel)</button><hr>
  <button data-mmm="delete" class="danger">🗑️ Eliminar mapa</button>`;
document.body.append(mmMenu);
mmMenu.addEventListener('click', e => {
  const b = e.target.closest('[data-mmm]'); if (!b) return;
  mmMenu.classList.remove('open');
  const m = mmCur(); if (!m) return;
  switch (b.dataset.mmm) {
    case 'rename': mmRename(); break;
    case 'dup': mmDuplicate(); break;
    case 'png': mmDownloadPng(); break;
    case 'svg': download(`${safeName(m.title)}.svg`, mmExportSvg(), 'image/svg+xml'); break;
    case 'md': download(`${safeName(m.title)}.md`, mmToMd(m), 'text/markdown;charset=utf-8'); break;
    case 'copy': copyText(mmToMd(m), 'Esquema copiado'); break;
    case 'note': mmSaveAsNote(); break;
    case 'import': mmImportDialog(); break;
    case 'expand': mmChange(() => { mmWalk(m.root, n => { delete n.collapsed; }); }); break;
    case 'collapse': mmChange(() => { m.root.children.forEach(c => { if (c.children.length) c.collapsed = true; }); }); mmSelId = m.root.id; mmRender(); mmFit(); break;
    case 'delete': mmDeleteMap(); break;
  }
});

/* ---------- Barra ---------- */
$('#mmNew').addEventListener('click', () => mmNewDialog());
$('#mmEmptyNew').addEventListener('click', () => mmNewDialog());
$('#mmSelect').addEventListener('change', e => { mmOpenMap(e.target.value); });
$('#mmMenuBtn').addEventListener('click', e => { mmMenu.classList.contains('open') ? mmMenu.classList.remove('open') : openPopover(mmMenu, e.currentTarget); });
document.querySelector('#view-maps .mm-card .mm-bar').addEventListener('click', e => {
  const b = e.target.closest('[data-mm]'); if (!b || b.disabled) return;
  const a = b.dataset.mm;
  if (a === 'color') { mmColorPop.classList.contains('open') ? mmColorPop.classList.remove('open') : openPopover(mmColorPop, b); return; }
  ({
    child: () => mmAdd('child'), sibling: () => mmAdd('sibling'), edit: () => mmStartEdit(mmSelId), note: mmNoteDialog, todo: mmTodoDialog,
    done: mmToggleDone, fold: () => mmToggleFold(), del: mmDelete, undo: mmUndo, redo: mmRedo,
    zin: () => mmZoomAt(1.2), zout: () => mmZoomAt(1 / 1.2), fit: () => mmFit()
  })[a]();
  if (!['child', 'sibling', 'edit', 'note', 'todo'].includes(a)) mmStage.focus({ preventScroll: true });
});

/* ---------- Ratón / táctil ---------- */
const mmPtr = new Map();
let mmDrag = null, mmLastTap = { id: null, t: 0 };
function mmClearDrop() { $$('#mmSvg .drop-child,#mmSvg .drop-before,#mmSvg .drop-after').forEach(g => g.classList.remove('drop-child', 'drop-before', 'drop-after')); }
mmStage.addEventListener('pointerdown', e => {
  if (e.target === mmEditEl || e.button > 0 || e.target.closest('#mmEmpty') || !mmCur()) return;
  if (mmEditing) mmCommitEdit();
  mmStage.focus({ preventScroll: true });
  closePopovers();
  mmPtr.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const v = mmV();
  if (mmPtr.size === 2) {
    const [a, b] = [...mmPtr.values()], r = mmStage.getBoundingClientRect();
    mmDrag = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, k0: v.k, x0: v.x, y0: v.y, cx: (a.x + b.x) / 2 - r.left, cy: (a.y + b.y) / 2 - r.top };
    return;
  }
  const act = e.target.closest('[data-act]'), g = e.target.closest('.mm-n');
  if (act && g) { mmDrag = { type: 'act', act: act.dataset.act, id: g.dataset.id }; e.preventDefault(); return; }
  try { mmStage.setPointerCapture(e.pointerId); } catch {}
  if (g) {
    const id = g.dataset.id, wasSel = mmSelId === id;
    if (!wasSel) mmSelect(id);
    mmDrag = { type: 'node', id, sx: e.clientX, sy: e.clientY, moved: false, wasSel, isRoot: !mmFind(id).p, x0: v.x, y0: v.y };
    return;
  }
  mmDrag = { type: 'pan', sx: e.clientX, sy: e.clientY, x0: v.x, y0: v.y, moved: false };
});
mmStage.addEventListener('pointermove', e => {
  if (!mmDrag) return;
  if (mmPtr.has(e.pointerId)) mmPtr.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const v = mmV();
  if (mmDrag.type === 'pinch') {
    if (mmPtr.size < 2) return;
    const [a, b] = [...mmPtr.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    const k = Math.max(0.15, Math.min(3, mmDrag.k0 * d / mmDrag.d0));
    const wx = (mmDrag.cx - mmDrag.x0) / mmDrag.k0, wy = (mmDrag.cy - mmDrag.y0) / mmDrag.k0;
    mmSetView({ k, x: mmDrag.cx - wx * k, y: mmDrag.cy - wy * k });
    return;
  }
  const dx = e.clientX - mmDrag.sx, dy = e.clientY - mmDrag.sy;
  if (!mmDrag.moved && Math.hypot(dx, dy) < 5) return;
  mmDrag.moved = true;
  if (mmDrag.type === 'pan' || (mmDrag.type === 'node' && mmDrag.isRoot)) { mmSetView({ ...v, x: mmDrag.x0 + dx, y: mmDrag.y0 + dy }); return; }
  if (mmDrag.type === 'node') {
    const g = mmSvg.querySelector(`.mm-n[data-id="${CSS.escape(mmDrag.id)}"]`);
    if (!g) return;
    g.classList.add('dragging');
    g.setAttribute('transform', `translate(${dx / v.k} ${dy / v.k})`);
    mmClearDrop(); mmDrag.target = null;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const tg = el && el.closest && el.closest('.mm-n');
    if (tg && tg !== g && !mmFind(tg.dataset.id, mmFind(mmDrag.id).n)) {
      const box = tg.querySelector('.mm-box').getBoundingClientRect();
      const rel = (e.clientY - box.top) / box.height;
      const isRoot = !mmFind(tg.dataset.id).p;
      const zone = isRoot ? 'child' : rel < 0.28 ? 'before' : rel > 0.72 ? 'after' : 'child';
      tg.classList.add('drop-' + zone);
      mmDrag.target = { id: tg.dataset.id, zone };
    }
  }
});
function mmPointerEnd(e) {
  mmPtr.delete(e.pointerId);
  const d = mmDrag; if (!d) return;
  if (d.type === 'pinch') { if (mmPtr.size === 0) mmDrag = null; return; }
  mmDrag = null;
  if (e.type === 'pointercancel') { mmClearDrop(); mmRender(); return; }
  if (d.type === 'act') {
    const a = e.target.closest && e.target.closest('[data-act]');
    if (!a || a.dataset.act !== d.act) return;
    const f = mmFind(d.id); if (!f) return;
    mmSelId = d.id;
    if (d.act === 'fold') mmToggleFold(d.id);
    else if (d.act === 'note') mmOpenNote(f.n.note);
    else if (d.act === 'todo') mmOpenTodo(f.n.todo);
    else if (d.act === 'done') mmToggleDone();
    return;
  }
  if (d.type === 'node') {
    mmClearDrop();
    if (d.moved && !d.isRoot) {
      if (d.target) { if (mmMove(d.id, d.target)) { mmSelId = d.id; mmRender(); return; } }
      mmRender(); return;
    }
    const now = Date.now(), dbl = mmLastTap.id === d.id && now - mmLastTap.t < 450;
    mmLastTap = { id: d.id, t: dbl ? 0 : now };
    if (!d.moved && (dbl || (d.wasSel && e.pointerType !== 'mouse'))) mmStartEdit(d.id);
    return;
  }
  if (d.type === 'pan' && !d.moved) { mmSelId = null; mmRender(); }
}
mmStage.addEventListener('pointerup', mmPointerEnd);
mmStage.addEventListener('pointercancel', mmPointerEnd);
mmStage.addEventListener('dblclick', e => {
  const g = e.target.closest('.mm-n');
  if (g || mmEditing) return;
  if (e.target !== mmEditEl && !e.target.closest('#mmEmpty')) { const m = mmCur(); if (m) { mmSelId = m.root.id; mmAdd('child'); } }
});
mmStage.addEventListener('wheel', e => {
  if (!mmCur()) return;
  e.preventDefault();
  const r = mmStage.getBoundingClientRect();
  if (e.ctrlKey || e.metaKey) mmZoomAt(Math.exp(-e.deltaY * 0.0022), e.clientX - r.left, e.clientY - r.top);
  else { const v = mmV(); mmSetView({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }); }
}, { passive: false });
mmStage.addEventListener('paste', e => {
  if (mmEditing || !mmCur()) return;
  const t = (e.clipboardData || window.clipboardData).getData('text/plain');
  if (!t || !t.trim()) return;
  e.preventDefault();
  mmInsertOutline(t);
});

/* ---------- Teclado ---------- */
document.addEventListener('keydown', e => {
  if (!APP_READY || currentTab !== 'maps' || mapsMode !== 'mind' || mmEditing) return;
  if ($('#modalBack').classList.contains('open') || $('#paletteBack').classList.contains('open')) return;
  if (!(e.target === mmStage || e.target === document.body)) return;
  const m = mmCur(); if (!m) return;
  const ctrl = e.ctrlKey || e.metaKey, k = e.key;
  if (ctrl && !e.shiftKey && k.toLowerCase() === 'z') { e.preventDefault(); mmUndo(); return; }
  if (ctrl && (k.toLowerCase() === 'y' || (e.shiftKey && k.toLowerCase() === 'z'))) { e.preventDefault(); mmRedo(); return; }
  if (ctrl && k === '.') { e.preventDefault(); mmToggleFold(); return; }
  if (ctrl && k === '0') { e.preventDefault(); mmFit(); return; }
  if (ctrl || e.altKey && !k.startsWith('Arrow')) return;
  if (!mmSelId && /^(Tab|Enter|F2|ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/.test(k)) { e.preventDefault(); mmSelect(m.root.id); if (k.startsWith('Arrow')) return; }
  switch (k) {
    case 'Tab': e.preventDefault(); if (e.shiftKey) { const f = mmFind(mmSelId); if (f && f.p) mmSelect(f.p.id); } else mmAdd('child'); return;
    case 'Enter': e.preventDefault(); mmAdd(e.shiftKey ? 'child' : 'sibling'); return;
    case 'F2': case ' ': e.preventDefault(); mmStartEdit(mmSelId); return;
    case 'Delete': case 'Backspace': e.preventDefault(); mmDelete(); return;
    case 'Escape': mmSelId = null; mmRender(); return;
    case 'ArrowUp': e.preventDefault(); e.altKey ? mmReorder(-1) : mmNav('up'); return;
    case 'ArrowDown': e.preventDefault(); e.altKey ? mmReorder(1) : mmNav('down'); return;
    case 'ArrowLeft': e.preventDefault(); mmNav('left'); return;
    case 'ArrowRight': e.preventDefault(); mmNav('right'); return;
  }
  if (k.length === 1 && mmSelId && !e.altKey) { e.preventDefault(); mmStartEdit(mmSelId, { initial: k }); }
});

/* ---------- Vista Mapas (modo) ---------- */
function showMapsMode(mode) {
  if (mmEditing) mmCommitEdit();
  mapsMode = mode === 'graph' ? 'graph' : 'mind';
  store.set('mapsMode', mapsMode);
  $$('#mapsMode button').forEach(b => b.classList.toggle('on', b.dataset.mode === mapsMode));
  $$('#view-maps .maps-pane').forEach(p => { p.hidden = p.dataset.pane !== mapsMode; });
  if (currentTab !== 'maps') return;
  if (mapsMode === 'mind') { grStop(); mmRender(); if (!mmViewCache || !mmOnScreen()) mmFit(); }
  else grShow();
}
$('#mapsMode').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b) showMapsMode(b.dataset.mode); });
onShow.maps = () => {
  if (mmCurId == null) { const c = store.get('mmCur', null); if (c && S.mindmaps.some(m => m.id === c)) { mmCurId = c; mmSelId = mmCur().root.id; mmViewCache = mmView(); } }
  showMapsMode(store.get('mapsMode', mapsMode));
};
if (window.ResizeObserver) new ResizeObserver(() => { if (currentTab === 'maps' && mapsMode === 'mind') mmApplyView(); }).observe(mmStage);
$('#mapsHelpBtn').addEventListener('click', () => modal({
  title: '🧠 Mapas mentales y conexiones', wide: true,
  body: `<h4>🧠 Mapas mentales</h4>
    <p class="small">Sirven para ordenar ideas alrededor de un tema: planificar un proyecto, preparar una reunión, estudiar, hacer una lluvia de ideas… Se guardan con el resto de tus datos (y se cifran si tienes el bloqueo activado).</p>
    <div class="shortcuts">
      <span><kbd>Tab</kbd></span><span>Nueva idea hija de la seleccionada</span>
      <span><kbd>Enter</kbd></span><span>Nueva idea hermana (debajo)</span>
      <span><kbd>F2</kbd>, <kbd>Espacio</kbd>, doble clic o empezar a escribir</span><span>Editar el texto (<kbd>Shift</kbd>+<kbd>Enter</kbd> = salto de línea)</span>
      <span><kbd>←</kbd> <kbd>↑</kbd> <kbd>↓</kbd> <kbd>→</kbd></span><span>Moverse entre ideas</span>
      <span><kbd>Alt</kbd> + <kbd>↑</kbd>/<kbd>↓</kbd></span><span>Subir o bajar la idea entre sus hermanas</span>
      <span><kbd>Supr</kbd></span><span>Eliminar la idea y sus hijas (se puede deshacer)</span>
      <span><kbd>Ctrl</kbd> + <kbd>.</kbd></span><span>Plegar / desplegar una rama</span>
      <span><kbd>Ctrl</kbd> + <kbd>Z</kbd> / <kbd>Y</kbd></span><span>Deshacer / rehacer</span>
      <span><kbd>Ctrl</kbd> + rueda · <kbd>Ctrl</kbd> + <kbd>0</kbd></span><span>Zoom · encajar todo el mapa</span>
      <span><kbd>Ctrl</kbd> + <kbd>V</kbd></span><span>Pegar un esquema de texto como ideas hijas</span>
    </div>
    <p class="small" style="margin-top:10px"><b>Reorganizar:</b> arrastra una idea sobre otra. Si la sueltas en el centro, pasa a ser su hija; en el borde de arriba o de abajo, se coloca antes o después.<br>
    <b>Conectar:</b> 📝 enlaza la idea con una nota (o crea una nueva) y ☑️ la convierte en tarea o en tarjeta del Kanban (sus ideas hijas, como pasos).<br>
    <b>Convertir:</b> desde el menú ⋯ de una nota puedes crear un mapa a partir de sus títulos y listas, y desde el menú ⋯ del mapa, guardarlo como nota, exportarlo como imagen o como esquema Markdown (compatible con Obsidian y otras herramientas).</p>
    <h4 style="margin-top:14px">🕸️ Conexiones entre notas</h4>
    <p class="small">Muestra cómo se relacionan tus notas. Para conectar dos notas, escribe <kbd>[[</kbd> dentro de una nota y elige la otra (o escribe <code>[[Título]]</code>). Si la nota no existe, se crea con un clic. Las tareas y tarjetas que mencionan <code>[[una nota]]</code> en su texto o descripción, y los mapas mentales con ideas enlazadas, también aparecen.</p>
    <p class="small">Clic en un nodo: ver sus conexiones · doble clic: abrirlo · arrastra los nodos para recolocarlos · «Centrar aquí» muestra solo su entorno.</p>`,
  actions: [{ label: 'Entendido', value: 'ok', cls: 'primary' }]
}));
