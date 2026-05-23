// Web Audio API Synthesizer for Retro & Satisfying Reaction Sound Effects
// This is 100% self-contained and does not require downloading any external .mp3 assets.

let audioCtx: AudioContext | null = null;
let isMuted = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    // Create audio context on-demand upon first user interaction to bypass browser autoplay policy safely
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(e => console.warn("Failed to resume audio context:", e));
  }
  return audioCtx;
}

// Global listener to unlock audio on first click or touch
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    // Clean up listeners
    window.removeEventListener('click', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
    window.removeEventListener('touchstart', unlockAudio);
  };
  window.addEventListener('click', unlockAudio, { passive: true });
  window.addEventListener('keydown', unlockAudio, { passive: true });
  window.addEventListener('touchstart', unlockAudio, { passive: true });
}

export function setMuted(muted: boolean) {
  isMuted = muted;
  localStorage.setItem('shame_sounds_muted', muted ? 'true' : 'false');
}

export function getMuted(): boolean {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('shame_sounds_muted');
    if (saved === 'true') return true;
  }
  return isMuted;
}

// 🍅 TOMATO SPLAT: A wet squishy impact sound
export function playTomatoSound() {
  if (getMuted()) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // 1. Wet splash noise component (White Noise + Bandpass filter)
    const bufferSize = ctx.sampleRate * 0.15; // 150ms buffer
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noiseNode = ctx.createBufferSource();
    noiseNode.buffer = buffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.Q.setValueAtTime(3.0, now);
    noiseFilter.frequency.setValueAtTime(1000, now);
    // Sweep frequency downwards
    noiseFilter.frequency.setValueAtTime(1000, now);
    noiseFilter.frequency.linearRampToValueAtTime(120, now + 0.12);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.18, now);
    noiseGain.gain.linearRampToValueAtTime(0.01, now + 0.14);

    noiseNode.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    // 2. Heavy squish low frequency pop (Sine sweep)
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.linearRampToValueAtTime(45, now + 0.1);

    oscGain.gain.setValueAtTime(0.25, now);
    oscGain.gain.linearRampToValueAtTime(0.01, now + 0.12);

    osc.connect(oscGain);
    oscGain.connect(ctx.destination);

    // Start & Stop
    noiseNode.start(now);
    noiseNode.stop(now + 0.15);

    osc.start(now);
    osc.stop(now + 0.13);
  } catch (err) {
    console.warn("Error playing tomato sound:", err);
  }
}

// 🤦 FACEPALM: A disappointed slapping clap followed by a descending sigh
export function playFacepalmSound() {
  if (getMuted()) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // 1. The Slap (Very quick white noise burst with highpass filter)
    const slapBufferSize = ctx.sampleRate * 0.08; // 80ms
    const slapBuffer = ctx.createBuffer(1, slapBufferSize, ctx.sampleRate);
    const slapData = slapBuffer.getChannelData(0);
    for (let i = 0; i < slapBufferSize; i++) {
      slapData[i] = Math.random() * 2 - 1;
    }

    const slapSource = ctx.createBufferSource();
    slapSource.buffer = slapBuffer;

    const slapFilter = ctx.createBiquadFilter();
    slapFilter.type = 'highpass';
    slapFilter.frequency.setValueAtTime(1200, now);

    const slapGain = ctx.createGain();
    slapGain.gain.setValueAtTime(0.15, now);
    slapGain.gain.linearRampToValueAtTime(0.01, now + 0.07);

    slapSource.connect(slapFilter);
    slapFilter.connect(slapGain);
    slapGain.connect(ctx.destination);

    // 2. Disappointed "Mdaa" chord (Two detuned triangle wave oscillators sliding down)
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const groupGain = ctx.createGain();

    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(290, now + 0.04);
    osc1.frequency.linearRampToValueAtTime(140, now + 0.35);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(285, now + 0.04);
    osc2.frequency.linearRampToValueAtTime(138, now + 0.35);

    groupGain.gain.setValueAtTime(0, now);
    // Soft fade in for the vocal sigh tone
    groupGain.gain.linearRampToValueAtTime(0.2, now + 0.08);
    groupGain.gain.linearRampToValueAtTime(0.01, now + 0.38);

    // A lowpass to make it warm/muffled
    const bodyFilter = ctx.createBiquadFilter();
    bodyFilter.type = 'lowpass';
    bodyFilter.frequency.setValueAtTime(450, now);

    osc1.connect(bodyFilter);
    osc2.connect(bodyFilter);
    bodyFilter.connect(groupGain);
    groupGain.connect(ctx.destination);

    slapSource.start(now);
    slapSource.stop(now + 0.08);

    osc1.start(now + 0.04);
    osc2.start(now + 0.04);
    osc1.stop(now + 0.4);
    osc2.stop(now + 0.4);
  } catch (err) {
    console.warn("Error playing facepalm sound:", err);
  }
}

