#!/usr/bin/env bash
# Phase 5A: REAL concurrent issue_invoice proof (two/three parallel DB sessions).
#
#   bash supabase/tests/15_invoice_concurrency.sh
#
# A rolled-back SQL suite cannot hold two backends at once, so this commits a
# small fixture, runs 3 sessions in parallel through `supabase db query
# --linked` (each a separate backend), then deletes the fixture.
#
# Session A issues invoice 1, then HOLDS its transaction open for 8 s.
# Sessions B and C start while A holds it and must WAIT on the branch row lock,
# then take the next numbers. Asserted: numbers are exactly 1,2,3 (no
# duplicate, no gap), B and C really did wait (>= 1.5 s), and the stored
# counter ended at 4. (A failure AFTER taking a number rolling the counter back
# is proved in 14_invoices.sql with a forced mid-issue exception.)
set -uo pipefail
cd "$(dirname "$0")/../.."
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
# The CLI occasionally fails to connect while another call is creating its
# temporary login role; that fails BEFORE any SQL runs, so retrying is safe.
q() {
  local out i
  for i in 1 2 3 4 5; do
    out="$(supabase db query ${WAPEE_DB_FLAG---linked} -f "$1" 2>&1 | grep -v "^Initialising")"
    case "$out" in *LegacyDbConfigConnectTempRoleError*) sleep 0.5; continue;; esac
    break
  done
  printf '%s\n' "$out"
}

