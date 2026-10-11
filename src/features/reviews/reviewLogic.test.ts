import { describe, expect, it } from 'vitest';

import {
  canOfferReviewLink,
  cleanComment,
  cleanReply,
  filtersFromParams,
  isFiltered,
  isRating,
  starFlags,
} from './reviewLogic';

describe('ratings', () => {
  it('accepts only integers 1..5', () => {
    for (const ok of [1, 2, 3, 4, 5]) expect(isRating(ok)).toBe(true);
    for (const bad of [0, 6, 2.5, -1, '5', null, undefined, Number.NaN])
      expect(isRating(bad)).toBe(false);
  });
  it('starFlags fills from the left and tolerates junk', () => {
    expect(starFlags(3)).toEqual([true, true, true, false, false]);
    expect(starFlags(5)).toEqual([true, true, true, true, true]);
    expect(starFlags(0)).toEqual([false, false, false, false, false]);
    expect(starFlags(9)).toEqual([false, false, false, false, false]);
  });
});

describe('text cleaning', () => {
  it('cleanReply trims; blank or >1000 is null', () => {
    expect(cleanReply('  hi  ')).toBe('hi');
    expect(cleanReply('   ')).toBeNull();
    expect(cleanReply('x'.repeat(1001))).toBeNull();
    expect(cleanReply('x'.repeat(1000))).toBe('x'.repeat(1000));
  });
  it('cleanComment trims, empties to null, refuses >2000', () => {
    expect(cleanComment('  nice ')).toEqual({ ok: true, value: 'nice' });
    expect(cleanComment('  ')).toEqual({ ok: true, value: null });
    expect(cleanComment('x'.repeat(2001))).toEqual({ ok: false });
  });
});

describe('filters', () => {
  it('parses params and ignores unknown values', () => {
    expect(
      filtersFromParams({ rating: '4', replied: 'no', featured: 'yes', branch: 'b1' }),
    ).toEqual({
      branchId: 'b1',
      rating: 4,
      hasReply: false,
      featured: true,
    });
    expect(filtersFromParams({ rating: '9', replied: 'maybe', branch: 'all' })).toEqual({
      branchId: null,
      rating: null,
      hasReply: null,
      featured: null,
    });
  });
  it('isFiltered ignores the branch', () => {
    expect(isFiltered({ branchId: 'b', rating: null, hasReply: null, featured: null })).toBe(false);
    expect(isFiltered({ branchId: null, rating: 1, hasReply: null, featured: null })).toBe(true);
  });
});

describe('canOfferReviewLink', () => {
  it('only for a completed, unreviewed appointment and an allowed user', () => {
    expect(canOfferReviewLink({ status: 'completed', hasReview: false, allowed: true })).toBe(true);
    expect(canOfferReviewLink({ status: 'completed', hasReview: true, allowed: true })).toBe(false);
    expect(canOfferReviewLink({ status: 'confirmed', hasReview: false, allowed: true })).toBe(
      false,
    );
    expect(canOfferReviewLink({ status: 'completed', hasReview: false, allowed: false })).toBe(
      false,
    );
  });
});
