/* =====================================================================
   CALENDARIO
   ===================================================================== */
const CAL_FILTER_DEF = { events: true, kanban: true, todos: true, holidays: true };
const CAL_FILTER_LABELS = { events: '📅 Eventos', kanban: '📋 Kanban', todos: '☑️ Tareas', holidays: '🎉 Festivos' };
let calY = new Date().getFullYear(), calM = new Date().getMonth(), calSel = todayKey();
let calFilters = { ...CAL_FILTER_DEF };

/**
 * Días en que cae el evento entre dos fechas. Los días saltados de una serie («skip»: cancelados
 * o movidos a otro día) no cuentan; eventDatesAll los incluye, para poder enseñarlos tachados.
 */
function eventDates(ev, fromKey, toKey) {
  const all = eventDatesAll(ev, fromKey, toKey);
  return ev && Array.isArray(ev.skip) && ev.skip.length ? all.filter(k => !ev.skip.includes(k)) : all;
}
function eventDatesAll(ev, fromKey, toKey) {
  if (!ev || !isValidDay(ev.date)) return [];
  if (!ev.repeat) return ev.date >= fromKey && ev.date <= toKey ? [ev.date] : [];
  const out = [], start = parseDay(ev.date), from = parseDay(fromKey);
  let end = parseDay(toKey);
  if (ev.until && isValidDay(ev.until) && parseDay(ev.until) < end) end = parseDay(ev.until);
  if (start > end) return out;
  if (ev.repeat === 'weekdays') {
    for (let d = start > from ? start : from; d <= end; d = addDays(d, 1)) if (d.getDay() > 0 && d.getDay() < 6) out.push(dayKey(d));
    return out;
  }
  let k = 0;
  if (ev.repeat === 'daily') k = Math.max(0, diffDays(ev.date, fromKey));
  else if (ev.repeat === 'weekly') k = Math.max(0, Math.floor(diffDays(ev.date, fromKey) / 7));
  else if (ev.repeat === 'monthly') k = Math.max(0, (from.getFullYear() - start.getFullYear()) * 12 + from.getMonth() - start.getMonth() - 1);
  else if (ev.repeat === 'yearly') k = Math.max(0, from.getFullYear() - start.getFullYear() - 1);
  for (let g = 0; g < 800; g++, k++) {
    const d = ev.repeat === 'daily' ? addDays(start, k) : ev.repeat === 'weekly' ? addDays(start, 7 * k) : ev.repeat === 'monthly' ? addMonthsClamp(start, k) : addMonthsClamp(start, 12 * k);
    if (d > end) break;
    if (d >= from) out.push(dayKey(d));
  }
  return out;
}
const KIND_ORDER = { holiday: 0, event: 1, kanban: 3, todo: 4 };
const evSkipped = (ev, key) => Array.isArray(ev.skip) && ev.skip.includes(key);
/** La copia suelta a la que se movió un día concreto de una serie, si la hay. */
const evMovedTo = (ev, key) => S.events.find(x => x.from && x.from.id === ev.id && x.from.date === key);
/** «martes, 3 de noviembre» */
const calDia = k => parseDay(k).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
/** Qué hay un día. Con skipped: true, también los días cancelados o aplazados de una serie (tachados). */
function calDayItems(key, opts = {}) {
  const f = { ...CAL_FILTER_DEF, ...calFilters, skipped: false, ...opts };
  const out = [];
  if (f.holidays) S.holidays.filter(h => h.date === key).forEach(h => out.push({ kind: 'holiday', icon: '🎉', title: h.name, color: 'var(--danger)', time: '', id: h.id }));
  if (f.events) S.events.forEach(ev => {
    if (eventDates(ev, key, key).length) out.push({ kind: 'event', icon: ev.from ? '↪️' : ev.repeat ? '🔁' : '📅', title: ev.title + (ev.alarm ? ' ⏰' : ''), time: ev.allDay ? '' : ev.start + (ev.end && ev.end !== ev.start ? '–' + ev.end : ''), sort: ev.allDay ? '' : ev.start, color: safeColor(ev.color), id: ev.id });
    else if (f.skipped && evSkipped(ev, key) && eventDatesAll(ev, key, key).length) {
      const mv = evMovedTo(ev, key);
      out.push({ kind: 'event', icon: mv ? '↪️' : '⏭️', title: ev.title, note: mv ? 'aplazado al ' + calDia(mv.date) : 'cancelado este día', skipped: true, time: ev.allDay ? '' : ev.start + (ev.end && ev.end !== ev.start ? '–' + ev.end : ''), sort: '~', color: safeColor(ev.color), id: ev.id });
    }
  });
  if (f.kanban) S.tasks.filter(t => t.due === key && t.col !== 'done').forEach(t => out.push({ kind: 'kanban', icon: '📋', title: t.title + (t.alarm ? ' ⏰' : ''), color: PRIO[t.priority]?.color || 'var(--warning)', id: t.id }));
  if (f.todos) S.todos.filter(t => !t.done && t.due === key).forEach(t => out.push({ kind: 'todo', icon: '☑️', title: t.text + (t.alarm ? ' ⏰' : ''), color: 'var(--info)', id: t.id }));
  return out.sort((a, b) => (KIND_ORDER[a.kind] - KIND_ORDER[b.kind]) || String(a.sort || '').localeCompare(String(b.sort || '')));
}

