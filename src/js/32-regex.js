/* =====================================================================
   REGEX · PROBAR, EXPLICAR, CONSTRUIR, INFERIR, BIBLIOTECA Y CÓDIGO
   ===================================================================== */
const RX_FLAGS = [['g', 'global: todas las coincidencias, no solo la primera'], ['i', 'ignorar mayúsculas y minúsculas'], ['m', 'multilínea: ^ y $ marcan el inicio y el final de cada línea'], ['s', 'el punto «.» también coincide con saltos de línea'], ['u', 'modo Unicode: necesario para \\p{…} y emojis']];
let rxOn = new Set(['g']);
let rxTab = 'test', rxSel = { s: 0, e: 0 }, rxHist = [], rxParsed = null;
const rxFlagsStr = (extra = '') => [...new Set(RX_FLAGS.map(f => f[0]).filter(f => rxOn.has(f)).concat(extra.split('')))].join('');

/* ---------- Analizador de expresiones regulares (sintaxis JavaScript) ---------- */
function rxParse(src) {
  let i = 0, groupN = 0;
  const names = [];
  const fail = (msg, at = i) => { const e = new Error(msg); e.pos = Math.min(at, src.length); throw e; };
  function alt() {
    const s = i, branches = [seq()], pipes = [];
    while (src[i] === '|') { pipes.push(i); i++; branches.push(seq()); }
    return branches.length === 1 ? branches[0] : { type: 'alt', s, e: i, branches, pipes };
  }
  function seq() {
    const s = i, items = [];
    while (i < src.length && src[i] !== '|' && src[i] !== ')') items.push(term());
    return { type: 'seq', s, e: i, items };
  }
  function term() {
    const atom = atomP();
    const q = quant();
    if (!q) return atom;
    if (atom.type === 'anchor') fail('No se puede repetir un ancla (^, $, \\b)', q.qs);
    return { type: 'quant', s: atom.s, e: i, atom, ...q };
  }
  function quant() {
    const qs = i, c = src[i]; let min, max;
    if (c === '*') { min = 0; max = Infinity; i++; }
    else if (c === '+') { min = 1; max = Infinity; i++; }
    else if (c === '?') { min = 0; max = 1; i++; }
    else if (c === '{') {
      const m = /^\{(\d+)(,(\d*))?\}/.exec(src.slice(i)); if (!m) return null;
      min = +m[1]; max = m[2] ? (m[3] === '' ? Infinity : +m[3]) : min;
      if (max < min) fail('En {mín,máx} el máximo es menor que el mínimo', qs);
      i += m[0].length;
    } else return null;
    let lazy = false; if (src[i] === '?') { lazy = true; i++; }
    if ('*+?'.includes(src[i] || '_') || (src[i] === '{' && /^\{\d+(,\d*)?\}/.test(src.slice(i)))) fail('Dos cuantificadores seguidos: agrupa con (?: ) si quieres repetir una repetición', i);
    return { min, max, lazy, qs, qe: i };
  }
  function atomP() {
    const s = i, c = src[i];
    if (c === '(') {
      i++; let kind = 'capture', name = null;
      if (src.startsWith('?:', i)) { kind = 'nocap'; i += 2; }
      else if (src.startsWith('?=', i)) { kind = 'ahead'; i += 2; }
      else if (src.startsWith('?!', i)) { kind = 'nahead'; i += 2; }
      else if (src.startsWith('?<=', i)) { kind = 'behind'; i += 3; }
      else if (src.startsWith('?<!', i)) { kind = 'nbehind'; i += 3; }
      else if (src.startsWith('?<', i)) {
        const m = /^\?<([\p{ID_Start}$_][\p{ID_Continue}$\u200C\u200D]*)>/u.exec(src.slice(i));
        if (!m) fail('Nombre de grupo no válido: usa letras, números o _ y empieza por letra', i);
        name = m[1]; if (names.includes(name)) fail(`El nombre de grupo «${name}» está repetido`, i);
        names.push(name); i += m[0].length;
      } else if (src[i] === '?') fail('Tipo de grupo especial no reconocido tras «(?»', i);
      const num = kind === 'capture' ? ++groupN : null;
      const hs = i;
      const body = alt();
      if (src[i] !== ')') fail('Falta cerrar este paréntesis', s);
      i++;
      return { type: 'group', kind, name, num, s, e: i, hs, body };
    }
    if (c === ')') fail('Paréntesis de cierre sin abrir');
    if (c === '[') return cls();
    if (c === '\\') return escape(false);
    if (c === '^') { i++; return { type: 'anchor', kind: 'start', s, e: i }; }
    if (c === '$') { i++; return { type: 'anchor', kind: 'end', s, e: i }; }
    if (c === '.') { i++; return { type: 'dot', s, e: i }; }
    if ('*+?'.includes(c)) fail(`El cuantificador «${c}» no tiene nada delante que repetir`);
    if (c === '{' && /^\{\d+(,\d*)?\}/.test(src.slice(i))) fail('El cuantificador {…} no tiene nada delante que repetir');
    const cp = src.codePointAt(i), ch = String.fromCodePoint(cp);
    i += ch.length;
    return { type: 'char', ch, s, e: i };
  }
  function escape(inClass) {
    const s = i; i++;
    const c = src[i];
    if (c === undefined) fail('Barra invertida «\\» al final del patrón', s);
    i++;
    if ('dDwWsS'.includes(c)) return { type: 'esc', code: c, s, e: i };
    if (!inClass && (c === 'b' || c === 'B')) return { type: 'anchor', kind: c === 'b' ? 'word' : 'nword', s, e: i };
    if (c === 'p' || c === 'P') {
      const m = /^\{([^}]+)\}/.exec(src.slice(i));
      if (m) { i += m[0].length; return { type: 'prop', neg: c === 'P', prop: m[1], s, e: i }; }
    }
    if (!inClass && /[1-9]/.test(c)) { let j = i; while (/\d/.test(src[j] || '')) j++; const n = +src.slice(i - 1, j); i = j; return { type: 'backref', ref: n, s, e: i }; }
    if (!inClass && c === 'k') { const m = /^<([^>]+)>/.exec(src.slice(i)); if (m) { i += m[0].length; return { type: 'backref', ref: m[1], s, e: i }; } }
    const ctrl = { n: ['\n', 'un salto de línea'], r: ['\r', 'un retorno de carro'], t: ['\t', 'un tabulador'], f: ['\f', 'un salto de página'], v: ['\v', 'un tabulador vertical'], 0: ['\0', 'el carácter nulo'] };
    if (ctrl[c]) return { type: 'char', ch: ctrl[c][0], label: ctrl[c][1], s, e: i };
    if (inClass && c === 'b') return { type: 'char', ch: '\b', label: 'el carácter de retroceso', s, e: i };
    if (c === 'u') {
      const m = /^\{([0-9a-fA-F]{1,6})\}/.exec(src.slice(i)) || /^([0-9a-fA-F]{4})/.exec(src.slice(i));
      if (m) { i += m[0].length; const ch = String.fromCodePoint(parseInt(m[1], 16)); return { type: 'char', ch, label: `el carácter Unicode U+${m[1].toUpperCase()} («${ch}»)`, s, e: i }; }
    }
    if (c === 'x') { const m = /^[0-9a-fA-F]{2}/.exec(src.slice(i)); if (m) { i += 2; const ch = String.fromCharCode(parseInt(m[0], 16)); return { type: 'char', ch, label: `el carácter «${ch}» (código ${m[0].toUpperCase()})`, s, e: i }; } }
    return { type: 'char', ch: c, escaped: true, s, e: i };
  }
  function cls() {
    const s = i; i++;
    let neg = false; if (src[i] === '^') { neg = true; i++; }
    const items = [];
    const one = () => { if (src[i] === '\\') return escape(true); const s2 = i, ch = String.fromCodePoint(src.codePointAt(i)); i += ch.length; return { type: 'char', ch, s: s2, e: i }; };
    while (i < src.length && src[i] !== ']') {
      const a = one();
      if (src[i] === '-' && src[i + 1] !== undefined && src[i + 1] !== ']' && a.type === 'char') {
        i++;
        const b = one();
        if (b.type !== 'char') fail('Rango no válido dentro del conjunto', a.s);
        if (b.ch.codePointAt(0) < a.ch.codePointAt(0)) fail(`Rango al revés: «${a.ch}-${b.ch}» (el primero debe ser menor)`, a.s);
        items.push({ type: 'range', from: a.ch, to: b.ch, s: a.s, e: b.e });
      } else items.push(a);
    }
    if (src[i] !== ']') fail('Falta cerrar este corchete «[»', s);
    i++;
    return { type: 'class', neg, items, s, e: i };
  }
  const ast = alt();
  if (i < src.length) fail(src[i] === ')' ? 'Paréntesis de cierre sin abrir' : 'Carácter inesperado');
  return { ast, groups: groupN, names };
}

