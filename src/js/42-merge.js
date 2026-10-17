/* =====================================================================
   COMBINAR DATOS DE DOS DISPOSITIVOS · VISTA PREVIA DE LO QUE CAMBIA
   ===================================================================== */
/*
  mergeData(local, otra): une las dos versiones elemento a elemento (por «id»):
   · lo que solo está en un lado se conserva;
   · si está en los dos, gana la versión modificada más tarde («_m»);
   · lo que se borró en un lado (lápida más reciente que su última modificación) no vuelve.
  Listas sin «id» (historial de la calculadora, sesiones de Pomodoro): se unen sin repetir.
  Objetos (preferencias, colores de etiquetas…): se unen sus claves; si chocan, gana el lado más reciente.
*/
const MERGE_KEEP_LOCAL = new Set(['lastChange', 'currentNote']);
const plainObj = v => v && typeof v === 'object' && !Array.isArray(v);
function mergeTombs(a, b) {
  const t = Object.assign({}, plainObj(a) ? a : {});
  if (plainObj(b)) Object.entries(b).forEach(([k, v]) => { if (!(t[k] >= v)) t[k] = v; });
  return t;
}
function mergeById(key, a, b, tomb) {
  const bm = new Map(b.map(x => [String(x.id), x])), seen = new Set(), out = [];
  const dead = x => { const t = tomb[key + ':' + x.id]; return t && t > (+x._m || 0); };
  a.forEach(x => {
    const id = String(x.id); seen.add(id);
    const y = bm.get(id);
    const pick = y && (+y._m || 0) > (+x._m || 0) ? y : x;
    if (!dead(pick)) out.push(pick);
  });
  b.forEach(y => { if (!seen.has(String(y.id)) && !dead(y)) out.push(y); });
  return out;
}
function mergeData(local, other) {
  const L = local || {}, R = other || {};
  const localNewer = (+L.lastChange || 0) >= (+R.lastChange || 0);
  const tomb = mergeTombs(L.tombstones, R.tombstones);
  const out = {};
  new Set([...Object.keys(L), ...Object.keys(R)]).forEach(k => {
    if (k === 'tombstones') return;
    const a = L[k], b = R[k];
    if (MERGE_KEEP_LOCAL.has(k) || VOLATILE_KEYS.has(k)) { out[k] = k in L ? a : b; return; }
    if (a === undefined || b === undefined) {
      const v = a === undefined ? b : a;
      out[k] = isIdList(v) ? mergeById(k, v, [], tomb) : v;
      return;
    }
    if (isIdList(a) && isIdList(b)) out[k] = mergeById(k, a, b, tomb);
    else if (Array.isArray(a) && Array.isArray(b)) {
      const seen = new Set(), res = [];
      a.concat(b).forEach(x => { const s = JSON.stringify(x); if (!seen.has(s)) { seen.add(s); res.push(x); } });
      out[k] = res;
    }
    else if (plainObj(a) && plainObj(b)) out[k] = localNewer ? Object.assign({}, b, a) : Object.assign({}, a, b);
    else out[k] = localNewer ? a : b;
  });
  out.tombstones = tomb;
  return out;
}

