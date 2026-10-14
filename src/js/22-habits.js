/* =====================================================================
   HÁBITOS
   ===================================================================== */
const HABIT_EMOJIS = ['💧', '🏃', '📚', '🧘', '💪', '🥗', '😴', '✍️', '🚭', '🧹', '🎸', '🇬🇧', '💊', '🚶', '🙏', '📵'];
const habitOpen = new Set();
const scheduledOn = (h, d) => !h.days || !h.days.length || h.days.includes(d.getDay());
function habitStats(h) {
  const log = h.log || {};
  const today = parseDay(todayKey());
  const keys = Object.keys(log).sort();
  let start = parseDay(dayKey(new Date(h.created || Date.now())));
  if (keys.length && parseDay(keys[0]) < start) start = parseDay(keys[0]);
  let run = 0, best = 0;
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const k = dayKey(d);
    if (log[k]) { run++; best = Math.max(best, run); }
    else if (scheduledOn(h, d) && k !== todayKey()) run = 0;
  }
  let sched = 0, done = 0;
  for (let i = 0; i < 30; i++) {
    const d = addDays(today, -i), k = dayKey(d);
    if (i === 0 && !log[k]) continue;
    if (scheduledOn(h, d)) { sched++; if (log[k]) done++; }
    else if (log[k]) { sched++; done++; }
  }
  return { current: run, best, rate: sched ? Math.round(done / sched * 100) : 0, total: keys.length };
}
function habitsToday() {
  const d = new Date(), k = todayKey();
  const list = S.habits.filter(h => !h.archived && scheduledOn(h, d));
  return { list, total: list.length, done: list.filter(h => h.log && h.log[k]).length };
}
function toggleHabitDay(id, key) {
  const h = S.habits.find(x => x.id === id); if (!h) return;
  h.log = h.log || {};
  if (h.log[key]) delete h.log[key]; else h.log[key] = 1;
  save.habits();
  if (currentTab === 'habits') renderHabits();
}
function heatmapHtml(h, weeks = 26) {
  const today = parseDay(todayKey());
  const start = addDays(startOfWeek(today), -(weeks - 1) * 7);
  let out = '';
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(start, i), k = dayKey(d);
    let cls = '';
    if (d > today) cls = 'fut';
    else if (h.log && h.log[k]) cls = 'done';
    else if (!scheduledOn(h, d)) cls = 'off';
    else if (d < parseDay(dayKey(new Date(h.created || 0)))) cls = '';
    else cls = 'miss';
    out += `<i class="${cls}" title="${esc(fmtDayLabel(k))}${h.log && h.log[k] ? ' ✓' : ''}"></i>`;
  }
  return `<div class="heat" style="--hc:${safeColor(h.color)}">${out}</div>`;
}
function renderHabits() {
  if (!$('#habList')) return;
  const ht = habitsToday();
  $('#habSummary').textContent = ht.total ? `Hoy llevas ${ht.done} de ${ht.total} hábitos` : 'Hoy no tienes hábitos programados';
  const active = S.habits.filter(h => !h.archived);
  const days = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i - 6));
  $('#habList').innerHTML = active.length ? active.map(h => {
    const st = habitStats(h);
    const sched = (!h.days || !h.days.length || h.days.length === 7) ? 'Todos los días' : [1, 2, 3, 4, 5, 6, 0].filter(d => h.days.includes(d)).map(d => DOW_SHORT[d]).join(' · ');
    return `<div class="card habit" data-id="${esc(h.id)}" style="--hc:${safeColor(h.color)}">
      <div class="habit-row">
        <div class="habit-emoji">${esc(h.emoji || '🔁')}</div>
        <div style="min-width:0"><div class="habit-name">${esc(h.name)}</div><div class="muted small">${sched} · 🔥 ${st.current} día${st.current === 1 ? '' : 's'} · mejor racha ${st.best} · ${st.rate} % en 30 días</div></div>
        <div class="habit-days">${days.map(d => { const k = dayKey(d), on = scheduledOn(h, d), done = h.log && h.log[k]; return `<div class="hday${k === todayKey() ? ' today' : ''}"><span>${DOW_SHORT[d.getDay()]}</span><button class="${done ? 'done' : ''}${!on && !done ? ' off' : ''}" data-day="${k}" title="${esc(fmtLongDay(k))}">${done ? '✓' : d.getDate()}</button></div>`; }).join('')}</div>
        <button class="btn icon sm ghost" data-hmenu title="Opciones">⋯</button>
      </div>
      <details${habitOpen.has(h.id) ? ' open' : ''} data-hd><summary class="muted small" style="cursor:pointer">Historial (6 meses)</summary><div style="margin-top:8px">${heatmapHtml(h)}</div></details>
    </div>`;
  }).join('') : '<div class="card empty-state"><div style="font-size:2.4rem">🌱</div><h3>Empieza un hábito</h3><p class="muted">Beber agua, leer 20 minutos, salir a caminar… Márcalo cada día y mantén la racha.</p></div>';
  const arch = S.habits.filter(h => h.archived);
  if (arch.length) $('#habList').insertAdjacentHTML('beforeend', `<details class="card"><summary class="muted" style="cursor:pointer">Archivados (${arch.length})</summary><div class="list" style="margin-top:8px">${arch.map(h => `<div class="list-item" data-id="${esc(h.id)}" style="cursor:default"><span>${esc(h.emoji || '🔁')}</span><span class="grow">${esc(h.name)}</span><button class="btn sm" data-unarch>Recuperar</button></div>`).join('')}</div></details>`);
}
onShow.habits = renderHabits;

