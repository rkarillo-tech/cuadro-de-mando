/* =====================================================================
   HERRAMIENTAS DE DESARROLLO
   ===================================================================== */
let devTool = 'json';
function setTool(t) {
  devTool = t;
  $$('#toolTabs button').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  $$('.tool-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === t));
  store.set('devTool', t);
  if (t === 'uuid' && !$('#uuidOut').value) genUuids();
  if (t === 'time') epTick();
  if (t === 'text') txStats();
  if (t === 'regex' && !$('#rxFlags').innerHTML) rxInit();
}
$('#toolTabs').addEventListener('click', e => { const b = e.target.closest('[data-tool]'); if (b) setTool(b.dataset.tool); });
const statusHtml = (ok, msg) => `<span class="${ok ? 'ok-text' : 'bad-text'}">${ok ? '✓' : '✗'}</span> ${esc(msg)}`;
const fatalTd = new TextDecoder('utf-8', { fatal: true });

/* ---------- JSON / XML ---------- */
let jxMode = 'json';
const jxIndent = () => { const v = $('#jxIndent').value; return v === 'tab' ? '\t' : ' '.repeat(+v); };
function lineCol(text, pos) { const before = text.slice(0, pos); return { line: before.split('\n').length, col: pos - before.lastIndexOf('\n') }; }
function jsonErrPos(err, text) {
  let m = /position (\d+)/i.exec(err.message); if (m) return +m[1];
  m = /line (\d+) column (\d+)/i.exec(err.message);
  if (m) { const lines = text.split('\n'); let p = 0; for (let i = 0; i < +m[1] - 1; i++) p += lines[i].length + 1; return p + +m[2] - 1; }
  return jsonErrorIndex(text);
}
/** Analizador mínimo que solo sirve para localizar dónde falla un JSON. */
function jsonErrorIndex(t) {
  let i = 0;
  const ws = () => { while (i < t.length && ' \t\n\r'.includes(t[i])) i++; };
  const fail = () => { throw i; };
  const str = () => { i++; while (i < t.length) { const c = t[i]; if (c === '"') { i++; return; } if (c === '\\') { i += 2; continue; } if (c < ' ') fail(); i++; } fail(); };
  const val = () => {
    ws(); const c = t[i];
    if (c === '{') { i++; ws(); if (t[i] === '}') { i++; return; } for (;;) { ws(); if (t[i] !== '"') fail(); str(); ws(); if (t[i] !== ':') fail(); i++; val(); ws(); if (t[i] === ',') { i++; continue; } if (t[i] === '}') { i++; return; } fail(); } }
    if (c === '[') { i++; ws(); if (t[i] === ']') { i++; return; } for (;;) { val(); ws(); if (t[i] === ',') { i++; continue; } if (t[i] === ']') { i++; return; } fail(); } }
    if (c === '"') { str(); return; }
    const m = /^(-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?|true|false|null)/.exec(t.slice(i, i + 400));
    if (m) { i += m[0].length; return; }
    fail();
  };
  try { val(); ws(); if (i < t.length) fail(); return null; } catch (e) { return typeof e === 'number' ? Math.min(e, t.length) : null; }
}
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.keys(v).sort((a, b) => a.localeCompare(b)).reduce((o, k) => (o[k] = sortKeys(v[k]), o), {});
  return v;
}
const escXml = (s, text) => text ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
function xmlFormat(xml, indent, minify) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const perr = doc.getElementsByTagName('parsererror')[0];
  if (perr) throw new Error(perr.textContent.replace(/\s+/g, ' ').trim().slice(0, 200));
  const decl = /^\s*<\?xml[^>]*\?>/.exec(xml);
  const out = [];
  const walk = (node, depth) => {
    const ind = minify ? '' : indent.repeat(depth);
    if (node.nodeType === 1) {
      const attrs = Array.from(node.attributes).map(a => ` ${a.name}="${escXml(a.value)}"`).join('');
      const kids = Array.from(node.childNodes).filter(n => !(n.nodeType === 3 && !n.nodeValue.trim()));
      if (!kids.length) out.push(`${ind}<${node.nodeName}${attrs}/>`);
      else if (kids.length === 1 && kids[0].nodeType === 3) out.push(`${ind}<${node.nodeName}${attrs}>${escXml(kids[0].nodeValue.trim(), true)}</${node.nodeName}>`);
      else { out.push(`${ind}<${node.nodeName}${attrs}>`); kids.forEach(k => walk(k, depth + 1)); out.push(`${ind}</${node.nodeName}>`); }
    } else if (node.nodeType === 3) out.push(ind + escXml(node.nodeValue.trim(), true));
    else if (node.nodeType === 4) out.push(`${ind}<![CDATA[${node.nodeValue}]]>`);
    else if (node.nodeType === 8) out.push(`${ind}<!--${node.nodeValue}-->`);
    else if (node.nodeType === 7) out.push(`${ind}<?${node.target} ${node.data}?>`);
  };
  Array.from(doc.childNodes).forEach(n => { if (n.nodeType === 10) out.push(new XMLSerializer().serializeToString(n)); else walk(n, 0); });
  return (decl ? decl[0].trim() + (minify ? '' : '\n') : '') + out.join(minify ? '' : '\n');
}
function jxRun(action) {
  const ta = $('#jxIn'), t = ta.value;
  if (!t.trim()) { $('#jxStatus').textContent = ''; return; }
  if (jxMode === 'json') {
    let v;
    try { v = JSON.parse(t); }
    catch (err) {
      const pos = jsonErrPos(err, t);
      if (pos != null) { const { line, col } = lineCol(t, pos); $('#jxStatus').innerHTML = statusHtml(false, `JSON no válido · línea ${line}, columna ${col} (${err.message})`); ta.focus(); ta.setSelectionRange(pos, Math.min(pos + 1, t.length)); }
      else $('#jxStatus').innerHTML = statusHtml(false, 'JSON no válido: ' + err.message);
      return;
    }
    if (action === 'sort') v = sortKeys(v);
    if (action !== 'validate') ta.value = action === 'minify' ? JSON.stringify(v) : JSON.stringify(v, null, jxIndent());
    const info = Array.isArray(v) ? `array de ${v.length} elementos` : v && typeof v === 'object' ? `objeto con ${Object.keys(v).length} claves` : typeof v;
    $('#jxStatus').innerHTML = statusHtml(true, `JSON válido · ${info} · ${ta.value.length.toLocaleString('es-ES')} caracteres`);
  } else {
    try {
      if (action !== 'validate') ta.value = xmlFormat(t, jxIndent(), action === 'minify');
      else xmlFormat(t, '', true);
      $('#jxStatus').innerHTML = statusHtml(true, `XML bien formado · ${ta.value.length.toLocaleString('es-ES')} caracteres`);
    } catch (err) { $('#jxStatus').innerHTML = statusHtml(false, 'XML no válido: ' + err.message); }
  }
}
$('#jxMode').addEventListener('click', e => {
  const b = e.target.closest('[data-m]'); if (!b) return;
  jxMode = b.dataset.m;
  $$('#jxMode button').forEach(x => x.classList.toggle('on', x === b));
  $('#jxSort').hidden = jxMode !== 'json';
  $('#jxIn').placeholder = jxMode === 'json' ? 'Pega aquí un JSON…' : 'Pega aquí un XML…';
  jxRun('validate');
});
$('#jxFormat').addEventListener('click', () => jxRun('format'));
$('#jxMinify').addEventListener('click', () => jxRun('minify'));
$('#jxSort').addEventListener('click', () => jxRun('sort'));
$('#jxCopy').addEventListener('click', () => copyText($('#jxIn').value));
$('#jxClear').addEventListener('click', () => { $('#jxIn').value = ''; $('#jxStatus').textContent = ''; });
$('#jxIn').addEventListener('input', debounce(() => jxRun('validate'), 400));
$('#jxIn').addEventListener('paste', () => setTimeout(() => { const v = $('#jxIn').value.trim(); if (v.startsWith('<') && jxMode === 'json') $('#jxMode [data-m="xml"]').click(); else if (/^[[{]/.test(v) && jxMode === 'xml') $('#jxMode [data-m="json"]').click(); }, 0));
$('#jxIn').addEventListener('keydown', e => { if (e.key === 'Tab') { e.preventDefault(); const ta = e.target, s = ta.selectionStart; ta.setRangeText(jxIndent(), s, ta.selectionEnd, 'end'); } });

/* ---------- Base64 ---------- */
const toUrlSafe = b => b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function fromAnyB64(s) {
  s = s.trim().replace(/^data:[^,]*;base64,/i, '').replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return b64dec(s);
}
let b64Lock = false, b64FileName = '';
function b64FromPlain() {
  if (b64Lock) return;
  const enc = b64enc(te.encode($('#b64Plain').value));
  b64Lock = true; $('#b64Enc').value = $('#b64Url').checked ? toUrlSafe(enc) : enc; b64Lock = false;
  $('#b64Status').innerHTML = $('#b64Plain').value ? statusHtml(true, `${te.encode($('#b64Plain').value).length} bytes → ${$('#b64Enc').value.length} caracteres`) : '';
}
function b64FromEnc() {
  if (b64Lock) return;
  const v = $('#b64Enc').value;
  if (!v.trim()) { $('#b64Plain').value = ''; $('#b64Status').textContent = ''; return; }
  try {
    const bytes = fromAnyB64(v);
    try { b64Lock = true; $('#b64Plain').value = fatalTd.decode(bytes); $('#b64Status').innerHTML = statusHtml(true, `Decodificado: ${bytes.length} bytes de texto UTF-8`); }
    catch { $('#b64Plain').value = ''; $('#b64Status').innerHTML = statusHtml(true, `Contenido binario de ${bytes.length.toLocaleString('es-ES')} bytes (no es texto). Usa «Base64 → archivo» para descargarlo.`); }
    finally { b64Lock = false; }
  } catch { $('#b64Status').innerHTML = statusHtml(false, 'No es Base64 válido'); }
}
$('#b64Plain').addEventListener('input', b64FromPlain);
$('#b64Enc').addEventListener('input', b64FromEnc);
$('#b64Url').addEventListener('change', b64FromPlain);
$('#b64FileBtn').addEventListener('click', () => $('#b64File').click());
$('#b64File').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  if (f.size > 20 * 1024 * 1024) { toast('Archivo demasiado grande (máx. 20 MB)', 'warning'); return; }
  const enc = b64enc(new Uint8Array(await f.arrayBuffer()));
  b64FileName = f.name;
  b64Lock = true; $('#b64Plain').value = ''; $('#b64Enc').value = $('#b64Url').checked ? toUrlSafe(enc) : enc; b64Lock = false;
  $('#b64Status').innerHTML = statusHtml(true, `«${f.name}» (${(f.size / 1024).toFixed(1)} KB, ${f.type || 'tipo desconocido'}) codificado.`) + ` <button class="btn sm" id="b64DataUri">📋 Copiar como data URI</button>`;
  $('#b64DataUri').onclick = () => copyText(`data:${f.type || 'application/octet-stream'};base64,${enc}`, 'Data URI copiado');
});
$('#b64DownBtn').addEventListener('click', () => {
  const v = $('#b64Enc').value.trim(); if (!v) { toast('Pega primero el Base64', 'warning'); return; }
  try {
    const mime = (/^data:([^;,]+)/i.exec(v) || [])[1] || 'application/octet-stream';
    const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'application/pdf': 'pdf', 'application/json': 'json', 'text/plain': 'txt', 'application/zip': 'zip', 'text/xml': 'xml', 'application/xml': 'xml' }[mime] || 'bin';
    download(b64FileName || `decodificado.${ext}`, new Blob([fromAnyB64(v)], { type: mime }));
  } catch { toast('No es Base64 válido', 'danger'); }
});

