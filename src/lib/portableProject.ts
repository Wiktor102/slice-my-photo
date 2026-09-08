import type JSZip from 'jszip'
import type {
  FrameColorKey,
  FrameStyle,
  ImageTransform,
  MatColorKey,
  Panel,
  PassepartoutMode,
  PerPanelFrame,
  SourceImage,
  Unit,
  WallSetup,
} from '../types'
import { loadImage } from './imageUtils'
import { CANONICAL_MEASUREMENT_VERSION, migrateMeasurements } from './migrations'
import { MIN_PANEL_SIZE_MM, MIN_WALL_SIZE_MM } from './units'

export const PORTABLE_PROJECT_FORMAT = 'slice-my-photo'
/** Version 1 used display-unit measurements without a schema marker. */
export const LEGACY_PORTABLE_PROJECT_VERSION = 1
export const PORTABLE_PROJECT_VERSION = 2
export const PORTABLE_PROJECT_EXTENSION = '.smp'
export const PORTABLE_PROJECT_MANIFEST = 'manifest.json'
export const PORTABLE_PROJECT_FULL_IMAGE = 'image/full.data'
export const PORTABLE_PROJECT_PROXY_IMAGE = 'image/proxy.data'

/** Guard archive input before JSZip allocates or inflates anything. */
export const MAX_PORTABLE_PROJECT_BYTES = 100 * 1024 * 1024
/** Bound the total data JSZip may inflate from a small compressed archive. */
export const MAX_PORTABLE_PROJECT_UNCOMPRESSED_BYTES = 120 * 1024 * 1024
/** Keep manifest parsing and image URL allocations bounded independently. */
export const MAX_PORTABLE_PROJECT_MANIFEST_BYTES = 1 * 1024 * 1024
export const MAX_PORTABLE_PROJECT_IMAGE_BYTES = 64 * 1024 * 1024
export const MAX_PORTABLE_PROJECT_ENTRIES = 32

export interface PortableProjectState {
  measurementVersion: number
  unit: Unit
  wall: WallSetup
  panels: Panel[]
  frame: FrameStyle
  perPanelFrame: Record<string, PerPanelFrame>
  gap: number
  currentSizeKey: string
  presetActive: string | null
  image: ImageTransform
  showGrid: boolean
  gapSnapEnabled: boolean
}

export interface PortableProject {
  state: PortableProjectState
  sourceImage: SourceImage
}

interface PortableImageManifest {
  name: string
  nativeWidth: number
  nativeHeight: number
  proxyMax: number
  fullPath: typeof PORTABLE_PROJECT_FULL_IMAGE
  proxyPath: typeof PORTABLE_PROJECT_PROXY_IMAGE
}

export interface PortableProjectManifest {
  format: typeof PORTABLE_PROJECT_FORMAT
  version: typeof PORTABLE_PROJECT_VERSION
  createdAt: string
  state: PortableProjectState
  sourceImage: PortableImageManifest
}

export type ValidationResult<T> = {
  ok: true
  value: T
} | {
  ok: false
  error: string
}

interface ImageDimensions {
  naturalWidth: number
  naturalHeight: number
}

type ImageLoader = (src: string) => Promise<ImageDimensions>

interface ZipEntryInfo {
  compressedSize: number
  uncompressedSize: number
}

interface InflateBudget {
  bytes: number
}

interface JSZipConstructor {
  new(): JSZip
  loadAsync(data: ArrayBuffer, options?: JSZip.JSZipLoadOptions): Promise<JSZip>
}

interface JSZipStreamHelper<T> {
  on(event: 'data', callback: (chunk: T) => void): this
  on(event: 'end', callback: () => void): this
  on(event: 'error', callback: (error: Error) => void): this
  pause(): this
  resume(): this
}

type StreamableZipObject = JSZip.JSZipObject & {
  internalStream(type: 'uint8array'): JSZipStreamHelper<Uint8Array>
}

