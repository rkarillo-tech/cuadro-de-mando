/* =====================================================================
   NAVEGACIÓN · TEMA · RELOJ · POPOVERS · BÚSQUEDA GLOBAL · TECLADO
   ===================================================================== */
const TABS = [
  { id: 'dashboard', icon: '🏠', label: 'Inicio', group: '', sub: '' },
  { id: 'todos', icon: '☑️', label: 'Tareas', group: 'Organización', sub: 'Tus pendientes en listas, con fechas y repeticiones' },
  { id: 'kanban', icon: '📋', label: 'Kanban', group: 'Organización', sub: 'Arrastra las tarjetas entre columnas o usa las flechas' },
  { id: 'calendar', icon: '📅', label: 'Calendario', group: 'Organización', sub: 'Eventos, fechas límite y festivos' },
  { id: 'notes', icon: '📝', label: 'Notas', group: 'Organización', sub: 'Editor enriquecido con guardado automático · escribe [[ para enlazar notas' },
  { id: 'maps', icon: '🧠', label: 'Mapas', group: 'Organización', sub: 'Mapas mentales y conexiones entre tus notas' },
  { id: 'tags', icon: '🏷️', label: 'Etiquetas', group: 'Organización', sub: 'Todo lo que comparte una #etiqueta, sea de la sección que sea' },
  { id: 'bookmarks', icon: '🔖', label: 'Marcadores', group: 'Organización', sub: 'Tus enlaces frecuentes, ordenados' },
  { id: 'timer', icon: '🍅', label: 'Pomodoro', group: 'Foco', sub: 'Concéntrate por bloques y registra tu tiempo' },
  { id: 'time', icon: '⏱️', label: 'Horas', group: 'Foco', sub: 'Registro de tiempo por proyecto' },
  { id: 'habits', icon: '🔁', label: 'Hábitos', group: 'Foco', sub: 'Constancia día a día' },
  { id: 'calc', icon: '🧮', label: 'Calculadora', group: 'Utilidades', sub: 'Con paréntesis, porcentajes, historial y teclado' },
  { id: 'deadlines', icon: '📆', label: 'Plazos', group: 'Utilidades', sub: 'Días hábiles, vencimientos y festivos' },
  { id: 'devtools', icon: '🛠️', label: 'Herramientas', group: 'Utilidades', sub: 'JSON, Base64, hashes, regex, validadores… sin salir del navegador' },
  { id: 'crypto', icon: '🔐', label: 'Encriptador', group: 'Utilidades', sub: 'Cifrado AES-256-GCM de textos y archivos' },
  { id: 'passgen', icon: '🔑', label: 'Contraseñas', group: 'Utilidades', sub: 'Contraseñas y frases seguras' },
  { id: 'settings', icon: '⚙️', label: 'Ajustes', group: 'Sistema', sub: 'Seguridad, copias de seguridad y datos' }
];
const MOBILE_TABS = ['dashboard', 'todos', 'calendar', 'notes'];
let currentTab = 'dashboard';
const onShow = {};
const isMobile = () => matchMedia('(max-width:900px)').matches;

function renderNav() {
  let html = '', grp = null;
  TABS.forEach((t, i) => {
    if (t.group !== grp) { grp = t.group; if (grp) html += `<div class="nav-group">${grp}</div>`; }
    html += `<button class="nav-btn" data-tab="${t.id}" title="${t.label}${i < 9 ? ` (Alt+${i + 1})` : ''}"><span class="ico">${t.icon}</span><span class="long">${t.label}</span>${i < 9 ? `<span class="kbd">Alt ${i + 1}</span>` : ''}</button>`;
  });
  $('#nav').innerHTML = html;
  $('#mobileNav').innerHTML = MOBILE_TABS.map(id => { const t = TABS.find(x => x.id === id); return `<button data-tab="${id}"><span>${t.icon}</span>${t.label}</button>`; }).join('') + '<button data-more><span>☰</span>Más</button>';
}
function showTab(id) {
  if (!TABS.some(t => t.id === id)) id = 'dashboard';
  if (currentTab === 'notes' && id !== 'notes' && typeof flushNote === 'function') flushNote();
  currentTab = id;
  closePopovers();
  closeDrawer();
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
  $$('#mobileNav [data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + id));
  const t = TABS.find(t => t.id === id);
  $('#pageTitle').textContent = `${t.icon} ${t.label}`;
  $('#pageSub').textContent = t.sub;
  try { history.replaceState(null, '', '#' + id); } catch {}
  store.set('lastTab', id);
  if (onShow[id]) onShow[id]();
  window.scrollTo({ top: 0 });
}
function openDrawer() { $('#sidebar').classList.add('open'); $('#navBackdrop').classList.add('open'); }
function closeDrawer() { $('#sidebar').classList.remove('open'); $('#navBackdrop').classList.remove('open'); }
$('#nav').addEventListener('click', e => { const b = e.target.closest('.nav-btn'); if (b) showTab(b.dataset.tab); });
$('#mobileNav').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.hasAttribute('data-more')) openDrawer(); else showTab(b.dataset.tab);
});
$('#menuBtn').addEventListener('click', openDrawer);
$('#navBackdrop').addEventListener('click', closeDrawer);
document.addEventListener('click', e => { const g = e.target.closest('[data-goto]'); if (g) showTab(g.dataset.goto); });

