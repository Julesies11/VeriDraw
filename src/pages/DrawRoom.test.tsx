/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
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

// Stub clipboard for copy-link tests
const clipboardWriteText = vi.fn().mockResolvedValue(undefined);
vi.stubGlobal('navigator', {
  clipboard: { writeText: clipboardWriteText },
});

describe('DrawRoom Page Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock values — use a realistic full slug for share-link tests
    mockUserState.user = { id: 'user-123', email: 'host@example.com' };
    mockUserState.loading = false;
    mockEventState.event = {
      id: 'event-123',
      event_name: 'Test Draw Room Event',
      slug: 'test-draw-room-event-njrc0l',
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
    mockUserState.user = null;
    mockEventState.event.require_viewer_login = true;

    render(
      <MemoryRouter initialEntries={['/draw/test-draw-room-event-njrc0l']}>
        <DrawRoom />
      </MemoryRouter>
    );

    expect(mockNavigate).toHaveBeenCalledWith('/login', {
      state: { from: '/draw/test-draw-room-event-njrc0l' },
    });
  });

  it('does not redirect if event is private but user is authenticated', () => {
    mockUserState.user = { id: 'user-123' };
    mockEventState.event.require_viewer_login = true;

    const { getByRole } = render(
      <MemoryRouter>
        <DrawRoom />
      </MemoryRouter>
    );

    expect(getByRole('heading', { name: 'Test Draw Room Event' })).toBeDefined();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // ---
  // Share-link behaviour tests (Bug fix verification)
  // ---

  it('invite code badge displays the 6-char suffix extracted from the slug', () => {
    // slug = 'test-draw-room-event-njrc0l' → last segment = 'njrc0l' → uppercase 'NJRC0L'
    const { getByText } = render(
      <MemoryRouter>
        <DrawRoom />
      </MemoryRouter>
    );
    expect(getByText(/NJRC0L/i)).toBeDefined();
  });

  it('copy-link button writes the full /draw/<slug> URL to clipboard (not /join/)', () => {
    // The inline copy-link button lives inside the scheduled panel
    mockEventState.event.status = 'scheduled';
    mockEventState.event.scheduled_start_time = new Date(Date.now() + 3600000).toISOString();

    const { container } = render(
      <MemoryRouter>
        <DrawRoom />
      </MemoryRouter>
    );

    const copyLinkBtn = container.querySelector(
      '[aria-label="Copy Direct Invite Link"]'
    ) as HTMLElement;
    expect(copyLinkBtn).not.toBeNull();
    fireEvent.click(copyLinkBtn);

    expect(clipboardWriteText).toHaveBeenCalledWith(
      expect.stringContaining('/draw/test-draw-room-event-njrc0l')
    );
    const writtenValue: string = clipboardWriteText.mock.calls[0][0];
    expect(writtenValue).not.toContain('/join/');
  });

  it('share link read-only input shows the full /draw/<slug> URL', () => {
    // The read-only input lives inside the scheduled panel
    mockEventState.event.status = 'scheduled';
    mockEventState.event.scheduled_start_time = new Date(Date.now() + 3600000).toISOString();

    const { container } = render(
      <MemoryRouter>
        <DrawRoom />
      </MemoryRouter>
    );

    const input = container.querySelector('input[readonly]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toContain('/draw/test-draw-room-event-njrc0l');
    expect(input.value).not.toContain('/join/');
  });
});
