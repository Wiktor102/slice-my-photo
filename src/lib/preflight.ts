import type { FrameStyle, Panel, PerPanelFrame, Rect, SourceImage, Unit, WallSetup } from '../types'
import { CM_PER_INCH, panelGeometry, rectsOverlap, resolveFrame, toCm } from './geometry'

export type PreflightStatus = 'good' | 'warning' | 'error'
export type PreflightDpiBand = 'good' | 'warning' | 'error'

export interface ImagePlacement {
  scale: number
  panX: number
  panY: number
}

export interface SourceCoverage {
  sourceRect: Rect
  coveredRect: Rect | null
  coveredWidthPx: number
  coveredHeightPx: number
  coverageRatio: number
  missingEdges: Array<'left' | 'right' | 'top' | 'bottom'>
}

export interface PanelPreflight {
  index: number
  panelId: string
  dpi: number
  dpiBand: PreflightDpiBand
  status: PreflightStatus
  coverage: SourceCoverage
  overlaps: number[]
  outsideWall: Array<'left' | 'right' | 'top' | 'bottom'>
}

export interface PreflightReport {
  panels: PanelPreflight[]
  warningCount: number
  errorCount: number
  hasIssues: boolean
}

export interface PreflightInput {
  panels: Panel[]
  frame: FrameStyle
  perPanelFrame: Record<string, PerPanelFrame>
  wall: WallSetup
  unit: Unit
  sourceImage: SourceImage
  placement: ImagePlacement
}

const EPSILON = 1e-7

/**
 * Project a wall-space rectangle into source-image pixels.
 * `placement.scale` is wall units per source pixel, matching the canvas/export
 * placement calculation.
 */
export function sourceRectForWallRect(rect: Rect, placement: ImagePlacement): Rect {
  if (placement.scale <= 0 || !Number.isFinite(placement.scale)) {
    return { x: 0, y: 0, w: 0, h: 0 }
  }
  return {
    x: (rect.x - placement.panX) / placement.scale,
    y: (rect.y - placement.panY) / placement.scale,
    w: rect.w / placement.scale,
    h: rect.h / placement.scale,
  }
}

/**
 * Return the source pixels available for a crop and the edges where a crop
 * extends past the source image. This is shared by preflight and export so
 * both surfaces report the same coverage.
 */
export function sourceCoverageForRect(sourceRect: Rect, sourceWidth: number, sourceHeight: number): SourceCoverage {
  const sourceBounds: Rect = { x: 0, y: 0, w: Math.max(0, sourceWidth), h: Math.max(0, sourceHeight) }
  const right = sourceRect.x + sourceRect.w
  const bottom = sourceRect.y + sourceRect.h
  const missingEdges: SourceCoverage['missingEdges'] = []

  if (sourceRect.x < -EPSILON) missingEdges.push('left')
  if (right > sourceBounds.w + EPSILON) missingEdges.push('right')
  if (sourceRect.y < -EPSILON) missingEdges.push('top')
  if (bottom > sourceBounds.h + EPSILON) missingEdges.push('bottom')

  const x1 = Math.max(sourceBounds.x, sourceRect.x)
  const y1 = Math.max(sourceBounds.y, sourceRect.y)
  const x2 = Math.min(sourceBounds.x + sourceBounds.w, right)
  const y2 = Math.min(sourceBounds.y + sourceBounds.h, bottom)
  const coveredWidthPx = Math.max(0, x2 - x1)
  const coveredHeightPx = Math.max(0, y2 - y1)
  const coveredRect = coveredWidthPx > EPSILON && coveredHeightPx > EPSILON
    ? { x: x1, y: y1, w: coveredWidthPx, h: coveredHeightPx }
    : null
  const cropArea = Math.max(0, sourceRect.w) * Math.max(0, sourceRect.h)
  const coverageRatio = cropArea > EPSILON
    ? Math.max(0, Math.min(1, (coveredWidthPx * coveredHeightPx) / cropArea))
    : 0

  return {
    sourceRect,
    coveredRect,
    coveredWidthPx,
    coveredHeightPx,
    coverageRatio,
    missingEdges,
  }
}

export function dpiBand(dpi: number): PreflightDpiBand {
  if (dpi >= 300) return 'good'
  if (dpi >= 150) return 'warning'
  return 'error'
}

export function computePreflight(input: PreflightInput): PreflightReport {
  const { panels, frame, perPanelFrame, wall, unit, sourceImage, placement } = input
  const geoms = panels.map((panel) => panelGeometry(panel, resolveFrame(panel, frame, perPanelFrame)))

  const overlapIndexes = geoms.map((geom, index) => {
    const overlaps: number[] = []
    for (let otherIndex = 0; otherIndex < geoms.length; otherIndex++) {
      if (otherIndex !== index && rectsOverlap(geom.outer, geoms[otherIndex].outer)) overlaps.push(otherIndex)
    }
    return overlaps
  })

  const results = panels.map((panel, index): PanelPreflight => {
    const geom = geoms[index]
    const visible = geom.visible
    const sourceRect = sourceRectForWallRect(visible, placement)
    const coverage = sourceCoverageForRect(sourceRect, sourceImage.nativeWidth, sourceImage.nativeHeight)
    const visibleWCm = toCm(visible.w, unit)
    const visibleHCm = toCm(visible.h, unit)
    const dpiW = visibleWCm > 0 ? coverage.coveredWidthPx / (visibleWCm / CM_PER_INCH) : 0
    const dpiH = visibleHCm > 0 ? coverage.coveredHeightPx / (visibleHCm / CM_PER_INCH) : 0
    const dpi = Math.max(0, Math.min(dpiW, dpiH))
    const dpiBandValue = dpiBand(dpi)
    const outsideWall: PanelPreflight['outsideWall'] = []
    if (geom.outer.x < -EPSILON) outsideWall.push('left')
    if (geom.outer.y < -EPSILON) outsideWall.push('top')
    if (geom.outer.x + geom.outer.w > wall.width + EPSILON) outsideWall.push('right')
    if (geom.outer.y + geom.outer.h > wall.height + EPSILON) outsideWall.push('bottom')

    const hasCoverageGap = coverage.coverageRatio < 1 - EPSILON
    const hasLayoutIssue = hasCoverageGap || overlapIndexes[index].length > 0 || outsideWall.length > 0
    const status: PreflightStatus = dpiBandValue === 'error' || hasLayoutIssue
      ? 'error'
      : dpiBandValue === 'warning'
        ? 'warning'
        : 'good'

    return {
      index,
      panelId: panel.id,
      dpi,
      dpiBand: dpiBandValue,
      status,
      coverage,
      overlaps: overlapIndexes[index],
      outsideWall,
    }
  })

  return {
    panels: results,
    warningCount: results.filter((panel) => panel.status === 'warning').length,
    errorCount: results.filter((panel) => panel.status === 'error').length,
    hasIssues: results.some((panel) => panel.status !== 'good'),
  }
}
