/** Formats a simulation speed like 1 -> "1.0×" and 0.75 -> "0.75×". */
export function formatSpeed(speed: number): string {
  const fixed = speed.toFixed(2)
  const trimmed = fixed.replace(/(\.\d)0$/, '$1')
  return `${trimmed}×`
}

/** Formats an elapsed simulation time like 12.34 -> "12.3s". */
export function formatElapsed(seconds: number): string {
  return `${seconds.toFixed(1)}s`
}
