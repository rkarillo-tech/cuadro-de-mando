const COLS = [
  { id: 'todo', name: 'Por hacer', color: 'var(--info)' },
  { id: 'doing', name: 'En progreso', color: 'var(--warning)' },
  { id: 'done', name: 'Hecho', color: 'var(--success)' }
];
const PRIO = {
  alta: { label: 'Alta', cls: 'danger', order: 0, color: 'var(--danger)' },
  media: { label: 'Media', cls: 'warning', order: 1, color: 'var(--warning)' },
  baja: { label: 'Baja', cls: '', order: 2, color: 'var(--info)' }
};
const openSubs = new Set();
let dragId = null;
/* Cuánto detalle se ve en cada tarjeta: compacta (solo lo justo), normal o detalle. */
const KB_DENS = { compact: 'Compacta', normal: 'Normal', full: 'Detalle' };
let kbDens = 'normal';

function dueInfo(t) {
  if (!t.due) return null;
  const today = dayKey(), tom = dayKey(new Date(Date.now() + 864e5));
  const label = new Date(t.due + 'T00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  if (t.col === 'done') return { label: '📅 ' + label, cls: '' };
  if (t.due < today) return { label: '⚠️ Vencida ' + label, cls: 'danger' };
  if (t.due === today) return { label: '📅 Hoy', cls: 'warning' };
  if (t.due === tom) return { label: '📅 Mañana', cls: 'warning' };
  return { label: '📅 ' + label, cls: '' };
}
function cardHtml(t) {
  const subs = t.subtasks || [];
  const doneN = subs.filter(s => s.done).length;
  const di = dueInfo(t);
  const ci = COLS.findIndex(c => c.id === t.col);
  const p = PRIO[t.priority] || PRIO.media;
  const corto = kbDens === 'compact', largo = kbDens === 'full';
  const tope = largo ? 600 : 160;
  return `<div class="kb-card p-${t.priority || 'media'}${t.col === 'done' ? ' done' : ''}" draggable="true" data-id="${esc(t.id)}" tabindex="0">
    <div class="ttl">${tagHighlight(esc(t.title))}</div>
    ${t.desc && !corto ? `<div class="small muted desc">${tagHighlight(esc(t.desc.slice(0, tope))).replace(/\[\[([^\[\]\n]+)\]\]/g, '<span class="wl-mini">$1</span>')}${t.desc.length > tope ? '…' : ''}</div>` : ''}
    <div class="kb-meta">
      <span class="badge ${p.cls}">${p.label}</span>
      ${di ? `<span class="badge ${di.cls}">${di.label}</span>` : ''}
      ${t.alarm && t.due && t.col !== 'done' ? `<span class="badge" title="Aviso: ${esc(alarmLabel(t.alarm))}">⏰ ${esc(alarmLabel(t.alarm))}</span>` : ''}
      ${subs.length ? `<span class="badge${doneN === subs.length ? ' success' : ''}">☑ ${doneN}/${subs.length}</span>` : ''}
      ${t.pomodoros ? `<span class="badge" title="Pomodoros dedicados">🍅 ${t.pomodoros}</span>` : ''}
      ${tagUniq(t.tags || []).map(g => `<span class="badge tg-mini tg-pill" data-tag="${esc(tagKey(g))}" title="Ver #${esc(g)}">#${esc(g)}</span>`).join('')}
    </div>
    ${subs.length && !corto ? `<div class="progress"><span style="width:${Math.round(doneN / subs.length * 100)}%"></span></div>
    <details class="subs"${openSubs.has(t.id) || largo ? ' open' : ''}><summary>Subtareas</summary>${subs.map(s => `<label class="check-row"><input type="checkbox" class="check" data-sub="${esc(s.id)}"${s.done ? ' checked' : ''}><span class="${s.done ? 'muted strike' : ''}">${esc(s.text)}</span></label>`).join('')}</details>` : ''}
    <div class="kb-actions">
      ${ci > 0 ? `<button class="btn icon sm ghost" data-kb="left" title="Mover a «${COLS[ci - 1].name}»">◀</button>` : ''}
      ${ci < COLS.length - 1 ? `<button class="btn icon sm ghost" data-kb="right" title="Mover a «${COLS[ci + 1].name}»">▶</button>` : ''}
      <button class="btn icon sm ghost" data-kb="sub" title="Añadir subtarea">＋</button>
      <button class="btn icon sm ghost" data-kb="edit" title="Editar">✏️</button>
      <button class="btn icon sm ghost" data-kb="del" title="Eliminar">🗑️</button>
    </div>
  </div>`;
}
function renderBoard() {
  const q = $('#kbSearch').value.trim().toLowerCase().replace(/^#/, '');
  const pf = $('#kbPriority').value;
  renderTagFilter('kanban');
  const tf = tagFilters.kanban;
  const match = t => (!pf || t.priority === pf) && (!tf || tagMatch(taskTags(t), tf)) && (!q
    || t.title.toLowerCase().includes(q)
    || (t.desc || '').toLowerCase().includes(q)
    || (t.tags || []).some(g => g.toLowerCase().includes(q))
    || (t.subtasks || []).some(s => s.text.toLowerCase().includes(q)));
  const board = $('#kbBoard');
  board.className = 'kb-board dens-' + kbDens;
  $$('#kbDens [data-d]').forEach(b => b.classList.toggle('on', b.dataset.d === kbDens));
  board.innerHTML = COLS.map(c => {
    const all = S.tasks.filter(t => t.col === c.id);
    const items = all.filter(match);
    return `<div class="kb-col">
      <div class="kb-col-h"><span class="dot" style="background:${c.color}"></span>${c.name}<span class="badge">${all.length}</span>
        <span class="row" style="margin-left:auto;gap:2px">
          ${c.id === 'done' && all.length ? '<button class="btn icon sm ghost" data-kb="cleardone" title="Eliminar todas las completadas">🧹</button>' : ''}
          <button class="btn icon sm ghost" data-kb="add" data-col="${c.id}" title="Añadir tarea aquí">＋</button>
        </span></div>
      <div class="kb-list" data-col="${c.id}">${items.map(cardHtml).join('') || `<div class="empty small">${q || pf || tf ? 'Sin coincidencias' : 'Arrastra tareas aquí'}</div>`}</div>
    </div>`;
  }).join('');
  try { avCheck(); } catch {}
}
onShow.kanban = renderBoard;
$('#kbDens').addEventListener('click', e => {
  const b = e.target.closest('[data-d]'); if (!b) return;
  kbDens = KB_DENS[b.dataset.d] ? b.dataset.d : 'normal';
  store.set('kbDens', kbDens);
  renderBoard();
});

function moveTask(id, col, beforeId = null) {
  const i = S.tasks.findIndex(t => t.id === id); if (i < 0) return;
  const [t] = S.tasks.splice(i, 1);
  const prev = t.col;
  t.col = col;
  if (col === 'done' && prev !== 'done') t.completedAt = Date.now();
  else if (col !== 'done') delete t.completedAt;
  const idx = beforeId && beforeId !== id ? S.tasks.findIndex(x => x.id === beforeId) : -1;
  if (idx < 0) S.tasks.push(t); else S.tasks.splice(idx, 0, t);
  save.tasks(); renderBoard();
  if (col === 'done' && prev !== 'done') toast('¡Tarea completada! 🎉', 'success', 1800);
}
function deleteTask(id) {
  const i = S.tasks.findIndex(t => t.id === id); if (i < 0) return;
  const [t] = S.tasks.splice(i, 1);
  save.tasks(); renderBoard();
  toast(`Tarea «${t.title.slice(0, 40)}» eliminada`, 'info', 6000, { label: 'Deshacer', fn: () => { S.tasks.splice(Math.min(i, S.tasks.length), 0, t); save.tasks(); renderBoard(); } });
}
async function quickSubtask(id) {
  const t = S.tasks.find(x => x.id === id); if (!t) return;
  const text = await askText('Nueva subtarea', `Subtarea de «${t.title.slice(0, 50)}»`, '', '¿Qué paso hay que dar?');
  if (!text) return;
  (t.subtasks = t.subtasks || []).push({ id: uid(), text, done: false });
  openSubs.add(id); save.tasks(); renderBoard();
}

/**
 * Lleva una tarjeta a Tareas. Por defecto la mueve (deja de estar en el tablero);
 * con keep = true se queda también la tarjeta, y entonces las dos van por su cuenta.
 */
function taskToTodo(id, { keep = false } = {}) {
  const t = S.tasks.find(x => x.id === id); if (!t) return;
  const todo = {
    id: uid(), listId: 'inbox', text: t.title.slice(0, 300), done: t.col === 'done',
    due: t.due || '', important: t.priority === 'alta', repeat: '', notes: t.desc || '',
    tags: (t.tags || []).slice(), steps: (t.subtasks || []).map(s => ({ id: uid(), text: s.text, done: s.done })),
    ...(t.alarm && t.due ? { alarm: t.alarm } : {}), created: Date.now(), order: Math.min(0, ...S.todos.filter(x => x.listId === 'inbox').map(x => x.order ?? 0)) - 1
  };
  S.todos.push(todo);
  const i = S.tasks.indexOf(t);
  if (!keep) S.tasks.splice(i, 1);
  save.todos(); if (!keep) save.tasks();
  renderBoard(); refreshTodoViews();
  toast(keep ? 'Copiada a Tareas (sigue en el tablero)' : 'Tarjeta pasada a Tareas', 'success', 6000, {
    label: 'Deshacer',
    fn: () => {
      S.todos = S.todos.filter(x => x.id !== todo.id);
      if (!keep && !S.tasks.some(x => x.id === t.id)) S.tasks.splice(Math.min(i, S.tasks.length), 0, t);
      save.todos(); save.tasks(); renderBoard(); refreshTodoViews();
    }
  });
}
/** Vuelca la tarjeta en una nota (descripción, subtareas como casillas y etiquetas) y la enlaza. */
function taskToNote(id) {
  const t = S.tasks.find(x => x.id === id); if (!t) return;
  const linea = x => `<div>${esc(x)}</div>`;
  const cuerpo = [
    (t.desc || '').trim() ? (t.desc || '').split('\n').map(l => l.trim() ? linea(l) : '<div><br></div>').join('') : '',
    (t.subtasks || []).length ? '<h3>Subtareas</h3>' + t.subtasks.map(sb => `<div><input type="checkbox" class="chk"${sb.done ? ' checked' : ''}>&nbsp;${esc(sb.text)}</div>`).join('') : '',
    '<h3>Notas</h3><div><br></div>'
  ].filter(Boolean).join('');
  const n = createNote(t.title.slice(0, 120) || 'Tarjeta', cuerpo, false);
  if ((t.tags || []).length) { n.tags = tagUniq(t.tags); }
  const ref = `📝 [[${n.title}]]`;
  if (!(t.desc || '').includes(ref)) t.desc = ((t.desc || '').trim() ? t.desc.replace(/\s+$/, '') + '\n' : '') + ref;
  save.notes(); save.tasks(); renderBoard();
  toast(`Nota «${n.title}» creada y enlazada a la tarjeta`, 'success', 7000, {
    label: 'Ver nota',
    fn: () => { showTab('notes'); openNote(n.id); }
  });
}
/** Pregunta qué hacer con la tarjeta: a Tareas (moviendo o copiando) o volcarla en una nota. */
async function taskSendAsk(id) {
  const t = S.tasks.find(x => x.id === id); if (!t) return;
  const r = await modal({
    title: '📤 Enviar «' + (t.title.length > 40 ? t.title.slice(0, 40) + '…' : t.title) + '»',
    body: `<p class="small">La tarjeta lleva consigo su fecha, etiquetas, prioridad y subtareas.</p>
      <p class="hint"><b>A Tareas</b> es para cuando ya no necesita etapas y basta con hacerla y tacharla: <b>mover</b> la quita del tablero (lo normal) y <b>copiar</b> la deja en los dos sitios, sueltas entre sí.<br>
      <b>Volcar en una nota</b> crea una nota con la descripción y las subtareas como casillas, y la deja enlazada en la tarjeta: para cuando lo que crece es el contenido, no el trabajo.</p>`,
    actions: [
      { label: 'Cancelar', value: null, cls: 'ghost' },
      { label: '📝 Volcar en una nota', value: 'note', cls: '' },
      { label: '☑️ Copiar a Tareas', value: 'copy', cls: '' },
      { label: '➡️ Mover a Tareas', value: 'move', cls: 'primary' }
    ]
  });
  if (!r) return;
  if (r.action === 'note') taskToNote(id);
  else taskToTodo(id, { keep: r.action === 'copy' });
}

async function openTask(id, col = 'todo') {
  const existing = id ? S.tasks.find(t => t.id === id) : null;
  if (id && !existing) return;
  const draft = existing ? clone(existing) : { id: uid(), title: '', desc: '', col, priority: 'media', due: '', tags: [], subtasks: [], created: Date.now() };
  draft.subtasks = draft.subtasks || [];
  const body = `
    <div><label class="lbl">Título</label><input class="field" type="text" name="title" value="${esc(draft.title)}" placeholder="¿Qué hay que hacer?" maxlength="200"></div>
    <div><label class="lbl">Descripción</label><textarea class="field" name="desc" rows="3" placeholder="Detalles, enlaces… Escribe [[ para enlazar una nota">${esc(draft.desc)}</textarea></div>
    <div class="form-grid">
      <div><label class="lbl">Columna</label><select class="field" name="col">${COLS.map(c => `<option value="${c.id}"${c.id === draft.col ? ' selected' : ''}>${c.name}</option>`).join('')}</select></div>
      <div><label class="lbl">Prioridad</label><select class="field" name="priority">${Object.entries(PRIO).map(([k, p]) => `<option value="${k}"${k === draft.priority ? ' selected' : ''}>${p.label}</option>`).join('')}</select></div>
      <div><label class="lbl">Fecha límite</label><input type="date" class="field" name="due" value="${esc(draft.due)}"></div>
    </div>
    ${alarmTaskFieldHtml(draft.alarm)}
    ${tagFieldHtml('tags', draft.tags || [], { src: 'title,desc' })}
    <div><label class="lbl">Subtareas <span id="subProg"></span></label>
      <div id="subList"></div>
      <div class="row" style="margin-top:6px;flex-wrap:nowrap"><input class="field" type="text" id="subNew" placeholder="Nueva subtarea y Enter" data-noenter><button type="button" class="btn" id="subAdd">Añadir</button></div>
    </div>`;
  const actions = [
    ...(existing ? [{ label: '🗑️ Eliminar', value: 'delete', cls: 'danger left' }] : []),
    ...(existing ? [{ label: '📤 Enviar a…', value: 'send', cls: '' }] : []),
    { label: 'Cancelar', value: null, cls: 'ghost' },
    { label: existing ? 'Guardar' : 'Crear tarea', value: 'ok', cls: 'primary', validate: f => f.elements.namedItem('title').value.trim() ? alarmTaskValidate(f) : 'Escribe un título para la tarea' }
  ];
  const r = await modal({
    title: existing ? '✏️ Editar tarea' : '＋ Nueva tarea', body, actions, wide: true,
    onOpen: form => {
      const list = $('#subList', form), inp = $('#subNew', form);
      const render = () => {
        list.innerHTML = draft.subtasks.map((s, i) => `<div class="subtask-row" data-i="${i}"><input type="checkbox" class="check" data-act="toggle"${s.done ? ' checked' : ''}><input class="field" type="text" value="${esc(s.text)}" data-act="text" data-noenter><button type="button" class="btn icon sm ghost" data-act="del" title="Quitar">✕</button></div>`).join('') || '<div class="muted small">Sin subtareas</div>';
        const d = draft.subtasks.filter(s => s.done).length;
        $('#subProg', form).textContent = draft.subtasks.length ? `(${d}/${draft.subtasks.length})` : '';
      };
      const add = () => { const v = inp.value.trim(); if (!v) return; draft.subtasks.push({ id: uid(), text: v, done: false }); inp.value = ''; render(); inp.focus(); };
      $('#subAdd', form).onclick = add;
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
      list.addEventListener('change', e => { const row = e.target.closest('.subtask-row'); if (row && e.target.dataset.act === 'toggle') { draft.subtasks[+row.dataset.i].done = e.target.checked; render(); } });
      list.addEventListener('input', e => { const row = e.target.closest('.subtask-row'); if (row && e.target.dataset.act === 'text') draft.subtasks[+row.dataset.i].text = e.target.value; });
      list.addEventListener('click', e => { const b = e.target.closest('[data-act="del"]'); if (b) { draft.subtasks.splice(+b.closest('.subtask-row').dataset.i, 1); render(); } });
      render();
      wlAttachField(form, 'desc', { kind: 'Kanban', titleField: 'title' });
      tagFieldInit(form);
      alarmTaskFieldInit(form);
    }
  });
  if (!r) return;
  if (r.action === 'delete') { deleteTask(existing.id); return; }
  const d = r.data;
  if (r.action === 'send') {      // se guarda lo editado y luego se pregunta a dónde va
    Object.assign(existing, {
      title: d.title.trim() || existing.title, desc: (d.desc || '').trim(), priority: d.priority,
      due: d.due || '', tags: tagsFromField(d.tags),
      subtasks: draft.subtasks.map(sb => ({ ...sb, text: sb.text.trim() })).filter(sb => sb.text)
    });
    alarmTaskSet(existing, d);
    save.tasks(); renderBoard();
    taskSendAsk(existing.id);
    return;
  }
  Object.assign(draft, {
    title: d.title.trim(), desc: (d.desc || '').trim(), priority: d.priority, due: d.due || '',
    tags: tagsFromField(d.tags)
  });
  draft.subtasks = draft.subtasks.map(s => ({ ...s, text: s.text.trim() })).filter(s => s.text);
  alarmTaskSet(draft, d);
  if (existing) {
    const oldCol = existing.col;
    Object.assign(existing, draft, { col: oldCol });
    if (!draft.alarm) delete existing.alarm;            // quitar el aviso lo borra de la tarjeta
    save.tasks();
    if (d.col !== oldCol) moveTask(existing.id, d.col); else renderBoard();
  } else {
    draft.col = d.col;
    if (draft.col === 'done') draft.completedAt = Date.now();
    S.tasks.push(draft); save.tasks(); renderBoard();
    toast('Tarea creada', 'success', 1500);
  }
}

$('#kbNewBtn').addEventListener('click', () => openTask(null, 'todo'));
$('#kbSearch').addEventListener('input', debounce(renderBoard, 150));
$('#kbPriority').addEventListener('change', renderBoard);
const board = $('#kbBoard');
board.addEventListener('click', async e => {
  const b = e.target.closest('[data-kb]');
  const card = e.target.closest('.kb-card');
  if (b) {
    const act = b.dataset.kb, id = card && card.dataset.id;
    if (act === 'add') openTask(null, b.dataset.col);
    else if (act === 'cleardone') {
      const n = S.tasks.filter(t => t.col === 'done').length;
      if (await confirmDialog(`¿Eliminar las ${n} tareas completadas? No se puede deshacer.`, 'Eliminar')) { S.tasks = S.tasks.filter(t => t.col !== 'done'); save.tasks(); renderBoard(); }
    }
    else if (act === 'left' || act === 'right') { const ci = COLS.findIndex(c => c.id === S.tasks.find(t => t.id === id).col); moveTask(id, COLS[ci + (act === 'left' ? -1 : 1)].id); }
    else if (act === 'edit') openTask(id);
    else if (act === 'del') deleteTask(id);
    else if (act === 'sub') quickSubtask(id);
    return;
  }
  if (card && !e.target.closest('input,label,summary,details,a')) openTask(card.dataset.id);
});
board.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.classList.contains('kb-card')) openTask(e.target.dataset.id); });
board.addEventListener('change', e => {
  const cb = e.target.closest('input[data-sub]'); if (!cb) return;
  const t = S.tasks.find(x => x.id === cb.closest('.kb-card').dataset.id); if (!t) return;
  const s = t.subtasks.find(x => x.id === cb.dataset.sub); if (s) s.done = cb.checked;
  save.tasks(); renderBoard();
  if (t.subtasks.length && t.subtasks.every(x => x.done) && t.col !== 'done') toast('Todas las subtareas listas. ¿La mueves a «Hecho»?', 'success', 6000, { label: 'Mover', fn: () => moveTask(t.id, 'done') });
});
board.addEventListener('toggle', e => {
  if (!e.target.matches || !e.target.matches('details.subs')) return;
  if (kbDens === 'full') return;      // en «Detalle» van abiertas por la vista, no porque las abras tú
  const id = e.target.closest('.kb-card').dataset.id;
  e.target.open ? openSubs.add(id) : openSubs.delete(id);
}, true);
// Arrastrar y soltar
function clearDrop() { const l = $('.drop-line'); if (l) l.remove(); $$('.kb-list.over').forEach(x => x.classList.remove('over')); }
function afterCard(list, y) {
  for (const c of $$('.kb-card:not(.dragging)', list)) { const r = c.getBoundingClientRect(); if (y < r.top + r.height / 2) return c; }
  return null;
}
board.addEventListener('dragstart', e => {
  const c = e.target.closest && e.target.closest('.kb-card'); if (!c) return;
  dragId = c.dataset.id;
  e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', dragId); } catch {}
  requestAnimationFrame(() => c.classList.add('dragging'));
});
board.addEventListener('dragend', () => { dragId = null; $$('.kb-card.dragging').forEach(c => c.classList.remove('dragging')); clearDrop(); });
board.addEventListener('dragover', e => {
  const list = e.target.closest('.kb-list'); if (!list || !dragId) return;
  e.preventDefault(); e.dataTransfer.dropEffect = 'move';
  $$('.kb-list.over').forEach(l => { if (l !== list) l.classList.remove('over'); });
  list.classList.add('over');
  let line = $('.drop-line');
  if (!line) { line = document.createElement('div'); line.className = 'drop-line'; }
  const after = afterCard(list, e.clientY);
  if (after) { if (line.nextElementSibling !== after) list.insertBefore(line, after); }
  else if (list.lastElementChild !== line) list.append(line);
});
board.addEventListener('dragleave', e => { const list = e.target.closest('.kb-list'); if (list && !list.contains(e.relatedTarget)) { list.classList.remove('over'); const l = $('.drop-line', list); if (l) l.remove(); } });
board.addEventListener('drop', e => {
  const list = e.target.closest('.kb-list'); if (!list || !dragId) return;
  e.preventDefault();
  let beforeId = null;
  const line = $('.drop-line', list);
  if (line) { let n = line.nextElementSibling; while (n && !n.classList.contains('kb-card')) n = n.nextElementSibling; beforeId = n ? n.dataset.id : null; }
  const id = dragId; clearDrop(); moveTask(id, list.dataset.col, beforeId);
});

