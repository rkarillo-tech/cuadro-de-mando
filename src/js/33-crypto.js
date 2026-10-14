const TXT_PREFIX = 'cdm2:';
const FILE_MAGIC = 'CDMF1';
async function sealBytes(data, pass) {
  const salt = randBytes(16), iv = randBytes(12);
  const key = await deriveKey(pass, salt);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data));
  return concatBytes(salt, iv, ct);
}
async function openBytes(packed, pass) {
  if (packed.length < 44) throw new Error('corto');
  const key = await deriveKey(pass, packed.slice(0, 16));
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: packed.slice(16, 28) }, key, packed.slice(28)));
}
const encryptString = async (text, pass) => TXT_PREFIX + b64enc(await sealBytes(te.encode(text), pass));
async function decryptString(s, pass) {
  s = s.replace(/\s+/g, '');
  if (s.startsWith(TXT_PREFIX)) return td.decode(await openBytes(b64dec(s.slice(TXT_PREFIX.length)), pass));
  // Formato de la versión anterior: sal fija y 100.000 iteraciones
  const bytes = b64dec(s);
  const iv = bytes.slice(0, 12), data = bytes.slice(12);
  for (const salt of ['unique_salt', 'unique_salt_12345']) {
    try { const key = await deriveKey(pass, te.encode(salt), 100000); return td.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)); } catch {}
  }
  throw new Error('fail');
}

/* ---------- Fortaleza de contraseñas (compartido) ---------- */
const SCORE_LABELS = ['Muy débil', 'Débil', 'Aceptable', 'Fuerte', 'Muy fuerte'];
const SCORE_COLORS = ['var(--danger)', '#f2884b', 'var(--warning)', 'var(--success)', '#2bb3a0'];
const scoreOf = bits => bits < 28 ? 0 : bits < 36 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4;
function estimateBits(pw) {
  if (!pw) return 0;
  let pool = 0;
  if (/[a-zñ]/.test(pw)) pool += 27;
  if (/[A-ZÑ]/.test(pw)) pool += 27;
  if (/\d/.test(pw)) pool += 10;
  if (/[^a-zA-Z0-9ñÑ]/.test(pw)) pool += 33;
  let bits = pw.length * Math.log2(pool || 1);
  if (new Set(pw).size < pw.length / 2) bits *= 0.6;
  if (/(123|abc|qwerty|password|contrase|admin|1111|0000)/i.test(pw)) bits *= 0.5;
  return Math.round(bits);
}
function paintMeter(bar, label, pw, bits = estimateBits(pw)) {
  if (!pw) { bar.style.width = '0'; if (label) label.textContent = ''; return; }
  const sc = scoreOf(bits);
  bar.style.width = Math.min(100, Math.max(8, bits)) + '%';
  bar.style.background = SCORE_COLORS[sc];
  if (label) label.textContent = `${SCORE_LABELS[sc]} · ~${bits} bits de entropía`;
}

/* ---------- UI del encriptador ---------- */
let cMode = 'text', cFileObj = null;
function setCryptoMode(m) {
  cMode = m;
  $$('#cryptoTabs button').forEach(b => b.classList.toggle('on', b.dataset.ct === m));
  $('#ctText').hidden = m !== 'text';
  $('#ctFile').hidden = m !== 'file';
  $('#cOutCard').hidden = m !== 'text';
}
$('#cryptoTabs').addEventListener('click', e => { const b = e.target.closest('[data-ct]'); if (b) setCryptoMode(b.dataset.ct); });
function setFile(f) {
  cFileObj = f || null;
  $('#fileInfo').textContent = f ? `${f.name} · ${(f.size / 1024).toFixed(1)} KB` : 'Ningún archivo seleccionado';
}
const dz = $('#dropzone');
dz.addEventListener('click', () => $('#cFile').click());
$('#cFile').addEventListener('change', e => setFile(e.target.files[0]));
dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
dz.addEventListener('dragleave', () => dz.classList.remove('over'));
dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('over'); if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); });

