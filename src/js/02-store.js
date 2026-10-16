/* =====================================================================
   ALMACENAMIENTO · CIFRADO EN REPOSO · MIGRACIÓN
   ===================================================================== */
/*
  Todos los datos viven en memoria (MEM) y se persisten en IndexedDB (o en localStorage si el
  navegador no lo permite) mediante el objeto «ls»:
   · Modo normal: una clave por colección (cdm.notes, cdm.tasks…), escritura síncrona.
   · Modo bloqueado: un único bloque cifrado (cdm.enc) con AES-256-GCM; la clave se
     deriva de la contraseña con PBKDF2 y solo existe en memoria mientras la app está abierta.
  Claves que siempre van en claro: tema, metadatos del bloqueo, bloque cifrado y marca de migración.
*/
const PREFIX = 'cdm.';
const PLAIN_KEYS = new Set(['theme', 'lock', 'enc', 'migrated']);
const VOLATILE_KEYS = new Set(['lastTab', 'currentNote', 'pomoState', 'calFilters', 'todoView', 'ttRunning', 'devTool', 'bmSort', 'ttLastProject', 'dlPrefs', 'devHelpOpen', 'rxTab', 'mmViews', 'mmCur', 'mapsMode', 'notesMode']);
const LEGACY_KEYS = ['allNotes', 'kanbanData', 'calcHistory', 'encryptedStorage', 'dashboardStats'];
let MEM = {};
let CRYPT = null;          // { key, salt, iter } cuando el bloqueo está activo y desbloqueado
let APP_READY = false;
let FROZEN = false;          // tras importar o borrar todo: no se admiten más escrituras hasta recargar

/* ---------- Primitivas criptográficas (compartidas con el encriptador) ---------- */
const te = new TextEncoder(), td = new TextDecoder();
const ITER = 600000;
const randBytes = n => crypto.getRandomValues(new Uint8Array(n));
function concatBytes(...arrs) { const out = new Uint8Array(arrs.reduce((a, b) => a + b.length, 0)); let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; } return out; }
function b64enc(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
function b64dec(str) { const bin = atob(str); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
async function deriveKey(pass, salt, iterations = ITER) {
  const km = await crypto.subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function aesEncryptJson(obj, key) {
  const iv = randBytes(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(obj))));
  return { iv: b64enc(iv), ct: b64enc(ct) };
}
async function aesDecryptJson(ivB64, ctB64, key) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64dec(ivB64) }, key, b64dec(ctB64));
  return JSON.parse(td.decode(new Uint8Array(pt)));
}

/* ---------- Motor de almacenamiento: IndexedDB (principal) o localStorage (respaldo) ----------
   Los datos se guardan como pares clave → texto JSON, igual que antes. Con IndexedDB se cargan
   todos en memoria al arrancar (KV) y cada escritura se envía en segundo plano, sin bloquear la
   pantalla y sin el límite de ~5 MB. Si el navegador no permite IndexedDB, se usa localStorage. */
