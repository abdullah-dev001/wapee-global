# Wapee — Product Overview (v2)
Updated: Oct 1, 2026 · Owner: @Abdullah
**This v2 replaces the earlier "Wapee — Product Overview" doc. Where they differ, v2 wins.**

## How to use this doc
Single source of truth for building Wapee. **Decided** = agreed, build as written. **Recommendation** = advice not yet confirmed. **Open** = must be settled before the related work ships.
GlowDesk (earlier aesthetic-clinic product) is not a code or data source. Wapee is built from scratch.
Companion file: DESIGN_GUIDE.md (extracted from the earlier Wapee web app). Section 12 summarises it.

---
## 0. Changes since v1 (Oct 1, 2026 planning session)
| # | Change | Status |
|---|---|---|
| 1 | **No MVP.** Build the full product. Only custom domain + SSL is skipped for now. | Decided |
| 2 | **Waitlist removed.** Customer simply picks the next available slot. | Decided |
| 3 | **Email is optional, phone is required** on the booking form. If no email: reminders/confirmations go by SMS (if business enabled SMS), else dashboard only. Guest cancel/reschedule link goes by email or SMS, is shown on screen after booking, and the business can resend it from the dashboard. | Decided |
| 4 | **Tax/VAT added to invoices** (tax %, business tax number, invoice numbering). | Decided |
| 5 | **Custom roles** added to the add-on list (Team: paid add-on, Business: included). | Decided |
| 6 | **Push notifications** added (Expo push) for business users. | Decided |
| 7 | **Email provider: Resend** (alternative Postmark). Per-business sender domain via SPF/DKIM. | Decided |
| 8 | **SMS provider: Twilio.** | Decided |
| 9 | **Languages:** i18n + RTL engine built from day one; any language = one new translation file. No special focus on any one language. Launch base language English. | Decided |
| 10 | **Launch countries:** all countries (international). | Decided |
| 11 | **Storage:** unlimited for now; per-plan limits can be added later. | Decided |
| 12 | **Trial ends = business becomes inactive**, no access to anything until a plan is assigned. | Decided |
| 13 | **Calendar:** day/week/list, one column per staff, visible slots, **no drag and drop**. Reschedule via form. | Decided |
| 14 | **Website:** one single page per business, dynamic data. SEO kept basic; revisit later if needed. | Decided |
| 15 | **Booking stays simple:** no multi-service-per-booking, no recurring appointments, no staff-specific price/duration. | Decided |
| 16 | **Custom domain + SSL skipped** for now. Every site uses the Wapee URL. | Decided |
| 17 | **Name stays "Wapee" during development.** Check pronunciation ("pee"), trademark and domain before deploy. Brand name lives in one config location so it can be renamed. | Decided |
| 18 | **Subscription collection (how Wapee gets paid) handled last.** Until then super admin assigns plans manually. | Decided |
| 19 | **Marketing verticals and industry presets** are handled by the owner outside product development. | Decided |
| 20 | **Apple/Google store policy review** postponed until before store submission. | Deferred |
| 21 | **Timezone/DST and DB-level no-double-booking** must be correct from the very start. | Decided |
| 22 | Final pricing, add-on prices and SMS rates treated as set (see section 10); still re-check after real data. | Decided |
| 23 | **Country, currency, timezone, address and tax settings live on the branch**, not the business (branches can be in different countries). Business keeps only default_* values to pre-fill new branches. A branch currency is locked once it has an invoice or payment. | Decided |
| 24 | **Invoice numbers are sequential per branch** (`prefix-000123`, no gaps), not per business. Replaces the earlier per-business rule. | Decided |
| 25 | **Reports never add different currencies.** Combined views show separate totals per currency; no conversion at launch. | Decided |

---
## 1. Product summary
Wapee is an international, generic appointment management platform for any business that sells time-slot services: salons, clinics, dental, physio, barbers, pet grooming, consultants, car service drop-offs and more. One Expo codebase serves iOS, Android and web.

Positioning: a simple, flat-priced booking and business system any appointment business can set up in minutes, with a ready booking website and optional modules for industries that need more.

Generic product, vertical marketing: one engine, separate "Wapee for Salons / Clinics" landing pages, templates and ads, 2 to 3 verticals at a time. Industry differences come from configuration (custom fields, presets, terminology), never per-industry code.