/* ---------- Descripción en castellano ---------- */
const ESC_DESC = { d: 'un dígito (0-9)', D: 'cualquier carácter que NO sea un dígito', w: 'una letra, número o «_» (sin tildes ni ñ)', W: 'cualquier carácter que NO sea letra, número o «_»', s: 'un espacio en blanco (espacio, tabulador o salto de línea)', S: 'cualquier carácter que NO sea un espacio en blanco' };
const ESC_SHORT = { d: 'dígito', D: 'no dígito', w: 'letra/número/_', W: 'no letra/número', s: 'espacio', S: 'no espacio' };
const PROP_DESC = { L: 'cualquier letra (incluidas tildes y ñ)', Lu: 'una letra mayúscula', Ll: 'una letra minúscula', N: 'cualquier número', Nd: 'un dígito decimal', P: 'un signo de puntuación', S: 'un símbolo', Z: 'un separador (espacios)', Emoji: 'un emoji', 'Script=Latin': 'una letra del alfabeto latino', 'Script=Greek': 'una letra griega' };
const META = '\\^$.|?*+()[]{}/';
const showCh = ch => ch === ' ' ? 'espacio' : ch === '\n' ? '↵' : ch === '\t' ? '⇥' : ch;
function charDesc(n) {
  if (n.label) return n.label;
  if (n.ch === ' ') return 'un espacio';
  return `el carácter «${n.ch}»` + (n.escaped && META.includes(n.ch) ? ' (escapado: sin la barra tendría un significado especial)' : '');
}
function rangeDesc(a, b) {
  if (a === 'a' && b === 'z') return 'minúsculas a–z';
  if (a === 'A' && b === 'Z') return 'mayúsculas A–Z';
  if (a === '0' && b === '9') return 'dígitos 0–9';
  if (/\d/.test(a) && /\d/.test(b)) return `dígitos del ${a} al ${b}`;
  if (/[a-z]/i.test(a) && /[a-z]/i.test(b)) return `letras de la «${a}» a la «${b}»`;
  return `de «${a}» a «${b}»`;
}
function classItems(n) {
  return n.items.map(it => it.type === 'range' ? rangeDesc(it.from, it.to) : it.type === 'esc' ? ESC_SHORT[it.code] : it.type === 'prop' ? (PROP_DESC[it.prop] || `\\p{${it.prop}}`).replace(/^(un|una|cualquier) /, '') : it.label ? it.label.replace(/^(un|una|el) /, '') : `«${showCh(it.ch)}»`);
}
const joinY = arr => arr.length <= 1 ? arr.join('') : arr.slice(0, -1).join(', ') + ' o ' + arr[arr.length - 1];
function quantDesc(q) {
  let t;
  if (q.min === 0 && q.max === 1) t = 'opcional (puede aparecer o no)';
  else if (q.min === 0 && q.max === Infinity) t = 'cero o más veces';
  else if (q.min === 1 && q.max === Infinity) t = 'una o más veces';
  else if (q.min === q.max) t = `exactamente ${q.min} ${q.min === 1 ? 'vez' : 'veces'}`;
  else if (q.max === Infinity) t = `${q.min} o más veces`;
  else t = `entre ${q.min} y ${q.max} veces`;
  if (q.lazy) t += ', lo menos posible («perezoso»)';
  return t;
}
const quantShort = q => q.min === 0 && q.max === 1 ? ' (opcional)' : q.min === 0 && q.max === Infinity ? ' ×0+' : q.min === 1 && q.max === Infinity ? ' ×1+' : q.min === q.max ? ` ×${q.min}` : q.max === Infinity ? ` ×${q.min}+` : ` ×${q.min}–${q.max}`;
function groupDesc(n) {
  switch (n.kind) {
    case 'capture': return `Grupo ${n.num}${n.name ? ` «${n.name}»` : ''}: captura lo que coincida dentro (en el reemplazo es $${n.num}${n.name ? ` o $<${n.name}>` : ''})`;
    case 'nocap': return 'Grupo sin captura: solo agrupa (para repetir u ofrecer opciones) sin guardar el resultado';
    case 'ahead': return 'Comprobación hacia delante: lo que viene a continuación debe ser… (no forma parte de la coincidencia)';
    case 'nahead': return 'Comprobación hacia delante: lo que viene a continuación NO debe ser…';
    case 'behind': return 'Comprobación hacia atrás: lo que hay justo antes debe ser…';
    case 'nbehind': return 'Comprobación hacia atrás: lo que hay justo antes NO debe ser…';
  }
}
function anchorDesc(n, flags) {
  const m = flags.includes('m');
  return { start: m ? 'inicio de cada línea' : 'inicio del texto', end: m ? 'final de cada línea' : 'final del texto', word: 'límite de palabra (entre una letra/número y otra cosa)', nword: 'posición que NO es límite de palabra' }[n.kind];
}
/** Descripción de un átomo simple (sin hijos). */
function atomDesc(n, flags) {
  switch (n.type) {
    case 'char': return charDesc(n);
    case 'literal': return n.text.length === 1 ? charDesc(n.parts[0]) : `el texto literal «${n.text}»`;
    case 'dot': return flags.includes('s') ? 'cualquier carácter, incluido el salto de línea' : 'cualquier carácter (excepto salto de línea)';
    case 'esc': return ESC_DESC[n.code];
    case 'prop': return (n.neg ? 'cualquier carácter que NO sea ' : '') + (PROP_DESC[n.prop] || `un carácter con la propiedad Unicode «${n.prop}»`);
    case 'class': { const it = joinY(classItems(n)); return n.neg ? `un carácter que NO sea: ${it}` : n.items.length === 1 ? `un carácter: ${it}` : `un carácter de entre: ${it}`; }
    case 'anchor': return anchorDesc(n, flags);
    case 'backref': return `exactamente lo mismo que capturó el grupo ${typeof n.ref === 'number' ? n.ref : `«${n.ref}»`}`;
  }
  return '';
}
/** Une caracteres literales consecutivos en un solo bloque «texto». */
function mergeLiterals(items) {
  const out = [];
  for (const it of items) {
    const last = out[out.length - 1];
    if (it.type === 'char') {
      if (last && last.type === 'literal' && last.e === it.s) { last.text += it.ch; last.parts.push(it); last.e = it.e; }
      else out.push({ type: 'literal', text: it.ch, parts: [it], s: it.s, e: it.e });
    } else out.push(it);
  }
  return out.map(x => x.type === 'literal' && x.parts.length === 1 ? x.parts[0] : x);
}
/** Recorre el árbol y genera las filas de la explicación (con su posición en el patrón). */
function rxRows(node, flags, depth = 0, rows = [], prefix = '') {
  const add = (n, text, cls, d = depth) => { rows.push({ s: n.s, e: n.e, text: prefix + text, cls, depth: d }); prefix = ''; };
  switch (node.type) {
    case 'seq': {
      const items = mergeLiterals(node.items);
      if (!items.length) add(node, 'nada (texto vacío)', 'l');
      items.forEach(it => rxRows(it, flags, depth, rows));
      break;
    }
    case 'alt':
      add(node, `Una de estas ${node.branches.length} opciones:`, 'o');
      node.branches.forEach((b, k) => {
        rows.push({ s: b.s, e: b.e, text: `Opción ${k + 1}${b.s === b.e ? ' (vacía: coincide con nada)' : ''}`, cls: 'o', depth: depth + 1, sub: true });
        rxRows(b, flags, depth + 2, rows);
      });
      break;
    case 'group':
      add(node, groupDesc(node), 'g');
      rxRows(node.body, flags, depth + 1, rows);
      break;
    case 'quant': {
      const a = node.atom;
      if (a.type === 'group' || a.type === 'alt') {
        add(node, `${groupDesc(a)} — y todo el grupo se repite ${quantDesc(node)}`, 'g');
        rxRows(a.body, flags, depth + 1, rows);
      } else add(node, `${atomDesc(a, flags)}, ${quantDesc(node)}`, 'q');
      break;
    }
    default: add(node, atomDesc(node, flags), { anchor: 'a', class: 'c', esc: 'e', dot: 'e', prop: 'e', backref: 'b' }[node.type] || 'l');
  }
  return rows;
}
/** Resumen corto de una línea. */
function rxShort(node, flags) {
  switch (node.type) {
    case 'seq': return mergeLiterals(node.items).filter(x => !(x.type === 'anchor' && (x.kind === 'start' || x.kind === 'end'))).map(x => rxShort(x, flags)).filter(Boolean).join(' + ') || '(vacío)';
    case 'alt': return node.branches.map(b => rxShort(b, flags)).join(' | ');
    case 'group': return node.kind.includes('ahead') || node.kind.includes('behind') ? `[${node.kind.startsWith('n') ? 'sin' : 'con'} ${rxShort(node.body, flags)} ${node.kind.includes('ahead') ? 'después' : 'antes'}]` : `(${rxShort(node.body, flags)})`;
    case 'quant': return rxShort(node.atom, flags) + quantShort(node);
    case 'literal': return `«${node.text}»`;
    case 'char': return node.label ? node.label.replace(/^(un|una|el) /, '') : `«${showCh(node.ch)}»`;
    case 'dot': return 'cualquier carácter';
    case 'esc': return ESC_SHORT[node.code];
    case 'prop': return (node.neg ? 'no ' : '') + (PROP_DESC[node.prop] || node.prop).replace(/^(un|una|cualquier) /, '');
    case 'class': return (node.neg ? 'no ' : '') + '[' + classItems(node).join(', ') + ']';
    case 'anchor': return node.kind === 'word' ? '‹límite›' : node.kind === 'nword' ? '‹no límite›' : '';
    case 'backref': return `lo mismo que el grupo ${node.ref}`;
  }
  return '';
}
/** Avisos y consejos sobre el patrón. */
function rxLint(src, parsed, flags) {
  const w = [];
  const all = [];
  (function walk(n, parentQuant) {
    if (!n) return;
    all.push({ n, parentQuant });
    if (n.type === 'seq') n.items.forEach(x => walk(x, parentQuant));
    else if (n.type === 'alt') n.branches.forEach(x => walk(x, parentQuant));
    else if (n.type === 'group') walk(n.body, parentQuant);
    else if (n.type === 'quant') walk(n.atom, n.max === Infinity ? n : parentQuant);
    else if (n.type === 'class') n.items.forEach(x => all.push({ n: x, inClass: true }));
  })(parsed.ast);
  const has = pred => all.some(x => pred(x.n, x));
  if (!has(n => n.type === 'anchor')) w.push(['info', 'Sin <code>^</code> ni <code>$</code>, el patrón busca <b>dentro</b> del texto. Para validar que un campo entero tenga este formato, rodéalo con <code>^</code> … <code>$</code>.']);
  const lits = [];
  (function walkSeq(n) {
    if (!n) return;
    if (n.type === 'seq') { const it = n.items; it.forEach((x, k) => { if (x.type === 'dot' && it[k - 1] && it[k + 1] && it[k - 1].type === 'char' && it[k + 1].type === 'char' && /\w/.test(it[k - 1].ch) && /\w/.test(it[k + 1].ch)) { let lo = k - 1, hi = k + 1; const wc = x => x && ((x.type === 'char' && /\w/.test(x.ch)) || x.type === 'dot'); while (wc(it[lo - 1])) lo--; while (wc(it[hi + 1])) hi++; lits.push(src.slice(it[lo].s, it[hi].e)); } }); it.forEach(walkSeq); }
    else if (n.type === 'alt') n.branches.forEach(walkSeq);
    else if (n.type === 'group') walkSeq(n.body);
    else if (n.type === 'quant') walkSeq(n.atom);
  })(parsed.ast);
  if (lits.length) w.push(['warn', `El punto en <code>${esc(lits[0])}</code> significa «cualquier carácter». Si quieres un punto literal (como en un dominio o un número), escríbelo como <code>\\.</code>`]);
  if (has((n, x) => n.type === 'quant' && n.max === Infinity && x.parentQuant)) w.push(['danger', 'Hay una repetición ilimitada dentro de otra (p. ej. <code>(a+)+</code>). Con algunos textos puede volverse extremadamente lenta (<i>backtracking catastrófico</i>). Intenta simplificarla.']);
  if (has(n => n.type === 'esc' && n.code === 'w') || has(n => n.type === 'range' && n.from === 'a' && n.to === 'z')) w.push(['info', '<code>\\w</code> y <code>[a-z]</code> no incluyen letras con tilde ni la ñ. Para textos en castellano usa <code>[a-záéíóúüñ]</code> o <code>\\p{L}</code> con el modificador <b>u</b>.']);
  if (has(n => n.type === 'prop') && !flags.includes('u')) w.push(['warn', 'Para usar <code>\\p{…}</code> tienes que activar el modificador <b>u</b>.']);
  if (has(n => n.type === 'range' && n.from === 'A' && n.to === 'z')) w.push(['warn', '<code>[A-z]</code> incluye también <code>[ \\ ] ^ _ `</code>. Seguramente querías <code>[A-Za-z]</code>.']);
  if (has(n => n.type === 'alt' && n.branches.some(b => b.s === b.e))) w.push(['warn', 'Una de las opciones del <code>|</code> está vacía, así que el patrón también coincide con «nada».']);
  const refs = all.filter(x => x.n.type === 'backref').map(x => x.n.ref);
  refs.forEach(r => { if ((typeof r === 'number' && r > parsed.groups) || (typeof r === 'string' && !parsed.names.includes(r))) w.push(['danger', `La referencia <code>\\${typeof r === 'number' ? r : `k<${esc(r)}>`}</code> apunta a un grupo que no existe.`]); });
  if (flags.includes('i') && has(n => n.type === 'class' && n.items.some(i => i.type === 'range' && i.from === 'a' && i.to === 'z') && n.items.some(i => i.type === 'range' && i.from === 'A' && i.to === 'Z'))) w.push(['info', 'Con el modificador <b>i</b> no hace falta poner <code>a-z</code> y <code>A-Z</code>: basta con uno.']);
  return w;
}

