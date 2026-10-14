/* =====================================================================
   HISTORIAL DE VERSIONES (instantáneas locales en IndexedDB)
   ===================================================================== */
/*
  Cada versión es una copia completa de los datos con el mismo formato que una
  copia exportada. Si el bloqueo está activado, se guarda CIFRADA con la clave
  del bloqueo; si no, en claro (igual que el resto de datos del navegador).
  Solo se guardan en claro la fecha, el tipo y los recuentos (nº de notas, tareas…).

  Cuándo se crean:
   · Automáticas: al abrir la app y cada 30 min de uso, solo si hubo cambios.
   · De seguridad: justo antes de importar una copia, cargar el archivo vinculado
     o restaurar otra versión (para poder deshacerlo).
   · Manuales: con el botón «Guardar versión ahora» (con nombre opcional).
  Retención: automáticas → todas las de las últimas 24 h (máx. 24) y una por día
  durante 30 días; de seguridad → las 10 últimas; manuales → hasta 30.
*/
const HIST_DB = 'cdm-hist', HIST_STORE = 'snaps';
const HIST_EVERY = 30 * 60000;
const HIST_KIND = { auto: { icon: '🕘', name: 'Automática' }, before: { icon: '🛟', name: 'De seguridad' }, manual: { icon: '📌', name: 'Manual' } };
let histCache = [], histBusy = Promise.resolve();

function histDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(HIST_DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(HIST_STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function histTx(mode, fn) {
  const db = await histDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(HIST_STORE, mode);
    const req = fn(tx.objectStore(HIST_STORE));
    tx.oncomplete = () => { db.close(); res(req && req.result); };
    tx.onerror = () => { db.close(); rej(tx.error); };
  });
}
const histAll = async () => ((await histTx('readonly', s => s.getAll())) || []).sort((a, b) => b.at - a.at);
const histPut = rec => histTx('readwrite', s => s.put(rec));
const histDel = id => histTx('readwrite', s => s.delete(id));
const histClear = () => histTx('readwrite', s => s.clear());

