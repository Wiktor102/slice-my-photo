import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
const atob = (value) => Buffer.from(value, 'base64').toString('binary')
const btoa = (value) => Buffer.from(value, 'binary').toString('base64')
globalThis.window = { localStorage: globalThis.localStorage, atob, btoa, console }

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const tempDir = join(tmpdir(), 'slice-my-photo-measurement-artifacts')
rmSync(tempDir, { recursive: true, force: true })
mkdirSync(tempDir, { recursive: true })
try {
  const { buildMeasurementPlan } = await server.ssrLoadModule('/src/lib/measurementPlan.ts')
  const { buildMeasurementsPdf } = await server.ssrLoadModule('/src/lib/export.ts')

  const frame = {
    edgeWidth: 4,
    colorKey: 'black',
    customColor: '#000000',
    matEnabled: false,
    matWidth: 0,
    matColorKey: 'white',
    matCustomColor: '#ffffff',
    shadow: false,
    perPanel: true,
  }
  const panelXs = [50, 175, 300, 425, 550, 675, 800, 925]
  const panels = panelXs.map((x, index) => ({
    id: `pdf-panel-${index + 1}`,
    width: 100,
    height: 120,
    x,
    y: 180,
    sizePreset: 'custom',
    displayUnit: index % 2 === 0 ? 'in' : 'cm',
  }))
  const perPanelFrame = Object.fromEntries(panels.map((panel, index) => [panel.id, {
    edgeWidth: 2 + index,
    colorKey: 'black',
    customColor: '#000000',
    shadow: false,
    passepartout: {
      enabled: false,
      mode: 'inset',
      inset: 0,
      openingWidth: panel.width,
      openingHeight: panel.height,
      marginTop: 0,
      marginRight: 0,
      marginBottom: 0,
      marginLeft: 0,
      colorKey: 'white',
      customColor: '#ffffff',
    },
  }]))
  const plan = buildMeasurementPlan({
    wall: { width: 1100, height: 500, color: '#ffffff' },
    panels,
    frame,
    perPanelFrame,
    unit: 'in',
  })

  assert.equal(plan.panels.length, 8)
  assert.deepEqual(plan.panels.map((panel) => panel.frameEdge), [2, 3, 4, 5, 6, 7, 8, 9])
  assert.equal(plan.gaps.filter((gap) => gap.orientation === 'horizontal').length, 7)

  const pdf = buildMeasurementsPdf(plan)
  const pdfPath = join(tempDir, 'measurement-guide.pdf')
  const pdfBytes = Buffer.from(pdf.output('arraybuffer'))
  writeFileSync(pdfPath, pdfBytes)

  const pages = pdf.internal.getNumberOfPages()
  assert.equal(pages, 3)

  // jsPDF emits uncompressed text streams, so extract the Tj operands here
  // without relying on a host-installed pdftotext binary.
  const extracted = [...pdfBytes.toString('latin1').matchAll(/\(((?:\\.|[^()])*)\)\s*Tj/g)]
    .map((match) => match[1].replace(/\\([()\\])/g, '$1'))
    .join('\n')
  assert.match(extracted, /Installation Guide/)
  assert.match(extracted, /Image W x H/)
  assert.match(extracted, /43\.31 x 19\.69 in/)
  assert.match(extracted, /#1 to #2/)
  assert.doesNotMatch(extracted, /[^\x00-\x7F]/)

  console.log(`measurement PDF generated and extracted (${pages} pages; ${pdfPath})`)
} finally {
  await server.close()
}
