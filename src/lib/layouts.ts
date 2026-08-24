import type { SavedLayout } from '../types'

const STORAGE_KEY = 'wallart-saved-layouts'
export const MAX_LAYOUTS = 20

export type LayoutOperationResult = { ok: true } | { ok: false; error: string }

function readAll(): SavedLayout[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
  } catch {
    return []
  }
}

function writeAll(layouts: SavedLayout[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts))
}

export function getAllLayouts(): SavedLayout[] {
  return readAll().sort((a, b) => b.savedAt - a.savedAt)
}

export function saveLayout(layout: SavedLayout): LayoutOperationResult {
  try {
    const all = readAll()
    const existingIdx = all.findIndex((l) => l.name === layout.name && l.id !== layout.id)
    if (existingIdx !== -1) {
      all[existingIdx] = layout
    } else {
      if (all.length >= MAX_LAYOUTS) {
        return { ok: false, error: 'Maximum layouts reached. Delete an existing layout to save a new one.' }
      }
      all.push(layout)
    }
    writeAll(all)
    return { ok: true }
  } catch {
    return { ok: false, error: 'Could not save. Browser storage may be full.' }
  }
}

export function deleteLayout(id: string): void {
  const all = readAll().filter((l) => l.id !== id)
  writeAll(all)
}

export function renameLayout(id: string, name: string): LayoutOperationResult {
  const trimmed = name.trim()
  if (!trimmed) {
    return { ok: false, error: 'Name is required.' }
  }

  try {
    const all = readAll()
    const layout = all.find((l) => l.id === id)
    if (!layout) {
      return { ok: false, error: 'Layout not found.' }
    }
    if (all.some((l) => l.id !== id && l.name === trimmed)) {
      return { ok: false, error: 'A layout with this name already exists.' }
    }

    layout.name = trimmed
    writeAll(all)
    return { ok: true }
  } catch {
    return { ok: false, error: 'Could not rename. Browser storage may be full.' }
  }
}

export function getLayoutByName(name: string): SavedLayout | undefined {
  return readAll().find((l) => l.name === name)
}

export function makeLayoutId(): string {
  return `layout-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
