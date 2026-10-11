/**
 * POST /functions/v1/client_files   (DASHBOARD endpoint: the JWT is verified)
 *
 * Files & Photos. The bucket `client-files` is PRIVATE and has NO storage policy, so the API roles can
 * neither read, list nor write it. This function is the only door, and it never uses the service role
 * to DECIDE anything: every permission / client-scope / consent / add-on / size check is made by an RPC
 * called AS THE CALLER (their JWT forwarded). The service role is used only for the bucket itself, and
 * only after that RPC said yes.
 *
 *   { action: 'prepare', client_id, appointment_id?, category, name, mime, size }
 *       -> { file_id, upload_url }   a signed UPLOAD url for one exact path (uuid filename)
 *   { action: 'finish',  file_id }
 *       -> { status }                reads the object's first bytes: a file whose real type is not the
 *                                     declared one, or that is missing / oversize, is REJECTED and removed
 *   { action: 'urls',    file_ids: uuid[<=50], ttl?: 2..300 }
 *       -> { urls: [{ file_id, url, mime, name }] }   signed READ urls for the files the caller may view
 *
 * EXIF / GPS data inside photos is NOT stripped (the dashboard says so).
 */

import { z } from 'npm:zod@3';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, handlePreflight } from '../_shared/cors.ts';
import { logUnexpected } from '../_shared/response.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { clampTtl, detectMime, totalFromContentRange } from '../_shared/files/sniff.ts';

const BUCKET = 'client-files';

const PrepareSchema = z
  .object({
    action: z.literal('prepare'),
    client_id: z.string().uuid(),
    appointment_id: z.string().uuid().nullish(),
    category: z.string().max(20),
    name: z.string().min(1).max(300),
    mime: z.string().max(100),
    size: z.number().int(),
  })
  .strict();
const FinishSchema = z.object({ action: z.literal('finish'), file_id: z.string().uuid() }).strict();
const UrlsSchema = z
  .object({
    action: z.literal('urls'),
    file_ids: z.array(z.string().uuid()).min(1).max(50),
    ttl: z.number().optional(),
  })
  .strict();
const RequestSchema = z.discriminatedUnion('action', [PrepareSchema, FinishSchema, UrlsSchema]);

function reply(req: Request, status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
  });
}
const fail = (req: Request, code: string, status = 400) => reply(req, status, { ok: false, code });

/** RPC code -> HTTP status (the app maps the code to a message). */
function statusFor(code: string): number {
  if (code === 'forbidden') return 403;
  if (code === 'not_found') return 404;
  if (code === 'feature_unavailable') return 403;
  return 400;
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
    const userId = who.user.id;

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

    if (input.action === 'prepare') {
      const { data, error } = await user.rpc('files_prepare_upload', {
        p_client_id: input.client_id,
        p_appointment_id: input.appointment_id ?? null,
        p_category: input.category,
        p_original_name: input.name,
        p_mime: input.mime,
        p_size: input.size,
      });
      if (error) {
        // An anon-key caller has no EXECUTE: that is a refusal, not an outage.
        if (error.code === '42501' || error.code === '42883') return fail(req, 'forbidden', 403);
        throw error;
      }
      const r = data as { ok?: boolean; code?: string; file_id?: string; path?: string } | null;
      if (!r || r.ok !== true || !r.file_id || !r.path) {
        return fail(req, r?.code ?? 'server_error', statusFor(r?.code ?? 'server_error'));
      }
      const signed = await svc.storage.from(BUCKET).createSignedUploadUrl(r.path);
      if (signed.error || !signed.data) {
        // Do not leave a pending row behind: report the object as unusable.
        await svc.rpc('files_finalize', {
          p_file_id: r.file_id,
          p_user_id: userId,
          p_detected_mime: 'none',
          p_size: 1,
        });
        throw signed.error ?? new Error('no signed upload url');
      }
      return reply(req, 200, {
        ok: true,
        data: { file_id: r.file_id, upload_url: signed.data.signedUrl },
      });
    }

    if (input.action === 'finish') {
      // Only the uploader's own pending row; the service role reads it, the RPC re-checks the user.
      const { data: row } = await svc
        .from('files')
        .select('id, storage_path, mime_type, status, created_by')
        .eq('id', input.file_id)
        .maybeSingle();
      if (!row || row.created_by !== userId || row.status !== 'pending')
        return fail(req, 'not_found', 404);

      let detected: string | null = null;
      let size: number | null = null;
      const signed = await svc.storage.from(BUCKET).createSignedUrl(row.storage_path, 60);
      if (signed.data) {
        const res = await fetch(signed.data.signedUrl, { headers: { Range: 'bytes=0-31' } });
        if (res.ok || res.status === 206) {
          const head = new Uint8Array(await res.arrayBuffer());
          detected = detectMime(head.slice(0, 32));
          size = totalFromContentRange(res.headers.get('content-range'));
          if (size === null && res.status === 200)
            size = Number(res.headers.get('content-length')) || null;
        }
      }
      const { data, error } = await svc.rpc('files_finalize', {
        p_file_id: row.id,
        p_user_id: userId,
        p_detected_mime: detected ?? 'none',
        p_size: size ?? 0,
      });
      if (error) throw error;
      const r = data as { ok?: boolean; status?: string } | null;
      if (!r || r.ok !== true) {
        // Rejected (wrong real type, missing, empty, too big): the bytes must not stay in the bucket.
        await svc.storage.from(BUCKET).remove([row.storage_path]);
        return reply(req, 422, { ok: false, code: 'file_rejected' });
      }
      return reply(req, 200, { ok: true, data: { status: 'ready' } });
    }

    // urls
    const { data: allowed, error } = await user.rpc('files_access', { p_file_ids: input.file_ids });
    if (error) {
      if (error.code === '42501' || error.code === '42883') return fail(req, 'forbidden', 403);
      throw error;
    }
    const rows = (allowed ?? []) as { file_id: string; path: string; mime: string; name: string }[];
    if (rows.length === 0) return reply(req, 200, { ok: true, data: { urls: [] } });
    const signed = await svc.storage.from(BUCKET).createSignedUrls(
      rows.map((r) => r.path),
      clampTtl(input.ttl),
    );
    if (signed.error || !signed.data) throw signed.error ?? new Error('no signed urls');
    const byPath = new Map(signed.data.map((s) => [s.path, s.signedUrl]));
    const urls = rows
      .map((r) => ({
        file_id: r.file_id,
        url: byPath.get(r.path) ?? null,
        mime: r.mime,
        name: r.name,
      }))
      .filter((u) => u.url !== null);
    return reply(req, 200, { ok: true, data: { urls } });
  } catch (err) {
    logUnexpected('client_files', null, err);
    return fail(req, 'server_error', 500);
  }
});
