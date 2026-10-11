/* eslint-disable no-console -- a Node test script, not app code */
// Public multi-location booking, over REAL HTTP against the deployed Edge Functions (anon key only: these
// endpoints are public). Needs the fixture from 38_seed_multi_branch.sql (ids as JSON in argv[2]).
//
//   supabase db query --linked -f supabase/tests/38_seed_multi_branch.sql     # note the ids
//   node supabase/tests/38_multi_branch_http.mjs '{"multi":"..","solo":"..","dt":"..","up":"..",...}'
//   supabase db query --linked -f supabase/tests/38_cleanup_multi_branch.sql
//
// Proves: a business with two bookable locations asks the customer to choose (and returns nothing else);
// ?branch= by short code or by id preselects; an unknown reference, or a branch id of ANOTHER business, never
// leaks that business's data and falls back to the picker; a one-location business goes straight in and an
// unready second location is never offered; get_slots and create_booking are per location (hours, time
// zone, prices, staff); an old link / old client that sends no branch still gets the primary location; a
// foreign branch id is `not_bookable` and writes nothing; the manage view names the booked location.
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
const ids = JSON.parse(process.argv[2] ?? '{}');
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : '  -> ' + detail}`);
};

const call = async (fn, body) => {
  const res = await fetch(`${URL_}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const sql = (q) =>
  JSON.parse(
    (() => {
      const out = execFileSync('supabase', ['db', 'query', '--linked', q], { encoding: 'utf8' });
      return out.slice(out.indexOf('{'));
    })(),
  ).rows;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const day = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
const MULTI = 'mbshot-multi';
const SOLO = 'mbshot-solo';

// ---- 1. the page bootstrap ----
let r = await call('get_booking_page', { slug: MULTI });
check('two bookable locations and no reference: the picker, nothing else', r.body?.ok && r.body.data.needs_branch === true && r.body.data.branches.length === 2 && r.body.data.services === undefined, JSON.stringify(r.body).slice(0, 200));
check('...primary first, with name / address / time zone / short code', r.body?.data?.branches?.[0]?.name === 'Downtown' && r.body.data.branches[1].address === '9 Hill Road, Karachi' && r.body.data.branches[1].timezone === 'Asia/Karachi' && r.body.data.branches[1].code === 'UP');
check('...no business id, currency or settings in the picker response', !JSON.stringify(r.body).includes(ids.multi) && r.body?.data?.settings === undefined);

r = await call('get_booking_page', { slug: MULTI, branch: 'up' });
check('?branch=<short code> (any case) opens that location', r.body?.ok && r.body.data.branch.name === 'Uptown' && r.body.data.branch.id === ids.up && r.body.data.needs_branch === false, JSON.stringify(r.body).slice(0, 200));
check('...its own services and prices (Cut 4500000 PKR, Colour 9000000)', r.body?.data?.branch?.currency === 'PKR' && r.body.data.services.map((s) => `${s.name}=${s.price_minor}`).sort().join(',') === 'Colour=9000000,Cut=4500000');
check('...its own staff only (Umar, not Sara)', r.body?.data?.staff?.map((s) => s.display_name).join(',') === 'Umar');
check('...and still lists both locations so the page can offer "change location"', r.body?.data?.branches?.length === 2);

r = await call('get_booking_page', { slug: MULTI, branch_id: ids.dt });
check('branch_id (the older field) works too: Downtown, Cut 3000 GBP, staff Sara', r.body?.ok && r.body.data.branch.name === 'Downtown' && r.body.data.services.length === 1 && r.body.data.services[0].price_minor === 3000 && r.body.data.staff[0].display_name === 'Sara');

r = await call('get_booking_page', { slug: MULTI, branch: 'NOPE-1' });
check('an unknown reference is not an error: the picker', r.body?.ok && r.body.data.needs_branch === true);
r = await call('get_booking_page', { slug: MULTI, branch: ids.soloBranch });
check('a branch id of ANOTHER business: the picker, no data from that business', r.body?.ok && r.body.data.needs_branch === true && !JSON.stringify(r.body).includes('Solo'));
r = await call('get_booking_page', { slug: MULTI, branch: 'UR' });
check('the code of another business\'s (unready) location behaves like an unknown one', r.body?.ok && r.body.data.needs_branch === true);

r = await call('get_booking_page', { slug: SOLO });
check('one bookable location (the other is not ready): straight in, listed once', r.body?.ok && r.body.data.needs_branch === false && r.body.data.branch.name === 'Solo Main' && r.body.data.branches.length === 1, JSON.stringify(r.body).slice(0, 200));
r = await call('get_booking_page', { slug: SOLO, branch: ids.soloUnready });
check('asking for the unready location by id gives the bookable one, not an error', r.body?.ok && r.body.data.branch.id === ids.soloBranch);
r = await call('get_booking_page', { slug: 'mbshot-does-not-exist' });
check('an unknown slug is not_bookable', r.body?.ok === false && r.body.code === 'not_bookable');
r = await call('get_booking_page', { slug: MULTI, branch: 'bad value!' });
check('a malformed reference is bad_request', r.body?.ok === false && r.body.code === 'bad_request');

