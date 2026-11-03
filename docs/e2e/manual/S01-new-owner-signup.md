# S01 — New owner: sign-up, sign-in, onboarding (30 min)

**Goal:** a brand-new owner can sign up, confirm, create a business with a 14-day trial and get to a working booking link.
**Logins / windows:** A = guest, then your new owner **m01** · B (Incognito) = `qa.b.owner`, `qa.b.new`, `team-owner`, `oth-owner`.
**Ready first:** app at http://localhost:8090 · Gmail `wapeeglobal@gmail.com` open in another tab (plus-addresses land there).
Pick a password for m01 now and add a row for it in `~/.wapee-e2e/logins.md`.

## Landing and sign-up
1. Window A (signed out). Open `http://localhost:8090/`. Scroll to the bottom. Press **Monthly** / **Yearly** on the prices. 📱
   You should see: hero, features, plans, add-ons, FAQ, legal links (Terms, Privacy, Refund). Monthly **$15 / $39 / $79**,
   yearly **$150 / $390 / $790**. No promise of SMS, website widget, online payments or custom domains. No sideways scroll on a phone-size window. `[F01-01]` `[F21-06]`
2. With **Yearly** selected, press the **Team** plan button ("Start 14-day free trial").
   You should see: the address bar shows `/signup?plan=team&interval=year`. `[F01-02]`
3. Look at the sign-up page, then open `/login`.
   You should see: no "Continue with Google" button on either page (switched off at launch). `[F21-08]`
4. On `/signup` type any email and a 7-character password, press **Create account**. Then try a 73-character password.
   You should see: "Use at least 8 characters", then "That password is too long", under the field. You stay on the page. `[F01-04]`
   CLAUDE CHECK C-S01-01: no account was created for that email.
5. Sign up with the email of **team-owner** (already registered) and an 8+ character password.
   You should see: the same "Confirm your email" screen as a new sign-up. Nothing says "already exists". `[F01-05]`
