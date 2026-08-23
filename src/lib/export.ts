import JSZip from 'jszip'
import { jsPDF } from 'jspdf'
import { saveAs } from 'file-saver'
import { useStore, computeImagePlacement } from '../store/useStore'
import { panelGeometry, resolveFrame, toCm, fromCm, BASE_DPI, CM_PER_INCH } from './geometry'
import { frameHex, matHex } from './frameColors'
import { buildMeasurementPlan, type MeasurementGap, type MeasurementPlan } from './measurementPlan'

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

export interface PanelCropSpec {
  index: number
  name: string
  relX: number
  relY: number
  relW: number
  relH: number
  outW: number
  outH: number
  mime: 'image/jpeg' | 'image/png'
  quality: number
}

interface VisPanel {
  outerX: number; outerY: number; outerW: number; outerH: number
  innerX: number; innerY: number; innerW: number; innerH: number
  visX: number; visY: number; visW: number; visH: number
  frameColor: string
  matColor: string | null
  shadow: boolean
  number: number
}

export interface ExportPlan {
  panels: PanelCropSpec[]
  visualization: object | null
  warnings: DpiWarning[]
}

export function computePlan(options: ExportOptions): ExportPlan {
  const state = useStore.getState()
  const { panels, frame, perPanelFrame, wall, unit, sourceImage } = state
  if (!sourceImage || panels.length === 0) return { panels: [], visualization: null, warnings: [] }

  const placement = computeImagePlacement(panels, frame, perPanelFrame, state.image, sourceImage)
  const imgW = sourceImage.nativeWidth
  const imgH = sourceImage.nativeHeight

  const specs: PanelCropSpec[] = []
  const warnings: DpiWarning[] = []

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
    const coveredWpx = Math.max(0, Math.min(relX + relW, imgW) - Math.max(relX, 0))
    const coveredHpx = Math.max(0, Math.min(relY + relH, imgH) - Math.max(relY, 0))
    const cap = Math.min(coveredWpx / outW, coveredHpx / outH, 1)
    if (cap > 0 && cap < 1) {
      outW = Math.max(1, Math.round(outW * cap))
      outH = Math.max(1, Math.round(outH * cap))
    }

    // effective DPI (clamped coverage)
    const dpiW = visWCm > 0 ? coveredWpx / (visWCm / CM_PER_INCH) : 0
    const dpiH = visHCm > 0 ? coveredHpx / (visHCm / CM_PER_INCH) : 0
    const dpi = Math.min(dpiW, dpiH)
    if (dpi > 0 && dpi < BASE_DPI) warnings.push({ index: i, dpi: Math.round(dpi) })

    specs.push({
      index: i,
      name: `panel-${i + 1}.${options.format === 'png' ? 'png' : 'jpg'}`,
      relX, relY, relW, relH,
      outW, outH,
      mime: options.format === 'png' ? 'image/png' : 'image/jpeg',
      quality: options.quality,
    })
  })

  let visualization: object | null = null
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

  return { panels: specs, visualization, warnings }
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
    worker.postMessage({
      imageUrl: sourceImage.fullUrl,
      panels: plan.panels,
      visualization: plan.visualization,
    })
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

