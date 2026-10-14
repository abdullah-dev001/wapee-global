-- Feature 9 audit: `get_website_public` listed a service's `is_active` but
-- never its `is_bookable_online`, unlike every other place the catalogue is
-- read publicly (`get_booking_page_catalogue`, `save_booking_settings`'s
-- preview warnings, the slot engine, `branch_is_bookable`). A service
-- turned "not bookable online" (shown internally, kept off the public
-- booking flow) still appeared, priced, on the business's own marketing
-- website — the exact leak that flag exists to prevent. Redefines the
-- function with the same filter every other public read already uses,
-- changing nothing else; the only migration that has ever defined
-- `get_website_public` (20261007090000_phase7_website.sql), so this is the
-- sole place to check.
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
  where s.business_id = v_biz.id and s.deleted_at is null and s.is_active and s.is_bookable_online;

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
  'The ONE public website read. service_role only; called by the get_website Edge Function. Returns NULL (generic not-found) for unknown, deleted, inactive, unpublished. Never returns ids, contact details of clients, or anything not meant to be public. Services are filtered to is_active AND is_bookable_online (matches every other public catalogue read) so a service hidden from online booking does not leak onto the marketing site.';
