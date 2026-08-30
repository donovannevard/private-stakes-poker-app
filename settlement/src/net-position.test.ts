import { describe, expect, it } from 'vitest';
import { computeNetPositions } from './net-position.js';

describe('computeNetPositions', () => {
  it('computes stack minus startingStack per player', () => {
    const roster = [
      { playerId: 'alice', stack: 250 },
      { playerId: 'bob', stack: 150 },
      { playerId: 'carol', stack: 200 },
    ];

    expect(computeNetPositions(roster, 200)).toEqual({ alice: 50, bob: -50, carol: 0 });
  });

  it('returns an empty object for an empty roster', () => {
    expect(computeNetPositions([], 200)).toEqual({});
  });
});
