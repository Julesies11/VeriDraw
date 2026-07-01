import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { CreateEvent } from './CreateEvent';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

// Mock useAuth
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'test-user-123', email: 'test@example.com' },
    loading: false,
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
    isDirty: true,
    formDiff: [],
  }),
}));

describe('CreateEvent Page Smoke Test', () => {
  it('renders without crashing and displays headers', () => {
    const { container } = render(
      <MemoryRouter>
        <CreateEvent />
      </MemoryRouter>
    );

    expect(within(container).getByRole('heading', { name: 'Create Live Event' })).toBeDefined();
    expect(within(container).getByText('1. Event Details')).toBeDefined();
    expect(within(container).getByText('2. Entries')).toBeDefined();
    expect(within(container).getByText('3. Privacy Settings')).toBeDefined();
  });

  it('pre-populates the start time field', () => {
    const { container } = render(
      <MemoryRouter>
        <CreateEvent />
      </MemoryRouter>
    );

    const timeInput = within(container).getByLabelText('When should the draw begin? *') as HTMLInputElement;
    expect(timeInput.value).not.toBe('');
  });

  it('shows error if select_count is blank on submit', async () => {
    const { container } = render(
      <MemoryRouter>
        <CreateEvent />
      </MemoryRouter>
    );

    const nameInput = within(container).getByLabelText('Event Name *');
    fireEvent.change(nameInput, { target: { value: 'Test Event Name' } });

    // Populate entries to bypass the empty entries validation
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea).toBeDefined();
    fireEvent.change(textarea, { target: { value: 'Alice\nBob' } });

    const selectCountInput = within(container).getByLabelText('Number of Winners *');
    fireEvent.change(selectCountInput, { target: { value: '' } });

    const submitButton = within(container).getByText('Create Event');
    fireEvent.click(submitButton);

    const errorMsg = await within(container).findByText(/number of winners/i);
    expect(errorMsg).toBeDefined();
  });

  it('renders responsive mobile sticky bottom action bar', () => {
    const { container } = render(
      <MemoryRouter>
        <CreateEvent />
      </MemoryRouter>
    );

    // Verify presence of mobile sticky bar wrapper
    const stickyBar = container.querySelector('.fixed.bottom-0');
    expect(stickyBar).toBeTruthy();
    expect(within(stickyBar as HTMLElement).getByText('Cancel')).toBeTruthy();
    expect(within(stickyBar as HTMLElement).getByText('Create Event')).toBeTruthy();
  });
});
