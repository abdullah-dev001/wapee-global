#!/usr/bin/env node
/**
 * E2E fixtures for the DEV project ONLY (docs/e2e/test-setup.md).
 *
 * Builds FX-SOLO, FX-TEAM, FX-BIZ and FX-OTHER through the SAME paths the app uses: real
 * `auth.signUp`, `create_business_with_owner`, `create_branch`, `update_branch`, the schedule /
 * booking-settings RPCs, the table writes the app's own hooks make (RLS applies), super admin
 * `assign_plan` / `set_addon`, and `add_member_by_email` + `claim_pending_memberships`.
 * No service key, no raw SQL, no writes the app could not make itself.
 *
 * Run phase by phase (each is idempotent; ids go to the state file, never to the repo):
 *   node --env-file=.env scripts/e2e/seed-dev.mjs <phase>
 *     owners     sign up the 4 owners (confirmation emails go to wapeeglobal+e2e-*@gmail.com)
 *     businesses onboarding + branches + hours + services + staff + settings + fields + room
 *     plans      super admin assigns plans and add-ons (needs the SA password in the secrets file)
 *     members    owners add people by email, then their accounts are signed up
 *     claim      each member signs in and joins (claim_pending_memberships)
 *     report     prints ids and status (no secrets)
 *
 * Required env: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY (public values, git-ignored
 * .env), E2E_STATE_DIR = a folder OUTSIDE the repo (session scratchpad). Passwords are generated
 * here and written only to `$E2E_STATE_DIR/e2e-secrets.json` (mode 600); they are never printed.
 * The super admin password is read from that same file (`sa`), put there by hand after a reset.
 *
 * STOPS (exit 2) on: a non-DEV URL, a state dir inside the repo, or the Auth mailer refusing /
 * rate-limiting a signup (user instruction: do not work around it).
 */
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEV_REF = 'rfuovquhultjydtswtqf';
const PROD_REF = 'bvnurpuqrcwfqguxniio';
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const stateDir = process.env.E2E_STATE_DIR ?? '';
const repoRoot = resolve(new URL('../..', import.meta.url).pathname);

function stop(message) {
  console.error(`STOP: ${message}`);
  process.exit(2);
}
if (!url.includes(DEV_REF) || url.includes(PROD_REF)) stop('EXPO_PUBLIC_SUPABASE_URL is not the DEV project.');
if (!anonKey) stop('EXPO_PUBLIC_SUPABASE_ANON_KEY missing.');
if (!stateDir || resolve(stateDir).startsWith(repoRoot)) stop('E2E_STATE_DIR must be a folder outside the repo.');

const statePath = resolve(stateDir, 'e2e-fixtures.json');
const secretsPath = resolve(stateDir, 'e2e-secrets.json');
const load = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {});
const state = load(statePath);
const secrets = load(secretsPath);
const save = () => {
  writeFileSync(statePath, JSON.stringify(state, null, 2));
  writeFileSync(secretsPath, JSON.stringify(secrets, null, 2));
  chmodSync(secretsPath, 0o600);
};

// --------------------------------------------------------------------------------------------
// Fixture definition (docs/e2e/test-setup.md §1.2)
// --------------------------------------------------------------------------------------------
const email = (id) => `wapeeglobal+e2e-${id}@gmail.com`;
const MON_SAT = [1, 2, 3, 4, 5, 6]; // extract(dow): 0 = Sunday
const hours = (start, end) => MON_SAT.map((d) => ({ day_of_week: d, start_minute: start, end_minute: end }));

