import type { FrameStyle, ImageTransform, Panel, PerPanelFrame, Rect, SnapGuide, SourceImage, Unit } from '../types'
import { legacyPassepartout, MIN_OPENING_SIZE, normalizePassepartout } from './passepartout'

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
  const override = global.perPanel ? perPanel[panel.id] : undefined
  if (override) {
    return {
      ...override,
      passepartout: normalizePassepartout(panel, override),
    }
  }
  const pp = normalizePassepartout(panel, global)
  pp.colorKey = global.matColorKey ?? pp.colorKey
  pp.customColor = global.matCustomColor ?? pp.customColor
  return {
    edgeWidth: global.edgeWidth,
    colorKey: global.colorKey,
    customColor: global.customColor,
    shadow: global.shadow,
    passepartout: pp,
  }
}

export function panelGeometry(panel: Panel, frame: PerPanelFrame): PanelGeometry {
  const e = frame.edgeWidth
  const inner: Rect = { x: panel.x, y: panel.y, w: panel.width, h: panel.height }
  const outer: Rect = { x: inner.x - e, y: inner.y - e, w: inner.w + 2 * e, h: inner.h + 2 * e }
  const mat = frame.passepartout ?? legacyPassepartout(panel, frame)
  const visible = visibleRect(inner, mat.enabled ? mat : { ...mat, enabled: false })
  return { inner, outer, visible }
}

function clampMax(value: number, max: number): number {
  return Math.max(0, Math.min(value, max))
}