function renderCalendar() {
  if (!$('#calGrid')) return;
  const first = new Date(calY, calM, 1);
  $('#calTitle').textContent = cap(first.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }));
  $('#calFilters').innerHTML = Object.entries(CAL_FILTER_LABELS).map(([k, l]) => `<span class="chip${calFilters[k] ? ' on' : ''}" data-filter="${k}">${l}</span>`).join('');
  const start = startOfWeek(first), today = todayKey();
  const hol = new Set(S.holidays.map(h => h.date));
  let html = ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => `<div class="cal-dow">${d}</div>`).join('');
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i), k = dayKey(d);
    if (i === 35 && d.getMonth() !== calM) break;
    const items = calDayItems(k, { skipped: true }).filter(it => it.kind !== 'holiday');
    const cls = ['cal-cell', d.getMonth() !== calM ? 'out' : '', d.getDay() % 6 === 0 ? 'we' : '', k === today ? 'today' : '', k === calSel ? 'sel' : '', hol.has(k) && calFilters.holidays ? 'hol' : ''].filter(Boolean).join(' ');
    html += `<div class="${cls}" data-day="${k}" title="${esc(fmtLongDay(k))}${hol.has(k) ? ' · ' + esc(S.holidays.filter(h => h.date === k).map(h => h.name).join(', ')) : ''}"><span class="cal-num">${d.getDate()}</span>${items.slice(0, 3).map(it => `<div class="cal-chip${it.skipped ? ' skip' : ''}" style="--c:${it.color}" data-kind="${it.kind}" data-id="${esc(it.id)}"${it.skipped ? ` title="${esc(it.title + ' · ' + it.note)}"` : ' draggable="true"'}>${it.time ? esc(it.time.slice(0, 5)) + ' ' : ''}${esc(it.title)}</div>`).join('')}${items.length > 3 ? `<span class="cal-more" title="Ver todo lo de este día">+${items.length - 3} más</span>` : ''}</div>`;
  }
  $('#calGrid').innerHTML = html;
  renderCalSide();
}
function agendaHtml(it, day) {
  return `<div class="agenda-item" data-kind="${it.kind}" data-id="${esc(it.id)}"${day ? ` data-day="${day}"` : ''} style="--c:${it.color}"><span class="agenda-bar"></span><span class="time">${day ? esc(fmtDayLabel(day)) + (it.time ? '<br>' : '') : ''}${esc(it.time || (day ? '' : 'Todo el día'))}</span><span class="grow" style="min-width:0"><span class="ellipsis${it.skipped ? ' agenda-skip' : ''}" style="display:block">${it.icon} ${esc(it.title)}</span>${it.note ? `<span class="small muted">${esc(it.note)}</span>` : ''}</span></div>`;
}
function renderCalSide() {
  $('#calDayTitle').textContent = fmtLongDay(calSel);
  const items = calDayItems(calSel, { skipped: true });
  $('#calDayList').innerHTML = items.length ? items.map(it => agendaHtml(it)).join('') : '<div class="empty small">Nada este día. Pulsa «Añadir» o haz doble clic en el día.</div>';
  const up = [];
  for (let i = 0; i < 14; i++) { const k = dayKey(addDays(new Date(), i)); calDayItems(k).forEach(it => up.push(agendaHtml(it, k))); }
  $('#calUpcoming').innerHTML = up.slice(0, 25).join('') || '<div class="empty small">Sin nada en las próximas dos semanas.</div>';
}
onShow.calendar = renderCalendar;
function calGoto(key) {
  if (!isValidDay(key)) return;
  const d = parseDay(key); calY = d.getFullYear(); calM = d.getMonth(); calSel = key;
  renderCalendar();
}
function calShift(n) { const d = new Date(calY, calM + n, 1); calY = d.getFullYear(); calM = d.getMonth(); renderCalendar(); }

/* ---------- Eventos: crear / editar ---------- */
/**
 * Abre un evento para editarlo (o uno nuevo en «date»). Con «occ», el día concreto desde el que se
 * abre un evento repetido: entonces se puede saltar o mover solo ese día sin tocar el resto de la serie.
 */
