/**
 * POST /functions/v1/account   (JWT required: the signed-in dashboard user)
 *
 *   { action: 'delete', password, confirm_email }
 *       Deletes the CALLER's own sign-in account. Order matters, and nothing is written until the last step:
 *         1. who is calling (JWT) and the typed email must equal the account email;
 *         2. RPC account_delete_blockers AS THE CALLER: sole Owner of a business -> 409 `sole_owner` + the names;
 *         3. the password is verified with a throw-away sign-in (a wrong one -> 400 `wrong_password`);
 *         4. RPC account_delete_commit as service_role: validates again, removes memberships / roles / tokens,
 *            keeps staff profiles, appointments and ledgers, writes the audit rows, deletes the auth user.
 *       Idempotent at the end: a second call finds no user (the JWT no longer verifies: 401).
 *
 * The service role key never leaves this function; the caller can only ever name THEMSELVES.
 */

import { z } from 'npm:zod@3';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, handlePreflight } from '../_shared/cors.ts';
import { logUnexpected } from '../_shared/response.ts';
import { serviceClient } from '../_shared/supabase.ts';

const RequestSchema = z
  .object({
    action: z.literal('delete'),
    password: z.string().min(1).max(200),
    confirm_email: z.string().min(3).max(320),
  })
  .strict();

function reply(req: Request, status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
  });
}
const fail = (req: Request, code: string, status = 400, extra: Record<string, unknown> = {}) =>
  reply(req, status, { ok: false, code, ...extra });

Deno.serve(async (req: Request): Promise<Response> => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return fail(req, 'bad_request');

  try {
    const authHeader = req.headers.get('Authorization');
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!authHeader || !url || !anonKey) return fail(req, 'bad_request');

    const user = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: who, error: whoError } = await user.auth.getUser();
    if (whoError || !who.user || !who.user.email) return fail(req, 'forbidden', 401);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return fail(req, 'bad_request');
    }
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) return fail(req, 'bad_request');
    const input = parsed.data;

    // 1. the typed confirmation
    if (input.confirm_email.trim().toLowerCase() !== who.user.email.toLowerCase()) {
      return fail(req, 'confirm_mismatch');
    }

    // 2. sole Owner of a live business
    const blockers = await user.rpc('account_delete_blockers');
    if (blockers.error) throw blockers.error;
    const b = blockers.data as {
      ok?: boolean;
      super_admin?: boolean;
      businesses?: { id: string; name: string }[];
    } | null;
    if (!b || b.ok !== true) return fail(req, 'forbidden', 403);
    if (b.super_admin === true) return fail(req, 'super_admin', 409);
    if ((b.businesses ?? []).length > 0) {
      return fail(req, 'sole_owner', 409, { businesses: b.businesses });
    }

    // 3. the password (a sign-in on a client that stores nothing)
    const verifier = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signIn = await verifier.auth.signInWithPassword({
      email: who.user.email,
      password: input.password,
    });
    if (signIn.error || signIn.data.user?.id !== who.user.id) {
      return fail(req, 'wrong_password', 400);
    }

    // 4. the deletion, one transaction in the database
    const commit = await serviceClient().rpc('account_delete_commit', { p_user_id: who.user.id });
    if (commit.error) throw commit.error;
    const c = commit.data as {
      ok?: boolean;
      code?: string;
      businesses?: unknown;
      already_deleted?: boolean;
    } | null;
    if (!c || c.ok !== true) {
      const code = c?.code ?? 'server_error';
      return fail(
        req,
        code,
        code === 'server_error' ? 500 : 409,
        c?.businesses ? { businesses: c.businesses } : {},
      );
    }
    return reply(req, 200, { ok: true, data: { already_deleted: c.already_deleted === true } });
  } catch (err) {
    logUnexpected('account', null, err);
    return fail(req, 'server_error', 500);
  }
});
