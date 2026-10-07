# Files & Photos (add-on `files_photos`)
Status: **backend + UI done (Phase 10B)** · Last updated: 2026-10-07 · Suite `supabase/tests/24_files_forms.sql` · Real HTTP proof `25_files_forms_http.mjs` (fixture `25_seed_files_forms.sql` / `25_cleanup_files_forms.sql`)

## What it does
Photos and PDFs attached to a CLIENT and optionally one APPOINTMENT (before / after / damage / other photos, documents). Files tab on the client profile and in the appointment drawer: consent switch, add photo (image picker) / add PDF (web), gallery with signed-URL thumbnails, delete confirm. Unlimited storage for now, but a per-business cap of 5,000 live files.

## Decided with the user (2026-10-07)
- **Types** jpeg / png / webp / pdf only. **No HEIC** (browsers cannot show it; the picker converts iPhone photos to JPEG). **10 MB** per file. Declared type is never trusted: the Edge Function reads the object's FIRST BYTES (`_shared/files/sniff.ts`, unit-tested) and a mismatch, an empty or a missing object is `rejected` and removed from the bucket.
- **Photo consent** per client (`client_consents`: value, date, who; changed with `set_photo_consent`, needs `clients.edit` on the client, every change audited as `client.photo_consent_changed`, withdrawing consent keeps existing photos). An IMAGE upload without consent is refused (`photo_consent_required`); **PDFs are allowed without it**.
- **Staff** got `files.upload` at OWN scope (their own clients only). Receptionist and Manager upload + view; Owner everything; `files.view` for Staff stays Own.

## Storage (the important part)
Bucket `client-files`: **private**, 10 MB, allowed mime list, **no policy on `storage.objects` for it at all**, so anon and authenticated can neither read, list, write nor delete through the Storage API (proved over real HTTP: owner direct GET, public URL, list, POST, DELETE all refused / empty). Path `<business_id>/<client_id>/<file uuid>.<ext>`; the original name is metadata only, never in the path. EXIF / GPS inside photos is NOT stripped (the UI says so).

## Flow (Edge Function `client_files`, JWT verified, calls the RPCs AS THE CALLER)
1. `prepare` → RPC `files_prepare_upload` (permission + client scope + add-on + type + size + category + appointment match + consent + cap) inserts a `pending` row → the function mints a signed UPLOAD url for that exact path.
2. The browser PUTs the bytes. 3. `finish` → the function range-reads the first 32 bytes, then service-only `files_finalize(file, user, detected_mime, size)` → `ready` (+ audit `file.uploaded`) or `rejected` (+ object removed).
4. `urls` → RPC `files_access(ids)` (RLS-equivalent check as the caller) → signed READ urls, default and maximum **300 s** (`ttl` 2..300). A pending, rejected or deleted file never gets one.
Soft delete (`delete_file`, audited `file.deleted`): the row is kept, the object stays in the bucket, no URL is minted afterwards.

## Data / RPCs
`files` (metadata; column-level SELECT for authenticated WITHOUT `storage_path`; ready + not deleted + `file_visible` = add-on on + `files.view` on the client in scope via `client_access`, which mirrors the clients policy incl. Own scope), `client_consents`. RPCs: `files_prepare_upload`, `files_finalize` (service_role), `files_access`, `list_client_files` (keyset pages of 20, no path in the payload), `delete_file`, `set_photo_consent`, `get_client_files_state`. Add-on off => `feature_unavailable` / RLS hides everything; nothing is lost while off.

## UI
`src/features/files/` (`filesLogic.ts` tested, `api/useFiles.ts`, `pickDocument.ts`, `components/ClientFilesSection.tsx`). Query keys `client-files`, `client-file-urls` (invalidate with `.business()`). The URL query goes stale after 4 minutes and refetches before the 5-minute expiry.

## Limits / not done
- **PDF upload from the device works on WEB only**: native needs `expo-document-picker`, which is not installed (would be a new dependency: ask). Native can add photos.
- Pending rows older than an hour stop counting toward the cap but are never cleaned up; objects of a deleted BUSINESS stay in the bucket (no FK): remove them with the Storage API (see `25_files_forms_http.mjs` header / the cleanup note in _handoff.md).
- No thumbnails/resizing (the full image is loaded); no per-file captions; no virus scan.
- Photo withdrawal does not hide earlier photos.

## Changelog
- 2026-10-07: Phase 10B built (migrations `20261014090000`..`120000`, suite 24, HTTP proof 25, Edge `client_files`, UI).
