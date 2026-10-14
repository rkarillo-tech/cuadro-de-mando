/* =====================================================================
   REGISTRO DE HORAS
   ===================================================================== */
let ttWeekStart = startOfWeek(new Date());
let ttRun = null; // { projectId, desc, start }
const ttRunningNow = () => !!ttRun;
const projById = id => S.projects.find(p => p.id === id);
const projName = id => (projById(id) || {}).name || 'Proyecto eliminado';
const overlapMs = (a, b, s, e) => Math.max(0, Math.min(b, e) - Math.max(a, s));
function initTime() { ttRun = store.get('ttRunning', null); if (ttRun && !projById(ttRun.projectId)) ttRun = null; }
function timeTodayMs() {
  const s = parseDay(todayKey()).getTime(), e = s + 864e5;
  let ms = S.timeEntries.reduce((a, x) => a + overlapMs(x.start, x.end, s, e), 0);
  if (ttRun) ms += overlapMs(ttRun.start, Date.now(), s, e);
  return ms;
}
const entryDay = e => dayKey(new Date(e.start));
const fmtHM = ts => new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
const activeProjects = () => S.projects.filter(p => !p.archived);

async function ensureProject() {
  if (activeProjects().length) return true;
  const name = await askText('Primer proyecto', 'Para registrar horas necesitas al menos un proyecto. ¿Cómo se llama?', 'General');
  if (!name) return false;
  S.projects.push({ id: uid(), name: name.slice(0, 60), client: '', color: COLORS[0], archived: false, created: Date.now() });
  save.projects(); renderTime();
  return true;
}
async function ttToggle() {
  if (ttRun) {
    const end = Date.now();
    const dur = end - ttRun.start;
    const entry = { id: uid(), projectId: ttRun.projectId, desc: ($('#ttDesc').value || ttRun.desc || '').trim(), start: ttRun.start, end };
    ttRun = null; store.set('ttRunning', null);
    if (dur < 30000) toast('Registro descartado: duró menos de 30 segundos', 'info', 2500);
    else { S.timeEntries.push(entry); save.time(); toast(`Registrado ${fmtDur(dur)} en «${projName(entry.projectId)}»`, 'success', 2500); }
    $('#ttDesc').value = '';
  } else {
    if (!(await ensureProject())) return;
    const pid = $('#ttProject').value || activeProjects()[0].id;
    ttRun = { projectId: pid, desc: $('#ttDesc').value.trim(), start: Date.now() };
    store.set('ttRunning', ttRun); store.set('ttLastProject', pid);
  }
  renderTime(); ttTick();
  if (currentTab === 'dashboard') renderDashboard();
}
function ttTick() {
  const pill = $('#ttPill');
  if (ttRun) {
    const t = fmtDur(Date.now() - ttRun.start, true);
    $('#ttClock').textContent = t;
    pill.hidden = false;
    pill.textContent = `⏱️ ${t} · ${projName(ttRun.projectId)}`;
  } else {
    pill.hidden = true;
    $('#ttClock').textContent = '0:00:00';
  }
}

