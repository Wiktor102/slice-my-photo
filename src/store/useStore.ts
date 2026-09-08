import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  FrameStyle,
  ImageTransform,
  Panel,
  PerPanelFrame,
  PassepartoutSettings,
  SavedLayout,
  SourceImage,
  Unit,
  VariantSnapshot,
  Viewport,
  WallSetup,
} from '../types'
import { instantiatePreset, makePanelId, PRESETS } from '../lib/presets'
import { findPreset } from '../lib/frameSizes'
import { boundingBox, clampOuterPosition, clampPanelToWall, defaultPan, imageScaleForMode, panelGeometry, resolveFrame } from '../lib/geometry'
import { defaultPassepartout, legacyPassepartout, normalizePassepartout, rotatePassepartout } from '../lib/passepartout'
import { buildImageBlobs, buildSourceImage, isPersistable, megapixels, readImageDimensions } from '../lib/imageUtils'
import { idbSetImage, idbClearImage } from '../lib/idb'
import {
  CANONICAL_MEASUREMENT_VERSION,
  migrateFrame,
  migrateMeasurements,
  migratePerPanelFrame,
  migrateSavedLayout,
  migrateWall,
} from '../lib/migrations'
import { MIN_PANEL_SIZE_MM, MIN_WALL_SIZE_MM, toMm, unitFromPresetKey } from '../lib/units'
import { MIN_OPENING_SIZE } from '../lib/passepartout'

export type Screen = 'upload' | 'editor'

interface State {
  screen: Screen
  unit: Unit
  sourceImage: SourceImage | null
  imageLoading: boolean
  imageWarning: string | null

  wall: WallSetup
  panels: Panel[]
  selectedId: string | null
  imageSelected: boolean
  perPanelFrame: Record<string, PerPanelFrame>

  frame: FrameStyle
  image: ImageTransform
  presetActive: string | null
  gap: number
  currentSizeKey: string
  measurementVersion: number

  viewport: Viewport
  showGrid: boolean
  gapSnapEnabled: boolean
  preview: boolean
  exportOpen: boolean
  confirmReset: boolean
  homeOpen: boolean
  saveLayoutOpen: boolean
  loadLayoutOpen: boolean
  toast: string | null
  zoomToFitToken: number
  zoomToImageToken: number
  canvasSize: { w: number; h: number }

  // History is intentionally kept outside persisted project data. The
  // snapshots contain only durable, user-editable project settings.
  canUndo: boolean
  canRedo: boolean

  // actions
  setUnit: (u: Unit) => void
  loadImageFromFile: (file: File) => Promise<void>
  restoreImage: (img: SourceImage) => void
  clearImage: () => Promise<void>
  setScreen: (s: Screen) => void

  setWall: (partial: Partial<WallSetup>) => void

  applyPreset: (key: string) => void
  setGap: (g: number) => void
  setCurrentSizeKey: (key: string) => void
  addPanel: () => void
  deletePanel: (id: string) => void
  selectPanel: (id: string | null) => void
  selectImage: (b: boolean) => void
  updatePanel: (id: string, partial: Partial<Panel>) => void
  setPanelDisplayUnit: (id: string, unit: Unit) => void
  setPanelSize: (id: string, w: number, h: number, presetKey: string) => void
  setPanelOuterPosition: (id: string, outerX: number, outerY: number) => void
  orientPanel: (id: string) => void

  setFrame: (partial: Partial<FrameStyle>) => void
  resetFrameToGlobal: (id: string) => void
  updatePassepartout: (id: string, partial: Partial<PassepartoutSettings>) => void

  setImageMode: (mode: ImageTransform['mode']) => void
  setImageZoom: (z: number) => void
  setImagePan: (panX: number, panY: number) => void
  setImageTransform: (zoom: number, panX: number, panY: number) => void
  resetImage: () => void

  setViewport: (partial: Partial<Viewport>) => void
  requestZoomToFit: () => void
  requestZoomToImage: () => void
  setCanvasSize: (size: { w: number; h: number }) => void
  toggleGrid: () => void
  toggleGapSnap: () => void
  setPreview: (p: boolean) => void
  setExportOpen: (o: boolean) => void
  setConfirmReset: (c: boolean) => void
  setHomeOpen: (c: boolean) => void
  setSaveLayoutOpen: (o: boolean) => void
  setLoadLayoutOpen: (o: boolean) => void
  showToast: (msg: string) => void
  loadLayout: (layout: SavedLayout) => void
  loadVariant: (variant: VariantSnapshot) => void

