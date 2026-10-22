import { describe, expect, it } from 'vitest'
import { MARBLES } from '../data'
import { RaceController } from './RaceController'
import {
  MarbleCustomization,
  getLuminance,
  isColorTooDark,
  validateMarbleColor,
  validateMarbleName,
} from './marbleCustomization'

describe('marble customization', () => {
  it('validates name trimming, length, uniqueness ignoring case', () => {
    const configs = [
      { id: 'a', name: 'Alpha', color: '#111111' },
      { id: 'b', name: 'Beta', color: '#222222' },
    ]
    expect(validateMarbleName('  Gamma  ', configs, 'c').valid).toBe(true)
    expect(validateMarbleName('   ', configs, 'c').valid).toBe(false)
    expect(validateMarbleName('1234567890123', configs, 'c').valid).toBe(false)
    expect(validateMarbleName('alpha', configs, 'c').valid).toBe(false)
  })

  it('validates color duplicates and too dark', () => {
    const configs = [
      { id: 'a', name: 'Alpha', color: '#2ce9ff' },
      { id: 'b', name: 'Beta', color: '#222222' },
    ]
    expect(validateMarbleColor('#222222', configs, 'c').valid).toBe(false)
    expect(validateMarbleColor('#000000', configs, 'c').valid).toBe(false)
    expect(validateMarbleColor('#ffffff', configs, 'c').valid).toBe(true)
  })

  it('computes luminance', () => {
    expect(getLuminance('#ffffff')).toBeCloseTo(1, 5)
    expect(getLuminance('#000000')).toBeCloseTo(0, 5)
    expect(isColorTooDark('#000000')).toBe(true)
  })

  it('stores the name without its surrounding spaces', () => {
    const customization = new MarbleCustomization()

    const result = customization.setName(MARBLES[0].id, '   Nova   ')

    expect(result.valid).toBe(true)
    expect(customization.get(MARBLES[0].id)?.name).toBe('Nova')
  })

  it('rejects every edit while the race is running', () => {
    const controller = new RaceController()
    const before = controller.getMarbleConfigs()[0]
    controller.start()
    expect(controller.getSnapshot().state).toBe('Running')

    expect(controller.setMarbleName(MARBLES[0].id, 'Nova').ok).toBe(false)
    expect(controller.setMarbleColor(MARBLES[0].id, '#00ff88').ok).toBe(false)
    expect(controller.setMarbleConfig(MARBLES[0].id, { name: 'Nova' }).ok).toBe(false)

    controller.resetMarbleConfigs()

    const after = controller.getMarbleConfigs()[0]
    expect(after.name).toBe(before.name)
    expect(after.color).toBe(before.color)
  })
})
