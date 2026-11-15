import assert from 'node:assert/strict'
import { createServer } from 'vite'

const storage = new Map()
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
}
globalThis.window = { localStorage: globalThis.localStorage }
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`)
try {
  const { alignRects, distributeRects, translateRects, centerRectsOnWall } = await server.ssrLoadModule('/src/lib/layoutTools.ts')
  const { useStore, normalizePersistedState } = await server.ssrLoadModule('/src/store/useStore.ts')
  const { panelGeometry, resolveFrame } = await server.ssrLoadModule('/src/lib/geometry.ts')
  const rects = [
    { id: 'a', x: 100, y: 200, w: 200, h: 300 },
    { id: 'b', x: 500, y: 600, w: 300, h: 200 },
    { id: 'c', x: 1000, y: 1100, w: 400, h: 400 },
  ]
  for (const axis of ['horizontal', 'vertical']) {
    for (const alignment of ['start', 'center', 'end']) {
      const result = alignRects(rects, axis, alignment, 3000, 2500)
      const values = result.map((p, i) => (axis === 'horizontal' ? p.x : p.y) + (alignment === 'start' ? 0 : (axis === 'horizontal' ? rects[i].w : rects[i].h) / (alignment === 'center' ? 2 : 1)))
      values.forEach((v) => near(v, values[0]))
    }
    const result = distributeRects(rects, axis, 3000, 2500)
    const coord = axis === 'horizontal' ? 'x' : 'y'
    const size = axis === 'horizontal' ? 'w' : 'h'
    near(result[1][coord] - result[0][coord] - rects[0][size], result[2][coord] - result[1][coord] - rects[1][size])
    near(result[0][coord], rects[0][coord])
    near(result[2][coord], rects[2][coord])
  }
  for (const [width, height] of [[3000, 2500], [800, 700]]) {
    for (const positions of [translateRects(rects, 10000, -10000, width, height), centerRectsOnWall(rects, width, height)]) {
      positions.forEach((p, i) => {
        near(p.x - positions[0].x, rects[i].x - rects[0].x)
        near(p.y - positions[0].y, rects[i].y - rects[0].y)
      })
    }
  }
  const s = () => useStore.getState()
  const outer = (panel) => panelGeometry(panel, resolveFrame(panel, s().frame, s().perPanelFrame)).outer
  s().applyPreset('triptych')
  const ids = s().panels.map((p) => p.id)
  assert.equal(ids.length, 3)
  s().selectPanel(ids[0]); s().selectPanel(ids[1], true); s().selectPanel(ids[2], true)
  s().selectPanel(ids[0], false, true)
  assert.deepEqual(s().selectedIds, ids)
  assert.equal(s().selectedId, ids[0])
  s().selectPanel('missing')
  assert.equal(s().selectedId, ids[0])
  s().selectPanel(ids[1], true)
  assert.equal(s().selectedId, ids[0], 'removing a secondary member should retain the primary')
  s().selectPanel(ids[1], true)
  s().setFrame({ perPanel: true }); s().setFrame({ edgeWidth: 35, colorKey: 'gold' })
  s().centerSelectedPanels()
  const originals = s().panels.map((p) => ({ ...p }))
  const bounds = originals.map(outer)
  const right = Math.max(...bounds.map((b) => b.x + b.w))
  s().moveSelectedPanels(ids[0], outer(originals[0]).x + s().wall.width - right, outer(originals[0]).y)
  const before = s().panels.map((p) => ({ ...p }))
  s().duplicateSelectedPanels()
  const copies = s().panels.slice(3)
  assert.equal(copies.length, 3)
  copies.forEach((p, i) => {
    near(p.x - copies[0].x, before[i].x - before[0].x)
    near(p.y - copies[0].y, before[i].y - before[0].y)
  })
  const styledCopy = copies[1]
  assert.equal(s().selectedId, styledCopy.id)
  assert.notEqual(s().perPanelFrame[styledCopy.id], s().perPanelFrame[ids[1]])
  s().setFrame({ colorKey: 'white' })
  assert.equal(s().perPanelFrame[ids[1]].colorKey, 'gold')
  const panelCount = s().panels.length
  s().duplicateSelectedPanels()
  assert.equal(s().panels.length, panelCount, 'do not silently duplicate part of a group')
  s().deleteSelectedPanels()
  assert.deepEqual(s().selectedIds, [])
  s().undo()
  assert.deepEqual(s().selectedIds, copies.map((p) => p.id))
  s().redo()
  assert.deepEqual(s().selectedIds, [])
  s().selectImage(true); s().addPanel()
  assert.equal(s().imageSelected, false)
  assert.deepEqual(s().selectedIds, [s().selectedId])
  const saved = { ...s(), id: 'saved', name: 'Test', createdAt: 0 }
  s().loadLayout(saved)
  assert.deepEqual(s().selectedIds, [])
  assert.equal(s().selectedId, null)
  for (const action of [() => s().applyPreset('triptych'), () => s().setGap(40), () => s().setCurrentSizeKey('cm-30x40'), () => s().resetProject()]) {
    s().selectPanel(s().panels[0].id)
    action()
    assert.deepEqual(s().selectedIds, [])
    assert.equal(s().selectedId, null)
  }
  const fixture = { ...saved, panels: originals, selectedId: 'missing', selectedIds: [ids[0], 'missing', ids[0], ids[2]] }
  const normalized = normalizePersistedState(fixture, 4)
  assert.deepEqual(normalized.selectedIds, [ids[0], ids[2]])
  assert.equal(normalized.selectedId, ids[2])
  storage.set('slice-my-photo-state', JSON.stringify({ version: 4, state: fixture }))
  await useStore.persist.rehydrate()
  assert.deepEqual(s().selectedIds, [ids[0], ids[2]], 'same-version hydration must sanitize selection')
  assert.equal(s().selectedId, ids[2])
  s().deletePanel(ids[0])
  assert.equal(s().selectedId, ids[2], 'deleting a secondary panel changed the primary')
  s().undo()
  s().deletePanel(ids[2])
  assert.deepEqual(s().selectedIds, [ids[0]])
  assert.equal(s().selectedId, ids[0], 'deleting the primary did not choose a surviving member')
  console.log('layout tools and selection invariant tests passed')
} finally {
  await server.close()
}
