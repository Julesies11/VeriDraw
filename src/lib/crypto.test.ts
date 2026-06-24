import { describe, it, expect } from 'vitest';
import { generateSecureCode } from './crypto';

describe('generateSecureCode', () => {
  const VALID_CHARS = /^[A-Z0-9]+$/;

  it('generates a code of the exact requested length', () => {
    expect(generateSecureCode(6)).toHaveLength(6);
    expect(generateSecureCode(10)).toHaveLength(10);
    expect(generateSecureCode(1)).toHaveLength(1);
  });

  it('only contains uppercase alphanumeric characters', () => {
    for (let i = 0; i < 20; i++) {
      expect(VALID_CHARS.test(generateSecureCode(8))).toBe(true);
    }
  });

  it('generates different codes on subsequent calls (probabilistic)', () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateSecureCode(6)));
    // With 36^6 = ~2.1B possibilities and 100 attempts, collision probability is negligible
    expect(codes.size).toBeGreaterThan(90);
  });

  it('produces a zero-length string when length is 0', () => {
    expect(generateSecureCode(0)).toBe('');
  });
});
