/* =====================================================================
   ARRANQUE
   ===================================================================== */
function startApp() {
  loadState();
  initNotes(); initPomo(); initCalc(); initTime(); initDeadlines();
  const kd = store.get('kbDens', 'normal');
  kbDens = KB_DENS[kd] ? kd : 'normal';
  const tv = store.get('todoView', 'today');
  todoView = typeof tv === 'string' ? tv : 'today';
  calFilters = { ...CAL_FILTER_DEF, ...(store.get('calFilters', {}) || {}) };
  const bs = store.get('bmSort', 'cat'); if (['cat', 'used', 'new', 'az'].includes(bs)) $('#bmSort').value = bs;
  buildEmoji(); buildCalcKeys();
  renderNotesView(); renderBoard(); renderCalcHist(); calcRender(); renderVault(); renderPgHist();
  fillPomoSettings(); fillPomoTasks();
  initDevtools();
  APP_READY = true;
  if (P.running && Date.now() >= P.endAt) { P.running = false; P.remaining = 0; pomoComplete(); }
  pomoRender(); renderPomoToday(); pgGenerate();
  try { blocRefresh(); } catch {}
  document.body.classList.remove('booting');
  const hash = (location.hash || '').slice(1);
  const start = TABS.some(t => t.id === hash) ? hash : (S.prefs.start && S.prefs.start !== 'last' ? S.prefs.start : store.get('lastTab', 'dashboard'));
  showTab(start);
  updateClock(); setInterval(updateClock, 15000);
  try { avInit(); } catch (e) { console.warn(e); }
  ttTick(); renderSecurity(); histInit().catch(() => {}).then(fsInit).then(() => { try { cpInit(); } catch (e) { console.warn(e); } });
  if (!window.crypto || !crypto.subtle) toast('Aviso: este navegador no permite el cifrado en este contexto', 'warning', 6000);
}
/**
 * Vuelve a pintar toda la aplicación con los datos que haya ahora (tras combinar con otro
 * dispositivo, importar una copia o restaurar una versión), SIN recargar la pestaña: así el
 * bloqueo no vuelve a pedir la contraseña y no se pierde de vista lo que estabas haciendo.
 * Solo rehace estado y vistas: los botones, atajos y temporizadores se dejaron puestos al arrancar.
 */
function refreshApp() {
  loadState();
  initNotes(); initPomo(); initCalc(); initTime();
  const kd = store.get('kbDens', 'normal');
  kbDens = KB_DENS[kd] ? kd : 'normal';
  const tv = store.get('todoView', 'today');
  todoView = typeof tv === 'string' ? tv : 'today';
  calFilters = { ...CAL_FILTER_DEF, ...(store.get('calFilters', {}) || {}) };
  // si estás escribiendo en una nota que no ha cambiado, no se toca el editor
  const cur = getNote(currentNoteId);
  if (document.activeElement === editor && cur && editor.innerHTML === cur.html) renderNoteList();
  else renderNotesView();
  renderBoard(); renderCalcHist(); calcRender(); renderVault(); renderPgHist();
  fillPomoSettings(); fillPomoTasks(); pomoRender(); renderPomoToday();
  try { tagStyleRefresh(); } catch {}
  try { blocRefresh(); } catch {}
  renderFsPill(); updateClock();
  try { avCheck(); } catch {}
  showTab(currentTab);          // repinta la pestaña que estés viendo
}
async function boot() {
  setThemePref(ls.get('theme', 'system'));          // antes de cargar: el tema sale de localStorage
  renderNav();
  await storageInit();
  if (BACKEND.migrated) setTimeout(() => toast('Tus datos se han trasladado a IndexedDB: ya no hay límite de 5 MB', 'success', 5000), 800);
  if (BACKEND.kind === 'ls' && BACKEND.error) console.info('Almacenamiento: usando localStorage (' + BACKEND.error + ')');
  const meta = ls.get('lock', null);
  if (meta && meta.enabled && ls.raw('enc')) { showLockScreen(); return; }
  if (meta && meta.enabled) ls.set('lock', { ...meta, enabled: false });
  loadPlain();
  startApp();
}
boot();
