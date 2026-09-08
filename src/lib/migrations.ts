import type {
  FrameStyle,
  ImageTransform,
  Panel,
  PerPanelFrame,
  PassepartoutSettings,
  SavedLayout,
  Unit,
  Viewport,
  WallSetup,
} from '../types'
import { MIN_OPENING_SIZE_MM, MIN_PANEL_SIZE_MM, MIN_WALL_SIZE_MM, toMm, unitFromPresetKey } from './units'

/** Persisted measurement schema. Version 2 stored numbers in `state.unit`. */
export const CANONICAL_MEASUREMENT_VERSION = 3

const isUnit = (value: unknown): value is Unit => value === 'cm' || value === 'in'
const legacyUnit = (value: unknown): Unit => (isUnit(value) ? value : 'cm')
const numberOr = (value: unknown, fallback = 0): number => typeof value === 'number' && Number.isFinite(value) ? value : fallback

function convertPassepartout(value: unknown, unit: Unit): PassepartoutSettings | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Partial<PassepartoutSettings>
  return {
    ...raw,
    enabled: Boolean(raw.enabled),
    mode: raw.mode === 'inset' || raw.mode === 'margins' || raw.mode === 'opening' ? raw.mode : 'opening',
    inset: Math.max(0, toMm(numberOr(raw.inset), unit)),
    openingWidth: Math.max(MIN_OPENING_SIZE_MM, toMm(numberOr(raw.openingWidth), unit)),
    openingHeight: Math.max(MIN_OPENING_SIZE_MM, toMm(numberOr(raw.openingHeight), unit)),
    marginTop: Math.max(0, toMm(numberOr(raw.marginTop), unit)),
    marginRight: Math.max(0, toMm(numberOr(raw.marginRight), unit)),
    marginBottom: Math.max(0, toMm(numberOr(raw.marginBottom), unit)),
    marginLeft: Math.max(0, toMm(numberOr(raw.marginLeft), unit)),
    colorKey: raw.colorKey ?? 'white',
    customColor: raw.customColor ?? '#ffffff',
  }
}

function ensurePassepartoutCanonical(value: unknown): PassepartoutSettings | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Partial<PassepartoutSettings>
  return {
    ...raw,
    enabled: Boolean(raw.enabled),
    mode: raw.mode === 'inset' || raw.mode === 'margins' || raw.mode === 'opening' ? raw.mode : 'opening',
    inset: Math.max(0, numberOr(raw.inset)),
    openingWidth: Math.max(MIN_OPENING_SIZE_MM, numberOr(raw.openingWidth)),
    openingHeight: Math.max(MIN_OPENING_SIZE_MM, numberOr(raw.openingHeight)),
    marginTop: Math.max(0, numberOr(raw.marginTop)),
    marginRight: Math.max(0, numberOr(raw.marginRight)),
    marginBottom: Math.max(0, numberOr(raw.marginBottom)),
    marginLeft: Math.max(0, numberOr(raw.marginLeft)),
    colorKey: raw.colorKey ?? 'white',
    customColor: raw.customColor ?? '#ffffff',
  }
}

export function panelDisplayUnit(panel: Partial<Panel>, fallback: Unit): Unit {
  return panel.displayUnit ?? unitFromPresetKey(panel.sizePreset ?? '') ?? fallback
}

export function migratePanel(panel: Partial<Panel>, unit: Unit, canonical: boolean): Panel {
  const displayUnit = panelDisplayUnit(panel, unit)
  return {
    id: panel.id ?? `panel-${Math.random().toString(36).slice(2)}`,
    width: Math.max(MIN_PANEL_SIZE_MM, canonical ? numberOr(panel.width) : toMm(numberOr(panel.width), unit)),
    height: Math.max(MIN_PANEL_SIZE_MM, canonical ? numberOr(panel.height) : toMm(numberOr(panel.height), unit)),
    x: canonical ? numberOr(panel.x) : toMm(numberOr(panel.x), unit),
    y: canonical ? numberOr(panel.y) : toMm(numberOr(panel.y), unit),
    sizePreset: panel.sizePreset ?? 'custom',
    displayUnit,
    ...(panel.lockAspect === undefined ? {} : { lockAspect: Boolean(panel.lockAspect) }),
    ...(panel.passepartout
      ? { passepartout: canonical ? ensurePassepartoutCanonical(panel.passepartout) : convertPassepartout(panel.passepartout, unit) }
      : {}),
  }
}

export function migrateFrame(frame: Partial<FrameStyle> | undefined, unit: Unit, canonical: boolean): FrameStyle {
  const raw = frame ?? {}
  const convert = (value: unknown, canonicalFallback: number, legacyFallback: number) =>
    canonical ? numberOr(value, canonicalFallback) : toMm(numberOr(value, legacyFallback), unit)
  return {
    edgeWidth: Math.max(0, convert(raw.edgeWidth, 20, 2)),
    colorKey: raw.colorKey ?? 'black',
    customColor: raw.customColor ?? '#000000',
    matEnabled: Boolean(raw.matEnabled),
    matWidth: Math.max(0, convert(raw.matWidth, 30, 3)),
    matColorKey: raw.matColorKey ?? 'white',
    matCustomColor: raw.matCustomColor ?? '#ffffff',
    shadow: raw.shadow === undefined ? true : Boolean(raw.shadow),
    perPanel: Boolean(raw.perPanel),
  }
}

