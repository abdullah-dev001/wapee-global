#!/usr/bin/env bash
# Phase 10A: REAL concurrent proof (three parallel DB sessions each) that
#   1. three parallel deductions cannot overspend the LAST session of a package, and
#   2. three parallel sales (issue_invoice) cannot oversell the LAST unit of a product.
#
#   bash supabase/tests/23_addons_concurrency.sh
#
# A rolled-back SQL suite cannot hold two backends at once, so this commits a small fixture, runs
# the sessions through `supabase db query --linked` (one backend each), then deletes the fixture.
# EVERY session does its work and then HOLDS its transaction open for 5 s (a refusal holds the row
# lock too, because the lock is taken before the check), so whichever session the CLI starts first
# makes the others queue behind it, whatever the start-up jitter.
# Asserted per scenario: exactly ONE success (whoever it is), the others refused with the right
# code, at least two sessions really waited, and the STORED rows agree (1 usage; stock 0 + 1 sale).
set -uo pipefail
cd "$(dirname "$0")/../.."
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
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
declare v_u uuid := gen_random_uuid(); v_biz uuid; v_br uuid; v_svc uuid; v_c uuid; v_fv uuid; v_staff uuid;
        v_pkg uuid; v_inv uuid; r jsonb; i int;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values (v_u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'p10conc.' || v_u || '@example.com', extensions.crypt('pw', extensions.gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}', '{}');
  perform set_config('request.jwt.claims', json_build_object('sub', v_u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_biz := public.create_business_with_owner('P10 Conc','p10conc-'||left(v_u::text,8),'GB','GBP','Europe/London','en',null,'Main');
  reset role;
  select id into v_br from public.branches where business_id = v_biz;
  insert into public.services (business_id, name, duration_minutes, buffer_minutes) values (v_biz, 'Conc svc', 30, 0) returning id into v_svc;
  insert into public.service_branches (service_id, branch_id, business_id, price_minor, enabled) values (v_svc, v_br, v_biz, 1000, true);
  insert into public.staff_profiles (business_id, display_name, is_active) values (v_biz, 'Conc staff', true) returning id into v_staff;
  insert into public.staff_branches (staff_id, branch_id, business_id) values (v_staff, v_br, v_biz);
  insert into public.clients (business_id, full_name, phone_e164, first_branch_id) values (v_biz, 'Conc client', '+447700900999', v_br) returning id into v_c;
  select id into v_fv from public.form_versions where business_id = v_biz order by version desc limit 1;
  for i in 1..3 loop
    insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id, starts_at, ends_at, duration_minutes, buffer_minutes, status, source, form_version_id, price_minor)
    values (v_biz, v_br, v_c, v_svc, v_staff, timestamptz '2027-05-03 06:00+00' + make_interval(hours => i), timestamptz '2027-05-03 06:30+00' + make_interval(hours => i), 30, 0, 'confirmed', 'dashboard', v_fv, 1000);
  end loop;
  set local role authenticated;
  r := public.save_package(v_br, null, 'Single', null, 1, 0, 1000, null, array[v_svc], true);
  v_pkg := (r->>'package_id')::uuid;
  r := public.create_invoice_draft(v_br, null, v_c, jsonb_build_array(jsonb_build_object('package_id', v_pkg)));
  r := public.issue_invoice((r->>'invoice_id')::uuid);
  if not (r->>'ok')::boolean then raise exception 'package sale failed: %', r; end if;
  r := public.save_product(v_br, null, 'Last unit', null, 'piece', 500, null, true, 1);
  if not (r->>'ok')::boolean then raise exception 'product failed: %', r; end if;
  for i in 1..3 loop
    r := public.create_invoice_draft(v_br, null, null, jsonb_build_array(jsonb_build_object('product_id', (select id from public.products where business_id = v_biz limit 1), 'quantity', 1)));
    if not (r->>'ok')::boolean then raise exception 'draft failed: %', r; end if;
  end loop;
  reset role;
end $$;
SQL
echo "setup: committing fixture"
q "$TMP/setup.sql" >/dev/null
cat >"$TMP/ids.sql" <<'SQL'
select jsonb_build_object(
  'user', u.id, 'biz', b.id, 'branch', br.id,
  'cp', (select c.id from public.client_packages c where c.business_id = b.id limit 1),
  'ap', (select jsonb_agg(a.id order by a.starts_at) from public.appointments a where a.business_id = b.id),
  'product', (select p.id from public.products p where p.business_id = b.id limit 1),
  'inv', (select jsonb_agg(i.id order by i.created_at, i.id) from public.invoices i where i.business_id = b.id and i.status = 'draft')) as fx
from auth.users u
join public.businesses b on b.slug like 'p10conc-%' and u.email like 'p10conc.%'
join public.branches br on br.business_id = b.id
join public.business_members m on m.business_id = b.id and m.user_id = u.id
order by b.created_at desc limit 1;
SQL
FX="$(q "$TMP/ids.sql" | python3 -c 'import sys,json; print(json.dumps(json.load(sys.stdin)["rows"][0]["fx"]))')"
J() { echo "$FX" | python3 -c "import sys,json; d=json.load(sys.stdin); v=d$1; print(v)"; }
USER_ID="$(J '["user"]')"; BIZ="$(J '["biz"]')"; BRANCH="$(J '["branch"]')"; CP="$(J '["cp"]')"; PRODUCT="$(J '["product"]')"
AP0="$(J '["ap"][0]')"; AP1="$(J '["ap"][1]')"; AP2="$(J '["ap"][2]')"
INV0="$(J '["inv"][0]')"; INV1="$(J '["inv"][1]')"; INV2="$(J '["inv"][2]')"

# $1 = statement for A, $2 for B, $3 for C (each holds its transaction 5 s)
run3() {
  local name="$1" sa="$2" sb="$3" sc="$4" n stmt
  for n in A B C; do
    case $n in A) stmt="$sa";; B) stmt="$sb";; C) stmt="$sc";; esac
    local sleep_part=", 'slept', (select count(*) from pg_sleep(5))"
    cat >"$TMP/$name.$n.sql" <<SQL
