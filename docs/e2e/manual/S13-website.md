# S13 — Website (30 min)

**Goal:** the owner can build, brand and publish a one-page website; it shows live services and reviews, is safe against injected text, and only the Owner can publish.
**Logins / windows:** A = `team-owner`, `biz-owner` · B (Incognito) = `team-mgr` · G = guest.
**Ready first:** S12 done (one 5-star review featured). Test files in `~/.wapee-e2e/files/` (logo.png, hero.png, photo.jpg, logo.svg, big-6mb.jpg).

1. A: log in as **team-owner** → **Website** → **Create website** (if not created yet). Open **Sections**: edit **Top banner** Headline "S13 Team Salon", **About** Text "S13 about us", add 2 **FAQs**. Hide **Gallery** (Show on website off). Move **FAQs** up above Services (Move up). Look at **Preview**. 📱
   You should see: "Saved"; the preview follows the order and hidden state; sections with no content are left out. `[F11-01]`
2. In **Contact**: Map link `http://maps.example.com` (http, not https); in About paste a very long text (copy the same paragraph ~30 times).
   You should see: the http link refused with a field message; the long text refused "That's too long." `[F11-02]`
   CLAUDE CHECK C-S13-01: `save_website` with an unknown section key → `invalid_content` with field detail.
3. **Theme**: Brand colour `#FFFF99` (pale yellow), Font **Classic**, Corners **Round**. **Logo** → Choose image → `logo.png`; **Banner photo** → `hero.png`. Then try Logo = `logo.svg`, then `big-6mb.jpg`.
   You should see: PNG accepted; SVG refused "Use a JPEG, PNG or WebP image."; 6 MB refused (5 MB limit). In the preview, buttons / links in the brand colour stay readable (the app darkens a too-pale colour). `[F11-03]`
4. **Publish** → confirm "Publish your website?". G: open `/e2e-team`.
   You should see: "Website published"; the public page shows your sections in your order, logo, banner. `[F11-04]`
5. G: compare `/e2e-team` with Booking settings **Show prices** off (A) and on again; look for **Consult**.
   You should see: services Haircut, Colour, S02 Blow-dry (no Consult); prices hidden when Show prices is off. `[F11-06]` `[F04-14]`
6. G: on `/e2e-team` open DevTools → Elements → `<head>`. Then Network → reload `/e2e-team/book` → click the document → Response headers.
   You should see: a title and description, `og:` tags and a `application/ld+json` LocalBusiness script on `/e2e-team`; `/e2e-team/book` has `X-Robots-Tag: noindex, nofollow`. `[F11-07]`
   CLAUDE CHECK C-S13-02: the JSON-LD is valid; `/e2e-team` has no noindex.
7. G: scroll to **Contact**.
   You should see: address "1 E2E Ave, New York", phone (if set), opening hours Mon–Sat 09:00–18:00 in New York time. (For E2E Solo Barber the address/phone/tax from S02 step 22 show the same way.) `[F11-09]` `[F02-22]`
8. G: **What our customers say**.
   You should see: the featured 5-star review with the first name only ("Ada" / "S11"), the `<img …>` comment as plain text (no popup), and NOT the review removed by the super admin. `[F10-05]` `[F18-10]`
9. A: About Text `<script>alert(1)</script>` and a FAQ answer `<b>bold?</b>` → Saved. G: reload `/e2e-team`.
   You should see: the text exactly as typed, no popup, no bold. `[F11-12]`
10. A: **Unpublish** → confirm. G: reload `/e2e-team`, then open `/e2e-nope-xyz`.
    You should see: "Website unpublished"; both pages show the same "Page not found". **Publish** again afterwards. `[F11-04]`
11. B: log in as **team-mgr**: look for Website in the menu; type `/website`.
    You should see: no menu item; typed URL locked. `[F11-05]`
    CLAUDE CHECK C-S13-03: `set_website_published` as team-mgr refused; website unchanged.
12. A: log in as **biz-owner** → Website → Create website → Publish. G: `/e2e-multi` → press every **Book now** / **Book** button.
    You should see: each opens `/e2e-multi/book` with the location picker (LDN, NYC, TYO). `[F11-08]`
13. G: open `/rosario-clinic-19481` (trial ended).
    You should see: the same "Page not found" as an unknown address. `[F11-10]`
14. CLAUDE CHECK C-S13-04: as **oth-owner**, uploading to `website-assets/<E2E Team Salon id>/x.jpg` is refused. `[F11-11]`

## Checklist
| Case | Pass | Fail | Notes |
|---|---|---|---|
| F11-01 | ☐ | ☐ | |
| F11-02 | ☐ | ☐ | + C-S13-01 |
| F11-03 | ☐ | ☐ | |
| F11-04 | ☐ | ☐ | |
| F11-05 | ☐ | ☐ | + C-S13-03 |
| F11-06 | ☐ | ☐ | |
| F11-07 | ☐ | ☐ | + C-S13-02 |
| F11-08 | ☐ | ☐ | |
| F11-09 | ☐ | ☐ | |
| F11-10 | ☐ | ☐ | |
| F11-11 | C | | C-S13-04 |
| F11-12 | ☐ | ☐ | |
| F10-05 (website part) | ☐ | ☐ | |
| F04-14 (website part) | ☐ | ☐ | |
| F18-10 (website part) | ☐ | ☐ | |