/* ---------- Tema ---------- */
let themePref = 'system';
const mqLight = window.matchMedia ? matchMedia('(prefers-color-scheme: light)') : null;
const resolvedTheme = () => themePref === 'system' ? (mqLight && mqLight.matches ? 'light' : 'dark') : themePref;
function applyTheme() {
  const t = resolvedTheme();
  document.documentElement.dataset.theme = t;
  $('#themeBtn').textContent = t === 'dark' ? '☀️' : '🌙';
  $('#themeBtn').title = t === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro';
}
function setThemePref(p) { themePref = ['light', 'dark', 'system'].includes(p) ? p : 'system'; ls.set('theme', themePref); applyTheme(); if ($('#setTheme')) $('#setTheme').value = themePref; }
function toggleTheme() { setThemePref(resolvedTheme() === 'dark' ? 'light' : 'dark'); }
$('#themeBtn').addEventListener('click', toggleTheme);
if (mqLight) mqLight.addEventListener('change', () => { if (themePref === 'system') applyTheme(); });

function updateClock() {
  const s = new Date().toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  $('#clock').textContent = cap(s);
}

/* ---------- Popovers ---------- */
function openPopover(pop, anchor) {
  closePopovers(pop);
  anchor.dataset.popanchor = '1';
  pop.classList.add('open');
  const r = anchor.getBoundingClientRect();
  const w = pop.offsetWidth, h = pop.offsetHeight;
  const left = Math.min(r.left, innerWidth - w - 12);
  let top = r.bottom + 6;
  if (top + h > innerHeight - 10) top = Math.max(10, r.top - h - 6);
  pop.style.left = Math.max(10, left) + 'px';
  pop.style.top = top + 'px';
}
function closePopovers(except) { $$('.popover.open').forEach(p => { if (p !== except) p.classList.remove('open'); }); }
document.addEventListener('mousedown', e => { if (!e.target.closest('.popover') && !e.target.closest('[data-popanchor]')) closePopovers(); });
window.addEventListener('resize', () => closePopovers());

/* ---------- Atajos ---------- */
function showShortcuts() {
  return modal({
    title: '⌨️ Atajos de teclado', wide: true,
    body: `<div class="shortcuts">
      <span><kbd>Ctrl</kbd> + <kbd>K</kbd></span><span>Buscar en todo y lanzar acciones</span>
      <span><kbd>Alt</kbd> + <kbd>1</kbd>…<kbd>9</kbd></span><span>Ir a las secciones del menú (Inicio, Tareas, Kanban…)</span>
      <span><kbd>Alt</kbd> + <kbd>N</kbd></span><span>Nueva nota</span>
      <span><kbd>Alt</kbd> + <kbd>T</kbd></span><span>Nueva tarea</span>
      <span><kbd>Alt</kbd> + <kbd>L</kbd></span><span>Bloquear (si el bloqueo está activado)</span>
      <span><kbd>Ctrl</kbd> + <kbd>S</kbd></span><span>Guardar la nota ahora (se guarda sola igualmente)</span>
      <span><kbd>Ctrl</kbd> + <kbd>K</kbd> en una nota</span><span>Insertar enlace</span>
      <span><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>X</kbd></span><span>Insertar casilla de tarea en una nota</span>
      <span><kbd>[[</kbd> en una nota</span><span>Enlazar con otra nota (aparece en 🧠 Mapas → Conexiones)</span>
      <span><kbd>#</kbd> en notas, tareas…</span><span>Poner una etiqueta (te sugiere las que ya usas). <kbd>Ctrl</kbd>+clic en una etiqueta de una nota la abre</span>
      <span><kbd>Tab</kbd> / <kbd>Enter</kbd> en un mapa mental</span><span>Añadir idea hija / hermana (más en la ❔ Ayuda de Mapas)</span>
      <span><kbd>Enter</kbd> en una línea con casilla</span><span>Crea otra casilla (Enter en una vacía la quita)</span>
      <span><kbd>Espacio</kbd></span><span>Iniciar / pausar el Pomodoro (en su sección)</span>
      <span>Teclado numérico</span><span>Usar la calculadora (en su sección)</span>
      <span><kbd>Esc</kbd></span><span>Cerrar ventanas y menús</span></div>
      <p class="hint" style="margin-top:14px">En Tareas, al escribir puedes usar: <b>hoy</b>, <b>mañana</b>, <b>el viernes</b>, <b>15/11</b>, <b>en 3 días</b>, <b>próxima semana</b>, <b>cada semana</b>, <b>todos los lunes</b>, <b>#lista</b> y <b>!</b> (importante).</p>`,
    actions: [{ label: 'Entendido', value: 'ok', cls: 'primary' }]
  });
}
$('#helpBtn').addEventListener('click', showShortcuts);

