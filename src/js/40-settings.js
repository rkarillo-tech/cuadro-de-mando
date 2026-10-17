/* =====================================================================
   AJUSTES · BLOQUEO · COPIAS · ARCHIVO EN DISCO · DATOS
   ===================================================================== */

/* ---------- Copias de seguridad ---------- */
function summarizeData(d) {
  const n = k => Array.isArray(d && d[k]) ? d[k].length : 0;
  return `${n('notes')} notas, ${n('todos')} tareas, ${n('tasks')} tarjetas Kanban, ${n('events')} eventos, ${n('bookmarks')} marcadores`;
}
async function exportBackupDialog() {
  flushNote();
  const locked = lockEnabled();
  const r = await modal({
    title: '⬇️ Exportar copia de seguridad',
    body: `<p class="small">Se descargará un archivo <b>.json</b> con <b>todos</b> tus datos. Guárdalo fuera de este ordenador (un pendrive, tu nube…): es lo que te salva si se borra el navegador o cambias de equipo.</p>
      <div class="bk-choice">
        <label class="bk-opt"><input type="radio" name="mode" value="enc" checked><span><b>🔐 Cifrada</b> <span class="badge success">recomendada</span><br><span class="muted small">Nadie puede leerla sin la contraseña. Ideal para guardarla en la nube o en un pendrive.</span></span></label>
        <label class="bk-opt"><input type="radio" name="mode" value="plain"><span><b>📄 Sin cifrar</b><br><span class="muted small">JSON legible por cualquiera que tenga el archivo. Útil para revisar o reutilizar los datos en otro programa.</span></span></label>
      </div>
      <div id="bkPassBox" class="grid" style="gap:8px;margin-top:12px">
        ${locked ? '<label class="check-row"><input type="checkbox" class="check" name="useLock" checked> Usar la misma contraseña del bloqueo</label>' : ''}
        <div id="bkOther" class="grid" style="gap:8px"><div><label class="lbl">Contraseña para esta copia (mínimo 6 caracteres)</label><input class="field" type="password" name="p1" autocomplete="new-password"></div><div><label class="lbl">Repítela</label><input class="field" type="password" name="p2" autocomplete="new-password"></div></div>
        <p class="hint" style="margin:0">⚠️ Apúntala en un sitio seguro: <b>no se puede recuperar</b>. Sin ella, la copia es inservible. Para restaurar: Ajustes → «⬆️ Importar copia».</p>
      </div>`,
    actions: [{ label: 'Cancelar', value: null, cls: 'ghost' }, {
      label: 'Descargar', value: 'ok', cls: 'primary', validate: f => {
        if (f.elements.namedItem('mode').value !== 'enc') return null;
        const use = f.elements.namedItem('useLock'); if (use && use.checked) return null;
        const p1 = f.elements.namedItem('p1').value;
        if (p1.length < 6) return 'La contraseña debe tener al menos 6 caracteres';
        return p1 === f.elements.namedItem('p2').value ? null : 'Las contraseñas no coinciden';
      }
    }],
    onOpen: form => {
      const sync = () => {
        $('#bkPassBox', form).hidden = form.elements.namedItem('mode').value !== 'enc';
        const use = form.elements.namedItem('useLock');
        $('#bkOther', form).hidden = !!(use && use.checked);
      };
      form.addEventListener('change', sync); sync();
    }
  });
  if (!r) return;
  const enc = r.data.mode === 'enc';
  const obj = !enc ? backupPlain() : (lockEnabled() && r.data.useLock) ? await backupEncrypted(CRYPT.key, CRYPT.salt, CRYPT.iter) : await backupWithPassword(r.data.p1);
  download(`cuadro-de-mando_${todayKey()}${enc ? '_cifrada' : ''}.json`, JSON.stringify(obj, null, enc ? 0 : 1), 'application/json');
  store.set('lastBackup', Date.now());
  renderSettings(); renderNotices();
  toast(enc ? 'Copia cifrada descargada' : 'Copia de seguridad descargada (sin cifrar)', 'success');
}
async function askBackupPassword(o) {
  if (CRYPT && o.kdf && o.kdf.salt === CRYPT.salt) { try { return await openBackup(o, null); } catch {} }
  for (;;) {
    const r = await modal({
      title: '🔐 Copia cifrada',
      body: '<p class="muted small">Estos datos están cifrados. Introduce la contraseña con la que se cifraron.</p><input class="field" type="password" name="p" autocomplete="off">',
      actions: [{ label: 'Cancelar', value: null, cls: 'ghost' }, { label: 'Descifrar', value: 'ok', cls: 'primary' }]
    });
    if (!r) return null;
    try { return await openBackup(o, r.data.p); } catch { toast('Contraseña incorrecta', 'danger'); }
  }
}
async function importBackupFile(file, { fromLock = false } = {}) {
  let o = null;
  try { o = JSON.parse(await file.text()); } catch {}
  if (!isBackup(o)) { toast('El archivo no es una copia válida de esta app', 'danger', 4000); return; }
  const data = o.encrypted ? await askBackupPassword(o) : o.data;
  if (!data) return;
  if (!fromLock) {
    // Vista previa: qué se gana y qué se perdería; por defecto, combinar
    const res = await syncChoiceDialog(data, { mode: 'import', title: `📥 Importar «${file.name}»`, otherLabel: 'la copia' });
    await applySyncChoice(res, data, '«' + file.name + '»');
    return;
  }
  if (!(await confirmDialog(`Se reemplazarán los datos cifrados de este navegador por los de la copia (${summarizeData(data)}). ¿Continuar?`, 'Importar y reemplazar'))) return;
  ls.del('enc'); ls.set('lock', { enabled: false }); CRYPT = null; ls.keys().forEach(k => { if (!PLAIN_KEYS.has(k)) ls.del(k); });
  await replaceAllData(data);
  toast('Copia importada. Recargando…', 'success');
  setTimeout(() => reloadSafe(), 600);
}

