import { useMemo } from 'react'
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

  return (
    <div className="bottombar">
      <button className={isFitWall ? 'primary fit-active' : ''} onClick={onZoomToFit}>Fit to wall</button>
      <button className={isFitImage ? 'primary fit-active' : ''} onClick={onZoomToImage} disabled={!hasImage}>Fit to image</button>
      <button className={showGrid ? 'primary' : ''} onClick={toggleGrid}>Toggle grid</button>
      <div className="spacer" />
      <span>Zoom: {Math.round(viewport.scale * 100)}%</span>
      <span>·</span>
      <span>Units: {unit === 'cm' ? 'centimeters' : 'inches'}</span>
    </div>
  )
}
