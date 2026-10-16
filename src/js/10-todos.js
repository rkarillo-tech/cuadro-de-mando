/* =====================================================================
   LISTA DE TAREAS
   ===================================================================== */
const REPEAT_LABELS = { '': 'No se repite', daily: 'Cada día', weekdays: 'Días laborables (L-V)', weekly: 'Cada semana', monthly: 'Cada mes', yearly: 'Cada año' };
const SMART_VIEWS = [
  { id: 'today', icon: '☀️', name: 'Mi día', sub: 'Lo que vence hoy y lo que se ha quedado atrás' },
  { id: 'next7', icon: '🗓️', name: 'Próximos 7 días', sub: 'Lo que viene esta semana' },
  { id: 'important', icon: '⭐', name: 'Importantes', sub: 'Marcadas con estrella' },
  { id: 'all', icon: '📚', name: 'Todas', sub: 'Todo lo pendiente, por listas' },
  { id: 'done', icon: '✅', name: 'Completadas', sub: 'Historial de lo terminado' }
];
const WEEKDAYS_IDX = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
let todoView = 'today';
const todoDoneOpen = new Set();
let todoDragId = null;

const getTodo = id => S.todos.find(t => t.id === id);
const listOf = id => S.todoLists.find(l => l.id === id) || S.todoLists[0];
const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.created - b.created;
function byDue(a, b) {
  if (a.due !== b.due) { if (!a.due) return 1; if (!b.due) return -1; return a.due < b.due ? -1 : 1; }
  if (!!a.important !== !!b.important) return a.important ? -1 : 1;
  return byOrder(a, b);
}
function todosForToday() { const k = todayKey(); return S.todos.filter(t => !t.done && t.due && t.due <= k).sort(byDue); }
function todoMatchesView(t, view) {
  const k = todayKey();
  switch (view) {
    case 'today': return !t.done && t.due && t.due <= k;
    case 'next7': return !t.done && t.due && t.due <= dayKey(addDays(new Date(), 6));
    case 'important': return !t.done && t.important;
    case 'all': return !t.done;
    case 'done': return t.done;
    default: return view.startsWith('list:') && t.listId === view.slice(5) && !t.done;
  }
}

/* ---------- Repeticiones ---------- */
function stepRepeat(d, repeat) {
  switch (repeat) {
    case 'daily': return addDays(d, 1);
    case 'weekdays': { let x = addDays(d, 1); while (x.getDay() === 0 || x.getDay() === 6) x = addDays(x, 1); return x; }
    case 'weekly': return addDays(d, 7);
    case 'monthly': return addMonthsClamp(d, 1);
    case 'yearly': return addMonthsClamp(d, 12);
    default: return addDays(d, 1);
  }
}
function nextDue(due, repeat) {
  const today = parseDay(todayKey());
  let n = stepRepeat(parseDay(due || todayKey()), repeat), guard = 0;
  while (n <= today && guard++ < 5000) n = stepRepeat(n, repeat);
  return dayKey(n);
}

