import JSZip from 'jszip'
import { jsPDF } from 'jspdf'
import { saveAs } from 'file-saver'
import { useStore, computeImagePlacement } from '../store/useStore'
import { panelGeometry, resolveFrame, toCm, fromCm, BASE_DPI, CM_PER_INCH } from './geometry'
import { frameHex, matHex } from './frameColors'
import { computePreflight, sourceCoverageForRect } from './preflight'
import type { PreflightReport } from './preflight'
import type { ExportWorkerRequest, PanelCropSpec, VisPanel, VisSpec } from './exportTypes'

export type { PanelCropSpec } from './exportTypes'

export interface ExportOptions {
  format: 'jpeg' | 'png'
  quality: number
  bleedCm: number
  includeVisualization: boolean
  includeMeasurements: boolean
}

export interface DpiWarning {
  index: number
  dpi: number
}

export interface ExportPlan {
  panels: PanelCropSpec[]
  visualization: VisSpec | null
  warnings: DpiWarning[]
  preflight: PreflightReport
}

export function computePlan(options: ExportOptions): ExportPlan {
  const state = useStore.getState()
  const { panels, frame, perPanelFrame, wall, unit, sourceImage } = state
  if (!sourceImage || panels.length === 0) {
    return {
      panels: [],
      visualization: null,
      warnings: [],
      preflight: { panels: [], warningCount: 0, errorCount: 0, hasIssues: false },
    }
  }

  const placement = computeImagePlacement(panels, frame, perPanelFrame, state.image, sourceImage)
  const imgW = sourceImage.nativeWidth
  const imgH = sourceImage.nativeHeight
  const preflight = computePreflight({
    panels,
    frame,
    perPanelFrame,
    wall,
    unit,
    sourceImage,
    placement,
  })

  const specs: PanelCropSpec[] = []
  const warnings: DpiWarning[] = preflight.panels
    .filter((panel) => panel.dpi < BASE_DPI)
    .map((panel) => ({ index: panel.index, dpi: Math.round(panel.dpi) }))

  panels.forEach((panel, i) => {
    const f = resolveFrame(panel, frame, perPanelFrame)
    const geom = panelGeometry(panel, f)
    const vis = geom.visible
    const visWCm = toCm(vis.w, unit)
    const visHCm = toCm(vis.h, unit)

    let relX = (vis.x - placement.panX) / placement.scale
    let relY = (vis.y - placement.panY) / placement.scale
    let relW = vis.w / placement.scale
    let relH = vis.h / placement.scale

    if (options.bleedCm > 0) {
      const bleedWall = fromCm(options.bleedCm, unit)
      const bleedPx = bleedWall / placement.scale
      relX -= bleedPx
      relY -= bleedPx
      relW += 2 * bleedPx
      relH += 2 * bleedPx
    }

    let outW = Math.round(((visWCm + 2 * options.bleedCm) / CM_PER_INCH) * BASE_DPI)
    let outH = Math.round(((visHCm + 2 * options.bleedCm) / CM_PER_INCH) * BASE_DPI)

    // cap to available source resolution
    const coverage = sourceCoverageForRect({ x: relX, y: relY, w: relW, h: relH }, imgW, imgH)
    const cap = Math.min(coverage.coveredWidthPx / outW, coverage.coveredHeightPx / outH, 1)
    if (cap > 0 && cap < 1) {
      outW = Math.max(1, Math.round(outW * cap))
      outH = Math.max(1, Math.round(outH * cap))
    }

    specs.push({
      index: i,
      name: `panel-${i + 1}.${options.format === 'png' ? 'png' : 'jpg'}`,
      relX, relY, relW, relH,
      outW, outH,
      mime: options.format === 'png' ? 'image/png' : 'image/jpeg',
      quality: options.quality,
    })
  })

  let visualization: VisSpec | null = null
  if (options.includeVisualization) {
    const pxPerUnit = 1200 / Math.max(wall.width, wall.height)
    const visPanels: VisPanel[] = panels.map((panel, i) => {
      const f = resolveFrame(panel, frame, perPanelFrame)
      const g = panelGeometry(panel, f)
      return {
        outerX: g.outer.x, outerY: g.outer.y, outerW: g.outer.w, outerH: g.outer.h,
        innerX: g.inner.x, innerY: g.inner.y, innerW: g.inner.w, innerH: g.inner.h,
        visX: g.visible.x, visY: g.visible.y, visW: g.visible.w, visH: g.visible.h,
        frameColor: frameHex(f.colorKey, f.customColor),
        matColor: f.passepartout.enabled ? matHex(f.passepartout.colorKey, f.passepartout.customColor) : null,
        shadow: f.shadow,
        number: i + 1,
      }
    })
    visualization = {
      wallW: wall.width, wallH: wall.height, wallColor: wall.color, pxPerUnit,
      imgNativeW: sourceImage.nativeWidth, imgNativeH: sourceImage.nativeHeight,
      panX: placement.panX, panY: placement.panY, scale: placement.scale,
      panels: visPanels,
    }
  }

  return { panels: specs, visualization, warnings, preflight }
}