const FRAME_COLOR_KEYS: FrameColorKey[] = ['black', 'white', 'natural', 'darkwood', 'walnut', 'gold', 'silver', 'custom']
const MAT_COLOR_KEYS: MatColorKey[] = ['white', 'offwhite', 'black', 'custom']
const PASSEPARTOUT_MODES: PassepartoutMode[] = ['inset', 'opening', 'margins']
const IMAGE_MODES: ImageTransform['mode'][] = ['fill', 'fit', 'custom']
const IMAGE_DATA_URL_RE = /^data:image\/(?:jpeg|jpg|png|webp);base64,[a-z0-9+/]+={0,2}$/i
const MAX_PROJECT_DIMENSION_MM = 1_000_000
const MAX_IMAGE_DIMENSION_PX = 100_000
const MAX_SOURCE_NAME_LENGTH = 255
const MAX_ID_LENGTH = 128
const MAX_STRING_LENGTH = 512
const MAX_IMAGE_ZOOM = 5
const ZIP_EOCD_SIGNATURE = 0x06054b50
const ZIP_CENTRAL_SIGNATURE = 0x02014b50

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isPositiveNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0
}

function isNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0
}

function isString(value: unknown, maxLength = MAX_STRING_LENGTH): value is string {
  return typeof value === 'string' && value.length <= maxLength
}

function isOneOf<T extends string>(value: unknown, values: T[]): value is T {
  return typeof value === 'string' && values.includes(value as T)
}

function validateDimension(value: unknown, path: string, minimum: number): string | null {
  if (!isFiniteNumber(value) || value < minimum || value > MAX_PROJECT_DIMENSION_MM) {
    return `${path} must be between ${minimum} and ${MAX_PROJECT_DIMENSION_MM}.`
  }
  return null
}

function validatePassepartout(value: unknown, path: string): string | null {
  if (!isRecord(value)) return `${path} must be an object.`
  if (typeof value.enabled !== 'boolean') return `${path}.enabled must be a boolean.`
  if (!isOneOf(value.mode, PASSEPARTOUT_MODES)) return `${path}.mode is invalid.`
  const inset = value.inset
  const openingWidth = value.openingWidth
  const openingHeight = value.openingHeight
  const marginTop = value.marginTop
  const marginRight = value.marginRight
  const marginBottom = value.marginBottom
  const marginLeft = value.marginLeft
  for (const [key, numericValue] of Object.entries({ inset, openingWidth, openingHeight, marginTop, marginRight, marginBottom, marginLeft })) {
    if (!isNonNegativeNumber(numericValue) || numericValue > MAX_PROJECT_DIMENSION_MM) return `${path}.${key} must be a non-negative finite number.`
  }
  if (!isNonNegativeNumber(inset) || !isNonNegativeNumber(openingWidth) || !isNonNegativeNumber(openingHeight) || !isNonNegativeNumber(marginTop) || !isNonNegativeNumber(marginRight) || !isNonNegativeNumber(marginBottom) || !isNonNegativeNumber(marginLeft)) return `${path} contains invalid dimensions.`
  if (!isOneOf(value.colorKey, MAT_COLOR_KEYS)) return `${path}.colorKey is invalid.`
  if (!isString(value.customColor)) return `${path}.customColor must be a string.`

  // Geometry deliberately stays permissive here. The editor keeps panel and
  // mat values after a wall resize and the renderer clamps them at draw time.
  // Rejecting those values would make a valid saved project impossible to import.
  return null
}

function validatePanel(value: unknown, index: number): string | null {
  const path = `state.panels[${index}]`
  if (!isRecord(value)) return `${path} must be an object.`
  if (!isString(value.id, MAX_ID_LENGTH) || value.id.length === 0) return `${path}.id is required.`
  for (const key of ['width', 'height']) {
    const dimensionError = validateDimension(value[key], `${path}.${key}`, MIN_PANEL_SIZE_MM)
    if (dimensionError) return dimensionError
  }
  for (const key of ['x', 'y']) {
    if (!isFiniteNumber(value[key]) || value[key] < 0 || value[key] > MAX_PROJECT_DIMENSION_MM) return `${path}.${key} must be a non-negative finite number.`
  }
  if (!isString(value.sizePreset)) return `${path}.sizePreset must be a string.`
  if (!isOneOf(value.displayUnit, ['cm', 'in'])) return `${path}.displayUnit is invalid.`
  if (value.lockAspect !== undefined && typeof value.lockAspect !== 'boolean') return `${path}.lockAspect must be a boolean.`
  return value.passepartout === undefined ? null : validatePassepartout(value.passepartout, `${path}.passepartout`)
}

