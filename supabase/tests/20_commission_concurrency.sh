#!/usr/bin/env bash
# Phase 9A: REAL concurrent payments must never double-earn commission.
#
#   bash supabase/tests/20_commission_concurrency.sh
#
# A rolled-back SQL suite cannot hold two backends at once, so this commits a
# small fixture, runs three sessions in parallel through `supabase db query
# --linked` (each a separate backend), then deletes the fixture.
#
# Invoice total 2000, 1000 already paid (so no commission yet; it is only earned
# when the invoice is FULLY paid). Then:
#   A pays 1000 and HOLDS its transaction open for 8 s
#   B pays 1000 while A holds it  -> must WAIT on the invoice row lock, then see
#     the balance is 0 (overpayment) or the invoice already credited
#     (fully_credited, if C's credit note got the lock first); it must NOT earn
#   C requests a full credit note while A holds it -> waits, then runs AFTER A
#     (B and C queue in either order)
# Asserted: exactly ONE earn row per line (amount = the full commission, 200),
# sourced from A's payment; B waited >= 1.5 s and was refused; the books
# (earned - reversed) equal what the invoice's final state requires; and the
# balance backstop trigger never fired (no raised error in any session).
set -uo pipefail
cd "$(dirname "$0")/../.."
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
q() {
  local out i
  for i in 1 2 3 4 5; do
    out="$(supabase db query --linked -f "$1" 2>&1 | grep -v "^Initialising")"
    case "$out" in *LegacyDbConfigConnectTempRoleError*) sleep 0.5; continue;; esac
    break
  done
  printf '%s\n' "$out"
}

cat >"$TMP/setup.sql" <<'SQL'
do $$
declare v_u uuid := gen_random_uuid(); v_biz uuid; v_br uuid; v_svc uuid; v_cl uuid; v_st uuid; v_fv uuid; v_ap uuid; v_inv uuid; r jsonb;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values (v_u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'p9conc.' || v_u || '@example.com', extensions.crypt('pw', extensions.gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}', '{}');
  perform set_config('request.jwt.claims', json_build_object('sub', v_u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_biz := public.create_business_with_owner('P9 Conc','p9conc-'||left(v_u::text,8),'GB','GBP','Europe/London','en',null,'Main');
  reset role;
  alter table public.businesses disable trigger businesses_enforce_guard;
  update public.businesses set trial_ends_at = now() + interval '100 days' where id = v_biz;
  alter table public.businesses enable trigger businesses_enforce_guard;
  select id into v_br from public.branches where business_id = v_biz;
  insert into public.services (business_id, name, duration_minutes, buffer_minutes) values (v_biz, 'Cut', 30, 0) returning id into v_svc;
  insert into public.clients (business_id, full_name, phone_e164) values (v_biz, 'Conc Client', '+447700900999') returning id into v_cl;
  insert into public.staff_profiles (business_id, display_name, is_active) values (v_biz, 'Conc Staff', true) returning id into v_st;
  insert into public.staff_branches (staff_id, branch_id, business_id) values (v_st, v_br, v_biz);
  select id into v_fv from public.form_versions where business_id = v_biz order by version desc limit 1;
  insert into public.appointments (business_id, branch_id, client_id, service_id, staff_id, starts_at, ends_at, duration_minutes, buffer_minutes, status, source, form_version_id, price_minor)
  values (v_biz, v_br, v_cl, v_svc, v_st, '2026-08-01 10:00+00', '2026-08-01 10:30+00', 30, 0, 'completed', 'dashboard', v_fv, 2000) returning id into v_ap;
  set local role authenticated;
  r := public.set_commission_rule(v_st, null, 'percent', 1000, null, null, current_date - 1);
  if not (r->>'ok')::boolean then raise exception 'rule: %', r; end if;
  r := public.create_invoice_draft(v_br, v_ap, null, '[{"description":"Cut","quantity":1,"unit_price_minor":2000}]'::jsonb);
  v_inv := (r->>'invoice_id')::uuid;
  r := public.issue_invoice(v_inv);
  if not (r->>'ok')::boolean then raise exception 'issue: %', r; end if;
  r := public.add_payment(v_inv, 'cash', 1000);
  if not (r->>'ok')::boolean then raise exception 'pay: %', r; end if;
  reset role;
end $$;
SQL
echo "setup: committing fixture"
q "$TMP/setup.sql" >/dev/null

cat >"$TMP/ids.sql" <<'SQL'
select jsonb_build_object('user', u.id, 'biz', b.id, 'inv', i.id) as fx
from auth.users u
join public.businesses b on b.slug like 'p9conc-%' and u.email like 'p9conc.%'
join public.invoices i on i.business_id = b.id
order by b.created_at desc limit 1;
SQL
FX="$(q "$TMP/ids.sql" | python3 -c 'import sys,json; print(json.dumps(json.load(sys.stdin)["rows"][0]["fx"]))')"
USER_ID="$(echo "$FX" | python3 -c 'import sys,json; print(json.load(sys.stdin)["user"])')"
BIZ="$(echo "$FX" | python3 -c 'import sys,json; print(json.load(sys.stdin)["biz"])')"
INV="$(echo "$FX" | python3 -c 'import sys,json; print(json.load(sys.stdin)["inv"])')"

cat >"$TMP/A.sql" <<SQL
select set_config('request.jwt.claims', '{"sub":"$USER_ID","role":"authenticated"}', true);
set local role authenticated;
with a as materialized (select clock_timestamp() as t0, public.add_payment('$INV', 'cash', 1000) as r)
select jsonb_build_object('t0', a.t0, 'r', a.r, 't1', clock_timestamp(), 'slept', (select count(*) from pg_sleep(8))) as out from a;
SQL
cat >"$TMP/B.sql" <<SQL
select set_config('request.jwt.claims', '{"sub":"$USER_ID","role":"authenticated"}', true);
set local role authenticated;
with a as materialized (select clock_timestamp() as t0, public.add_payment('$INV', 'cash', 1000) as r)
select jsonb_build_object('t0', a.t0, 'r', a.r, 't1', clock_timestamp()) as out from a;
SQL
cat >"$TMP/C.sql" <<SQL
select set_config('request.jwt.claims', '{"sub":"$USER_ID","role":"authenticated"}', true);
set local role authenticated;
with a as materialized (select clock_timestamp() as t0, public.create_credit_note('$INV', 'concurrent full credit') as r)
select jsonb_build_object('t0', a.t0, 'r', a.r, 't1', clock_timestamp()) as out from a;
SQL

echo "running A (pays, holds 8s), then B (pays) and C (credit note) in parallel"
q "$TMP/A.sql" >"$TMP/A.out" &
PA=$!
sleep 1.5
q "$TMP/B.sql" >"$TMP/B.out" &
PB=$!
sleep 1.5
q "$TMP/C.sql" >"$TMP/C.out" &
PC=$!
wait $PA || true; wait $PB || true; wait $PC || true

cat >"$TMP/check.sql" <<SQL
select jsonb_build_object(
  'entries', (select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'amount', amount_minor, 'reason', reason, 'by_payment', source_payment_id is not null, 'by_cn', source_credit_note_id is not null) order by kind desc, amount_minor), '[]') from public.commission_entries where invoice_id = '$INV'),
  'lines', (select count(*) from public.commission_lines where invoice_id = '$INV'),
  'earned', (select coalesce(sum(amount_minor) filter (where kind = 'earn'), 0) from public.commission_entries where invoice_id = '$INV'),
  'reversed', (select coalesce(sum(amount_minor) filter (where kind = 'reversal'), 0) from public.commission_entries where invoice_id = '$INV'),
  'payments', (select coalesce(sum(amount_minor), 0) from public.invoice_payments where invoice_id = '$INV' and kind = 'payment'),
  'credit_notes', (select count(*) from public.credit_notes where invoice_id = '$INV')) as out;
