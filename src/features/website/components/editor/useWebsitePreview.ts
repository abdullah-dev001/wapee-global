import { useMemo } from 'react';

import {
  useBookingSettings,
  useBranchBookable,
  usePreviewCatalogue,
} from '@/features/booking-settings/api';
import { useReviewList } from '@/features/reviews/api/useReviews';
import { env } from '@/config/env';

import { type AdminSection, type AdminWebsite } from '../../adminTypes';
import { useWebsiteBranchInfo } from '../../api/useWebsiteBranchInfo';
import { buildPreviewModel } from '../../previewModel';
import { type WebsiteModel, type WebsiteReviewItem, type WebsiteServiceItem } from '../../types';

const FEATURED_ONLY = { branchId: null, rating: null, hasReply: null, featured: true } as const;

export type WebsitePreviewData = {
  model: WebsiteModel | null;
  counts: { serviceCount: number; reviewCount: number };
  bookable: boolean | null;
  isLoading: boolean;
};

/**
 * Everything the live preview needs: the draft (website + sections as edited),
 * plus the live data the public page reads — services and prices, featured
 * reviews, the branch's address, phone and hours, and whether booking is on.
 */
export function useWebsitePreview(input: {
  businessId: string | null;
  businessName: string;
  slug: string;
  website: AdminWebsite | null;
  sections: readonly AdminSection[];
}): WebsitePreviewData {
  const { businessId, businessName, slug, website, sections } = input;
  const branchId = website?.branchId ?? null;

  const branch = useWebsiteBranchInfo(businessId, branchId);
  const currency = branch.data?.currency ?? '';
  const catalogue = usePreviewCatalogue(businessId, branchId, currency);
  const settings = useBookingSettings(businessId, branchId);
  const bookable = useBranchBookable(businessId, branchId);
  const reviews = useReviewList(businessId, FEATURED_ONLY);

  const services = useMemo<WebsiteServiceItem[]>(
    () =>
      (catalogue.data?.services ?? []).map((s) => ({
        name: s.name,
        description: null,
        durationMinutes: s.durationMinutes,
        categoryName: s.categoryName,
        // The public site omits prices when the branch hides them.
        priceMinor: settings.data?.showPrices ? s.priceMinor : null,
      })),
    [catalogue.data, settings.data?.showPrices],
  );

  const featured = useMemo<WebsiteReviewItem[]>(
    () =>
      (reviews.data?.pages[0]?.items ?? [])
        .filter((r) => r.status === 'published')
        .map((r) => ({
          firstName: r.reviewerFirstName,
          rating: r.rating,
          comment: r.comment,
          ownerReply: r.ownerReply,
          createdAt: r.createdAt,
        })),
    [reviews.data],
  );

  const counts = { serviceCount: services.length, reviewCount: featured.length };

  const model = useMemo(() => {
    if (!website || !branch.data || !env.supabaseUrl) return null;
    return buildPreviewModel({
      businessName,
      slug,
      currency: branch.data.currency,
      bookable: bookable.data?.bookable === true,
      supabaseUrl: env.supabaseUrl,
      website,
      sections,
      services,
      reviews: featured,
      branch: {
        name: branch.data.name,
        address: branch.data.address,
        phone: branch.data.phone,
        countryCode: branch.data.countryCode,
      },
      hours: branch.data.hours,
    });
  }, [website, branch.data, businessName, slug, bookable.data, sections, services, featured]);

  return {
    model,
    counts,
    bookable: bookable.data ? bookable.data.bookable : null,
    isLoading: branch.isPending || catalogue.isPending,
  };
}
