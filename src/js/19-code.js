/* =====================================================================
   BLOQUES DE CÓDIGO EN LAS NOTAS
   ===================================================================== */
/*
  <pre data-lang="sql">…</pre> con resaltado de sintaxis propio (sin librerías, sin red).
  · Escribe ``` (o ```sql) y Enter para crear un bloque · Enter dos veces al final para salir
  · Tab = 2 espacios · barra flotante: lenguaje + copiar · se re-colorea al escribir
*/
const CODE_LANGS = { auto: 'Detectar', sql: 'SQL', js: 'JavaScript / TS', java: 'Java', py: 'Python', json: 'JSON', xml: 'XML / HTML', sh: 'Shell / Bash', ps: 'PowerShell', css: 'CSS', text: 'Texto plano' };
const codeKw = s => new RegExp(`\\b(?:${s.trim().split(/\s+/).join('|')})\\b`, 'y');
const codeKwi = s => new RegExp(`\\b(?:${s.trim().split(/\s+/).join('|')})\\b`, 'iy');
const CODE_RULES = {
  sql: [['com', /--[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/y], ['str', /'(?:''|[^'])*'?/y], ['num', /\b\d+(?:\.\d+)?\b/y],
    ['kw', codeKwi('select from where and or not null is in exists between like limit offset union all distinct as on join left right inner outer full cross group by order having asc desc insert into values update set delete create alter drop table view index sequence trigger procedure function returns return begin end declare if then else elsif when case loop while for commit rollback primary key foreign references default constraint unique check with merge using top fetch next rows only grant revoke truncate cursor open close execute exec nvl coalesce count sum avg min max cast convert to_char to_date sysdate current_date')],
    ['var', /[:@][A-Za-z_]\w*/y]],
  js: [['com', /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/y], ['str', /`(?:\\[\s\S]|[^`\\])*`?|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?/y], ['num', /\b(?:0x[\da-f]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)\b/iy],
    ['kw', codeKw('const let var function return if else for while do switch case break continue new class extends import export from default try catch finally throw async await typeof instanceof in of this null undefined true false yield delete void static get set super interface type enum implements readonly')],
    ['fn', /[A-Za-z_$][\w$]*(?=\s*\()/y]],
  java: [['com', /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/y], ['str', /"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?/y], ['num', /\b\d+(?:\.\d+)?[lLfFdD]?\b/y], ['var', /@[A-Za-z_]\w*/y],
    ['kw', codeKw('public private protected static final void int long double boolean char byte short float class interface enum extends implements package import new return if else for while do switch case break continue try catch finally throw throws null true false this super synchronized abstract volatile transient native var record instanceof default')],
    ['fn', /[A-Za-z_]\w*(?=\s*\()/y]],
  py: [['com', /#[^\n]*/y], ['str', /"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|[rbf]?"(?:\\.|[^"\\\n])*"?|[rbf]?'(?:\\.|[^'\\\n])*'?/y], ['num', /\b\d+(?:\.\d+)?\b/y], ['var', /@[A-Za-z_][\w.]*/y],
    ['kw', codeKw('def class return if elif else for while in not and or is None True False import from as with try except finally raise pass break continue lambda yield global nonlocal async await self del assert')],
    ['fn', /[A-Za-z_]\w*(?=\s*\()/y]],
  json: [['key', /"(?:\\.|[^"\\\n])*"(?=\s*:)/y], ['str', /"(?:\\.|[^"\\\n])*"?/y], ['num', /-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/iy], ['kw', codeKw('true false null')]],
  xml: [['com', /<!--[\s\S]*?(?:-->|$)/y], ['tag', /<\/?[A-Za-z_][\w:.-]*|\/?>|<\?[\w-]*|\?>/y], ['attr', /[A-Za-z_][\w:.-]*(?==)/y], ['str', /"[^"]*"?|'[^']*'?/y]],
  sh: [['com', /#[^\n]*/y], ['str', /"(?:\\.|[^"\\])*"?|'[^']*'?/y], ['var', /\$\{[^}]*\}?|\$[A-Za-z_]\w*|\$[0-9#?@*$!]/y], ['num', /\b\d+\b/y],
    ['kw', codeKw('if then fi else elif for do done while until case esac function in export local return exit echo sudo cd ls grep awk sed cat cp mv rm mkdir chmod chown curl wget git docker kubectl ssh scp tar find xargs source alias set unset')]],
  ps: [['com', /#[^\n]*|<#[\s\S]*?(?:#>|$)/y], ['str', /"(?:`.|[^"`])*"?|'[^']*'?/y], ['var', /\$[A-Za-z_][\w:]*/y], ['num', /\b\d+\b/y],
    ['kw', codeKwi('if else elseif foreach for while do switch function param return try catch finally throw begin process end in')], ['fn', /\b[A-Z][a-z]+-[A-Z]\w+/y]],
  css: [['com', /\/\*[\s\S]*?(?:\*\/|$)/y], ['str', /"[^"]*"?|'[^']*'?/y], ['tag', /[.#]?[A-Za-z_-][\w-]*(?=[^{};]*\{)/y], ['attr', /[a-z-]+(?=\s*:)/y], ['num', /-?\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|s|ms|deg)?/y], ['var', /--[\w-]+|#[\da-fA-F]{3,8}\b/y]]
};
function detectLang(t) {
  const s = t.trim();
  if (!s) return 'text';
  if (/^[{[]/.test(s)) { try { JSON.parse(s); return 'json'; } catch {} if (/^\{\s*"/.test(s)) return 'json'; }
  if (/^<(\?xml|!DOCTYPE|[a-z][\w:-]*[\s>/])/i.test(s)) return 'xml';
  if (/^\s*(select|insert|update|delete|create|alter|drop|with|merge|begin|declare)\b/i.test(s) && /\b(from|into|table|set|values|view|procedure|as)\b/i.test(s)) return 'sql';
  if (/^#!.*\b(ba)?sh\b|^\s*(sudo|apt|cd|ls|export|echo|git|docker|kubectl|curl|chmod|mkdir)\s/m.test(s)) return 'sh';
  if (/\$[A-Za-z_]\w*\s*=|\b[A-Z][a-z]+-[A-Z][a-zA-Z]+\b/.test(s) && /\b(Get|Set|New|Remove|Write|Import)-\w+/.test(s)) return 'ps';
  if (/^\s*(def |class \w+(\(.*\))?:|import \w+|from \w+ import|print\()/m.test(s) || /:\s*\n\s{4}\S/.test(s)) return 'py';
  if (/\b(public|private|protected)\s+(static\s+)?(class|void|[A-Z]\w*)\b|System\.out\.|@Override/.test(s)) return 'java';
  if (/\b(const|let|var|function|=>|console\.|document\.|import .* from|export )/.test(s)) return 'js';
  if (/^[.#]?[\w-]+\s*\{[^}]*:[^}]*\}/m.test(s)) return 'css';
  return 'text';
}
function hlCode(text, lang) {
  const rules = CODE_RULES[lang];
  if (!rules) return esc(text);
  let out = '', i = 0, plain = '';
  const flush = () => { if (plain) { out += esc(plain); plain = ''; } };
  while (i < text.length) {
    let hit = null;
    for (const [cls, re] of rules) { re.lastIndex = i; const m = re.exec(text); if (m && m[0].length) { hit = [cls, m[0]]; break; } }
    if (hit) { flush(); out += `<span class="c-${hit[0]}">${esc(hit[1])}</span>`; i += hit[1].length; }
    else {
      // avanzar una «palabra» entera para no colorear trozos de identificadores
      const m = /[A-Za-z_$][\w$]*|\s+|./y; m.lastIndex = i; const w = m.exec(text)[0];
      plain += w; i += w.length;
    }
  }
  flush();
  return out;
}
const preText = pre => {
  const c = pre.cloneNode(true);
  c.querySelectorAll('br').forEach(b => b.replaceWith('\n'));
  c.querySelectorAll('div,p').forEach(d => { d.before('\n'); d.replaceWith(...d.childNodes); });
  return c.textContent.replace(/\u00a0/g, ' ');
};
const preLang = pre => pre.dataset.lang && pre.dataset.lang !== 'auto' ? pre.dataset.lang : detectLang(preText(pre));
/* Posición del cursor como desplazamiento de caracteres dentro de un elemento */
function caretOffsetIn(el) {
  const sel = getSelection(); if (!sel.rangeCount) return null;
  const r = sel.getRangeAt(0); if (!el.contains(r.startContainer)) return null;
  const pre = document.createRange(); pre.selectNodeContents(el); pre.setEnd(r.startContainer, r.startOffset);
  const frag = pre.cloneContents(); const tmp = document.createElement('div'); tmp.append(frag);
  tmp.querySelectorAll('br').forEach(b => b.replaceWith('\n'));
  return tmp.textContent.length;
}
function setCaretOffset(el, off) {
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n, left = off;
  while ((n = w.nextNode())) { if (left <= n.nodeValue.length) { const r = document.createRange(); r.setStart(n, left); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return; } left -= n.nodeValue.length; }
  const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}
function highlightPre(pre, keepCaret = false) {
  const text = preText(pre);
  const lang = preLang(pre);
  const off = keepCaret ? caretOffsetIn(pre) : null;
  const html = hlCode(text, lang) || '\n';
  if (pre.innerHTML !== html) pre.innerHTML = html;
  pre.dataset.shown = lang;
  if (off != null) setCaretOffset(pre, off);
}
function highlightAllPre(root = editor) { $$('pre', root).forEach(p => highlightPre(p)); }
const caretPre = () => { const s = getSelection(); if (!s.rangeCount) return null; const n = s.anchorNode; const el = n && (n.nodeType === 1 ? n : n.parentElement); return el && editor.contains(el) ? el.closest('pre') : null; };
const rehighlightSoon = debounce(() => { const p = caretPre(); if (p) { highlightPre(p, true); } }, 500);

/* ---------- Teclado dentro de los bloques ---------- */
function insertTextAtCaret(t) {
  const s = getSelection(); if (!s.rangeCount) return;
  const r = s.getRangeAt(0); r.deleteContents();
  const node = document.createTextNode(t); r.insertNode(node);
  r.setStartAfter(node); r.collapse(true); s.removeAllRanges(); s.addRange(r);
}
function exitPreAfter(pre) {
  const div = document.createElement('div'); div.innerHTML = '<br>';
  pre.after(div);
  const r = document.createRange(); r.setStart(div, 0); r.collapse(true);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}
editor.addEventListener('keydown', e => {
  if (e.defaultPrevented) return;
  const pre = caretPre();
  if (pre) {
    if (e.key === 'Tab' && !e.ctrlKey) { e.preventDefault(); e.stopImmediatePropagation(); insertTextAtCaret('  '); markDirty(); return; }
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault(); e.stopImmediatePropagation();
      const off = caretOffsetIn(pre), text = preText(pre);
      const atEnd = off >= text.replace(/\n$/, '').length;
      if (atEnd && /\n\s*$/.test(text.slice(0, off)) && !e.shiftKey) {        // segunda línea vacía al final: salir
        pre.innerHTML = hlCode(text.replace(/\n\s*$/, ''), preLang(pre));
        exitPreAfter(pre); markDirty(); return;
      }
      const indent = (text.slice(0, off).split('\n').pop().match(/^\s*/) || [''])[0];
      const atTail = off >= text.length;
      insertTextAtCaret('\n' + indent + (atTail && !text.endsWith('\n') ? '\n' : ''));
      if (atTail && !text.endsWith('\n')) { const o = caretOffsetIn(pre); setCaretOffset(pre, o - 1); }
      markDirty(); rehighlightSoon(); return;
    }
    if (e.key === 'ArrowDown' && !pre.nextElementSibling) {
      const off = caretOffsetIn(pre), text = preText(pre);
      if (off >= text.replace(/\n$/, '').length) { e.preventDefault(); exitPreAfter(pre); markDirty(); }
      return;
    }
    return;
  }
  // ``` o ```sql + Enter en una línea vacía → bloque de código
  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
    const line = currentLine();
    const t = line ? line.textContent.replace(/\u00a0/g, ' ').trim() : '';
    const m = /^```\s*([a-z]*)$/i.exec(t);
    if (line && m) {
      e.preventDefault(); e.stopImmediatePropagation();
      const pre = document.createElement('pre');
      const lg = { javascript: 'js', ts: 'js', typescript: 'js', python: 'py', bash: 'sh', shell: 'sh', html: 'xml', powershell: 'ps' }[m[1].toLowerCase()] || m[1].toLowerCase();
      if (CODE_RULES[lg] || lg === 'text') pre.dataset.lang = lg;
      pre.textContent = '\n';
      line.replaceWith(pre);
      setCaretOffset(pre, 0); markDirty();
    }
  }
}, true);
editor.addEventListener('input', () => { if (caretPre()) rehighlightSoon(); });

/* ---------- Barra flotante: lenguaje + copiar ---------- */
const codeBar = document.createElement('div');
codeBar.className = 'code-bar'; codeBar.hidden = true;
codeBar.innerHTML = '<button type="button" class="code-lang" data-cb="lang" title="Lenguaje del bloque">SQL ▾</button><button type="button" data-cb="copy" title="Copiar el código">📋 Copiar</button>';
$('#editorCard').append(codeBar);
let codeBarPre = null;
function placeCodeBar(pre) {
  if (!pre || !editor.contains(pre)) { codeBar.hidden = true; codeBarPre = null; return; }
  const cr = $('#editorCard').getBoundingClientRect(), pr = pre.getBoundingClientRect(), er = editor.getBoundingClientRect();
  if (pr.bottom < er.top + 10 || pr.top > er.bottom - 10) { codeBar.hidden = true; return; }
  codeBarPre = pre; codeBar.hidden = false;
  codeBar.style.top = (Math.max(pr.top, er.top) - cr.top + 4) + 'px';
  codeBar.style.right = (cr.right - pr.right + 4) + 'px';
  const l = pre.dataset.lang && pre.dataset.lang !== 'auto' ? pre.dataset.lang : null;
  $('.code-lang', codeBar).textContent = `${l ? CODE_LANGS[l] : (CODE_LANGS[pre.dataset.shown || preLang(pre)] || 'Texto') + ' (auto)'} ▾`;
}
editor.addEventListener('mouseover', e => { const p = e.target.closest && e.target.closest('pre'); if (p) placeCodeBar(p); });
editor.addEventListener('mouseleave', e => { if (!codeBar.contains(e.relatedTarget) && !caretPre()) codeBar.hidden = true; });
editor.addEventListener('scroll', () => { if (codeBarPre) placeCodeBar(codeBarPre); }, { passive: true });
document.addEventListener('selectionchange', () => { if (currentTab !== 'notes') return; const p = caretPre(); if (p) placeCodeBar(p); else if (codeBarPre && !codeBar.matches(':hover')) codeBar.hidden = true; });
codeBar.addEventListener('mousedown', e => e.preventDefault());
const codeLangPop = document.createElement('div');
codeLangPop.className = 'popover menu'; codeLangPop.id = 'codeLangPop';
codeLangPop.innerHTML = Object.entries(CODE_LANGS).map(([k, v]) => `<button type="button" data-cl="${k}">${k === 'auto' ? '✨ ' : ''}${v}</button>`).join('');
document.body.append(codeLangPop);
codeLangPop.addEventListener('mousedown', e => e.preventDefault());
codeBar.addEventListener('click', e => {
  const b = e.target.closest('[data-cb]'); if (!b || !codeBarPre) return;
  if (b.dataset.cb === 'copy') copyText(preText(codeBarPre).replace(/\n$/, ''), 'Código copiado');
  else { codeLangPop.classList.contains('open') ? codeLangPop.classList.remove('open') : openPopover(codeLangPop, b); }
});
codeLangPop.addEventListener('click', e => {
  const b = e.target.closest('[data-cl]'); if (!b || !codeBarPre) return;
  codeLangPop.classList.remove('open');
  if (b.dataset.cl === 'auto') delete codeBarPre.dataset.lang; else codeBarPre.dataset.lang = b.dataset.cl;
  highlightPre(codeBarPre); placeCodeBar(codeBarPre); markDirty();
});

/* ---------- Código en línea ---------- */
function toggleInlineCode() {
  restoreSel();
  const s = getSelection(); if (!s.rangeCount) return;
  const r = s.getRangeAt(0);
  const inCode = r.startContainer.parentElement && r.startContainer.parentElement.closest('code');
  if (inCode && editor.contains(inCode) && !inCode.closest('pre')) { inCode.replaceWith(document.createTextNode(inCode.textContent)); markDirty(); return; }
  const t = r.toString();
  if (!t) { toast('Selecciona el texto que quieres marcar como código', 'info', 2200); return; }
  document.execCommand('insertHTML', false, `<code>${esc(t)}</code>`);
  markDirty();
}

/* Colores (también se usan al exportar el manual HTML) */
const CODE_CSS_EXPORT = '.c-com{color:#6a8a6a;font-style:italic}.c-str{color:#c2410c}.c-num{color:#0e7490}.c-kw{color:#7c3aed;font-weight:600}.c-fn{color:#2563eb}.c-var{color:#b45309}.c-key{color:#9333ea}.c-tag{color:#2563eb}.c-attr{color:#b45309}@media (prefers-color-scheme:dark){.c-com{color:#7f9f7f}.c-str{color:#f0a374}.c-num{color:#67d4e8}.c-kw{color:#b9a7ff}.c-fn{color:#7cb7ff}.c-var{color:#f5c76b}.c-key{color:#d8a7ff}.c-tag{color:#7cb7ff}.c-attr{color:#f5c76b}}';
