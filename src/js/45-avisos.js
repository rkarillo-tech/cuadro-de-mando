/* =====================================================================
   AVISOS · la alarma que se queda en pantalla
   =====================================================================
   Cada evento puede llevar un aviso: a su hora, un rato antes, o a una hora
   concreta que elijas (el mismo día o días antes). Las tareas y las tarjetas del
   Kanban también, a una hora concreta del día en que vencen o de días antes
   (solo tienen fecha, no hora, así que «un rato antes» no tendría de dónde contar). Cuando llega el momento, el
   aviso aparece abajo a la izquierda y SE QUEDA AHÍ hasta que lo cierres o lo
   pospongas: así queda constancia aunque no estuvieras mirando. Si el navegador
   tiene permiso, además salta una notificación del sistema y suena un aviso.

   Importante y honesto: la app no tiene servidor ni proceso en segundo plano, así
   que los avisos solo suenan con la aplicación abierta (aunque sea en otra
   pestaña). Si estaba cerrada, el aviso te espera y lo ves al volver a abrirla
   (hasta 36 horas después).

   Lo que ya has cerrado o pospuesto es de CADA equipo (no viaja en el archivo
   compartido): así el aviso te salta igual en el portátil de casa aunque ese día
   lo cerraras en el del trabajo.
*/
const ALARM_LABELS = {
  '': 'Sin aviso',
  at: 'A la hora del evento',
  '5m': '5 minutos antes',
  '10m': '10 minutos antes',
  '15m': '15 minutos antes',
  '30m': '30 minutos antes',
  '1h': '1 hora antes',
  '2h': '2 horas antes',
  '1d': '1 día antes',
  custom: 'A una hora concreta…'
};
const ALARM_OFFSETS = { at: 0, '5m': 5, '10m': 10, '15m': 15, '30m': 30, '1h': 60, '2h': 120, '1d': 1440 };
const ALARM_DAYS = [[0, 'El mismo día'], [-1, 'El día antes'], [-2, 'Dos días antes'], [-3, 'Tres días antes'], [-7, 'Una semana antes']];
const ALARM_RE = /^(-\d{1,2})?@(\d{1,2}):(\d{2})$/;
const AV_BASE_HORA = '09:00';            // de qué hora se cuentan los avisos en eventos de todo el día
const AV_VENTANA = 36 * 3600e3;          // un aviso más viejo que esto ya no se muestra
const AV_DEF = { sound: true };
const AV_SNOOZES = [[5, '5 min'], [10, '10 min'], [30, '30 min'], [60, '1 hora']];

const avPrefs = () => ({ ...AV_DEF, ...(plainObj(store.get('avisos', null)) ? store.get('avisos', {}) : {}) });
const avMap = k => { const v = store.get(k, null); return plainObj(v) ? v : {}; };
const avSetMap = (k, v) => store.set(k, v);

/** Separa el valor guardado en el evento en las piezas que pide el formulario. */
function alarmParts(a) {
  const s = String(a || '');
  const m = ALARM_RE.exec(s);
  if (m) return { preset: 'custom', day: Number(m[1] || 0), time: pad(+m[2]) + ':' + m[3] };
  return { preset: ALARM_OFFSETS[s] != null ? s : '', day: 0, time: AV_BASE_HORA };
}
/** Compone el valor a guardar a partir de lo elegido en el formulario. */
function alarmValue(preset, day, time) {
  if (preset !== 'custom') return ALARM_OFFSETS[preset] != null ? preset : '';
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(time || ''));
  if (!m) return '';
  const d = Number(day) || 0;
  return (d ? String(d) : '') + '@' + pad(+m[1]) + ':' + m[2];
}
/** Texto corto para enseñar el aviso configurado («20:00 del día antes»). */
function alarmLabel(a) {
  const s = String(a || '');
  if (!s) return '';
  if (ALARM_OFFSETS[s] != null) return ALARM_LABELS[s];
  const m = ALARM_RE.exec(s);
  if (!m) return '';
  const dia = (ALARM_DAYS.find(([k]) => k === Number(m[1] || 0)) || [0, 'El mismo día'])[1];
  return `${pad(+m[2])}:${m[3]} · ${dia.toLowerCase()}`;
}
/** Momento exacto (en milisegundos) del aviso para la repetición que cae en «key». */
function alarmAt(ev, key) {
  if (!ev || !ev.alarm || !isValidDay(key)) return 0;
  const m = ALARM_RE.exec(String(ev.alarm));
  if (m) {
    const d = addDays(parseDay(key), Number(m[1] || 0));
    d.setHours(+m[2], +m[3], 0, 0);
    return d.getTime();
  }
  const off = ALARM_OFFSETS[ev.alarm];
  if (off == null) return 0;
  const hm = /^(\d{1,2}):(\d{2})$/.exec(ev.allDay ? AV_BASE_HORA : (ev.start || AV_BASE_HORA)) || [0, 9, '00'];
  const base = parseDay(key);
  base.setHours(+hm[1], +hm[2], 0, 0);
  return base.getTime() - off * 60000;
}

