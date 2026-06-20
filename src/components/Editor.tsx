import { useStore } from '../store/useStore'
import { TopBar } from './TopBar'
import { LeftSidebar } from './LeftSidebar'
import { RightSidebar } from './RightSidebar'
import { BottomBar } from './BottomBar'
import { WallCanvas } from './WallCanvas'
import { PreviewMode } from './PreviewMode'
import { ExportModal } from './ExportModal'
import { ConfirmDialog } from './ConfirmDialog'

export function Editor() {
  const preview = useStore((s) => s.preview)
  const exportOpen = useStore((s) => s.exportOpen)
  const confirmReset = useStore((s) => s.confirmReset)
  const changeImageOpen = useStore((s) => s.changeImageOpen)
  const resetProject = useStore((s) => s.resetProject)
  const setConfirmReset = useStore((s) => s.setConfirmReset)
  const setChangeImageOpen = useStore((s) => s.setChangeImageOpen)
  const clearImage = useStore((s) => s.clearImage)
  const requestZoomToFit = useStore((s) => s.requestZoomToFit)

  return (
    <>
      <div className="editor">
        <TopBar />
        <LeftSidebar />
        <WallCanvas />
        <RightSidebar />
        <BottomBar onZoomToFit={requestZoomToFit} />
      </div>

      {preview && <PreviewMode />}
      {exportOpen && <ExportModal />}
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
        open={changeImageOpen}
        title="Change image?"
        body="This will remove the current image and all panels, returning you to the upload screen."
        confirmLabel="Change image"
        destructive
        onConfirm={() => { setChangeImageOpen(false); clearImage() }}
        onCancel={() => setChangeImageOpen(false)}
      />
    </>
  )
}
