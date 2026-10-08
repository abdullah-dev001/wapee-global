/* eslint-disable no-console -- a Node test script, not app code */
// Pre-launch batch 2: REAL HTTP proof for the `account` Edge Function (delete my sign-in account), against the
// deployed project. Fixture: 33_seed_account.sql (ids as JSON in argv[2]). No service key is used.
//
//   supabase db query --linked -f supabase/tests/33_seed_account.sql      # note the ids
//   node supabase/tests/33_account_http.mjs '{"owner":"..","del":"..","other":"..","biz":"..","staff":".."}'
//   supabase db query --linked -f supabase/tests/33_cleanup_account.sql
//
// Proves: anon / bad body / wrong typed email / the sole owner are refused and nothing changes; a WRONG password
// is refused and the account still signs in; the right password deletes the account (sign-in impossible, old
// session dead), the staff profile and the business survive, another user is untouched; a second call is refused.
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const URL_ = env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const ids = JSON.parse(process.argv[2] ?? '{}');
const PW = 'Test-Pass-12a!';
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : '  -> ' + detail}`);
};
const j = (r) => r.json().catch(() => null);
const signIn = async (email, password = PW) => {
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return { status: res.status, body: await j(res) };
};
const fn = (jwt, body) =>
  fetch(`${URL_}/functions/v1/account`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${jwt ?? ANON}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await j(r) }));
const rest = (jwt, path) =>
  fetch(`${URL_}/rest/v1/${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${jwt}` },
  }).then(async (r) => ({ status: r.status, body: await j(r) }));

const email = (k) => `p12ashot.${k}@example.com`;
const del = await signIn(email('del'));
const owner = await signIn(email('owner'));
const other = await signIn(email('other'));
if (!del.body?.access_token || !owner.body?.access_token || !other.body?.access_token)
  throw new Error('fixture sign-in failed');
const delJwt = del.body.access_token;
const good = { action: 'delete', password: PW, confirm_email: email('del') };

let r = await fn(null, good);
check('anon key as bearer is refused (401)', r.status === 401, JSON.stringify(r));
r = await fn(delJwt, { action: 'delete', password: PW });
check(
  'missing confirmation is a bad request',
  r.status === 400 && r.body?.code === 'bad_request',
  JSON.stringify(r),
);
r = await fn(delJwt, { ...good, confirm_email: 'someone.else@example.com' });
check(
  'wrong typed email is refused',
  r.status === 400 && r.body?.code === 'confirm_mismatch',
  JSON.stringify(r),
);
r = await fn(delJwt, { ...good, extra: 1 });
check('unknown field is refused', r.status === 400, JSON.stringify(r));

r = await fn(owner.body.access_token, {
  action: 'delete',
  password: PW,
  confirm_email: email('owner'),
});
check(
  'the SOLE owner is refused (409) with the business name',
  r.status === 409 &&
    r.body?.code === 'sole_owner' &&
    r.body?.businesses?.[0]?.name === 'Acc Shot Studio',
  JSON.stringify(r),
);
check('...and can still sign in', (await signIn(email('owner'))).status === 200);

r = await fn(delJwt, { ...good, password: 'Not-The-Password-1!' });
check(
  'WRONG password is refused (400 wrong_password)',
  r.status === 400 && r.body?.code === 'wrong_password',
  JSON.stringify(r),
);
check('...the account still signs in', (await signIn(email('del'))).status === 200);
const staffBefore = await rest(
  other.body.access_token,
  `staff_profiles?id=eq.${ids.staff}&select=id`,
);
check(
  '(a stranger cannot see the staff profile: RLS)',
  Array.isArray(staffBefore.body) && staffBefore.body.length === 0,
);

r = await fn(delJwt, good);
check(
  'RIGHT password: account deleted (200)',
  r.status === 200 && r.body?.ok === true,
  JSON.stringify(r),
);
check('sign-in is now impossible', (await signIn(email('del'))).status === 400);
r = await fn(delJwt, good);
check('the old session is dead (second call refused, 401)', r.status === 401, JSON.stringify(r));
check('another user still signs in', (await signIn(email('other'))).status === 200);
const own = await rest(
  owner.body.access_token,
  `staff_profiles?id=eq.${ids.staff}&select=id,display_name,member_id`,
);
check(
  'the staff profile survives, unlinked (owner reads it)',
  Array.isArray(own.body) &&
    own.body.length === 1 &&
    own.body[0].display_name === 'Del Staff' &&
    own.body[0].member_id === null,
  JSON.stringify(own),
);
const bz = await rest(owner.body.access_token, `businesses?id=eq.${ids.biz}&select=id`);
check('the business survives', Array.isArray(bz.body) && bz.body.length === 1);

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
