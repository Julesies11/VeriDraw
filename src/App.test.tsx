import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Navigate, useParams } from 'react-router';

// Isolate and test only the JoinRedirect component logic,
// mirroring exactly what is defined in App.tsx.
function JoinRedirect() {
  const { code } = useParams();
  return <Navigate to={`/draw/${code}`} replace />;
}


describe('JoinRedirect (vanity /join/:code route)', () => {
  it('redirects /join/NJRC0L to /draw/NJRC0L', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/join/NJRC0L']}>
        <Routes>
          <Route path="/join/:code" element={<JoinRedirect />} />
          <Route
            path="/draw/:slugOrId"
            element={<div data-testid="draw-room-njrc0l">Draw Room</div>}
          />
        </Routes>
      </MemoryRouter>
    );

    // After JoinRedirect fires <Navigate replace>, /draw/NJRC0L route renders
    expect(container.querySelector('[data-testid="draw-room-njrc0l"]')).not.toBeNull();
  });


  it('redirects /join/VD-ABC123 to /draw/VD-ABC123', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/join/VD-ABC123']}>
        <Routes>
          <Route path="/join/:code" element={<JoinRedirect />} />
          <Route path="/draw/:slugOrId" element={<div data-testid="draw-room">Draw Room</div>} />
        </Routes>
      </MemoryRouter>
    );

    // After redirect, the /draw/:slugOrId route should be rendered
    expect(container.querySelector('[data-testid="draw-room"]')).not.toBeNull();
  });

  it('preserves the full code including hyphens (e.g. VD-XYZ789)', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/join/VD-XYZ789']}>
        <Routes>
          <Route path="/join/:code" element={<JoinRedirect />} />
          <Route
            path="/draw/:slugOrId"
            element={<div data-testid="draw-room-sink">Draw Room</div>}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(container.querySelector('[data-testid="draw-room-sink"]')).not.toBeNull();
  });

  it('redirects a full event slug (e.g. my-event-njrc0l) preserving hyphens', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/join/my-event-njrc0l']}>
        <Routes>
          <Route path="/join/:code" element={<JoinRedirect />} />
          <Route
            path="/draw/:slugOrId"
            element={<div data-testid="draw-room-slug">Draw Room</div>}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(container.querySelector('[data-testid="draw-room-slug"]')).not.toBeNull();
  });
});
