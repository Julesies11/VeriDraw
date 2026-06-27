import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { GoLiveModal } from './GoLiveModal';
import type { User } from '@supabase/supabase-js';

const mockUser: User = {
  id: 'user-123',
  email: 'test@example.com',
  aud: 'authenticated',
  created_at: new Date().toISOString(),
  app_metadata: {},
  user_metadata: {},
} as User;

afterEach(() => {
  cleanup();
});

describe('GoLiveModal', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <GoLiveModal isOpen={false} onClose={vi.fn()} user={null} onConfirm={vi.fn()} loading={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders correctly for authenticated user with default fields', () => {
    const { getByText, getByPlaceholderText, getByLabelText } = render(
      <GoLiveModal isOpen={true} onClose={vi.fn()} user={mockUser} onConfirm={vi.fn()} loading={false} />
    );

    expect(getByText('Create Live Event')).toBeTruthy();
    expect(getByPlaceholderText('e.g. Club Volunteer Draw')).toBeTruthy();
    expect(getByText('test@example.com')).toBeTruthy();
    expect(getByLabelText('Schedule for later')).toBeTruthy();
  });

  it('renders guest warning for anonymous users', () => {
    const { getByText } = render(
      <GoLiveModal isOpen={true} onClose={vi.fn()} user={null} onConfirm={vi.fn()} loading={false} />
    );

    expect(getByText('Guest (Sign in required)')).toBeTruthy();
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    const { getByText } = render(
      <GoLiveModal isOpen={true} onClose={onClose} user={mockUser} onConfirm={vi.fn()} loading={false} />
    );

    fireEvent.click(getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onConfirm with correct parameters on form submit', () => {
    const onConfirm = vi.fn();
    const { getByPlaceholderText, getByText } = render(
      <GoLiveModal isOpen={true} onClose={vi.fn()} user={mockUser} onConfirm={onConfirm} loading={false} />
    );

    const input = getByPlaceholderText('e.g. Club Volunteer Draw');
    fireEvent.change(input, { target: { value: 'My Test Event' } });

    // Submit form (default isScheduled = true)
    fireEvent.click(getByText('Continue'));

    expect(onConfirm).toHaveBeenCalledWith(
      'My Test Event',
      false, // requireViewerLogin = false by default
      expect.any(String), // ISO Date String
      'scheduled' // defaults to scheduled since isScheduled defaults to true
    );
  });
});
