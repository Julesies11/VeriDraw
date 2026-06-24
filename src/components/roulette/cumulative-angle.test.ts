import { describe, it, expect } from 'vitest';

/**
 * Replicates the cumulative angle formula used in the Edge Functions.
 */
function calculateCumulativeAngle(lastAngle: number, targetBaseAngle: number, minRevolutions: number = 5): number {
  const minDegrees = minRevolutions * 360;
  const K = Math.ceil((lastAngle + minDegrees - targetBaseAngle) / 360);
  return 360 * K + targetBaseAngle;
}

describe('Cumulative Angle Calculation formula unit tests', () => {
  it('adds at least 5 revolutions (1800 degrees) when starting from 0', () => {
    const angle = calculateCumulativeAngle(0, 150);
    expect(angle).toBe(1950); // 360 * 5 + 150 = 1950
    expect(angle - 0).toBeGreaterThanOrEqual(1800);
    expect(angle % 360).toBe(150);
  });

  it('adds at least 5 revolutions from a previous spin ending at 1895 degrees', () => {
    const angle = calculateCumulativeAngle(1895, 150);
    expect(angle).toBe(3750); // 360 * 10 + 150 = 3750
    expect(angle - 1895).toBeGreaterThanOrEqual(1800);
    expect(angle % 360).toBe(150);
  });

  it('guarantees alignment modulo 360 for any arbitrary base angle', () => {
    const lastAngle = 3750;
    const baseAngles = [0, 45, 90, 180, 270, 359];
    baseAngles.forEach(base => {
      const nextAngle = calculateCumulativeAngle(lastAngle, base);
      expect(nextAngle - lastAngle).toBeGreaterThanOrEqual(1800);
      expect(nextAngle % 360).toBe(base);
    });
  });
});
