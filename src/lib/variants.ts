import type {
  DesignVariant,
  FrameColorKey,
  FrameStyle,
  ImageTransform,
  MatColorKey,
  Panel,
  PassepartoutMode,
  PassepartoutSettings,
  PerPanelFrame,
  Unit,
  VariantSnapshot,
  WallSetup,
  SourceImage,
} from '../types'
import { migrateMeasurements } from './migrations'
import { MIN_OPENING_SIZE_MM, MIN_PANEL_SIZE_MM, MIN_WALL_SIZE_MM } from './units'

export const VARIANT_STORAGE_KEY = 'slice-my-photo-variants'
export const VARIANT_STORAGE_VERSION = 3
export const MAX_VARIANTS = 3
const LEGACY_VARIANT_STORAGE_VERSION = 2

interface VariantStorage {
  version: typeof VARIANT_STORAGE_VERSION
  variants: DesignVariant[]
}

const FRAME_COLORS: FrameColorKey[] = ['black', 'white', 'natural', 'darkwood', 'walnut', 'gold', 'silver', 'custom']
const MAT_COLORS: MatColorKey[] = ['white', 'offwhite', 'black', 'custom']
const IMAGE_MODES: ImageTransform['mode'][] = ['fill', 'fit', 'custom']
const PASSEPARTOUT_MODES: PassepartoutMode[] = ['inset', 'opening', 'margins']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0
}

function isUnit(value: unknown): value is Unit {
  return value === 'cm' || value === 'in'
}

function isColorKey(value: unknown): value is FrameColorKey {
  return typeof value === 'string' && FRAME_COLORS.includes(value as FrameColorKey)
}

function isMatColorKey(value: unknown): value is MatColorKey {
  return typeof value === 'string' && MAT_COLORS.includes(value as MatColorKey)
}

function isPassepartout(value: unknown, canonical = true): value is PassepartoutSettings {
  if (!isRecord(value)) return false
  const minimumOpening = canonical ? MIN_OPENING_SIZE_MM : 0
  return (
    typeof value.enabled === 'boolean'
    && PASSEPARTOUT_MODES.includes(value.mode as PassepartoutMode)
    && isNonNegativeNumber(value.inset)
    && isFiniteNumber(value.openingWidth) && (canonical ? value.openingWidth >= minimumOpening : value.openingWidth > minimumOpening)
    && isFiniteNumber(value.openingHeight) && (canonical ? value.openingHeight >= minimumOpening : value.openingHeight > minimumOpening)
    && isNonNegativeNumber(value.marginTop)
    && isNonNegativeNumber(value.marginRight)
    && isNonNegativeNumber(value.marginBottom)
    && isNonNegativeNumber(value.marginLeft)
    && isMatColorKey(value.colorKey)
    && typeof value.customColor === 'string'
  )
}

function isPanel(value: unknown, canonical = true): value is Panel {
  if (!isRecord(value)) return false
  const minimumSize = canonical ? MIN_PANEL_SIZE_MM : 0
  return (
    typeof value.id === 'string'
    && value.id.length > 0
    && isFiniteNumber(value.width)
    && (canonical ? value.width >= minimumSize : value.width > minimumSize)
    && isFiniteNumber(value.height)
    && (canonical ? value.height >= minimumSize : value.height > minimumSize)
    && isFiniteNumber(value.x)
    && isFiniteNumber(value.y)
    && typeof value.sizePreset === 'string'
    && (value.displayUnit === undefined || isUnit(value.displayUnit))
    && (value.lockAspect === undefined || typeof value.lockAspect === 'boolean')
    && (value.passepartout === undefined || isPassepartout(value.passepartout, canonical))
  )
}

function isWall(value: unknown, canonical = true): value is WallSetup {
  const minimumSize = canonical ? MIN_WALL_SIZE_MM : 0
  return isRecord(value)
    && isFiniteNumber(value.width)
    && (canonical ? value.width >= minimumSize : value.width > minimumSize)
    && isFiniteNumber(value.height)
    && (canonical ? value.height >= minimumSize : value.height > minimumSize)
    && typeof value.color === 'string'
}