  undo: () => void
  redo: () => void
  beginHistoryGroup: () => void
  endHistoryGroup: () => void

  resetProject: () => void
}

type ProjectSnapshot = Pick<
  State,
  'unit' | 'wall' | 'panels' | 'selectedId' | 'frame' | 'image' | 'presetActive' | 'gap' | 'currentSizeKey' | 'perPanelFrame'
>

interface HistoryGroup {
  before: ProjectSnapshot
  depth: number
}

const MAX_HISTORY_ENTRIES = 100

const DEFAULT_FRAME: FrameStyle = {
  edgeWidth: 20,
  colorKey: 'black',
  customColor: '#000000',
  matEnabled: false,
  matWidth: 30,
  matColorKey: 'white',
  matCustomColor: '#ffffff',
  shadow: true,
  perPanel: false,
}

const DEFAULT_IMAGE: ImageTransform = {
  mode: 'fill',
  zoom: 1,
  panX: 0,
  panY: 0,
}

const DEFAULT_WALL: WallSetup = { width: 3000, height: 2500, color: '#F5F5F5' }

function cloneProjectSnapshot(snapshot: ProjectSnapshot): ProjectSnapshot {
  return {
    unit: snapshot.unit,
    wall: { ...snapshot.wall },
    panels: snapshot.panels.map((panel) => ({
      ...panel,
      ...(panel.passepartout ? { passepartout: { ...panel.passepartout } } : {}),
    })),
    selectedId: snapshot.selectedId,
    frame: { ...snapshot.frame },
    image: { ...snapshot.image },
    presetActive: snapshot.presetActive,
    gap: snapshot.gap,
    currentSizeKey: snapshot.currentSizeKey,
    perPanelFrame: Object.fromEntries(
      Object.entries(snapshot.perPanelFrame).map(([id, panelFrame]) => [id, {
        ...panelFrame,
        passepartout: { ...panelFrame.passepartout },
      }]),
    ),
  }
}

function projectSnapshot(state: State): ProjectSnapshot {
  return cloneProjectSnapshot({
    unit: state.unit,
    wall: state.wall,
    panels: state.panels,
    selectedId: state.selectedId,
    frame: state.frame,
    image: state.image,
    presetActive: state.presetActive,
    gap: state.gap,
    currentSizeKey: state.currentSizeKey,
    perPanelFrame: state.perPanelFrame,
  })
}

