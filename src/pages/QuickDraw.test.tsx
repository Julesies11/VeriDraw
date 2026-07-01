import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QuickDraw } from './QuickDraw';

beforeEach(() => {
  if (typeof window !== 'undefined') {
    window.scrollTo = vi.fn() as any;
  }
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

// Mock useAuth
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
  }),
}));

// Mock canvas-confetti
vi.mock('canvas-confetti', () => ({
  default: vi.fn(),
}));

describe('QuickDraw Page Smoke Test', () => {
  it('renders without crashing', () => {
    const { getByText, getByRole } = render(
      <MemoryRouter>
        <QuickDraw />
      </MemoryRouter>
    );

    expect(getByRole('heading', { name: 'Quick Draw' })).toBeDefined();
    expect(getByRole('heading', { name: '1. Add entries' })).toBeDefined();
    expect(getByText('Enter List')).toBeDefined();
  });

  it('opens the Go Live Modal when clicking Go Live & Invite Viewers with valid entries', () => {
    const { getByText, container } = render(
      <MemoryRouter>
        <QuickDraw />
      </MemoryRouter>
    );

    // Verify Step 1 combined setup sections are rendered
    expect(getByText('1. Add entries')).toBeTruthy();
    expect(getByText('2. Draw Settings')).toBeTruthy();

    // Enter entries into input textarea
    const textarea = container.querySelector('textarea');
    expect(textarea).toBeTruthy();
    fireEvent.change(textarea!, { target: { value: "Entry 1\nEntry 2" } });

    // Click Go Live Instead
    const goLiveBtn = getByText('Go Live Instead');
    fireEvent.click(goLiveBtn);

    // Verify modal header is rendered
    expect(getByText('Create Live Event')).toBeTruthy();
  });

  it('renders the mobile sticky action bar on Step 1', () => {
    const { container } = render(
      <MemoryRouter>
        <QuickDraw />
      </MemoryRouter>
    );

    // Verify presence of mobile sticky bar wrapper
    const stickyBar = container.querySelector('.fixed.bottom-0');
    expect(stickyBar).toBeTruthy();
    expect(stickyBar?.textContent).toContain('Go Live');
    expect(stickyBar?.textContent).toContain('Continue');
  });
});
