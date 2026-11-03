#!/usr/bin/env node
/**
 * Claude checks (docs/e2e/manual/claude-checks.md): one REST / RPC / Edge Function call as a
 * fixture user, DEV ONLY. Passwords come from ~/.wapee-e2e/e2e-secrets.json and are never printed.
 *
 *   node --env-file=.env.remote-backup scripts/e2e/as-user.mjs <user|anon> <command> ...
 *     rpc <fn> [json-args]                      call an RPC
 *     select <table> <columns> [json-match]     REST select (max 50 rows)
 *     update <table> <json-match> <json-values> REST update, prints the rows it changed
 *     delete <table> <json-match>               REST delete, prints the rows it removed
 *     fn <edge-function> [json-body]            Edge Function call
 *
 * <user> is a key of e2e-secrets.json (e.g. team-rec, dev.staff@wapee-dev.test) or `anon`.
 * Output: one JSON object { data, error } — the error code/message only, never a token.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DEV_REF = 'rfuovquhultjydtswtqf';
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
if (!url.includes(DEV_REF)) {
  console.error('STOP: EXPO_PUBLIC_SUPABASE_URL is not the DEV project.');
  process.exit(2);
}

const stateDir = process.env.E2E_STATE_DIR ?? join(homedir(), '.wapee-e2e');
const [user, command, ...args] = process.argv.slice(2);
const json = (s, fallback) => (s === undefined ? fallback : JSON.parse(s));
const print = (data, error) =>
  console.log(JSON.stringify({ data, error: error ? { code: error.code, message: error.message } : null }, null, 1));

const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
if (user !== 'anon') {
  const secrets = JSON.parse(readFileSync(join(stateDir, 'e2e-secrets.json'), 'utf8'));
  const fixtures = JSON.parse(readFileSync(join(stateDir, 'e2e-fixtures.json'), 'utf8'));
  const password = secrets[user];
  const email = user.includes('@') ? user : fixtures.users?.[user]?.email;
  if (!password || !email) {
    console.error(`STOP: unknown user "${user}".`);
    process.exit(2);
  }
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    print(null, error);
    process.exit(1);
  }
}

if (command === 'rpc') {
  const { data, error } = await client.rpc(args[0], json(args[1], {}));
  print(data, error);
} else if (command === 'select') {
  const { data, error } = await client.from(args[0]).select(args[1] ?? 'id').match(json(args[2], {})).limit(50);
  print(data, error);
} else if (command === 'update') {
  const { data, error } = await client.from(args[0]).update(json(args[2], {})).match(json(args[1], {})).select();
  print(data, error);
} else if (command === 'delete') {
  const { data, error } = await client.from(args[0]).delete().match(json(args[1], {})).select();
  print(data, error);
} else if (command === 'fn') {
  const { data, error } = await client.functions.invoke(args[0], { body: json(args[1], {}) });
  let detail = error;
  if (error?.context?.json) detail = { code: String(error.context.status), message: JSON.stringify(await error.context.json()) };
  print(data, detail);
} else {
  console.error('command must be one of: rpc, select, update, delete, fn');
  process.exit(2);
}
