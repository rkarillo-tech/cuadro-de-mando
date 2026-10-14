/* =====================================================================
   IMPORTAR CHERRYTREE (.ctd, XML sin cifrar)
   ===================================================================== */
/*
  Convierte el árbol de nodos de CherryTree en páginas de la wiki (notas con madre):
  texto con formato, títulos, enlaces web y entre nodos, bloques de código, tablas y
  nodos de código completos. Las imágenes se omiten (se deja un aviso en su lugar).
  .ctb (SQLite), .ctz (comprimido) y .ctx (cifrado): guardarlos antes como .ctd desde CherryTree.
*/
const CTD_LANG = { python: 'py', python3: 'py', sh: 'sh', bash: 'sh', js: 'js', javascript: 'js', typescript: 'js', java: 'java', sql: 'sql', xml: 'xml', html: 'xml', json: 'json', css: 'css', powershell: 'ps', 'plain-text': 'text', c: 'java', cpp: 'java', 'c-sharp': 'java', csharp: 'java', php: 'js' };
function ctdNodeHtml(node, idMap) {
  const prog = node.getAttribute('prog_lang') || 'custom-colors';
  const own = [...node.children].filter(c => c.tagName !== 'node');
  const runs = own.filter(c => c.tagName === 'rich_text');
  if (prog !== 'custom-colors') {
    const lang = CTD_LANG[prog] || 'text';
    return `<pre data-lang="${lang}">${esc(runs.map(r => r.textContent).join(''))}</pre>`;
  }
  const objs = own.filter(c => c.tagName !== 'rich_text').map(o => ({ el: o, off: +o.getAttribute('char_offset') || 0 })).sort((a, b) => a.off - b.off);
  // secuencia de trozos de texto y objetos en su posición
  const seq = []; let pos = 0, k = 0;
  const flushObjs = () => { while (k < objs.length && objs[k].off - k <= pos) { seq.push({ obj: objs[k].el }); k++; } };
  runs.forEach(r => {
    let t = r.textContent;
    flushObjs();
    while (t.length) {
      const next = k < objs.length ? objs[k].off - k : Infinity;
      const take = Math.min(t.length, next - pos);
      seq.push({ text: t.slice(0, take), r }); pos += take; t = t.slice(take);
      flushObjs();
    }
  });
  while (k < objs.length) seq.push({ obj: objs[k++].el });
  // a bloques HTML
  const blocks = []; let line = [], scales = new Set();
  const inline = (txt, r) => {
    let h = esc(txt);
    if (!h) return '';
    const a = n => r.getAttribute(n);
    if (a('family') === 'monospace') h = `<code>${h}</code>`;
    if (a('weight') === 'heavy') h = `<b>${h}</b>`;
    if (a('style') === 'italic') h = `<i>${h}</i>`;
    if (a('underline')) h = `<u>${h}</u>`;
    if (a('strikethrough') === 'true') h = `<s>${h}</s>`;
    const sc = a('scale');
    if (sc === 'small') h = `<small>${h}</small>`; else if (sc === 'sup') h = `<sup>${h}</sup>`; else if (sc === 'sub') h = `<sub>${h}</sub>`;
    const st = [];
    if (/^#[\da-f]{3,12}$/i.test(a('foreground') || '')) st.push(`color:${ctdColor(a('foreground'))}`);
    if (/^#[\da-f]{3,12}$/i.test(a('background') || '')) st.push(`background-color:${ctdColor(a('background'))}`);
    if (st.length) h = `<span style="${st.join(';')}">${h}</span>`;
    const ln = a('link') || '';
    let m;
    if ((m = /^webs (\S+)/.exec(ln)) && /^https?:|^mailto:/i.test(m[1])) h = `<a href="${esc(m[1])}">${h}</a>`;
    else if ((m = /^node (\d+)/.exec(ln)) && idMap.has(m[1])) h = `<a class="wl" data-note="${esc(idMap.get(m[1]).id)}" contenteditable="false">${esc(txt)}</a>`;
    return h;
  };
  const flushLine = () => {
    const html = line.join('');
    const onlyScale = scales.size === 1 ? [...scales][0] : null;
    const hn = onlyScale && /^h[1-6]$/.test(onlyScale) ? 'h' + Math.min(3, +onlyScale[1]) : null;
    blocks.push(hn && html.trim() ? `<${hn}>${html}</${hn}>` : `<div>${html || '<br>'}</div>`);
    line = []; scales = new Set();
  };
  seq.forEach(s => {
    if (s.obj) {
      const o = s.obj;
      if (o.tagName === 'codebox') {
        if (line.length) flushLine();
        const lang = CTD_LANG[o.getAttribute('syntax_highlighting')] || 'text';
        blocks.push(`<pre data-lang="${lang}">${esc(o.textContent)}</pre>`);
      } else if (o.tagName === 'table') {
        if (line.length) flushLine();
        const rows = [...o.querySelectorAll('row')].map(r => [...r.querySelectorAll('cell')].map(c => c.textContent));
        if (rows.length > 1) rows.unshift(rows.pop());               // en .ctd la cabecera es la última fila
        blocks.push(`<table class="ctd-table">${rows.map((r, i) => `<tr>${r.map(c => i === 0 ? `<th>${esc(c)}</th>` : `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`);
      } else if (o.tagName === 'encoded_png') line.push('<i class="muted">[imagen omitida]</i>');
      return;
    }
    const parts = s.text.split('\n');
    parts.forEach((p, i) => {
      if (i > 0) flushLine();
      if (p) { line.push(inline(p, s.r)); const sc = s.r.getAttribute('scale'); scales.add(sc && /^h\d$/.test(sc) ? sc : 'n'); }
    });
  });
  if (line.length) flushLine();
  while (blocks.length && blocks[blocks.length - 1] === '<div><br></div>') blocks.pop();
  return blocks.join('');
}
function ctdColor(c) { return c.length === 13 ? '#' + c.slice(1, 3) + c.slice(5, 7) + c.slice(9, 11) : c; }   // #rrrrggggbbbb → #rrggbb
/** Importa un .ctd como una rama de la wiki. Devuelve la nota contenedora. */
function importCtd(xmlText, fileName) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.querySelector('parsererror') || !doc.documentElement || doc.documentElement.tagName !== 'cherrytree') throw new Error('No es un archivo .ctd de CherryTree válido');
  flushNote();
  const all = [...doc.querySelectorAll('node')];
  const idMap = new Map();
  all.forEach(n => idMap.set(n.getAttribute('unique_id') || uid(), { id: uid(), node: n }));
  const now = Date.now();
  const base = fileName.replace(/\.[^.]+$/, '');
  const root = { id: uid(), title: uniqueTitle(base), html: '', text: '', pinned: false, created: now, updated: now, parent: null, order: wkKids(null).length };
  S.notes.push(root);
  let count = 0, skippedImg = 0;
  const rec = (xmlNode, parentId, order) => {
    const entry = [...idMap.values()].find(v => v.node === xmlNode);
    const ts = s => { const v = +xmlNode.getAttribute(s); return v ? v * 1000 : now; };
    const html = sanitize(ctdNodeHtml(xmlNode, idMap));
    skippedImg += [...xmlNode.children].filter(c => c.tagName === 'encoded_png').length;
    const n = { id: entry.id, title: uniqueTitle((xmlNode.getAttribute('name') || 'Sin título').trim().slice(0, 120) || 'Sin título'), html, text: htmlText(html), pinned: false, created: ts('ts_creation'), updated: ts('ts_lastsave'), parent: parentId, order };
    S.notes.push(n); count++;
    [...xmlNode.children].filter(c => c.tagName === 'node').forEach((c, i) => rec(c, n.id, i));
  };
  [...doc.documentElement.children].filter(c => c.tagName === 'node').forEach((c, i) => rec(c, root.id, i));
  root.html = `<div>📥 Importado de CherryTree (<b>${esc(fileName)}</b>) el ${esc(new Date().toLocaleString('es-ES'))}: ${count} página${count === 1 ? '' : 's'}.</div>${skippedImg ? `<div class="muted">${skippedImg} imagen${skippedImg === 1 ? '' : 'es'} omitida${skippedImg === 1 ? '' : 's'}.</div>` : ''}`;
  root.text = htmlText(root.html);
  save.notes();
  wkOpen.add(root.id);
  return { root, count, skippedImg };
}
async function importWikiFile(f) {
  const ext = (f.name.match(/\.([^.]+)$/) || [])[1]?.toLowerCase();
  if (ext === 'ctb') { toast('Los .ctb son bases de datos SQLite. Ábrelo en CherryTree y guárdalo como «.ctd» (XML sin cifrar) para importarlo.', 'warning', 8000); return null; }
  if (ext === 'ctz' || ext === 'ctx') { toast('Ese archivo de CherryTree está comprimido o cifrado. Guárdalo como «.ctd» (XML sin cifrar) para importarlo.', 'warning', 8000); return null; }
  try {
    const r = importCtd(await f.text(), f.name);
    toast(`«${f.name}»: ${r.count} páginas importadas en la wiki${r.skippedImg ? ` (${r.skippedImg} imágenes omitidas)` : ''}`, 'success', 5000);
    return r.root;
  } catch (e) { toast(`No se pudo importar ${f.name}: ${e.message}`, 'danger', 6000); return null; }
}
