import { useRef } from 'react'
import { Columns2Icon, ImageIcon, SaveIcon, FolderOpenIcon, RotateCcwIcon, EyeIcon, EyeOffIcon, DownloadIcon, HomeIcon } from 'lucide-react'
import { useStore } from '../store/useStore'

const ACCEPT = 'image/jpeg,image/png,image/webp'

export function TopBar({ onOpenVariants }: { onOpenVariants: () => void }) {
  const setConfirmReset = useStore((s) => s.setConfirmReset)
  const setPreview = useStore((s) => s.setPreview)
  const setExportOpen = useStore((s) => s.setExportOpen)
  const setHomeOpen = useStore((s) => s.setHomeOpen)
  const setSaveLayoutOpen = useStore((s) => s.setSaveLayoutOpen)
  const setLoadLayoutOpen = useStore((s) => s.setLoadLayoutOpen)
  const loadImageFromFile = useStore((s) => s.loadImageFromFile)
  const preview = useStore((s) => s.preview)
  const panels = useStore((s) => s.panels)

  const inputRef = useRef<HTMLInputElement>(null)

  const canSave = panels.length > 0

  return (
    <div className="topbar">
      <img className="brand-mark" src="/brand-mark.svg" alt="" aria-hidden />
      <span className="title">Slice My Photo</span>
      <button className="ghost" onClick={() => setHomeOpen(true)}><HomeIcon size={14} />Home</button>
      <button className="ghost" onClick={() => inputRef.current?.click()}><ImageIcon size={14} />Change Image</button>
      <input ref={inputRef} type="file" accept={ACCEPT} hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) loadImageFromFile(f); e.target.value = '' }} />
      <button
        className="ghost"
        disabled={!canSave}
        title={canSave ? undefined : 'Add at least one panel before saving.'}
        onClick={() => setSaveLayoutOpen(true)}
      >
        <SaveIcon size={14} />Save Layout
      </button>
      <button className="ghost" onClick={() => setLoadLayoutOpen(true)}><FolderOpenIcon size={14} />Load Layout</button>
      <button className="ghost" onClick={onOpenVariants}><Columns2Icon size={14} />Compare</button>
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
