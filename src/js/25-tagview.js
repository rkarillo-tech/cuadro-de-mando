/* =====================================================================
   SECCIÓN ETIQUETAS: NUBE / LISTA · GESTIÓN · INTEGRACIONES
   ===================================================================== */
let tagSel = null, tagSort = 'count', tagMode = 'cloud';
const tagChecked = new Set();
const TAG_KIND = { note: ['📝', 'Notas'], todo: ['☑️', 'Tareas'], kanban: ['📋', 'Kanban'], event: ['📅', 'Calendario'], bookmark: ['🔖', 'Marcadores'], map: ['🧠', 'Mapas mentales'] };
/* Elementos que admiten etiquetas en su campo (los mapas solo por texto) */
const TAG_SRC = {
  note: { list: () => S.notes, save: () => save.notes(), label: n => n.title, sub: n => wkParent(n) ? '📚 ' + wkPath(n) : relTime(n.updated), tags: n => allNoteTags(n) },
  todo: { list: () => S.todos, save: () => save.todos(), label: t => t.text, sub: t => [(S.todoLists.find(l => l.id === t.listId) || {}).name, t.due ? fmtDayLabel(t.due) : '', t.done ? '✓ hecha' : ''].filter(Boolean).join(' · '), tags: t => todoTags(t) },
  kanban: { list: () => S.tasks, save: () => save.tasks(), label: t => t.title, sub: t => (COLS.find(c => c.id === t.col) || {}).name || '', tags: t => taskTags(t) },
  event: { list: () => S.events, save: () => save.events(), label: e => e.title, sub: e => fmtDayLabel(e.date), tags: e => eventTags(e) },
  bookmark: { list: () => S.bookmarks, save: () => save.bookmarks(), label: b => b.title, sub: b => bmDomain(b.url), tags: b => bmTags(b) }
};
function openTagView(key) {
  tagSel = key || null;
  if (currentTab !== 'tags') showTab('tags'); else renderTagView();
}
function tagCloudHtml(entries, { max = 200, small = false } = {}) {
  if (!entries.length) return '';
  const counts = entries.map(e => tagItemsOf(e.key).length);
  const lo = Math.min(...counts), hi = Math.max(...counts);
  return entries.slice(0, max).map((e, i) => {
    const n = counts[i], w = hi === lo ? 0.5 : Math.log(n - lo + 1) / Math.log(hi - lo + 1);
    const size = small ? 0.8 + w * 0.55 : 0.85 + w * 1.15;
    const desc = (tagMetaOf(e.key) || {}).desc;
    return `<button type="button" class="cloud-tag${e.key === tagSel ? ' on' : ''}${n ? '' : ' unused'}" data-tag="${esc(e.key)}" style="font-size:${size.toFixed(2)}rem;--w:${(0.62 + w * 0.38).toFixed(2)}" title="${n ? `${n} elemento${n === 1 ? '' : 's'}` : 'Sin uso todavía'}${desc ? ' · ' + esc(desc) : ''}">#${esc(e.name)}<sup>${n}</sup></button>`;
  }).join('');
}
/** Cuántos elementos de cada sección lleva la etiqueta (incluidas subetiquetas). */
function tagKindsHtml(key) {
  const c = {}; tagItemsOf(key).forEach(it => { c[it.kind] = (c[it.kind] || 0) + 1; });
  return Object.keys(TAG_KIND).filter(k => c[k]).map(k => `<span title="${TAG_KIND[k][1]}">${TAG_KIND[k][0]}${c[k]}</span>`).join('');
}
function tagListHtml(entries, q) {
  const tree = tagSort === 'az' && !q;
  return entries.map(e => {
    const n = tagItemsOf(e.key).length, parts = e.name.split('/'), depth = tree ? parts.length - 1 : 0;
    const desc = (tagMetaOf(e.key) || {}).desc;
    return `<div class="tgl-row${e.key === tagSel ? ' on' : ''}${n ? '' : ' unused'}" data-k="${esc(e.key)}" tabindex="0" style="--d:${depth}">
      <input type="checkbox" class="check" data-chk${tagChecked.has(e.key) ? ' checked' : ''} title="Seleccionar para acciones en bloque" aria-label="Seleccionar #${esc(e.name)}">
      <span class="tp-dot" data-tk="${esc(e.key)}"></span>
      <span class="tgl-main"><span class="tgl-name" data-tk="${esc(e.key)}">${depth ? `<span class="tp-pre">#${esc(parts.slice(0, -1).join('/'))}/</span>${esc(parts[parts.length - 1])}` : '#' + esc(e.name)}</span>${desc ? `<span class="tgl-desc">${esc(desc)}</span>` : ''}</span>
      <span class="tgl-kinds">${n ? tagKindsHtml(e.key) : '<span class="muted">sin uso</span>'}</span><span class="tgl-n">${n || ''}</span></div>`;
  }).join('');
}
function renderTagBulk() {
  const box = $('#tgBulk'); if (!box) return;
  [...tagChecked].forEach(k => { if (!tagIndex().has(k)) tagChecked.delete(k); });
  box.hidden = !tagChecked.size || tagMode !== 'list';
  box.innerHTML = tagChecked.size ? `<span class="grow"><b>${tagChecked.size}</b> seleccionada${tagChecked.size === 1 ? '' : 's'}</span>
    <button type="button" class="btn sm" data-tgb="color" title="Poner el mismo color a todas">🎨 Color</button>
    ${tagChecked.size > 1 ? '<button type="button" class="btn sm" data-tgb="merge" title="Unir todas en una sola etiqueta">🔀 Fusionar</button>' : ''}
    <button type="button" class="btn sm danger" data-tgb="del">🗑️ Eliminar</button>
    <button type="button" class="btn sm ghost" data-tgb="none" title="Quitar la selección">✕</button>` : '';
}
function renderTagView() {
  if (!$('#tgCloud')) return;
  const idx = tagIndex(), q = norm($('#tgSearch').value.trim().replace(/^#/, ''));
  let entries = [...idx.values()].filter(e => !q || e.key.includes(q) || norm((tagMetaOf(e.key) || {}).desc || '').includes(q));
  entries.sort(tagSort === 'az' ? (a, b) => a.key.localeCompare(b.key, 'es') : (a, b) => tagItemsOf(b.key).length - tagItemsOf(a.key).length || a.key.localeCompare(b.key, 'es'));
  const used = [...idx.values()].filter(e => e.count).length;
  $('#tgTotal').textContent = idx.size ? `${idx.size}` : '';
  $$('#tgMode button').forEach(b => b.classList.toggle('on', b.dataset.m === tagMode));
  $('#tgCloud').hidden = tagMode !== 'cloud'; $('#tgList').hidden = tagMode !== 'list';
  const none = `<div class="empty">${q ? 'Ninguna etiqueta coincide' : 'Todavía no hay etiquetas'}</div>`;
  if (tagMode === 'cloud') $('#tgCloud').innerHTML = tagCloudHtml(entries) || none;
  else $('#tgList').innerHTML = tagListHtml(entries, q) || none;
  renderTagBulk();
  if (tagSel && !idx.has(tagSel)) tagSel = null;
  const box = $('#tgDetail');
  if (!tagSel) {
    box.innerHTML = idx.size ? `<div class="empty"><div style="font-size:2.4rem">🏷️</div><p>Elige una etiqueta de la ${tagMode === 'cloud' ? 'nube' : 'lista'} para ver todo lo que la lleva y gestionarla.</p><p class="muted small">${idx.size} etiquetas · ${used} en uso · ${taggedItems().length} elementos etiquetados</p><button type="button" class="btn" data-tga="new">＋ Nueva etiqueta</button></div>`
      : `<div class="empty"><div style="font-size:2.4rem">🏷️</div><h3>Organiza por temas con etiquetas</h3><p class="muted">Crea una etiqueta aquí, ponla con el botón <b>＋ Etiqueta</b> de cualquier nota o tarea, o escribe <b>#proyecto</b> en el texto. Todo lo que la lleve aparecerá junto, sea de la sección que sea.</p><button type="button" class="btn primary" data-tga="new">＋ Nueva etiqueta</button></div>`;
    return;
  }
  const e = idx.get(tagSel), items = tagItemsOf(tagSel), meta = tagMetaOf(tagSel) || {};
  const children = [...idx.values()].filter(x => x.key.startsWith(tagSel + '/') && x.key.split('/').length === tagSel.split('/').length + 1);
  const parents = tagParents(tagSel).map(k => idx.get(k)).filter(Boolean);
  const co = new Map();
  items.forEach(it => new Set(it.tags.map(tagKey)).forEach(k => { if (k !== tagSel && !k.startsWith(tagSel + '/') && !tagSel.startsWith(k + '/')) co.set(k, (co.get(k) || 0) + 1); }));
  const related = [...co.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => idx.get(k) && tagChip(idx.get(k).name, ` <span class="muted">${n}</span>`)).filter(Boolean);
  const groups = Object.keys(TAG_KIND).map(kind => [kind, items.filter(it => it.kind === kind)]).filter(([, l]) => l.length);
  const src = tagColorSrc(tagSel);
  const rowAct = it => {
    if (it.kind === 'map') return '';
    if ((it.own || []).some(t => tagKey(t) === tagSel)) return `<button type="button" class="tf-x" data-rm="${it.kind}:${esc(it.id)}" title="Quitar #${esc(e.name)} de este elemento">×</button>`;
    if (it.tags.some(t => tagKey(t) === tagSel)) return '<span class="tg-inl" title="Está escrita en el texto: se quita editando el texto">✎</span>';
    return '';
  };
  box.innerHTML = `<div class="card-h"><h3 class="tg-title"><span class="tp-dot lg" data-tk="${esc(tagSel)}"></span>${parents.map(p => `<button type="button" class="crumb" data-tag="${esc(p.key)}">#${esc(p.name.split('/').pop())}</button><span class="muted"> / </span>`).join('')}<span class="tgl-name" data-tk="${esc(tagSel)}">#${esc(e.name.split('/').pop())}</span> <span class="badge">${items.length}</span></h3>
      <div class="row" style="gap:4px"><button class="btn sm" data-tga="rename" title="Cambiar el nombre en todas partes, o fusionarla con otra etiqueta">✏️ Renombrar / fusionar</button><button class="btn sm icon ghost" data-tga="graph" title="Ver en el grafo de conexiones">🕸️</button><button class="btn sm icon ghost danger" data-tga="delete" title="Eliminar la etiqueta">🗑️</button><button class="btn sm icon ghost" data-tga="close" title="Cerrar">✕</button></div></div>
    <textarea class="field tg-desc" id="tgDesc" rows="1" placeholder="Añade una descripción: para qué usas esta etiqueta…" maxlength="300">${esc(meta.desc || '')}</textarea>
    <div class="bl-row tg-colrow"><span class="bl-h" title="El color se usa en etiquetas, nube, filtros y grafo. Las subetiquetas lo heredan si no tienen uno propio.">Color</span>${tagPaletteHtml(tagSel)}<span class="muted small">${src.own ? '' : src.from ? 'heredado de #' + esc((idx.get(src.from) || { name: src.from }).name) : 'automático'}</span></div>
    <div class="row tg-acts">
      <button type="button" class="btn sm primary" data-tga="assign" title="Elegir notas, tareas, tarjetas, eventos o marcadores para ponerles (o quitarles) esta etiqueta">＋ Añadir a elementos…</button>
      <button type="button" class="btn sm" data-tga="newnote" title="Crear una nota que ya lleva esta etiqueta">📝 Nueva nota</button>
      <button type="button" class="btn sm" data-tga="newtodo" title="Crear una tarea que ya lleva esta etiqueta">☑️ Nueva tarea</button>
      <button type="button" class="btn sm ghost" data-tga="sub" title="Crear una etiqueta hija: #${esc(e.name)}/…">＋ Subetiqueta</button>
    </div>
    ${children.length ? `<div class="bl-row"><span class="bl-h">Subetiquetas</span><div class="chips">${children.map(c => tagChip(c.name, ` <span class="muted">${tagItemsOf(c.key).length}</span>`)).join('')}</div></div>` : ''}
    ${related.length ? `<div class="bl-row"><span class="bl-h" title="Etiquetas que aparecen en los mismos elementos">Suelen ir con</span><div class="chips">${related.join('')}</div></div>` : ''}
    ${groups.length ? groups.map(([kind, list]) => `<div class="tg-group"><h4>${TAG_KIND[kind][0]} ${TAG_KIND[kind][1]} <span class="muted small">${list.length}</span></h4><div class="list">${list.map(it => `<div class="list-item${it.done ? ' done' : ''}" data-open="${kind}:${esc(it.id)}" tabindex="0"><span class="grow" style="min-width:0"><span class="ellipsis" style="display:block">${it.done ? '✓ ' : ''}${tagHighlight(esc(it.label))}</span>${it.sub ? `<span class="muted small ellipsis" style="display:block">${esc(it.sub)}</span>` : ''}</span><span class="tg-its">${[...new Set(it.tags)].filter(t => tagKey(t) !== tagSel).slice(0, 3).map(t => `<span class="tg-mini" data-tag="${esc(tagKey(t))}">#${esc(t)}</span>`).join('')}</span>${rowAct(it)}</div>`).join('')}</div></div>`).join('')
      : `<div class="empty small" style="margin-top:14px">Todavía no la lleva ningún elemento. Pulsa <b>＋ Añadir a elementos…</b> o crea una nota o tarea con ella.</div>`}`;
  const d = $('#tgDesc'); if (d) { d.style.height = 'auto'; d.style.height = Math.max(38, d.scrollHeight) + 'px'; }
}
function tagOpenItem(kind, id) {
  if (kind === 'note') { showTab('notes'); openNote(id); }
  else if (kind === 'todo') { showTab('todos'); openTodo(id); }
  else if (kind === 'kanban') { showTab('kanban'); openTask(id); }
  else if (kind === 'event') { const ev = S.events.find(x => x.id === id); showTab('calendar'); if (ev) { calGoto(ev.date); openEvent(ev.id); } }
  else if (kind === 'bookmark') { showTab('bookmarks'); openBookmark(id); }
  else if (kind === 'map') { mmOpenMap(id, false); mapsMode = 'mind'; store.set('mapsMode', 'mind'); showTab('maps'); }
}

/* ---------- Acciones de gestión ---------- */
const tagNameOf = key => (tagIndex().get(key) || { name: (tagMetaOf(key) || {}).name || key }).name;
/** Quita la etiqueta del campo de un elemento (no toca el texto). */
function tagRemoveFrom(kind, id, key) {
  const src = TAG_SRC[kind]; if (!src) return;
  const o = src.list().find(x => x.id === id); if (!o || !o.tags) return;
  o.tags = o.tags.filter(t => tagKey(t) !== key);
  if (!o.tags.length && kind !== 'kanban') delete o.tags;
  if (kind === 'note') o.updated = Date.now();
  src.save();
}
function tagAddTo(kind, id, name) {
  const src = TAG_SRC[kind]; if (!src) return;
  const o = src.list().find(x => x.id === id); if (!o) return;
  o.tags = tagUniq((o.tags || []).concat([name]));
  if (kind === 'note') o.updated = Date.now();
  src.save();
}
async function tagCreateDialog(prefix = '') {
  let col = 'auto';
  const r = await modal({
    title: '🏷️ Nueva etiqueta',
    body: `<div><label class="lbl">Nombre</label><input class="field" name="v" value="${esc(prefix)}" placeholder="proyecto, cliente-acme, proyecto/portal…" spellcheck="false" data-autofocus></div>
      <div class="small muted" id="ntInfo" style="min-height:1.3em;margin-top:4px">Sin espacios. Usa «/» para crear niveles: <code>proyecto/portal</code>.</div>
      <div><label class="lbl">Color</label><div class="tp-pal" id="ntPal"><button type="button" class="tp-sw auto on" data-c="auto" title="Automático">A</button>${TAG_PALETTE.map(p => `<button type="button" class="tp-sw" data-c="${p.id}" style="--h:${p.h};--s:${p.s}" title="${p.name}"></button>`).join('')}</div></div>
      <div><label class="lbl">Descripción (opcional)</label><input class="field" name="desc" maxlength="300" placeholder="Para qué la vas a usar"></div>`,
    actions: [{ label: 'Cancelar', value: null, cls: 'ghost' }, { label: 'Crear', value: 'ok', cls: 'primary', validate: f => TAG_NAME_OK.test(tagCleanName(f.elements.namedItem('v').value)) ? null : 'Escribe un nombre que empiece por una letra (letras, números, «-», «_» o «/»)' }],
    onOpen: f => {
      const i = f.elements.namedItem('v'), info = $('#ntInfo', f);
      i.addEventListener('input', () => { const n = tagCleanName(i.value), ex = n && tagIndex().get(tagKey(n)); info.innerHTML = ex ? `Ya existe <b>#${esc(ex.name)}</b>: al crear se abrirá esa.` : n && n !== i.value.trim().replace(/^#/, '') ? `Se guardará como <b>#${esc(n)}</b>` : 'Sin espacios. Usa «/» para crear niveles: <code>proyecto/portal</code>.'; });
      $('#ntPal', f).addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (!b) return; col = b.dataset.c; $$('#ntPal .tp-sw', f).forEach(x => x.classList.toggle('on', x === b)); });
      setTimeout(() => { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 0);
    }
  });
  if (!r) return null;
  const name = tagCleanName(r.data.v), key = tagKey(name);
  const ex = tagIndex().get(key);
  S.tagMeta = S.tagMeta || {};
  if (!ex) S.tagMeta[key] = Object.assign({}, S.tagMeta[key], { name, created: Date.now() });
  if (col !== 'auto') S.tagMeta[key] = Object.assign({}, S.tagMeta[key], { color: col });
  if (r.data.desc.trim()) S.tagMeta[key] = Object.assign({}, S.tagMeta[key], { desc: r.data.desc.trim() });
  save.tagMeta(); tagIdxCache = null;
  toast(ex ? `#${ex.name} ya existía` : `Etiqueta #${name} creada`, ex ? 'info' : 'success', 2500);
  openTagView(key);
  return key;
}
async function tagDeleteDialog(keys) {
  keys = keys.filter(k => tagIndex().has(k)); if (!keys.length) return;
  const names = keys.map(k => '#' + tagNameOf(k));
  const total = new Set(keys.flatMap(k => tagItemsOf(k).map(it => it.kind + ':' + it.id))).size;
  const hasSubs = keys.some(k => [...tagIndex().keys()].some(x => x.startsWith(k + '/')));
  const r = await modal({
    title: `🗑️ Eliminar ${keys.length === 1 ? names[0] : keys.length + ' etiquetas'}`,
    body: `<p>${keys.length > 1 ? `<b>${esc(names.join(', '))}</b><br>` : ''}Se quitará${keys.length > 1 ? 'n' : ''} de <b>${total}</b> elemento${total === 1 ? '' : 's'}. Donde esté escrita en un texto, se quita solo la almohadilla: <code>#reunion</code> pasa a <code>reunion</code>; no se borra ningún texto.</p>
      ${hasSubs ? '<label class="check-row"><input type="checkbox" class="check" name="subs" checked> Eliminar también sus subetiquetas</label>' : ''}
      <p class="hint">Antes se guarda una versión en el historial, por si quieres deshacerlo.</p>`,
    actions: [{ label: 'Cancelar', value: null, cls: 'ghost' }, { label: 'Eliminar', value: 'ok', cls: 'danger-solid' }]
  });
  if (!r) return;
  await histSnapshot('before', `Antes de eliminar ${names.join(', ')}`, { force: true });
  let n = 0; keys.forEach(k => { n += tagDelete(k, !hasSubs || !!r.data.subs); tagChecked.delete(k); });
  if (keys.includes(tagSel)) tagSel = null;
  toast(`${names.join(', ')}: eliminada${keys.length > 1 ? 's' : ''} (${n} cambio${n === 1 ? '' : 's'})`, 'success', 4000);
  renderTagView();
}
async function tagMergeDialog(keys) {
  keys = keys.filter(k => tagIndex().has(k)); if (keys.length < 2) return;
  const sorted = keys.slice().sort((a, b) => tagItemsOf(b).length - tagItemsOf(a).length);
  const r = await modal({
    title: `🔀 Fusionar ${keys.length} etiquetas`,
    body: `<p class="small">Todas pasarán a llamarse igual en todas las secciones (también dentro de los textos). Antes se guarda una versión en el historial.</p>
      <div><label class="lbl">Quedarán como</label><select class="field" name="to">${sorted.map(k => `<option value="${esc(tagNameOf(k))}">#${esc(tagNameOf(k))} (${tagItemsOf(k).length})</option>`).join('')}<option value="">Otro nombre…</option></select></div>
      <div id="mgOther" hidden><label class="lbl">Nuevo nombre</label><input class="field" name="other" spellcheck="false"></div>`,
    actions: [{ label: 'Cancelar', value: null, cls: 'ghost' }, { label: 'Fusionar', value: 'ok', cls: 'primary', validate: f => { const v = f.elements.namedItem('to').value || tagCleanName(f.elements.namedItem('other').value); return TAG_NAME_OK.test(v) ? null : 'Escribe un nombre válido'; } }],
    onOpen: f => { const s = f.elements.namedItem('to'); s.addEventListener('change', () => { $('#mgOther', f).hidden = !!s.value; if (!s.value) f.elements.namedItem('other').focus(); }); }
  });
  if (!r) return;
  const target = r.data.to || tagCleanName(r.data.other);
  await histSnapshot('before', `Antes de fusionar ${keys.map(k => '#' + tagNameOf(k)).join(', ')} en #${target}`, { force: true });
  let n = 0;
  keys.forEach(k => { if (tagIndex().has(k) && (k !== tagKey(target) || tagNameOf(k) !== target)) n += tagRename(k, target); });
  tagChecked.clear();
  toast(`Fusionadas en #${target} (${n} cambio${n === 1 ? '' : 's'})`, 'success', 4000);
  openTagView(tagKey(target));
}
async function tagBulkColor(keys) {
  let col = null;
  const r = await modal({
    title: `🎨 Color para ${keys.length} etiqueta${keys.length === 1 ? '' : 's'}`,
    body: `<div class="tp-pal" id="bcPal"><button type="button" class="tp-sw auto" data-c="auto" title="Automático">A</button>${TAG_PALETTE.map(p => `<button type="button" class="tp-sw" data-c="${p.id}" style="--h:${p.h};--s:${p.s}" title="${p.name}"></button>`).join('')}</div>`,
    actions: [{ label: 'Cancelar', value: null, cls: 'ghost' }, { label: 'Aplicar', value: 'ok', cls: 'primary', validate: () => col ? null : 'Elige un color' }],
    onOpen: f => $('#bcPal', f).addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (!b) return; col = b.dataset.c; $$('#bcPal .tp-sw', f).forEach(x => x.classList.toggle('on', x === b)); })
  });
  if (!r) return;
  keys.forEach(k => tagMetaSet(k, 'color', col));
  tagStyleRefresh(); renderTagView();
}
/** Ventana para poner o quitar la etiqueta a muchos elementos a la vez. */
async function tagAssignDialog(key) {
  const name = tagNameOf(key);
  const all = [];
  Object.entries(TAG_SRC).forEach(([kind, src]) => src.list().forEach(o => {
    const tags = src.tags(o), own = (o.tags || []).some(t => tagKey(t) === key), inl = !own && tags.some(t => tagKey(t) === key);
    all.push({ kind, id: o.id, label: src.label(o) || '(sin título)', sub: src.sub(o) || '', own, inl, done: kind === 'todo' ? !!o.done : kind === 'kanban' ? o.col === 'done' : false });
  }));
  all.sort((a, b) => (b.own || b.inl) - (a.own || a.inl) || a.done - b.done);
  const want = new Map(all.map(it => [it.kind + ':' + it.id, it.own]));
  let kindF = '';
  const r = await modal({
    title: `🏷️ #${name}: añadir a elementos`, wide: true,
    body: `<div class="row" style="flex-wrap:nowrap"><input class="field" id="asQ" placeholder="🔍 Buscar por título…" data-noenter data-autofocus>
        <select class="field" id="asK" style="max-width:170px"><option value="">Todas las secciones</option>${Object.keys(TAG_SRC).map(k => `<option value="${k}">${TAG_KIND[k][0]} ${TAG_KIND[k][1]}</option>`).join('')}</select></div>
      <div class="muted small" id="asInfo" style="margin:6px 0"></div>
      <div class="as-list" id="asList"></div>`,
    actions: [{ label: 'Cancelar', value: null, cls: 'ghost' }, { label: 'Guardar', value: 'ok', cls: 'primary' }],
    onOpen: f => {
      const q = $('#asQ', f), list = $('#asList', f);
      const draw = () => {
        const nq = norm(q.value.trim());
        const hits = all.filter(it => (!kindF || it.kind === kindF) && (!nq || norm(it.label + ' ' + it.sub).includes(nq)));
        const on = [...want.values()].filter(Boolean).length;
        $('#asInfo', f).textContent = `${on} con la etiqueta puesta · ${hits.length} elemento${hits.length === 1 ? '' : 's'}${hits.length > 300 ? ' (se muestran 300: busca para afinar)' : ''}`;
        list.innerHTML = hits.slice(0, 300).map(it => `<label class="as-row${it.done ? ' done' : ''}${it.inl ? ' locked' : ''}" title="${it.inl ? 'Está escrita en el texto: ya la lleva' : ''}"><input type="checkbox" class="check" data-as="${it.kind}:${esc(it.id)}"${want.get(it.kind + ':' + it.id) || it.inl ? ' checked' : ''}${it.inl ? ' disabled' : ''}><span>${TAG_KIND[it.kind][0]}</span><span class="grow" style="min-width:0"><span class="ellipsis" style="display:block">${esc(it.label)}</span>${it.sub ? `<span class="muted small ellipsis" style="display:block">${esc(it.sub)}</span>` : ''}</span></label>`).join('') || '<div class="empty small">Nada coincide</div>';
      };
      q.addEventListener('input', debounce(draw, 120));
      $('#asK', f).addEventListener('change', e => { kindF = e.target.value; draw(); });
      list.addEventListener('change', e => { const c = e.target.closest('[data-as]'); if (c) { want.set(c.dataset.as, c.checked); const on = [...want.values()].filter(Boolean).length; $('#asInfo', f).textContent = $('#asInfo', f).textContent.replace(/^\d+/, on); } });
      draw();
    }
  });
  if (!r) return;
  let add = 0, rm = 0;
  all.forEach(it => { const w = want.get(it.kind + ':' + it.id); if (w && !it.own) { tagAddTo(it.kind, it.id, name); add++; } else if (!w && it.own) { tagRemoveFrom(it.kind, it.id, key); rm++; } });
  tagIdxCache = null;
  if (add || rm) toast(`#${name}: ${add ? `añadida a ${add}` : ''}${add && rm ? ', ' : ''}${rm ? `quitada de ${rm}` : ''}`, 'success', 3000);
  renderTagView();
}

