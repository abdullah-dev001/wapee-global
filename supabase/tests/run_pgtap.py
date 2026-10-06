#!/usr/bin/env python3
"""Run a pgTAP-style suite (01-05) through `supabase db query --linked`.

A Management-API call returns only the LAST statement's rows, so a failing
`ok`/`is`/`throws_ok` in the middle would be invisible. This harness rewrites every
top-level `select <pgtap fn>(...)` into `insert into pgt_out select ...` and ends
with one result row listing every `not ok` line. The suite file itself stays plain
pgTAP (it still runs unchanged under `supabase test db` where Docker exists).

    python3 supabase/tests/run_pgtap.py supabase/tests/02_role_assignment_guard.sql
"""
import json, re, subprocess, sys

FN = r"(?:ok|is|isnt|is_empty|isa_ok|throws_ok|throws_like|lives_ok|results_eq|set_eq|cmp_ok|matches|has_table|has_column|has_function|has_index|policies_are|hasnt_table|col_is_pk|col_has_default|function_returns|is_definer|isnt_definer|pass|fail|row_eq|bag_eq|performs_ok|has_trigger|trigger_is|has_pk|has_fk|index_is_unique|table_privs_are|col_not_null|has_view|has_type|has_enum|has_extension)"
src = open(sys.argv[1]).read()
src = re.sub(r"^select plan\(\d+\);\s*$", "select no_plan();", src, flags=re.M)
src = re.sub(r"^select \* from finish\(\);\s*$", "", src, flags=re.M)
src = re.sub(r"^rollback;\s*$", "", src, flags=re.M)
src = re.sub(r"^(select )(" + FN + r"\s*\()", r"insert into pgt_out(line) \1\2", src, flags=re.M)
src = src.replace("begin;", "begin;\ncreate temporary table pgt_out (n serial, line text);\n"
                  "do $g$ declare s text; begin select nspname into s from pg_namespace where oid = pg_my_temp_schema(); "
                  "execute format('grant usage on schema %I to authenticated, anon', s); "
                  "execute format('grant select, insert on %I.pgt_out to authenticated, anon', s); "
                  "execute format('grant usage on all sequences in schema %I to authenticated, anon', s); end $g$;", 1)
src += "\nselect jsonb_build_object('passed', count(*) filter (where line like 'ok%'), 'failed', count(*) filter (where line not like 'ok%'), " \
       "'total', count(*), 'failures', coalesce(jsonb_agg(line order by n) filter (where line not like 'ok%'), '[]'::jsonb)) as result from pgt_out;\nrollback;\n"
open("/tmp/pgtap_run.sql", "w").write(src)
out = subprocess.run(["supabase", "db", "query", "--linked", "-f", "/tmp/pgtap_run.sql"], capture_output=True, text=True)
txt = out.stdout + out.stderr
try:
    d, _ = json.JSONDecoder().raw_decode(txt[txt.index("{"):])
    r = d["rows"][0]["result"]
    print(f"passed {r['passed']} failed {r['failed']} total {r['total']}")
    for f in r["failures"]:
        print("  ", f)
    sys.exit(1 if r["failed"] else 0)
except Exception:
    print("ERR", txt[-1500:])
    sys.exit(2)
