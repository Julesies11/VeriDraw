import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Dashboard } from './Dashboard';

// Mock the useAuth hook
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'test-user-123', email: 'test@example.com' },
    loading: false,
  }),
}));

// Mock the eventsApi
vi.mock('@/api/events', () => ({
  eventsApi: {
    list: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
  },
  TABLES: {
    EVENTS: 'vd_events',
  },
}));

describe('Dashboard Page Smoke Test', () => {
  it('renders without crashing and displays action zones', async () => {
    const { getByText, getByRole } = render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    // Assert main header and sub-options
    expect(getByRole('heading', { name: 'VeriDraw' })).toBeDefined();
    expect(getByText('Quick Draw')).toBeDefined();
    expect(getByText('Live Event')).toBeDefined();
    expect(getByText('Join Live Event')).toBeDefined();
  });
});
