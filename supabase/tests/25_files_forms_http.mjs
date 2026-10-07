/* eslint-disable no-console, no-undef -- a Node test script, not app code */
// Phase 10B: REAL HTTP proof for Files & Photos and the public signing link, against the deployed
// project. Needs the fixture from 25_seed_files_forms.sql (ids as JSON in argv[2]).
//
//   supabase db query --linked -f supabase/tests/25_seed_files_forms.sql   # note the ids
//   node supabase/tests/25_files_forms_http.mjs '{"biz":"..","alex":"..","bea":"..","tpl":"..","appt_alex":".."}'
//   supabase db query --linked -f supabase/tests/25_cleanup_files_forms.sql
//
// Proves: upload by signed URL, the real type is read from the bytes (a text file / a PDF declared as
// an image is REJECTED and removed), signed READ urls work and EXPIRE, a stranger / another client's
// scope gets nothing, the bucket cannot be read / listed / written / public-fetched through the
// Storage API, and a signing link is single-use even under two parallel submits.
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(email) {
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Test-Pass-10b!' }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error('login failed for ' + email + ': ' + JSON.stringify(j));
  return j.access_token;
}
const fn = (name, jwt, body) =>
  fetch(`${URL_}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${jwt ?? ANON}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const rpc = (name, jwt, args) =>
  fetch(`${URL_}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

// tiny valid PNG (1x1), PDF and text bytes
const PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
);
const PDF = new TextEncoder().encode('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
const TEXT = new TextEncoder().encode(
  'this is not an image, it is a script: <script>alert(1)</script>',
);

async function upload(jwt, clientId, category, name, declaredMime, bytes, appointmentId = null) {
  const prep = await fn('client_files', jwt, {
    action: 'prepare',
    client_id: clientId,
    appointment_id: appointmentId,
    category,
    name,
    mime: declaredMime,
    size: bytes.byteLength,
  });
  if (prep.status !== 200) return { prep };
  const put = await fetch(prep.body.data.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': declaredMime },
    body: bytes,
  });
  const fin = await fn('client_files', jwt, { action: 'finish', file_id: prep.body.data.file_id });
  return { prep, putStatus: put.status, fin, fileId: prep.body.data.file_id };
}

