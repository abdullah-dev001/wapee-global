-- Phase 7A (4/4): PUBLIC storage bucket for website assets ONLY (logo, hero,
-- gallery). Files & Photos (private, Phase 10) is a separate bucket.
--
-- Risks accepted/known (see context/website-reviews-widget.md):
--   * objects are world-readable BY URL (that is the point). There is no SELECT
--     policy for anon, so the bucket cannot be LISTED, and filenames are UUIDs.
--   * only jpeg/png/webp, 5 MB (no SVG: it can carry script). The type limit is
--     checked by Storage against the declared content-type, not sniffed bytes.
--   * EXIF (GPS) in photos is NOT stripped.
--   * Writes need `website.edit` on the business named by the FIRST path
--     segment; names must be `<business uuid>/<uuid>.<jpg|png|webp>`; at most
--     60 objects per business. No UPDATE policy: assets are immutable (replace =
--     upload new + delete old).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('website-assets', 'website-assets', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy website_assets_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'website-assets'
  and public.website_asset_path_ok(name)
  and public.can((storage.foldername(name))[1]::uuid, null, 'website.edit')
  and (select count(*) from storage.objects o
       where o.bucket_id = 'website-assets'
         and (storage.foldername(o.name))[1] = (storage.foldername(name))[1]) < 60
);

-- Deleting through the Storage API also reads the row, so editors get SELECT on
-- their own business prefix. anon gets neither: no listing.
create policy website_assets_select on storage.objects for select to authenticated
using (
  bucket_id = 'website-assets'
  and public.website_asset_path_ok(name)
  and public.can((storage.foldername(name))[1]::uuid, null, 'website.edit')
);

create policy website_assets_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'website-assets'
  and public.website_asset_path_ok(name)
  and public.can((storage.foldername(name))[1]::uuid, null, 'website.edit')
);