export async function runExport(options: ExportOptions, onProgress: (done: number, total: number) => void): Promise<void> {
  const state = useStore.getState()
  const { sourceImage } = state
  if (!sourceImage) return
  const plan = computePlan(options)
  if (plan.panels.length === 0) return

  const worker = new Worker(
    new URL('./exportWorker.ts', import.meta.url),
    { type: 'module' },
  )

  const zip = new JSZip()
  const total = plan.panels.length + (plan.visualization ? 1 : 0)
  let done = 0

  await new Promise<void>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data
      if (msg.kind === 'panel') {
        zip.file(msg.name, msg.blob)
        done += 1
        onProgress(done, total)
      } else if (msg.kind === 'visualization') {
        zip.file('visualization.jpg', msg.blob)
        done += 1
        onProgress(done, total)
      } else if (msg.kind === 'done') {
        resolve()
      } else if (msg.kind === 'error') {
        reject(new Error(msg.message))
      }
    }
    worker.onerror = (err) => reject(err)
    const request: ExportWorkerRequest = {
      imageUrl: sourceImage.fullUrl,
      panels: plan.panels,
      visualization: plan.visualization,
    }
    worker.postMessage(request)
  })
  worker.terminate()

  if (options.includeMeasurements) {
    const pdf = buildMeasurementsPdf()
    const pdfBlob = pdf.output('blob')
    zip.file('measurements.pdf', pdfBlob)
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  saveAs(zipBlob, 'slice-my-photo-export.zip')
}

