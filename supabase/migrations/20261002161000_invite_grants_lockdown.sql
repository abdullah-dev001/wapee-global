-- Revoke anon EXECUTE on the two invite functions that require a signed-in user.
--
-- Supabase's default privileges grant EXECUTE on a new public function to `anon`
-- as well as `authenticated`. `revoke all ... from public` in the previous
-- migration does not remove that direct role grant, so both functions were
-- reachable by `anon`. They already refuse an anonymous caller
-- (`auth.uid() is null` raises), but the grant should not be there at all —
-- this is the same lockdown the project applied to `suggest_invoice_prefix`.
--
-- `invite_preview` deliberately KEEPS its anon grant: the invitee opens the link
-- before signing in, and it returns only the business name and the invited
-- address for a live token.

revoke execute on function public.invite_member(uuid, text, uuid, uuid) from anon;
revoke execute on function public.accept_invite(text) from anon;
