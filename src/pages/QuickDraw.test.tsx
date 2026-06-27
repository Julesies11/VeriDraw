import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QuickDraw } from './QuickDraw';

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
    expect(getByRole('heading', { name: 'Add entries' })).toBeDefined();
    expect(getByText('Paste List')).toBeDefined();
  });

  it('opens the Go Live Modal when clicking Go Live button with valid items', () => {
    const { getByText, getAllByText, container } = render(
      <MemoryRouter>
        <QuickDraw />
      </MemoryRouter>
    );

    // Enter entries into input textarea
    const textarea = container.querySelector('textarea');
    expect(textarea).toBeTruthy();
    fireEvent.change(textarea!, { target: { value: "Entry 1\nEntry 2" } });

    // Click Go Live & Invite Viewers button
    const goLiveBtns = getAllByText('Go Live & Invite Viewers');
    const activeBtn = goLiveBtns.find(btn => !btn.hasAttribute('disabled')) || goLiveBtns[0];
    fireEvent.click(activeBtn);

    // Verify modal header is rendered
    expect(getByText('Create Live Event')).toBeTruthy();
  });
});
