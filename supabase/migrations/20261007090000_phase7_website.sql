-- Phase 7A (1/4): the business website — settings, 7 fixed sections, publish,
-- and the ONE public read (`get_website_public`, service_role only).
--
-- WRITES go through DEFINER RPCs only (no INSERT/UPDATE/DELETE policy exists);
-- the tables grant SELECT to `authenticated` behind RLS and NOTHING to `anon`.
-- The public page never touches a table: Edge Function `get_website` calls
-- `get_website_public(slug)` with the service role and maps the result field by
-- field.
--
-- Section content is validated per type by `website_section_content_error()`,
-- called by the RPCs (so a failure is `{ok:false,code}`, never a raise) AND by a
-- BEFORE trigger (so nothing can bypass it).

-- ---------------------------------------------------------------------------
-- Content validation (pure, immutable)
-- ---------------------------------------------------------------------------
create or replace function public.website_str_err(p jsonb, k text, p_max int)
returns text language plpgsql immutable set search_path = '' as $$
begin
  if not (p ? k) or jsonb_typeof(p -> k) = 'null' then return null; end if;
  if jsonb_typeof(p -> k) <> 'string' then return 'bad_type:' || k; end if;
  if char_length(p ->> k) > p_max then return 'too_long:' || k; end if;
  return null;
end $$;

create or replace function public.website_url_err(p jsonb, k text)
returns text language plpgsql immutable set search_path = '' as $$
begin
  if not (p ? k) or jsonb_typeof(p -> k) = 'null' then return null; end if;
  if jsonb_typeof(p -> k) <> 'string' then return 'bad_type:' || k; end if;
  -- https only: a stored `javascript:` or `data:` URL must be impossible.
  if (p ->> k) !~ '^https://[^[:space:]<>"'']{3,500}$' then return 'bad_url:' || k; end if;
  return null;
end $$;

-- A website asset path: <business uuid>/<file uuid>.<ext>
create or replace function public.website_asset_path_ok(p text)
returns boolean language sql immutable set search_path = '' as $$
  select p ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
$$;

create or replace function public.website_section_content_error(p_type text, p_content jsonb)
returns text language plpgsql immutable set search_path = '' as $$
declare
  v_allowed text[];
  v_key text;
  v_err text;
  v_item jsonb;
  v_arr jsonb;
