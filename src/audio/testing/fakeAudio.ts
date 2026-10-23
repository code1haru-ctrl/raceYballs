/**
 * Minimal Web Audio mock used by the Phase 5 tests (node has no AudioContext).
 * Not imported by the application.
 */

import type {
  AudioBufferLike,
  AudioBufferSourceNodeLike,
  AudioContextLike,
  AudioNodeLike,
  AudioParamLike,
  BiquadFilterNodeLike,
  GainNodeLike,
  OscillatorNodeLike,
} from '../webAudio'

export class FakeAudioParam implements AudioParamLike {
  value: number
  readonly scheduled: { value: number; time: number }[] = []

  constructor(value = 0) {
    this.value = value
  }

  setValueAtTime(value: number, time: number): unknown {
    this.value = value
    this.scheduled.push({ value, time })
    return this
  }

  linearRampToValueAtTime(value: number, time: number): unknown {
    this.value = value
    this.scheduled.push({ value, time })
    return this
  }

  exponentialRampToValueAtTime(value: number, time: number): unknown {
    this.value = value
    this.scheduled.push({ value, time })
    return this
  }

  cancelScheduledValues(): unknown {
    return this
  }
}

export class FakeGainNode implements GainNodeLike {
  readonly gain = new FakeAudioParam(1)
  destination: AudioNodeLike | null = null

  connect(destination: AudioNodeLike): unknown {
    this.destination = destination
    return destination
  }

  disconnect(): void {
    this.destination = null
  }
}

export class FakeOscillatorNode implements OscillatorNodeLike {
  type = 'sine'
  readonly frequency = new FakeAudioParam(440)
  readonly detune = new FakeAudioParam(0)
  onended: (() => void) | null = null
  started = false
  stopped = false

  connect(): unknown {
    return this
  }

  start(): void {
    this.started = true
  }

  stop(): void {
    this.stopped = true
  }
}

export class FakeBiquadFilterNode implements BiquadFilterNodeLike {
  type = 'lowpass'
  readonly frequency = new FakeAudioParam(350)
  readonly Q = new FakeAudioParam(1)
  readonly gain = new FakeAudioParam(0)

  connect(): unknown {
    return this
  }
}

export class FakeAudioBuffer implements AudioBufferLike {
  readonly numberOfChannels: number
  readonly length: number
  readonly sampleRate: number
  readonly channels: Float32Array[]

  constructor(
    numberOfChannels: number,
    length: number,
    sampleRate: number,
  ) {
    this.numberOfChannels = numberOfChannels
    this.length = length
    this.sampleRate = sampleRate
    this.channels = Array.from(
      { length: numberOfChannels },
      () => new Float32Array(length),
    )
  }

  get duration(): number {
    return this.length / this.sampleRate
  }

  getChannelData(channel: number): Float32Array {
    return this.channels[channel]
  }
}

export class FakeBufferSourceNode implements AudioBufferSourceNodeLike {
  buffer: AudioBufferLike | null = null
  readonly playbackRate = new FakeAudioParam(1)
  onended: (() => void) | null = null
  started = false
  stopped = false

  connect(): unknown {
    return this
  }

  start(): void {
    this.started = true
  }

  stop(): void {
    this.stopped = true
  }
}

export class FakeAudioContext implements AudioContextLike {
  currentTime = 0
  state = 'suspended'
  sampleRate = 44100
  readonly destination: AudioNodeLike = { connect: () => undefined }
  readonly gains: FakeGainNode[] = []
  readonly oscillators: FakeOscillatorNode[] = []
  readonly bufferSources: FakeBufferSourceNode[] = []
  readonly filters: FakeBiquadFilterNode[] = []
  readonly buffers: FakeAudioBuffer[] = []
  closed = false

  createGain(): GainNodeLike {
    const gain = new FakeGainNode()
    this.gains.push(gain)
    return gain
  }

  createOscillator(): OscillatorNodeLike {
    const oscillator = new FakeOscillatorNode()
    this.oscillators.push(oscillator)
    return oscillator
  }

  createBiquadFilter(): BiquadFilterNodeLike {
    const filter = new FakeBiquadFilterNode()
    this.filters.push(filter)
    return filter
  }

  createBuffer(
    numberOfChannels: number,
    length: number,
    sampleRate: number,
  ): AudioBufferLike {
    const buffer = new FakeAudioBuffer(numberOfChannels, length, sampleRate)
    this.buffers.push(buffer)
    return buffer
  }

  createBufferSource(): AudioBufferSourceNodeLike {
    const source = new FakeBufferSourceNode()
    this.bufferSources.push(source)
    return source
  }

  async decodeAudioData(data: ArrayBuffer): Promise<AudioBufferLike> {
    const buffer = new FakeAudioBuffer(
      1,
      Math.max(1, data.byteLength),
      this.sampleRate,
    )
    this.buffers.push(buffer)
    return buffer
  }

  async resume(): Promise<void> {
    this.state = 'running'
  }

  async close(): Promise<void> {
    this.state = 'closed'
    this.closed = true
  }
}

export function fixedRandom(value: number): { next(): number } {
  return { next: () => value }
}
