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
      <div className="brand-mark small" aria-hidden>
        <span /><span /><span />
      </div>
      <span className="title">Slice My Photo</span>
      <button className="ghost" onClick={() => setChangeImageOpen(true)}>Change Image</button>
      <button
        className="ghost"
        disabled={!canSave}
        title={canSave ? undefined : 'Add at least one panel before saving.'}
        onClick={() => setSaveLayoutOpen(true)}
      >
        Save Layout
      </button>
      <button className="ghost" onClick={() => setLoadLayoutOpen(true)}>Load Layout</button>
      <div className="spacer" />
      <button onClick={() => setConfirmReset(true)}>Reset</button>
      <button className={preview ? 'primary' : ''} onClick={() => setPreview(!preview)}>
        {preview ? 'Exit Preview' : 'Preview'}
      </button>
      <button className="primary" onClick={() => setExportOpen(true)}>Export</button>
    </div>
  )
}
