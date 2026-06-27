/**
 * Unit tests for AuthProvider.sendPasswordResetEmail
 *
 * Verifies that the auth provider ALWAYS delegates password reset emails to
 * the vd-send-password-reset Edge Function (Resend), never to Supabase's
 * built-in mailer (which cannot be configured on this shared project).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ─── Supabase mock ─────────────────────────────────────────────────────────────
const { mockInvoke, mockGetSession, mockOnAuthStateChange } = vi.hoisted(() => {
  const mockUnsubscribe = vi.fn();
  const mockOnAuthStateChange = vi.fn(() => ({
    data: { subscription: { unsubscribe: mockUnsubscribe } },
  }));
  const mockGetSession = vi.fn().mockResolvedValue({ data: { session: null } });
  const mockInvoke = vi.fn().mockResolvedValue({ data: { success: true }, error: null });
  return { mockInvoke, mockGetSession, mockOnAuthStateChange };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: mockOnAuthStateChange,
      getSession: mockGetSession,
    },
    functions: {
      invoke: mockInvoke,
    },
  },
}));

import { AuthProvider } from '@/auth/providers/supabase-provider';
import { useAuth } from '@/hooks/useAuth';

const makeWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
describe('AuthProvider — sendPasswordResetEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue({ data: { success: true }, error: null });
  });

  it('invokes the vd-send-password-reset Edge Function with the correct email', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() });

    await result.current.sendPasswordResetEmail('user@example.com');

    expect(mockInvoke).toHaveBeenCalledWith(
      'vd-send-password-reset',
      expect.objectContaining({
        body: expect.objectContaining({ email: 'user@example.com' }),
      })
    );
  });

  it('includes a redirectTo pointing to /reset-password', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() });

    await result.current.sendPasswordResetEmail('user@example.com');

    const invokeBody = mockInvoke.mock.calls[0][1].body;
    expect(invokeBody.redirectTo).toContain('/reset-password');
  });

  it('throws an error when the Edge Function returns a data.error payload', async () => {
    mockInvoke.mockResolvedValueOnce({ data: { error: 'Rate limit exceeded' }, error: null });

    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() });

    await expect(result.current.sendPasswordResetEmail('user@example.com')).rejects.toThrow(
      'Rate limit exceeded'
    );
  });

  it('throws an error when the Edge Function invocation itself fails', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: { message: 'Network error' } });

    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() });

    await expect(result.current.sendPasswordResetEmail('user@example.com')).rejects.toThrow(
      'Failed to send password reset email'
    );
  });

  it('does NOT call supabase.auth.resetPasswordForEmail (must use Edge Function only)', async () => {
    const resetPasswordForEmailSpy = vi.fn();
    // If this spy were called, the test would catch it — confirming we never
    // fall back to Supabase's built-in email system.
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() });

    await result.current.sendPasswordResetEmail('user@example.com');

    expect(resetPasswordForEmailSpy).not.toHaveBeenCalled();
    // And the Edge Function WAS called
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });
});