Business gets:
1. Booking engine with editable form, custom fields, booking settings.
2. Dashboard: appointments, clients, services, staff, invoices, reports.
3. Single-page website with booking flow on a Wapee URL.
4. Embed widget for existing websites.
5. Optional modules: packages and sessions, inventory, files and photos, forms and consent, client portal, commission, multi-branch, custom roles, advanced reports, SMS.

Principles: generic first; simple UX (smart defaults, one-line explanations, live preview, advanced collapsed); international from day one (currency, timezone, language per business).

## 2. Market and positioning
International only. Launch in all countries.

| Competitor | Focus | Entry pricing | Notes |
|---|---|---|---|
| Setmore | Generic | Free (4 users, 200 appts/mo); Pro $12/user | Per user |
| Square Appointments | Generic | Free; paid from $49/mo per location | Plus card fees |
| SimplyBook.me | Generic + site | Free (50 bookings); up to $59.90/mo | Custom domain extra (~EUR 119) |
| Fresha | Salon | $19.95 solo; $14.95 per member | 20% marketplace commission (min $6) |
| Vagaro | Salon/spa | $30 + $10 per extra staff | Paid add-ons |
| Pabau | Aesthetic | ~$59-69 per user | Likely |
| Boulevard, Zenoti, Mindbody | Premium/enterprise | $99-$500+ per location | Likely |

Where Wapee wins: flat team-friendly pricing (staff bands, not per seat); no marketplace commission; industry depth via optional modules; international by design.
Where weaker (be honest in marketing): no online payments/deposits at launch; no marketplace; no reviews or install base yet; competitors have free plans, Wapee has a trial only.
Rules: never claim a feature that is not live (HIPAA, automatic payments). Market by vertical.

## 3. Who it fits
Model: one customer books one service in one time slot.
- **Full:** salon, barber, nails, lash/brow, spa, makeup; clinic, dental, physio, chiropractor, aesthetics, dietitian, therapist; pet grooming, vet; consultant, lawyer, tutor, photographer, tattoo studio.
- **With limits:** car service/detailing/repair (slot only, no job tracking); home services (address via custom field, no travel time); gym/yoga classes (needs "people per slot").
- **Not supported:** restaurants (tables), hotels (nights), events/tickets, day rentals.

Industry presets: at signup the owner picks an industry; preset sets (1) starter custom fields, (2) terminology (Client/Patient/Customer, Appointment/Booking/Job, Chair/Room/Bay), (3) website template. All editable later. Preset content is defined by the owner outside development.

## 4. Platform and tech stack (Decided)
One Expo (React Native) codebase for iOS, Android, web; Supabase backend; whole product built at once from scratch.

| Layer | Choice |
|---|---|
| App | Expo, Expo Router, React Native Web |
| Backend | Supabase: Postgres, Auth, Storage, Realtime, Edge Functions |
| Security | Row Level Security on every tenant table |
| Fonts / icons | DM Sans (@expo-google-fonts/dm-sans); lucide-react-native |
| Forms | react-hook-form + zod |
| i18n | i18next + expo-localization, RTL ready, strings only in translation files |
| Email | Resend (transactional) |
| SMS | Twilio, called from Edge Functions |
| Push | Expo push notifications |

Layouts: mobile web behaves exactly like the mobile app. Desktop web uses a dashboard layout (Recommendation, accepted).
| Breakpoint | Navigation | Content |
|---|---|---|
| Mobile < 768 | Bottom tab bar (Today, Calendar, Clients, More) | Single column, full-screen sheets |
| Tablet 768-1024 | Collapsible sidebar | Two columns where useful |
| Desktop > 1024 | Fixed 240px sidebar + 64px header | Multi-column, 480px side drawer |

Surfaces: business app (iOS/Android/web); super admin (same app, platform flag); public booking page and website (web, responsive); client portal add-on (web, mobile-first); embed widget (JS snippet).

## 5. Users and roles
| User | Created how | Sees |
|---|---|---|
| Super admin | Directly in DB, exactly one | All businesses, subscriptions, platform settings |
| Owner | Self-signup, 14-day trial | Everything in their business |
| Manager | Invited | Branch operations |
| Receptionist | Invited | Bookings, clients, invoices |
| Staff | Invited | Own schedule and appointments |
| Customer | Guest booking, no account (account only with Client portal) | Own data via portal |

