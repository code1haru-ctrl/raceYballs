import { describe, expect, it } from 'vitest'
import { AudioEngine } from './AudioEngine'
import { AUDIO_CONFIG } from './config'
import { FakeAudioContext, fixedRandom } from './testing/fakeAudio'

function createEngine(context: FakeAudioContext): AudioEngine {
  return new AudioEngine({
    contextFactory: () => context,
    rng: fixedRandom(0.5),
  })
}

describe('the audio engine', () => {
  it('stays silent before a user gesture (no context yet)', () => {
    const context = new FakeAudioContext()
    const engine = createEngine(context)

    expect(engine.play('collision')).toBe(false)
    expect(context.gains).toHaveLength(0)
  })

  it('creates and resumes the context on unlock', async () => {
    const context = new FakeAudioContext()
    const engine = createEngine(context)

    await engine.unlock()

    expect(context.state).toBe('running')
    expect(context.gains.length).toBeGreaterThan(0)
  })

  it('respects the maximum simultaneous voice count', async () => {
    const context = new FakeAudioContext()
    const engine = createEngine(context)
    await engine.unlock()

    for (let i = 0; i < AUDIO_CONFIG.maxVoices; i += 1) {
      expect(engine.play('collision')).toBe(true)
    }
    expect(engine.getActiveVoiceCount()).toBe(AUDIO_CONFIG.maxVoices)
    expect(engine.play('collision')).toBe(false)

    context.currentTime = 10
    expect(engine.getActiveVoiceCount()).toBe(0)
    expect(engine.play('collision')).toBe(true)
  })

  it('plays nothing while muted and resumes after unmuting', async () => {
    const context = new FakeAudioContext()
    const engine = createEngine(context)
    await engine.unlock()

    engine.setMuted(true)
    expect(engine.play('finish')).toBe(false)
    expect(engine.getActiveVoiceCount()).toBe(0)
    expect(context.oscillators).toHaveLength(0)

    engine.setMuted(false)
    expect(engine.play('finish')).toBe(true)
    expect(engine.getActiveVoiceCount()).toBe(1)
  })

  it('ramps the master gain for volume and mute changes', async () => {
    const context = new FakeAudioContext()
    const engine = createEngine(context)
    await engine.unlock()

    const master = context.gains[0]
    engine.setVolume(0.8)
    expect(master.gain.scheduled.at(-1)?.value).toBeCloseTo(0.8)

    engine.setMuted(true)
    expect(master.gain.scheduled.at(-1)?.value).toBe(0)
  })

  it('stops voices and closes the context on dispose', async () => {
    const context = new FakeAudioContext()
    const engine = createEngine(context)
    await engine.unlock()
    engine.play('overtake')

    engine.dispose()

    expect(engine.getActiveVoiceCount()).toBe(0)
    expect(context.closed).toBe(true)
    expect(engine.play('overtake')).toBe(false)
  })
})
