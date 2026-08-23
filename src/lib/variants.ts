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

export const VARIANT_STORAGE_KEY = 'slice-my-photo-variants'
export const VARIANT_STORAGE_VERSION = 2
export const MAX_VARIANTS = 3

interface VariantStorage {
  version: typeof VARIANT_STORAGE_VERSION
  variants: DesignVariant[]
}

const FRAME_COLORS: FrameColorKey[] = ['black', 'white', 'natural', 'darkwood', 'walnut', 'gold', 'silver', 'custom']
const MAT_COLORS: MatColorKey[] = ['white', 'offwhite', 'black', 'custom']
const IMAGE_MODES: ImageTransform['mode'][] = ['fill', 'fit', 'custom']
const PASSEPARTOUT_MODES: PassepartoutMode[] = ['inset', 'opening', 'margins']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
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

function isPassepartout(value: unknown): value is PassepartoutSettings {
  if (!isRecord(value)) return false
  return (
    typeof value.enabled === 'boolean'
    && PASSEPARTOUT_MODES.includes(value.mode as PassepartoutMode)
    && isFiniteNumber(value.inset)
    && isFiniteNumber(value.openingWidth)
    && isFiniteNumber(value.openingHeight)
    && isFiniteNumber(value.marginTop)
    && isFiniteNumber(value.marginRight)
    && isFiniteNumber(value.marginBottom)
    && isFiniteNumber(value.marginLeft)
    && isMatColorKey(value.colorKey)
    && typeof value.customColor === 'string'
  )
}

function isPanel(value: unknown): value is Panel {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string'
    && isFiniteNumber(value.width)
    && isFiniteNumber(value.height)
    && isFiniteNumber(value.x)
    && isFiniteNumber(value.y)
    && typeof value.sizePreset === 'string'
    && (value.lockAspect === undefined || typeof value.lockAspect === 'boolean')
    && (value.passepartout === undefined || isPassepartout(value.passepartout))
  )
}

function isWall(value: unknown): value is WallSetup {
  return isRecord(value)
    && isFiniteNumber(value.width)
    && isFiniteNumber(value.height)
    && typeof value.color === 'string'
}

function isFrame(value: unknown): value is FrameStyle {
  return isRecord(value)
    && isFiniteNumber(value.edgeWidth)
    && isColorKey(value.colorKey)
    && typeof value.customColor === 'string'
    && typeof value.matEnabled === 'boolean'
    && isFiniteNumber(value.matWidth)
    && isMatColorKey(value.matColorKey)
    && typeof value.matCustomColor === 'string'
    && typeof value.shadow === 'boolean'
    && typeof value.perPanel === 'boolean'
}

function isPerPanelFrame(value: unknown): value is PerPanelFrame {
  return isRecord(value)
    && isFiniteNumber(value.edgeWidth)
    && isColorKey(value.colorKey)
    && typeof value.customColor === 'string'
    && typeof value.shadow === 'boolean'
    && isPassepartout(value.passepartout)
}

function isImage(value: unknown): value is ImageTransform {
  return isRecord(value)
    && IMAGE_MODES.includes(value.mode as ImageTransform['mode'])
    && isFiniteNumber(value.zoom)
    && isFiniteNumber(value.panX)
    && isFiniteNumber(value.panY)
}

function isPerPanelFrameRecord(value: unknown): value is Record<string, PerPanelFrame> {
  return isRecord(value) && Object.values(value).every(isPerPanelFrame)
}

function isVariantSnapshot(value: unknown): value is VariantSnapshot {
  return isRecord(value)
    && isUnit(value.unit)
    && isWall(value.wall)
    && Array.isArray(value.panels)
    && value.panels.length <= 8
    && value.panels.every(isPanel)
    && isFrame(value.frame)
    && isPerPanelFrameRecord(value.perPanelFrame)
    && isImage(value.image)
    && isFiniteNumber(value.gap)
    && typeof value.currentSizeKey === 'string'
    && (value.presetActive === null || typeof value.presetActive === 'string')
}

function isDesignVariant(value: unknown): value is DesignVariant {
  if (!isRecord(value) || !isVariantSnapshot(value)) return false
  return typeof value.id === 'string'
    && value.id.length > 0
    && typeof value.name === 'string'
    && value.name.trim().length > 0
    && isFiniteNumber(value.savedAt)
    && typeof value.sourceSignature === 'string'
    && value.sourceSignature.length > 0
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
    if (!isRecord(parsed) || parsed.version !== VARIANT_STORAGE_VERSION || !Array.isArray(parsed.variants)) return []
    return parsed.variants.filter(isDesignVariant).map(cloneVariant)
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
  const variants = readAll()
  const existingIndex = variants.findIndex((item) => item.id === variant.id)
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

export function deleteVariant(id: string): void {
  writeAll(readAll().filter((variant) => variant.id !== id))
}

export function renameVariant(id: string, name: string): boolean {
  const variants = readAll()
  const variant = variants.find((item) => item.id === id)
  if (!variant) return false
  variant.name = name
  return writeAll(variants)
}

export function makeVariantId(): string {
  return `variant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
