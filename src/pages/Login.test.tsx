import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Login } from './Login';

// Mock the useAuth hook
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    login: vi.fn(),
    register: vi.fn(),
    signInWithGoogle: vi.fn(),
    signInWithMicrosoft: vi.fn(),
    signInWithMagicLink: vi.fn(),
  }),
}));

describe('Login Page Smoke Test', () => {
  it('renders without crashing', () => {
    const { getByText, getByLabelText } = render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    expect(getByText('Welcome to VeriDraw')).toBeDefined();
    expect(getByLabelText('Email Address')).toBeDefined();
    expect(getByText('Google')).toBeDefined();
    expect(getByText('Microsoft')).toBeDefined();
  });
});