function eyeToggle(btn, input) { btn.addEventListener('click', () => { input.type = input.type === 'password' ? 'text' : 'password'; btn.textContent = input.type === 'password' ? '👁' : '🙈'; }); }
eyeToggle($('#cEye'), $('#cPass'));
$('#cPass').addEventListener('input', e => paintMeter($('#cMeter'), $('#cStrength'), e.target.value));

async function doCrypto(dir) {
  const pass = $('#cPass').value.trim();
  if (!window.crypto || !crypto.subtle) { toast('Este navegador no permite cifrado aquí', 'danger', 4000); return; }
  if (!pass) { toast('Introduce una contraseña', 'warning'); $('#cPass').focus(); return; }
  const btn = dir === 'enc' ? $('#cEnc') : $('#cDec');
  const label = btn.innerHTML;
  btn.innerHTML = '⏳ Procesando…';
  $('#cEnc').disabled = $('#cDec').disabled = true;
  try {
    if (cMode === 'text') {
      const input = $('#cIn').value;
      if (!input.trim()) { toast(dir === 'enc' ? 'Escribe el texto que quieres cifrar' : 'Pega el texto cifrado', 'warning'); return; }
      if (dir === 'enc') { $('#cOut').value = await encryptString(input, pass); toast('Texto cifrado', 'success', 1800); }
      else {
        try { $('#cOut').value = await decryptString(input, pass); toast('Texto descifrado', 'success', 1800); }
        catch { toast('No se pudo descifrar: contraseña incorrecta o texto dañado', 'danger', 4500); }
      }
    } else {
      if (!cFileObj) { toast('Elige un archivo primero', 'warning'); return; }
      const all = new Uint8Array(await cFileObj.arrayBuffer());
      if (dir === 'enc') {
        const nameB = te.encode(cFileObj.name).slice(0, 1000);
        const head = new Uint8Array(2); new DataView(head.buffer).setUint16(0, nameB.length);
        const sealed = await sealBytes(concatBytes(head, nameB, all), pass);
        download(cFileObj.name + '.cdm', new Blob([te.encode(FILE_MAGIC), sealed], { type: 'application/octet-stream' }));
        toast('Archivo cifrado y descargado', 'success');
      } else {
        if (td.decode(all.slice(0, 5)) !== FILE_MAGIC) { toast('Este archivo no está cifrado con esta app (.cdm)', 'danger', 4000); return; }
        let plain;
        try { plain = await openBytes(all.slice(5), pass); } catch { toast('Contraseña incorrecta o archivo dañado', 'danger', 4000); return; }
        const len = new DataView(plain.buffer, plain.byteOffset, plain.byteLength).getUint16(0);
        const name = td.decode(plain.slice(2, 2 + len)) || 'archivo';
        download(name, new Blob([plain.slice(2 + len)]));
        toast(`Archivo «${name}» descifrado`, 'success');
      }
    }
  } catch (err) {
    toast('Se produjo un error durante la operación', 'danger');
  } finally {
    btn.innerHTML = label;
    $('#cEnc').disabled = $('#cDec').disabled = false;
  }
}
$('#cEnc').addEventListener('click', () => doCrypto('enc'));
$('#cDec').addEventListener('click', () => doCrypto('dec'));
$('#cOutClear').addEventListener('click', () => { $('#cOut').value = ''; });
$('#cClear').addEventListener('click', () => {
  $('#cIn').value = ''; $('#cOut').value = ''; $('#cPass').value = '';
  paintMeter($('#cMeter'), $('#cStrength'), ''); setFile(null); $('#cFile').value = '';
  toast('Campos limpiados', 'info', 1400);
});
$('#cCopy').addEventListener('click', () => copyText($('#cOut').value));
$('#cSwap').addEventListener('click', () => { if (!$('#cOut').value) return; $('#cIn').value = $('#cOut').value; $('#cOut').value = ''; $('#cIn').focus(); });
$('#cDownload').addEventListener('click', () => { const v = $('#cOut').value; if (!v) { toast('No hay resultado', 'warning'); return; } download(`resultado_${dayKey()}.txt`, v); });
$('#cSave').addEventListener('click', async () => {
  const content = $('#cOut').value.trim();
  if (!content) { toast('No hay ningún resultado que guardar', 'warning'); return; }
  const looksCipher = content.startsWith(TXT_PREFIX) || /^[A-Za-z0-9+/=]{24,}$/.test(content);
  if (!looksCipher && !(await confirmDialog('El resultado parece texto SIN cifrar. Si lo guardas, quedará legible en el navegador. ¿Guardarlo igualmente?', 'Guardar igualmente', true))) return;
  const name = await askText('💾 Guardar en el almacén', 'Nombre para identificarlo', `Cifrado ${fmtDateTime(Date.now())}`);
  if (!name) return;
  S.vault.push({ id: uid(), name, content, created: Date.now() });
  save.vault(); renderVault();
  toast('Guardado en el almacén', 'success');
});