export function migratePerPanelFrame(
  value: unknown,
  unit: Unit,
  canonical: boolean,
): Record<string, PerPanelFrame> {
  if (!value || typeof value !== 'object') return {}
  return Object.fromEntries(Object.entries(value).map(([id, entry]) => {
    const raw = (entry ?? {}) as Partial<PerPanelFrame>
    const convert = (v: unknown, canonicalFallback: number, legacyFallback: number) =>
      canonical ? numberOr(v, canonicalFallback) : toMm(numberOr(v, legacyFallback), unit)
    const passepartout = canonical
      ? ensurePassepartoutCanonical(raw.passepartout)
      : convertPassepartout(raw.passepartout, unit)
    return [id, {
      edgeWidth: Math.max(0, convert(raw.edgeWidth, 20, 2)),
      colorKey: raw.colorKey ?? 'black',
      customColor: raw.customColor ?? '#000000',
      shadow: raw.shadow === undefined ? true : Boolean(raw.shadow),
      passepartout: passepartout ?? {
        enabled: false,
        mode: 'opening',
        inset: 30,
        openingWidth: 10,
        openingHeight: 10,
        marginTop: 0,
        marginRight: 0,
        marginBottom: 0,
        marginLeft: 0,
        colorKey: 'white',
        customColor: '#ffffff',
      },
      ...(raw.matEnabled === undefined ? {} : { matEnabled: Boolean(raw.matEnabled) }),
      matWidth: Math.max(0, convert(raw.matWidth, 30, 3)),
      ...(raw.matColorKey === undefined ? {} : { matColorKey: raw.matColorKey }),
      ...(raw.matCustomColor === undefined ? {} : { matCustomColor: raw.matCustomColor }),
    } satisfies PerPanelFrame]
  }))
}

export function migrateWall(wall: Partial<WallSetup> | undefined, unit: Unit, canonical: boolean): WallSetup {
  const raw = wall ?? {}
  return {
    width: Math.max(MIN_WALL_SIZE_MM, canonical ? numberOr(raw.width, 3000) : toMm(numberOr(raw.width, 300), unit)),
    height: Math.max(MIN_WALL_SIZE_MM, canonical ? numberOr(raw.height, 2500) : toMm(numberOr(raw.height, 250), unit)),
    color: raw.color ?? '#F5F5F5',
  }
}

export function migrateImage(image: Partial<ImageTransform> | undefined, unit: Unit, canonical: boolean): ImageTransform {
  const raw = image ?? {}
  return {
    mode: raw.mode === 'fit' || raw.mode === 'custom' || raw.mode === 'fill' ? raw.mode : 'fill',
    zoom: numberOr(raw.zoom, 1),
    panX: canonical ? numberOr(raw.panX) : toMm(numberOr(raw.panX), unit),
    panY: canonical ? numberOr(raw.panY) : toMm(numberOr(raw.panY), unit),
  }
}

export function migrateViewport(viewport: Partial<Viewport> | undefined, unit: Unit, canonical: boolean): Viewport {
  const raw = viewport ?? {}
  const mmPerUnit = toMm(1, unit)
  return {
    x: canonical ? numberOr(raw.x) : toMm(numberOr(raw.x), unit),
    y: canonical ? numberOr(raw.y) : toMm(numberOr(raw.y), unit),
    scale: canonical ? numberOr(raw.scale, 0.3) : numberOr(raw.scale, 3) / mmPerUnit,
  }
}

export function migrateMeasurements(
  value: unknown,
  version = 2,
): Record<string, unknown> {
  if (!value || typeof value !== 'object') return value as Record<string, unknown>
  const raw = value as Record<string, unknown>
  const unit = legacyUnit(raw.unit)
  const canonical = version >= CANONICAL_MEASUREMENT_VERSION || numberOr(raw.measurementVersion) >= CANONICAL_MEASUREMENT_VERSION
  return {
    ...raw,
    measurementVersion: CANONICAL_MEASUREMENT_VERSION,
    unit,
    wall: migrateWall(raw.wall as Partial<WallSetup> | undefined, unit, canonical),
    panels: Array.isArray(raw.panels) ? raw.panels.map((panel) => migratePanel(panel, unit, canonical)) : [],
    frame: migrateFrame(raw.frame as Partial<FrameStyle> | undefined, unit, canonical),
    perPanelFrame: migratePerPanelFrame(raw.perPanelFrame, unit, canonical),
    gap: Math.max(0, canonical ? numberOr(raw.gap, 30) : toMm(numberOr(raw.gap, 3), unit)),
    image: migrateImage(raw.image as Partial<ImageTransform> | undefined, unit, canonical),
    viewport: migrateViewport(raw.viewport as Partial<Viewport> | undefined, unit, canonical),
  }
}

export function migrateSavedLayout(layout: SavedLayout): SavedLayout {
  const raw = layout as SavedLayout & Record<string, unknown>
  const state = migrateMeasurements(raw, raw.measurementVersion ?? 2)
  return {
    ...raw,
    measurementVersion: CANONICAL_MEASUREMENT_VERSION,
    unit: state.unit as Unit,
    wall: state.wall as WallSetup,
    panels: state.panels as Panel[],
    frame: state.frame as FrameStyle,
    perPanelFrame: state.perPanelFrame as Record<string, PerPanelFrame>,
    gap: state.gap as number,
    currentSizeKey: raw.currentSizeKey ?? (state.unit === 'in' ? 'in-16x20' : 'cm-40x60'),
    presetActive: raw.presetActive ?? null,
  }
}
