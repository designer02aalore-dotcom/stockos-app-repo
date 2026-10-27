/**
 * Synthesize a clean, pleasant notification chime using the Web Audio API.
 * No external sound files or network requests required.
 */
export function playOrderDetectedChime() {
  if (typeof window === "undefined") return;

  try {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // First note: C5 (523.25 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(523.25, now);

    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.exponentialRampToValueAtTime(0.2, now + 0.05);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.4);

    // Second note: G5 (783.99 Hz) for an uplifting, confirmed sound
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(783.99, now + 0.12);

    gain2.gain.setValueAtTime(0.001, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.25, now + 0.18);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc2.start(now + 0.12);
    osc2.stop(now + 0.65);
  } catch (err) {
    // Audio context may be blocked by autoplay policies until user gesture
    console.debug("[AudioChime] Audio blocked or unavailable:", err);
  }
}
