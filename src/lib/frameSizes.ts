import type { Unit } from '../types'

export interface SizePreset {
  key: string
  label: string
  w: number
  h: number
}

export const FRAME_SIZES: Record<Unit, SizePreset[]> = {
  cm: [
    { key: 'cm-10x15', label: '10 × 15', w: 10, h: 15 },
    { key: 'cm-13x18', label: '13 × 18', w: 13, h: 18 },
    { key: 'cm-15x20', label: '15 × 20', w: 15, h: 20 },
    { key: 'cm-20x30', label: '20 × 30', w: 20, h: 30 },
    { key: 'cm-21x30', label: '21 × 30 (A4)', w: 21, h: 30 },
    { key: 'cm-24x30', label: '24 × 30', w: 24, h: 30 },
    { key: 'cm-30x40', label: '30 × 40', w: 30, h: 40 },
    { key: 'cm-30x45', label: '30 × 45', w: 30, h: 45 },
    { key: 'cm-40x50', label: '40 × 50', w: 40, h: 50 },
    { key: 'cm-40x60', label: '40 × 60', w: 40, h: 60 },
    { key: 'cm-50x60', label: '50 × 60', w: 50, h: 60 },
    { key: 'cm-50x70', label: '50 × 70', w: 50, h: 70 },
    { key: 'cm-60x80', label: '60 × 80', w: 60, h: 80 },
    { key: 'cm-60x90', label: '60 × 90', w: 60, h: 90 },
    { key: 'cm-70x100', label: '70 × 100', w: 70, h: 100 },
  ],
  in: [
    { key: 'in-4x6', label: '4 × 6', w: 4, h: 6 },
    { key: 'in-5x7', label: '5 × 7', w: 5, h: 7 },
    { key: 'in-8x10', label: '8 × 10', w: 8, h: 10 },
    { key: 'in-8x12', label: '8 × 12', w: 8, h: 12 },
    { key: 'in-11x14', label: '11 × 14', w: 11, h: 14 },
    { key: 'in-12x16', label: '12 × 16', w: 12, h: 16 },
    { key: 'in-16x20', label: '16 × 20', w: 16, h: 20 },
    { key: 'in-18x24', label: '18 × 24', w: 18, h: 24 },
    { key: 'in-20x24', label: '20 × 24', w: 20, h: 24 },
    { key: 'in-20x30', label: '20 × 30', w: 20, h: 30 },
    { key: 'in-24x36', label: '24 × 36', w: 24, h: 36 },
  ],
}

export function findPreset(unit: Unit, w: number, h: number): string {
  const list = FRAME_SIZES[unit]
  const match = list.find(
    (p) => (p.w === w && p.h === h) || (p.w === h && p.h === w),
  )
  return match ? match.key : 'custom'
}

export function getPreset(unit: Unit, key: string): SizePreset | null {
  if (key === 'custom') return null
  for (const unitList of Object.values(FRAME_SIZES)) {
    const found = unitList.find((p) => p.key === key)
    if (found) return found
  }
  return null
}