/* ---------- Eventos de la sección ---------- */
const tagShowDetail = () => { if (tagSel && innerWidth < 900) $('#tgDetail').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
$('#tgCloud').addEventListener('click', e => {
  const b = e.target.closest('[data-tag]'); if (!b) return;
  tagSel = b.dataset.tag === tagSel ? null : b.dataset.tag;
  renderTagView(); tagShowDetail();
});
$('#tgList').addEventListener('click', e => {
  const row = e.target.closest('.tgl-row'); if (!row) return;
  const k = row.dataset.k;
  if (e.target.closest('[data-chk]')) { if (e.target.checked) tagChecked.add(k); else tagChecked.delete(k); renderTagBulk(); return; }
  tagSel = k; renderTagView(); tagShowDetail();
});
$('#tgList').addEventListener('keydown', e => {
  const row = e.target.closest('.tgl-row'); if (!row || e.target.closest('[data-chk]')) return;
  if (e.key === 'Enter') { tagSel = row.dataset.k; renderTagView(); $(`#tgList .tgl-row[data-k="${CSS.escape(tagSel)}"]`)?.focus(); }
  else if (e.key === ' ') { e.preventDefault(); const k = row.dataset.k; if (tagChecked.has(k)) tagChecked.delete(k); else tagChecked.add(k); renderTagView(); $(`#tgList .tgl-row[data-k="${CSS.escape(k)}"]`)?.focus(); }
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const sib = e.key === 'ArrowDown' ? row.nextElementSibling : row.previousElementSibling; if (sib) sib.focus(); }
});
$('#tgBulk').addEventListener('click', e => {
  const b = e.target.closest('[data-tgb]'); if (!b) return;
  const keys = [...tagChecked];
  if (b.dataset.tgb === 'none') { tagChecked.clear(); renderTagView(); }
  else if (b.dataset.tgb === 'del') tagDeleteDialog(keys);
  else if (b.dataset.tgb === 'merge') tagMergeDialog(keys);
  else if (b.dataset.tgb === 'color') tagBulkColor(keys);
});
$('#tgMode').addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (!b) return; tagMode = b.dataset.m; renderTagView(); });
$('#tgNew').addEventListener('click', () => tagCreateDialog());
$('#tgDetail').addEventListener('click', async e => {
  const sw = e.target.closest('[data-col]');
  if (sw && sw.closest('[data-palkey]')) { tagSetColor(sw.closest('[data-palkey]').dataset.palkey, sw.dataset.col); return; }
  const rm = e.target.closest('[data-rm]');
  if (rm) { const [k, id] = rm.dataset.rm.split(':'); tagRemoveFrom(k, id, tagSel); tagIdxCache = null; renderTagView(); return; }
  const a = e.target.closest('[data-tga]');
  if (a) {
    const act = a.dataset.tga, key = tagSel;
    if (act === 'close') { tagSel = null; renderTagView(); }
    else if (act === 'new') tagCreateDialog();
    else if (act === 'rename') tagRenameDialog(key);
    else if (act === 'delete') tagDeleteDialog([key]);
    else if (act === 'assign') tagAssignDialog(key);
    else if (act === 'sub') tagCreateDialog(tagNameOf(key) + '/');
    else if (act === 'newnote') { const n = createNote('Nota sin título', '', false); n.tags = [tagNameOf(key)]; save.notes(); showTab('notes'); openNote(n.id); setTimeout(() => { const t = $('#noteTitle'); t.focus(); t.select(); }, 60); }
    else if (act === 'newtodo') {
      const txt = await askText(`☑️ Nueva tarea con #${tagNameOf(key)}`, 'Tarea', '', 'Por ejemplo: Revisar el informe mañana');
      const t = txt && addTodoFromText(txt, 'inbox');
      if (t) { t.tags = tagUniq((t.tags || []).concat([tagNameOf(key)])); save.todos(); tagIdxCache = null; renderTagView(); toast('Tarea creada en «' + ((S.todoLists.find(l => l.id === t.listId) || {}).name || 'Tareas') + '»', 'success', 2500); }
    }
    else if (act === 'graph') { $('#grTags').checked = true; openGraph(null); setTimeout(() => { if (grById.has('g:' + key)) { grSetFocus('g:' + key, 1); } }, 80); }
    return;
  }
  const o = e.target.closest('[data-open]'); if (o && !e.target.closest('[data-tag]') && !e.target.closest('.tg-inl')) { const [k, id] = o.dataset.open.split(':'); tagOpenItem(k, id); }
});
$('#tgDetail').addEventListener('change', e => { if (e.target.id === 'tgDesc' && tagSel) tagMetaSet(tagSel, 'desc', e.target.value.trim()); });
$('#tgDetail').addEventListener('input', e => { if (e.target.id === 'tgDesc') { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; } });
$('#tgDetail').addEventListener('keydown', e => {
  if (e.target.id === 'tgDesc' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.target.blur(); return; }
  if (e.key === 'Enter') { const o = e.target.closest('[data-open]'); if (o && e.target === o) { const [k, id] = o.dataset.open.split(':'); tagOpenItem(k, id); } }
});
$('#tgSearch').addEventListener('input', debounce(renderTagView, 120));
$('#tgSort').addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (!b) return; tagSort = b.dataset.s; $$('#tgSort button').forEach(x => x.classList.toggle('on', x === b)); renderTagView(); });
onShow.tags = renderTagView;

/* ---------- Mini nube en Inicio ---------- */
function renderDashTags() {
  const box = $('#dashTags'); if (!box) return;
  const idx = tagIndex();
  const entries = [...idx.values()].filter(e => !e.implicit && e.count).sort((a, b) => b.count - a.count).slice(0, 24);
  box.innerHTML = entries.length ? `<div class="tag-cloud small">${tagCloudHtml(entries, { small: true })}</div>` : '<div class="empty small">Escribe <b>#etiqueta</b> en notas o tareas para agruparlas por tema.</div>';
}
