import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { VerifyDraw } from './VerifyDraw';

// Mock eventsApi — VerifyDraw only calls it when slugOrId param is present.
// For the smoke test we render without a param so no API calls are made.
vi.mock('@/api/events', () => ({
  eventsApi: {
    getBySlugOrId: vi.fn().mockResolvedValue(null),
    listItems: vi.fn().mockResolvedValue([]),
  },
}));

// Mock error helpers to prevent Supabase calls in error logging
vi.mock('@/lib/error-helpers', () => ({
  getFriendlyErrorMessage: vi.fn((_err: unknown, fallback: string) => fallback),
  logErrorToDb: vi.fn().mockResolvedValue(undefined),
}));

afterEach(() => {
  cleanup();
});

describe('VerifyDraw Page Smoke Test', () => {
  it('renders the standalone calculator (no slug) without crashing', () => {
    const { getByRole, getByText } = render(
      <MemoryRouter initialEntries={['/verify']}>
        <VerifyDraw />
      </MemoryRouter>
    );

    expect(getByRole('heading', { level: 1 })).toBeDefined();
    expect(getByText('Verifiable Random Draw Console')).toBeDefined();
    // Calculator form is rendered when no event slug is present
    expect(getByText('Verify Seed Calculator')).toBeDefined();
    expect(getByText('Cryptographic Seed')).toBeDefined();
  });

  it('renders the manual verify form with the Compute Verification button', () => {
    const { getByText } = render(
      <MemoryRouter initialEntries={['/verify']}>
        <VerifyDraw />
      </MemoryRouter>
    );
    // Use text match instead of placeholder to avoid HTML entity encoding differences
    expect(getByText('Compute Verification')).toBeDefined();
  });

  it('renders the back navigation link', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/verify']}>
        <VerifyDraw />
      </MemoryRouter>
    );
    // Back arrow link navigates to dashboard when no event is loaded
    const backLink = container.querySelector('a[href="/"]');
    expect(backLink).not.toBeNull();
  });
});
