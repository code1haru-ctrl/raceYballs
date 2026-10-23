/**
 * Synthesized placeholder sounds (Phase 5).
 *
 * Four collision variants, three overtake variants and three finish variants
 * are built from short oscillator/noise envelopes. They are intentionally tiny
 * descriptors: adding a fourth overtake or fifth collision is just another
 * object in the list below.
 */

import type {
  AudioBufferSourceNodeLike,
  AudioContextLike,
  AudioNodeLike,
  AudioScheduledSourceLike,
  OscillatorNodeLike,
} from './webAudio'
import type {
  SoundCategory,
  SynthRenderOptions,
  SynthVariant,
} from './types'

interface ToneSpec {
  type: string
  /** Starting frequency in Hz, before pitch scaling. */
  from: number
  /** Optional ending frequency in Hz, before pitch scaling. */
  to?: number
  /** Start offset relative to the variant start, in seconds. */
  at?: number
  duration: number
  gain: number
  attack?: number
}

interface NoiseSpec {
  at?: number
  duration: number
  gain: number
  filter?: 'lowpass' | 'highpass' | 'bandpass'
  filterFrequency?: number
  q?: number
}

function scheduleTone(
  context: AudioContextLike,
  destination: AudioNodeLike,
  spec: ToneSpec,
  options: SynthRenderOptions,
): OscillatorNodeLike {
  const start = options.startAt + (spec.at ?? 0)
  const end = start + spec.duration
  const from = Math.max(20, spec.from * options.pitch)
  const to = Math.max(20, (spec.to ?? spec.from) * options.pitch)
  const attack = Math.min(spec.attack ?? 0.004, spec.duration * 0.5)

  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.type = spec.type

  oscillator.frequency.setValueAtTime(from, start)
  if (spec.to !== undefined) {
    oscillator.frequency.exponentialRampToValueAtTime(to, end)
  }

  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.linearRampToValueAtTime(spec.gain, start + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, end)

  oscillator.connect(gain)
  gain.connect(destination)
  oscillator.start(start)
  oscillator.stop(end + 0.01)
  return oscillator
}

let noiseSeed = 0x9e3779b9

function nextNoiseSample(): number {
  noiseSeed = (Math.imul(noiseSeed, 1664525) + 1013904223) >>> 0
  return (noiseSeed / 0xffffffff) * 2 - 1
}

function scheduleNoise(
  context: AudioContextLike,
  destination: AudioNodeLike,
  spec: NoiseSpec,
  options: SynthRenderOptions,
): AudioBufferSourceNodeLike {
  const start = options.startAt + (spec.at ?? 0)
  const end = start + spec.duration
  const length = Math.max(1, Math.ceil(context.sampleRate * spec.duration))
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i += 1) data[i] = nextNoiseSample()

  const source = context.createBufferSource()
  source.buffer = buffer
  source.playbackRate.setValueAtTime(options.pitch, start)

  let tail: AudioNodeLike = source
  if (spec.filter) {
    const filter = context.createBiquadFilter()
    filter.type = spec.filter
    filter.frequency.setValueAtTime(
      Math.max(40, (spec.filterFrequency ?? 2000) * options.pitch),
      start,
    )
    filter.Q.setValueAtTime(spec.q ?? 0.8, start)
    source.connect(filter)
    tail = filter
  }

  const gain = context.createGain()
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.linearRampToValueAtTime(spec.gain, start + 0.003)
  gain.gain.exponentialRampToValueAtTime(0.0001, end)

  tail.connect(gain)
  gain.connect(destination)
  source.start(start)
  source.stop(end + 0.01)
  return source
}

function renderTones(
  context: AudioContextLike,
  destination: AudioNodeLike,
  options: SynthRenderOptions,
  tones: readonly ToneSpec[],
  noises: readonly NoiseSpec[] = [],
): AudioScheduledSourceLike[] {
  const sources: AudioScheduledSourceLike[] = []
  for (const tone of tones) {
    sources.push(scheduleTone(context, destination, tone, options))
  }
  for (const noise of noises) {
    sources.push(scheduleNoise(context, destination, noise, options))
  }
  return sources
}

