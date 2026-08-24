import { useState, useRef, useEffect } from 'react'
import { PencilIcon } from 'lucide-react'
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
  const [renameError, setRenameError] = useState<{ id: string; message: string } | null>(null)
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
    const result = renameLayout(id, trimmed)
    if (!result.ok) {
      setRenameError({ id, message: result.error })
      return
    }

    refresh()
    setEditingId(null)
    setRenameError(null)
  }

  const handleRenameStart = (layout: SavedLayout) => {
    setEditingId(layout.id)
    setEditText(layout.name)
    setRenameError(null)
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
                        >
                          {editingId === layout.id ? (
                            <>
                              <input
                                ref={editRef}
                                type="text"
                                value={editText}
                                onChange={(e) => {
                                  setEditText(e.target.value)
                                  setRenameError(null)
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleRenameCommit(layout.id)
                                  if (e.key === 'Escape') {
                                    setEditingId(null)
                                    setRenameError(null)
                                  }
                                }}
                                onBlur={() => handleRenameCommit(layout.id)}
                                onClick={(e) => e.stopPropagation()}
                                aria-invalid={renameError?.id === layout.id}
                                style={{ fontSize: 13, padding: '2px 6px' }}
                              />
                              {renameError?.id === layout.id && (
                                <span className="layout-rename-error">{renameError.message}</span>
                              )}
                            </>
                          ) : (
                            <span className="layout-name">{layout.name}</span>
                          )}
                          <span className="layout-date">Saved {formatDate(layout.savedAt)}</span>
                        </div>
                        {editingId !== layout.id && (
                          <button
                            className="layout-rename"
                            title="Rename layout"
                            aria-label={`Rename layout "${layout.name}"`}
                            onClick={(e) => { e.stopPropagation(); handleRenameStart(layout) }}
                          >
                            <PencilIcon size={14} aria-hidden="true" />
                          </button>
                        )}
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