/* ---------- .ics: el aviso también se exporta e importa ---------- */
function icsTrigger(alarm, date, allDay, start) {
  const p = alarmParts(alarm);
  if (p.preset === 'custom') {
    const at = alarmAt({ alarm, allDay, start }, date);
    if (!at) return '';
    return 'TRIGGER;VALUE=DATE-TIME:' + new Date(at).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }
  const mins = ALARM_OFFSETS[p.preset];
  if (mins == null) return '';
  if (!mins) return 'TRIGGER:-PT0M';
  if (mins % 1440 === 0) return `TRIGGER:-P${mins / 1440}D`;
  if (mins % 60 === 0) return `TRIGGER:-PT${mins / 60}H`;
  return `TRIGGER:-PT${mins}M`;
}
/** Traduce el TRIGGER de un .ics ajeno al aviso más parecido de los nuestros. */
function alarmFromTrigger(trg, ev, dt) {
  const val = String((trg && trg.val) || '').trim();
  const dur = /^-?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(val);
  if (dur && /^-|^P/.test(val)) {
    const mins = (+dur[1] || 0) * 10080 + (+dur[2] || 0) * 1440 + (+dur[3] || 0) * 60 + (+dur[4] || 0) + Math.round((+dur[5] || 0) / 60);
    if (val[0] !== '-' && mins) return '';                       // avisos DESPUÉS del evento: no los tenemos
    const cerca = Object.entries(ALARM_OFFSETS).find(([, v]) => v === mins);
    if (cerca) return cerca[0];
    const base = parseDay(ev.date);
    const hm = /^(\d{1,2}):(\d{2})$/.exec(ev.allDay ? AV_BASE_HORA : ev.start) || [0, 9, '00'];
    base.setHours(+hm[1], +hm[2], 0, 0);
    const d = new Date(base.getTime() - mins * 60000);
    return alarmValue('custom', -diffDays(dayKey(d), ev.date), pad(d.getHours()) + ':' + pad(d.getMinutes()));
  }
  const abs = dt && dt(trg);
  if (abs && !abs.allDay) return alarmValue('custom', -diffDays(abs.date, ev.date), abs.time);
  return '';
}

