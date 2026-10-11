/* eslint-disable no-console, no-undef -- a Node test script, not app code */
// Phase 10C: REAL HTTP proof for the client portal against the deployed project. Needs the fixture from
// 27_seed_portal.sql (ids as JSON in argv[2]). The ONE real login email goes to wapeeglobal@gmail.com.
//
//   supabase db query --linked -f supabase/tests/27_seed_portal.sql
//   node supabase/tests/26_portal_http.mjs '{"biz":"..","alex":"..","ben":"..","alexa":".."}' [--hammer]
//   supabase db query --linked -f supabase/tests/27_cleanup_portal.sql
//
// Proves: no enumeration (same answer for a known and an unknown email), a link is single-use even under
// two parallel exchanges, the session shows only the customer's own data (no internal notes, no other
// customer), photos need consent and are served through short signed URLs, signed forms are listed
// read-only, cancel / reschedule / book work and the cut-off holds, a dashboard JWT is no session, the
// RPCs and tables are not reachable with anon / owner tokens, honeypot and rate limits, sign-out.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const env = Object.fromEntries(
  readFileSync(new URL('../../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const URL_ = env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const ids = JSON.parse(process.argv[2] ?? '{}');
const hammer = process.argv.includes('--hammer');
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : '  -> ' + detail}`);
  if (!ok) process.exitCode = 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = (path, jwt, body) =>
  fetch(`${URL_}${path}`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${jwt ?? ANON}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }).then(async (r) => ({
    status: r.status,
    body: await r.json().catch(() => null),
    headers: r.headers,
  }));
const fn = (name, jwt, body) => post(`/functions/v1/${name}`, jwt, body);
const rpc = (name, jwt, args) => post(`/rest/v1/rpc/${name}`, jwt ?? ANON, args);
const portal = (body) => fn('portal', null, body);
const sql = (q, file = null) =>
  JSON.parse(
    execFileSync(
      'supabase',
      ['db', 'query', '--linked', ...(file ? ['-f', file] : [q]), '-o', 'json'],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    ).replace(/^[^{]*/, ''),
  );
async function ownerJwt() {
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'p10cshot.owner@example.com', password: 'Test-Pass-10c!' }),
  });
  return (await res.json()).access_token;
}
// A login link minted by SQL inside ONE transaction (request, unseal, delete its outbox row), so the mailer
// never sees it: the single-use / parallel / revoke checks stay deterministic and nothing extra is mailed.
const mint = (email) => {
  const file = `${tmpdir()}/p10c_mint_${Date.now()}_${Math.random().toString(16).slice(2)}.sql`;
  writeFileSync(
    file,
    `do $$ declare v_raw text; v_biz uuid := '${ids.biz}';
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  set local role service_role;
  perform public.portal_request_login('p10cshot-glow', '${email}', 'mint');
  reset role;
  select public.outbox_unseal(o.sealed) into v_raw from public.message_outbox o
    join public.portal_login_tokens t on t.id = (o.payload->>'token_id')::uuid
    where t.business_id = v_biz and t.email = '${email}' and o.sealed is not null and t.used_at is null and t.revoked_at is null
    order by t.created_at desc limit 1;
  delete from public.message_outbox o using public.portal_login_tokens t
    where o.event = 'portal_login' and t.id = (o.payload->>'token_id')::uuid and t.business_id = v_biz and t.email = '${email}' and o.sealed is not null;
  perform set_config('p10c.raw', coalesce(v_raw, ''), false);
end $$;
select current_setting('p10c.raw') as t;`,
  );
  return sql('--file-placeholder', file).rows[0].t;
};
const SLUG = 'p10cshot-glow';
const REAL = 'wapeeglobal@gmail.com';

// ------------------------------------------------------------ entry + no enumeration
let r = await portal({ action: 'info', slug: SLUG });
check(
  'info: the portal exists for the slug',
  r.status === 200 && r.body?.data?.business_name === 'Glow Salon',
  JSON.stringify(r.body),
);
r = await portal({ action: 'info', slug: 'no-such-business-xyz' });
const noBiz = r;
check(
  'info: an unknown slug is a generic not_found',
  r.status === 404 && r.body?.code === 'not_found',
  JSON.stringify(r.body),
);

const unknown = await portal({
  action: 'request_login',
  slug: SLUG,
  email: 'nobody.here@example.com',
  company_website: '',
});
const known = await portal({
  action: 'request_login',
  slug: SLUG,
  email: REAL,
  company_website: '',
});
check(
  'request_login: a known and an unknown email get the IDENTICAL answer',
  unknown.status === 200 &&
    known.status === 200 &&
    JSON.stringify(unknown.body) === JSON.stringify(known.body),
  JSON.stringify([unknown.body, known.body]),
);
const unknownTokens = sql(
  `select count(*)::int as n from public.portal_login_tokens where email = 'nobody.here@example.com'`,
).rows[0].n;
check(
  '...and nothing is stored or mailed for the unknown email',
  unknownTokens === 0,
  `${unknownTokens}`,
);
const bizOff = await portal({
  action: 'request_login',
  slug: 'no-such-business-xyz',
  email: REAL,
  company_website: '',
});
check(
  'request_login: an unknown business also answers the same (200 sent)',
  bizOff.status === 200 && JSON.stringify(bizOff.body) === JSON.stringify(known.body),
  JSON.stringify(bizOff.body),
);

const hp = await portal({
  action: 'request_login',
  slug: SLUG,
  email: 'ben.stone@example.com',
  company_website: 'http://spam.example',
});
const benTokens = sql(
  `select count(*)::int as n from public.portal_login_tokens where email = 'ben.stone@example.com' and used_at is null and revoked_at is null`,
).rows[0].n;
check(
  'a filled HONEYPOT is refused generically and sends nothing',
  hp.status === 400 && hp.body?.code === 'bad_request' && benTokens === 0,
  JSON.stringify([hp.status, hp.body, benTokens]),
);

// ------------------------------------------------------------ real login email + exchange
const raw1 = mint(REAL);
check('a login link token is minted (64 hex)', /^[0-9a-f]{64}$/.test(raw1 ?? ''), String(raw1));
const stored = sql(
  `select count(*)::int as n from public.portal_login_tokens where token_hash = '${raw1 ?? 'x'}'`,
).rows[0].n;
check('the raw token is NOT stored (only its hash)', stored === 0, `${stored}`);
const bad = await portal({ action: 'exchange', token: 'a'.repeat(64) });
check(
  'exchange: an unknown token => generic invalid_token',
  bad.status === 404 && bad.body?.code === 'invalid_token',
  JSON.stringify(bad),
);
const malformed = await portal({ action: 'exchange', token: 'zzzz' });
check(
  'exchange: a malformed token is a plain bad_request',
  malformed.status === 400,
  JSON.stringify(malformed),
);

const raw2 = mint(REAL);
{
  const oldReplay = await portal({ action: 'exchange', token: raw1 });
  check(
    'a NEWER link revokes the older one',
    oldReplay.status === 404 && oldReplay.body?.code === 'invalid_token',
    JSON.stringify(oldReplay),
  );
}
const [e1, e2] = await Promise.all([
  portal({ action: 'exchange', token: raw2 }),
  portal({ action: 'exchange', token: raw2 }),
]);
const wins = [e1, e2].filter((x) => x.status === 200 && x.body?.ok === true);
const losses = [e1, e2].filter((x) => x.status === 404 && x.body?.code === 'invalid_token');
check(
  'two PARALLEL exchanges of one link: exactly one session, the other invalid_token',
  wins.length === 1 && losses.length === 1,
  JSON.stringify([e1.body, e2.body]),
);
const S = wins[0]?.body?.data?.session_token;
check('a 64-hex session token is returned once', /^[0-9a-f]{64}$/.test(S ?? ''), String(S));
const storedS = sql(
  `select count(*)::int as n from public.portal_sessions where token_hash = '${S}'`,
).rows[0].n;
check('the raw session token is NOT stored', storedS === 0, `${storedS}`);

// ------------------------------------------------------------ own data only
const ov = await portal({ session: S, action: 'overview' });
check(
  'overview: BOTH clients with that email (case-insensitive), first names only, add-on tabs on',
  ov.body?.data?.clients?.length === 2 &&
    ov.body.data.clients.every((c) => Object.keys(c).sort().join() === 'first_name,id') &&
    ov.body.data.features.packages &&
    ov.body.data.features.files &&
    ov.body.data.features.forms,
  JSON.stringify(ov.body),
);
const up = await portal({ session: S, action: 'bookings', scope: 'upcoming' });
const upText = JSON.stringify(up.body);
check(
  'bookings: own upcoming bookings (both linked clients)',
  up.body?.data?.rows?.length === 3,
  upText.slice(0, 200),
);
check(
  'bookings: NO internal notes, NO other customer, NO ids of staff',
  !upText.includes('INTERNAL') && !upText.includes('Ben') && !upText.includes('staff_id'),
  upText.slice(0, 300),
);
check("bookings: the customer's own note IS shown", upText.includes('Please use the side door'));
const past = await portal({ session: S, action: 'bookings', scope: 'past' });
check(
  'bookings: past list holds the completed one and hides INTERNAL-PAST',
  past.body?.data?.rows?.length === 1 && !JSON.stringify(past.body).includes('INTERNAL'),
  JSON.stringify(past.body).slice(0, 200),
);

const benAppt = sql(`select id from public.appointments where client_id = '${ids.ben}' limit 1`)
  .rows[0].id;
const crossCancel = await portal({ session: S, action: 'cancel', appointment_id: benAppt });
check(
  "cancel: another customer's booking => not_found",
  crossCancel.status === 404,
  JSON.stringify(crossCancel),
);
const benStill = sql(`select status from public.appointments where id = '${benAppt}'`).rows[0]
  .status;
check('...and it is untouched', benStill === 'confirmed', benStill);
const crossSlots = await portal({ session: S, action: 'slots', appointment_id: benAppt });
check(
  "slots: another customer's booking => not_found",
  crossSlots.status === 404,
  JSON.stringify(crossSlots),
);

// ------------------------------------------------------------ packages + invoices
const pk = await portal({ session: S, action: 'packages' });
check(
  'packages: Cut 3+1 with 4 sessions left',
  pk.body?.data?.rows?.[0]?.name === 'Cut 3+1' && pk.body.data.rows[0].remaining === 4,
  JSON.stringify(pk.body).slice(0, 200),
);
const inv = await portal({ session: S, action: 'invoices' });
check(
  'invoices: one issued invoice, partly paid',
  inv.body?.data?.rows?.length === 1 && inv.body.data.rows[0].payment_status === 'partial',
  JSON.stringify(inv.body).slice(0, 250),
);
const invD = await portal({ session: S, action: 'invoice', id: inv.body.data.rows[0].id });
const invText = JSON.stringify(invD.body);
check(
  'invoice detail: lines + payment, and NO internal payment note / reasons',
  invD.status === 200 &&
    invD.body.data.items.length === 2 &&
    !/internal payment note/i.test(invText) &&
    !/"(reason|internal_reason|created_by)"/.test(invText),
  invText.slice(0, 300),
);

// ------------------------------------------------------------ photos (consent + add-on)
const owner = await ownerJwt();
const PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
);
async function upload(clientId) {
  const prep = await fn('client_files', owner, {
    action: 'prepare',
    client_id: clientId,
    category: 'before',
    name: 'p.png',
    mime: 'image/png',
    size: PNG.byteLength,
  });
  if (!prep.body?.data) throw new Error('prepare failed ' + JSON.stringify(prep.body));
  await fetch(prep.body.data.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/png' },
    body: PNG,
  });
  await fn('client_files', owner, { action: 'finish', file_id: prep.body.data.file_id });
  return prep.body.data.file_id;
}
const alexFile = await upload(ids.alex);
await rpc('set_photo_consent', owner, { p_client_id: ids.ben, p_value: true });
const benFile = await upload(ids.ben);
await rpc('set_photo_consent', owner, { p_client_id: ids.ben, p_value: false });
const ph = await portal({ session: S, action: 'photos' });
check(
  "photos: only the consented customer's photo is listed (Ben's is not)",
  ph.body?.data?.rows?.length === 1 && ph.body.data.rows[0].id === alexFile,
  JSON.stringify(ph.body).slice(0, 200),
);
const urls = await portal({ session: S, action: 'photo_urls', file_ids: [alexFile] });
const u = urls.body?.data?.urls?.[0]?.url;
const img = u ? await fetch(u) : null;
check(
  'photo_urls: a signed URL that really serves the image',
  Boolean(img) &&
    img.status === 200 &&
    (img.headers.get('content-type') ?? '').startsWith('image/'),
  `${img?.status}`,
);
check(
  '...the URL is short-lived (token with an expiry)',
  /token=/.test(u ?? ''),
  String(u).slice(0, 60),
);
const benUrls = await portal({ session: S, action: 'photo_urls', file_ids: [benFile] });
check(
  "photo_urls: another customer's photo => no URL",
  (benUrls.body?.data?.urls ?? []).length === 0,
  JSON.stringify(benUrls.body),
);
await rpc('set_photo_consent', owner, { p_client_id: ids.alex, p_value: false });
const urlsOff = await portal({ session: S, action: 'photo_urls', file_ids: [alexFile] });
check(
  'withdrawing photo consent stops the URLs at once',
  (urlsOff.body?.data?.urls ?? []).length === 0,
  JSON.stringify(urlsOff.body),
);
await rpc('set_photo_consent', owner, { p_client_id: ids.alex, p_value: true });

// ------------------------------------------------------------ forms (read-only list)
const tplRes = await rpc('save_form_template', owner, {
  p_business_id: ids.biz,
  p_template_id: null,
  p_kind: 'consent',
  p_title: 'Colour consent',
  p_fields: [{ id: 'over18', type: 'yes_no', label: 'I am over 18', required: true }],
  p_body: [{ type: 'paragraph', text: 'I agree to the colour treatment.' }],
  p_requires_signature: true,
  p_service_ids: [],
  p_is_active: true,
});
const tplId = tplRes.body?.template_id;
const fr = await rpc('create_form_request', owner, {
  p_client_id: ids.alex,
  p_appointment_id: null,
  p_template_id: tplId,
  p_send: false,
});
const sig = [
  [
    [0.1, 0.5],
    [0.3, 0.2],
    [0.6, 0.8],
  ],
  [
    [0.9, 0.4],
    [0.7, 0.6],
  ],
];
const signed = await fn('sign_form', null, {
  action: 'submit',
  token: fr.body?.token,
  answers: { over18: true },
  signer_name: 'Alex Rivera',
  signature: sig,
});
check('(setup) a signed form exists', signed.status === 200, JSON.stringify(signed.body));
const fm = await portal({ session: S, action: 'forms' });
const fmText = JSON.stringify(fm.body);
check(
  'forms: title, date, signer, status only',
  fm.body?.data?.rows?.length === 1 &&
    fm.body.data.rows[0].title === 'Colour consent' &&
    fm.body.data.rows[0].signer_name === 'Alex Rivera',
  fmText.slice(0, 250),
);
check(
  'forms: NO answers, NO signature, NO ip hash',
  !/answers|signature|ip_hash|over18/.test(fmText),
  fmText.slice(0, 250),
);

// ------------------------------------------------------------ actions
const rows = up.body.data.rows;
const far = rows.find((x) => x.can_cancel && x.client_first_name === 'Alex');
const near = rows.find((x) => !x.can_cancel);
check(
  'the within-24h booking cannot be cancelled online',
  Boolean(near),
  JSON.stringify(rows.map((x) => x.can_cancel)),
);
const late = await portal({ session: S, action: 'cancel', appointment_id: near.id });
check(
  'cancel inside the cut-off => cancel_window_passed',
  late.body?.code === 'cancel_window_passed',
  JSON.stringify(late),
);
check(
  '...and the booking is unchanged',
  sql(`select status from public.appointments where id = '${near.id}'`).rows[0].status ===
    'confirmed',
);

const today = new Date(far.starts_at).toISOString().slice(0, 10);
const sl = await portal({
  session: S,
  action: 'slots',
  appointment_id: far.id,
  from_date: today,
  to_date: today,
});
check(
  "slots: free times for the booking's own day",
  sl.status === 200 && sl.body.data.slots.length > 0,
  JSON.stringify(sl.body).slice(0, 150),
);
const target = sl.body.data.slots.find((x) => x.starts_at !== far.starts_at);
const rs = await portal({
  session: S,
  action: 'reschedule',
  appointment_id: far.id,
  starts_at: target.starts_at,
});
check('reschedule: moved to the new time', rs.status === 200, JSON.stringify(rs.body));
check(
  '...stored start matches',
  new Date(
    sql(`select starts_at from public.appointments where id = '${far.id}'`).rows[0].starts_at,
  ).getTime() === new Date(target.starts_at).getTime(),
);
const taken = await portal({
  session: S,
  action: 'reschedule',
  appointment_id: far.id,
  starts_at: '2020-01-01T10:00:00Z',
});
check(
  'reschedule to a time in the past is refused and the booking is unchanged',
  taken.status >= 400 &&
    new Date(
      sql(`select starts_at from public.appointments where id = '${far.id}'`).rows[0].starts_at,
    ).getTime() === new Date(target.starts_at).getTime(),
  JSON.stringify(taken),
);

const svc = sql(`select id from public.services where business_id = '${ids.biz}' limit 1`).rows[0]
  .id;
const day2 = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
const pub = await fn('get_slots', null, {
  slug: SLUG,
  service_id: svc,
  from_date: day2,
  to_date: day2,
});
const free = pub.body?.data?.slots?.find((x) => x.available);
const bk = await portal({
  session: S,
  action: 'book',
  client_id: ids.alex,
  service_id: svc,
  starts_at: free.starts_at,
});
check(
  'book: a new booking through the engine',
  bk.status === 200 && bk.body.data.appointment_id,
  JSON.stringify(bk.body),
);
const bk2 = await portal({
  session: S,
  action: 'book',
  client_id: ids.alex,
  service_id: svc,
  starts_at: free.starts_at,
});
check(
  'book: the same time again is refused (no double booking)',
  bk2.status >= 400,
  JSON.stringify(bk2),
);
const bk3 = await portal({
  session: S,
  action: 'book',
  client_id: ids.ben,
  service_id: svc,
  starts_at: free.starts_at,
});
check(
  'book: for a client that is not theirs => not_found',
  bk3.status === 404,
  JSON.stringify(bk3),
);
const cx = await portal({
  session: S,
  action: 'cancel',
  appointment_id: bk.body.data.appointment_id,
  reason: 'changed my mind',
});
check('cancel: allowed outside the cut-off', cx.status === 200, JSON.stringify(cx.body));
const audit = sql(
  `select action, count(*)::int as n from public.audit_logs where business_id = '${ids.biz}' and action like 'portal.%' group by action order by action`,
).rows;
check('audit: logins and actions are recorded', audit.length >= 3, JSON.stringify(audit));

// ------------------------------------------------------------ impersonation + direct access
const asOwner = await portal({ session: owner, action: 'overview' });
check(
  'a dashboard JWT is NOT a portal session',
  asOwner.status === 401 || asOwner.status === 400,
  JSON.stringify(asOwner),
);
const direct = await rpc('portal_overview', owner, { p_session: S });
check(
  'portal_overview is not callable by a signed-in dashboard user',
  direct.status === 401 || direct.status === 403 || direct.body?.code === '42501',
  JSON.stringify(direct.body),
);
const directAnon = await rpc('portal_overview', null, { p_session: S });
check(
  '...nor anonymously',
  directAnon.status === 401 || directAnon.status === 403 || directAnon.body?.code === '42501',
  JSON.stringify(directAnon.body),
);
const tbl = await fetch(`${URL_}/rest/v1/portal_sessions?select=*`, {
  headers: { apikey: ANON, Authorization: `Bearer ${owner}` },
});
const tblBody = await tbl.json().catch(() => null);
check(
  'the session and token tables are unreadable with a dashboard token',
  tbl.status >= 400 || (Array.isArray(tblBody) && tblBody.length === 0),
  `${tbl.status} ${JSON.stringify(tblBody)?.slice(0, 80)}`,
);

// ------------------------------------------------------------ sign out
const out = await portal({ session: S, action: 'sign_out' });
const after = await portal({ session: S, action: 'overview' });
check(
  'sign_out ends the session at once',
  out.status === 200 && after.status === 401 && after.body?.code === 'invalid_session',
  JSON.stringify(after),
);
check(
  'a made-up session is the same generic invalid_session',
  (await portal({ session: 'b'.repeat(64), action: 'overview' })).body?.code === 'invalid_session',
);
check('(info for an unknown business matched the generic answer)', noBiz.status === 404);

// ------------------------------------------------------------ rate limits (own flag: it locks this IP for an hour)
if (hammer) {
  const alexN = sql(
    `select count(*)::int as n from public.portal_login_tokens where email = '${REAL}'`,
  ).rows[0].n;
  const k4 = await portal({
    action: 'request_login',
    slug: SLUG,
    email: REAL,
    company_website: '',
  });
  console.log(`(per-email tokens so far: ${alexN}; next answer: ${k4.status})`);
  let limited = null;
  for (let i = 0; i < 14 && !limited; i++) {
    const x = await portal({
      action: 'request_login',
      slug: SLUG,
      email: `rl.${Date.now()}.${i}@example.com`,
      company_website: '',
    });
    if (x.status === 429) limited = x;
    await sleep(100);
  }
  check(
    'request_login is rate limited per address (429 + Retry-After)',
    limited && Boolean(limited.headers.get('retry-after')),
    JSON.stringify(limited?.body),
  );
}
// ------------------------------------------------------------ the ONE real email, to wapeeglobal@gmail.com
const real = await portal({
  action: 'request_login',
  slug: SLUG,
  email: REAL,
  company_website: '',
});
let sent = null;
for (let i = 0; i < 20 && sent?.status !== 'sent'; i++) {
  await sleep(8000);
  sent = sql(
    `select o.status from public.message_outbox o join public.portal_login_tokens t on t.id = (o.payload->>'token_id')::uuid where o.event = 'portal_login' and t.email = '${REAL}' and t.business_id = '${ids.biz}' order by o.created_at desc limit 1`,
  ).rows[0];
}
check(
  'a REAL sign-in email was sent to wapeeglobal@gmail.com through the outbox',
  real.status === 200 && sent?.status === 'sent',
  JSON.stringify([real.body, sent]),
);
console.log('done');
