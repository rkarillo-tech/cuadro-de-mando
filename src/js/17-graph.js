/* =====================================================================
   GRAFO DE CONEXIONES (notas · tareas · mapas mentales)
   ===================================================================== */
const grCanvas = $('#grCanvas'), grStage = $('#grStage');
const grCtx = grCanvas.getContext('2d');
let grNodes = [], grEdges = [], grById = new Map(), grAdj = new Map();
const grPos = new Map();          // posiciones recordadas entre redibujos
let grViewS = null, grAlpha = 0, grAlphaTarget = 0, grRaf = 0, grHover = null, grSel = null, grFocus = null, grFocusDepth = 1, grDrag = null;
const grPtr = new Map();
const GR_KIND = { note: 'Nota', todo: 'Tarea', kanban: 'Tarjeta Kanban', map: 'Mapa mental' };

const grPlain = s => String(s || '').replace(/\[\[([^\[\]\n]+)\]\]/g, (m, x) => wlCleanTitle(x));
function grHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }

/* ---------- Datos ---------- */
function grBuild() {
  const nodes = new Map(), edges = new Map();
  const add = (id, o) => { if (!nodes.has(id)) nodes.set(id, { id, deg: 0, ...o }); return nodes.get(id); };
  const link = (a, b, h = false) => { if (a === b || !nodes.has(a) || !nodes.has(b)) return; const k = a < b ? a + '|' + b : b + '|' + a; const ex = edges.get(k); if (!ex) edges.set(k, { a, b, h }); else if (!h) ex.h = false; };
  S.notes.forEach(n => add('n:' + n.id, { kind: 'note', ref: n.id, label: n.title, pinned: !!n.pinned }));
  S.notes.forEach(n => wlLinksOf(n).forEach(t => link('n:' + n.id, 'n:' + t)));
  if ($('#grTree').checked) S.notes.forEach(n => { const p = wkParent(n); if (p) link('n:' + p, 'n:' + n.id, true); });
  if ($('#grTasks').checked) {
    S.todos.forEach(t => {
      const refs = wlTextRefs([t.text, t.notes || '', ...(t.steps || []).map(s => s.text)].join('\n'));
      if (!refs.length) return;
      add('t:' + t.id, { kind: 'todo', ref: t.id, label: grPlain(t.text), done: !!t.done });
      refs.forEach(r => link('t:' + t.id, 'n:' + r));
    });
    S.tasks.forEach(t => {
      const refs = wlTextRefs([t.title, t.desc || '', ...(t.subtasks || []).map(s => s.text)].join('\n'));
      if (!refs.length) return;
      add('k:' + t.id, { kind: 'kanban', ref: t.id, label: grPlain(t.title), done: t.col === 'done' });
      refs.forEach(r => link('k:' + t.id, 'n:' + r));
    });
  }
  if ($('#grMaps').checked) {
    S.mindmaps.forEach(m => {
      const refs = new Set(); mmWalk(m.root, x => { if (x.note && getNote(x.note)) refs.add(x.note); });
      if (!refs.size) return;
      add('m:' + m.id, { kind: 'map', ref: m.id, label: m.title });
      refs.forEach(r => link('m:' + m.id, 'n:' + r));
    });
  }
  const E = [...edges.values()];
  E.forEach(e => { nodes.get(e.a).deg++; nodes.get(e.b).deg++; });
  let keep = new Set(nodes.keys());
  if (!$('#grOrphans').checked) keep = new Set([...keep].filter(id => nodes.get(id).deg > 0));
  if (grFocus && nodes.has(grFocus)) {
    const adj = new Map(); E.forEach(e => { (adj.get(e.a) || adj.set(e.a, []).get(e.a)).push(e.b); (adj.get(e.b) || adj.set(e.b, []).get(e.b)).push(e.a); });
    const seen = new Set([grFocus]); let front = [grFocus];
    for (let d = 0; d < grFocusDepth; d++) { const nx = []; front.forEach(id => (adj.get(id) || []).forEach(o => { if (!seen.has(o)) { seen.add(o); nx.push(o); } })); front = nx; }
    keep = seen;
  } else if (grFocus) grFocus = null;
  grNodes = [...nodes.values()].filter(n => keep.has(n.id));
  grById = new Map(grNodes.map(n => [n.id, n]));
  grEdges = E.filter(e => grById.has(e.a) && grById.has(e.b)).map(e => ({ s: grById.get(e.a), t: grById.get(e.b), h: e.h }));
  grAdj = new Map(grNodes.map(n => [n.id, new Set()]));
  grEdges.forEach(e => { grAdj.get(e.s.id).add(e.t.id); grAdj.get(e.t.id).add(e.s.id); });
  // posiciones: recuerda las anteriores; las nuevas, junto a un vecino o en espiral
  let placed = 0;
  grNodes.forEach((n, i) => {
    const p = grPos.get(n.id);
    if (p) { n.x = p.x; n.y = p.y; n.vx = 0; n.vy = 0; placed++; return; }
    const nb = [...grAdj.get(n.id)].map(id => grPos.get(id)).find(Boolean);
    const a = grHash(n.id) * Math.PI * 2, r = nb ? 40 : 30 + 22 * Math.sqrt(i);
    n.x = (nb ? nb.x : 0) + Math.cos(a) * r; n.y = (nb ? nb.y : 0) + Math.sin(a) * r; n.vx = 0; n.vy = 0;
  });
  if (grSel && !grById.has(grSel)) grSel = null;
  grAlpha = placed === grNodes.length ? Math.max(grAlpha, 0.25) : 1;
}
const grRadius = n => n.kind === 'note' ? Math.min(20, 5 + Math.sqrt(n.deg) * 3.2) : n.kind === 'map' ? 8 : 6;

