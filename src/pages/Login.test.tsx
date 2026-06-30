import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Login Page Smoke Test', () => {
  it('renders sign-in view without crashing', () => {
    const { getByText, getByLabelText, queryByLabelText } = render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    expect(getByText('Welcome to VeriDraw')).toBeDefined();
    expect(getByLabelText('Email Address')).toBeDefined();
    expect(getByLabelText('Password')).toBeDefined();
    expect(queryByLabelText('Full Name')).toBeNull();
    expect(queryByLabelText('Confirm Password')).toBeNull();
    expect(getByText('Google')).toBeDefined();
    expect(getByText('Microsoft')).toBeDefined();
  });

  it('switches to register view and renders additional signup fields', () => {
    const { getByText, getByLabelText } = render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    // Toggle to register view
    const toggleLink = getByText('create one');
    fireEvent.click(toggleLink);

    expect(getByText('Create your free VeriDraw account.')).toBeDefined();
    expect(getByLabelText('Full Name')).toBeDefined();
    expect(getByLabelText('Email Address')).toBeDefined();
    expect(getByLabelText('Password')).toBeDefined();
    expect(getByLabelText('Confirm Password')).toBeDefined();
  });
});
