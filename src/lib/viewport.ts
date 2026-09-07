import type { Unit } from '../types'
import { fromMm, toMm } from './units'

/** Return a human-friendly 1/2/5/10 spacing for a display-unit value. */
export function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1
  const pow = Math.pow(10, Math.floor(Math.log10(raw)))
  const n = raw / pow
  let nice: number
  if (n < 1.5) nice = 1
  else if (n < 3) nice = 2
  else if (n < 7) nice = 5
  else nice = 10
  return nice * pow
}

/**
 * Pick a ruler/grid spacing in display units, then return its canonical mm
 * equivalent for world-coordinate tick generation.
 */
export function niceViewportStepMm(screenPixels: number, scalePxPerMm: number, unit: Unit): number {
  const rawDisplayStep = fromMm(screenPixels / scalePxPerMm, unit)
  return toMm(niceStep(rawDisplayStep), unit)
}
