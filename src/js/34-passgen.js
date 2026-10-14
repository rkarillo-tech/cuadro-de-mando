const CHARS = { upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', lower: 'abcdefghijklmnopqrstuvwxyz', digits: '0123456789', symbols: '!@#$%^&*()-_=+[]{};:,.<>?/~' };
const AMBIG = /[Il1O0o|`'"]/g;
const WORDS = [...new Set(('agua aire alba arbol arena barco bosque brisa cable calle campo canal casa cielo cinta clavo cobre cofre cometa costa cuerda dado delta disco duna eco eje faro fiesta flor fuego gato globo grano gruta hielo hierro hoja horno isla jardin jarra lago lapiz lente libro lima linea llave lobo luna madera mapa mar marco mesa metal miel mina mono monte mundo nave niebla nido noche nube nudo ola oro oso pala palma papel pato perla piedra pino planta plata playa pluma polvo puente puerta pulpo queso radio rama rana rayo red reloj rio roca rosa rueda sal selva silla sol sombra taza techo tela tierra tigre torre trigo trueno tubo uva valle vela verde viento vino volcan zorro abeja ancla ardilla balcon bambu bufanda caballo camino cebra cereza chispa coral cuervo delfin espejo estrella fresa galleta gaviota girasol guitarra hormiga iglu jirafa koala lechuza limon manzana mariposa medusa naranja nieve oasis oveja panda paraguas pasta pepino pinguino pirata planeta pradera robot salmon sandia serpiente tambor tesoro tomate tortuga trompeta tulipan vaso violin yogur zapato ballena brujula castillo cohete dragon fantasma hamaca ladrillo maleta molino pajaro pantera pera piano pizarra semilla sirena tiburon tormenta trineo vagon ventana acero album antena aroma arpa atlas avena bahia bala bando barro bisonte bloque bolsa bota brazo burbuja cactus cafe cama canica carbon carta cebolla cedro cesta cifra circo cisne clima cobra codigo colina cubo cumbre').split(' '))];
let pgMode = 'random', pgCurrent = null, pgSession = [];

function randInt(n) { const lim = Math.floor(0x100000000 / n) * n; const a = new Uint32Array(1); do { crypto.getRandomValues(a); } while (a[0] >= lim); return a[0] % n; }
function genRandom() {
  const len = +$('#pgLen').value;
  let sets = [];
  if ($('#pgUpper').checked) sets.push(CHARS.upper);
  if ($('#pgLower').checked) sets.push(CHARS.lower);
  if ($('#pgDigits').checked) sets.push(CHARS.digits);
  if ($('#pgSymbols').checked) sets.push(CHARS.symbols);
  if ($('#pgNoAmb').checked) sets = sets.map(s => s.replace(AMBIG, ''));
  sets = sets.filter(Boolean);
  if (!sets.length) { toast('Elige al menos un tipo de carácter', 'warning'); return null; }
  const pool = sets.join('');
  const chars = sets.map(s => s[randInt(s.length)]); // al menos uno de cada tipo elegido
  while (chars.length < len) chars.push(pool[randInt(pool.length)]);
  for (let i = chars.length - 1; i > 0; i--) { const j = randInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return { pw: chars.slice(0, len).join(''), bits: Math.round(len * Math.log2(pool.length)) };
}
function genPhrase() {
  const n = +$('#pgWords').value, sep = $('#pgSep').value, cap = $('#pgCap').checked, num = $('#pgNum').checked;
  const words = Array.from({ length: n }, () => { const w = WORDS[randInt(WORDS.length)]; return cap ? w[0].toUpperCase() + w.slice(1) : w; });
  let bits = n * Math.log2(WORDS.length);
  if (num) { words[randInt(n)] += String(randInt(100)); bits += Math.log2(100); }
  return { pw: words.join(sep), bits: Math.round(bits) };
}
const colorPw = pw => Array.from(pw).map(c => /\d/.test(c) ? `<span class="d">${c}</span>` : /[a-zA-Z ]/.test(c) ? esc(c) : `<span class="s">${esc(c)}</span>`).join('');
function pgGenerate() {
  const r = pgMode === 'random' ? genRandom() : genPhrase();
  if (!r) return;
  pgCurrent = r;
  $('#pgOut').innerHTML = colorPw(r.pw);
  paintMeter($('#pgMeter'), $('#pgStrength'), r.pw, r.bits);
  $('#pgLenInfo').textContent = `${r.pw.length} caracteres`;
}
function renderPgHist() {
  $('#pgHist').innerHTML = pgSession.length ? pgSession.map((p, i) => `<div class="list-item" data-i="${i}" style="cursor:default"><span class="grow mono small ellipsis">${esc(p)}</span><button class="btn icon sm ghost" data-pgc="${i}" title="Copiar">📋</button></div>`).join('') : '<div class="empty small">Las contraseñas que copies aparecerán aquí.</div>';
}
$('#pgModes').addEventListener('click', e => {
  const b = e.target.closest('[data-pg]'); if (!b) return;
  pgMode = b.dataset.pg;
  $$('#pgModes button').forEach(x => x.classList.toggle('on', x === b));
  $('#pgRandomOpts').hidden = pgMode !== 'random';
  $('#pgPhraseOpts').hidden = pgMode !== 'phrase';
  pgGenerate();
});
$('#pgLen').addEventListener('input', e => { $('#pgLenVal').textContent = e.target.value; pgGenerate(); });
$('#pgWords').addEventListener('input', e => { $('#pgWordsVal').textContent = e.target.value; pgGenerate(); });
['pgUpper', 'pgLower', 'pgDigits', 'pgSymbols', 'pgNoAmb', 'pgSep', 'pgCap', 'pgNum'].forEach(id => $('#' + id).addEventListener('change', pgGenerate));
$('#pgGen').addEventListener('click', pgGenerate);
$('#pgCopy').addEventListener('click', async () => {
  if (!pgCurrent) return;
  if (await copyText(pgCurrent.pw, 'Contraseña copiada')) { pgSession = [pgCurrent.pw, ...pgSession.filter(p => p !== pgCurrent.pw)].slice(0, 8); renderPgHist(); }
});
$('#pgUse').addEventListener('click', () => {
  if (!pgCurrent) return;
  $('#cPass').value = pgCurrent.pw;
  paintMeter($('#cMeter'), $('#cStrength'), pgCurrent.pw, pgCurrent.bits);
  pgSession = [pgCurrent.pw, ...pgSession.filter(p => p !== pgCurrent.pw)].slice(0, 8); renderPgHist();
  showTab('crypto');
  toast('Contraseña puesta en el encriptador. ¡Guárdala en lugar seguro!', 'info', 4000);
});
$('#pgHist').addEventListener('click', e => { const b = e.target.closest('[data-pgc]'); if (b) copyText(pgSession[+b.dataset.pgc], 'Contraseña copiada'); });
eyeToggle($('#pgCheckEye'), $('#pgCheck'));
$('#pgCheck').addEventListener('input', e => paintMeter($('#pgCheckMeter'), $('#pgCheckLabel'), e.target.value));