/* ---------- Bloqueo ---------- */
async function enableLockDialog() {
  const r = await modal({
    title: '🔒 Activar bloqueo con contraseña',
    body: `<p class="small">Se te pedirá al abrir la app y todos los datos se guardarán cifrados. <b>No hay forma de recuperar la contraseña</b>: si la olvidas, solo podrás restaurar desde una copia de seguridad.</p>
      <div><label class="lbl">Contraseña (mínimo 8 caracteres)</label><input class="field" type="password" name="p1" autocomplete="new-password"><div class="meter"><span id="lkMeter"></span></div><div class="small muted" id="lkLabel" style="min-height:1.2em;margin-top:4px"></div></div>
      <div><label class="lbl">Repítela</label><input class="field" type="password" name="p2" autocomplete="new-password"></div>`,
    actions: [{ label: 'Cancelar', value: null, cls: 'ghost' }, {
      label: 'Activar bloqueo', value: 'ok', cls: 'primary', validate: f => {
        const p1 = f.elements.namedItem('p1').value;
        if (p1.length < 8) return 'Usa al menos 8 caracteres';
        return p1 === f.elements.namedItem('p2').value ? null : 'Las contraseñas no coinciden';
      }
    }],
    onOpen: form => form.elements.namedItem('p1').addEventListener('input', e => paintMeter($('#lkMeter', form), $('#lkLabel', form), e.target.value))
  });
  if (!r) return;
  flushNote();
  try {
    await enableLock(r.data.p1);
    renderSettings(); fileSyncSchedule();
    histRekey(null, CRYPT);
    toast('Bloqueo activado: tus datos ya se guardan cifrados', 'success', 4000);
    if (legacyPresent().length) setTimeout(() => toast('Ojo: quedan datos de la versión antigua sin cifrar. Puedes borrarlos en «Datos y almacenamiento».', 'warning', 7000), 600);
  } catch (e) {
    toast('No se pudo activar el bloqueo: ' + e.message, 'danger', 6000);
  }
}
async function askCurrentPassword(title) {
  const r = await modal({ title, body: '<div><label class="lbl">Contraseña actual</label><input class="field" type="password" name="p" autocomplete="current-password"></div>', actions: [{ label: 'Cancelar', value: null, cls: 'ghost' }, { label: 'Continuar', value: 'ok', cls: 'primary' }] });
  if (!r) return false;
  if (!(await verifyLockPassword(r.data.p))) { toast('Contraseña incorrecta', 'danger'); return false; }
  return true;
}
async function changePasswordDialog() {
  if (!(await askCurrentPassword('🔑 Cambiar contraseña'))) return;
  const r = await modal({
    title: '🔑 Nueva contraseña',
    body: '<div><label class="lbl">Nueva contraseña (mínimo 8 caracteres)</label><input class="field" type="password" name="p1" autocomplete="new-password"></div><div><label class="lbl">Repítela</label><input class="field" type="password" name="p2" autocomplete="new-password"></div>',
    actions: [{ label: 'Cancelar', value: null, cls: 'ghost' }, { label: 'Cambiar', value: 'ok', cls: 'primary', validate: f => { const p = f.elements.namedItem('p1').value; return p.length < 8 ? 'Usa al menos 8 caracteres' : p !== f.elements.namedItem('p2').value ? 'Las contraseñas no coinciden' : null; } }]
  });
  if (!r) return;
  const oldC = CRYPT;
  await changeLockPassword(r.data.p1);
  fileSyncSchedule();
  histRekey(oldC, CRYPT);
  toast('Contraseña cambiada', 'success');
}
async function disableLockDialog() {
  if (!(await askCurrentPassword('🔓 Desactivar bloqueo'))) return;
  if (!(await confirmDialog('Los datos volverán a guardarse sin cifrar en este navegador. ¿Desactivar el bloqueo?', 'Desactivar', true))) return;
  const oldC = CRYPT;
  await disableLock();
  renderSettings(); fileSyncSchedule();
  histRekey(oldC, null);
  toast('Bloqueo desactivado', 'info');
}
async function lockNow() {
  if (!lockEnabled()) return;
  flushNote();
  await flushEnc();
  if (fsTimer) await fsWrite();
  reloadSafe();
}
let lastActivity = Date.now();
['mousemove', 'keydown', 'mousedown', 'touchstart', 'wheel'].forEach(ev => document.addEventListener(ev, () => { lastActivity = Date.now(); }, { passive: true, capture: true }));
setInterval(() => {
  if (!APP_READY || !lockEnabled()) return;
  const m = +(lockMeta().autoLock || 0);
  if (m && Date.now() - lastActivity > m * 60000) lockNow();
}, 15000);
document.addEventListener('visibilitychange', () => { if (document.hidden && APP_READY) { flushNote(); if (CRYPT) flushEnc(); if (fsTimer) fsWrite(); } });

