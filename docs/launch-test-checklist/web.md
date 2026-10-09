# WEB — Website editor and public website

[← Back to the index](../launch-test-checklist.md) · 12 cases (P0 2, P1 10, P2 0)

### WEB-001 · Edit sections: show/hide, reorder `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/website`
- **Preconditions:** Owner
- **Steps:**
  1. Website > Sections
  2. Hide Gallery
  3. Move FAQ up/down
  4. Check preview and published site
- **Expected:** Changes persist; preview updates; public page follows the saved order and hides hidden sections.
- **Must be refused / negative:** Manager / Receptionist / Staff: /website no-access.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### WEB-002 · Hero, About, Services, Testimonials text `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/website`
- **Preconditions:** Section drawer
- **Steps:**
  1. Hero headline 121 chars, subheadline 301, button label 41
  2. About body 4001
  3. Services intro 501
- **Expected:** 'That's too long.' on each; valid text saves; emptied fields are removed.
- **Must be refused / negative:** No HTML is rendered from input.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### WEB-003 · FAQ section `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/website`
- **Preconditions:** FAQ drawer
- **Steps:**
  1. Add 20 items
  2. Try a 21st
  3. Question empty / 201 chars / answer 1501
- **Expected:** Max 20; required/too long messages.
- **Must be refused / negative:** Empty FAQ section is dropped from the public page.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### WEB-004 · Contact section `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/website`
- **Preconditions:** Contact drawer
- **Steps:**
  1. WhatsApp '12345'
  2. WhatsApp '+923001234567'
  3. Map link 'http://...'
  4. Social links for Instagram, Facebook, TikTok, X, YouTube, LinkedIn
- **Expected:** Bad WhatsApp -> 'Use the full number with country code.'; http link -> 'Use a link starting with https://'; valid saved; public page shows address/phone/hours from the website's location with WhatsApp/maps/social buttons.
- **Must be refused / negative:** javascript: or data: links impossible.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### WEB-005 · Gallery and image uploads `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/website`
- **Preconditions:** Images: 1 MB jpg, 6 MB jpg, gif, svg, webp
- **Steps:**
  1. Add images to gallery (up to 12) with alt text (≤150)
  2. Try the 6 MB, gif and svg
- **Expected:** jpg/png/webp under 5 MB upload; 'That image is larger than 5 MB.' / 'Use a JPEG, PNG or WebP image.'; hint says location data in photos is not removed.
- **Must be refused / negative:** 13th image not offered; alt >150 blocked; replaced images are deleted (60-file cap not eaten).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### WEB-006 · Theme `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/website`
- **Preconditions:** Theme tab
- **Steps:**
  1. Pick a brand colour preset, then hex '#12ab34'
  2. Invalid hex '#zzz'
  3. Font: DM Sans / System / Serif
  4. Radius none..full
  5. Logo and hero image
  6. Template General/Salon/Barber/Clinic
  7. SEO title (70) and description (200)
- **Expected:** Preview updates instantly for colour/font/radius; buttons stay readable (contrast ≥4.5:1); SEO saved.
- **Must be refused / negative:** Invalid colour falls back to default; inputs stop at max length.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### WEB-007 · Publish / unpublish `P0`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/website`
- **Preconditions:** Unpublished website
- **Steps:**
  1. Publish (confirm)
  2. Open /<slug>
  3. Unpublish (confirm)
  4. Reload /<slug>
- **Expected:** Published: site visible. Unpublished: generic 'not found' page identical to an unknown slug.
- **Must be refused / negative:** Booking link /<slug>/book keeps working while unpublished.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### WEB-008 · Booking-not-ready warning in editor `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/website`
- **Preconditions:** Branch not bookable
- **Steps:**
  1. Open editor
- **Expected:** Warning shown; public site hides Book buttons.
- **Must be refused / negative:** No Book button that leads to 'not available'.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### WEB-009 · Public website content `P1`

- [ ] **Actor:** Signed-out visitor (`ANON`) · **Screen:** `/<slug>`
- **Preconditions:** Published site, featured reviews, show_prices on/off
- **Steps:**
  1. Open /<slug> at 375 and 1440
- **Expected:** Sections in order; live services with prices (or without when off); testimonials first name only; contact + hours of the main location; legal links in footer; Book buttons only when bookable.
- **Must be refused / negative:** No staff names from reviews, no ids, no emails.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### WEB-010 · SEO tags `P1`

- [ ] **Actor:** Signed-out visitor (`ANON`) · **Screen:** `/<slug>`
- **Preconditions:** Published site
- **Steps:**
  1. Inspect head (web)
- **Expected:** Title/description from SEO fields; LocalBusiness JSON-LD with '<' escaped.
- **Must be refused / negative:** Tags are client-side only (no server render; known).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### WEB-011 · Unknown / inactive / unpublished site look the same `P0`

- [ ] **Actor:** Signed-out visitor (`ANON`) · **Screen:** `/<slug>`
- **Preconditions:** 3 slugs
- **Steps:**
  1. Open each
- **Expected:** Same WebsiteNotFound page.
- **Must be refused / negative:** No hint about which case applies.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes: 

### WEB-012 · Website publish is Owner-only `P1`

- [ ] **Actor:** Owner (business active: trial or plan) (`OWN`) · **Screen:** `/website`
- **Preconditions:** Custom role with website.edit only
- **Steps:**
  1. Edit a section, try Publish
- **Expected:** Editing works; Publish not offered/refused.
- **Must be refused / negative:** API publish refused.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ Skip — Notes:
