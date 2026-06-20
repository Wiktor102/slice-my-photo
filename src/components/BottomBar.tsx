import { useStore } from '../store/useStore'

interface Props {
  onZoomToFit: () => void
}

export function BottomBar({ onZoomToFit }: Props) {
  const showGrid = useStore((s) => s.showGrid)
  const toggleGrid = useStore((s) => s.toggleGrid)
  const viewport = useStore((s) => s.viewport)
  const unit = useStore((s) => s.unit)

  return (
    <div className="bottombar">
      <button onClick={onZoomToFit}>Zoom to fit</button>
      <button className={showGrid ? 'primary' : ''} onClick={toggleGrid}>Toggle grid</button>
      <div className="spacer" />
      <span>Zoom: {Math.round(viewport.scale * 100)}%</span>
      <span>·</span>
      <span>Units: {unit === 'cm' ? 'centimeters' : 'inches'}</span>
    </div>
  )
}