/* ---------- Simulación de fuerzas ---------- */
/* Repulsión entre nodos: dos métodos y la app elige sola el más rápido.
   · Par a par (exacto, O(n²)): el mejor con pocos nodos.
   · Barnes-Hut con quadtree (O(n log n)): los grupos lejanos cuentan como un solo «nodo» en su
     centro de masas. Gana a partir de ~1.200-1.500 nodos.
   Con 800 nodos o más, cada vez que el número cambia un 20 % se cronometran ambos y se usa el mejor. */
const GR_BH_FROM = 800, GR_THETA2 = 0.81, GR_REP = 420;
let grBHActive = false, grRepN = 0, grRepTimes = null, grRepTicks = 0, grRepWarm = false;
function grChooseRepel(N) {
  if (N.length < GR_BH_FROM) return false;
  grRepTicks++;
  const resize = !grRepN || Math.abs(N.length - grRepN) > grRepN * 0.2;
  if (resize || (!grRepWarm && grRepTicks > 30)) {            // segunda medición «en caliente»
    grRepWarm = !resize; grRepTicks = 0; grRepN = N.length;
    const time = fn => { let best = Infinity; for (let i = 0; i < 2; i++) { const t = performance.now(); fn(N, 0); best = Math.min(best, performance.now() - t); } return best; };
    grRepTimes = { bh: time(grRepelBH), pairs: time(grRepelPairs) };
    grBHActive = grRepTimes.bh < grRepTimes.pairs * 0.85;
  }
  return grBHActive;
}
function grRepelPairs(N, a) {
  for (let i = 0; i < N.length; i++) {
    const p = N[i];
    for (let j = i + 1; j < N.length; j++) {
      const q = N[j]; let dx = q.x - p.x, dy = q.y - p.y; let d2 = dx * dx + dy * dy;
      if (d2 < 0.01) { dx = (grHash(p.id + q.id) - 0.5); dy = 0.5 - grHash(q.id + p.id); d2 = dx * dx + dy * dy + 0.01; }
      if (d2 > 250000) continue;
      const f = -GR_REP * a / d2;
      p.vx += dx * f; p.vy += dy * f; q.vx -= dx * f; q.vy -= dy * f;
    }
  }
}
function grQuadtree(N) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  N.forEach(n => { if (n.x < x0) x0 = n.x; if (n.y < y0) y0 = n.y; if (n.x > x1) x1 = n.x; if (n.y > y1) y1 = n.y; });
  const size = Math.max(x1 - x0, y1 - y0, 1) + 1;
  const cell = (x, y, s) => ({ x, y, s, m: 0, cx: 0, cy: 0, body: null, kids: null });
  const root = cell(x0, y0, size);
  const insert = (c, n, depth) => {
    c.cx = (c.cx * c.m + n.x) / (c.m + 1); c.cy = (c.cy * c.m + n.y) / (c.m + 1); c.m++;
    if (c.m === 1) { c.body = n; return; }
    if (depth > 24) return;                                   // puntos casi coincidentes: se acumulan
    if (!c.kids) {
      const h = c.s / 2; c.kids = [cell(c.x, c.y, h), cell(c.x + h, c.y, h), cell(c.x, c.y + h, h), cell(c.x + h, c.y + h, h)];
      const old = c.body; c.body = null;
      if (old) { const k = c.kids[(old.x >= c.x + h ? 1 : 0) + (old.y >= c.y + h ? 2 : 0)]; insert(k, old, depth + 1); }
    }
    const h = c.s / 2;
    insert(c.kids[(n.x >= c.x + h ? 1 : 0) + (n.y >= c.y + h ? 2 : 0)], n, depth + 1);
  };
  N.forEach(n => insert(root, n, 0));
  return root;
}
function grRepelBH(N, a) {
  const root = grQuadtree(N);
  const apply = (c, p) => {
    if (!c.m || c.body === p) return;
    let dx = c.cx - p.x, dy = c.cy - p.y, d2 = dx * dx + dy * dy;
    if (c.kids && (c.s * c.s) / Math.max(d2, 0.01) >= GR_THETA2) { c.kids.forEach(k => apply(k, p)); return; }
    if (d2 > 250000 * Math.max(1, c.m / 4)) return;
    if (d2 < 0.01) { dx = grHash(p.id) - 0.5; dy = 0.5 - grHash(p.id + 'y'); d2 = dx * dx + dy * dy + 0.01; }
    const f = -GR_REP * a * (c.body === p ? c.m - 1 : c.m) / d2;
    p.vx += dx * f; p.vy += dy * f;
  };
  N.forEach(p => apply(root, p));
}
function grTick() {
  const N = grNodes, a = grAlpha;
  if (grChooseRepel(N)) grRepelBH(N, a); else grRepelPairs(N, a);
  grEdges.forEach(e => {
    const dx = e.t.x - e.s.x, dy = e.t.y - e.s.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
    const L = 95 + grRadius(e.s) + grRadius(e.t);
    const deg = Math.min(e.s.deg, e.t.deg) || 1;
    const f = (d - L) / d * a * 0.5 / deg;
    e.t.vx -= dx * f; e.t.vy -= dy * f; e.s.vx += dx * f; e.s.vy += dy * f;
  });
  N.forEach(n => {
    n.vx -= n.x * 0.012 * a; n.vy -= n.y * 0.012 * a;
    if (n.fx != null) { n.x = n.fx; n.y = n.fy; n.vx = n.vy = 0; return; }
    n.vx *= 0.6; n.vy *= 0.6;
    n.x += Math.max(-40, Math.min(40, n.vx)); n.y += Math.max(-40, Math.min(40, n.vy));
  });
  grAlpha += (grAlphaTarget - grAlpha) * 0.025;
}
function grLoop() {
  grRaf = 0;
  if (currentTab !== 'maps' || mapsMode !== 'graph') return;
  if (grAlpha > 0.004 || grAlphaTarget > 0) { for (let i = 0; i < (grNodes.length > 300 ? 1 : 2); i++) grTick(); grNodes.forEach(n => grPos.set(n.id, { x: n.x, y: n.y })); }
  grDraw();
  if (grAlpha > 0.004 || grAlphaTarget > 0) grRaf = requestAnimationFrame(grLoop);
}
function grKick(alpha = 0.3) { grAlpha = Math.max(grAlpha, alpha); if (!grRaf) grRaf = requestAnimationFrame(grLoop); }
function grStop() { if (grRaf) cancelAnimationFrame(grRaf); grRaf = 0; }
function grSettle(steps = 300) { for (let i = 0; i < steps && grAlpha > 0.004; i++) grTick(); grNodes.forEach(n => grPos.set(n.id, { x: n.x, y: n.y })); }

