import { describe, expect, it } from 'vitest';
import { playFoldSound, playTurnSound } from './sound';

describe('sound', () => {
  it('does not throw when AudioContext is unavailable (e.g. jsdom in tests)', () => {
    expect(typeof window.AudioContext).toBe('undefined');
    expect(() => playFoldSound()).not.toThrow();
    expect(() => playTurnSound()).not.toThrow();
  });
});