/* ---------- Vista del patrón coloreada + explicación ---------- */
function rxTokenClasses(src, ast) {
  const cls = Array(src.length).fill('t-l');
  const set = (s, e, c) => { for (let k = s; k < e && k < src.length; k++) cls[k] = c; };
  (function walk(n) {
    if (!n) return;
    switch (n.type) {
      case 'seq': n.items.forEach(walk); break;
      case 'alt': n.branches.forEach(walk); n.pipes.forEach(p => set(p, p + 1, 't-o')); break;
      case 'group': set(n.s, n.hs, 't-g'); set(n.e - 1, n.e, 't-g'); walk(n.body); break;
      case 'quant': walk(n.atom); set(n.qs, n.qe, 't-q'); break;
      case 'class': set(n.s, n.e, 't-c'); break;
      case 'esc': case 'dot': case 'prop': set(n.s, n.e, 't-e'); break;
      case 'anchor': set(n.s, n.e, 't-a'); break;
      case 'backref': set(n.s, n.e, 't-b'); break;
      case 'char': if (n.escaped || n.label) set(n.s, n.e, 't-x'); break;
    }
  })(ast);
  return cls;
}
let rxRowsCache = [];
function rxAnalyze() {
  const src = $('#rxPat').value, flags = rxFlagsStr();
  const view = $('#rxView');
  rxParsed = null; rxRowsCache = [];
  if (!src) {
    view.innerHTML = '<span class="muted">El patrón aparecerá aquí coloreado: <span class="t-g">grupos</span> · <span class="t-c">conjuntos</span> · <span class="t-e">clases</span> · <span class="t-q">cantidades</span> · <span class="t-a">anclas</span> · <span class="t-o">alternativas</span></span>';
    $('#rxSummary').innerHTML = '';
    $('#rxExplain').innerHTML = '<div class="empty small">Escribe un patrón, elige uno de la Biblioteca o constrúyelo con los bloques.</div>';
    $('#rxWarnings').innerHTML = '';
    return;
  }
  let err = null;
  try { rxParsed = rxParse(src); } catch (e) { err = e; }
  if (!err) { try { new RegExp(src, flags); } catch (e) { err = { message: e.message.replace(/^Invalid regular expression: /, ''), pos: null }; } }
  if (err) {
    const p = err.pos;
    view.innerHTML = src.split('').map((ch, k) => `<span class="${k === p ? 't-err' : 't-l'}">${esc(ch)}</span>`).join('') + (p === src.length ? '<span class="t-err">&nbsp;</span>' : '');
    $('#rxSummary').innerHTML = statusHtml(false, err.message);
    $('#rxExplain').innerHTML = `<div class="status-line" style="border-left:3px solid var(--danger)">⚠️ ${esc(err.message)}${p != null ? ` (posición ${p + 1}, marcada en rojo)` : ''}</div>`;
    $('#rxWarnings').innerHTML = '';
    return;
  }
  const rows = rxRows(rxParsed.ast, flags);
  rxRowsCache = rows;
  // carácter → fila más profunda que lo contiene (para el texto emergente)
  const deepest = Array(src.length).fill(-1);
  rows.forEach((r, k) => { for (let c = r.s; c < r.e; c++) deepest[c] = k; });
  const tcls = rxTokenClasses(src, rxParsed.ast);
  let html = '';
  for (let k = 0; k < src.length;) { const ch = String.fromCodePoint(src.codePointAt(k)); html += `<span class="${tcls[k]}" data-i="${k}" title="${esc(deepest[k] >= 0 ? rows[deepest[k]].text : '')}">${esc(ch)}</span>`; k += ch.length; }
  view.innerHTML = html;
  const isAnch = n => n.type === 'seq' && n.items[0]?.type === 'anchor' && n.items[0].kind === 'start' && n.items.at(-1)?.type === 'anchor' && n.items.at(-1).kind === 'end';
  const anchored = isAnch(rxParsed.ast) || (rxParsed.ast.type === 'alt' && rxParsed.ast.branches.every(isAnch));
  $('#rxSummary').innerHTML = `<b>${anchored ? (flags.includes('m') ? '✔ Valida cada línea completa:' : '✔ Valida el texto completo:') : '🔎 Busca dentro del texto:'}</b> <span class="muted">${esc(rxShort(rxParsed.ast, flags))}</span>${rxParsed.groups ? ` <span class="badge">${rxParsed.groups} grupo${rxParsed.groups === 1 ? '' : 's'}</span>` : ''}`;
  $('#rxExplain').innerHTML = rows.map((r, k) => `<div class="rx-row${r.sub ? ' sub' : ''}" data-row="${k}" data-s="${r.s}" data-e="${r.e}" style="--d:${r.depth}"><code class="${r.cls ? 't-' + r.cls : ''}">${esc(src.slice(r.s, r.e)) || '∅'}</code><span>${esc(r.text)}</span></div>`).join('')
    + (flags ? `<h4 class="section-h" style="margin-top:14px">Modificadores activos</h4>${flags.split('').map(f => `<div class="rx-row" style="--d:0"><code class="t-q">${f}</code><span>${esc(RX_FLAGS.find(x => x[0] === f)[1])}</span></div>`).join('')}` : '');
  const lint = rxLint(src, rxParsed, flags);
  $('#rxWarnings').innerHTML = lint.map(([lvl, msg]) => `<div class="rx-warn ${lvl}">${lvl === 'danger' ? '⛔' : lvl === 'warn' ? '⚠️' : '💡'} <span>${msg}</span></div>`).join('');
}
function rxHighlightRange(s, e) {
  $$('#rxView span[data-i]').forEach(sp => { const k = +sp.dataset.i; sp.classList.toggle('hl', k >= s && k < e); });
}
$('#rxExplain').addEventListener('mouseover', e => { const r = e.target.closest('.rx-row[data-s]'); if (r) rxHighlightRange(+r.dataset.s, +r.dataset.e); });
$('#rxExplain').addEventListener('mouseleave', () => rxHighlightRange(-1, -1));
$('#rxView').addEventListener('mouseover', e => {
  const sp = e.target.closest('span[data-i]'); if (!sp) return;
  const k = +sp.dataset.i;
  let best = -1; rxRowsCache.forEach((r, idx) => { if (k >= r.s && k < r.e) best = idx; });
  $$('#rxExplain .rx-row').forEach(r => r.classList.toggle('hl', +r.dataset.row === best));
  if (best >= 0) { const r = rxRowsCache[best]; rxHighlightRange(r.s, r.e); }
});
$('#rxView').addEventListener('mouseleave', () => { rxHighlightRange(-1, -1); $$('#rxExplain .rx-row.hl').forEach(r => r.classList.remove('hl')); });
$('#rxView').addEventListener('click', e => { const sp = e.target.closest('span[data-i]'); if (!sp) return; const k = +sp.dataset.i; const inp = $('#rxPat'); inp.focus(); inp.setSelectionRange(k, k + 1); rxSel = { s: k, e: k + 1 }; });