/* ---------- Diferencias por sección ---------- */
const DIFF_SECTIONS = [
  ['notes', '📝 Notas', x => x.title],
  ['todos', '☑️ Tareas', x => x.text],
  ['todoLists', '📋 Listas de tareas', x => x.name],
  ['tasks', '🗂️ Tarjetas Kanban', x => x.title],
  ['events', '📅 Eventos', x => `${x.title}${x.date ? ' · ' + x.date : ''}`],
  ['bookmarks', '🔖 Marcadores', x => x.title || x.url],
  ['mindmaps', '🧠 Mapas mentales', x => x.title],
  ['habits', '🔁 Hábitos', x => x.name || x.title],
  ['projects', '🗂️ Proyectos de horas', x => x.name],
  ['timeEntries', '⏱️ Registros de horas', x => [x.desc || x.note || x.text, x.date || (x.start ? new Date(x.start).toLocaleDateString('es-ES') : '')].filter(Boolean).join(' · ') || 'registro'],
  ['templates', '📄 Plantillas', x => x.name],
  ['vault', '📦 Almacén cifrado', x => x.name],
  ['holidays', '🎉 Festivos', x => x.name || x.date]
];
/** Compara este equipo (L) con la otra versión (R) y con el resultado de combinar (M). */
function diffData(L, R, M, base = 0) {
  const rows = [];
  DIFF_SECTIONS.forEach(([k, label, nameOf]) => {
    const a = isIdList(L[k]) ? L[k] : [], b = isIdList(R[k]) ? R[k] : [], m = isIdList(M[k]) ? M[k] : [];
    if (!a.length && !b.length) return;
    const am = new Map(a.map(x => [String(x.id), x])), bm = new Map(b.map(x => [String(x.id), x])), mm = new Map(m.map(x => [String(x.id), x]));
    const nm = x => { try { return String(nameOf(x) || '(sin título)').replace(/<[^>]+>/g, '').slice(0, 80); } catch { return '(sin título)'; } };
    const r = { key: k, label, here: a.length, copy: b.length, onlyHere: [], onlyCopy: [], newerHere: [], newerCopy: [], same: 0, mergeAdds: [], mergeUpdates: [], mergeDeletes: [], mergeSkips: [], conflicts: [] };
    am.forEach((x, id) => {
      const y = bm.get(id);
      if (!y && !mm.has(id)) { /* se borró en el otro dispositivo: no cuenta como «solo aquí» */ }
      else if (!y) r.onlyHere.push(nm(x));
      else if (trkHash(x) === trkHash(y)) r.same++;
      else if (base && (+x._m || 0) > base && (+y._m || 0) > base) { r.conflicts.push(nm(x)); if ((+y._m || 0) > (+x._m || 0)) r.newerCopy.push(nm(y)); else r.newerHere.push(nm(x)); }
      else if ((+y._m || 0) > (+x._m || 0)) r.newerCopy.push(nm(y));
      else r.newerHere.push(nm(x));
      const z = mm.get(id);
      if (!z) r.mergeDeletes.push(nm(x));
      else if (trkHash(z) !== trkHash(x)) r.mergeUpdates.push(nm(z));
    });
    bm.forEach((y, id) => { if (!am.has(id)) { r.onlyCopy.push(nm(y)); if (mm.has(id)) r.mergeAdds.push(nm(y)); else r.mergeSkips.push(nm(y)); } });
    rows.push(r);
  });
  const sum = f => rows.reduce((n, r) => n + f(r), 0);
  return {
    rows,
    replaceLoses: sum(r => r.onlyHere.length + r.newerHere.length),
    replaceGains: sum(r => r.onlyCopy.length + r.newerCopy.length),
    mergeAdds: sum(r => r.mergeAdds.length), mergeUpdates: sum(r => r.mergeUpdates.length), mergeDeletes: sum(r => r.mergeDeletes.length), mergeSkips: sum(r => r.mergeSkips.length), conflicts: sum(r => r.conflicts.length),
    identical: rows.every(r => !r.onlyHere.length && !r.onlyCopy.length && !r.newerHere.length && !r.newerCopy.length)
  };
}
const nList = (arr, cls) => arr.length ? `<ul class="df-list ${cls}">${arr.slice(0, 12).map(t => `<li>${esc(t)}</li>`).join('')}${arr.length > 12 ? `<li class="muted">… y ${arr.length - 12} más</li>` : ''}</ul>` : '';
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
function diffHtml(d, { otherLabel = 'la copia' } = {}) {
  const lose = d.replaceLoses;
  const banner = d.identical
    ? `<div class="df-banner ok">✅ Este equipo y ${otherLabel} tienen exactamente lo mismo.</div>`
    : `<div class="df-banner ${lose ? 'warn' : 'ok'}"><b>Si combinas</b> (recomendado): ${[d.mergeAdds && `<b>+${d.mergeAdds}</b> nuevo${d.mergeAdds === 1 ? '' : 's'}`, d.mergeUpdates && `<b>${d.mergeUpdates}</b> actualizado${d.mergeUpdates === 1 ? '' : 's'}`, d.mergeDeletes && `<b>${d.mergeDeletes}</b> borrado${d.mergeDeletes === 1 ? '' : 's'} (se borraron en el otro dispositivo)`, d.mergeSkips && `<b>${d.mergeSkips}</b> que borraste aquí no vuelve${d.mergeSkips === 1 ? '' : 'n'}`].filter(Boolean).join(' · ') || `este equipo se queda igual (${otherLabel} no trae nada nuevo)`}; no se pierde nada de lo que hay aquí.<br>
       <b>Si reemplazas:</b> ${lose ? `<span class="df-bad">se perderían ${lose === 1 ? '1 elemento que solo está (o está más al día)' : lose + ' elementos que solo están (o están más al día)'} en este equipo</span>` : `<span class="df-good">no se pierde nada</span>: ${otherLabel} contiene todo lo de este equipo${d.replaceGains ? ` y ${plural(d.replaceGains, 'cambio más', 'cambios más')}` : ''}`}.</div>`;
  const table = `<table class="df-table"><thead><tr><th></th><th>Aquí</th><th>En ${esc(otherLabel)}</th><th>Diferencias</th></tr></thead><tbody>${d.rows.map(r => {
    const diffs = [r.onlyHere.length && `<span class="df-bad" title="Solo existen en este equipo">${r.onlyHere.length} solo aquí</span>`, r.onlyCopy.length && `<span class="df-good" title="Solo existen en ${esc(otherLabel)}">+${r.onlyCopy.length} nuevos</span>`, r.newerHere.length && `<span class="df-bad" title="Modificados en los dos sitios; la versión de aquí es más reciente">${r.newerHere.length} más recientes aquí</span>`, r.newerCopy.length && `<span class="df-good">${r.newerCopy.length} más recientes allí</span>`].filter(Boolean).join(' · ');
    const detail = [r.onlyHere.length && `<div class="df-h">Solo aquí (se perderían al reemplazar)</div>${nList(r.onlyHere, 'bad')}`, r.newerHere.length && `<div class="df-h">Más recientes aquí</div>${nList(r.newerHere, 'bad')}`, r.onlyCopy.length && `<div class="df-h">Nuevos en ${esc(otherLabel)}</div>${nList(r.onlyCopy, 'good')}`, r.newerCopy.length && `<div class="df-h">Más recientes en ${esc(otherLabel)}</div>${nList(r.newerCopy, 'good')}`, r.mergeDeletes.length && `<div class="df-h">Se borrarán al combinar (se borraron en el otro dispositivo)</div>${nList(r.mergeDeletes, 'bad')}`, r.mergeSkips.length && `<div class="df-h">No vuelven al combinar (los borraste aquí; reemplaza si quieres recuperarlos)</div>${nList(r.mergeSkips, '')}`].filter(Boolean).join('');
    return `<tr><td>${r.label}</td><td>${r.here}</td><td>${r.copy}</td><td>${diffs ? `<details><summary>${diffs}</summary>${detail}</details>` : '<span class="muted">igual</span>'}</td></tr>`;
  }).join('')}</tbody></table>`;
  return banner + table;
}
/**
 * Pregunta qué hacer con otra versión de los datos, mostrando qué cambia.
 * mode 'import' → 'merge' | 'replace' | null · mode 'file' → 'merge' | 'replace' | 'keep' | null
 */
