# Security review — Phase 11A

Date: 2026-10-07 · Scope: every table, every SECURITY DEFINER function, Storage, Edge Functions, auth config, advisors.
Method: catalogue queries against the live project (`pg_class`, `pg_policies`, `role_table_grants`, `pg_proc`, `storage.buckets`),
a read of every function the API roles can execute that did not match an obvious permission check, the Supabase advisors,
and SQL / HTTP suites (28, 29, 30 new; 01-27 re-run). Not covered: a penetration test, Supabase's own platform, the web host
(not chosen yet), Android / iOS binaries.

## Findings (ranked)

### High
| # | Finding | Status |
|---|---|---|
| H1 | `clients.view_contact` was enforced only by the app omitting the columns. Any member who could read a client row could `select phone_e164, email, notes` through PostgREST (RLS masks rows, not columns), and `list_appointments` returned `client_phone` to everybody with `appointments.view`. | **Fixed** (`20261016090000`): `authenticated` has no privilege on those two columns; `clients_v` returns them only with `clients.view_contact`; `list_appointments` reads the view. Suite 28 (34 checks) + HTTP proof (suite 30) per role. |

### Medium
| # | Finding | Status |
|---|---|---|
| M1 | No GDPR export or erase (doc §13). | **Fixed** (`20261016100000`, `…110000`, `gdpr` Edge Function): permission `clients.export` / new `clients.erase` (Owner), audited, atomic, idempotent, Storage objects removed through the Storage API. Suite 29 (72 checks), HTTP 28/28. |
| M2 | A business could not be deleted by anything but a superuser with `enforce_last_owner` disabled; its bucket objects were left behind (4 orphans existed). | **Fixed**: Owner-only erase (typed name, storage first, one `erasure_log` row without personal data). The 4 orphaned objects were removed. |
| M3 | `is_slug_available` and `my_grants` (SECURITY DEFINER) were executable by `anon`, unthrottled. | **Fixed** (`20261016120000`). |
| M4 | `business_is_active(uuid)` and `suggest_invoice_prefix(uuid, text)` answered for ANY business id for any signed-in user (state of, and branch prefixes inside, another tenant). Needs a guessed UUID. | **Fixed** (`20261016120000`): not executable by API roles (used only inside DEFINER functions). |
| M5 | `supabase/config.toml` allowed 6-character passwords while the app requires 8. | **Fixed in config.** The REMOTE project's setting is a dashboard value: check Authentication → Policies. |
| M6 | Leaked-password protection is off (Pro plan feature). | **Open — plan limit.** Enable when the project goes to Pro (Phase 12). |
| M7 | Widget embedding is only enforced by a `frame-ancestors` header the web host must send. | **Mitigated for launch (2026-10-10):** `vercel.json` sends `frame-ancestors 'self'` on `/<slug>/book` and `'none'` everywhere else, so nothing outside the site can frame any page; the widget stays off until per-business frame policy middleware exists. CORS defaults to `PUBLIC_SITE_URL` (+ localhost dev ports). |
| M8 | **Single origin (2026-10-10):** business-owned pages (`/<slug>`, booking, portal, reviews) are served from the same origin as the dashboard, whose Supabase session lives in `localStorage`. Any script injection on a business page would be able to read a staff member's session. | **Accepted with conditions:** business content is rendered by React as text (the only `dangerouslySetInnerHTML` is the build-time `app/+html.tsx` shell); keep it that way: never render business-supplied HTML/Markdown as HTML, and move the Report-Only CSP to enforcing after launch. Separate origins would remove this class of risk. |

### Accepted by design: `security_definer_view` on `clients_v`
The Supabase advisor reports an ERROR for a view that runs with its owner's rights. It is intentional. `authenticated` has no privilege on `clients.phone_e164`, `email` or `notes`, so the only way to return them to people who hold `clients.view_contact` is a view (or function) that reads as the owner. The view therefore carries the row-visibility rule itself (the same expression as the `clients_select` policy, set-based) and is a **security barrier**, so no caller-supplied filter can run against a row the caller may not see. Proof, per caller (Owner, Manager, Receptionist, Staff, other business, anon): suite 28 compares the ids returned by `clients_v` with the ids RLS shows on `clients` (equal for every caller, and the sets differ per caller), a filter that raises on one hidden row never touches it, and the blanked columns are NULL without the permission; suite 31 repeats the equality for 8 callers including an inactive business and a super admin. If the policy ever changes, suite 31 fails until the view is changed too.