function histCounts(d) {
  const n = k => Array.isArray(d && d[k]) ? d[k].length : 0;
  return { notes: n('notes'), todos: n('todos'), tasks: n('tasks'), events: n('events'), bookmarks: n('bookmarks'), habits: n('habits'), time: n('timeEntries'), vault: n('vault'), maps: n('mindmaps') };
}
const COUNT_LABELS = { notes: 'notas', todos: 'tareas', tasks: 'tarjetas Kanban', events: 'eventos', bookmarks: 'marcadores', habits: 'hábitos', time: 'registros de horas', vault: 'elementos del almacén', maps: 'mapas mentales' };
const countsText = c => ['notes', 'todos', 'tasks', 'events', 'bookmarks'].map(k => `${c[k] || 0} ${COUNT_LABELS[k]}`).join(' · ');
const fmtKB = n => n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`;

/** Crea una versión con los datos actuales. Devuelve el registro o null si no hacía falta. */
function histSnapshot(kind = 'auto', label = '', { force = false } = {}) {
  histBusy = histBusy.then(async () => {
    if (!APP_READY || FROZEN || !window.indexedDB) return null;
    if (typeof flushNote === 'function') flushNote();
    const lc = +MEM.lastChange || 0;
    if (!force) {
      const last = histCache[0];
      if (last && last.lastChange === lc) return null;           // nada nuevo desde la última versión
    }
    const data = clone(MEM);
    const payload = CRYPT ? await backupEncrypted(CRYPT.key, CRYPT.salt, CRYPT.iter, data) : backupPlain(data);
    const rec = { id: Date.now() + Math.random(), at: Date.now(), kind, label: String(label || '').slice(0, 80), lastChange: lc, counts: histCounts(data), size: JSON.stringify(payload).length, enc: !!payload.encrypted, payload };
    await histPut(rec);
    await histPrune();
    return rec;
  }).catch(e => { console.warn('historial:', e); return null; });
  return histBusy;
}

async function histPrune() {
  const all = await histAll(), now = Date.now(), keep = new Set();
  const autos = all.filter(r => r.kind === 'auto');
  autos.filter(r => now - r.at < 86400000).slice(0, 24).forEach(r => keep.add(r.id));
  const days = new Set();
  autos.filter(r => now - r.at < 30 * 86400000).forEach(r => { const d = dayKey(new Date(r.at)); if (!days.has(d)) { days.add(d); keep.add(r.id); } });
  all.filter(r => r.kind === 'before').slice(0, 10).forEach(r => keep.add(r.id));
  all.filter(r => r.kind === 'manual').slice(0, 30).forEach(r => keep.add(r.id));
  for (const r of all) if (!keep.has(r.id)) await histDel(r.id);
  histCache = all.filter(r => keep.has(r.id)).map(histLite);
}
const histLite = r => ({ id: r.id, at: r.at, kind: r.kind, label: r.label, lastChange: r.lastChange, counts: r.counts, size: r.size, enc: r.enc, salt: r.payload && r.payload.kdf ? r.payload.kdf.salt : null });
async function histRefresh() {
  try { histCache = (await histAll()).map(histLite); } catch { histCache = []; }
  renderHistory();
}

/** Abre los datos de una versión (pide contraseña si se cifró con otra). */
async function histOpen(rec) {
  const p = rec.payload;
  return p.encrypted ? askBackupPassword(p) : p.data;
}

/** Al activar/cambiar/desactivar el bloqueo, re-cifra las versiones para que sigan el mismo criterio que los datos. */
async function histRekey(oldC, newC) {
  try {
    const all = await histAll();
    for (const r of all) {
      let data = null;
      if (!r.payload.encrypted) data = r.payload.data;
      else if (oldC && r.payload.kdf && r.payload.kdf.salt === oldC.salt) {
        try { data = await aesDecryptJson(r.payload.iv, r.payload.data, oldC.key); } catch { data = null; }
      }
      if (!data) continue;                                          // cifrada con una contraseña antigua: se deja tal cual
      if (!r.payload.encrypted && !newC) continue;                  // ya está en claro y debe seguir así
      r.payload = newC ? await backupEncrypted(newC.key, newC.salt, newC.iter, data) : backupPlain(data);
      r.enc = !!newC; r.size = JSON.stringify(r.payload).length;
      await histPut(r);
    }
  } catch (e) { console.warn('historial (re-cifrado):', e); }
  await histRefresh();
}

/* ---------- Acciones de usuario ---------- */
async function histSaveNowDialog() {
  const r = await modal({
    title: '📌 Guardar versión ahora',
    body: '<p class="small">Guarda una foto de todos tus datos tal y como están ahora. Las versiones manuales no se borran solas (hasta 30).</p><div><label class="lbl">Nombre (opcional)</label><input class="field" name="label" maxlength="80" placeholder="Ej.: Antes de reorganizar el Kanban"></div>',
    actions: [{ label: 'Cancelar', value: null, cls: 'ghost' }, { label: 'Guardar versión', value: 'ok', cls: 'primary' }]
  });
  if (!r) return;
  const rec = await histSnapshot('manual', r.data.label.trim(), { force: true });
  await histRefresh();
  toast(rec ? 'Versión guardada' : 'No se pudo guardar la versión', rec ? 'success' : 'danger');
}
async function histRestore(id) {
  const rec = (await histAll()).find(r => r.id === id); if (!rec) return;
  const now = histCounts(MEM), then = rec.counts || {};
  const rows = Object.keys(COUNT_LABELS).filter(k => (now[k] || 0) || (then[k] || 0)).map(k => {
    const a = now[k] || 0, b = then[k] || 0, diff = b - a;
    return `<tr><td>${COUNT_LABELS[k][0].toUpperCase() + COUNT_LABELS[k].slice(1)}</td><td class="num">${a}</td><td class="num">${b}</td><td class="num ${diff < 0 ? 'bad-text' : diff > 0 ? 'ok-text' : 'muted'}">${diff > 0 ? '+' : ''}${diff || '='}</td></tr>`;
  }).join('');
  const r = await modal({
    title: '↩️ Restaurar versión',
    body: `<p>Versión del <b>${esc(fmtDateTime(rec.at))}</b> (${esc(relTime(rec.at))})${rec.label ? ` · «${esc(rec.label)}»` : ''}.</p>
      <table class="hist-cmp"><thead><tr><th></th><th class="num">Ahora</th><th class="num">Esa versión</th><th class="num">Cambio</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="muted small">Todos los datos actuales se sustituirán por los de esa versión. Antes se guarda automáticamente una versión «de seguridad» con lo que tienes ahora, así que podrás deshacerlo desde este mismo historial.</p>`,
    actions: [{ label: 'Cancelar', value: null, cls: 'ghost' }, { label: 'Restaurar', value: 'ok', cls: 'primary' }]
  });
  if (!r) return;
  const data = await histOpen(rec); if (!data) return;
  await histSnapshot('before', 'Antes de restaurar la versión del ' + fmtDateTime(rec.at), { force: true });
  await replaceAllData(data);
  toast('Versión restaurada. Recargando…', 'success');
  setTimeout(() => reloadSafe(), 600);
}
async function histDownload(id) {
  const rec = (await histAll()).find(r => r.id === id); if (!rec) return;
  const d = new Date(rec.at), hm = String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
  download(`cuadro-de-mando_version_${dayKey(d)}_${hm}${rec.enc ? '_cifrada' : ''}.json`, JSON.stringify(rec.payload), 'application/json');
  toast(rec.enc ? 'Versión descargada (cifrada: necesitarás la contraseña para importarla)' : 'Versión descargada (sin cifrar)', 'success', 3500);
}
async function histDelete(id) {
  if (!(await confirmDialog('¿Eliminar esta versión del historial?', 'Eliminar'))) return;
  await histDel(id); await histRefresh();
}
async function histDeleteAll() {
  if (!(await confirmDialog('Se eliminarán todas las versiones guardadas. Tus datos actuales no se tocan. ¿Continuar?', 'Vaciar historial', true))) return;
  await histClear(); await histRefresh(); toast('Historial vaciado', 'info');
}

/* ---------- Render ---------- */
function renderHistory() {
  const box = $('#histList'); if (!box) return;
  renderProtect();
  const total = histCache.reduce((a, r) => a + (r.size || 0), 0);
  const last = histCache[0];
  $('#histStatus').innerHTML = !window.indexedDB ? '⚪ Este navegador no permite guardar versiones'
    : histCache.length ? `🕘 <b>${histCache.length}</b> ${histCache.length === 1 ? 'versión guardada' : 'versiones guardadas'} · última ${esc(relTime(last.at))} · ${fmtKB(total)}${CRYPT ? ' · cifradas' : ''}`
    : '🕘 Aún no hay versiones. Se creará la primera en cuanto hagas cambios.';
  if (!histCache.length) { box.innerHTML = ''; $('#histClear').hidden = true; return; }
  $('#histClear').hidden = false;
  let lastDay = '';
  box.innerHTML = histCache.map(r => {
    const day = dayKey(new Date(r.at));
    const head = day !== lastDay ? `<div class="ver-day">${esc(cap(fmtDayLabel(day)))}</div>` : '';
    lastDay = day;
    const k = HIST_KIND[r.kind] || HIST_KIND.auto;
    const locked = r.enc && (!CRYPT || r.salt !== CRYPT.salt);
    return `${head}<div class="ver-item" data-id="${r.id}">
      <div class="grow" style="min-width:0">
        <div><b>${esc(fmtTime(r.at))}</b> <span class="badge" title="${esc(k.name)}">${k.icon} ${esc(k.name)}</span>${r.enc ? ` <span class="badge" title="${locked ? 'Cifrada con otra contraseña: se te pedirá al restaurar' : 'Cifrada con la contraseña del bloqueo'}">🔒${locked ? ' otra contraseña' : ''}</span>` : ''}</div>
        ${r.label ? `<div class="small">${esc(r.label)}</div>` : ''}
        <div class="muted small ellipsis">${esc(countsText(r.counts || {}))} · ${fmtKB(r.size || 0)}</div>
      </div>
      <div class="row" style="gap:4px;flex-wrap:nowrap">
        <button class="btn sm" data-h="restore" title="Restaurar esta versión">↩️ Restaurar</button>
        <button class="btn sm icon ghost" data-h="dl" title="Descargar como copia de seguridad" aria-label="Descargar">⬇️</button>
        <button class="btn sm icon ghost" data-h="del" title="Eliminar del historial" aria-label="Eliminar">🗑️</button>
      </div></div>`;
  }).join('');
}
$('#histList').addEventListener('click', e => {
  const b = e.target.closest('[data-h]'); if (!b) return;
  const id = +b.closest('[data-id]').dataset.id;
  ({ restore: histRestore, dl: histDownload, del: histDelete })[b.dataset.h](id);
});
$('#histSave').addEventListener('click', histSaveNowDialog);
$('#histClear').addEventListener('click', histDeleteAll);

/* ---------- Arranque y programación ---------- */
async function histInit() {
  if (!window.indexedDB) { renderHistory(); return; }
  await histRefresh();
  await histSnapshot('auto');
  await histRefresh();
}
setInterval(async () => {
  if (!APP_READY || FROZEN) return;
  const last = histCache.find(r => r.kind === 'auto');
  if (last && Date.now() - last.at < HIST_EVERY) return;
  if (await histSnapshot('auto')) histRefresh();
}, 60000);

/* ---------- Resumen «Cómo se protegen tus datos» ---------- */
function renderProtect() {
  const box = $('#protectStatus'); if (!box) return;
  const lock = lockEnabled();
  const fileOk = fsState === 'ok' && !fsErr, fileWarn = fsState === 'perm' || fsState === 'conflict' || !!fsErr;
  const last = store.get('lastBackup', 0), days = last ? Math.floor((Date.now() - last) / 864e5) : Infinity;
  const items = [
    { st: lock ? 'ok' : 'off', icon: '🔒', txt: lock ? 'Bloqueo activado' : 'Sin bloqueo' },
    { st: histCache.length ? 'ok' : 'off', icon: '🕘', txt: histCache.length ? `${histCache.length} ${histCache.length === 1 ? 'versión' : 'versiones'} en el historial` : 'Historial vacío (aún)' },
    { st: fileOk ? 'ok' : fileWarn ? 'warn' : 'off', icon: '🗄️', txt: fileOk ? `Sincronizando con «${fsName()}»` : fileWarn ? 'Archivo vinculado pendiente de revisar' : fsState === 'unsupported' ? 'Archivo en disco no disponible aquí' : 'Sin archivo en disco' },
    { st: days <= 31 ? 'ok' : last ? 'warn' : 'off', icon: '💾', txt: last ? `Última copia exportada ${relTime(last)}` : 'Nunca has exportado una copia' }
  ];
  let tip = '';
  if (fsState === 'none' && !last) tip = 'Ahora mismo tus datos solo están en este navegador. Te recomiendo vincular un archivo en una carpeta de OneDrive/Dropbox o, al menos, exportar una copia cifrada.';
  else if (fileWarn) tip = 'El archivo vinculado necesita tu atención: revisa la tarjeta «Guardar en un archivo de tu disco».';
  else if (days > 31) tip = 'Hace tiempo que no exportas una copia: conviene guardar una cifrada fuera del ordenador.';
  box.innerHTML = `<div class="prot-chips">${items.map(i => `<span class="prot-chip ${i.st}">${i.st === 'ok' ? '✅' : i.st === 'warn' ? '⚠️' : '⚪'} ${i.icon} ${esc(i.txt)}</span>`).join('')}</div>${tip ? `<p class="small" style="margin:8px 0 0">💡 ${esc(tip)}</p>` : ''}`;
}
