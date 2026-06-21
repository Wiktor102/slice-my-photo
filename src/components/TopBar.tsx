import { ImageIcon, SaveIcon, FolderOpenIcon, RotateCcwIcon, EyeIcon, EyeOffIcon, DownloadIcon } from 'lucide-react'
import { useStore } from '../store/useStore'

export function TopBar() {
  const setConfirmReset = useStore((s) => s.setConfirmReset)
  const setPreview = useStore((s) => s.setPreview)
  const setExportOpen = useStore((s) => s.setExportOpen)
  const setChangeImageOpen = useStore((s) => s.setChangeImageOpen)
  const setSaveLayoutOpen = useStore((s) => s.setSaveLayoutOpen)
  const setLoadLayoutOpen = useStore((s) => s.setLoadLayoutOpen)
  const preview = useStore((s) => s.preview)
  const panels = useStore((s) => s.panels)

  const canSave = panels.length > 0

  return (
    <div className="topbar">
      <img className="brand-mark" src="/brand-mark.svg" alt="" aria-hidden />
      <span className="title">Slice My Photo</span>
      <button className="ghost" onClick={() => setChangeImageOpen(true)}><ImageIcon size={14} />Change Image</button>
      <button
        className="ghost"
        disabled={!canSave}
        title={canSave ? undefined : 'Add at least one panel before saving.'}
        onClick={() => setSaveLayoutOpen(true)}
      >
        <SaveIcon size={14} />Save Layout
      </button>
      <button className="ghost" onClick={() => setLoadLayoutOpen(true)}><FolderOpenIcon size={14} />Load Layout</button>
      <div className="spacer" />
      <button onClick={() => setConfirmReset(true)}><RotateCcwIcon size={14} />Reset</button>
      <button className={preview ? 'primary' : ''} onClick={() => setPreview(!preview)}>
        {preview ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
        {preview ? 'Exit Preview' : 'Preview'}
      </button>
      <button className="primary" onClick={() => setExportOpen(true)}><DownloadIcon size={14} />Export</button>
    </div>
  )
}
