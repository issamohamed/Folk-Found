import type { EraId } from '../data/types';
import { zoneFor, type TimbreId, type Zone } from './ambienceZones';

/**
 * Regional ambience: a short instrumental phrase synthesised when a region's
 * panel opens.
 *
 * No audio files, no network calls, no randomness. Every note, envelope and
 * even the reverb impulse is derived from the region's zone, its density in the
 * active era, the era, and a hash of the region code — so the same region in
 * the same era always sounds identical.
 */

/* ---------------------------------------------------------------------------
   Determinism
   ------------------------------------------------------------------------- */

/** Stable string hash (FNV-1a). Seeds a region's melodic choices. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic PRNG (mulberry32), used everywhere Math.random would be,
 *  including the noise buffers. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------------------------------------------------------------------
   Era tint
   ------------------------------------------------------------------------- */

/** What the era does to the sound: the room, not the notes. */
interface EraTint {
  /** Reverb tail, seconds. */
  decay: number;
  /** Share of the voice sent through that reverb, 0..1. */
  wet: number;
  /** Multiplier on the gap between notes. */
  pace: number;
  /** Multiplier on how long each note is held. */
  sustain: number;
  /** Voice lowpass in Hz. Lower reads as further away. */
  brightness: number;
  /** Detune spread between paired oscillators, in cents. */
  detune: number;
}

const ERA_TINT: Record<EraId, EraTint> = {
  ancient: { decay: 3.6, wet: 0.5, pace: 1.22, sustain: 1.35, brightness: 2400, detune: 9 },
  medieval: { decay: 2.6, wet: 0.4, pace: 1.11, sustain: 1.2, brightness: 3000, detune: 7 },
  early_modern: {
    decay: 1.8,
    wet: 0.3,
    pace: 1.0,
    sustain: 1.05,
    brightness: 3800,
    detune: 5,
  },
  modern: { decay: 1.05, wet: 0.18, pace: 0.92, sustain: 0.9, brightness: 5000, detune: 3 },
};

/* ---------------------------------------------------------------------------
   The plan
   ------------------------------------------------------------------------- */

export interface AmbienceRequest {
  code: string;
  era: EraId;
  /** 1..5, from the region's slice for the active era. */
  density: number;
  centroid: readonly [number, number];
}

export interface PlannedNote {
  /** Seconds after the phrase starts. */
  at: number;
  freq: number;
  /** Seconds the note is held before its release. */
  dur: number;
  timbre: TimbreId;
  /** 0..1, relative to the voice's own level. */
  gain: number;
  pan: number;
  /** Which layer produced it. Carried for inspection; unused by the synth. */
  layer: 'lead' | 'harmony' | 'shimmer' | 'pulse' | 'drone';
}

export interface AmbiencePlan {
  code: string;
  era: EraId;
  density: number;
  zone: Zone;
  tint: EraTint;
  /** Seconds per repeat of the phrase. */
  cycle: number;
  /** Repeats before the phrase fades out for good. */
  cycles: number;
  /** One cycle's worth of notes; the engine lays it out `cycles` times. */
  notes: readonly PlannedNote[];
  /** Peak level of the whole voice, before the master gain. */
  level: number;
}

/** Four repeats of a six-to-nine second phrase, then it stops for good. */
const CYCLES = 4;

/** Longest a single note may ring, whatever the era does to it. */
const MAX_NOTE = 5.5;

/** Frequency of a scale step above the root. */
function midiToHz(root: number, semitones: number): number {
  return root * Math.pow(2, semitones / 12);
}

/**
 * Turn a region into a phrase. Pure, and separate from the audio graph so the
 * musical decisions can be checked without a sound card. Seeded by the region
 * code alone, never the era, so a place keeps its shape down the era rail.
 */
