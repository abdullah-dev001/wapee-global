# Wapee — Build Plan (Phases)
Updated: Oct 1, 2026 · Based on: Wapee_Product_Overview_v2.md

## Rules for every phase
- Har phase ke aakhir mein kaam **chalta hua aur test kiya hua** ho, phir agla phase.
- Schema shuru se poora socha hua: har tenant table par `business_id` aur `branch_id` (jahan zaroori), chahe multi-branch UI baad mein aaye.
- Har nayi table ke saath uski RLS policy usi waqt banegi, baad mein nahi.
- Har UI string translation file mein, har colour/size theme object se.
- Timestamps UTC mein, money minor units mein, soft delete, audit log: phase 0 se.

---

## Phase 0 — Foundation
**Maqsad:** project ka dhaancha jis par sab kuch banega.
- Expo project (iOS, Android, web), Expo Router, TypeScript
- Theme object (tokens, DM Sans, lucide, shadow helper), base components: Button, Input, Card, Badge, Drawer, Dialog, Tabs, Toggle, Skeleton, Empty state, Toast
- Responsive shell: mobile bottom tabs, tablet sidebar, desktop 240px sidebar + 64px header
- i18n (i18next + expo-localization), RTL ready, English base
- Supabase project, migrations setup, `audit_logs`, soft delete pattern, helper SQL functions (current user's businesses, permission check)
- Brand name ek config file mein (rename aasan)
- **Done jab:** app teeno platforms par khulti hai, shell aur base components theme se chalte hain.

## Phase 1 — Auth, business setup, roles
- Signup (owner), login, password reset, email verification
- Onboarding: business name, industry, country, currency, timezone, language, first branch
- 14-day trial auto start; trial khatam = business inactive (lock screen)
- Default roles (Owner, Manager, Receptionist, Staff), permission catalogue, scopes (Own/Branch/All), RLS + UI enforcement
- Invite flow (manager, receptionist, staff)
- Super admin flag + 2FA (basic access abhi, screens Phase 8 mein)
- **Done jab:** owner signup karke team invite kar sakta hai aur har role ko sirf apna data dikhta hai.

## Phase 2 — Catalogue aur schedule
- Service categories, services (duration, price, staff, custom fields link)
- Staff profiles, working hours, breaks, time off, services offered
- Branch opening hours, holidays/closed days
- Resources (rooms/chairs/bays) aur service-resource link
- **Done jab:** business apni services, staff aur timings set kar sakta hai.

## Phase 3 — Booking engine
- Booking settings (basic + advanced) with live preview
- Booking form: fixed fields (phone required, email optional), 5 custom field types, per-service, sensitive flag, form versioning
- Slot calculation engine (hours, breaks, time off, buffer, notice, window, interval, resources, people per slot, timezone/DST)
- DB-level no double-booking (exclusion constraints)
- Public booking page (Wapee URL slug) + booking link/button
- Guest manage link (cancel/reschedule, tokenised), screen par bhi dikhega
- Rate limiting + bot protection on public endpoints
- **Done jab:** customer online booking kar sakta hai, double booking impossible hai, timezone sahi hai.

## Phase 4 — Calendar, appointments, clients
- Calendar: day, week, list; staff columns; visible slots; no drag
- Create / edit / reschedule / cancel via form, walk-ins, statuses, no-show, approve (if manual confirmation)
- Fresh data without Realtime: refetch on focus/reconnect, 30 s refresh on Today and Calendar, manual refresh
- Clients: list, search, profile, contact, notes, visit history, sensitive fields gating
- Today screen (mobile home)
- **Done jab:** receptionist poora din calendar se chala sakta hai.

## Phase 5 — Invoices, tax, basic reports
- Invoices: line items (price at sale time), discounts with reason, tax/VAT, sequential numbering (no gaps)
- Manual payments (cash, card, bank), partial/paid/pending, printable/PDF, credit notes, immutable records
- Appointment se invoice banana
- Basic reports: today, this month (revenue, appointments, top services)
- **Done jab:** appointment complete → invoice → payment → report mein dikhe.

## Phase 6 — Notifications
- Email via Resend: confirmed, reminder, rescheduled, cancelled (templates translatable)
- Push via Expo: new booking, cancellation, reminder (business users), push tokens
- SMS via Twilio: credits ledger, country rates, segment/Unicode counting, buy credits (manual abhi), email na ho to SMS fallback
- Scheduled reminders (cron Edge Function)
- **Done jab:** har booking event par sahi channel se message jaye aur SMS credits sahi katen.

## Phase 7 — Website, reviews, embed widget
- Single-page website: 7 sections (show/hide/reorder/edit), brand colour/font/radius/logo/images, industry templates, SEO basics, LocalBusiness data
- Reviews: request on Completed, 1–5 stars + comment, owner reply, website testimonials, Google link (no gating)
- Embed widget: public key, allowed domains, rate limit
- **Done jab:** business ki live website hai jisse booking aati hai aur reviews dikhte hain.

## Phase 8 — Plans, add-ons framework, super admin
- Plans (Solo/Team/Business), staff caps, feature gating, add-on toggles (off = module hidden)
- Super admin screens: businesses list/detail, plan/status/add-ons assign, usage, SMS balances, logged support view, platform settings (plans, prices, SMS rates, industry presets)
- Trial / active / inactive lifecycle poora
- **Done jab:** super admin kisi bhi business ka plan aur add-ons control kar sakta hai aur gating sahi kaam karti hai.

## Phase 9 — Plan features
- Custom roles & permissions (safety rules ke saath)
- Staff commission (rules, auto on paid invoice, staff ko sirf apna)
- Multi-branch UI (alag hours, staff, prices, currency, timezone; owner combined view)
- Advanced reports (periods + comparison, sab report types, CSV/PDF, scheduled email)
- **Done jab:** Team aur Business plan ke saare features chalte hain.

## Phase 10 — Add-on modules
1. Packages & Sessions
2. Inventory
3. Files & Photos (consent, signed URLs)
4. Forms & Consent (signature pad)
5. Client portal (customer login, bookings, packages, invoices, photos)
- **Done jab:** har add-on on/off hota hai aur apne rules ke saath chalta hai.

## Phase 11 — Hardening aur QA
- GDPR: client data export aur deletion
- Security review: RLS tests har table, Supabase advisors, rate limits, secrets
- Performance (calendar, reports), accessibility check
- Full end-to-end testing teeno platforms par
- **Done jab:** koi known security/data issue nahi.

## Phase 12 — Launch prep (deferred items)
- Subscription payment collection (company + provider)
- Final naam: pronunciation, trademark, domain
- Website domain (wapee.site ya jo final ho)
- App Store / Play Store policy review aur submission
- Production setup, monitoring, backups
- **BLOCKER (widget):** booking page must be served with `Content-Security-Policy: frame-ancestors <per-business allowed domains>` (value from `validate_widget` action `frame_policy`) by the web host; without it the widget domain list is not enforced. Also set `PUBLIC_SITE_ORIGINS` / `PUBLIC_WEBSITE_BASE_URL`.

---

## Baad mein (abhi nahi)
Custom domain + SSL, storage limits, online payments/deposits, WordPress plugin, marketing email, dark mode.

## Order ki wajah
0 → 1 → 2 → 3 ek doosre par depend karte hain (bina business ke services nahi, bina services ke booking nahi). 4 aur 5 booking ke baad. 6 aur 7 ko real bookings chahiye. 8 gating ka framework hai jo 9 aur 10 se pehle zaroori hai. 11 aur 12 launch se pehle.
