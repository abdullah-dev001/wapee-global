# Vercel setup: first Preview deploy against the DEV Supabase project

Goal: a working Preview of the `dev` branch on Vercel, using the **dev** Supabase project, so you can test the
real hosting before any production setup. Production (`main`, `wapee.online`) comes later (see
`docs/go-live-plan.md` section 5).

No secret goes in this file or the repo. Every value you paste comes from a dashboard; the Supabase anon
(publishable) key and the VAPID **public** key are public by design, but still paste them only into Vercel.

What the repo already does (nothing to configure for these): `vercel.json` sets install `npm ci`, build
`npm run build:web`, output `dist`, clean URLs, the SPA fallback to `/_app/shell`, security and cache headers.
`package.json` `engines` pins Node 24.x. The build stops with a clear message if `EXPO_PUBLIC_SUPABASE_URL` or
`EXPO_PUBLIC_SUPABASE_ANON_KEY` is missing.

Screen labels below match Vercel's dashboard as documented in Oct 2026; small wording differences are possible.

---

## (a) Import the GitHub repo

1. Sign in at https://vercel.com (use the GitHub account that can see `abdullah-dev001/wapee-global`).
2. Click **Add New...** (top right) > **Project**.
3. Under **Import Git Repository**, choose **GitHub**. If the repo is not listed, click **Adjust GitHub App
   Permissions**, give the Vercel app access to `wapee-global`, then come back.
4. Next to `wapee-global`, click **Import**.
5. On **Configure Project**:
   - **Project Name**: `wapee-global` (the preview URLs are built from it).
   - **Framework Preset**: **Other**.
   - **Root Directory**: leave `./`.
   - **Build and Output Settings**: leave them alone (`vercel.json` overrides them).
   - **Environment Variables**: leave EMPTY here. Variables added on this screen go to every environment;
     you will add them per environment in step (b).
6. Click **Deploy**.
   - This first deployment is a **Production** deployment of `main`. `main` does not have `vercel.json` yet
     and no env vars are set, so it is expected to **fail or be useless. That is fine: ignore it.** Nothing is
     attached to `wapee.online`, and we do not merge `dev` into `main` now.
7. Open the project (**Continue to Dashboard**).

### Settings to check once
- **Settings > Git**: **Production Branch** stays `main`. Every push to `dev` makes a Preview deployment.
- **Settings > Build and Deployment**: Node.js Version can stay at the default; `engines` in `package.json`
  wins (24.x).