Super admin: platform-level flag (never a business role); mandatory 2FA; every action on a business audit-logged.
Super admin screens: businesses list/detail (plan, add-ons, status, usage); subscription status (manual); SMS balances; logged support view; platform settings (plans, add-on prices, SMS country rates, industry presets).
**Trial ends: business becomes inactive, no access to anything until super admin activates a plan.**

## 6. Core features (every plan)
### 6.1 Booking form
Default fields (owner can only change required/optional where allowed):
- Name (required), **Phone with country code (required)**, **Email (optional)**, Service, Date and time, Notes.

Custom fields: label (any text); type exactly 5 (short text, long text, dropdown, yes/no, number); required yes/no; shown for all services or selected services. Presets pre-create some. Form versioning: each booking stores its form version. Sensitive flag: answers visible only with clients.view_sensitive.

Guest manage link: secure tokenised link to cancel/reschedule per booking settings; sent by email or SMS, shown on screen after booking, resendable from dashboard.

### 6.2 Booking settings
Basic: show staff choice (hidden / optional with Any staff / required; default optional); slot display (only available / all with booked greyed; default only available); confirmation (auto / owner approves; default auto); show prices (default yes).
Advanced (collapsed): slot interval (15/30/60/service length); buffer (0); minimum notice (1h); booking window (30 days); customer can cancel (yes, 24h); rooms/chairs/bays (off); people per slot (1).
Hard rules: online booking never shows out-of-hours slots (staff can book out of hours in dashboard); slot available only if staff and (if on) resource both free; no double-booking enforced in DB.
UX: sensible default, one-line explanation, live preview of customer booking page beside settings.
**No waitlist.** Customers pick the next available slot shown.

### 6.3 Other core modules
- Calendar: day, week, list; **one column per staff, slots visible, no drag-and-drop**; create/reschedule/cancel via form; walk-ins; no-show; statuses pending/confirmed/completed/cancelled/no-show.
- Services: name, category, duration, price, which staff, which custom fields.
- Staff and schedule: working hours, breaks, time off, services offered.
- Clients: profile, contact, notes, visit and invoice history.
- Invoices: line items, discounts (reason required), **tax/VAT (tax % and tax number set per branch, invoice numbers sequential per branch with a branch prefix)**, manual payment (cash, card, bank transfer), status paid/partial/pending, printable, credit notes.
- Notifications: email (Resend) confirmed, reminder, rescheduled, cancelled; **push** to business users (new booking, cancellation, reminder); SMS per section 8.4.
- Basic reports: today and this month (revenue, appointments, top services).
- Reviews, website, currency/timezone/language per business (per branch with Multi-branch).
Not included: multi-service bookings, recurring appointments, staff-specific price/duration.

### 6.4 Reviews (all plans)
Completed appointment triggers request (email free; SMS uses credits) -> 1-5 stars + comment -> owner sees and replies -> owner picks reviews for website Testimonials -> optional Google review link.
Enforced by system: same Google link to every customer (no star-based filtering); no incentives; never ask customers to name staff.

## 7. Website and booking connector
### 7.1 Single-page website
**One page per business, data dynamic.** Sections in default order, each show/hide/reorder/edit: Hero, About, Services (live, prices if enabled), Gallery, Testimonials, FAQs, Contact (address, map, phone, hours, WhatsApp, social).
Customisation: brand colour, font, corner radius, logo, images, text. Industry preset picks the starting template.
Basics: page title, meta description, LocalBusiness structured data, mobile-first, fast. Book buttons follow booking settings. (SEO of Expo web to be revisited only if it becomes a problem.)

### 7.2 Address
Free Wapee address with readable slug. Recommendation: host business sites on a separate domain from the app (e.g. wapee.site/<slug>) so abuse on one site cannot flag the dashboard domain. Final domain open.
### 7.3 Custom domain + SSL: **SKIPPED for now.**
### 7.4 Booking connector (Team and above for widget)
1. Booking link/button (all plans). 2. Embed widget: per-business public key, allowed-domain list, rate limiting, bot protection. 3. WordPress plugin later.

