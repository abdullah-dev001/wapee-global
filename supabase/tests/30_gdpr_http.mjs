/* eslint-disable no-console -- a Node test script, not app code */
// Phase 11A: REAL HTTP proof for the `gdpr` Edge Function, the column lock and the Storage cleanup, against the
// deployed project. Needs the fixture from 30_seed_gdpr.sql (ids as JSON in argv[2]). The service key is read at
// RUNTIME from the CLI (never stored, never printed) and is used ONLY to upload / list the fixture's objects.
//
//   supabase db query --linked -f supabase/tests/30_seed_gdpr.sql      # note the ids
//   node supabase/tests/30_gdpr_http.mjs '{"biz":"..","biz2":"..","erin":"..","gina":"..","invoice":".."}'
//   supabase db query --linked -f supabase/tests/30_cleanup_gdpr.sql
//
// Proves: the erase function refuses anon / a manager / a stranger and leaves every object in place; an owner's
// erase removes the REAL bucket objects (checked through the Storage API, not the database), keeps the control
// client's object, is idempotent; the business erase refuses a wrong name and a non-owner, empties both
// buckets first, then deletes the business; clients.phone_e164 / email cannot be read through REST at all.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const env = Object.fromEntries(
  readFileSync(new URL('../../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const URL_ = env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const REF = 'rfuovquhultjydtswtqf';
const ids = JSON.parse(process.argv[2] ?? '{}');
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : '  -> ' + detail}`);
};

const keys = JSON.parse(
  execFileSync('supabase', ['projects', 'api-keys', '--project-ref', REF, '-o', 'json'], {
    encoding: 'utf8',
  }),
);
const SERVICE = keys.find((k) => k.id === 'service_role' || k.name === 'service_role')?.api_key;
if (!SERVICE) throw new Error('service key unavailable');

async function login(email) {
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Test-Pass-11a!' }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error('login failed for ' + email + ': ' + JSON.stringify(j));
  return j.access_token;
}
const j = (r) => r.json().catch(() => null);
const fn = (jwt, body) =>
  fetch(`${URL_}/functions/v1/gdpr`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${jwt ?? ANON}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await j(r) }));
const rest = (jwt, path, init = {}) =>
  fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  }).then(async (r) => ({ status: r.status, body: await j(r) }));
const svcStorage = (path, init = {}) =>
  fetch(`${URL_}/storage/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, ...(init.headers ?? {}) },
  });

