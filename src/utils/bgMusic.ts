// Adaptive Background Music Player with Custom MP3 Loader and Procedural Lofi Synth Fallback
import { getMuted } from './audioEffects';
import { BGMTrack } from '../types';

let audioCtx: AudioContext | null = null;
let customAudio: HTMLAudioElement | null = null;
let customAudioSource: MediaElementAudioSourceNode | null = null;

// Procedural Synth State
let masterGain: GainNode | null = null;
let currentOscillators: OscillatorNode[] = [];
let padGainNode: GainNode | null = null;
let nextTimeoutId: any = null;
let isPlaying = false;
let bgmVolume = 0.35; // Default volume for BGM (separate from audio muted effects)
let chordIndex = 0;

// High-quality cozy lofi chords (frequencies in Hz)
const CHORDS = [
  // Am9 (A, C, E, B)
  [110.00, 261.63, 329.63, 493.88],
  // Fmaj7 (F, A, C, E)
  [87.31, 110.00, 261.63, 329.63],
  // Cmaj9 (C, G, E, B)
  [65.41, 196.00, 329.63, 493.88],
  // G6 (G, B, D, A)
  [98.00, 246.94, 293.66, 440.00]
];

// Scale notes for procedural sparkling melody strings (A minor pentatonic / modal)
const MELODY_SCALE = [440.00, 493.88, 523.25, 587.33, 659.25, 783.99, 880.00];

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  return audioCtx;
}

// Converts typical Google Drive share links into a direct download / streaming link

export const SHAME_DEFAULT_TRACKS: BGMTrack[] = [
  { id: 'procedural_synth', name: '🎹 Уютный Синт-Пад (Синтезатор)', url: '' },
  { id: 'shame_main_theme', name: '🎵 Главная тема позора (Google Drive)', url: 'https://drive.google.com/file/d/1g-6KtMeNm2SHbg0fWbjIAwhcJRfJzOnD/view?usp=drivesdk' },
  { id: 'local_file', name: '🎵 Локальный music.mp3', url: '/music.mp3' }
];

export function getCustomBGMTracks(): BGMTrack[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('shame_bgm_playlist');
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    return [];
  }
}

export function saveCustomBGMTracks(tracks: BGMTrack[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('shame_bgm_playlist', JSON.stringify(tracks));
}

export function getActiveTrackId(): string {
  if (typeof window === 'undefined') return 'procedural_synth';
  return localStorage.getItem('shame_active_track_id') || 'procedural_synth';
}

export function setActiveTrackId(id: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('shame_active_track_id', id);
  
  // If BGM is playing, stop and restart with the new source track
  if (isPlaying) {
    stopCustomMP3Player();
    stopProceduralBGM();
    isPlaying = false; // reset to allow startBGM
    startBGM();
  }
}

export function convertGoogleDriveUrl(url: string): string {
  if (!url) return '';
  
  // Look for Google Drive file link with ID
  const driveReg1 = /\/file\/d\/([a-zA-Z0-9_-]+)/;
  const driveReg2 = /[?&]id=([a-zA-Z0-9_-]+)/;
  
  let fileId = '';
  const match1 = url.match(driveReg1);
  if (match1 && match1[1]) {
    fileId = match1[1];
  } else {
    const match2 = url.match(driveReg2);
    if (match2 && match2[1]) {
      fileId = match2[1];
    }
  }
  
  if (fileId) {
    // Return direct download web-streamable endpoint
    return `https://docs.google.com/uc?export=download&id=${fileId}`;
  }
  
  return url; // Return as-is if it's not a google drive link
}

export function getBGMUrl(): string {
  // Legacy compatibility
  const activeId = getActiveTrackId();
  if (activeId === 'procedural_synth' || activeId === 'local_file') return '';
  const tracks = getCustomBGMTracks();
  const track = tracks.find(t => t.id === activeId);
  return track ? track.url : '';
}

export function setBGMUrl(url: string) {
  // Legacy compatibility: If URL is set, we add it to the playlist and make active
  if (!url.trim()) return;
  const tracks = getCustomBGMTracks();
  const existing = tracks.find(t => t.url === url.trim());
  if (existing) {
    setActiveTrackId(existing.id);
  } else {
    const newTrack: BGMTrack = {
      id: `track_${Date.now()}`,
      name: `Мой трек ${tracks.length + 1}`,
      url: url.trim()
    };
    const updated = [...tracks, newTrack];
    saveCustomBGMTracks(updated);
    setActiveTrackId(newTrack.id);
  }
}

// Check if a file exists on the server without breaking
async function checkCustomMusicExists(): Promise<boolean> {
  try {
    const res = await fetch('/music.mp3', { method: 'HEAD' });
    return res.ok;
  } catch (err) {
    return false;
  }
}

export function getBGMVolume(): number {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('shame_bgm_volume');
    if (saved) return parseFloat(saved);
  }
  return bgmVolume;
}

