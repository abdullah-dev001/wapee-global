#!/usr/bin/env node
/**
 * Smoke test for the DEPLOYED public booking endpoints.
 *
 * Exercises `get_slots`, `create_booking` and `manage_booking` over HTTP as an
 * anonymous caller — exactly what a stranger can do — so a bad deploy is caught
 * without reading any code.
 *
 * Built-in `fetch` only. No dependency, no test runner: this has to be runnable
 * from a bare shell or a CI step with nothing installed.
 *
 *   npm run smoke:public
 *
 * Required env:
 *   SMOKE_SUPABASE_URL        https://<ref>.supabase.co
 *   SMOKE_SUPABASE_ANON_KEY   the publishable key (NOT the service role key)
 *   SMOKE_BUSINESS_SLUG       a slug whose name marks it as test data
 *   SMOKE_SERVICE_ID          a bookable service at that business
 *
 * Optional:
 *   SMOKE_ALLOW_RATE_LIMIT=1  also prove a 429 carries Retry-After. OFF by
 *                             default because it deliberately exhausts the
 *                             per-IP hourly budget for create_booking, which
 *                             would block a real customer on a shared address.
 *   SMOKE_ALLOW_PRODUCTION=1  required before running against anything that does
 *                             not look like a test business (see below).
 *
 * SAFETY
 * ------
 * This script WRITES: every booking it makes is real, and it cannot delete them
 * (anon has no such power, by design). Two guards:
 *
 *   1. The slug must contain "test", "smoke" or "staging" unless
 *      SMOKE_ALLOW_PRODUCTION=1 is set. Nobody runs this against a live salon's
 *      calendar by mistake.
 *   2. Every booking it creates is CANCELLED through the manage link before the
 *      script exits, so the calendar is left as it was found. A failure mid-run
 *      may leave one behind; the summary says which.
 */

const BASE_URL = process.env.SMOKE_SUPABASE_URL;
const ANON_KEY = process.env.SMOKE_SUPABASE_ANON_KEY;
const SLUG = process.env.SMOKE_BUSINESS_SLUG;
const SERVICE_ID = process.env.SMOKE_SERVICE_ID;
const ALLOW_RATE_LIMIT = process.env.SMOKE_ALLOW_RATE_LIMIT === '1';
const ALLOW_PRODUCTION = process.env.SMOKE_ALLOW_PRODUCTION === '1';

/** The honeypot field name, from supabase/functions/_shared/config.ts. */
const HONEYPOT_FIELD = 'company_website';
/** The server's minimum time-on-form, from the same file. */
const MIN_FORM_SECONDS = 3;

const results = [];
/** Bookings to clean up: { token, label }. */
const created = [];

function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  const mark = pass ? 'PASS' : 'FAIL';
  console.log(`  ${mark}  ${name}${detail ? `  — ${detail}` : ''}`);
}

function skip(name, why) {
  results.push({ name, pass: true, skipped: true, detail: why });
  console.log(`  SKIP  ${name}  — ${why}`);
}