export function planAmbience(request: AmbienceRequest): AmbiencePlan {
  const { code, era, centroid } = request;
  const density = Math.min(5, Math.max(1, Math.round(request.density)));
  const zone = zoneFor(code, [centroid[0], centroid[1]]);
  const tint = ERA_TINT[era];
  const rand = seededRandom(hash(code));

  // Longitude places the phrase in the stereo field, at under half width.
  const pan = Math.max(-1, Math.min(1, centroid[1] / 180)) * 0.45;

  // Seeded transposition, so zone-mates are related without being identical.
  const transpose = [0, -3, 2, 5, -5, 7][Math.floor(rand() * 6)] ?? 0;
  const root = midiToHz(zone.root, transpose);

  // Eight degrees are always drawn and density decides how many are used, so
  // the opening notes are the same whether the era slice is a 1 or a 5.
  const degrees: number[] = [];
  const octaves: number[] = [];
  for (let i = 0; i < 8; i++) {
    degrees.push(Math.floor(rand() * zone.scale.length));
    // Mostly the home octave; the first note never lifts.
    octaves.push(i > 0 && rand() > 0.78 ? 12 : 0);
  }
  const gapJitter: number[] = [];
  for (let i = 0; i < 8; i++) gapJitter.push(0.82 + rand() * 0.55);

  const noteCount = 2 + density; // 3 notes at density 1, 7 at density 5
  // Sparse regions are emptier as well as quieter: the gaps stretch.
  const step = 0.86 * zone.pace * tint.pace * (1.55 - density * 0.11);
  const held = Math.min(MAX_NOTE, step * 1.8 * tint.sustain);

  const notes: PlannedNote[] = [];
  let cursor = 0;
  const leadTimes: number[] = [];
  for (let i = 0; i < noteCount; i++) {
    const semitones = zone.scale[degrees[i] % zone.scale.length] + octaves[i];
    leadTimes.push(cursor);
    notes.push({
      at: cursor,
      freq: midiToHz(root, semitones),
      dur: held,
      timbre: zone.lead,
      gain: 1,
      pan,
      layer: 'lead',
    });
    cursor += step * gapJitter[i];
  }

  // The phrase plus room for the last note to ring.
  const cycle = Math.max(5, Math.round((cursor + held * 0.75) * 10) / 10);

  // Each density step adds a voice rather than volume, so the heatmap is
  // audible as thickness.

  // From 2: the held low root.
  if (density >= 2) {
    notes.push({
      at: 0,
      freq: midiToHz(root, -12),
      dur: cycle,
      timbre: 'drone',
      gain: 0.34,
      pan: pan * 0.3,
      layer: 'drone',
    });
  }

  // From 3: the line doubled and delayed, which turns a melody into a texture.
  if (density >= 3) {
    for (let i = 0; i < noteCount; i++) {
      const semitones = zone.scale[degrees[i] % zone.scale.length] + octaves[i];
      notes.push({
        at: leadTimes[i] + step * 0.45,
        freq: midiToHz(root, semitones + (zone.openFifth ? 7 : -12)),
        dur: held * 0.8,
        timbre: zone.harmony,
        gain: 0.42,
        pan: -pan * 0.5,
        layer: 'harmony',
      });
    }
  }

  // From 4: three high notes on beats the lead is not using.
  if (density >= 4) {
    for (let i = 0; i < 3; i++) {
      const at = cycle * (0.22 + i * 0.27);
      const semitones = zone.scale[degrees[(i + 3) % 8] % zone.scale.length] + 24;
      notes.push({
        at,
        freq: midiToHz(root, semitones),
        dur: Math.min(MAX_NOTE, held * 0.7),
        timbre: zone.shimmer,
        gain: 0.24,
        pan: pan * 0.8,
        layer: 'shimmer',
      });
    }
  }

  // From 5 — or 4 in the zone built on it — a soft stroke. A pulse, not a beat.
  const pulseFrom = zone.id === 'sub_saharan_african' ? 4 : 5;
  if (density >= pulseFrom) {
    const strokes = 6;
    for (let i = 0; i < strokes; i++) {
      notes.push({
        at: (cycle / strokes) * i,
        freq: midiToHz(root, -24),
        dur: 0.3,
        timbre: 'pulse',
        gain: i % 3 === 0 ? 0.3 : 0.17,
        pan: -pan * 0.3,
        layer: 'pulse',
      });
    }
  }

  // Denser regions have more voices, so each one is individually quieter.
  const level = 0.62 + density * 0.055;

  return { code, era, density, zone, tint, cycle, cycles: CYCLES, notes, level };
}

/* ---------------------------------------------------------------------------
   The audio graph
   ------------------------------------------------------------------------- */

/** Peak level of the whole feature. Low on purpose. */
const MASTER_LEVEL = 0.13;

const FADE_IN = 0.6;
/** Old voice out while the new one comes in. */
const CROSSFADE = 0.7;
const CLOSE_FADE = 0.9;
/** Web Audio cannot ramp exponentially to zero. */
const SILENT = 0.0001;

/** The one context and the nodes shared by every voice. */
interface Chain {
  ctx: AudioContext;
  master: GainNode;
  /** Deterministic noise, generated once, shared by breaths and strokes. */
  noise: AudioBuffer;
  /** One impulse response per era, built on first use. */
  impulses: Map<EraId, AudioBuffer>;
}