/* ---------- URL ---------- */
let urlLock = false;
function urlFromPlain() {
  if (urlLock) return;
  const v = $('#urlPlain').value;
  urlLock = true; $('#urlEnc').value = $('#urlFull').checked ? encodeURI(v) : encodeURIComponent(v); urlLock = false;
  urlParts(v);
}
function urlFromEnc() {
  if (urlLock) return;
  const v = $('#urlEnc').value;
  try { urlLock = true; $('#urlPlain').value = decodeURIComponent(v.replace(/\+/g, '%20')); urlParts($('#urlPlain').value); }
  catch { $('#urlParts').innerHTML = statusHtml(false, 'Secuencia % no válida'); }
  finally { urlLock = false; }
}
function urlParts(v) {
  let u;
  try { u = new URL(v.trim()); if (!/^[a-z]+:\/\//i.test(v.trim())) throw 0; } catch { $('#urlParts').innerHTML = '<span class="muted small">Escribe una URL completa (https://…) para ver sus partes.</span>'; return; }
  const params = [...u.searchParams.entries()];
  $('#urlParts').innerHTML = `<dl class="kv"><dt>Protocolo</dt><dd>${esc(u.protocol)}</dd><dt>Host</dt><dd>${esc(u.hostname)}</dd>${u.port ? `<dt>Puerto</dt><dd>${esc(u.port)}</dd>` : ''}<dt>Ruta</dt><dd>${esc(decodeURIComponent(u.pathname))}</dd>${u.hash ? `<dt>Fragmento</dt><dd>${esc(u.hash)}</dd>` : ''}${u.username ? `<dt>Usuario</dt><dd>${esc(u.username)}</dd>` : ''}</dl>`
    + (params.length ? `<h4 class="section-h" style="margin-top:14px">Parámetros (${params.length})</h4><div class="table-wrap"><table class="table"><thead><tr><th>Clave</th><th style="text-align:left">Valor</th></tr></thead><tbody>${params.map(([k, val]) => `<tr><td class="mono">${esc(k)}</td><td class="mono" style="text-align:left;white-space:normal;word-break:break-all">${esc(val)}</td></tr>`).join('')}</tbody></table></div>` : '');
}
$('#urlPlain').addEventListener('input', urlFromPlain);
$('#urlEnc').addEventListener('input', urlFromEnc);
$('#urlFull').addEventListener('change', urlFromPlain);

/* ---------- JWT ---------- */
function jwtDecode() {
  const tok = $('#jwtIn').value.trim().replace(/^Bearer\s+/i, '');
  const parts = tok.split('.');
  $('#jwtHead').textContent = ''; $('#jwtBody').textContent = ''; $('#jwtClaims').innerHTML = '';
  if (!tok) return;
  if (parts.length < 2) { $('#jwtClaims').innerHTML = statusHtml(false, 'No parece un JWT (debe tener partes separadas por puntos)'); return; }
  try {
    const head = JSON.parse(fatalTd.decode(fromAnyB64(parts[0])));
    const body = JSON.parse(fatalTd.decode(fromAnyB64(parts[1])));
    $('#jwtHead').textContent = JSON.stringify(head, null, 2);
    $('#jwtBody').textContent = JSON.stringify(body, null, 2);
    const now = Date.now() / 1000, chips = [];
    if (head.alg) chips.push(`<span class="badge accent">alg: ${esc(head.alg)}</span>`);
    const dt = s => new Date(s * 1000).toLocaleString('es-ES');
    if (typeof body.exp === 'number') chips.push(body.exp < now ? `<span class="badge danger">Caducado el ${esc(dt(body.exp))}</span>` : `<span class="badge success">Válido hasta ${esc(dt(body.exp))}</span>`);
    if (typeof body.iat === 'number') chips.push(`<span class="badge">Emitido: ${esc(dt(body.iat))}</span>`);
    if (typeof body.nbf === 'number') chips.push(`<span class="badge${body.nbf > now ? ' warning' : ''}">No antes de: ${esc(dt(body.nbf))}</span>`);
    if (body.sub) chips.push(`<span class="badge">sub: ${esc(String(body.sub).slice(0, 40))}</span>`);
    if (body.iss) chips.push(`<span class="badge">iss: ${esc(String(body.iss).slice(0, 50))}</span>`);
    $('#jwtClaims').innerHTML = `<div class="chips">${chips.join('')}</div>`;
  } catch { $('#jwtClaims').innerHTML = statusHtml(false, 'No se pudo decodificar: alguna parte no es JSON en Base64URL'); }
}
$('#jwtIn').addEventListener('input', jwtDecode);

/* ---------- Hash ---------- */
function md5(bytes) {
  const K = new Uint32Array(64);
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0;
  const R = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const len = bytes.length, total = (((len + 8) >>> 6) + 1) * 64;
  const buf = new Uint8Array(total); buf.set(bytes); buf[len] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, (len * 8) >>> 0, true); dv.setUint32(total - 4, Math.floor(len * 8 / 2 ** 32), true);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let off = 0; off < total; off += 64) {
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i] + dv.getUint32(off + g * 4, true)) >>> 0;
      const s = R[(i >> 4) * 4 + (i % 4)];
      A = D; D = C; C = B;
      B = (B + ((F << s) | (F >>> (32 - s)))) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  const out = new Uint8Array(16), ov = new DataView(out.buffer);
  [a0, b0, c0, d0].forEach((v, i) => ov.setUint32(i * 4, v, true));
  return out;
}
const toHex = u8 => Array.from(u8, b => b.toString(16).padStart(2, '0')).join('');
let hashMode = 'text', hashFileObj = null, hashSeq = 0;
async function computeHashes() {
  const seq = ++hashSeq;
  let bytes;
  if (hashMode === 'text') bytes = te.encode($('#hashIn').value);
  else {
    if (!hashFileObj) { $('#hashOut').innerHTML = ''; return; }
    if (hashFileObj.size > 500 * 1024 * 1024) { $('#hashOut').innerHTML = statusHtml(false, 'Archivo demasiado grande (máx. 500 MB)'); return; }
    $('#hashOut').innerHTML = '<div class="muted small">Calculando…</div>';
    bytes = new Uint8Array(await hashFileObj.arrayBuffer());
  }
  const res = [['MD5', toHex(md5(bytes))]];
  for (const alg of ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']) res.push([alg, toHex(new Uint8Array(await crypto.subtle.digest(alg, bytes)))]);
  if (seq !== hashSeq) return;
  const up = $('#hashUpper').checked;
  const exp = $('#hashExpect').value.trim().toLowerCase().replace(/[^0-9a-f]/g, '');
  const match = exp && res.find(r => r[1] === exp);
  $('#hashOut').innerHTML = res.map(([a, h]) => `<div class="hash-row${exp && h === exp ? ' match' : ''}"><b class="small">${a}</b><code>${up ? h.toUpperCase() : h}</code><button class="btn icon sm ghost" data-copy="${up ? h.toUpperCase() : h}" title="Copiar">📋</button></div>`).join('')
    + (exp ? `<div style="margin-top:10px">${match ? statusHtml(true, `Coincide con ${match[0]}`) : statusHtml(false, 'No coincide con ninguno')}</div>` : '');
}
$('#hashMode').addEventListener('click', e => {
  const b = e.target.closest('[data-m]'); if (!b) return;
  hashMode = b.dataset.m;
  $$('#hashMode button').forEach(x => x.classList.toggle('on', x === b));
  $('#hashIn').hidden = hashMode !== 'text'; $('#hashDrop').hidden = hashMode !== 'file';
  computeHashes();
});
$('#hashIn').addEventListener('input', debounce(computeHashes, 200));
$('#hashUpper').addEventListener('change', computeHashes);
$('#hashExpect').addEventListener('input', debounce(computeHashes, 200));
const hdrop = $('#hashDrop');
const setHashFile = f => { hashFileObj = f || null; $('#hashFileInfo').textContent = f ? `${f.name} · ${(f.size / 1024).toFixed(1)} KB` : 'Ningún archivo'; computeHashes(); };
hdrop.addEventListener('click', () => $('#hashFile').click());
$('#hashFile').addEventListener('change', e => { setHashFile(e.target.files[0]); e.target.value = ''; });
hdrop.addEventListener('dragover', e => { e.preventDefault(); hdrop.classList.add('over'); });
hdrop.addEventListener('dragleave', () => hdrop.classList.remove('over'));
hdrop.addEventListener('drop', e => { e.preventDefault(); hdrop.classList.remove('over'); setHashFile(e.dataTransfer.files[0]); });
$('#hashOut').addEventListener('click', e => { const b = e.target.closest('[data-copy]'); if (b) copyText(b.dataset.copy, 'Hash copiado'); });

/* ---------- Comparar textos ---------- */
function diffLines(A, B) {
  let pre = 0; while (pre < A.length && pre < B.length && A[pre] === B[pre]) pre++;
  let suf = 0; while (suf < A.length - pre && suf < B.length - pre && A[A.length - 1 - suf] === B[B.length - 1 - suf]) suf++;
  const a = A.slice(pre, A.length - suf), b = B.slice(pre, B.length - suf), n = a.length, m = b.length;
  if (n * m > 9e6) throw new Error('grande');
  const W = m + 1, dp = (n < 65535 && m < 65535) ? new Uint16Array((n + 1) * W) : new Uint32Array((n + 1) * W);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i * W + j] = a[i] === b[j] ? dp[(i + 1) * W + j + 1] + 1 : Math.max(dp[(i + 1) * W + j], dp[i * W + j + 1]);
  const ops = [];
  for (let k = 0; k < pre; k++) ops.push({ t: '=', a: k, b: k });
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({ t: '=', a: pre + i, b: pre + j }); i++; j++; }
    else if (dp[(i + 1) * W + j] >= dp[i * W + j + 1]) { ops.push({ t: '-', a: pre + i }); i++; }
    else { ops.push({ t: '+', b: pre + j }); j++; }
  }
  while (i < n) ops.push({ t: '-', a: pre + i++ });
  while (j < m) ops.push({ t: '+', b: pre + j++ });
  for (let k = 0; k < suf; k++) ops.push({ t: '=', a: A.length - suf + k, b: B.length - suf + k });
  return ops;
}
function runDiff() {
  const ra = $('#diffA').value.split(/\r?\n/), rb = $('#diffB').value.split(/\r?\n/);
  const key = s => { let x = s; if ($('#diffWs').checked) x = x.replace(/\s+/g, ' ').trim(); if ($('#diffCase').checked) x = x.toLowerCase(); return x; };
  let ops;
  try { ops = diffLines(ra.map(key), rb.map(key)); }
  catch { $('#diffOut').innerHTML = ''; $('#diffStats').innerHTML = statusHtml(false, 'Textos demasiado grandes para comparar (máx. ~3.000 líneas distintas)'); return; }
  const add = ops.filter(o => o.t === '+').length, del = ops.filter(o => o.t === '-').length;
  $('#diffStats').innerHTML = add || del ? `<span class="ok-text">+${add}</span> · <span class="bad-text">−${del}</span> líneas` : statusHtml(true, 'Los textos son idénticos');
  const only = $('#diffOnly').checked, CTX = 3;
  const show = ops.map(() => !only);
  if (only) ops.forEach((o, i) => { if (o.t !== '=') for (let k = Math.max(0, i - CTX); k <= Math.min(ops.length - 1, i + CTX); k++) show[k] = true; });
  let html = '', hidden = 0;
  ops.forEach((o, i) => {
    if (!show[i]) { hidden++; return; }
    if (hidden) { html += `<div class="gap">··· ${hidden} línea${hidden === 1 ? '' : 's'} igual${hidden === 1 ? '' : 'es'} ···</div>`; hidden = 0; }
    const text = o.t === '+' ? rb[o.b] : ra[o.a];
    html += `<div class="${o.t === '+' ? 'add' : o.t === '-' ? 'del' : 'ctx'}">${o.t === '=' ? ' ' : o.t} ${esc(text)}</div>`;
  });
  if (hidden) html += `<div class="gap">··· ${hidden} línea${hidden === 1 ? '' : 's'} igual${hidden === 1 ? '' : 'es'} ···</div>`;
  $('#diffOut').innerHTML = html;
}
$('#diffRun').addEventListener('click', runDiff);
['diffWs', 'diffCase', 'diffOnly'].forEach(id => $('#' + id).addEventListener('change', () => { if ($('#diffOut').innerHTML) runDiff(); }));