function isFrame(value: unknown): value is FrameStyle {
  return isRecord(value)
    && isNonNegativeNumber(value.edgeWidth)
    && isColorKey(value.colorKey)
    && typeof value.customColor === 'string'
    && typeof value.matEnabled === 'boolean'
    && isNonNegativeNumber(value.matWidth)
    && isMatColorKey(value.matColorKey)
    && typeof value.matCustomColor === 'string'
    && typeof value.shadow === 'boolean'
    && typeof value.perPanel === 'boolean'
}

function isPerPanelFrame(value: unknown, canonical = true): value is PerPanelFrame {
  return isRecord(value)
    && isNonNegativeNumber(value.edgeWidth)
    && isColorKey(value.colorKey)
    && typeof value.customColor === 'string'
    && typeof value.shadow === 'boolean'
    && isPassepartout(value.passepartout, canonical)
}

function isImage(value: unknown): value is ImageTransform {
  return isRecord(value)
    && IMAGE_MODES.includes(value.mode as ImageTransform['mode'])
    && isFiniteNumber(value.zoom)
    && value.zoom >= 1
    && value.zoom <= 5
    && isFiniteNumber(value.panX)
    && isFiniteNumber(value.panY)
}

function isPerPanelFrameRecord(value: unknown, canonical = true): value is Record<string, PerPanelFrame> {
  return isRecord(value) && Object.values(value).every((entry) => isPerPanelFrame(entry, canonical))
}

function isVariantSnapshot(value: unknown, canonical = true): value is VariantSnapshot {
  if (!isRecord(value) || !isUnit(value.unit) || !isWall(value.wall, canonical) || !Array.isArray(value.panels)) return false
  const panelIds = value.panels.map((panel) => isRecord(panel) ? panel.id : undefined)
  return isRecord(value)
    && value.panels.length <= 8
    && value.panels.every((panel) => isPanel(panel, canonical))
    && panelIds.every((id): id is string => typeof id === 'string')
    && new Set(panelIds).size === panelIds.length
    && isFrame(value.frame)
    && isPerPanelFrameRecord(value.perPanelFrame, canonical)
    && isImage(value.image)
    && isNonNegativeNumber(value.gap)
    && typeof value.currentSizeKey === 'string'
    && (value.presetActive === null || typeof value.presetActive === 'string')
}

function isDesignVariant(value: unknown, canonical = true): value is DesignVariant {
  if (!isRecord(value) || !isVariantSnapshot(value, canonical)) return false
  return typeof value.id === 'string'
    && value.id.length > 0
    && typeof value.name === 'string'
    && value.name.trim().length > 0
    && isFiniteNumber(value.savedAt)
    && typeof value.sourceSignature === 'string'
    && value.sourceSignature.length > 0
}

function migrateLegacyVariant(value: unknown): DesignVariant | null {
  if (!isDesignVariant(value, false)) return null
  const migrated = migrateMeasurements(value, LEGACY_VARIANT_STORAGE_VERSION)
  const candidate = {
    ...value,
    unit: migrated.unit,
    wall: migrated.wall,
    panels: migrated.panels,
    frame: migrated.frame,
    perPanelFrame: migrated.perPanelFrame,
    image: migrated.image,
    gap: migrated.gap,
  }
  return isDesignVariant(candidate) ? cloneVariant(candidate) : null
}

function clonePanel(panel: Panel): Panel {
  return {
    ...panel,
    ...(panel.passepartout ? { passepartout: { ...panel.passepartout } } : {}),
  }
}

export function cloneVariantSnapshot(snapshot: VariantSnapshot): VariantSnapshot {
  return {
    unit: snapshot.unit,
    wall: { ...snapshot.wall },
    panels: snapshot.panels.map(clonePanel),
    frame: { ...snapshot.frame },
    perPanelFrame: Object.fromEntries(
      Object.entries(snapshot.perPanelFrame).map(([id, panelFrame]) => [id, {
        ...panelFrame,
        passepartout: { ...panelFrame.passepartout },
      }]),
    ),
    image: { ...snapshot.image },
    gap: snapshot.gap,
    currentSizeKey: snapshot.currentSizeKey,
    presetActive: snapshot.presetActive,
  }
}

