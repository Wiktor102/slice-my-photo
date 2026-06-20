import type { FrameStyle, ImageTransform, Panel, PerPanelFrame, Rect, SnapLines, SourceImage, Unit } from '../types'

export const CM_PER_INCH = 2.54
export const BASE_DPI = 300

export function toCm(value: number, unit: Unit): number {
  return unit === 'cm' ? value : value * CM_PER_INCH
}
export function fromCm(valueCm: number, unit: Unit): number {
  return unit === 'cm' ? valueCm : valueCm / CM_PER_INCH
}

export interface PanelGeometry {
  /** inner image-area rect (wall units) */
  inner: Rect
  /** outer frame rect (wall units) */
  outer: Rect
  /** visible (post-mat) rect (wall units) */
  visible: Rect
}

export function resolveFrame(panel: Panel, global: FrameStyle, perPanel: Record<string, PerPanelFrame>): PerPanelFrame {
  if (global.perPanel && perPanel[panel.id]) return perPanel[panel.id]
  return {
    edgeWidth: global.edgeWidth,
    colorKey: global.colorKey,
    customColor: global.customColor,
    matEnabled: global.matEnabled,
    matWidth: global.matWidth,
    matColorKey: global.matColorKey,
    matCustomColor: global.matCustomColor,
    shadow: global.shadow,
  }
}

export function panelGeometry(panel: Panel, frame: PerPanelFrame): PanelGeometry {
  const e = frame.edgeWidth
  const m = frame.matEnabled ? frame.matWidth : 0
  const inner: Rect = { x: panel.x, y: panel.y, w: panel.width, h: panel.height }
  const outer: Rect = { x: inner.x - e, y: inner.y - e, w: inner.w + 2 * e, h: inner.h + 2 * e }
  const visible: Rect = { x: inner.x + m, y: inner.y + m, w: inner.w - 2 * m, h: inner.h - 2 * m }
  return { inner, outer, visible }
}

export function boundingBox(geoms: PanelGeometry[]): Rect | null {
  if (geoms.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const g of geoms) {
    minX = Math.min(minX, g.visible.x)
    minY = Math.min(minY, g.visible.y)
    maxX = Math.max(maxX, g.visible.x + g.visible.w)
    maxY = Math.max(maxY, g.visible.y + g.visible.h)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/**
 * Image scale in wall-cm per source-pixel. Fill = cover, Fit = contain.
 */
export function imageScaleForMode(
  mode: ImageTransform['mode'],
  bbox: Rect,
  img: SourceImage,
  zoom: number,
): number {
  if (!bbox || img.nativeWidth === 0) return 1
  const fill = Math.max(bbox.w / img.nativeWidth, bbox.h / img.nativeHeight)
  const fit = Math.min(bbox.w / img.nativeWidth, bbox.h / img.nativeHeight)
  if (mode === 'fit') return fit
  if (mode === 'fill') return fill
  return fit * zoom
}

/**
 * Default pan centers the image over the bounding box.
 */
export function defaultPan(bbox: Rect, scale: number, img: SourceImage): { panX: number; panY: number } {
  if (!bbox) return { panX: 0, panY: 0 }
  const imgWCm = img.nativeWidth * scale
  const imgHCm = img.nativeHeight * scale
  return {
    panX: bbox.x - (imgWCm - bbox.w) / 2,
    panY: bbox.y - (imgHCm - bbox.h) / 2,
  }
}

export function clampPanelToWall(panel: Panel, frame: PerPanelFrame, wallW: number, wallH: number): Panel {
  const g = panelGeometry(panel, frame)
  const e = frame.edgeWidth
  let outerX = g.outer.x
  let outerY = g.outer.y
  if (outerX < 0) outerX = 0
  if (outerY < 0) outerY = 0
  if (outerX + g.outer.w > wallW) outerX = wallW - g.outer.w
  if (outerY + g.outer.h > wallH) outerY = wallH - g.outer.h
  return { ...panel, x: outerX + e, y: outerY + e }
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

export function panelsOverlap(geoms: PanelGeometry[], index: number): boolean {
  const target = geoms[index]
  for (let i = 0; i < geoms.length; i++) {
    if (i === index) continue
    if (rectsOverlap(target.outer, geoms[i].outer)) return true
  }
  return false
}

export const SNAP_TOLERANCE_PX = 6

export function computeSnaps(
  moving: Panel,
  movingFrame: PerPanelFrame,
  others: { panel: Panel; frame: PerPanelFrame }[],
  screenScale: number,
): { snap: SnapLines; offsetX: number; offsetY: number } {
  const tol = SNAP_TOLERANCE_PX / screenScale
  const mg = panelGeometry(moving, movingFrame)
  const movingCenters = {
    vx: [mg.outer.x, mg.outer.x + mg.outer.w / 2, mg.outer.x + mg.outer.w],
    hy: [mg.outer.y, mg.outer.y + mg.outer.h / 2, mg.outer.y + mg.outer.h],
  }
  const vertical: number[] = []
  const horizontal: number[] = []
  let offsetX = 0
  let offsetY = 0
  let bestVDist = tol + 1
  let bestHDist = tol + 1

  for (const { panel, frame } of others) {
    const g = panelGeometry(panel, frame)
    const targets = {
      vx: [g.outer.x, g.outer.x + g.outer.w / 2, g.outer.x + g.outer.w],
      hy: [g.outer.y, g.outer.y + g.outer.h / 2, g.outer.y + g.outer.h],
    }
    for (let mi = 0; mi < 3; mi++) {
      for (let ti = 0; ti < 3; ti++) {
        const d = targets.vx[ti] - movingCenters.vx[mi]
        if (Math.abs(d) < bestVDist) {
          bestVDist = Math.abs(d)
          offsetX = d
          vertical.push(targets.vx[ti])
        }
      }
    }
    for (let mi = 0; mi < 3; mi++) {
      for (let ti = 0; ti < 3; ti++) {
        const d = targets.hy[ti] - movingCenters.hy[mi]
        if (Math.abs(d) < bestHDist) {
          bestHDist = Math.abs(d)
          offsetY = d
          horizontal.push(targets.hy[ti])
        }
      }
    }
  }

  return {
    snap: { vertical, horizontal },
    offsetX: bestVDist <= tol ? offsetX : 0,
    offsetY: bestHDist <= tol ? offsetY : 0,
  }
}

/**
 * Effective DPI for a panel given the image scale (wall-cm per source-px).
 */
export function effectiveDpi(visibleWCm: number, scale: number): number {
  if (scale <= 0) return 0
  const sourcePixelsForPanel = visibleWCm / scale
  return sourcePixelsForPanel / (visibleWCm / CM_PER_INCH)
}

export function targetPixels(visibleWCm: number, bleedCm: number): number {
  return Math.round(((visibleWCm + bleedCm * 2) / CM_PER_INCH) * BASE_DPI)
}
