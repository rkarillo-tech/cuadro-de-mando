/* =====================================================================
   CALENDARIO
   ===================================================================== */
const CAL_FILTER_DEF = { events: true, kanban: true, todos: true, holidays: true };
const CAL_FILTER_LABELS = { events: '📅 Eventos', kanban: '📋 Kanban', todos: '☑️ Tareas', holidays: '🎉 Festivos' };
let calY = new Date().getFullYear(), calM = new Date().getMonth(), calSel = todayKey();
let calFilters = { ...CAL_FILTER_DEF };

function eventDates(ev, fromKey, toKey) {
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
function calDayItems(key, opts = {}) {
  const f = { ...CAL_FILTER_DEF, ...calFilters, ...opts };
  const out = [];
  if (f.holidays) S.holidays.filter(h => h.date === key).forEach(h => out.push({ kind: 'holiday', icon: '🎉', title: h.name, color: 'var(--danger)', time: '', id: h.id }));
  if (f.events) S.events.forEach(ev => {
    if (eventDates(ev, key, key).length) out.push({ kind: 'event', icon: ev.repeat ? '🔁' : '📅', title: ev.title, time: ev.allDay ? '' : ev.start + (ev.end && ev.end !== ev.start ? '–' + ev.end : ''), sort: ev.allDay ? '' : ev.start, color: safeColor(ev.color), id: ev.id });
  });
  if (f.kanban) S.tasks.filter(t => t.due === key && t.col !== 'done').forEach(t => out.push({ kind: 'kanban', icon: '📋', title: t.title, color: PRIO[t.priority]?.color || 'var(--warning)', id: t.id }));
  if (f.todos) S.todos.filter(t => !t.done && t.due === key).forEach(t => out.push({ kind: 'todo', icon: '☑️', title: t.text, color: 'var(--info)', id: t.id }));
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
    const items = calDayItems(k).filter(it => it.kind !== 'holiday');
    const cls = ['cal-cell', d.getMonth() !== calM ? 'out' : '', d.getDay() % 6 === 0 ? 'we' : '', k === today ? 'today' : '', k === calSel ? 'sel' : '', hol.has(k) && calFilters.holidays ? 'hol' : ''].filter(Boolean).join(' ');
    html += `<div class="${cls}" data-day="${k}" title="${esc(fmtLongDay(k))}${hol.has(k) ? ' · ' + esc(S.holidays.filter(h => h.date === k).map(h => h.name).join(', ')) : ''}"><span class="cal-num">${d.getDate()}</span>${items.slice(0, 3).map(it => `<div class="cal-chip" style="--c:${it.color}">${it.time ? esc(it.time.slice(0, 5)) + ' ' : ''}${esc(it.title)}</div>`).join('')}${items.length > 3 ? `<span class="cal-more">+${items.length - 3} más</span>` : ''}</div>`;
  }
  $('#calGrid').innerHTML = html;
  renderCalSide();
}
function agendaHtml(it, day) {
  return `<div class="agenda-item" data-kind="${it.kind}" data-id="${esc(it.id)}"${day ? ` data-day="${day}"` : ''} style="--c:${it.color}"><span class="agenda-bar"></span><span class="time">${day ? esc(fmtDayLabel(day)) + (it.time ? '<br>' : '') : ''}${esc(it.time || (day ? '' : 'Todo el día'))}</span><span class="grow" style="min-width:0"><span class="ellipsis" style="display:block">${it.icon} ${esc(it.title)}</span></span></div>`;
}
function renderCalSide() {
  $('#calDayTitle').textContent = fmtLongDay(calSel);
  const items = calDayItems(calSel);
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
async function openEvent(id, date) {
  const ex = id ? S.events.find(e => e.id === id) : null;
  if (id && !ex) return;
  const d = ex ? clone(ex) : { id: uid(), title: '', date: date || calSel || todayKey(), allDay: true, start: '09:00', end: '10:00', color: COLORS[0], repeat: '', until: '', notes: '', created: Date.now() };
  const body = `
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
    <div><label class="lbl">Color</label>${swatchesHtml('color', safeColor(d.color))}</div>
    <div><label class="lbl">Notas</label><textarea class="field" name="notes" rows="3">${esc(d.notes || '')}</textarea></div>
    ${tagFieldHtml('tags', d.tags || [], { src: 'title,notes' })}
    ${ex && ex.repeat ? '<p class="hint">Es un evento periódico: los cambios se aplican a toda la serie.</p>' : ''}`;
  const r = await modal({
    title: ex ? '✏️ Editar evento' : '＋ Nuevo evento', wide: true, body,
    actions: [
      ...(ex ? [{ label: '🗑️ Eliminar', value: 'delete', cls: 'danger left' }] : []),
      { label: 'Cancelar', value: null, cls: 'ghost' },
      { label: ex ? 'Guardar' : 'Crear', value: 'ok', cls: 'primary', validate: f => {
        if (!f.elements.namedItem('title').value.trim()) return 'Escribe un título';
        if (!isValidDay(f.elements.namedItem('date').value)) return 'Elige una fecha';
        if (!f.elements.namedItem('allDay').checked && f.elements.namedItem('end').value && f.elements.namedItem('end').value < f.elements.namedItem('start').value) return 'La hora de fin es anterior a la de inicio';
        return null;
      } }
    ],
    onOpen: form => {
      const sync = () => { const on = form.elements.namedItem('allDay').checked; ['start', 'end'].forEach(n => form.elements.namedItem(n).disabled = on); };
      form.elements.namedItem('allDay').addEventListener('change', sync); sync();
      tagFieldInit(form);
    }
  });
  if (!r) return;
  if (r.action === 'delete') {
    const idx = S.events.indexOf(ex); S.events.splice(idx, 1); save.events(); renderCalendar();
    toast(`Evento «${ex.title}» eliminado`, 'info', 6000, { label: 'Deshacer', fn: () => { S.events.splice(idx, 0, ex); save.events(); renderCalendar(); } });
    return;
  }
  const f = r.data;
  Object.assign(d, { title: f.title.trim(), date: f.date, allDay: !!f.allDay, start: f.start || d.start, end: f.end || d.end, repeat: f.repeat || '', until: f.until || '', color: safeColor(f.color), notes: (f.notes || '').trim(), tags: tagsFromField(f.tags) });
  if (!d.tags.length) delete d.tags;
  if (ex) Object.assign(ex, d); else S.events.push(d);
  save.events(); calGoto(d.date);
  if (!ex) toast('Evento creado', 'success', 1500);
}

/* ---------- Importar / exportar .ics ---------- */
const icsEsc = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function icsFold(line) { const out = []; let s = line; while (s.length > 73) { out.push(s.slice(0, 73)); s = ' ' + s.slice(73); } out.push(s); return out.join('\r\n'); }
const icsD = k => k.replace(/-/g, '');
function buildIcs(includeTasks) {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Cuadro de Mando//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const RR = { daily: 'FREQ=DAILY', weekly: 'FREQ=WEEKLY', monthly: 'FREQ=MONTHLY', yearly: 'FREQ=YEARLY', weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' };
  const ve = (id, date, allDay, start, end, title, notes, repeat, until) => {
    L.push('BEGIN:VEVENT', `UID:${id}@cuadro-de-mando`, `DTSTAMP:${stamp}`);
    if (allDay) { L.push(`DTSTART;VALUE=DATE:${icsD(date)}`, `DTEND;VALUE=DATE:${icsD(dayKey(addDays(parseDay(date), 1)))}`); }
    else { L.push(`DTSTART:${icsD(date)}T${start.replace(':', '')}00`, `DTEND:${icsD(date)}T${(end || start).replace(':', '')}00`); }
    if (repeat && RR[repeat]) L.push(`RRULE:${RR[repeat]}${until ? ';UNTIL=' + icsD(until) + (allDay ? '' : 'T235959') : ''}`);
    L.push(icsFold('SUMMARY:' + icsEsc(title)));
    if (notes) L.push(icsFold('DESCRIPTION:' + icsEsc(notes)));
    L.push('END:VEVENT');
  };
  S.events.forEach(e => ve(e.id, e.date, e.allDay, e.start, e.end, e.title, e.notes, e.repeat, e.until));
  if (includeTasks) {
    S.tasks.filter(t => t.due && t.col !== 'done').forEach(t => ve('k' + t.id, t.due, true, '', '', '📋 ' + t.title, t.desc, '', ''));
    S.todos.filter(t => t.due && !t.done).forEach(t => ve('t' + t.id, t.due, true, '', '', '☑️ ' + t.text, t.notes, '', ''));
  }
  L.push('END:VCALENDAR');
  return L.join('\r\n') + '\r\n';
}
function parseIcs(text) {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const evs = []; let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') { if (cur) evs.push(cur); cur = null; continue; }
    if (!cur) continue;
    const i = line.indexOf(':'); if (i < 0) continue;
    const [name, ...params] = line.slice(0, i).split(';');
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
    return { id: uid(), title: unesc((e.SUMMARY && e.SUMMARY.val) || 'Sin título').slice(0, 200), date: s.date, allDay: s.allDay, start: s.time || '09:00', end: en && !en.allDay && en.date === s.date ? en.time : (s.time || '10:00'), color: COLORS[1], repeat, until, notes: unesc((e.DESCRIPTION && e.DESCRIPTION.val) || '').slice(0, 2000), created: Date.now() };
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
$('#calGrid').addEventListener('click', e => {
  const c = e.target.closest('[data-day]'); if (!c) return;
  const k = c.dataset.day, d = parseDay(k);
  calSel = k;
  if (d.getMonth() !== calM) { calY = d.getFullYear(); calM = d.getMonth(); }
  renderCalendar();
});
$('#calGrid').addEventListener('dblclick', e => { const c = e.target.closest('[data-day]'); if (c) openEvent(null, c.dataset.day); });
function agendaClick(e) {
  const it = e.target.closest('.agenda-item'); if (!it) return;
  const { kind, id, day } = it.dataset;
  if (kind === 'event') openEvent(id);
  else if (kind === 'kanban') openTask(id);
  else if (kind === 'todo') openTodo(id);
  else if (kind === 'holiday') showTab('deadlines');
  if (day && kind !== 'event') calGoto(day);
}
$('#calDayList').addEventListener('click', agendaClick);
$('#calUpcoming').addEventListener('click', agendaClick);