### Low / informational
| # | Finding | Status |
|---|---|---|
| L1 | The erase exemption in the immutable-table guards is a transaction-local setting (`wapee.gdpr_erase`, `wapee.erase_business`) set only inside the erase RPCs. It is safe because PostgREST exposes only `public` (verified: `rpc/set_config` and `rpc/pg_sleep` answer 404), so no API caller can set it. Never expose `pg_catalog`. | Accepted, tested (suite 29 §4). |
| L2 | `booking_manage_tokens.token_hash` and `message_outbox.sealed` / `payload` are column-readable by users whose RLS lets them see the row (hash of a 256-bit token; ciphertext; the outbox policy is super-admin only). | Accepted. |
| L3 | `clients.notes` was column-readable by every `clients.view` holder (the UI hid it). | **Fixed** (`20261017090000`): the column is not granted; `clients_v` returns notes only with `clients.view_contact` (no new permission). Suite 28 per role. |
| L4 | No table uses `FORCE ROW LEVEL SECURITY`; the owner role bypasses RLS. This is required by the SECURITY DEFINER design; each DEFINER function carries its own check (inventory below). | By design. |
| L5 | Supabase's default ACL grants new tables to `authenticated` (SELECT/INSERT/UPDATE/DELETE; never TRUNCATE) and new functions to `anon`/`authenticated`. Every migration revokes explicitly (CLAUDE.md), and suites 28/29 assert it for new objects. | Accepted; keep the rule. |
| L6 | Realtime is not used: no table is published (migration `20261019100000_remove_realtime.sql`), the app opens no websocket. | Closed. |
| L7 | `invite_preview(token)` stays callable by `anon` (needed before login); the token is 256-bit random and stored hashed. No rate limit on that one RPC. | Accepted. |
| L8 | Advisors after the phase: **ERROR `security_definer_view` on `clients_v` (intentional, see the section above)**: the view must read the three locked columns as its owner, so it carries the row-visibility rule itself and is a SECURITY BARRIER; suite 31 proves it equals the `clients_select` policy per caller and suite 28 proves a leaky filter cannot probe hidden rows. `anon_security_definer_function_executable` is down to `invite_preview` only. Others: `extension_in_public` (pg_net — not exposed through the API), 123 × `authenticated_security_definer_function_executable` (each function is gated; see inventory), `rls_enabled_no_policy` ×8 (intentional: tables only DEFINER / service role touch), 37 unused indexes (INFO; tiny data). | Accepted. |
| L9 | `supabase secrets list` prints a digest per secret in its JSON. Do not paste its output anywhere. | Process note. |

## Storage buckets
| Bucket | Public | Size / types | Policies |
|---|---|---|---|
| `client-files` | no | 10 MB; jpeg/png/webp/pdf | **none** (no API role can read, list, write or delete; only 5-minute signed URLs minted by Edge Functions after an RPC check). Proven over HTTP in Phases 10B and 11A. |
| `website-assets` | yes (public website images) | 5 MB; jpeg/png/webp | select / insert / delete for `authenticated` with `website_asset_path_ok(name)` and `can(<business id from the path>, …)` |

## Edge Functions
| Function | verify_jwt | Why / boundary | Secrets |
|---|---|---|---|
| get_booking_page, get_slots, create_booking, manage_booking, get_website, get_review_request, submit_review, validate_widget, sign_form, portal, unsubscribe | false | public by design (a customer has no account); per-IP / key rate limits that fail closed (`rate_limit_rules`), service-role RPCs that re-resolve everything from a slug or a hashed token | PUBLIC_IP_HASH_SALT, PUBLIC_FORM_HMAC_KEY, PUBLIC_SITE_ORIGINS, UNSUBSCRIBE_SIGNING_KEY |
| send_outbox | false | cron worker; authenticates with a Vault-held `x-worker-token` checked by `outbox_worker_authorize`; anything else is 404 | RESEND_*, TWILIO_*, VAPID_*, EXPO_ACCESS_TOKEN, PUBLIC_SITE_URL |
| resend_manage_link, message_preview, client_files, **gdpr** | true | called by the signed-in dashboard; the caller's JWT is forwarded and the RPC behind it is the boundary | none beyond the service key injected by Supabase |

## Table inventory (RLS / policies / grants)
Every one of the 85 public tables has RLS **on**. `pol` lists the policy commands. `auth` / `anon` list API-role table privileges
(SEL, INS, UPD, DEL). `anon` has none anywhere except `reserved_slugs` and `appointment_status_transitions` (both read-only reference data).

