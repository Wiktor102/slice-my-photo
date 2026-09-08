import type { FrameStyle, MatColorKey, Panel, PassepartoutSettings } from '../types'
import { FRAME_SIZES, getPreset } from './frameSizes'
import { MIN_OPENING_SIZE_MM, toMm, unitFromPresetKey } from './units'

export const DEFAULT_PASSEPARTOUT_COLOR: MatColorKey = 'white'
export const DEFAULT_PASSEPARTOUT_CUSTOM_COLOR = '#ffffff'
/** The smallest physical image opening, in canonical millimeters. */
export const MIN_OPENING_SIZE = MIN_OPENING_SIZE_MM

function previousPresetOpening(panel: Pick<Panel, 'width' | 'height' | 'sizePreset'>): { w: number; h: number } | null {
  const unit = unitFromPresetKey(panel.sizePreset)
  if (!unit) return null
  const current = getPreset(unit, panel.sizePreset)
  if (!current) return null

  const portrait = panel.height >= panel.width
  const currentShort = Math.min(toMm(current.w, unit), toMm(current.h, unit))
  const currentLong = Math.max(toMm(current.w, unit), toMm(current.h, unit))
  const smallerShort = FRAME_SIZES[unit]
    .map((p) => Math.min(toMm(p.w, unit), toMm(p.h, unit)))
    .filter((size) => size < currentShort)
    .sort((a, b) => b - a)[0]

  if (smallerShort) {
    const nested = FRAME_SIZES[unit].find((p) => {
      const short = Math.min(toMm(p.w, unit), toMm(p.h, unit))
      const long = Math.max(toMm(p.w, unit), toMm(p.h, unit))
      return short === smallerShort && long === currentShort
    })
    if (nested) {
      return portrait
        ? { w: toMm(Math.min(nested.w, nested.h), unit), h: toMm(Math.max(nested.w, nested.h), unit) }
        : { w: toMm(Math.max(nested.w, nested.h), unit), h: toMm(Math.min(nested.w, nested.h), unit) }
    }
  }

  const candidates = FRAME_SIZES[unit]
    .filter((p) => {
      const w = toMm(p.w, unit)
      const h = toMm(p.h, unit)
      return Math.max(w, h) < currentLong && w <= Math.max(panel.width, panel.height) && h <= Math.max(panel.width, panel.height)
    })
    .map((p) => {
      const pW = toMm(p.w, unit)
      const pH = toMm(p.h, unit)
      const w = portrait ? Math.min(pW, pH) : Math.max(pW, pH)
      const h = portrait ? Math.max(pW, pH) : Math.min(pW, pH)
      return { w, h, area: w * h }
    })
    .filter((p) => p.w < panel.width && p.h < panel.height)
    .sort((a, b) => b.area - a.area)

  return candidates[0] ? { w: candidates[0].w, h: candidates[0].h } : null
}

export function suggestedOpening(panel: Pick<Panel, 'width' | 'height' | 'sizePreset'>): { w: number; h: number } {
  return previousPresetOpening(panel) ?? {
    w: Math.max(MIN_OPENING_SIZE, panel.width - 60),
    h: Math.max(MIN_OPENING_SIZE, panel.height - 60),
  }
}

export function defaultPassepartout(panel: Pick<Panel, 'width' | 'height' | 'sizePreset'>): PassepartoutSettings {
  const opening = suggestedOpening(panel)
  const horizontalMargin = Math.max(0, (panel.width - opening.w) / 2)
  const verticalMargin = Math.max(0, (panel.height - opening.h) / 2)
  return {
    enabled: false,
    mode: 'opening',
    inset: 30,
    openingWidth: opening.w,
    openingHeight: opening.h,
    marginTop: verticalMargin,
    marginRight: horizontalMargin,
    marginBottom: verticalMargin,
    marginLeft: horizontalMargin,
    colorKey: DEFAULT_PASSEPARTOUT_COLOR,
    customColor: DEFAULT_PASSEPARTOUT_CUSTOM_COLOR,
  }
}

export function legacyPassepartout(panel: Pick<Panel, 'width' | 'height' | 'sizePreset'>, legacy?: Partial<FrameStyle>): PassepartoutSettings {
  const fallback = defaultPassepartout(panel)
  if (!legacy) return fallback
  return {
    ...fallback,
    enabled: Boolean(legacy.matEnabled),
    mode: 'inset',
    inset: legacy.matWidth ?? fallback.inset,
    colorKey: legacy.matColorKey ?? fallback.colorKey,
    customColor: legacy.matCustomColor ?? fallback.customColor,
  }
}

export function normalizePassepartout(
  panel: Pick<Panel, 'width' | 'height' | 'sizePreset' | 'passepartout'>,
  legacy?: Partial<FrameStyle>,
): PassepartoutSettings {
  const merged = {
    ...legacyPassepartout(panel, legacy),
    ...panel.passepartout,
  }
  if (merged.mode === 'opening') {
    merged.openingWidth = Math.max(MIN_OPENING_SIZE, Math.min(merged.openingWidth, panel.width))
    merged.openingHeight = Math.max(MIN_OPENING_SIZE, Math.min(merged.openingHeight, panel.height))
  }
  if (merged.mode === 'inset') {
    merged.inset = Math.max(0, Math.min(merged.inset, Math.min(panel.width, panel.height) / 2))
  }
  return merged
}

export function rotatePassepartout(settings: PassepartoutSettings | undefined): PassepartoutSettings | undefined {
  if (!settings) return undefined
  return {
    ...settings,
    openingWidth: settings.openingHeight,
    openingHeight: settings.openingWidth,
    marginTop: settings.marginLeft,
    marginRight: settings.marginTop,
    marginBottom: settings.marginRight,
    marginLeft: settings.marginBottom,
  } satisfies PassepartoutSettings
}
