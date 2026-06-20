import { useState } from 'react'
import { useStore } from '../store/useStore'
import { saveLayout, getLayoutByName, makeLayoutId, MAX_LAYOUTS, getAllLayouts } from '../lib/layouts'

export function SaveLayoutModal() {
  const setSaveLayoutOpen = useStore((s) => s.setSaveLayoutOpen)
  const showToast = useStore((s) => s.showToast)
  const unit = useStore((s) => s.unit)
  const wall = useStore((s) => s.wall)
  const panels = useStore((s) => s.panels)
  const frame = useStore((s) => s.frame)
  const perPanelFrame = useStore((s) => s.perPanelFrame)
  const gap = useStore((s) => s.gap)
  const currentSizeKey = useStore((s) => s.currentSizeKey)
  const presetActive = useStore((s) => s.presetActive)

  const defaultName = `Layout — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  const [name, setName] = useState(defaultName)
  const [error, setError] = useState<string | null>(null)
  const [confirmOverwrite, setConfirmOverwrite] = useState(false)

  const handleSave = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Name is required.')
      return
    }

    if (getAllLayouts().length >= MAX_LAYOUTS && !getLayoutByName(trimmed)) {
      setError('Maximum layouts reached. Delete an existing layout to save a new one.')
      return
    }

    if (confirmOverwrite || !getLayoutByName(trimmed)) {
      const layout = {
        id: getLayoutByName(trimmed)?.id ?? makeLayoutId(),
        name: trimmed,
        savedAt: Date.now(),
        unit,
        wall: { ...wall },
        panels: panels.map((p) => ({ ...p })),
        frame: { ...frame },
        perPanelFrame: { ...perPanelFrame },
        gap,
        currentSizeKey,
        presetActive,
      }
      const result = saveLayout(layout)
      if (result.ok) {
        setSaveLayoutOpen(false)
        showToast('Layout saved.')
      } else {
        setError(result.error)
      }
    } else {
      setConfirmOverwrite(true)
    }
  }

  const handleOverwrite = () => {
    const trimmed = name.trim()
    const existing = getLayoutByName(trimmed)
    const layout = {
      id: existing?.id ?? makeLayoutId(),
      name: trimmed,
      savedAt: Date.now(),
      unit,
      wall: { ...wall },
      panels: panels.map((p) => ({ ...p })),
      frame: { ...frame },
      perPanelFrame: { ...perPanelFrame },
      gap,
      currentSizeKey,
      presetActive,
    }
    const result = saveLayout(layout)
    if (result.ok) {
      setSaveLayoutOpen(false)
      showToast('Layout saved.')
    } else {
      setError(result.error)
    }
  }

  return (
    <div className="modal-overlay" onClick={() => setSaveLayoutOpen(false)}>
      <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h2>Save Layout</h2>
          <div className="spacer" />
          <button className="close-x" onClick={() => setSaveLayoutOpen(false)}>✕</button>
        </div>

        {confirmOverwrite ? (
          <>
            <div className="hint" style={{ fontSize: 13 }}>
              A layout named <strong>{name.trim()}</strong> already exists. Overwrite?
            </div>
            <div className="modal-actions">
              <button onClick={() => setConfirmOverwrite(false)}>Cancel</button>
              <button className="primary" onClick={handleOverwrite}>Overwrite</button>
            </div>
          </>
        ) : (
          <>
            <label className="field">
              <span>Name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setError(null) }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
                autoFocus
              />
            </label>

            {error && <div className="upload-warn">{error}</div>}

            <div className="modal-actions">
              <button onClick={() => setSaveLayoutOpen(false)}>Cancel</button>
              <button className="primary" onClick={handleSave}>Save</button>
            </div>
          </>
        )}

        <div className="hint" style={{ fontSize: 11, marginTop: 4 }}>
          Layouts are stored in this browser. Clearing browser data will remove them.
        </div>
      </div>
    </div>
  )
}