function validateFrame(value: unknown, path: string): string | null {
  if (!isRecord(value)) return `${path} must be an object.`
  if (!isNonNegativeNumber(value.edgeWidth) || value.edgeWidth > MAX_PROJECT_DIMENSION_MM) return `${path}.edgeWidth must be a non-negative finite number.`
  if (!isOneOf(value.colorKey, FRAME_COLOR_KEYS)) return `${path}.colorKey is invalid.`
  if (!isString(value.customColor)) return `${path}.customColor must be a string.`
  if (typeof value.matEnabled !== 'boolean') return `${path}.matEnabled must be a boolean.`
  if (!isNonNegativeNumber(value.matWidth) || value.matWidth > MAX_PROJECT_DIMENSION_MM) return `${path}.matWidth must be a non-negative finite number.`
  if (!isOneOf(value.matColorKey, MAT_COLOR_KEYS)) return `${path}.matColorKey is invalid.`
  if (!isString(value.matCustomColor)) return `${path}.matCustomColor must be a string.`
  if (typeof value.shadow !== 'boolean') return `${path}.shadow must be a boolean.`
  if (typeof value.perPanel !== 'boolean') return `${path}.perPanel must be a boolean.`
  return null
}

function validatePerPanelFrames(value: unknown): string | null {
  if (!isRecord(value)) return 'state.perPanelFrame must be an object.'
  if (Object.keys(value).length > 8) return 'state.perPanelFrame contains too many entries.'
  for (const [id, frame] of Object.entries(value)) {
    if (!isString(id, MAX_ID_LENGTH) || id.length === 0) return 'state.perPanelFrame contains an invalid panel id.'
    const path = `state.perPanelFrame.${id}`
    if (!isRecord(frame)) return `${path} must be an object.`
    if (!isNonNegativeNumber(frame.edgeWidth) || frame.edgeWidth > MAX_PROJECT_DIMENSION_MM) return `${path}.edgeWidth must be a non-negative finite number.`
    if (!isOneOf(frame.colorKey, FRAME_COLOR_KEYS)) return `${path}.colorKey is invalid.`
    if (!isString(frame.customColor)) return `${path}.customColor must be a string.`
    if (typeof frame.shadow !== 'boolean') return `${path}.shadow must be a boolean.`
    const passepartoutError = validatePassepartout(frame.passepartout, `${path}.passepartout`)
    if (passepartoutError) return passepartoutError
    for (const key of ['matEnabled', 'matWidth', 'matColorKey', 'matCustomColor']) {
      if (frame[key] === undefined) continue
      if (key === 'matEnabled' && typeof frame[key] !== 'boolean') return `${path}.${key} must be a boolean.`
      if (key === 'matWidth' && (!isNonNegativeNumber(frame[key]) || frame[key] > MAX_PROJECT_DIMENSION_MM)) return `${path}.${key} must be a non-negative finite number.`
      if (key === 'matColorKey' && !isOneOf(frame[key], MAT_COLOR_KEYS)) return `${path}.${key} is invalid.`
      if (key === 'matCustomColor' && !isString(frame[key])) return `${path}.${key} must be a string.`
    }
  }
  return null
}

