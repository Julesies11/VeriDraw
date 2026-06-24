import { describe, it, expect, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { createRef } from 'react';
import { ReactionsOverlay, type ReactionsOverlayRef } from './ReactionsOverlay';

describe('ReactionsOverlay', () => {
  it('renders an empty overlay container initially (no visible emoji spans)', () => {
    const ref = createRef<ReactionsOverlayRef>();
    const { container } = render(<ReactionsOverlay ref={ref} />);

    // The outer div should be present
    const overlay = container.firstChild as HTMLElement;
    expect(overlay).toBeTruthy();
    // No reaction spans at rest
    expect(overlay.querySelectorAll('span').length).toBe(0);
  });

  it('displays an emoji span when triggerReaction is called', async () => {
    vi.useFakeTimers();
    const ref = createRef<ReactionsOverlayRef>();
    const { container } = render(<ReactionsOverlay ref={ref} />);

    await act(async () => {
      ref.current?.triggerReaction('fair');
    });

    const spans = container.querySelectorAll('span');
    expect(spans.length).toBe(1);
    expect(spans[0].textContent).toBe('👍');
    vi.useRealTimers();
  });

  it('maps "exciting" to 🎉 and "verify" to 🔍', async () => {
    vi.useFakeTimers();
    const ref = createRef<ReactionsOverlayRef>();
    const { container } = render(<ReactionsOverlay ref={ref} />);

    await act(async () => {
      ref.current?.triggerReaction('exciting');
      ref.current?.triggerReaction('verify');
    });

    const spans = container.querySelectorAll('span');
    const texts = Array.from(spans).map(s => s.textContent);
    expect(texts).toContain('🎉');
    expect(texts).toContain('🔍');
    vi.useRealTimers();
  });

  it('auto-removes a reaction after 2 seconds', async () => {
    vi.useFakeTimers();
    const ref = createRef<ReactionsOverlayRef>();
    const { container } = render(<ReactionsOverlay ref={ref} />);

    await act(async () => {
      ref.current?.triggerReaction('fair');
    });

    // Reaction should be visible immediately
    expect(container.querySelectorAll('span').length).toBe(1);

    // Advance past the 2s auto-remove timeout
    await act(async () => { vi.advanceTimersByTime(2100); });

    expect(container.querySelectorAll('span').length).toBe(0);
    vi.useRealTimers();
  });

  it('can display multiple concurrent reactions', async () => {
    vi.useFakeTimers();
    const ref = createRef<ReactionsOverlayRef>();
    const { container } = render(<ReactionsOverlay ref={ref} />);

    await act(async () => {
      ref.current?.triggerReaction('fair');
      ref.current?.triggerReaction('exciting');
      ref.current?.triggerReaction('verify');
    });

    expect(container.querySelectorAll('span').length).toBe(3);
    vi.useRealTimers();
  });

  it('is pointer-events-none so it does not block UI interaction', () => {
    const ref = createRef<ReactionsOverlayRef>();
    const { container } = render(<ReactionsOverlay ref={ref} />);
    const overlay = container.firstChild as HTMLElement;
    expect(overlay.className).toContain('pointer-events-none');
  });
});