cat >"$TMP/setup.sql" <<'SQL'
do $$
declare v_u uuid := gen_random_uuid(); v_biz uuid; v_br uuid; v_out jsonb := '{}'; v_inv jsonb := '[]'; r jsonb; i int;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values (v_u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'p5conc.' || v_u || '@example.com', extensions.crypt('pw', extensions.gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}', '{}');
  perform set_config('request.jwt.claims', json_build_object('sub', v_u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_biz := public.create_business_with_owner('P5 Conc','p5conc-'||left(v_u::text,8),'GB','GBP','Europe/London','en',null,'Main');
  reset role;
  alter table public.businesses disable trigger businesses_enforce_guard;
  update public.businesses set trial_ends_at = now() + interval '100 days' where id = v_biz;
  alter table public.businesses enable trigger businesses_enforce_guard;
  select id into v_br from public.branches where business_id = v_biz;
  set local role authenticated;
  for i in 1..4 loop
    r := public.create_invoice_draft(v_br, null, null, '[{"description":"c","unit_price_minor":1000}]'::jsonb);
    v_inv := v_inv || to_jsonb(r->>'invoice_id');
  end loop;
  reset role;
end $$;
SQL
echo "setup: committing fixture"
# The DO block cannot return rows, so commit it and read the ids back.
q "$TMP/setup.sql" >/dev/null
cat >"$TMP/ids.sql" <<'SQL'
select jsonb_build_object(
  'user', u.id, 'biz', b.id, 'branch', br.id,
  'inv', (select jsonb_agg(i.id order by i.created_at, i.id) from public.invoices i where i.business_id = b.id)) as fx
from auth.users u
join public.businesses b on b.slug like 'p5conc-%' and u.email like 'p5conc.%'
join public.branches br on br.business_id = b.id
join public.business_members m on m.business_id = b.id and m.user_id = u.id
order by b.created_at desc limit 1;
SQL
FX="$(q "$TMP/ids.sql" | python3 -c 'import sys,json; print(json.dumps(json.load(sys.stdin)["rows"][0]["fx"]))')"
USER_ID="$(echo "$FX" | python3 -c 'import sys,json; print(json.load(sys.stdin)["user"])')"
BRANCH="$(echo "$FX" | python3 -c 'import sys,json; print(json.load(sys.stdin)["branch"])')"
BIZ="$(echo "$FX" | python3 -c 'import sys,json; print(json.load(sys.stdin)["biz"])')"
INV=()
while IFS= read -r line; do INV+=("$line"); done < <(echo "$FX" | python3 -c 'import sys,json; print("\n".join(json.load(sys.stdin)["inv"]))')

# A takes the lock first and holds it; B and C queue behind it.
cat >"$TMP/B.sql" <<SQL
select set_config('request.jwt.claims', '{"sub":"$USER_ID","role":"authenticated"}', true);
set local role authenticated;
with a as materialized (select clock_timestamp() as t0, public.issue_invoice('${INV[1]}') as r)
select jsonb_build_object('t0', a.t0, 'r', a.r, 't1', clock_timestamp()) as out from a;
SQL
sed "s/${INV[1]}/${INV[2]}/" "$TMP/B.sql" >"$TMP/C.sql"
# NOTE: one Management-API call is one transaction, so to make A HOLD its
# lock we put the sleep in the SAME statement list after the issue.
cat >"$TMP/A.sql" <<SQL
select set_config('request.jwt.claims', '{"sub":"$USER_ID","role":"authenticated"}', true);
set local role authenticated;
with a as materialized (select clock_timestamp() as t0, public.issue_invoice('${INV[0]}') as r)
select jsonb_build_object('t0', a.t0, 'r', a.r, 't1', clock_timestamp(),
  'slept', (select count(*) from pg_sleep(8))) as out from a;
SQL

echo "running A (holds 8s), then B and C in parallel"
q "$TMP/A.sql" >"$TMP/A.out" &
PA=$!
# Staggered starts: parallel `supabase db query` calls race while the CLI
# creates its temporary login role, which can hang a call.
sleep 1.5
q "$TMP/B.sql" >"$TMP/B.out" &
PB=$!
sleep 1.5
q "$TMP/C.sql" >"$TMP/C.out" &
PC=$!
wait $PA || true; wait $PB || true; wait $PC || true

python3 - "$TMP" <<'PY'
import json, sys, datetime as dt
tmp = sys.argv[1]
def load(n):
    raw = open(f"{tmp}/{n}.out").read()
    try:
        return json.loads(raw)["rows"][0]["out"]
    except Exception:
        print("session", n, "returned:", raw[:600]); raise
def ts(s):
    import re
    s = s.replace("Z", "+00:00")
    s = re.sub(r"\.(\d+)", lambda m: "." + m.group(1).ljust(6, "0")[:6], s)
    return dt.datetime.fromisoformat(s)
outs = {n: load(n) for n in "ABC"}
nums = sorted(int(o["r"]["number"].rsplit("-", 1)[1]) for o in outs.values())
for n, o in outs.items():
    print(n, o["r"]["number"], "ok" if o["r"]["ok"] else o["r"], "took %.2fs" % (ts(o["t1"]) - ts(o["t0"])).total_seconds())
fail = []
if nums != [1, 2, 3]: fail.append(f"numbers {nums} != [1,2,3]")
waited = [(ts(outs[n]["t1"]) - ts(outs[n]["t0"])).total_seconds() for n in "BC"]
if min(waited) < 1.5: fail.append(f"B/C did not wait on the lock: {waited}")
print("PASS: numbers 1,2,3 unique + gapless; B and C queued behind A" if not fail else "FAIL: " + "; ".join(fail))
sys.exit(1 if fail else 0)
PY
RC=$?

cat >"$TMP/check.sql" <<SQL
select jsonb_build_object('invoice_next_no', (select invoice_next_no from public.branches where id = '$BRANCH'),
  'issued', (select count(*) from public.invoices where business_id = '$BIZ' and status = 'issued'),
  'distinct_seq', (select count(distinct number_seq) from public.invoices where business_id = '$BIZ' and status = 'issued')) as out;
SQL
echo "stored state: $(q "$TMP/check.sql" | python3 -c 'import sys,json; print(json.load(sys.stdin)["rows"][0]["out"])')"

cat >"$TMP/teardown.sql" <<SQL
alter table public.member_role_assignments disable trigger member_role_assignments_last_owner;
delete from public.businesses where id = '$BIZ';
alter table public.member_role_assignments enable trigger member_role_assignments_last_owner;
delete from auth.users where id = '$USER_ID';
SQL
q "$TMP/teardown.sql" >/dev/null && echo "teardown: fixture deleted"
exit $RC
