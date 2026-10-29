const POMO_MODES = {
  focus: { label: 'Foco', color: 'var(--accent)' },
  short: { label: 'Descanso corto', color: 'var(--success)' },
  long: { label: 'Descanso largo', color: 'var(--info)' }
};
const modeMs = m => S.pomo[m] * 60000;
let P = null;
function initPomo() {
  P = Object.assign({ mode: 'focus', running: false, endAt: 0, remaining: null, cycle: 0, taskId: '', projectId: '' }, store.get('pomoState', {}));
  if (!POMO_MODES[P.mode]) P.mode = 'focus';
  if (P.remaining == null || P.remaining > modeMs(P.mode)) P.remaining = modeMs(P.mode);
}
const pomoTaskTitle = id => { const k = S.tasks.find(x => x.id === id); if (k) return k.title; const t = S.todos.find(x => x.id === id); return t ? t.text : ''; };
const savePomo = () => store.set('pomoState', P);
const pomoRemaining = () => P.running ? Math.max(0, P.endAt - Date.now()) : P.remaining;
let audioCtx = null, lastTitle = '';

function ensureAudio() {
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); } catch {}
}
function beep() {
  if (!S.pomo.sound || !audioCtx) return;
  try {
    const t0 = audioCtx.currentTime;
    [0, 0.28, 0.56].forEach((d, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = i === 2 ? 1046.5 : 880;
      g.gain.setValueAtTime(0.0001, t0 + d);
      g.gain.exponentialRampToValueAtTime(0.3, t0 + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.24);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0 + d); o.stop(t0 + d + 0.26);
    });
  } catch {}
}
function notify(title, body) {
  toast(title, 'success', 6000);
  try { if ('Notification' in window && Notification.permission === 'granted' && document.hidden) new Notification(title, { body }); } catch {}
}
function pomoStart() { if (P.running) return; ensureAudio(); if (P.remaining <= 0) P.remaining = modeMs(P.mode); P.endAt = Date.now() + P.remaining; P.running = true; savePomo(); pomoRender(); }
function pomoPause() { if (!P.running) return; P.remaining = Math.max(0, P.endAt - Date.now()); P.running = false; savePomo(); pomoRender(); }
function pomoToggle() { P.running ? pomoPause() : pomoStart(); }
function pomoSetMode(m, autostart = false) { P.mode = m; P.running = false; P.remaining = modeMs(m); savePomo(); if (autostart) pomoStart(); else pomoRender(); }
function pomoComplete(skipped = false) {
  const finished = P.mode;
  if (finished === 'focus' && !skipped) {
    const limit = Date.now() - 400 * 864e5;
    S.focusLog = S.focusLog.filter(l => l.at > limit);
    S.focusLog.push({ id: uid(), date: dayKey(), at: Date.now(), minutes: S.pomo.focus, taskId: P.taskId || '' });
    save.focus();
    const t = P.taskId && S.tasks.find(x => x.id === P.taskId);
    if (t) { t.pomodoros = (t.pomodoros || 0) + 1; save.tasks(); renderBoard(); }
    const td = P.taskId && S.todos.find(x => x.id === P.taskId);
    if (td) { td.pomodoros = (td.pomodoros || 0) + 1; save.todos(); }
    if (P.projectId && S.projects.some(p => p.id === P.projectId)) {
      const end = Date.now();
      S.timeEntries.push({ id: uid(), projectId: P.projectId, desc: '🍅 ' + (pomoTaskTitle(P.taskId) || 'Pomodoro'), start: end - S.pomo.focus * 60000, end });
      save.time();
    }
    P.cycle++;
  }
  if (finished === 'long') P.cycle = 0;
  const next = finished === 'focus' ? (P.cycle > 0 && P.cycle % S.pomo.every === 0 ? 'long' : 'short') : 'focus';
  if (!skipped) {
    notify(finished === 'focus' ? '¡Sesión de foco completada! 🍅' : 'Descanso terminado. ¡A por la siguiente! 💪',
      finished === 'focus' ? `Toca ${next === 'long' ? 'un descanso largo' : 'un descanso corto'}.` : 'Empieza una nueva sesión de foco.');
    beep();
  }
  pomoSetMode(next, S.pomo.auto && !skipped);
  renderPomoToday();
  if (currentTab === 'dashboard') renderDashboard();
}
function pomoRender() {
  const rem = pomoRemaining(), total = modeMs(P.mode);
  const secs = Math.ceil(rem / 1000);
  const txt = `${pad(Math.floor(secs / 60))}:${pad(secs % 60)}`;
  $('#pomoTime').textContent = txt;
  const C = 2 * Math.PI * 54, ring = $('#pomoRing');
  ring.style.strokeDasharray = C;
  ring.style.strokeDashoffset = C * (1 - Math.min(1, rem / total));
  ring.style.stroke = POMO_MODES[P.mode].color;
  $('#pomoLabel').textContent = P.running ? POMO_MODES[P.mode].label : (rem >= total ? `${POMO_MODES[P.mode].label} · listo` : 'En pausa');
  $('#pomoToggle').textContent = P.running ? '⏸ Pausar' : (rem < total ? '▶ Reanudar' : '▶ Iniciar');
  $$('#pomoModes button').forEach(b => b.classList.toggle('on', b.dataset.mode === P.mode));
  const every = S.pomo.every;
  const filled = P.mode === 'long' && P.cycle > 0 ? every : P.cycle % every;
  const dots = Array.from({ length: every }, (_, i) => `<i class="${i < filled ? 'on' : ''}"></i>`).join('');
  if ($('#pomoDots').innerHTML !== dots) $('#pomoDots').innerHTML = dots;
  const t = (avBadge ? `⏰ (${avBadge}) ` : '') + (P.running ? `${txt} · ${POMO_MODES[P.mode].label}` : 'Cuadro de Mando');
  if (t !== lastTitle) { document.title = t; lastTitle = t; }
}
function renderPomoToday() {
  const today = dayKey();
  const logs = S.focusLog.filter(l => l.date === today);
  $('#pomoTodayCount').textContent = logs.length;
  $('#pomoTodayMin').textContent = logs.reduce((a, l) => a + l.minutes, 0);
  $('#pomoToday').innerHTML = logs.length ? logs.slice().reverse().map(l => {
    const t = pomoTaskTitle(l.taskId);
    return `<div class="list-item" style="cursor:default"><span>🍅</span><span class="grow ellipsis">${t ? esc(t) : '<span class="muted">Sin tarea asociada</span>'}</span><span class="muted small">${fmtTime(l.at)} · ${l.minutes} min</span></div>`;
  }).join('') : '<div class="empty small">Aún no has completado ninguna sesión hoy.</div>';
}
function fillPomoTasks() {
  const tasks = S.tasks.filter(t => t.col !== 'done');
  const todos = S.todos.filter(t => !t.done).sort(byDue);
  if (P.taskId && !tasks.some(t => t.id === P.taskId) && !todos.some(t => t.id === P.taskId)) { P.taskId = ''; savePomo(); }
  $('#pomoTask').innerHTML = '<option value="">— Ninguna —</option>'
    + (todos.length ? `<optgroup label="Tareas">${todos.slice(0, 150).map(t => `<option value="${esc(t.id)}">${esc(t.text.slice(0, 70))}</option>`).join('')}</optgroup>` : '')
    + (tasks.length ? `<optgroup label="Kanban">${tasks.map(t => `<option value="${esc(t.id)}">${esc(t.title.slice(0, 70))}</option>`).join('')}</optgroup>` : '');
  $('#pomoTask').value = P.taskId || '';
  const projs = S.projects.filter(p => !p.archived);
  if (P.projectId && !projs.some(p => p.id === P.projectId)) { P.projectId = ''; savePomo(); }
  $('#pomoProject').innerHTML = '<option value="">— No registrar —</option>' + projs.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  $('#pomoProject').value = P.projectId || '';
}
function fillPomoSettings() {
  $('#pomoFocus').value = S.pomo.focus; $('#pomoShort').value = S.pomo.short; $('#pomoLong').value = S.pomo.long; $('#pomoEvery').value = S.pomo.every;
  $('#pomoAuto').checked = !!S.pomo.auto; $('#pomoSound').checked = !!S.pomo.sound;
}
onShow.timer = () => { fillPomoTasks(); renderPomoToday(); pomoRender(); };