async function openEvent(id, date, occ) {
  const ex = id ? S.events.find(e => e.id === id) : null;
  if (id && !ex) return;
  const occOk = !!(ex && ex.repeat && isValidDay(occ) && eventDatesAll(ex, occ, occ).length);
  const occSkip = occOk && evSkipped(ex, occ), occMv = occSkip ? evMovedTo(ex, occ) : null;
  const src = ex && ex.from ? S.events.find(x => x.id === ex.from.id) : null;
  const d = ex ? clone(ex) : { id: uid(), title: '', date: date || calSel || todayKey(), allDay: true, start: '09:00', end: '10:00', color: COLORS[0], repeat: '', until: '', alarm: '', notes: '', created: Date.now() };
  const al = alarmParts(d.alarm);
  const aviso = occOk
    ? `<div class="status-line ev-occ">🔁 Se repite · estás en el <b>${esc(calDia(occ))}</b>. ${occSkip
      ? (occMv ? `Ese día está <b>aplazado al ${esc(calDia(occMv.date))}</b>.` : 'Ese día está <b>cancelado</b>.') + ' Con «Recuperar este día» vuelve a ser como el resto.'
      : 'Con los botones de abajo puedes <b>saltar</b> o <b>mover solo ese día</b>; lo que cambies en el formulario se aplica a <b>toda la serie</b>.'}</div>`
    : ex && ex.from ? `<div class="status-line ev-occ">↪️ Es el ${esc(calDia(ex.from.date))} de la serie${src ? ` «${esc(src.title)}»` : ''}, movido a este día. Lo que cambies aquí solo afecta a este día.</div>` : '';
  const body = `${aviso}
    <div><label class="lbl">Título</label><input class="field" type="text" name="title" value="${esc(d.title)}" maxlength="200" placeholder="Reunión, cita, entrega…"></div>
    <div class="form-grid">
      <div><label class="lbl">Fecha</label><input type="date" class="field" name="date" value="${esc(d.date)}"></div>
      <div><label class="lbl">Inicio</label><input type="time" class="field" name="start" value="${esc(d.start || '09:00')}"></div>
      <div><label class="lbl">Fin</label><input type="time" class="field" name="end" value="${esc(d.end || '10:00')}"></div>
    </div>
    <label class="check-row"><input type="checkbox" class="check" name="allDay"${d.allDay ? ' checked' : ''}> Todo el día</label>
    <div class="form-grid">
      <div><label class="lbl">Repetir</label><select class="field" name="repeat">${Object.entries(REPEAT_LABELS).map(([k, v]) => `<option value="${k}"${k === (d.repeat || '') ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
      <div><label class="lbl">Hasta (opcional)</label><input type="date" class="field" name="until" value="${esc(d.until || '')}"></div>
    </div>
    <div class="form-grid">
      <div><label class="lbl">Aviso</label><select class="field" name="alarm">${Object.entries(ALARM_LABELS).map(([k, v]) => `<option value="${k}"${k === al.preset ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
      <div id="evAlarmWhen"${al.preset === 'custom' ? '' : ' hidden'}><label class="lbl">Día y hora del aviso</label>
        <div class="row" style="gap:6px;flex-wrap:nowrap">
          <select class="field" name="alarmDay" style="flex:1;min-width:0">${ALARM_DAYS.map(([k, v]) => `<option value="${k}"${String(k) === String(al.day) ? ' selected' : ''}>${v}</option>`).join('')}</select>
          <input type="time" class="field" name="alarmTime" value="${esc(al.time)}" style="width:9.5em;flex:none">
        </div></div>
    </div>
    <div><label class="lbl">Color</label>${swatchesHtml('color', safeColor(d.color))}</div>
    <div><label class="lbl">Notas</label><textarea class="field" name="notes" rows="3">${esc(d.notes || '')}</textarea></div>
    ${tagFieldHtml('tags', d.tags || [], { src: 'title,notes' })}
    ${ex && ex.repeat && !occOk ? '<p class="hint">Es un evento periódico: los cambios se aplican a toda la serie. Para cambiar solo un día, ábrelo desde ese día en el calendario.</p>' : ''}`;
  const r = await modal({
    title: ex ? '✏️ Editar evento' : '＋ Nuevo evento', wide: true, body,
    actions: [
      ...(ex ? [{ label: '🗑️ Eliminar', value: 'delete', cls: 'danger left' }] : []),
      ...(occOk ? (occSkip ? [{ label: '↩️ Recuperar este día', value: 'restore', cls: '' }]
        : [{ label: '⏭️ Saltar este día', value: 'skip', cls: '' }, { label: '📆 Mover solo este…', value: 'move', cls: '' }]) : []),
      { label: 'Cancelar', value: null, cls: 'ghost' },
      { label: ex ? 'Guardar' : 'Crear', value: 'ok', cls: 'primary', validate: f => {
        if (!f.elements.namedItem('title').value.trim()) return 'Escribe un título';
        if (!isValidDay(f.elements.namedItem('date').value)) return 'Elige una fecha';
        if (!f.elements.namedItem('allDay').checked && f.elements.namedItem('end').value && f.elements.namedItem('end').value < f.elements.namedItem('start').value) return 'La hora de fin es anterior a la de inicio';
        if (f.elements.namedItem('alarm').value === 'custom' && !/^\d{1,2}:\d{2}$/.test(f.elements.namedItem('alarmTime').value)) return 'Elige la hora del aviso';
        return null;
      } }
    ],
    onOpen: form => {
      const sync = () => { const on = form.elements.namedItem('allDay').checked; ['start', 'end'].forEach(n => form.elements.namedItem(n).disabled = on); };
      form.elements.namedItem('allDay').addEventListener('change', sync); sync();
      const alSel = form.elements.namedItem('alarm');
      const alSync = () => { form.querySelector('#evAlarmWhen').hidden = alSel.value !== 'custom'; };
      alSel.addEventListener('change', alSync); alSync();
      tagFieldInit(form);
    }
  });
  if (!r) return;
  if (r.action === 'skip') { calSkipOcc(ex, occ); return; }
  if (r.action === 'move') { calMoveOcc(ex, occ); return; }
  if (r.action === 'restore') { calRestoreOcc(ex, occ); return; }
  if (r.action === 'delete') {
    const idx = S.events.indexOf(ex); S.events.splice(idx, 1); save.events(); renderCalendar();
    toast(`Evento «${ex.title}» eliminado`, 'info', 6000, { label: 'Deshacer', fn: () => { S.events.splice(idx, 0, ex); save.events(); renderCalendar(); } });
    return;
  }
  const f = r.data;
  Object.assign(d, { title: f.title.trim(), date: f.date, allDay: !!f.allDay, start: f.start || d.start, end: f.end || d.end, repeat: f.repeat || '', until: f.until || '', alarm: alarmValue(f.alarm, f.alarmDay, f.alarmTime), color: safeColor(f.color), notes: (f.notes || '').trim(), tags: tagsFromField(f.tags) });
  if (ex) Object.assign(ex, d); else S.events.push(d);
  const obj = ex || d;                                   // quitar el aviso o las etiquetas los borra del evento
  if (!obj.alarm) delete obj.alarm;
  if (!(obj.tags || []).length) delete obj.tags;
  if (!obj.repeat) delete obj.skip;                      // sin serie no hay días saltados
  save.events(); calGoto(d.date);
  if (!ex) toast('Evento creado', 'success', 1500);
}

/* ---------- Un solo día de un evento que se repite ---------- */
function calSkipAdd(ev, key) { ev.skip = [...new Set([...(ev.skip || []), key])].sort(); }
function calSkipDel(ev, key) { ev.skip = (ev.skip || []).filter(k => k !== key); if (!ev.skip.length) delete ev.skip; }
/** Ese día no se celebra: queda tachado como «cancelado» y se puede recuperar. */
function calSkipOcc(ev, key) {
  calSkipAdd(ev, key); save.events(); calGoto(key);
  toast(`«${ev.title.slice(0, 40)}» cancelado solo el ${calDia(key)}`, 'success', 6000, { label: 'Deshacer', fn: () => { calSkipDel(ev, key); save.events(); renderCalendar(); } });
}
/**
 * Mueve solo ese día a otra fecha u hora: la serie lo salta y aparece una copia suelta en la
 * nueva fecha que recuerda de dónde viene (from). Con «toDate» (al arrastrar) no pregunta nada.
 */
async function calMoveOcc(ev, key, toDate) {
  let date = toDate, start = ev.start, end = ev.end;
  if (!date) {
    const r = await modal({
      title: '📆 Mover solo el ' + calDia(key),
      body: `<p class="small">«${esc(ev.title)}» se queda igual el resto de días; solo este pasa a la fecha${ev.allDay ? '' : ' y hora'} que elijas, y en su día original aparece como <b>aplazado</b>.</p>
        <div class="form-grid">
          <div><label class="lbl">Nueva fecha</label><input type="date" class="field" name="date" value="${esc(key)}"></div>
          ${ev.allDay ? '' : `<div><label class="lbl">Inicio</label><input type="time" class="field" name="start" value="${esc(ev.start || '09:00')}"></div>
          <div><label class="lbl">Fin</label><input type="time" class="field" name="end" value="${esc(ev.end || ev.start || '10:00')}"></div>`}
        </div>`,
      actions: [{ label: 'Cancelar', value: null, cls: 'ghost' }, { label: 'Mover', value: 'ok', cls: 'primary', validate: f => {
        if (!isValidDay(f.elements.namedItem('date').value)) return 'Elige una fecha';
        const s = f.elements.namedItem('start'), e = f.elements.namedItem('end');
        if (s && e && e.value && e.value < s.value) return 'La hora de fin es anterior a la de inicio';
        if (f.elements.namedItem('date').value === key && (!s || (s.value === ev.start && e.value === ev.end))) return 'Elige otro día u otra hora';
        return null;
      } }]
    });
    if (!r) return false;
    date = r.data.date;
    if (!ev.allDay) { start = r.data.start || start; end = r.data.end || end; }
  }
  const copy = { ...clone(ev), id: uid(), date, start, end, repeat: '', until: '', from: { id: ev.id, date: key }, created: Date.now() };
  delete copy.skip;
  calSkipAdd(ev, key); S.events.push(copy); save.events(); calGoto(date);
  toast(`Movido solo ese día: ahora es el ${calDia(date)}`, 'success', 6000, { label: 'Deshacer', fn: () => {
    S.events = S.events.filter(x => x.id !== copy.id); calSkipDel(ev, key); save.events(); renderCalendar();
  } });
  return true;
}
/** Deshace el salto o el aplazamiento de ese día (y quita la copia movida, si la hay). */
function calRestoreOcc(ev, key) {
  const mv = evMovedTo(ev, key);
  calSkipDel(ev, key);
  if (mv) S.events = S.events.filter(x => x !== mv);
  save.events(); calGoto(key);
  toast(mv ? `Recuperado el ${calDia(key)} (y quitado el del ${calDia(mv.date)})` : `Recuperado el ${calDia(key)}`, 'success', 6000, { label: 'Deshacer', fn: () => {
    calSkipAdd(ev, key); if (mv && !S.events.includes(mv)) S.events.push(mv); save.events(); renderCalendar();
  } });
}

/* ---------- Importar / exportar .ics ---------- */
const icsEsc = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function icsFold(line) { const out = []; let s = line; while (s.length > 73) { out.push(s.slice(0, 73)); s = ' ' + s.slice(73); } out.push(s); return out.join('\r\n'); }
const icsD = k => k.replace(/-/g, '');
function buildIcs(includeTasks) {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Cuadro de Mando//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const RR = { daily: 'FREQ=DAILY', weekly: 'FREQ=WEEKLY', monthly: 'FREQ=MONTHLY', yearly: 'FREQ=YEARLY', weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' };
  const ve = (id, date, allDay, start, end, title, notes, repeat, until, alarm, skip) => {
    L.push('BEGIN:VEVENT', `UID:${id}@cuadro-de-mando`, `DTSTAMP:${stamp}`);
    if (allDay) { L.push(`DTSTART;VALUE=DATE:${icsD(date)}`, `DTEND;VALUE=DATE:${icsD(dayKey(addDays(parseDay(date), 1)))}`); }
    else { L.push(`DTSTART:${icsD(date)}T${start.replace(':', '')}00`, `DTEND:${icsD(date)}T${(end || start).replace(':', '')}00`); }
    if (repeat && RR[repeat]) L.push(`RRULE:${RR[repeat]}${until ? ';UNTIL=' + icsD(until) + (allDay ? '' : 'T235959') : ''}`);
    if (repeat && RR[repeat] && Array.isArray(skip) && skip.length) L.push(icsFold(allDay ? 'EXDATE;VALUE=DATE:' + skip.map(icsD).join(',') : 'EXDATE:' + skip.map(k => `${icsD(k)}T${start.replace(':', '')}00`).join(',')));
    L.push(icsFold('SUMMARY:' + icsEsc(title)));
    if (notes) L.push(icsFold('DESCRIPTION:' + icsEsc(notes)));
    const trg = alarm ? icsTrigger(alarm, date, allDay, start) : '';
    if (trg) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', icsFold('DESCRIPTION:' + icsEsc(title)), trg, 'END:VALARM');
    L.push('END:VEVENT');
  };
  S.events.forEach(e => ve(e.id, e.date, e.allDay, e.start, e.end, e.title, e.notes, e.repeat, e.until, e.alarm, e.skip));
  if (includeTasks) {
    S.tasks.filter(t => t.due && t.col !== 'done').forEach(t => ve('k' + t.id, t.due, true, '', '', '📋 ' + t.title, t.desc, '', '', t.alarm));
    S.todos.filter(t => t.due && !t.done).forEach(t => ve('t' + t.id, t.due, true, '', '', '☑️ ' + t.text, t.notes, '', '', t.alarm));
  }
  L.push('END:VCALENDAR');
  return L.join('\r\n') + '\r\n';
}
function parseIcs(text) {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const evs = []; let cur = null, enAlarma = false;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') { if (cur) evs.push(cur); cur = null; enAlarma = false; continue; }
    if (!cur) continue;
    if (/^BEGIN:VALARM$/i.test(line)) { enAlarma = true; continue; }
    if (/^END:VALARM$/i.test(line)) { enAlarma = false; continue; }
    if (enAlarma) { if (/^TRIGGER/i.test(line) && !cur.TRIGGER) cur.TRIGGER = { val: line.slice(line.indexOf(':') + 1), params: line.slice(0, line.indexOf(':')).toUpperCase() }; continue; }
    const i = line.indexOf(':'); if (i < 0) continue;
    const [name, ...params] = line.slice(0, i).split(';');
    if (name.toUpperCase() === 'EXDATE') { (cur.EXDATE = cur.EXDATE || []).push(...line.slice(i + 1).split(',')); continue; }
    cur[name.toUpperCase()] = { val: line.slice(i + 1), params: params.join(';').toUpperCase() };
  }
  const unesc = s => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
  const dt = p => {
    if (!p) return null;
    const m = p.val.trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
    if (!m) return null;
    if (!m[4]) return { date: `${m[1]}-${m[2]}-${m[3]}`, allDay: true };
    const d = m[7] ? new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0))) : new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5]);
    return { date: dayKey(d), time: pad(d.getHours()) + ':' + pad(d.getMinutes()), allDay: false };
  };
  return evs.map(e => {
    const s = dt(e.DTSTART); if (!s) return null;
    const en = dt(e.DTEND);
    let repeat = '', until = '';
    if (e.RRULE) {
      const r = Object.fromEntries(e.RRULE.val.split(';').map(x => x.split('=')).map(([a, b]) => [String(a).toUpperCase(), b || '']));
      const f = (r.FREQ || '').toUpperCase();
      if (f === 'DAILY') repeat = 'daily';
      else if (f === 'WEEKLY') repeat = (r.BYDAY || '').toUpperCase() === 'MO,TU,WE,TH,FR' ? 'weekdays' : 'weekly';
      else if (f === 'MONTHLY') repeat = 'monthly';
      else if (f === 'YEARLY') repeat = 'yearly';
      if (r.UNTIL) { const u = dt({ val: r.UNTIL }); if (u) until = u.date; }
    }
    const ev = { id: uid(), title: unesc((e.SUMMARY && e.SUMMARY.val) || 'Sin título').slice(0, 200), date: s.date, allDay: s.allDay, start: s.time || '09:00', end: en && !en.allDay && en.date === s.date ? en.time : (s.time || '10:00'), color: COLORS[1], repeat, until, notes: unesc((e.DESCRIPTION && e.DESCRIPTION.val) || '').slice(0, 2000), created: Date.now() };
    const av = e.TRIGGER ? alarmFromTrigger(e.TRIGGER, ev, dt) : '';
    if (av) ev.alarm = av;
    if (repeat && e.EXDATE) {
      const skip = [...new Set(e.EXDATE.map(v => (dt({ val: v }) || {}).date).filter(isValidDay))].sort();
      if (skip.length) ev.skip = skip;
    }
    return ev;
  }).filter(Boolean);
}
async function exportIcs() {
  const r = await modal({
    title: '⬇️ Exportar calendario (.ics)',
    body: '<p class="muted small">El archivo .ics se puede importar en Outlook, Google Calendar o el calendario del móvil.</p><label class="check-row"><input type="checkbox" class="check" name="tasks"> Incluir fechas límite de Tareas y Kanban (como eventos de día completo)</label>',
    actions: [{ label: 'Cancelar', value: null, cls: 'ghost' }, { label: 'Descargar', value: 'ok', cls: 'primary' }]
  });
  if (!r) return;
  download(`calendario_${todayKey()}.ics`, buildIcs(!!r.data.tasks), 'text/calendar;charset=utf-8');
}
async function importIcs(file) {
  let evs;
  try { evs = parseIcs(await file.text()); } catch { evs = []; }
  if (!evs.length) { toast('No se encontraron eventos en el archivo', 'warning', 3500); return; }
  const sig = e => `${norm(e.title)}|${e.date}|${e.allDay ? '' : e.start}`;
  const have = new Set(S.events.map(sig));
  const fresh = evs.filter(e => !have.has(sig(e)));
  S.events.push(...fresh); save.events(); renderCalendar();
  toast(`${fresh.length} evento(s) importado(s)${evs.length - fresh.length ? ` · ${evs.length - fresh.length} ya existían` : ''}`, 'success', 4000);
}

