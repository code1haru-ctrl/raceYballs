import { describe, expect, it } from 'vitest'
import { getLuminance, isColorTooDark, validateMarbleColor, validateMarbleName } from './marbleCustomization'

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
})
