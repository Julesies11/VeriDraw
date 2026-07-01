import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('PWA Service Worker Registration', () => {
  let registerMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    registerMock = vi.fn().mockResolvedValue({ scope: '/' });

    // Mock navigator.serviceWorker
    vi.stubGlobal('navigator', {
      serviceWorker: {
        register: registerMock,
      },
    });

    // Mock window.addEventListener
    vi.stubGlobal('window', {
      addEventListener: vi.fn((event: string, callback: () => void) => {
        if (event === 'load') {
          callback();
        }
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('attempts to register the service worker when env is PROD', () => {
    const registerServiceWorker = (isProd: boolean) => {
      if ('serviceWorker' in navigator && isProd) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('/sw.js')
            .catch(() => {});
        });
      }
    };

    registerServiceWorker(true);
    expect(window.addEventListener).toHaveBeenCalledWith('load', expect.any(Function));
    expect(registerMock).toHaveBeenCalledWith('/sw.js');
  });

  it('does not register the service worker when env is not PROD', () => {
    const registerServiceWorker = (isProd: boolean) => {
      if ('serviceWorker' in navigator && isProd) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('/sw.js')
            .catch(() => {});
        });
      }
    };

    registerServiceWorker(false);
    expect(registerMock).not.toHaveBeenCalled();
  });
});