function visibleRect(inner: Rect, mat: PerPanelFrame['passepartout']): Rect {
  if (!mat.enabled) return { ...inner }

  if (mat.mode === 'opening') {
    const w = Math.max(MIN_OPENING_SIZE, Math.min(mat.openingWidth, inner.w))
    const h = Math.max(MIN_OPENING_SIZE, Math.min(mat.openingHeight, inner.h))
    return {
      x: inner.x + (inner.w - w) / 2,
      y: inner.y + (inner.h - h) / 2,
      w,
      h,
    }
  }

  if (mat.mode === 'margins') {
    const maxW = Math.max(0, inner.w - MIN_OPENING_SIZE)
    const left = clampMax(mat.marginLeft, maxW)
    const right = clampMax(mat.marginRight, Math.max(0, maxW - left))
    const maxH = Math.max(0, inner.h - MIN_OPENING_SIZE)
    const top = clampMax(mat.marginTop, maxH)
    const bottom = clampMax(mat.marginBottom, Math.max(0, maxH - top))
    return {
      x: inner.x + left,
      y: inner.y + top,
      w: Math.max(MIN_OPENING_SIZE, inner.w - left - right),
      h: Math.max(MIN_OPENING_SIZE, inner.h - top - bottom),
    }
  }

  const insetX = clampMax(mat.inset, Math.max(0, (inner.w - MIN_OPENING_SIZE) / 2))
  const insetY = clampMax(mat.inset, Math.max(0, (inner.h - MIN_OPENING_SIZE) / 2))
  return {
    x: inner.x + insetX,
    y: inner.y + insetY,
    w: Math.max(MIN_OPENING_SIZE, inner.w - 2 * insetX),
    h: Math.max(MIN_OPENING_SIZE, inner.h - 2 * insetY),
  }
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

/** Colors used for the different guide flavors. */
export const SNAP_COLOR_ALIGN = '#e070ff'
export const SNAP_COLOR_GAP = '#3fb960'
export const SNAP_COLOR_MID = '#e0a84b'
export const SNAP_COLOR_WALL = '#9a9aa8'

export type SnapKind = 'align' | 'gap' | 'mid' | 'wall'

export interface SnapContext {
  moving: Panel
  movingFrame: PerPanelFrame
  others: { panel: Panel; frame: PerPanelFrame }[]
  /** screen pixels per world unit */
  screenScale: number
  wall: { width: number; height: number }
  /** when false, gap + midpoint assists are disabled (alignment + wall still work) */
  gapSnapEnabled: boolean
  /** fallback target gap (e.g. the store gap) when no gap can be detected from others */
  fallbackGap: number
}

export interface SnapResult {
  vertical: SnapGuide[]
  horizontal: SnapGuide[]
  offsetX: number
  offsetY: number
  kindX: SnapKind | null
  kindY: SnapKind | null
  /** the gap value (world units) actually used on each axis, when a gap snap fired */
  gapX: number | null
  gapY: number | null
}

interface SnapCandidate {
  offset: number
  dist: number
  guides: SnapGuide[]
  kind: SnapKind
  /** tie-breaker: higher wins when dist is ~equal */
  priority: number
  /** gap value used, for gap-kind candidates */
  gap?: number
}

/**
 * Detect the dominant inter-panel gap along an axis by clustering nearby gaps.
 * Returns null when no aligned panel pairs exist.
 */
function detectDominantGap(geoms: Rect[], axis: 'x' | 'y'): number | null {
  const gaps: number[] = []
  for (let i = 0; i < geoms.length; i++) {
    for (let j = i + 1; j < geoms.length; j++) {
      const a = geoms[i]
      const b = geoms[j]
      if (axis === 'x') {
        const yOverlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
        if (yOverlap <= 0) continue
        if (a.x + a.w <= b.x + 1e-6) gaps.push(b.x - (a.x + a.w))
        else if (b.x + b.w <= a.x + 1e-6) gaps.push(a.x - (b.x + b.w))
      } else {
        const xOverlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
        if (xOverlap <= 0) continue
        if (a.y + a.h <= b.y + 1e-6) gaps.push(b.y - (a.y + a.h))
        else if (b.y + b.h <= a.y + 1e-6) gaps.push(a.y - (b.y + b.h))
      }
    }
  }
  if (gaps.length === 0) return null
  gaps.sort((a, b) => a - b)
  const CLUSTER = 0.5
  let bestCount = 1
  let bestAvg = gaps[0]
  let curCount = 1
  let curSum = gaps[0]
  for (let i = 1; i < gaps.length; i++) {
    if (gaps[i] - gaps[i - 1] <= CLUSTER) {
      curCount++
      curSum += gaps[i]
    } else {
      if (curCount > bestCount) {
        bestCount = curCount
        bestAvg = curSum / curCount
      }
      curCount = 1
      curSum = gaps[i]
    }
  }
  if (curCount > bestCount) bestAvg = curSum / curCount
  return Math.max(0, bestAvg)
}

export function computeSnaps(ctx: SnapContext): SnapResult {
  const { moving, movingFrame, others, screenScale, wall, gapSnapEnabled, fallbackGap } = ctx
  const tolAlign = SNAP_TOLERANCE_PX / screenScale
  const tolGap = (SNAP_TOLERANCE_PX + 4) / screenScale
  const tolMid = (SNAP_TOLERANCE_PX + 6) / screenScale
  const tolWall = SNAP_TOLERANCE_PX / screenScale

  const mg = panelGeometry(moving, movingFrame)
  const m = mg.outer
  const mLeft = m.x
  const mCx = m.x + m.w / 2
  const mRight = m.x + m.w
  const mTop = m.y
  const mCy = m.y + m.h / 2
  const mBottom = m.y + m.h

  const otherGeoms = others.map((o) => panelGeometry(o.panel, o.frame).outer)

  const targetGapX = detectDominantGap(otherGeoms, 'x') ?? Math.max(0, fallbackGap)
  const targetGapY = detectDominantGap(otherGeoms, 'y') ?? Math.max(0, fallbackGap)

  const xCands: SnapCandidate[] = []
  const yCands: SnapCandidate[] = []

  const pushCand = (arr: SnapCandidate[], c: SnapCandidate) => arr.push(c)

  for (const o of otherGeoms) {
    // --- alignment: edges + centers ---
    const tEdges = [o.x, o.x + o.w / 2, o.x + o.w]
    const tTops = [o.y, o.y + o.h / 2, o.y + o.h]
    for (const mv of [mLeft, mCx, mRight]) {
      for (const tv of tEdges) {
        const d = tv - mv
        const dist = Math.abs(d)
        if (dist <= tolAlign) pushCand(xCands, { offset: d, dist, guides: [{ pos: tv, color: SNAP_COLOR_ALIGN }], kind: 'align', priority: 0 })
      }
    }
    for (const mv of [mTop, mCy, mBottom]) {
      for (const tv of tTops) {
        const d = tv - mv
        const dist = Math.abs(d)
        if (dist <= tolAlign) pushCand(yCands, { offset: d, dist, guides: [{ pos: tv, color: SNAP_COLOR_ALIGN }], kind: 'align', priority: 0 })
      }
    }

    if (gapSnapEnabled) {
      // --- gap snap (X): place moving at targetGapX from this neighbor ---
      const rightSnap = o.x + o.w + targetGapX // moving.left when moving sits to the right
      const leftSnap = o.x - targetGapX // moving.right when moving sits to the left
      const dR = rightSnap - mLeft
      const dL = leftSnap - mRight
      if (Math.abs(dR) <= tolGap)
        pushCand(xCands, {
          offset: dR,
          dist: Math.abs(dR),
          guides: [{ pos: rightSnap, color: SNAP_COLOR_GAP }, { pos: o.x + o.w, color: SNAP_COLOR_GAP }],
          kind: 'gap',
          priority: 1,
          gap: targetGapX,
        })
      if (Math.abs(dL) <= tolGap)
        pushCand(xCands, {
          offset: dL,
          dist: Math.abs(dL),
          guides: [{ pos: leftSnap, color: SNAP_COLOR_GAP }, { pos: o.x, color: SNAP_COLOR_GAP }],
          kind: 'gap',
          priority: 1,
          gap: targetGapX,
        })
      // --- gap snap (Y) ---
      const belowSnap = o.y + o.h + targetGapY
      const aboveSnap = o.y - targetGapY
      const dB = belowSnap - mTop
      const dA = aboveSnap - mBottom
      if (Math.abs(dB) <= tolGap)
        pushCand(yCands, {
          offset: dB,
          dist: Math.abs(dB),
          guides: [{ pos: belowSnap, color: SNAP_COLOR_GAP }, { pos: o.y + o.h, color: SNAP_COLOR_GAP }],
          kind: 'gap',
          priority: 1,
          gap: targetGapY,
        })
      if (Math.abs(dA) <= tolGap)
        pushCand(yCands, {
          offset: dA,
          dist: Math.abs(dA),
          guides: [{ pos: aboveSnap, color: SNAP_COLOR_GAP }, { pos: o.y, color: SNAP_COLOR_GAP }],
          kind: 'gap',
          priority: 1,
          gap: targetGapY,
        })
    }
  }

  // --- midpoint / equal-gap snap between two neighbors ---
  if (gapSnapEnabled && otherGeoms.length >= 2) {
    for (let i = 0; i < otherGeoms.length; i++) {
      for (let j = i + 1; j < otherGeoms.length; j++) {
        const a = otherGeoms[i]
        const b = otherGeoms[j]
        // X: center moving between a and b horizontally (requires vertical overlap)
        const yOverlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
        if (yOverlap > 0) {
          const left = a.x < b.x ? a : b
          const right = a.x < b.x ? b : a
          const spaceL = left.x + left.w
          const spaceR = right.x
          const space = spaceR - spaceL
          if (space >= m.w - 1e-6) {
            const targetLeft = spaceL + (space - m.w) / 2
            const d = targetLeft - mLeft
            if (Math.abs(d) <= tolMid)
              pushCand(xCands, {
                offset: d,
                dist: Math.abs(d),
                guides: [{ pos: targetLeft, color: SNAP_COLOR_MID }, { pos: targetLeft + m.w, color: SNAP_COLOR_MID }],
                kind: 'mid',
                priority: 2,
              })
          }
        }
        // Y midpoint
        const xOverlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
        if (xOverlap > 0) {
          const top = a.y < b.y ? a : b
          const bottom = a.y < b.y ? b : a
          const spaceT = top.y + top.h
          const spaceB = bottom.y
          const space = spaceB - spaceT
          if (space >= m.h - 1e-6) {
            const targetTop = spaceT + (space - m.h) / 2
            const d = targetTop - mTop
            if (Math.abs(d) <= tolMid)
              pushCand(yCands, {
                offset: d,
                dist: Math.abs(d),
                guides: [{ pos: targetTop, color: SNAP_COLOR_MID }, { pos: targetTop + m.h, color: SNAP_COLOR_MID }],
                kind: 'mid',
                priority: 2,
              })
          }
        }
      }
    }
  }

  // --- wall center + wall edges ---
  {
    const xWall: { d: number; pos: number }[] = [
      { d: wall.width / 2 - mCx, pos: wall.width / 2 },
      { d: 0 - mLeft, pos: 0 },
      { d: wall.width - mRight, pos: wall.width },
    ]
    for (const c of xWall) {
      if (Math.abs(c.d) <= tolWall)
        pushCand(xCands, { offset: c.d, dist: Math.abs(c.d), guides: [{ pos: c.pos, color: SNAP_COLOR_WALL }], kind: 'wall', priority: 0 })
    }
    const yWall: { d: number; pos: number }[] = [
      { d: wall.height / 2 - mCy, pos: wall.height / 2 },
      { d: 0 - mTop, pos: 0 },
      { d: wall.height - mBottom, pos: wall.height },
    ]
    for (const c of yWall) {
      if (Math.abs(c.d) <= tolWall)
        pushCand(yCands, { offset: c.d, dist: Math.abs(c.d), guides: [{ pos: c.pos, color: SNAP_COLOR_WALL }], kind: 'wall', priority: 0 })
    }
  }

  const pickBest = (cands: SnapCandidate[]): { offset: number; guides: SnapGuide[]; kind: SnapKind | null; gap: number | null } => {
    if (cands.length === 0) return { offset: 0, guides: [], kind: null, gap: null }
    let best = cands[0]
    for (const c of cands) {
      if (c.dist < best.dist - 1e-9 || (Math.abs(c.dist - best.dist) <= 1e-9 && c.priority > best.priority)) best = c
    }
    return { offset: best.offset, guides: best.guides, kind: best.kind, gap: best.gap ?? null }
  }

  const bx = pickBest(xCands)
  const by = pickBest(yCands)

  return {
    vertical: bx.guides,
    horizontal: by.guides,
    offsetX: bx.offset,
    offsetY: by.offset,
    kindX: bx.kind,
    kindY: by.kind,
    gapX: bx.gap,
    gapY: by.gap,
  }
}

export function targetPixels(visibleWCm: number, bleedCm: number): number {
  return Math.round(((visibleWCm + bleedCm * 2) / CM_PER_INCH) * BASE_DPI)
}
