-- Phase 9A fix: deleting a business that has an ASSIGNED custom role failed with
--   update or delete on table "roles" violates foreign key constraint
--   "member_role_assignments_role_id_fkey"
-- because the FK was ON DELETE RESTRICT (checked row by row, immediately): the
-- business-delete cascade removed the role before it removed the assignments.
-- It was latent since Phase 1 (nobody assigned a custom role until now).
--
-- NO ACTION is checked at the end of the statement, when the cascade has removed
-- the assignments too, and it still refuses deleting a role that is in use on its
-- own (and the roles guard already refuses a hard delete from the API).
alter table public.member_role_assignments
  drop constraint member_role_assignments_role_id_fkey,
  add constraint member_role_assignments_role_id_fkey foreign key (role_id) references public.roles (id);