/* ---------- UUID ---------- */
function uuid4() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = randBytes(16); b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = toHex(b); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
function genUuids() {
  const n = Math.min(500, Math.max(1, parseInt($('#uuidN').value, 10) || 1));
  $('#uuidOut').value = Array.from({ length: n }, () => { let u = uuid4(); if ($('#uuidNoDash').checked) u = u.replace(/-/g, ''); return $('#uuidUpper').checked ? u.toUpperCase() : u; }).join('\n');
}
$('#uuidGen').addEventListener('click', genUuids);
$('#uuidCopy').addEventListener('click', () => copyText($('#uuidOut').value, 'UUID copiados'));
['uuidUpper', 'uuidNoDash'].forEach(id => $('#' + id).addEventListener('change', genUuids));

/* ---------- Fechas / epoch ---------- */
function epTick() { const n = Date.now(); $('#epNowS').textContent = Math.floor(n / 1000); $('#epNowMs').textContent = n; }
function dateKv(d) {
  const start = new Date(d.getFullYear(), 0, 1);
  const doy = Math.floor((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - start) / 864e5) + 1;
  const diff = (d.getTime() - Date.now()) / 1000, ad = Math.abs(diff);
  const rel = ad < 60 ? 'ahora mismo' : (diff < 0 ? 'hace ' : 'dentro de ') + (ad < 3600 ? Math.round(ad / 60) + ' min' : ad < 86400 ? Math.round(ad / 3600) + ' h' : Math.round(ad / 86400).toLocaleString('es-ES') + ' días');
  return [['Local', cap(d.toLocaleString('es-ES', { dateStyle: 'full', timeStyle: 'medium' }))], ['UTC', d.toUTCString()], ['ISO 8601', d.toISOString()], ['Relativo', rel], ['Semana ISO', String(isoWeek(d))], ['Día del año', String(doy)]];
}
const kvHtml = rows => rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
$('#epIn').addEventListener('input', () => {
  const v = $('#epIn').value.trim();
  if (!v) { $('#epOut').innerHTML = ''; return; }
  const n = Number(v);
  if (!Number.isFinite(n)) { $('#epOut').innerHTML = `<dt></dt><dd class="bad-text">No es un número</dd>`; return; }
  const ms = Math.abs(n) >= 1e11 ? n : n * 1000;
  const d = new Date(ms);
  if (isNaN(d)) { $('#epOut').innerHTML = `<dt></dt><dd class="bad-text">Fuera de rango</dd>`; return; }
  $('#epOut').innerHTML = kvHtml([['Unidad', Math.abs(n) >= 1e11 ? 'milisegundos' : 'segundos']].concat(dateKv(d)));
});
$('#epDate').addEventListener('input', () => {
  const v = $('#epDate').value; if (!v) { $('#epDateOut').innerHTML = ''; return; }
  const d = new Date(v);
  $('#epDateOut').innerHTML = kvHtml([['Epoch (s)', String(Math.floor(d.getTime() / 1000))], ['Epoch (ms)', String(d.getTime())]].concat(dateKv(d).filter(r => r[0] !== 'Local')));
});
$('#epCopyNow').addEventListener('click', () => copyText(String(Math.floor(Date.now() / 1000)), 'Epoch copiado'));
setInterval(() => { if (APP_READY && currentTab === 'devtools' && devTool === 'time') epTick(); }, 1000);

