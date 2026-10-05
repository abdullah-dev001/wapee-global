# Website, reviews and widget (backend)
Status: backend done, deployed, tested · NO UI · Phase: 7A · Last updated: 2026-10-07

## What it does
Backend for the single-page business website, customer reviews and the embed widget. No screens yet (Phase 7B). Public access is only through four Edge Functions; `anon` has no table grants.

## Website
- `websites` (one per business, `branch_id` defaults to primary, theme: brand colour/font/radius/logo/hero, `template_key`, SEO overrides, `is_published`) and `website_sections` (7 FIXED types, one each: hero, about, services, gallery, testimonials, faqs, contact; `is_visible`, `sort_order`, jsonb `content`).
- Content is validated per type by `website_section_content_error()` (unknown keys refused, lengths capped, URLs https-only, gallery paths must be `<business_id>/<uuid>.jpg|png|webp`), called by the RPCs (returns `{ok:false,code:'invalid_content',detail}`) AND by a BEFORE trigger.
- Writes are DEFINER RPCs only: `ensure_website`, `save_website_settings` (atomic, JSON null clears), `save_website_section`, `reorder_website_sections`, `set_website_published` (audited, idempotent). Edit = `website.edit`; publish = `website.publish` (Owner only; Manager has neither, per doc §9). Tables: SELECT policy for edit/publish holders.
- `get_website_public(slug)` (service_role) returns NULL for unknown/deleted/inactive/unpublished (identical). Services are live (`show_prices` respected), contact address/phone/hours come from the website's branch, empty sections are dropped, testimonials = featured published reviews (first name only). Returns SEO title/description and LocalBusiness JSON-LD; the Edge Function adds `url`/`image`.
- `website_template_defaults(key)` is the seam for industry presets (all keys give neutral empty defaults until the owner defines presets).
- Business id appears inside asset URLs (path is scoped by business_id, as decided). Nothing else public carries an id.

## Reviews
- `review_requests` (one per appointment FOR ALL TIME, sha256 token hash, 30-day expiry, `used_at`, `sent_at` = Phase 6 seam) and `reviews` (1-5, comment, `reviewer_first_name` snapshot, `staff_id` internal only, `status` published/removed, owner reply, `featured_on_website`). Customer words are immutable (trigger). `token_hash` is not readable by `authenticated`.
- `mark_completed` now creates the request in the same transaction and returns `review_request:{token,expires_at}` ONCE (only when newly created). Reopen + complete again never makes a second request. `reissue_review_request(appointment)` (appointments.edit, scope-checked) rotates the token: old token dies, refused if reviewed / not completed. Seam for sending: `create_review_request_internal` is the one place a token is minted.
- Public (service_role): `get_review_request(token)`, `submit_review(token, rating, comment)`. Every failure is the same `{ok:false,code:'invalid_token'}` (unknown, expired, used, reopened, inactive). Never raises. `submit_review` returns the branch's `google_review_url` for EVERY rating, never on failure.
- Owner: `list_reviews` (keyset, filters branch/rating/has_reply/featured, INVOKER so RLS applies), `reply_to_review`, `set_review_featured` (max 12 featured). Audited. RLS: Branch/All scope sees the branch; Staff (Own) only reviews of their own appointments. `removed` is reserved for a super-admin takedown (no RPC yet).
- `branches.google_review_url` (https only) is the one Google link.

## Widget
- `widget_keys` (one live key per business, `wk_`+32 hex, `allowed_domains` = exact lowercase hostnames, max 10, `is_active`). RPCs (website.edit): `ensure_widget_key`, `save_widget_domains`, `set_widget_active`, `rotate_widget_key`, all audited. Plan gating (Team+) = Phase 8 seam `widget_feature_enabled()` (always true now).
- `validate_widget` Edge Function: `validate` (browser `Origin` header + key -> HMAC embed token bound to slug+origin, 1 h TTL), `verify` (token+slug+origin, re-checks the domain is still allowed), `frame_policy` (CSP `frame-ancestors` sources). All refusals are `not_found`. `public/widget.js` is the loader (not run in a browser yet).
- **LAUNCH BLOCKER: real enforcement is the `Content-Security-Policy: frame-ancestors` header on the booking page**, which the web host must emit using `frame_policy`. Edge Functions cannot serve HTML. Until then the booking page can be framed by anyone. Also the booking page must read `?embed=` and call `verify` (UI, 7B).

## Assets bucket
`website-assets`: public by URL, 5 MB, jpeg/png/webp (no SVG), no listing for anon, names `<business uuid>/<uuid>.<ext>`, insert/select/delete need `website.edit` on the path's business, max 60 objects per business, no UPDATE (immutable). Not stripped: EXIF/GPS. Content type is checked from the declared header, not sniffed.

## Files
Migrations `20261007090000_phase7_website`, `…100000_phase7_reviews`, `…110000_phase7_widget`, `…120000_phase7_website_assets_bucket`, `…130000_phase7_regex_and_dedupe_fixes` (fix found by the first test run). Edge: `get_website`, `get_review_request`, `submit_review`, `validate_widget`, `_shared/embedToken.ts` (+ small edits to cors/config/rateLimit/response). Test: `supabase/tests/16_website_reviews_widget.sql` (417 assertions). Rate limits: get_website 60/min, get_review_request 60/h, submit_review 10/h, validate_widget 120/min (per IP).

## Known limits
- Deploy: `supabase functions deploy <name> --no-verify-jwt` (pinned in config.toml). Optional secret `PUBLIC_WEBSITE_BASE_URL` (default placeholder `https://wapee.site`).
- Nothing sends the review link (Phase 6). No reminder/expiry cleanup job. No UI to remove a review.
- Responses are not cached; `get_website` hits the DB per view (rate limited).

## Changelog
- 2026-10-07: Built (7A). 417 SQL assertions; positive+negative HTTP checks against the deployed functions with a throwaway business (deleted).