/** One region's phrase while it is sounding. */
interface Voice {
  gain: GainNode;
  sources: AudioScheduledSourceNode[];
  /** Cleanup timer, so a faded voice lets go of its nodes. */
  timer: number;
}

let chain: Chain | null = null;
let current: Voice | null = null;
/** Set when the browser refuses a context; the feature then stays silent
 *  rather than throwing on every click. */
let unavailable = false;

/** Create the context and master chain on first use, or null if unavailable. */
function ensureChain(): Chain | null {
  if (chain) return chain;
  if (unavailable) return null;

  const legacy = window as { webkitAudioContext?: typeof AudioContext };
  const Ctor = window.AudioContext ?? legacy.webkitAudioContext;
  if (!Ctor) {
    unavailable = true;
    return null;
  }

  let ctx: AudioContext;
  try {
    ctx = new Ctor();
  } catch {
    unavailable = true;
    return null;
  }

  const master = ctx.createGain();
  master.gain.value = MASTER_LEVEL;
  // A limiter on the way out. Its real job is the crossfade, where two phrases
  // briefly sound at once and their sum must not clip.
  const guard = ctx.createDynamicsCompressor();
  guard.threshold.value = -18;
  guard.knee.value = 12;
  guard.ratio.value = 6;
  guard.attack.value = 0.008;
  guard.release.value = 0.3;
  master.connect(guard);
  guard.connect(ctx.destination);

  const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
  const data = noise.getChannelData(0);
  const rand = seededRandom(0x5eed1);
  for (let i = 0; i < data.length; i++) data[i] = rand() * 2 - 1;

  chain = { ctx, master, noise, impulses: new Map() };
  return chain;
}

/** The era's reverb: seeded noise under an exponential decay, the two channels
 *  drawn from separate streams so it has width. */
function impulseFor(c: Chain, era: EraId, decay: number): AudioBuffer {
  const cached = c.impulses.get(era);
  if (cached) return cached;

  const length = Math.max(1, Math.floor(c.ctx.sampleRate * decay));
  const buffer = c.ctx.createBuffer(2, length, c.ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const out = buffer.getChannelData(channel);
    const rand = seededRandom(0xa11e + channel * 977);
    for (let i = 0; i < length; i++) {
      out[i] = (rand() * 2 - 1) * Math.pow(1 - i / length, 2.6);
    }
  }
  c.impulses.set(era, buffer);
  return buffer;
}

interface BuiltNote {
  sources: AudioScheduledSourceNode[];
  /** When the last of its sources has been told to stop. */
  until: number;
}

/**
 * One note, as its own small graph of oscillators under an envelope. Each
 * source starts and stops at its own time, so a thirty-second phrase never has
 * more than a few running. The sources come back so a crossfade can cut them.
 */
