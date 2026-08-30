import { describe, expect, it } from 'vitest';
import { createDeterministicRng, generateSeed, shuffle } from './random.js';

describe('generateSeed', () => {
  it('produces distinct, non-trivial seeds', () => {
    const seeds = new Set(Array.from({ length: 50 }, () => generateSeed()));
    expect(seeds.size).toBe(50);
    for (const seed of seeds) {
      expect(seed).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe('createDeterministicRng', () => {
  it('produces the same sequence for the same seed', () => {
    const seed = 'fixed-seed-for-test';
    const first = createDeterministicRng(seed);
    const second = createDeterministicRng(seed);

    const firstValues = Array.from({ length: 20 }, () => first());
    const secondValues = Array.from({ length: 20 }, () => second());

    expect(firstValues).toEqual(secondValues);
  });

  it('produces different sequences for different seeds', () => {
    const a = createDeterministicRng('seed-a');
    const b = createDeterministicRng('seed-b');

    const aValues = Array.from({ length: 10 }, () => a());
    const bValues = Array.from({ length: 10 }, () => b());

    expect(aValues).not.toEqual(bValues);
  });

  it('produces values within [0, 1)', () => {
    const rng = createDeterministicRng('range-check');
    for (let i = 0; i < 100; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('shuffle', () => {
  it('returns a permutation of the input without mutating it', () => {
    const original = [1, 2, 3, 4, 5, 6, 7, 8];
    const copy = [...original];
    const rng = createDeterministicRng('shuffle-seed');

    const shuffled = shuffle(original, rng);

    expect(original).toEqual(copy);
    expect(shuffled).toHaveLength(original.length);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(original);
  });

  it('is deterministic given the same seed', () => {
    const items = Array.from({ length: 52 }, (_, i) => i);

    const shuffledA = shuffle(items, createDeterministicRng('deck-seed'));
    const shuffledB = shuffle(items, createDeterministicRng('deck-seed'));

    expect(shuffledA).toEqual(shuffledB);
  });

  it('actually reorders elements for a typical seed', () => {
    const items = Array.from({ length: 52 }, (_, i) => i);
    const shuffled = shuffle(items, createDeterministicRng('reorder-seed'));

    expect(shuffled).not.toEqual(items);
  });
});
