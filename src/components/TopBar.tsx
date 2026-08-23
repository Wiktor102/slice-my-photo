import { useRef, useState } from 'react'
import { saveAs } from 'file-saver'
import { ImageIcon, SaveIcon, FolderOpenIcon, RotateCcwIcon, EyeIcon, EyeOffIcon, DownloadIcon, HomeIcon, FileDownIcon } from 'lucide-react'
import { useStore } from '../store/useStore'
import { projectFileName, serializePortableProject } from '../lib/portableProject'
import { ProjectImportButton } from './ProjectImportButton'
import { ConfirmDialog } from './ConfirmDialog'

const ACCEPT = 'image/jpeg,image/png,image/webp'

export function TopBar() {
  const setConfirmReset = useStore((s) => s.setConfirmReset)
  const setPreview = useStore((s) => s.setPreview)
  const setExportOpen = useStore((s) => s.setExportOpen)
  const setHomeOpen = useStore((s) => s.setHomeOpen)
  const setSaveLayoutOpen = useStore((s) => s.setSaveLayoutOpen)
  const setLoadLayoutOpen = useStore((s) => s.setLoadLayoutOpen)
  const loadImageFromFile = useStore((s) => s.loadImageFromFile)
  const showToast = useStore((s) => s.showToast)
  const preview = useStore((s) => s.preview)
  const panels = useStore((s) => s.panels)
  const sourceImage = useStore((s) => s.sourceImage)

  const inputRef = useRef<HTMLInputElement>(null)
  const [exportBusy, setExportBusy] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const canSave = panels.length > 0

  const handleExportProject = async () => {
    if (!sourceImage) return
    setExportBusy(true)
    setExportError(null)
    try {
      const state = useStore.getState()
      const blob = await serializePortableProject({
        state: {
          unit: state.unit,
          wall: { ...state.wall },
          panels: state.panels.map((panel) => ({ ...panel, passepartout: panel.passepartout ? { ...panel.passepartout } : undefined })),
          frame: { ...state.frame },
          perPanelFrame: Object.fromEntries(Object.entries(state.perPanelFrame).map(([id, frame]) => [id, { ...frame, passepartout: { ...frame.passepartout } }])),
          gap: state.gap,
          currentSizeKey: state.currentSizeKey,
          presetActive: state.presetActive,
          image: { ...state.image },
        },
        sourceImage: { ...sourceImage },
      })
      saveAs(blob, projectFileName(sourceImage.name))
      showToast('Project exported.')
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Could not export the project.')
    } finally {
      setExportBusy(false)
    }
  }

  return (
    <>
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
        <button className="ghost" disabled={exportBusy || !sourceImage} onClick={() => void handleExportProject()} title="Download the full project and source image">
          <FileDownIcon size={14} />Export Project
        </button>
        <ProjectImportButton className="ghost" />
        <div className="spacer" />
        <button onClick={() => setConfirmReset(true)}><RotateCcwIcon size={14} />Reset</button>
        <button className={preview ? 'primary' : ''} onClick={() => setPreview(!preview)}>
          {preview ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
          {preview ? 'Exit Preview' : 'Preview'}
        </button>
        <button className="primary" onClick={() => setExportOpen(true)}><DownloadIcon size={14} />Export</button>
      </div>

      {exportError && (
        <ConfirmDialog
          open
          title="Project export failed"
          body={exportError}
          confirmLabel="Close"
          onConfirm={() => setExportError(null)}
          onCancel={() => setExportError(null)}
        />
      )}
    </>
  )
}
