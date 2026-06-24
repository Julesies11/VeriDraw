import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getFriendlyErrorMessage } from './error-helpers';

describe('getFriendlyErrorMessage', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns default message if error is null or undefined', () => {
    expect(getFriendlyErrorMessage(null, 'Default Error')).toBe('Default Error');
    expect(getFriendlyErrorMessage(undefined, 'Default Error')).toBe('Default Error');
  });

  it('returns string error if it is a general string', () => {
    expect(getFriendlyErrorMessage('Something went wrong', 'Default Error')).toBe('Something went wrong');
  });

  it('returns error.message if it is a general error object', () => {
    expect(getFriendlyErrorMessage({ message: 'Custom error message' }, 'Default Error')).toBe('Custom error message');
  });

  it('handles disabled provider message in DEV environment', () => {
    vi.stubEnv('DEV', true as unknown as boolean);
    const err = { message: 'Unsupported provider: provider is not enabled' };
    const result = getFriendlyErrorMessage(err, 'Default Error');
    expect(result).toContain('not enabled in your Supabase dashboard');
    vi.unstubAllEnvs();
  });

  it('handles disabled provider message in PROD environment', () => {
    vi.stubEnv('DEV', false as unknown as boolean);
    const err = { message: 'Unsupported provider: provider is not enabled' };
    const result = getFriendlyErrorMessage(err, 'Default Error');
    expect(result).toBe('This login provider is currently unavailable. Please sign in with email/password or contact support.');
    vi.unstubAllEnvs();
  });
});
