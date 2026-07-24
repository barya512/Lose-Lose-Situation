// Placeholder audio: short WebAudio beeps. Inverted mapping lives here —
// losing money is rewarding, gaining money is punishing. Real SFX will replace
// these tone(...) calls without changing call sites.
let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

function tone(freq: number, durationMs: number, type: OscillatorType = 'sine', gain = 0.08): void {
  const context = ac();
  if (!context) return;
  const osc = context.createOscillator();
  const g = context.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = gain;
  osc.connect(g).connect(context.destination);
  const now = context.currentTime;
  osc.start(now);
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
  osc.stop(now + durationMs / 1000);
}

export const audio = {
  playClick(): void { tone(440, 60, 'square', 0.05); },
  playSpin(): void { tone(220, 120, 'sawtooth', 0.05); },
  // GOOD outcome (money lost): rising triumphant arpeggio.
  playLossReward(): void {
    tone(523, 90, 'triangle');
    setTimeout(() => tone(659, 90, 'triangle'), 90);
    setTimeout(() => tone(784, 140, 'triangle'), 180);
  },
  // BAD outcome (money gained): descending error buzz.
  playGainPunish(): void {
    tone(200, 160, 'sawtooth', 0.09);
    setTimeout(() => tone(150, 220, 'sawtooth', 0.09), 120);
  },
};
