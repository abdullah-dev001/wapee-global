import { describe, expect, it } from 'vitest';

import {
  bookingLinkIsLive,
  bookingUrl,
  bookingWarnings,
  bufferExplanationKey,
} from './bookingWarnings';

describe('bookingWarnings', () => {
  it('returns nothing for a fully configured, bookable branch', () => {
    expect(bookingWarnings({ bookable: true, reasons: [] })).toEqual([]);
  });

  it('treats missing data as nothing to warn about rather than throwing', () => {
    // The query is still loading. Rendering five errors while we do not yet know
    // would be worse than rendering none.
    expect(bookingWarnings(null)).toEqual([]);
    expect(bookingWarnings(undefined)).toEqual([]);
  });

  it('orders warnings by the real dependency chain, not alphabetically', () => {
    const warnings = bookingWarnings({
      bookable: false,
      reasons: ['booking_disabled', 'no_staffed_service', 'no_branch_hours', 'no_bookable_service'],
    });

    // Hours first: without them the engine returns nothing whatever else is set.
    // booking_disabled last: it is a deliberate choice, not an oversight.
    expect(warnings.map((w) => w.code)).toEqual([
      'no_branch_hours',
      'no_bookable_service',
      'no_staffed_service',
      'booking_disabled',
    ]);
  });

  it('points each fixable warning at the screen that fixes it', () => {
    const byCode = Object.fromEntries(
      bookingWarnings({
        bookable: false,
        reasons: [
          'no_branch_hours',
          'no_bookable_service',
          'no_bookable_staff',
          'no_staffed_service',
        ],
      }).map((w) => [w.code, w.fixRoute]),
    );

    expect(byCode.no_branch_hours).toBe('/schedule');
    expect(byCode.no_bookable_service).toBe('/services');
    expect(byCode.no_bookable_staff).toBe('/staff');
    // Both exist but are not linked; the link lives on the service.
    expect(byCode.no_staffed_service).toBe('/services');
  });

  it('marks booking_disabled as info and missing setup as error', () => {
    const [disabled] = bookingWarnings({ bookable: false, reasons: ['booking_disabled'] });
    expect(disabled?.severity).toBe('info');

    const [noHours] = bookingWarnings({ bookable: false, reasons: ['no_branch_hours'] });
    expect(noHours?.severity).toBe('error');
  });

  it('has no fix route for booking_disabled, which is fixed on this very screen', () => {
    const [disabled] = bookingWarnings({ bookable: false, reasons: ['booking_disabled'] });
    expect(disabled?.fixRoute).toBeUndefined();
  });

  describe('the buffer override warning', () => {
    const ok = { bookable: true, reasons: [] } as const;

    it('warns only when a branch buffer AND a service buffer both exist', () => {
      const warnings = bookingWarnings(ok, {
        branchBufferMinutes: 10,
        serviceBufferMinutes: [0, 15],
      });
      expect(warnings.map((w) => w.code)).toEqual(['buffer_override']);
    });

    it('stays quiet when only the branch buffer is set', () => {
      expect(
        bookingWarnings(ok, { branchBufferMinutes: 10, serviceBufferMinutes: [0, 0] }),
      ).toEqual([]);
    });

    it('stays quiet when only service buffers are set', () => {
      expect(bookingWarnings(ok, { branchBufferMinutes: 0, serviceBufferMinutes: [15] })).toEqual(
        [],
      );
    });

    it('stays quiet when neither is set', () => {
      expect(bookingWarnings(ok, { branchBufferMinutes: 0, serviceBufferMinutes: [] })).toEqual([]);
    });
  });
});

describe('bufferExplanationKey', () => {
  // These four cases are the only states that exist, and each needs different
  // wording because the combination rule is counter-intuitive.
  it('says nothing is set', () => {
    expect(bufferExplanationKey(0, [])).toBe('none');
    expect(bufferExplanationKey(0, [0, 0])).toBe('none');
  });

  it('says the branch value applies to everything', () => {
    expect(bufferExplanationKey(10, [0, 0])).toBe('branchOnly');
  });

  it('says only the services with their own value have a gap', () => {
    expect(bufferExplanationKey(0, [15, 0])).toBe('serviceOnly');
  });

  it('says the service value REPLACES the branch value', () => {
    // The case people get wrong: 10 + 15 is not 25, it is 15.
    expect(bufferExplanationKey(10, [15])).toBe('serviceOverridesBranch');
  });
});

describe('bookingUrl', () => {
  it('joins the site and the business slug', () => {
    expect(bookingUrl('https://wapee.online', 'nova-hair')).toBe('https://wapee.online/nova-hair/book');
  });

  it('does not double the slash when the base already ends in one', () => {
    expect(bookingUrl('https://wapee.online/', 'nova-hair')).toBe(
      'https://wapee.online/nova-hair/book',
    );
    expect(bookingUrl('https://wapee.online///', 'nova-hair')).toBe(
      'https://wapee.online/nova-hair/book',
    );
  });
});

describe('bookingLinkIsLive', () => {
  it('is live only when the branch really can take a booking', () => {
    expect(bookingLinkIsLive({ bookable: true, reasons: [] })).toBe(true);
    expect(bookingLinkIsLive({ bookable: false, reasons: ['no_branch_hours'] })).toBe(false);
  });

  it('is NOT live while we do not know yet', () => {
    // Defaulting to live during loading would flash an active link that then
    // goes dead, and might get copied in that window.
    expect(bookingLinkIsLive(null)).toBe(false);
    expect(bookingLinkIsLive(undefined)).toBe(false);
  });
});
