import { useEffect } from 'react'
import { useStore } from '../store/useStore'
import { TopBar } from './TopBar'
import { LeftSidebar } from './LeftSidebar'
import { RightSidebar } from './RightSidebar'
import { BottomBar } from './BottomBar'
import { WallCanvas } from './WallCanvas'
import { PreviewMode } from './PreviewMode'
import { ExportModal } from './ExportModal'
import { ConfirmDialog } from './ConfirmDialog'
import { SaveLayoutModal } from './SaveLayoutModal'
import { LoadLayoutModal } from './LoadLayoutModal'
import { Toast } from './Toast'

export function Editor() {
  const preview = useStore((s) => s.preview)
  const exportOpen = useStore((s) => s.exportOpen)
  const confirmReset = useStore((s) => s.confirmReset)
  const homeOpen = useStore((s) => s.homeOpen)
  const saveLayoutOpen = useStore((s) => s.saveLayoutOpen)
  const loadLayoutOpen = useStore((s) => s.loadLayoutOpen)
  const resetProject = useStore((s) => s.resetProject)
  const setConfirmReset = useStore((s) => s.setConfirmReset)
  const setHomeOpen = useStore((s) => s.setHomeOpen)
  const clearImage = useStore((s) => s.clearImage)
  const requestZoomToFit = useStore((s) => s.requestZoomToFit)
  const requestZoomToImage = useStore((s) => s.requestZoomToImage)
  const selectedIds = useStore((s) => s.selectedIds)
  const imageSelected = useStore((s) => s.imageSelected)
  const nudgeSelectedPanels = useStore((s) => s.nudgeSelectedPanels)
  const deleteSelectedPanels = useStore((s) => s.deleteSelectedPanels)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || preview || imageSelected || selectedIds.length === 0) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, button, [contenteditable="true"]')) return
      const del = event.key === 'Delete' || event.key === 'Backspace'
      if (del) {
        event.preventDefault()
        deleteSelectedPanels()
        return
      }
      const deltas: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      }
      const delta = deltas[event.key]
      if (!delta) return
      event.preventDefault()
      nudgeSelectedPanels(delta[0], delta[1], event.shiftKey)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [deleteSelectedPanels, imageSelected, nudgeSelectedPanels, preview, selectedIds.length])

  return (
    <>
      <div className="editor">
        <TopBar />
        <LeftSidebar />
        <WallCanvas />
        <RightSidebar />
        <BottomBar onZoomToFit={requestZoomToFit} onZoomToImage={requestZoomToImage} />
      </div>

      {preview && <PreviewMode />}
      {exportOpen && <ExportModal />}
      {saveLayoutOpen && <SaveLayoutModal />}
      {loadLayoutOpen && <LoadLayoutModal />}
      <Toast />
      <ConfirmDialog
        open={confirmReset}
        title="Reset project?"
        body="This will remove all panels and settings. Your uploaded image will be kept."
        confirmLabel="Reset"
        destructive
        onConfirm={() => { resetProject(); setConfirmReset(false); requestZoomToFit() }}
        onCancel={() => setConfirmReset(false)}
      />
      <ConfirmDialog
        open={homeOpen}
        title="Return home?"
        body="This will remove the current image and all panels, returning you to the upload screen."
        confirmLabel="Go home"
        destructive
        onConfirm={() => { setHomeOpen(false); clearImage() }}
        onCancel={() => setHomeOpen(false)}
      />
    </>
  )
}