/* ---------- Entrada en lenguaje natural ---------- */
function parseTodoInput(raw, lists) {
  const toks = String(raw).trim().split(/\s+/).filter(Boolean);
  const nt = toks.map(norm);
  const used = toks.map(() => false);
  const r = { due: '', important: false, listId: null, repeat: '' };
  const T = parseDay(todayKey());
  const mark = (a, b) => { for (let i = a; i <= b; i++) used[i] = true; };
  const setDue = (d, a, b) => { if (r.due) return; r.due = dayKey(d); mark(a, b); };
  const nextWd = (wd, minAhead) => { let d = addDays(T, minAhead); while (d.getDay() !== wd) d = addDays(d, 1); return d; };
  const wdOf = w => WEEKDAYS_IDX[w] ?? WEEKDAYS_IDX[w.replace(/s$/, '')];
  for (let i = 0; i < toks.length; i++) {
    if (used[i]) continue;
    const w = nt[i], prev = i > 0 && !used[i - 1] ? nt[i - 1] : '';
    if (w === '!' || w === '!!') { r.important = true; used[i] = true; continue; }
    if (/^#\S+/.test(toks[i])) {
      const q = norm(toks[i].slice(1));
      // #Lista elige la lista; si no coincide con ninguna, es una etiqueta y se queda en el texto
      const isTag = typeof tagIndex === 'function' && tagIndex().has(tagKey(toks[i]));
      const l = lists.find(l => norm(l.name) === q || norm(l.name).replace(/\s+/g, '') === q) || (!isTag && q.length >= 3 ? lists.find(l => norm(l.name).replace(/\s+/g, '').startsWith(q)) : null);
      if (l) { r.listId = l.id; used[i] = true; }
      continue;
    }
    if (w === 'cada' || w === 'todos' || w === 'todas') {
      let j = i + 1;
      if (w !== 'cada' && (nt[j] === 'los' || nt[j] === 'las')) j++;
      const u = nt[j] || '';
      let rep = '', end = j, wd = null;
      if ((w === 'cada' && u === 'dia') || (w !== 'cada' && u === 'dias')) { if (/^laborables?$/.test(nt[j + 1] || '')) { rep = 'weekdays'; end = j + 1; } else rep = 'daily'; }
      else if (/^semanas?$/.test(u)) rep = 'weekly';
      else if (/^mes(es)?$/.test(u)) rep = 'monthly';
      else if (/^anos?$/.test(u)) rep = 'yearly';
      else if (wdOf(u) !== undefined) { rep = 'weekly'; wd = wdOf(u); }
      if (rep) {
        r.repeat = rep; mark(i, end);
        if (wd !== null && !r.due) r.due = dayKey(nextWd(wd, 0));
        continue;
      }
    }
    if (w === 'hoy') { setDue(T, prev === 'para' ? i - 1 : i, i); continue; }
    if (w === 'pasado' && nt[i + 1] === 'manana') { setDue(addDays(T, 2), i, i + 1); continue; }
    if (w === 'manana' && !['la', 'por', 'esta', 'de'].includes(prev)) { setDue(addDays(T, 1), prev === 'para' ? i - 1 : i, i); continue; }
    if (WEEKDAYS_IDX[w] !== undefined) {
      let a = i;
      if (['proximo', 'este', 'el'].includes(prev)) a = i - 1;
      if (a < i && a > 0 && !used[a - 1] && nt[a - 1] === 'el') a--;
      setDue(nextWd(WEEKDAYS_IDX[w], 1), a, i); continue;
    }
    let m;
    if ((m = toks[i].match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/))) {
      const dd = +m[1], mm = +m[2];
      let yy = m[3] ? +m[3] : T.getFullYear(); if (yy < 100) yy += 2000;
      let d = new Date(yy, mm - 1, dd);
      if (d.getMonth() === mm - 1 && d.getDate() === dd) {
        if (!m[3] && d < T) d = new Date(yy + 1, mm - 1, dd);
        setDue(d, prev === 'el' ? i - 1 : i, i);
      }
      continue;
    }
    if (w === 'en' && /^\d+$/.test(nt[i + 1] || '')) {
      const n = +nt[i + 1], u = nt[i + 2] || ''; let d = null;
      if (/^dias?$/.test(u)) d = addDays(T, n); else if (/^semanas?$/.test(u)) d = addDays(T, 7 * n); else if (/^mes(es)?$/.test(u)) d = addMonthsClamp(T, n);
      if (d) setDue(d, i, i + 2);
      continue;
    }
    if (w === 'proxima' && nt[i + 1] === 'semana') { setDue(nextWd(1, 1), prev === 'la' ? i - 1 : i, i + 1); continue; }
    if (w === 'semana' && nt[i + 1] === 'que' && nt[i + 2] === 'viene') { setDue(nextWd(1, 1), prev === 'la' ? i - 1 : i, i + 2); continue; }
  }
  if (r.repeat && !r.due) { let d = T; if (r.repeat === 'weekdays') while (d.getDay() === 0 || d.getDay() === 6) d = addDays(d, 1); r.due = dayKey(d); }
  r.text = toks.filter((_, i) => !used[i]).join(' ').trim();
  return r;
}
function addTodoFromText(raw, listId, extra = {}) {
  const p = parseTodoInput(raw, S.todoLists);
  const text = (p.text || raw).trim().slice(0, 300);
  if (!text) return null;
  const lid = p.listId || listId || 'inbox';
  const minOrder = Math.min(0, ...S.todos.filter(t => t.listId === lid).map(t => t.order ?? 0));
  const t = { id: uid(), listId: lid, text, done: false, due: p.due || extra.due || '', important: p.important || !!extra.important, repeat: p.repeat || '', notes: '', steps: [], created: Date.now(), order: minOrder - 1 };
  S.todos.push(t); save.todos();
  return t;
}

