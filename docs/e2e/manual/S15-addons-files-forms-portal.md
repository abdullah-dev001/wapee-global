# S15 — Add-ons 2: files, forms, client portal (40 min)

**Goal:** photos need consent and stay private; consent forms are signed once and kept; the client portal shows a customer only their own data; data requests are handled.
**Logins / windows:** A = `biz-owner` · B (Incognito) = `biz-mgr-ldn`, `biz-stf-nyc` · G = guest (Ada as customer) · Gmail tab.
**Ready first:** S14 done. Test files in `~/.wapee-e2e/files/`. Branch **LDN** unless told otherwise.
Ada may receive only 5 emails per 24 h; this session sends her ~5. If one does not arrive, ask Claude to check (it may be the cap).
Email links may start with `https://wapee.online` — swap it for `http://localhost:8090` (README §1).

## Files and photos
1. B: log in as **biz-mgr-ldn** → Clients → **Ben Nomail** → **Files and photos** → **Add photo** → `photo.jpg`, Photo type Before.
   You should see: refused — "No photo consent recorded." Record photo consent for Ben (consent switch on his profile) → "Photo consent updated" → Add photo again: "File added". **Add PDF** → `doc.pdf` (works without consent too). 📱 `[F15-13]`
   CLAUDE CHECK C-S15-01: file rows `ready`; consent change audited.
2. Add photo, one at a time: `fake-exe.jpg`, `photo.heic`, `big-11mb.jpg`.
   You should see: all three refused with a clear message (wrong content / type / too big); nothing added. `[F15-14]`
   CLAUDE CHECK C-S15-02: no rows for them; storage has no such objects.
   CLAUDE CHECK C-S15-03: direct Storage URL, listing and public URL refused; a signed URL works under 5 min and expires after. `[F15-15]`
3. A: log in as **biz-owner**, branch **NYC** → Clients → **S04 Group B** (a Nora client) → record photo consent → Add photo `photo.jpg`. B: log in as **biz-stf-nyc** (Nora) → Clients → S04 Group B → Files; then try Ben Nomail.
   You should see: Nora sees S04 Group B's photo; Ben Nomail is not one of her clients (not found / no files). `[F15-16]`

## Consent forms
4. B: log in as **biz-mgr-ldn** → Settings → **Forms and consent** → **New form**: Type **Consent form**, Form title "S15 Consent", **Client must sign** on, a Paragraph "I agree to the treatment.", a **Yes / No** question "Any allergies?" (Required), Show on: Colour → **Save form**.
   You should see: "Form saved", Version 1. `[F15-17]`
5. Calendar (LDN) → New appointment **Ada Real**, Colour, Lena, a future day → open it → Forms → **Send signing link** (S15 Consent).
   G (Gmail): open the email, adjust the link (localhost), sign: answer the question, draw in **Signature**, **Sign and send**.
   You should see: "Thank you"; in the drawer the form shows **Signed** "Signed from a link". `[F15-17]`
   CLAUDE CHECK C-S15-04: one signed copy with strokes, digest stored; cannot be changed.
6. G: open the same signing link again; then with one character of the token changed.
   You should see: "This link doesn't work" for both. `[F15-18]`
   CLAUDE CHECK C-S15-05 (writes; asks first): two parallel submits of a fresh link → one signed copy.
7. B: edit **S15 Consent** (change the paragraph) → Save form. Open Ada's signed form → **Void this signed form** → Reason "S15 test" → **Void form**.
   You should see: "Saved as version 2"; the old signed copy stays, marked **Voided**. `[F15-19]`

## Client portal
8. CLAUDE CHECK C-S15-06: on E2E Team Salon (portal OFF) a link request answers `{sent:true}` but stores and sends nothing. `[F15-20]`
9. A (biz-owner) LDN: Invoices → New invoice for Ada (Haircut) → **Create draft** (do NOT issue). Clients → Ada → record photo consent → Add photo `photo.jpg`.
   G: open `/e2e-multi/portal` → Email `wapeeglobal@gmail.com` → **Send me a link**. Then **Use another email** → `nobody.e2e@wapee-dev.test` → Send me a link.
   You should see: the same "Check your email" both times. Only Gmail gets a link; open it (adjust to localhost): "Hi Ada". `[F15-21]`
   CLAUDE CHECK C-S15-07: one `portal_login` email for Ada, none for the other address.
10. G (portal): open **Bookings**, **Packages**, **Invoices**, **Photos**, **Forms**, **My data**. 📱
    You should see: only Ada's data at E2E Multi Clinic; Invoices show issued ones (S14 Pack…) but **not** the draft; no internal notes; the consented photo; the signed (voided) form marked Voided. `[F15-22]`
11. G (portal): **Book a visit** → pick NYC → Haircut → a time → **Book now**. Then cancel it (**Cancel booking** → Yes, cancel). Then try **Change time** on a booking that is less than 24 h away (if any), and on one further ahead.
    You should see: "Booking sent", "Booking cancelled"; same rules as the booking page (no cancel / move inside 24 h). `[F15-23]`
12. G (portal): **My data** → **Request a copy** → then press it again.
    You should see: "Request received"; the second time it says a request is already open. `[F15-24]`
13. A (biz-owner): Settings → **Data requests** → the open request → **Export Ada Real** → **Done**. G: My data → **Request erasure**. A: Data requests → that request → **Decline** → confirm.
    You should see: export downloads and the request closes ("Email removed after closing"); the erasure request shows **Declined**. `[F18-12]`
    CLAUDE CHECK C-S15-08: `data_request.done` / `data_request.declined` audit rows; requester email removed; the Erase path passes suite 29.
14. CLAUDE CHECK C-S15-09: a dashboard login token used as a portal session, and a portal token used on REST, are both refused. `[F15-25]`
15. G: sign out of the portal. Request a link for `wapeeglobal@gmail.com` 4 times in a row.
    You should see: the same "Check your email" every time. `[F15-26]`
    CLAUDE CHECK C-S15-10: only 3 links sent in the hour (the 4th counted, not sent).

## Checklist
| Case | Pass | Fail | Notes |
|---|---|---|---|
| F15-13 | ☐ | ☐ | + C-S15-01 |
| F15-14 | ☐ | ☐ | + C-S15-02 |
| F15-15 | C | | C-S15-03 |
| F15-16 | ☐ | ☐ | |
| F15-17 | ☐ | ☐ | + C-S15-04 |
| F15-18 | ☐ | ☐ | + C-S15-05 |
| F15-19 | ☐ | ☐ | |
| F15-20 | ☐ | ☐ | S14 step 1 + C-S15-06 |
| F15-21 | ☐ | ☐ | + C-S15-07 |
| F15-22 | ☐ | ☐ | |
| F15-23 | ☐ | ☐ | |
| F15-24 | ☐ | ☐ | |
| F15-25 | C | | C-S15-09 |
| F15-26 | ☐ | ☐ | + C-S15-10 |
| F18-12 | ☐ | ☐ | + C-S15-08 |
