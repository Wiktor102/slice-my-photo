import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { deflateSync } from 'node:zlib'
import path from 'node:path'
import { chromium } from 'playwright'

function crc32(buf) {
  let c = ~0
  for (const byte of buf) {
    c ^= byte
    for (let bit = 0; bit < 8; bit++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return (~c) >>> 0
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typeBytes = Buffer.from(type, 'ascii')
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])))
  return Buffer.concat([length, typeBytes, data, checksum])
}

function makePng(width, height) {
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0
    for (let x = 0; x < width; x++) {
      const offset = y * (width * 3 + 1) + 1 + x * 3
      raw[offset] = 90
      raw[offset + 1] = 140
      raw[offset + 2] = 200
    }
  }
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  return Buffer.concat([signature, pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))])
}

const image = makePng(400, 600)
const imageB = makePng(300, 300)
const errors = []
let server
let browser

function stopServer() {
  if (!server || server.exitCode !== null) return
  try { process.kill(-server.pid, 'SIGTERM') } catch {}
  server.kill('SIGTERM')
}

async function recoveryImageName(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('slice-my-photo', 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const read = db.transaction('images', 'readonly').objectStore('images').get('current')
      read.onerror = () => reject(read.error)
      read.onsuccess = () => {
        resolve(read.result?.name ?? null)
        db.close()
      }
    }
  }))
}

async function exportProject(page) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export Project', exact: true }).click(),
  ])
  const archivePath = await download.path()
  if (!archivePath) throw new Error('project download has no path')
  return readFile(archivePath)
}

async function expectImportError(page, archive, expected) {
  await page.getByRole('button', { name: 'Import Project', exact: true }).click()
  const importInput = page.locator('input[type=file][accept*=".smp"]')
  await importInput.setInputFiles({ name: 'invalid.smp', mimeType: 'application/zip', buffer: archive })
  const dialog = page.locator('.modal').filter({ hasText: 'Project import failed' })
  await dialog.waitFor({ state: 'visible', timeout: 12000 })
  const body = await dialog.textContent()
  if (!body?.includes(expected)) throw new Error(`expected import error containing "${expected}", got: ${body}`)
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
}

function forgeOversizedEntry(archive) {
  const copy = Buffer.from(archive)
  const signature = Buffer.from([0x50, 0x4b, 0x01, 0x02])
  let offset = 0
  while ((offset = copy.indexOf(signature, offset)) >= 0) {
    const nameLength = copy.readUInt16LE(offset + 28)
    const name = copy.subarray(offset + 46, offset + 46 + nameLength).toString('utf8')
    if (name === 'image/full.data') {
      copy.writeUInt32LE(64 * 1024 * 1024 + 1, offset + 24)
      return copy
    }
    offset += 4
  }
  throw new Error('could not find full image entry in project archive')
}

