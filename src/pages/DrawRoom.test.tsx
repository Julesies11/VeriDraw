import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DrawRoom } from './DrawRoom';

// Mock useAuth
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-123', email: 'host@example.com' },
  }),
}));

// Mock useDrawSession
vi.mock('@/hooks/useDrawSession', () => ({
  useDrawSession: () => ({
    event: {
      id: 'event-123',
      event_name: 'Test Draw Room Event',
      slug: 'test-slug',
      select_count: 1,
      status: 'active',
      created_by: 'user-123',
    },
    items: [
      { id: 'item-1', item_value: 'Item 1', is_selected: false },
      { id: 'item-2', item_value: 'Item 2', is_selected: false },
    ],
    session: null,
    loading: false,
    viewerCount: 3,
    broadcastSpin: vi.fn(),
    broadcastSpinStart: vi.fn(),
    broadcastReaction: vi.fn(),
    refetch: vi.fn(),
  }),
}));

describe('DrawRoom Page Smoke Test', () => {
  it('renders without crashing and displays the event name and candidate entries', () => {
    const { getByText, getByRole, getAllByText } = render(
      <MemoryRouter>
        <DrawRoom />
      </MemoryRouter>
    );

    // Expect event title to render
    expect(getByRole('heading', { name: 'Test Draw Room Event' })).toBeDefined();

    // Expect participant counts/invitation to render
    expect(getByText(/Invite Code/i)).toBeDefined();
    expect(getAllByText('Item 1').length).toBeGreaterThan(0);
    expect(getAllByText('Item 2').length).toBeGreaterThan(0);
  });
});
