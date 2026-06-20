import { useStore } from '../store/useStore'
import { WallCanvas } from './WallCanvas'

export function PreviewMode() {
  const setPreview = useStore((s) => s.setPreview)
  return (
    <div className="preview-overlay">
      <button className="primary preview-back" onClick={() => setPreview(false)}>← Back to Editor</button>
      <WallCanvas forPreview />
    </div>
  )
}
