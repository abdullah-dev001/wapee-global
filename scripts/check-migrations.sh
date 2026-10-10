#!/usr/bin/env bash
# Proves the migration chain replays from an EMPTY database.
#
#   npm run check:migrations
#
# What it does (needs Docker + the Supabase CLI; never touches dev or production):
#   1. starts a throwaway local Supabase stack (own project id and ports, so it does
#      not clash with `supabase start` for development);
#   2. gives it the default privileges a hosted project has (the local image differs);
#   3. applies every file in supabase/migrations in filename order, each in its own
#      transaction like `supabase db push`, and keeps going so ALL failures are listed;
#   4. checks that no function calls a `public.<function>(...)` that does not exist
#      (PL/pgSQL resolves names at run time, so a replay alone cannot see this);
#   5. stops and deletes the stack (KEEP=1 leaves it running for inspection).
# Exit code 0 = clean, 1 = a migration failed or a dangling function call was found.
set -u
cd "$(dirname "$0")/.."

PROJECT_ID="wapee-migcheck"
DB="supabase_db_${PROJECT_ID}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/wapee-migcheck.XXXXXX")"
MIG_DIR="$PWD/supabase/migrations"

command -v docker >/dev/null || { echo "docker is required"; exit 2; }
command -v supabase >/dev/null || { echo "the Supabase CLI is required"; exit 2; }
docker info >/dev/null 2>&1 || { echo "docker is installed but not running"; exit 2; }

cleanup() {
  if [ "${KEEP:-0}" != "1" ]; then
    (cd "$WORK" && supabase stop --no-backup >/dev/null 2>&1)
    rm -rf "$WORK"
  else
    echo "KEEP=1: stack left running. Container: $DB   Workdir: $WORK"
  fi
}
trap cleanup EXIT

# Private copy of the config: other project id, other ports, no seed file.
mkdir -p "$WORK/supabase/migrations"
sed -E \
  -e "s/^project_id = .*/project_id = \"$PROJECT_ID\"/" \
  -e 's/(^|[^0-9])543([0-9][0-9])([^0-9]|$)/\1553\2\3/g' \
  -e '/^\[db\.seed\]/,/^sql_paths/ s/^enabled = true/enabled = false/' \
  supabase/config.toml > "$WORK/supabase/config.toml"

echo "Starting a throwaway local database (first run downloads images)..."
(cd "$WORK" && supabase start -x studio,imgproxy,edge-runtime,vector,logflare,mailpit,postgres-meta,realtime) \
  >"$WORK/start.log" 2>&1 || { tail -20 "$WORK/start.log"; echo "could not start the local stack"; exit 2; }

psql_db() { docker exec -i "$DB" psql -U postgres -d postgres -X "$@"; }

# Hosted projects give anon/authenticated/service_role default privileges on what
# `postgres` creates in `public`; the local image does not. Several migrations rely on it.
psql_db -q <<'SQL'
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;
SQL

ok=0; fail=0
for f in "$MIG_DIR"/*.sql; do
  name="$(basename "$f")"
  if out="$(psql_db -v ON_ERROR_STOP=1 --single-transaction -q < "$f" 2>&1 >/dev/null)"; then
    ok=$((ok + 1))
  else
    fail=$((fail + 1))
    echo "FAIL $name"
    echo "$out" | grep -E "ERROR|DETAIL|HINT|LINE|CONTEXT" | head -6 | sed 's/^/    /'
  fi
done
echo "migrations: $ok applied, $fail failed"

# Dangling calls: `public.<name>(` inside a function body with no such function.
dangling="$(psql_db -At <<'SQL'
select distinct p.proname || '  ->  public.' || m[1] || '()'
from pg_proc p
cross join lateral regexp_matches(
  regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), 'public\.([a-z_][a-z0-9_]*)\s*\(', 'g') as m
where p.pronamespace = 'public'::regnamespace
  and not exists (select 1 from pg_proc q where q.pronamespace = 'public'::regnamespace and q.proname = m[1])
  and not exists (select 1 from pg_type t where t.typnamespace = 'public'::regnamespace and t.typname = m[1])
order by 1;
SQL
)"
if [ -n "$dangling" ]; then
  echo "DANGLING function calls (called but never created by any migration):"
  echo "$dangling" | sed 's/^/    /'
fi

if [ "$fail" -eq 0 ] && [ -z "$dangling" ]; then
  echo "OK: the chain replays from an empty database ($ok migrations)."
  exit 0
fi
exit 1
