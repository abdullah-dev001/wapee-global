-- Phase 9A fix (2/2) for "delete a business with an assigned custom role":
-- NO ACTION (20261011200000) is not enough. Each RI cascade runs as its own
-- statement, and a NO ACTION check fires at the end of THAT statement, i.e. right
-- after the roles are deleted and before the cascade has reached the assignments.
-- Deferring the check to commit lets the whole cascade finish first; a role that
-- is still in use when the transaction commits is still refused.
alter table public.member_role_assignments
  drop constraint member_role_assignments_role_id_fkey,
  add constraint member_role_assignments_role_id_fkey foreign key (role_id) references public.roles (id)
    deferrable initially deferred;