function buildNote(c: Chain, out: AudioNode, note: PlannedNote, tint: EraTint): BuiltNote {
  const { ctx } = c;
  const t = note.at;
  const until = t + note.dur + 0.1;
  const sources: AudioScheduledSourceNode[] = [];

  const pan = ctx.createStereoPanner();
  pan.pan.value = note.pan;
  pan.connect(out);

  const env = ctx.createGain();
  // The floor must be set now, not at the note's time: an AudioParam holds its
  // default of 1 until its first scheduled point, which would let every
  // oscillator through at full level from the moment it was created.
  env.gain.value = SILENT;
  env.gain.setValueAtTime(SILENT, t);
  env.connect(pan);

  /** An oscillator at this note's time, registered for cleanup. */
  const osc = (type: OscillatorType, freq: number, detune = 0): OscillatorNode => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (detune) o.detune.setValueAtTime(detune, t);
    sources.push(o);
    return o;
  };

  /** A looping read of the shared noise buffer. */
  const noiseSource = (): AudioBufferSourceNode => {
    const n = ctx.createBufferSource();
    n.buffer = c.noise;
    n.loop = true;
    sources.push(n);
    return n;
  };

  /** Struck: instant attack, exponential decay, filter closing over the tail.
   *  Returns the filter to feed oscillators into. */
  const struck = (peak: number, decay: number, bright: number) => {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(12000, note.freq * bright), t);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(160, note.freq * 1.5),
      t + decay,
    );
    filter.connect(env);
    env.gain.linearRampToValueAtTime(peak, t + 0.014);
    env.gain.exponentialRampToValueAtTime(SILENT, t + decay);
    return filter;
  };

  /** Held: swell, plateau, then a release longer than the attack. */
  const held = (peak: number, attack: number) => {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(9000, note.freq * 4.5), t);
    filter.connect(env);
    env.gain.linearRampToValueAtTime(peak, t + attack);
    env.gain.setValueAtTime(peak, t + Math.max(attack, note.dur * 0.55));
    env.gain.exponentialRampToValueAtTime(SILENT, t + note.dur);
    return filter;
  };

  switch (note.timbre) {
    case 'pluck': {
      const filter = struck(note.gain * 0.85, note.dur * 0.8, 7);
      osc('triangle', note.freq).connect(filter);
      const bite = ctx.createGain();
      bite.gain.value = 0.3;
      bite.connect(filter);
      osc('sawtooth', note.freq, tint.detune).connect(bite);
      break;
    }
    case 'mallet': {
      const filter = struck(note.gain * 0.9, note.dur * 0.6, 5);
      osc('sine', note.freq).connect(filter);
      const upper = ctx.createGain();
      upper.gain.value = 0.22;
      upper.connect(filter);
      osc('sine', note.freq * 3.01).connect(upper);
      break;
    }
    case 'bell': {
      // 2.76 and 5.4 are the struck-metal partial ratios.
      const filter = struck(note.gain * 0.7, note.dur, 6);
      osc('sine', note.freq).connect(filter);
      [
        [2.76, 0.34],
        [5.4, 0.16],
      ].forEach(([ratio, level]) => {
        const partial = ctx.createGain();
        partial.gain.value = level;
        partial.connect(filter);
        osc('sine', note.freq * ratio).connect(partial);
      });
      break;
    }
    case 'reed': {
      const filter = held(note.gain * 0.5, note.dur * 0.22);
      filter.frequency.setValueAtTime(Math.min(4200, note.freq * 3.4), t);
      const body = osc('sawtooth', note.freq);
      body.connect(filter);
      // Slow and shallow; any deeper and it stops being a held note.
      const lfo = ctx.createOscillator();
      lfo.frequency.setValueAtTime(4.6, t);
      const depth = ctx.createGain();
      depth.gain.value = 4;
      lfo.connect(depth);
      depth.connect(body.detune);
      sources.push(lfo);
      break;
    }
    case 'bowed': {
      const filter = held(note.gain * 0.42, note.dur * 0.35);
      osc('sawtooth', note.freq, -tint.detune).connect(filter);
      osc('sawtooth', note.freq, tint.detune).connect(filter);
      break;
    }
    case 'air': {
      const filter = held(note.gain * 0.55, note.dur * 0.3);
      osc('sine', note.freq).connect(filter);
      // Noise narrowed to a band around the note, felt rather than heard.
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.setValueAtTime(note.freq * 2, t);
      band.Q.setValueAtTime(6, t);
      const breath = ctx.createGain();
      breath.gain.value = 0.06;
      band.connect(breath);
      breath.connect(filter);
      noiseSource().connect(band);
      break;
    }
    case 'drone': {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(760, t);
      filter.connect(env);
      // The slowest envelope here: the floor arrives under the first notes.
      env.gain.linearRampToValueAtTime(note.gain * 0.5, t + Math.min(2.4, note.dur * 0.4));
      env.gain.setValueAtTime(note.gain * 0.5, t + note.dur * 0.7);
      env.gain.exponentialRampToValueAtTime(SILENT, t + note.dur);
      osc('triangle', note.freq).connect(filter);
      const fifth = ctx.createGain();
      fifth.gain.value = 0.45;
      fifth.connect(filter);
      osc('triangle', note.freq * 1.5).connect(fifth);
      break;
    }
    case 'pulse': {
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.setValueAtTime(320, t);
      band.Q.setValueAtTime(1.2, t);
      band.connect(env);
      env.gain.linearRampToValueAtTime(note.gain * 0.5, t + 0.008);
      env.gain.exponentialRampToValueAtTime(SILENT, t + note.dur);
      noiseSource().connect(band);
      // A little body under the stroke, so it reads as a skin, not a tap.
      const thump = ctx.createGain();
      thump.gain.value = 0.5;
      thump.connect(env);
      osc('sine', note.freq).connect(thump);
      break;
    }
  }

  sources.forEach((source) => {
    source.start(t);
    source.stop(until);
  });

  return { sources, until };
}