const sql = (q) =>
  JSON.parse(
    execFileSync('supabase', ['db', 'query', '--linked', q, '-o', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).replace(/^[^{]*/, ''),
  );

const owner = await login('p10bshot.owner@example.com');
const staff = await login('p10bshot.staff@example.com');
const off = await login('p10bshot.off@example.com');

// ---------------------------------------------------------------- files
let r = await upload(owner, ids.alex, 'before', 'real.png', 'image/png', PNG);
check(
  'a real PNG uploads through the signed URL and finishes as ready',
  r.prep.status === 200 &&
    r.putStatus === 200 &&
    r.fin.status === 200 &&
    r.fin.body?.data?.status === 'ready',
  JSON.stringify(r),
);
const readyId = r.fileId;

r = await upload(owner, ids.alex, 'other', 'fake.png', 'image/png', TEXT);
check(
  'a TEXT file declared as image/png is REJECTED by its real bytes',
  r.fin?.status === 422 && r.fin.body?.code === 'file_rejected',
  JSON.stringify(r.fin),
);
r = await upload(owner, ids.alex, 'other', 'doc.jpg', 'image/jpeg', PDF);
check(
  'a PDF declared as image/jpeg is REJECTED (type mismatch)',
  r.fin?.status === 422,
  JSON.stringify(r.fin),
);
const rejectedId = r.fileId;
r = await upload(owner, ids.alex, 'document', 'letter.pdf', 'application/pdf', PDF);
check('a real PDF is accepted', r.fin?.status === 200, JSON.stringify(r));
const pdfId = r.fileId;
r = await fn('client_files', owner, {
  action: 'prepare',
  client_id: ids.alex,
  category: 'other',
  name: 'a.heic',
  mime: 'image/heic',
  size: 100,
});
check(
  'HEIC is refused at prepare',
  r.status === 400 && r.body?.code === 'unsupported_type',
  JSON.stringify(r),
);
r = await fn('client_files', owner, {
  action: 'prepare',
  client_id: ids.bea,
  category: 'before',
  name: 'a.png',
  mime: 'image/png',
  size: 100,
});
check(
  'a photo for a client WITHOUT consent is refused',
  r.status === 400 && r.body?.code === 'photo_consent_required',
  JSON.stringify(r),
);
r = await fn('client_files', owner, {
  action: 'prepare',
  client_id: ids.alex,
  category: 'before',
  name: 'a.png',
  mime: 'image/png',
  size: 11 * 1024 * 1024,
});
check('over 10 MB is refused at prepare', r.body?.code === 'file_too_large', JSON.stringify(r));
const rej = sql(`select status from public.files where id = '${rejectedId}'`);
check(
  'the rejected row is stored as rejected',
  rej.rows?.[0]?.status === 'rejected',
  JSON.stringify(rej.rows),
);

// signed read URLs
r = await fn('client_files', owner, {
  action: 'urls',
  file_ids: [readyId, pdfId, rejectedId],
  ttl: 300,
});
const urlList = r.body?.data?.urls ?? [];
check(
  'urls: the owner gets signed URLs for the 2 ready files, none for the rejected one',
  urlList.length === 2,
  JSON.stringify(r.body),
);
const png = urlList.find((u) => u.file_id === readyId);
const got = await fetch(png.url);
const bytes = new Uint8Array(await got.arrayBuffer());
check(
  'the signed URL serves the exact bytes',
  got.status === 200 &&
    bytes.byteLength === PNG.byteLength &&
    got.headers.get('content-type')?.startsWith('image/png'),
  `${got.status} ${bytes.byteLength}`,
);
check(
  'the URL is a TOKENISED, non-public URL (contains a token, is not /object/public/)',
  /token=/.test(png.url) && !/\/object\/public\//.test(png.url),
  png.url.slice(0, 120),
);
r = await fn('client_files', owner, { action: 'urls', file_ids: [readyId], ttl: 2 });
const shortUrl = r.body?.data?.urls?.[0]?.url;
const before = await fetch(shortUrl);
await sleep(4500);
const after = await fetch(shortUrl);
check(
  'a 2-second signed URL works at once and is DEAD after it expires',
  before.status === 200 && after.status >= 400,
  `${before.status} -> ${after.status}`,
);

// scope
r = await fn('client_files', staff, { action: 'urls', file_ids: [readyId] });
check(
  'staff (Own scope) may view files of THEIR client (Alex)',
  (r.body?.data?.urls ?? []).length === 1,
  JSON.stringify(r.body),
);
const bea = await upload(owner, ids.bea, 'document', 'bea.pdf', 'application/pdf', PDF);
r = await fn('client_files', staff, { action: 'urls', file_ids: [bea.fileId] });
check(
  "staff gets NO url for a colleague's client (Bea)",
  r.status === 200 && (r.body?.data?.urls ?? []).length === 0,
  JSON.stringify(r.body),
);
r = await fn('client_files', staff, {
  action: 'prepare',
  client_id: ids.bea,
  category: 'document',
  name: 'x.pdf',
  mime: 'application/pdf',
  size: 100,
});
check("staff cannot upload for a colleague's client", r.status === 403, JSON.stringify(r));
r = await fn('client_files', off, { action: 'urls', file_ids: [readyId, pdfId] });
check(
  "another business's owner gets NO urls",
  (r.body?.data?.urls ?? []).length === 0,
  JSON.stringify(r.body),
);
r = await fn('client_files', off, {
  action: 'prepare',
  client_id: ids.alex,
  category: 'document',
  name: 'x.pdf',
  mime: 'application/pdf',
  size: 100,
});
check('another business cannot upload for this client', r.status === 403, JSON.stringify(r));
r = await fn('client_files', null, { action: 'urls', file_ids: [readyId] });
check(
  'the anon key alone (no user) is refused',
  r.status === 401 || r.status === 403,
  `${r.status}`,
);
r = await fetch(`${URL_}/functions/v1/client_files`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'urls', file_ids: [readyId] }),
});
check('no Authorization header at all is refused', r.status === 401, `${r.status}`);