// ---- 2. slots ----
const slots = async (body) => (await call('get_slots', { slug: MULTI, service_id: ids.cut, from_date: day, to_date: day, ...body })).body;
const dt = await slots({ branch_id: ids.dt });
const up = await slots({ branch_id: ids.up });
const old = await slots({});
const mins = (s) => s?.data?.slots?.map((x) => x.local_minute).join(',');
check('Downtown slots: 09:00-16:00 in Europe/London', dt?.ok && mins(dt) === '540,600,660,720,780,840,900,960' && dt.data.timezone === 'Europe/London' && dt.data.branch_name === 'Downtown', JSON.stringify(dt).slice(0, 200));
check('Uptown slots: 12:00-15:00 in Asia/Karachi (different hours and zone)', up?.ok && mins(up) === '720,780,840,900' && up.data.timezone === 'Asia/Karachi' && up.data.branch_name === 'Uptown' && up.data.currency === 'PKR');
check('an OLD link / old client with no branch_id still gets the primary location', old?.ok && old.data.branch_name === 'Downtown' && mins(old) === mins(dt));
check('staff are per location (Uptown slots carry Umar only)', [...new Set(up.data.slots.map((s) => s.staff_name))].join(',') === 'Umar');
const foreign = await call('get_slots', { slug: MULTI, service_id: ids.cut, branch_id: ids.soloBranch, from_date: day, to_date: day });
check('another business\'s branch id: not_bookable', foreign.body?.ok === false && foreign.body.code === 'not_bookable');
const wrongSvc = await call('get_slots', { slug: MULTI, service_id: ids.color, branch_id: ids.dt, from_date: day, to_date: day });
check('a service not offered at that location has no slots', wrongSvc.body?.ok && wrongSvc.body.data.slots.length === 0);

// ---- 3. a booking at Uptown ----
await sleep(4000); // the form must have been open a few seconds (bot protection)
const first = up.data.slots[0];
const apptBefore = sql(`select count(*)::int as n from public.appointments where business_id = '${ids.multi}'`)[0].n;
const book = await call('create_booking', {
  slug: MULTI, branch_id: ids.up, service_id: ids.cut, staff_id: ids.umar, starts_at: first.starts_at,
  client: { name: 'Http Karachi', phone: '+923007770001', email: 'http.karachi@example.com' },
  start_token: up.data.start_token,
});
check('create_booking at Uptown: 201, Uptown name and PKR price', book.status === 201 && book.body?.ok && book.body.data.branch_name === 'Uptown' && book.body.data.currency === 'PKR' && book.body.data.price_minor === 4500000, JSON.stringify(book.body).slice(0, 250));
const stored = sql(`select branch_id, price_minor, staff_id from public.appointments where business_id = '${ids.multi}' order by created_at desc limit 1`)[0];
check('...stored on the Uptown branch with Uptown\'s price and staff', stored?.branch_id === ids.up && stored.price_minor === 4500000 && stored.staff_id === ids.umar, JSON.stringify(stored));
const upAfter = await slots({ branch_id: ids.up });
const dtAfter = await slots({ branch_id: ids.dt });
check('...that slot is gone at Uptown but Downtown is untouched', !mins(upAfter).split(',').includes('720') && mins(dtAfter) === mins(dt));

const manage = await call('manage_booking', { action: 'get', token: book.body?.data?.manage_token });
check('manage view: branch name + address and the branch time zone', manage.body?.ok && manage.body.data.branch_name === 'Uptown' && manage.body.data.branch_address === '9 Hill Road, Karachi' && manage.body.data.timezone === 'Asia/Karachi', JSON.stringify(manage.body).slice(0, 250));

// ---- 4. refusals write nothing ----
await sleep(3500);
const t2 = await slots({ branch_id: ids.dt });
await sleep(3500);
const bad = await call('create_booking', {
  slug: MULTI, branch_id: ids.soloBranch, service_id: ids.cut, starts_at: dt.data.slots[2].starts_at,
  client: { name: 'Http Foreign', phone: '+447700900888' }, start_token: t2.data.start_token,
});
check('create_booking with another business\'s branch id: not_bookable', bad.body?.ok === false && bad.body.code === 'not_bookable', JSON.stringify(bad.body));
const apptAfter = sql(`select count(*)::int as n from public.appointments where business_id = '${ids.multi}'`)[0].n;
const clients = sql(`select count(*)::int as n from public.clients where full_name = 'Http Foreign'`)[0].n;
check('...no appointment and no client were created by the refusal', apptAfter === apptBefore + 1 && clients === 0, `before ${apptBefore} after ${apptAfter} clients ${clients}`);

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
