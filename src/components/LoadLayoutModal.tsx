import { useState, useRef, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { getAllLayouts, deleteLayout, renameLayout } from '../lib/layouts'
import type { SavedLayout } from '../types'

export function LoadLayoutModal() {
  const setLoadLayoutOpen = useStore((s) => s.setLoadLayoutOpen)
  const loadLayout = useStore((s) => s.loadLayout)
  const panels = useStore((s) => s.panels)

  const [layouts, setLayouts] = useState<SavedLayout[]>(getAllLayouts)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [confirmLoad, setConfirmLoad] = useState<SavedLayout | null>(null)
  const editRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingId && editRef.current) {
      editRef.current.focus()
      editRef.current.select()
    }
  }, [editingId])

  const refresh = () => setLayouts(getAllLayouts())

  const handleDelete = (id: string) => {
    deleteLayout(id)
    setDeleteConfirmId(null)
    refresh()
  }

  const handleRenameCommit = (id: string) => {
    const trimmed = editText.trim()
    if (trimmed) {
      renameLayout(id, trimmed)
      refresh()
    }
    setEditingId(null)
  }

  const handleRowClick = (layout: SavedLayout) => {
    if (panels.length > 0) {
      setConfirmLoad(layout)
    } else {
      loadLayout(layout)
    }
  }

  const handleConfirmLoad = () => {
    if (confirmLoad) {
      loadLayout(confirmLoad)
      setConfirmLoad(null)
    }
  }

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div className="modal-overlay" onClick={() => setLoadLayoutOpen(false)}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h2>Load Layout</h2>
          <div className="spacer" />
          <button className="close-x" onClick={() => setLoadLayoutOpen(false)}>✕</button>
        </div>

        {confirmLoad ? (
          <>
            <div className="hint" style={{ fontSize: 13 }}>
              Loading a layout will replace the current arrangement. Continue?
            </div>
            <div className="modal-actions">
              <button onClick={() => setConfirmLoad(null)}>Cancel</button>
              <button className="primary" onClick={handleConfirmLoad}>Load</button>
            </div>
          </>
        ) : (
          <>
            {layouts.length === 0 ? (
              <div className="empty-hint">No saved layouts yet.</div>
            ) : (
              <div className="layout-list">
                {layouts.map((layout) => (
                  <div key={layout.id} className="layout-row">
                    {deleteConfirmId === layout.id ? (
                      <div className="layout-row-inner">
                        <span className="hint" style={{ fontSize: 12 }}>Delete this layout?</span>
                        <div className="row" style={{ gap: 6 }}>
                          <button className="danger" style={{ padding: '3px 8px', fontSize: 12 }} onClick={() => handleDelete(layout.id)}>Yes</button>
                          <button style={{ padding: '3px 8px', fontSize: 12 }} onClick={() => setDeleteConfirmId(null)}>No</button>
                        </div>
                      </div>
                    ) : (
                      <div className="layout-row-inner">
                        <div
                          className="layout-row-main"
                          onClick={() => handleRowClick(layout)}
                          onDoubleClick={(e) => {
                            e.stopPropagation()
                            setEditingId(layout.id)
                            setEditText(layout.name)
                          }}
                        >
                          {editingId === layout.id ? (
                            <input
                              ref={editRef}
                              type="text"
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRenameCommit(layout.id)
                                if (e.key === 'Escape') setEditingId(null)
                              }}
                              onBlur={() => handleRenameCommit(layout.id)}
                              onClick={(e) => e.stopPropagation()}
                              style={{ fontSize: 13, padding: '2px 6px' }}
                            />
                          ) : (
                            <span className="layout-name">{layout.name}</span>
                          )}
                          <span className="layout-date">Saved {formatDate(layout.savedAt)}</span>
                        </div>
                        <button
                          className="layout-del"
                          title="Delete layout"
                          onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(layout.id) }}
                        >
                          &#x1f5d1;
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="modal-actions">
              <button onClick={() => setLoadLayoutOpen(false)}>Cancel</button>
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