/* ---------- Probar ---------- */
function rxInit() {
  $('#rxFlags').innerHTML = RX_FLAGS.map(([f, t]) => `<span class="chip${rxOn.has(f) ? ' on' : ''}" data-f="${f}" title="${esc(t)}">${f}</span>`).join('');
}
let rxLastMatches = [];
function rxRun() {
  rxAnalyze();
  const pat = $('#rxPat').value, text = $('#rxText').value, flags = rxFlagsStr();
  $('#rxHighlight').innerHTML = ''; $('#rxMatches').innerHTML = ''; $('#rxReplOut').textContent = ''; $('#rxLines').innerHTML = '';
  rxLastMatches = [];
  const byLine = $('#rxByLine').checked;
  $('#rxLines').hidden = !byLine;
  if (!pat) { $('#rxStatus').textContent = ''; $('#rxHighlight').textContent = text; rxRenderCode(); return; }
  let re;
  try { re = new RegExp(pat, flags); } catch (err) { $('#rxStatus').innerHTML = statusHtml(false, err.message.replace(/^Invalid regular expression: /, '')); rxRenderCode(); return; }
  const matches = [];
  if (re.global) { let m; re.lastIndex = 0; while ((m = re.exec(text)) && matches.length < 1000) { matches.push(m); if (m[0] === '') re.lastIndex++; } }
  else { const m = re.exec(text); if (m) matches.push(m); }
  rxLastMatches = matches;
  $('#rxStatus').innerHTML = matches.length ? statusHtml(true, `${matches.length}${matches.length === 1000 ? '+' : ''} coincidencia${matches.length === 1 ? '' : 's'}`) : statusHtml(false, 'Sin coincidencias');
  let html = '', last = 0;
  matches.forEach(m => { if (m.index < last) return; html += esc(text.slice(last, m.index)) + `<mark class="rx">${esc(m[0]) || '∅'}</mark>`; last = m.index + m[0].length; });
  $('#rxHighlight').innerHTML = html + esc(text.slice(last));
  $('#rxMatches').innerHTML = matches.slice(0, 100).map((m, i) => `<div style="padding:4px 0;border-bottom:1px solid var(--border)"><b>#${i + 1}</b> <span class="mono">«${esc(m[0])}»</span> <span class="muted small">pos. ${m.index}</span>${m.length > 1 ? `<div class="small mono muted">${m.slice(1).map((g, k) => `$${k + 1}: ${g === undefined ? '—' : esc(g)}`).join(' · ')}</div>` : ''}${m.groups ? `<div class="small mono muted">${Object.entries(m.groups).map(([k, g]) => `${esc(k)}: ${esc(g ?? '—')}`).join(' · ')}</div>` : ''}</div>`).join('') || '<span class="muted small">—</span>';
  const repl = $('#rxRepl').value;
  if (repl) { try { $('#rxReplOut').textContent = text.replace(new RegExp(pat, flags), repl); } catch {} }
  if (byLine) {
    const reL = new RegExp(pat, flags.replace(/[gm]/g, ''));
    const lines = text.split('\n').filter((l, k, arr) => l !== '' || k < arr.length - 1);
    const okN = lines.filter(l => reL.test(l)).length;
    $('#rxLines').innerHTML = `<div class="small muted" style="margin-bottom:4px">${okN} de ${lines.length} líneas cumplen el patrón (se evalúa cada línea por separado, sin <b>g</b> ni <b>m</b>)</div>` + lines.map(l => { const ok = reL.test(l); return `<div class="list-item" style="cursor:default;padding:4px 8px"><span class="${ok ? 'ok-text' : 'bad-text'}">${ok ? '✓' : '✗'}</span><span class="mono grow">${esc(l) || '<span class="muted">(vacía)</span>'}</span></div>`; }).join('');
  }
  rxRenderCode();
}
const rxRunSoon = debounce(rxRun, 150);
['rxPat', 'rxText', 'rxRepl'].forEach(id => $('#' + id).addEventListener('input', rxRunSoon));
$('#rxByLine').addEventListener('change', rxRun);
$('#rxFlags').addEventListener('click', e => { const c = e.target.closest('[data-f]'); if (!c) return; const f = c.dataset.f; rxOn.has(f) ? rxOn.delete(f) : rxOn.add(f); rxInit(); rxRun(); });
$('#rxCopyMatches').addEventListener('click', () => copyText(rxLastMatches.map(m => m[0]).join('\n'), `${rxLastMatches.length} coincidencias copiadas`));
$('#rxCopy').addEventListener('click', () => copyText($('#rxPat').value, 'Patrón copiado'));
$('#rxClear').addEventListener('click', () => rxSetPattern(''));
$('#rxUndo').addEventListener('click', () => {
  if (!rxHist.length) { toast('No hay nada que deshacer', 'info', 1500); return; }
  const v = rxHist.pop(); $('#rxPat').value = v; rxSel = { s: v.length, e: v.length }; rxRun();
});
function rxSetTab(t) {
  rxTab = t;
  $$('#rxTabs button').forEach(b => b.classList.toggle('on', b.dataset.rt === t));
  $$('.rx-pane').forEach(p => p.classList.toggle('active', p.dataset.rp === t));
  store.set('rxTab', t);
  if (t === 'library') renderRxLib();
  if (t === 'code') rxRenderCode();
  if (t === 'infer') rxInfer();
}
$('#rxTabs').addEventListener('click', e => { const b = e.target.closest('[data-rt]'); if (b) rxSetTab(b.dataset.rt); });
function rxSetPattern(v, flags) {
  const cur = $('#rxPat').value;
  if (cur !== v) { rxHist.push(cur); if (rxHist.length > 50) rxHist.shift(); }
  $('#rxPat').value = v;
  if (flags != null) { rxOn = new Set(flags.split('')); rxInit(); }
  rxSel = { s: v.length, e: v.length };
  rxRun();
}

