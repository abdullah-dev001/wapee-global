-- Add staff by email, part 2 of 2: retire the token-in-URL invite links.
--
-- Ships together with the new members UI (add by email) and the retired /accept-invite page.
--
--   * Every outstanding invite token dies (hash cleared). The rows themselves stay: a pending
--     invite IS a pending add (status 'invited', invited_email, invite_expires_at), so the person
--     still joins automatically when they sign in with that VERIFIED email
--     (claim_pending_memberships, 20261026100000). Nothing is deleted.
--   * invite_member / accept_invite / invite_preview can no longer be called by the app.
--     invite_preview was one of only two anon-callable functions. The functions and the
--     invite_accept_attempts table are left in place (no destructive change); dropping them is a
--     later cleanup.

update public.business_members
set invite_token_hash = null
where invite_token_hash is not null;

revoke all on function public.invite_member(uuid, text, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.accept_invite(text) from public, anon, authenticated;
revoke all on function public.invite_preview(text) from public, anon, authenticated;

comment on function public.invite_member is
  'RETIRED (20261026110000): not callable by the app. Use add_member_by_email.';
comment on function public.accept_invite is
  'RETIRED (20261026110000): not callable by the app. A pending add is joined by claim_pending_memberships.';
comment on function public.invite_preview is
  'RETIRED (20261026110000): not callable by anon or the app.';