begin
  if p_content is null or jsonb_typeof(p_content) <> 'object' then
    return 'content_not_object';
  end if;
  if char_length(p_content::text) > 20000 then return 'content_too_large'; end if;

  v_allowed := case p_type
    when 'hero' then array['headline', 'subheadline', 'cta_label']
    when 'about' then array['title', 'body']
    when 'services' then array['title', 'intro']
    when 'gallery' then array['title', 'images']
    when 'testimonials' then array['title']
    when 'faqs' then array['title', 'items']
    when 'contact' then array['title', 'whatsapp', 'map_url', 'social']
    else null end;
  if v_allowed is null then return 'unknown_type'; end if;

  for v_key in select jsonb_object_keys(p_content) loop
    if not (v_key = any (v_allowed)) then return 'unknown_key:' || v_key; end if;
  end loop;

  -- Every type may carry a title.
  v_err := public.website_str_err(p_content, 'title', 120);
  if v_err is not null then return v_err; end if;

  if p_type = 'hero' then
    v_err := coalesce(public.website_str_err(p_content, 'headline', 120),
                      public.website_str_err(p_content, 'subheadline', 300),
                      public.website_str_err(p_content, 'cta_label', 40));
    return v_err;
  elsif p_type = 'about' then
    return public.website_str_err(p_content, 'body', 4000);
  elsif p_type = 'services' then
    return public.website_str_err(p_content, 'intro', 500);
  elsif p_type = 'gallery' then
    if p_content ? 'images' then
      v_arr := p_content -> 'images';
      if jsonb_typeof(v_arr) <> 'array' then return 'bad_type:images'; end if;
      if jsonb_array_length(v_arr) > 12 then return 'too_many:images'; end if;
      for v_item in select * from jsonb_array_elements(v_arr) loop
        if jsonb_typeof(v_item) <> 'object' then return 'bad_type:image'; end if;
        for v_key in select jsonb_object_keys(v_item) loop
          if v_key not in ('path', 'alt') then return 'unknown_key:image.' || v_key; end if;
        end loop;
        if jsonb_typeof(v_item -> 'path') is distinct from 'string'
           or not public.website_asset_path_ok(v_item ->> 'path') then
          return 'bad_path:image';
        end if;
        v_err := public.website_str_err(v_item, 'alt', 150);
        if v_err is not null then return v_err; end if;
      end loop;
    end if;
    return null;
  elsif p_type = 'faqs' then
    if p_content ? 'items' then
      v_arr := p_content -> 'items';
      if jsonb_typeof(v_arr) <> 'array' then return 'bad_type:items'; end if;
      if jsonb_array_length(v_arr) > 20 then return 'too_many:items'; end if;
      for v_item in select * from jsonb_array_elements(v_arr) loop
        if jsonb_typeof(v_item) <> 'object' then return 'bad_type:item'; end if;
        for v_key in select jsonb_object_keys(v_item) loop
          if v_key not in ('q', 'a') then return 'unknown_key:item.' || v_key; end if;
        end loop;
        if jsonb_typeof(v_item -> 'q') is distinct from 'string'
           or char_length(btrim(v_item ->> 'q')) not between 1 and 200 then
          return 'bad_value:item.q';
        end if;
        if jsonb_typeof(v_item -> 'a') is distinct from 'string'
           or char_length(btrim(v_item ->> 'a')) not between 1 and 1500 then
          return 'bad_value:item.a';
        end if;
      end loop;
    end if;
    return null;
  elsif p_type = 'contact' then
    if p_content ? 'whatsapp' and jsonb_typeof(p_content -> 'whatsapp') <> 'null' then
      if jsonb_typeof(p_content -> 'whatsapp') <> 'string'
         or (p_content ->> 'whatsapp') !~ '^\+[1-9][0-9]{6,14}$' then
        return 'bad_value:whatsapp';
      end if;
    end if;
    v_err := public.website_url_err(p_content, 'map_url');
    if v_err is not null then return v_err; end if;
    if p_content ? 'social' and jsonb_typeof(p_content -> 'social') <> 'null' then
      if jsonb_typeof(p_content -> 'social') <> 'object' then return 'bad_type:social'; end if;
      for v_key in select jsonb_object_keys(p_content -> 'social') loop
        if v_key not in ('instagram', 'facebook', 'tiktok', 'x', 'youtube', 'linkedin') then
          return 'unknown_key:social.' || v_key;
        end if;
        v_err := public.website_url_err(p_content -> 'social', v_key);
        if v_err is not null then return v_err; end if;
      end loop;
    end if;
    return null;
  end if;
  return null;  -- testimonials: title only
end $$;

comment on function public.website_section_content_error is
  'NULL when the content is valid for the section type, else a short machine code. Unknown keys are refused; URLs must be https; gallery paths must be well-formed asset paths (the business prefix is checked separately).';

-- Gallery paths must live under the business's own prefix.
create or replace function public.website_section_paths_error(p_business_id uuid, p_type text, p_content jsonb)
returns text language plpgsql immutable set search_path = '' as $$
declare v_item jsonb;
begin
  if p_type = 'gallery' and p_content ? 'images' and jsonb_typeof(p_content -> 'images') = 'array' then
    for v_item in select * from jsonb_array_elements(p_content -> 'images') loop
      if split_part(v_item ->> 'path', '/', 1) <> p_business_id::text then
        return 'foreign_path:image';
      end if;
    end loop;
  end if;
  return null;
end $$;