export function setBGMVolume(val: number) {
  bgmVolume = val;
  if (typeof window !== 'undefined') {
    localStorage.setItem('shame_bgm_volume', val.toString());
  }
  
  // Update running nodes
  if (customAudio) {
    // If global sound effects are muted, respect that, otherwise scale with master volume
    customAudio.volume = getMuted() ? 0 : val;
  }
  if (masterGain && audioCtx) {
    const targetGain = getMuted() ? 0 : val;
    masterGain.gain.setValueAtTime(targetGain, audioCtx.currentTime);
  }
}

export function isBGMPlayingState(): boolean {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('shame_bgm_playing') === 'true';
  }
  return isPlaying;
}

// Initialization and auto-resume
export async function initBGM() {
  if (typeof window === 'undefined') return;
  const savedState = localStorage.getItem('shame_bgm_playing');
  const savedVol = localStorage.getItem('shame_bgm_volume');
  
  if (savedVol) {
    bgmVolume = parseFloat(savedVol);
  }
  
  if (savedState === 'true') {
    // Attempt auto-start on user gesture
    const tryPlay = async () => {
      await startBGM();
      window.removeEventListener('click', tryPlay);
    };
    window.addEventListener('click', tryPlay, { once: true, passive: true });
  }
}

// Primary start function
export async function startBGM() {
  if (isPlaying) return;
  
  const ctx = getAudioContext();
  if (!ctx) return;
  
  if (ctx.state === 'suspended') {
    await ctx.resume().catch(() => {});
  }
  
  isPlaying = true;
  if (typeof window !== 'undefined') {
    localStorage.setItem('shame_bgm_playing', 'true');
  }

  const activeId = getActiveTrackId();
  if (activeId === 'procedural_synth') {
    startProceduralBGM();
  } else if (activeId === 'local_file') {
    const customExists = await checkCustomMusicExists();
    if (customExists) {
      startCustomMP3Player('/music.mp3');
    } else {
      console.warn("local music.mp3 not loaded, falling back to procedural synth.");
      startProceduralBGM();
    }
  } else {
    // Check if it's one of the default preloaded tracks like shame_main_theme
    const defTrack = SHAME_DEFAULT_TRACKS.find(t => t.id === activeId);
    if (defTrack && defTrack.url) {
      startCustomMP3Player(convertGoogleDriveUrl(defTrack.url));
    } else {
      const tracks = getCustomBGMTracks();
      const track = tracks.find(t => t.id === activeId);
      if (track && track.url) {
        startCustomMP3Player(convertGoogleDriveUrl(track.url));
      } else {
        startProceduralBGM();
      }
    }
  }
}

// 1. MP3 Player track setup
function startCustomMP3Player(url: string = '/music.mp3') {
  if (customAudio) {
    // Check if the source is physically different
    const absoluteCheckUrl = url.startsWith('http') ? url : new URL(url, window.location.href).href;
    if (customAudio.src !== absoluteCheckUrl) {
      stopCustomMP3Player();
    } else {
      customAudio.play().catch(err => {
        console.warn("Autoplay was prevented, waiting for user gesture.", err);
      });
      return;
    }
  }

  customAudio = new Audio(url);
  customAudio.loop = true;
  customAudio.volume = getMuted() ? 0 : bgmVolume;

  customAudio.addEventListener('error', () => {
    console.warn("Error playing target audio URL, falling back to procedural synth.", url);
    stopCustomMP3Player();
    startProceduralBGM();
  });

  const playPromise = customAudio.play();
  if (playPromise !== undefined) {
    playPromise.catch(() => {
      // Autoplay blocker recovery
    });
  }
}

function stopCustomMP3Player() {
  if (customAudio) {
    try {
      customAudio.pause();
    } catch (_) {}
    customAudio = null;
  }
}

