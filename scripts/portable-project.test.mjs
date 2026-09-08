import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
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
const errors = []
let server
let browser

function stopServer() {
  if (!server || server.exitCode !== null) return
  try { process.kill(-server.pid, 'SIGTERM') } catch {}
  server.kill('SIGTERM')
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

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export Project' }).click(),
  ])
  const archivePath = await download.path()
  if (!archivePath) throw new Error('project download has no path')

  await page.getByRole('button', { name: 'Import Project' }).click()
  const importInput = page.locator('input[type=file][accept*=".smp"]')
  await importInput.setInputFiles(archivePath)
  await page.getByRole('button', { name: 'Import project', exact: true }).click()
  await page.waitForTimeout(500)

  const stateAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('slice-my-photo-state')).state)
  if (stateAfter.measurementVersion !== 3 || stateAfter.panels[0].displayUnit !== 'in' || stateAfter.image.zoom !== 5 || stateAfter.showGrid !== false || stateAfter.gapSnapEnabled !== false) {
    throw new Error('portable project did not restore durable state')
  }
  if (await page.locator('.panel-row').count() !== 3) throw new Error('portable project did not restore panels')
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
