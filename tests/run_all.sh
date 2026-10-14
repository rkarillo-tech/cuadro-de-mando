#!/usr/bin/env bash
# Ejecuta todas las pruebas de extremo a extremo (Playwright + Chromium) contra CuadroDeMando.html.
# Requisitos: python3 -m pip install playwright && python3 -m playwright install chromium
set -u
cd "$(dirname "$0")/.."
python3 build.py || exit 1
fallos=0
for t in tests/test_*.py; do
  printf '%-45s' "$(basename "$t")"
  out=$(python3 "$t" 2>&1)
  pass=$(grep -c '^PASS' <<<"$out"); fail=$(grep -c '^FAIL ' <<<"$out")
  errs=$(grep -E '^ERRORS' <<<"$out" | grep -v '\[\]' || true)
  if [[ $fail -gt 0 || -n "$errs" ]] || grep -q Traceback <<<"$out"; then
    echo "✗ $pass OK, $fail fallos"; grep -E '^FAIL |Traceback|Error' <<<"$out" | head -5; fallos=$((fallos+1))
  else echo "✓ $pass OK"; fi
done
[[ $fallos -eq 0 ]] && echo "Todo correcto" || { echo "$fallos archivo(s) con fallos"; exit 1; }
