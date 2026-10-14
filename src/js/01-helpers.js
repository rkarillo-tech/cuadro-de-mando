/* =====================================================================
   UTILIDADES ADICIONALES (fechas, colores, menús, CSV)
   ===================================================================== */
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const parseDay = k => { const [y, m, d] = String(k).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
function addMonthsClamp(d, n) {
  const y = d.getFullYear(), m = d.getMonth() + n;
  const last = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(d.getDate(), last));
}
const todayKey = () => dayKey();
const diffDays = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 864e5);
const startOfWeek = d => addDays(d, -((d.getDay() + 6) % 7));
const isValidDay = k => /^\d{4}-\d{2}-\d{2}$/.test(k || '') && !isNaN(parseDay(k));
const DOW_SHORT = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const DOW_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

function fmtDayLabel(key) {
  if (!key) return '';
  const diff = diffDays(todayKey(), key);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  if (diff === -1) return 'Ayer';
  const d = parseDay(key);
  const o = { weekday: 'short', day: 'numeric', month: 'short' };
  if (d.getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
  return d.toLocaleDateString('es-ES', o);
}
const fmtLongDay = key => cap(parseDay(key).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
function fmtDur(ms, secs = false) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return secs ? `${h}:${pad(m)}:${pad(s)}` : `${h}:${pad(m)}`;
}
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y0) / 864e5 + 1) / 7);
}

/* ---------- Colores ---------- */
const COLORS = ['#8b7cf6', '#4cb3f5', '#3ecf8e', '#f5b94a', '#f2667a', '#f2884b', '#c56cf0', '#2bb3a0', '#8f97ab'];
function hashColor(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return COLORS[Math.abs(h) % (COLORS.length - 1)]; }
function swatchesHtml(name, selected) {
  return `<div class="swatches">${COLORS.map(c => `<label title="Color"><input type="radio" name="${name}" value="${c}"${c === selected ? ' checked' : ''}><span style="background:${c}"></span></label>`).join('')}</div>`;
}
const safeColor = c => /^#[0-9a-f]{6}$/i.test(c || '') ? c : COLORS[0];

/* ---------- Menú contextual genérico ---------- */
function showMenu(anchor, items) {
  const m = $('#ctxMenu');
  if (m.classList.contains('open') && m._anchor === anchor) { m.classList.remove('open'); return; }
  const list = items.filter(Boolean);
  m.innerHTML = list.map((it, i) => it === '-' ? '<hr>' : `<button type="button" data-i="${i}" class="${it.danger ? 'danger' : ''}">${it.icon || ''} ${esc(it.label)}</button>`).join('');
  m.onclick = e => { const b = e.target.closest('[data-i]'); if (!b) return; m.classList.remove('open'); list[+b.dataset.i].fn(); };
  m._anchor = anchor;
  openPopover(m, anchor);
}

/* ---------- CSV ---------- */
const csvCell = v => { const s = String(v ?? ''); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const csvRow = arr => arr.map(csvCell).join(';');
const numES = (n, d = 2) => n.toFixed(d).replace('.', ',');

/* ---------- Lectura de archivos ---------- */
const readText = file => file.text();

/* ---------- Búsqueda tolerante a errores ----------
   Se usa solo como segunda opción, cuando la búsqueda exacta encuentra poco.
   Una palabra «se parece» a otra si: es una abreviatura (sus letras aparecen en orden y empieza
   igual: «ptas» → «patatas») o hay 1 errata (2 si la palabra es larga): «reunion» → «reunión»,
   «kubernets» → «kubernetes», «procedimeinto» → «procedimiento». */
function editDist(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null, prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);   // letras cambiadas de sitio
      cur.push(v); if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev2 = prev; prev = cur;
  }
  return prev[b.length];
}
const isAbbrev = (w, t) => { if (w[0] !== t[0] || t.length > w.length * 3) return false; let i = 0; for (const ch of t) { if (ch === w[i]) i++; if (i === w.length) return true; } return false; };
/** 0 = no se parece; cuanto mayor, mejor. q ya normalizada. */
function fuzzyScore(q, text) {
  const words = q.split(/\s+/).filter(w => w.length >= 3);
  if (!words.length) return 0;
  const toks = [...new Set(norm(text).split(/[^\p{L}\p{N}]+/u).filter(t => t.length >= 2))].slice(0, 400);
  let total = 0;
  for (const w of words) {
    const max = w.length >= 8 ? 2 : 1;
    let best = 0;
    for (const t of toks) {
      if (t.includes(w)) { best = 3; break; }
      if (w.length >= 4 && editDist(w, t.slice(0, w.length + max), max) <= max && editDist(w, t, max) <= max) best = Math.max(best, 2);
      else if (isAbbrev(w, t)) best = Math.max(best, 1);
    }
    if (!best) return 0;
    total += best;
  }
  return total;
}