// 2. Procedural Lofi Ambient loop synthesizer
function startProceduralBGM() {
  const ctx = getAudioContext();
  if (!ctx) return;

  // Create music master gain
  if (!masterGain) {
    masterGain = ctx.createGain();
    masterGain.connect(ctx.destination);
  }
  
  const targetGainValue = getMuted() ? 0 : bgmVolume;
  masterGain.gain.setValueAtTime(0, ctx.currentTime);
  masterGain.gain.linearRampToValueAtTime(targetGainValue, ctx.currentTime + 0.5);

  // Simple echo/delay effect node for cozy twinkling ambient vibe
  const delayNode = ctx.createDelay();
  delayNode.delayTime.value = 0.6; // 600ms echo
  
  const feedbackNode = ctx.createGain();
  feedbackNode.gain.value = 0.45; // loop volume reduction

  delayNode.connect(feedbackNode);
  feedbackNode.connect(delayNode);
  delayNode.connect(masterGain);

  chordIndex = 0;
  
  function playNextChordCycle() {
    if (!isPlaying || !ctx || !masterGain) return;
    
    const now = ctx.currentTime;
    const chord = CHORDS[chordIndex];
    
    // Lowpass filter to make it soft and cozy
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(320, now); // soft pad warmth

    padGainNode = ctx.createGain();
    padGainNode.gain.setValueAtTime(0, now);
    padGainNode.gain.linearRampToValueAtTime(0.08, now + 1.2); // attack
    padGainNode.gain.setValueAtTime(0.08, now + 3.0);
    padGainNode.gain.linearRampToValueAtTime(0, now + 5.0); // smooth release crossover
    
    padGainNode.connect(filter);
    filter.connect(masterGain);

    // Stop and clear previous notes
    currentOscillators.forEach(o => {
      try { o.stop(now); } catch (_) {}
    });
    currentOscillators = [];

    // Trigger chords
    chord.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      // Mix triangle for sub bass and sine/triangle for higher notes
      osc.type = idx === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      
      osc.connect(padGainNode!);
      osc.start(now);
      currentOscillators.push(osc);
    });

    // Add random light melody twinkle to delay channel
    if (Math.random() > 0.3) {
      triggerTwinkleNote(now + 1.0, chord, delayNode);
    }
    if (Math.random() > 0.4) {
      triggerTwinkleNote(now + 2.5, chord, delayNode);
    }

    chordIndex = (chordIndex + 1) % CHORDS.length;
    nextTimeoutId = setTimeout(playNextChordCycle, 4800); // overlap cycle every 4.8 seconds
  }

  playNextChordCycle();
}

function triggerTwinkleNote(time: number, activeScale: number[], delayNode: DelayNode) {
  const ctx = getAudioContext();
  if (!ctx || !masterGain) return;

  const choiceFreq = MELODY_SCALE[Math.floor(Math.random() * MELODY_SCALE.length)];
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(choiceFreq, time);

  oscGain.gain.setValueAtTime(0, time);
  oscGain.gain.linearRampToValueAtTime(0.04, time + 0.1); // soft pluck hit
  oscGain.gain.linearRampToValueAtTime(0, time + 1.8); // trailing long decay

  osc.connect(oscGain);
  oscGain.connect(masterGain);
  // Send some signal to the echo space layout
  oscGain.connect(delayNode);

  osc.start(time);
  osc.stop(time + 2.0);
}

function stopProceduralBGM() {
  if (nextTimeoutId) {
    clearTimeout(nextTimeoutId);
    nextTimeoutId = null;
  }
  
  const ctx = getAudioContext();
  const now = ctx ? ctx.currentTime : 0;
  
  if (masterGain && ctx) {
    masterGain.gain.setValueAtTime(masterGain.gain.value, now);
    masterGain.gain.linearRampToValueAtTime(0, now + 0.4);
  }

  setTimeout(() => {
    currentOscillators.forEach(osc => {
      try { osc.stop(); } catch (_) {}
    });
    currentOscillators = [];
    if (padGainNode) {
      try { padGainNode.disconnect(); } catch (_) {}
      padGainNode = null;
    }
  }, 450);
}

// Public toggle control
export function toggleBGM() {
  if (isPlaying) {
    stopBGM();
  } else {
    startBGM();
  }
}

// Stop BGM completely
export function stopBGM() {
  isPlaying = false;
  if (typeof window !== 'undefined') {
    localStorage.setItem('shame_bgm_playing', 'false');
  }

  stopCustomMP3Player();
  stopProceduralBGM();
}

// Keep BGM updated when global effect mute toggle happens
export function syncBGMMuteState() {
  const isMuted = getMuted();
  if (customAudio) {
    customAudio.volume = isMuted ? 0 : bgmVolume;
  }
  if (masterGain && audioCtx) {
    const targetVal = isMuted ? 0 : bgmVolume;
    masterGain.gain.setValueAtTime(targetVal, audioCtx.currentTime);
  }
}