/* ---------- Construir con bloques ---------- */
const RX_BLOCKS = [
  ['Caracteres', [['\\d', 'Dígito'], ['[A-Za-z]', 'Letra (sin tildes)'], ['[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]', 'Letra (con tildes y ñ)'], ['[A-Z]', 'Mayúscula'], ['[a-z]', 'Minúscula'], ['\\w', 'Letra, número o _'], ['\\s', 'Espacio en blanco'], [' ', 'Un espacio'], ['.', 'Cualquier carácter'], ['\\D', 'No dígito'], ['\\S', 'No espacio']]],
  ['Cantidad (de lo anterior)', [['?', 'Opcional'], ['+', 'Una o más'], ['*', 'Cero o más'], ['{2}', 'Exactamente 2'], ['{2,}', '2 o más'], ['?', 'Lo menos posible', 'lazy']]],
  ['Posición', [['^', 'Inicio'], ['$', 'Final'], ['\\b', 'Límite de palabra'], ['^…$', 'Todo el texto', 'anchor']]],
  ['Grupos y opciones', [['( )', 'Grupo', 'wrap', '(', ')'], ['(?: )', 'Grupo sin captura', 'wrap', '(?:', ')'], ['(?<n> )', 'Grupo con nombre', 'named'], ['|', 'O bien'], ['\\1', 'Repetir grupo 1']]],
  ['Comprobaciones (no consumen texto)', [['(?= )', 'Seguido de', 'wrap', '(?=', ')'], ['(?! )', 'No seguido de', 'wrap', '(?!', ')'], ['(?<= )', 'Precedido de', 'wrap', '(?<=', ')'], ['(?<! )', 'No precedido de', 'wrap', '(?<!', ')']]]
];
function renderRxBlocks() {
  $('#rxBlocks').innerHTML = RX_BLOCKS.map(([g, items], gi) => `<div class="rx-blk-group"><h5>${g}</h5><div class="rx-blks">${items.map(([code, label], ii) => `<button type="button" class="rx-blk" data-b="${gi}.${ii}" title="${esc(label)}: ${esc(code)}"><code>${esc(code === ' ' ? '␣' : code)}</code>${esc(label)}</button>`).join('')}</div></div>`).join('');
}
function rxInsert(text, wrap) {
  const inp = $('#rxPat'), v = inp.value;
  let s = Math.min(rxSel.s, v.length), e = Math.min(rxSel.e, v.length);
  if (s > e) [s, e] = [e, s];
  let nv, caret;
  if (wrap) { const inner = v.slice(s, e); nv = v.slice(0, s) + wrap[0] + inner + wrap[1] + v.slice(e); caret = inner ? s + wrap[0].length + inner.length + wrap[1].length : s + wrap[0].length; }
  else { nv = v.slice(0, s) + text + v.slice(e); caret = s + text.length; }
  rxHist.push(v); if (rxHist.length > 50) rxHist.shift();
  inp.value = nv; rxSel = { s: caret, e: caret };
  inp.focus(); inp.setSelectionRange(caret, caret);
  rxRun();
}
$('#rxBlocks').addEventListener('mousedown', e => { if (e.target.closest('.rx-blk')) e.preventDefault(); });
$('#rxBlocks').addEventListener('click', async e => {
  const b = e.target.closest('[data-b]'); if (!b) return;
  const [gi, ii] = b.dataset.b.split('.').map(Number);
  const [code, , kind, open, close] = RX_BLOCKS[gi][1][ii];
  if (kind === 'wrap') rxInsert(null, [open, close]);
  else if (kind === 'named') { const n = await askText('Grupo con nombre', 'Nombre del grupo (letras, números o _)', 'campo'); if (n && /^[\p{ID_Start}$_][\p{ID_Continue}$]*$/u.test(n)) rxInsert(null, [`(?<${n}>`, ')']); else if (n) toast('Nombre no válido', 'warning'); }
  else if (kind === 'anchor') { const v = $('#rxPat').value; rxSetPattern((v.startsWith('^') ? '' : '^') + v + (v.endsWith('$') && !v.endsWith('\\$') ? '' : '$')); }
  else if (kind === 'lazy') rxInsert('?');
  else rxInsert(code);
});
const rxTrackSel = () => { const inp = $('#rxPat'); rxSel = { s: inp.selectionStart ?? inp.value.length, e: inp.selectionEnd ?? inp.value.length }; };
['select', 'keyup', 'click', 'input', 'blur'].forEach(ev => $('#rxPat').addEventListener(ev, rxTrackSel));
// Repetición
function rxQText() {
  const mn = parseInt($('#rxQMin').value, 10), mxRaw = $('#rxQMax').value.trim(), mx = mxRaw === '' ? Infinity : parseInt(mxRaw, 10);
  if (isNaN(mn) || mn < 0 || (mx !== Infinity && (isNaN(mx) || mx < mn))) return null;
  return mn === 0 && mx === 1 ? '?' : mn === 0 && mx === Infinity ? '*' : mn === 1 && mx === Infinity ? '+' : mn === mx ? `{${mn}}` : mx === Infinity ? `{${mn},}` : `{${mn},${mx}}`;
}
function rxQPreview() { const q = rxQText(); $('#rxQPrev').innerHTML = q ? `Se insertará <code>${esc(q)}</code>: ${esc(quantDesc({ min: +$('#rxQMin').value, max: $('#rxQMax').value.trim() === '' ? Infinity : +$('#rxQMax').value, lazy: false }))}. Deja «máx.» vacío para «sin límite».` : '<span class="bad-text">El máximo debe ser mayor o igual que el mínimo</span>'; }
['rxQMin', 'rxQMax'].forEach(id => $('#' + id).addEventListener('input', rxQPreview));
$('#rxQIns').addEventListener('mousedown', e => e.preventDefault());
$('#rxQIns').addEventListener('click', () => { const q = rxQText(); if (q) rxInsert(q); });
// Texto literal
const rxEscape = s => s.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
$('#rxLit').addEventListener('input', () => { const v = $('#rxLit').value; $('#rxLitPrev').innerHTML = v ? `Se insertará <code>${esc(rxEscape(v))}</code>` : 'Escapa automáticamente los caracteres especiales.'; });
$('#rxLitIns').addEventListener('mousedown', e => e.preventDefault());
$('#rxLitIns').addEventListener('click', () => { const v = $('#rxLit').value; if (v) { rxInsert(rxEscape(v)); $('#rxLit').value = ''; $('#rxLit').dispatchEvent(new Event('input')); } });
// Conjunto a medida
const RX_SET_OPTS = [['a-z', 'a–z'], ['A-Z', 'A–Z'], ['0-9', '0–9'], ['áéíóúüñÁÉÍÓÚÜÑ', 'tildes y ñ'], [' ', 'espacio'], ['_', '_'], ['\\-', 'guion -'], ['.', 'punto .'], [',', 'coma ,']];
const rxSetOn = new Set(['a-z', 'A-Z']);
function rxSetText() {
  const extra = $('#rxSetExtra').value.replace(/[\]\\^-]/g, '\\$&');
  const body = RX_SET_OPTS.filter(o => rxSetOn.has(o[0])).map(o => o[0]).join('') + extra;
  return body ? `[${$('#rxSetNeg').checked ? '^' : ''}${body}]` : '';
}
function renderRxSet() {
  $('#rxSetOpts').innerHTML = RX_SET_OPTS.map(([v, l]) => `<span class="chip${rxSetOn.has(v) ? ' on' : ''}" data-set="${esc(v)}">${esc(l)}</span>`).join('');
  const t = rxSetText();
  $('#rxSetPrev').textContent = t || '(elige algo)';
  $('#rxSetPrev').title = t ? (() => { try { const p = rxParse(t); return atomDesc(p.ast.items[0], ''); } catch { return ''; } })() : '';
}
$('#rxSetOpts').addEventListener('click', e => { const c = e.target.closest('[data-set]'); if (!c) return; const v = c.dataset.set; rxSetOn.has(v) ? rxSetOn.delete(v) : rxSetOn.add(v); renderRxSet(); });
['rxSetExtra', 'rxSetNeg'].forEach(id => $('#' + id).addEventListener(id === 'rxSetNeg' ? 'change' : 'input', renderRxSet));
$('#rxSetIns').addEventListener('mousedown', e => e.preventDefault());
$('#rxSetIns').addEventListener('click', () => { const t = rxSetText(); if (t) rxInsert(t); });

