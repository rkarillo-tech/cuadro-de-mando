/* =====================================================================
   HERRAMIENTAS · LISTAS (separar, limpiar, seleccionar, unir y comparar)
   ===================================================================== */
const LS_SPLIT = { line: /\r?\n/, comma: /,/, semi: /;/, tab: /\t/, space: /\s+/, pipe: /\|/, multi: /[\r\n,;\t]+/ };
const LS_SPLIT_NAME = { line: 'saltos de línea', comma: 'comas', semi: 'punto y coma', tab: 'tabuladores', space: 'espacios', pipe: 'barras |', multi: 'línea, coma, ; y tab' };
const lsState = { unchecked: new Set(), mode: 'pick', items: [], dups: [] };
const lsVal = id => $('#' + id).value;
const lsOn = id => $('#' + id).checked;

function lsDetect(t) {
  const lines = t.split(/\r?\n/).filter(l => l.trim());
  if (lines.length >= 2) return lines.some(l => l.includes('\t')) && lines.every(l => !l.includes(',')) && lines.length < 3 ? 'tab' : 'line';
  const one = lines[0] || '';
  if (one.includes('\t')) return 'tab';
  if (one.includes(';')) return 'semi';
  if (one.includes(',')) return 'comma';
  if (one.includes('|')) return 'pipe';
  return 'space';
}
const lsKey = v => lsOn('lsLoose') ? norm(v) : v;
const lsTitle = v => v.toLocaleLowerCase('es').replace(/(^|[\s\-/(])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('es'));
/** Separa y limpia un texto según las opciones. Devuelve { items, dups:[[valor, veces]], raw, how } */
function lsParse(text) {
  let how = lsVal('lsSplit');
  if (how === 'auto') how = lsDetect(text);
  let parts;
  if (how === 'custom') { const sep = lsVal('lsSplitCustom'); parts = sep ? text.split(sep) : [text]; }
  else parts = text.split(LS_SPLIT[how]);
  let items = parts;
  if (lsOn('lsTrim')) items = items.map(v => v.trim());
  if (lsOn('lsUnquote')) items = items.map(v => v.replace(/^(['"`«])(.*)(['"`»])$/s, '$2'));
  if (lsOn('lsEmpty')) items = items.filter(v => v !== '');
  const c = lsVal('lsCase');
  if (c === 'up') items = items.map(v => v.toLocaleUpperCase('es'));
  else if (c === 'low') items = items.map(v => v.toLocaleLowerCase('es'));
  else if (c === 'title') items = items.map(lsTitle);
  else if (c === 'noacc') items = items.map(v => v.normalize('NFD').replace(/[̀-ͯ]/g, ''));
  const counts = new Map();
  items.forEach(v => { const k = lsKey(v); const e = counts.get(k); if (e) e.n++; else counts.set(k, { v, n: 1 }); });
  const dups = [...counts.values()].filter(e => e.n > 1).sort((a, b) => b.n - a.n).map(e => [e.v, e.n]);
  const raw = items.length;
  if (lsOn('lsDedupe')) { const seen = new Set(); items = items.filter(v => { const k = lsKey(v); if (seen.has(k)) return false; seen.add(k); return true; }); }
  const s = lsVal('lsSort');
  const coll = new Intl.Collator('es', { sensitivity: 'base' }), natc = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
  if (s === 'az') items = [...items].sort(coll.compare);
  else if (s === 'za') items = [...items].sort((a, b) => coll.compare(b, a));
  else if (s === 'nat') items = [...items].sort(natc.compare);
  else if (s === 'len') items = [...items].sort((a, b) => a.length - b.length || coll.compare(a, b));
  else if (s === 'rev') items = [...items].reverse();
  return { items, dups, raw, unique: counts.size, how };
}
/* ---------- Formatos ---------- */
const lsEscRx = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const lsSqlQ = v => `'${v.replace(/'/g, "''")}'`;
function lsFormat(items, f = lsFmtOpts()) {
  if (!items.length) return '';
  const wrap = v => { const q = f.quote; const inner = q === "'" ? v.replace(/'/g, "''") : q === '"' ? v.replace(/"/g, '""') : v; return f.pre + q + inner + q + f.suf; };
  switch (f.preset) {
    case 'or': return items.map(wrap).join(' OR ');
    case 'and': return items.map(wrap).join(' AND ');
    case 'cs': return items.map(wrap).join(', ');
    case 'c': return items.map(wrap).join(',');
    case 'sc': return items.map(wrap).join(';');
    case 'lines': return items.map(wrap).join('\n');
    case 'tab': return items.map(wrap).join('\t');
    case 'custom': return items.map(wrap).join(f.sep.replace(/\\n/g, '\n').replace(/\\t/g, '\t'));
    case 'sqlin': case 'sqlnum': {
      const val = f.preset === 'sqlin' ? lsSqlQ : v => v.trim();
      const n = Math.max(1, f.chunk | 0 || 1000), col = f.col.trim();
      const blocks = [];
      for (let i = 0; i < items.length; i += n) blocks.push(`IN (${items.slice(i, i + n).map(val).join(', ')})`);
      if (!col) return blocks.length === 1 ? blocks[0] : blocks.map(b => 'columna ' + b).join('\n   OR ');
      return blocks.length === 1 ? `${col} ${blocks[0]}` : `(${blocks.map(b => `${col} ${b}`).join('\n   OR ')})`;
    }
    case 'json': return JSON.stringify(items);
    case 'csv': return items.map(v => `"${v.replace(/"/g, '""')}"`).join(',');
    case 'md': return items.map(v => `- ${v}`).join('\n');
    case 'rx': return `(?:${[...items].sort((a, b) => b.length - a.length).map(lsEscRx).join('|')})`;
  }
  return items.join('\n');
}
function lsFmtOpts() {
  return { preset: lsVal('lsPreset'), sep: lsVal('lsSep'), quote: lsVal('lsQuote'), pre: lsVal('lsPre'), suf: lsVal('lsSuf'), col: lsVal('lsCol'), chunk: +lsVal('lsChunk') };
}
/* ---------- Render ---------- */
function lsOut(id, title, items, extra = '') {
  const txt = lsFormat(items);
  return `<div class="ls-out"><div class="row" style="justify-content:space-between;flex-wrap:nowrap"><label class="lbl" for="${id}" style="margin:0">${title} <span class="badge">${items.length}</span>${extra}</label><button class="btn sm" data-lscopy="${id}">📋 Copiar</button></div>
    <textarea class="field code" id="${id}" rows="4" readonly spellcheck="false">${esc(txt)}</textarea></div>`;
}
function lsRender() {
  if (!$('#lsIn')) return;
  const A = lsParse(lsVal('lsIn'));
  lsState.items = A.items; lsState.dups = A.dups;
  const p = lsVal('lsPreset');
  $$('#view-devtools [data-lsf]').forEach(el => {
    const k = el.dataset.lsf;
    el.hidden = k === 'custom' ? p !== 'custom' : k === 'wrap' ? !['or', 'and', 'cs', 'c', 'sc', 'lines', 'tab', 'custom'].includes(p) : k === 'sql' ? !['sqlin', 'sqlnum'].includes(p) : false;
  });
  $('#lsSplitCustom').hidden = lsVal('lsSplit') !== 'custom';
  $('#lsDetected').textContent = lsVal('lsIn').trim() ? (lsVal('lsSplit') === 'auto' ? `Detectado: ${LS_SPLIT_NAME[A.how]}` : '') : '';
  const dupTxt = A.dups.length ? ` · <a href="#" data-ls="dups" title="Ver cuáles se repiten">${A.dups.length} valor${A.dups.length === 1 ? '' : 'es'} repetido${A.dups.length === 1 ? '' : 's'}</a>` : ' · sin repetidos';
  $('#lsStats').innerHTML = lsVal('lsIn').trim() ? `<b>${A.raw}</b> valores · <b>${A.unique}</b> distintos${dupTxt}${lsOn('lsDedupe') && A.raw !== A.items.length ? ` · quedan <b>${A.items.length}</b> tras quitar duplicados` : ''}` : 'Pega una lista arriba para empezar.';
  if (lsState.mode === 'cmp') {
    const B = lsParse(lsVal('lsInB'));
    const kb = new Set(B.items.map(lsKey)), ka = new Set(A.items.map(lsKey));
    const onlyA = A.items.filter(v => !kb.has(lsKey(v))), onlyB = B.items.filter(v => !ka.has(lsKey(v))), both = A.items.filter(v => kb.has(lsKey(v)));
    $('#lsOuts').innerHTML = `<div class="ls-grid3">${lsOut('lsOutA', 'Solo en A', onlyA)}${lsOut('lsOutB', 'Solo en B', onlyB)}${lsOut('lsOutAB', 'En las dos', both)}</div>`;
    return;
  }
  // seleccionar
  const q = norm(lsVal('lsFilter').trim());
  const shown = [], MAX = 1500;
  let matches = 0;
  A.items.forEach((v, i) => { if (!q || norm(v).includes(q)) { matches++; if (shown.length < MAX) shown.push([v, i]); } });
  $('#lsItems').innerHTML = shown.map(([v, i]) => `<label class="ls-item"><input type="checkbox" class="check" data-i="${i}"${lsState.unchecked.has(lsKey(v)) ? '' : ' checked'}><span>${esc(v) || '<i class="muted">(vacío)</i>'}</span></label>`).join('')
    + (matches > MAX ? `<div class="muted small" style="padding:6px">Se muestran ${MAX} de ${matches}. Los botones y el resultado incluyen todos.</div>` : '')
    + (!A.items.length ? '<div class="muted small" style="padding:6px">Aquí aparecerán los valores para que marques cuáles van al grupo 1.</div>' : '');
  const g1 = A.items.filter(v => !lsState.unchecked.has(lsKey(v))), g2 = A.items.filter(v => lsState.unchecked.has(lsKey(v)));
  $('#lsPickInfo').textContent = q ? `${matches} coinciden con el filtro` : '';
  $('#lsOuts').innerHTML = `<div class="ls-grid2">${lsOut('lsOut1', '✅ Grupo 1 · marcados', g1)}${lsOut('lsOut2', '⬜ Grupo 2 · sin marcar', g2)}</div>`;
}
const lsRenderSoon = debounce(lsRender, 120);
['lsIn', 'lsInB', 'lsSplitCustom', 'lsSep', 'lsPre', 'lsSuf', 'lsCol', 'lsChunk', 'lsFilter'].forEach(id => $('#' + id).addEventListener('input', lsRenderSoon));
['lsSplit', 'lsTrim', 'lsEmpty', 'lsUnquote', 'lsDedupe', 'lsLoose', 'lsSort', 'lsCase', 'lsPreset', 'lsQuote'].forEach(id => $('#' + id).addEventListener('change', lsRender));
$('#lsMode').addEventListener('click', e => {
  const b = e.target.closest('[data-m]'); if (!b) return;
  lsState.mode = b.dataset.m;
  $$('#lsMode button').forEach(x => x.classList.toggle('on', x === b));
  $$('#view-devtools .ls-pane').forEach(p => { p.hidden = p.dataset.lm !== lsState.mode; });
  $('#lsLblA').hidden = lsState.mode !== 'cmp';
  lsRender();
});
$('#lsItems').addEventListener('change', e => {
  const cb = e.target.closest('input[data-i]'); if (!cb) return;
  const k = lsKey(lsState.items[+cb.dataset.i]);
  if (cb.checked) lsState.unchecked.delete(k); else lsState.unchecked.add(k);
  lsRender();
});
$('#view-devtools').addEventListener('click', e => {
  const c = e.target.closest('[data-lscopy]'); if (c) { copyText($('#' + c.dataset.lscopy).value, 'Copiado'); return; }
  const b = e.target.closest('[data-ls]'); if (!b) return;
  e.preventDefault();
  const q = norm(lsVal('lsFilter').trim()), it = lsState.items, hit = v => !q || norm(v).includes(q);
  switch (b.dataset.ls) {
    case 'all': lsState.unchecked.clear(); break;
    case 'none': it.forEach(v => lsState.unchecked.add(lsKey(v))); break;
    case 'inv': it.forEach(v => { const k = lsKey(v); lsState.unchecked.has(k) ? lsState.unchecked.delete(k) : lsState.unchecked.add(k); }); break;
    case 'matchOn': it.filter(hit).forEach(v => lsState.unchecked.delete(lsKey(v))); break;
    case 'matchOff': it.filter(hit).forEach(v => lsState.unchecked.add(lsKey(v))); break;
    case 'dups':
      modal({ title: '🔁 Valores repetidos', body: `<p class="small muted">${lsOn('lsLoose') ? 'Sin distinguir mayúsculas ni tildes.' : 'Distinguiendo mayúsculas y tildes.'}</p><div class="list" style="max-height:50vh;overflow:auto">${lsState.dups.map(([v, n]) => `<div class="list-item" style="cursor:default;padding:5px 8px"><span class="grow ellipsis">${esc(v)}</span><span class="badge warning">× ${n}</span></div>`).join('')}</div>`, actions: [{ label: 'Copiar la lista', value: 'copy', cls: '' }, { label: 'Cerrar', value: 'ok', cls: 'primary' }] })
        .then(r => { if (r && r.action === 'copy') copyText(lsState.dups.map(([v, n]) => `${v}\t${n}`).join('\n'), 'Repetidos copiados'); });
      return;
    default: return;
  }
  lsRender();
});
lsRender();
DEV_HELP.lists = {
  what: 'Convierte una lista de valores (pegada de Excel, de un correo, de una consulta…) en el formato que necesites: separada por <code>OR</code>, como <code>IN (…)</code> de SQL, JSON, regex… Además la limpia, te deja elegir qué valores usar y compara dos listas.',
  uses: ['Montar la condición de una consulta con muchos identificadores: <code>ID IN (\'A1\', \'B2\', …)</code>. Si pasan de 1000 (límite de Oracle), la parte sola en varios <code>IN</code> unidos con <code>OR</code>.', 'Preparar búsquedas con <code>OR</code> para un buscador, un filtro de correo o Jira.', 'Quitar duplicados y saber <b>cuáles</b> se repiten y cuántas veces.', 'Separar una lista en dos grupos (marcados y sin marcar) para tratarlos de forma distinta.', 'Cruzar dos extracciones: qué está solo en una, solo en la otra o en las dos.'],
  how: ['Pega la lista. Se separa sola por líneas, tabuladores, punto y coma, comas o espacios (o elige el separador).', 'Ajusta la limpieza: espacios, vacíos, comillas, duplicados, orden y mayúsculas.', '<b>Seleccionar y unir</b>: desmarca los valores que no quieras; filtra para marcar o desmarcar muchos a la vez.', '<b>Comparar</b>: pega una segunda lista y obtén las diferencias y coincidencias.', 'Elige el <b>formato de salida</b> y copia el resultado.'],
  tip: 'Con «Ignorar mayúsculas y tildes», «Ávila», «AVILA» y «avila» cuentan como el mismo valor al quitar duplicados y al comparar.',
  examples: [
    { label: 'IN de SQL con duplicados', fn: () => { setVal('lsIn', '28001\n28002\n28005\n28001\n28013\n  28002 \n\n28045'); setVal('lsPreset', 'sqlin', 'change'); setVal('lsCol', 'COD_POSTAL'); $('#lsDedupe').checked = true; lsRender(); exampleLoaded('Mira el aviso de repetidos y el resultado SQL'); } },
    { label: 'Columna de Excel → OR', fn: () => { setVal('lsIn', 'Madrid\nSevilla\nValencia\nBilbao\nZaragoza'); setVal('lsPreset', 'or', 'change'); setVal('lsQuote', '"', 'change'); lsRender(); exampleLoaded('Desmarca alguna ciudad y mírala en el grupo 2'); } },
    { label: 'Comparar dos listas', fn: () => { setVal('lsIn', 'EXP-001\nEXP-002\nEXP-003\nEXP-004'); $('#lsMode [data-m=cmp]').click(); setVal('lsInB', 'EXP-003, EXP-004, EXP-005'); setVal('lsPreset', 'lines', 'change'); lsRender(); exampleLoaded('Solo en A, solo en B y en las dos'); } }
  ]
};