-- Default content per template. THE SEAM for industry presets: the owner
-- defines real preset content later; every key currently yields the same
-- neutral (empty) defaults.
create or replace function public.website_template_defaults(p_template text)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'hero', '{}'::jsonb,
    'about', '{}'::jsonb,
    'services', '{}'::jsonb,
    'gallery', jsonb_build_object('images', '[]'::jsonb),
    'testimonials', '{}'::jsonb,
    'faqs', jsonb_build_object('items', '[]'::jsonb),
    'contact', '{}'::jsonb
  )
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.websites (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- The branch whose address/hours/services the page shows. Defaults to the
  -- primary branch; the Multi-branch plan can add a picker later.
  branch_id uuid not null references public.branches (id),
  template_key text not null default 'default',
  is_published boolean not null default false,
  published_at timestamptz,
  -- Theme. NULL = the app's own default.
  brand_color text,
  font_key text,
  radius_key text,
  logo_path text,
  hero_image_path text,
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,

  constraint websites_template_key check (template_key ~ '^[a-z0-9_]{1,40}$'),
  constraint websites_brand_color check (brand_color is null or brand_color ~ '^#[0-9a-fA-F]{6}$'),
  constraint websites_font_key check (font_key is null or font_key ~ '^[a-z0-9_]{1,30}$'),
  constraint websites_radius_key check (radius_key is null or radius_key in ('none', 'sm', 'md', 'lg', 'full')),
  constraint websites_logo_path check (logo_path is null or public.website_asset_path_ok(logo_path)),
  constraint websites_hero_path check (hero_image_path is null or public.website_asset_path_ok(hero_image_path)),
  constraint websites_seo_title check (seo_title is null or char_length(seo_title) <= 70),
  constraint websites_seo_description check (seo_description is null or char_length(seo_description) <= 200)
);
create unique index websites_business_uidx on public.websites (business_id) where deleted_at is null;
create index websites_branch_idx on public.websites (branch_id);
create index websites_created_by_idx on public.websites (created_by) where created_by is not null;
create index websites_updated_by_idx on public.websites (updated_by) where updated_by is not null;

create table public.website_sections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  website_id uuid not null references public.websites (id) on delete cascade,
  section_type text not null,
  is_visible boolean not null default true,
  sort_order integer not null,
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint website_sections_type check (
    section_type in ('hero', 'about', 'services', 'gallery', 'testimonials', 'faqs', 'contact')
  )
);
-- Seven FIXED sections: exactly one of each type per website.
create unique index website_sections_type_uidx on public.website_sections (website_id, section_type);
create index website_sections_business_idx on public.website_sections (business_id);

create trigger websites_set_updated_at before update on public.websites
  for each row execute function public.set_updated_at();
create trigger website_sections_set_updated_at before update on public.website_sections
  for each row execute function public.set_updated_at();

-- Tenant + content guards. BEFORE INSERT/UPDATE only: they do not fire for the
-- `delete from businesses` cascade.
create or replace function public.enforce_website_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.branches b
                 where b.id = new.branch_id and b.business_id = new.business_id and b.deleted_at is null) then
    raise exception 'website branch must belong to the business' using errcode = '23514';
  end if;
  if new.logo_path is not null and split_part(new.logo_path, '/', 1) <> new.business_id::text then
    raise exception 'logo path must be under the business prefix' using errcode = '23514';
  end if;
  if new.hero_image_path is not null and split_part(new.hero_image_path, '/', 1) <> new.business_id::text then
    raise exception 'hero path must be under the business prefix' using errcode = '23514';
  end if;
  return new;
end $$;

create or replace function public.enforce_website_section_guard()
returns trigger language plpgsql set search_path = '' as $$
declare v_err text;
begin
  if not exists (select 1 from public.websites w
                 where w.id = new.website_id and w.business_id = new.business_id) then
    raise exception 'section must belong to the business website' using errcode = '23514';
  end if;
  v_err := coalesce(public.website_section_content_error(new.section_type, new.content),
                    public.website_section_paths_error(new.business_id, new.section_type, new.content));
  if v_err is not null then
    raise exception 'invalid website section content: %', v_err using errcode = '23514';
  end if;
  return new;
end $$;

create trigger websites_guard before insert or update on public.websites
  for each row execute function public.enforce_website_guard();
create trigger website_sections_guard before insert or update on public.website_sections
  for each row execute function public.enforce_website_section_guard();
