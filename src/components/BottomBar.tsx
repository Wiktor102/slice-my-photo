import { useEffect, useMemo, useRef } from 'react'
import { Maximize2Icon, CropIcon, Grid3x3Icon } from 'lucide-react'
import { useStore, useImagePlacement } from '../store/useStore'

const PAD = 48

function near(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= tol
}

interface Props {
  onZoomToFit: () => void
  onZoomToImage: () => void
}

export function BottomBar({ onZoomToFit, onZoomToImage }: Props) {
  const showGrid = useStore((s) => s.showGrid)
  const toggleGrid = useStore((s) => s.toggleGrid)
  const viewport = useStore((s) => s.viewport)
  const setViewport = useStore((s) => s.setViewport)
  const unit = useStore((s) => s.unit)
  const wall = useStore((s) => s.wall)
  const sourceImage = useStore((s) => s.sourceImage)
  const canvasSize = useStore((s) => s.canvasSize)
  const hasImage = sourceImage !== null
  const placement = useImagePlacement()

  const isFitWall = useMemo(() => {
    const { w, h } = canvasSize
    if (w <= 0 || h <= 0) return false
    const s = Math.max(0.2, Math.min((w - 2 * PAD) / wall.width, (h - 2 * PAD) / wall.height))
    const x = wall.width / 2 - w / 2 / s
    const y = wall.height / 2 - h / 2 / s
    const posTol = 0.5 / Math.max(viewport.scale, 0.001)
    return near(viewport.scale, s, 1e-4) && near(viewport.x, x, posTol) && near(viewport.y, y, posTol)
  }, [canvasSize, wall, viewport])

  const isFitImage = useMemo(() => {
    const { w, h } = canvasSize
    if (!sourceImage || w <= 0 || h <= 0) return false
    const imgW = sourceImage.nativeWidth * placement.scale
    const imgH = sourceImage.nativeHeight * placement.scale
    if (imgW <= 0 || imgH <= 0) return false
    const s = Math.max(0.2, Math.min((w - 2 * PAD) / imgW, (h - 2 * PAD) / imgH))
    const x = placement.panX - (w / 2 / s - imgW / 2)
    const y = placement.panY - (h / 2 / s - imgH / 2)
    const posTol = 0.5 / Math.max(viewport.scale, 0.001)
    return near(viewport.scale, s, 1e-4) && near(viewport.x, x, posTol) && near(viewport.y, y, posTol)
  }, [canvasSize, sourceImage, placement, viewport])

  const zoomPercent = Math.round(viewport.scale * 100)
  const zoomRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = zoomRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const step = e.shiftKey ? 0.5 : 0.1
      const delta = e.deltaY < 0 ? step : -step
      const next = Math.max(0.1, Math.min(5, viewport.scale + delta))
      setViewport({ scale: next })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [viewport.scale, setViewport])

  return (
    <div className="bottombar">
      <div className="spacer" />
      <button className={showGrid ? 'primary' : ''} onClick={toggleGrid}><Grid3x3Icon size={13} />Toggle grid</button>
      <button className={isFitWall ? 'primary fit-active' : ''} onClick={onZoomToFit}><Maximize2Icon size={13} />Fit to wall</button>
      <button className={isFitImage ? 'primary fit-active' : ''} onClick={onZoomToImage} disabled={!hasImage}><CropIcon size={13} />Fit to image</button>
      <span className="zoom-control" ref={zoomRef}>
        <input
          type="range"
          min={10}
          max={500}
          value={zoomPercent}
          onChange={(e) => setViewport({ scale: Number(e.target.value) / 100 })}
          title={`Zoom: ${zoomPercent}%`}
        />
        <span className="zoom-label">{zoomPercent}%</span>
      </span>
      <span>·</span>
      <span>Units: {unit === 'cm' ? 'centimeters' : 'inches'}</span>
    </div>
  )
}