/** Fade a voice out and let go of its nodes. */
function release(voice: Voice, ctx: AudioContext, seconds: number): void {
  const now = ctx.currentTime;
  voice.gain.gain.cancelScheduledValues(now);
  // Fade from wherever the voice actually is, so interrupting a fade-in does
  // not jump the level up first.
  voice.gain.gain.setValueAtTime(Math.max(SILENT, voice.gain.gain.value), now);
  voice.gain.gain.exponentialRampToValueAtTime(SILENT, now + seconds);
  window.clearTimeout(voice.timer);
  voice.timer = window.setTimeout(
    () => {
      voice.sources.forEach((source) => {
        try {
          source.stop();
        } catch {
          // Already stopped, which is the ordinary case.
        }
      });
      voice.gain.disconnect();
    },
    (seconds + 0.1) * 1000,
  );
  voice.sources.forEach((source) => {
    try {
      source.stop(now + seconds + 0.05);
    } catch {
      // A source that has already ended refuses a new stop time; harmless.
    }
  });
}

/* ---------------------------------------------------------------------------
   The mute switch
   ------------------------------------------------------------------------- */

/** Held in module scope for as long as the tab lives. No localStorage, per the
 *  project's rule that nothing about a visit is written to disk. */
let muted = false;
const listeners = new Set<() => void>();

/** Whether ambience is currently switched off. */
export function isMuted(): boolean {
  return muted;
}

/** Subscribe to mute changes; returns the unsubscribe function. */
export function subscribeToMute(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Switch ambience on or off, silencing anything playing. */
export function setMuted(next: boolean): void {
  if (muted === next) return;
  muted = next;
  if (muted) stopAmbience();
  listeners.forEach((listener) => listener());
}

/* ---------------------------------------------------------------------------
   Playback
   ------------------------------------------------------------------------- */

/**
 * Start a region's ambience, crossfading out whatever was playing.
 *
 * The context is created here, on first use, which is what satisfies the
 * autoplay policy — this is safe to call from a click handler or from an effect
 * a click caused.
 */
export function playAmbience(request: AmbienceRequest): void {
  // Muted means muted all the way down: no context, no nodes, no work.
  if (muted) return;

  const c = ensureChain();
  if (!c) return;
  const { ctx } = c;

  if (ctx.state === 'suspended') {
    // Rejected only when there has been no user gesture yet, in which case
    // there is nothing to be done.
    void ctx.resume().catch(() => undefined);
  }

  const plan = planAmbience(request);

  if (current) {
    release(current, ctx, CROSSFADE);
    current = null;
  }

  const voice = ctx.createGain();
  voice.gain.value = SILENT;
  voice.gain.setValueAtTime(SILENT, ctx.currentTime);
  voice.connect(c.master);

  // Dry and wet in parallel. The convolver belongs to this voice, so a
  // crossfade between eras does not put one phrase in the other's room.
  const dry = ctx.createGain();
  dry.gain.value = 1 - plan.tint.wet * 0.55;
  dry.connect(voice);

  const send = ctx.createGain();
  send.gain.value = plan.tint.wet;
  const reverb = ctx.createConvolver();
  reverb.buffer = impulseFor(c, plan.era, plan.tint.decay);
  send.connect(reverb);
  reverb.connect(voice);

  // Above the whole voice, so it colours the reverb as well as the notes.
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = plan.tint.brightness;
  tone.connect(dry);
  tone.connect(send);

  const start = ctx.currentTime + 0.02;
  const sources: AudioScheduledSourceNode[] = [];
  let last = start;

  for (let cycle = 0; cycle < plan.cycles; cycle++) {
    const offset = start + cycle * plan.cycle;
    for (const note of plan.notes) {
      const built = buildNote(c, tone, { ...note, at: offset + note.at }, plan.tint);
      sources.push(...built.sources);
      last = Math.max(last, built.until);
    }
  }

  voice.gain.exponentialRampToValueAtTime(plan.level, start + FADE_IN);
  // Thins out over the final cycle rather than stopping dead.
  const tail = start + plan.cycles * plan.cycle;
  voice.gain.setValueAtTime(plan.level, Math.max(start + FADE_IN, tail - plan.cycle));
  voice.gain.exponentialRampToValueAtTime(plan.level * 0.35, tail);
  voice.gain.exponentialRampToValueAtTime(SILENT, last + 0.3);

  const active: Voice = {
    gain: voice,
    sources,
    timer: window.setTimeout(
      () => {
        voice.disconnect();
        if (current === active) current = null;
      },
      (last - ctx.currentTime + 0.6) * 1000,
    ),
  };
  current = active;
}

/** Fade out whatever is playing. */
export function stopAmbience(): void {
  if (!chain || !current) return;
  release(current, chain.ctx, CLOSE_FADE);
  current = null;
}
