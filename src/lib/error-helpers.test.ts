import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getFriendlyErrorMessage } from './error-helpers';

// ---------------------------------------------------------------------------
// Supabase mock — use vi.hoisted() so variables are available when the
// vi.mock() factory is evaluated (vi.mock calls are hoisted to the top).
// ---------------------------------------------------------------------------
const { mockInsert, mockFrom, mockGetUser } = vi.hoisted(() => {
  const mockInsert = vi.fn().mockResolvedValue({ error: null });
  const mockFrom = vi.fn(() => ({ insert: mockInsert }));
  const mockGetUser = vi.fn().mockResolvedValue({ data: { user: { id: 'test-user-1' } } });
  return { mockInsert, mockFrom, mockGetUser };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: mockFrom,
    auth: { getUser: mockGetUser },
  },
}));

// Import after mock is in place
import { logErrorToDb } from './error-helpers';

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

describe('logErrorToDb', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({ data: { user: { id: 'test-user-1' } } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('inserts the correct fields for an Error object', async () => {
    const err = new Error('Something broke');
    await logErrorToDb(err, { context: 'TestComponent' });

    expect(mockFrom).toHaveBeenCalledWith('vd_error_logs');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        error_message: 'Something broke',
        user_id: 'test-user-1',
        context: { context: 'TestComponent' },
      })
    );
    // Stack should be a string for real Error objects
    const call = mockInsert.mock.calls[0][0];
    expect(typeof call.error_stack).toBe('string');
  });

  it('inserts the stringified value for a plain string error', async () => {
    await logErrorToDb('network timeout');

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ error_message: 'network timeout' })
    );
  });

  it('falls back to "Unknown error" for null/undefined errors', async () => {
    await logErrorToDb(null);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ error_message: 'Unknown error' })
    );
  });

  it('sets user_id to null when the user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    await logErrorToDb(new Error('guest error'));

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: null })
    );
  });

  it('does not throw even if the DB insert itself returns an error', async () => {
    mockInsert.mockResolvedValue({ error: new Error('DB write failed') });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(logErrorToDb(new Error('test'))).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[logErrorToDb] Failed to write log to DB:'),
      expect.anything()
    );
    consoleSpy.mockRestore();
  });

  it('does not throw even if getUser itself rejects', async () => {
    mockGetUser.mockRejectedValue(new Error('auth crash'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(logErrorToDb(new Error('wrapped'))).resolves.toBeUndefined();
    consoleSpy.mockRestore();
  });
});

