import { describe, expect, it } from 'vitest';
import { detailsError } from '../details.ts';

describe('patient details', () => {
  const today = '2026-10-24';
  it('accepts optional details, calendar dates and formatted fictional phone numbers', () => {
    expect(detailsError({}, today)).toBe('');
    expect(detailsError({ dateOfBirth: '2000-02-29', phone: '+1 (202) 555-0100' }, today)).toBe('');
  });
  it('rejects impossible, ambiguous and future dates without guessing', () => {
    for (const dateOfBirth of ['2001-02-29', '2020-02-30', '10/24/2000', '2026-10-25']) {
      expect(detailsError({ dateOfBirth }, today)).toContain('date of birth');
    }
  });
  it('rejects unsupported phone characters and incomplete numbers', () => {
    for (const phone of ['123', 'call me', '202-555-0100 ext 1', '1'.repeat(16)]) {
      expect(detailsError({ phone }, today)).toContain('phone number');
    }
  });
});
