import { useRef, useState, type ReactNode } from 'react'
import { FileUpIcon } from 'lucide-react'
import { useStore } from '../store/useStore'
import { idbSetImageStrict } from '../lib/idb'
import { parsePortableProject } from '../lib/portableProject'
import type { PortableProject } from '../lib/portableProject'
import { ConfirmDialog } from './ConfirmDialog'

const PROJECT_ACCEPT = '.smp,application/zip,application/x-zip-compressed'

interface Props {
  className?: string
  title?: string
  disabled?: boolean
  children?: ReactNode
  icon?: ReactNode
}

/**
 * Shared project importer for the editor and the empty upload screen. Parsing
 * and image decoding always happen before this component can replace state;
 * an active project gets a second, explicit replacement confirmation.
 */
export function ProjectImportButton({ className = 'ghost', title = 'Open a .smp project file', disabled = false, children = 'Import Project', icon = <FileUpIcon size={14} /> }: Props) {
  const restorePortableProject = useStore((s) => s.restorePortableProject)
  const showToast = useStore((s) => s.showToast)
  const inputRef = useRef<HTMLInputElement>(null)
  const [pendingImport, setPendingImport] = useState<PortableProject | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const restoreImportedProject = async (project: PortableProject) => {
    await idbSetImageStrict(project.sourceImage)
    restorePortableProject(project)
    showToast('Project imported.')
  }

  const handleFile = async (file: File) => {
    setBusy(true)
    setError(null)
    setPendingImport(null)
    try {
      const project = await parsePortableProject(file)
      const activeProjectNow = Boolean(useStore.getState().sourceImage || useStore.getState().panels.length > 0)
      if (activeProjectNow) {
        setPendingImport(project)
      } else {
        await restoreImportedProject(project)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not import the project.')
    } finally {
      setBusy(false)
    }
  }

  const confirmImport = async () => {
    if (!pendingImport || busy) return
    setBusy(true)
    setError(null)
    try {
      await restoreImportedProject(pendingImport)
      setPendingImport(null)
    } catch (e) {
      setError(e instanceof Error ? `Could not save the imported image: ${e.message}` : 'Could not save the imported image.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={disabled || busy}
        aria-busy={busy}
        title={title}
        onClick={() => inputRef.current?.click()}
      >
        {icon}{busy ? 'Importing…' : children}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={PROJECT_ACCEPT}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleFile(file)
          e.target.value = ''
        }}
      />

      {pendingImport && !error && (
        <ConfirmDialog
          open
          title="Replace current project?"
          body={<>Importing <strong>{pendingImport.sourceImage.name}</strong> will replace the current image and arrangement ({pendingImport.state.panels.length} panel{pendingImport.state.panels.length === 1 ? '' : 's'}). Continue?</>}
          confirmLabel={busy ? 'Importing…' : 'Import project'}
          cancelLabel="Cancel"
          onConfirm={() => void confirmImport()}
          onCancel={() => setPendingImport(null)}
        />
      )}
      {error && (
        <ConfirmDialog
          open
          title="Project import failed"
          body={error}
          confirmLabel="Close"
          onConfirm={() => setError(null)}
          onCancel={() => setError(null)}
        />
      )}
    </>
  )
}