/* ---------- Pantalla de bloqueo ---------- */
function showLockScreen() {
  $('#lockScreen').hidden = false;
  setTimeout(() => $('#lockPass').focus(), 60);
}
$('#lockEye').addEventListener('click', () => { const i = $('#lockPass'); i.type = i.type === 'password' ? 'text' : 'password'; });
$('#lockForm').addEventListener('submit', async e => {
  e.preventDefault();
  const p = $('#lockPass').value; if (!p) return;
  const btn = $('#lockBtn'); btn.disabled = true; btn.textContent = 'Comprobando…'; $('#lockErr').textContent = '';
  try {
    await unlockWith(p);
    $('#lockPass').value = '';
    $('#lockScreen').hidden = true;
    startApp();
  } catch {
    $('#lockErr').textContent = 'Contraseña incorrecta';
    $('#lockPass').select();
  } finally { btn.disabled = false; btn.textContent = 'Desbloquear'; }
});
$('#lockForgot').addEventListener('click', async () => {
  const r = await modal({
    title: '¿Has olvidado la contraseña?',
    body: '<p>La contraseña no se guarda en ningún sitio, así que no se puede recuperar ni restablecer: sin ella, los datos cifrados no se pueden leer.</p><p class="muted small">Puedes restaurar una copia de seguridad (o tu archivo vinculado) o borrar los datos cifrados y empezar de cero.</p>',
    actions: [{ label: 'Cancelar', value: null, cls: 'ghost' }, { label: 'Borrar y empezar de cero', value: 'wipe', cls: 'danger' }, { label: 'Restaurar desde copia…', value: 'restore', cls: 'primary' }]
  });
  if (!r) return;
  if (r.action === 'restore') {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = () => { if (inp.files[0]) importBackupFile(inp.files[0], { fromLock: true }); };
    inp.click();
  } else wipeDialog();
});

