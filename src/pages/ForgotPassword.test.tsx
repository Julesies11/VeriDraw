import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ForgotPassword } from './ForgotPassword';

const mockSendPasswordResetEmail = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    sendPasswordResetEmail: mockSendPasswordResetEmail,
  }),
}));

// Explicit cleanup prevents DOM state leaking between tests in happy-dom
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ForgotPassword Page — Smoke Tests', () => {
  it('renders without crashing and shows the email form', () => {
    const { getByText, getByLabelText } = render(
      <MemoryRouter>
        <ForgotPassword />
      </MemoryRouter>
    );

    expect(getByText('Forgot your password?')).toBeDefined();
    expect(getByLabelText('Email Address')).toBeDefined();
    expect(getByText('Send Reset Link')).toBeDefined();
    expect(getByText('Back to Sign In')).toBeDefined();
  });

  it('shows success message after submitting a valid email', async () => {
    mockSendPasswordResetEmail.mockResolvedValueOnce(undefined);

    const { getByLabelText, getByText } = render(
      <MemoryRouter>
        <ForgotPassword />
      </MemoryRouter>
    );

    fireEvent.change(getByLabelText('Email Address'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.click(getByText('Send Reset Link'));

    await waitFor(() => {
      expect(
        getByText('Check your email for instructions to reset your password!')
      ).toBeDefined();
    });
    expect(mockSendPasswordResetEmail).toHaveBeenCalledWith('test@example.com');
  });

  it('shows an error message when the API call fails', async () => {
    mockSendPasswordResetEmail.mockRejectedValueOnce(new Error('User not found'));

    const { getByLabelText, getByText } = render(
      <MemoryRouter>
        <ForgotPassword />
      </MemoryRouter>
    );

    fireEvent.change(getByLabelText('Email Address'), {
      target: { value: 'unknown@example.com' },
    });
    fireEvent.click(getByText('Send Reset Link'));

    await waitFor(() => {
      expect(getByText(/User not found/i)).toBeDefined();
    });
  });
});