/* ---------- Validadores NIF / NIE / CIF / IBAN ---------- */
const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';
const CIF_TYPES = { A: 'Sociedad anónima', B: 'Sociedad de responsabilidad limitada', C: 'Sociedad colectiva', D: 'Sociedad comanditaria', E: 'Comunidad de bienes', F: 'Sociedad cooperativa', G: 'Asociación o fundación', H: 'Comunidad de propietarios', J: 'Sociedad civil', K: 'NIF especial (menor de 14 años)', L: 'NIF especial (residente en el extranjero)', M: 'NIF especial (extranjero sin NIE)', N: 'Entidad extranjera', P: 'Corporación local', Q: 'Organismo público', R: 'Congregación o institución religiosa', S: 'Órgano de la Administración del Estado o de una comunidad autónoma', U: 'Unión temporal de empresas', V: 'Otro tipo de entidad', W: 'Establecimiento permanente de entidad no residente' };
const IBAN_LEN = { ES: 24, AD: 24, PT: 25, FR: 27, IT: 27, DE: 22, GB: 22, IE: 22, NL: 18, BE: 16, LU: 20, AT: 20, CH: 21, PL: 28, SE: 24, DK: 18, FI: 18, NO: 15, GR: 27, MT: 31, MC: 27, CZ: 24, SK: 24, HU: 28, RO: 24, BG: 22, HR: 21, SI: 19, LT: 20, LV: 21, EE: 20, CY: 28, IS: 26, LI: 21, SM: 27, GI: 23 };
function mod97(s) { let r = 0; for (const ch of s) { const v = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch; for (const c of v) r = (r * 10 + +c) % 97; } return r; }
function cccDc(s) { const w = [1, 2, 4, 8, 5, 10, 9, 7, 3, 6]; const sum = [...s].reduce((a, c, i) => a + (+c) * w[i], 0); const d = 11 - (sum % 11); return d === 11 ? 0 : d === 10 ? 1 : d; }
function validateId(raw) {
  const v = raw.toUpperCase().replace(/[\s.-]/g, '');
  let m;
  if (!v) return null;
  if ((m = /^(\d{8})$/.exec(v))) return { type: 'DNI (sin letra)', ok: true, rows: [['Letra', DNI_LETTERS[+m[1] % 23]], ['NIF completo', m[1] + DNI_LETTERS[+m[1] % 23]]] };
  if ((m = /^(\d{1,8})([A-Z])$/.exec(v))) { const num = m[1].padStart(8, '0'), L = DNI_LETTERS[+num % 23]; return { type: 'NIF / DNI', ok: L === m[2], rows: [['Número', num], ['Letra esperada', L]] }; }
  if ((m = /^([XYZ])(\d{7})([A-Z])$/.exec(v))) { const num = 'XYZ'.indexOf(m[1]) + m[2], L = DNI_LETTERS[+num % 23]; return { type: 'NIE', ok: L === m[3], rows: [['Letra esperada', L]] }; }
  if ((m = /^([ABCDEFGHJKLMNPQRSUVW])(\d{7})([0-9A-J])$/.exec(v))) {
    const d = m[2]; let sum = 0;
    for (let i = 0; i < 7; i++) { if (i % 2 === 0) { const x = +d[i] * 2; sum += Math.floor(x / 10) + (x % 10); } else sum += +d[i]; }
    const c = (10 - (sum % 10)) % 10, letter = 'JABCDEFGHI'[c];
    const onlyLetter = 'KLMNPQRSW'.includes(m[1]), onlyDigit = 'ABEH'.includes(m[1]);
    const ok = onlyLetter ? m[3] === letter : onlyDigit ? m[3] === String(c) : (m[3] === String(c) || m[3] === letter);
    return { type: 'CIF / NIF de entidad', ok, rows: [['Tipo de entidad', CIF_TYPES[m[1]] || '—'], ['Provincia (código)', d.slice(0, 2)], ['Control esperado', onlyLetter ? letter : onlyDigit ? String(c) : `${c} o ${letter}`]] };
  }
  if ((m = /^(\d{20})$/.exec(v))) {
    const chk = 98 - mod97(v + 'ES00'), iban = 'ES' + String(chk).padStart(2, '0') + v;
    const ok = cccDc('00' + v.slice(0, 8)) === +v[8] && cccDc(v.slice(10)) === +v[9];
    return { type: 'Cuenta CCC (20 dígitos)', ok, rows: [['Dígitos de control', ok ? 'Correctos' : `Esperados ${cccDc('00' + v.slice(0, 8))}${cccDc(v.slice(10))}`], ['IBAN', iban.replace(/(.{4})/g, '$1 ').trim()]] };
  }
  if ((m = /^([A-Z]{2})(\d{2})([A-Z0-9]{8,30})$/.exec(v))) {
    const lenOk = !IBAN_LEN[m[1]] || IBAN_LEN[m[1]] === v.length;
    const ok = lenOk && mod97(v.slice(4) + v.slice(0, 4)) === 1;
    const rows = [['País', m[1]], ['Formato', v.replace(/(.{4})/g, '$1 ').trim()]];
    if (!lenOk) rows.push(['Longitud', `${v.length} (se esperaban ${IBAN_LEN[m[1]]})`]);
    if (m[1] === 'ES' && v.length === 24) {
      const c = v.slice(4); rows.push(['Entidad', c.slice(0, 4)], ['Oficina', c.slice(4, 8)], ['DC', c.slice(8, 10)], ['Cuenta', c.slice(10)]);
      if (cccDc('00' + c.slice(0, 8)) !== +c[8] || cccDc(c.slice(10)) !== +c[9]) rows.push(['Aviso', 'Los dígitos de control nacionales (DC) no cuadran']);
    }
    return { type: 'IBAN', ok, rows };
  }
  return { type: 'Desconocido', ok: false, rows: [['', 'No reconozco el formato (DNI, NIE, CIF, IBAN o CCC)']] };
}
$('#valIn').addEventListener('input', () => {
  const r = validateId($('#valIn').value);
  if (!r) { $('#valOut').innerHTML = '<span class="muted">Escribe un documento o una cuenta.</span>'; return; }
  $('#valOut').innerHTML = `<div class="row" style="margin-bottom:10px"><b>${esc(r.type)}</b>${r.type === 'Desconocido' ? '' : r.ok ? '<span class="badge success">✓ Válido</span>' : '<span class="badge danger">✗ No válido</span>'}</div><dl class="kv">${r.rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
});

/* ---------- Texto ---------- */
let txPrev = null;
const stripAccents = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const wordsOf = s => stripAccents(s).replace(/([a-z])([A-Z])/g, '$1 $2').split(/[^A-Za-z0-9ñÑ]+/).filter(Boolean);
const perLine = fn => s => s.split('\n').map(fn).join('\n');
const TX = [
  ['MAYÚSCULAS', s => s.toLocaleUpperCase('es')],
  ['minúsculas', s => s.toLocaleLowerCase('es')],
  ['Tipo Título', s => s.toLocaleLowerCase('es').replace(/(^|[\s(¿¡"'«-])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('es'))],
  ['Tipo oración', s => s.toLocaleLowerCase('es').replace(/(^\s*|[.!?¿¡]\s+)(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('es'))],
  ['Quitar tildes', stripAccents],
  ['slug', perLine(l => wordsOf(l).join('-').toLowerCase())],
  ['camelCase', perLine(l => wordsOf(l).map((w, i) => i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()).join(''))],
  ['snake_case', perLine(l => wordsOf(l).join('_').toLowerCase())],
  ['CONSTANT_CASE', perLine(l => wordsOf(l).join('_').toUpperCase())],
  ['kebab-case', perLine(l => wordsOf(l).join('-').toLowerCase())],
  ['Ordenar A→Z', s => s.split('\n').sort((a, b) => a.localeCompare(b, 'es')).join('\n')],
  ['Ordenar Z→A', s => s.split('\n').sort((a, b) => b.localeCompare(a, 'es')).join('\n')],
  ['Quitar duplicadas', s => [...new Set(s.split('\n'))].join('\n')],
  ['Quitar líneas vacías', s => s.split('\n').filter(l => l.trim()).join('\n')],
  ['Invertir líneas', s => s.split('\n').reverse().join('\n')],
  ['Recortar espacios', s => s.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).join('\n')],
  ['Unir líneas', s => s.split('\n').map(l => l.trim()).filter(Boolean).join(' ')],
  ['Numerar líneas', s => s.split('\n').map((l, i) => `${i + 1}. ${l}`).join('\n')]
];
function txStats() {
  const s = $('#txIn').value;
  const words = (s.match(/\S+/g) || []).length;
  $('#txStats').textContent = `${s.length.toLocaleString('es-ES')} caracteres · ${s.replace(/\s/g, '').length.toLocaleString('es-ES')} sin espacios · ${words.toLocaleString('es-ES')} palabras · ${s ? s.split('\n').length : 0} líneas · ${te.encode(s).length.toLocaleString('es-ES')} bytes UTF-8 · ~${Math.max(1, Math.round(words / 200))} min de lectura`;
}
$('#txBtns').innerHTML = TX.map(([l], i) => `<button class="btn sm" data-tx="${i}">${esc(l)}</button>`).join('') + '<button class="btn sm ghost" data-tx="undo">↶ Deshacer</button><button class="btn sm" data-tx="copy">📋 Copiar</button>';
$('#txBtns').addEventListener('click', e => {
  const b = e.target.closest('[data-tx]'); if (!b) return;
  const ta = $('#txIn');
  if (b.dataset.tx === 'undo') { if (txPrev != null) { ta.value = txPrev; txPrev = null; txStats(); } return; }
  if (b.dataset.tx === 'copy') { copyText(ta.value); return; }
  txPrev = ta.value; ta.value = TX[+b.dataset.tx][1](ta.value); txStats();
});
$('#txIn').addEventListener('input', txStats);
function initDevtools() { initDevHelp(); initRegex(); setTool(store.get('devTool', 'json')); }

/* ---------- Texto de relleno (Lorem ipsum) ---------- */
const LOREM_WORDS = ('lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum curabitur pretium tincidunt lacus gravida orci odio nullam varius turpis pharetra eros suscipit mauris aenean posuere vitae mattis sem integer euismod lacinia nibh libero molestie ligula facilisis vestibulum nisl porta congue').split(' ');
const LOREM_START = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua'.split(' ');
const lorRnd = n => Math.floor(Math.random() * n);
const lorCap = s => s.charAt(0).toUpperCase() + s.slice(1);
/** n palabras; con «classic», las primeras son las del lorem ipsum de toda la vida. */
function lorWords(n, classic) {
  const out = classic ? LOREM_START.slice(0, n) : [];
  while (out.length < n) out.push(LOREM_WORDS[lorRnd(LOREM_WORDS.length)]);
  return out;
}
/** Una frase de entre 6 y 16 palabras, con alguna coma. */
function lorSentence(classic) {
  const n = 6 + lorRnd(11), w = lorWords(n, classic);
  if (n > 9) w[Math.floor(n / 2)] += ',';
  return lorCap(w.join(' ')) + '.';
}
const lorParagraph = classic => Array.from({ length: 3 + lorRnd(3) }, (_, i) => lorSentence(classic && i === 0)).join(' ');
/** Texto de relleno: n párrafos (p), frases (s), palabras (w) o líneas de lista (li). */
function loremText(n, unit, classic) {
  n = Math.max(1, Math.min(200, Math.floor(+n) || 1));
  if (unit === 'w') return lorCap(lorWords(n, classic).join(' ')) + '.';
  if (unit === 's') return Array.from({ length: n }, (_, i) => lorSentence(classic && i === 0)).join(' ');
  if (unit === 'li') return Array.from({ length: n }, (_, i) => '- ' + lorCap(lorWords(3 + lorRnd(5), classic && i === 0).join(' '))).join('\n');
  return Array.from({ length: n }, (_, i) => lorParagraph(classic && i === 0)).join('\n\n');
}
function lorRun(add) {
  const t = loremText($('#lorN').value, $('#lorUnit').value, $('#lorClassic').checked);
  const ta = $('#txIn');
  txPrev = ta.value;
  ta.value = add && ta.value.trim() ? ta.value.replace(/\s*$/, '') + '\n\n' + t : t;
  txStats();
  toast('Texto de relleno generado', 'success', 1600);
}
$('#lorGen').addEventListener('click', () => lorRun(false));
$('#lorAdd').addEventListener('click', () => lorRun(true));
