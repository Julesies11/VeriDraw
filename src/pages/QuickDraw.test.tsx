import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QuickDraw } from './QuickDraw';

// Mock useAuth
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
  }),
}));

// Mock canvas-confetti
vi.mock('canvas-confetti', () => ({
  default: vi.fn(),
}));

describe('QuickDraw Page Smoke Test', () => {
  it('renders without crashing', () => {
    const { getByText, getByRole } = render(
      <MemoryRouter>
        <QuickDraw />
      </MemoryRouter>
    );

    expect(getByRole('heading', { name: 'Quick Draw' })).toBeDefined();
    expect(getByRole('heading', { name: 'Add entries' })).toBeDefined();
    expect(getByText('Paste List')).toBeDefined();
  });
});