/* ---------- Interacción ---------- */
$('#calPrev').addEventListener('click', () => calShift(-1));
$('#calNext').addEventListener('click', () => calShift(1));
$('#calToday').addEventListener('click', () => calGoto(todayKey()));
$('#calNew').addEventListener('click', () => openEvent(null, calSel));
$('#calDayAdd').addEventListener('click', () => openEvent(null, calSel));
$('#calMenuBtn').addEventListener('click', e => showMenu(e.currentTarget, [
  { icon: '⬇️', label: 'Exportar a .ics', fn: exportIcs },
  { icon: '⬆️', label: 'Importar archivo .ics', fn: () => $('#calImportFile').click() }
]));
$('#calImportFile').addEventListener('change', e => { const f = e.target.files[0]; if (f) importIcs(f); e.target.value = ''; });
$('#calFilters').addEventListener('click', e => {
  const c = e.target.closest('[data-filter]'); if (!c) return;
  calFilters[c.dataset.filter] = !calFilters[c.dataset.filter];
  store.set('calFilters', calFilters); renderCalendar();
});
/** Abre lo que se pinche (en la cuadrícula o en las listas); los eventos, con el día desde el que se abren. */
function calOpenItem(kind, id, day) {
  if (kind === 'event') openEvent(id, null, day);
  else if (kind === 'kanban') openTask(id);
  else if (kind === 'todo') openTodo(id);
  else if (kind === 'holiday') showTab('deadlines');
}
$('#calGrid').addEventListener('click', e => {
  const c = e.target.closest('[data-day]'); if (!c) return;
  const k = c.dataset.day, d = parseDay(k);
  // En el móvil las etiquetas son rayitas: un toque elige el día y lo de ese día se abre desde la lista.
  const chip = e.target.closest('.cal-chip[data-id]');
  const abre = chip && parseFloat(getComputedStyle(chip).fontSize) > 0, mas = !!e.target.closest('.cal-more');
  calSel = k;
  if (d.getMonth() !== calM) { calY = d.getFullYear(); calM = d.getMonth(); }
  renderCalendar();
  if (abre) calOpenItem(chip.dataset.kind, chip.dataset.id, k);
  else if (mas || (chip && window.innerWidth <= 1150)) $('#calDayList').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});
