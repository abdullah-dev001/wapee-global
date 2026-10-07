# Forms & Consent (add-on `forms_consent`)
Status: **backend + UI done (Phase 10B)** · Last updated: 2026-10-07 · Suite `supabase/tests/24_files_forms.sql` · Real HTTP proof `25_files_forms_http.mjs`

## What it does
Owners build **intake** and **consent** forms (the same 5 field types as the booking form + plain-text consent blocks + optional signature), attach them to services, and have clients sign them on the salon's device OR from a tokenised link. Signed copies are immutable.

## Decided with the user (2026-10-07)
- A form attaches to services but **never blocks** a booking or a visit (the appointment drawer shows "Not signed yet / Signed"; the public booking page is unchanged).
- The **signature is vector strokes** stored in the immutable signed row (`signature jsonb`, points normalised 0..1, <= 50 strokes / 5,000 points): no bucket file, no new dependency. Pad = `components/shared/SignaturePad.tsx` (responder events + `react-native-svg`), read-only `SignatureView`.
- Roles: `forms.manage` (Owner, Manager; must cover EVERY branch, templates are business-level) builds / deletes templates and VOIDS signed copies; **signing / sending a link needs `appointments.edit`** on a client in scope (Own scope: their own clients); seeing signed copies needs `files.view`; **sensitive answers need `clients.view_sensitive`** (redacted by the RPC: the value never leaves the database).

## Data (templates readable by `forms_read_access`; everything else RPC-only)
`form_templates` (kind fixed at creation), `form_template_versions` (IMMUTABLE snapshot: title, fields, body blocks, requires_signature, sha256 digest; saving unchanged content makes NO new version, a change makes version n+1), `form_template_services`, `form_requests` (token_hash, 14-day expiry, used_at / revoked_at once, never deleted), `signed_consents` (IMMUTABLE for everyone incl. postgres: version, normalised answers, signer name, signature, `signed_via` dashboard | link, ip_hash, captured_by), `signed_consent_voids` (a void is a NEW row; the signed copy is untouched). `signed_consents` has NO API grant: reads go through `list_signed_consents` / `get_signed_consent`.
Validation (server, one place): `validate_form_fields` (<= 40 fields, unique safe ids, dropdown 2..50 unique options), `validate_form_body` (blocks heading | paragraph | bullet, plain text only, never HTML), `validate_form_answers` (types, required, dropdown membership, lengths), `validate_signature`.

## RPCs (`{ok,code}`, validate everything then ONE write, add-on off => `feature_unavailable`)
`save_form_template`, `delete_form_template` (soft; revokes open links), `record_signed_consent` (dashboard), `create_form_request(client, appointment?, template, send)` (returns the raw token ONCE; revokes older open links for that client+template; `send` seals the token into an outbox email/SMS `form_request` for the client, seam-free), `list_signed_consents`, `get_signed_consent`, `appointment_forms` (pending = no non-void copy of the template's CURRENT version for that client), `void_signed_consent` (reason >= 3). PUBLIC, service_role only: `get_form_request(token)` (first name + fields WITHOUT the sensitive flag, no ids / contact), `submit_form_request(token, answers, name, signature, ip_hash)` (row-locked, single use, never raises). Audit: `form.created|updated|deleted|signed|voided|request_created`.

## Public link (Edge `sign_form`, verify_jwt false) — same pattern as the manage / review links
`/<slug>/sign#token=...` (fragment, `no-referrer`, `noindex`). sha256 stored, 256-bit token, expiry, single use, ONE generic `invalid_token` for unknown / expired / used / revoked / template deleted / add-on off / business inactive, per-IP rate limit (`get_form_request` 60/h, `submit_form_request` 10/h, fails closed), honeypot, IP stored only as sha256(salt+ip). Proven over real HTTP including **two parallel submits of one token: exactly one signs**.
Email: outbox event `form_request` (client-addressed; `outbox_guard` re-checks the request is still unused / unrevoked / unexpired and the add-on is on); Edge templates + `formUrl` in `process.ts`; `send_outbox` redeployed. **No real form email was sent this round** (the fixture client had no email and SMS is off).

## UI
Settings > Forms (`/settings/forms`, `forms.manage` + feature; hub card): list + `FormTemplateEditor` (blocks, questions, services, sensitive flag, version note). `ClientFormsSection` on the client profile (sign here, send link, signed copies with void) and `AppointmentFormsSection` in the appointment drawer. `SignFormDrawer`, `FormRenderer` (shared with the public page), `RequestLinkDialog` (copy; shown once), `PublicSignPage`. Pure rules: `formsLogic.ts` (tested). Keys `form-templates`, `signed-consents`.

## Limits / not done
- No intake answers are copied into the client's custom fields; no PDF export of a signed copy; no per-template reminders; no consent expiry; a form is signed again only if the template changes (new version) or the copy is voided.
- The consent text is plain blocks (no bold / links) on purpose (nothing rendered can carry script).

## Changelog
- 2026-10-07: Phase 10B built (migrations `20261014090000`..`120000`, suite 24 = 144 assertions, HTTP proof 25 = 42 checks, Edge `sign_form` + `client_files`, UI).
