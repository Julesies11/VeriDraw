import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Profile } from './Profile';

// Mock useAuth
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { email: 'test@example.com' },
    loading: false,
  }),
}));

// Mock useProfile
vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({
    profile: { display_name: 'Test User', avatar_url: null },
    isLoading: false,
    updateProfile: vi.fn(),
    isUpdating: false,
  }),
}));

describe('Profile Page Smoke Test', () => {
  it('renders without crashing', () => {
    const { getByText, getByLabelText } = render(
      <MemoryRouter>
        <Profile />
      </MemoryRouter>
    );

    expect(getByText('My Profile')).toBeDefined();
    expect(getByLabelText('Display Name *')).toBeDefined();
  });
});