/* ---------- Generar desde ejemplos ---------- */
let rxInfMode = 'exact', rxInfResult = '';
function charKind(ch) {
  if (/\d/.test(ch)) return 'd';
  if (/[A-ZÁÉÍÓÚÜÑ]/.test(ch)) return 'U';
  if (/[a-záéíóúüñ]/.test(ch)) return 'l';
  if (/\p{L}/u.test(ch)) return 'L';
  if (ch === ' ') return ' ';
  if (/\s/.test(ch)) return 's';
  return 'p:' + ch;
}
function runsOf(str, level) {
  const out = [];
  for (const ch of str) {
    let k = charKind(ch);
    if (level >= 1 && (k === 'U' || k === 'l')) k = 'L';
    if (level >= 2 && (k === 'L' || k === 'd')) k = 'A';
    const last = out[out.length - 1];
    if (last && last.k === k && !k.startsWith('p:')) last.t.push(ch); else out.push({ k, t: [ch] });
  }
  return out;
}
const ACC = /[ÁÉÍÓÚÜÑáéíóúüñ]/;
function classFor(k, texts) {
  const acc = texts.some(t => ACC.test(t));
  switch (k) {
    case 'd': return '\\d';
    case 'U': return acc ? '[A-ZÁÉÍÓÚÜÑ]' : '[A-Z]';
    case 'l': return acc ? '[a-záéíóúüñ]' : '[a-z]';
    case 'L': return acc ? '[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]' : '[A-Za-z]';
    case 'A': return acc ? '[A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ]' : '[A-Za-z0-9]';
    case ' ': return ' ';
    case 's': return '\\s';
  }
  return rxEscape(k.slice(2));
}
function inferPattern(examples, mode) {
  for (let level = 0; level <= 2; level++) {
    const sigs = examples.map(e => runsOf(e, level));
    const len = sigs[0].length;
    if (!sigs.every(s => s.length === len && s.every((r, k) => r.k === sigs[0][k].k))) continue;
    let out = '';
    for (let p = 0; p < len; p++) {
      const k = sigs[0][p].k, texts = sigs.map(s => s[p].t.join('')), lens = sigs.map(s => s[p].t.length);
      const same = texts.every(t => t === texts[0]);
      if (k.startsWith('p:')) { out += rxEscape(texts[0]); continue; }
      if (mode === 'exact' && same && /^[UlL]$/.test(k)) { out += rxEscape(texts[0]); continue; }
      const mn = Math.min(...lens), mx = Math.max(...lens);
      const c = classFor(k, texts);
      if (mode === 'exact') out += c + (mn === mx ? (mn === 1 ? '' : `{${mn}}`) : `{${mn},${mx}}`);
      else out += c + (mx === 1 && mn === 1 ? '' : '+');
    }
    return { pattern: out, level, generic: false };
  }
  return { pattern: `(?:${[...new Set(examples)].map(rxEscape).join('|')})`, level: 3, generic: true };
}
function rxInfer() {
  const pos = $('#rxInfPos').value.split('\n').map(s => s.trim()).filter(Boolean);
  const neg = $('#rxInfNeg').value.split('\n').map(s => s.trim()).filter(Boolean);
  const box = $('#rxInfOut');
  rxInfResult = '';
  if (!pos.length) { box.innerHTML = '<span class="muted">Escribe al menos un ejemplo en la columna «Deben coincidir».</span>'; return; }
  const r = inferPattern(pos, rxInfMode);
  const pat = $('#rxInfAnchor').checked ? `^${r.pattern}$` : r.pattern;
  rxInfResult = pat;
  let re; try { re = new RegExp(pat); } catch { box.innerHTML = statusHtml(false, 'No se pudo generar un patrón válido'); return; }
  const posRes = pos.map(p => [p, re.test(p)]), negRes = neg.map(n => [n, re.test(n)]);
  const badNeg = negRes.filter(x => x[1]).length;
  let short = ''; try { short = rxShort(rxParse(pat).ast, ''); } catch {}
  box.innerHTML = `<div class="muted small">Patrón propuesto ${r.generic ? '(los ejemplos tienen estructuras distintas: es una lista literal)' : r.level ? `(nivel de generalización ${r.level}: ${r.level === 1 ? 'mayúsculas y minúsculas unificadas' : 'letras y números unificados'})` : ''}</div>
    <div class="row" style="margin:6px 0;flex-wrap:nowrap"><code class="mono rx-big">${esc(pat)}</code></div>
    <div class="small" style="margin-bottom:8px"><span class="muted">Se lee:</span> ${esc(short)}</div>
    <div class="row"><button class="btn primary sm" id="rxInfUse">⤴ Usar este patrón</button><button class="btn sm" id="rxInfCopy">📋 Copiar</button></div>
    <div class="two-col" style="margin-top:12px">
      <div><h4 class="section-h">Deben coincidir</h4>${posRes.map(([t, ok]) => `<div class="small mono"><span class="${ok ? 'ok-text' : 'bad-text'}">${ok ? '✓' : '✗'}</span> ${esc(t)}</div>`).join('')}</div>
      <div><h4 class="section-h">No deben coincidir</h4>${negRes.length ? negRes.map(([t, m]) => `<div class="small mono"><span class="${m ? 'bad-text' : 'ok-text'}">${m ? '✗ coincide' : '✓'}</span> ${esc(t)}</div>`).join('') : '<span class="muted small">—</span>'}</div>
    </div>
    ${badNeg ? `<div class="rx-warn warn" style="margin-top:10px">⚠️ <span>${badNeg} contraejemplo${badNeg === 1 ? '' : 's'} también coincide${badNeg === 1 ? '' : 'n'}. Prueba el modo «Precisa», añade más ejemplos o ajústalo a mano con los bloques.</span></div>` : ''}
    ${r.generic ? '<div class="rx-warn info" style="margin-top:10px">💡 <span>Para obtener un patrón general, usa ejemplos con la misma forma (por ejemplo, todos DNI o todos fechas).</span></div>' : ''}`;
  $('#rxInfUse').onclick = () => {
    rxSetPattern(rxInfResult, $('#rxInfAnchor').checked ? 'gm' : 'g');
    $('#rxText').value = pos.concat(neg).join('\n');
    $('#rxByLine').checked = $('#rxInfAnchor').checked;
    rxSetTab('test'); rxRun();
  };
  $('#rxInfCopy').onclick = () => copyText(rxInfResult, 'Patrón copiado');
}
const rxInferSoon = debounce(rxInfer, 250);
['rxInfPos', 'rxInfNeg'].forEach(id => $('#' + id).addEventListener('input', rxInferSoon));
$('#rxInfAnchor').addEventListener('change', rxInfer);
$('#rxInfMode').addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (!b) return; rxInfMode = b.dataset.m; $$('#rxInfMode button').forEach(x => x.classList.toggle('on', x === b)); rxInfer(); });

