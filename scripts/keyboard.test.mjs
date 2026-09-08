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
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)
  return Buffer.concat([length, typeBuffer, data, crc])
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

  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.upload-card')
  await page.setInputFiles('input[type=file]', {
    name: 'keyboard-test.png',
    mimeType: 'image/png',
    buffer: makePng(400, 600),
  })
  await page.getByRole('button', { name: /Continue to Editor/ }).click()
  await page.waitForSelector('.editor')
  await page.getByRole('button', { name: 'Triptych' }).click()
  await page.waitForTimeout(300)

  const main = page.locator('.main-area')
  const mainBox = await main.boundingBox()
  if (!mainBox) throw new Error('canvas container is not visible')

  // This is the visible ghost image above the triptych panels. Keeping the pointer there
  // makes image hover state a direct observable of whether Space-panning is active.
  const imagePoint = { x: mainBox.x + mainBox.width * 0.435, y: mainBox.y + mainBox.height * 0.16 }
  await page.mouse.move(imagePoint.x, imagePoint.y)
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.main-area')).cursor === 'move')

  const cursor = () => main.evaluate((element) => getComputedStyle(element).cursor)
  const focusBody = () => page.evaluate(() => {
    document.body.tabIndex = -1
    document.body.focus()
  })

  const input = page.locator('input[type=number]').first()
  await input.focus()
  await page.keyboard.down('Space')
  if (await cursor() !== 'move') throw new Error('Space from a number input enabled canvas panning')
  await page.keyboard.up('Space')

  const editable = await page.evaluate(() => {
    const element = document.createElement('div')
    element.contentEditable = 'plaintext-only'
    element.textContent = 'editable'
    document.body.append(element)
    element.focus()
    return element
  })
  if (!editable) throw new Error('could not create contenteditable test target')
  await page.keyboard.down('Space')
  if (await cursor() !== 'move') throw new Error('Space from a contenteditable target enabled canvas panning')
  await page.keyboard.up('Space')
  await page.evaluate(() => document.querySelector('[contenteditable]')?.remove())

  await focusBody()
  await page.keyboard.down('Space')
  if (await cursor() !== 'grab') throw new Error('Space from the canvas did not enable panning')

  // Moving focus while the key is held must not leave the canvas stuck in pan mode.
  await input.focus()
  await page.keyboard.up('Space')
  if (await cursor() !== 'move') throw new Error('keyup after focus movement did not clear canvas panning')

  await focusBody()
  await page.keyboard.down('Space')
  if (await cursor() !== 'grab') throw new Error('canvas panning did not re-enable after focus recovery')
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  if (await cursor() !== 'move') throw new Error('window blur did not clear canvas panning')
  await page.keyboard.up('Space')

  if (errors.length) throw new Error(errors.join('\n'))
  console.log('keyboard regression tests passed')
} finally {
  try { await browser?.close() } catch {}
  stopServer(server)
}