## 8. Plan features and add-ons
### 8.1 Add-ons (any plan)
- **Packages & Sessions:** sell package; each visit deducts a session; bonus sessions; optional expiry; cannot exceed purchased or use after expiry; every deduction logged; undo within 10 minutes by the creator, owner can reverse any time (reversal row, never deletion).
- **Inventory:** products with stock, unit, low-stock threshold and alert; sold on invoices, stock reduces automatically; movement log.
- **Files & Photos:** attached to appointment/client; respects photo consent; private storage; **unlimited storage for now**.
- **Forms & Consent:** intake and consent forms with signature, signed copies stored.
- **Client portal:** customer login for bookings, packages, invoices, photos.
- **Custom roles & permissions:** Team = paid add-on, Business = included.
- Clinic bundle (Untested): Packages + Files & Photos + Forms & Consent + Client portal at a discount.

### 8.2 Plan features
Default roles; staff commission (per staff per service, flat or %, calculated when invoice paid, permanent, staff see only own); multi-branch (own hours, staff, prices, currency, timezone; combined owner view); embed widget; advanced reports.
### 8.3 Advanced reports
Weekly, monthly, custom range, each compared to previous equal period. Revenue (trend, by payment method, discounts); staff (appointments, revenue, commission); services; clients (new vs returning, retention); appointments (completed, cancelled, no-show rates); branch comparison (Business only); packages (when on). CSV and PDF export; scheduled weekly/monthly email.
### 8.4 SMS (Twilio)
Reminders, confirmations, review requests, and fallback when customer has no email. Paid by credits in packs, no free bundle. Credits deducted by destination country (Appendix B). Templates short; GSM 160 chars/segment, 70 with Unicode/emoji, so non-Latin scripts (Arabic, Urdu, etc.) cost more segments; credit logic must count segments and encoding. Marketing email campaigns out of scope.

## 9. Roles and permissions
Permission = action + scope. Role = named bundle. User gets a role per branch. Scopes: Own, Branch, All.
Catalogue (area.action): appointments.view/create/edit/cancel/approve; calendar.view_all_staff; clients.view/create/edit/view_contact/view_sensitive/export; services.manage; staff.view/manage/manage_schedule; invoices.view/create/discount/credit_note; reports.view_basic/view_advanced/view_revenue; reviews.view/reply/feature_on_website; website.edit/publish; settings.booking/business/billing; roles.manage; users.invite; packages.sell/deduct_session/reverse_session; inventory.view/adjust; files.upload/view; forms.manage; commission.view_own/view_all/manage_rules; sms.send/buy_credits. (Waitlist permission removed.)

Default roles matrix:
| Area | Owner | Manager | Receptionist | Staff |
|---|---|---|---|---|
| Appointments | All | Branch | Branch | Own |
| Calendar of all staff | Yes | Yes | Yes | No |
| Client contact details | Yes | Yes | Yes | No |
| Sensitive client fields | Yes | Yes | No | Own clients |
| Create invoices | Yes | Yes | Yes | No |
| Discounts / credit notes | Yes | Yes | No | No |
| Revenue reports | All | Branch | No | No |
| Staff and schedules | All | Branch | View | Own |
| Commission | Manage rules | View branch | No | Own only |
| Website and settings | Yes | Booking settings | No | No |
| Roles and invites | Yes | Invite staff | No | No |
| Wapee billing | Yes | No | No | No |

Default roles cannot be deleted; owners can clone into custom roles.
Safety: at least one Owner always; nobody grants a permission they lack; only Owner manages billing; all role changes audit-logged; super admin flag outside this system.
Enforcement in three places: RLS, Edge Function logic, UI. Hiding a button is never the boundary. Permission sets cached per session, refreshed on role change.

## 10. Pricing and plans
Three plans per location capped by staff bands; 14-day trial; no free plan; add-ons on any plan; SMS by credits.
| Feature | Solo | Team | Business |
|---|---|---|---|
| Staff per location | 1 | Up to 5 | Unlimited |
| Core + reviews + website + booking link | Yes | Yes | Yes |
| Default roles | Owner only | Yes | Yes |
| Staff commission | No | Yes | Yes |
| Embed widget | No | Yes | Yes |
| Advanced reports | No | Yes | Yes + branch comparison |
| Custom roles | No | Paid add-on | Included |
| Multi-branch | No | No | Yes, each extra branch billed |
| File storage | Unlimited for now | Unlimited for now | Unlimited for now |
(Custom domain: skipped. Waitlist: removed.)