function validateState(value: unknown): string | null {
  if (!isRecord(value)) return 'manifest.state must be an object.'
  if (value.measurementVersion !== CANONICAL_MEASUREMENT_VERSION) return `Unsupported measurement version. Expected ${CANONICAL_MEASUREMENT_VERSION}.`
  if (!isOneOf(value.unit, ['cm', 'in'])) return 'state.unit is invalid.'
  if (!isRecord(value.wall)) return 'state.wall must be an object.'
  const wallWidthError = validateDimension(value.wall.width, 'state.wall.width', MIN_WALL_SIZE_MM)
  if (wallWidthError) return wallWidthError
  const wallHeightError = validateDimension(value.wall.height, 'state.wall.height', MIN_WALL_SIZE_MM)
  if (wallHeightError) return wallHeightError
  if (!isString(value.wall.color)) return 'state.wall.color must be a string.'
  if (!Array.isArray(value.panels) || value.panels.length > 8) return 'state.panels must contain between 0 and 8 panels.'
  const panelIds = new Set<string>()
  for (let i = 0; i < value.panels.length; i++) {
    const panelError = validatePanel(value.panels[i], i)
    if (panelError) return panelError
    const panelId = (value.panels[i] as Record<string, unknown>).id as string
    if (panelIds.has(panelId)) return `state.panels contains duplicate id "${panelId}".`
    panelIds.add(panelId)
  }
  const frameError = validateFrame(value.frame, 'state.frame')
  if (frameError) return frameError
  const perPanelError = validatePerPanelFrames(value.perPanelFrame)
  if (perPanelError) return perPanelError
  for (const id of Object.keys(value.perPanelFrame as Record<string, unknown>)) {
    if (!panelIds.has(id)) return `state.perPanelFrame contains an unknown panel id "${id}".`
  }

  if (!isNonNegativeNumber(value.gap) || value.gap > MAX_PROJECT_DIMENSION_MM) return 'state.gap must be a non-negative finite number.'
  if (!isString(value.currentSizeKey)) return 'state.currentSizeKey must be a string.'
  if (value.presetActive !== null && !isString(value.presetActive)) return 'state.presetActive must be a string or null.'
  if (!isRecord(value.image)) return 'state.image must be an object.'
  if (!isOneOf(value.image.mode, IMAGE_MODES)) return 'state.image.mode is invalid.'
  if (!isFiniteNumber(value.image.zoom) || value.image.zoom < 1 || value.image.zoom > MAX_IMAGE_ZOOM) return `state.image.zoom must be between 1 and ${MAX_IMAGE_ZOOM}.`
  if (!isFiniteNumber(value.image.panX) || !isFiniteNumber(value.image.panY) || Math.abs(value.image.panX) > MAX_PROJECT_DIMENSION_MM || Math.abs(value.image.panY) > MAX_PROJECT_DIMENSION_MM) return 'state.image pan values must be finite and bounded.'
  if (typeof value.showGrid !== 'boolean') return 'state.showGrid must be a boolean.'
  if (typeof value.gapSnapEnabled !== 'boolean') return 'state.gapSnapEnabled must be a boolean.'
  return null
}

function validateImageManifest(value: unknown): string | null {
  if (!isRecord(value)) return 'manifest.sourceImage must be an object.'
  if (!isString(value.name, MAX_SOURCE_NAME_LENGTH) || value.name.length === 0) return 'sourceImage.name is invalid.'
  if (!Number.isInteger(value.nativeWidth) || !isPositiveNumber(value.nativeWidth) || value.nativeWidth > MAX_IMAGE_DIMENSION_PX) return 'sourceImage.nativeWidth is invalid.'
  if (!Number.isInteger(value.nativeHeight) || !isPositiveNumber(value.nativeHeight) || value.nativeHeight > MAX_IMAGE_DIMENSION_PX) return 'sourceImage.nativeHeight is invalid.'
  if (!Number.isInteger(value.proxyMax) || !isPositiveNumber(value.proxyMax) || value.proxyMax > MAX_IMAGE_DIMENSION_PX) return 'sourceImage.proxyMax is invalid.'
  if (value.fullPath !== PORTABLE_PROJECT_FULL_IMAGE) return 'sourceImage.fullPath is invalid.'
  if (value.proxyPath !== PORTABLE_PROJECT_PROXY_IMAGE) return 'sourceImage.proxyPath is invalid.'
  return null
}

