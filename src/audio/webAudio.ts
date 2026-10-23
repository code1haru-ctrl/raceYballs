/**
 * The tiny slice of the Web Audio API the engine uses.
 *
 * Keeping these as structural interfaces lets the engine run against a plain
 * mock in Vitest (node has no AudioContext) while still accepting the real
 * browser objects without casts at the call sites.
 */

export interface AudioParamLike {
  value: number
  setValueAtTime(value: number, time: number): unknown
  linearRampToValueAtTime(value: number, time: number): unknown
  exponentialRampToValueAtTime(value: number, time: number): unknown
  cancelScheduledValues(time: number): unknown
}

export interface AudioNodeLike {
  connect(destination: AudioNodeLike): unknown
  disconnect?(): void
}

export interface GainNodeLike extends AudioNodeLike {
  gain: AudioParamLike
}

export interface BiquadFilterNodeLike extends AudioNodeLike {
  type: string
  frequency: AudioParamLike
  Q: AudioParamLike
  gain: AudioParamLike
}

export interface AudioBufferLike {
  duration: number
  length: number
  sampleRate: number
  getChannelData(channel: number): Float32Array
}

export interface AudioScheduledSourceLike {
  connect(destination: AudioNodeLike): unknown
  start(when?: number): void
  stop(when?: number): void
  onended: (() => void) | null
}

export interface OscillatorNodeLike extends AudioScheduledSourceLike {
  type: string
  frequency: AudioParamLike
  detune: AudioParamLike
}

export interface AudioBufferSourceNodeLike extends AudioScheduledSourceLike {
  buffer: AudioBufferLike | null
  playbackRate: AudioParamLike
}

export interface AudioContextLike {
  currentTime: number
  state: string
  sampleRate: number
  destination: AudioNodeLike
  createGain(): GainNodeLike
  createOscillator(): OscillatorNodeLike
  createBiquadFilter(): BiquadFilterNodeLike
  createBuffer(
    numberOfChannels: number,
    length: number,
    sampleRate: number,
  ): AudioBufferLike
  createBufferSource(): AudioBufferSourceNodeLike
  decodeAudioData(data: ArrayBuffer): Promise<AudioBufferLike>
  resume(): Promise<void>
  close(): Promise<void>
}

type AudioContextConstructor = new () => AudioContextLike

/** Creates the browser AudioContext, or returns null when none is available. */
export function createBrowserAudioContext(): AudioContextLike | null {
  const scope = globalThis as {
    AudioContext?: AudioContextConstructor
    webkitAudioContext?: AudioContextConstructor
  }
  const Constructor = scope.AudioContext ?? scope.webkitAudioContext
  if (!Constructor) return null

  try {
    return new Constructor()
  } catch {
    return null
  }
}
