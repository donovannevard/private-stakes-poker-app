import { describe, expect, it } from 'vitest';
import { positionLooseness } from './position.js';

describe('positionLooseness', () => {
  it('is loosest for the button in a 6-max table', () => {
    expect(positionLooseness(0, 0, 6)).toBe(1);
  });

  it('is tightest for the seat right after the button in a 6-max table', () => {
    expect(positionLooseness(1, 0, 6)).toBe(0);
  });

  it('increases monotonically as a seat gets closer to the button', () => {
    const seat1 = positionLooseness(1, 0, 6); // earliest
    const seat3 = positionLooseness(3, 0, 6); // middle
    const seat5 = positionLooseness(5, 0, 6); // cutoff, right before the button
    expect(seat1).toBeLessThan(seat3);
    expect(seat3).toBeLessThan(seat5);
  });

  it('treats heads-up as wide for both seats, with the button slightly looser', () => {
    const button = positionLooseness(0, 0, 2);
    const other = positionLooseness(1, 0, 2);
    expect(button).toBeGreaterThan(other);
    expect(other).toBeGreaterThan(0.3);
  });
});