// the bucket itself
const path = sql(`select storage_path from public.files where id = '${readyId}'`).rows[0]
  .storage_path;
let s = await fetch(`${URL_}/storage/v1/object/client-files/${path}`, {
  headers: { apikey: ANON, Authorization: `Bearer ${owner}` },
});
check('Storage API: the OWNER cannot read the object directly', s.status >= 400, `${s.status}`);
s = await fetch(`${URL_}/storage/v1/object/public/client-files/${path}`);
check('Storage API: there is no public URL', s.status >= 400, `${s.status}`);
s = await fetch(`${URL_}/storage/v1/object/list/client-files`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${owner}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ prefix: '', limit: 100 }),
});
const listed = await s.json().catch(() => null);
check(
  'Storage API: the bucket cannot be LISTED (nothing returned)',
  s.status >= 400 || (Array.isArray(listed) && listed.length === 0),
  `${s.status} ${JSON.stringify(listed)?.slice(0, 80)}`,
);
s = await fetch(`${URL_}/storage/v1/object/client-files/${ids.biz}/${ids.alex}/hack.png`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${owner}`, 'Content-Type': 'image/png' },
  body: PNG,
});
check('Storage API: a direct WRITE is refused', s.status >= 400, `${s.status}`);
s = await fetch(`${URL_}/storage/v1/object/client-files/${path}`, {
  method: 'DELETE',
  headers: { apikey: ANON, Authorization: `Bearer ${owner}` },
});
const del = await s.json().catch(() => null);
const still = sql(
  `select count(*)::int as n from storage.objects where bucket_id = 'client-files' and name = '${path}'`,
).rows[0].n;
check(
  'Storage API: a direct DELETE removes nothing',
  still === 1,
  `${s.status} ${JSON.stringify(del)?.slice(0, 80)} still=${still}`,
);
const rejObj = sql(
  `select count(*)::int as n from storage.objects where bucket_id = 'client-files' and name like '%${rejectedId}%'`,
).rows[0].n;
check('the rejected object was REMOVED from the bucket', rejObj === 0, `${rejObj}`);

// soft delete: nothing minted afterwards, object kept
r = await rpc('delete_file', owner, { p_file_id: pdfId, p_reason: 'test' });
check('delete_file works (soft)', r.body?.ok === true, JSON.stringify(r.body));
r = await fn('client_files', owner, { action: 'urls', file_ids: [pdfId] });
check(
  'after a delete no URL is minted',
  (r.body?.data?.urls ?? []).length === 0,
  JSON.stringify(r.body),
);
const kept = sql(
  `select count(*)::int as n from storage.objects where bucket_id = 'client-files' and name like '%${pdfId}%'`,
).rows[0].n;
check('...but the object itself is kept (soft delete only)', kept === 1, `${kept}`);

// ---------------------------------------------------------------- signing link
r = await rpc('create_form_request', owner, {
  p_client_id: ids.alex,
  p_appointment_id: ids.appt_alex,
  p_template_id: ids.tpl,
  p_send: false,
});
const token = r.body?.token;
check(
  'create_form_request returns a 64-hex token (once)',
  /^[0-9a-f]{64}$/.test(token ?? ''),
  JSON.stringify(r.body),
);
let g = await fn('sign_form', null, { action: 'get', token });
check(
  'sign_form get: title + first name + 4 fields, NO sensitive flag / ids / contact',
  g.status === 200 &&
    g.body?.data?.title === 'Tattoo consent' &&
    g.body.data.client_first_name === 'Alex' &&
    g.body.data.fields.length === 4 &&
    !/"sensitive"\s*:/.test(JSON.stringify(g.body)) &&
    !JSON.stringify(g.body).includes(ids.alex) &&
    !JSON.stringify(g.body).includes('+4477'),
  JSON.stringify(g.body)?.slice(0, 200),
);
g = await fn('sign_form', null, { action: 'get', token: 'a'.repeat(64) });
check(
  'an unknown token => the generic 404 invalid_token',
  g.status === 404 && g.body?.code === 'invalid_token',
  JSON.stringify(g),
);
const sig = [
  [
    [0.1, 0.5],
    [0.3, 0.2],
    [0.6, 0.8],
    [0.9, 0.4],
  ],
];
g = await fn('sign_form', null, {
  action: 'submit',
  token,
  answers: { over18: true },
  signer_name: 'Alex Rivera',
  signature: null,
});
check(
  'submit without the signature => signature_required, link stays usable',
  g.body?.code === 'signature_required',
  JSON.stringify(g),
);
g = await fn('sign_form', null, {
  action: 'submit',
  token,
  answers: { skin: 'Dry' },
  signer_name: 'Alex Rivera',
  signature: sig,
});
check(
  'submit with a missing required answer names the field',
  g.body?.code === 'missing_answer' && g.body.field_id === 'over18',
  JSON.stringify(g),
);
g = await fn('sign_form', null, {
  action: 'submit',
  token,
  answers: { over18: true },
  signer_name: 'Alex Rivera',
  signature: sig,
  company_website: 'http://spam.example',
});
check(
  'a filled HONEYPOT is refused generically',
  g.status === 400 && g.body?.code === 'bad_request',
  JSON.stringify(g),
);
const unused = sql(
  `select count(*)::int as n from public.signed_consents where client_id = '${ids.alex}'`,
).rows[0].n;
check('...after every failed attempt nothing was signed', unused === 0, `${unused}`);

// two PARALLEL submits of the same token: exactly one wins
const body = {
  action: 'submit',
  token,
  answers: { over18: true, skin: 'Dry', allergy: 'penicillin', weight: 70 },
  signer_name: 'Alex Rivera',
  signature: sig,
};
const [a, b] = await Promise.all([fn('sign_form', null, body), fn('sign_form', null, body)]);
const oks = [a, b].filter((x) => x.status === 200 && x.body?.ok === true).length;
const invalids = [a, b].filter((x) => x.status === 404 && x.body?.code === 'invalid_token').length;
check(
  'two PARALLEL submits of one token: exactly one signs, the other is invalid_token',
  oks === 1 && invalids === 1,
  JSON.stringify([a.body, b.body]),
);
const rows = sql(
  `select count(*)::int as n, min(signed_via) as via, bool_and(ip_hash is not null) as iph from public.signed_consents where client_id = '${ids.alex}'`,
).rows[0];
check(
  'stored: ONE signed copy, via link, with an IP hash (never the raw IP)',
  rows.n === 1 && rows.via === 'link' && rows.iph === true,
  JSON.stringify(rows),
);
const rawIp = sql(
  `select count(*)::int as n from public.signed_consents where ip_hash ~ '^[0-9.:]+$'`,
).rows[0].n;
check('...the stored value is a hash, not an address', rawIp === 0, `${rawIp}`);
g = await fn('sign_form', null, { action: 'get', token });
check('replay: the used link no longer opens', g.status === 404, JSON.stringify(g));
r = await rpc('get_signed_consent', staff, {
  p_id: sql(`select id from public.signed_consents where client_id = '${ids.alex}'`).rows[0].id,
});
const allergy = (r.body?.answers ?? []).find((x) => x.field_id === 'allergy');
check(
  'staff (Own, view_sensitive on their own client) sees the sensitive answer',
  allergy?.value === 'penicillin',
  JSON.stringify(allergy),
);
const recepLike = await rpc('get_signed_consent', off, {
  p_id: sql(`select id from public.signed_consents where client_id = '${ids.alex}'`).rows[0].id,
});
check(
  'another business cannot read the signed copy',
  recepLike.body?.code === 'forbidden',
  JSON.stringify(recepLike.body),
);
r = await fetch(`${URL_}/rest/v1/signed_consents?select=answers`, {
  headers: { apikey: ANON, Authorization: `Bearer ${owner}` },
});
check(
  'REST: the signed_consents table is not readable (answers can be sensitive)',
  r.status === 401 || r.status === 403,
  `${r.status}`,
);

console.log(
  results.every(Boolean)
    ? `\nALL ${results.length} CHECKS PASSED`
    : `\n${results.filter((x) => !x).length} OF ${results.length} CHECKS FAILED`,
);
process.exit(results.every(Boolean) ? 0 : 1);