/* =====================================================================
   BÚSQUEDA GLOBAL (Ctrl+K)
   ===================================================================== */
let palItems = [], palIndex = 0, palResults = [];
function paletteCommands() {
  const cmds = [
    { icon: '📝', title: 'Nueva nota', run: () => { showTab('notes'); createNoteAndFocus(); } },
    { icon: '☑️', title: 'Nueva tarea', run: () => { showTab('todos'); focusTodoInput(); } },
    { icon: '📋', title: 'Nueva tarjeta Kanban', run: () => { showTab('kanban'); openTask(null, 'todo'); } },
    { icon: '📅', title: 'Nuevo evento', run: () => { showTab('calendar'); openEvent(null, todayKey()); } },
    { icon: '🧠', title: 'Nuevo mapa mental', run: () => { showTab('maps'); showMapsMode('mind'); mmNewDialog(); } },
    { icon: '🕸️', title: 'Ver conexiones entre notas', run: () => openGraph(null) },
    { icon: '📚', title: 'Abrir la wiki (notas en árbol)', run: () => { showTab('notes'); setNotesMode('tree'); } },
    { icon: '🔖', title: 'Nuevo marcador', run: () => { showTab('bookmarks'); openBookmark(null); } },
    { icon: '🍅', title: P && P.running ? 'Pausar Pomodoro' : 'Iniciar Pomodoro', run: () => { showTab('timer'); pomoToggle(); } },
    { icon: '⏱️', title: ttRunningNow() ? 'Detener cronómetro de horas' : 'Iniciar cronómetro de horas', run: () => { showTab('time'); ttToggle(); } },
    { icon: '🌓', title: 'Cambiar tema claro/oscuro', run: toggleTheme },
    { icon: '💾', title: 'Exportar copia de seguridad', run: () => exportBackupDialog() },
    { icon: '📌', title: 'Guardar versión ahora (historial)', run: () => histSaveNowDialog() },
    { icon: '🕘', title: 'Historial de versiones', run: () => { showTab('settings'); setTimeout(() => $('#histCard').scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); } },
    { icon: '🛡️', title: 'Cómo se protegen tus datos (copias, cifrado, sincronización)', run: () => { showTab('settings'); setTimeout(() => $('#protectCard').scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); } },
    { icon: '⌨️', title: 'Ver atajos de teclado', run: showShortcuts }
  ];
  if (lockEnabled()) cmds.push({ icon: '🔒', title: 'Bloquear ahora', run: lockNow });
  return cmds.map(c => ({ ...c, g: 'Acciones', hay: norm(c.title), sub: '' }))
    .concat(TABS.map(t => ({ g: 'Ir a', icon: t.icon, title: t.label, sub: t.sub, hay: norm(t.label + ' ' + t.sub), run: () => showTab(t.id) })));
}
function paletteData() {
  const out = [];
  const listName = id => (S.todoLists.find(l => l.id === id) || {}).name || '';
  S.todos.forEach(t => out.push({ g: 'Tareas', icon: t.done ? '✅' : '☑️', title: t.text, sub: [listName(t.listId), t.due ? fmtDayLabel(t.due) : '', t.done ? 'completada' : ''].filter(Boolean).join(' · '), hay: norm(t.text + ' ' + (t.notes || '') + ' ' + (t.steps || []).map(s => s.text).join(' ')), rank: t.done ? 1 : 0, run: () => { showTab('todos'); openTodo(t.id); } }));
  S.notes.forEach(n => out.push({ g: 'Notas', icon: n.pinned ? '📌' : '📄', title: n.title, sub: (wkParent(n) ? '📚 ' + wkPath(n) + ' · ' : '') + (n.text || '').slice(0, 90), hay: norm(n.title + ' ' + (n.text || '')), run: () => { showTab('notes'); openNote(n.id); } }));
  S.tasks.forEach(t => out.push({ g: 'Kanban', icon: '📋', title: t.title, sub: (COLS.find(c => c.id === t.col) || {}).name || '', hay: norm(t.title + ' ' + (t.desc || '') + ' ' + (t.tags || []).join(' ') + ' ' + (t.subtasks || []).map(s => s.text).join(' ')), rank: t.col === 'done' ? 1 : 0, run: () => { showTab('kanban'); openTask(t.id); } }));
  S.events.forEach(ev => out.push({ g: 'Calendario', icon: '📅', title: ev.title, sub: fmtDayLabel(ev.date) + (ev.allDay ? '' : ' · ' + ev.start) + (ev.repeat ? ' · se repite' : ''), hay: norm(ev.title + ' ' + (ev.notes || '')), run: () => { showTab('calendar'); calGoto(ev.date); openEvent(ev.id); } }));
  tagIndex().forEach(e => out.push({ g: 'Etiquetas', icon: '🏷️', title: '#' + e.name, sub: `${tagItemsOf(e.key).length} elementos`, hay: norm('#' + e.name + ' ' + e.name), run: () => openTagView(e.key) }));
  S.mindmaps.forEach(m => {
    const open = id => () => { mmOpenMap(m.id, false); if (id) mmSelId = id; mapsMode = 'mind'; store.set('mapsMode', 'mind'); if (currentTab !== 'maps') showTab('maps'); else showMapsMode('mind'); if (id) setTimeout(() => mmEnsureVisible(id), 30); };
    out.push({ g: 'Mapas mentales', icon: '🧠', title: m.title, sub: `${mmCount(m.root)} ideas`, hay: norm(m.title), run: open(null) });
    mmWalk(m.root, (n, p) => { if (p && n.text) out.push({ g: 'Mapas mentales', icon: '•', title: n.text.replace(/\n/g, ' '), sub: 'En el mapa «' + m.title + '»', hay: norm(n.text), rank: 1, run: open(n.id) }); });
  });
  S.bookmarks.forEach(b => out.push({ g: 'Marcadores', icon: '🔖', title: b.title, sub: b.url, hay: norm(b.title + ' ' + b.url + ' ' + (b.category || '')), run: () => openBookmarkUrl(b.id) }));
  S.habits.forEach(h => out.push({ g: 'Hábitos', icon: h.emoji || '🔁', title: h.name, sub: 'Hábito', hay: norm(h.name), run: () => showTab('habits') }));
  S.projects.forEach(p => out.push({ g: 'Proyectos', icon: '🗂️', title: p.name, sub: p.client || 'Proyecto (Horas)', hay: norm(p.name + ' ' + (p.client || '')), run: () => showTab('time') }));
  S.vault.forEach(v => out.push({ g: 'Almacén cifrado', icon: '📦', title: v.name, sub: 'Elemento cifrado', hay: norm(v.name), run: () => { showTab('crypto'); vaultLoad(v.id); } }));
  return out;
}
function openPalette() {
  if (!APP_READY) return;
  closePopovers();
  palItems = paletteCommands().concat(paletteData());
  $('#palInput').value = '';
  $('#paletteBack').classList.add('open');
  renderPalette();
  $('#palInput').focus();
}
function closePalette() { $('#paletteBack').classList.remove('open'); }
const GROUP_ORDER = ['Acciones', 'Ir a', 'Etiquetas', 'Tareas', 'Notas', 'Mapas mentales', 'Kanban', 'Calendario', 'Marcadores', 'Hábitos', 'Proyectos', 'Almacén cifrado'];
function renderPalette() {
  const q = norm($('#palInput').value.trim());
  let res;
  if (!q) {
    const recent = [...S.notes].sort((a, b) => b.updated - a.updated).slice(0, 4).map(n => palItems.find(i => i.g === 'Notas' && i.title === n.title)).filter(Boolean);
    res = palItems.filter(i => i.g === 'Acciones').concat(recent.map(r => ({ ...r, g: 'Notas recientes' })));
  } else {
    const words = q.split(/\s+/);
    res = palItems.map(i => {
      if (!words.every(w => i.hay.includes(w) || norm(i.title).includes(w))) return null;
      const t = norm(i.title);
      const score = (t.startsWith(q) ? 0 : t.includes(q) ? 1 : words.every(w => t.includes(w)) ? 2 : 3) + (i.rank || 0) * 2;
      return { ...i, score };
    }).filter(Boolean).sort((a, b) => a.score - b.score || GROUP_ORDER.indexOf(a.g) - GROUP_ORDER.indexOf(b.g)).slice(0, 40);
    res.sort((a, b) => GROUP_ORDER.indexOf(a.g) - GROUP_ORDER.indexOf(b.g) || a.score - b.score);
    if (res.length < 5 && q.length >= 3) {          // pocos resultados: añadir los parecidos (erratas, abreviaturas)
      const seen = new Set(res.map(r => r.g + '|' + r.title));
      const fz = palItems.filter(i => !seen.has(i.g + '|' + i.title)).map(i => ({ i, s: fuzzyScore(q, i.title) * 2 + fuzzyScore(q, i.hay) })).filter(x => x.s > 0)
        .sort((a, b) => b.s - a.s || (a.i.rank || 0) - (b.i.rank || 0)).slice(0, 12).map(x => ({ ...x.i, g: '≈ Parecidos', sub: `${x.i.g}${x.i.sub ? ' · ' + x.i.sub : ''}` }));
      res = res.concat(fz);
    }
  }
  palResults = res; palIndex = 0;
  let html = '', g = null;
  res.forEach((r, i) => {
    if (r.g !== g) { g = r.g; html += `<div class="pal-group">${esc(g)}</div>`; }
    html += `<div class="pal-item${i === 0 ? ' active' : ''}" data-i="${i}"><span class="pi">${r.icon}</span><div class="grow"><div class="pt ellipsis">${esc(r.title)}</div>${r.sub ? `<div class="ps ellipsis">${esc(r.sub)}</div>` : ''}</div></div>`;
  });
  $('#palList').innerHTML = html || '<div class="empty">Sin resultados. Prueba con otras palabras.</div>';
}
function palMove(d) {
  if (!palResults.length) return;
  palIndex = (palIndex + d + palResults.length) % palResults.length;
  $$('#palList .pal-item').forEach(el => el.classList.toggle('active', +el.dataset.i === palIndex));
  const a = $('#palList .pal-item.active'); if (a) a.scrollIntoView({ block: 'nearest' });
}
function palRun(i) { const r = palResults[i]; if (!r) return; closePalette(); setTimeout(() => r.run(), 10); }
$('#palInput').addEventListener('input', renderPalette);
$('#palInput').addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { e.preventDefault(); palMove(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); palMove(-1); }
  else if (e.key === 'Enter') { e.preventDefault(); palRun(palIndex); }
  else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
});
$('#palList').addEventListener('mousemove', e => { const it = e.target.closest('.pal-item'); if (it && +it.dataset.i !== palIndex) { palIndex = +it.dataset.i; $$('#palList .pal-item').forEach(el => el.classList.toggle('active', el === it)); } });
$('#palList').addEventListener('click', e => { const it = e.target.closest('.pal-item'); if (it) palRun(+it.dataset.i); });
$('#paletteBack').addEventListener('mousedown', e => { if (e.target.id === 'paletteBack') closePalette(); });
$('#searchBtn').addEventListener('click', openPalette);