$('#calGrid').addEventListener('dblclick', e => { if (e.target.closest('.cal-chip')) return; const c = e.target.closest('[data-day]'); if (c) openEvent(null, c.dataset.day); });
function agendaClick(e) {
  const it = e.target.closest('.agenda-item'); if (!it) return;
  const { kind, id, day } = it.dataset;
  calOpenItem(kind, id, day || calSel);
  if (day && kind !== 'event') calGoto(day);
}

/* ---------- Arrastrar a otro día ---------- */
let calDrag = null;
const calGrid = $('#calGrid');
calGrid.addEventListener('dragstart', e => {
  const chip = e.target.closest('.cal-chip[draggable]'); if (!chip) return;
  calDrag = { kind: chip.dataset.kind, id: chip.dataset.id, day: chip.closest('[data-day]').dataset.day };
  e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', chip.dataset.id); } catch {}
  chip.classList.add('dragging');
});
calGrid.addEventListener('dragover', e => {
  if (!calDrag) return;
  const c = e.target.closest('[data-day]'); if (!c) return;
  e.preventDefault(); e.dataTransfer.dropEffect = 'move';
  $$('.cal-cell.drop', calGrid).forEach(x => { if (x !== c) x.classList.remove('drop'); });
  c.classList.add('drop');
});
calGrid.addEventListener('dragleave', e => { const c = e.target.closest('[data-day]'); if (c && !c.contains(e.relatedTarget)) c.classList.remove('drop'); });
calGrid.addEventListener('drop', e => {
  if (!calDrag) return;
  e.preventDefault();
  const c = e.target.closest('[data-day]'), drag = calDrag;
  calDrag = null;
  $$('.cal-cell.drop', calGrid).forEach(x => x.classList.remove('drop'));
  if (c) calDrop(drag, c.dataset.day);
});
calGrid.addEventListener('dragend', () => { calDrag = null; $$('.cal-cell.drop,.cal-chip.dragging', calGrid).forEach(x => x.classList.remove('drop', 'dragging')); });
/** Cambia de día lo arrastrado; en un evento que se repite pregunta si solo ese día o toda la serie. */
async function calDrop({ kind, id, day }, to) {
  if (!isValidDay(to) || to === day) return;
  const undoToast = (msg, fn) => toast(msg, 'success', 6000, { label: 'Deshacer', fn });
  if (kind === 'todo' || kind === 'kanban') {
    const list = kind === 'todo' ? S.todos : S.tasks, t = list.find(x => x.id === id); if (!t) return;
    const prev = t.due;
    const guarda = () => { if (kind === 'todo') { save.todos(); refreshTodoViews(); } else { save.tasks(); renderBoard(); } calGoto(t.due); };
    t.due = to; guarda();
    undoToast(`${kind === 'todo' ? 'Tarea' : 'Tarjeta'} movida al ${calDia(to)}`, () => { t.due = prev; guarda(); });
    return;
  }
  if (kind !== 'event') return;
  const ev = S.events.find(x => x.id === id); if (!ev) return;
  if (!ev.repeat) {
    const prev = ev.date;
    ev.date = to; save.events(); calGoto(to);
    undoToast(`Evento movido al ${calDia(to)}`, () => { ev.date = prev; save.events(); calGoto(prev); });
    return;
  }
  const r = await modal({
    title: '🔁 Mover un evento que se repite',
    body: `<p>«${esc(ev.title)}» se repite. ¿Qué quieres llevar al <b>${esc(calDia(to))}</b>?</p>
      <p class="hint"><b>Solo este día</b>: el ${esc(calDia(day))} queda como aplazado y el resto sigue igual. <b>Toda la serie</b>: todas las repeticiones se desplazan ${Math.abs(diffDays(day, to))} día${Math.abs(diffDays(day, to)) === 1 ? '' : 's'}.</p>`,
    actions: [{ label: 'Cancelar', value: null, cls: 'ghost' }, { label: 'Toda la serie', value: 'all', cls: '' }, { label: 'Solo este día', value: 'one', cls: 'primary' }]
  });
  if (!r) return;
  if (r.action === 'one') { calMoveOcc(ev, day, to); return; }
  const prev = clone(ev), n = diffDays(day, to), mueve = k => dayKey(addDays(parseDay(k), n));
  ev.date = mueve(ev.date);
  if (ev.skip) ev.skip = ev.skip.map(mueve);
  save.events(); calGoto(to);
  undoToast('Serie desplazada', () => { Object.assign(ev, prev); if (!prev.skip) delete ev.skip; save.events(); calGoto(day); });
}

