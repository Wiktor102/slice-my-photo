import { spawn } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
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

const errors = []
let server = null
let browser = null
let exitCode = 1

function killServerTree(proc) {
  if (!proc || proc.exitCode !== null || !proc.pid) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }
  try { process.kill(-proc.pid, 'SIGTERM') } catch {}
  proc.kill('SIGTERM')
}

function report() {
  console.log('\n=== ERRORS (' + errors.length + ') ===')
  for (const e of errors) console.log(e)
}

try {
  const require = createRequire(import.meta.url)
  const viteBin = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js')

  server = spawn(process.execPath, [viteBin], { cwd: process.cwd(), stdio: 'pipe', detached: process.platform !== 'win32' })
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

  browser = await chromium.launch()
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

  const step = async (name, fn) => {
    try { await fn(); console.log('OK:', name) } catch (e) {
      console.log('FAIL:', name, '-', e.message)
      errors.push(name + ': ' + e.message)
      throw new Error('required step "' + name + '" failed: ' + e.message)
    }
  }

  await step('goto upload', async () => { await page.goto(url, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('.upload-card', { timeout: 10000 }) })
  await step('upload image', async () => {
    await page.setInputFiles('input[type=file]', { name: 'test.png', mimeType: 'image/png', buffer: PNG })
    await page.waitForFunction(() => { const b = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Continue to Editor')); return !!b && !b.disabled }, undefined, { timeout: 12000 })
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
  await step('fit image into openings', async () => {
    const positioning = page.locator('.card', { hasText: 'Image Positioning' })
    await positioning.getByRole('button', { name: 'Fit', exact: true }).click()
    if (!(await positioning.getByRole('button', { name: 'Fit', exact: true }).evaluate((button) => button.classList.contains('primary')))) {
      throw new Error('fit mode did not activate')
    }
  })
  await step('save and compare variants', async () => {
    await page.getByRole('button', { name: 'Compare', exact: true }).click()
    await page.waitForSelector('.variant-modal')
    const name = page.getByRole('textbox', { name: 'Variant name' })
    for (const label of ['Gallery A', 'Gallery B', 'Gallery C']) {
      await name.fill(label)
      await page.getByRole('button', { name: 'Save variant', exact: true }).click()
    }
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('slice-my-photo-variants') || 'null'))
    if (stored?.version !== 3 || stored.variants?.length !== 3) throw new Error('variant storage was not persisted in the current schema')
    const checks = page.locator('.variant-check input')
    await checks.nth(0).check()
    await checks.nth(1).check()
    await page.getByRole('button', { name: 'Compare selected', exact: true }).click()
    await page.waitForSelector('.compare-overlay')
    if (await page.locator('.compare-cell').count() !== 2) throw new Error('expected two comparison cells')
    const panelsWhileComparing = await page.locator('.panel-row').count()
    await page.keyboard.press('Control+Z')
    await page.keyboard.press('Control+Y')
    if (await page.locator('.panel-row').count() !== panelsWhileComparing) throw new Error('compare shortcuts changed the editor')
    await page.getByRole('button', { name: 'Back to variants', exact: true }).click()
    await page.keyboard.press('Control+Z')
    if (await page.locator('.panel-row').count() !== panelsWhileComparing) throw new Error('variant modal shortcut changed the editor')
    await page.getByRole('button', { name: 'Close variants', exact: true }).click()
  })
  await step('undo and redo layout change', async () => {
    const undo = page.getByRole('button', { name: /^Undo/ })
    const redo = page.getByRole('button', { name: /^Redo/ })
    if (await undo.isDisabled()) throw new Error('undo should be enabled after changing the layout')
    await undo.click()
    if (await page.locator('.panel-row').count() < 3) throw new Error('undo removed the preset before undoing the image mode change')
    if (await redo.isDisabled()) throw new Error('redo should be enabled after undo')
    await undo.click()
    if (await page.locator('.panel-row').count() !== 0) throw new Error('undo did not remove the preset panels')
    await page.keyboard.press('Control+Shift+Z')
    if (await page.locator('.panel-row').count() < 3) throw new Error('redo shortcut did not restore the preset')
    await page.keyboard.press('Control+Shift+Z')
    if (await page.locator('.panel-row').count() < 3) throw new Error('redo shortcut did not restore the image mode change')
    await page.keyboard.press('Control+Z')
    if (await page.locator('.panel-row').count() < 3) throw new Error('undo shortcut removed the preset with the image mode change')
    await redo.click()
    if (await page.locator('.panel-row').count() < 3) throw new Error('redo button did not restore the image mode change')
  })
  await step('select a panel', async () => {
    await page.locator('.panel-row').first().click()
    await page.waitForSelector('.panel-row.selected', { timeout: 3000 })
  })
  await step('change wall color', async () => {
    await page.locator('.card', { hasText: 'Wall Setup' }).locator('.swatch[title="Light Blue"]').click()
    await page.waitForFunction(() => document.querySelector('.wall-color-hex')?.textContent === '#D6E4F0', undefined, { timeout: 3000 })
  })
  await step('enable passepartout', async () => {
    await page.locator('.toggle', { hasText: 'Use passepartout' }).click({ timeout: 3000 })
    await page.waitForFunction(() => [...document.querySelectorAll('.toggle')].some((t) => t.textContent.includes('Use passepartout') && t.classList.contains('on')), undefined, { timeout: 3000 })
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
    await page.evaluate(() => {
      const key = 'slice-my-photo-variants'
      const stored = JSON.parse(localStorage.getItem(key) || 'null')
      const variants = stored?.variants
      if (!Array.isArray(variants) || variants.length === 0) throw new Error('missing variants for migration check')
      const scalePassepartout = (settings) => {
        if (!settings) return
        for (const field of ['inset', 'openingWidth', 'openingHeight', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft']) settings[field] /= 10
      }
      variants.forEach((variant) => {
        variant.wall.width /= 10
        variant.wall.height /= 10
        variant.panels.forEach((panel) => {
          panel.width /= 10
          panel.height /= 10
          panel.x /= 10
          panel.y /= 10
          scalePassepartout(panel.passepartout)
        })
        variant.frame.edgeWidth /= 10
        variant.frame.matWidth /= 10
        Object.values(variant.perPanelFrame).forEach((panelFrame) => {
          panelFrame.edgeWidth /= 10
          scalePassepartout(panelFrame.passepartout)
        })
        variant.image.panX /= 10
        variant.image.panY /= 10
        variant.gap /= 10
      })
      stored.version = 2
      localStorage.setItem(key, JSON.stringify(stored))
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.editor', { timeout: 8000 })
    await page.waitForTimeout(500)
    const n = await page.locator('.panel-row').count()
    if (n < 3) throw new Error('resume failed: expected >=3 panels, got ' + n)
    console.log('   resumed panels:', n)
    await page.getByRole('button', { name: 'Compare', exact: true }).click()
    await page.waitForSelector('.variant-modal')
    const migratedMeta = await page.locator('.variant-row-meta').first().textContent()
    if (!migratedMeta?.includes('300 × 250 cm')) throw new Error('legacy variant dimensions were not migrated to canonical millimeters')
    await page.getByRole('button', { name: 'Close variants', exact: true }).click()
  })

  report()
  exitCode = errors.length ? 1 : 0
} catch (e) {
  console.log('\nsmoke test aborted:', e.message)
  report()
} finally {
  try { if (browser) await browser.close() } catch {}
  killServerTree(server)
  try { rmSync('./smoke-test.png', { force: true }) } catch {}
}
process.exit(exitCode)