function formatMeasure(value: number): string {
  const rounded = Math.round(value * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

function formatSize(width: number, height: number, unit: string): string {
  return `${formatMeasure(width)} × ${formatMeasure(height)} ${unit}`
}

function setDashed(pdf: jsPDF, dashed: boolean): void {
  pdf.setLineDashPattern(dashed ? [2, 2] : [], 0)
}

function pageRect(rect: { x: number; y: number; w: number; h: number }, offX: number, offY: number, scale: number) {
  return {
    x: offX + rect.x * scale,
    y: offY + rect.y * scale,
    w: rect.w * scale,
    h: rect.h * scale,
  }
}

function drawDimensionLine(
  pdf: jsPDF,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  label: string,
  horizontal: boolean,
): void {
  pdf.setDrawColor(125, 125, 135)
  pdf.setTextColor(90, 90, 100)
  pdf.setLineWidth(0.18)
  pdf.line(x1, y1, x2, y2)
  if (horizontal) {
    pdf.line(x1, y1 - 1.5, x1, y1 + 1.5)
    pdf.line(x2, y2 - 1.5, x2, y2 + 1.5)
    pdf.setFontSize(5.8)
    pdf.text(label, (x1 + x2) / 2, y1 - 1.8, { align: 'center' })
  } else {
    pdf.line(x1 - 1.5, y1, x1 + 1.5, y1)
    pdf.line(x2 - 1.5, y2, x2 + 1.5, y2)
    pdf.setFontSize(5.8)
    pdf.text(label, x1 - 2, (y1 + y2) / 2, { align: 'right', angle: 90 })
  }
}

function drawGap(pdf: jsPDF, gap: MeasurementGap, offX: number, offY: number, scale: number, unit: string): void {
  const x1 = offX + gap.line.x1 * scale
  const y1 = offY + gap.line.y1 * scale
  const x2 = offX + gap.line.x2 * scale
  const y2 = offY + gap.line.y2 * scale
  const offset = gap.orientation === 'horizontal' ? -3 : -3
  if (gap.orientation === 'horizontal') drawDimensionLine(pdf, x1, y1 + offset, x2, y2 + offset, `${formatMeasure(gap.gap)} ${unit}`, true)
  else drawDimensionLine(pdf, x1 + offset, y1, x2 + offset, y2, `${formatMeasure(gap.gap)} ${unit}`, false)
}

function drawMeasurementTable(pdf: jsPDF, plan: MeasurementPlan, startY: number): number {
  const pageW = pdf.internal.pageSize.getWidth()
  const margin = 14
  const unit = plan.unit === 'cm' ? 'cm' : 'in'
  const columns = [
    { label: 'Frame', width: 18 },
    { label: 'Outer W × H', width: 42 },
    { label: 'Left', width: 22 },
    { label: 'Right', width: 22 },
    { label: 'Top', width: 22 },
    { label: 'Bottom', width: 22 },
    { label: 'Hang X', width: 27 },
    { label: 'Hang Y', width: 27 },
    { label: 'Edge', width: 20 },
  ]
  const tableW = columns.reduce((sum, column) => sum + column.width, 0)
  const tableX = Math.max(margin, (pageW - tableW) / 2)
  const rowH = 8
  let y = startY
  let x = tableX
  pdf.setFillColor(35, 35, 42)
  pdf.setDrawColor(100, 100, 110)
  pdf.setTextColor(255, 255, 255)
  pdf.setFontSize(6.5)
  for (const column of columns) {
    pdf.rect(x, y, column.width, rowH, 'FD')
    pdf.text(column.label, x + column.width / 2, y + 5.2, { align: 'center' })
    x += column.width
  }

  y += rowH
  pdf.setFontSize(6.3)
  plan.panels.forEach((panel, index) => {
    x = tableX
    const values = [
      `#${panel.number}`,
      formatSize(panel.outer.w, panel.outer.h, unit),
      `${formatMeasure(panel.wallDistances.left)} ${unit}`,
      `${formatMeasure(panel.wallDistances.right)} ${unit}`,
      `${formatMeasure(panel.wallDistances.top)} ${unit}`,
      `${formatMeasure(panel.wallDistances.bottom)} ${unit}`,
      `${formatMeasure(panel.hangingPoint.x)} ${unit}`,
      `${formatMeasure(panel.hangingPoint.y)} ${unit}`,
      `${formatMeasure(panel.frameEdge)} ${unit}`,
    ]
    pdf.setFillColor(index % 2 === 0 ? 248 : 238, index % 2 === 0 ? 248 : 238, index % 2 === 0 ? 250 : 242)
    pdf.setTextColor(45, 45, 55)
    for (let i = 0; i < columns.length; i++) {
      const column = columns[i]
      pdf.rect(x, y, column.width, rowH, 'FD')
      pdf.text(values[i], x + column.width / 2, y + 5.2, { align: 'center' })
      x += column.width
    }
    y += rowH
  })
  return y
}

function drawGapTable(pdf: jsPDF, plan: MeasurementPlan, startY: number): number {
  const unit = plan.unit === 'cm' ? 'cm' : 'in'
  const margin = 14
  let y = startY
  pdf.setTextColor(40, 40, 50)
  pdf.setFontSize(10)
  pdf.text('Aligned adjacent gaps', margin, y)
  y += 6
  pdf.setFontSize(7)
  if (plan.gaps.length === 0) {
    pdf.setTextColor(110, 110, 120)
    pdf.text('No aligned adjacent panel pairs found.', margin, y)
    return y + 8
  }

  const columns = [
    { label: 'Direction', width: 35 },
    { label: 'Panels', width: 35 },
    { label: `Gap (${unit})`, width: 35 },
  ]
  let x = margin
  pdf.setFillColor(225, 225, 230)
  pdf.setDrawColor(145, 145, 155)
  pdf.setTextColor(50, 50, 60)
  for (const column of columns) {
    pdf.rect(x, y, column.width, 7, 'FD')
    pdf.text(column.label, x + 2, y + 4.8)
    x += column.width
  }
  y += 7
  plan.gaps.forEach((gap, index) => {
    x = margin
    const values = [gap.orientation === 'horizontal' ? 'Horizontal' : 'Vertical', `#${gap.from} ↔ #${gap.to}`, formatMeasure(gap.gap)]
    pdf.setFillColor(index % 2 === 0 ? 250 : 242, index % 2 === 0 ? 250 : 242, 252)
    for (let i = 0; i < columns.length; i++) {
      const column = columns[i]
      pdf.rect(x, y, column.width, 7, 'FD')
      pdf.text(values[i], x + 2, y + 4.8)
      x += column.width
    }
    y += 7
  })
  return y + 5
}

function drawInstallationGuidePage(pdf: jsPDF, plan: MeasurementPlan): void {
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 14
  const unit = plan.unit === 'cm' ? 'cm' : 'in'
  const drawTop = 27
  const footerH = 26
  const drawW = pageW - margin * 2
  const drawH = pageH - drawTop - footerH
  const scale = Math.min(drawW / plan.wall.width, drawH / plan.wall.height)
  const wallW = plan.wall.width * scale
  const wallH = plan.wall.height * scale
  const offX = (pageW - wallW) / 2
  const offY = drawTop + (drawH - wallH) / 2

  pdf.setTextColor(25, 25, 32)
  pdf.setFontSize(15)
  pdf.text('Installation Guide', margin, 14)
  pdf.setTextColor(100, 100, 112)
  pdf.setFontSize(8)
  pdf.text(`Wall: ${formatSize(plan.wall.width, plan.wall.height, unit)} · origin (0, 0) is top-left`, pageW - margin, 13.5, { align: 'right' })
  pdf.text('Frame rectangles show outer dimensions. Dashed rectangles show the inner image area.', margin, 20)

  pdf.setFillColor(245, 245, 245)
  pdf.setDrawColor(55, 55, 65)
  pdf.setLineWidth(0.5)
  pdf.rect(offX, offY, wallW, wallH, 'FD')

  setDashed(pdf, true)
  pdf.setDrawColor(205, 145, 55)
  pdf.setLineWidth(0.25)
  const centerX = offX + plan.centerlines.verticalX * scale
  const centerY = offY + plan.centerlines.horizontalY * scale
  pdf.line(centerX, offY, centerX, offY + wallH)
  pdf.line(offX, centerY, offX + wallW, centerY)
  setDashed(pdf, false)
  pdf.setTextColor(165, 105, 35)
  pdf.setFontSize(5.8)
  pdf.text(`V center ${formatMeasure(plan.centerlines.verticalX)} ${unit}`, centerX + 1.5, offY + 5)
  pdf.text(`H center ${formatMeasure(plan.centerlines.horizontalY)} ${unit}`, offX + 2, centerY - 1.5)

  for (const panel of plan.panels) {
    const outer = pageRect(panel.outer, offX, offY, scale)
    const inner = pageRect(panel.inner, offX, offY, scale)
    pdf.setFillColor(255, 255, 255)
    pdf.setDrawColor(30, 30, 38)
    pdf.setLineWidth(0.45)
    pdf.rect(outer.x, outer.y, outer.w, outer.h, 'FD')
    setDashed(pdf, true)
    pdf.setDrawColor(125, 125, 135)
    pdf.setLineWidth(0.2)
    pdf.rect(inner.x, inner.y, inner.w, inner.h, 'D')
    setDashed(pdf, false)

    pdf.setTextColor(35, 35, 45)
    pdf.setFontSize(Math.max(7, Math.min(13, outer.w / 4)))
    pdf.text(`#${panel.number}`, outer.x + outer.w / 2, outer.y + outer.h / 2, { align: 'center', baseline: 'middle' })

    const sizeLabel = formatSize(panel.outer.w, panel.outer.h, unit)
    pdf.setFontSize(6.2)
    pdf.setTextColor(55, 55, 65)
    const labelY = outer.y - 2 >= drawTop ? outer.y - 2 : outer.y + outer.h + 4
    pdf.text(sizeLabel, outer.x + outer.w / 2, labelY, { align: 'center' })

    const hangingX = offX + panel.hangingPoint.x * scale
    const hangingY = offY + panel.hangingPoint.y * scale
    pdf.setFillColor(53, 110, 196)
    pdf.setDrawColor(255, 255, 255)
    pdf.setLineWidth(0.25)
    pdf.circle(hangingX, hangingY, 1.4, 'FD')
    pdf.setTextColor(35, 80, 150)
    pdf.setFontSize(5.8)
    pdf.text(`H${panel.number}`, hangingX + 2, Math.max(drawTop + 4, hangingY - 2))
  }

  for (const gap of plan.gaps) drawGap(pdf, gap, offX, offY, scale, unit)

  const footerY = pageH - footerH + 2
  pdf.setDrawColor(190, 190, 198)
  pdf.setLineWidth(0.2)
  pdf.line(margin, footerY - 4, pageW - margin, footerY - 4)
  pdf.setTextColor(70, 70, 80)
  pdf.setFontSize(7)
  pdf.text('● H1/H2… = hanging point at the outer-frame top center. Coordinates and edge distances are on page 2.', margin, footerY + 2)
  pdf.text('Hanging-point assumption: no hardware offset is included. Confirm the actual hanger position from the frame or hardware manufacturer before drilling.', margin, footerY + 8)
  pdf.setTextColor(120, 120, 130)
  pdf.text(`Centerlines: vertical X ${formatMeasure(plan.centerlines.verticalX)} ${unit} · horizontal Y ${formatMeasure(plan.centerlines.horizontalY)} ${unit}`, margin, footerY + 14)
  pdf.text('Page 1 of 2', pageW - margin, footerY + 14, { align: 'right' })
}

function drawSchedulePage(pdf: jsPDF, plan: MeasurementPlan): void {
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 14
  const unit = plan.unit === 'cm' ? 'cm' : 'in'
  pdf.addPage('a4', 'landscape')
  pdf.setTextColor(25, 25, 32)
  pdf.setFontSize(15)
  pdf.text('Installation Schedule', margin, 14)
  pdf.setTextColor(100, 100, 112)
  pdf.setFontSize(8)
  pdf.text(`Wall: ${formatSize(plan.wall.width, plan.wall.height, unit)} · ${plan.panels.length} frame${plan.panels.length === 1 ? '' : 's'}`, pageW - margin, 13.5, { align: 'right' })
  pdf.text('All distances are measured from the wall origin at the top-left. “Hang” is the assumed outer-frame top-center point.', margin, 20)

  const tableBottom = drawMeasurementTable(pdf, plan, 29)
  const y = drawGapTable(pdf, plan, tableBottom + 12)
  const noteTop = Math.min(y + 4, pageH - 33)
  pdf.setDrawColor(180, 180, 190)
  pdf.setFillColor(248, 248, 250)
  pdf.roundedRect(margin, noteTop, pageW - margin * 2, pageH - noteTop - 15, 2, 2, 'FD')
  pdf.setTextColor(55, 55, 66)
  pdf.setFontSize(7.2)
  pdf.text('Installation notes', margin + 4, noteTop + 7)
  pdf.setTextColor(90, 90, 100)
  pdf.setFontSize(6.8)
  const notes = pdf.splitTextToSize(
    `Hanging point assumption: ${plan.hangingPointAssumption} Use the Hang X / Hang Y coordinates as layout references only; do not infer a hook, cleat, wire, or bracket offset. Verify the actual hardware position against the frame and its manufacturer instructions. Outer dimensions include each panel's resolved frame edge width (${unit}).`,
    pageW - margin * 2 - 8,
  )
  pdf.text(notes, margin + 4, noteTop + 12)
  pdf.setTextColor(120, 120, 130)
  pdf.setFontSize(7)
  pdf.text('Page 2 of 2', pageW - margin, pageH - 7, { align: 'right' })
}

export function buildMeasurementsPdf(plan?: MeasurementPlan): jsPDF {
  const state = useStore.getState()
  const measurementPlan = plan ?? buildMeasurementPlan({
    wall: state.wall,
    panels: state.panels,
    frame: state.frame,
    perPanelFrame: state.perPanelFrame,
    unit: state.unit,
  })
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  drawInstallationGuidePage(pdf, measurementPlan)
  drawSchedulePage(pdf, measurementPlan)
  return pdf
}