async function openHabit(id) {
  const ex = id ? S.habits.find(h => h.id === id) : null;
  const h = ex ? clone(ex) : { id: uid(), name: '', emoji: '💧', color: COLORS[S.habits.length % COLORS.length], days: [0, 1, 2, 3, 4, 5, 6], log: {}, created: Date.now(), archived: false };
  const days = h.days && h.days.length ? h.days : [0, 1, 2, 3, 4, 5, 6];
  const r = await modal({
    title: ex ? '✏️ Editar hábito' : '🌱 Nuevo hábito',
    body: `<div class="row" style="flex-wrap:nowrap"><input class="field" type="text" name="emoji" value="${esc(h.emoji || '')}" style="max-width:70px;text-align:center;font-size:1.3rem" maxlength="4"><input class="field" type="text" name="name" value="${esc(h.name)}" placeholder="Leer 20 minutos" maxlength="60" data-autofocus></div>
      <div class="chips" id="habEmojis">${HABIT_EMOJIS.map(e => `<span class="chip" data-e="${e}">${e}</span>`).join('')}</div>
      <div><label class="lbl">Días</label><div class="chips" id="habDays">${[1, 2, 3, 4, 5, 6, 0].map(d => `<label class="chip${days.includes(d) ? ' on' : ''}"><input type="checkbox" name="d${d}"${days.includes(d) ? ' checked' : ''}>${DOW_LONG[d].slice(0, 3)}</label>`).join('')}</div></div>
      <div><label class="lbl">Color</label>${swatchesHtml('color', safeColor(h.color))}</div>`,
    actions: [
      ...(ex ? [{ label: '🗑️ Eliminar', value: 'delete', cls: 'danger left' }] : []),
      { label: 'Cancelar', value: null, cls: 'ghost' },
      { label: 'Guardar', value: 'ok', cls: 'primary', validate: f => f.elements.namedItem('name').value.trim() ? (['0', '1', '2', '3', '4', '5', '6'].some(d => f.elements.namedItem('d' + d).checked) ? null : 'Elige al menos un día') : 'Escribe un nombre' }
    ],
    onOpen: form => {
      $('#habEmojis', form).addEventListener('click', e => { const c = e.target.closest('[data-e]'); if (c) form.elements.namedItem('emoji').value = c.dataset.e; });
      $('#habDays', form).addEventListener('change', e => { const l = e.target.closest('label'); if (l) l.classList.toggle('on', e.target.checked); });
    }
  });
  if (!r) return;
  if (r.action === 'delete') {
    if (!(await confirmDialog(`¿Eliminar «${ex.name}» y todo su historial? Si solo quieres dejarlo, mejor archívalo.`))) return;
    S.habits = S.habits.filter(x => x !== ex); save.habits(); renderHabits(); return;
  }
  Object.assign(h, { name: r.data.name.trim(), emoji: (r.data.emoji || '').trim() || '🔁', color: safeColor(r.data.color), days: [0, 1, 2, 3, 4, 5, 6].filter(d => r.data['d' + d]) });
  if (ex) Object.assign(ex, h); else S.habits.push(h);
  save.habits(); renderHabits();
}
$('#habNew').addEventListener('click', () => openHabit(null));
$('#habList').addEventListener('click', e => {
  const card = e.target.closest('[data-id]'); if (!card) return;
  const id = card.dataset.id;
  const day = e.target.closest('[data-day]');
  if (day) { toggleHabitDay(id, day.dataset.day); return; }
  if (e.target.closest('[data-unarch]')) { const h = S.habits.find(x => x.id === id); h.archived = false; save.habits(); renderHabits(); return; }
  const m = e.target.closest('[data-hmenu]');
  if (m) {
    const h = S.habits.find(x => x.id === id);
    showMenu(m, [
      { icon: '✏️', label: 'Editar', fn: () => openHabit(id) },
      { icon: '📥', label: 'Archivar', fn: () => { h.archived = true; save.habits(); renderHabits(); toast(`«${h.name}» archivado`, 'info', 4000, { label: 'Deshacer', fn: () => { h.archived = false; save.habits(); renderHabits(); } }); } }
    ]);
  }
});
$('#habList').addEventListener('toggle', e => {
  const d = e.target; if (!d.matches || !d.matches('details[data-hd]')) return;
  const id = d.closest('[data-id]').dataset.id;
  d.open ? habitOpen.add(id) : habitOpen.delete(id);
}, true);