/** Validate the current JSON manifest without touching browser APIs or image data. */
export function validatePortableManifest(value: unknown): ValidationResult<PortableProjectManifest> {
  if (!isRecord(value)) return { ok: false, error: 'The project manifest must be a JSON object.' }
  if (value.format !== PORTABLE_PROJECT_FORMAT) return { ok: false, error: 'This file is not a Slice My Photo project.' }
  if (value.version !== PORTABLE_PROJECT_VERSION) {
    return { ok: false, error: `Unsupported project version. Expected ${PORTABLE_PROJECT_VERSION}.` }
  }
  if (!isString(value.createdAt, 64)) return { ok: false, error: 'The project manifest has no creation timestamp.' }
  const stateError = validateState(value.state)
  if (stateError) return { ok: false, error: stateError }
  const imageError = validateImageManifest(value.sourceImage)
  if (imageError) return { ok: false, error: imageError }
  return { ok: true, value: value as unknown as PortableProjectManifest }
}

export function isImageDataUrl(value: unknown): value is string {
  return typeof value === 'string' && IMAGE_DATA_URL_RE.test(value)
}

export function buildPortableManifest(project: PortableProject, createdAt = new Date().toISOString()): PortableProjectManifest {
  return {
    format: PORTABLE_PROJECT_FORMAT,
    version: PORTABLE_PROJECT_VERSION,
    createdAt,
    state: project.state,
    sourceImage: {
      name: project.sourceImage.name,
      nativeWidth: project.sourceImage.nativeWidth,
      nativeHeight: project.sourceImage.nativeHeight,
      proxyMax: project.sourceImage.proxyMax,
      fullPath: PORTABLE_PROJECT_FULL_IMAGE,
      proxyPath: PORTABLE_PROJECT_PROXY_IMAGE,
    },
  }
}

async function loadZipLibrary(): Promise<JSZipConstructor> {
  const module = await import('jszip') as unknown as { default: JSZipConstructor }
  return module.default
}

export async function serializePortableProject(project: PortableProject): Promise<Blob> {
  const manifest = buildPortableManifest(project)
  const manifestCheck = validatePortableManifest(manifest)
  if (!manifestCheck.ok) throw new Error(manifestCheck.error)
  if (!isImageDataUrl(project.sourceImage.fullUrl) || !isImageDataUrl(project.sourceImage.proxyUrl)) {
    throw new Error('The current source image is not stored in a portable data format.')
  }
  if (project.sourceImage.fullUrl.length > MAX_PORTABLE_PROJECT_IMAGE_BYTES || project.sourceImage.proxyUrl.length > MAX_PORTABLE_PROJECT_IMAGE_BYTES) {
    throw new Error('The current source image is too large to include in a project file.')
  }
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2)).byteLength
  if (manifestBytes + project.sourceImage.fullUrl.length + project.sourceImage.proxyUrl.length > MAX_PORTABLE_PROJECT_UNCOMPRESSED_BYTES) {
    throw new Error('The current project is too large to include in a project file.')
  }

  const JSZip = await loadZipLibrary()
  const zip = new JSZip()
  zip.file(PORTABLE_PROJECT_MANIFEST, JSON.stringify(manifest, null, 2))
  zip.file(PORTABLE_PROJECT_FULL_IMAGE, project.sourceImage.fullUrl)
  zip.file(PORTABLE_PROJECT_PROXY_IMAGE, project.sourceImage.proxyUrl)
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}

function imageDataError(kind: string): Error {
  return new Error(`The project ${kind} image is missing or is not a valid JPEG, PNG, or WebP data URL.`)
}

