import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, act, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

// ─── Supabase mock ─────────────────────────────────────────────────────────────
const { mockSetSession, mockOnAuthStateChange, mockUnsubscribe } = vi.hoisted(() => {
  const mockUnsubscribe = vi.fn();
  const mockOnAuthStateChange = vi.fn(() => ({
    data: { subscription: { unsubscribe: mockUnsubscribe } },
  }));
  const mockSetSession = vi.fn().mockResolvedValue({ error: null });
  return { mockSetSession, mockOnAuthStateChange, mockUnsubscribe };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      setSession: mockSetSession,
      onAuthStateChange: mockOnAuthStateChange,
    },
  },
}));

// ─── Auth hook mock ────────────────────────────────────────────────────────────
let mockUser: object | null = null;
const mockUpdatePassword = vi.fn();
const mockLogout = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    updatePassword: mockUpdatePassword,
    user: mockUser,
    logout: mockLogout,
  }),
}));

// ─── error-helpers mock ────────────────────────────────────────────────────────
vi.mock('@/lib/error-helpers', () => ({
  getFriendlyErrorMessage: (_err: unknown, fallback: string) => fallback,
  logErrorToDb: vi.fn().mockResolvedValue(undefined),
}));

import { ResetPassword } from './ResetPassword';

const renderPage = () =>
  render(
    <MemoryRouter>
      <ResetPassword />
    </MemoryRouter>
  );

// ─────────────────────────────────────────────────────────────────────────────
describe('ResetPassword Page — Smoke Tests', () => {
  beforeEach(() => {
    mockUser = null;
    mockSetSession.mockResolvedValue({ error: null });
    window.location.hash = '';
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers(); // Always restore after any fake-timer test
  });

  // ── 1. Loading state ────────────────────────────────────────────────────────
  it('shows the loading spinner when there is no hash token and session is pending', () => {
    const { getByText } = renderPage();
    expect(getByText('Verifying secure recovery session...')).toBeDefined();
  });

  // ── 2. Timeout → Invalid Session ────────────────────────────────────────────
  // Uses fake timers scoped only to this test; real timers restored in afterEach.
  it('shows Invalid Session after the 5-second timeout with no valid token', async () => {
    vi.useFakeTimers();
    const { getByText } = renderPage();

    // Trigger the 5 s guard synchronously
    act(() => {
      vi.advanceTimersByTime(6000);
    });

    // Restore real timers so waitFor can poll properly
    vi.useRealTimers();

    await waitFor(() => {
      expect(getByText('Invalid Session')).toBeDefined();
    });
    expect(getByText('Request New Link')).toBeDefined();
    expect(getByText('Back to Sign In')).toBeDefined();
  });

  // ── 3. Hash token → setSession called ───────────────────────────────────────
  it('calls supabase.auth.setSession when a valid recovery hash is present', async () => {
    window.location.hash =
      '#access_token=tok-abc&refresh_token=ref-xyz&type=recovery';

    renderPage();

    await waitFor(() => {
      expect(mockSetSession).toHaveBeenCalledWith({
        access_token: 'tok-abc',
        refresh_token: 'ref-xyz',
      });
    });
  });

  // ── 4. Security: token cleared from URL ──────────────────────────────────────
  it('clears the hash from the URL immediately after extracting the recovery token', async () => {
    window.location.hash =
      '#access_token=tok-abc&refresh_token=ref-xyz&type=recovery';
    const spy = vi.spyOn(window.history, 'replaceState');

    renderPage();

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith({}, '', window.location.pathname);
    });
    spy.mockRestore();
  });

  // ── 5. Malformed hash → immediate Invalid Session ────────────────────────────
  it('shows Invalid Session immediately when hash has access_token but no refresh_token', async () => {
    // Missing refresh_token — should fail immediately without waiting for timeout
    window.location.hash = '#access_token=tok-abc&type=recovery';

    const { getByText } = renderPage();

    await waitFor(() => {
      expect(getByText('Invalid Session')).toBeDefined();
    });
  });

  // ── 6. setSession error → Invalid Session ────────────────────────────────────
  it('shows Invalid Session when supabase.auth.setSession returns an error', async () => {
    window.location.hash =
      '#access_token=expired&refresh_token=expired-ref&type=recovery';
    mockSetSession.mockResolvedValueOnce({ error: new Error('Invalid JWT') });

    const { getByText } = renderPage();

    await waitFor(() => {
      expect(getByText('Invalid Session')).toBeDefined();
    });
  });

  // ── 7. User in context → password form rendered ──────────────────────────────
  it('renders the password form when a user is available in auth context', async () => {
    mockUser = { id: 'user-1', email: 'test@example.com' };

    const { getByLabelText, getByText } = renderPage();

    await waitFor(() => {
      expect(getByLabelText('New Password')).toBeDefined();
      expect(getByLabelText('Confirm New Password')).toBeDefined();
    });
    expect(getByText('Set new password')).toBeDefined();
  });
});
