// Synthesized via the Web Audio API — no audio assets/new dependency needed,
// and it sidesteps needing to source or license any sound files. Every
// function no-ops quietly if AudioContext isn't available (older browsers,
// jsdom in tests) or hasn't been unlocked by a user gesture yet.

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') {
    return null;
  }
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  if (audioContext.state === 'suspended') {
    void audioContext.resume();
  }
  return audioContext;
}

/**
 * A soft, quiet swoosh for folding — filtered noise with the lowpass cutoff
 * sweeping down over its life. That downward sweep (bright to muffled) is
 * what reads as air/motion rather than a percussive hit; a fast linear
 * fade-in avoids a click at the start.
 */
export function playFoldSound(): void {
  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }

  const duration = 0.3;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 0.5;
  filter.frequency.setValueAtTime(2600, ctx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + duration);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.045, ctx.currentTime + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.0005, ctx.currentTime + duration);

  noise.connect(filter).connect(gain).connect(ctx.destination);
  noise.start();
  noise.stop(ctx.currentTime + duration);
}

/** A soft two-note chime — plays once it becomes the player's turn. */
export function playTurnSound(): void {
  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }

  for (const [index, freq] of [660, 880].entries()) {
    const start = ctx.currentTime + index * 0.11;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.1, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);

    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.28);
  }
}