/* ---------- Render ---------- */
function todoViewInfo() {
  const sm = SMART_VIEWS.find(v => v.id === todoView);
  if (sm) return { title: `${sm.icon} ${sm.name}`, sub: sm.sub };
  const l = S.todoLists.find(l => 'list:' + l.id === todoView);
  if (!l) { todoView = 'today'; return todoViewInfo(); }
  return { title: `${l.emoji || '📋'} ${l.name}`, sub: 'Arrastra para reordenar · suelta en otra lista para moverla', list: l };
}
function todoItemHtml(t, opts = {}) {
  const k = todayKey();
  const meta = [];
  if (t.due) {
    const cls = t.done ? '' : t.due < k ? 'danger' : t.due === k ? 'warning' : '';
    meta.push(`<span class="${cls}">📅 ${esc(fmtDayLabel(t.due))}</span>`);
  }
  if (t.repeat) meta.push(`<span title="${esc(REPEAT_LABELS[t.repeat])}">🔁 ${esc(REPEAT_LABELS[t.repeat])}</span>`);
  if (opts.showList) { const l = listOf(t.listId); meta.push(`<span>${l.emoji || '📋'} ${esc(l.name)}</span>`); }
  if (t.steps && t.steps.length) meta.push(`<span>☑ ${t.steps.filter(s => s.done).length}/${t.steps.length}</span>`);
  if (t.notes) { const ln = wlTextTitles(t.notes); meta.push(ln.length ? `<span title="Notas enlazadas: ${esc(ln.join(', '))}">🔗 ${ln.length} nota${ln.length === 1 ? '' : 's'}</span>` : '<span title="Tiene notas">📝</span>'); }
  if (t.done && t.doneAt) meta.push(`<span>✓ ${esc(relTime(t.doneAt))}</span>`);
  return `<div class="todo-item${t.done ? ' done' : ''}${t.important ? ' important' : ''}" data-id="${esc(t.id)}"${opts.drag ? ' draggable="true"' : ''} tabindex="0">
    <button class="todo-check" data-act="check" title="${t.done ? 'Marcar como pendiente' : 'Completar'}">✓</button>
    <div class="todo-main" data-act="open"><div class="todo-text">${tagHighlight(esc(t.text))}</div>${meta.length ? `<div class="todo-meta">${meta.join('')}</div>` : ''}</div>
    <button class="todo-star${t.important ? ' on' : ''}" data-act="star" title="${t.important ? 'Quitar importante' : 'Marcar como importante'}">${t.important ? '★' : '☆'}</button>
  </div>`;
}
function renderTodoSide() {
  const c = id => S.todos.filter(t => todoMatchesView(t, id)).length;
  const overdue = S.todos.filter(t => !t.done && t.due && t.due < todayKey()).length;
  $('#todoSmart').innerHTML = SMART_VIEWS.map(v => {
    const n = v.id === 'done' ? '' : c(v.id);
    return `<div class="todo-nav${todoView === v.id ? ' active' : ''}" data-view="${v.id}" tabindex="0"><span>${v.icon}</span><span class="ellipsis">${v.name}</span><span class="n${v.id === 'today' && overdue ? ' warn' : ''}">${n || ''}</span></div>`;
  }).join('');
  $('#todoLists').innerHTML = S.todoLists.map(l => `<div class="todo-nav${todoView === 'list:' + l.id ? ' active' : ''}" data-view="list:${esc(l.id)}" data-list="${esc(l.id)}" tabindex="0"><span>${esc(l.emoji || '📋')}</span><span class="ellipsis">${esc(l.name)}</span><span class="n">${c('list:' + l.id) || ''}</span></div>`).join('');
}
function renderTodos() {
  if (!$('#todoItems')) return;
  const info = todoViewInfo();
  renderTodoSide();
  $('#todoTitle').textContent = info.title;
  const items = S.todos.filter(t => todoMatchesView(t, todoView));
  $('#todoSub').textContent = todoView === 'done' ? `${items.length} completadas` : `${items.length} pendiente${items.length === 1 ? '' : 's'} · ${info.sub}`;
  $('#todoInput').parentElement.hidden = todoView === 'done';
  const k = todayKey();
  let html = '';
  const group = (title, list, opts = {}, cls = '') => list.length ? `<div class="todo-group ${cls}">${title} <span class="badge">${list.length}</span></div>` + list.map(t => todoItemHtml(t, opts)).join('') : '';
  if (todoView === 'today') {
    html += group('Vencidas', items.filter(t => t.due < k).sort(byDue), { showList: true }, 'danger');
    html += group('Hoy', items.filter(t => t.due === k).sort(byDue), { showList: true });
    const doneToday = S.todos.filter(t => t.done && t.doneAt && dayKey(new Date(t.doneAt)) === k);
    if (doneToday.length) html += doneSection('today', 'Completadas hoy', doneToday, true);
  } else if (todoView === 'next7') {
    html += group('Vencidas', items.filter(t => t.due < k).sort(byDue), { showList: true }, 'danger');
    for (let i = 0; i < 7; i++) {
      const dk = dayKey(addDays(new Date(), i));
      html += group(i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : cap(parseDay(dk).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })), items.filter(t => t.due === dk).sort(byDue), { showList: true });
    }
  } else if (todoView === 'important') {
    html += items.sort(byDue).map(t => todoItemHtml(t, { showList: true })).join('');
  } else if (todoView === 'all') {
    S.todoLists.forEach(l => { html += group(`${esc(l.emoji || '📋')} ${esc(l.name)}`, items.filter(t => t.listId === l.id).sort(byDue)); });
  } else if (todoView === 'done') {
    html += items.sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 300).map(t => todoItemHtml(t, { showList: true })).join('');
  } else {
    html += items.sort(byOrder).map(t => todoItemHtml(t, { drag: true })).join('');
    const done = S.todos.filter(t => t.done && t.listId === info.list.id);
    if (done.length) html += doneSection(todoView, 'Completadas', done.sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)));
  }
  $('#todoItems').innerHTML = html || `<div class="empty-state" style="padding:40px 10px"><div style="font-size:2.2rem">${todoView === 'done' ? '📭' : '🎉'}</div><div class="muted">${todoView === 'done' ? 'Aún no has completado ninguna tarea.' : todoView === 'today' ? 'Nada pendiente para hoy. ¡Bien hecho!' : 'No hay tareas aquí. Escribe arriba para añadir una.'}</div></div>`;
  $('#todoMenuBtn').hidden = false;
}
function doneSection(key, title, list) {
  return `<details class="todo-done-sec" data-sec="${key}"${todoDoneOpen.has(key) ? ' open' : ''}><summary>${title} (${list.length})</summary>${list.slice(0, 200).map(t => todoItemHtml(t)).join('')}</details>`;
}
onShow.todos = renderTodos;