/* ---------- Dibujo ---------- */
function grColors() {
  const cs = getComputedStyle(document.documentElement), v = k => cs.getPropertyValue(k).trim();
  return { bg: v('--surface'), text: v('--text'), muted: v('--muted'), accent: v('--accent'), warning: v('--warning'), success: v('--success'), info: v('--info'), border: v('--border'), font: getComputedStyle(document.body).fontFamily };
}
const grV = () => grViewS || { x: grCanvas.clientWidth / 2, y: grCanvas.clientHeight / 2, k: 1 };
function grResize() {
  const dpr = window.devicePixelRatio || 1, w = grStage.clientWidth, h = grStage.clientHeight;
  if (!w || !h) return;
  if (grCanvas.width !== Math.round(w * dpr) || grCanvas.height !== Math.round(h * dpr)) {
    grCanvas.width = Math.round(w * dpr); grCanvas.height = Math.round(h * dpr);
    grCanvas.style.width = w + 'px'; grCanvas.style.height = h + 'px';
  }
}
function grMatches() {
  const q = norm($('#grSearch').value.trim());
  return q ? new Set(grNodes.filter(n => norm(n.label).includes(q)).map(n => n.id)) : null;
}
function grDraw(forExport = false) {
  grResize();
  const C = grColors(), dpr = window.devicePixelRatio || 1, v = grV(), ctx = grCtx;
  const W = grCanvas.width / dpr, H = grCanvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (forExport) { ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H); }
  const focusId = grHover || grSel;
  const hi = focusId ? new Set([focusId, ...(grAdj.get(focusId) || [])]) : null;
  const match = grMatches();
  const S_ = n => [n.x * v.k + v.x, n.y * v.k + v.y];
  // aristas
  ctx.lineCap = 'round';
  grEdges.forEach(e => {
    const on = hi && hi.has(e.s.id) && hi.has(e.t.id) && (e.s.id === focusId || e.t.id === focusId);
    ctx.globalAlpha = hi ? (on ? 0.9 : 0.08) : match ? 0.12 : 0.38;
    ctx.strokeStyle = on ? C.accent : C.muted;
    ctx.lineWidth = on ? 2 : 1.2;
    const [x1, y1] = S_(e.s), [x2, y2] = S_(e.t);
    ctx.setLineDash(e.h ? [5, 4] : []);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  });
  ctx.setLineDash([]);
  // nodos
  const rk = Math.max(0.55, Math.min(1.6, Math.sqrt(v.k)));
  grNodes.forEach(n => {
    const [x, y] = S_(n), r = grRadius(n) * rk;
    if (x < -40 || y < -40 || x > W + 40 || y > H + 40) { n._sx = x; n._sy = y; n._r = r; return; }
    n._sx = x; n._sy = y; n._r = r;
    const dim = (hi && !hi.has(n.id)) || (match && !match.has(n.id));
    ctx.globalAlpha = dim ? 0.15 : n.done ? 0.55 : 1;
    const col = n.kind === 'note' ? (n.pinned ? C.warning : n.deg ? C.accent : C.muted) : n.kind === 'map' ? C.info : C.success;
    ctx.fillStyle = col;
    ctx.beginPath();
    if (n.kind === 'note') ctx.arc(x, y, r, 0, Math.PI * 2);
    else if (n.kind === 'map') { ctx.moveTo(x, y - r * 1.25); ctx.lineTo(x + r * 1.25, y); ctx.lineTo(x, y + r * 1.25); ctx.lineTo(x - r * 1.25, y); ctx.closePath(); }
    else { const s = r * 1.7; ctx.roundRect ? ctx.roundRect(x - s / 2, y - s / 2, s, s, 3) : ctx.rect(x - s / 2, y - s / 2, s, s); }
    ctx.fill();
    if (n.id === grSel || n.id === grFocus || (match && match.has(n.id))) {
      ctx.lineWidth = 2.5; ctx.strokeStyle = n.id === grSel ? C.text : C.accent;
      ctx.beginPath(); ctx.arc(x, y, r + 4, 0, Math.PI * 2); ctx.stroke();
    }
  });
  // etiquetas
  ctx.font = `600 12px ${C.font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  grNodes.forEach(n => {
    const show = (hi && hi.has(n.id)) || (match && match.has(n.id)) || v.k >= 0.85 || (n.deg >= 3 && v.k >= 0.45) || grNodes.length <= 25;
    if (!show) return;
    const x = n._sx, y = n._sy; if (x < -100 || y < -40 || x > W + 100 || y > H + 40) return;
    const dim = (hi && !hi.has(n.id)) || (match && !match.has(n.id));
    ctx.globalAlpha = dim ? 0.2 : 1;
    let t = n.label || '…'; if (t.length > 32 && !(hi && hi.has(n.id))) t = t.slice(0, 30) + '…';
    const ty = y + n._r + 4;
    ctx.lineWidth = 3.5; ctx.strokeStyle = C.bg; ctx.strokeText(t, x, ty);
    ctx.fillStyle = C.text; ctx.fillText(t, x, ty);
  });
  ctx.globalAlpha = 1;
  $('#grZoom').textContent = Math.round(v.k * 100) + '%';
  const perf = grNodes.length >= GR_BH_FROM && grBHActive ? `⚡ ${grNodes.length} nodos: cálculo optimizado (Barnes-Hut)` : '';
  if ($('#grPerf').textContent !== perf) $('#grPerf').textContent = perf;
}

/* ---------- Vista ---------- */
function grFit() {
  if (!grNodes.length) return;
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  grNodes.forEach(n => { a = Math.min(a, n.x); b = Math.min(b, n.y); c = Math.max(c, n.x); d = Math.max(d, n.y); });
  const W = grStage.clientWidth || 800, H = grStage.clientHeight || 500, pad = 70;
  const k = Math.max(0.15, Math.min(1.6, Math.min((W - pad * 2) / Math.max(1, c - a), (H - pad * 2) / Math.max(1, d - b))));
  grViewS = { k, x: W / 2 - (a + c) / 2 * k, y: H / 2 - (b + d) / 2 * k };
  grDraw();
}
function grZoomAt(f, cx, cy) {
  const v = grV(), k = Math.max(0.1, Math.min(4, v.k * f));
  if (cx == null) { cx = grStage.clientWidth / 2; cy = grStage.clientHeight / 2; }
  const wx = (cx - v.x) / v.k, wy = (cy - v.y) / v.k;
  grViewS = { k, x: cx - wx * k, y: cy - wy * k };
  grDraw();
}
function grShow(fit = !grViewS) {
  grResize();
  grBuild();
  const empty = !grNodes.length;
  $('#grEmpty').hidden = grEdges.length > 0 || !!grFocus;
  if (grAlpha >= 1 || fit) grSettle(grNodes.length > 300 ? 120 : 300);
  if (fit || empty) grFit();
  grRenderFocus(); grRenderInfo();
  grChooseRepel(grNodes);
  $('#grPerf').textContent = grNodes.length >= GR_BH_FROM && grBHActive ? `⚡ ${grNodes.length} nodos: cálculo optimizado (Barnes-Hut)` : '';
  grKick(0.05);
}
function grRenderFocus() {
  const n = grFocus && grById.get(grFocus);
  $('#grFocus').innerHTML = n ? `<span class="chip on" title="Solo se muestra el entorno de este nodo">🎯 ${esc(n.label.slice(0, 30))} <select id="grDepth" class="tb-select" title="Niveles de distancia">${[1, 2, 3].map(d => `<option value="${d}"${d === grFocusDepth ? ' selected' : ''}>${d} nivel${d > 1 ? 'es' : ''}</option>`).join('')}</select><button type="button" class="btn icon sm ghost" id="grFocusClear" title="Ver todo">✕</button></span>` : '';
}
function grRenderInfo() {
  const box = $('#grInfo'), n = grSel && grById.get(grSel);
  if (!n) { box.hidden = true; return; }
  box.hidden = false;
  const nbs = [...(grAdj.get(n.id) || [])].map(id => grById.get(id)).filter(Boolean).sort((a, b) => b.deg - a.deg);
  let extra = '';
  if (n.kind === 'note') {
    const note = getNote(n.ref);
    const out = note ? wlLinksOf(note).filter(id => getNote(id)).length : 0;
    const inc = S.notes.filter(x => x.id !== n.ref && (x.html || '').includes(`data-note="${n.ref}"`)).length;
    extra = `<div class="muted small">➡️ enlaza a ${out} · ⬅️ enlazada desde ${inc}</div>`;
  }
  const icon = { note: '📄', todo: '☑️', kanban: '📋', map: '🧠' };
  box.innerHTML = `<div class="row" style="flex-wrap:nowrap;align-items:flex-start"><div class="grow" style="min-width:0"><div class="muted small">${icon[n.kind]} ${GR_KIND[n.kind]}</div><b class="gr-title">${esc(n.label)}</b>${extra}</div><button class="btn icon sm ghost" data-gi="close" title="Cerrar">✕</button></div>
    <div class="row" style="margin:8px 0"><button class="btn sm primary" data-gi="open">Abrir</button>${grFocus === n.id ? '' : '<button class="btn sm" data-gi="focus" title="Mostrar solo este nodo y lo que está conectado a él">🎯 Centrar aquí</button>'}</div>
    ${nbs.length ? `<div class="muted small" style="margin-bottom:4px">Conectado con (${nbs.length})</div><div class="gr-nbs">${nbs.slice(0, 30).map(x => `<button class="chip" data-gsel="${esc(x.id)}">${icon[x.kind]} ${esc(x.label.slice(0, 40))}</button>`).join('')}</div>` : '<div class="muted small">Sin conexiones. Enlázala desde otra nota escribiendo [[…]].</div>'}`;
}
function grOpen(n) {
  if (!n) return;
  if (n.kind === 'note') { showTab('notes'); openNote(n.ref); }
  else if (n.kind === 'todo') { showTab('todos'); openTodo(n.ref); }
  else if (n.kind === 'kanban') { showTab('kanban'); openTask(n.ref); }
  else if (n.kind === 'map') { mmOpenMap(n.ref, false); mapsMode = 'mind'; store.set('mapsMode', 'mind'); showMapsMode('mind'); }
}
function grSetFocus(id, depth) {
  grFocus = id; if (depth) grFocusDepth = depth;
  grSel = id;
  grShow(true);
}
/** Abre el grafo centrado en una nota (desde Notas). */
function openGraph(noteId) {
  flushNote();
  mapsMode = 'graph'; store.set('mapsMode', 'graph');
  grFocus = noteId ? 'n:' + noteId : null; grSel = grFocus; grFocusDepth = 2; grViewS = null;
  if (currentTab !== 'maps') showTab('maps'); else showMapsMode('graph');
}

/* ---------- Interacción ---------- */
function grHit(cx, cy) {
  let best = null, bd = Infinity;
  grNodes.forEach(n => { const d = Math.hypot(n._sx - cx, n._sy - cy); if (d < Math.max(10, n._r + 5) && d < bd) { bd = d; best = n; } });
  return best;
}
const grLocal = e => { const r = grCanvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
grCanvas.addEventListener('pointerdown', e => {
  grPtr.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try { grCanvas.setPointerCapture(e.pointerId); } catch {}
  const v = grV();
  if (grPtr.size === 2) {
    const [a, b] = [...grPtr.values()], r = grCanvas.getBoundingClientRect();
    grDrag = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, v0: { ...v }, cx: (a.x + b.x) / 2 - r.left, cy: (a.y + b.y) / 2 - r.top };
    return;
  }
  const [x, y] = grLocal(e), n = grHit(x, y);
  if (n) { grDrag = { type: 'node', n, sx: e.clientX, sy: e.clientY, moved: false }; n.fx = n.x; n.fy = n.y; }
  else grDrag = { type: 'pan', sx: e.clientX, sy: e.clientY, v0: { ...v }, moved: false };
});
grCanvas.addEventListener('pointermove', e => {
  if (grPtr.has(e.pointerId)) grPtr.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const [x, y] = grLocal(e);
  if (!grDrag) {
    const n = grHit(x, y), id = n ? n.id : null;
    grCanvas.style.cursor = n ? 'pointer' : 'grab';
    if (id !== grHover) { grHover = id; grCanvas.title = n ? `${GR_KIND[n.kind]}: ${n.label}` : ''; grDraw(); }
    return;
  }
  if (grDrag.type === 'pinch') {
    if (grPtr.size < 2) return;
    const [a, b] = [...grPtr.values()], k = Math.max(0.1, Math.min(4, grDrag.v0.k * Math.hypot(a.x - b.x, a.y - b.y) / grDrag.d0));
    const wx = (grDrag.cx - grDrag.v0.x) / grDrag.v0.k, wy = (grDrag.cy - grDrag.v0.y) / grDrag.v0.k;
    grViewS = { k, x: grDrag.cx - wx * k, y: grDrag.cy - wy * k }; grDraw(); return;
  }
  const dx = e.clientX - grDrag.sx, dy = e.clientY - grDrag.sy;
  if (!grDrag.moved && Math.hypot(dx, dy) < 4) return;
  grDrag.moved = true;
  if (grDrag.type === 'pan') { grCanvas.style.cursor = 'grabbing'; grViewS = { ...grDrag.v0, x: grDrag.v0.x + dx, y: grDrag.v0.y + dy }; grDraw(); return; }
  const v = grV(), n = grDrag.n;
  n.fx = (x - v.x) / v.k; n.fy = (y - v.y) / v.k;
  grAlphaTarget = 0.25; grKick(0.25);
});
function grEnd(e) {
  grPtr.delete(e.pointerId);
  const d = grDrag; if (!d) return;
  if (d.type === 'pinch') { if (!grPtr.size) grDrag = null; return; }
  grDrag = null; grAlphaTarget = 0;
  if (d.type === 'node') {
    d.n.fx = d.n.fy = null; grPos.set(d.n.id, { x: d.n.x, y: d.n.y });
    if (!d.moved) { grSel = d.n.id; grRenderInfo(); grDraw(); }
    return;
  }
  if (d.type === 'pan' && !d.moved) { grSel = null; grRenderInfo(); grDraw(); }
}
grCanvas.addEventListener('pointerup', grEnd);
grCanvas.addEventListener('pointercancel', grEnd);
grCanvas.addEventListener('pointerleave', () => { if (!grDrag && grHover) { grHover = null; grDraw(); } });
grCanvas.addEventListener('dblclick', e => { const [x, y] = grLocal(e); const n = grHit(x, y); if (n) grOpen(n); });
grCanvas.addEventListener('wheel', e => { e.preventDefault(); const [x, y] = grLocal(e); grZoomAt(Math.exp(-e.deltaY * 0.0022), x, y); }, { passive: false });
$('#grInfo').addEventListener('click', e => {
  const s = e.target.closest('[data-gsel]'); if (s) { grSel = s.dataset.gsel; grRenderInfo(); grDraw(); return; }
  const b = e.target.closest('[data-gi]'); if (!b) return;
  const n = grById.get(grSel);
  if (b.dataset.gi === 'close') { grSel = null; grRenderInfo(); grDraw(); }
  else if (b.dataset.gi === 'open') grOpen(n);
  else if (b.dataset.gi === 'focus') grSetFocus(grSel, grFocusDepth);
});
$('#grFocus').addEventListener('click', e => { if (e.target.closest('#grFocusClear')) { grFocus = null; grShow(true); } });
$('#grFocus').addEventListener('change', e => { if (e.target.id === 'grDepth') { grFocusDepth = +e.target.value; grShow(true); } });
['grOrphans', 'grTasks', 'grMaps', 'grTree'].forEach(id => $('#' + id).addEventListener('change', () => grShow(true)));
$('#grSearch').addEventListener('input', debounce(() => { grDraw(); }, 120));
$('#grSearch').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const m = grMatches(); if (!m || !m.size) { toast('Sin coincidencias', 'info', 1200); return; }
  const n = grById.get([...m][0]); const v = grV(), W = grStage.clientWidth, H = grStage.clientHeight;
  grSel = n.id; grViewS = { k: Math.max(v.k, 1), x: W / 2 - n.x * Math.max(v.k, 1), y: H / 2 - n.y * Math.max(v.k, 1) };
  grRenderInfo(); grDraw();
});
document.querySelector('#view-maps .gr-card .mm-bar').addEventListener('click', e => {
  const b = e.target.closest('[data-gr]'); if (!b) return;
  const a = b.dataset.gr;
  if (a === 'zin') grZoomAt(1.25); else if (a === 'zout') grZoomAt(0.8); else if (a === 'fit') grFit();
  else if (a === 'relayout') { grPos.clear(); grViewS = null; grShow(true); }
  else if (a === 'png') { grDraw(true); grCanvas.toBlob(bl => { if (bl) download('conexiones.png', bl); grDraw(); }, 'image/png'); }
});
if (window.ResizeObserver) new ResizeObserver(() => { if (currentTab === 'maps' && mapsMode === 'graph') grDraw(); }).observe(grStage);
