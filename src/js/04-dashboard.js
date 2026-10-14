/* =====================================================================
   INICIO (DASHBOARD)
   ===================================================================== */
function renderDashboard() {
  const h = new Date().getHours();
  const greet = h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
  const name = store.get('userName', '');
  if (currentTab === 'dashboard') $('#pageSub').textContent = `${greet}${name ? ', ' + name : ''} 👋 · ${fmtLongDay(todayKey())}`;

  const today = todayKey();
  const todayTodos = todosForToday();
  const overdueTodos = todayTodos.filter(t => t.due < today).length;
  const kbBy = c => S.tasks.filter(t => t.col === c).length;
  const kbOver = S.tasks.filter(t => t.col !== 'done' && t.due && t.due < today).length;
  const logs = S.focusLog.filter(l => l.date === today);
  const focusMin = logs.reduce((a, l) => a + l.minutes, 0);
  const hab = habitsToday();
  const stats = [
    { icon: '☑️', val: todayTodos.length, lab: overdueTodos ? `Tareas para hoy · ${overdueTodos} vencidas` : 'Tareas para hoy', go: 'todos', warn: overdueTodos > 0 },
    { icon: '📋', val: kbBy('todo') + kbBy('doing'), lab: `Kanban pendientes${kbOver ? ` · ${kbOver} vencidas` : ` · ${kbBy('doing')} en curso`}`, go: 'kanban', warn: kbOver > 0 },
    { icon: '🍅', val: logs.length, lab: `Pomodoros hoy · ${focusMin} min`, go: 'timer' },
    { icon: '⏱️', val: fmtDur(timeTodayMs()), lab: 'Horas registradas hoy', go: 'time' },
    { icon: '🔁', val: hab.total ? `${hab.done}/${hab.total}` : '—', lab: 'Hábitos de hoy', go: 'habits' },
    { icon: '📝', val: S.notes.length, lab: 'Notas', go: 'notes' }
  ];
  $('#dashStats').innerHTML = stats.map(s => `<div class="card stat${s.warn ? ' warn' : ''}" data-goto="${s.go}" tabindex="0"><span class="ico">${s.icon}</span><span class="val">${s.val}</span><span class="lab">${s.lab}</span></div>`).join('');

  // Para hoy
  $('#dashToday').innerHTML = todayTodos.length ? todayTodos.slice(0, 8).map(t => `<div class="list-item" data-todo="${esc(t.id)}"><button class="todo-check" data-done title="Completar">✓</button><span class="grow ellipsis">${t.important ? '⭐ ' : ''}${esc(t.text)}</span>${t.due < today ? `<span class="badge danger">${esc(fmtDayLabel(t.due))}</span>` : ''}</div>`).join('') + (todayTodos.length > 8 ? `<div class="muted small" style="padding:6px 10px">y ${todayTodos.length - 8} más…</div>` : '')
    : '<div class="empty">Nada pendiente para hoy 🎉</div>';

  // Agenda 7 días
  const items = [];
  for (let i = 0; i < 7; i++) {
    const k = dayKey(addDays(new Date(), i));
    calDayItems(k, { todos: false }).forEach(it => items.push({ ...it, day: k }));
  }
  $('#dashAgenda').innerHTML = items.length ? items.slice(0, 9).map(it => `<div class="agenda-item" data-cal="${it.day}" style="--c:${it.color}"><span class="agenda-bar"></span><span class="time">${esc(fmtDayLabel(it.day))}${it.time ? '<br>' + esc(it.time) : ''}</span><span class="grow ellipsis">${it.icon} ${esc(it.title)}</span></div>`).join('')
    : '<div class="empty">Sin eventos ni vencimientos esta semana</div>';

  // Hábitos de hoy
  $('#dashHabits').innerHTML = hab.list.length ? hab.list.map(hb => `<div class="list-item" style="cursor:default"><span style="font-size:1.2rem">${esc(hb.emoji || '🔁')}</span><span class="grow ellipsis">${esc(hb.name)}</span><span class="muted small">🔥 ${habitStats(hb).current}</span><span class="hday" style="--hc:${safeColor(hb.color)}"><button class="${hb.log && hb.log[today] ? 'done' : ''}" data-habit="${esc(hb.id)}" title="Marcar hoy">${hb.log && hb.log[today] ? '✓' : ''}</button></span></div>`).join('')
    : '<div class="empty">No tienes hábitos para hoy</div>';

  // Kanban próximas
  const pend = S.tasks.filter(t => t.col !== 'done').sort((a, b) => {
    if (a.due && b.due) return a.due < b.due ? -1 : a.due > b.due ? 1 : 0;
    if (a.due) return -1; if (b.due) return 1;
    return (PRIO[a.priority]?.order ?? 1) - (PRIO[b.priority]?.order ?? 1);
  }).slice(0, 6);
  $('#dashTasks').innerHTML = pend.length ? pend.map(t => {
    const di = dueInfo(t);
    return `<div class="list-item" data-task="${esc(t.id)}"><span class="dot" style="background:${PRIO[t.priority]?.color || 'var(--muted)'}"></span><span class="grow ellipsis">${esc(t.title)}</span>${t.col === 'doing' ? '<span class="badge accent">En curso</span>' : ''}${di ? `<span class="badge ${di.cls}">${di.label}</span>` : ''}</div>`;
  }).join('') : '<div class="empty">Sin tarjetas pendientes</div>';

  // Notas recientes
  const notes = [...S.notes].sort((a, b) => b.updated - a.updated).slice(0, 6);
  $('#dashNotes').innerHTML = notes.length ? notes.map(n => `<div class="list-item" data-note="${esc(n.id)}"><span>${n.pinned ? '📌' : '📄'}</span><span class="grow ellipsis">${esc(n.title)}</span><span class="muted small">${relTime(n.updated)}</span></div>`).join('') : '<div class="empty">Aún no hay notas</div>';

  // Foco 7 días
  const days = [];
  for (let i = 6; i >= 0; i--) days.push(addDays(new Date(), -i));
  const vals = days.map(d => S.focusLog.filter(l => l.date === dayKey(d)).reduce((a, l) => a + l.minutes, 0));
  const max = Math.max(25, ...vals);
  $('#dashBars').innerHTML = days.map((d, i) => `<div class="bar${i === 6 ? ' today' : ''}" title="${d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' })}: ${vals[i]} min"><small>${vals[i] || ''}</small><span class="fill" style="height:${Math.round(vals[i] / max * 100)}%"></span><small>${DOW_SHORT[d.getDay()]}</small></div>`).join('');
  $('#dashFocusTotal').textContent = `${vals.reduce((a, b) => a + b, 0)} min en total`;

  renderNotices();
}
onShow.dashboard = renderDashboard;

