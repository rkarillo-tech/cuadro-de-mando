const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const fmtDate = ts => new Date(ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
const fmtDateTime = ts => new Date(ts).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const fmtTime = ts => new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
const isTyping = el => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
const clone = o => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));
const safeName = s => (String(s || '').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_').slice(0, 80)) || 'nota';

function relTime(ts) {
  const d = (Date.now() - ts) / 1000;
  if (d < 60) return 'ahora mismo';
  if (d < 3600) return `hace ${Math.floor(d / 60)} min`;
  if (d < 86400) return `hace ${Math.floor(d / 3600)} h`;
  if (d < 86400 * 7) return `hace ${Math.floor(d / 86400)} d`;
  return fmtDate(ts);
}
function download(name, content, type = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
async function copyText(text, okMsg = 'Copiado al portapapeles') {
  if (!text) { toast('No hay nada que copiar', 'warning'); return false; }
  try { await navigator.clipboard.writeText(text); toast(okMsg, 'success', 1800); return true; }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.append(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch {}
    ta.remove();
    toast(ok ? okMsg : 'No se pudo copiar', ok ? 'success' : 'danger', 1800);
    return ok;
  }
}

/* ---------- Toasts ---------- */
function toast(msg, type = 'info', ms = 2600, action) {
  const wrap = $('#toasts'); if (!wrap) return;
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = `<span class="grow">${esc(msg)}</span>`;
  if (action) {
    const b = document.createElement('button');
    b.className = 'btn sm'; b.textContent = action.label;
    b.onclick = () => { action.fn(); el.remove(); };
    el.append(b);
  }
  wrap.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, ms);
}

/* ---------- Modales (sustituyen a prompt/confirm) ---------- */
function modal({ title, body = '', actions, wide = false, onOpen } = {}) {
  actions = actions || [{ label: 'Cancelar', value: null, cls: 'ghost' }, { label: 'Aceptar', value: 'ok', cls: 'primary' }];
  return new Promise(resolve => {
    const back = $('#modalBack'), box = $('#modal');
    box.className = 'modal' + (wide ? ' wide' : '');
    box.innerHTML = `<div class="modal-head"><h3>${esc(title)}</h3><button type="button" class="btn icon sm ghost" data-x aria-label="Cerrar">✕</button></div><form class="modal-body" autocomplete="off"></form><div class="modal-foot"></div>`;
    const form = $('form', box);
    form.innerHTML = body;
    const foot = $('.modal-foot', box);
    const prevFocus = document.activeElement;
    let done = false;
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(null); }
      else if (e.key === 'Enter' && box.contains(e.target) && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && !e.target.hasAttribute('data-noenter')) { e.preventDefault(); finish(primary); }
    };
    function finish(a) {
      if (done) return;
      if (a && a.validate) { const err = a.validate(form); if (err) { toast(err, 'warning'); return; } }
      done = true;
      back.classList.remove('open');
      document.removeEventListener('keydown', onKey, true);
      const v = a ? a.value : null;
      resolve(v == null ? null : { action: v, form, data: Object.fromEntries(new FormData(form)) });
      try { prevFocus && prevFocus.focus && prevFocus.focus({ preventScroll: true }); } catch {}
    }
    actions.forEach(a => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn ' + (a.cls || ''); b.textContent = a.label;
      b.onclick = () => finish(a);
      foot.append(b);
    });
    const primary = actions.find(a => /primary|danger-solid/.test(a.cls || '')) || actions[actions.length - 1];
    document.addEventListener('keydown', onKey, true);
    $('[data-x]', box).onclick = () => finish(null);
    back.onmousedown = e => { if (e.target === back) finish(null); };
    form.addEventListener('submit', e => e.preventDefault());
    back.classList.add('open');
    if (onOpen) onOpen(form);
    const f = form.querySelector('[data-autofocus]') || form.querySelector('input:not([type=checkbox]):not([type=radio]):not([type=hidden]),textarea,select');
    if (f) { f.focus(); try { if (f.type === 'text' || f.tagName === 'TEXTAREA') f.select(); } catch {} }
    else foot.lastElementChild && foot.lastElementChild.focus();
  });
}
async function askText(title, label, value = '', placeholder = '') {
  const r = await modal({
    title,
    body: `<div><label class="lbl">${esc(label)}</label><input class="field" type="text" name="v" value="${esc(value)}" placeholder="${esc(placeholder)}"></div>`,
    actions: [{ label: 'Cancelar', value: null, cls: 'ghost' },
      { label: 'Aceptar', value: 'ok', cls: 'primary', validate: f => f.elements.namedItem('v').value.trim() ? null : 'Este campo no puede estar vacío' }]
  });
  return r ? r.data.v.trim() : null;
}
async function confirmDialog(msg, okLabel = 'Eliminar', danger = true) {
  const r = await modal({
    title: 'Confirmar', body: `<p>${esc(msg)}</p>`,
    actions: [{ label: 'Cancelar', value: null, cls: 'ghost' }, { label: okLabel, value: 'ok', cls: danger ? 'danger-solid' : 'primary' }]
  });
  return !!r;
}


/** Cambia el texto de un elemento sin sustituir su nodo de texto.
    Sustituir nodos en la página mientras se escribe rompe el «Deshacer» del editor (Chrome deshace letra a letra). */
function setText(el, t) {
  if (!el) return;
  t = String(t);
  const c = el.firstChild;
  if (c && c.nodeType === 3 && !c.nextSibling) { if (c.nodeValue !== t) c.nodeValue = t; }
  else if (el.textContent !== t) el.textContent = t;
}