const FIXTURES = {
  solo: {
    owner: 'solo-owner', name: 'E2E Solo Barber', slug: 'e2e-solo', industry: 'barber', plan: 'solo', addons: [],
    branches: [{ key: 'main', name: 'London', country: 'GB', currency: 'GBP', tz: 'Europe/London', prefix: 'SOL', taxBp: 2000, address: '1 E2E Street, London' }],
    prices: { GBP: 2500 },
    staff: [{ key: 'owner', name: 'Solo Owner', branches: ['main'], self: true }],
    members: [],
  },
  team: {
    owner: 'team-owner', name: 'E2E Team Salon', slug: 'e2e-team', industry: 'salon', plan: 'team', addons: [],
    branches: [{ key: 'main', name: 'New York', country: 'US', currency: 'USD', tz: 'America/New_York', prefix: 'TEA', taxBp: 888, address: '1 E2E Ave, New York' }],
    prices: { USD: 2500 },
    staff: ['Sam', 'Lee', 'Kim', 'Ana', 'Raj'].map((n) => ({ key: n.toLowerCase(), name: n, branches: ['main'] })),
    members: [
      { id: 'team-mgr', role: 'manager', branch: 'main' },
      { id: 'team-rec', role: 'receptionist', branch: 'main' },
      { id: 'team-stf1', role: 'staff', branch: 'main', staff: 'sam' },
    ],
  },
  biz: {
    owner: 'biz-owner', name: 'E2E Multi Clinic', slug: 'e2e-multi', industry: 'clinic', plan: 'business',
    addons: ['packages', 'inventory', 'files_photos', 'forms_consent', 'client_portal'],
    branches: [
      { key: 'ldn', name: 'LDN', country: 'GB', currency: 'GBP', tz: 'Europe/London', prefix: 'LDN', taxBp: 2000, address: '2 E2E Road, London', primary: true, settings: { confirmation: 'manual', booking_window_days: 180, use_resources: true } },
      { key: 'nyc', name: 'NYC', country: 'US', currency: 'USD', tz: 'America/New_York', prefix: 'NYC', taxBp: 888, address: '2 E2E Ave, New York', settings: { booking_window_days: 180, people_per_slot: 3 } },
      { key: 'tyo', name: 'TYO', country: 'JP', currency: 'JPY', tz: 'Asia/Tokyo', prefix: 'TYO', taxBp: 1000, address: '2 E2E Dori, Tokyo', settings: { booking_window_days: 180 } },
    ],
    prices: { GBP: 2500, USD: 2500, JPY: 3000 },
    staff: [
      { key: 'ldn1', name: 'Lena', branches: ['ldn'] },
      { key: 'ldn2', name: 'Liam', branches: ['ldn'] },
      { key: 'nyc1', name: 'Nora', branches: ['nyc'] },
      { key: 'tyo1', name: 'Taro', branches: ['tyo'] },
    ],
    members: [
      { id: 'biz-mgr-ldn', role: 'manager', branch: 'ldn' },
      { id: 'biz-stf-nyc', role: 'staff', branch: 'nyc', staff: 'nyc1' },
      { id: 'biz-custom', role: 'custom:Front desk lite', branch: 'ldn' },
    ],
    customRole: {
      name: 'Front desk lite',
      permissions: [
        { permission: 'appointments.view', scope: 'branch' },
        { permission: 'appointments.create', scope: 'branch' },
        { permission: 'clients.view', scope: 'branch' },
      ],
    },
    customFields: [
      { label: 'Short note', field_type: 'short_text' },
      { label: 'Long history', field_type: 'long_text' },
      { label: 'How did you hear about us', field_type: 'dropdown', options: ['Friend', 'Search', 'Social'] },
      { label: 'First visit', field_type: 'yes_no' },
      { label: 'Age', field_type: 'number' },
      { label: 'Allergies', field_type: 'long_text', is_sensitive: true },
      { label: 'Hair length', field_type: 'short_text', onlyService: 'Colour' },
    ],
  },
  other: {
    owner: 'oth-owner', name: 'E2E Other Tenant', slug: 'e2e-other', industry: 'salon', plan: 'team', addons: [],
    branches: [{ key: 'main', name: 'Chicago', country: 'US', currency: 'USD', tz: 'America/Chicago', prefix: 'OTH', taxBp: 1025, address: '3 E2E Blvd, Chicago' }],
    prices: { USD: 3000 },
    staff: [{ key: 'ola', name: 'Ola', branches: ['main'] }],
    members: [{ id: 'oth-rec', role: 'receptionist', branch: 'main' }],
  },
};
const SERVICES = [
  { name: 'Haircut', duration: 30, buffer: 0, online: true },
  { name: 'Colour', duration: 90, buffer: 15, online: true },
  { name: 'Consult', duration: 15, buffer: 0, online: false },
];