function renderNotices() {
  let html = '';
  const last = store.get('lastBackup', 0);
  const days = +S.prefs.backupDays || 0;
  const hasData = S.notes.length > 1 || S.tasks.length || S.todos.length || S.vault.length || S.events.length;
  if (days && hasData && !fsLinkedOk() && Date.now() - last > days * 864e5) {
    html += `<div class="card notice"><span>💾 ${last ? `Tu última copia de seguridad es de ${relTime(last)}.` : 'Todavía no has hecho ninguna copia de seguridad.'} Conviene guardar una de vez en cuando (o vincular un archivo en Ajustes).</span><button class="btn sm primary" data-notice="backup">Exportar ahora</button></div>`;
  }
  if (fsNeedsPermission()) html += `<div class="card notice"><span>🗄️ Para seguir guardando en tu archivo «${esc(fsName())}», el navegador necesita que lo autorices de nuevo.</span><button class="btn sm primary" data-notice="fs">Reconectar</button></div>`;
  $('#dashNotices').innerHTML = html;
}
$('#dashNotices').addEventListener('click', e => {
  const b = e.target.closest('[data-notice]'); if (!b) return;
  if (b.dataset.notice === 'backup') exportBackupDialog();
  else if (b.dataset.notice === 'fs') fsReconnect();
});
$('#dashTasks').addEventListener('click', e => { const it = e.target.closest('[data-task]'); if (it) { showTab('kanban'); openTask(it.dataset.task); } });
$('#dashNotes').addEventListener('click', e => { const it = e.target.closest('[data-note]'); if (it) { showTab('notes'); openNote(it.dataset.note); } });
$('#dashToday').addEventListener('click', e => {
  const it = e.target.closest('[data-todo]'); if (!it) return;
  if (e.target.closest('[data-done]')) { completeTodo(it.dataset.todo); renderDashboard(); }
  else openTodo(it.dataset.todo);
});
$('#dashAgenda').addEventListener('click', e => { const it = e.target.closest('[data-cal]'); if (it) { showTab('calendar'); calGoto(it.dataset.cal); } });
$('#dashHabits').addEventListener('click', e => { const b = e.target.closest('[data-habit]'); if (b) { toggleHabitDay(b.dataset.habit, todayKey()); renderDashboard(); } });
$('#dashStats').addEventListener('keydown', e => { if (e.key === 'Enter') { const s = e.target.closest('[data-goto]'); if (s) showTab(s.dataset.goto); } });

function quickCapture(kind) {
  const ta = $('#quickText'); const text = ta.value.trim();
  if (!text) { toast('Escribe algo primero', 'warning'); ta.focus(); return; }
  if (kind === 'todo') {
    text.split('\n').map(l => l.trim()).filter(Boolean).forEach(line => addTodoFromText(line, 'inbox'));
    toast('Añadido a Tareas', 'success');
  } else if (kind === 'kanban') {
    const [first, ...rest] = text.split('\n');
    S.tasks.push({ id: uid(), title: first.trim().slice(0, 200), desc: rest.join('\n').trim(), col: 'todo', priority: 'media', due: '', tags: [], subtasks: [], created: Date.now() });
    save.tasks(); renderBoard(); toast('Tarjeta añadida a «Por hacer»', 'success');
  } else {
    const html = text.split('\n').map(l => l.trim() ? `<div>${esc(l)}</div>` : '<div><br></div>').join('');
    createNote(`Nota rápida · ${fmtDateTime(Date.now())}`, html, false);
    toast('Nota guardada', 'success');
  }
  ta.value = '';
  renderDashboard();
}
$('#quickNoteBtn').addEventListener('click', () => quickCapture('note'));
$('#quickTodoBtn').addEventListener('click', () => quickCapture('todo'));
$('#quickKanbanBtn').addEventListener('click', () => quickCapture('kanban'));
$('#quickText').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); quickCapture('todo'); } });