6. Go back to `/signup` (use step 2's button again so the plan is kept). Name **M01 Owner**, email `wapeeglobal+m01@gmail.com`, your password. **Create account**.
   You should see: "Confirm your email" (`/verify`). An email from Supabase arrives in Gmail within a few minutes. `[F01-03]`
7. Before clicking the email: open `/login` and sign in as m01.
   You should see: you are kept on the confirm screen; you cannot open the app. `[F01-06]`
8. In Gmail, open the confirm email, right-click the button → copy link. Open a **new Incognito window** (empty browser) and paste the link.
   You should see: "Checking your link…", then **Set up your business** (`/onboarding`). `[F01-07]`
   If the link opens `localhost:3000` or wapee.online instead, stop and tell Claude (redirect list problem).

## Onboarding
9. Step 1: Business name **M01 Studio**. Watch the booking address fill itself. Then type each of these as the address: `today`, `admin`, `e2e-other`, `Bad Slug!`, `a`.
   You should see: the address follows the name until you edit it. `today`/`admin` refused (reserved), `e2e-other` "Already taken",
   `Bad Slug!` "lowercase letters, numbers and hyphens only", `a` "Use at least 3 characters". `[F01-08]`
   CLAUDE CHECK C-S01-02: the server also refuses those five addresses.
10. Set the address to `m01-studio`, pick an industry, (optional) "How many people work here?", **Continue**.
    Step 2: pick Country **United Kingdom**, then **Pakistan**, then open the Country list and scroll it.
    You should see: UK fills **GBP** + **Europe/London**; Pakistan fills **PKR** + **Asia/Karachi**; a note that currency
    "cannot change once invoices exist". Note any country listed twice (suspected bug **B-002**). `[F01-09]`
11. Choose **United Kingdom / GBP / Europe/London**, location name **Main**, press **Create business**.
    You should see: "Creating your business…", then the **Today** screen with "Get ready for your first booking". `[F01-10]`
    CLAUDE CHECK C-S01-03: trial 14 days, no plan, first branch + prefix, booking settings, Owner role, default business.
12. Type `/onboarding` in the address bar.
    You should see: you are sent back to **Today** (one business per owner). `[F01-11]`
    CLAUDE CHECK C-S01-04: a second `create_business_with_owner` is refused; still 1 business.

## Setup checklist
13. On Today, follow every checklist button in order: **Set hours** (Mon–Sat 09:00–18:00, save) → **Add service** (Haircut, 30 min, £20) →
    **Add me as staff** → **Choose staff** (tick yourself on Haircut) → **Set their working hours** (Mon–Sat 09–18) → **Copy link**.
    You should see: each step ticks ("x of y steps done"); "You were added to your staff list."; **Copy link** shows "Link copied."
    and the link is `https://wapee.online/m01-studio/book`. `[F01-12]` `[F01-13]`
    CLAUDE CHECK C-S01-05: staff profile linked to your member row; `branch_is_bookable` = bookable, no reasons.
14. Press **Dismiss** on the checklist. Then **Services → Haircut**, switch **Bookable online** off, save, go to **Today**. Switch it back on after.
    You should see: checklist gone; with Haircut not online a banner "Online booking is not available right now … Finish setup".
    (Switching *Online booking* itself off in Booking settings shows no banner on purpose.) `[F01-14]`
15. Look at the side menu and **Settings**. Open **Commission**, **Packages**, **Inventory**, Settings → **Roles**, **Locations**, **Advanced reports**, **Forms**.
    You should see: all present and usable, none says "Not included in your plan" (a trial has everything). `[F01-15]`

## Trial banner, password, sign-out
16. Window B: log in as **qa.b.owner** (trial ends 2026-11-05).
    You should see: an amber banner "Your trial ends in 2 days" (on 4 Nov "…tomorrow", on 5 Nov "…today" in red). Pressing it opens **Settings**.
    Sign out, log in as **qa.b.new** (Receptionist there): no banner. `[F01-16]`
17. Window A: sign out. **Forgot password?** → type `nobody.e2e@wapee-dev.test` → **Send reset link**. Then do the same with `wapeeglobal+m01@gmail.com`.
    You should see: both times "If an account exists for …, a reset link is on its way." (no difference). `[F01-17]`
18. Open the reset email for m01 in the **same** browser. Choose a new password, **Save password**. Sign out, try the OLD password, then the new one. Update logins.md.
    You should see: "Choose a new password" page (not bounced to `/`), "Password updated"; old password → "Incorrect email or password."; new one works. `[F01-18]`
19. While signed in, type `/login`, then `/signup`.
    You should see: you land on **Today** both times. `[F01-19]`
20. Window B: log in as **team-owner**, open **Staff** (Sam, Lee, Kim, Ana, Raj). **Sign out**. Log in as **oth-owner** and open **Staff**.
    You should see: only **Ola**. None of Sam/Lee/Kim/Ana/Raj flashes up, even for a moment. `[F01-20]`

## Retired and public pages
21. Signed out, open `http://localhost:8090/accept-invite?token=abc`.
    You should see: a page telling you to sign in with the email you were added with; `?token=abc` disappears from the address bar. `[F03-18]`
22. Signed out, open `/delete-account`.
    You should see: how to delete an account, what is removed and what is kept, readable without signing in. `[F22-03]`

F01-21 (Google sign-in) is skipped: Google is switched off at launch.

## Checklist
| Case | Pass | Fail | Notes |
|---|---|---|---|
| F01-01 | ☐ | ☐ | |
| F01-02 | ☐ | ☐ | |
| F01-03 | ☐ | ☐ | |
| F01-04 | ☐ | ☐ | + C-S01-01 |
| F01-05 | ☐ | ☐ | |
| F01-06 | ☐ | ☐ | |
| F01-07 | ☐ | ☐ | |
| F01-08 | ☐ | ☐ | + C-S01-02 |
| F01-09 | ☐ | ☐ | B-002? |
| F01-10 | ☐ | ☐ | + C-S01-03 |
| F01-11 | ☐ | ☐ | + C-S01-04 |
| F01-12 | ☐ | ☐ | + C-S01-05 |
| F01-13 | ☐ | ☐ | |
| F01-14 | ☐ | ☐ | |
| F01-15 | ☐ | ☐ | |
| F01-16 | ☐ | ☐ | |
| F01-17 | ☐ | ☐ | |
| F01-18 | ☐ | ☐ | |
| F01-19 | ☐ | ☐ | |
| F01-20 | ☐ | ☐ | |
| F01-21 | — | — | Skipped (flag off) |
| F03-18 | ☐ | ☐ | |
| F21-06 (landing part) | ☐ | ☐ | |
| F21-08 | ☐ | ☐ | |
| F22-03 | ☐ | ☐ | |
