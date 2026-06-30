import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { audioManager } from './audio';

describe('AudioManager Unit Tests', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('correctly sets and gets the muted state', () => {
    audioManager.setMuted(true);
    expect(audioManager.isMuted()).toBe(true);
    expect(localStorage.setItem).toHaveBeenCalledWith('vd_muted', 'true');

    audioManager.setMuted(false);
    expect(audioManager.isMuted()).toBe(false);
    expect(localStorage.setItem).toHaveBeenCalledWith('vd_muted', 'false');
  });

  it('runs playTick without crashing when AudioContext is not mocked', () => {
    // Should run smoothly and bypass/warn without crashing
    expect(() => audioManager.playTick(0.5)).not.toThrow();
  });

  it('runs playWin without crashing when AudioContext is not mocked', () => {
    // Should run smoothly and bypass/warn without crashing
    expect(() => audioManager.playWin()).not.toThrow();
  });
});
