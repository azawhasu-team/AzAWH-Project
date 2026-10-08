import { describe, it, expect } from 'vitest';
import { createEnergyJumpTracker } from './energyJumps';

const MIN = 60_000;

describe('createEnergyJumpTracker', () => {
  it('drops a sharp rise after a flat stretch but keeps energy after it', () => {
    const step = createEnergyJumpTracker();
    const out = [
      [10, 0], [10, 5], [10, 12], // flat for 12 min
      [14, 13],                   // +4 kWh in 1 min: jump
      [14.02, 14], [14.04, 15],   // normal consumption resumes
    ].map(([e, m]) => step(e, m * MIN));
    expect(out[3].isJump).toBe(true);
    expect(out[3].increment).toBe(0);
    expect(out[3].adjusted).toBe(10);
    expect(out[4].increment).toBeCloseTo(0.02);
    expect(out[5].adjusted).toBeCloseTo(10.04);
  });

  it('does not treat a normal step or a rise without a flat stretch as a jump', () => {
    const step = createEnergyJumpTracker();
    step(10, 0);
    expect(step(10.02, MIN).isJump).toBe(false);
    expect(step(15, 2 * MIN).isJump).toBe(false); // sharp, but not preceded by a flat stretch
  });
});