/** Decode imported images and verify their dimensions before any state changes. */
export async function validatePortableImageData(project: PortableProject, loader: ImageLoader = loadImage): Promise<void> {
  if (!isImageDataUrl(project.sourceImage.fullUrl) || project.sourceImage.fullUrl.length > MAX_PORTABLE_PROJECT_IMAGE_BYTES) throw imageDataError('full')
  if (!isImageDataUrl(project.sourceImage.proxyUrl) || project.sourceImage.proxyUrl.length > MAX_PORTABLE_PROJECT_IMAGE_BYTES) throw imageDataError('preview')

  let full: ImageDimensions
  try {
    full = await loader(project.sourceImage.fullUrl)
  } catch {
    throw new Error('The project full-resolution image could not be decoded.')
  }
  if (full.naturalWidth !== project.sourceImage.nativeWidth || full.naturalHeight !== project.sourceImage.nativeHeight) {
    throw new Error(`The project image dimensions do not match its manifest (${project.sourceImage.nativeWidth}×${project.sourceImage.nativeHeight}px).`)
  }

  let proxy = full
  if (project.sourceImage.proxyUrl !== project.sourceImage.fullUrl) {
    try {
      proxy = await loader(project.sourceImage.proxyUrl)
    } catch {
      throw new Error('The project preview image could not be decoded.')
    }
  }
  if (proxy.naturalWidth <= 0 || proxy.naturalHeight <= 0) throw new Error('The project preview image has invalid dimensions.')
  if (project.sourceImage.proxyUrl !== project.sourceImage.fullUrl) {
    if (Math.max(proxy.naturalWidth, proxy.naturalHeight) > project.sourceImage.proxyMax) {
      throw new Error('The project preview image exceeds its declared size limit.')
    }
    const fullRatio = full.naturalWidth / full.naturalHeight
    const proxyRatio = proxy.naturalWidth / proxy.naturalHeight
    if (Math.abs(proxyRatio - fullRatio) > fullRatio * 0.01) {
      throw new Error('The project preview image aspect ratio does not match the source image.')
    }
  }
}

function readUint16(view: DataView, offset: number): number {
  return view.getUint16(offset, true)
}

function readUint32(view: DataView, offset: number): number {
  return view.getUint32(offset, true)
}

/**
 * Read ZIP central-directory sizes before JSZip starts an inflate. This uses
 * the ZIP format's public metadata for an early rejection, then readZipBytes
 * applies the same limit while each selected entry streams through JSZip.
 */
function inspectZipEntries(bytes: Uint8Array): Map<string, ZipEntryInfo> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const minEocdOffset = Math.max(0, bytes.byteLength - (22 + 0xffff))
  let eocdOffset = -1
  for (let offset = bytes.byteLength - 22; offset >= minEocdOffset; offset--) {
    if (offset >= 0 && readUint32(view, offset) === ZIP_EOCD_SIGNATURE) {
      const commentLength = readUint16(view, offset + 20)
      if (offset + 22 + commentLength === bytes.byteLength) {
        eocdOffset = offset
        break
      }
    }
  }
  if (eocdOffset < 0) throw new Error('Could not open this project file. Choose a valid .smp project.')

  const disk = readUint16(view, eocdOffset + 4)
  const centralDisk = readUint16(view, eocdOffset + 6)
  const entriesOnDisk = readUint16(view, eocdOffset + 8)
  const entryCount = readUint16(view, eocdOffset + 10)
  const centralSize = readUint32(view, eocdOffset + 12)
  const centralOffset = readUint32(view, eocdOffset + 16)
  if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount || entryCount > MAX_PORTABLE_PROJECT_ENTRIES) {
    throw new Error('This project archive uses an unsupported ZIP layout.')
  }
  if (centralOffset + centralSize > eocdOffset || centralOffset + centralSize > bytes.byteLength) {
    throw new Error('This project archive has an invalid directory.')
  }

  const entries = new Map<string, ZipEntryInfo>()
  let offset = centralOffset
  let totalUncompressed = 0
  for (let index = 0; index < entryCount; index++) {
    if (offset + 46 > bytes.byteLength || readUint32(view, offset) !== ZIP_CENTRAL_SIGNATURE) throw new Error('This project archive has an invalid directory entry.')
    const flags = readUint16(view, offset + 8)
    const compressedSize = readUint32(view, offset + 20)
    const uncompressedSize = readUint32(view, offset + 24)
    const nameLength = readUint16(view, offset + 28)
    const extraLength = readUint16(view, offset + 30)
    const commentLength = readUint16(view, offset + 32)
    const recordLength = 46 + nameLength + extraLength + commentLength
    if (offset + recordLength > bytes.byteLength || compressedSize > MAX_PORTABLE_PROJECT_BYTES || uncompressedSize > MAX_PORTABLE_PROJECT_UNCOMPRESSED_BYTES) {
      throw new Error('The project contents are too large to import safely.')
    }
    const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLength)
    let name: string
    try {
      name = new TextDecoder('utf-8', { fatal: Boolean(flags & 0x800) }).decode(nameBytes)
    } catch {
      throw new Error('This project archive contains an invalid file name.')
    }
    if (entries.has(name)) throw new Error(`The project archive contains duplicate entry "${name}".`)
    entries.set(name, { compressedSize, uncompressedSize })
    totalUncompressed += uncompressedSize
    if (totalUncompressed > MAX_PORTABLE_PROJECT_UNCOMPRESSED_BYTES) throw new Error('The project contents are too large to import safely.')
    offset += recordLength
  }
  if (offset !== centralOffset + centralSize) throw new Error('This project archive has an invalid directory size.')
  return entries
}

