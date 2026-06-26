/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { DrawRoom } from './DrawRoom';

// Set up dynamic mock containers (must start with 'mock')
const mockUserState = { user: null as any, loading: false };
const mockEventState = {
  event: null as any,
  items: [] as any[],
  session: null as any,
  loading: false,
  viewerCount: 0,
};

// Mock useAuth
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockUserState.user,
    loading: mockUserState.loading,
  }),
}));

// Mock useDrawSession
vi.mock('@/hooks/useDrawSession', () => ({
  useDrawSession: () => ({
    event: mockEventState.event,
    items: mockEventState.items,
    session: mockEventState.session,
    loading: mockEventState.loading,
    viewerCount: mockEventState.viewerCount,
    broadcastSpin: vi.fn(),
    broadcastSpinStart: vi.fn(),
    broadcastReaction: vi.fn(),
    refetch: vi.fn(),
  }),
}));

// Mock useNavigate from react-router
const mockNavigate = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('DrawRoom Page Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock values
    mockUserState.user = { id: 'user-123', email: 'host@example.com' };
    mockUserState.loading = false;
    mockEventState.event = {
      id: 'event-123',
      event_name: 'Test Draw Room Event',
      slug: 'test-slug',
      select_count: 1,
      status: 'active',
      created_by: 'user-123',
      require_viewer_login: false,
      enable_public_link: true,
    };
    mockEventState.items = [
      { id: 'item-1', item_value: 'Item 1', is_selected: false },
      { id: 'item-2', item_value: 'Item 2', is_selected: false },
    ];
    mockEventState.session = null;
    mockEventState.loading = false;
    mockEventState.viewerCount = 3;
  });

  afterEach(() => {
    cleanup();
  });

  it('renders without crashing and displays the event name and candidate entries', () => {
    const { getByText, getByRole, getAllByText } = render(
      <MemoryRouter>
        <DrawRoom />
      </MemoryRouter>
    );

    expect(getByRole('heading', { name: 'Test Draw Room Event' })).toBeDefined();
    expect(getByText(/Invite Code/i)).toBeDefined();
    expect(getAllByText('Item 1').length).toBeGreaterThan(0);
    expect(getAllByText('Item 2').length).toBeGreaterThan(0);
  });

  it('redirects to login if event is private and user is not authenticated', () => {
    // Override user to be unauthenticated (null)
    mockUserState.user = null;
    // Set event to private
    mockEventState.event.require_viewer_login = true;

    render(
      <MemoryRouter initialEntries={['/draw/test-slug']}>
        <DrawRoom />
      </MemoryRouter>
    );

    // Verify redirection to /login with state
    expect(mockNavigate).toHaveBeenCalledWith('/login', {
      state: { from: '/draw/test-slug' },
    });
  });

  it('does not redirect if event is private but user is authenticated', () => {
    // User is authenticated
    mockUserState.user = { id: 'user-123' };
    // Event is private
    mockEventState.event.require_viewer_login = true;

    const { getByRole } = render(
      <MemoryRouter>
        <DrawRoom />
      </MemoryRouter>
    );

    // Should render page title instead of redirecting
    expect(getByRole('heading', { name: 'Test Draw Room Event' })).toBeDefined();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
