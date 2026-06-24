import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CreateEvent } from './CreateEvent';

// Mock useAuth
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'test-user-123', email: 'test@example.com' },
  }),
}));

// Mock the eventsApi
vi.mock('@/api/events', () => ({
  eventsApi: {
    create: vi.fn(),
  },
}));

// Mock useDirtyTracker
vi.mock('@/hooks/useDirtyTracker', () => ({
  useDirtyTracker: () => ({
    isDirty: false,
    formDiff: [],
  }),
}));

describe('CreateEvent Page Smoke Test', () => {
  it('renders without crashing and displays headers', () => {
    const { getByText, getByRole } = render(
      <MemoryRouter>
        <CreateEvent />
      </MemoryRouter>
    );

    expect(getByRole('heading', { name: 'Configure Selection Event' })).toBeDefined();
    expect(getByText('1. Event Parameters')).toBeDefined();
    expect(getByText('2. Candidate Entries')).toBeDefined();
  });
});