/* ---------- Tareas y tarjetas del Kanban ---------- */
/** El campo «Aviso» de una tarea o tarjeta: el día (o «Sin aviso») y la hora. */
function alarmTaskFieldHtml(alarm) {
  const p = alarmParts(alarm), on = p.preset === 'custom';
  return `<div><label class="lbl">Aviso</label>
    <div class="row" style="gap:6px;flex-wrap:nowrap">
      <select class="field" name="alarmDay" style="flex:1;min-width:0"><option value="">Sin aviso</option>${ALARM_DAYS.map(([k, v]) => `<option value="${k}"${on && k === p.day ? ' selected' : ''}>${v}</option>`).join('')}</select>
      <input type="time" class="field" name="alarmTime" value="${esc(p.time)}" style="width:9.5em;flex:none"${on ? '' : ' hidden'}>
    </div></div>`;
}
function alarmTaskFieldInit(form) {
  const day = form.elements.namedItem('alarmDay'), time = form.elements.namedItem('alarmTime');
  day.addEventListener('change', () => { time.hidden = day.value === ''; });
}
/** Sin fecha no hay día del que contar: se pide antes de guardar. */
function alarmTaskValidate(form) {
  if (form.elements.namedItem('alarmDay').value === '') return null;
  if (!isValidDay(form.elements.namedItem('due').value)) return 'Pon una fecha para poder avisarte';
  if (!/^\d{1,2}:\d{2}$/.test(form.elements.namedItem('alarmTime').value)) return 'Elige la hora del aviso';
  return null;
}
const alarmTaskValue = d => d.alarmDay === '' || d.alarmDay == null ? '' : alarmValue('custom', d.alarmDay, d.alarmTime);
/** Guarda el aviso en la tarea o tarjeta (y lo quita del todo si no lleva). */
function alarmTaskSet(obj, d) {
  const v = alarmTaskValue(d);
  if (v && obj.due) obj.alarm = v; else delete obj.alarm;
}
const KB_AV_COLOR = { alta: COLORS[4], media: COLORS[3], baja: COLORS[1] };

/* ---------- Qué avisos toca enseñar ---------- */
/**
 * Todo lo que lleva aviso, con lo necesario para enseñarlo. «uid» va en la clave de lo
 * cerrado o pospuesto: el de los eventos es su id a secas, como antes; tareas y tarjetas
 * llevan delante «td:» o «kb:» para no confundirse con ellos.
 */
function avSources() {
  const out = [];
  (S.events || []).forEach(ev => {
    if (ev.alarm) out.push({ kind: 'event', id: ev.id, uid: ev.id, title: ev.title, color: ev.color, notes: ev.notes, when: avWhenEvent(ev), alarm: ev.alarm, base: ev, dates: (a, b) => eventDates(ev, a, b) });
  });
  const due = t => (a, b) => t.due >= a && t.due <= b ? [t.due] : [];
  (S.todos || []).forEach(t => {
    if (t.alarm && isValidDay(t.due) && !t.done) out.push({ kind: 'todo', id: t.id, uid: 'td:' + t.id, title: t.text, color: COLORS[1], notes: t.notes, when: '☑️ tarea', alarm: t.alarm, base: { alarm: t.alarm, allDay: true }, dates: due(t) });
  });
  (S.tasks || []).forEach(t => {
    if (t.alarm && isValidDay(t.due) && t.col !== 'done') out.push({ kind: 'kanban', id: t.id, uid: 'kb:' + t.id, title: t.title, color: KB_AV_COLOR[t.priority] || COLORS[3], notes: t.desc, when: '📋 Kanban · ' + ((COLS.find(c => c.id === t.col) || {}).name || ''), alarm: t.alarm, base: { alarm: t.alarm, allDay: true }, dates: due(t) });
  });
  return out;
}
/** Todos los avisos (pasados y futuros) que caen en el rango de días indicado. */
function avScan(desde, hasta) {
  const out = [];
  avSources().forEach(ev => {
    ev.dates(desde, hasta).forEach(key => {
      const at = alarmAt(ev.base, key);
      if (at) out.push({ ev, day: key, at, key: ev.uid + '|' + key });
    });
  });
  return out.sort((a, b) => a.at - b.at);
}
const avRange = (atras, adelante) => avScan(dayKey(addDays(new Date(), -atras)), dayKey(addDays(new Date(), adelante)));
/** Los que ya han sonado y ni se han cerrado ni se han pospuesto. */
function avDue() {
  const now = Date.now(), visto = avMap('alarmSeen'), tarde = avMap('alarmSnooze');
  const due = avRange(3, 8).filter(a => {
    const momento = tarde[a.key] > a.at ? tarde[a.key] : a.at;
    return momento <= now && now - momento < AV_VENTANA && !visto[a.key];
  });
  // De un evento que se repite, solo el aviso más reciente: no tiene sentido amontonar los de días pasados.
  const ultimo = new Map();
  due.forEach(a => { const o = ultimo.get(a.ev.uid); if (!o || a.at > o.at) ultimo.set(a.ev.uid, a); });
  return [...ultimo.values()].sort((a, b) => a.at - b.at);
}
/** Los próximos, para la lista de Ajustes. */
const avNext = () => avRange(0, 32).filter(a => a.at > Date.now());