Prices (to review after real data): Solo ~$15/mo, Team ~$39/mo, Business ~$79/mo per location, add-ons ~$8-15/mo, annual discount 17-20%.
Trial: 14 days; after it ends business is inactive. Subscription collection method is decided last; until then super admin assigns plan/status manually. Fact: Stripe does not support businesses registered in Pakistan; usual route is a company in a supported country.

## 11. Data model and business rules
Every tenant row has business_id (and branch_id where relevant); RLS restricts to the user's businesses. Tables (Recommendation):
- Platform: profiles (is_super_admin), plans, addons, business_subscriptions, business_addons, industry_presets, sms_country_rates, audit_logs
- Business: businesses (name, slug, language, industry, terminology, plan/trial/status, default_country/default_currency/default_timezone for pre-fill only), branches (country, currency, timezone, address, tax number, tax rate, invoice prefix and counter), business_members, roles, role_permissions, member_role_assignments
- Catalogue: service_categories, services, service_staff, resources, service_resources
- Schedule: staff_working_hours, staff_breaks, staff_time_off, branch_hours
- Booking form: booking_settings, custom_fields, custom_field_services, form_versions
- Bookings: clients, appointments, appointment_field_values, booking_manage_tokens
- Money: invoices (tax fields, sequential number), invoice_items, invoice_payments, credit_notes, commission_rules, commission_entries
- Add-ons: packages, client_packages, session_usages, inventory_items, stock_movements, files, consent_forms, signed_consents, client_portal_accounts
- Growth: reviews, review_requests, sms_credit_ledger, messages, push_tokens
- Website: websites, website_sections, widget_keys (domains table deferred)

Rules: soft delete only; financial records immutable (fix via credit notes/reversals); discounts need a reason; invoice items store price at sale time; **no double-booking enforced in Postgres** (exclusion constraint on staff + time range, and resource + time range when rooms on); session usage cannot exceed purchased + bonus or pass expiry, undo within 10 min by creator, owner reverses any time, reversals are new rows; commission computed when invoice becomes paid and stored permanently; **timestamps stored in UTC, slots computed in business/branch timezone including DST**; money as integers in minor units with currency code; custom field answers stored with form version; invoice numbers sequential per branch (prefix + number) with no gaps; country, currency, timezone and tax settings come from the branch, and slots/reminders use the branch timezone.

