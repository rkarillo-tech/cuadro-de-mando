/* =====================================================================
   COPIAS AUTOMÁTICAS EN UNA CARPETA (con fecha y rotación)
   =====================================================================
   El archivo vinculado guarda SIEMPRE la última versión: si algo se estropea,
   se estropea ahí. Esto es lo otro: una copia con fecha en la carpeta que elijas
   (mejor en otro sitio que el archivo vinculado), conservando las N últimas.
*/
const CP_OK = typeof window.showDirectoryPicker === 'function' && window.isSecureContext;
const CP_DEF = { every: 'day', keep: 10, last: 0 };
const CP_EVERY = { open: 'cada vez que abro la app', day: 'una vez al día', week: 'una vez a la semana' };
const CP_PREFIX = 'cuadro-de-mando-';
let cpDir = null, cpState = CP_OK ? 'none' : 'unsupported', cpBusy = false, cpErr = '', cpCount = null;

const cpCfg = () => Object.assign({}, CP_DEF, ls.get('autoBackup', null) || {});
function cpSave(patch) { ls.set('autoBackup', Object.assign(cpCfg(), patch)); }
const cpName = withTime => CP_PREFIX + todayKey() + (withTime ? '-' + new Date().toTimeString().slice(0, 5).replace(':', '') : '') + '.json';

