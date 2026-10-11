import { describe, expect, it } from 'vitest';

import { contactState, formatPhoneDisplay, mailtoUrl, telUrl, whatsappUrl } from './contactLinks';

describe('contact links', () => {
  it('builds a tel: link with the +', () => {
    expect(telUrl('+447700900123')).toBe('tel:+447700900123');
  });
  it('builds a wa.me link with digits only (no +, spaces or dashes)', () => {
    expect(whatsappUrl('+447700900123')).toBe('https://wa.me/447700900123');
    expect(whatsappUrl('+1 (202) 555-0123')).toBe('https://wa.me/12025550123');
  });
  it('builds a mailto: link', () => {
    expect(mailtoUrl(' mia@example.com ')).toBe('mailto:mia@example.com');
  });
});

describe('formatPhoneDisplay', () => {
  it('shows the dial code and grouped digits', () => {
    expect(formatPhoneDisplay('+447700900123')).toBe('+44 770 090 0123');
    expect(formatPhoneDisplay('+923001234567')).toBe('+92 300 123 4567');
  });
  it('leaves a non-E.164 value alone', () => {
    expect(formatPhoneDisplay('07700')).toBe('07700');
  });
});

describe('contactState (permission cases)', () => {
  it('hides everything from a viewer without contact access, even if a value exists', () => {
    expect(contactState(false, '+447700900123')).toBe('hidden');
    expect(contactState(false, null)).toBe('hidden');
  });
  it('says "missing" for an allowed viewer when nothing is on file', () => {
    expect(contactState(true, null)).toBe('missing');
    expect(contactState(true, '')).toBe('missing');
    expect(contactState(true, '   ')).toBe('missing');
  });
  it('shows the value for an allowed viewer', () => {
    expect(contactState(true, 'mia@example.com')).toBe('present');
  });
});