function renderTime() {
  if (!$('#ttSummary')) return;
  const projs = activeProjects();
  const sel = ttRun ? ttRun.projectId : (store.get('ttLastProject', '') || (projs[0] && projs[0].id) || '');
  $('#ttProject').innerHTML = projs.length ? projs.map(p => `<option value="${esc(p.id)}">${esc(p.name)}${p.client ? ' · ' + esc(p.client) : ''}</option>`).join('') : '<option value="">Crea un proyecto primero</option>';
  if (projs.some(p => p.id === sel)) $('#ttProject').value = sel;
  if (ttRun && document.activeElement !== $('#ttDesc')) $('#ttDesc').value = ttRun.desc || '';
  const tg = $('#ttToggle');
  tg.textContent = ttRun ? '■ Detener' : '▶ Iniciar';
  tg.classList.toggle('danger-solid', !!ttRun); tg.classList.toggle('primary', !ttRun);
  $('#ttTodayInfo').textContent = `Hoy: ${fmtDur(timeTodayMs())} h`;

  // Resumen semanal
  const ws = ttWeekStart, we = addDays(ws, 7);
  $('#ttWeekTitle').textContent = `Semana ${isoWeek(ws)} · ${ws.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} – ${addDays(ws, 6).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`;
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const entries = S.timeEntries.filter(e => e.start >= ws.getTime() && e.start < we.getTime());
  const all = ttRun && ttRun.start >= ws.getTime() && ttRun.start < we.getTime() ? entries.concat([{ ...ttRun, end: Date.now(), running: true }]) : entries;
  const pids = [...new Set(all.map(e => e.projectId))];
  const cell = (pid, d) => all.filter(e => (!pid || e.projectId === pid) && entryDay(e) === dayKey(d)).reduce((a, e) => a + (e.end - e.start), 0);
  if (!pids.length) $('#ttSummary').innerHTML = '<tbody><tr><td class="muted" style="text-align:center;padding:20px">Sin registros esta semana</td></tr></tbody>';
  else {
    const totalP = pid => all.filter(e => e.projectId === pid).reduce((a, e) => a + (e.end - e.start), 0);
    $('#ttSummary').innerHTML = `<thead><tr><th>Proyecto</th>${days.map(d => `<th${dayKey(d) === todayKey() ? ' style="color:var(--accent)"' : ''}>${DOW_SHORT[d.getDay()]} ${d.getDate()}</th>`).join('')}<th>Total</th></tr></thead>
      <tbody>${pids.sort((a, b) => totalP(b) - totalP(a)).map(pid => `<tr><td><span class="dot" style="display:inline-block;background:${safeColor((projById(pid) || {}).color)};margin-right:6px"></span>${esc(projName(pid))}</td>${days.map(d => { const v = cell(pid, d); return `<td class="${v ? '' : 'zero'}">${v ? fmtDur(v) : '–'}</td>`; }).join('')}<td><b>${fmtDur(totalP(pid))}</b></td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Total</td>${days.map(d => { const v = cell(null, d); return `<td class="${v ? '' : 'zero'}">${v ? fmtDur(v) : '–'}</td>`; }).join('')}<td>${fmtDur(all.reduce((a, e) => a + (e.end - e.start), 0))}</td></tr></tfoot>`;
  }

  // Registros de la semana
  const byDay = {};
  entries.slice().sort((a, b) => b.start - a.start).forEach(e => (byDay[entryDay(e)] = byDay[entryDay(e)] || []).push(e));
  const keys = Object.keys(byDay).sort().reverse();
  $('#ttEntries').innerHTML = keys.length ? keys.map(k => `<div class="todo-group">${esc(fmtDayLabel(k))} <span class="badge">${fmtDur(byDay[k].reduce((a, e) => a + e.end - e.start, 0))}</span></div>` + byDay[k].map(e => `<div class="tt-entry" data-id="${esc(e.id)}"><span class="dot" style="background:${safeColor((projById(e.projectId) || {}).color)}"></span><div class="grow" style="min-width:0"><div class="ellipsis">${esc(e.desc || '(sin descripción)')}</div><div class="muted small">${esc(projName(e.projectId))} · ${fmtHM(e.start)}–${fmtHM(e.end)}</div></div><span class="dur">${fmtDur(e.end - e.start)}</span><span class="acts"><button class="btn icon sm ghost" data-tt="edit" title="Editar">✏️</button><button class="btn icon sm ghost" data-tt="again" title="Continuar con esto">▶</button><button class="btn icon sm ghost" data-tt="del" title="Eliminar">🗑️</button></span></div>`).join('')).join('')
    : '<div class="empty small">No hay registros esta semana.</div>';

  // Proyectos
  const showArch = $('#ttShowArchived').checked;
  const totalAll = pid => S.timeEntries.filter(e => e.projectId === pid).reduce((a, e) => a + e.end - e.start, 0);
  const plist = S.projects.filter(p => showArch || !p.archived);
  $('#ttProjects').innerHTML = plist.length ? plist.map(p => `<div class="list-item" data-pid="${esc(p.id)}" style="cursor:default"><span class="dot" style="background:${safeColor(p.color)}"></span><div class="grow" style="min-width:0"><div class="ellipsis" style="font-weight:600">${esc(p.name)}${p.archived ? ' <span class="badge">archivado</span>' : ''}</div>${p.client ? `<div class="muted small ellipsis">${esc(p.client)}</div>` : ''}</div><span class="muted small" title="Horas esta semana / en total">sem. ${fmtDur(all.filter(e => e.projectId === p.id).reduce((a, e) => a + e.end - e.start, 0))} · total ${fmtDur(totalAll(p.id))}</span><button class="btn icon sm ghost" data-pmenu title="Opciones">⋯</button></div>`).join('')
    : '<div class="empty small">Crea tu primer proyecto para empezar a registrar horas.</div>';
}
onShow.time = renderTime;

async function openProject(id) {
  const ex = id ? projById(id) : null;
  const p = ex ? clone(ex) : { id: uid(), name: '', client: '', color: COLORS[S.projects.length % COLORS.length], archived: false, created: Date.now() };
  const r = await modal({
    title: ex ? '✏️ Editar proyecto' : '＋ Nuevo proyecto',
    body: `<div><label class="lbl">Nombre</label><input class="field" type="text" name="name" value="${esc(p.name)}" maxlength="60"></div>
      <div><label class="lbl">Cliente u organismo (opcional)</label><input class="field" type="text" name="client" value="${esc(p.client || '')}" maxlength="60"></div>
      <div><label class="lbl">Color</label>${swatchesHtml('color', safeColor(p.color))}</div>`,
    actions: [{ label: 'Cancelar', value: null, cls: 'ghost' }, { label: 'Guardar', value: 'ok', cls: 'primary', validate: f => f.elements.namedItem('name').value.trim() ? null : 'Escribe un nombre' }]
  });
  if (!r) return;
  Object.assign(p, { name: r.data.name.trim(), client: r.data.client.trim(), color: safeColor(r.data.color) });
  if (ex) Object.assign(ex, p); else S.projects.push(p);
  save.projects(); renderTime();
}
async function openEntry(id) {
  const ex = id ? S.timeEntries.find(e => e.id === id) : null;
  if (id && !ex) return;
  if (!ex && !(await ensureProject())) return;
  const now = new Date();
  const e = ex ? clone(ex) : { id: uid(), projectId: $('#ttProject').value || activeProjects()[0].id, desc: '', start: now.getTime() - 3600000, end: now.getTime() };
  const s = new Date(e.start), en = new Date(e.end);
  const projs = S.projects.filter(p => !p.archived || p.id === e.projectId);
  const r = await modal({
    title: ex ? '✏️ Editar registro' : '＋ Registro manual',
    body: `<div><label class="lbl">Proyecto</label><select class="field" name="project">${projs.map(p => `<option value="${esc(p.id)}"${p.id === e.projectId ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
      <div><label class="lbl">Descripción</label><input class="field" type="text" name="desc" value="${esc(e.desc || '')}" maxlength="200"></div>
      <div class="form-grid">
        <div><label class="lbl">Fecha</label><input type="date" class="field" name="date" value="${dayKey(s)}"></div>
        <div><label class="lbl">Inicio</label><input type="time" class="field" name="start" value="${pad(s.getHours())}:${pad(s.getMinutes())}"></div>
        <div><label class="lbl">Fin</label><input type="time" class="field" name="end" value="${pad(en.getHours())}:${pad(en.getMinutes())}"></div>
      </div>
      <p class="hint">Si la hora de fin es anterior a la de inicio, se entiende que terminó al día siguiente.</p>`,
    actions: [
      ...(ex ? [{ label: '🗑️ Eliminar', value: 'delete', cls: 'danger left' }] : []),
      { label: 'Cancelar', value: null, cls: 'ghost' },
      { label: 'Guardar', value: 'ok', cls: 'primary', validate: f => isValidDay(f.elements.namedItem('date').value) && f.elements.namedItem('start').value && f.elements.namedItem('end').value ? null : 'Completa fecha, inicio y fin' }
    ]
  });
  if (!r) return;
  if (r.action === 'delete') { deleteEntry(ex.id); return; }
  const d = parseDay(r.data.date);
  const [sh, sm] = r.data.start.split(':').map(Number), [eh, em] = r.data.end.split(':').map(Number);
  const st = new Date(d.getFullYear(), d.getMonth(), d.getDate(), sh, sm).getTime();
  let et = new Date(d.getFullYear(), d.getMonth(), d.getDate(), eh, em).getTime();
  if (et <= st) et += 864e5;
  Object.assign(e, { projectId: r.data.project, desc: r.data.desc.trim(), start: st, end: et });
  if (ex) Object.assign(ex, e); else S.timeEntries.push(e);
  save.time();
  ttWeekStart = startOfWeek(new Date(st));
  renderTime();
}
function deleteEntry(id) {
  const i = S.timeEntries.findIndex(e => e.id === id); if (i < 0) return;
  const [e] = S.timeEntries.splice(i, 1); save.time(); renderTime();
  toast('Registro eliminado', 'info', 6000, { label: 'Deshacer', fn: () => { S.timeEntries.splice(i, 0, e); save.time(); renderTime(); } });
}
async function exportTimeCsv() {
  const ws = ttWeekStart, now = new Date();
  const r = await modal({
    title: '⬇️ Exportar horas a CSV',
    body: `<div class="form-grid"><div><label class="lbl">Desde</label><input type="date" class="field" name="from" value="${dayKey(ws)}"></div><div><label class="lbl">Hasta</label><input type="date" class="field" name="to" value="${dayKey(addDays(ws, 6))}"></div></div>
      <div class="row" id="csvQuick"><button type="button" class="btn sm" data-r="week">Semana mostrada</button><button type="button" class="btn sm" data-r="month">Este mes</button><button type="button" class="btn sm" data-r="prev">Mes anterior</button><button type="button" class="btn sm" data-r="all">Todo</button></div>
      <p class="hint">Separado por punto y coma y con coma decimal, listo para abrir con Excel en español.</p>`,
    actions: [{ label: 'Cancelar', value: null, cls: 'ghost' }, { label: 'Descargar', value: 'ok', cls: 'primary' }],
    onOpen: form => $('#csvQuick', form).addEventListener('click', e => {
      const b = e.target.closest('[data-r]'); if (!b) return;
      const f = form.elements.namedItem('from'), t = form.elements.namedItem('to');
      if (b.dataset.r === 'week') { f.value = dayKey(ws); t.value = dayKey(addDays(ws, 6)); }
      else if (b.dataset.r === 'month') { f.value = dayKey(new Date(now.getFullYear(), now.getMonth(), 1)); t.value = dayKey(new Date(now.getFullYear(), now.getMonth() + 1, 0)); }
      else if (b.dataset.r === 'prev') { f.value = dayKey(new Date(now.getFullYear(), now.getMonth() - 1, 1)); t.value = dayKey(new Date(now.getFullYear(), now.getMonth(), 0)); }
      else { const min = Math.min(...S.timeEntries.map(x => x.start), Date.now()); f.value = dayKey(new Date(min)); t.value = todayKey(); }
    })
  });
  if (!r) return;
  const from = r.data.from || '0000-00-00', to = r.data.to || '9999-12-31';
  const rows = S.timeEntries.filter(e => entryDay(e) >= from && entryDay(e) <= to).sort((a, b) => a.start - b.start);
  if (!rows.length) { toast('No hay registros en ese periodo', 'warning'); return; }
  const lines = [csvRow(['Fecha', 'Proyecto', 'Cliente', 'Descripción', 'Inicio', 'Fin', 'Duración', 'Horas'])];
  rows.forEach(e => { const p = projById(e.projectId) || {}; lines.push(csvRow([new Date(e.start).toLocaleDateString('es-ES'), p.name || '', p.client || '', e.desc || '', fmtHM(e.start), fmtHM(e.end), fmtDur(e.end - e.start), numES((e.end - e.start) / 3600000)])); });
  const total = rows.reduce((a, e) => a + e.end - e.start, 0);
  lines.push(csvRow(['', '', '', 'TOTAL', '', '', fmtDur(total), numES(total / 3600000)]));
  download(`horas_${from}_${to}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
}

$('#ttToggle').addEventListener('click', ttToggle);
$('#ttPill').addEventListener('click', () => showTab('time'));
$('#ttDesc').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (!ttRun) ttToggle(); else e.target.blur(); } });
$('#ttDesc').addEventListener('input', debounce(() => { if (ttRun) { ttRun.desc = $('#ttDesc').value.trim(); store.set('ttRunning', ttRun); } }, 400));
$('#ttProject').addEventListener('change', e => { store.set('ttLastProject', e.target.value); if (ttRun) { ttRun.projectId = e.target.value; store.set('ttRunning', ttRun); ttTick(); } });
$('#ttManual').addEventListener('click', () => openEntry(null));
$('#ttNewProject').addEventListener('click', () => openProject(null));
$('#ttPrevWeek').addEventListener('click', () => { ttWeekStart = addDays(ttWeekStart, -7); renderTime(); });
$('#ttNextWeek').addEventListener('click', () => { ttWeekStart = addDays(ttWeekStart, 7); renderTime(); });
$('#ttThisWeek').addEventListener('click', () => { ttWeekStart = startOfWeek(new Date()); renderTime(); });
$('#ttExport').addEventListener('click', exportTimeCsv);
$('#ttShowArchived').addEventListener('change', renderTime);
$('#ttEntries').addEventListener('click', e => {
  const b = e.target.closest('[data-tt]'), row = e.target.closest('.tt-entry'); if (!b || !row) return;
  const id = row.dataset.id;
  if (b.dataset.tt === 'edit') openEntry(id);
  else if (b.dataset.tt === 'del') deleteEntry(id);
  else if (b.dataset.tt === 'again') {
    const en = S.timeEntries.find(x => x.id === id); if (!en || ttRun) { if (ttRun) toast('Ya hay un cronómetro en marcha', 'warning'); return; }
    $('#ttProject').value = en.projectId; $('#ttDesc').value = en.desc || ''; ttToggle();
  }
});
$('#ttProjects').addEventListener('click', e => {
  const b = e.target.closest('[data-pmenu]'); if (!b) return;
  const p = projById(b.closest('[data-pid]').dataset.pid); if (!p) return;
  const n = S.timeEntries.filter(x => x.projectId === p.id).length;
  showMenu(b, [
    { icon: '✏️', label: 'Editar', fn: () => openProject(p.id) },
    { icon: p.archived ? '📤' : '📥', label: p.archived ? 'Desarchivar' : 'Archivar', fn: () => { p.archived = !p.archived; save.projects(); renderTime(); } },
    '-',
    { icon: '🗑️', label: n ? `Eliminar (y sus ${n} registros)` : 'Eliminar', danger: true, fn: async () => {
      if (ttRun && ttRun.projectId === p.id) { toast('Detén primero el cronómetro de este proyecto', 'warning'); return; }
      if (!(await confirmDialog(`¿Eliminar el proyecto «${p.name}»${n ? ` y sus ${n} registros de tiempo` : ''}? No se puede deshacer.`))) return;
      S.projects = S.projects.filter(x => x !== p); S.timeEntries = S.timeEntries.filter(x => x.projectId !== p.id);
      save.projects(); save.time(); renderTime();
    } }
  ]);
});
setInterval(() => { if (APP_READY && ttRun) ttTick(); }, 1000);