const COLLISION_VARIANTS: SynthVariant[] = [
  {
    id: 'collision-01',
    category: 'collision',
    duration: 0.055,
    render: (context, destination, options) =>
      renderTones(
        context,
        destination,
        options,
        [{ type: 'square', from: 1900, to: 1250, duration: 0.042, gain: 0.24 }],
        [
          {
            duration: 0.028,
            gain: 0.22,
            filter: 'highpass',
            filterFrequency: 2200,
          },
        ],
      ),
  },
  {
    id: 'collision-02',
    category: 'collision',
    duration: 0.08,
    render: (context, destination, options) =>
      renderTones(
        context,
        destination,
        options,
        [{ type: 'triangle', from: 900, to: 520, duration: 0.07, gain: 0.3 }],
        [{ duration: 0.035, gain: 0.16, filter: 'bandpass', filterFrequency: 1500 }],
      ),
  },
  {
    id: 'collision-03',
    category: 'collision',
    duration: 0.04,
    render: (context, destination, options) =>
      renderTones(
        context,
        destination,
        options,
        [{ type: 'square', from: 2650, to: 2100, duration: 0.03, gain: 0.2 }],
        [
          {
            duration: 0.018,
            gain: 0.2,
            filter: 'highpass',
            filterFrequency: 3000,
          },
        ],
      ),
  },
  {
    id: 'collision-04',
    category: 'collision',
    duration: 0.11,
    render: (context, destination, options) =>
      renderTones(
        context,
        destination,
        options,
        [{ type: 'sine', from: 220, to: 90, duration: 0.1, gain: 0.36 }],
        [{ duration: 0.06, gain: 0.16, filter: 'lowpass', filterFrequency: 700 }],
      ),
  },
]

const OVERTAKE_VARIANTS: SynthVariant[] = [
  {
    id: 'overtake-01',
    category: 'overtake',
    duration: 0.15,
    render: (context, destination, options) =>
      renderTones(context, destination, options, [
        { type: 'sine', from: 500, to: 1120, duration: 0.13, gain: 0.26 },
        { type: 'triangle', from: 1000, to: 2240, at: 0.055, duration: 0.09, gain: 0.12 },
      ]),
  },
  {
    id: 'overtake-02',
    category: 'overtake',
    duration: 0.22,
    render: (context, destination, options) =>
      renderTones(context, destination, options, [
        { type: 'square', from: 420, to: 740, duration: 0.085, gain: 0.14 },
        { type: 'square', from: 740, to: 1180, at: 0.09, duration: 0.11, gain: 0.12 },
      ]),
  },
  {
    id: 'overtake-03',
    category: 'overtake',
    duration: 0.2,
    render: (context, destination, options) =>
      renderTones(
        context,
        destination,
        options,
        [{ type: 'triangle', from: 300, to: 1450, duration: 0.18, gain: 0.18 }],
        [
          {
            duration: 0.14,
            gain: 0.12,
            filter: 'highpass',
            filterFrequency: 900,
          },
        ],
      ),
  },
]

const FINISH_VARIANTS: SynthVariant[] = [
  {
    id: 'finish-01',
    category: 'finish',
    duration: 0.44,
    render: (context, destination, options) =>
      renderTones(context, destination, options, [
        { type: 'square', from: 523, duration: 0.09, gain: 0.16 },
        { type: 'square', from: 659, at: 0.09, duration: 0.09, gain: 0.16 },
        { type: 'square', from: 784, at: 0.18, duration: 0.09, gain: 0.17 },
        { type: 'square', from: 1046, at: 0.27, duration: 0.16, gain: 0.18 },
      ]),
  },
  {
    id: 'finish-02',
    category: 'finish',
    duration: 0.4,
    render: (context, destination, options) =>
      renderTones(context, destination, options, [
        { type: 'sine', from: 659, duration: 0.12, gain: 0.2 },
        { type: 'sine', from: 880, at: 0.08, duration: 0.12, gain: 0.18 },
        { type: 'triangle', from: 1318, at: 0.16, duration: 0.22, gain: 0.16 },
      ]),
  },
  {
    id: 'finish-03',
    category: 'finish',
    duration: 0.52,
    render: (context, destination, options) =>
      renderTones(context, destination, options, [
        { type: 'triangle', from: 392, to: 784, duration: 0.18, gain: 0.18 },
        { type: 'square', from: 392, at: 0.18, duration: 0.3, gain: 0.1 },
        { type: 'square', from: 523, at: 0.18, duration: 0.3, gain: 0.1 },
        { type: 'square', from: 659, at: 0.18, duration: 0.3, gain: 0.1 },
      ]),
  },
]

export const SYNTH_VARIANTS: Record<SoundCategory, readonly SynthVariant[]> = {
  collision: COLLISION_VARIANTS,
  overtake: OVERTAKE_VARIANTS,
  finish: FINISH_VARIANTS,
}
