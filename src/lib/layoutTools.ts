import type { Rect } from '../types'

/** A panel's frame bounds plus its stable id, used by layout commands. */
export interface LayoutRect extends Rect {
  id: string
}

export type Alignment = 'start' | 'center' | 'end'

export interface LayoutPosition {
  id: string
  x: number
  y: number
}

/**
 * Keep an outer frame rectangle inside the wall whenever it can fit. A frame
 * wider/taller than the wall is anchored to the near edge; its dimensions are
 * deliberately left untouched so layout tools never change frame geometry.
 */
export function clampOuterPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  wallWidth: number,
  wallHeight: number,
): { x: number; y: number } {
  const maxX = Math.max(0, wallWidth - width)
  const maxY = Math.max(0, wallHeight - height)
  return {
    x: Math.max(0, Math.min(x, maxX)),
    y: Math.max(0, Math.min(y, maxY)),
  }
}

function bounds(rects: LayoutRect[]): Rect | null {
  if (rects.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const rect of rects) {
    minX = Math.min(minX, rect.x)
    minY = Math.min(minY, rect.y)
    maxX = Math.max(maxX, rect.x + rect.w)
    maxY = Math.max(maxY, rect.y + rect.h)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

function position(rect: LayoutRect, x: number, y: number, wallWidth: number, wallHeight: number): LayoutPosition {
  const clamped = clampOuterPosition(x, y, rect.w, rect.h, wallWidth, wallHeight)
  return { id: rect.id, ...clamped }
}

/** Align selected outer frames to the corresponding edge or center. */
export function alignRects(
  rects: LayoutRect[],
  axis: 'horizontal' | 'vertical',
  alignment: Alignment,
  wallWidth: number,
  wallHeight: number,
): LayoutPosition[] {
  const box = bounds(rects)
  if (!box) return []
  if (axis === 'horizontal') {
    const target = alignment === 'start'
      ? box.x
      : alignment === 'end'
        ? box.x + box.w
        : box.x + box.w / 2
    return rects.map((rect) => {
      const x = alignment === 'start' ? target : alignment === 'end' ? target - rect.w : target - rect.w / 2
      return position(rect, x, rect.y, wallWidth, wallHeight)
    })
  }
  const target = alignment === 'start'
    ? box.y
    : alignment === 'end'
      ? box.y + box.h
      : box.y + box.h / 2
  return rects.map((rect) => {
    const y = alignment === 'start' ? target : alignment === 'end' ? target - rect.h : target - rect.h / 2
    return position(rect, rect.x, y, wallWidth, wallHeight)
  })
}

/**
 * Distribute frames evenly between the first and last frame in reading order.
 * Existing outer sizes remain unchanged; only the middle frames move.
 */
export function distributeRects(
  rects: LayoutRect[],
  axis: 'horizontal' | 'vertical',
  wallWidth: number,
  wallHeight: number,
): LayoutPosition[] {
  if (rects.length < 3) return rects.map((rect) => position(rect, rect.x, rect.y, wallWidth, wallHeight))
  const sorted = rects
    .slice()
    .sort((a, b) => axis === 'horizontal' ? a.x - b.x || a.y - b.y : a.y - b.y || a.x - b.x)
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const span = axis === 'horizontal'
    ? last.x + last.w - first.x
    : last.y + last.h - first.y
  const totalSize = sorted.reduce((sum, rect) => sum + (axis === 'horizontal' ? rect.w : rect.h), 0)
  const gap = (span - totalSize) / (sorted.length - 1)
  let cursor = axis === 'horizontal' ? first.x : first.y
  const positions = new Map<string, LayoutPosition>()
  for (const rect of sorted) {
    const x = axis === 'horizontal' ? cursor : rect.x
    const y = axis === 'vertical' ? cursor : rect.y
    positions.set(rect.id, position(rect, x, y, wallWidth, wallHeight))
    cursor += (axis === 'horizontal' ? rect.w : rect.h) + gap
  }
  return rects.map((rect) => positions.get(rect.id)!)
}

/** Center the selected group as a whole on the wall without changing spacing. */
export function centerRectsOnWall(
  rects: LayoutRect[],
  wallWidth: number,
  wallHeight: number,
): LayoutPosition[] {
  const box = bounds(rects)
  if (!box) return []
  const dx = wallWidth / 2 - (box.x + box.w / 2)
  const dy = wallHeight / 2 - (box.y + box.h / 2)
  const minDx = box.w <= wallWidth ? -box.x : -box.x
  const maxDx = box.w <= wallWidth ? wallWidth - box.x - box.w : -box.x
  const minDy = box.h <= wallHeight ? -box.y : -box.y
  const maxDy = box.h <= wallHeight ? wallHeight - box.y - box.h : -box.y
  const safeDx = Math.max(minDx, Math.min(dx, maxDx))
  const safeDy = Math.max(minDy, Math.min(dy, maxDy))
  return rects.map((rect) => position(rect, rect.x + safeDx, rect.y + safeDy, wallWidth, wallHeight))
}

/** Move a group by a delta, applying one shared clamp to preserve its spacing. */
export function translateRects(
  rects: LayoutRect[],
  dx: number,
  dy: number,
  wallWidth: number,
  wallHeight: number,
): LayoutPosition[] {
  const box = bounds(rects)
  if (!box) return []
  const minDx = box.w <= wallWidth ? -box.x : -box.x
  const maxDx = box.w <= wallWidth ? wallWidth - box.x - box.w : -box.x
  const minDy = box.h <= wallHeight ? -box.y : -box.y
  const maxDy = box.h <= wallHeight ? wallHeight - box.y - box.h : -box.y
  const safeDx = Math.max(minDx, Math.min(dx, maxDx))
  const safeDy = Math.max(minDy, Math.min(dy, maxDy))
  return rects.map((rect) => position(rect, rect.x + safeDx, rect.y + safeDy, wallWidth, wallHeight))
}
