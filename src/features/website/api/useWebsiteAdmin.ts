import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { createQueryKeys, staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';
import { type Json } from '@/lib/supabase/database.types';

import { type WebsiteSectionType } from '../types';
import { WebsiteRpcError } from '../adminTypes';
import { type AdminSection, type AdminWebsite, type WebsiteAdminData } from '../adminTypes';
import { assetPath, imageProblem, type ImageProblem } from '../imageUpload';

export const websiteKeys = createQueryKeys('website-admin');

type Raw = Record<string, unknown>;

function unwrap(data: unknown, error: { message: string } | null): Raw {
  if (error) throw new Error(error.message);
  const result = (data ?? {}) as Raw;
  if (result.ok === false) {
    throw new WebsiteRpcError(String(result.code ?? 'unknown'), {
      field: typeof result.field === 'string' ? result.field : undefined,
      detail: typeof result.detail === 'string' ? result.detail : undefined,
    });
  }
  return result;
}

const WEBSITE_COLUMNS =
  'id, branch_id, template_key, is_published, published_at, brand_color, font_key, radius_key, logo_path, hero_image_path, seo_title, seo_description';

/**
 * The editor's data: the website row and its seven sections, read straight from
 * the tables (RLS: only `website.edit` / `website.publish` holders see them).
 * `website: null` means none has been created yet.
 */
export function useWebsiteAdmin(
  businessId: string | null,
): UseQueryResult<WebsiteAdminData, Error> {
  const { isAuthenticated } = useSession();

  return useQuery({
    queryKey: websiteKeys.detail({ businessId: businessId ?? 'none' }, 'site'),
    enabled: isAuthenticated && Boolean(businessId),
    staleTime: staleTimes.static,
    queryFn: async () => {
      const supabase = getSupabase();
      const { data: site, error } = await supabase
        .from('websites')
        .select(WEBSITE_COLUMNS)
        .eq('business_id', businessId ?? '')
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!site) return { website: null, sections: [] };

      const { data: rows, error: sectionsError } = await supabase
        .from('website_sections')
        .select('id, section_type, is_visible, sort_order, content')
        .eq('website_id', site.id)
        .is('deleted_at', null)
        .order('sort_order');
      if (sectionsError) throw new Error(sectionsError.message);

      const website: AdminWebsite = {
        id: site.id,
        branchId: site.branch_id,
        templateKey: site.template_key,
        isPublished: site.is_published,
        publishedAt: site.published_at,
        brandColor: site.brand_color,
        fontKey: site.font_key,
        radiusKey: site.radius_key,
        logoPath: site.logo_path,
        heroImagePath: site.hero_image_path,
        seoTitle: site.seo_title,
        seoDescription: site.seo_description,
      };
      const sections: AdminSection[] = (rows ?? []).map((row) => ({
        id: row.id,
        type: row.section_type as WebsiteSectionType,
        isVisible: row.is_visible,
        sortOrder: row.sort_order,
        content: (row.content ?? {}) as Record<string, unknown>,
      }));
      return { website, sections };
    },
  });
}

function useInvalidate(businessId: string | null) {
  const queryClient = useQueryClient();
  return () =>
    void queryClient.invalidateQueries({
      queryKey: websiteKeys.business(businessId ?? 'none'),
    });
}

export function useEnsureWebsite(businessId: string | null) {
  const invalidate = useInvalidate(businessId);
  return useMutation<undefined, Error, undefined>({
    mutationFn: async () => {
      const { data, error } = await getSupabase().rpc('ensure_website', {
        p_business_id: businessId ?? '',
      });
      unwrap(data, error);
      return undefined;
    },
    onSuccess: invalidate,
  });
}

/** Keys present change; JSON null clears (matches `save_website_settings`). */
export type WebsiteSettingsPatch = Partial<{
  branch_id: string;
  template_key: string;
  brand_color: string | null;
  font_key: string | null;
  radius_key: string | null;
  logo_path: string | null;
  hero_image_path: string | null;
  seo_title: string | null;
  seo_description: string | null;
}>;

export function useSaveWebsiteSettings(businessId: string | null) {
  const invalidate = useInvalidate(businessId);
  return useMutation<undefined, Error, WebsiteSettingsPatch>({
    mutationFn: async (patch) => {
      const { data, error } = await getSupabase().rpc('save_website_settings', {
        p_business_id: businessId ?? '',
        p_settings: patch,
      });
      unwrap(data, error);
      return undefined;
    },
    onSuccess: invalidate,
  });
}

