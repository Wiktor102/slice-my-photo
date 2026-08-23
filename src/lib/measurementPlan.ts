import type { FrameStyle, Panel, PerPanelFrame, Rect, Unit, WallSetup } from '../types'
import { panelGeometry, resolveFrame } from './geometry'

export const MEASUREMENT_ALIGNMENT_TOLERANCE = 0.5
export const HANGING_POINT_ASSUMPTION = 'Top center of the outer frame; no hardware or manufacturer offset is included.'

export interface MeasurementPlanInput {
  wall: WallSetup
  panels: Panel[]
  frame: FrameStyle
  perPanelFrame: Record<string, PerPanelFrame>
  unit: Unit
}

export interface WallCenterlines {
  /** vertical centerline X coordinate from the wall origin */
  verticalX: number
  /** horizontal centerline Y coordinate from the wall origin */
  horizontalY: number
}

export interface WallEdgeDistances {
  left: number
  right: number
  top: number
  bottom: number
}

export interface HangingPoint {
  /** top-center point on the outer frame, measured from the wall origin */
  x: number
  y: number
}

export interface MeasurementPanel {
  number: number
  id: string
  outer: Rect
  inner: Rect
  frameEdge: number
  wallDistances: WallEdgeDistances
  hangingPoint: HangingPoint
}

export type MeasurementGapOrientation = 'horizontal' | 'vertical'

export interface MeasurementGap {
  orientation: MeasurementGapOrientation
  from: number
  to: number
  gap: number
  /** dimension line endpoints in wall coordinates */
  line: { x1: number; y1: number; x2: number; y2: number }
}

export interface MeasurementPlan {
  wall: Pick<WallSetup, 'width' | 'height' | 'color'>
  unit: Unit
  centerlines: WallCenterlines
  panels: MeasurementPanel[]
  gaps: MeasurementGap[]
  hangingPointAssumption: string
}

function near(a: number, b: number, tolerance = MEASUREMENT_ALIGNMENT_TOLERANCE): boolean {
  return Math.abs(a - b) <= tolerance
}

function overlaps(aStart: number, aSize: number, bStart: number, bSize: number): boolean {
  return Math.min(aStart + aSize, bStart + bSize) >= Math.max(aStart, bStart) - 1e-6
}

function alignedOnAxis(a: Rect, b: Rect, axis: 'x' | 'y'): boolean {
  if (axis === 'x') {
    return near(a.x, b.x) || near(a.x + a.w / 2, b.x + b.w / 2) || near(a.x + a.w, b.x + b.w)
  }
  return near(a.y, b.y) || near(a.y + a.h / 2, b.y + b.h / 2) || near(a.y + a.h, b.y + b.h)
}

function panelGap(
  a: MeasurementPanel,
  b: MeasurementPanel,
  orientation: MeasurementGapOrientation,
): MeasurementGap | null {
  if (orientation === 'horizontal') {
    const left = a.outer.x <= b.outer.x ? a : b
    const right = left === a ? b : a
    const gap = right.outer.x - (left.outer.x + left.outer.w)
    if (gap < -1e-6 || !alignedOnAxis(left.outer, right.outer, 'y') || !overlaps(left.outer.y, left.outer.h, right.outer.y, right.outer.h)) return null
    const y = Math.max(left.outer.y, right.outer.y)
    return {
      orientation,
      from: left.number,
      to: right.number,
      gap: Math.max(0, gap),
      line: { x1: left.outer.x + left.outer.w, y1: y, x2: right.outer.x, y2: y },
    }
  }

  const top = a.outer.y <= b.outer.y ? a : b
  const bottom = top === a ? b : a
  const gap = bottom.outer.y - (top.outer.y + top.outer.h)
  if (gap < -1e-6 || !alignedOnAxis(top.outer, bottom.outer, 'x') || !overlaps(top.outer.x, top.outer.w, bottom.outer.x, bottom.outer.w)) return null
  const x = Math.max(top.outer.x, bottom.outer.x)
  return {
    orientation,
    from: top.number,
    to: bottom.number,
    gap: Math.max(0, gap),
    line: { x1: x, y1: top.outer.y + top.outer.h, x2: x, y2: bottom.outer.y },
  }
}

function adjacentGaps(panels: MeasurementPanel[], orientation: MeasurementGapOrientation): MeasurementGap[] {
  const found = new Map<string, MeasurementGap>()
  for (const panel of panels) {
    const candidates = panels
      .filter((other) => other.id !== panel.id)
      .map((other) => panelGap(panel, other, orientation))
      .filter((gap): gap is MeasurementGap => gap !== null)
      .sort((a, b) => a.gap - b.gap)
    const nearest = candidates[0]
    if (!nearest) continue
    const key = `${orientation}:${Math.min(nearest.from, nearest.to)}:${Math.max(nearest.from, nearest.to)}`
    found.set(key, nearest)
  }
  return [...found.values()].sort((a, b) => a.from - b.from || a.to - b.to)
}

/**
 * Build all installation measurements from frame-resolved outer geometry.
 * This function intentionally has no PDF or store dependencies, so its output
 * can be reviewed independently of the document renderer.
 */
export function buildMeasurementPlan(input: MeasurementPlanInput): MeasurementPlan {
  const { wall, panels, frame, perPanelFrame, unit } = input
  const measurementPanels = panels.map((panel, index) => {
    const resolved = resolveFrame(panel, frame, perPanelFrame)
    const geometry = panelGeometry(panel, resolved)
    const outer = geometry.outer
    return {
      number: index + 1,
      id: panel.id,
      outer: { ...outer },
      inner: { ...geometry.inner },
      frameEdge: resolved.edgeWidth,
      wallDistances: {
        left: outer.x,
        right: wall.width - (outer.x + outer.w),
        top: outer.y,
        bottom: wall.height - (outer.y + outer.h),
      },
      hangingPoint: {
        x: outer.x + outer.w / 2,
        y: outer.y,
      },
    }
  })

  return {
    wall: { width: wall.width, height: wall.height, color: wall.color },
    unit,
    centerlines: {
      verticalX: wall.width / 2,
      horizontalY: wall.height / 2,
    },
    panels: measurementPanels,
    gaps: [
      ...adjacentGaps(measurementPanels, 'horizontal'),
      ...adjacentGaps(measurementPanels, 'vertical'),
    ],
    hangingPointAssumption: HANGING_POINT_ASSUMPTION,
  }
}
