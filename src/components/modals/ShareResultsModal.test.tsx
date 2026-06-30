import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { ShareResultsModal } from './ShareResultsModal';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('ShareResultsModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    eventName: 'Monthly Raffle',
    eventSlug: 'raffle-slug-123456',
    winners: [{ item_value: 'Alice', selection_order: 1 }],
    totalEntriesCount: 50,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders correctly and matches the updated copy requirements', () => {
    const { getByText } = render(<ShareResultsModal {...defaultProps} />);

    expect(getByText('Share Results')).toBeDefined();
    expect(
      getByText('Share a verified VeriDraw result with your group chats or copy it for records.')
    ).toBeDefined();
    expect(
      getByText('Copy and paste this summary with replay and verification link:')
    ).toBeDefined();
  });

  it('displays singular label "Winner:" when there is exactly 1 winner', () => {
    const { getByRole } = render(<ShareResultsModal {...defaultProps} />);
    const textarea = getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toContain('Winner:\n1. Alice');
    expect(textarea.value).not.toContain('Winners:');
  });

  it('displays plural label "Winners:" when there is more than 1 winner', () => {
    const props = {
      ...defaultProps,
      winners: [
        { item_value: 'Alice', selection_order: 1 },
        { item_value: 'Bob', selection_order: 2 },
      ],
    };
    const { getByRole } = render(<ShareResultsModal {...props} />);
    const textarea = getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toContain('Winners:\n1. Alice\n2. Bob');
    expect(textarea.value).not.toContain('Winner:\n');
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    const { getByLabelText } = render(<ShareResultsModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(getByLabelText('Close share modal'));
    expect(onClose).toHaveBeenCalled();
  });
});
