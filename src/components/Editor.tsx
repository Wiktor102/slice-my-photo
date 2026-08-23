import { useState } from 'react'
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
import { VariantModal } from './VariantModal'

export function Editor() {
  const [variantsOpen, setVariantsOpen] = useState(false)
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

  return (
    <>
      <div className="editor">
        <TopBar onOpenVariants={() => setVariantsOpen(true)} />
        <LeftSidebar />
        <WallCanvas />
        <RightSidebar />
        <BottomBar onZoomToFit={requestZoomToFit} onZoomToImage={requestZoomToImage} />
      </div>

      {preview && <PreviewMode />}
      {exportOpen && <ExportModal />}
      {saveLayoutOpen && <SaveLayoutModal />}
      {loadLayoutOpen && <LoadLayoutModal />}
      {variantsOpen && <VariantModal onClose={() => setVariantsOpen(false)} />}
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
