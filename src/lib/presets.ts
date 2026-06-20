import type { Panel, Unit } from '../types'
import { getPreset } from './frameSizes'

export interface PresetCell {
  col: number
  row: number
  colSpan: number
  rowSpan: number
}

export interface PresetDef {
  key: string
  name: string
  /** how to orient the chosen base size */
  orientation: 'portrait' | 'landscape' | 'keep'
  cols: number
  rows: number
  cells: PresetCell[]
}

export const PRESETS: PresetDef[] = [
  { key: '2h', name: '2H', orientation: 'landscape', cols: 2, rows: 1, cells: [{ col: 0, row: 0, colSpan: 1, rowSpan: 1 }, { col: 1, row: 0, colSpan: 1, rowSpan: 1 }] },
  { key: '2v', name: '2V', orientation: 'portrait', cols: 1, rows: 2, cells: [{ col: 0, row: 0, colSpan: 1, rowSpan: 1 }, { col: 0, row: 1, colSpan: 1, rowSpan: 1 }] },
  { key: 'triptych', name: 'Triptych', orientation: 'portrait', cols: 3, rows: 1, cells: [{ col: 0, row: 0, colSpan: 1, rowSpan: 1 }, { col: 1, row: 0, colSpan: 1, rowSpan: 1 }, { col: 2, row: 0, colSpan: 1, rowSpan: 1 }] },
  { key: '1+2', name: '1 + 2', orientation: 'portrait', cols: 2, rows: 2, cells: [{ col: 0, row: 0, colSpan: 1, rowSpan: 2 }, { col: 1, row: 0, colSpan: 1, rowSpan: 1 }, { col: 1, row: 1, colSpan: 1, rowSpan: 1 }] },
  { key: '2x2', name: '2×2 Grid', orientation: 'keep', cols: 2, rows: 2, cells: [{ col: 0, row: 0, colSpan: 1, rowSpan: 1 }, { col: 1, row: 0, colSpan: 1, rowSpan: 1 }, { col: 0, row: 1, colSpan: 1, rowSpan: 1 }, { col: 1, row: 1, colSpan: 1, rowSpan: 1 }] },
  { key: 'panoramic4', name: 'Panoramic 4', orientation: 'portrait', cols: 4, rows: 1, cells: [{ col: 0, row: 0, colSpan: 1, rowSpan: 1 }, { col: 1, row: 0, colSpan: 1, rowSpan: 1 }, { col: 2, row: 0, colSpan: 1, rowSpan: 1 }, { col: 3, row: 0, colSpan: 1, rowSpan: 1 }] },
  { key: '2+1+2', name: '2 + 1 + 2', orientation: 'portrait', cols: 3, rows: 2, cells: [{ col: 0, row: 0, colSpan: 1, rowSpan: 1 }, { col: 0, row: 1, colSpan: 1, rowSpan: 1 }, { col: 1, row: 0, colSpan: 1, rowSpan: 2 }, { col: 2, row: 0, colSpan: 1, rowSpan: 1 }, { col: 2, row: 1, colSpan: 1, rowSpan: 1 }] },
  { key: '3x2', name: '3×2 Grid', orientation: 'landscape', cols: 3, rows: 2, cells: [{ col: 0, row: 0, colSpan: 1, rowSpan: 1 }, { col: 1, row: 0, colSpan: 1, rowSpan: 1 }, { col: 2, row: 0, colSpan: 1, rowSpan: 1 }, { col: 0, row: 1, colSpan: 1, rowSpan: 1 }, { col: 1, row: 1, colSpan: 1, rowSpan: 1 }, { col: 2, row: 1, colSpan: 1, rowSpan: 1 }] },
]

let idCounter = 0
export function makePanelId(): string {
  idCounter += 1
  return `p-${Date.now().toString(36)}-${idCounter}`
}

function orient(w: number, h: number, o: PresetDef['orientation']): [number, number] {
  if (o === 'portrait') return w <= h ? [w, h] : [h, w]
  if (o === 'landscape') return w >= h ? [w, h] : [h, w]
  return [w, h]
}

/**
 * Instantiate a preset on the wall. Returns panel inner rects centered on the wall.
 */
export function instantiatePreset(
  preset: PresetDef,
  baseSizeKey: string,
  unit: Unit,
  gap: number,
  edgeWidth: number,
  wallW: number,
  wallH: number,
): Panel[] {
  const base = getPreset(unit, baseSizeKey) ?? { w: 40, h: 60 }
  const [bw, bh] = orient(base.w, base.h, preset.orientation)
  const cellOuterW = bw + 2 * edgeWidth
  const cellOuterH = bh + 2 * edgeWidth

  const panels: Panel[] = []
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const cell of preset.cells) {
    const outerW = cell.colSpan * cellOuterW + (cell.colSpan - 1) * gap
    const outerH = cell.rowSpan * cellOuterH + (cell.rowSpan - 1) * gap
    const outerX = cell.col * (cellOuterW + gap)
    const outerY = cell.row * (cellOuterH + gap)
    const innerX = outerX + edgeWidth
    const innerY = outerY + edgeWidth
    const innerW = outerW - 2 * edgeWidth
    const innerH = outerH - 2 * edgeWidth
    const isBase = cell.colSpan === 1 && cell.rowSpan === 1
    panels.push({
      id: makePanelId(),
      width: innerW,
      height: innerH,
      x: innerX,
      y: innerY,
      sizePreset: isBase ? baseSizeKey : 'custom',
    })
    minX = Math.min(minX, outerX)
    minY = Math.min(minY, outerY)
    maxX = Math.max(maxX, outerX + outerW)
    maxY = Math.max(maxY, outerY + outerH)
  }

  const groupW = maxX - minX
  const groupH = maxY - minY
  const offX = (wallW - groupW) / 2 - minX
  const offY = (wallH - groupH) / 2 - minY
  return panels.map((p) => ({ ...p, x: p.x + offX, y: p.y + offY }))
}
