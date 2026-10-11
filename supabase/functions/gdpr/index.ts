/**
 * POST /functions/v1/gdpr   (JWT required: the signed-in dashboard user)
 *
 * The parts of GDPR erasure that SQL cannot do: removing objects from Storage. Deleting `storage.objects`
 * rows in SQL leaves the bytes behind (and Supabase refuses it), so the database records WHAT must go
 * (`storage_cleanup_queue`) and this function removes it through the Storage API.
 *
 *   { action: 'erase_client',   client_id }
 *       -> RPC gdpr_erase_client AS THE CALLER (permission `clients.erase`, validation, one transaction),
 *          then removes the queued objects and tells the database. Idempotent: call it again to finish a
 *          storage cleanup that failed half way.
 *   { action: 'erase_business', business_id, confirm_name }
 *       -> RPC gdpr_business_erase_check (Owner + typed name), empties BOTH buckets under `<business_id>/`
 *          (storage FIRST), then RPC gdpr_erase_business_commit (re-checks, refuses if anything is still in
 *          Storage, writes one erasure_log row, deletes the business).
 *
 * Export needs no function: `gdpr_export_client` is called directly with the user's session.
 * Order matters: data first / storage second for a client (a storage failure is retried, personal data is
 * already gone); storage first / data second for a business (the commit is irreversible).
 */

import { z } from 'npm:zod@3';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, handlePreflight } from '../_shared/cors.ts';
import { logUnexpected } from '../_shared/response.ts';
import { serviceClient } from '../_shared/supabase.ts';

const BUCKETS = ['client-files', 'website-assets'] as const;

const EraseClient = z
  .object({ action: z.literal('erase_client'), client_id: z.string().uuid() })
  .strict();
const EraseBusiness = z
  .object({
    action: z.literal('erase_business'),
    business_id: z.string().uuid(),
    confirm_name: z.string().min(1).max(200),
  })
  .strict();
const RequestSchema = z.discriminatedUnion('action', [EraseClient, EraseBusiness]);

function reply(req: Request, status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
  });
}
const fail = (req: Request, code: string, status = 400) => reply(req, status, { ok: false, code });

function statusFor(code: string): number {
  if (code === 'forbidden') return 403;
  if (code === 'not_found') return 404;
  return 409;
}

type Db = ReturnType<typeof serviceClient>;

/** Every object under `<prefix>/` in a bucket (the Storage API lists one folder level at a time). */
async function listAll(db: Db, bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = [];
  const queue = [prefix];
  while (queue.length > 0) {
    const dir = queue.pop() as string;
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await db.storage
        .from(bucket)
        .list(dir, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const entry of data) {
        // A folder has no id / metadata in the listing.
        if (entry.id === null) queue.push(`${dir}/${entry.name}`);
        else out.push(`${dir}/${entry.name}`);
      }
      if (data.length < 100) break;
    }
  }
  return out;
}

async function removeAll(db: Db, bucket: string, paths: string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await db.storage.from(bucket).remove(paths.slice(i, i + 100));
    if (error) throw error;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return fail(req, 'bad_request');

  try {
    const authHeader = req.headers.get('Authorization');
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!authHeader || !url || !anonKey) return fail(req, 'bad_request');

    // The caller's own client: RLS and auth.uid() behave exactly as for a normal app request.
    const user = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: who, error: whoError } = await user.auth.getUser();
    if (whoError || !who.user) return fail(req, 'forbidden', 401);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return fail(req, 'bad_request');
    }
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) return fail(req, 'bad_request');
    const input = parsed.data;
    const svc = serviceClient();

    if (input.action === 'erase_client') {
      const { data, error } = await user.rpc('gdpr_erase_client', { p_client_id: input.client_id });
      if (error) {
        if (error.code === '42501' || error.code === '42883') return fail(req, 'forbidden', 403);
        throw error;
      }
      const r = data as {
        ok?: boolean;
        code?: string;
        already_erased?: boolean;
        storage_pending?: { id: string; bucket: string; path: string }[];
      } | null;
      if (!r || r.ok !== true) {
        const code = r?.code ?? 'server_error';
        return fail(req, code, statusFor(code));
      }
      // Personal data is already gone and committed. Now the objects. A failure here is reported and the
      // queue keeps the paths: calling this again finishes the job.
      const pending = r.storage_pending ?? [];
      let storageDone = true;
      try {
        for (const bucket of BUCKETS) {
          const rows = pending.filter((p) => p.bucket === bucket);
          if (rows.length === 0) continue;
          await removeAll(
            svc,
            bucket,
            rows.map((p) => p.path),
          );
          const { error: markError } = await svc.rpc('gdpr_storage_done', {
            p_ids: rows.map((p) => p.id),
          });
          if (markError) throw markError;
        }
      } catch (err) {
        storageDone = false;
        logUnexpected('gdpr', null, err);
      }
      return reply(req, 200, {
        ok: true,
        data: {
          already_erased: r.already_erased === true,
          storage_removed: storageDone ? pending.length : 0,
          storage_pending: storageDone ? 0 : pending.length,
        },
      });
    }

    // erase_business
    const check = await user.rpc('gdpr_business_erase_check', {
      p_business_id: input.business_id,
      p_confirm_name: input.confirm_name,
    });
    if (check.error) {
      if (check.error.code === '42501' || check.error.code === '42883')
        return fail(req, 'forbidden', 403);
      throw check.error;
    }
    const c = check.data as { ok?: boolean; code?: string } | null;
    if (!c || c.ok !== true) {
      const code = c?.code ?? 'server_error';
      return fail(req, code, statusFor(code));
    }
    // Storage FIRST. If this throws, the business is untouched and the owner can simply retry.
    for (const bucket of BUCKETS) {
      await removeAll(svc, bucket, await listAll(svc, bucket, input.business_id));
    }
    const commit = await user.rpc('gdpr_erase_business_commit', {
      p_business_id: input.business_id,
      p_confirm_name: input.confirm_name,
    });
    if (commit.error) throw commit.error;
    const k = commit.data as {
      ok?: boolean;
      code?: string;
      counts?: Record<string, number>;
    } | null;
    if (!k || k.ok !== true) {
      const code = k?.code ?? 'server_error';
      return fail(req, code, statusFor(code));
    }
    return reply(req, 200, { ok: true, data: { counts: k.counts ?? {} } });
  } catch (err) {
    logUnexpected('gdpr', null, err);
    return fail(req, 'server_error', 500);
  }
});
