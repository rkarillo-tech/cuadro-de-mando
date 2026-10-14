let calcExpr = '', calcJust = false;
let lastAns = '';
function initCalc() { lastAns = S.calcHist.length ? S.calcHist[S.calcHist.length - 1].result : ''; }
const CALC_KEYS = [['AC', 'clear', 'fn'], ['⌫', 'back', 'fn'], ['(', '(', 'fn'], [')', ')', 'fn'],
  ['7', '7'], ['8', '8'], ['9', '9'], ['÷', '/', 'op'],
  ['4', '4'], ['5', '5'], ['6', '6'], ['×', '*', 'op'],
  ['1', '1'], ['2', '2'], ['3', '3'], ['−', '-', 'op'],
  ['0', '0'], ['.', '.'], ['%', '%', 'op'], ['+', '+', 'op'],
  ['±', 'neg', 'fn'], ['Ans', 'ans', 'fn'], ['=', '=', 'eq']];

function calcEval(src) {
  const s = src; let i = 0, lastPct = false;
  const peek = () => s[i];
  function number() {
    const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i));
    if (!m) throw new Error('syntax');
    i += m[0].length; return parseFloat(m[0]);
  }
  function factor() {
    if (peek() === '-') { i++; return -factor(); }
    if (peek() === '+') { i++; return factor(); }
    let v;
    if (peek() === '(') { i++; v = expr(); if (peek() !== ')') throw new Error('syntax'); i++; }
    else v = number();
    lastPct = false;
    while (peek() === '%') { i++; v /= 100; lastPct = true; }
    return v;
  }
  function term() {
    let v = factor(), pct = lastPct;
    while (peek() === '*' || peek() === '/') {
      const op = s[i++]; const r = factor();
      if (op === '/') { if (r === 0) throw new Error('div0'); v /= r; } else v *= r;
      pct = false;
    }
    return { v, pct };
  }
  function expr() {
    let v = term().v;
    while (peek() === '+' || peek() === '-') {
      const op = s[i++]; const t = term();
      const r = t.pct ? v * t.v : t.v; // 200 + 10% = 220
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  if (!s) throw new Error('empty');
  const v = expr();
  if (i !== s.length) throw new Error('syntax');
  if (!Number.isFinite(v)) throw new Error('inf');
  return v;
}
const fmtNum = v => { const s = String(parseFloat(v.toPrecision(12))); return s === '-0' ? '0' : s; };
const prettyExpr = s => s.replace(/\*/g, ' × ').replace(/\//g, ' ÷ ').replace(/(?<=[\d)%])-/g, ' − ').replace(/(?<!e)\+/gi, ' + ');
const isOp = c => !!c && '+-*/'.includes(c);
const openParens = e => (e.match(/\(/g) || []).length - (e.match(/\)/g) || []).length;
function closeExpr(e) { e = e.replace(/[+\-*/(]+$/, ''); return e + ')'.repeat(Math.max(0, openParens(e))); }

function appendToken(k) {
  const last = calcExpr.slice(-1);
  if (/^[0-9.]$/.test(k)) {
    if (calcJust) calcExpr = '';
    calcJust = false;
    const num = (calcExpr.match(/[\d.]*$/) || [''])[0];
    if (k === '.') { if (num.includes('.')) return; if (!num) k = '0.'; }
    if (/[)%]$/.test(calcExpr)) calcExpr += '*';
    else if (num === '0' && /^\d$/.test(k)) calcExpr = calcExpr.slice(0, -1);
    calcExpr += k;
  } else if (isOp(k)) {
    calcJust = false;
    if (!calcExpr) { if (k === '-') calcExpr = '-'; return; }
    if (last === '(') { if (k === '-') calcExpr += k; return; }
    if (isOp(last)) {
      if (k === '-' && (last === '*' || last === '/')) { calcExpr += k; return; }
      calcExpr = calcExpr.slice(0, -1);
      if (isOp(calcExpr.slice(-1))) calcExpr = calcExpr.slice(0, -1);
      if (calcExpr) calcExpr += k;
      return;
    }
    calcExpr += k;
  } else if (k === '%') { calcJust = false; if (/[\d)]$/.test(calcExpr)) calcExpr += '%'; }
  else if (k === '(') { if (calcJust) calcExpr = ''; calcJust = false; if (/[\d.)%]$/.test(calcExpr)) calcExpr += '*'; calcExpr += '('; }
  else if (k === ')') { calcJust = false; if (openParens(calcExpr) > 0 && /[\d.)%]$/.test(calcExpr)) calcExpr += ')'; }
}
function toggleNeg() {
  calcJust = false;
  const m = /(\d*\.?\d+(?:e[+-]?\d+)?|\d+\.)$/i.exec(calcExpr);
  if (!m) { if (!calcExpr || isOp(calcExpr.slice(-1)) || calcExpr.endsWith('(')) calcExpr += '-'; return; }
  const k = m.index;
  const before = calcExpr[k - 1], before2 = calcExpr[k - 2];
  if (before === '-' && (k - 1 === 0 || isOp(before2) || before2 === '(')) calcExpr = calcExpr.slice(0, k - 1) + calcExpr.slice(k);
  else calcExpr = calcExpr.slice(0, k) + '-' + calcExpr.slice(k);
}
function calcPress(k) {
  if (k === 'clear') { calcExpr = ''; calcJust = false; $('#calcPrev').textContent = ''; }
  else if (k === 'back') { calcExpr = calcJust ? '' : calcExpr.slice(0, -1); calcJust = false; }
  else if (k === '=') { calcEquals(); return; }
  else if (k === 'neg') toggleNeg();
  else if (k === 'ans') {
    if (lastAns === '') { toast('Aún no hay resultado anterior', 'info', 1500); return; }
    if (calcJust) calcExpr = '';
    calcJust = false;
    if (/[\d.)%]$/.test(calcExpr)) calcExpr += '*';
    calcExpr += Number(lastAns) < 0 ? `(${lastAns})` : lastAns;
  } else appendToken(k);
  calcRender();
}
function calcEquals() {
  if (!calcExpr || calcJust) return;
  const expr = closeExpr(calcExpr);
  try {
    const res = fmtNum(calcEval(expr));
    S.calcHist.push({ expr, result: res, at: Date.now() });
    if (S.calcHist.length > 200) S.calcHist.splice(0, S.calcHist.length - 200);
    save.calc();
    lastAns = res;
    $('#calcPrev').textContent = prettyExpr(expr) + ' =';
    calcExpr = res; calcJust = true;
    renderCalcHist(); calcRender();
  } catch (err) {
    $('#calcPrev').innerHTML = `<span style="color:var(--danger)">${err.message === 'div0' ? 'No se puede dividir entre 0' : 'Expresión no válida'}</span>`;
  }
}
function calcRender() {
  $('#calcExpr').textContent = calcExpr ? prettyExpr(calcExpr) : '0';
  if (!calcJust) {
    let prev = '';
    if (calcExpr && /[+\-*/%(]/.test(calcExpr.replace(/^-/, ''))) { try { prev = '= ' + fmtNum(calcEval(closeExpr(calcExpr))); } catch {} }
    $('#calcPrev').textContent = prev;
  }
}
function renderCalcHist() {
  $('#calcHist').innerHTML = S.calcHist.length ? S.calcHist.slice().reverse().map((h, i) => `<div class="hist-item" data-i="${S.calcHist.length - 1 - i}" title="Recuperar resultado"><span class="muted small">${esc(prettyExpr(h.expr))} =</span><b>${esc(h.result)}</b></div>`).join('')
    : '<div class="empty">Las operaciones aparecerán aquí</div>';
}
function buildCalcKeys() {
  $('#calcKeys').innerHTML = CALC_KEYS.map(([l, k, c = '']) => `<button type="button" class="ck ${c}" data-k="${esc(k)}">${l}</button>`).join('');
  $('#calcKeys').addEventListener('mousedown', e => { if (e.target.closest('.ck')) e.preventDefault(); });
  $('#calcKeys').addEventListener('click', e => { const b = e.target.closest('.ck'); if (b) calcPress(b.dataset.k); });
}
function calcKey(e) {
  if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
  const map = { Enter: '=', '=': '=', Backspace: 'back', Escape: 'clear', Delete: 'clear', ',': '.', x: '*', X: '*', '÷': '/' };
  const k = map[e.key] ?? e.key;
  if (/^[0-9.+\-*/%()]$/.test(k) || k === '=' || k === 'back' || k === 'clear') {
    e.preventDefault();
    calcPress(k);
    const b = $$('.ck').find(x => x.dataset.k === k);
    if (b) { b.classList.add('press'); setTimeout(() => b.classList.remove('press'), 110); }
  }
}
$('#calcHist').addEventListener('click', e => {
  const it = e.target.closest('.hist-item'); if (!it) return;
  const h = S.calcHist[+it.dataset.i]; if (!h) return;
  calcExpr = h.result; calcJust = true; lastAns = h.result;
  $('#calcPrev').textContent = prettyExpr(h.expr) + ' =';
  calcRender();
});
$('#calcCopy').addEventListener('click', () => copyText(calcJust ? calcExpr : (lastAns || calcExpr), 'Resultado copiado'));
$('#calcClearHist').addEventListener('click', async () => {
  if (!S.calcHist.length) return;
  if (await confirmDialog('¿Borrar todo el historial de la calculadora?', 'Borrar')) { S.calcHist = []; save.calc(); renderCalcHist(); }
});