function setTodoView(v) { todoView = v; store.set('todoView', v); renderTodos(); }
function focusTodoInput() {
  if (todoView === 'done') setTodoView('today');
  else renderTodos();
  setTimeout(() => $('#todoInput').focus(), 30);
}

/* ---------- Acciones ---------- */
function completeTodo(id, done = true) {
  const t = getTodo(id); if (!t) return;
  if (done && !t.done) {
    t.done = true; t.doneAt = Date.now();
    let next = null;
    if (t.repeat) {
      next = { ...clone(t), id: uid(), done: false, due: nextDue(t.due, t.repeat), steps: (t.steps || []).map(s => ({ ...s, id: uid(), done: false })), created: Date.now() };
      delete next.doneAt;
      S.todos.push(next);
    }
    save.todos();
    toast(next ? `Completada · la siguiente vence ${fmtDayLabel(next.due).toLowerCase()}` : 'Tarea completada ✓', 'success', 5000, {
      label: 'Deshacer', fn: () => {
        t.done = false; delete t.doneAt;
        if (next) S.todos = S.todos.filter(x => x.id !== next.id);
        save.todos(); refreshTodoViews();
      }
    });
  } else if (!done && t.done) { t.done = false; delete t.doneAt; save.todos(); }
  refreshTodoViews();
}
function refreshTodoViews() {
  renderTodos();
  if (currentTab === 'dashboard') renderDashboard();
  if (currentTab === 'calendar') renderCalendar();
}
function deleteTodo(id) {
  const i = S.todos.findIndex(t => t.id === id); if (i < 0) return;
  const [t] = S.todos.splice(i, 1);
  save.todos(); refreshTodoViews();
  toast(`Tarea «${t.text.slice(0, 40)}» eliminada`, 'info', 6000, { label: 'Deshacer', fn: () => { S.todos.splice(Math.min(i, S.todos.length), 0, t); save.todos(); refreshTodoViews(); } });
}
function todoToKanban(id) {
  const t = getTodo(id); if (!t) return;
  S.tasks.push({ id: uid(), title: t.text, desc: t.notes || '', col: 'todo', priority: t.important ? 'alta' : 'media', due: t.due || '', tags: [], subtasks: (t.steps || []).map(s => ({ id: uid(), text: s.text, done: s.done })), created: Date.now() });
  S.todos = S.todos.filter(x => x.id !== id);
  save.tasks(); save.todos(); renderBoard(); refreshTodoViews();
  toast('Tarea pasada al Kanban', 'success', 5000, { label: 'Ver', fn: () => showTab('kanban') });
}