/* ---------- Biblioteca de patrones ---------- */
const RX_LIB = [
  { cat: 'Documentos', name: 'DNI / NIF (formato)', pat: String.raw`^\d{8}[A-HJ-NP-TV-Z]$`, flags: 'gm', desc: '8 dígitos y una letra (sin I, Ñ, O ni U). Solo comprueba el formato; la letra correcta se valida en «NIF · CIF · IBAN».', sample: '12345678Z\n1234567Z\n12345678I\n87654321X' },
  { cat: 'Documentos', name: 'NIE', pat: String.raw`^[XYZ]\d{7}[A-HJ-NP-TV-Z]$`, flags: 'gm', desc: 'X, Y o Z, 7 dígitos y una letra.', sample: 'X1234567L\nY7654321G\nA1234567L\nX123456L' },
  { cat: 'Documentos', name: 'CIF / NIF de entidad', pat: String.raw`^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$`, flags: 'gm', desc: 'Letra de tipo de entidad, 7 dígitos y un dígito o letra de control.', sample: 'B12345674\nQ2826000H\nI1234567A\nB1234567' },
  { cat: 'Documentos', name: 'Referencia catastral (urbana)', pat: String.raw`^\d{7}[A-Z]{2}\d{4}[A-Z]\d{4}[A-Z]{2}$`, flags: 'gm', desc: '20 caracteres con el formato de los inmuebles urbanos.', sample: '9872023VH5797S0001WX\n9872023VH5797S0001W' },
  { cat: 'Contacto', name: 'Correo electrónico', pat: String.raw`^[\w.+-]+@[\w-]+(\.[\w-]+)*\.[A-Za-z]{2,}$`, flags: 'gm', desc: 'Usuario, @, dominio y extensión de al menos 2 letras. Suficiente para formularios (la validación perfecta de correos es imposible con una regex).', sample: 'ana.perez@ejemplo.es\nsoporte+web@ayto-ejemplo.org\njuan@\n@ejemplo.com\nmaria@ejemplo' },
  { cat: 'Contacto', name: 'Teléfono español', pat: String.raw`^(\+34|0034)?\s?[6789]\d{2}\s?\d{3}\s?\d{3}$`, flags: 'gm', desc: 'Fijo o móvil de 9 cifras (empieza por 6, 7, 8 o 9), con prefijo +34 o 0034 opcional y espacios opcionales.', sample: '+34 612 345 678\n912345678\n0034 712345678\n512345678\n61234567' },
  { cat: 'Contacto', name: 'Código postal', pat: String.raw`^(0[1-9]|[1-4]\d|5[0-2])\d{3}$`, flags: 'gm', desc: '5 cifras con provincia válida (01 a 52).', sample: '28931\n08001\n53000\n00123\n2893' },
  { cat: 'Fechas y horas', name: 'Fecha dd/mm/aaaa', pat: String.raw`^(0[1-9]|[12]\d|3[01])/(0[1-9]|1[0-2])/(\d{4})$`, flags: 'gm', repl: '$3-$2-$1', desc: 'Día 01–31, mes 01–12 y año de 4 cifras. No detecta fechas imposibles como 31/02. Con el reemplazo la convierte a aaaa-mm-dd.', sample: '13/10/2026\n31/12/2025\n32/01/2026\n1/2/2026' },
  { cat: 'Fechas y horas', name: 'Fecha ISO aaaa-mm-dd', pat: String.raw`^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$`, flags: 'gm', desc: 'El formato de fechas de bases de datos y APIs.', sample: '2026-10-13\n2026-13-01\n26-10-13' },
  { cat: 'Fechas y horas', name: 'Hora hh:mm (24 h)', pat: String.raw`^([01]\d|2[0-3]):[0-5]\d$`, flags: 'gm', desc: 'De 00:00 a 23:59, siempre con dos cifras.', sample: '09:30\n23:59\n24:00\n9:30' },
  { cat: 'Web y sistemas', name: 'URL http(s)', pat: String.raw`^https?://[\w-]+(\.[\w-]+)*(:\d+)?(/\S*)?$`, flags: 'gmi', desc: 'Dirección web con http o https, servidor o dominio, puerto opcional y ruta.', sample: 'https://www.boe.es/buscar\nhttp://localhost:8080/app\nhttps://sede.ejemplo.gob.es:8443/tramite?id=7\nftp://ejemplo.es\nwww.ejemplo.es' },
  { cat: 'Web y sistemas', name: 'Dirección IPv4', pat: String.raw`^((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$`, flags: 'gm', desc: 'Cuatro números de 0 a 255 separados por puntos.', sample: '192.168.1.10\n8.8.8.8\n10.0.0.256\n01.2.3.4' },
  { cat: 'Web y sistemas', name: 'Color hexadecimal', pat: String.raw`^#([0-9a-fA-F]{3}){1,2}$`, flags: 'gm', desc: 'Colores CSS como #fff o #8b7cf6.', sample: '#fff\n#8b7cf6\n#12345\nfff' },
  { cat: 'Web y sistemas', name: 'Quitar etiquetas HTML', pat: String.raw`<\/?[a-zA-Z][^>]*>`, flags: 'g', repl: '', desc: 'Encuentra etiquetas HTML; con el reemplazo vacío las elimina y deja solo el texto.', sample: '<p>Hola <b>mundo</b>, esto es <a href="#">un enlace</a>.</p>' },
  { cat: 'Web y sistemas', name: 'Contraseña robusta', pat: String.raw`^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{12,}$`, flags: 'gm', desc: 'Al menos 12 caracteres con minúscula, mayúscula, número y símbolo. Buen ejemplo de comprobaciones «(?=…)».', sample: 'Hola123!Mundo$\nhola123mundo!\nCorta1!' },
  { cat: 'Textos', name: 'Importe en euros', pat: String.raw`\b\d{1,3}(\.\d{3})*(,\d{1,2})?\s?€`, flags: 'g', desc: 'Importes con puntos de miles y coma decimal, seguidos de €.', sample: 'Total: 1.250,50 € y una tasa de 30 €; otro importe: 12,5€ y 7 euros.' },
  { cat: 'Textos', name: 'Nº de expediente aaaa/nnnn', pat: String.raw`\b(20\d{2})/(\d{1,6})\b`, flags: 'g', repl: '$1-$2', desc: 'Año (20xx), barra y número. Los grupos permiten reordenarlo o cambiar el separador.', sample: 'Expedientes 2026/0042 y 2025/1234; referencia antigua 99/1.' },
  { cat: 'Textos', name: 'Matrícula de coche', pat: String.raw`^\d{4}\s?[BCDFGHJKLMNPRSTVWXYZ]{3}$`, flags: 'gm', desc: 'Formato actual: 4 cifras y 3 consonantes (sin vocales, Ñ ni Q).', sample: '1234 BCD\n1234BCD\n1234 ABC\n123 BCD' },
  { cat: 'Textos', name: 'Palabra repetida', pat: String.raw`\b(\p{L}+)\s+\1\b`, flags: 'giu', repl: '$1', desc: 'Detecta errores como «de de»; usa una referencia «\\1» al grupo 1. Con el reemplazo se corrige.', sample: 'Esto es es un error de de escritura en el el documento.' },
  { cat: 'Textos', name: 'Espacios repetidos', pat: ' {2,}', flags: 'g', repl: ' ', desc: 'Dos o más espacios seguidos; el reemplazo los deja en uno.', sample: 'Texto  con   espacios    de más.' },
  { cat: 'Textos', name: 'Líneas vacías', pat: String.raw`^[ \t]*$`, flags: 'gm', desc: 'Líneas vacías o que solo tienen espacios.', sample: 'línea 1\n\nlínea 3\n   \nlínea 5' }
];
function renderRxLib() {
  const q = norm($('#rxLibSearch').value.trim());
  const list = RX_LIB.map((x, i) => ({ ...x, i })).filter(x => !q || norm(`${x.name} ${x.desc} ${x.cat}`).includes(q));
  const cats = [...new Set(list.map(x => x.cat))];
  $('#rxLib').innerHTML = cats.map(c => `<h4 class="section-h">${esc(c)}</h4><div class="rx-lib-grid">${list.filter(x => x.cat === c).map(x => `<div class="rx-lib-card"><div class="row" style="justify-content:space-between;flex-wrap:nowrap"><b>${esc(x.name)}</b><span class="badge">${esc(x.flags)}</span></div><code class="mono">${esc(x.pat)}</code><div class="small muted">${esc(x.desc)}</div><div class="row"><button class="btn sm primary" data-lib="${x.i}" data-go="test">Probar</button><button class="btn sm" data-lib="${x.i}" data-go="explain">Explicar</button><button class="btn sm ghost" data-lib="${x.i}" data-go="copy">📋</button></div></div>`).join('')}</div>`).join('') || '<div class="empty">Sin resultados</div>';
}
$('#rxLibSearch').addEventListener('input', debounce(renderRxLib, 120));
$('#rxLib').addEventListener('click', e => {
  const b = e.target.closest('[data-lib]'); if (!b) return;
  const x = RX_LIB[+b.dataset.lib];
  if (b.dataset.go === 'copy') { copyText(x.pat, 'Patrón copiado'); return; }
  rxSetPattern(x.pat, x.flags);
  $('#rxText').value = x.sample;
  $('#rxRepl').value = x.repl || '';
  $('#rxByLine').checked = x.flags.includes('m') && x.pat.startsWith('^');
  rxSetTab(b.dataset.go);
  rxRun();
});