// --------------------------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------------------------
const newClient = () => createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const sessions = new Map();

function must(label, { data, error }) {
  if (error) throw new Error(`${label}: ${error.code ?? ''} ${error.message}`);
  if (data && typeof data === 'object' && data.ok === false) throw new Error(`${label}: ${JSON.stringify(data)}`);
  return data;
}

async function signUp(id) {
  state.users ??= {};
  if (state.users[id]?.signedUp) return;
  secrets[id] ??= randomBytes(18).toString('base64url');
  save();
  const { error } = await newClient().auth.signUp({ email: email(id), password: secrets[id] });
  if (error) {
    // Mailer refused or rate-limited: user instruction is to stop, not to work around it.
    stop(`signUp ${id} refused by Auth (${error.status ?? ''} ${error.code ?? ''}). Mailer limit? Not retrying.`);
  }
  state.users[id] = { email: email(id), signedUp: new Date().toISOString() };
  save();
  console.log(`signed up ${id} -> confirmation email sent to ${email(id)}`);
}

async function as(id) {
  if (sessions.has(id)) return sessions.get(id);
  const password = id === 'sa' ? secrets.sa : secrets[id];
  const address = id === 'sa' ? (process.env.E2E_SA_EMAIL ?? 'dev.superadmin@wapee-dev.test') : email(id);
  if (!password) stop(`no password stored for ${id}`);
  const client = newClient();
  const { data, error } = await client.auth.signInWithPassword({ email: address, password });
  if (error) stop(`sign-in ${id}: ${error.code ?? error.message} (email not confirmed yet?)`);
  sessions.set(id, { client, userId: data.user.id });
  return sessions.get(id);
}

// --------------------------------------------------------------------------------------------
// Phases
// --------------------------------------------------------------------------------------------
async function phaseOwners() {
  for (const fx of Object.values(FIXTURES)) await signUp(fx.owner);
}

