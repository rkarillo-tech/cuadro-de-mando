/* =====================================================================
   VISTA DE ETIQUETAS · NUBE · INTEGRACIONES
   ===================================================================== */
let tagSel = null, tagSort = 'count';
const TAG_KIND = { note: ['📝', 'Notas'], todo: ['☑️', 'Tareas'], kanban: ['📋', 'Kanban'], event: ['📅', 'Calendario'], bookmark: ['🔖', 'Marcadores'], map: ['🧠', 'Mapas mentales'] };
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
    return `<button type="button" class="cloud-tag${e.key === tagSel ? ' on' : ''}" data-tag="${esc(e.key)}" style="font-size:${size.toFixed(2)}rem;--w:${(0.62 + w * 0.38).toFixed(2)}" title="${n} elemento${n === 1 ? '' : 's'}">#${esc(e.name)}<sup>${n}</sup></button>`;
  }).join('');
}
function renderTagView() {
  if (!$('#tgCloud')) return;
  const idx = tagIndex(), q = norm($('#tgSearch').value.trim().replace(/^#/, ''));
  let entries = [...idx.values()].filter(e => !q || e.key.includes(q));
  entries.sort(tagSort === 'az' ? (a, b) => a.key.localeCompare(b.key, 'es') : (a, b) => tagItemsOf(b.key).length - tagItemsOf(a.key).length || a.key.localeCompare(b.key, 'es'));
  $('#tgCloud').innerHTML = tagCloudHtml(entries) || `<div class="empty">${q ? 'Ninguna etiqueta coincide' : 'Todavía no hay etiquetas'}</div>`;
  if (tagSel && !idx.has(tagSel)) tagSel = null;
  if (!tagSel && entries.length && !q) tagSel = null;
  const box = $('#tgDetail');
  if (!tagSel) {
    box.innerHTML = idx.size ? `<div class="empty"><div style="font-size:2.4rem">🏷️</div><p>Elige una etiqueta de la nube para ver todo lo que la lleva.</p><p class="muted small">${idx.size} etiquetas · ${taggedItems().length} elementos etiquetados</p></div>`
      : `<div class="empty"><div style="font-size:2.4rem">🏷️</div><h3>Organiza por temas con etiquetas</h3><p class="muted">Escribe <b>#proyecto</b>, <b>#cliente-acme</b> o <b>#urgente</b> en una nota o en una tarea y aparecerá aquí, junto con todo lo que comparta esa etiqueta, sea de la sección que sea.</p></div>`;
    return;
  }
  const e = idx.get(tagSel), items = tagItemsOf(tagSel);
  const children = [...idx.values()].filter(x => x.key.startsWith(tagSel + '/') && x.key.split('/').length === tagSel.split('/').length + 1);
  const parents = tagParents(tagSel).map(k => idx.get(k)).filter(Boolean);
  // etiquetas que aparecen junto a esta
  const co = new Map();
  items.forEach(it => new Set(it.tags.map(tagKey)).forEach(k => { if (k !== tagSel && !k.startsWith(tagSel + '/') && !tagSel.startsWith(k + '/')) co.set(k, (co.get(k) || 0) + 1); }));
  const related = [...co.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => idx.get(k) && tagChip(idx.get(k).name, ` <span class="muted">${n}</span>`)).filter(Boolean);
  const groups = Object.keys(TAG_KIND).map(kind => [kind, items.filter(it => it.kind === kind)]).filter(([, l]) => l.length);
  box.innerHTML = `<div class="card-h"><h3 class="tg-title">${parents.map(p => `<button type="button" class="crumb" data-tag="${esc(p.key)}">#${esc(p.name.split('/').pop())}</button><span class="muted"> / </span>`).join('')}#${esc(e.name.split('/').pop())} <span class="badge accent">${items.length}</span></h3>
      <div class="row" style="gap:4px"><button class="btn sm" data-tga="rename" title="Renombrar o fusionar con otra etiqueta">✏️ Renombrar / fusionar</button><button class="btn sm ghost" data-tga="graph" title="Ver en el grafo de conexiones">🕸️</button><button class="btn sm icon ghost" data-tga="close" title="Cerrar">✕</button></div></div>
    <div class="bl-row tg-colrow"><span class="bl-h" title="El color se usa en etiquetas, nube, filtros y grafo. Las subetiquetas lo heredan si no tienen uno propio.">Color</span>${tagPaletteHtml(tagSel)}<span class="muted small">${(() => { const src = tagColorSrc(tagSel); return src.own ? '' : src.from ? 'heredado de #' + esc((idx.get(src.from) || { name: src.from }).name) : 'automático'; })()}</span></div>
    ${children.length ? `<div class="bl-row"><span class="bl-h">Subetiquetas</span><div class="chips">${children.map(c => tagChip(c.name.split('/').slice(tagSel.split('/').length).join('/') ? c.name : c.name, ` <span class="muted">${tagItemsOf(c.key).length}</span>`)).join('')}</div></div>` : ''}
    ${related.length ? `<div class="bl-row"><span class="bl-h" title="Etiquetas que aparecen en los mismos elementos">Suelen ir con</span><div class="chips">${related.join('')}</div></div>` : ''}
    ${groups.map(([kind, list]) => `<div class="tg-group"><h4>${TAG_KIND[kind][0]} ${TAG_KIND[kind][1]} <span class="muted small">${list.length}</span></h4><div class="list">${list.map(it => `<div class="list-item${it.done ? ' done' : ''}" data-open="${kind}:${esc(it.id)}" tabindex="0"><span class="grow" style="min-width:0"><span class="ellipsis" style="display:block">${it.done ? '✓ ' : ''}${tagHighlight(esc(it.label))}</span>${it.sub ? `<span class="muted small ellipsis" style="display:block">${esc(it.sub)}</span>` : ''}</span><span class="tg-its">${[...new Set(it.tags)].filter(t => tagKey(t) !== tagSel).slice(0, 3).map(t => `<span class="tg-mini" data-tag="${esc(tagKey(t))}">#${esc(t)}</span>`).join('')}</span></div>`).join('')}</div></div>`).join('')}`;
}
function tagOpenItem(kind, id) {
  if (kind === 'note') { showTab('notes'); openNote(id); }
  else if (kind === 'todo') { showTab('todos'); openTodo(id); }
  else if (kind === 'kanban') { showTab('kanban'); openTask(id); }
  else if (kind === 'event') { const ev = S.events.find(x => x.id === id); showTab('calendar'); if (ev) { calGoto(ev.date); openEvent(ev.id); } }
  else if (kind === 'bookmark') { showTab('bookmarks'); openBookmark(id); }
  else if (kind === 'map') { mmOpenMap(id, false); mapsMode = 'mind'; store.set('mapsMode', 'mind'); showTab('maps'); }
}
$('#tgDetail').addEventListener('click', e => {
  const sw = e.target.closest('[data-col]');
  if (sw && sw.closest('[data-palkey]')) { tagSetColor(sw.closest('[data-palkey]').dataset.palkey, sw.dataset.col); return; }
  const a = e.target.closest('[data-tga]');
  if (a) {
    if (a.dataset.tga === 'close') { tagSel = null; renderTagView(); }
    else if (a.dataset.tga === 'rename') tagRenameDialog(tagSel);
    else if (a.dataset.tga === 'graph') { $('#grTags').checked = true; openGraph(null); setTimeout(() => { if (grById.has('g:' + tagSel)) { grSetFocus('g:' + tagSel, 1); } }, 80); }
    return;
  }
  const o = e.target.closest('[data-open]'); if (o && !e.target.closest('[data-tag]')) { const [k, id] = o.dataset.open.split(':'); tagOpenItem(k, id); }
});
$('#tgDetail').addEventListener('keydown', e => { if (e.key === 'Enter') { const o = e.target.closest('[data-open]'); if (o) { const [k, id] = o.dataset.open.split(':'); tagOpenItem(k, id); } } });
$('#tgSearch').addEventListener('input', debounce(renderTagView, 120));
$('#tgSort').addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (!b) return; tagSort = b.dataset.s; $$('#tgSort button').forEach(x => x.classList.toggle('on', x === b)); renderTagView(); });
onShow.tags = renderTagView;

/* ---------- Mini nube en Inicio ---------- */
function renderDashTags() {
  const box = $('#dashTags'); if (!box) return;
  const idx = tagIndex();
  const entries = [...idx.values()].filter(e => !e.implicit).sort((a, b) => b.count - a.count).slice(0, 24);
  box.innerHTML = entries.length ? `<div class="tag-cloud small">${tagCloudHtml(entries, { small: true })}</div>` : '<div class="empty small">Escribe <b>#etiqueta</b> en notas o tareas para agruparlas por tema.</div>';
}
