export type Unit = 'cm' | 'in'

export type FrameColorKey =
  | 'black'
  | 'white'
  | 'natural'
  | 'darkwood'
  | 'walnut'
  | 'gold'
  | 'silver'
  | 'custom'

export type MatColorKey = 'white' | 'offwhite' | 'black' | 'custom'

export type ImageMode = 'fill' | 'fit' | 'custom'

export type PassepartoutMode = 'inset' | 'opening' | 'margins'

export interface PassepartoutSettings {
  enabled: boolean
  mode: PassepartoutMode
  /** All dimensions are canonical millimeters. */
  inset: number
  openingWidth: number
  openingHeight: number
  marginTop: number
  marginRight: number
  marginBottom: number
  marginLeft: number
  colorKey: MatColorKey
  customColor: string
}

export interface Panel {
  id: string
  /** Inner image-area width in canonical millimeters. */
  width: number
  /** Inner image-area height in canonical millimeters. */
  height: number
  /** Inner image-area top-left X on the wall in canonical millimeters. */
  x: number
  /** Inner image-area top-left Y on the wall in canonical millimeters. */
  y: number
  /** selected size preset key, or 'custom' */
  sizePreset: string
  /** Unit used for this panel's preset and manual dimension fields. */
  displayUnit?: Unit
  /** lock aspect ratio when resizing via numeric fields */
  lockAspect?: boolean
  /** per-frame mat / passepartout settings */
  passepartout?: PassepartoutSettings
}

export interface FrameStyle {
  /** Dimensions are canonical millimeters. */
  edgeWidth: number
  colorKey: FrameColorKey
  customColor: string
  matEnabled: boolean
  matWidth: number
  matColorKey: MatColorKey
  matCustomColor: string
  shadow: boolean
  /** when true, frame style edits apply to selected panel only */
  perPanel: boolean
}

export interface PerPanelFrame {
  /** Dimensions are canonical millimeters. */
  edgeWidth: number
  colorKey: FrameColorKey
  customColor: string
  shadow: boolean
  passepartout: PassepartoutSettings
  /** legacy mat fields kept for older saved layouts */
  matEnabled?: boolean
  matWidth?: number
  matColorKey?: MatColorKey
  matCustomColor?: string
}

export interface WallSetup {
  /** Dimensions are canonical millimeters. */
  width: number
  height: number
  color: string
}

export interface ImageTransform {
  mode: ImageMode
  /** zoom multiplier over the fit scale, range [1, 5] */
  zoom: number
  /** Image top-left offset in canonical millimeters. */
  panX: number
  panY: number
}

export interface SourceImage {
  name: string
  nativeWidth: number
  nativeHeight: number
  proxyUrl: string
  fullUrl: string
  /** size of the longest side of the proxy in px */
  proxyMax: number
}

export interface Viewport {
  /** World x in canonical millimeters at the canvas origin (top-left). */
  x: number
  /** World y in canonical millimeters at the canvas origin. */
  y: number
  /** Screen pixels per canonical millimeter. */
  scale: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface SnapGuide {
  /** world coordinate of the guide line */
  pos: number
  /** stroke color for the guide line */
  color: string
}

export interface SnapLines {
  vertical: SnapGuide[]
  horizontal: SnapGuide[]
}

export interface SavedLayout {
  /** Canonical measurement schema version. Missing means legacy display-unit values. */
  measurementVersion?: number
  id: string
  name: string
  savedAt: number
  unit: Unit
  wall: WallSetup
  panels: Panel[]
  frame: FrameStyle
  perPanelFrame: Record<string, PerPanelFrame>
  gap: number
  currentSizeKey: string
  presetActive: string | null
}
