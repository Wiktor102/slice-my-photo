import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { deflateSync } from 'node:zlib'
import { chromium } from 'playwright'

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return (~c) >>> 0
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
  const pixels = Buffer.alloc(rowLength * height)
  for (let y = 0; y < height; y++) {
    pixels[y * rowLength] = 0
    for (let x = 0; x < width; x++) {
      const offset = y * rowLength + 1 + x * 3
      pixels[offset] = 90
      pixels[offset + 1] = 140
      pixels[offset + 2] = 200
    }
  }
  return Buffer.concat([
    signature,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(pixels)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

const CM_PER_INCH = 2.54
const MIN_DIMENSION_IN = 10 / CM_PER_INCH
const MIN_OPENING_IN = 1 / CM_PER_INCH
const IMAGE = makePng(400, 600)
const SEED = {
  unit: 'cm',
  wall: { width: 300, height: 250, color: '#F5F5F5' },
  panels: [{
    id: 'unit-test-panel',
    width: 10,
    height: 15,
    x: 100,
    y: 100,
    sizePreset: 'cm-10x15',
    passepartout: {
      enabled: true,
      mode: 'opening',
      inset: 3,
      openingWidth: 1,
      openingHeight: 1,
      marginTop: 0,
      marginRight: 0,
      marginBottom: 0,
      marginLeft: 0,
      colorKey: 'white',
      customColor: '#ffffff',
    },
  }],
  selectedId: 'unit-test-panel',
  perPanelFrame: {},
  frame: {
    edgeWidth: 2,
    colorKey: 'black',
    customColor: '#000000',
    matEnabled: false,
    matWidth: 3,
    matColorKey: 'white',
    matCustomColor: '#ffffff',
    shadow: true,
    perPanel: false,
  },
  image: { mode: 'fill', zoom: 1, panX: 0, panY: 0 },
  presetActive: null,
  gap: 3,
  currentSizeKey: 'cm-10x15',
  viewport: { x: 0, y: 0, scale: 3 },
  showGrid: true,
  gapSnapEnabled: true,
}

let server = null
let browser = null

function stopServer(proc) {
  if (!proc || proc.exitCode !== null || !proc.pid) return
  try { process.kill(-proc.pid, 'SIGTERM') } catch {}
  try { proc.kill('SIGTERM') } catch {}
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function closeEnough(actual, expected, tolerance = 1e-12) {
  return Math.abs(actual - expected) <= tolerance
}

try {
  const require = createRequire(import.meta.url)
  const viteBin = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js')
  server = spawn(process.execPath, [viteBin], { cwd: process.cwd(), stdio: 'pipe', detached: process.platform !== 'win32' })

  let url = ''
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (!url) {
        url = 'http://localhost:5173'
        resolve()
      }
    }, 12000)
    server.once('error', reject)
    server.stdout.on('data', (data) => {
      const match = data.toString().match(/http:\/\/localhost:(\d+)/)
      if (match && !url) {
        url = `http://localhost:${match[1]}`
        clearTimeout(timeout)
        resolve()
      }
    })
  })

  browser = await chromium.launch()
  const page = await browser.newPage()
  const pageErrors = []
  page.on('console', (message) => { if (message.type() === 'error') pageErrors.push(message.text()) })
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.addInitScript((seed) => {
    localStorage.clear()
    indexedDB.deleteDatabase('slice-my-photo')
    localStorage.setItem('slice-my-photo-state', JSON.stringify({ state: seed, version: 2 }))
  }, SEED)

  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.upload-card', { timeout: 10000 })
  await page.setInputFiles('input[type=file]', { name: 'unit-test.png', mimeType: 'image/png', buffer: IMAGE })
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent?.includes('Continue to Editor'))
    return button instanceof HTMLButtonElement && !button.disabled
  }, undefined, { timeout: 12000 })

  await page.locator('.upload-units label').filter({ hasText: 'Inches' }).click()
  await page.waitForFunction(() => {
    const state = JSON.parse(localStorage.getItem('slice-my-photo-state') || '{}').state
    return state?.unit === 'in'
  })
  await page.getByRole('button', { name: /Continue to Editor/ }).click()
  await page.waitForSelector('.editor', { timeout: 8000 })

  const readState = () => page.evaluate(() => JSON.parse(localStorage.getItem('slice-my-photo-state') || '{}').state)
  const field = (label) => page.locator('label.field').filter({ hasText: label }).locator('input').first()
  const openingHeight = field('Opening height')
  const openingWidth = field('Opening width')
  const panelWidth = page.locator('.card').filter({ hasText: 'Panel Properties' }).getByLabel('Width (in)', { exact: true })

  await openingHeight.waitFor({ state: 'visible' })

  await openingHeight.focus()
  await openingHeight.blur()
  await page.waitForTimeout(50)
  let state = await readState()
  assert(closeEnough(state.panels[0].passepartout.openingHeight, MIN_OPENING_IN), 'focus/blur changed the converted 1 cm opening')

  const preciseOpening = 1.06 / CM_PER_INCH
  await openingWidth.fill(String(preciseOpening))
  await openingWidth.blur()
  await page.waitForTimeout(50)
  state = await readState()
  assert(closeEnough(state.panels[0].passepartout.openingWidth, preciseOpening), 'opening edit did not commit its precise value')
  await openingWidth.focus()
  await openingWidth.blur()
  await page.waitForTimeout(50)
  state = await readState()
  assert(closeEnough(state.panels[0].passepartout.openingWidth, preciseOpening), 'no-op opening blur rounded the stored value')

  const convertedPanelWidth = MIN_DIMENSION_IN
  await openingWidth.fill('0.1')
  await openingWidth.blur()
  await page.waitForTimeout(50)
  state = await readState()
  assert(closeEnough(state.panels[0].passepartout.openingWidth, MIN_OPENING_IN), 'opening minimum was not kept at 1 cm in inches')

  await panelWidth.focus()
  await panelWidth.blur()
  await page.waitForTimeout(50)
  state = await readState()
  assert(closeEnough(state.panels[0].width, convertedPanelWidth), 'focus/blur changed the converted panel dimension')

  assert(pageErrors.length === 0, `browser errors: ${pageErrors.join('; ')}`)
  console.log('OK: inch minima and precision-preserving numeric fields')
} finally {
  try { if (browser) await browser.close() } catch {}
  stopServer(server)
}
