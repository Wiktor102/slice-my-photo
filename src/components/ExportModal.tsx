import { useStore } from '../store/useStore'

export function ExportModal() {
  const setExportOpen = useStore((s) => s.setExportOpen)
  return (
    <div className="modal-overlay" onClick={() => setExportOpen(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Export</h2>
        <div className="hint">Export coming soon.</div>
        <button onClick={() => setExportOpen(false)}>Close</button>
      </div>
    </div>
  )
}