async function readZipBytes(file: JSZip.JSZipObject, maxBytes: number, label: string, budget: InflateBudget): Promise<Uint8Array> {
  let stream: JSZipStreamHelper<Uint8Array>
  try {
    stream = (file as StreamableZipObject).internalStream('uint8array')
  } catch (error) {
    throw new Error(`The project ${label} could not be read.`, { cause: error })
  }
  return new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Uint8Array[] = []
    let total = 0
    let settled = false
    const fail = (error: Error) => {
      if (settled) return
      settled = true
      stream.pause()
      reject(error)
    }
    stream
      .on('data', (chunk) => {
        if (settled) return
        total += chunk.byteLength
        if (total > maxBytes || budget.bytes + chunk.byteLength > MAX_PORTABLE_PROJECT_UNCOMPRESSED_BYTES) {
          fail(new Error(`The project ${label} is too large.`))
          return
        }
        budget.bytes += chunk.byteLength
        chunks.push(chunk)
      })
      .on('error', (error) => fail(new Error(`The project ${label} could not be read.`, { cause: error })))
      .on('end', () => {
        if (settled) return
        settled = true
        const bytes = new Uint8Array(total)
        let offset = 0
        for (const chunk of chunks) {
          bytes.set(chunk, offset)
          offset += chunk.byteLength
        }
        resolve(bytes)
      })
      .resume()
  })
}

async function readZipText(file: JSZip.JSZipObject, maxBytes: number, label: string, budget: InflateBudget): Promise<string> {
  const bytes = await readZipBytes(file, maxBytes, label, budget)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new Error(`The project ${label} is not valid UTF-8.`)
  }
}

function migrateLegacyManifest(value: unknown): unknown {
  if (!isRecord(value) || value.version !== LEGACY_PORTABLE_PROJECT_VERSION || !isRecord(value.state)) return value
  const rawState = value.state
  const rawVersionValue = rawState.measurementVersion
  const rawVersion = rawVersionValue === undefined ? 2 : typeof rawVersionValue === 'number' ? rawVersionValue : Number.NaN
  if (!Number.isInteger(rawVersion) || rawVersion < 1 || rawVersion > CANONICAL_MEASUREMENT_VERSION) {
    return {
      ...value,
      version: PORTABLE_PROJECT_VERSION,
      state: { ...rawState, measurementVersion: rawVersionValue },
    }
  }
  const migratedState = migrateMeasurements(rawState, rawVersion) as Record<string, unknown>
  return {
    ...value,
    version: PORTABLE_PROJECT_VERSION,
    state: {
      ...migratedState,
      showGrid: typeof rawState.showGrid === 'boolean' ? rawState.showGrid : true,
      gapSnapEnabled: typeof rawState.gapSnapEnabled === 'boolean' ? rawState.gapSnapEnabled : true,
    },
  }
}

/** Parse a current or explicitly supported legacy .smp manifest. */
function validateImportedManifest(value: unknown): ValidationResult<PortableProjectManifest> {
  const migrated = migrateLegacyManifest(value)
  return validatePortableManifest(migrated)
}