| table | RLS | pol | auth | anon |
|---|---|---|---|---|
| addons | on | SELECT | SEL | - |
| appointment_field_values | on | INSERT/SELECT/UPDATE | INS,SEL,UPD | - |
| appointment_status_transitions | on | SELECT | SEL | - |
| appointments | on | INSERT/SELECT/UPDATE | INS,SEL,UPD | - |
| audit_logs | on | SELECT | SEL | - |
| booking_manage_tokens | on | SELECT | SEL | - |
| booking_settings | on | SELECT/UPDATE | SEL,UPD | - |
| branch_closures | on | DELETE/INSERT/SELECT/UPDATE | DEL,INS,SEL,UPD | - |
| branch_hours | on | DELETE/INSERT/SELECT/UPDATE | DEL,INS,SEL,UPD | - |
| branches | on | INSERT/SELECT/UPDATE | INS,SEL,UPD | - |
| business_addons | on | SELECT | SEL | - |
| business_members | on | INSERT/SELECT/UPDATE | INS,SEL,UPD | - |
| business_subscriptions | on | SELECT | - | - |
| businesses | on | SELECT/UPDATE | SEL,UPD | - |
| client_consents | on | — (service / DEFINER only) | - | - |
| client_package_cancellations | on | SELECT | SEL | - |
| client_package_services | on | SELECT | SEL | - |
| client_packages | on | SELECT | SEL | - |
| clients | on | INSERT/SELECT/UPDATE | INS,UPD | - |
| commission_entries | on | SELECT | SEL | - |
| commission_lines | on | SELECT | SEL | - |
| commission_rules | on | SELECT | SEL | - |
| credit_notes | on | SELECT | SEL | - |
| custom_field_services | on | DELETE/INSERT/SELECT | DEL,INS,SEL | - |
| custom_fields | on | DELETE/INSERT/SELECT/UPDATE | DEL,INS,SEL,UPD | - |
| data_requests | on | SELECT | SEL | - |
| erasure_log | on | — (service / DEFINER only) | - | - |
| files | on | SELECT | - | - |
| form_requests | on | — (service / DEFINER only) | - | - |
| form_template_services | on | SELECT | SEL | - |
| form_template_versions | on | SELECT | SEL | - |
| form_templates | on | SELECT | SEL | - |
| form_versions | on | SELECT | SEL | - |
| industry_presets | on | SELECT | SEL | - |
| inventory_settings | on | SELECT | SEL | - |
| invite_accept_attempts | on | — (service / DEFINER only) | - | - |
| invoice_items | on | SELECT | SEL | - |
| invoice_payments | on | SELECT | SEL | - |
| invoices | on | SELECT | SEL | - |
| member_role_assignments | on | DELETE/INSERT/SELECT/UPDATE | DEL,INS,SEL,UPD | - |
| message_outbox | on | SELECT | SEL | - |
| message_suppressions | on | SELECT | SEL | - |
| messages | on | SELECT | SEL | - |
| messaging_limits | on | SELECT | SEL | - |
| notification_settings | on | SELECT/UPDATE | SEL | - |
| package_services | on | SELECT | SEL | - |
| packages | on | SELECT | SEL | - |
| permissions | on | SELECT | SEL | - |
| plans | on | SELECT | SEL | - |
| portal_login_tokens | on | — (service / DEFINER only) | - | - |
| portal_sessions | on | — (service / DEFINER only) | - | - |
| products | on | SELECT | SEL | - |
| profiles | on | SELECT/UPDATE | SEL,UPD | - |
| public_request_attempts | on | — (service / DEFINER only) | - | - |
| push_preferences | on | SELECT | SEL | - |
| push_tokens | on | DELETE/SELECT | DEL,SEL | - |
| rate_limit_rules | on | SELECT | - | - |
| report_schedules | on | SELECT | SEL | - |
| reserved_slugs | on | SELECT | SEL | SEL |
| resources | on | DELETE/INSERT/SELECT/UPDATE | DEL,INS,SEL,UPD | - |
| review_requests | on | SELECT | - | - |
| reviews | on | SELECT | SEL | - |
| role_permissions | on | DELETE/INSERT/SELECT/UPDATE | DEL,INS,SEL,UPD | - |
| roles | on | DELETE/INSERT/SELECT/UPDATE | DEL,INS,SEL,UPD | - |
| service_branches | on | DELETE/INSERT/SELECT/UPDATE | DEL,INS,SEL,UPD | - |
| service_categories | on | DELETE/INSERT/SELECT/UPDATE | DEL,INS,SEL,UPD | - |
| service_resources | on | DELETE/INSERT/SELECT | DEL,INS,SEL | - |
| service_staff | on | DELETE/INSERT/SELECT | DEL,INS,SEL | - |
| services | on | DELETE/INSERT/SELECT/UPDATE | DEL,INS,SEL,UPD | - |
| session_usages | on | SELECT | SEL | - |
| signed_consent_voids | on | — (service / DEFINER only) | - | - |
| signed_consents | on | — (service / DEFINER only) | - | - |
| sms_country_rates | on | SELECT | SEL | - |
| sms_credit_accounts | on | SELECT | SEL | - |
| sms_credit_ledger | on | SELECT | SEL | - |
| staff_branches | on | DELETE/INSERT/SELECT | DEL,INS,SEL | - |
| staff_breaks | on | DELETE/INSERT/SELECT/UPDATE | DEL,INS,SEL,UPD | - |
| staff_profiles | on | DELETE/INSERT/SELECT/UPDATE | DEL,INS,SEL,UPD | - |
| staff_time_off | on | DELETE/INSERT/SELECT/UPDATE | DEL,INS,SEL,UPD | - |
| staff_working_hours | on | DELETE/INSERT/SELECT/UPDATE | DEL,INS,SEL,UPD | - |
| stock_movements | on | SELECT | SEL | - |
| storage_cleanup_queue | on | — (service / DEFINER only) | - | - |
| website_sections | on | SELECT | SEL | - |
| websites | on | SELECT | SEL | - |
| widget_keys | on | SELECT | SEL | - |