export type SaveSectionInput = {
  type: WebsiteSectionType;
  isVisible?: boolean;
  content?: Record<string, unknown>;
};

export function useSaveWebsiteSection(businessId: string | null) {
  const invalidate = useInvalidate(businessId);
  return useMutation<undefined, Error, SaveSectionInput>({
    mutationFn: async (input) => {
      const { data, error } = await getSupabase().rpc('save_website_section', {
        p_business_id: businessId ?? '',
        p_section_type: input.type,
        p_is_visible: input.isVisible ?? undefined,
        // Plain JSON built by the section editors; the server validates it per type.
        p_content: (input.content ?? undefined) as Json | undefined,
      });
      unwrap(data, error);
      return undefined;
    },
    onSuccess: invalidate,
  });
}

export function useReorderWebsiteSections(businessId: string | null) {
  const invalidate = useInvalidate(businessId);
  return useMutation<undefined, Error, { order: WebsiteSectionType[] }>({
    mutationFn: async ({ order }) => {
      const { data, error } = await getSupabase().rpc('reorder_website_sections', {
        p_business_id: businessId ?? '',
        p_order: order,
      });
      unwrap(data, error);
      return undefined;
    },
    onSuccess: invalidate,
  });
}

export function useSetWebsitePublished(businessId: string | null) {
  const invalidate = useInvalidate(businessId);
  return useMutation<undefined, Error, { published: boolean }>({
    mutationFn: async ({ published }) => {
      const { data, error } = await getSupabase().rpc('set_website_published', {
        p_business_id: businessId ?? '',
        p_published: published,
      });
      unwrap(data, error);
      return undefined;
    },
    onSuccess: invalidate,
  });
}

// ---------------------------------------------------------------------------
// Images: website-assets bucket
// ---------------------------------------------------------------------------

export class ImageUploadError extends Error {
  readonly problem: ImageProblem | 'upload_failed';
  constructor(problem: ImageProblem | 'upload_failed') {
    super(problem);
    this.name = 'ImageUploadError';
    this.problem = problem;
  }
}

export type PickedImage = { uri: string; mimeType?: string | null; fileSize?: number | null };

/**
 * Uploads one image to `website-assets/<business>/<uuid>.<ext>` and returns the
 * path. The client checks type and size first for a quick, friendly refusal; the
 * bucket and storage policy enforce the same limits server-side regardless.
 */
export function useUploadWebsiteImage(businessId: string | null) {
  return useMutation<string, Error, PickedImage>({
    mutationFn: async (picked) => {
      if (!businessId) throw new ImageUploadError('upload_failed');

      // Quick pre-check from what the picker told us (size may be missing on web).
      const type = (picked.mimeType ?? '').toLowerCase();
      if (picked.fileSize !== null && picked.fileSize !== undefined) {
        const early = imageProblem({ mimeType: type, fileSize: picked.fileSize });
        if (early) throw new ImageUploadError(early);
      }

      let body: ArrayBuffer;
      let blobType = type;
      try {
        const response = await fetch(picked.uri);
        // `Response.arrayBuffer()` works on web, iOS and Android; `Blob.arrayBuffer()` is not
        // reliable in React Native.
        if (!blobType) blobType = (response.headers.get('content-type') ?? '').toLowerCase();
        body = await response.arrayBuffer();
      } catch {
        throw new ImageUploadError('upload_failed');
      }

      // Authoritative check on the real bytes.
      const problem = imageProblem({ mimeType: blobType, fileSize: body.byteLength });
      if (problem) throw new ImageUploadError(problem);

      const path = assetPath(businessId, blobType);
      if (!path) throw new ImageUploadError('type');

      const { error } = await getSupabase()
        .storage.from('website-assets')
        .upload(path, body, { contentType: blobType, upsert: false });
      if (error) throw new ImageUploadError('upload_failed');
      return path;
    },
  });
}

/**
 * Best-effort delete of replaced or removed assets, so the per-business file cap
 * (60) is not eaten by orphans. A failure is ignored: the row that referenced
 * the file is already updated, and an orphan is harmless apart from the cap.
 */
export async function removeWebsiteAssets(paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    await getSupabase()
      .storage.from('website-assets')
      .remove([...paths]);
  } catch {
    // ignored on purpose, see above
  }
}