/* ---------- El año entero de un vistazo ---------- */
function calYearHtml(y) {
  const from = `${y}-01-01`, to = `${y}-12-31`, cnt = {}, hol = {};
  const add = k => { cnt[k] = (cnt[k] || 0) + 1; };
  if (calFilters.events) S.events.forEach(ev => eventDates(ev, from, to).forEach(add));
  if (calFilters.todos) S.todos.forEach(t => { if (!t.done && t.due >= from && t.due <= to) add(t.due); });
  if (calFilters.kanban) S.tasks.forEach(t => { if (t.col !== 'done' && t.due && t.due >= from && t.due <= to) add(t.due); });
  if (calFilters.holidays) S.holidays.forEach(h => { if (h.date >= from && h.date <= to) hol[h.date] = (hol[h.date] ? hol[h.date] + ', ' : '') + h.name; });
  const today = todayKey();
  let html = '';
  for (let m = 0; m < 12; m++) {
    const first = new Date(y, m, 1), start = startOfWeek(first);
    let days = ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => `<span class="yc-dw">${d}</span>`).join('');
    for (let i = 0; i < 42; i++) {
      const d = addDays(start, i);
      if (d.getMonth() !== m) { if (d > first) break; days += '<span></span>'; continue; }
      const k = dayKey(d), n = cnt[k] || 0;
      const cls = ['yc-d', n ? 'l' + Math.min(3, n) : '', d.getDay() % 6 === 0 ? 'we' : '', hol[k] ? 'hol' : '', k === today ? 'today' : '', k === calSel ? 'sel' : ''].filter(Boolean).join(' ');
      const tip = fmtLongDay(k) + (n ? ` · ${n} cosa${n === 1 ? '' : 's'}` : '') + (hol[k] ? ' · ' + hol[k] : '');
      days += `<button type="button" class="${cls}" data-day="${k}" title="${esc(tip)}">${d.getDate()}</button>`;
    }
    html += `<div class="yc-m"><button type="button" class="yc-mt" data-month="${m}" title="Ir a este mes">${esc(cap(first.toLocaleDateString('es-ES', { month: 'long' })))}</button><div class="yc-days">${days}</div></div>`;
  }
  return html;
}
async function calYearView() {
  let y = calY, picked = null;
  await modal({
    title: '📆 El año de un vistazo', wide: true,
    body: `<div class="yc-head"><button type="button" class="btn icon" data-y="-1" title="Año anterior">◀</button><b id="ycTitle">${y}</b><button type="button" class="btn icon" data-y="1" title="Año siguiente">▶</button>
        <span class="yc-legend small muted"><i class="yc-d l1"></i><i class="yc-d l2"></i><i class="yc-d l3"></i> con cosas · <span class="yc-hol">festivo</span> · pulsa un día para ir a él</span></div>
      <div class="yc-grid" id="ycGrid">${calYearHtml(y)}</div>`,
    actions: [{ label: 'Cerrar', value: null, cls: 'ghost' }],
    onOpen: form => form.addEventListener('click', e => {
      const b = e.target.closest('[data-y]');
      if (b) { y += Number(b.dataset.y); $('#ycTitle', form).textContent = y; $('#ycGrid', form).innerHTML = calYearHtml(y); return; }
      const d = e.target.closest('[data-day]'), mt = e.target.closest('[data-month]');
      if (!d && !mt) return;
      picked = d ? d.dataset.day : dayKey(new Date(y, +mt.dataset.month, 1));
      $('#modal [data-x]').click();
    })
  });
  if (picked) calGoto(picked);
}
$('#calYearBtn').addEventListener('click', calYearView);
$('#calDayList').addEventListener('click', agendaClick);
$('#calUpcoming').addEventListener('click', agendaClick);