## Function inventory
348 functions in `public`; 143 are executable by an API role (130 SECURITY DEFINER). The other 205 are internal: executable only by
`service_role` / the owner (trigger functions, outbox and portal internals). Every SECURITY DEFINER function has `search_path = ''`.

Exposed functions: `D` = SECURITY DEFINER, `A` = also executable by `anon`, `g` = body contains a permission / membership / session check
(directly or through a named gate helper); a function marked `-` is SECURITY INVOKER (RLS applies to its reads) or was read by hand and is listed in the notes below.


`accept_invite`:Dg · `add_payment`:Dg · `addon_read_access`:Dg · `adjust_stock`:Dg · `admin_add_sms_credits`:Dg · `admin_list_reviews`:Dg · `admin_set_sms_rate`:Dg · `appointment_forms`:Dg · `approve_appointment`:Dg · `archive_branch`:Dg · `assign_member_role`:Dg · `assign_plan`:Dg · `branch_is_bookable`:D- · `can`:Dg · `can_grant_at`:Dg · `cancel_appointment`:Dg · `client_email`:Dg · `client_in_scope`:Dg · `client_package_used`:D- · `client_phone`:Dg · `commission_can_see`:Dg · `contact_business_ids`:Dg · `covers_every_branch`:Dg · `create_appointment`:Dg · `create_branch`:Dg · `create_business_with_owner`:Dg · `create_credit_note`:Dg · `create_custom_role`:Dg · `create_form_request`:Dg · `create_invoice_draft`:Dg · `deduct_session`:D- · `delete_custom_role`:Dg · `delete_file`:Dg · `delete_form_template`:Dg · `delete_package`:Dg · `delete_product`:Dg · `delete_report_schedule`:D- · `discard_invoice_draft`:Dg · `ensure_website`:Dg · `ensure_widget_key`:Dg · `extend_trial`:Dg · `file_visible`:Dg · `files_access`:Dg · `files_prepare_upload`:Dg · `forms_read_access`:Dg · `gdpr_business_erase_check`:Dg · `gdpr_erase_business_commit`:Dg · `gdpr_erase_client`:Dg · `gdpr_export_client`:Dg · `get_advanced_report`:Dg · `get_appointment_messages`:Dg · `get_basic_report`:D- · `get_business_detail`:Dg · `get_calendar_appointments`:i- · `get_client_files_state`:Dg · `get_combined_overview`:Dg · `get_commission_report`:Dg · `get_invoice_print_data`:Dg · `get_signed_consent`:Dg · `has_permission`:Dg · `has_permission_at_branch_scope`:Dg · `invite_member`:Dg · `invite_preview`:DA- · `is_allowed_appointment_transition`:iA- · `is_member`:Dg · `is_own_staff_profile`:Dg · `is_owner_or_manager`:Dg · `is_slug_available`:D- · `is_super_admin`:D- · `issue_invoice`:Dg · `list_appointments`:i- · `list_business_member_names`:Dg · `list_businesses`:Dg · `list_client_files`:Dg · `list_client_packages`:i- · `list_data_requests`:Dg · `list_invoices`:Dg · `list_my_branches`:Dg · `list_reviews`:i- · `list_roles`:Dg · `list_signed_consents`:Dg · `low_stock_count`:i- · `mark_completed`:Dg · `mark_no_show`:Dg · `member_branch_ids`:Dg · `my_features`:Dg · `my_grants`:Dg · `my_permissions_version`:Dg · `my_plan_usage`:Dg · `my_staff_profile_id`:Dg · `normalise_phone_e164`:i- · `package_visible`:Dg · `perm_all_branches`:Dg · `record_signed_consent`:Dg · `register_push_token`:Dg · `reissue_review_request`:Dg · `remove_member`:Dg · `remove_member_role`:Dg · `remove_review`:Dg · `reopen_appointment`:Dg · `reorder_website_sections`:Dg · `replace_branch_hours`:ig · `replace_staff_breaks`:ig · `replace_staff_working_hours`:ig · `reply_to_review`:Dg · `resend_manage_link`:Dg · `resolve_data_request`:Dg · `restore_branch`:Dg · `reverse_payment`:Dg · `reverse_session`:D- · `revoke_invite`:Dg · `rotate_widget_key`:Dg · `save_booking_settings`:ig · `save_form_template`:Dg · `save_package`:Dg · `save_product`:Dg · `save_push_preferences`:Dg · `save_website_section`:Dg · `save_website_settings`:Dg · `save_widget_domains`:Dg · `set_addon`:Dg · `set_addon_prices`:Dg · `set_business_status`:Dg · `set_commission_rule`:Dg · `set_inventory_settings`:Dg · `set_photo_consent`:Dg · `set_plan_prices`:Dg · `set_primary_branch`:Dg · `set_report_schedule`:Dg · `set_review_featured`:Dg · `set_website_published`:Dg · `set_widget_active`:Dg · `staff_in_scope`:Dg · `support_view_business`:Dg · `unregister_push_token`:Dg · `update_appointment`:Dg · `update_branch`:Dg · `update_custom_role`:Dg · `update_invoice_draft`:Dg · `upsert_industry_preset`:Dg · `void_signed_consent`:Dg · `website_asset_path_ok`:iA- · `widget_domains_ok`:i-


