import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Link } from 'react-router';
import { ScrollToTop } from './ScrollToTop';

describe('ScrollToTop Component', () => {
  let scrollIntoViewMock: ReturnType<typeof vi.fn>;
  let scrollToMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Clean up any leftover main elements from previous tests to ensure isolation
    document.querySelectorAll('main').forEach((el) => el.remove());

    scrollIntoViewMock = vi.fn();
    scrollToMock = vi.fn();

    // Stub Element.prototype.scrollIntoView and window.scrollTo
    Element.prototype.scrollIntoView = scrollIntoViewMock as any;
    window.scrollTo = scrollToMock as any;
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  it('scrolls the main element into view when path changes', async () => {
    // Set up dummy DOM for main element
    const main = document.createElement('main');
    document.body.appendChild(main);

    const { getByText } = render(
      <MemoryRouter initialEntries={['/']}>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<Link to="/about">Go to About</Link>} />
          <Route path="/about" element={<div>About Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    // ScrollToTop runs useEffect on mount
    expect(scrollIntoViewMock).toHaveBeenCalled();

    scrollIntoViewMock.mockClear();

    // Click link to go to /about
    getByText('Go to About').click();

    // Wait for the path change and scroll effect to run
    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalled();
    });

    // Clean up
    main.remove();
  });

  it('falls back to window.scrollTo if main element is not present', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<div>Home Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(scrollToMock).toHaveBeenCalledWith(0, 0);
  });
});