async function phaseBusinesses() {
  state.fx ??= {};
  for (const [key, fx] of Object.entries(FIXTURES)) {
    const s = (state.fx[key] ??= { branches: {}, services: {}, staff: {} });
    const { client: db } = await as(fx.owner);
    const primary = fx.branches[0];

    if (!s.businessId) {
      s.businessId = must('create_business_with_owner', await db.rpc('create_business_with_owner', {
        p_name: fx.name, p_slug: fx.slug, p_industry: fx.industry, p_branch_name: primary.name,
        p_country_code: primary.country, p_currency: primary.currency, p_timezone: primary.tz,
      }));
      save();
    }
    const biz = s.businessId;

    // Branches: the onboarding one + the others (create_branch; allowed while on trial).
    if (!s.branches[primary.key]) {
      const row = must('primary branch', await db.from('branches').select('id').eq('business_id', biz).eq('is_primary', true).single());
      s.branches[primary.key] = row.id;
    }
    for (const b of fx.branches) {
      if (!s.branches[b.key]) {
        const res = must(`create_branch ${b.key}`, await db.rpc('create_branch', {
          p_business_id: biz, p_name: b.name, p_country_code: b.country, p_currency: b.currency,
          p_timezone: b.tz, p_invoice_prefix: b.prefix, p_tax_rate_bp: b.taxBp, p_address: b.address,
        }));
        s.branches[b.key] = res.branch_id ?? res.id;
      }
      const patch = { address: b.address, tax_rate_bp: b.taxBp, tax_number: `E2E-${b.prefix}-TAX`, invoice_prefix: b.prefix };
      const upd = await db.rpc('update_branch', { p_branch_id: s.branches[b.key], p_patch: patch });
      if (upd.data?.code !== 'nothing_to_change') must(`update_branch ${b.key}`, upd);
      must(`replace_branch_hours ${b.key}`, await db.rpc('replace_branch_hours', { p_branch_id: s.branches[b.key], p_intervals: hours(540, 1080) }));
      if (b.settings) must(`save_booking_settings ${b.key}`, await db.rpc('save_booking_settings', { p_branch_id: s.branches[b.key], p_settings: b.settings }));
      save();
    }

    // Services + per-branch price in that branch's currency (useSaveService's writes).
    for (const svc of SERVICES) {
      if (!s.services[svc.name]) {
        const row = must(`service ${svc.name}`, await db.from('services').insert({
          business_id: biz, name: svc.name, duration_minutes: svc.duration, buffer_minutes: svc.buffer,
          is_active: true, is_bookable_online: svc.online,
        }).select('id').single());
        s.services[svc.name] = row.id;
        for (const b of fx.branches) {
          must(`price ${svc.name}@${b.key}`, await db.from('service_branches').upsert({
            service_id: row.id, branch_id: s.branches[b.key], business_id: biz,
            price_minor: fx.prices[b.currency], enabled: true,
          }, { onConflict: 'service_id,branch_id' }));
        }
        save();
      }
    }

    // Staff (useSaveStaff's writes, or add_me_as_staff for the Solo owner) + hours + break.
    for (const st of fx.staff) {
      if (!s.staff[st.key]) {
        if (st.self) {
          const res = must('add_me_as_staff', await db.rpc('add_me_as_staff', { p_business_id: biz, p_branch_id: s.branches[st.branches[0]] }));
          s.staff[st.key] = res.staff_id ?? res.id;
        } else {
          const row = must(`staff ${st.name}`, await db.from('staff_profiles').insert({
            business_id: biz, display_name: st.name, is_active: true, is_bookable_online: true,
          }).select('id').single());
          s.staff[st.key] = row.id;
          must(`staff_branches ${st.name}`, await db.from('staff_branches').insert(
            st.branches.map((k) => ({ staff_id: row.id, branch_id: s.branches[k], business_id: biz }))));
        }
        must(`service_staff ${st.name}`, await db.from('service_staff').upsert(
          Object.values(s.services).map((sid) => ({ staff_id: s.staff[st.key], service_id: sid, business_id: biz })),
          { onConflict: 'service_id,staff_id' }));
        for (const k of st.branches) {
          must(`hours ${st.name}`, await db.rpc('replace_staff_working_hours', { p_staff_id: s.staff[st.key], p_branch_id: s.branches[k], p_intervals: hours(540, 1080) }));
          must(`break ${st.name}`, await db.rpc('replace_staff_breaks', { p_staff_id: s.staff[st.key], p_branch_id: s.branches[k], p_intervals: hours(780, 810) }));
        }
        save();
      }
    }

    // FX-BIZ extras: custom fields (one per type, one sensitive, one for Colour only) and Room 1.
    if (fx.customFields && !s.customFields) {
      s.customFields = {};
      for (const [i, f] of fx.customFields.entries()) {
        const row = must(`field ${f.label}`, await db.from('custom_fields').insert({
          business_id: biz, label: f.label, field_type: f.field_type, help_text: null, is_required: false,
          is_sensitive: f.is_sensitive ?? false, applies_to_all_services: !f.onlyService,
          options: f.options ?? null, sort_order: i + 1,
        }).select('id').single());
        s.customFields[f.label] = row.id;
        if (f.onlyService) {
          must('field service', await db.from('custom_field_services').insert({ custom_field_id: row.id, service_id: s.services[f.onlyService], business_id: biz }));
        }
      }
      save();
    }
    if (key === 'biz' && !s.room) {
      const row = must('room', await db.from('resources').insert({ business_id: biz, branch_id: s.branches.ldn, name: 'Room 1', capacity: 1 }).select('id').single());
      s.room = row.id;
      // No UI exists for this link (KG-06); same table write a future screen would make.
      must('service_resources', await db.from('service_resources').insert({ service_id: s.services.Colour, resource_id: row.id, business_id: biz }));
      save();
    }

    const bookable = await db.rpc('branch_is_bookable', { p_branch_id: s.branches[primary.key] });
    console.log(`${key}: business ${biz}, bookable=${JSON.stringify(bookable.data)}`);
  }
}

