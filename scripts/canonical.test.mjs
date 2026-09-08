import assert from 'node:assert/strict'
import { createServer } from 'vite'

const storage = new Map()
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
  key: (index) => [...storage.keys()][index] ?? null,
  get length() { return storage.size },
}
globalThis.window = { localStorage: globalThis.localStorage }

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const {
    fromMm,
    toMm,
    GAP_CLUSTER_TOLERANCE_MM,
    EXPORT_ADJACENCY_ALIGNMENT_TOLERANCE_MM,
    EXPORT_ADJACENCY_START_TOLERANCE_MM,
    EXPORT_ADJACENCY_MAX_GAP_MM,
    EXPORT_MIN_GAP_LABEL_MM,
    PANEL_SHADOW_BLUR_MM,
    PANEL_SHADOW_OFFSET_Y_MM,
    VIEWPORT_FIT_MIN_SCALE_PX_PER_MM,
    VIEWPORT_WHEEL_MAX_SCALE_PX_PER_MM,
    VIEWPORT_WHEEL_MIN_SCALE_PX_PER_MM,
    VIEWPORT_CONTROL_MIN_SCALE_PX_PER_MM,
    VIEWPORT_CONTROL_MAX_SCALE_PX_PER_MM,
    VIEWPORT_CONTROL_STEP_PX_PER_MM,
    viewportZoomPercent,
  } = await server.ssrLoadModule('/src/lib/units.ts')
  const { migrateMeasurements, migrateSavedLayout } = await server.ssrLoadModule('/src/lib/migrations.ts')
  const { buildMeasurementPlan } = await server.ssrLoadModule('/src/lib/measurementPlan.ts')
  const { niceViewportStepMm } = await server.ssrLoadModule('/src/lib/viewport.ts')
  const { FRAME_SIZES, findPreset } = await server.ssrLoadModule('/src/lib/frameSizes.ts')
  const { PRESETS, instantiatePreset } = await server.ssrLoadModule('/src/lib/presets.ts')
  const { normalizePersistedState, useStore } = await server.ssrLoadModule('/src/store/useStore.ts')

  assert.equal(toMm(1, 'cm'), 10)
  assert.equal(toMm(1, 'in'), 25.4)
  assert.equal(fromMm(25.4, 'in'), 1)
  assert.equal(VIEWPORT_FIT_MIN_SCALE_PX_PER_MM, 0.02)
  assert.equal(VIEWPORT_WHEEL_MIN_SCALE_PX_PER_MM, 0.02)
  assert.equal(VIEWPORT_WHEEL_MAX_SCALE_PX_PER_MM, 4)
  assert.equal(VIEWPORT_CONTROL_MIN_SCALE_PX_PER_MM, 0.01)
  assert.equal(VIEWPORT_CONTROL_MAX_SCALE_PX_PER_MM, 0.5)
  assert.equal(VIEWPORT_CONTROL_STEP_PX_PER_MM, 0.025)
  assert.equal(viewportZoomPercent(0.3), 300)
  assert.equal(GAP_CLUSTER_TOLERANCE_MM, 5)
  assert.equal(EXPORT_ADJACENCY_ALIGNMENT_TOLERANCE_MM, 20)
  assert.equal(EXPORT_ADJACENCY_START_TOLERANCE_MM, 5)
  assert.equal(EXPORT_ADJACENCY_MAX_GAP_MM, 500)
  assert.equal(EXPORT_MIN_GAP_LABEL_MM, 1)
  assert.equal(PANEL_SHADOW_BLUR_MM, 180)
  assert.equal(PANEL_SHADOW_OFFSET_Y_MM, 60)

  const legacy = {
    unit: 'in',
    wall: { width: 100, height: 50, color: '#fff' },
    panels: [{
      id: 'legacy-panel', width: 16, height: 20, x: 2, y: 3,
      sizePreset: 'in-16x20',
      passepartout: {
        enabled: true, mode: 'inset', inset: 1, openingWidth: 14, openingHeight: 18,
        marginTop: 1, marginRight: 1, marginBottom: 1, marginLeft: 1,
        colorKey: 'white', customColor: '#fff',
      },
    }],
    frame: { edgeWidth: 1, matEnabled: true, matWidth: 0.5 },
    perPanelFrame: {},
    gap: 3,
    image: { mode: 'custom', zoom: 1, panX: 4, panY: 5 },
    viewport: { x: 6, y: 7, scale: 3 },
  }
  const migrated = migrateMeasurements(legacy, 2)
  const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`)
  assert.equal(niceViewportStepMm(70, 0.3, 'cm'), 200)
  assert.equal(niceViewportStepMm(50, 0.3, 'cm'), 200)
  assert.equal(niceViewportStepMm(70, 0.3, 'in'), 254)
  assert.equal(niceViewportStepMm(50, 0.3, 'in'), 127)
  close(migrated.wall.width, 2540)
  close(migrated.panels[0].width, 406.4)
  close(migrated.panels[0].passepartout.inset, 25.4)
  close(migrated.frame.edgeWidth, 25.4)
  close(migrated.gap, 76.2)
  close(migrated.image.panX, 101.6)
  close(migrated.viewport.x, 152.4)
  close(migrated.viewport.scale, 3 / 25.4)
  assert.deepEqual(migrateMeasurements(migrated, 2), migrated)

  const saved = migrateSavedLayout({
    id: 'legacy-layout', name: 'Legacy', savedAt: 1, ...legacy,
    currentSizeKey: 'in-16x20', presetActive: null,
  })
  assert.equal(saved.measurementVersion, 3)
  assert.equal(saved.panels[0].displayUnit, 'in')
  assert.equal(saved.wall.width, 2540)

  const sparseCm = migrateMeasurements({ unit: 'cm', panels: [], perPanelFrame: [{}] }, 2)
  assert.equal(sparseCm.frame.edgeWidth, 20)
  assert.equal(sparseCm.frame.matWidth, 30)
  assert.equal(sparseCm.perPanelFrame['0'].edgeWidth, 20)
  assert.equal(sparseCm.perPanelFrame['0'].matWidth, 30)
  const sparseIn = migrateMeasurements({ unit: 'in', panels: [], perPanelFrame: [{}] }, 2)
  close(sparseIn.frame.edgeWidth, 50.8)
  close(sparseIn.frame.matWidth, 76.2)
  close(sparseIn.perPanelFrame['0'].edgeWidth, 50.8)
  close(sparseIn.perPanelFrame['0'].matWidth, 76.2)

  const legacyMat = normalizePersistedState({
    unit: 'cm',
    wall: { width: 400, height: 300 },
    panels: [
      {
        id: 'explicit-mat', width: 40, height: 60, x: 20, y: 30, sizePreset: 'cm-40x60',
        passepartout: {
          enabled: true, mode: 'margins', inset: 1, openingWidth: 36, openingHeight: 56,
          marginTop: 1, marginRight: 2, marginBottom: 3, marginLeft: 4,
          colorKey: 'black', customColor: '#111111',
        },
      },
      { id: 'lifted-mat', width: 20, height: 30, x: 100, y: 100, sizePreset: 'custom' },
    ],
    frame: { edgeWidth: 2, matEnabled: true, matWidth: 1.5, matColorKey: 'white', matCustomColor: '#ffffff' },
    perPanelFrame: {},
    gap: 3,
    image: { mode: 'fill', zoom: 1, panX: 0, panY: 0 },
    viewport: { x: 0, y: 0, scale: 3 },
  }, 2)
  const explicitMat = legacyMat.panels[0].passepartout
  assert.equal(explicitMat.mode, 'margins')
  assert.equal(explicitMat.enabled, true)
  assert.equal(explicitMat.colorKey, 'black')
  assert.equal(explicitMat.customColor, '#111111')
  close(explicitMat.inset, 10)
  close(explicitMat.openingWidth, 360)
  close(explicitMat.openingHeight, 560)
  close(explicitMat.marginTop, 10)
  close(explicitMat.marginRight, 20)
  close(explicitMat.marginBottom, 30)
  close(explicitMat.marginLeft, 40)
  const liftedMat = legacyMat.panels[1].passepartout
  assert.equal(liftedMat.enabled, true)
  assert.equal(liftedMat.mode, 'inset')
  assert.equal(liftedMat.colorKey, 'white')
  close(liftedMat.inset, 15)

  const preset = PRESETS.find((entry) => entry.key === '2h')
  const inchPanels = instantiatePreset(preset, 'in-16x20', 'in', 30, 20, 3000, 2500)
  close(inchPanels[0].width, toMm(20, 'in'))
  close(inchPanels[0].height, toMm(16, 'in'))
  assert.equal(inchPanels[0].displayUnit, 'in')
  assert.equal(findPreset('in', inchPanels[0].width, inchPanels[0].height), 'in-16x20')
  assert.ok(FRAME_SIZES.cm.length > 0 && FRAME_SIZES.in.length > 0)

  const initialViewport = { x: 123.45, y: 67.89, scale: 0.25 }
  useStore.getState().resetProject()
  useStore.getState().setWall({ width: 4000, height: 3000 })
  useStore.getState().setViewport(initialViewport)
  useStore.getState().setUnit('in')
  assert.deepEqual(useStore.getState().wall, { width: 4000, height: 3000, color: '#F5F5F5' })
  assert.deepEqual(useStore.getState().viewport, initialViewport)
  useStore.getState().addPanel()
  const panel = useStore.getState().panels[0]
  assert.equal(panel.displayUnit, 'in')
  assert.equal(panel.width, toMm(16, 'in'))
  useStore.getState().setUnit('cm')
  close(useStore.getState().panels[0].width, toMm(16, 'in'))
  assert.equal(useStore.getState().panels[0].displayUnit, 'in')

  useStore.getState().resetProject()
  useStore.getState().setUnit('cm')
  useStore.getState().addPanel()
  const cmPanel = useStore.getState().panels[0]
  useStore.getState().setUnit('in')
  useStore.getState().addPanel()
  const inchPanel = useStore.getState().panels[1]
  assert.equal(cmPanel.displayUnit, 'cm')
  assert.equal(inchPanel.displayUnit, 'in')
  const beforeUnitChange = { ...cmPanel }
  useStore.getState().setPanelDisplayUnit(cmPanel.id, 'in')
  const switchedPanel = useStore.getState().panels.find((entry) => entry.id === cmPanel.id)
  assert.equal(switchedPanel.displayUnit, 'in')
  assert.equal(switchedPanel.sizePreset, 'custom')
  assert.equal(switchedPanel.width, beforeUnitChange.width)
  assert.equal(switchedPanel.height, beforeUnitChange.height)
  assert.equal(switchedPanel.x, beforeUnitChange.x)
  assert.equal(switchedPanel.y, beforeUnitChange.y)
  const inchAfter = useStore.getState().panels.find((entry) => entry.id === inchPanel.id)
  assert.equal(inchAfter.displayUnit, 'in')
  close(inchAfter.width, toMm(16, 'in'))

  const measurementFrame = {
    edgeWidth: 0,
    colorKey: 'black',
    customColor: '#000000',
    matEnabled: false,
    matWidth: 0,
    matColorKey: 'white',
    matCustomColor: '#ffffff',
    shadow: false,
    perPanel: false,
  }
  const measurementPanels = [
    [0, 100], [110, 100], [310, 100], [420, 100],
    [700, 300], [700, 420], [700, 550],
  ].map(([x, y], index) => ({
    id: `measurement-${index + 1}`,
    width: 100,
    height: 100,
    x,
    y,
    sizePreset: 'custom',
    displayUnit: 'cm',
  }))
  const measurementPlan = buildMeasurementPlan({
    wall: { width: 900, height: 700, color: '#ffffff' },
    panels: measurementPanels,
    frame: measurementFrame,
    perPanelFrame: {},
    unit: 'cm',
  })
  assert.deepEqual(
    measurementPlan.gaps.filter((gap) => gap.orientation === 'horizontal').map((gap) => [gap.from, gap.to, gap.gap]),
    [[1, 2, 10], [2, 3, 100], [3, 4, 10]],
  )
  assert.deepEqual(
    measurementPlan.gaps.filter((gap) => gap.orientation === 'vertical').map((gap) => [gap.from, gap.to, gap.gap]),
    [[5, 6, 20], [6, 7, 30]],
  )

  console.log('canonical measurement tests passed')
} finally {
  await server.close()
}