const BACKEND = { kind: 'ls', db: null, error: '' };
const KV = new Map();
const kvPending = new Map();          // clave → texto (o null = borrar) pendiente de escribir
let kvFlushQueued = false, kvWarnedAt = 0;
let storageWarnedAt = 0;
function storageFull() {
  if (Date.now() - storageWarnedAt < 10000) return;
  storageWarnedAt = Date.now();
  toast('No se pudo guardar: el almacenamiento del navegador está lleno o bloqueado. Exporta una copia y libera espacio en Ajustes.', 'danger', 8000);
}
function kvFlush() {
  kvFlushQueued = false;
  if (!kvPending.size || !BACKEND.db) return Promise.resolve();
  const batch = [...kvPending]; kvPending.clear();
  return new Promise(res => {
    let tx;
    try { tx = BACKEND.db.transaction('kv', 'readwrite'); } catch (e) { batch.forEach(([k, v]) => kvPending.set(k, v)); res(); return; }
    const st = tx.objectStore('kv');
    batch.forEach(([k, v]) => { if (v === null) st.delete(k); else st.put(v, k); });
    tx.oncomplete = () => res();
    tx.onerror = tx.onabort = () => {
      if (Date.now() - kvWarnedAt > 10000) { kvWarnedAt = Date.now(); storageFull(); }
      res();
    };
  });
}
function kvQueue(k, v) {
  kvPending.set(k, v);
  if (!kvFlushQueued) { kvFlushQueued = true; queueMicrotask(kvFlush); }
}
/** Espera a que todo lo pendiente esté escrito (antes de recargar, al ocultar la pestaña…). */
const storageSync = () => BACKEND.kind === 'idb' ? kvFlush() : Promise.resolve();
const rawLS = {
  get: k => { try { return localStorage.getItem(PREFIX + k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(PREFIX + k, v); return true; } catch { return false; } },
  del: k => { try { localStorage.removeItem(PREFIX + k); } catch {} },
  keys: () => { const out = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(PREFIX)) out.push(k.slice(PREFIX.length)); } } catch {} return out; }
};
const ls = {
  raw(k) { return BACKEND.kind === 'idb' ? (KV.has(k) ? KV.get(k) : null) : rawLS.get(k); },
  get(k, def) { const v = this.raw(k); if (v === null || v === undefined) return def; try { return JSON.parse(v); } catch { return def; } },
  setRaw(k, str) {
    if (k === 'theme') rawLS.set(k, str);                      // el tema también en localStorage: se aplica antes de cargar
    if (BACKEND.kind === 'idb') { KV.set(k, str); kvQueue(k, str); return true; }
    if (!rawLS.set(k, str)) { storageFull(); return false; }
    return true;
  },
  set(k, v) { return this.setRaw(k, JSON.stringify(v)); },
  del(k) { if (BACKEND.kind === 'idb') { KV.delete(k); kvQueue(k, null); } else rawLS.del(k); },
  keys() { return BACKEND.kind === 'idb' ? [...KV.keys()] : rawLS.keys(); }
};
function idbOpenData() {
  return new Promise((res, rej) => {
    if (!window.indexedDB) { rej(new Error('IndexedDB no disponible')); return; }
    let r;
    try { r = indexedDB.open('cdm-data', 1); } catch (e) { rej(e); return; }
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => { const db = r.result; db.onversionchange = () => db.close(); res(db); };
    r.onerror = () => rej(r.error || new Error('No se pudo abrir IndexedDB'));
    r.onblocked = () => rej(new Error('IndexedDB bloqueado'));
    setTimeout(() => rej(new Error('IndexedDB no responde')), 4000);
  });
}
/** Arranque del almacenamiento: abre IndexedDB, carga todo y, la primera vez, migra desde localStorage. */
async function storageInit() {
  let db;
  try { db = await idbOpenData(); }
  catch (e) { BACKEND.kind = 'ls'; BACKEND.error = (e && e.message) || String(e); return; }
  const all = await new Promise((res, rej) => {
    const tx = db.transaction('kv', 'readonly'), st = tx.objectStore('kv'), keys = st.getAllKeys(), vals = st.getAll();
    tx.oncomplete = () => res(keys.result.map((k, i) => [k, vals.result[i]]));
    tx.onerror = () => rej(tx.error);
  }).catch(() => null);
  if (!all) { BACKEND.kind = 'ls'; BACKEND.error = 'No se pudieron leer los datos de IndexedDB'; db.close(); return; }
  all.forEach(([k, v]) => KV.set(k, v));
  BACKEND.db = db; BACKEND.kind = 'idb';
  // Migración: datos en localStorage (versiones anteriores o respaldo) y nada aún en IndexedDB
  const lsKeys = rawLS.keys().filter(k => k !== 'backend');
  const hasData = k => k !== 'theme';
  if (!KV.size && lsKeys.some(hasData)) {
    lsKeys.forEach(k => { const v = rawLS.get(k); if (v !== null) { KV.set(k, v); kvPending.set(k, v); } });
    await kvFlush();
    const check = await new Promise(res => { const tx = db.transaction('kv', 'readonly'); const c = tx.objectStore('kv').count(); tx.oncomplete = () => res(c.result); tx.onerror = () => res(-1); });
    if (check >= lsKeys.length) { lsKeys.filter(hasData).forEach(k => rawLS.del(k)); BACKEND.migrated = lsKeys.length; }
    else { KV.clear(); BACKEND.kind = 'ls'; BACKEND.db = null; BACKEND.error = 'La migración a IndexedDB no se pudo verificar; se sigue usando localStorage'; return; }
  }
  rawLS.set('backend', '"idb"');
}
/** Recarga la página cuando todo lo pendiente esté guardado. */
function reloadSafe() { storageSync().then(() => location.reload(), () => location.reload()); }
document.addEventListener('visibilitychange', () => { if (document.hidden) storageSync(); });
window.addEventListener('pagehide', () => { storageSync(); });