/* ---------- Teclado global ---------- */
document.addEventListener('keydown', e => {
  if (!APP_READY) return;
  if ($('#modalBack').classList.contains('open') || $('#paletteBack').classList.contains('open')) return;
  const k = (e.key || '').toLowerCase();
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && k === 'k' && !e.defaultPrevented) { e.preventDefault(); openPalette(); return; }
  const m = /^Digit([1-9])$/.exec(e.code || '');
  if (e.altKey && !e.ctrlKey && !e.metaKey && m) { e.preventDefault(); showTab(TABS[+m[1] - 1].id); return; }
  if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyN') { e.preventDefault(); showTab('notes'); createNoteAndFocus(); return; }
  if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyT') { e.preventDefault(); showTab('todos'); focusTodoInput(); return; }
  if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyL') { if (lockEnabled()) { e.preventDefault(); lockNow(); } return; }
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && k === 's') {
    e.preventDefault();
    if (currentTab === 'notes') { flushNote(true); toast('Nota guardada', 'success', 1400); }
    return;
  }
  if (e.key === 'Escape') { closePopovers(); closeDrawer(); }
  if (currentTab === 'calc') calcKey(e);
  else if (currentTab === 'timer' && e.code === 'Space' && !isTyping(e.target) && e.target.tagName !== 'BUTTON') { e.preventDefault(); pomoToggle(); }
});
