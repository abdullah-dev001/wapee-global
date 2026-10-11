-- Phase 9A: the 4 foreign keys the performance advisor flagged on the new tables.
create index commission_lines_rule_idx on public.commission_lines (rule_id) where rule_id is not null;
create index commission_rules_created_by_idx on public.commission_rules (created_by) where created_by is not null;
create index report_schedules_created_by_idx on public.report_schedules (created_by) where created_by is not null;
create index roles_created_by_idx on public.roles (created_by) where created_by is not null;