SQL
CHECK="$(q "$TMP/check.sql" | python3 -c 'import sys,json; print(json.dumps(json.load(sys.stdin)["rows"][0]["out"]))')"

python3 - "$TMP" "$CHECK" <<'PY'
import json, sys, re, datetime as dt
tmp, check = sys.argv[1], json.loads(sys.argv[2])
def load(n):
    raw = open(f"{tmp}/{n}.out").read()
    try:
        return json.loads(raw)["rows"][0]["out"]
    except Exception:
        print("session", n, "returned:", raw[:600]); raise
def ts(s):
    s = s.replace("Z", "+00:00")
    s = re.sub(r"\.(\d+)", lambda m: "." + m.group(1).ljust(6, "0")[:6], s)
    return dt.datetime.fromisoformat(s)
o = {n: load(n) for n in "ABC"}
for n in "ABC":
    r = o[n]["r"]
    print(n, "ok" if r.get("ok") else r.get("code"), "took %.2fs" % (ts(o[n]["t1"]) - ts(o[n]["t0"])).total_seconds())
print("stored:", json.dumps(check))
fail = []
if not o["A"]["r"].get("ok"): fail.append("A's payment should succeed")
# whichever of B and C gets the lock after A decides B's answer: the balance is 0
# (overpayment) or the invoice was already fully credited (fully_credited). Never ok.
if o["B"]["r"].get("ok") or o["B"]["r"].get("code") not in ("overpayment", "fully_credited"): fail.append(f"B must be refused (overpayment / fully_credited), got {o['B']['r']}")
if (ts(o["B"]["t1"]) - ts(o["B"]["t0"])).total_seconds() < 1.5: fail.append("B did not wait on the invoice lock")
if not o["C"]["r"].get("ok"): fail.append(f"C's credit note should succeed after A, got {o['C']['r']}")
if (ts(o["C"]["t1"]) - ts(o["C"]["t0"])).total_seconds() < 1.5: fail.append("C did not wait on the invoice lock")
earns = [e for e in check["entries"] if e["kind"] == "earn"]
revs = [e for e in check["entries"] if e["kind"] == "reversal"]
if check["lines"] != 1: fail.append("one snapshot line expected")
if len(earns) != 1 or earns[0]["amount"] != 200: fail.append(f"exactly ONE earn of 200 expected, got {earns}")
if not earns or not earns[0]["by_payment"]: fail.append("the earn must come from A's payment")
if check["payments"] != 2000: fail.append(f"payments should total 2000 (A's and the setup), got {check['payments']}")
# C ran after A: the full credit note reverses the whole commission, once
if len(revs) != 1 or revs[0]["amount"] != 200 or revs[0]["reason"] != "credit_note": fail.append(f"exactly one 200 credit_note reversal expected, got {revs}")
if check["earned"] - check["reversed"] != 0: fail.append("a fully credited invoice must net to 0 commission")
print("PASS: one earn only, B refused after waiting, C reversed exactly once, books net to 0" if not fail else "FAIL: " + "; ".join(fail))
sys.exit(1 if fail else 0)
PY
RC=$?

cat >"$TMP/teardown.sql" <<SQL
alter table public.member_role_assignments disable trigger member_role_assignments_last_owner;
delete from public.businesses where id = '$BIZ';
alter table public.member_role_assignments enable trigger member_role_assignments_last_owner;
delete from auth.users where id = '$USER_ID';
SQL
q "$TMP/teardown.sql" >/dev/null && echo "teardown: fixture deleted"
exit $RC