/* ---------- Código para distintos lenguajes ---------- */
let rxCodeMode = 'test';
function jsLiteralBody(src) { let out = '', inCls = false; for (let k = 0; k < src.length; k++) { const c = src[k]; if (c === '\\') { out += c + (src[k + 1] ?? ''); k++; continue; } if (c === '[') inCls = true; else if (c === ']') inCls = false; out += (c === '/' && !inCls) ? '\\/' : c; } return out; }
const javaStr = s => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
function pyStr(s) { if (!s.includes("'") && !/\\$/.test(s)) return `r'${s}'`; if (!s.includes('"') && !/\\$/.test(s)) return `r"${s}"`; return "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"; }
const sqlStr = s => "'" + s.replace(/'/g, "''") + "'";
const phpStr = s => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
function rxCodeWarnings(src) {
  const notes = [];
  if (/\(\?<[=!]/.test(src)) notes.push('Oracle no admite comprobaciones hacia atrás <code>(?&lt;= )</code>.');
  if (/\(\?[=!]/.test(src)) notes.push('Oracle no admite comprobaciones <code>(?= )</code> ni <code>(?! )</code>.');
  if (/\(\?<[^=!]/.test(src)) notes.push('Ni Oracle ni PostgreSQL admiten grupos con nombre: usa grupos normales.');
  if (/\\b/.test(src)) notes.push('En PostgreSQL el límite de palabra es <code>\\y</code> (ya está convertido); Oracle no tiene equivalente.');
  if (/\\p\{/.test(src)) notes.push('<code>\\p{…}</code> no existe en Oracle ni en PostgreSQL; en Java y C# funciona, en Python necesitas el módulo <code>regex</code>.');
  return notes;
}
function rxRenderCode() {
  if (!$('#rxCode') || rxTab !== 'code') return;
  const src = $('#rxPat').value;
  if (!src) { $('#rxCode').innerHTML = '<div class="empty small">Escribe primero un patrón.</div>'; return; }
  try { new RegExp(src, rxFlagsStr()); } catch { $('#rxCode').innerHTML = '<div class="empty small">El patrón tiene errores: corrígelo para generar el código.</div>'; return; }
  const f = rxFlagsStr(), i = f.includes('i'), m = f.includes('m'), s = f.includes('s');
  const repl = $('#rxRepl').value;
  const mode = rxCodeMode;
  const jsFlags = mode === 'test' ? f.replace('g', '') : (f.includes('g') ? f : f + 'g');
  const jsRe = `/${jsLiteralBody(src)}/${jsFlags}`;
  const pySrc = src.replace(/\(\?<([^=!>][^>]*)>/g, '(?P<$1>').replace(/\\k<([^>]+)>/g, '(?P=$1)');
  const pyFlags = [i && 're.IGNORECASE', m && 're.MULTILINE', s && 're.DOTALL'].filter(Boolean).join(' | ');
  const pyRepl = repl.replace(/\$<([^>]+)>/g, '\\g<$1>').replace(/\$&/g, '\\g<0>').replace(/\$(\d+)/g, '\\g<$1>');
  const jFlags = [i && 'Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE', m && 'Pattern.MULTILINE', s && 'Pattern.DOTALL', /\\p\{/.test(src) && 'Pattern.UNICODE_CHARACTER_CLASS'].filter(Boolean).join(' | ');
  const jRepl = repl.replace(/\$<([^>]+)>/g, '${$1}');
  const csOpts = [i && 'RegexOptions.IgnoreCase', m && 'RegexOptions.Multiline', s && 'RegexOptions.Singleline'].filter(Boolean).join(' | ');
  const csStr = '@"' + src.replace(/"/g, '""') + '"';
  const phpRe = "'/" + jsLiteralBody(src).replace(/'/g, "\\'") + '/' + f.replace(/[gu]/g, '') + "u'";
  const pgSrc = (() => { if (!rxParsed) return src; let out = src; const pos = []; (function w(n) { if (!n) return; if (n.type === 'anchor' && n.kind === 'word') pos.push(n.s); ['items', 'branches'].forEach(k => n[k] && n[k].forEach(w)); if (n.body) w(n.body); if (n.atom) w(n.atom); })(rxParsed.ast); pos.sort((a, b) => b - a).forEach(p => { out = out.slice(0, p) + '\\y' + out.slice(p + 2); }); return out; })();
  const pgOp = i ? '~*' : '~';
  const sqlRepl = repl.replace(/\$(\d)/g, '\\$1');
  const C = {
    test: {
      'JavaScript': `const re = ${jsRe};\nconst ok = re.test(texto);`,
      'Java': `import java.util.regex.*;\n\nPattern p = Pattern.compile(${javaStr(src)}${jFlags ? ', ' + jFlags : ''});\nboolean ok = p.matcher(texto).find();   // .matches() exige el texto completo`,
      'Python': `import re\n\npatron = re.compile(${pyStr(pySrc)}${pyFlags ? ', ' + pyFlags : ''})\nok = patron.search(texto) is not None   # fullmatch() exige el texto completo`,
      'C#': `using System.Text.RegularExpressions;\n\nvar re = new Regex(${csStr}${csOpts ? ', ' + csOpts : ''});\nbool ok = re.IsMatch(texto);`,
      'PHP': `$ok = preg_match(${phpRe}, $texto) === 1;`,
      'SQL · PostgreSQL': `SELECT * FROM tabla\nWHERE columna ${pgOp} ${sqlStr(pgSrc)};`,
      'SQL · Oracle': `SELECT * FROM tabla\nWHERE REGEXP_LIKE(columna, ${sqlStr(src)}${i ? ", 'i'" : ''});`
    },
    find: {
      'JavaScript': `const re = ${jsRe};\nfor (const m of texto.matchAll(re)) {\n  console.log(m[0], m.index${rxParsed && rxParsed.groups ? ', m[1]' : ''});\n}`,
      'Java': `import java.util.regex.*;\n\nPattern p = Pattern.compile(${javaStr(src)}${jFlags ? ', ' + jFlags : ''});\nMatcher m = p.matcher(texto);\nwhile (m.find()) {\n  System.out.println(m.group()${rxParsed && rxParsed.groups ? ' + " → " + m.group(1)' : ''});\n}`,
      'Python': `import re\n\nfor m in re.finditer(${pyStr(pySrc)}, texto${pyFlags ? ', ' + pyFlags : ''}):\n    print(m.group(0)${rxParsed && rxParsed.groups ? ', m.group(1)' : ''})`,
      'C#': `using System.Text.RegularExpressions;\n\nforeach (Match m in Regex.Matches(texto, ${csStr}${csOpts ? ', ' + csOpts : ''}))\n{\n    Console.WriteLine(m.Value${rxParsed && rxParsed.groups ? ' + " → " + m.Groups[1].Value' : ''});\n}`,
      'PHP': `preg_match_all(${phpRe}, $texto, $m);\nprint_r($m[0]);`,
      'SQL · PostgreSQL': `SELECT m[1] FROM tabla,\n  regexp_matches(columna, ${sqlStr(pgSrc)}, 'g${i ? 'i' : ''}') AS m;`,
      'SQL · Oracle': `SELECT REGEXP_SUBSTR(columna, ${sqlStr(src)}, 1, LEVEL${i ? ", 'i'" : ''}) AS coincidencia\nFROM tabla\nCONNECT BY REGEXP_SUBSTR(columna, ${sqlStr(src)}, 1, LEVEL${i ? ", 'i'" : ''}) IS NOT NULL;`
    },
    replace: {
      'JavaScript': `const resultado = texto.replace(${jsRe}, ${JSON.stringify(repl)});`,
      'Java': `String resultado = Pattern.compile(${javaStr(src)}${jFlags ? ', ' + jFlags : ''})\n    .matcher(texto).replaceAll(${javaStr(jRepl)});`,
      'Python': `import re\n\nresultado = re.sub(${pyStr(pySrc)}, ${pyStr(pyRepl)}, texto${pyFlags ? ', flags=' + pyFlags : ''})`,
      'C#': `string resultado = Regex.Replace(texto, ${csStr}, ${JSON.stringify(jRepl)}${csOpts ? ', ' + csOpts : ''});`,
      'PHP': `$resultado = preg_replace(${phpRe}, ${phpStr(jRepl)}, $texto);`,
      'SQL · PostgreSQL': `SELECT regexp_replace(columna, ${sqlStr(pgSrc)}, ${sqlStr(sqlRepl)}, 'g${i ? 'i' : ''}')\nFROM tabla;`,
      'SQL · Oracle': `SELECT REGEXP_REPLACE(columna, ${sqlStr(src)}, ${sqlStr(sqlRepl)}${i ? ", 1, 0, 'i'" : ''})\nFROM tabla;`
    }
  }[mode];
  const notes = rxCodeWarnings(src);
  $('#rxCode').innerHTML = (mode === 'replace' && !repl ? '<div class="rx-warn info" style="margin-bottom:10px">💡 <span>Escribe el texto de reemplazo en la pestaña «Probar» (campo «Reemplazar»).</span></div>' : '')
    + `<div class="rx-code-grid">${Object.entries(C).map(([lang, code]) => `<div class="rx-code-card"><div class="row" style="justify-content:space-between"><b class="small">${esc(lang)}</b><button class="btn icon sm ghost" data-codecopy title="Copiar">📋</button></div><pre class="out-box">${esc(code)}</pre></div>`).join('')}</div>`
    + (notes.length ? `<div style="margin-top:10px">${notes.map(n => `<div class="rx-warn info">💡 <span>${n}</span></div>`).join('')}</div>` : '')
    + (pySrc !== src ? '<div class="rx-warn info">💡 <span>En Python los grupos con nombre se escriben <code>(?P&lt;nombre&gt;…)</code>: ya está convertido.</span></div>' : '');
}
$('#rxCode').addEventListener('click', e => { const b = e.target.closest('[data-codecopy]'); if (b) copyText(b.closest('.rx-code-card').querySelector('pre').textContent, 'Código copiado'); });
$('#rxCodeMode').addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (!b) return; rxCodeMode = b.dataset.m; $$('#rxCodeMode button').forEach(x => x.classList.toggle('on', x === b)); rxRenderCode(); });

function initRegex() {
  renderRxBlocks(); renderRxSet(); rxQPreview(); rxInit();
  const t = store.get('rxTab', 'test');
  rxSetTab(['test', 'explain', 'build', 'infer', 'library', 'code'].includes(t) ? t : 'test');
  rxAnalyze();
}