Read by hand (no regex gate hit; all confirmed): `admin_list_reviews`, `get_business_detail`, `list_businesses`, `remove_review`, `support_view_business`
(`admin_gate()`: super admin + aal2); `archive_branch`, `create_branch`, `restore_branch`, `set_primary_branch` (`branch_admin_gate`); `delete_package`, `delete_product`,
`deduct_session`, `reverse_session` (`addon_access` / `can` + scope); `discard_invoice_draft`, `update_invoice_draft`, `list_invoices` (`invoice_access`);
`get_basic_report` (`report_windows` returns nothing for a non-member); `delete_report_schedule` (`report_schedule_gate`); `perm_all_branches` (own grants only);
`branch_is_bookable` (answers a public fact about a branch); `client_package_used` (count for one package, called by `list_client_packages`); `invite_preview` (token); `is_super_admin` (self).
New in 11A: `gdpr_export_client`, `gdpr_erase_client`, `gdpr_business_erase_check`, `gdpr_erase_business_commit`, `list_data_requests`, `resolve_data_request` (permission checks first; anon cannot execute);
`gdpr_storage_done`, `portal_create_data_request` (service role only); `client_phone`, `client_email`, `contact_business_ids` (permission + row visibility re-checked).

## What was tested for this review
- Suites 28 (view_contact, per role), 29 (GDPR), 30 (HTTP: real Storage), 31 (RLS rewrite equals the old rules), and the existing 01-27 re-run at the end of the phase. Suites 22 and 24 count rows across the whole database and fail while `nova-hair-studio` still holds its manual-test files / consent / audit rows (data-dependent, unrelated to this phase; documented in the handoff).
- Over HTTP: REST cannot read `clients.phone_e164` / `email` / `*` (403); `rpc/set_config` and `rpc/pg_sleep` are 404; the `gdpr` function refuses anon (401), a Manager, Staff and a stranger and leaves every bucket object in place.