/* ---------- API de almacenamiento para los módulos ---------- */
const store = {
  get(k, def) {
    if (PLAIN_KEYS.has(k)) return ls.get(k, def);
    return Object.prototype.hasOwnProperty.call(MEM, k) ? MEM[k] : def;
  },
  set(k, v) {
    if (FROZEN) return false;
    if (PLAIN_KEYS.has(k)) return ls.set(k, v);
    MEM[k] = v;
    const real = !VOLATILE_KEYS.has(k);
    if (real) MEM.lastChange = Date.now();
    if (CRYPT) scheduleEncFlush();
    else { ls.set(k, v); if (real) ls.set('lastChange', MEM.lastChange); }
    if (real && APP_READY) fileSyncSchedule();
    return true;
  },
  legacy(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  size() {
    let n = 0;
    ls.keys().forEach(k => { n += (k.length + (ls.raw(k) || '').length) * 2; });
    return n;
  },
  breakdown() {
    if (CRYPT) return [];
    return ls.keys().filter(k => !PLAIN_KEYS.has(k)).map(k => ({ k, bytes: ((ls.raw(k) || '').length + k.length) * 2 })).sort((a, b) => b.bytes - a.bytes);
  }
};

/* ---------- Escritura cifrada ---------- */
let encTimer = null, encChain = Promise.resolve();
function scheduleEncFlush() { clearTimeout(encTimer); encTimer = setTimeout(flushEnc, 250); }
function flushEnc() {
  clearTimeout(encTimer); encTimer = null;
  encChain = encChain.then(async () => {
    if (!CRYPT || FROZEN) return;
    const blob = await aesEncryptJson(MEM, CRYPT.key);
    ls.setRaw('enc', JSON.stringify({ v: 1, ...blob }));
  }).catch(() => {});
  return encChain;
}

/* ---------- Carga ---------- */
function loadPlain() {
  MEM = {};
  ls.keys().forEach(k => { if (!PLAIN_KEYS.has(k)) MEM[k] = ls.get(k, null); });
  migrateLegacy();
}
async function unlockWith(pass) {
  const meta = ls.get('lock', null), blob = ls.get('enc', null);
  if (!meta || !blob) throw new Error('nodata');
  const key = await deriveKey(pass, b64dec(meta.salt), meta.iter || ITER);
  const data = await aesDecryptJson(blob.iv, blob.ct, key); // lanza si la contraseña no es correcta
  MEM = data && typeof data === 'object' ? data : {};
  CRYPT = { key, salt: meta.salt, iter: meta.iter || ITER };
}
const lockMeta = () => ls.get('lock', { enabled: false });
const lockEnabled = () => !!(CRYPT && lockMeta().enabled);

async function enableLock(pass) {
  const salt = randBytes(16);
  const key = await deriveKey(pass, salt, ITER);
  const meta = { ...lockMeta(), enabled: true, salt: b64enc(salt), iter: ITER };
  CRYPT = { key, salt: meta.salt, iter: ITER };
  ls.set('lock', meta);
  await flushEnc();
  if (!ls.raw('enc')) throw new Error('No se pudo escribir el bloque cifrado');
  ls.keys().forEach(k => { if (!PLAIN_KEYS.has(k)) ls.del(k); });
}
async function disableLock() {
  await flushEnc();
  const data = MEM;
  CRYPT = null;
  Object.keys(data).forEach(k => ls.set(k, data[k]));
  ls.del('enc');
  ls.set('lock', { ...lockMeta(), enabled: false, salt: undefined, iter: undefined });
}
async function changeLockPassword(pass) {
  const salt = randBytes(16);
  const key = await deriveKey(pass, salt, ITER);
  CRYPT = { key, salt: b64enc(salt), iter: ITER };
  ls.set('lock', { ...lockMeta(), enabled: true, salt: CRYPT.salt, iter: ITER });
  await flushEnc();
}
async function verifyLockPassword(pass) {
  const meta = lockMeta();
  try {
    const key = await deriveKey(pass, b64dec(meta.salt), meta.iter || ITER);
    const blob = ls.get('enc', null);
    await aesDecryptJson(blob.iv, blob.ct, key);
    return true;
  } catch { return false; }
}

/* ---------- Copias de seguridad (formato común para exportar y para el archivo de disco) ---------- */
const BACKUP_APP = 'cuadro-de-mando';
function backupPlain(data = MEM) {
  return { app: BACKUP_APP, version: 3, exportedAt: new Date().toISOString(), lastChange: data.lastChange || 0, data };
}
async function backupEncrypted(key, saltB64, iter, data = MEM) {
  const blob = await aesEncryptJson(data, key);
  return { app: BACKUP_APP, version: 3, exportedAt: new Date().toISOString(), lastChange: data.lastChange || 0, encrypted: true, kdf: { name: 'PBKDF2-SHA256', salt: saltB64, iter }, iv: blob.iv, data: blob.ct };
}
async function backupWithPassword(pass) {
  const salt = randBytes(16);
  const key = await deriveKey(pass, salt, ITER);
  return backupEncrypted(key, b64enc(salt), ITER);
}
function isBackup(o) { return o && o.app === BACKUP_APP && (o.encrypted ? typeof o.data === 'string' : (o.data && typeof o.data === 'object')); }
async function openBackup(o, pass) {
  if (!o.encrypted) return o.data;
  let key;
  if (CRYPT && o.kdf && o.kdf.salt === CRYPT.salt && pass == null) key = CRYPT.key;
  else key = await deriveKey(pass, b64dec(o.kdf.salt), o.kdf.iter || ITER);
  return aesDecryptJson(o.iv, o.data, key);
}
/** Sustituye TODOS los datos por los de una copia y recarga.
    Se marca como el cambio más reciente: así el archivo vinculado no lo «pisa» al reabrir. */
async function replaceAllData(data) {
  const clean = {};
  for (const [k, v] of Object.entries(data || {})) if (!PLAIN_KEYS.has(k)) clean[k] = v;
  clean.lastChange = Date.now();
  if (data && (data.theme === 'light' || data.theme === 'dark' || data.theme === 'system')) ls.set('theme', data.theme);
  ls.set('migrated', true);
  clean.currentNote = null;
  MEM = clean;
  if (CRYPT) await flushEnc();
  else {
    ls.keys().forEach(k => { if (!PLAIN_KEYS.has(k)) ls.del(k); });
    Object.keys(MEM).forEach(k => ls.set(k, MEM[k]));
  }
  FROZEN = true; APP_READY = false;
}

/* ---------- Migración desde versiones anteriores ---------- */
const WELCOME_HTML = '<h2>¡Bienvenido a tu Cuadro de Mando! 👋</h2><div>Todo lo que hagas aquí se guarda <b>solo en este navegador</b>. Algunas ideas para empezar:</div><div><input type="checkbox" class="chk">&nbsp;Pulsa <b>Ctrl + K</b> para buscar en todo o lanzar acciones</div><div><input type="checkbox" class="chk">&nbsp;Apunta tus pendientes en <b>Tareas</b>: entiende «mañana», «el viernes», <code>#lista</code> o <code>!</code></div><div><input type="checkbox" class="chk">&nbsp;Organiza proyectos en el <b>Kanban</b> y registra tu tiempo en <b>Horas</b></div><div><input type="checkbox" class="chk">&nbsp;En <b>Ajustes</b>, activa el bloqueo con contraseña y vincula un archivo de copia</div><div><br></div><blockquote>Consejo: pulsa ⌨️ arriba a la derecha para ver todos los atajos de teclado.</blockquote>';

function migrateLegacy() {
  if (ls.get('migrated', false)) return;
  const oldNotes = store.legacy('allNotes');
  if (Array.isArray(oldNotes) && !store.get('notes', null)) {
    store.set('notes', oldNotes.filter(n => n && typeof n === 'object').map(n => {
      const ts = Number(n.id) || Date.now();
      return { id: String(n.id || uid()), title: String(n.title || 'Sin título'), html: n.contentHTML ?? n.content ?? '', text: '', pinned: false, created: ts, updated: ts };
    }));
  }
  const oldKb = store.legacy('kanbanData');
  if (oldKb && typeof oldKb === 'object' && !store.get('tasks', null)) {
    const cols = { todo: oldKb.todo || [], doing: oldKb.inProgress || oldKb.progress || [], done: oldKb.done || [] };
    const tasks = [];
    for (const [col, arr] of Object.entries(cols)) {
      (Array.isArray(arr) ? arr : []).forEach(t => {
        const title = typeof t === 'string' ? t : t && t.text;
        if (!title) return;
        const subs = (t && Array.isArray(t.subtasks) ? t.subtasks : []).map(s => ({ id: uid(), text: String(typeof s === 'string' ? s : (s && s.text) || ''), done: !!(s && s.done) })).filter(s => s.text);
        tasks.push({ id: uid(), title: String(title), desc: '', col, priority: 'media', due: '', tags: [], subtasks: subs, created: Date.now(), ...(col === 'done' ? { completedAt: Date.now() } : {}) });
      });
    }
    store.set('tasks', tasks);
  }
  const oldHist = store.legacy('calcHistory');
  if (Array.isArray(oldHist) && !store.get('calcHistory', null)) {
    store.set('calcHistory', oldHist.map(e => {
      const s = String(e); const i = s.lastIndexOf(' = ');
      return i > -1 ? { expr: s.slice(0, i).replace(/\s+/g, ''), result: s.slice(i + 3), at: Date.now() } : null;
    }).filter(Boolean).slice(-200));
  }
  const oldVault = store.legacy('encryptedStorage');
  if (Array.isArray(oldVault) && !store.get('vault', null)) {
    store.set('vault', oldVault.filter(v => v && v.content).map(v => ({ id: String(v.id || uid()), name: String(v.name || 'Sin nombre'), content: String(v.content), created: Number(v.id) || Date.now() })));
  }
  try { if (localStorage.getItem('theme') === 'light' && !ls.get('theme', null)) ls.set('theme', 'light'); } catch {}
  if (!(store.get('notes', []) || []).length && !(store.get('tasks', []) || []).length) {
    const now = Date.now();
    store.set('notes', [{ id: uid(), title: 'Bienvenida', html: WELCOME_HTML, text: '', pinned: true, created: now, updated: now }]);
  }
  ls.set('migrated', true);
}
const legacyPresent = () => LEGACY_KEYS.filter(k => { try { return localStorage.getItem(k) !== null; } catch { return false; } });

/* ---------- Estado de la aplicación ---------- */
const S = {};
const DEFAULT_LISTS = [{ id: 'inbox', name: 'Tareas', emoji: '📥' }];
function loadState() {
  S.notes = store.get('notes', []) || [];
  S.tasks = store.get('tasks', []) || [];
  S.calcHist = store.get('calcHistory', []) || [];
  S.vault = store.get('vault', []) || [];
  S.focusLog = store.get('focusLog', []) || [];
  S.pomo = Object.assign({ focus: 25, short: 5, long: 15, every: 4, auto: false, sound: true }, store.get('pomoSettings', {}));
  S.todos = store.get('todos', []) || [];
  S.todoLists = store.get('todoLists', null) || clone(DEFAULT_LISTS);
  if (!S.todoLists.some(l => l.id === 'inbox')) S.todoLists.unshift(clone(DEFAULT_LISTS[0]));
  S.events = store.get('events', []) || [];
  S.holidays = store.get('holidays', []) || [];
  S.habits = store.get('habits', []) || [];
  S.projects = store.get('projects', []) || [];
  S.timeEntries = store.get('timeEntries', []) || [];
  S.bookmarks = store.get('bookmarks', []) || [];
  S.templates = store.get('templates', []) || [];
  S.mindmaps = (store.get('mindmaps', []) || []).filter(m => m && m.root);
  S.prefs = Object.assign({ start: 'last', backupDays: 14 }, store.get('prefs', {}));
}
const save = {
  notes: () => store.set('notes', S.notes),
  tasks: () => store.set('tasks', S.tasks),
  calc: () => store.set('calcHistory', S.calcHist),
  vault: () => store.set('vault', S.vault),
  focus: () => store.set('focusLog', S.focusLog),
  pomo: () => store.set('pomoSettings', S.pomo),
  todos: () => store.set('todos', S.todos),
  todoLists: () => store.set('todoLists', S.todoLists),
  events: () => store.set('events', S.events),
  holidays: () => store.set('holidays', S.holidays),
  habits: () => store.set('habits', S.habits),
  projects: () => store.set('projects', S.projects),
  time: () => store.set('timeEntries', S.timeEntries),
  bookmarks: () => store.set('bookmarks', S.bookmarks),
  templates: () => store.set('templates', S.templates),
  mindmaps: () => store.set('mindmaps', S.mindmaps),
  prefs: () => store.set('prefs', S.prefs)
};