/**
 * Parse, schema-check, and decode a .smp file. Nothing in the current editor
 * is changed by this function; callers can confirm replacement afterward.
 */
export async function parsePortableProject(file: Blob): Promise<PortableProject> {
  if (!Number.isFinite(file.size) || file.size <= 0) throw new Error('The project file is empty.')
  if (file.size > MAX_PORTABLE_PROJECT_BYTES) {
    throw new Error(`The project file is too large. Maximum size is ${Math.round(MAX_PORTABLE_PROJECT_BYTES / (1024 * 1024))} MB.`)
  }

  let archiveBytes: ArrayBuffer
  let entryInfo: Map<string, ZipEntryInfo>
  try {
    archiveBytes = await file.arrayBuffer()
    entryInfo = inspectZipEntries(new Uint8Array(archiveBytes))
  } catch (error) {
    if (error instanceof Error && (error.message.includes('too large') || error.message.includes('unsupported') || error.message.includes('invalid'))) throw error
    throw new Error('Could not open this project file. Choose a valid .smp project.', { cause: error })
  }

  const manifestInfo = entryInfo.get(PORTABLE_PROJECT_MANIFEST)
  const fullInfo = entryInfo.get(PORTABLE_PROJECT_FULL_IMAGE)
  const proxyInfo = entryInfo.get(PORTABLE_PROJECT_PROXY_IMAGE)
  if (!manifestInfo) throw new Error('This project is missing manifest.json.')
  if (!fullInfo || !proxyInfo) throw new Error('This project is missing its source image payload.')
  if (manifestInfo.uncompressedSize > MAX_PORTABLE_PROJECT_MANIFEST_BYTES || fullInfo.uncompressedSize > MAX_PORTABLE_PROJECT_IMAGE_BYTES || proxyInfo.uncompressedSize > MAX_PORTABLE_PROJECT_IMAGE_BYTES) {
    throw new Error('The project contents are too large to import safely.')
  }

  let zip: JSZip
  try {
    const JSZip = await loadZipLibrary()
    zip = await JSZip.loadAsync(archiveBytes)
  } catch {
    throw new Error('Could not open this project file. Choose a valid .smp project.')
  }

  const manifestFile = zip.file(PORTABLE_PROJECT_MANIFEST)
  const fullFile = zip.file(PORTABLE_PROJECT_FULL_IMAGE)
  const proxyFile = zip.file(PORTABLE_PROJECT_PROXY_IMAGE)
  if (!manifestFile) throw new Error('This project is missing manifest.json.')
  if (!fullFile || !proxyFile) throw new Error('This project is missing its source image payload.')

  const inflateBudget: InflateBudget = { bytes: 0 }
  const manifestRaw = await readZipText(manifestFile, MAX_PORTABLE_PROJECT_MANIFEST_BYTES, 'manifest', inflateBudget)
  let manifestJson: unknown
  try {
    manifestJson = JSON.parse(manifestRaw)
  } catch {
    throw new Error('The project manifest is not valid JSON.')
  }
  const manifestResult = validateImportedManifest(manifestJson)
  if (!manifestResult.ok) throw new Error(manifestResult.error)

  const [fullUrl, proxyUrl] = await Promise.all([
    readZipText(fullFile, MAX_PORTABLE_PROJECT_IMAGE_BYTES, 'full-resolution image', inflateBudget),
    readZipText(proxyFile, MAX_PORTABLE_PROJECT_IMAGE_BYTES, 'preview image', inflateBudget),
  ])
  const project: PortableProject = {
    state: manifestResult.value.state,
    sourceImage: {
      ...manifestResult.value.sourceImage,
      fullUrl,
      proxyUrl,
    },
  }
  await validatePortableImageData(project)
  return project
}

export function projectFileName(sourceName: string): string {
  const base = sourceName.replace(/\.[^./\\]+$/, '').trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '')
  return `${base || 'slice-my-photo'}${PORTABLE_PROJECT_EXTENSION}`
}
