import { MARBLES } from '../data'

/** The customisable part of a marble. The id is fixed and never changes. */
export interface MarbleConfig {
  id: string
  name: string
  color: string
}

export interface ValidationResult {
  valid: boolean
  error?: string
}

/** Longest allowed marble name, counted after trimming. */
export const MAX_NAME_LENGTH = 12

/**
 * A marble color is rejected when it is too dark to read on the dark
 * background. The threshold is the relative luminance of the darkest
 * color that still reads well against the panel background.
 */
export const MIN_COLOR_LUMINANCE = 0.12

/** A fresh copy of the default customisation. */
export function getDefaultMarbleConfigs(): MarbleConfig[] {
  return MARBLES.map((marble) => ({
    id: marble.id,
    name: marble.name,
    color: marble.color,
  }))
}

/**
 * Validates a marble name.
 *
 * Rules (all of them required, none optional):
 *  - the name is trimmed before it is checked;
 *  - it must hold 1 to 12 characters;
 *  - it must be unique, comparing case-insensitively.
 */
export function validateMarbleName(
  name: string,
  configs: readonly MarbleConfig[],
  currentId: string,
): ValidationResult {
  const trimmed = name.trim()
  if (trimmed.length < 1) {
    return { valid: false, error: 'Name is required' }
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    return {
      valid: false,
      error: `Name must be 1-${MAX_NAME_LENGTH} characters`,
    }
  }
  const lower = trimmed.toLowerCase()
  for (const config of configs) {
    if (config.id === currentId) continue
    if (config.name.trim().toLowerCase() === lower) {
      return { valid: false, error: 'Name must be unique' }
    }
  }
  return { valid: true }
}

/** Parses a `#rgb` or `#rrggbb` color, or returns null when it is invalid. */
export function parseHexColor(
  hex: string,
): { r: number; g: number; b: number } | null {
  const value = hex.trim().replace(/^#/, '')
  const full =
    value.length === 3
      ? value
          .split('')
          .map((char) => char + char)
          .join('')
      : value
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  }
}

/**
 * Relative luminance of a color, from 0 (black) to 1 (white).
 *
 * Uses the WCAG formula, so a marble color can be checked against the dark
 * background with a single, pure number.
 */
export function getLuminance(hex: string): number {
  const rgb = parseHexColor(hex)
  if (!rgb) return 0
  const toLinear = (channel: number): number => {
    const cs = channel / 255
    return cs <= 0.03928 ? cs / 12.92 : ((cs + 0.055) / 1.055) ** 2.4
  }
  return (
    0.2126 * toLinear(rgb.r) +
    0.7152 * toLinear(rgb.g) +
    0.0722 * toLinear(rgb.b)
  )
}

/** True when the color is too dark to read on the dark race background. */
export function isColorTooDark(hex: string): boolean {
  return getLuminance(hex) < MIN_COLOR_LUMINANCE
}

/** Normalizes a color to the lower-case `#rrggbb` form. */
export function normalizeColor(hex: string): string {
  const rgb = parseHexColor(hex)
  if (!rgb) return hex.trim().toLowerCase()
  const part = (channel: number): string =>
    channel.toString(16).padStart(2, '0')
  return `#${part(rgb.r)}${part(rgb.g)}${part(rgb.b)}`
}

/**
 * Validates a marble color.
 *
 * Rules:
 *  - the color must be a valid hex color;
 *  - no other marble may use the exact same color;
 *  - the color must be bright enough to read on the dark background.
 */
export function validateMarbleColor(
  color: string,
  configs: readonly MarbleConfig[],
  currentId: string,
): ValidationResult {
  if (!parseHexColor(color)) {
    return { valid: false, error: 'Color must be a valid hex color' }
  }
  const normalized = normalizeColor(color)
  for (const config of configs) {
    if (config.id === currentId) continue
    if (normalizeColor(config.color) === normalized) {
      return { valid: false, error: 'Color must be unique' }
    }
  }
  if (isColorTooDark(normalized)) {
    return { valid: false, error: 'Color is too dark to read' }
  }
  return { valid: true }
}

/**
 * The customisation of the ten marbles.
 *
 * The store is deliberately independent from the physics and the track: it
 * only ever holds names and colors, and it never rebuilds a world. The
 * marble ids are fixed, so a name or a color change can never alter the
 * simulation.
 */
export class MarbleCustomization {
  private configs: MarbleConfig[]

  constructor(configs: MarbleConfig[] = getDefaultMarbleConfigs()) {
    this.configs = configs.map((config) => ({ ...config }))
  }

  /** The current customisation, as a copy. */
  list(): MarbleConfig[] {
    return this.configs.map((config) => ({ ...config }))
  }

  /** The customisation of a single marble, or undefined for an unknown id. */
  get(id: string): MarbleConfig | undefined {
    const found = this.configs.find((config) => config.id === id)
    return found ? { ...found } : undefined
  }

  /**
   * Applies a new name.
   *
   * An invalid name is rejected and the last valid name is kept, so the
   * caller can show the error and leave the marble untouched.
   */
  setName(id: string, name: string): ValidationResult {
    const index = this.configs.findIndex((config) => config.id === id)
    if (index === -1) return { valid: false, error: 'Unknown marble' }

    const result = validateMarbleName(name, this.configs, id)
    if (!result.valid) return result

    this.configs[index] = { ...this.configs[index], name: name.trim() }
    return { valid: true }
  }

  /**
   * Applies a new color.
   *
   * An invalid color is rejected and the last valid color is kept.
   */
  setColor(id: string, color: string): ValidationResult {
    const index = this.configs.findIndex((config) => config.id === id)
    if (index === -1) return { valid: false, error: 'Unknown marble' }

    const result = validateMarbleColor(color, this.configs, id)
    if (!result.valid) return result

    this.configs[index] = { ...this.configs[index], color: normalizeColor(color) }
    return { valid: true }
  }

  /** Restores the default names and colors. */
  resetToDefaults(): void {
    this.configs = getDefaultMarbleConfigs()
  }
}
