#!/usr/bin/env bash
# Runs every SQL suite in supabase/tests (pgTAP files, i.e. those with `select plan(`, through run_pgtap.py; the rest plain SQL that ends with a
# `result` row) and the concurrency scripts, and exits non-zero if anything failed.
#
#   scripts/run-sql-suites.sh            # against the LINKED project (rolled-back fixtures; needs `supabase link`)
#   WAPEE_DB_FLAG= scripts/run-sql-suites.sh   # against the LOCAL database (`supabase start`); this is what CI does
#   SUITES="28 29" scripts/run-sql-suites.sh   # only these numbers
set -u
cd "$(dirname "$0")/.."
FLAG="${WAPEE_DB_FLAG---linked}"
export WAPEE_DB_FLAG="$FLAG"
want="${SUITES:-}"
fail=0

picked() { [ -z "$want" ] && return 0; for n in $want; do [ "$n" = "$1" ] && return 0; done; return 1; }

run_plain() {
  local out
  out="$(supabase db query $FLAG -f "$1" 2>&1)"
  python3 - "$1" "$out" <<'PY'
import json, sys
name, text = sys.argv[1], sys.argv[2]
try:
    d = json.JSONDecoder().raw_decode(text[text.index("{"):])[0]
    r = d["rows"][0]
    r = r.get("result", r)
    failed, passed = int(r["failed"]), int(r["passed"])
    print(f"{'ok  ' if failed == 0 else 'FAIL'} {name}: {passed} passed, {failed} failed")
    for f in (r.get("failures") or []) if isinstance(r.get("failures"), list) else []:
        print("      ", f)
    sys.exit(1 if failed else 0)
except SystemExit:
    raise
except Exception:
    print(f"ERR  {name}: {text[-400:]}")
    sys.exit(2)
PY
}

for f in supabase/tests/[0-9][0-9]_*.sql; do
  base="$(basename "$f")"
  n="${base%%_*}"
  case "$base" in *seed*|*cleanup*) continue ;; esac
  picked "$n" || continue
  if grep -q 'select plan(' "$f"; then
    out="$(python3 supabase/tests/run_pgtap.py "$f" 2>&1)"; rc=$?
    echo "$([ $rc -eq 0 ] && echo 'ok  ' || echo 'FAIL') $base: $out"
    [ $rc -ne 0 ] && fail=1
  else
    run_plain "$f" || fail=1
  fi
done

for f in supabase/tests/*_concurrency.sh; do
  base="$(basename "$f")"; n="${base%%_*}"
  picked "$n" || continue
  if bash "$f" >/tmp/wapee-conc.log 2>&1; then echo "ok   $base"; else echo "FAIL $base"; tail -5 /tmp/wapee-conc.log; fail=1; fi
done
exit $fail