export function cloneVariant(variant: DesignVariant): DesignVariant {
  return {
    ...cloneVariantSnapshot(variant),
    id: variant.id,
    name: variant.name,
    savedAt: variant.savedAt,
    sourceSignature: variant.sourceSignature,
  }
}

/**
 * Source identity stores metadata plus a short proxy digest. The source image
 * stays in IndexedDB; variants never embed or duplicate its bytes.
 */
export function sourceImageSignature(sourceImage: Pick<SourceImage, 'name' | 'nativeWidth' | 'nativeHeight' | 'proxyMax' | 'proxyUrl'>): string {
  let digest = 2166136261
  for (let index = 0; index < sourceImage.proxyUrl.length; index++) {
    digest ^= sourceImage.proxyUrl.charCodeAt(index)
    digest = Math.imul(digest, 16777619)
  }
  return [sourceImage.name, sourceImage.nativeWidth, sourceImage.nativeHeight, sourceImage.proxyMax, (digest >>> 0).toString(16)]
    .map((part) => encodeURIComponent(String(part)))
    .join('|')
}

function readAll(): DesignVariant[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(VARIANT_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || !Array.isArray(parsed.variants)) return []
    if (parsed.version === VARIANT_STORAGE_VERSION) {
      return parsed.variants.filter((variant) => isDesignVariant(variant)).map(cloneVariant)
    }
    if (parsed.version === LEGACY_VARIANT_STORAGE_VERSION) {
      return parsed.variants
        .map(migrateLegacyVariant)
        .filter((variant): variant is DesignVariant => Boolean(variant))
    }
    return []
  } catch {
    return []
  }
}

function writeAll(variants: DesignVariant[]): boolean {
  try {
    if (typeof localStorage === 'undefined') return false
    const payload: VariantStorage = {
      version: VARIANT_STORAGE_VERSION,
      variants: variants.map(cloneVariant),
    }
    localStorage.setItem(VARIANT_STORAGE_KEY, JSON.stringify(payload))
    return true
  } catch {
    return false
  }
}

export function getAllVariants(sourceSignature?: string): DesignVariant[] {
  return readAll()
    .filter((variant) => !sourceSignature || variant.sourceSignature === sourceSignature)
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, MAX_VARIANTS)
}

export function getVariantByName(name: string, sourceSignature?: string): DesignVariant | undefined {
  return readAll().find((variant) => variant.name === name && (!sourceSignature || variant.sourceSignature === sourceSignature))
}

export function saveVariant(variant: DesignVariant): { ok: true } | { ok: false; error: string } {
  if (!isDesignVariant(variant)) {
    return { ok: false, error: 'Could not save this variant because its design data is invalid.' }
  }
  const variants = readAll()
  const existingIndex = variants.findIndex((item) => item.id === variant.id)
  if (existingIndex >= 0 && variants[existingIndex].sourceSignature !== variant.sourceSignature) {
    return { ok: false, error: 'Could not save this variant because its source image changed.' }
  }
  const activeCount = variants.filter((item) => item.sourceSignature === variant.sourceSignature).length
  if (existingIndex === -1 && activeCount >= MAX_VARIANTS) {
    return { ok: false, error: 'Maximum of 3 variants reached. Delete one before saving another.' }
  }
  const next = cloneVariant(variant)
  if (existingIndex === -1) variants.push(next)
  else variants[existingIndex] = next
  return writeAll(variants)
    ? { ok: true }
    : { ok: false, error: 'Could not save. Browser storage may be full.' }
}

export function deleteVariant(id: string): boolean {
  const variants = readAll()
  if (!variants.some((variant) => variant.id === id)) return false
  return writeAll(variants.filter((variant) => variant.id !== id))
}

export function renameVariant(id: string, name: string): boolean {
  const trimmed = name.trim()
  if (!trimmed) return false
  const variants = readAll()
  const variant = variants.find((item) => item.id === id)
  if (!variant) return false
  variant.name = trimmed
  return writeAll(variants)
}

export function makeVariantId(): string {
  return `variant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
