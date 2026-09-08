import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { deflateSync } from 'node:zlib'
import { chromium } from 'playwright'

function crc32(buffer) {
  let value = ~0
  for (let i = 0; i < buffer.length; i++) {
    value ^= buffer[i]
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (0xedb88320 & -(value & 1))
  }
  return (~value) >>> 0
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeBuffer = Buffer.from(type, 'ascii')
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)
  return Buffer.concat([length, typeBuffer, data, checksum])
}

function makePng(width, height) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  const rowLength = width * 3 + 1
  const raw = Buffer.alloc(rowLength * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = y * rowLength + 1 + x * 3
      raw[offset] = 90
      raw[offset + 1] = 140
      raw[offset + 2] = 200
    }
  }
  return Buffer.concat([
    signature,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function stopServer(server) {
  if (!server || server.exitCode !== null || !server.pid) return
  try { process.kill(-server.pid, 'SIGTERM') } catch {}
  server.kill('SIGTERM')
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function closeEnough(actual, expected, tolerance = 0.01) {
  return Math.abs(actual - expected) <= tolerance
}

function panelPositions(state) {
  return Object.fromEntries(state.panels.map((panel) => [panel.id, [panel.x, panel.y]]))
}

function samePositions(a, b) {
  const aIds = Object.keys(a)
  const bIds = Object.keys(b)
  return aIds.length === bIds.length && aIds.every((id) => b[id] && closeEnough(a[id][0], b[id][0]) && closeEnough(a[id][1], b[id][1]))
}

const image = makePng(400, 600)
const errors = []
let server
let browser

try {
  const require = createRequire(import.meta.url)
  const viteBin = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js')
  server = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', '0'], {
    cwd: process.cwd(),
    stdio: 'pipe',
    detached: process.platform !== 'win32',
  })

  let url = ''
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('timed out waiting for Vite')), 15000)
    server.once('error', reject)
    server.stdout.on('data', (data) => {
      const match = data.toString().match(/http:\/\/127\.0\.0\.1:(\d+)/)
      if (match && !url) {
        url = match[0]
        clearTimeout(timeout)
        resolve()
      }
    })
    server.stderr.on('data', (data) => process.stderr.write('[vite] ' + data.toString()))
  })

  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))

  const readState = async () => {
    await page.waitForTimeout(100)
    return page.evaluate(() => {
      const raw = localStorage.getItem('slice-my-photo-state')
      if (!raw) throw new Error('persisted Zustand state is missing')
      return JSON.parse(raw).state
    })
  }

  const focusBody = () => page.evaluate(() => {
    document.body.tabIndex = -1
    document.body.focus()
  })

  const uploadTriptych = async () => {
    await page.waitForSelector('.upload-card', { timeout: 10000 })
    await page.setInputFiles('input[type=file]', { name: 'multi-select-test.png', mimeType: 'image/png', buffer: image })
    await page.getByRole('button', { name: /Continue to Editor/ }).click()
    await page.waitForSelector('.editor', { timeout: 10000 })
    await page.getByRole('button', { name: 'Triptych' }).click()
    await page.waitForFunction(() => document.querySelectorAll('.panel-row').length === 3, undefined, { timeout: 5000 })
    await page.waitForTimeout(500)
  }

  const step = async (name, callback) => {
    await callback()
    console.log('OK:', name)
  }

  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.evaluate(async () => {
    localStorage.clear()
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase('slice-my-photo')
      request.onsuccess = request.onerror = request.onblocked = () => resolve()
    })
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await uploadTriptych()

  await step('modifier selection', async () => {
    const rows = page.locator('.panel-row')
    await rows.nth(0).click()
    await rows.nth(1).click({ modifiers: ['Shift'] })
    await rows.nth(2).click({ modifiers: ['Control'] })
    assert(await page.locator('.panel-row.selected').count() === 3, 'Shift/Ctrl selection did not select all three rows')
    const state = await readState()
    assert(state.selectedIds.length === 3, `persisted selection has ${state.selectedIds.length} panels`)
    assert(state.selectedId === state.selectedIds.at(-1), 'primary selection is not the last toggled panel')
  })

  let stateBeforeDrag
  let stateAfterDrag
  await step('group drag clamps at wall edge and renders there', async () => {
    stateBeforeDrag = await readState()
    const canvas = page.locator('.main-area canvas')
    const canvasBox = await canvas.boundingBox()
    assert(canvasBox, 'Konva canvas is not visible')
    const frameEdge = stateBeforeDrag.frame.edgeWidth
    const dragged = stateBeforeDrag.panels[0]
    const startX = canvasBox.x + (dragged.x + dragged.width / 2 - stateBeforeDrag.viewport.x) * stateBeforeDrag.viewport.scale
    const startY = canvasBox.y + (dragged.y + dragged.height / 2 - stateBeforeDrag.viewport.y) * stateBeforeDrag.viewport.scale
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(canvasBox.x + canvasBox.width - 12, startY, { steps: 12 })
    await page.mouse.up()
    await page.waitForTimeout(250)
    stateAfterDrag = await readState()

    assert(stateAfterDrag.selectedIds.length === 3, 'group drag changed the multi-selection')
    const beforeOuter = stateBeforeDrag.panels.map((panel) => ({ x: panel.x - frameEdge, y: panel.y - frameEdge, w: panel.width + frameEdge * 2, h: panel.height + frameEdge * 2 }))
    const afterOuter = stateAfterDrag.panels.map((panel) => ({ x: panel.x - frameEdge, y: panel.y - frameEdge, w: panel.width + frameEdge * 2, h: panel.height + frameEdge * 2 }))
    const deltas = afterOuter.map((outer, i) => [outer.x - beforeOuter[i].x, outer.y - beforeOuter[i].y])
    assert(deltas.every(([x, y]) => closeEnough(x, deltas[0][0]) && closeEnough(y, deltas[0][1])), 'group drag did not preserve panel spacing')
    const rightEdge = Math.max(...afterOuter.map((outer) => outer.x + outer.w))
    assert(closeEnough(rightEdge, stateAfterDrag.wall.width, 0.1), `group drag stopped at ${rightEdge}mm instead of wall edge ${stateAfterDrag.wall.width}mm`)

    const rendered = await page.evaluate(({ panels, viewport, canvasBox }) => {
      const canvas = document.querySelector('.main-area canvas')
      if (!(canvas instanceof HTMLCanvasElement)) return []
      const context = canvas.getContext('2d')
      if (!context) return []
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      const scaleX = canvas.width / canvasBox.width
      const scaleY = canvas.height / canvasBox.height
      return panels.map((panel) => {
        const worldX = panel.x + panel.width / 2
        const worldY = panel.y + panel.height / 2
        const px = (worldX - viewport.x) * viewport.scale * scaleX
        const py = (worldY - viewport.y) * viewport.scale * scaleY
        let blue = 0
        for (let y = Math.max(0, Math.floor(py - 10)); y <= Math.min(canvas.height - 1, Math.ceil(py + 10)); y++) {
          for (let x = Math.max(0, Math.floor(px - 10)); x <= Math.min(canvas.width - 1, Math.ceil(px + 10)); x++) {
            const offset = (y * canvas.width + x) * 4
            const red = pixels[offset]
            const green = pixels[offset + 1]
            const blueChannel = pixels[offset + 2]
            if (red > 60 && red < 130 && green > 100 && green < 180 && blueChannel > 150 && blueChannel > red + 50) blue++
          }
        }
        return { panel: panel.id, blue }
      })
    }, {
      panels: stateAfterDrag.panels,
      viewport: stateAfterDrag.viewport,
      canvasBox: { width: canvasBox.width, height: canvasBox.height },
    })
    assert(rendered.length === 3 && rendered.every((panel) => panel.blue > 10), `rendered panels did not follow stored group positions: ${JSON.stringify(rendered)}`)
  })

  await step('undo and redo restore group selection', async () => {
    const beforeCenter = await readState()
    const selectedBefore = [...beforeCenter.selectedIds]
    await page.getByRole('button', { name: 'Center on wall' }).click()
    const afterCenter = await readState()
    assert(samePositions(panelPositions(beforeCenter), panelPositions(afterCenter)) === false, 'center action did not change the group')
    assert(JSON.stringify(afterCenter.selectedIds) === JSON.stringify(selectedBefore), 'center action changed selection')

    await page.getByRole('button', { name: /^Undo/ }).click()
    const undone = await readState()
    assert(samePositions(panelPositions(undone), panelPositions(beforeCenter)), 'undo did not restore panel positions')
    assert(JSON.stringify(undone.selectedIds) === JSON.stringify(selectedBefore), 'undo did not restore group selection')

    await page.getByRole('button', { name: /^Redo/ }).click()
    const redone = await readState()
    assert(samePositions(panelPositions(redone), panelPositions(afterCenter)), 'redo did not restore centered positions')
    assert(JSON.stringify(redone.selectedIds) === JSON.stringify(selectedBefore), 'redo did not restore group selection')
  })

  await step('centimeter nudge', async () => {
    await page.locator('.panel-row').nth(0).click()
    const before = await readState()
    await focusBody()
    await page.keyboard.press('ArrowRight')
    const after = await readState()
    const id = before.selectedId
    const beforePanel = before.panels.find((panel) => panel.id === id)
    const afterPanel = after.panels.find((panel) => panel.id === id)
    assert(beforePanel && afterPanel, 'nudge target disappeared')
    assert(closeEnough(afterPanel.x - beforePanel.x, 10), `centimeter nudge moved ${afterPanel.x - beforePanel.x}mm instead of 10mm`)
  })

  let duplicateSourceId
  await step('duplicate preserves independent passepartout styling', async () => {
    duplicateSourceId = (await readState()).selectedId
    const toggle = page.locator('label.toggle').filter({ hasText: 'Use passepartout' })
    await toggle.click()
    const styled = await readState()
    const source = styled.panels.find((panel) => panel.id === duplicateSourceId)
    assert(source?.passepartout?.enabled === true, 'source passepartout was not enabled')
    await page.getByRole('button', { name: 'Duplicate' }).click()
    const duplicated = await readState()
    const duplicateId = duplicated.selectedId
    const copy = duplicated.panels.find((panel) => panel.id === duplicateId)
    const original = duplicated.panels.find((panel) => panel.id === duplicateSourceId)
    assert(copy && original && duplicateId !== duplicateSourceId, 'duplicate did not create a new selected panel')
    assert(JSON.stringify(copy.passepartout) === JSON.stringify(original.passepartout), 'duplicate did not copy passepartout styling')
    const duplicateToggle = page.locator('label.toggle').filter({ hasText: 'Use passepartout' })
    await duplicateToggle.click()
    const independent = await readState()
    assert(independent.panels.find((panel) => panel.id === duplicateSourceId)?.passepartout?.enabled === true, 'changing duplicate styling changed the source panel')
  })

  await step('modal guards block Delete', async () => {
    const beforeReset = await readState()
    await page.locator('.topbar').getByRole('button', { name: 'Reset' }).click()
    await page.waitForSelector('.modal-overlay')
    await focusBody()
    await page.keyboard.press('Delete')
    const behindReset = await readState()
    assert(behindReset.panels.length === beforeReset.panels.length, 'Delete mutated panels behind Reset modal')
    await page.getByRole('button', { name: 'Cancel' }).click()
    await page.waitForSelector('.modal-overlay', { state: 'detached' })

    await page.locator('.topbar').getByRole('button', { name: 'Export' }).click()
    await page.waitForSelector('.modal-overlay')
    await focusBody()
    await page.keyboard.press('Delete')
    const behindExport = await readState()
    assert(behindExport.panels.length === beforeReset.panels.length, 'Delete mutated panels behind Export modal')
    await page.locator('.modal .close-x').click()
    await page.waitForSelector('.modal-overlay', { state: 'detached' })
  })

  await step('inch nudge', async () => {
    await page.locator('.topbar').getByRole('button', { name: 'Home' }).click()
    await page.getByRole('button', { name: 'Go home' }).click()
    await page.waitForSelector('.upload-card')
    await page.locator('label').filter({ hasText: 'Inches' }).click()
    await page.setInputFiles('input[type=file]', { name: 'multi-select-test.png', mimeType: 'image/png', buffer: image })
    await page.getByRole('button', { name: /Continue to Editor/ }).click()
    await page.waitForSelector('.editor')
    await page.getByRole('button', { name: 'Triptych' }).click()
    await page.waitForFunction(() => document.querySelectorAll('.panel-row').length === 3, undefined, { timeout: 5000 })
    await page.locator('.panel-row').nth(0).click()
    const before = await readState()
    assert(before.unit === 'in', `expected inch unit, got ${before.unit}`)
    await focusBody()
    await page.keyboard.press('ArrowRight')
    const after = await readState()
    const beforePanel = before.panels.find((panel) => panel.id === before.selectedId)
    const afterPanel = after.panels.find((panel) => panel.id === before.selectedId)
    assert(beforePanel && afterPanel, 'inch nudge target disappeared')
    assert(closeEnough(afterPanel.x - beforePanel.x, 6.35, 0.001), `inch nudge moved ${afterPanel.x - beforePanel.x}mm instead of 6.35mm`)
  })

  await step('main v3 persisted selection migration', async () => {
    const current = await readState()
    const selectedId = current.selectedId
    assert(selectedId && current.panels.some((panel) => panel.id === selectedId), 'migration fixture has no valid selectedId')
    await page.evaluate((id) => {
      const raw = JSON.parse(localStorage.getItem('slice-my-photo-state'))
      raw.version = 3
      delete raw.state.selectedIds
      raw.state.selectedId = id
      localStorage.setItem('slice-my-photo-state', JSON.stringify(raw))
    }, selectedId)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.editor', { timeout: 10000 })
    await page.waitForFunction(() => document.querySelectorAll('.panel-row.selected').length === 1, undefined, { timeout: 10000 })
    const migrated = await readState()
    assert(JSON.stringify(migrated.selectedIds) === JSON.stringify([selectedId]), `v3 migration restored ${JSON.stringify(migrated.selectedIds)} instead of [${selectedId}]`)
    assert(await page.locator('.panel-row.selected').count() === 1, 'v3 migration did not restore one selected row in the UI')
  })

  if (errors.length) throw new Error(errors.join('\n'))
  console.log('multi-select regression tests passed')
} finally {
  try { await browser?.close() } catch {}
  stopServer(server)
}