## 12. Design system
New Wapee uses the exact visual language of the earlier Wapee web app. Full guide: DESIGN_GUIDE.md.
Core tokens: Primary #024751 (hover #013640, light #e6f0f2); Secondary lime #d8ff29 (hover #c4eb1a, light #f6ffd6); Background #f8fafb; Surface #fff; Border #e5e7eb; Text #111827 / #6b7280 / #9ca3af; Sidebar bg #024751, text #a8c5ca, active pill #d8ff29 with #024751 text, hover #035f6e; Success #10b981, Warning #f59e0b, Error #ef4444, Info #3b82f6 (each with light and border variants, see Appendix A). Font DM Sans, letter-spacing -0.02em (-0.03em headings). Radius 6/8/12/16/full. Motion 120/180/260ms, colour changes only. Layout: sidebar 240, header 64, page padding 24 (16 mobile), card padding 24 (18 mobile), drawer 480.
Component specs: Button (primary, secondary lime, ghost, danger; sm 34, md 41, lg 48; radius 8; disabled 0.55); Input (label above 13/600, 1px border, radius 8, ~40px, focus primary border + 3px #e6f0f2 ring, error red); Card (white, 1px border, radius 12, flat); Badge (pill 11/600 tinted); Drawer 480 right (full screen mobile); Dialog max 26rem; Tabs underline; Segmented; Toggle 36x20; Empty states; skeleton loaders (never list spinners).
Expo translation: all tokens in one typed theme object, no hard-coded hex; shadow() helper per level (iOS shadow*, Android elevation, web boxShadow); hover only on web via Pressable; web keyboard focus ring kept; rem -> numbers with 16px base, mobile scale-down in theme; one icon library (lucide, stroke 1.75, sizes 14-22).
New components to design: calendar/scheduler (day/week, multi-staff columns, **no drag**), date and date-range pickers, time-slot picker, phone input with country code, checkbox/radio, toasts, charts (one library for web+native), bottom tab bar, website section templates, booking flow screens, signature pad. Dark mode: not at launch. Fix old inconsistencies: one focus style, one disabled opacity (0.55), one spinner speed (600ms).

## 13. Security, privacy, compliance
RLS on every table; super admin 2FA + logged access; private storage buckets with short-lived signed URLs; photo upload disabled without client consent; sensitive fields gated; audit log (role changes, financial actions, soft deletes, super admin access); rate limiting and bot protection on public endpoints, exposing only services and free slots; guest manage tokens are unguessable, expiring and single-booking scoped; GDPR export and deletion per client; no HIPAA claims; secrets (Twilio, Resend) only in Edge Function secrets.

## 14. Full build scope (no MVP)
1. Foundation: Expo project, theme, responsive shell, i18n + RTL, Supabase schema + RLS, timezone/DST and money handling, soft delete, audit log.
2. Auth: login, self-signup, 14-day trial, invites, super admin with 2FA, inactive-after-trial.
3. Roles and permissions incl. custom roles add-on.
4. Booking engine: form, custom fields, settings, slot calculation, DB double-booking guard, guest manage links.
5. Dashboard: calendar (multi-staff columns), services, staff, clients, invoices with tax, basic reports.
6. Notifications: email (Resend), push (Expo), SMS (Twilio) with credits.
7. Reviews.
8. Website (single page) and booking link and embed widget.
9. Plans, add-ons, manual billing by super admin.
10. Plan features: commission, multi-branch, advanced reports.
11. Add-on modules: packages, inventory, files and photos, forms and consent, client portal.
12. Super admin screens.
13. Security and privacy: rate limiting, bot protection, GDPR flows.
Last: subscription payment collection.

## 15. Out of scope
Online payments and deposits; memberships, gift cards, promo codes, loyalty; marketing email campaigns; calendar sync; job tracking; payroll; WordPress plugin (later); marketplace; dark mode; multi-page websites; **waitlist; custom domain + SSL; drag-and-drop calendar; recurring and multi-service bookings.**

## 16. Open / deferred decisions
- [ ] How Wapee collects subscription payments (company setup, provider): decided last.
- [ ] Final name: check pronunciation, trademark, domain before deploy.
- [ ] Website domain: wapee.online/<slug> vs separate domain (recommended wapee.site).
- [ ] Main domain availability (wapee.com).
- [ ] Apple/Google store policy review before store submission.
- [ ] Whether to add marketing email later.
- [ ] Revisit pricing, storage limits, SEO of Expo web after real data.

## Appendix A. Design tokens
```
primary #024751 | primary-hover #013640 | primary-light #e6f0f2
secondary #d8ff29 | secondary-hover #c4eb1a | secondary-light #f6ffd6
background #f8fafb | surface #ffffff | surface-hover #f3f4f6
border #e5e7eb | border-subtle #f0f0f0
text-primary #111827 | text-secondary #6b7280 | text-muted #9ca3af
text-on-primary #ffffff | text-on-secondary #024751
sidebar-bg #024751 | sidebar-text #a8c5ca | sidebar-active #d8ff29
sidebar-active-text #024751 | sidebar-hover #035f6e
success #10b981 / #ecfdf5 / #a7f3d0
warning #f59e0b / #fffbeb / #fde68a
error #ef4444 (hover #dc2626) / #fef2f2 / #fecaca
info #3b82f6 / #eff6ff / #bfdbfe
overlay rgba(0,0,0,0.5)
font DM Sans; tracking -0.02em, headings -0.03em
radius sm 6, md 8, lg 12, xl 16, full 9999
shadow-sm 0 1px 2px 0 rgba(17,24,39,0.05)
shadow-md 0 4px 6px -1px rgba(17,24,39,0.07), 0 2px 4px -2px rgba(17,24,39,0.05)
shadow-lg 0 10px 15px -3px rgba(17,24,39,0.08), 0 4px 6px -4px rgba(17,24,39,0.05)
shadow-drawer -8px 0 24px -4px rgba(17,24,39,0.12)
transitions 120ms / 180ms / 260ms ease
sidebar 240 | header 64 | page-padding 24 (16 mobile) | card-padding 24 (18 mobile) | drawer 480
z-index header 30, sidebar 40, overlay 50, drawer 60, toast 70
```

## Appendix B. SMS cost by country (Twilio list prices, Sept 2026)
US $0.0083 + carrier fees (~$0.011-0.013 all-in); Australia $0.0515; UK $0.056; UAE $0.1176.
Credits are deducted per destination country and per segment (Unicode = 70 chars/segment).