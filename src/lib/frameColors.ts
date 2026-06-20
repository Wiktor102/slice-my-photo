import type { FrameColorKey, MatColorKey } from '../types'

export const FRAME_COLORS: Record<FrameColorKey, { label: string; hex: string }> = {
  black: { label: 'Black', hex: '#1a1a1a' },
  white: { label: 'White', hex: '#f4f4f0' },
  natural: { label: 'Natural Wood', hex: '#c8a274' },
  darkwood: { label: 'Dark Wood', hex: '#5a3a23' },
  walnut: { label: 'Walnut', hex: '#3d2417' },
  gold: { label: 'Gold', hex: '#c9a24a' },
  silver: { label: 'Silver', hex: '#b8b8c0' },
  custom: { label: 'Custom', hex: '#000000' },
}

export const MAT_COLORS: Record<MatColorKey, { label: string; hex: string }> = {
  white: { label: 'White', hex: '#ffffff' },
  offwhite: { label: 'Off-white', hex: '#f3efe6' },
  black: { label: 'Black', hex: '#1a1a1a' },
  custom: { label: 'Custom', hex: '#ffffff' },
}

export function frameHex(key: FrameColorKey, custom: string): string {
  return key === 'custom' ? custom : FRAME_COLORS[key].hex
}

export function matHex(key: MatColorKey, custom: string): string {
  return key === 'custom' ? custom : MAT_COLORS[key].hex
}