select set_config('request.jwt.claims', '{"sub":"$USER_ID","role":"authenticated"}', true);
set local role authenticated;
with a as materialized (select clock_timestamp() as t0, $stmt as r)
select jsonb_build_object('t0', a.t0, 'r', a.r, 't1', clock_timestamp()$sleep_part) as out from a;
SQL
  done
  q "$TMP/$name.A.sql" >"$TMP/$name.A.out" & local PA=$!
  sleep 1.5
  q "$TMP/$name.B.sql" >"$TMP/$name.B.out" & local PB=$!
  sleep 1.5
  q "$TMP/$name.C.sql" >"$TMP/$name.C.out" & local PC=$!
  wait $PA || true; wait $PB || true; wait $PC || true
}

echo "scenario 1: three parallel deductions of the LAST session"
run3 s1 "public.deduct_session('$AP0', '$CP')" "public.deduct_session('$AP1', '$CP')" "public.deduct_session('$AP2', '$CP')"
echo "scenario 2: three parallel sales of the LAST unit"
run3 s2 "public.issue_invoice('$INV0')" "public.issue_invoice('$INV1')" "public.issue_invoice('$INV2')"

python3 - "$TMP" <<'PY'
import json, sys, re, datetime as dt
tmp = sys.argv[1]
def ts(s):
    s = s.replace("Z", "+00:00")
    s = re.sub(r"\.(\d+)", lambda m: "." + m.group(1).ljust(6, "0")[:6], s)
    return dt.datetime.fromisoformat(s)
def load(sc, n):
    raw = open(f"{tmp}/{sc}.{n}.out").read()
    try:
        return json.loads(raw)["rows"][0]["out"]
    except Exception:
        print("session", sc, n, "returned:", raw[:600]); raise
fail = []
for sc, refusal in (("s1", "no_sessions_left"), ("s2", "insufficient_stock")):
    outs = {n: load(sc, n) for n in "ABC"}
    oks = [n for n, o in outs.items() if o["r"].get("ok")]
    codes = sorted(o["r"].get("code") for n, o in outs.items() if not o["r"].get("ok"))
    waited = [(ts(o["t1"]) - ts(o["t0"])).total_seconds() for o in outs.values()]
    for n, o in outs.items():
        print(sc, n, "ok" if o["r"].get("ok") else o["r"].get("code"), "took %.2fs" % (ts(o["t1"]) - ts(o["t0"])).total_seconds())
    if len(oks) != 1: fail.append(f"{sc}: successes {oks}, expected exactly one")
    if codes != [refusal, refusal]: fail.append(f"{sc}: refusals {codes}")
    if sum(1 for w in waited if w >= 1.5) < 2: fail.append(f"{sc}: fewer than two sessions waited on the lock: {waited}")
print("PASS: exactly one winner per scenario, the others queued behind it" if not fail else "FAIL: " + "; ".join(fail))
sys.exit(1 if fail else 0)
PY
RC=$?

cat >"$TMP/check.sql" <<SQL
select jsonb_build_object(
  'usages', (select count(*) from public.session_usages where client_package_id = '$CP' and kind = 'deduct'),
  'used', public.client_package_used('$CP'),
  'stock', (select stock_qty from public.products where id = '$PRODUCT'),
  'sale_movements', (select count(*) from public.stock_movements where product_id = '$PRODUCT' and kind = 'sale'),
  'movement_sum', (select sum(quantity) from public.stock_movements where product_id = '$PRODUCT'),
  'issued', (select count(*) from public.invoices where business_id = '$BIZ' and status = 'issued' and id <> (select invoice_id from public.client_packages where id = '$CP')),
  'invoice_next_no', (select invoice_next_no from public.branches where id = '$BRANCH')) as out;
SQL
STORED="$(q "$TMP/check.sql" | python3 -c 'import sys,json; print(json.dumps(json.load(sys.stdin)["rows"][0]["out"]))')"
echo "stored state: $STORED"
echo "$STORED" | python3 -c '
import sys, json
d = json.load(sys.stdin)
want = {"usages": 1, "used": 1, "stock": 0, "sale_movements": 1, "movement_sum": 0, "issued": 1, "invoice_next_no": 3}
bad = {k: (d[k], v) for k, v in want.items() if d[k] != v}
print("PASS: stored rows agree (1 usage, stock 0, 1 sale, gapless numbers)" if not bad else "FAIL stored: %s" % bad)
sys.exit(1 if bad else 0)' || RC=1

cat >"$TMP/teardown.sql" <<SQL
alter table public.member_role_assignments disable trigger member_role_assignments_last_owner;
delete from public.businesses where id = '$BIZ';
alter table public.member_role_assignments enable trigger member_role_assignments_last_owner;
delete from auth.users where id = '$USER_ID';
SQL
q "$TMP/teardown.sql" >/dev/null && echo "teardown: fixture deleted"
exit $RC