export function buildMeasurementsPdf(): jsPDF {
  const state = useStore.getState()
  const { panels, frame, perPanelFrame, wall, unit } = state
  const u = unit === 'cm' ? 'cm' : 'in'
  // landscape A4 in points (1pt = 1/72 inch); we work in cm via unit scale
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 20
  const drawW = pageW - margin * 2
  const drawH = pageH - margin * 2 - 24 // room for legend
  const scale = Math.min(drawW / wall.width, drawH / wall.height)
  const offX = (pageW - wall.width * scale) / 2
  const offY = margin + 8

  // title
  pdf.setFontSize(14)
  pdf.setTextColor(20)
  pdf.text('Measurements Sheet', margin, margin)
  pdf.setFontSize(9)
  pdf.setTextColor(120)
  pdf.text(`Wall: ${wall.width} × ${wall.height} ${u}`, pageW - margin, margin, { align: 'right' })

  // wall
  pdf.setDrawColor(60)
  pdf.setFillColor(245, 245, 245)
  pdf.rect(offX, offY, wall.width * scale, wall.height * scale, 'FD')

  const sorted = [...panels].sort((a, b) => a.id.localeCompare(b.id))
  sorted.forEach((panel, i) => {
    const f = resolveFrame(panel, frame, perPanelFrame)
    const g = panelGeometry(panel, f)
    const O = (v: number) => offX + v * scale
    const x = O(g.outer.x)
    const y = offY + g.outer.y * scale
    const w = g.outer.w * scale
    const h = g.outer.h * scale
    pdf.setDrawColor(40)
    pdf.setFillColor(255, 255, 255)
    pdf.setLineWidth(0.4)
    pdf.rect(x, y, w, h, 'FD')
    // inner (dashed)
    pdf.setDrawColor(120)
    pdf.setLineWidth(0.2)
    const ix = O(g.inner.x)
    const iy = offY + g.inner.y * scale
    pdf.rect(ix, iy, g.inner.w * scale, g.inner.h * scale, 'D')
    // number
    pdf.setFontSize(13)
    pdf.setTextColor(40)
    pdf.text(String(i + 1), x + w / 2, y + h / 2, { align: 'center', baseline: 'middle' })
    // outer dim label
    pdf.setFontSize(7)
    pdf.setTextColor(60)
    const outerLabel = `${g.outer.w} × ${g.outer.h} ${u}`
    const innerLabel = `(${g.inner.w} × ${g.inner.h} ${u} image area)`
    if (w > 30 && h > 14) {
      pdf.text(outerLabel, x + w / 2, y + h / 2 + 6, { align: 'center' })
      pdf.setFontSize(6)
      pdf.setTextColor(120)
      pdf.text(innerLabel, x + w / 2, y + h / 2 + 10, { align: 'center' })
    } else {
      pdf.text(outerLabel, x + w / 2, y - 1.5, { align: 'center' })
    }
  })

  // first-panel offset labels
  if (sorted.length > 0) {
    const first = sorted[0]
    const fg = panelGeometry(first, resolveFrame(first, frame, perPanelFrame))
    pdf.setDrawColor(150)
    pdf.setLineWidth(0.15)
    pdf.setFontSize(7)
    pdf.setTextColor(120)
    pdf.line(offX, offY - 4, offX + fg.outer.x * scale, offY - 4)
    pdf.text(`${fg.outer.x} ${u}`, offX + (fg.outer.x * scale) / 2, offY - 5.5, { align: 'center' })
    pdf.line(offX - 4, offY, offX - 4, offY + fg.outer.y * scale)
    pdf.text(`${fg.outer.y} ${u}`, offX - 5, offY + (fg.outer.y * scale) / 2, { align: 'right' })
  }

  // gap labels between horizontally adjacent panels
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = panelGeometry(sorted[i], resolveFrame(sorted[i], frame, perPanelFrame)).outer
      const b = panelGeometry(sorted[j], resolveFrame(sorted[j], frame, perPanelFrame)).outer
      const horizontallyAdjacent = Math.abs(a.y - b.y) < 2 && b.x >= a.x + a.w - 0.5 && b.x < a.x + a.w + 50
      if (horizontallyAdjacent) {
        const gap = b.x - (a.x + a.w)
        if (gap > 0.1) {
          const gx = offX + (a.x + a.w) * scale
          const gy = offY + Math.max(a.y, b.y) * scale - 3
          pdf.setDrawColor(180)
          pdf.setLineWidth(0.15)
          pdf.line(gx, gy, gx + gap * scale, gy)
          pdf.setFontSize(6)
          pdf.setTextColor(120)
          pdf.text(`${gap} ${u}`, gx + (gap * scale) / 2, gy - 1, { align: 'center' })
        }
      }
    }
  }

  // legend
  const legendY = pageH - margin - 6
  pdf.setFontSize(8)
  pdf.setTextColor(60)
  const matCount = panels.filter((panel) => resolveFrame(panel, frame, perPanelFrame).passepartout.enabled).length
  const matNote = matCount > 0 ? `Passepartout: ${matCount} panel${matCount === 1 ? '' : 's'}` : 'No passepartout'
  pdf.text(`Frame edge: ${frame.edgeWidth} ${u}   |   ${matNote}   |   Panels: ${panels.length}`, margin, legendY)
  return pdf
}
