/// <reference lib="webworker" />

import type { ExportWorkerRequest } from './exportTypes'

function drawClipped(
  ctx: OffscreenCanvasRenderingContext2D,
  bitmap: ImageBitmap,
  relX: number, relY: number, relW: number, relH: number,
  outW: number, outH: number,
  transparent: boolean,
) {
  if (!transparent) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, outW, outH)
  }
  const imgW = bitmap.width
  const imgH = bitmap.height
  const sx0 = Math.max(0, relX)
  const sy0 = Math.max(0, relY)
  const sx1 = Math.min(imgW, relX + relW)
  const sy1 = Math.min(imgH, relY + relH)
  const srcW = sx1 - sx0
  const srcH = sy1 - sy0
  if (srcW <= 0 || srcH <= 0) return
  const destX = ((sx0 - relX) / relW) * outW
  const destY = ((sy0 - relY) / relH) * outH
  const destW = (srcW / relW) * outW
  const destH = (srcH / relH) * outH
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, sx0, sy0, srcW, srcH, destX, destY, destW, destH)
}

self.onmessage = async (e: MessageEvent<ExportWorkerRequest>) => {
  const { imageUrl, panels, visualization } = e.data
  try {
    const resp = await fetch(imageUrl)
    const blob = await resp.blob()
    const bitmap = await createImageBitmap(blob)

    for (const p of panels) {
      const canvas = new OffscreenCanvas(p.outW, p.outH)
      const ctx = canvas.getContext('2d')!
      drawClipped(ctx, bitmap, p.relX, p.relY, p.relW, p.relH, p.outW, p.outH, p.mime === 'image/png')
      const outBlob = await canvas.convertToBlob({ type: p.mime, quality: p.quality })
      ;(self as unknown as Worker).postMessage({ kind: 'panel', index: p.index, name: p.name, blob: outBlob })
    }

    if (visualization) {
      const v = visualization
      const canvas = new OffscreenCanvas(Math.round(v.wallW * v.pxPerUnit), Math.round(v.wallH * v.pxPerUnit))
      const ctx = canvas.getContext('2d')!
      // wall
      ctx.fillStyle = v.wallColor
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      const imgWpx = v.imgNativeW * v.scale * v.pxPerUnit
      const imgHpx = v.imgNativeH * v.scale * v.pxPerUnit
      const imgXpx = v.panX * v.pxPerUnit
      const imgYpx = v.panY * v.pxPerUnit
      for (const panel of v.panels) {
        const O = (n: number) => n * v.pxPerUnit
        if (panel.shadow) {
          ctx.save()
          ctx.shadowColor = 'rgba(0,0,0,0.35)'
          ctx.shadowBlur = 18 * v.pxPerUnit
          ctx.shadowOffsetY = 6 * v.pxPerUnit
          ctx.fillStyle = panel.frameColor
          ctx.fillRect(O(panel.outerX), O(panel.outerY), O(panel.outerW), O(panel.outerH))
          ctx.restore()
        } else {
          ctx.fillStyle = panel.frameColor
          ctx.fillRect(O(panel.outerX), O(panel.outerY), O(panel.outerW), O(panel.outerH))
        }
        if (panel.matColor) {
          ctx.fillStyle = panel.matColor
          ctx.fillRect(O(panel.innerX), O(panel.innerY), O(panel.innerW), O(panel.innerH))
        }
        // clipped image
        ctx.save()
        ctx.beginPath()
        ctx.rect(O(panel.visX), O(panel.visY), O(panel.visW), O(panel.visH))
        ctx.clip()
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(O(panel.visX), O(panel.visY), O(panel.visW), O(panel.visH))
        ctx.drawImage(bitmap, imgXpx, imgYpx, imgWpx, imgHpx)
        ctx.restore()
        // number label
        const cx = O(panel.outerX + panel.outerW / 2)
        const cy = O(panel.outerY + panel.outerH / 2)
        const r = Math.max(14, Math.min(O(panel.outerW), O(panel.outerH)) * 0.12)
        ctx.fillStyle = 'rgba(0,0,0,0.5)'
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#ffffff'
        ctx.font = `${r * 1.1}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(panel.number), cx, cy + 1)
      }
      const visBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 })
      ;(self as unknown as Worker).postMessage({ kind: 'visualization', blob: visBlob })
    }

    ;(self as unknown as Worker).postMessage({ kind: 'done' })
  } catch (err) {
    ;(self as unknown as Worker).postMessage({ kind: 'error', message: String(err) })
  }
}