revoke all on function public.enforce_website_guard() from anon, authenticated, public;
revoke all on function public.enforce_website_section_guard() from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- RLS: SELECT only, for website editors/publishers. No write policy.
-- ---------------------------------------------------------------------------
alter table public.websites enable row level security;
alter table public.website_sections enable row level security;

create policy websites_select on public.websites for select to authenticated
  using (deleted_at is null
         and (public.can(business_id, null, 'website.edit') or public.can(business_id, null, 'website.publish')));
create policy website_sections_select on public.website_sections for select to authenticated
  using (deleted_at is null
         and (public.can(business_id, null, 'website.edit') or public.can(business_id, null, 'website.publish')));

revoke all on public.websites, public.website_sections from anon, authenticated, public;
grant select on public.websites, public.website_sections to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: ensure_website — create the website + its 7 sections (idempotent)
-- ---------------------------------------------------------------------------
create or replace function public.ensure_website(p_business_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_branch uuid;
  v_defaults jsonb;
begin
  if p_business_id is null or not public.can(p_business_id, null, 'website.edit') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  select w.id into v_id from public.websites w where w.business_id = p_business_id and w.deleted_at is null;
  if v_id is not null then
    return jsonb_build_object('ok', true, 'created', false, 'website_id', v_id);
  end if;

  select b.id into v_branch from public.branches b
  where b.business_id = p_business_id and b.deleted_at is null
  order by b.is_primary desc, b.created_at limit 1;
  if v_branch is null then
    return jsonb_build_object('ok', false, 'code', 'no_branch');
  end if;

  v_defaults := public.website_template_defaults('default');

  insert into public.websites (business_id, branch_id, created_by, updated_by)
  values (p_business_id, v_branch, auth.uid(), auth.uid())
  on conflict (business_id) where deleted_at is null do nothing
  returning id into v_id;

  if v_id is null then  -- lost a race: the other transaction created it
    select w.id into v_id from public.websites w where w.business_id = p_business_id and w.deleted_at is null;
    return jsonb_build_object('ok', true, 'created', false, 'website_id', v_id);
  end if;

  insert into public.website_sections (business_id, website_id, section_type, sort_order, content)
  select p_business_id, v_id, t.type, t.ord, coalesce(v_defaults -> t.type, '{}'::jsonb)
  from (values ('hero', 1), ('about', 2), ('services', 3), ('gallery', 4),
               ('testimonials', 5), ('faqs', 6), ('contact', 7)) as t(type, ord);

  return jsonb_build_object('ok', true, 'created', true, 'website_id', v_id);
end $$;

-- ---------------------------------------------------------------------------
-- RPC: save_website_settings — only the keys present change (JSON null clears)
-- ---------------------------------------------------------------------------
create or replace function public.save_website_settings(p_business_id uuid, p_settings jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_site public.websites%rowtype;
  v_key text;
  v_branch uuid;
  v_err text;
begin
  if p_business_id is null or not public.can(p_business_id, null, 'website.edit') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  select * into v_site from public.websites w where w.business_id = p_business_id and w.deleted_at is null;
  if v_site.id is null then return jsonb_build_object('ok', false, 'code', 'no_website'); end if;
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    return jsonb_build_object('ok', false, 'code', 'invalid_settings');
  end if;

  for v_key in select jsonb_object_keys(p_settings) loop
    if v_key not in ('branch_id', 'template_key', 'brand_color', 'font_key', 'radius_key',
                     'logo_path', 'hero_image_path', 'seo_title', 'seo_description') then
      return jsonb_build_object('ok', false, 'code', 'invalid_settings', 'field', v_key);
    end if;
  end loop;

  -- Validate EVERYTHING before the single write.
  v_err := null;
  if p_settings ? 'branch_id' then
    if jsonb_typeof(p_settings -> 'branch_id') <> 'string'
       or not exists (select 1 from public.branches b
                      where b.id::text = p_settings ->> 'branch_id'
                        and b.business_id = p_business_id and b.deleted_at is null) then
      v_err := 'branch_id';
    end if;
  end if;
  if v_err is null and p_settings ? 'template_key'
     and (jsonb_typeof(p_settings -> 'template_key') <> 'string'
          or (p_settings ->> 'template_key') !~ '^[a-z0-9_]{1,40}$') then v_err := 'template_key'; end if;
  if v_err is null and p_settings ? 'brand_color' and jsonb_typeof(p_settings -> 'brand_color') <> 'null'
     and (jsonb_typeof(p_settings -> 'brand_color') <> 'string'
          or (p_settings ->> 'brand_color') !~ '^#[0-9a-fA-F]{6}$') then v_err := 'brand_color'; end if;
  if v_err is null and p_settings ? 'font_key' and jsonb_typeof(p_settings -> 'font_key') <> 'null'
     and (jsonb_typeof(p_settings -> 'font_key') <> 'string'
          or (p_settings ->> 'font_key') !~ '^[a-z0-9_]{1,30}$') then v_err := 'font_key'; end if;
  if v_err is null and p_settings ? 'radius_key' and jsonb_typeof(p_settings -> 'radius_key') <> 'null'
     and (jsonb_typeof(p_settings -> 'radius_key') <> 'string'
          or (p_settings ->> 'radius_key') not in ('none', 'sm', 'md', 'lg', 'full')) then v_err := 'radius_key'; end if;
  if v_err is null and p_settings ? 'logo_path' and jsonb_typeof(p_settings -> 'logo_path') <> 'null'
     and (jsonb_typeof(p_settings -> 'logo_path') <> 'string'
          or not public.website_asset_path_ok(p_settings ->> 'logo_path')
          or split_part(p_settings ->> 'logo_path', '/', 1) <> p_business_id::text) then v_err := 'logo_path'; end if;
  if v_err is null and p_settings ? 'hero_image_path' and jsonb_typeof(p_settings -> 'hero_image_path') <> 'null'
     and (jsonb_typeof(p_settings -> 'hero_image_path') <> 'string'
          or not public.website_asset_path_ok(p_settings ->> 'hero_image_path')
          or split_part(p_settings ->> 'hero_image_path', '/', 1) <> p_business_id::text) then v_err := 'hero_image_path'; end if;
  if v_err is null and p_settings ? 'seo_title' and jsonb_typeof(p_settings -> 'seo_title') <> 'null'
     and (jsonb_typeof(p_settings -> 'seo_title') <> 'string'
          or char_length(p_settings ->> 'seo_title') > 70) then v_err := 'seo_title'; end if;
  if v_err is null and p_settings ? 'seo_description' and jsonb_typeof(p_settings -> 'seo_description') <> 'null'
     and (jsonb_typeof(p_settings -> 'seo_description') <> 'string'
          or char_length(p_settings ->> 'seo_description') > 200) then v_err := 'seo_description'; end if;
  if v_err is not null then
    return jsonb_build_object('ok', false, 'code', 'invalid_settings', 'field', v_err);
  end if;

  update public.websites w set
    branch_id = case when p_settings ? 'branch_id' then (p_settings ->> 'branch_id')::uuid else w.branch_id end,
    template_key = case when p_settings ? 'template_key' then p_settings ->> 'template_key' else w.template_key end,
    brand_color = case when p_settings ? 'brand_color' then p_settings ->> 'brand_color' else w.brand_color end,
    font_key = case when p_settings ? 'font_key' then p_settings ->> 'font_key' else w.font_key end,
    radius_key = case when p_settings ? 'radius_key' then p_settings ->> 'radius_key' else w.radius_key end,
    logo_path = case when p_settings ? 'logo_path' then p_settings ->> 'logo_path' else w.logo_path end,
    hero_image_path = case when p_settings ? 'hero_image_path' then p_settings ->> 'hero_image_path' else w.hero_image_path end,
    seo_title = case when p_settings ? 'seo_title' then nullif(btrim(p_settings ->> 'seo_title'), '') else w.seo_title end,
    seo_description = case when p_settings ? 'seo_description' then nullif(btrim(p_settings ->> 'seo_description'), '') else w.seo_description end,
    updated_by = auth.uid()
  where w.id = v_site.id;

  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- RPC: save_website_section / reorder_website_sections
-- ---------------------------------------------------------------------------
create or replace function public.save_website_section(
  p_business_id uuid,
  p_section_type text,
  p_is_visible boolean default null,
  p_content jsonb default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_site uuid;
  v_err text;
begin
  if p_business_id is null or not public.can(p_business_id, null, 'website.edit') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  select w.id into v_site from public.websites w where w.business_id = p_business_id and w.deleted_at is null;
  if v_site is null then return jsonb_build_object('ok', false, 'code', 'no_website'); end if;
  if not exists (select 1 from public.website_sections s where s.website_id = v_site and s.section_type = p_section_type) then
    return jsonb_build_object('ok', false, 'code', 'unknown_section');
  end if;
  if p_content is not null then
    v_err := coalesce(public.website_section_content_error(p_section_type, p_content),
                      public.website_section_paths_error(p_business_id, p_section_type, p_content));
    if v_err is not null then
      return jsonb_build_object('ok', false, 'code', 'invalid_content', 'detail', v_err);
    end if;
  end if;

  update public.website_sections s
  set is_visible = coalesce(p_is_visible, s.is_visible),
      content = coalesce(p_content, s.content)
  where s.website_id = v_site and s.section_type = p_section_type;

  return jsonb_build_object('ok', true);
end $$;

create or replace function public.reorder_website_sections(p_business_id uuid, p_order text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_site uuid;
begin
  if p_business_id is null or not public.can(p_business_id, null, 'website.edit') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  select w.id into v_site from public.websites w where w.business_id = p_business_id and w.deleted_at is null;
  if v_site is null then return jsonb_build_object('ok', false, 'code', 'no_website'); end if;

  -- Must be exactly the seven types, each once.
  if p_order is null or array_length(p_order, 1) is distinct from 7
     or (select count(distinct x) from unnest(p_order) x) <> 7
     or exists (select 1 from unnest(p_order) x
                where x is null or x not in ('hero', 'about', 'services', 'gallery', 'testimonials', 'faqs', 'contact')) then
    return jsonb_build_object('ok', false, 'code', 'invalid_order');
  end if;

  update public.website_sections s set sort_order = o.ord
  from unnest(p_order) with ordinality as o(type, ord)
  where s.website_id = v_site and s.section_type = o.type;

  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- RPC: set_website_published (audited)
-- ---------------------------------------------------------------------------
create or replace function public.set_website_published(p_business_id uuid, p_published boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_site public.websites%rowtype;
begin
  if p_business_id is null or p_published is null
     or not public.can(p_business_id, null, 'website.publish') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  select * into v_site from public.websites w where w.business_id = p_business_id and w.deleted_at is null for update;
  if v_site.id is null then return jsonb_build_object('ok', false, 'code', 'no_website'); end if;

  if v_site.is_published = p_published then
    return jsonb_build_object('ok', true, 'changed', false, 'is_published', p_published);
  end if;

  update public.websites w
  set is_published = p_published,
      published_at = case when p_published then now() else w.published_at end,
      updated_by = auth.uid()
  where w.id = v_site.id;

  perform public.write_audit_log(
    p_business_id,
    case when p_published then 'website.published' else 'website.unpublished' end,
    'website', v_site.id::text,
    jsonb_build_object('is_published', v_site.is_published),
    jsonb_build_object('is_published', p_published));

  return jsonb_build_object('ok', true, 'changed', true, 'is_published', p_published);
end $$;

-- ---------------------------------------------------------------------------
-- THE public read. service_role only. NULL = generic not-found (no such slug,
-- deleted, inactive, no website, unpublished — indistinguishable).
-- ---------------------------------------------------------------------------
create or replace function public.get_website_public(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_biz record;
  v_site public.websites%rowtype;
  v_branch record;
  v_settings record;
  v_hours jsonb;
  v_reviews jsonb;
  v_services jsonb;
  v_sections jsonb;
  v_about text;
  v_contact jsonb;
  v_days text[] := array['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
begin
  if p_slug is null or char_length(p_slug) > 63 then return null; end if;

  select b.id, b.name, b.slug::text as slug, b.industry into v_biz
  from public.businesses b
  where b.slug = p_slug::extensions.citext and b.deleted_at is null and public.business_is_active(b.id);
  if v_biz.id is null then return null; end if;

  select * into v_site from public.websites w
  where w.business_id = v_biz.id and w.deleted_at is null and w.is_published;
  if v_site.id is null then return null; end if;

  select br.id, br.name, br.address, br.phone, br.country_code, br.timezone, br.currency into v_branch
  from public.branches br where br.id = v_site.branch_id and br.deleted_at is null;
  if v_branch.id is null then return null; end if;

  select coalesce(bs.show_prices, false) as show_prices into v_settings
  from public.booking_settings bs where bs.branch_id = v_branch.id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'day_of_week', h.day_of_week, 'start_minute', h.start_minute, 'end_minute', h.end_minute)
           order by h.day_of_week, h.start_minute), '[]'::jsonb)
  into v_hours from public.branch_hours h where h.branch_id = v_branch.id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'first_name', r.reviewer_first_name, 'rating', r.rating, 'comment', r.comment,
           'owner_reply', r.owner_reply, 'created_at', r.created_at)
           order by r.featured_at desc, r.id), '[]'::jsonb)
  into v_reviews
  from (select * from public.reviews rv
        where rv.business_id = v_biz.id and rv.featured_on_website and rv.status = 'published'
          and rv.deleted_at is null
        order by rv.featured_at desc, rv.id limit 12) r;

  select coalesce(jsonb_agg(jsonb_build_object(
           'name', s.name, 'description', s.description, 'duration_minutes', s.duration_minutes,
           'category_name', c.name)
           || case when coalesce(v_settings.show_prices, false)
                   then jsonb_build_object('price_minor', sb.price_minor) else '{}'::jsonb end
           order by c.sort_order nulls last, c.name nulls last, s.sort_order, s.name), '[]'::jsonb)
  into v_services
  from public.services s
  join public.service_branches sb on sb.service_id = s.id and sb.branch_id = v_branch.id and sb.enabled
  left join public.service_categories c on c.id = s.category_id and c.deleted_at is null
  where s.business_id = v_biz.id and s.deleted_at is null and s.is_active;

  select content ->> 'body' into v_about from public.website_sections
  where website_id = v_site.id and section_type = 'about';

  select content into v_contact from public.website_sections
  where website_id = v_site.id and section_type = 'contact';

  -- Visible sections, in order; sections with nothing to show are dropped.
  select coalesce(jsonb_agg(
    jsonb_build_object('type', s.section_type, 'content', s.content)
    || case s.section_type
         when 'services' then jsonb_build_object('services', v_services)
         when 'testimonials' then jsonb_build_object('reviews', v_reviews)
         else '{}'::jsonb end
    order by s.sort_order), '[]'::jsonb)
  into v_sections
  from public.website_sections s
  where s.website_id = v_site.id and s.deleted_at is null and s.is_visible
    and case s.section_type
          when 'about' then coalesce(btrim(s.content ->> 'body'), '') <> ''
          when 'gallery' then jsonb_array_length(coalesce(s.content -> 'images', '[]'::jsonb)) > 0
          when 'faqs' then jsonb_array_length(coalesce(s.content -> 'items', '[]'::jsonb)) > 0
          when 'services' then jsonb_array_length(v_services) > 0
          when 'testimonials' then jsonb_array_length(v_reviews) > 0
          else true end;

  return jsonb_build_object(
    'business', jsonb_build_object('name', v_biz.name, 'slug', v_biz.slug, 'industry', v_biz.industry),
    'branch', jsonb_build_object(
      'name', v_branch.name, 'address', v_branch.address, 'phone', v_branch.phone,
      'country_code', v_branch.country_code, 'timezone', v_branch.timezone, 'currency', v_branch.currency),
    'hours', v_hours,
    'website', jsonb_build_object(
      'template_key', v_site.template_key,
      'brand_color', v_site.brand_color, 'font_key', v_site.font_key, 'radius_key', v_site.radius_key,
      'logo_path', v_site.logo_path, 'hero_image_path', v_site.hero_image_path),
    'seo', jsonb_build_object(
      'title', coalesce(v_site.seo_title, v_biz.name),
      'description', coalesce(v_site.seo_description, nullif(left(btrim(coalesce(v_about, '')), 160), ''))),
    'sections', v_sections,
    'booking', jsonb_build_object(
      'bookable', coalesce((public.branch_is_bookable(v_branch.id) ->> 'bookable')::boolean, false),
      'show_prices', coalesce(v_settings.show_prices, false)),
    -- LocalBusiness structured data. The Edge Function adds `url` and `image`
    -- (it alone knows the public origins).
    'json_ld', jsonb_strip_nulls(jsonb_build_object(
      '@context', 'https://schema.org',
      '@type', 'LocalBusiness',
      'name', v_biz.name,
      'telephone', v_branch.phone,
      'address', jsonb_build_object('@type', 'PostalAddress',
                   'streetAddress', v_branch.address, 'addressCountry', v_branch.country_code),
      'openingHoursSpecification', (
        select jsonb_agg(jsonb_build_object(
          '@type', 'OpeningHoursSpecification',
          'dayOfWeek', v_days[(h ->> 'day_of_week')::int + 1],
          'opens', to_char(make_time(least((h ->> 'start_minute')::int, 1439) / 60, least((h ->> 'start_minute')::int, 1439) % 60, 0), 'HH24:MI'),
          'closes', to_char(make_time(least((h ->> 'end_minute')::int, 1439) / 60, least((h ->> 'end_minute')::int, 1439) % 60, 0), 'HH24:MI')))
        from jsonb_array_elements(v_hours) h),
      'sameAs', (select jsonb_agg(value) from jsonb_each_text(coalesce(v_contact -> 'social', '{}'::jsonb)))))
  );
end $$;

comment on function public.get_website_public is
  'The ONE public website read. service_role only; called by the get_website Edge Function. Returns NULL (generic not-found) for unknown, deleted, inactive, unpublished. Never returns ids, contact details of clients, or anything not meant to be public.';

-- ---------------------------------------------------------------------------
-- Grants. Supabase grants EXECUTE to anon by default: revoke explicitly.
-- ---------------------------------------------------------------------------
revoke all on function public.ensure_website(uuid) from public, anon;
revoke all on function public.save_website_settings(uuid, jsonb) from public, anon;
revoke all on function public.save_website_section(uuid, text, boolean, jsonb) from public, anon;
revoke all on function public.reorder_website_sections(uuid, text[]) from public, anon;
revoke all on function public.set_website_published(uuid, boolean) from public, anon;
revoke all on function public.get_website_public(text) from public, anon, authenticated;
grant execute on function public.ensure_website(uuid) to authenticated;
grant execute on function public.save_website_settings(uuid, jsonb) to authenticated;
grant execute on function public.save_website_section(uuid, text, boolean, jsonb) to authenticated;
grant execute on function public.reorder_website_sections(uuid, text[]) to authenticated;
grant execute on function public.set_website_published(uuid, boolean) to authenticated;
grant execute on function public.get_website_public(text) to service_role;

-- Pure helpers: no reason for the API roles to call them.
revoke all on function public.website_str_err(jsonb, text, int) from public, anon, authenticated;
revoke all on function public.website_url_err(jsonb, text) from public, anon, authenticated;
revoke all on function public.website_section_content_error(text, jsonb) from public, anon, authenticated;
revoke all on function public.website_section_paths_error(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.website_template_defaults(text) from public, anon, authenticated;
grant execute on function public.website_asset_path_ok(text) to authenticated, service_role;

-- Rate limits (per IP). get_website is a cached-friendly read.
insert into public.rate_limit_rules (endpoint, scope, window_seconds, max_attempts, note) values
  ('get_website', 'ip', 60, 60, 'Public website read. Same window as get_booking_page.');
