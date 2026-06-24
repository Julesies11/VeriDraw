import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import { RouletteWheel } from './RouletteWheel';

beforeAll(() => {
  // Mock window.AudioContext
  vi.stubGlobal('AudioContext', vi.fn().mockImplementation(() => ({
    createOscillator: vi.fn().mockReturnValue({
      connect: vi.fn(),
      frequency: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      start: vi.fn(),
      stop: vi.fn(),
    }),
    createGain: vi.fn().mockReturnValue({
      connect: vi.fn(),
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
    }),
    destination: {},
    currentTime: 0,
  })));
});

describe('RouletteWheel Component Unit Test', () => {
  const mockItems = [
    { id: '1', item_value: 'Alice', is_selected: false },
    { id: '2', item_value: 'Bob', is_selected: false },
    { id: '3', item_value: 'Charlie', is_selected: false },
  ];

  it('renders without crashing and lists item text', () => {
    const { getByText } = render(
      <RouletteWheel
        items={mockItems}
        rotationAngle={0}
        isSpinning={false}
        spinDurationMs={3000}
      />
    );

    expect(getByText('Alice')).toBeDefined();
    expect(getByText('Bob')).toBeDefined();
    expect(getByText('Charlie')).toBeDefined();
  });

  it('renders single remaining item differently (as circle)', () => {
    const singleItem = [
      { id: '1', item_value: 'Alice', is_selected: false },
    ];
    
    const { container } = render(
      <RouletteWheel
        items={singleItem}
        rotationAngle={0}
        isSpinning={false}
        spinDurationMs={3000}
      />
    );

    // Should contain a circle element in the SVG representing the single fill
    const circle = container.querySelector('circle');
    expect(circle).not.toBeNull();
  });
});
