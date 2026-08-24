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
  Viewport,
  WallSetup,
} from '../types'
import { instantiatePreset, makePanelId, PRESETS } from '../lib/presets'
import { findPreset, getPreset } from '../lib/frameSizes'
import { clampPanelToWall, defaultPan, imageScaleForMode, panelGeometry, resolveFrame } from '../lib/geometry'
import { defaultPassepartout, legacyPassepartout, normalizePassepartout, rotatePassepartout } from '../lib/passepartout'
import { buildImageBlobs, buildSourceImage, megapixels, readImageDimensions } from '../lib/imageUtils'
import { idbSetImage, idbClearImage } from '../lib/idb'

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

  undo: () => void
  redo: () => void
  beginHistoryGroup: () => void
  endHistoryGroup: () => void

  resetProject: () => void
}

type ProjectSnapshot = Pick<
  State,
  'unit' | 'wall' | 'panels' | 'frame' | 'image' | 'presetActive' | 'gap' | 'currentSizeKey' | 'perPanelFrame'
>

interface HistoryGroup {
  before: ProjectSnapshot
  depth: number
}

const MAX_HISTORY_ENTRIES = 100

const DEFAULT_FRAME: FrameStyle = {
  edgeWidth: 2,
  colorKey: 'black',
  customColor: '#000000',
  matEnabled: false,
  matWidth: 3,
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

const DEFAULT_WALL: WallSetup = { width: 300, height: 250, color: '#F5F5F5' }

function cloneProjectSnapshot(snapshot: ProjectSnapshot): ProjectSnapshot {
  return {
    unit: snapshot.unit,
    wall: { ...snapshot.wall },
    panels: snapshot.panels.map((panel) => ({
      ...panel,
      ...(panel.passepartout ? { passepartout: { ...panel.passepartout } } : {}),
    })),
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
  return unit === 'cm' ? [40, 60] : [16, 20]
}

function initialPassepartout(panel: Pick<Panel, 'width' | 'height' | 'sizePreset'>, frame: FrameStyle): PassepartoutSettings {
  return frame.matEnabled ? legacyPassepartout(panel, frame) : defaultPassepartout(panel)
}

function normalizePersistedState(value: unknown): unknown {
  const state = value as Partial<State> | undefined
  if (!state || !Array.isArray(state.panels)) return value

  const frame = state.frame ?? DEFAULT_FRAME
  const shouldLiftLegacyMat = Boolean(frame.matEnabled)
  return {
    ...state,
    panels: state.panels.map((panel) => {
      const passepartout = shouldLiftLegacyMat
        ? legacyPassepartout(panel, frame)
        : normalizePassepartout(panel)
      return { ...panel, passepartout }
    }),
  }
}

export const useStore = create<State>()(
  persist(
    (rawSet, get) => {
      const historyPast: ProjectSnapshot[] = []
      const historyFuture: ProjectSnapshot[] = []
      let historyGroup: HistoryGroup | null = null

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

      return {
      screen: 'upload',
      unit: 'cm',
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
      gap: 3,
      currentSizeKey: 'cm-40x60',

      viewport: { x: 0, y: 0, scale: 3 },
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
          await idbSetImage(img)
          rawSet({
            sourceImage: img,
            imageLoading: false,
            imageWarning: warn,
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
        if (wall.width < 10) wall.width = 10
        if (wall.height < 10) wall.height = 10
        // clamp all panels into the new wall
        const { panels, frame, perPanelFrame } = get()
        const clamped = panels.map((p) => clampPanelToWall(p, resolveFrame(p, frame, perPanelFrame), wall.width, wall.height))
        set({ wall, panels: clamped })
      },

      applyPreset: (key) => {
        const preset = PRESETS.find((p) => p.key === key)
        if (!preset) return
        const { unit, currentSizeKey, gap, frame, wall } = get()
        const panels = instantiatePreset(preset, currentSizeKey, unit, gap, frame.edgeWidth, wall.width, wall.height)
          .map((panel) => ({ ...panel, passepartout: initialPassepartout(panel, frame) }))
        set({
          panels,
          presetActive: key,
          selectedId: null,
          perPanelFrame: {},
          frame: { ...frame, perPanel: false },
          image: { ...DEFAULT_IMAGE },
        })
      },

      setGap: (g) => {
        const gap = Math.max(0, g)
        const { presetActive } = get()
        if (presetActive) {
          const preset = PRESETS.find((p) => p.key === presetActive)
          if (preset) {
            const { unit, currentSizeKey, frame, wall } = get()
            const panels = instantiatePreset(preset, currentSizeKey, unit, gap, frame.edgeWidth, wall.width, wall.height)
              .map((panel) => ({ ...panel, passepartout: initialPassepartout(panel, frame) }))
            set({ gap, panels, image: { ...DEFAULT_IMAGE } })
            return
          }
        }
        set({ gap })
      },

      setCurrentSizeKey: (key) => {
        const { presetActive } = get()
        if (presetActive) {
          const preset = PRESETS.find((p) => p.key === presetActive)
          if (preset) {
            const { unit, gap, frame, wall } = get()
            const panels = instantiatePreset(preset, key, unit, gap, frame.edgeWidth, wall.width, wall.height)
              .map((panel) => ({ ...panel, passepartout: initialPassepartout(panel, frame) }))
            set({ currentSizeKey: key, panels, image: { ...DEFAULT_IMAGE } })
            return
          }
        }
        set({ currentSizeKey: key })
      },

      addPanel: () => {
        const { panels, wall, unit, frame } = get()
        if (panels.length >= 8) return
        const [w, h] = defaultSize(unit)
        const innerX = (wall.width - w) / 2
        const innerY = (wall.height - h) / 2
        const sizePreset = findPreset(unit, w, h)
        const panel: Panel = { id: makePanelId(), width: w, height: h, x: innerX, y: innerY, sizePreset, passepartout: initialPassepartout({ width: w, height: h, sizePreset }, frame) }
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
        const { unit } = get()
        set({
          panels: get().panels.map((p) => {
            if (p.id !== id) return p
            const merged = { ...p, ...partial }
            if (partial.width !== undefined || partial.height !== undefined) {
              merged.sizePreset = findPreset(unit, merged.width, merged.height)
            }
            return merged
          }),
          presetActive: null,
        })
      },

      setPanelSize: (id, w, h, presetKey) => {
        const min = 10
        const width = Math.max(min, w)
        const height = Math.max(min, h)
        const unit = get().unit
        set({
          panels: get().panels.map((p) => {
            if (p.id !== id) return p
            const next = { ...p, width, height, sizePreset: presetKey }
            const current = normalizePassepartout(p)
            if (current.enabled) {
              if (current.mode === 'opening') {
                current.openingWidth = Math.max(1, Math.min(current.openingWidth, width))
                current.openingHeight = Math.max(1, Math.min(current.openingHeight, height))
              }
              if (current.mode === 'inset') {
                current.inset = Math.max(0, Math.min(current.inset, Math.min(width, height) / 2))
              }
            }
            return {
              ...next,
              passepartout: current.enabled
                ? current
                : defaultPassepartout({ width, height, sizePreset: presetKey === 'custom' ? findPreset(unit, width, height) : presetKey }),
            }
          }),
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
        let ox = outerX
        let oy = outerY
        if (ox < 0) ox = 0
        if (oy < 0) oy = 0
        if (ox + g.outer.w > wall.width) ox = wall.width - g.outer.w
        if (oy + g.outer.h > wall.height) oy = wall.height - g.outer.h
        set({
          panels: get().panels.map((p) => (p.id === id ? { ...p, x: ox + e, y: oy + e } : p)),
        })
      },

      orientPanel: (id) => {
        set({
          panels: get().panels.map((p) =>
            p.id === id
              ? {
                ...p,
                width: p.height,
                height: p.width,
                sizePreset: findPreset(get().unit, p.height, p.width),
                passepartout: rotatePassepartout(p.passepartout),
              }
              : p,
          ),
          presetActive: null,
        })
      },

      setFrame: (partial) => {
        const { frame, perPanelFrame, selectedId } = get()
        if ('perPanel' in partial) {
          set({ frame: { ...frame, ...partial } })
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
          set({ perPanelFrame: { ...perPanelFrame, [selectedId]: { ...existing, ...partial } } })
        } else {
          set({ frame: { ...frame, ...partial } })
        }
      },

      resetFrameToGlobal: (id) => {
        const { perPanelFrame } = get()
        const next = { ...perPanelFrame }
        delete next[id]
        set({ perPanelFrame: next })
      },

      updatePassepartout: (id, partial) => {
        set({
          panels: get().panels.map((p) => {
            if (p.id !== id) return p
            const current = normalizePassepartout(p)
            const merged = { ...current, ...partial }
            if (merged.mode === 'opening') {
              merged.openingWidth = Math.max(1, Math.min(merged.openingWidth, p.width))
              merged.openingHeight = Math.max(1, Math.min(merged.openingHeight, p.height))
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
          const bbox = (() => {
            if (panels.length === 0) return null
            const geoms = panels.map((p) => panelGeometry(p, resolveFrame(p, frame, perPanelFrame)))
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
            for (const g of geoms) {
              minX = Math.min(minX, g.visible.x)
              minY = Math.min(minY, g.visible.y)
              maxX = Math.max(maxX, g.visible.x + g.visible.w)
              maxY = Math.max(maxY, g.visible.y + g.visible.h)
            }
            return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
          })()
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
        rawSet({ toast: msg })
        setTimeout(() => rawSet((s) => (s.toast === msg ? { toast: null } : {})), 2500)
      },
      loadLayout: (layout) => {
        const prevUnit = get().unit
        set({
          unit: layout.unit,
          wall: { ...layout.wall },
          panels: layout.panels.map((p) => ({ ...p, passepartout: normalizePassepartout(p, layout.frame) })),
          frame: { ...layout.frame, perPanel: false },
          perPanelFrame: { ...layout.perPanelFrame },
          gap: layout.gap,
          currentSizeKey: layout.currentSizeKey,
          presetActive: layout.presetActive,
          selectedId: null,
          imageSelected: false,
          image: { ...DEFAULT_IMAGE },
          loadLayoutOpen: false,
        })
        if (layout.unit !== prevUnit) {
          const label = layout.unit === 'cm' ? 'cm' : 'inches'
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
        rawSet({
          ...target,
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
        rawSet({
          ...target,
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
          gap: 3,
          viewport: { x: 0, y: 0, scale: 3 },
          preview: false,
          exportOpen: false,
          confirmReset: false,
        }),
    }
    },
    {
      name: 'slice-my-photo-state',
      version: 2,
      migrate: normalizePersistedState,
      partialize: (s) => ({
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
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const g of geoms) {
    minX = Math.min(minX, g.visible.x)
    minY = Math.min(minY, g.visible.y)
    maxX = Math.max(maxX, g.visible.x + g.visible.w)
    maxY = Math.max(maxY, g.visible.y + g.visible.h)
  }
  const bbox = { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
  const fitScale = imageScaleForMode('fit', bbox, sourceImage, 1)
  const scale = imageScaleForMode(image.mode, bbox, sourceImage, image.zoom)
  if (image.mode === 'custom') {
    return { scale, panX: image.panX, panY: image.panY, fitScale }
  }
  return { scale, ...defaultPan(bbox, scale, sourceImage), fitScale }
}

// ensure getPreset import is used (kept for potential external use)
void getPreset
