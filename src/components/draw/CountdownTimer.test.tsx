import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, act, waitFor, cleanup } from '@testing-library/react';
import { CountdownTimer } from './CountdownTimer';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('CountdownTimer', () => {
  it('renders a placeholder div when status is not "scheduled" (e.g. active)', async () => {
    vi.useFakeTimers();
    const { container } = render(
      <CountdownTimer
        scheduledStartTime={new Date(Date.now() + 60000).toISOString()}
        status="active"
        onCommenced={vi.fn()}
        isActivating={false}
      />
    );
    await act(async () => { vi.advanceTimersByTime(500); });
    // Non-scheduled status always stays in the blank/ready state
    expect(container.querySelector('.h-14')).toBeTruthy();
  });

  it('renders the HH:MM:SS countdown for a future scheduled time', async () => {
    // Use real timers to let React render and effects settle naturally
    const future = new Date(Date.now() + 3661000).toISOString(); // 1h 1m 1s
    const { getByText } = render(
      <CountdownTimer
        scheduledStartTime={future}
        status="scheduled"
        onCommenced={vi.fn()}
        isActivating={false}
      />
    );
    await waitFor(() => {
      expect(getByText(/\d{2}:\d{2}:\d{2}/)).toBeTruthy();
    }, { timeout: 2000 });
  });

  it('renders "Launching draw..." spinner when isActivating=true and time has passed', async () => {
    const past = new Date(Date.now() - 5000).toISOString();
    const { getByText } = render(
      <CountdownTimer
        scheduledStartTime={past}
        status="scheduled"
        onCommenced={vi.fn()}
        isActivating={true}
      />
    );
    await waitFor(() => {
      expect(getByText('Launching draw...')).toBeTruthy();
    }, { timeout: 2000 });
  });

  it('renders "Draw is ready to commence!" when time expired and not activating', async () => {
    const past = new Date(Date.now() - 5000).toISOString();
    const { getByText } = render(
      <CountdownTimer
        scheduledStartTime={past}
        status="scheduled"
        onCommenced={vi.fn()}
        isActivating={false}
      />
    );
    await waitFor(() => {
      expect(getByText('Draw is ready to commence!')).toBeTruthy();
    }, { timeout: 2000 });
  });

  it('calls onCommenced when the scheduled time is in the past', async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const onCommenced = vi.fn();
    render(
      <CountdownTimer
        scheduledStartTime={past}
        status="scheduled"
        onCommenced={onCommenced}
        isActivating={false}
      />
    );
    await waitFor(() => {
      expect(onCommenced).toHaveBeenCalledTimes(1);
    }, { timeout: 2000 });
  });

  it('does not call onCommenced when status is not "scheduled"', async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const onCommenced = vi.fn();
    render(
      <CountdownTimer
        scheduledStartTime={past}
        status="active"
        onCommenced={onCommenced}
        isActivating={false}
      />
    );
    // Give React enough time to run all effects
    await new Promise(r => setTimeout(r, 200));
    expect(onCommenced).not.toHaveBeenCalled();
  });
});
