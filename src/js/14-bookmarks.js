/* =====================================================================
   MARCADORES
   ===================================================================== */
let bmCat = '';
const bmCatOf = b => (b.category || '').trim() || 'General';
function bmDomain(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } }
function normalizeUrl(u) {
  u = String(u || '').trim();
  if (!u) return '';
  if (/^\s*(javascript|data|vbscript):/i.test(u)) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
  return u;
}
function bmCardHtml(b) {
  const dom = bmDomain(b.url);
  const letter = (b.title || dom || '?').replace(/^[^\p{L}\p{N}]+/u, '').charAt(0) || '🔖';
  return `<a class="bm-card" href="${esc(b.url)}" target="_blank" rel="noopener noreferrer" data-id="${esc(b.id)}" title="${esc(b.url)}${b.notes ? '\n' + esc(b.notes) : ''}">
    <span class="bm-avatar" style="background:${hashColor(dom)}">${esc(letter)}</span>
    <span class="grow" style="min-width:0"><span class="ellipsis" style="display:block;font-weight:650">${esc(b.title)}</span><span class="muted small ellipsis" style="display:block">${esc(dom)}${b.visits ? ` · ${b.visits} ${b.visits === 1 ? 'visita' : 'visitas'}` : ''}</span>${tagPills(b.tags || [], 3)}</span>
    <span class="acts"><button class="btn icon sm ghost" data-bm="edit" title="Editar">✏️</button><button class="btn icon sm ghost" data-bm="del" title="Eliminar">🗑️</button></span>
  </a>`;
}
function renderBookmarks() {
  if (!$('#bmList')) return;
  const q = norm($('#bmSearch').value.trim()), sort = $('#bmSort').value;
  const cats = [...new Set(S.bookmarks.map(bmCatOf))].sort((a, b) => a.localeCompare(b, 'es'));
  if (bmCat && !cats.includes(bmCat)) bmCat = '';
  $('#bmCats').innerHTML = S.bookmarks.length ? [`<span class="chip${!bmCat ? ' on' : ''}" data-cat="">Todas · ${S.bookmarks.length}</span>`].concat(cats.map(c => `<span class="chip${bmCat === c ? ' on' : ''}" data-cat="${esc(c)}">${esc(c)} · ${S.bookmarks.filter(b => bmCatOf(b) === c).length}</span>`)).join('') : '';
  renderTagFilter('bookmarks');
  const tf = tagFilters.bookmarks;
  const list = S.bookmarks.filter(b => (!bmCat || bmCatOf(b) === bmCat) && (!tf || tagMatch(bmTags(b), tf)) && (!q || norm(`${b.title} ${b.url} ${b.category || ''} ${b.notes || ''}`).includes(q)));
  if (!S.bookmarks.length) {
    $('#bmList').innerHTML = '<div class="card empty-state"><div style="font-size:2.4rem">🔖</div><h3>Aún no tienes marcadores</h3><p class="muted">Guarda tus webs frecuentes o importa los marcadores de tu navegador (menú ⋯ → Importar).</p><button class="btn primary" id="bmEmptyNew">＋ Añadir marcador</button></div>';
    $('#bmEmptyNew').onclick = () => openBookmark(null);
    return;
  }
  if (!list.length) { $('#bmList').innerHTML = `<div class="card empty">Sin resultados${tagFilterEmpty('bookmarks')}</div>`; return; }
  let html = '';
  if (sort === 'cat') {
    cats.filter(c => list.some(b => bmCatOf(b) === c)).forEach(c => {
      html += `<h4 class="section-h">${esc(c)}</h4><div class="bm-grid">${list.filter(b => bmCatOf(b) === c).sort((a, b) => a.title.localeCompare(b.title, 'es')).map(bmCardHtml).join('')}</div>`;
    });
  } else {
    const sorted = [...list].sort(sort === 'used' ? (a, b) => (b.visits || 0) - (a.visits || 0) || a.title.localeCompare(b.title, 'es') : sort === 'new' ? (a, b) => b.created - a.created : (a, b) => a.title.localeCompare(b.title, 'es'));
    html = `<div class="bm-grid">${sorted.map(bmCardHtml).join('')}</div>`;
  }
  $('#bmList').innerHTML = html;
}
onShow.bookmarks = renderBookmarks;