async function openTodo(id) {
  const t = getTodo(id); if (!t) return;
  const draft = clone(t); draft.steps = draft.steps || [];
  const body = `
    <div><label class="lbl">Tarea</label><input class="field" type="text" name="text" value="${esc(draft.text)}" maxlength="300"></div>
    <div class="form-grid">
      <div><label class="lbl">Lista</label><select class="field" name="list">${S.todoLists.map(l => `<option value="${esc(l.id)}"${l.id === draft.listId ? ' selected' : ''}>${esc((l.emoji || '📋') + ' ' + l.name)}</option>`).join('')}</select></div>
      <div><label class="lbl">Fecha</label><input type="date" class="field" name="due" value="${esc(draft.due || '')}"></div>
      <div><label class="lbl">Repetir</label><select class="field" name="repeat">${Object.entries(REPEAT_LABELS).map(([k, v]) => `<option value="${k}"${k === (draft.repeat || '') ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
    </div>
    <div class="row" id="tdQuick">
      <button type="button" class="btn sm" data-q="0">Hoy</button><button type="button" class="btn sm" data-q="1">Mañana</button><button type="button" class="btn sm" data-q="week">Próx. lunes</button><button type="button" class="btn sm ghost" data-q="none">Sin fecha</button>
      <label class="check-row" style="margin-left:auto"><input type="checkbox" class="check" name="important"${draft.important ? ' checked' : ''}> ⭐ Importante</label>
    </div>
    <div><label class="lbl">Pasos <span id="stProg"></span></label>
      <div id="stList"></div>
      <div class="row" style="margin-top:6px;flex-wrap:nowrap"><input class="field" type="text" id="stNew" placeholder="Nuevo paso y Enter" data-noenter><button type="button" class="btn" id="stAdd">Añadir</button></div>
    </div>
    <div><label class="lbl">Notas</label><textarea class="field" name="notes" rows="3" placeholder="Detalles, enlaces… Escribe [[ para enlazar una nota">${esc(draft.notes || '')}</textarea></div>
    <div class="muted small">Creada ${esc(fmtDateTime(draft.created))}${draft.done && draft.doneAt ? ` · completada ${esc(fmtDateTime(draft.doneAt))}` : ''}</div>`;
  const r = await modal({
    title: '☑️ Tarea', wide: true, body,
    actions: [
      { label: '🗑️', value: 'delete', cls: 'danger left' },
      { label: '📋 Pasar a Kanban', value: 'kanban', cls: '' },
      { label: 'Cancelar', value: null, cls: 'ghost' },
      { label: 'Guardar', value: 'ok', cls: 'primary', validate: f => f.elements.namedItem('text').value.trim() ? null : 'La tarea no puede estar vacía' }
    ],
    onOpen: form => {
      const due = form.elements.namedItem('due');
      $('#tdQuick', form).addEventListener('click', e => {
        const b = e.target.closest('[data-q]'); if (!b) return;
        const q = b.dataset.q;
        if (q === 'none') due.value = '';
        else if (q === 'week') { let d = addDays(new Date(), 1); while (d.getDay() !== 1) d = addDays(d, 1); due.value = dayKey(d); }
        else due.value = dayKey(addDays(new Date(), +q));
      });
      const list = $('#stList', form), inp = $('#stNew', form);
      const render = () => {
        list.innerHTML = draft.steps.map((s, i) => `<div class="subtask-row" data-i="${i}"><input type="checkbox" class="check" data-act="toggle"${s.done ? ' checked' : ''}><input class="field" type="text" value="${esc(s.text)}" data-act="text" data-noenter><button type="button" class="btn icon sm ghost" data-act="del" title="Quitar">✕</button></div>`).join('') || '<div class="muted small">Sin pasos</div>';
        $('#stProg', form).textContent = draft.steps.length ? `(${draft.steps.filter(s => s.done).length}/${draft.steps.length})` : '';
      };
      const add = () => { const v = inp.value.trim(); if (!v) return; draft.steps.push({ id: uid(), text: v, done: false }); inp.value = ''; render(); inp.focus(); };
      $('#stAdd', form).onclick = add;
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
      list.addEventListener('change', e => { const row = e.target.closest('.subtask-row'); if (row && e.target.dataset.act === 'toggle') { draft.steps[+row.dataset.i].done = e.target.checked; render(); } });
      list.addEventListener('input', e => { const row = e.target.closest('.subtask-row'); if (row && e.target.dataset.act === 'text') draft.steps[+row.dataset.i].text = e.target.value; });
      list.addEventListener('click', e => { const b = e.target.closest('[data-act="del"]'); if (b) { draft.steps.splice(+b.closest('.subtask-row').dataset.i, 1); render(); } });
      render();
      wlAttachField(form, 'notes', { kind: 'Tareas', titleField: 'text' });
    }
  });
  if (!r) return;
  if (r.action === 'delete') { deleteTodo(id); return; }
  const d = r.data;
  Object.assign(t, {
    text: d.text.trim(), listId: d.list, due: d.due || '', repeat: d.repeat || '', important: !!d.important,
    notes: (d.notes || '').trim(), steps: draft.steps.map(s => ({ ...s, text: s.text.trim() })).filter(s => s.text)
  });
  if (t.repeat && !t.due) t.due = todayKey();
  save.todos();
  if (r.action === 'kanban') { todoToKanban(id); return; }
  refreshTodoViews();
}

/* ---------- Eventos ---------- */
function renderTodoPreview() {
  const v = $('#todoInput').value;
  if (!v.trim()) { $('#todoPreview').innerHTML = ''; return; }
  const p = parseTodoInput(v, S.todoLists);
  const chips = [];
  if (p.due) chips.push(`📅 ${esc(fmtDayLabel(p.due))}`);
  if (p.repeat) chips.push(`🔁 ${esc(REPEAT_LABELS[p.repeat])}`);
  if (p.important) chips.push('⭐ Importante');
  if (p.listId) { const l = listOf(p.listId); chips.push(`${esc(l.emoji || '📋')} ${esc(l.name)}`); }
  $('#todoPreview').innerHTML = chips.map(c => `<span class="badge accent">${c}</span>`).join('') + `<span class="muted small" style="margin-left:4px">Enter para añadir</span>`;
}
$('#todoInput').addEventListener('input', renderTodoPreview);
$('#todoInput').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const v = e.target.value.trim(); if (!v) return;
  const extra = {};
  let listId = 'inbox';
  if (todoView.startsWith('list:')) listId = todoView.slice(5);
  if (todoView === 'today' || todoView === 'next7') extra.due = todayKey();
  if (todoView === 'important') extra.important = true;
  const t = addTodoFromText(v, listId, extra);
  e.target.value = ''; renderTodoPreview();
  if (t) {
    refreshTodoViews();
    if (!todoMatchesView(t, todoView)) toast(`Añadida a «${listOf(t.listId).name}»${t.due ? ' · ' + fmtDayLabel(t.due) : ''}`, 'success', 2500);
  }
});
$('#todoSide').addEventListener('click', e => { const n = e.target.closest('[data-view]'); if (n) setTodoView(n.dataset.view); });
$('#todoSide').addEventListener('keydown', e => { if (e.key === 'Enter') { const n = e.target.closest('[data-view]'); if (n) setTodoView(n.dataset.view); } });
$('#todoItems').addEventListener('click', e => {
  const it = e.target.closest('.todo-item'); if (!it) return;
  const act = e.target.closest('[data-act]')?.dataset.act;
  const t = getTodo(it.dataset.id); if (!t) return;
  if (act === 'check') {
    if (t.done) completeTodo(t.id, false);
    else { it.classList.add('popping'); setTimeout(() => completeTodo(t.id, true), 180); }
  } else if (act === 'star') { t.important = !t.important; save.todos(); renderTodos(); }
  else if (act === 'open') openTodo(t.id);
});
$('#todoItems').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.classList.contains('todo-item')) openTodo(e.target.dataset.id); });
$('#todoItems').addEventListener('toggle', e => {
  const d = e.target.closest && e.target.closest('details[data-sec]'); if (!d) return;
  d.open ? todoDoneOpen.add(d.dataset.sec) : todoDoneOpen.delete(d.dataset.sec);
}, true);

async function newTodoList() {
  const name = await askText('Nueva lista', 'Nombre de la lista', '', 'Trabajo, Casa, Compras…');
  if (!name) return;
  const l = { id: uid(), name: name.slice(0, 50), emoji: '📋' };
  S.todoLists.push(l); save.todoLists();
  setTodoView('list:' + l.id);
}
$('#todoNewList').addEventListener('click', newTodoList);
$('#todoNewListMobile').addEventListener('click', newTodoList);
$('#todoMenuBtn').addEventListener('click', e => {
  const info = todoViewInfo();
  const items = S.todos.filter(t => todoMatchesView(t, todoView));
  const menu = [];
  if (info.list) {
    const l = info.list;
    menu.push({ icon: '✏️', label: 'Renombrar lista', fn: async () => { const n = await askText('Renombrar lista', 'Nombre', l.name); if (n) { l.name = n.slice(0, 50); save.todoLists(); renderTodos(); } } });
    menu.push({ icon: '😀', label: 'Cambiar icono', fn: async () => { const n = await askText('Icono de la lista', 'Escribe o pega un emoji', l.emoji || '📋'); if (n) { l.emoji = Array.from(n.trim()).slice(0, 2).join(''); save.todoLists(); renderTodos(); } } });
    menu.push({ icon: '↕️', label: 'Ordenar por fecha', fn: () => { const arr = S.todos.filter(t => t.listId === l.id && !t.done).sort(byDue); arr.forEach((t, i) => t.order = i); save.todos(); renderTodos(); } });
    const doneN = S.todos.filter(t => t.listId === l.id && t.done).length;
    if (doneN) menu.push({ icon: '🧹', label: `Vaciar completadas (${doneN})`, fn: () => clearDone(t => t.listId === l.id) });
  }
  if (todoView === 'done' && items.length) menu.push({ icon: '🧹', label: `Vaciar todas las completadas (${items.length})`, fn: () => clearDone(() => true) });
  menu.push({ icon: '📋', label: 'Copiar como lista de texto', fn: () => copyText(items.map(t => `- [${t.done ? 'x' : ' '}] ${t.text}${t.due ? ` (${fmtDayLabel(t.due)})` : ''}`).join('\n'), 'Lista copiada') });
  if (info.list && info.list.id !== 'inbox') {
    menu.push('-');
    menu.push({ icon: '🗑️', label: 'Eliminar lista', danger: true, fn: () => deleteTodoList(info.list.id) });
  }
  showMenu(e.currentTarget, menu);
});
async function clearDone(pred) {
  const n = S.todos.filter(t => t.done && pred(t)).length;
  if (!(await confirmDialog(`¿Eliminar ${n} tarea${n === 1 ? '' : 's'} completada${n === 1 ? '' : 's'}? No se puede deshacer.`, 'Eliminar'))) return;
  S.todos = S.todos.filter(t => !(t.done && pred(t))); save.todos(); renderTodos();
}
async function deleteTodoList(id) {
  const l = S.todoLists.find(x => x.id === id); if (!l) return;
  const n = S.todos.filter(t => t.listId === id).length;
  if (!(await confirmDialog(`¿Eliminar la lista «${l.name}»${n ? ` y sus ${n} tareas` : ''}?`, 'Eliminar lista'))) return;
  const removed = S.todos.filter(t => t.listId === id), idx = S.todoLists.indexOf(l);
  S.todoLists.splice(idx, 1); S.todos = S.todos.filter(t => t.listId !== id);
  save.todoLists(); save.todos(); setTodoView('today');
  toast(`Lista «${l.name}» eliminada`, 'info', 7000, { label: 'Deshacer', fn: () => { S.todoLists.splice(idx, 0, l); S.todos.push(...removed); save.todoLists(); save.todos(); setTodoView('list:' + l.id); } });
}

/* ---------- Arrastrar: reordenar y mover entre listas ---------- */
const tdItems = $('#todoItems');
tdItems.addEventListener('dragstart', e => {
  const it = e.target.closest && e.target.closest('.todo-item'); if (!it) return;
  todoDragId = it.dataset.id; e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', todoDragId); } catch {}
  requestAnimationFrame(() => it.classList.add('dragging'));
});
tdItems.addEventListener('dragend', () => { todoDragId = null; $$('.todo-item.dragging').forEach(x => x.classList.remove('dragging')); $$('.drop-line').forEach(l => l.remove()); $$('.todo-nav.drop').forEach(n => n.classList.remove('drop')); });
tdItems.addEventListener('dragover', e => {
  if (!todoDragId || !todoView.startsWith('list:')) return;
  e.preventDefault();
  let line = $('.drop-line'); if (!line) { line = document.createElement('div'); line.className = 'drop-line'; }
  const after = $$('.todo-item[draggable]:not(.dragging)', tdItems).find(c => { const r = c.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
  if (after) { if (line.nextElementSibling !== after) tdItems.insertBefore(line, after); }
  else { const last = $$('.todo-item[draggable]', tdItems).pop(); if (last && last.nextElementSibling !== line) last.after(line); }
});
tdItems.addEventListener('drop', e => {
  if (!todoDragId || !todoView.startsWith('list:')) return;
  e.preventDefault();
  const line = $('.drop-line', tdItems);
  const lid = todoView.slice(5);
  const arr = S.todos.filter(t => t.listId === lid && !t.done).sort(byOrder);
  const moving = arr.find(t => t.id === todoDragId); if (!moving) return;
  let before = null;
  if (line) { let n = line.nextElementSibling; while (n && !n.matches('.todo-item[draggable]')) n = n.nextElementSibling; before = n ? n.dataset.id : null; }
  const rest = arr.filter(t => t !== moving);
  const idx = before ? rest.findIndex(t => t.id === before) : rest.length;
  rest.splice(idx < 0 ? rest.length : idx, 0, moving);
  rest.forEach((t, i) => t.order = i);
  save.todos(); renderTodos();
});
$('#todoSide').addEventListener('dragover', e => {
  const n = e.target.closest('.todo-nav'); if (!n || !todoDragId) return;
  if (!(n.dataset.list || n.dataset.view === 'today' || n.dataset.view === 'important')) return;
  e.preventDefault(); $$('.todo-nav.drop').forEach(x => x !== n && x.classList.remove('drop')); n.classList.add('drop');
});
$('#todoSide').addEventListener('dragleave', e => { const n = e.target.closest('.todo-nav'); if (n && !n.contains(e.relatedTarget)) n.classList.remove('drop'); });
$('#todoSide').addEventListener('drop', e => {
  const n = e.target.closest('.todo-nav'); if (!n || !todoDragId) return;
  e.preventDefault();
  const t = getTodo(todoDragId); if (!t) return;
  if (n.dataset.list) { t.listId = n.dataset.list; toast(`Movida a «${listOf(t.listId).name}»`, 'success', 1800); }
  else if (n.dataset.view === 'today') { t.due = todayKey(); toast('Programada para hoy', 'success', 1800); }
  else if (n.dataset.view === 'important') t.important = true;
  save.todos(); renderTodos();
});
