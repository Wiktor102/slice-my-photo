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

export const WALL_COLORS: { key: string; label: string; hex: string }[] = [
  { key: 'pure-white', label: 'Pure White', hex: '#FFFFFF' },
  { key: 'off-white', label: 'Off White', hex: '#FAF9F6' },
  { key: 'cloud-white', label: 'Cloud White', hex: '#F5F5F5' },
  { key: 'soft-gray', label: 'Soft Gray', hex: '#F0F0F0' },
  { key: 'light-gray', label: 'Light Gray', hex: '#E8E8E8' },
  { key: 'gray', label: 'Gray', hex: '#D0D0D0' },
  { key: 'cream', label: 'Cream', hex: '#F5F0E8' },
  { key: 'warm-beige', label: 'Warm Beige', hex: '#E8DCC8' },
  { key: 'light-blue', label: 'Light Blue', hex: '#D6E4F0' },
  { key: 'light-green', label: 'Light Green', hex: '#DCE8D8' },
  { key: 'light-pink', label: 'Light Pink', hex: '#F0D8D8' },
  { key: 'charcoal', label: 'Charcoal', hex: '#3A3A3A' },
]

export function frameHex(key: FrameColorKey, custom: string): string {
  return key === 'custom' ? custom : FRAME_COLORS[key].hex
}

export function matHex(key: MatColorKey, custom: string): string {
  return key === 'custom' ? custom : MAT_COLORS[key].hex
}