async function call(fn, body) {
  const response = await fetch(`${BASE_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  let json = null;
  try {
    json = await response.json();
  } catch {
    // A non-JSON body is itself a finding; the caller asserts on `status`.
  }

  return { status: response.status, json, headers: response.headers };
}

/** A local date N days out, as YYYY-MM-DD. */
function localDate(daysAhead) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

/** A phone this script owns, unlikely to collide with real client data. */
function smokePhone(n) {
  // UK "drama" range: reserved by Ofcom for fiction, so never a real subscriber.
  return `+44770090${String(n).padStart(4, '0')}`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
async function main() {
  const missing = [
    ['SMOKE_SUPABASE_URL', BASE_URL],
    ['SMOKE_SUPABASE_ANON_KEY', ANON_KEY],
    ['SMOKE_BUSINESS_SLUG', SLUG],
    ['SMOKE_SERVICE_ID', SERVICE_ID],
  ].filter(([, v]) => !v);

  if (missing.length > 0) {
    console.error(`Missing env: ${missing.map(([k]) => k).join(', ')}`);
    console.error('See the header of this file for what each one is.');
    process.exit(2);
  }

  // Guard 1: do not write to a real business by accident.
  const looksLikeTest = /test|smoke|staging/i.test(SLUG);
  if (!looksLikeTest && !ALLOW_PRODUCTION) {
    console.error(
      `Refusing to run: the slug "${SLUG}" does not look like test data.\n` +
        'This script CREATES REAL BOOKINGS. Use a slug containing "test", "smoke"\n' +
        'or "staging", or set SMOKE_ALLOW_PRODUCTION=1 if you really mean it.',
    );
    process.exit(2);
  }

  // The service-role key would bypass every boundary this script is checking.
  if (/service_role/i.test(ANON_KEY) || ANON_KEY.length > 500) {
    console.error('SMOKE_SUPABASE_ANON_KEY looks like a service-role key. Refusing to run.');
    process.exit(2);
  }

  console.log(`\nSmoke test: ${BASE_URL}`);
  console.log(`Business:   ${SLUG}${looksLikeTest ? '' : '  (PRODUCTION OVERRIDE)'}\n`);

  // -------------------------------------------------------------------------
  console.log('get_slots');
  // -------------------------------------------------------------------------
  const from = localDate(7);
  const to = localDate(9);

  const slots = await call('get_slots', {
    slug: SLUG,
    service_id: SERVICE_ID,
    from_date: from,
    to_date: to,
  });

  check('get_slots returns 200', slots.status === 200, `got ${slots.status}`);
  check('the response is ok', slots.json?.ok === true);

  const data = slots.json?.data ?? {};
  const startToken = data.start_token;
  const available = (data.slots ?? []).filter((s) => s.available);

  check('a start_token is present', typeof startToken === 'string' && startToken.length > 0);
  check(
    'the start_token has 4 HMAC-signed parts',
    typeof startToken === 'string' && startToken.split('.').length === 4,
  );
  check(
    'the start_token is bound to this slug',
    typeof startToken === 'string' && startToken.split('.')[1] === SLUG,
  );
  check('the branch timezone is returned', typeof data.timezone === 'string');
  check('at least one bookable slot exists', available.length > 0, `${available.length} free`);

  // Nothing below can work without a slot and a token.
  if (available.length === 0 || !startToken) {
    console.log('\nNo bookable slots or no start token — cannot continue.');
    return finish();
  }

  // -------------------------------------------------------------------------
  console.log('\nunknown slug');
  // -------------------------------------------------------------------------
  const unknown = await call('get_slots', {
    slug: 'definitely-no-such-business-smoke',
    service_id: SERVICE_ID,
    from_date: from,
    to_date: to,
  });
  check('an unknown slug returns 404', unknown.status === 404, `got ${unknown.status}`);
  check(
    'and says not_bookable, revealing nothing more',
    unknown.json?.code === 'not_bookable',
    String(unknown.json?.code),
  );

  // -------------------------------------------------------------------------
  console.log('\nbot protection');
  // -------------------------------------------------------------------------
  // A FRESH token, fetched immediately before the attempt.
  //
  // The token from the first get_slots call above cannot be used here: by this
  // point several network round trips have passed, which is already more than the
  // server's 3-second minimum, so the booking would SUCCEED — and then consume
  // the slot the real booking below needs. (That is exactly what happened the
  // first time this script ran.) The whole point is to submit within the window,
  // so the token has to be seconds old.
  //
  // It also deliberately targets the LAST free slot rather than the first, so
  // that if the timing ever drifts again and this does book, it does not eat the
  // slot the create_booking section relies on.
  const freshSlots = await call('get_slots', {
    slug: SLUG,
    service_id: SERVICE_ID,
    from_date: from,
    to_date: to,
  });
  const freshToken = freshSlots.json?.data?.start_token;
  const lastSlot = available.at(-1);

  if (typeof freshToken !== 'string' || !lastSlot) {
    skip('an instant submission is refused', 'could not get a fresh start token');
  } else {
    const tooFast = await call('create_booking', {
      slug: SLUG,
      service_id: SERVICE_ID,
      starts_at: lastSlot.starts_at,
      client: { name: 'Smoke TooFast', phone: smokePhone(1) },
      start_token: freshToken,
    });

    // A 429 on the FIRST create_booking attempt means a previous run spent the
    // per-IP hourly budget (10/hour — unlike get_slots' 60/minute, which recovers
    // while the script runs). Reporting the next dozen checks as failures would be
    // misleading: the endpoints are fine, the budget is not. So say so and stop.
    if (tooFast.status === 429) {
      const retry = tooFast.headers.get('retry-after');
      console.log(
        `\n  Rate limited before the write checks could run ` +
          `(Retry-After: ${retry ?? 'unknown'}s).\n` +
          '  A previous run spent the per-IP create_booking budget. Wait, or run from\n' +
          '  another address. This is the limiter working, not a failure.',
      );
      await finish();
      process.exit(3);
    }

    check('an instant submission is refused', tooFast.status === 400, `got ${tooFast.status}`);
    check('with too_fast', tooFast.json?.code === 'too_fast', String(tooFast.json?.code));

    // If the timing drifted and it DID book, clean it up rather than leaving it.
    if (tooFast.status === 201 && tooFast.json?.data?.manage_token) {
      created.push({
        token: tooFast.json.data.manage_token,
        label: 'too_fast booking (timing drift)',
      });
    }
  }

  const noToken = await call('create_booking', {
    slug: SLUG,
    service_id: SERVICE_ID,
    starts_at: available[0].starts_at,
    client: { name: 'Smoke NoToken', phone: smokePhone(2) },
  });
  check('a missing start_token is refused', noToken.status === 400, `got ${noToken.status}`);

  // Flip one character of the HMAC.
  const parts = startToken.split('.');
  const sig = parts[3];
  const tampered = [parts[0], parts[1], parts[2], (sig[0] === '0' ? '1' : '0') + sig.slice(1)].join(
    '.',
  );
  const bad = await call('create_booking', {
    slug: SLUG,
    service_id: SERVICE_ID,
    starts_at: available[0].starts_at,
    client: { name: 'Smoke Tampered', phone: smokePhone(3) },
    start_token: tampered,
  });
  check('a tampered start_token is refused', bad.status === 400, `got ${bad.status}`);

  // Wait out the minimum form time, then the honeypot.
  await sleep((MIN_FORM_SECONDS + 1) * 1000);

  const honeypot = await call('create_booking', {
    slug: SLUG,
    service_id: SERVICE_ID,
    starts_at: available[0].starts_at,
    client: { name: 'Smoke Bot', phone: smokePhone(4) },
    start_token: startToken,
    [HONEYPOT_FIELD]: 'http://spam.example',
  });
  check('a filled honeypot is refused', honeypot.status === 400, `got ${honeypot.status}`);
  check(
    'with a GENERIC code, giving a bot no tuning hint',
    honeypot.json?.code === 'bad_request',
    String(honeypot.json?.code),
  );

  // -------------------------------------------------------------------------
  console.log('\ncreate_booking');
  // -------------------------------------------------------------------------
  const booking = await call('create_booking', {
    slug: SLUG,
    service_id: SERVICE_ID,
    starts_at: available[0].starts_at,
    client: { name: 'Smoke Test', phone: smokePhone(10), email: 'smoke@example.com' },
    start_token: startToken,
    [HONEYPOT_FIELD]: '',
  });

  const bookingOk = booking.status === 201 && booking.json?.ok === true;
  check(
    'a valid booking returns 201',
    bookingOk,
    `got ${booking.status} ${booking.json?.code ?? ''}`,
  );

  const manageToken = booking.json?.data?.manage_token;
  if (manageToken) created.push({ token: manageToken, label: 'primary booking' });

  check('the manage token is returned once', typeof manageToken === 'string');
  check(
    'the manage token is 64 hex characters',
    typeof manageToken === 'string' && /^[0-9a-f]{64}$/.test(manageToken),
  );
  check('no client id leaks into the response', booking.json?.data?.client_id === undefined);

  if (bookingOk) {
    // The same slot again must now be refused.
    const dup = await call('create_booking', {
      slug: SLUG,
      service_id: SERVICE_ID,
      starts_at: available[0].starts_at,
      client: { name: 'Smoke Duplicate', phone: smokePhone(11) },
      start_token: startToken,
      [HONEYPOT_FIELD]: '',
    });
    check('the same slot is refused with 409', dup.status === 409, `got ${dup.status}`);
    check(
      'and says slot_unavailable',
      dup.json?.code === 'slot_unavailable',
      String(dup.json?.code),
    );
  }

  // -------------------------------------------------------------------------
  console.log('\nmanage_booking');
  // -------------------------------------------------------------------------
  if (!manageToken) {
    skip('manage get / cancel / replay', 'no manage token (the booking did not succeed)');
  } else {
    const view = await call('manage_booking', { action: 'get', token: manageToken });
    check('manage get returns 200', view.status === 200, `got ${view.status}`);

    const b = view.json?.data ?? {};
    check('it names the service', typeof b.service_name === 'string');
    check('it gives the branch timezone', typeof b.timezone === 'string');
    check('it returns a FIRST NAME only', b.client_first_name === 'Smoke');

    // Assert on the FIELDS, not on a substring of the whole JSON.
    //
    // A naive `!JSON.stringify(b).includes('Smoke Test')` fails here for the wrong
    // reason: the test business is called "Smoke Test Salon", so the client's
    // surname matches the BUSINESS name, which the manage page is supposed to
    // show. Searching the blob cannot tell the two apart.
    const clientFields = Object.keys(b).filter((k) => k.startsWith('client_'));
    check(
      'the only client field is the first name',
      clientFields.length === 1 && clientFields[0] === 'client_first_name',
      clientFields.join(','),
    );
    check(
      'the first name is not the full name',
      typeof b.client_first_name === 'string' && !b.client_first_name.includes(' '),
      String(b.client_first_name),
    );
    check('no phone number anywhere in the response', !JSON.stringify(b).includes('770090'));
    check('no email anywhere in the response', !JSON.stringify(b).includes('@'));
    check(
      'no ids in the response',
      b.client_id === undefined && b.appointment_id === undefined && b.business_id === undefined,
    );

    const wrong = await call('manage_booking', { action: 'get', token: 'a'.repeat(64) });
    check('an unknown token returns 404', wrong.status === 404, `got ${wrong.status}`);
    check(
      'and says invalid_token, identical for every failure',
      wrong.json?.code === 'invalid_token',
      String(wrong.json?.code),
    );

    const cancel = await call('manage_booking', {
      action: 'cancel',
      token: manageToken,
      reason: 'Automated smoke test cleanup',
    });
    check('cancel returns 200', cancel.status === 200, `got ${cancel.status}`);
    check('the booking is cancelled', cancel.json?.data?.status === 'cancelled');
    if (cancel.status === 200) {
      // Cleaned up: do not try again at the end.
      created.length = 0;
    }

    const replay = await call('manage_booking', { action: 'cancel', token: manageToken });
    check('replaying the cancel is refused', replay.status === 404, `got ${replay.status}`);
    check(
      'because the token was revoked',
      replay.json?.code === 'invalid_token',
      String(replay.json?.code),
    );
  }

  // -------------------------------------------------------------------------
  console.log('\nrate limiting');
  // -------------------------------------------------------------------------
  // DELIBERATELY LAST. This section spends the whole per-IP hourly budget for
  // create_booking, so every check above it must already have run. Do not move it.
  if (!ALLOW_RATE_LIMIT) {
    skip(
      'a 429 carries Retry-After',
      'needs SMOKE_ALLOW_RATE_LIMIT=1; it exhausts the per-IP hourly budget',
    );
  } else {
    console.log('  (this spends the per-IP budget; the next run will be rate limited)');
    // The per-IP create_booking budget is 10/hour. Spend it on requests that
    // cannot succeed (no start token), then confirm the 429 shape.
    let limited = null;
    for (let i = 0; i < 14; i++) {
      const r = await call('create_booking', {
        slug: SLUG,
        service_id: SERVICE_ID,
        starts_at: available[0].starts_at,
        client: { name: 'Smoke Flood', phone: smokePhone(900 + i) },
      });
      if (r.status === 429) {
        limited = r;
        break;
      }
    }

    check('the per-IP limit eventually returns 429', limited !== null);
    if (limited) {
      const retryAfter = limited.headers.get('retry-after');
      check('the 429 carries Retry-After', retryAfter !== null, String(retryAfter));
      check(
        'and it is a positive number of seconds',
        retryAfter !== null && Number(retryAfter) > 0,
        String(retryAfter),
      );
      check(
        'the body says only rate_limited, never which limit',
        limited.json?.code === 'rate_limited' && limited.json?.scope === undefined,
      );
    }
  }

  return finish();
}

// ---------------------------------------------------------------------------
async function finish() {
  // Best-effort cleanup of anything still live.
  for (const { token, label } of created) {
    const r = await call('manage_booking', {
      action: 'cancel',
      token,
      reason: 'Automated smoke test cleanup',
    });
    console.log(
      r.status === 200
        ? `\nCleaned up: ${label}`
        : `\nWARNING: could not cancel ${label} (HTTP ${r.status}). Cancel it by hand.`,
    );
  }

  const failed = results.filter((r) => !r.pass);
  const skipped = results.filter((r) => r.skipped);
  const passed = results.filter((r) => r.pass && !r.skipped);

  console.log(
    `\n${passed.length} passed, ${failed.length} failed, ${skipped.length} skipped ` +
      `(${results.length} checks)`,
  );

  if (failed.length > 0) {
    console.log('\nFailures:');
    for (const f of failed) console.log(`  ${f.name}  — ${f.detail}`);
    process.exit(1);
  }
}

main().catch(async (error) => {
  console.error('\nUnexpected error:', error instanceof Error ? error.message : error);
  // Still try to clean up, so a crash does not leave a booking on the calendar.
  await finish().catch(() => {});
  process.exit(1);
});