/* ---------- Archivo en disco (File System Access API) ---------- */
const FS_OK = typeof window.showSaveFilePicker === 'function' && window.isSecureContext;
let fsHandle = null, fsState = FS_OK ? 'none' : 'unsupported', fsTimer = null, fsLastWrite = 0, fsErr = '', fsBusy = false;
let fsSeenMtime = 0, fsSeenLc = 0, fsAsking = false;   // fecha de modificación del archivo la última vez que lo leímos o escribimos: si cambia, lo tocó otro dispositivo
function idbOpen() { return new Promise((res, rej) => { const r = indexedDB.open('cdm-fs', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function idbReq(mode, fn) { const db = await idbOpen(); return new Promise((res, rej) => { const tx = db.transaction('kv', mode); const req = fn(tx.objectStore('kv')); tx.oncomplete = () => res(req && req.result); tx.onerror = () => rej(tx.error); }); }
const idbGet = k => idbReq('readonly', s => s.get(k));
const idbSet = (k, v) => idbReq('readwrite', s => s.put(v, k));
const idbDel = k => idbReq('readwrite', s => s.delete(k));
const fsName = () => fsHandle ? fsHandle.name : '';
const fsLinkedOk = () => fsState === 'ok';
const fsNeedsPermission = () => fsState === 'perm';
const FS_TYPES = [{ description: 'Datos del Cuadro de Mando', accept: { 'application/json': ['.json'] } }];

async function fsInit() {
  if (!FS_OK) { renderFs(); return; }
  try { fsHandle = await idbGet('sync'); fsSeenMtime = +(await idbGet('seenMtime')) || 0; fsSeenLc = +(await idbGet('seenLc')) || 0; } catch { fsHandle = null; }
  if (!fsHandle) { fsState = 'none'; renderFs(); return; }
  let p = 'prompt';
  try { p = await fsHandle.queryPermission({ mode: 'readwrite' }); } catch {}
  if (p === 'granted') { fsState = 'ok'; await fsCheckNewer(); }
  else fsState = 'perm';
  renderFs(); renderNotices();
}
function fileSyncSchedule() {
  if (fsState !== 'ok') return;
  clearTimeout(fsTimer);
  fsTimer = setTimeout(fsWrite, 1500);
  renderFsPill();
}
async function fsWrite() {
  clearTimeout(fsTimer); fsTimer = null;
  if (fsState !== 'ok' || !fsHandle || fsBusy || fsAsking) return;
  fsBusy = true;
  try {
    // ¿Lo ha cambiado otro dispositivo desde la última vez? Entonces no se pisa: se pregunta (y se puede combinar)
    if (await fsExternallyChanged()) { fsBusy = false; await fsCheckNewer(true); return; }
    const obj = CRYPT ? await backupEncrypted(CRYPT.key, CRYPT.salt, CRYPT.iter) : backupPlain();
    const w = await fsHandle.createWritable();
    await w.write(JSON.stringify(obj));
    await w.close();
    await fsRememberMtime(0, obj.lastChange);
    fsLastWrite = Date.now(); fsErr = '';
  } catch (e) {
    fsErr = (e && e.message) || 'Error al escribir';
    if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) fsState = 'perm';
  } finally { fsBusy = false; }
  renderFs();
}
async function fsRead(h) {
  const f = await h.getFile(), txt = await f.text();
  let o = null; try { o = JSON.parse(txt); } catch {}
  return { o, empty: !txt.trim(), mtime: f.lastModified };
}
/** Recuerda cómo estaba el archivo (fecha y «lastChange») la última vez que lo leímos o escribimos. */
async function fsRememberMtime(m, lc) {
  try {
    fsSeenMtime = m || (await fsHandle.getFile()).lastModified;
    if (lc != null) fsSeenLc = +lc || 0;
    await idbSet('seenMtime', fsSeenMtime); await idbSet('seenLc', fsSeenLc);
  } catch {}
}
/** ¿Otro dispositivo ha guardado en el archivo desde entonces? (no basta con la fecha: Drive a veces la toca sin cambiar nada) */
async function fsExternallyChanged() {
  if (!fsHandle || !fsSeenMtime || !fsSeenLc) return false;
  try {
    const f = await fsHandle.getFile();
    if (f.lastModified === fsSeenMtime) return false;
    let lc = 0; try { lc = +JSON.parse(await f.text()).lastChange || 0; } catch {}
    if (!lc || lc === fsSeenLc) { await fsRememberMtime(f.lastModified); return false; }
    return true;
  } catch { return false; }
}
/** Compara el archivo con los datos de este navegador. external = otro dispositivo lo ha modificado. */
async function fsCheckNewer(external = false) {
  if ((fsBusy && !external) || fsAsking) return;
  fsAsking = true;
  try {
    const { o, empty, mtime } = await fsRead(fsHandle);
    if (empty || !isBackup(o)) { fsAsking = false; await fsWrite(); return; }
    const fileLc = +o.lastChange || 0, mine = +MEM.lastChange || 0;
    external = external || (fsSeenLc && fileLc !== fsSeenLc);
    if (fileLc > mine + 1000 || (external && fileLc !== mine)) {
      const data = o.encrypted ? await askBackupPassword(o) : o.data;
      if (!data) { fsState = 'conflict'; renderFs(); return; }
      const res = await syncChoiceDialog(data, {
        mode: 'file', title: external && fileLc <= mine ? '🗄️ Otro dispositivo ha modificado el archivo' : '🗄️ El archivo tiene cambios más recientes', otherLabel: 'el archivo',
        intro: `<p class="small">El archivo vinculado «${esc(fsName())}» se guardó el <b>${esc(fmtDateTime(fileLc))}</b>; los datos de este navegador, el <b>${mine ? esc(fmtDateTime(mine)) : '—'}</b>. Quizá lo usaste desde otro equipo. <b>Combinar</b> junta lo de los dos sin perder nada.</p>`
      });
      if (!res.choice) { fsState = 'conflict'; renderFs(); return; }
      if (res.choice === 'keep') { fsState = 'ok'; await fsRememberMtime(mtime, fileLc); fsAsking = false; await fsWrite(); }
      else { await fsRememberMtime(mtime, fileLc); await applySyncChoice(res, data, 'el archivo «' + fsName() + '»'); return; }
    } else {
      await fsRememberMtime(mtime, fileLc);
      fsAsking = false;
      if (mine > fileLc) await fsWrite();
      else fsLastWrite = fsLastWrite || fileLc;
    }
  } catch (e) { fsErr = (e && e.message) || 'Error al leer el archivo'; }
  finally { fsAsking = false; }
  renderFs();
}
// Al volver a la pestaña, se mira si otro dispositivo ha tocado el archivo
document.addEventListener('visibilitychange', async () => {
  if (document.hidden || !APP_READY || fsState !== 'ok' || fsBusy) return;
  if (await fsExternallyChanged()) fsCheckNewer(true);
});
async function fsLinkNew() {
  let h;
  try { h = await window.showSaveFilePicker({ suggestedName: 'cuadro-de-mando.json', types: FS_TYPES }); }
  catch (e) { if (e.name !== 'AbortError') toast('No se pudo vincular: ' + e.message, 'danger', 5000); return; }
  fsHandle = h; fsState = 'ok'; fsSeenMtime = 0; fsSeenLc = 0;
  try { await idbSet('sync', h); await idbSet('seenMtime', 0); } catch {}
  flushNote();
  await fsWrite();
  toast(`Vinculado a «${h.name}»: cada cambio se guardará ahí automáticamente`, 'success', 4500);
  renderNotices();
}
async function fsOpenExisting() {
  let h;
  try { [h] = await window.showOpenFilePicker({ types: FS_TYPES, multiple: false }); }
  catch (e) { if (e.name !== 'AbortError') toast('No se pudo abrir: ' + e.message, 'danger', 5000); return; }
  const { o } = await fsRead(h);
  if (!isBackup(o)) { toast('Ese archivo no contiene datos de esta app', 'danger', 4000); return; }
  const when = +o.lastChange || Date.parse(o.exportedAt) || 0;
  const r = await modal({
    title: '🗄️ Abrir archivo existente',
    body: `<p>«${esc(h.name)}» tiene datos guardados el <b>${esc(fmtDateTime(when))}</b>${o.encrypted ? ' (cifrados)' : ''}: ${o.encrypted ? 'contenido cifrado' : esc(summarizeData(o.data))}.</p><p class="muted small">Desde ahora, la app guardará los cambios en este archivo.</p>`,
    actions: [{ label: 'Cancelar', value: null, cls: 'ghost' }, { label: 'Sobrescribirlo con mis datos', value: 'mine', cls: '' }, { label: 'Cargar o combinar sus datos…', value: 'file', cls: 'primary' }]
  });
  if (!r) return;
  let perm = 'denied';
  try { perm = await h.requestPermission({ mode: 'readwrite' }); } catch {}
  if (perm !== 'granted') { toast('Sin permiso de escritura no se puede vincular el archivo', 'warning', 4000); return; }
  fsHandle = h;
  try { await idbSet('sync', h); } catch {}
  if (r.action === 'file') {
    const data = o.encrypted ? await askBackupPassword(o) : o.data;
    if (!data) return;
    const res = await syncChoiceDialog(data, { mode: 'import', title: `🗄️ Cargar «${h.name}»`, otherLabel: 'el archivo' });
    if (!res.choice) return;
    await fsRememberMtime((await h.getFile()).lastModified, +o.lastChange || 0);
    await applySyncChoice(res, data, 'el archivo «' + h.name + '»');
    return;
  }
  fsState = 'ok'; fsSeenMtime = 0; fsSeenLc = 0; await fsWrite();
  toast(`Vinculado a «${h.name}»`, 'success');
}
async function fsReconnect() {
  if (!fsHandle) return;
  try { const p = await fsHandle.requestPermission({ mode: 'readwrite' }); if (p === 'granted') { fsState = 'ok'; await fsCheckNewer(); } }
  catch (e) { toast('No se pudo reconectar: ' + e.message, 'danger'); }
  renderFs(); renderNotices();
}
async function fsUnlink() {
  fsHandle = null; fsState = FS_OK ? 'none' : 'unsupported'; clearTimeout(fsTimer); fsTimer = null;
  fsSeenMtime = 0; fsSeenLc = 0;
  try { await idbDel('sync'); await idbDel('seenMtime'); await idbDel('seenLc'); } catch {}
  renderFs(); renderNotices();
  toast('Archivo desvinculado. El archivo sigue en tu disco.', 'info');
}
function renderFsPill() {
  const pill = $('#syncPill');
  if (!fsHandle || fsState === 'none' || fsState === 'unsupported') { pill.hidden = true; return; }
  pill.hidden = false;
  pill.className = 'pill';
  if (fsState === 'perm') { pill.classList.add('warn'); pill.textContent = '🗄️ Reconectar archivo'; }
  else if (fsState === 'conflict') { pill.classList.add('warn'); pill.textContent = '🗄️ Revisar archivo'; }
  else if (fsErr) { pill.classList.add('err'); pill.textContent = '🗄️ Error al guardar'; }
  else if (fsTimer || fsBusy) pill.textContent = '🗄️ Guardando…';
  else pill.textContent = '🗄️ Guardado';
  pill.title = `Archivo: ${fsName()}${fsLastWrite ? ' · última escritura ' + fmtTime(fsLastWrite) : ''}${fsErr ? ' · ' + fsErr : ''}`;
}
$('#syncPill').addEventListener('click', () => { if (fsState === 'perm') fsReconnect(); else if (fsState === 'conflict') fsCheckNewer(); else showTab('settings'); });
function renderFs() {
  renderFsPill();
  if (!$('#fsStatus')) return;
  let st = '', btns = '';
  switch (fsState) {
    case 'unsupported': st = '⚪ No disponible en este navegador. Usa Chrome o Edge (o usa las copias de seguridad).'; break;
    case 'none': st = '⚪ Sin archivo vinculado'; btns = '<button class="btn primary" data-fs="new">🔗 Vincular nuevo archivo</button><button class="btn" data-fs="open">📂 Abrir archivo existente</button>'; break;
    case 'ok': st = fsErr ? `🔴 Error al guardar en «${esc(fsName())}»: ${esc(fsErr)}` : `🟢 Guardando en «${esc(fsName())}»${fsLastWrite ? ` · última escritura a las ${fmtTime(fsLastWrite)}` : ''}${CRYPT ? ' · cifrado' : ''}`; btns = '<button class="btn" data-fs="write">💾 Guardar ahora</button><button class="btn" data-fs="new">🔗 Cambiar de archivo</button><button class="btn ghost" data-fs="unlink">Desvincular</button>'; break;
    case 'perm': st = `🟡 El navegador necesita que vuelvas a autorizar «${esc(fsName())}»`; btns = '<button class="btn primary" data-fs="reconnect">Reconectar</button><button class="btn ghost" data-fs="unlink">Desvincular</button>'; break;
    case 'conflict': st = `🟡 Guardado en pausa: hay diferencias con «${esc(fsName())}»`; btns = '<button class="btn primary" data-fs="resolve">Resolver</button><button class="btn ghost" data-fs="unlink">Desvincular</button>'; break;
  }
  $('#fsStatus').innerHTML = st;
  $('#fsBtns').innerHTML = btns;
  renderProtect();
}
$('#fsBtns').addEventListener('click', e => {
  const b = e.target.closest('[data-fs]'); if (!b) return;
  ({ new: fsLinkNew, open: fsOpenExisting, write: async () => { flushNote(); await fsWrite(); toast(fsErr ? 'No se pudo guardar' : 'Guardado en el archivo', fsErr ? 'danger' : 'success', 1800); }, unlink: fsUnlink, reconnect: fsReconnect, resolve: fsCheckNewer })[b.dataset.fs]();
});

/* ---------- Datos ---------- */
const KEY_LABELS = { notes: '📝 Notas', tasks: '📋 Kanban', todos: '☑️ Tareas', events: '📅 Calendario', timeEntries: '⏱️ Horas', vault: '📦 Almacén cifrado', calcHistory: '🧮 Historial de la calculadora', bookmarks: '🔖 Marcadores', habits: '🔁 Hábitos', focusLog: '🍅 Pomodoro', templates: '📄 Plantillas', mindmaps: '🧠 Mapas mentales', tagMeta: '🏷️ Etiquetas (colores y descripciones)', holidays: '🎉 Festivos', projects: '🗂️ Proyectos' };
let storageQuota = null;
const fmtSize = n => n >= 1073741824 ? (n / 1073741824).toFixed(1) + ' GB' : n >= 1048576 ? Math.round(n / 1048576) + ' MB' : Math.round(n / 1024) + ' KB';
function renderDataUsage() {
  const idb = BACKEND.kind === 'idb';
  const used = store.size(), cap = idb ? Math.max(used * 4, (storageQuota || 0)) || 500 * 1024 * 1024 : 5 * 1024 * 1024, pct = Math.min(100, used / cap * 100);
  if (idb && storageQuota == null && navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(e => { storageQuota = e.quota || 0; if (currentTab === 'settings') renderDataUsage(); }).catch(() => { storageQuota = 0; });
  const rows = store.breakdown().filter(r => KEY_LABELS[r.k]).slice(0, 8);
  $('#dataUsage').innerHTML = `<div class="row" style="justify-content:space-between"><b>${(used / 1024).toFixed(0)} KB usados</b><span class="muted small">${idb ? `IndexedDB${storageQuota ? ` · hasta ${fmtSize(storageQuota)}` : ''}` : `localStorage · de unos 5 MB · ${pct.toFixed(1)} %`}</span></div>
    <div class="meter"><span style="width:${Math.max(1, pct)}%;background:${pct > 80 ? 'var(--danger)' : pct > 60 ? 'var(--warning)' : 'var(--success)'}"></span></div>
    ${CRYPT ? '<p class="muted small" style="margin-top:8px">Con el bloqueo activado todo se guarda en un único bloque cifrado.</p>' : rows.length ? `<div class="list" style="margin-top:10px">${rows.map(r => `<div class="list-item" style="cursor:default;padding:5px 8px"><span class="grow">${KEY_LABELS[r.k]}</span><span class="muted small">${(r.bytes / 1024).toFixed(1)} KB</span></div>`).join('')}</div>` : ''}`;
  const legacy = legacyPresent();
  $('#legacyBox').innerHTML = legacy.length ? `<div class="status-line" style="margin-top:12px;flex-wrap:wrap"><span class="grow">⚠️ Quedan datos de la versión antigua (ToDoNotas) guardados <b>sin cifrar</b> en este navegador. Ya se importaron aquí; si ya no usas ese archivo, puedes borrarlos.</span><button class="btn sm" id="legacyDel">Borrar datos antiguos</button></div>` : '';
  const ld = $('#legacyDel');
  if (ld) ld.onclick = async () => {
    if (!(await confirmDialog('Se borrarán los datos que guardaba la versión antigua (ToDoNotas.html). Si aún usas ese archivo, perderá sus notas y tareas. ¿Continuar?', 'Borrar'))) return;
    LEGACY_KEYS.forEach(k => { try { localStorage.removeItem(k); } catch {} });
    renderDataUsage(); toast('Datos antiguos borrados', 'success');
  };
}
async function wipeDialog() {
  const r = await modal({
    title: '🗑️ Borrar todos los datos',
    body: '<p>Se eliminarán <b>todas</b> las notas, tareas, eventos, horas, hábitos, marcadores, el almacén, los ajustes <b>y el historial de versiones</b> de este navegador. No se puede deshacer.</p><p class="muted small">Las copias exportadas y el archivo vinculado de tu disco no se tocan (el archivo se desvincula).</p><div><label class="lbl">Escribe BORRAR para confirmar</label><input class="field" type="text" name="c" autocomplete="off"></div>',
    actions: [{ label: 'Cancelar', value: null, cls: 'ghost' }, { label: 'Borrar todo', value: 'ok', cls: 'danger-solid', validate: f => f.elements.namedItem('c').value.trim().toUpperCase() === 'BORRAR' ? null : 'Escribe BORRAR para confirmar' }]
  });
  if (!r) return;
  APP_READY = false; FROZEN = true; clearTimeout(encTimer); clearTimeout(fsTimer); CRYPT = null;
  if (typeof noteDirty !== 'undefined') noteDirty = false;
  ls.keys().forEach(k => ls.del(k));
  rawLS.keys().forEach(k => rawLS.del(k));
  ls.set('migrated', true);
  try { await idbDel('sync'); } catch {}
  try { await histClear(); } catch {}
  reloadSafe();
}

/* ---------- Render de Ajustes ---------- */
function renderSecurity() {
  const on = lockEnabled();
  $('#secStatus').innerHTML = on ? '🔒 <b>Activado</b> · los datos se guardan cifrados en este navegador' : '🔓 <b>Desactivado</b> · los datos se guardan sin cifrar en este navegador';
  $('#secBtns').innerHTML = on ? '<button class="btn" data-sec="lock">🔒 Bloquear ahora</button><button class="btn" data-sec="change">🔑 Cambiar contraseña</button><button class="btn ghost" data-sec="off">Desactivar</button>' : '<button class="btn primary" data-sec="on">🔒 Activar bloqueo</button>';
  $('#secAutoWrap').hidden = !on;
  $('#secAuto').value = String(lockMeta().autoLock || 0);
  $('#lockNowBtn').hidden = !on;
}
function renderSettings() {
  if (!$('#secStatus')) return;
  renderSecurity();
  const last = store.get('lastBackup', 0);
  $('#bkStatus').innerHTML = last ? `🗓️ Última copia exportada: <b>${esc(fmtDateTime(last))}</b> (${esc(relTime(last))})` : '🗓️ Aún no has exportado ninguna copia';
  $('#bkRemind').value = String(S.prefs.backupDays ?? 14);
  $('#setName').value = store.get('userName', '');
  $('#setTheme').value = themePref;
  $('#setStart').value = S.prefs.start || 'last';
  renderFs();
  renderDataUsage();
  renderHistory();
  renderProtect();
}
onShow.settings = renderSettings;
$('#secBtns').addEventListener('click', e => {
  const b = e.target.closest('[data-sec]'); if (!b) return;
  ({ on: enableLockDialog, off: disableLockDialog, change: changePasswordDialog, lock: lockNow })[b.dataset.sec]();
});
$('#secAuto').addEventListener('change', e => { ls.set('lock', { ...lockMeta(), autoLock: +e.target.value }); toast('Bloqueo automático actualizado', 'success', 1400); });
$('#lockNowBtn').addEventListener('click', lockNow);
$('#bkExport').addEventListener('click', exportBackupDialog);
$('#bkImport').addEventListener('click', () => $('#bkImportFile').click());
$('#bkImportFile').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) importBackupFile(f); });
$('#bkRemind').addEventListener('change', e => { S.prefs.backupDays = +e.target.value; save.prefs(); });
$('#setName').addEventListener('change', e => { store.set('userName', e.target.value.trim()); });
$('#setTheme').addEventListener('change', e => setThemePref(e.target.value));
$('#setStart').addEventListener('change', e => { S.prefs.start = e.target.value; save.prefs(); });
$('#setShortcuts').addEventListener('click', showShortcuts);
$('#wipeAll').addEventListener('click', wipeDialog);

/* ---------- Licencia y créditos ---------- */
$('#licLink').addEventListener('click', () => {
  showTab('settings');
  const d = $('#licDetails'); if (d) d.open = true;
  setTimeout(() => { const c = $('#licCard'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
});