/** «hace 5 min», «ahora mismo», «hace 2 h». */
function avAgo(at) {
  const m = Math.round((Date.now() - at) / 60000);
  if (m < 1) return 'ahora mismo';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} día${h < 48 ? '' : 's'}`;
}
/** «en 10 min», «mañana a las 9:00». */
function avIn(at) {
  const m = Math.round((at - Date.now()) / 60000);
  if (m < 60) return `en ${Math.max(1, m)} min`;
  const d = new Date(at), hoy = dayKey(), k = dayKey(d);
  const hora = pad(d.getHours()) + ':' + pad(d.getMinutes());
  if (k === hoy) return `hoy a las ${hora}`;
  if (k === dayKey(addDays(new Date(), 1))) return `mañana a las ${hora}`;
  return `${fmtDayLabel(k)} a las ${hora}`;
}
const avWhenEvent = ev => ev.allDay ? 'todo el día' : (ev.start || '') + (ev.end && ev.end !== ev.start ? '–' + ev.end : '');

/* ---------- El panel que se queda en pantalla ---------- */
const avWrap = document.createElement('div');
avWrap.className = 'avisos'; avWrap.id = 'avisos'; avWrap.hidden = true;
document.body.append(avWrap);
let avBadge = 0, avHtml = '';
const AV_SONADOS = new Set();

function avItemHtml(a) {
  const ev = a.ev;
  let cuando = a.day === dayKey() ? 'hoy' : a.day === dayKey(addDays(new Date(), 1)) ? 'mañana' : fmtDayLabel(a.day);
  if (ev.kind !== 'event') cuando = (a.day < dayKey() ? 'venció ' : 'vence ') + (cuando === 'hoy' || cuando === 'mañana' ? cuando : cuando.toLowerCase());
  const ir = { event: '📅 Ver en el calendario', todo: '☑️ Abrir la tarea', kanban: '📋 Abrir la tarjeta' }[ev.kind];
  return `<div class="aviso" style="--c:${safeColor(ev.color)}">
    <div class="aviso-h"><b class="grow ellipsis">⏰ ${esc(ev.title)}</b><button type="button" class="btn icon sm ghost" data-av-close="${esc(a.key)}" title="Cerrar este aviso" aria-label="Cerrar aviso">✕</button></div>
    <div class="small muted">${esc(cap(cuando))} · ${esc(ev.when)} · aviso ${esc(avAgo(a.at))}</div>
    ${ev.notes ? `<div class="aviso-notes small">${esc(ev.notes.slice(0, 200))}</div>` : ''}
    <div class="row aviso-btns">
      <button type="button" class="btn sm" data-av-go="${esc(a.key)}">${ir}</button>
      ${ev.kind !== 'event' ? `<button type="button" class="btn sm" data-av-done="${esc(a.key)}" title="Darla por hecha y cerrar el aviso">✓ Hecha</button>` : ''}
      <select class="field sm" data-av-snooze="${esc(a.key)}" title="Volver a avisar más tarde"><option value="">Posponer…</option>${AV_SNOOZES.map(([m, l]) => `<option value="${m}">${l}</option>`).join('')}</select>
    </div>
  </div>`;
}
function avRender(due) {
  const list = due || avDue();
  const html = list.length
    ? (list.length > 1 ? `<div class="aviso-top"><b class="grow">⏰ ${list.length} avisos</b><button type="button" class="btn sm ghost" data-av-all="1">Cerrar todos</button></div>` : '') + list.map(avItemHtml).join('')
    : '';
  if (html !== avHtml) { avHtml = html; avWrap.innerHTML = html; }
  avWrap.hidden = !list.length;
  avSetBadge(list.length);
}
/** El número en el título de la pestaña, para verlo sin tener la app delante. */
function avSetBadge(n) {
  if (n === avBadge) return;
  avBadge = n;
  try { lastTitle = ''; pomoRender(); } catch { document.title = (n ? `⏰ (${n}) ` : '') + 'Cuadro de Mando'; }
}
function avBeep() {
  if (!avPrefs().sound) return;
  ensureAudio();
  if (!audioCtx) return;
  try {
    const t0 = audioCtx.currentTime;
    [0, 0.34].forEach(d => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'triangle'; o.frequency.value = 784;
      g.gain.setValueAtTime(0.0001, t0 + d);
      g.gain.exponentialRampToValueAtTime(0.28, t0 + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.3);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0 + d); o.stop(t0 + d + 0.32);
    });
  } catch {}
}
function avSystem(a) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    new Notification('⏰ ' + a.ev.title, { body: `${cap(a.ev.when || 'hoy')} · ${fmtLongDay(a.day)}`, tag: a.key });
  } catch {}
}
/** Se llama cada poco: lo que acaba de sonar avisa (sonido y notificación) y el panel se repinta. */
function avCheck() {
  if (!APP_READY) return;
  const lock = $('#lockScreen');
  if (lock && !lock.hidden) { avWrap.hidden = true; return; }   // con la app bloqueada no se enseña nada
  const due = avDue();
  const nuevos = due.filter(a => !AV_SONADOS.has(a.key));
  nuevos.forEach(a => { AV_SONADOS.add(a.key); avSystem(a); });
  if (nuevos.length) avBeep();
  avRender(due);
  if (currentTab === 'settings') renderAv();
}
function avClose(key) {
  const v = avMap('alarmSeen'); v[key] = Date.now(); avSetMap('alarmSeen', v);
  avRender();
}
function avCloseAll() {
  const v = avMap('alarmSeen'), now = Date.now();
  avDue().forEach(a => { v[a.key] = now; });
  avSetMap('alarmSeen', v); avRender();
  toast('Avisos cerrados', 'info', 2000);
}
function avSnooze(key, mins) {
  const v = avMap('alarmSnooze'); v[key] = Date.now() + mins * 60000; avSetMap('alarmSnooze', v);
  AV_SONADOS.delete(key);
  avRender();
  toast(`Te vuelvo a avisar en ${mins === 60 ? '1 hora' : mins + ' min'}`, 'success', 2500);
}
/** Limpia los apuntes de avisos ya cerrados que no hacen falta (y los de eventos borrados). */
function avPrune() {
  const limite = Date.now() - 60 * 864e5;
  const ids = new Set([...(S.events || []).map(e => e.id), ...(S.todos || []).map(t => 'td:' + t.id), ...(S.tasks || []).map(t => 'kb:' + t.id)]);
  ['alarmSeen', 'alarmSnooze'].forEach(k => {
    const v = avMap(k); let toca = false;
    Object.keys(v).forEach(key => {
      const [id, day] = key.split('|');
      if (!ids.has(id) || (+v[key] || 0) < limite || (isValidDay(day) && parseDay(day).getTime() < limite)) { delete v[key]; toca = true; }
    });
    if (toca) avSetMap(k, v);
  });
}
/** Al arrancar: lo que sonó hace demasiado se da por visto, para no asustar con avisos de hace semanas. */
function avInit() {
  avPrune();
  const now = Date.now(), v = avMap('alarmSeen'); let toca = false;
  avRange(400, 8).forEach(a => { if (a.at <= now && now - a.at >= AV_VENTANA && !v[a.key]) { v[a.key] = now; toca = true; } });
  if (toca) avSetMap('alarmSeen', v);
  avCheck();
}

avWrap.addEventListener('click', e => {
  const c = e.target.closest('[data-av-close]'); if (c) return avClose(c.dataset.avClose);
  if (e.target.closest('[data-av-all]')) return avCloseAll();
  const g = e.target.closest('[data-av-go]');
  if (g) {
    const a = avDue().find(x => x.key === g.dataset.avGo);
    if (!a) return;
    if (a.ev.kind === 'todo') { showTab('todos'); openTodo(a.ev.id); }
    else if (a.ev.kind === 'kanban') { showTab('kanban'); openTask(a.ev.id); }
    else { showTab('calendar'); calGoto(a.day); }
    return;
  }
  const h = e.target.closest('[data-av-done]');
  if (h) {
    const a = avDue().find(x => x.key === h.dataset.avDone);
    if (!a) return;
    avClose(a.key);
    if (a.ev.kind === 'todo') completeTodo(a.ev.id);
    else if (a.ev.kind === 'kanban') moveTask(a.ev.id, 'done');
  }
});
avWrap.addEventListener('change', e => {
  const s = e.target.closest('[data-av-snooze]'); if (!s || !s.value) return;
  const key = s.dataset.avSnooze, mins = Number(s.value); s.value = '';
  avSnooze(key, mins);
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) avCheck(); });
setInterval(() => { try { avCheck(); } catch (e) { console.warn(e); } }, 20000);

/* ---------- Ajustes ---------- */
function renderAv() {
  const card = $('#avCard'); if (!card) return;
  const p = avPrefs();
  const sound = $('#avSound'); if (sound && sound.checked !== !!p.sound) sound.checked = !!p.sound;
  const perm = ('Notification' in window) ? Notification.permission : 'unsupported';
  const estado = {
    granted: '<b>Notificaciones del sistema activadas.</b> Además del aviso en pantalla, el navegador te lo enseñará aunque estés en otra pestaña.',
    denied: '<b>El navegador ha bloqueado las notificaciones del sistema.</b> El aviso en pantalla funciona igual; si las quieres, permítelas en los ajustes del sitio del navegador.',
    default: 'El aviso en pantalla funciona siempre. Si además quieres que el navegador te lo notifique, concede el permiso.',
    unsupported: 'Este navegador no admite notificaciones del sistema: el aviso en pantalla funciona igual.'
  }[perm];
  const st = $('#avStatus'); if (st) st.innerHTML = estado;
  const btn = $('#avPerm'); if (btn) btn.hidden = perm !== 'default';
  const prox = avNext().slice(0, 8);
  const html = prox.length
    ? prox.map(a => `<div class="agenda-item" style="--c:${safeColor(a.ev.color)}"><span class="agenda-bar"></span><span class="time">${esc(avIn(a.at))}</span><span class="grow" style="min-width:0"><span class="ellipsis" style="display:block">⏰ ${esc(a.ev.title)}</span><span class="small muted">${esc(fmtDayLabel(a.day))} · ${esc(a.ev.when)} · ${esc(alarmLabel(a.ev.alarm))}</span></span></div>`).join('')
    : '<div class="empty small">Ningún aviso programado para los próximos 30 días. Se ponen al crear o editar un evento, una tarea o una tarjeta del Kanban, en el campo «Aviso».</div>';
  const lista = $('#avNext'); if (lista && lista.innerHTML !== html) lista.innerHTML = html;
}
if ($('#avSound')) $('#avSound').addEventListener('change', e => {
  store.set('avisos', { ...avPrefs(), sound: e.target.checked });
  if (e.target.checked) { ensureAudio(); avBeep(); }
});
if ($('#avPerm')) $('#avPerm').addEventListener('click', async () => {
  if (!('Notification' in window)) { toast('Este navegador no admite notificaciones', 'warning'); return; }
  try {
    const p = await Notification.requestPermission();
    toast(p === 'granted' ? 'Notificaciones activadas' : 'El navegador no ha concedido el permiso (al abrir el archivo en local algunos navegadores lo bloquean)', p === 'granted' ? 'success' : 'warning', 4500);
  } catch { toast('No se pudieron activar las notificaciones', 'warning'); }
  renderAv();
});