async function openBookmark(id, preset = {}) {
  const ex = id ? S.bookmarks.find(b => b.id === id) : null;
  if (id && !ex) return;
  const b = ex ? clone(ex) : { id: uid(), title: '', url: preset.url || '', category: bmCat || '', notes: '', created: Date.now(), visits: 0 };
  const cats = [...new Set(S.bookmarks.map(bmCatOf))];
  const r = await modal({
    title: ex ? '✏️ Editar marcador' : '🔖 Nuevo marcador',
    body: `<div><label class="lbl">Dirección (URL)</label><input class="field" type="text" name="url" value="${esc(b.url)}" placeholder="https://…"></div>
      <div><label class="lbl">Nombre</label><input class="field" type="text" name="title" value="${esc(b.title)}" placeholder="Si lo dejas vacío, se usa el dominio" maxlength="120"></div>
      <div><label class="lbl">Categoría</label><input class="field" type="text" name="category" value="${esc(b.category || '')}" list="bmCatList" placeholder="Trabajo, Herramientas, Lectura…" maxlength="40"><datalist id="bmCatList">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
      <div><label class="lbl">Notas</label><input class="field" type="text" name="notes" value="${esc(b.notes || '')}" maxlength="300"></div>
      ${tagFieldHtml('tags', b.tags || [], { src: 'title,notes' })}`,
    onOpen: form => tagFieldInit(form),
    actions: [
      ...(ex ? [{ label: '🗑️ Eliminar', value: 'delete', cls: 'danger left' }] : []),
      { label: 'Cancelar', value: null, cls: 'ghost' },
      { label: 'Guardar', value: 'ok', cls: 'primary', validate: f => normalizeUrl(f.elements.namedItem('url').value) ? null : 'Escribe una dirección válida' }
    ]
  });
  if (!r) return;
  if (r.action === 'delete') { deleteBookmark(ex.id); return; }
  const url = normalizeUrl(r.data.url);
  Object.assign(b, { url, title: r.data.title.trim() || bmDomain(url), category: r.data.category.trim(), notes: r.data.notes.trim(), tags: tagsFromField(r.data.tags) });
  if (!b.tags.length) delete b.tags;
  if (ex) Object.assign(ex, b); else S.bookmarks.push(b);
  save.bookmarks(); renderBookmarks();
}
function deleteBookmark(id) {
  const i = S.bookmarks.findIndex(b => b.id === id); if (i < 0) return;
  const [b] = S.bookmarks.splice(i, 1); save.bookmarks(); renderBookmarks();
  toast(`«${b.title}» eliminado`, 'info', 6000, { label: 'Deshacer', fn: () => { S.bookmarks.splice(i, 0, b); save.bookmarks(); renderBookmarks(); } });
}
function countVisit(b) { b.visits = (b.visits || 0) + 1; b.lastVisit = Date.now(); save.bookmarks(); }
function openBookmarkUrl(id) {
  const b = S.bookmarks.find(x => x.id === id); if (!b) return;
  countVisit(b);
  window.open(b.url, '_blank', 'noopener,noreferrer');
}

/* ---------- Importar / exportar (formato de marcadores de navegador) ---------- */
function importBookmarksHtml(text) {
  const doc = new DOMParser().parseFromString(text, 'text/html');
  const have = new Set(S.bookmarks.map(b => b.url));
  let added = 0, skipped = 0;
  $$('a[href]', doc).forEach(a => {
    const url = a.getAttribute('href') || '';
    if (!/^https?:\/\//i.test(url)) { skipped++; return; }
    if (have.has(url)) { skipped++; return; }
    let dl = a.closest('dl'), h3 = dl && dl.previousElementSibling;
    while (h3 && h3.tagName !== 'H3') h3 = h3.previousElementSibling;
    const cat = (h3 && h3.textContent.trim()) || 'Importados';
    const add = +(a.getAttribute('add_date') || 0);
    S.bookmarks.push({ id: uid(), title: (a.textContent.trim() || bmDomain(url)).slice(0, 120), url, category: /^(barra de marcadores|bookmarks bar|marcadores|bookmarks|favoritos)$/i.test(cat) ? 'Importados' : cat.slice(0, 40), notes: '', created: add ? add * 1000 : Date.now(), visits: 0 });
    have.add(url); added++;
  });
  save.bookmarks(); renderBookmarks();
  toast(added ? `${added} marcador(es) importado(s)${skipped ? ` · ${skipped} omitidos (repetidos o no web)` : ''}` : 'No se encontraron marcadores nuevos', added ? 'success' : 'warning', 4500);
}
function exportBookmarksHtml() {
  const cats = [...new Set(S.bookmarks.map(bmCatOf))];
  const out = ['<!DOCTYPE NETSCAPE-Bookmark-file-1>', '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">', '<TITLE>Bookmarks</TITLE>', '<H1>Bookmarks</H1>', '<DL><p>'];
  cats.forEach(c => {
    out.push(`  <DT><H3>${esc(c)}</H3>`, '  <DL><p>');
    S.bookmarks.filter(b => bmCatOf(b) === c).forEach(b => out.push(`    <DT><A HREF="${esc(b.url)}" ADD_DATE="${Math.floor(b.created / 1000)}">${esc(b.title)}</A>`));
    out.push('  </DL><p>');
  });
  out.push('</DL><p>');
  download(`marcadores_${todayKey()}.html`, out.join('\n'), 'text/html;charset=utf-8');
}

$('#bmNew').addEventListener('click', () => openBookmark(null));
$('#bmSearch').addEventListener('input', debounce(renderBookmarks, 120));
$('#bmSort').addEventListener('change', () => { store.set('bmSort', $('#bmSort').value); renderBookmarks(); });
$('#bmCats').addEventListener('click', e => { const c = e.target.closest('[data-cat]'); if (c) { bmCat = c.dataset.cat; renderBookmarks(); } });
$('#bmMenuBtn').addEventListener('click', e => showMenu(e.currentTarget, [
  { icon: '⬆️', label: 'Importar marcadores del navegador (.html)', fn: () => $('#bmImportFile').click() },
  { icon: '⬇️', label: 'Exportar marcadores (.html)', fn: exportBookmarksHtml }
]));
$('#bmImportFile').addEventListener('change', async e => { const f = e.target.files[0]; e.target.value = ''; if (f) importBookmarksHtml(await f.text()); });
$('#bmList').addEventListener('click', e => {
  const card = e.target.closest('.bm-card'); if (!card) return;
  const act = e.target.closest('[data-bm]');
  if (act) {
    e.preventDefault(); e.stopPropagation();
    if (act.dataset.bm === 'edit') openBookmark(card.dataset.id);
    else deleteBookmark(card.dataset.id);
    return;
  }
  const b = S.bookmarks.find(x => x.id === card.dataset.id);
  if (b) countVisit(b);
});
$('#bmList').addEventListener('auxclick', e => { const card = e.target.closest('.bm-card'); if (card && e.button === 1) { const b = S.bookmarks.find(x => x.id === card.dataset.id); if (b) countVisit(b); } });