async function cpInit() {
  if (!CP_OK) { renderCp(); return; }
  try { cpDir = await idbGet('bkDir'); } catch { cpDir = null; }
  if (!cpDir) { cpState = 'none'; renderCp(); return; }
  let p = 'prompt';
  try { p = await cpDir.queryPermission({ mode: 'readwrite' }); } catch {}
  cpState = p === 'granted' ? 'ok' : 'perm';
  renderCp();
  if (cpState === 'ok') cpMaybe();
}
/** ¿Toca copia? Según la frecuencia elegida y cuándo se hizo la última. */
function cpDue() {
  const c = cpCfg();
  if (c.every === 'open') return true;
  if (!c.last) return true;
  const d = Date.now() - c.last;
  return c.every === 'week' ? d > 7 * 864e5 : d > 864e5;
}
async function cpMaybe() {
  if (cpState !== 'ok' || cpBusy || !APP_READY || !cpDue()) return;
  await cpRun();
}
/** Escribe la copia con fecha y deja solo las N últimas. */
async function cpRun({ manual = false } = {}) {
  if (!cpDir || cpBusy) return false;
  cpBusy = true; cpErr = ''; renderCp();
  try {
    if (typeof flushNote === 'function') flushNote();
    const obj = CRYPT ? await backupEncrypted(CRYPT.key, CRYPT.salt, CRYPT.iter) : backupPlain();
    const name = cpName(cpCfg().every === 'open');
    const fh = await cpDir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify(obj));
    await w.close();
    cpSave({ last: Date.now() });
    await cpPrune();
    cpState = 'ok';
    if (manual) toast(`Copia guardada: ${name}`, 'success', 3000);
  } catch (e) {
    cpErr = (e && e.message) || 'No se pudo guardar la copia';
    if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) cpState = 'perm';
    if (manual) toast('No se pudo guardar la copia: ' + cpErr, 'danger', 5000);
  } finally { cpBusy = false; }
  renderCp();
  return !cpErr;
}
/** Borra las copias más antiguas por encima de las que se conservan. */
async function cpPrune() {
  const keep = Math.max(1, +cpCfg().keep || 10);
  const names = await cpList();
  cpCount = names.length;
  if (names.length <= keep) return;
  const sobran = names.slice(0, names.length - keep);     // ordenadas de más antigua a más nueva
  for (const n of sobran) { try { await cpDir.removeEntry(n); } catch {} }
  cpCount = names.length - sobran.length;
}
/** Nombres de las copias que hay en la carpeta, de la más antigua a la más nueva. */
async function cpList() {
  const out = [];
  try {
    for await (const n of cpDir.keys()) if (n.startsWith(CP_PREFIX) && n.endsWith('.json')) out.push(n);
  } catch {}
  return out.sort();     // el nombre lleva la fecha, así que ordena cronológicamente
}
async function cpChoose() {
  let d;
  try { d = await window.showDirectoryPicker({ mode: 'readwrite', id: 'cdm-copias' }); }
  catch (e) { if (e.name !== 'AbortError') toast('No se pudo elegir la carpeta: ' + e.message, 'danger', 5000); return; }
  cpDir = d; cpState = 'ok'; cpErr = '';
  try { await idbSet('bkDir', d); } catch {}
  cpSave({ last: 0 });
  await cpRun({ manual: true });
  renderNotices();
}
async function cpReconnect() {
  if (!cpDir) return;
  try { const p = await cpDir.requestPermission({ mode: 'readwrite' }); if (p === 'granted') { cpState = 'ok'; await cpRun({ manual: true }); } }
  catch (e) { toast('No se pudo reconectar: ' + e.message, 'danger'); }
  renderCp();
}
async function cpForget() {
  if (!(await confirmDialog('Se dejarán de hacer copias automáticas. Las que ya están en la carpeta no se tocan. ¿Continuar?', 'Dejar de hacerlas', false))) return;
  cpDir = null; cpState = 'none'; cpCount = null;
  try { await idbDel('bkDir'); } catch {}
  cpSave({ last: 0 });
  renderCp(); renderNotices();
  toast('Copias automáticas desactivadas', 'info');
}
function cpFolderName() { return cpDir ? cpDir.name : ''; }
function renderCp() {
  const box = $('#cpStatus'); if (!box) return;
  const c = cpCfg();
  let st = '', btns = '';
  switch (cpState) {
    case 'unsupported':
      st = '⚪ No disponible en este navegador. Funciona en Chrome, Edge y Brave de ordenador; en el móvil usa Ajustes → Exportar.';
      break;
    case 'none':
      st = '⚪ Sin carpeta de copias';
      btns = '<button class="btn primary" data-cp="choose">📁 Elegir carpeta de copias</button>';
      break;
    case 'perm':
      st = `🟡 El navegador necesita que vuelvas a autorizar la carpeta «${esc(cpFolderName())}»`;
      btns = '<button class="btn primary" data-cp="reconnect">Reconectar</button><button class="btn ghost" data-cp="forget">Desactivar</button>';
      break;
    default:
      st = cpErr
        ? `🔴 Error al copiar en «${esc(cpFolderName())}»: ${esc(cpErr)}`
        : `🟢 Copias en «${esc(cpFolderName())}» ${esc(CP_EVERY[c.every] || '')}${c.last ? ` · última ${esc(relTime(c.last))}` : ''}${cpCount != null ? ` · ${cpCount} guardada${cpCount === 1 ? '' : 's'}` : ''}${CRYPT ? ' · cifradas' : ''}`;
      btns = '<button class="btn" data-cp="now">💾 Copiar ahora</button><button class="btn" data-cp="choose">📁 Cambiar carpeta</button><button class="btn ghost" data-cp="forget">Desactivar</button>';
  }
  box.innerHTML = (cpBusy ? '⏳ Guardando copia…' : st);
  // solo se repintan los botones si cambian: si no, al escribir en un campo y pulsar
  // un botón, el «change» del campo los recrearía entre el clic y el soltar, y se perdería
  const bb = $('#cpBtns');
  if (bb.innerHTML !== btns) bb.innerHTML = btns;
  $('#cpEvery').value = c.every;
  $('#cpKeep').value = String(c.keep);
  $('#cpOpts').hidden = cpState !== 'ok' && cpState !== 'perm';
}
$('#cpBtns').addEventListener('click', e => {
  const b = e.target.closest('[data-cp]'); if (!b) return;
  ({ choose: cpChoose, reconnect: cpReconnect, forget: cpForget, now: () => cpRun({ manual: true }) })[b.dataset.cp]();
});
$('#cpEvery').addEventListener('change', e => { cpSave({ every: e.target.value }); renderCp(); toast('Frecuencia de copias actualizada', 'success', 1600); });
$('#cpKeep').addEventListener('change', e => { cpSave({ keep: Math.max(1, Math.min(365, +e.target.value || 10)) }); renderCp(); if (cpState === 'ok') cpPrune().then(renderCp); });
// Si la app se queda abierta días, se comprueba de vez en cuando
setInterval(() => { if (!document.hidden) cpMaybe(); }, 3600000);