const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
);
const upload = (bucket, path) =>
  svcStorage(`object/${bucket}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/png', 'x-upsert': 'true' },
    body: PNG,
  });
const exists = async (bucket, path) => {
  const dir = path.slice(0, path.lastIndexOf('/'));
  const name = path.slice(path.lastIndexOf('/') + 1);
  const r = await svcStorage(`object/list/${bucket}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: dir, limit: 100 }),
  });
  const rows = (await j(r)) ?? [];
  return rows.some((x) => x.name === name);
};
const list = async (bucket, prefix) => {
  const r = await svcStorage(`object/list/${bucket}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix, limit: 100 }),
  });
  return (await j(r)) ?? [];
};
const db = (q) =>
  JSON.parse(
    execFileSync('supabase', ['db', 'query', '--linked', q, '-o', 'json'], { encoding: 'utf8' }),
  ).rows;

const pa = `${ids.biz}/${ids.erin}/a.png`;
const pb = `${ids.biz}/${ids.erin}/b.png`;
const pg = `${ids.biz}/${ids.gina}/g.png`;
const pw = `${ids.biz}/site/hero.png`;

// ---- 0. orphans left by earlier phases (a business deleted by SQL leaves its objects)
{
  const biz = new Set(db('select id from public.businesses').map((r) => r.id));
  const referenced = new Set(db('select storage_path p from public.files').map((r) => r.p));
  const sites = new Set(
    db('select logo_path a, hero_image_path b from public.websites').flatMap((r) => [r.a, r.b]),
  );
  let removed = 0;
  for (const bucket of ['client-files', 'website-assets']) {
    for (const top of await list(bucket, '')) {
      if (biz.has(top.name) || top.id !== null) continue;
      const stack = [top.name];
      while (stack.length) {
        const dir = stack.pop();
        for (const e of await list(bucket, dir)) {
          if (e.id === null) stack.push(`${dir}/${e.name}`);
          else {
            const p = `${dir}/${e.name}`;
            if (referenced.has(p) || sites.has(p)) continue;
            const r = await svcStorage(`object/${bucket}/${p}`, { method: 'DELETE' });
            if (r.ok) removed += 1;
          }
        }
      }
    }
  }
  console.log(
    `INFO  orphaned objects (business no longer exists, no row refers to them) removed: ${removed}`,
  );
}

const owner = await login('p11shot.owner@example.com');
const mgr = await login('p11shot.mgr@example.com');
const staff = await login('p11shot.staff@example.com');
const other = await login('p11shot.other@example.com');

// ---- 1. the column lock over REST
{
  const a = await rest(owner, 'clients?select=phone_e164');
  const b = await rest(owner, 'clients?select=email');
  const c = await rest(owner, 'clients?select=*');
  check(
    'REST: owner cannot select clients.phone_e164 / email / * (permission denied)',
    a.status === 403 && b.status === 403 && c.status === 403,
    `${a.status}/${b.status}/${c.status} ${JSON.stringify(a.body)}`,
  );
  const d = await rest(owner, 'clients_v?select=full_name,phone_e164,email&order=full_name');
  check(
    'REST: owner reads clients_v with phone and email',
    d.status === 200 && d.body.length === 2 && d.body.every((r) => r.phone_e164 && r.email),
    JSON.stringify(d.body),
  );
  const e = await rest(staff, 'clients_v?select=full_name,phone_e164,email');
  check(
    'REST: a Staff member (own scope) gets NO contact data (null), only their own client',
    e.status === 200 &&
      e.body.length === 1 &&
      e.body[0].phone_e164 === null &&
      e.body[0].email === null,
    JSON.stringify(e.body),
  );
  const f = await rest(staff, 'clients_v?select=full_name&phone_e164=ilike.*930001*');
  check(
    'REST: a Staff member cannot probe phone numbers through a filter',
    f.status === 200 && f.body.length === 0,
    JSON.stringify(f.body),
  );
  const g = await rest(other, 'clients_v?select=full_name');
  check(
    'REST: a stranger sees nothing of this business',
    g.status === 200 && g.body.length === 0,
    JSON.stringify(g.body),
  );
}

// ---- 2. export over REST
{
  const r = await rest(owner, 'rpc/gdpr_export_client', {
    method: 'POST',
    body: JSON.stringify({ p_client_id: ids.erin }),
  });
  check(
    'export: owner gets the client, appointments, invoice and files metadata (no storage path)',
    r.status === 200 &&
      r.body.ok === true &&
      r.body.client.email === 'erin.eraseme@example.com' &&
      r.body.appointments.length === 1 &&
      r.body.invoices.length === 1 &&
      r.body.files.length === 2 &&
      !JSON.stringify(r.body).includes('storage_path'),
    JSON.stringify(r.body).slice(0, 300),
  );
  const s = await rest(staff, 'rpc/gdpr_export_client', {
    method: 'POST',
    body: JSON.stringify({ p_client_id: ids.erin }),
  });
  check('export: Staff refused (not_found)', s.body?.code === 'not_found', JSON.stringify(s.body));
  const a = await rest(ANON, 'rpc/gdpr_export_client', {
    method: 'POST',
    body: JSON.stringify({ p_client_id: ids.erin }),
  });
  check('export: anon key refused', a.status === 401 || a.status === 403, String(a.status));
}

// ---- 3. real objects, erase one client
for (const p of [pa, pb, pg]) {
  const r = await upload('client-files', p);
  if (!r.ok) throw new Error('upload failed ' + p + ' ' + r.status);
}
check(
  'fixture: 3 real objects uploaded to client-files',
  (await exists('client-files', pa)) &&
    (await exists('client-files', pb)) &&
    (await exists('client-files', pg)),
);
{
  const a = await fn(null, { action: 'erase_client', client_id: ids.erin });
  check('erase_client: the anon key is refused (401)', a.status === 401, JSON.stringify(a));
  const m = await fn(mgr, { action: 'erase_client', client_id: ids.erin });
  check(
    'erase_client: a Manager is refused (no clients.erase)',
    m.status === 404 && m.body?.code === 'not_found',
    JSON.stringify(m),
  );
  const s = await fn(staff, { action: 'erase_client', client_id: ids.erin });
  const o = await fn(other, { action: 'erase_client', client_id: ids.erin });
  check(
    'erase_client: Staff and a stranger are refused',
    s.status === 404 && o.status === 404,
    `${s.status}/${o.status}`,
  );
  const bad = await fn(owner, { action: 'erase_client', client_id: 'nope' });
  check('erase_client: a malformed id is a 400', bad.status === 400, JSON.stringify(bad));
  check(
    '...every refusal left every object in place',
    (await exists('client-files', pa)) &&
      (await exists('client-files', pb)) &&
      (await exists('client-files', pg)),
  );
  const row = db(`select full_name, erased_at from public.clients where id = '${ids.erin}'`)[0];
  check(
    '...and the client row untouched',
    row.full_name === 'Erin Eraseme' && row.erased_at === null,
    JSON.stringify(row),
  );

  const r = await fn(owner, { action: 'erase_client', client_id: ids.erin });
  check(
    'erase_client: owner erases (ok, 2 objects removed, none pending)',
    r.status === 200 &&
      r.body.ok === true &&
      r.body.data.storage_removed === 2 &&
      r.body.data.storage_pending === 0 &&
      r.body.data.already_erased === false,
    JSON.stringify(r),
  );
  check(
    "the two REAL objects are gone from Storage; the control client's object remains",
    !(await exists('client-files', pa)) &&
      !(await exists('client-files', pb)) &&
      (await exists('client-files', pg)),
  );
  const c = db(
    `select full_name, phone_e164, email, notes, deleted_at is not null as archived, erased_at is not null as erased from public.clients where id = '${ids.erin}'`,
  )[0];
  check(
    'the client row is anonymised',
    c.full_name === 'Erased client' &&
      c.phone_e164 === '+10000000000' &&
      c.email === null &&
      c.notes === null &&
      c.archived &&
      c.erased,
    JSON.stringify(c),
  );
  const inv = db(
    `select bill_to_name, number, total_minor, status from public.invoices where id = '${ids.invoice}'`,
  )[0];
  check(
    'the issued invoice keeps its number and amount; the name is blanked',
    inv.bill_to_name === 'Erased client' &&
      inv.total_minor === 4000 &&
      inv.status === 'issued' &&
      !!inv.number,
    JSON.stringify(inv),
  );
  const q = db(
    `select count(*) filter (where done_at is not null) done, count(*) filter (where done_at is null) open from public.storage_cleanup_queue where client_id = '${ids.erin}'`,
  )[0];
  check(
    'the cleanup queue shows both objects done',
    Number(q.done) === 2 && Number(q.open) === 0,
    JSON.stringify(q),
  );
  const again = await fn(owner, { action: 'erase_client', client_id: ids.erin });
  check(
    'erase_client again: ok, already_erased, nothing more to remove',
    again.status === 200 &&
      again.body.data.already_erased === true &&
      again.body.data.storage_removed === 0,
    JSON.stringify(again),
  );
  const gina = db(`select full_name from public.clients where id = '${ids.gina}'`)[0];
  check('the control client Gina is untouched', gina.full_name === 'Gina Keepme');
}

// ---- 4. business erase
{
  await upload('website-assets', pw);
  check('fixture: a website asset uploaded for the business', await exists('website-assets', pw));
  const noName = await fn(owner, {
    action: 'erase_business',
    business_id: ids.biz,
    confirm_name: 'wrong name',
  });
  check(
    'erase_business: wrong name -> 409 name_mismatch, nothing removed',
    noName.status === 409 &&
      noName.body?.code === 'name_mismatch' &&
      (await exists('client-files', pg)) &&
      (await exists('website-assets', pw)),
    JSON.stringify(noName),
  );
  const m = await fn(mgr, {
    action: 'erase_business',
    business_id: ids.biz,
    confirm_name: 'Shot GDPR Studio',
  });
  const o = await fn(other, {
    action: 'erase_business',
    business_id: ids.biz,
    confirm_name: 'Shot GDPR Studio',
  });
  const an = await fn(null, {
    action: 'erase_business',
    business_id: ids.biz,
    confirm_name: 'Shot GDPR Studio',
  });
  check(
    'erase_business: a Manager, a stranger and anon are refused; every object still there',
    m.status === 403 &&
      o.status === 403 &&
      an.status === 401 &&
      (await exists('client-files', pg)) &&
      (await exists('website-assets', pw)),
    `${m.status}/${o.status}/${an.status}`,
  );
  const before = db(
    `select (select count(*) from public.businesses) b, (select count(*) from public.clients where business_id = '${ids.biz2}') c2`,
  )[0];
  const ok = await fn(owner, {
    action: 'erase_business',
    business_id: ids.biz,
    confirm_name: 'Shot GDPR Studio',
  });
  check(
    'erase_business: owner + exact name -> ok with counts',
    ok.status === 200 && ok.body.ok === true && ok.body.data.counts.clients === 2,
    JSON.stringify(ok),
  );
  check(
    'both buckets are empty for that business (Storage API)',
    (await list('client-files', ids.biz)).length === 0 &&
      !(await exists('client-files', pg)) &&
      !(await exists('website-assets', pw)),
  );
  const after = db(
    `select (select count(*) from public.businesses where id = '${ids.biz}') gone, (select count(*) from public.businesses) b, (select count(*) from public.clients where business_id = '${ids.biz2}') c2, (select count(*) from public.erasure_log where business_id = '${ids.biz}') log`,
  )[0];
  check(
    'the business is gone, one erasure_log row, the OTHER business untouched',
    Number(after.gone) === 0 &&
      Number(after.log) === 1 &&
      Number(after.b) === Number(before.b) - 1 &&
      Number(after.c2) === Number(before.c2),
    JSON.stringify(after),
  );
}

const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
