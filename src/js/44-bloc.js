/* =====================================================================
   BLOC RÁPIDO · un post-it siempre a mano
   =====================================================================
   Un texto corto que se guarda solo y viaja con los datos (archivo vinculado
   y copias incluidos). Se abre desde el botón 🗒️ de la barra o con Alt+B, y
   en Inicio se ve la misma caja. Cuando lo escrito ya vale, se convierte en
   una nota o en tareas de una vez.
*/
const blocGet = () => String(store.get('scratch', '') || '');
const blocSaveSoon = debounce(v => { store.set('scratch', v); blocMark(); }, 500);
const blocPop = document.createElement('div');
blocPop.className = 'popover bloc-pop'; blocPop.id = 'blocPop';
blocPop.innerHTML = `<div class="bloc-head"><b>🗒️ Bloc rápido</b><span class="muted small" id="blocSaved"></span></div>
  <textarea class="field" id="blocPad" rows="8" placeholder="Apunta aquí lo que sea: un teléfono, una idea, lo que te acaban de decir…&#10;&#10;Se guarda solo y lo tienes en todos tus dispositivos."></textarea>
  <div class="row bloc-btns">
    <button type="button" class="btn sm" data-bloc="note" title="Crear una nota con lo escrito y vaciar el bloc">📝 A nota</button>
    <button type="button" class="btn sm" data-bloc="todo" title="Crear una tarea por cada línea y vaciar el bloc">☑️ A tareas</button>
    <button type="button" class="btn sm ghost" data-bloc="copy" title="Copiar al portapapeles">📋</button>
    <button type="button" class="btn sm ghost" data-bloc="clear" title="Vaciar el bloc">🗑️</button>
  </div>`;
document.body.append(blocPop);

/** Mantiene a la vez la caja flotante y la de Inicio. */
function blocRefresh(from) {
  const v = blocGet();
  [$('#blocPad'), $('#dashBloc')].forEach(t => { if (t && t !== from && t.value !== v) t.value = v; });
  const dot = $('#blocDot'); if (dot) dot.hidden = !v.trim();
  blocMark();
}
function blocMark() {
  const el = $('#blocSaved'); if (!el) return;
  const n = blocGet().trim();
  setText(el, n ? `${n.split('\n').filter(Boolean).length} línea${n.split('\n').filter(Boolean).length === 1 ? '' : 's'} · se guarda solo` : 'se guarda solo');
}
function blocType(e) {
  const v = e.target.value;
  blocSaveSoon(v);
  [$('#blocPad'), $('#dashBloc')].forEach(t => { if (t && t !== e.target) t.value = v; });
  const dot = $('#blocDot'); if (dot) dot.hidden = !v.trim();
}
function blocOpen() {
  blocRefresh();
  openPopover(blocPop, $('#blocBtn'));
  setTimeout(() => { const t = $('#blocPad'); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } }, 40);
}
function blocToggle() { blocPop.classList.contains('open') ? closePopovers() : blocOpen(); }
/** Convierte lo escrito en una nota o en tareas; el bloc se vacía y se puede deshacer. */
function blocConvert(kind) {
  const text = blocGet().trim();
  if (!text) { toast('El bloc está vacío', 'warning', 2000); return; }
  const undo = () => { store.set('scratch', text); blocRefresh(); };
  if (kind === 'todo') {
    const lineas = text.split('\n').map(l => l.trim()).filter(Boolean);
    const ids = lineas.map(l => { const t = addTodoFromText(l, 'inbox'); return t && t.id; }).filter(Boolean);
    store.set('scratch', ''); blocRefresh();
    toast(`${ids.length} ${ids.length === 1 ? 'tarea creada' : 'tareas creadas'}`, 'success', 6000, {
      label: 'Deshacer',
      fn: () => { S.todos = S.todos.filter(t => !ids.includes(t.id)); save.todos(); refreshTodoViews(); undo(); }
    });
  } else {
    const [first, ...rest] = text.split('\n');
    const titulo = first.trim().slice(0, 80) || 'Bloc rápido';
    const cuerpo = (rest.length ? rest : []).map(l => l.trim() ? `<div>${esc(l)}</div>` : '<div><br></div>').join('') || '<div><br></div>';
    const n = createNote(titulo, cuerpo, false);
    store.set('scratch', ''); blocRefresh();
    toast(`Nota «${n.title}» creada`, 'success', 6000, {
      label: 'Deshacer',
      fn: () => { S.notes = S.notes.filter(x => x.id !== n.id); save.notes(); renderNotesView(); undo(); }
    });
  }
  renderDashboard();
}
async function blocClear() {
  const text = blocGet();
  if (!text.trim()) return;
  if (text.trim().length > 120 && !(await confirmDialog('Se borrará lo que hay en el bloc rápido. ¿Seguro?', 'Vaciar'))) return;
  store.set('scratch', ''); blocRefresh();
  toast('Bloc vaciado', 'info', 6000, { label: 'Deshacer', fn: () => { store.set('scratch', text); blocRefresh(); } });
}
blocPop.addEventListener('click', e => {
  const b = e.target.closest('[data-bloc]'); if (!b) return;
  ({ note: () => blocConvert('note'), todo: () => blocConvert('todo'), copy: () => copyText(blocGet(), 'Bloc copiado'), clear: blocClear })[b.dataset.bloc]();
});
blocPop.addEventListener('input', e => { if (e.target.id === 'blocPad') blocType(e); });
blocPop.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closePopovers(); $('#blocBtn').focus(); } });
$('#blocBtn').addEventListener('click', blocToggle);
document.addEventListener('keydown', e => {
  if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyB') { e.preventDefault(); blocToggle(); }
});
/* La misma caja, en Inicio */
const dashBloc = $('#dashBloc');
if (dashBloc) {
  dashBloc.addEventListener('input', blocType);
  dashBloc.closest('.card').addEventListener('click', e => {
    const b = e.target.closest('[data-bloc2]'); if (!b) return;
    ({ note: () => blocConvert('note'), todo: () => blocConvert('todo'), clear: blocClear })[b.dataset.bloc2]();
  });
}