function snapshotsEqual(a: ProjectSnapshot, b: ProjectSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function defaultSize(unit: Unit): [number, number] {
  return unit === 'cm' ? [400, 600] : [toMm(16, 'in'), toMm(20, 'in')]
}

function initialPassepartout(panel: Pick<Panel, 'width' | 'height' | 'sizePreset'>, frame: FrameStyle): PassepartoutSettings {
  return frame.matEnabled ? legacyPassepartout(panel, frame) : defaultPassepartout(panel)
}

export function normalizePersistedState(value: unknown, version = 2): unknown {
  const migrated = migrateMeasurements(value, version) as Partial<State>
  if (!migrated || !Array.isArray(migrated.panels)) return value

  // migrateMeasurements preserves an explicit panel passepartout, but it
  // cannot distinguish that from a panel which needs the legacy global mat
  // fallback after fields have been normalized. Keep that presence check on
  // the original persisted input instead of adding a marker to saved state.
  const rawPanels = value && typeof value === 'object' && Array.isArray((value as Record<string, unknown>).panels)
    ? (value as Record<string, unknown>).panels as unknown[]
    : []
  const hasExplicitPassepartout = (index: number): boolean => {
    const rawPanel = rawPanels[index]
    if (!rawPanel || typeof rawPanel !== 'object') return false
    const rawPassepartout = (rawPanel as Record<string, unknown>).passepartout
    return rawPassepartout !== undefined && rawPassepartout !== null
  }

  const frame = migrated.frame ?? DEFAULT_FRAME
  const shouldLiftLegacyMat = Boolean(frame.matEnabled)
  return {
    ...migrated,
    measurementVersion: CANONICAL_MEASUREMENT_VERSION,
    wall: migrateWall(migrated.wall, migrated.unit ?? 'cm', true),
    frame: migrateFrame(frame, migrated.unit ?? 'cm', true),
    perPanelFrame: migratePerPanelFrame(migrated.perPanelFrame, migrated.unit ?? 'cm', true),
    panels: migrated.panels.map((panel, index) => {
      const passepartout = shouldLiftLegacyMat && !hasExplicitPassepartout(index)
        ? legacyPassepartout(panel, frame)
        : normalizePassepartout(panel)
      return { ...panel, displayUnit: panel.displayUnit ?? unitFromPresetKey(panel.sizePreset) ?? migrated.unit ?? 'cm', passepartout }
    }),
  }
}

export const useStore = create<State>()(
  persist(
    (rawSet, get) => {
      const historyPast: ProjectSnapshot[] = []
      const historyFuture: ProjectSnapshot[] = []
      let historyGroup: HistoryGroup | null = null
      let toastTimer: ReturnType<typeof setTimeout> | null = null

      const syncHistoryAvailability = () => {
        rawSet({ canUndo: historyPast.length > 0, canRedo: historyFuture.length > 0 })
      }

      const commitHistoryEntry = (before: ProjectSnapshot, after: ProjectSnapshot) => {
        if (snapshotsEqual(before, after)) return
        historyPast.push(cloneProjectSnapshot(before))
        if (historyPast.length > MAX_HISTORY_ENTRIES) historyPast.shift()
        historyFuture.length = 0
        syncHistoryAvailability()
      }

      const flushHistoryGroup = () => {
        if (!historyGroup) return
        const group = historyGroup
        historyGroup = null
        commitHistoryEntry(group.before, projectSnapshot(get()))
      }

      const selectedIdForSnapshot = (snapshot: ProjectSnapshot): string | null =>
        snapshot.selectedId && snapshot.panels.some((panel) => panel.id === snapshot.selectedId)
          ? snapshot.selectedId
          : null

      const set: typeof rawSet = (partial, replace) => {
        const before = projectSnapshot(get())
        if (replace) {
          rawSet(partial as State | ((state: State) => State), true)
        } else {
          rawSet(partial as State | Partial<State> | ((state: State) => State | Partial<State>))
        }
        if (historyGroup) return
        commitHistoryEntry(before, projectSnapshot(get()))
      }

      const buildPresetPanels = (presetKey: string, sizeKey: string, gap: number): Panel[] | null => {
        const preset = PRESETS.find((p) => p.key === presetKey)
        if (!preset) return null
        const { unit, frame, wall } = get()
        return instantiatePreset(preset, sizeKey, unit, gap, frame.edgeWidth, wall.width, wall.height)
          .map((panel) => ({ ...panel, passepartout: initialPassepartout(panel, frame) }))
      }

      const clampPanelsToWall = (
        panels: Panel[],
        frame: FrameStyle,
        perPanelFrame: Record<string, PerPanelFrame>,
        wall: WallSetup,
      ) => panels.map((panel) => clampPanelToWall(panel, resolveFrame(panel, frame, perPanelFrame), wall.width, wall.height))

      return {
      screen: 'upload',
      unit: 'cm',
      measurementVersion: CANONICAL_MEASUREMENT_VERSION,
      sourceImage: null,
      imageLoading: false,
      imageWarning: null,

      wall: { ...DEFAULT_WALL },
      panels: [],
      selectedId: null,
      imageSelected: false,
      perPanelFrame: {},

      frame: { ...DEFAULT_FRAME },
      image: { ...DEFAULT_IMAGE },
      presetActive: null,
      gap: 30,
      currentSizeKey: 'cm-40x60',

      viewport: { x: 0, y: 0, scale: 0.3 },
      showGrid: true,
      gapSnapEnabled: true,
      preview: false,
      exportOpen: false,
      confirmReset: false,
      homeOpen: false,
      saveLayoutOpen: false,
      loadLayoutOpen: false,
      toast: null,
      zoomToFitToken: 0,
      zoomToImageToken: 0,
      canvasSize: { w: 0, h: 0 },
      canUndo: false,
      canRedo: false,

      setUnit: (u) => {
        const defaultKey = u === 'cm' ? 'cm-40x60' : 'in-16x20'
        set({ unit: u, currentSizeKey: defaultKey })
      },

      loadImageFromFile: async (file) => {
        // Uploading is asynchronous and the source image is intentionally not
        // part of project history. Keep the loading lifecycle out of history,
        // including the transform reset that accompanies a new source image.
        rawSet({ imageLoading: true, imageWarning: null })
        try {
          const dims = await readImageDimensions(file)
          const { proxyUrl, fullUrl } = await buildImageBlobs(file)
          const img = buildSourceImage(file, dims.width, dims.height, proxyUrl, fullUrl)
          const warn = megapixels(dims.width, dims.height) < 1
            ? `This image is low resolution (${dims.width}×${dims.height}px). Prints may look soft at large sizes.`
            : null
          let recoveryWarning: string | null = null
          if (!isPersistable(img.fullUrl)) {
            const cleared = await idbClearImage()
            recoveryWarning = cleared
              ? 'This image is too large to restore after a page reload. You can keep working, but refreshing will lose it.'
              : 'This image is too large to restore after a page reload. The current image stays active, but the browser could not clear previous recovery data. Refresh may restore an older image if one was already saved.'
          } else if (!(await idbSetImage(img))) {
            recoveryWarning = 'The browser could not save this image for recovery. The current image stays active, but refresh may restore an older image if one was already saved.'
          }
          rawSet({
            sourceImage: img,
            imageLoading: false,
            imageWarning: [warn, recoveryWarning].filter(Boolean).join(' ') || null,
            image: { ...DEFAULT_IMAGE },
          })
        } catch (e) {
          console.error(e)
          rawSet({ imageLoading: false, imageWarning: 'Could not load this image. Try a JPEG, PNG, or WebP file.' })
        }
      },

      restoreImage: (img) => rawSet({ sourceImage: img, screen: 'editor' }),

      clearImage: async () => {
        await idbClearImage()
        // Returning home clears the project as well as the image. Since the
        // image itself is not undoable, keep this navigation/reset atomic and
        // out of the project history instead of creating an unusable entry.
        rawSet({
          sourceImage: null,
          screen: 'upload',
          panels: [],
          selectedId: null,
          imageSelected: false,
          perPanelFrame: {},
          frame: { ...get().frame, perPanel: false },
          image: { ...DEFAULT_IMAGE },
        })
      },

      setScreen: (s) => rawSet({ screen: s }),

      setWall: (partial) => {
        const wall = { ...get().wall, ...partial }
        if (wall.width < MIN_WALL_SIZE_MM) wall.width = MIN_WALL_SIZE_MM
        if (wall.height < MIN_WALL_SIZE_MM) wall.height = MIN_WALL_SIZE_MM
        // clamp all panels into the new wall
        const { panels, frame, perPanelFrame } = get()
        const clamped = clampPanelsToWall(panels, frame, perPanelFrame, wall)
        set({ wall, panels: clamped })
      },

      applyPreset: (key) => {
        const panels = buildPresetPanels(key, get().currentSizeKey, get().gap)
        if (!panels) return
        set({
          panels,
          presetActive: key,
          selectedId: null,
          perPanelFrame: {},
          frame: { ...get().frame, perPanel: false },
          image: { ...DEFAULT_IMAGE },
        })
      },

      setGap: (g) => {
        const gap = Math.max(0, g)
        const { presetActive } = get()
        const panels = presetActive ? buildPresetPanels(presetActive, get().currentSizeKey, gap) : null
        if (!presetActive || !panels) {
          set({ gap })
          return
        }
        set({
          gap,
          panels,
          selectedId: null,
          perPanelFrame: {},
          frame: { ...get().frame, perPanel: false },
          image: { ...DEFAULT_IMAGE },
        })
      },

      setCurrentSizeKey: (key) => {
        const { presetActive, gap } = get()
        const panels = presetActive ? buildPresetPanels(presetActive, key, gap) : null
        if (!presetActive || !panels) {
          set({ currentSizeKey: key })
          return
        }
        set({
          currentSizeKey: key,
          panels,
          selectedId: null,
          perPanelFrame: {},
          frame: { ...get().frame, perPanel: false },
          image: { ...DEFAULT_IMAGE },
        })
      },

      addPanel: () => {
        const { panels, wall, unit, frame } = get()
        if (panels.length >= 8) return
        const [w, h] = defaultSize(unit)
        const innerX = (wall.width - w) / 2
        const innerY = (wall.height - h) / 2
        const sizePreset = findPreset(unit, w, h)
        const panel: Panel = { id: makePanelId(), width: w, height: h, x: innerX, y: innerY, sizePreset, displayUnit: unit, passepartout: initialPassepartout({ width: w, height: h, sizePreset }, frame) }
        set({ panels: [...panels, panel], selectedId: panel.id, presetActive: null })
      },

      deletePanel: (id) => {
        const { panels, selectedId, perPanelFrame, frame } = get()
        const next = panels.filter((p) => p.id !== id)
        const nextPer = { ...perPanelFrame }
        delete nextPer[id]
        const wasSelected = selectedId === id
        const updates: Partial<State> = {
          panels: next,
          selectedId: wasSelected ? null : selectedId,
          perPanelFrame: nextPer,
          presetActive: null,
        }
        if (wasSelected) updates.frame = { ...frame, perPanel: false }
        set(updates)
      },

      selectPanel: (id) => {
        const updates: Partial<State> = { selectedId: id, imageSelected: false }
        if (!id) updates.frame = { ...get().frame, perPanel: false }
        // Selection and its related UI mode are transient; changing them
        // should never add an undo entry or clone the project snapshot.
        rawSet(updates)
      },

      selectImage: (b) => {
        const updates: Partial<State> = { imageSelected: b, selectedId: b ? null : get().selectedId }
        if (b) updates.frame = { ...get().frame, perPanel: false }
        rawSet(updates)
      },

      updatePanel: (id, partial) => {
        const { unit, panels, frame, perPanelFrame, wall } = get()
        const nextPanels = panels.map((p) => {
          if (p.id !== id) return p
          const merged = { ...p, ...partial }
          if (partial.width !== undefined) merged.width = Math.max(MIN_PANEL_SIZE_MM, merged.width)
          if (partial.height !== undefined) merged.height = Math.max(MIN_PANEL_SIZE_MM, merged.height)
          if (partial.width !== undefined || partial.height !== undefined) {
            merged.sizePreset = findPreset(merged.displayUnit ?? unit, merged.width, merged.height)
          }
          return merged
        })
        set({
          panels: clampPanelsToWall(nextPanels, frame, perPanelFrame, wall),
          presetActive: null,
        })
      },

      setPanelDisplayUnit: (id, displayUnit) => {
        const { panels } = get()
        const nextPanels = panels.map((panel) => {
          if (panel.id !== id) return panel
          return {
            ...panel,
            displayUnit,
            sizePreset: findPreset(displayUnit, panel.width, panel.height),
          }
        })
        // Unit preference is presentation metadata. Keep all canonical
        // dimensions and positions byte-for-byte unchanged.
        set({ panels: nextPanels, presetActive: null })
      },

      setPanelSize: (id, w, h, presetKey) => {
        const width = Math.max(MIN_PANEL_SIZE_MM, w)
        const height = Math.max(MIN_PANEL_SIZE_MM, h)
        const { unit, panels, frame, perPanelFrame, wall } = get()
        const nextPanels = panels.map((p) => {
          if (p.id !== id) return p
          const displayUnit = unitFromPresetKey(presetKey) ?? p.displayUnit ?? unit
          const next = { ...p, width, height, sizePreset: presetKey, displayUnit }
          const current = normalizePassepartout(p)
          if (current.enabled) {
            if (current.mode === 'opening') {
              current.openingWidth = Math.max(MIN_OPENING_SIZE, Math.min(current.openingWidth, width))
              current.openingHeight = Math.max(MIN_OPENING_SIZE, Math.min(current.openingHeight, height))
            }
            if (current.mode === 'inset') {
              current.inset = Math.max(0, Math.min(current.inset, Math.min(width, height) / 2))
            }
          }
          return {
            ...next,
            passepartout: current.enabled
              ? current
              : defaultPassepartout({ width, height, sizePreset: presetKey === 'custom' ? findPreset(displayUnit, width, height) : presetKey }),
          }
        })
        set({
          panels: clampPanelsToWall(nextPanels, frame, perPanelFrame, wall),
          presetActive: null,
        })
      },

      setPanelOuterPosition: (id, outerX, outerY) => {
        const { frame, perPanelFrame, wall } = get()
        const panel = get().panels.find((p) => p.id === id)
        if (!panel) return
        const f = resolveFrame(panel, frame, perPanelFrame)
        const e = f.edgeWidth
        const g = panelGeometry(panel, f)
        const ox = clampOuterPosition(outerX, g.outer.w, wall.width)
        const oy = clampOuterPosition(outerY, g.outer.h, wall.height)
        set({
          panels: get().panels.map((p) => (p.id === id ? { ...p, x: ox + e, y: oy + e } : p)),
        })
      },

      orientPanel: (id) => {
        const { unit, panels, frame, perPanelFrame, wall } = get()
        const nextPanels = panels.map((p) =>
          p.id === id
            ? {
              ...p,
              width: p.height,
              height: p.width,
              sizePreset: findPreset(p.displayUnit ?? unit, p.height, p.width),
              passepartout: rotatePassepartout(p.passepartout),
            }
            : p,
        )
        set({
          panels: clampPanelsToWall(nextPanels, frame, perPanelFrame, wall),
          presetActive: null,
        })
      },

      setFrame: (partial) => {
        const { frame, perPanelFrame, selectedId, panels, wall } = get()
        if ('perPanel' in partial) {
          const nextFrame = {
            ...frame,
            ...partial,
            ...(partial.edgeWidth === undefined ? {} : { edgeWidth: Math.max(0, partial.edgeWidth) }),
            ...(partial.matWidth === undefined ? {} : { matWidth: Math.max(0, partial.matWidth) }),
          }
          set({ frame: nextFrame, panels: clampPanelsToWall(panels, nextFrame, perPanelFrame, wall) })
          return
        }
        if (frame.perPanel && selectedId) {
          const existing = perPanelFrame[selectedId] ?? {
            edgeWidth: frame.edgeWidth,
            colorKey: frame.colorKey,
            customColor: frame.customColor,
            shadow: frame.shadow,
            passepartout: normalizePassepartout(get().panels.find((p) => p.id === selectedId)!, frame),
          }
          const nextPerPanelFrame = {
            ...perPanelFrame,
            [selectedId]: {
              ...existing,
              ...partial,
              ...(partial.edgeWidth === undefined ? {} : { edgeWidth: Math.max(0, partial.edgeWidth) }),
              ...(partial.matWidth === undefined ? {} : { matWidth: Math.max(0, partial.matWidth) }),
            },
          }
          set({
            perPanelFrame: nextPerPanelFrame,
            panels: clampPanelsToWall(panels, frame, nextPerPanelFrame, wall),
          })
        } else {
          const nextFrame = {
            ...frame,
            ...partial,
            ...(partial.edgeWidth === undefined ? {} : { edgeWidth: Math.max(0, partial.edgeWidth) }),
            ...(partial.matWidth === undefined ? {} : { matWidth: Math.max(0, partial.matWidth) }),
          }
          set({ frame: nextFrame, panels: clampPanelsToWall(panels, nextFrame, perPanelFrame, wall) })
        }
      },

      resetFrameToGlobal: (id) => {
        const { perPanelFrame, frame, panels, wall } = get()
        const next = { ...perPanelFrame }
        delete next[id]
        set({ perPanelFrame: next, panels: clampPanelsToWall(panels, frame, next, wall) })
      },

      updatePassepartout: (id, partial) => {
        set({
          panels: get().panels.map((p) => {
            if (p.id !== id) return p
            const current = normalizePassepartout(p)
            const merged = { ...current, ...partial }
            if (merged.mode === 'opening') {
              merged.openingWidth = Math.max(MIN_OPENING_SIZE, Math.min(merged.openingWidth, p.width))
              merged.openingHeight = Math.max(MIN_OPENING_SIZE, Math.min(merged.openingHeight, p.height))
            }
            if (merged.mode === 'inset') {
              merged.inset = Math.max(0, Math.min(merged.inset, Math.min(p.width, p.height) / 2))
            }
            return { ...p, passepartout: merged }
          }),
        })
      },

      setImageMode: (mode) => set({ image: { ...get().image, mode } }),
      setImageZoom: (z) =>
        set((state) => {
          const newZoom = Math.max(1, Math.min(5, z))
          const { image, panels, frame, perPanelFrame } = state
          const bbox = panels.length === 0
            ? null
            : boundingBox(panels.map((p) => panelGeometry(p, resolveFrame(p, frame, perPanelFrame))))
          if (image.mode !== 'custom' || !bbox) {
            const fitScale = bbox && state.sourceImage
              ? imageScaleForMode('fit', bbox, state.sourceImage, 1) : 1
            const scale = fitScale * newZoom
            const pan = bbox && state.sourceImage
              ? defaultPan(bbox, scale, state.sourceImage) : { panX: 0, panY: 0 }
            return { image: { mode: 'custom', zoom: newZoom, panX: pan.panX, panY: pan.panY } }
          }
          const cx = bbox.x + bbox.w / 2
          const cy = bbox.y + bbox.h / 2
          const ratio = newZoom / image.zoom
          return {
            image: {
              mode: 'custom',
              zoom: newZoom,
              panX: cx - (cx - image.panX) * ratio,
              panY: cy - (cy - image.panY) * ratio,
            },
          }
        }),
      setImagePan: (panX, panY) => set({ image: { ...get().image, mode: 'custom', panX, panY } }),
      setImageTransform: (zoom, panX, panY) =>
        set({ image: { mode: 'custom', zoom: Math.max(1, Math.min(5, zoom)), panX, panY } }),
      resetImage: () => set({ image: { ...DEFAULT_IMAGE } }),

      setViewport: (partial) => rawSet({ viewport: { ...get().viewport, ...partial } }),
      requestZoomToFit: () => rawSet({ zoomToFitToken: get().zoomToFitToken + 1 }),
      requestZoomToImage: () => rawSet({ zoomToImageToken: get().zoomToImageToken + 1 }),
      setCanvasSize: (size) => rawSet({ canvasSize: size }),
      toggleGrid: () => rawSet({ showGrid: !get().showGrid }),
      toggleGapSnap: () => rawSet({ gapSnapEnabled: !get().gapSnapEnabled }),
      setPreview: (p) => rawSet({ preview: p }),
      setExportOpen: (o) => rawSet({ exportOpen: o }),
      setConfirmReset: (c) => rawSet({ confirmReset: c }),
      setHomeOpen: (c) => rawSet({ homeOpen: c }),
      setSaveLayoutOpen: (o) => rawSet({ saveLayoutOpen: o }),
      setLoadLayoutOpen: (o) => rawSet({ loadLayoutOpen: o }),
      showToast: (msg) => {
        if (toastTimer) clearTimeout(toastTimer)
        rawSet({ toast: msg })
        toastTimer = setTimeout(() => {
          toastTimer = null
          rawSet((s) => (s.toast === msg ? { toast: null } : {}))
        }, 2500)
      },
      loadLayout: (layout) => {
        const canonicalLayout = migrateSavedLayout(layout)
        const prevUnit = get().unit
        set({
          unit: canonicalLayout.unit,
          measurementVersion: CANONICAL_MEASUREMENT_VERSION,
          wall: { ...canonicalLayout.wall },
          panels: canonicalLayout.panels.map((p) => ({ ...p, passepartout: normalizePassepartout(p, canonicalLayout.frame) })),
          frame: { ...canonicalLayout.frame },
          perPanelFrame: Object.fromEntries(
            Object.entries(canonicalLayout.perPanelFrame).map(([id, panelFrame]) => [id, {
              ...panelFrame,
              passepartout: { ...panelFrame.passepartout },
            }]),
          ),
          gap: canonicalLayout.gap,
          currentSizeKey: canonicalLayout.currentSizeKey,
          presetActive: canonicalLayout.presetActive,
          selectedId: null,
          imageSelected: false,
          image: { ...DEFAULT_IMAGE },
          loadLayoutOpen: false,
        })
        if (canonicalLayout.unit !== prevUnit) {
          const label = canonicalLayout.unit === 'cm' ? 'cm' : 'inches'
          setTimeout(() => get().showToast(`Units switched to ${label} to match the loaded layout.`), 100)
        }
      },

      undo: () => {
        flushHistoryGroup()
        const previous = historyPast.pop()
        if (!previous) {
          syncHistoryAvailability()
          return
        }
        const current = projectSnapshot(get())
        historyFuture.unshift(current)
        const target = cloneProjectSnapshot(previous)
        const selectedId = selectedIdForSnapshot(target)
        rawSet({
          ...target,
          selectedId,
          ...(selectedId ? { imageSelected: false } : {}),
          canUndo: historyPast.length > 0,
          canRedo: historyFuture.length > 0,
        })
      },

      redo: () => {
        flushHistoryGroup()
        const next = historyFuture.shift()
        if (!next) {
          syncHistoryAvailability()
          return
        }
        const current = projectSnapshot(get())
        historyPast.push(current)
        const target = cloneProjectSnapshot(next)
        const selectedId = selectedIdForSnapshot(target)
        rawSet({
          ...target,
          selectedId,
          ...(selectedId ? { imageSelected: false } : {}),
          canUndo: historyPast.length > 0,
          canRedo: historyFuture.length > 0,
        })
      },

      beginHistoryGroup: () => {
        if (historyGroup) {
          historyGroup.depth += 1
          return
        }
        historyGroup = { before: projectSnapshot(get()), depth: 1 }
      },

      endHistoryGroup: () => {
        if (!historyGroup) return
        if (historyGroup.depth > 1) {
          historyGroup.depth -= 1
          return
        }
        flushHistoryGroup()
      },

      loadVariant: (variant) => {
        set({
          unit: variant.unit,
          wall: { ...variant.wall },
          panels: variant.panels.map((p) => ({ ...p, passepartout: normalizePassepartout(p, variant.frame) })),
          frame: { ...variant.frame },
          perPanelFrame: Object.fromEntries(
            Object.entries(variant.perPanelFrame).map(([id, panelFrame]) => [id, {
              ...panelFrame,
              passepartout: { ...panelFrame.passepartout },
            }]),
          ),
          image: { ...variant.image },
          gap: variant.gap,
          currentSizeKey: variant.currentSizeKey,
          presetActive: variant.presetActive,
          selectedId: null,
          imageSelected: false,
        })
      },

      resetProject: () =>
        set({
          panels: [],
          selectedId: null,
          imageSelected: false,
          perPanelFrame: {},
          wall: { ...DEFAULT_WALL },
          frame: { ...DEFAULT_FRAME },
          image: { ...DEFAULT_IMAGE },
          presetActive: null,
          gap: 30,
          viewport: { x: 0, y: 0, scale: 0.3 },
          preview: false,
          exportOpen: false,
          confirmReset: false,
        }),
    }
    },
    {
      name: 'slice-my-photo-state',
      version: CANONICAL_MEASUREMENT_VERSION,
      migrate: normalizePersistedState,
      partialize: (s) => ({
        measurementVersion: CANONICAL_MEASUREMENT_VERSION,
        unit: s.unit,
        wall: s.wall,
        panels: s.panels,
        selectedId: s.selectedId,
        perPanelFrame: s.perPanelFrame,
        frame: s.frame,
        image: s.image,
        presetActive: s.presetActive,
        gap: s.gap,
        currentSizeKey: s.currentSizeKey,
        viewport: s.viewport,
        showGrid: s.showGrid,
        gapSnapEnabled: s.gapSnapEnabled,
      }),
    },
  ),
)

/** Compute the current image placement (scale + pan) from state. */
export function useImagePlacement(): { scale: number; panX: number; panY: number; fitScale: number } {
  const panels = useStore((s) => s.panels)
  const frame = useStore((s) => s.frame)
  const perPanelFrame = useStore((s) => s.perPanelFrame)
  const image = useStore((s) => s.image)
  const sourceImage = useStore((s) => s.sourceImage)
  return computeImagePlacement(panels, frame, perPanelFrame, image, sourceImage)
}

export function computeImagePlacement(
  panels: Panel[],
  frame: FrameStyle,
  perPanelFrame: Record<string, PerPanelFrame>,
  image: ImageTransform,
  sourceImage: SourceImage | null,
): { scale: number; panX: number; panY: number; fitScale: number } {
  if (!sourceImage || panels.length === 0) return { scale: 1, panX: 0, panY: 0, fitScale: 1 }
  const geoms = panels.map((p) => panelGeometry(p, resolveFrame(p, frame, perPanelFrame)))
  const bbox = boundingBox(geoms)
  if (!bbox) return { scale: 1, panX: 0, panY: 0, fitScale: 1 }
  const fitScale = imageScaleForMode('fit', bbox, sourceImage, 1)
  const scale = imageScaleForMode(image.mode, bbox, sourceImage, image.zoom)
  if (image.mode === 'custom') {
    return { scale, panX: image.panX, panY: image.panY, fitScale }
  }
  return { scale, ...defaultPan(bbox, scale, sourceImage), fitScale }
}