$('#pomoToggle').addEventListener('click', pomoToggle);
$('#pomoReset').addEventListener('click', () => pomoSetMode(P.mode));
$('#pomoSkip').addEventListener('click', () => pomoComplete(true));
$('#pomoModes').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b) pomoSetMode(b.dataset.mode); });
$('#pomoTask').addEventListener('change', e => { P.taskId = e.target.value; savePomo(); });
$('#pomoProject').addEventListener('change', e => { P.projectId = e.target.value; savePomo(); });
[['pomoFocus', 'focus', 1, 180], ['pomoShort', 'short', 1, 60], ['pomoLong', 'long', 1, 90], ['pomoEvery', 'every', 2, 10]].forEach(([elId, key, min, max]) => {
  $('#' + elId).addEventListener('change', e => {
    const v = Math.min(max, Math.max(min, parseInt(e.target.value, 10) || S.pomo[key]));
    e.target.value = v; S.pomo[key] = v; save.pomo();
    if (!P.running) { P.remaining = modeMs(P.mode); savePomo(); }
    pomoRender();
  });
});
$('#pomoAuto').addEventListener('change', e => { S.pomo.auto = e.target.checked; save.pomo(); });
$('#pomoSound').addEventListener('change', e => { S.pomo.sound = e.target.checked; save.pomo(); if (e.target.checked) { ensureAudio(); beep(); } });
$('#pomoNotif').addEventListener('click', async () => {
  if (!('Notification' in window)) { toast('Este navegador no admite notificaciones', 'warning'); return; }
  try { const p = await Notification.requestPermission(); toast(p === 'granted' ? 'Notificaciones activadas' : 'El navegador no ha concedido el permiso (al abrir el archivo en local algunos navegadores lo bloquean)', p === 'granted' ? 'success' : 'warning', 4500); }
  catch { toast('No se pudieron activar las notificaciones', 'warning'); }
});
setInterval(() => {
  if (!APP_READY || !P) return;
  if (P.running && Date.now() >= P.endAt) { P.running = false; P.remaining = 0; pomoComplete(); }
  if (P.running || currentTab === 'timer') pomoRender();
}, 250);

