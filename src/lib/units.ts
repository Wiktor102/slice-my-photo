import type { Unit } from '../types'

/** Physical conversion constants used by the canonical measurement model. */
export const MM_PER_CM = 10
export const MM_PER_INCH = 25.4
export const MIN_WALL_SIZE_MM = 100
export const MIN_PANEL_SIZE_MM = 100
export const MIN_OPENING_SIZE_MM = 10

/** Viewport scales are stored as screen pixels per canonical millimeter. */
export const VIEWPORT_FIT_MIN_SCALE_PX_PER_MM = 0.02
export const VIEWPORT_WHEEL_MIN_SCALE_PX_PER_MM = 0.02
export const VIEWPORT_WHEEL_MAX_SCALE_PX_PER_MM = 4
export const VIEWPORT_CONTROL_MIN_SCALE_PX_PER_MM = 0.01
export const VIEWPORT_CONTROL_MAX_SCALE_PX_PER_MM = 0.5
export const VIEWPORT_CONTROL_STEP_PX_PER_MM = 0.025
/** Keep the zoom label equivalent to the old pixels-per-centimeter scale. */
export const VIEWPORT_ZOOM_PERCENT_PER_PX_PER_MM = MM_PER_CM * 100

/** Physical tolerances and effects that were previously expressed in cm. */
export const GAP_CLUSTER_TOLERANCE_MM = 5
export const EXPORT_ADJACENCY_ALIGNMENT_TOLERANCE_MM = 20
export const EXPORT_ADJACENCY_START_TOLERANCE_MM = 5
export const EXPORT_ADJACENCY_MAX_GAP_MM = 500
export const EXPORT_MIN_GAP_LABEL_MM = 1
export const PANEL_SHADOW_BLUR_MM = 180
export const PANEL_SHADOW_OFFSET_Y_MM = 60

export function toMm(value: number, unit: Unit): number {
  return unit === 'cm' ? value * MM_PER_CM : value * MM_PER_INCH
}

export function fromMm(value: number, unit: Unit): number {
  return unit === 'cm' ? value / MM_PER_CM : value / MM_PER_INCH
}

export function unitFromPresetKey(key: string): Unit | null {
  if (key.startsWith('cm-')) return 'cm'
  if (key.startsWith('in-')) return 'in'
  return null
}

export function formatMeasurement(valueMm: number, unit: Unit, digits = 2): string {
  const value = fromMm(valueMm, unit)
  const rounded = Math.round(value * 10 ** digits) / 10 ** digits
  return String(rounded)
}

export function viewportZoomPercent(scalePxPerMm: number): number {
  return Math.round(scalePxPerMm * VIEWPORT_ZOOM_PERCENT_PER_PX_PER_MM)
}