try {
  const require = createRequire(import.meta.url)
  const viteBin = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js')
  server = spawn(process.execPath, [viteBin], { cwd: process.cwd(), stdio: 'pipe', detached: process.platform !== 'win32' })
  let url = 'http://localhost:5173'
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 12000)
    server.stdout.on('data', (chunk) => {
      const match = chunk.toString().match(/http:\/\/localhost:(\d+)/)
      if (match) {
        url = `http://localhost:${match[1]}`
        clearTimeout(timer)
        resolve()
      }
    })
  })

  browser = await chromium.launch()
  const page = await browser.newPage({ acceptDownloads: true })
  const consoleErrors = []
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  page.on('pageerror', (error) => consoleErrors.push(error.message))
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__portable_project_test_initialized')) return
    sessionStorage.setItem('__portable_project_test_initialized', '1')
    localStorage.clear()
    indexedDB.deleteDatabase('slice-my-photo')
  })
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.setInputFiles('input[type=file]', { name: 'portable.png', mimeType: 'image/png', buffer: image })
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('Continue to Editor') && !button.disabled), undefined, { timeout: 12000 })
  await page.getByRole('button', { name: /Continue to Editor/ }).click()
  await page.waitForSelector('.editor')
  await page.getByRole('button', { name: 'Triptych' }).click()
  await page.locator('.panel-row').first().click()

  const panelUnits = page.locator('.sidebar.right select').first()
  await panelUnits.selectOption('in')
  await page.locator('.sidebar.right button', { hasText: 'Manual' }).click()
  const imageZoom = page.locator('.sidebar.right input[type=range]').first()
  await imageZoom.evaluate((input) => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setValue?.call(input, '5')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await page.getByRole('button', { name: 'Toggle grid' }).click()
  await page.getByRole('button', { name: 'Gap snapping' }).click()
  const wallCard = page.locator('.sidebar.right .card', { hasText: 'Wall Setup' })
  const wallWidth = wallCard.locator('.field', { hasText: /^Width/ }).locator('input')
  await wallWidth.fill('10')
  await wallWidth.press('Enter')
  const wallHeight = wallCard.locator('.field', { hasText: /^Height/ }).locator('input')
  await wallHeight.fill('10')
  await wallHeight.press('Enter')

  const stateBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('slice-my-photo-state')).state)
  if (stateBefore.measurementVersion !== 3 || stateBefore.panels[0].displayUnit !== 'in' || stateBefore.image.zoom !== 5 || stateBefore.showGrid !== false || stateBefore.gapSnapEnabled !== false) {
    throw new Error(`durable state was not prepared for round trip: ${JSON.stringify({ measurementVersion: stateBefore.measurementVersion, displayUnit: stateBefore.panels[0].displayUnit, zoom: stateBefore.image.zoom, showGrid: stateBefore.showGrid, gapSnapEnabled: stateBefore.gapSnapEnabled })}`)
  }
  const durableStateBefore = {
    measurementVersion: stateBefore.measurementVersion,
    unit: stateBefore.unit,
    wall: stateBefore.wall,
    panels: stateBefore.panels,
    frame: stateBefore.frame,
    perPanelFrame: stateBefore.perPanelFrame,
    gap: stateBefore.gap,
    currentSizeKey: stateBefore.currentSizeKey,
    presetActive: stateBefore.presetActive,
    image: stateBefore.image,
    showGrid: stateBefore.showGrid,
    gapSnapEnabled: stateBefore.gapSnapEnabled,
  }
  const archiveA = await exportProject(page)

  await page.getByRole('button', { name: 'Import Project' }).click()
  const importInput = page.locator('input[type=file][accept*=".smp"]')
  await importInput.setInputFiles({ name: 'portable-a.smp', mimeType: 'application/zip', buffer: archiveA })
  await page.getByRole('button', { name: 'Import project', exact: true }).click()
  await page.waitForTimeout(500)

  const stateAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('slice-my-photo-state')).state)
  if (stateAfter.measurementVersion !== 3 || stateAfter.panels[0].displayUnit !== 'in' || stateAfter.image.zoom !== 5 || stateAfter.showGrid !== false || stateAfter.gapSnapEnabled !== false) {
    throw new Error('portable project did not restore durable state')
  }
  if (stateAfter.wall.width !== 100 || stateAfter.panels[0].width <= stateAfter.wall.width) throw new Error('portable project did not preserve an oversized panel')
  if (await page.locator('.panel-row').count() !== 3) throw new Error('portable project did not restore panels')
  const durableStateAfter = {
    measurementVersion: stateAfter.measurementVersion,
    unit: stateAfter.unit,
    wall: stateAfter.wall,
    panels: stateAfter.panels,
    frame: stateAfter.frame,
    perPanelFrame: stateAfter.perPanelFrame,
    gap: stateAfter.gap,
    currentSizeKey: stateAfter.currentSizeKey,
    presetActive: stateAfter.presetActive,
    image: stateAfter.image,
    showGrid: stateAfter.showGrid,
    gapSnapEnabled: stateAfter.gapSnapEnabled,
  }
  if (JSON.stringify(durableStateAfter) !== JSON.stringify(durableStateBefore)) throw new Error('portable project did not restore the complete durable state')
  if (!(await page.getByRole('button', { name: /^Undo/ }).isDisabled())) throw new Error('import left pre-import history available')

  // Create history for the first project, then replace it with a second
  // project. Undo after the replacement must never restore the first image.
  await page.locator('.panel-row').first().click()
  await page.locator('.sidebar.right select').first().selectOption('cm')
  await page.waitForTimeout(100)
  if (await page.getByRole('button', { name: /^Undo/ }).isDisabled()) throw new Error('post-import edits were not recorded in history')

  const pageB = await browser.newPage({ acceptDownloads: true })
  let archiveB
  try {
    await pageB.goto(url, { waitUntil: 'domcontentloaded' })
    await pageB.setInputFiles('input[type=file]', { name: 'portable-b.png', mimeType: 'image/png', buffer: imageB })
    await pageB.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('Continue to Editor') && !button.disabled), undefined, { timeout: 12000 })
    await pageB.getByRole('button', { name: /Continue to Editor/ }).click()
    await pageB.waitForSelector('.editor')
    await pageB.getByRole('button', { name: '2H', exact: true }).click()
    archiveB = await exportProject(pageB)
  } finally {
    await pageB.close()
  }

  await page.getByRole('button', { name: 'Import Project', exact: true }).click()
  await page.locator('input[type=file][accept*=".smp"]').setInputFiles({ name: 'portable-b.smp', mimeType: 'application/zip', buffer: archiveB })
  await page.getByRole('button', { name: 'Import project', exact: true }).click()
  await page.waitForTimeout(500)
  const stateB = await page.evaluate(() => JSON.parse(localStorage.getItem('slice-my-photo-state')).state)
  if (await recoveryImageName(page) !== 'portable-b.png') throw new Error('replacement import did not persist the new source image')
  if (stateB.panels.length !== 2 || !(await page.getByRole('button', { name: /^Undo/ }).isDisabled())) throw new Error('replacement import retained the old project history')

  await page.locator('.panel-row').first().click()
  await page.locator('.sidebar.right select').first().selectOption('in')
  await page.waitForTimeout(100)
  if (await page.getByRole('button', { name: /^Undo/ }).isDisabled()) throw new Error('edits after replacement were not undoable')
  await page.getByRole('button', { name: /^Undo/ }).click()
  await page.waitForTimeout(100)
  const stateAfterUndo = await page.evaluate(() => JSON.parse(localStorage.getItem('slice-my-photo-state')).state)
  if (stateAfterUndo.panels[0].displayUnit !== 'cm' || await recoveryImageName(page) !== 'portable-b.png') throw new Error('undo after replacement mixed the previous project with the new source image')

  const JSZip = (await import('jszip')).default
  const unknownZip = await JSZip.loadAsync(archiveB)
  const manifestFile = unknownZip.file('manifest.json')
  if (!manifestFile) throw new Error('exported project has no manifest')
  const unknownManifest = JSON.parse(await manifestFile.async('string'))
  unknownManifest.version = 999
  unknownZip.file('manifest.json', JSON.stringify(unknownManifest))
  const unknownVersionArchive = await unknownZip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  await expectImportError(page, Buffer.from('not a zip archive'), 'Could not open this project file')
  await expectImportError(page, unknownVersionArchive, 'Unsupported project version')
  await expectImportError(page, forgeOversizedEntry(archiveB), 'too large')

  // A project can be imported directly from the upload screen and must still
  // restore its image and editor state after a fresh page load.
  await page.getByRole('button', { name: 'Home', exact: true }).click()
  await page.getByRole('button', { name: 'Go home', exact: true }).click()
  await page.waitForSelector('.upload-screen')
  await page.getByRole('button', { name: 'Import Project', exact: true }).click()
  await page.locator('input[type=file][accept*=".smp"]').setInputFiles({ name: 'portable-b.smp', mimeType: 'application/zip', buffer: archiveB })
  await page.waitForSelector('.editor')
  await page.waitForFunction(() => document.querySelectorAll('.panel-row').length === 2, undefined, { timeout: 12000 })
  if (await recoveryImageName(page) !== 'portable-b.png') throw new Error('fresh-screen import did not restore the image')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.editor')
  await page.waitForFunction(() => document.querySelectorAll('.panel-row').length === 2, undefined, { timeout: 12000 })
  if (await recoveryImageName(page) !== 'portable-b.png') throw new Error('project did not survive a reload')

  const matRoundTrip = await page.evaluate(async () => {
    const { useStore } = await import('/src/store/useStore.ts')
    const { resolveFrame } = await import('/src/lib/geometry.ts')
    const current = useStore.getState()
    const panel = current.panels[0]
    const basePassepartout = { ...panel.passepartout, enabled: true, mode: 'inset', inset: 10 }
    const overridePassepartout = { ...basePassepartout, inset: 99 }
    const override = {
      edgeWidth: current.frame.edgeWidth,
      colorKey: current.frame.colorKey,
      customColor: current.frame.customColor,
      shadow: current.frame.shadow,
      passepartout: overridePassepartout,
    }
    useStore.getState().restorePortableProject({
      sourceImage: { ...current.sourceImage },
      state: {
        measurementVersion: current.measurementVersion,
        unit: current.unit,
        wall: { ...current.wall },
        panels: [{ ...panel, passepartout: basePassepartout }],
        frame: { ...current.frame, perPanel: true },
        perPanelFrame: { [panel.id]: override },
        gap: current.gap,
        currentSizeKey: current.currentSizeKey,
        presetActive: current.presetActive,
        image: { ...current.image },
        showGrid: current.showGrid,
        gapSnapEnabled: current.gapSnapEnabled,
      },
    })
    const after = useStore.getState()
    return {
      base: after.panels[0].passepartout?.inset,
      override: after.perPanelFrame[panel.id]?.passepartout.inset,
      resolved: resolveFrame(after.panels[0], after.frame, after.perPanelFrame).passepartout.inset,
    }
  })
  if (JSON.stringify(matRoundTrip) !== JSON.stringify({ base: 10, override: 99, resolved: 99 })) throw new Error(`per-panel mat settings were not preserved: ${JSON.stringify(matRoundTrip)}`)

  const aspectError = await page.evaluate(async () => {
    const { validatePortableImageData } = await import('/src/lib/portableProject.ts')
    try {
      await validatePortableImageData({
        state: {},
        sourceImage: {
          name: 'aspect.png',
          nativeWidth: 100,
          nativeHeight: 100,
          proxyMax: 100,
          fullUrl: 'data:image/png;base64,AA==',
          proxyUrl: 'data:image/png;base64,AAE=',
        },
      }, async (src) => src.endsWith('AA==') ? { naturalWidth: 100, naturalHeight: 100 } : { naturalWidth: 100, naturalHeight: 10 })
      return null
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  })
  if (!aspectError?.includes('aspect ratio')) throw new Error('preview aspect-ratio validation did not reject a distorted proxy')
  if (consoleErrors.length) throw new Error(`browser errors: ${consoleErrors.join('; ')}`)
  console.log('portable project browser round trip passed')
} finally {
  try { await browser?.close() } catch {}
  stopServer()
}
