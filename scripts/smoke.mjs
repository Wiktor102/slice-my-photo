import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
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
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}
function makePng(w, h, r, g, b) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  const rowLen = w * 3 + 1
  const raw = Buffer.alloc(rowLen * h)
  for (let y = 0; y < h; y++) {
    raw[y * rowLen] = 0
    for (let x = 0; x < w; x++) {
      const o = y * rowLen + 1 + x * 3
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b
    }
  }
  const idat = deflateSync(raw)
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

const PNG = makePng(400, 600, 90, 140, 200)
writeFileSync('./smoke-test.png', PNG)

const server = spawn(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['dev'], { cwd: process.cwd(), stdio: 'pipe', shell: true })
server.stdout.on('data', (d) => process.stdout.write('[vite] ' + d.toString()))
server.stderr.on('data', (d) => process.stderr.write('[vite-err] ' + d.toString()))

let url = ''
await new Promise((resolve) => {
  const to = setTimeout(() => { if (!url) { url = 'http://localhost:5173'; resolve() } }, 12000)
  server.stdout.on('data', (d) => {
    const m = d.toString().match(/http:\/\/localhost:(\d+)/)
    if (m && !url) { url = 'http://localhost:' + m[1]; clearTimeout(to); resolve() }
  })
})
console.log('using url:', url)

const errors = []
const browser = await chromium.launch()
const page = await browser.newPage({ acceptDownloads: true })
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
await page.addInitScript(() => {
  try {
    if (!localStorage.getItem('__test_seeded')) {
      localStorage.clear()
      indexedDB.deleteDatabase('slice-my-photo')
      localStorage.setItem('__test_seeded', '1')
    }
  } catch {}
})

const step = async (name, fn) => { try { await fn(); console.log('OK:', name) } catch (e) { console.log('FAIL:', name, '-', e.message); errors.push(name + ': ' + e.message) } }

await step('goto upload', async () => { await page.goto(url, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('.upload-card', { timeout: 10000 }) })
await step('upload image', async () => {
  await page.setInputFiles('input[type=file]', { name: 'test.png', mimeType: 'image/png', buffer: PNG })
  await page.waitForFunction(() => { const b = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Continue to Editor')); return !!b && !b.disabled }, { timeout: 12000 })
})
await step('continue to editor', async () => {
  await page.click('button:has-text("Continue to Editor")')
  await page.waitForSelector('.editor', { timeout: 8000 })
})
await step('apply Triptych preset', async () => {
  await page.waitForSelector('.preset-btn')
  await page.locator('.preset-btn', { hasText: 'Triptych' }).click()
  await page.waitForTimeout(400)
  const n = await page.locator('.panel-row').count()
  if (n < 3) throw new Error('expected >=3 panels, got ' + n)
  console.log('   panels:', n)
})
await step('click canvas to select', async () => {
  await page.locator('canvas').first().click({ position: { x: 250, y: 200 } })
  await page.waitForTimeout(200)
})
await step('change wall color', async () => { await page.locator('input[type=color]').first().fill('#aabbcc') })
await step('enable mat', async () => {
  await page.locator('.toggle', { hasText: 'Mat' }).click({ timeout: 3000 })
  await page.waitForTimeout(200)
})
await step('open export modal', async () => {
  await page.click('button:has-text("Export")')
  await page.waitForSelector('.modal', { timeout: 5000 })
})
await step('download zip', async () => {
  await page.locator('.modal').textContent()
  const dl = page.locator('button:has-text("Download ZIP")')
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 25000 }), dl.click()])
  const p = await d.path()
  console.log('   saved:', p)
  const fs = await import('node:fs/promises')
  const buf = await fs.readFile(p)
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(buf)
  const names = Object.keys(zip.files)
  console.log('   zip entries:', names.join(', '))
  for (const n of names) {
    const blob = await zip.files[n].async('uint8array')
    console.log('   -', n, blob.length, 'bytes')
  }
  if (!names.some((n) => n.startsWith('panel-'))) throw new Error('no panel images in zip')
})
await step('preview toggle', async () => {
  await page.click('button:has-text("Preview")')
  await page.waitForTimeout(300)
  await page.click('button:has-text("Back to Editor")')
  await page.waitForTimeout(200)
})

await step('reload resumes session', async () => {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.editor', { timeout: 8000 })
  await page.waitForTimeout(500)
  const n = await page.locator('.panel-row').count()
  if (n < 3) throw new Error('resume failed: expected >=3 panels, got ' + n)
  console.log('   resumed panels:', n)
})

await browser.close()
server.kill()
console.log('\n=== ERRORS (' + errors.length + ') ===')
for (const e of errors) console.log(e)
process.exit(errors.length ? 1 : 0)
