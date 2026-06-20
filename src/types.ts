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

export interface Panel {
  id: string
  /** inner image-area width (unit) */
  width: number
  /** inner image-area height (unit) */
  height: number
  /** inner image-area top-left X on the wall (unit) */
  x: number
  /** inner image-area top-left Y on the wall (unit) */
  y: number
  /** selected size preset key, or 'custom' */
  sizePreset: string
  /** lock aspect ratio when resizing via numeric fields */
  lockAspect?: boolean
}

export interface FrameStyle {
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
  edgeWidth: number
  colorKey: FrameColorKey
  customColor: string
  matEnabled: boolean
  matWidth: number
  matColorKey: MatColorKey
  matCustomColor: string
  shadow: boolean
}

export interface WallSetup {
  width: number
  height: number
  color: string
}

export interface ImageTransform {
  mode: ImageMode
  /** zoom multiplier over the fit scale, range [1, 3] */
  zoom: number
  /** image top-left offset in wall units */
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
  /** world x (unit) at the canvas origin (top-left) */
  x: number
  /** world y (unit) at the canvas origin */
  y: number
  /** screen pixels per unit */
  scale: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface SnapLines {
  vertical: number[]
  horizontal: number[]
}
