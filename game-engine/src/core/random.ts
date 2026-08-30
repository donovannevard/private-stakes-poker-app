import { createHash, randomBytes } from 'node:crypto';

/** A fresh, cryptographically secure seed for one round of a game. */
export function generateSeed(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Expands a seed into a reproducible stream of floats in [0, 1). The same seed
 * always produces the same sequence, which is what makes deterministic replay
 * possible even though the seed itself came from a CSPRNG.
 */
export function createDeterministicRng(seed: string): () => number {
  let counter = 0;

  return () => {
    const digest = createHash('sha256').update(seed).update(String(counter++)).digest();

    return digest.readUInt32BE(0) / 0x100000000;
  };
}

/** Fisher-Yates shuffle, driven by the provided RNG. Does not mutate `items`. */
export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const result = [...items];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = result[i]!;
    result[i] = result[j]!;
    result[j] = temp;
  }

  return result;
}