async function phasePlans() {
  const { client: sa } = await as('sa');
  for (const [key, fx] of Object.entries(FIXTURES)) {
    const biz = state.fx?.[key]?.businessId;
    if (!biz) stop(`run "businesses" first (${key})`);
    if (state.fx[key].planAssigned !== fx.plan) {
      must(`assign_plan ${key}`, await sa.rpc('assign_plan', { p_business_id: biz, p_plan: fx.plan, p_notes: 'E2E fixture' }));
      state.fx[key].planAssigned = fx.plan;
      save();
    }
    for (const addon of fx.addons) {
      must(`set_addon ${key} ${addon}`, await sa.rpc('set_addon', { p_business_id: biz, p_addon: addon, p_enabled: true }));
    }
    console.log(`${key}: plan ${fx.plan}, add-ons [${fx.addons.join(', ')}]`);
  }
}

async function phaseMembers() {
  for (const [key, fx] of Object.entries(FIXTURES)) {
    const s = state.fx?.[key];
    if (!s?.businessId) stop(`run "businesses" first (${key})`);
    const { client: db } = await as(fx.owner);
    const roles = must('roles', await db.from('roles').select('id, key, name, business_id').or(`business_id.is.null,business_id.eq.${s.businessId}`));
    if (fx.customRole && !roles.some((r) => r.name === fx.customRole.name)) {
      must('create_custom_role', await db.rpc('create_custom_role', { p_business_id: s.businessId, p_name: fx.customRole.name, p_permissions: fx.customRole.permissions }));
      roles.push(...must('roles', await db.from('roles').select('id, key, name, business_id').eq('business_id', s.businessId)));
    }
    s.members ??= {};
    for (const m of fx.members) {
      if (s.members[m.id]) continue;
      const role = m.role.startsWith('custom:')
        ? roles.find((r) => r.name === m.role.slice(7) && r.business_id === s.businessId)
        : roles.find((r) => r.key === m.role && r.business_id === null);
      const res = must(`add_member_by_email ${m.id}`, await db.rpc('add_member_by_email', {
        p_business_id: s.businessId, p_email: email(m.id), p_role_id: role.id,
        p_branch_id: s.branches[m.branch], ...(m.staff ? { p_staff_id: s.staff[m.staff] } : {}),
      }));
      s.members[m.id] = res.member_id;
      save();
    }
  }
  // Their accounts: real signups (the mailer sends one confirmation each).
  for (const fx of Object.values(FIXTURES)) for (const m of fx.members) await signUp(m.id);
}

async function phaseClaim() {
  for (const fx of Object.values(FIXTURES)) {
    for (const m of fx.members) {
      const { client } = await as(m.id);
      const res = must(`claim ${m.id}`, await client.rpc('claim_pending_memberships'));
      console.log(`${m.id}: joined ${JSON.stringify(res.joined ?? [])}`);
    }
  }
}

function phaseReport() {
  for (const [key, s] of Object.entries(state.fx ?? {})) {
    console.log(`${key}: business=${s.businessId} plan=${s.planAssigned ?? '-'} branches=${JSON.stringify(s.branches)} staff=${Object.keys(s.staff).length} members=${Object.keys(s.members ?? {}).length}`);
  }
  for (const [id, u] of Object.entries(state.users ?? {})) console.log(`user ${id}: ${u.email}`);
}

const phases = { owners: phaseOwners, businesses: phaseBusinesses, plans: phasePlans, members: phaseMembers, claim: phaseClaim, report: phaseReport };
const phase = process.argv[2];
if (!phases[phase]) stop(`phase must be one of: ${Object.keys(phases).join(', ')}`);
try {
  await phases[phase]();
} catch (err) {
  console.error(`FAILED in ${phase}: ${err.message}`);
  process.exit(1);
}
