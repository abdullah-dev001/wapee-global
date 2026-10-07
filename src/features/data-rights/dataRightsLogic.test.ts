import { describe, expect, it } from 'vitest';

import {
  DATA_RIGHTS_ERROR_KEYS,
  dataRightsErrorKey,
  namesMatch,
  requestAbilities,
  statusTone,
} from './dataRightsLogic';

describe('dataRightsErrorKey', () => {
  it('maps every known reason code and falls back for anything else', () => {
    for (const [code, key] of Object.entries(DATA_RIGHTS_ERROR_KEYS)) {
      expect(dataRightsErrorKey(code)).toBe(key);
    }
    expect(dataRightsErrorKey('boom')).toBe('dataRights.errors.unknown');
    expect(dataRightsErrorKey(null)).toBe('dataRights.errors.unknown');
    expect(dataRightsErrorKey('toString')).toBe('dataRights.errors.unknown');
  });
});

describe('namesMatch', () => {
  it('ignores case, outer spaces and repeated spaces', () => {
    expect(namesMatch('  erin   ERASEME ', 'Erin Eraseme')).toBe(true);
  });
  it('rejects a different or partial name and an empty expectation', () => {
    expect(namesMatch('Erin', 'Erin Eraseme')).toBe(false);
    expect(namesMatch('', '')).toBe(false);
    expect(namesMatch('x', '   ')).toBe(false);
  });
});

describe('statusTone / requestAbilities', () => {
  it('tones', () => {
    expect(statusTone('open')).toBe('warning');
    expect(statusTone('done')).toBe('success');
    expect(statusTone('declined')).toBe('neutral');
  });
  it('an export request needs clients.export, an erase request needs clients.erase', () => {
    expect(requestAbilities('export', { canExport: true, canErase: false })).toEqual({
      canRun: true,
      canDecline: true,
    });
    expect(requestAbilities('erase', { canExport: true, canErase: false })).toEqual({
      canRun: false,
      canDecline: false,
    });
    expect(requestAbilities('erase', { canExport: true, canErase: true }).canRun).toBe(true);
  });
});