- **Settings > Deployment Protection**: **Vercel Authentication** is ON for previews by default, which means
  only people signed in to your Vercel team can open the preview. That is fine for a private test, but the
  browser fetches `manifest.json` and the service worker without your Vercel login, so **PWA install will
  not work while protection is on**. For the PWA check, set it to **Disabled** (or "Only Production
  Deployments") temporarily, test, then turn it back on.

## (b) Environment variables

### Find your stable preview URL first
Vercel gives each branch a stable alias: `https://wapee-global-git-dev-<your-team-slug>.vercel.app`
(every deployment also gets its own one-off URL; do not use that one).

To see it: trigger the first `dev` preview (next step), then open **Deployments**, click the Preview for
branch `dev`, and copy the **Domains** entry that contains `-git-dev-`. Use that exact URL (no trailing slash)
wherever this file says `<PREVIEW_URL>`.

Trigger the first `dev` preview: **Deployments** > **...** menu (or **Create Deployment**) > pick branch `dev` >
**Create**. If your dashboard has no such button, any new push to `dev` triggers it. The first `dev` build
will also stop at the env check until the variables below exist; that is expected.

### Add the Preview variables (dev Supabase values)
**Settings > Environment Variables**. For each row: enter **Key** and **Value**, under **Environments** tick
**Preview** only, and in the branch field choose **`dev`** (so only the `dev` preview uses the dev
backend), then **Save**.

| Key | Value (where to copy it from) |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase dashboard > dev project `rfuovquhultjydtswtqf` > **Project Settings > API** > Project URL (`https://rfuovquhultjydtswtqf.supabase.co`) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Same page > **anon / publishable** key. **Never** the `service_role` / secret key. |
| `EXPO_PUBLIC_SITE_URL` | `<PREVIEW_URL>` (canonical links, sitemap, invite and booking links shown in the app) |
| `EXPO_PUBLIC_VAPID_PUBLIC_KEY` | The dev VAPID **public** key: the value of the same key in your local `.env` |

### Production variables
Leave Production EMPTY for now. When you go live they become: the production Supabase URL and anon key,
`EXPO_PUBLIC_SITE_URL=https://wapee.online`, the production VAPID public key (go-live plan W2). With Production
empty, a build of `main` stops at the env check, which is the safe default.

### Redeploy so the variables take effect
Env vars are baked in at build time. **Deployments** > the `dev` Preview > **...** > **Redeploy** (leave
"Use existing Build Cache" unticked). Wait for **Ready**.

## (c) Supabase dev project: allow the preview origin

All three are on the **dev** project only. Write down what you change so you can undo it after the test.

1. **Auth redirect URL (required for sign-up confirm and password reset from the preview).**
   Supabase dashboard > dev project > **Authentication > URL Configuration** > **Redirect URLs** >
   **Add URL**: `<PREVIEW_URL>/**` > **Save**.
   The app asks Supabase to send email links back to the page's own origin (`/verify`, `/reset-password`), and
   Supabase refuses any origin not in this list.
2. **Auth Site URL (optional, temporary).** Leave it as it is unless you want links in Supabase's own auth
   emails that do NOT pass a redirect to land on the preview. If you change it to `<PREVIEW_URL>`, set it back
   after the test.
3. **Edge Functions CORS (required for the booking page, website, manage, review, sign and portal pages).**
   The dev functions only allow the origin in the dev secret `PUBLIC_SITE_URL` plus local dev ports; the
   preview URL is not one of them (checked 2026-10-10: a request from `https://wapee.online` was refused too).
   Add the preview with `PUBLIC_SITE_ORIGINS`. It REPLACES the default list, so include the local ports you
   use. From the repo root:

   ```sh
   supabase secrets set --project-ref rfuovquhultjydtswtqf \
     PUBLIC_SITE_ORIGINS="<PREVIEW_URL>,http://localhost:8081,http://localhost:8082,http://localhost:8090,http://localhost:8092,http://127.0.0.1:8081"
   ```

   Secrets apply to the functions without a redeploy (give it a minute). To undo after the test:
   `supabase secrets unset --project-ref rfuovquhultjydtswtqf PUBLIC_SITE_ORIGINS`.
   Note: guest emails (manage / review / unsubscribe links) are built from the dev `PUBLIC_SITE_URL`, not from
   the preview, so links inside emails sent during this test will not open the preview. That is expected.

## (d) What to test on the real preview

Open `<PREVIEW_URL>` in a normal browser window (signed in to Vercel if protection is on), and keep DevTools >
Console and Network open. For every page also press **reload** (hard refresh: Cmd+Shift+R): a reload must
never show a Vercel 404.

| # | Check | Expected |
|---|---|---|
| 1 | `/` signed out | Landing page; prices appear after a short skeleton (Solo / Team / Business, add-ons, compare table); the Monthly / Yearly toggle changes prices; no console errors. |
| 2 | `/login` + reload | Login screen. |
| 3 | `/today` signed out + reload | Goes to `/login` (no 404). |
| 4 | Sign in (a dev account) | Lands on `/today` with data. Then open `/` again: it jumps straight to `/today`. |
| 5 | `/today` signed in + reload | Today screen again (no 404, no sign-out). Try `/calendar` and `/clients` + reload too. |
| 6 | `/nova-hair-studio/book` + reload | "Nova Hair Studio" with its services (if you see a network/CORS error in the console, step (c)3 is missing). |
| 7 | Booking | Pick a service, staff, a free time, fill the form, confirm: confirmation screen with a manage link. Then check it shows in `/calendar` for that day. |
| 8 | `/privacy`, `/terms`, `/refund` + reload | Each page loads, shows the DRAFT note, footer email `support@wapee.online`; `/refund` names "Polar Software, Inc.". `/privacy.html` redirects to `/privacy`. |
| 9 | Headers | `curl -I <PREVIEW_URL>/login` shows `x-frame-options: DENY`; `curl -I <PREVIEW_URL>/nova-hair-studio/book` shows `SAMEORIGIN` and `frame-ancestors 'self'`; a `/_expo/static/...js` file shows `max-age=31536000, immutable`. (With protection on, curl gets a 401: test headers while it is disabled, or in the browser Network tab.) |
| 10 | PWA install (protection disabled, see (a)) | Chrome desktop: install icon in the address bar; Android Chrome: menu > Install app; iPhone Safari: Share > Add to Home Screen. The installed app opens on `/today` (or `/login` when signed out), full screen. DevTools > Application: manifest has no errors, service worker `sw.js` is activated. |
| 11 | Offline (installed app) | DevTools > Network > Offline, reload an app page: the app shell loads (the offline screen appears), not the browser's dino page. |
| 12 | Sign up (optional) | A new sign-up sends the confirmation email; its link opens `<PREVIEW_URL>/verify` (needs (c)1). |

When done: turn Deployment Protection back on, and undo the (c) changes you do not want to keep
(remove the redirect URL if you like, put the Site URL back, `secrets unset PUBLIC_SITE_ORIGINS`).
