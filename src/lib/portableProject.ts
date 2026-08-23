import JSZip from 'jszip'
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

export const PORTABLE_PROJECT_FORMAT = 'slice-my-photo'
export const PORTABLE_PROJECT_VERSION = 1
export const PORTABLE_PROJECT_EXTENSION = '.smp'
export const PORTABLE_PROJECT_MANIFEST = 'manifest.json'
export const PORTABLE_PROJECT_FULL_IMAGE = 'image/full.data'
export const PORTABLE_PROJECT_PROXY_IMAGE = 'image/proxy.data'
/** Guard archive input before JSZip allocates or inflates anything. */
export const MAX_PORTABLE_PROJECT_BYTES = 100 * 1024 * 1024

export interface PortableProjectState {
  unit: Unit
  wall: WallSetup
  panels: Panel[]
  frame: FrameStyle
  perPanelFrame: Record<string, PerPanelFrame>
  gap: number
  currentSizeKey: string
  presetActive: string | null
  image: ImageTransform
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

const FRAME_COLOR_KEYS: FrameColorKey[] = ['black', 'white', 'natural', 'darkwood', 'walnut', 'gold', 'silver', 'custom']
const MAT_COLOR_KEYS: MatColorKey[] = ['white', 'offwhite', 'black', 'custom']
const PASSEPARTOUT_MODES: PassepartoutMode[] = ['inset', 'opening', 'margins']
const IMAGE_MODES: ImageTransform['mode'][] = ['fill', 'fit', 'custom']
const IMAGE_DATA_URL_RE = /^data:image\/(?:jpeg|jpg|png|webp);base64,[a-z0-9+/]+={0,2}$/i

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

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isOneOf<T extends string>(value: unknown, values: T[]): value is T {
  return typeof value === 'string' && values.includes(value as T)
}

function validatePassepartout(value: unknown, path: string): string | null {
  if (!isRecord(value)) return `${path} must be an object.`
  if (typeof value.enabled !== 'boolean') return `${path}.enabled must be a boolean.`
  if (!isOneOf(value.mode, PASSEPARTOUT_MODES)) return `${path}.mode is invalid.`
  for (const key of ['inset', 'openingWidth', 'openingHeight', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft']) {
    if (!isNonNegativeNumber(value[key])) return `${path}.${key} must be a non-negative number.`
  }
  if (!isOneOf(value.colorKey, MAT_COLOR_KEYS)) return `${path}.colorKey is invalid.`
  if (!isString(value.customColor)) return `${path}.customColor must be a string.`
  return null
}

function validatePanel(value: unknown, index: number): string | null {
  const path = `state.panels[${index}]`
  if (!isRecord(value)) return `${path} must be an object.`
  if (!isString(value.id) || value.id.length === 0) return `${path}.id is required.`
  for (const key of ['width', 'height']) {
    if (!isPositiveNumber(value[key])) return `${path}.${key} must be greater than zero.`
  }
  for (const key of ['x', 'y']) {
    if (!isFiniteNumber(value[key])) return `${path}.${key} must be a finite number.`
  }
  if (!isString(value.sizePreset)) return `${path}.sizePreset must be a string.`
  if (value.lockAspect !== undefined && typeof value.lockAspect !== 'boolean') return `${path}.lockAspect must be a boolean.`
  return value.passepartout === undefined ? null : validatePassepartout(value.passepartout, `${path}.passepartout`)
}

function validateFrame(value: unknown, path: string): string | null {
  if (!isRecord(value)) return `${path} must be an object.`
  if (!isNonNegativeNumber(value.edgeWidth)) return `${path}.edgeWidth must be a non-negative number.`
  if (!isOneOf(value.colorKey, FRAME_COLOR_KEYS)) return `${path}.colorKey is invalid.`
  if (!isString(value.customColor)) return `${path}.customColor must be a string.`
  if (typeof value.matEnabled !== 'boolean') return `${path}.matEnabled must be a boolean.`
  if (!isNonNegativeNumber(value.matWidth)) return `${path}.matWidth must be a non-negative number.`
  if (!isOneOf(value.matColorKey, MAT_COLOR_KEYS)) return `${path}.matColorKey is invalid.`
  if (!isString(value.matCustomColor)) return `${path}.matCustomColor must be a string.`
  if (typeof value.shadow !== 'boolean') return `${path}.shadow must be a boolean.`
  if (typeof value.perPanel !== 'boolean') return `${path}.perPanel must be a boolean.`
  return null
}

function validatePerPanelFrames(value: unknown): string | null {
  if (!isRecord(value)) return 'state.perPanelFrame must be an object.'
  for (const [id, frame] of Object.entries(value)) {
    const path = `state.perPanelFrame.${id}`
    if (!isRecord(frame)) return `${path} must be an object.`
    if (!isNonNegativeNumber(frame.edgeWidth)) return `${path}.edgeWidth must be a non-negative number.`
    if (!isOneOf(frame.colorKey, FRAME_COLOR_KEYS)) return `${path}.colorKey is invalid.`
    if (!isString(frame.customColor)) return `${path}.customColor must be a string.`
    if (typeof frame.shadow !== 'boolean') return `${path}.shadow must be a boolean.`
    const passepartoutError = validatePassepartout(frame.passepartout, `state.perPanelFrame.${id}.passepartout`)
    if (passepartoutError) return passepartoutError
    for (const key of ['matEnabled', 'matWidth', 'matColorKey', 'matCustomColor']) {
      if (frame[key] === undefined) continue
      if (key === 'matEnabled' && typeof frame[key] !== 'boolean') return `${path}.${key} must be a boolean.`
      if (key === 'matWidth' && !isNonNegativeNumber(frame[key])) return `${path}.${key} must be a non-negative number.`
      if (key === 'matColorKey' && !isOneOf(frame[key], MAT_COLOR_KEYS)) return `${path}.${key} is invalid.`
      if (key === 'matCustomColor' && !isString(frame[key])) return `${path}.${key} must be a string.`
    }
  }
  return null
}

function validateState(value: unknown): string | null {
  if (!isRecord(value)) return 'manifest.state must be an object.'
  if (!isOneOf(value.unit, ['cm', 'in'])) return 'state.unit is invalid.'
  if (!isRecord(value.wall)) return 'state.wall must be an object.'
  if (!isPositiveNumber(value.wall.width) || value.wall.width < 10) return 'state.wall.width must be at least 10.'
  if (!isPositiveNumber(value.wall.height) || value.wall.height < 10) return 'state.wall.height must be at least 10.'
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
  if (!isNonNegativeNumber(value.gap)) return 'state.gap must be a non-negative number.'
  if (!isString(value.currentSizeKey)) return 'state.currentSizeKey must be a string.'
  if (value.presetActive !== null && !isString(value.presetActive)) return 'state.presetActive must be a string or null.'
  if (!isRecord(value.image)) return 'state.image must be an object.'
  if (!isOneOf(value.image.mode, IMAGE_MODES)) return 'state.image.mode is invalid.'
  if (!isFiniteNumber(value.image.zoom) || value.image.zoom < 1 || value.image.zoom > 3) return 'state.image.zoom must be between 1 and 3.'
  if (!isFiniteNumber(value.image.panX) || !isFiniteNumber(value.image.panY)) return 'state.image pan values must be finite numbers.'
  return null
}

function validateImageManifest(value: unknown): string | null {
  if (!isRecord(value)) return 'manifest.sourceImage must be an object.'
  if (!isString(value.name)) return 'sourceImage.name must be a string.'
  if (!Number.isInteger(value.nativeWidth) || !isPositiveNumber(value.nativeWidth)) return 'sourceImage.nativeWidth is invalid.'
  if (!Number.isInteger(value.nativeHeight) || !isPositiveNumber(value.nativeHeight)) return 'sourceImage.nativeHeight is invalid.'
  if (!Number.isInteger(value.proxyMax) || !isPositiveNumber(value.proxyMax)) return 'sourceImage.proxyMax is invalid.'
  if (value.fullPath !== PORTABLE_PROJECT_FULL_IMAGE) return 'sourceImage.fullPath is invalid.'
  if (value.proxyPath !== PORTABLE_PROJECT_PROXY_IMAGE) return 'sourceImage.proxyPath is invalid.'
  return null
}

/** Validate the JSON manifest without touching browser APIs or image data. */
export function validatePortableManifest(value: unknown): ValidationResult<PortableProjectManifest> {
  if (!isRecord(value)) return { ok: false, error: 'The project manifest must be a JSON object.' }
  if (value.format !== PORTABLE_PROJECT_FORMAT) return { ok: false, error: 'This file is not a Slice My Photo project.' }
  if (value.version !== PORTABLE_PROJECT_VERSION) {
    return { ok: false, error: `Unsupported project version. Expected ${PORTABLE_PROJECT_VERSION}.` }
  }
  if (!isString(value.createdAt)) return { ok: false, error: 'The project manifest has no creation timestamp.' }
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

export async function serializePortableProject(project: PortableProject): Promise<Blob> {
  const manifest = buildPortableManifest(project)
  const manifestCheck = validatePortableManifest(manifest)
  if (!manifestCheck.ok) throw new Error(manifestCheck.error)
  if (!isImageDataUrl(project.sourceImage.fullUrl) || !isImageDataUrl(project.sourceImage.proxyUrl)) {
    throw new Error('The current source image is not stored in a portable data format.')
  }

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
  if (!isImageDataUrl(project.sourceImage.fullUrl)) throw imageDataError('full')
  if (!isImageDataUrl(project.sourceImage.proxyUrl)) throw imageDataError('preview')

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
  if (project.sourceImage.proxyUrl !== project.sourceImage.fullUrl && Math.max(proxy.naturalWidth, proxy.naturalHeight) > project.sourceImage.proxyMax) {
    throw new Error('The project preview image exceeds its declared size limit.')
  }
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

  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(file)
  } catch {
    throw new Error('Could not open this project file. Choose a valid .smp project.')
  }

  const manifestFile = zip.file(PORTABLE_PROJECT_MANIFEST)
  if (!manifestFile) throw new Error('This project is missing manifest.json.')

  let manifestRaw: string
  try {
    manifestRaw = await manifestFile.async('string')
  } catch {
    throw new Error('The project manifest could not be read.')
  }

  let manifestJson: unknown
  try {
    manifestJson = JSON.parse(manifestRaw)
  } catch {
    throw new Error('The project manifest is not valid JSON.')
  }
  const manifestResult = validatePortableManifest(manifestJson)
  if (!manifestResult.ok) throw new Error(manifestResult.error)

  const fullFile = zip.file(PORTABLE_PROJECT_FULL_IMAGE)
  const proxyFile = zip.file(PORTABLE_PROJECT_PROXY_IMAGE)
  if (!fullFile || !proxyFile) throw new Error('This project is missing its source image payload.')

  let fullUrl: string
  let proxyUrl: string
  try {
    [fullUrl, proxyUrl] = await Promise.all([fullFile.async('string'), proxyFile.async('string')])
  } catch {
    throw new Error('The project image payload could not be read.')
  }

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