// 🥾 KICK (forgiven): A dramatic heavy boot kick impact! 
// Includes a low pitched whoosh (swing) and a high-impact bass thud
export function playKickSound() {
  if (getMuted()) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // 1. Whoosh/Swing (quick high-to-low sweep before impact)
    const whoosh = ctx.createOscillator();
    const whooshGain = ctx.createGain();

    whoosh.type = 'triangle';
    whoosh.frequency.setValueAtTime(180, now);
    whoosh.frequency.linearRampToValueAtTime(60, now + 0.08);

    whooshGain.gain.setValueAtTime(0.12, now);
    whooshGain.gain.linearRampToValueAtTime(0.01, now + 0.08);

    whoosh.connect(whooshGain);
    whooshGain.connect(ctx.destination);

    // 2. High-impact heavy boot contact (White noise pop)
    const bumpBufferSize = ctx.sampleRate * 0.12; 
    const bumpBuffer = ctx.createBuffer(1, bumpBufferSize, ctx.sampleRate);
    const bumpData = bumpBuffer.getChannelData(0);
    for (let i = 0; i < bumpBufferSize; i++) {
      bumpData[i] = Math.random() * 2 - 1;
    }

    const bumpSource = ctx.createBufferSource();
    bumpSource.buffer = bumpBuffer;

    const bumpFilter = ctx.createBiquadFilter();
    bumpFilter.type = 'lowpass';
    bumpFilter.frequency.setValueAtTime(180, now + 0.05); // low-pass filtered noise to simulate thud

    const bumpGain = ctx.createGain();
    bumpGain.gain.setValueAtTime(0, now);
    bumpGain.gain.setValueAtTime(0.35, now + 0.05); // sudden peak on impact
    bumpGain.gain.linearRampToValueAtTime(0.01, now + 0.15);

    bumpSource.connect(bumpFilter);
    bumpFilter.connect(bumpGain);
    bumpGain.connect(ctx.destination);

    // 3. Heavy Sub-Bass punch at impact time
    const bassNode = ctx.createOscillator();
    const bassGain = ctx.createGain();

    bassNode.type = 'sine';
    bassNode.frequency.setValueAtTime(110, now + 0.05);
    bassNode.frequency.linearRampToValueAtTime(35, now + 0.22);

    bassGain.gain.setValueAtTime(0, now);
    bassGain.gain.setValueAtTime(0.45, now + 0.05); // boom!
    bassGain.gain.linearRampToValueAtTime(0.005, now + 0.22);

    bassNode.connect(bassGain);
    bassGain.connect(ctx.destination);

    // Trigger sequences
    whoosh.start(now);
    whoosh.stop(now + 0.08);

    bumpSource.start(now + 0.05);
    bumpSource.stop(now + 0.22);

    bassNode.start(now + 0.05);
    bassNode.stop(now + 0.22);
  } catch (err) {
    console.warn("Error playing kick sound:", err);
  }
}
