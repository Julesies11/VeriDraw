import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { InviteModal } from './InviteModal';

// Stub clipboard — vi.stubGlobal replaces the global navigator.clipboard
// in a way that is compatible with happy-dom's read-only getter.
const clipboardWriteText = vi.fn().mockResolvedValue(undefined);
vi.stubGlobal('navigator', {
  clipboard: { writeText: clipboardWriteText },
});

afterEach(() => {
  cleanup();
  clipboardWriteText.mockClear();
});

describe('InviteModal', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <InviteModal isOpen={false} onClose={vi.fn()} inviteCode="VD-ABC123" />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the modal heading when isOpen is true', () => {
    const { getByText } = render(
      <InviteModal isOpen={true} onClose={vi.fn()} inviteCode="VD-ABC123" />
    );
    expect(getByText('Invite Spectators')).toBeTruthy();
  });

  it('displays the invite code in the code display area', () => {
    const { container } = render(
      <InviteModal isOpen={true} onClose={vi.fn()} inviteCode="VD-ABC123" />
    );
    const codeSpan = container.querySelector('[aria-label="Copy Invite Code"]');
    expect(codeSpan?.textContent?.trim()).toBe('VD-ABC123');
  });

  it('calls onClose when the close (✕) button is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <InviteModal isOpen={true} onClose={onClose} inviteCode="VD-ABC123" />
    );
    const closeBtn = container.querySelector('[aria-label="Close invite modal"]') as HTMLElement;
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('copies the invite code to clipboard when the copy-code button is clicked', () => {
    const { container } = render(
      <InviteModal isOpen={true} onClose={vi.fn()} inviteCode="VD-ABC123" />
    );
    const btn = container.querySelector('[aria-label="Copy Invite Code"]') as HTMLElement;
    fireEvent.click(btn);
    expect(clipboardWriteText).toHaveBeenCalledWith('VD-ABC123');
  });

  it('copies the direct link to clipboard when the copy-link button is clicked', () => {
    const { container } = render(
      <InviteModal isOpen={true} onClose={vi.fn()} inviteCode="VD-ABC123" />
    );
    const btn = container.querySelector('[aria-label="Copy Direct Invite Link"]') as HTMLElement;
    fireEvent.click(btn);
    expect(clipboardWriteText).toHaveBeenCalledWith(
      expect.stringContaining('/join/VD-ABC123')
    );
  });

  it('displays the correct URL in the read-only direct-link input', () => {
    const { container } = render(
      <InviteModal isOpen={true} onClose={vi.fn()} inviteCode="VD-XYZ789" />
    );
    const input = container.querySelector('input[readonly]') as HTMLInputElement;
    expect(input.value).toMatch(/\/join\/vd-xyz789/i);
  });
});