async function syncChoiceDialog(other, { mode = 'import', title, intro = '', otherLabel = 'la copia' } = {}) {
  flushNote();
  const local = JSON.parse(JSON.stringify(MEM));
  const merged = mergeData(local, other);
  const d = diffData(local, other, merged);
  const actions = mode === 'file'
    ? [{ label: 'Mantener los de este navegador', value: 'keep', cls: 'ghost' }, { label: 'Usar los del archivo', value: 'replace', cls: d.replaceLoses ? 'danger' : '' }, { label: '🔀 Combinar', value: 'merge', cls: 'primary' }]
    : [{ label: 'Cancelar', value: null, cls: 'ghost' }, { label: 'Reemplazar todo', value: 'replace', cls: d.replaceLoses ? 'danger' : '' }, { label: '🔀 Combinar', value: 'merge', cls: 'primary' }];
  const r = await modal({ title: title || '📥 Importar copia', wide: true, body: `${intro}${diffHtml(d, { otherLabel })}<p class="hint">Antes de aplicar se guarda una versión en el <b>historial</b>, por si quieres volver atrás.</p>`, actions });
  if (!r) return { choice: null };
  if (r.action === 'replace' && d.replaceLoses && !(await confirmDialog(`Al reemplazar se perderán ${plural(d.replaceLoses, 'elemento', 'elementos')} que solo están en este equipo. ¿Seguro que no prefieres combinar?`, 'Reemplazar igualmente'))) return { choice: null };
  return { choice: r.action, merged, diff: d };
}
/** Aplica la elección: guarda versión previa, sustituye los datos y recarga. */
async function applySyncChoice(res, other, label) {
  if (!res || !res.choice || res.choice === 'keep') return false;
  await histSnapshot('before', (res.choice === 'merge' ? 'Antes de combinar con ' : 'Antes de reemplazar con ') + label, { force: true });
  await replaceAllData(res.choice === 'merge' ? res.merged : other);
  const d = res.diff;
  toast(res.choice === 'merge' ? `Combinado: +${d.mergeAdds} nuevos, ${d.mergeUpdates} actualizados${d.mergeDeletes ? `, ${d.mergeDeletes} borrados` : ''}. Recargando…` : 'Datos reemplazados. Recargando…', 'success', 3000);
  setTimeout(() => reloadSafe(), 700);
  return true;
}

/** Tras recargar por una sincronización automática, se muestra qué ha llegado. */
setTimeout(() => {
  let msg = null; try { msg = sessionStorage.getItem('cdm-sync-msg'); sessionStorage.removeItem('cdm-sync-msg'); } catch {}
  if (msg) toast(msg, 'success', 4500);
}, 1200);
