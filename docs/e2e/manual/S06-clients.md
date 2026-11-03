# S06 — Clients (25 min)

**Goal:** the client list, profile, contact / sensitive gating, archive, export and erase work, and nobody sees clients they should not.
**Logins / windows:** A = `team-owner`, `biz-owner` · B (Incognito) = `team-rec`, `team-stf1`, `biz-mgr-ldn`, `biz-custom`, `oth-owner`.
**Ready first:** S03–S05 done (E2E Team Salon has 20+ clients, Ada has bookings at LDN and NYC).

1. B: log in as **team-rec** → **Clients**. 📱 Open DevTools → Network. Type `A` in the search, wait; then `Ad`. Clear it and scroll to the bottom.
   You should see: nothing searched for 1 character; after `Ad` one request ~0.3 s after you stop typing, showing Ada Real (+ Ada Typo is NOT a separate client). List shows 20, then **Load more**. `[F06-01]`
2. B: **New client** → Name "S06 Copy", phone **+1 202 555 0101** (Ada's) → Save.
   You should see: a clear message that the phone belongs to an existing client, with **View existing client**; no raw database error. `[F06-02]`
3. A: log in as **biz-owner** → Clients → **Ada Real**. Then B: log in as **biz-mgr-ldn** → Clients → Ada Real.
   You should see (owner): contact, notes, upcoming appointments at **LDN and NYC**, history, booking answers, invoices. Manager (LDN only): only the LDN rows. `[F06-03]`
4. B: log in as **team-stf1** → Clients → open **S03 Sam A** (one of Sam's). Then log in as **biz-custom** → Clients → Ada Real.
   You should see: "Contact details hidden" and "Notes hidden" for both (no phone, no email). `[F06-04]`
   CLAUDE CHECK C-S06-01: as staff, selecting `phone_e164` / `email` is refused, the safe view returns NULL, and searching by phone finds nothing (suite 28).
5. Open Ada's LDN Colour answers (Calendar → D1 10:00 LDN → Booking form answers) as **biz-owner**, **biz-mgr-ldn** and **biz-custom**.
   You should see: Owner and Manager see "Allergies: Pollen"; the custom role does not. `[F06-05]`
   CLAUDE CHECK C-S06-02: suite 43 (Receptionist not, Staff only on own clients) passes.
6. A: log in as **team-owner** → Clients → open **S02 Fri B** (a Lee-only client); copy the address bar (it ends in the client id). B: log in as **team-stf1** → Clients, then paste that address.
   You should see: the list has only clients Sam has seen; the pasted address shows "not found". `[F06-06]`
7. B: log in as **team-rec** → client **S05 Late** → **Archive** → confirm. Then **Show archived** → open it → **Restore**.
   You should see: hidden from the normal list while archived; back after Restore with its appointment history. `[F06-07]`
8. A (team-owner) → Ada Real → **Export data**. Then B (team-rec) → Ada Real.
   You should see: owner gets a JSON file download ("Client data exported") containing her details and appointments; receptionist has no Export button. `[F06-08]`
   CLAUDE CHECK C-S06-03: `gdpr_export_client` as team-rec is refused; `client.exported` audit row for the owner.
9. A (team-owner) → client **S03 UK** (has an upcoming booking) → **Erase personal data**. Then client **E2E Past Haircut** (past visit only) → Erase personal data → type the name → confirm. Then try Erase on it again.
   You should see: first refused (upcoming appointment); second "Personal data erased" — shown as **Erased**, name gone; second try does nothing harmful. `[F06-09]`
   CLAUDE CHECK C-S06-04: first client unchanged; second anonymised, appointment kept. (The "invoice kept with name blanked" part is S07 step 17.)
10. B: log in as **oth-owner**, paste the S02 Fri B address from step 6 (change nothing).
    You should see: "not found". `[F06-10]`
    CLAUDE CHECK C-S06-05: as oth-owner, selecting that client id returns 0 rows.
11. A (team-owner) → Clients: look for an export of the whole list (CSV).
    You should see: none — **KG-08** (known gap). `[F06-11]`

## Checklist
| Case | Pass | Fail | Notes |
|---|---|---|---|
| F06-01 | ☐ | ☐ | |
| F06-02 | ☐ | ☐ | |
| F06-03 | ☐ | ☐ | |
| F06-04 | ☐ | ☐ | + C-S06-01 |
| F06-05 | ☐ | ☐ | + C-S06-02 |
| F06-06 | ☐ | ☐ | |
| F06-07 | ☐ | ☐ | |
| F06-08 | ☐ | ☐ | + C-S06-03 |
| F06-09 | ☐ | ☐ | + C-S06-04, rest in S07 |
| F06-10 | ☐ | ☐ | + C-S06-05 |
| F06-11 | KG-08 ☐ | ☐ | |
