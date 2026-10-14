/* =====================================================================
   PLAZOS Y FESTIVOS
   ===================================================================== */
let hdYear = new Date().getFullYear();
let dlLast = null;

function easterSunday(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}
function nationalHolidays(y) {
  const f = (m, d, name) => ({ date: dayKey(new Date(y, m - 1, d)), name });
  return [
    f(1, 1, 'Año Nuevo'), f(1, 6, 'Epifanía del Señor'),
    { date: dayKey(addDays(easterSunday(y), -2)), name: 'Viernes Santo' },
    f(5, 1, 'Fiesta del Trabajo'), f(8, 15, 'Asunción de la Virgen'), f(10, 12, 'Fiesta Nacional de España'),
    f(11, 1, 'Todos los Santos'), f(12, 6, 'Día de la Constitución'), f(12, 8, 'Inmaculada Concepción'), f(12, 25, 'Navidad')
  ];
}
function dlOpts() {
  return { next: $('#dlNext').checked, roll: $('#dlRoll').checked, sat: $('#dlSat').checked, aug: $('#dlAug').checked };
}
function makeHabilTest(o) {
  const hol = new Set(S.holidays.map(h => h.date));
  return d => {
    const wd = d.getDay();
    if (wd === 0) return false;
    if (wd === 6 && o.sat) return false;
    if (o.aug && d.getMonth() === 7) return false;
    return !hol.has(dayKey(d));
  };
}
function computeDeadline(startKey, n, unit, o) {
  const isHabil = makeHabilTest(o);
  const start = parseDay(startKey), dir = n < 0 ? -1 : 1, abs = Math.abs(n);
  let end, skipped = 0, moved = null;
  if (unit === 'habiles') {
    let d = start, count = 0;
    if (!o.next && abs > 0) { if (isHabil(d)) count = 1; }
    while (count < abs) { d = addDays(d, dir); if (isHabil(d)) count++; else skipped++; }
    end = d;
  } else {
    if (unit === 'naturales') end = addDays(start, dir * (o.next ? abs : Math.max(0, abs - 1)));
    else if (unit === 'meses') end = addMonthsClamp(start, dir * abs);
    else end = addMonthsClamp(start, dir * abs * 12);
    if (o.roll && !isHabil(end)) {
      let d = end;
      while (!isHabil(d)) d = addDays(d, dir);
      moved = { from: dayKey(end) };
      end = d;
    }
  }
  return { end: dayKey(end), skipped, moved, natural: diffDays(startKey, dayKey(end)) };
}
function renderDeadline() {
  const start = $('#dlStart').value, n = parseInt($('#dlN').value, 10), unit = $('#dlUnit').value, o = dlOpts();
  store.set('dlPrefs', { unit, ...o });
  const box = $('#dlResult');
  if (!isValidDay(start) || isNaN(n)) { box.innerHTML = '<span class="muted">Indica la fecha inicial y el plazo.</span>'; dlLast = null; return; }
  const r = computeDeadline(start, n, unit, o);
  dlLast = r.end;
  const hol = S.holidays.filter(h => (h.date > start && h.date <= r.end) || (h.date < start && h.date >= r.end));
  box.innerHTML = `<div class="muted small">${n < 0 ? 'Fecha resultante (hacia atrás)' : 'Vence el'}</div>
    <div class="big">${esc(fmtLongDay(r.end))}</div>
    <div class="small" style="margin-top:6px">${Math.abs(r.natural)} días naturales ${n < 0 ? 'antes de' : 'después de'} la fecha inicial${unit === 'habiles' ? ` · ${r.skipped} día${r.skipped === 1 ? '' : 's'} inhábil${r.skipped === 1 ? '' : 'es'} saltado${r.skipped === 1 ? '' : 's'}` : ''}</div>
    ${r.moved ? `<div class="small" style="margin-top:4px;color:var(--warning)">⚠️ Caía en día inhábil (${esc(fmtDayLabel(r.moved.from))}) y se ha pasado al ${n < 0 ? 'anterior' : 'siguiente'} hábil.</div>` : ''}
    ${hol.length ? `<div class="small muted" style="margin-top:4px">Festivos en el periodo: ${hol.map(h => `${esc(h.name)} (${esc(fmtDayLabel(h.date))})`).join(', ')}</div>` : ''}
    ${!S.holidays.some(h => h.date.startsWith(r.end.slice(0, 4))) ? '<div class="small" style="margin-top:4px;color:var(--warning)">⚠️ No tienes festivos para ese año: añádelos en el panel de la derecha para que el cálculo sea exacto.</div>' : ''}`;
}
function renderBetween() {
  const a = $('#dlFrom').value, b = $('#dlTo').value, box = $('#dlBetween');
  if (!isValidDay(a) || !isValidDay(b)) { box.innerHTML = '<span class="muted">Elige dos fechas.</span>'; return; }
  const isHabil = makeHabilTest(dlOpts());
  const nat = diffDays(a, b), dir = nat < 0 ? -1 : 1;
  let hab = 0;
  for (let d = addDays(parseDay(a), dir), i = 0; i < Math.abs(nat); i++, d = addDays(d, dir)) if (isHabil(d)) hab++;
  const w = Math.floor(Math.abs(nat) / 7), rest = Math.abs(nat) % 7;
  box.innerHTML = `<div class="row" style="gap:30px"><div><div class="big">${Math.abs(nat)}</div><div class="muted small">días naturales</div></div><div><div class="big">${hab}</div><div class="muted small">días hábiles</div></div><div><div class="big" style="font-size:1.3rem;padding-top:8px">${w} sem ${rest} d</div><div class="muted small">semanas y días</div></div></div>${nat < 0 ? '<div class="small muted" style="margin-top:6px">«Hasta» es anterior a «Desde».</div>' : ''}`;
}
function renderHolidays() {
  $('#hdYear').textContent = hdYear;
  const list = S.holidays.filter(h => h.date.startsWith(hdYear + '-')).sort((a, b) => a.date.localeCompare(b.date));
  $('#hdList').innerHTML = list.length ? list.map(h => `<div class="list-item" data-id="${esc(h.id)}" style="cursor:default"><span class="badge${parseDay(h.date).getDay() % 6 === 0 ? ' warning' : ''}" style="min-width:92px;justify-content:center" title="${parseDay(h.date).getDay() % 6 === 0 ? 'Cae en fin de semana' : ''}">${esc(parseDay(h.date).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }))}</span><span class="grow ellipsis">${esc(h.name)}</span><button class="btn icon sm ghost" data-del title="Quitar">✕</button></div>`).join('')
    : `<div class="empty small">No hay festivos para ${hdYear}. Pulsa «＋ Nacionales del año» y añade los de tu comunidad y municipio.</div>`;
}
function addHolidays(arr) {
  const have = new Set(S.holidays.map(h => h.date));
  let n = 0;
  arr.forEach(h => { if (!have.has(h.date)) { S.holidays.push({ id: uid(), date: h.date, name: h.name }); have.add(h.date); n++; } });
  save.holidays(); renderHolidays(); renderDeadline(); renderBetween();
  return n;
}
function renderDeadlines() { renderDeadline(); renderBetween(); renderHolidays(); }
onShow.deadlines = renderDeadlines;
function initDeadlines() {
  const p = store.get('dlPrefs', null);
  if (p) { $('#dlUnit').value = p.unit || 'habiles'; $('#dlNext').checked = p.next !== false; $('#dlRoll').checked = p.roll !== false; $('#dlSat').checked = p.sat !== false; $('#dlAug').checked = !!p.aug; }
  $('#dlStart').value = todayKey();
  $('#dlFrom').value = todayKey();
  $('#dlTo').value = dayKey(addDays(new Date(), 30));
}

['dlStart', 'dlN', 'dlUnit', 'dlNext', 'dlRoll', 'dlSat', 'dlAug'].forEach(id => $('#' + id).addEventListener(id === 'dlN' ? 'input' : 'change', () => { renderDeadline(); renderBetween(); }));
['dlFrom', 'dlTo'].forEach(id => $('#' + id).addEventListener('change', renderBetween));
$('#hdPrev').addEventListener('click', () => { hdYear--; renderHolidays(); });
$('#hdNext').addEventListener('click', () => { hdYear++; renderHolidays(); });
$('#hdNational').addEventListener('click', () => { const n = addHolidays(nationalHolidays(hdYear)); toast(n ? `${n} festivos nacionales añadidos para ${hdYear}` : 'Ya estaban todos', n ? 'success' : 'info'); });
$('#hdThursday').addEventListener('click', () => { const n = addHolidays([{ date: dayKey(addDays(easterSunday(hdYear), -3)), name: 'Jueves Santo' }]); toast(n ? 'Jueves Santo añadido' : 'Ya estaba añadido', n ? 'success' : 'info'); });
$('#hdClearYear').addEventListener('click', async () => {
  const n = S.holidays.filter(h => h.date.startsWith(hdYear + '-')).length;
  if (!n || !(await confirmDialog(`¿Quitar los ${n} festivos de ${hdYear}?`, 'Quitar'))) return;
  S.holidays = S.holidays.filter(h => !h.date.startsWith(hdYear + '-')); save.holidays(); renderDeadlines();
});
$('#hdAdd').addEventListener('click', () => {
  const d = $('#hdDate').value, name = $('#hdName').value.trim();
  if (!isValidDay(d) || !name) { toast('Indica fecha y nombre del festivo', 'warning'); return; }
  if (S.holidays.some(h => h.date === d)) { toast('Ya hay un festivo ese día', 'warning'); return; }
  S.holidays.push({ id: uid(), date: d, name: name.slice(0, 80) }); save.holidays();
  hdYear = parseDay(d).getFullYear(); $('#hdName').value = '';
  renderDeadlines();
});
$('#hdName').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#hdAdd').click(); } });
$('#hdList').addEventListener('click', e => {
  const b = e.target.closest('[data-del]'); if (!b) return;
  const id = b.closest('[data-id]').dataset.id;
  S.holidays = S.holidays.filter(h => h.id !== id); save.holidays(); renderDeadlines();
});
$('#dlToCal').addEventListener('click', async () => {
  if (!dlLast) return;
  const title = await askText('📅 Añadir al calendario', 'Título del evento', 'Vence plazo');
  if (!title) return;
  S.events.push({ id: uid(), title, date: dlLast, allDay: true, start: '09:00', end: '10:00', color: '#f2667a', repeat: '', until: '', notes: `Plazo calculado desde ${fmtDayLabel($('#dlStart').value)}: ${$('#dlN').value} ${$('#dlUnit').selectedOptions[0].text.toLowerCase()}.`, created: Date.now() });
  save.events();
  toast('Añadido al calendario', 'success', 4000, { label: 'Ver', fn: () => { showTab('calendar'); calGoto(dlLast); } });
});
$('#dlToTodo').addEventListener('click', async () => {
  if (!dlLast) return;
  const text = await askText('☑️ Crear tarea', 'Tarea', 'Presentar antes de que venza el plazo');
  if (!text) return;
  S.todos.push({ id: uid(), listId: 'inbox', text, done: false, due: dlLast, important: true, repeat: '', notes: '', steps: [], created: Date.now(), order: -Date.now() });
  save.todos();
  toast('Tarea creada', 'success', 4000, { label: 'Ver', fn: () => { showTab('todos'); setTodoView('next7'); } });
});