function renderVault() {
  const q = $('#vaultSearch').value.trim().toLowerCase();
  const items = [...S.vault].sort((a, b) => b.created - a.created).filter(v => !q || v.name.toLowerCase().includes(q));
  $('#vaultCount').textContent = S.vault.length;
  $('#vaultList').innerHTML = items.length ? items.map(v => `<div class="vault-item" data-id="${esc(v.id)}">
      <div class="row" style="justify-content:space-between;flex-wrap:nowrap"><b class="ellipsis">${esc(v.name)}</b><span class="muted small" style="white-space:nowrap">${fmtDateTime(v.created)}</span></div>
      <div class="mono small muted ellipsis">${esc(v.content.slice(0, 90))}</div>
      <div class="row">
        <button class="btn sm" data-v="decrypt" title="Cargar y descifrar">🔓 Descifrar</button>
        <button class="btn sm" data-v="load" title="Cargar en la entrada">📥 Cargar</button>
        <button class="btn sm" data-v="copy" title="Copiar">📋</button>
        <button class="btn sm" data-v="rename" title="Renombrar">✏️</button>
        <button class="btn sm danger" data-v="del" title="Eliminar">🗑️</button>
      </div></div>`).join('')
    : `<div class="empty">${q ? 'Sin resultados' : 'Aún no has guardado nada.<br>Cifra un texto y pulsa «Guardar en almacén».'}</div>`;
}
onShow.crypto = renderVault;
$('#vaultSearch').addEventListener('input', debounce(renderVault, 150));
$('#vaultList').addEventListener('click', async e => {
  const b = e.target.closest('[data-v]'); if (!b) return;
  const v = S.vault.find(x => x.id === b.closest('.vault-item').dataset.id); if (!v) return;
  switch (b.dataset.v) {
    case 'load': setCryptoMode('text'); $('#cIn').value = v.content; $('#cOut').value = ''; toast('Cargado en la entrada', 'info', 1400); break;
    case 'decrypt':
      setCryptoMode('text'); $('#cIn').value = v.content; $('#cOut').value = '';
      if ($('#cPass').value.trim()) doCrypto('dec');
      else { $('#cPass').focus(); toast('Introduce la contraseña y pulsa «Desencriptar»', 'info', 3500); }
      break;
    case 'copy': copyText(v.content); break;
    case 'rename': { const n = await askText('Renombrar', 'Nuevo nombre', v.name); if (n) { v.name = n; save.vault(); renderVault(); } break; }
    case 'del': {
      const idx = S.vault.indexOf(v);
      S.vault.splice(idx, 1); save.vault(); renderVault();
      toast(`«${v.name}» eliminado`, 'info', 6000, { label: 'Deshacer', fn: () => { S.vault.splice(idx, 0, v); save.vault(); renderVault(); } });
      break;
    }
  }
});

function vaultLoad(id) {
  const v = S.vault.find(x => x.id === id); if (!v) return;
  setCryptoMode('text'); $('#cIn').value = v.content; $('#cOut').value = '';
  $('#cPass').focus();
  toast('Elemento cargado: escribe la contraseña y pulsa «Desencriptar»', 'info', 3000);
}
