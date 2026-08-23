import { useEffect, useMemo, useState } from 'react'
import { CheckIcon, Columns2Icon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import type { DesignVariant, VariantSnapshot } from '../types'
import { deleteVariant, getAllVariants, getVariantByName, makeVariantId, MAX_VARIANTS, renameVariant, saveVariant, sourceImageSignature } from '../lib/variants'
import { useStore } from '../store/useStore'
import { CompareOverlay } from './CompareOverlay'
import { ConfirmDialog } from './ConfirmDialog'

interface Props {
  onClose: () => void
}

function cloneSnapshotFromState(snapshot: VariantSnapshot): VariantSnapshot {
  return {
    unit: snapshot.unit,
    wall: { ...snapshot.wall },
    panels: snapshot.panels.map((panel) => ({
      ...panel,
      ...(panel.passepartout ? { passepartout: { ...panel.passepartout } } : {}),
    })),
    frame: { ...snapshot.frame },
    perPanelFrame: Object.fromEntries(
      Object.entries(snapshot.perPanelFrame).map(([id, panelFrame]) => [id, {
        ...panelFrame,
        passepartout: { ...panelFrame.passepartout },
      }]),
    ),
    image: { ...snapshot.image },
    gap: snapshot.gap,
    currentSizeKey: snapshot.currentSizeKey,
    presetActive: snapshot.presetActive,
  }
}

export function VariantModal({ onClose }: Props) {
  const showToast = useStore((state) => state.showToast)
  const loadVariant = useStore((state) => state.loadVariant)
  const sourceImage = useStore((state) => state.sourceImage)
  const panels = useStore((state) => state.panels)
  const unit = useStore((state) => state.unit)
  const wall = useStore((state) => state.wall)
  const frame = useStore((state) => state.frame)
  const perPanelFrame = useStore((state) => state.perPanelFrame)
  const image = useStore((state) => state.image)
  const gap = useStore((state) => state.gap)
  const currentSizeKey = useStore((state) => state.currentSizeKey)
  const presetActive = useStore((state) => state.presetActive)

  const currentSnapshot = useMemo(() => ({
    unit,
    wall,
    panels,
    frame,
    perPanelFrame,
    image,
    gap,
    currentSizeKey,
    presetActive,
  }), [unit, wall, panels, frame, perPanelFrame, image, gap, currentSizeKey, presetActive])

  const activeSourceSignature = useMemo(
    () => (sourceImage ? sourceImageSignature(sourceImage) : ''),
    [sourceImage],
  )
  const [, setVariantsRevision] = useState(0)
  const variants = getAllVariants(activeSourceSignature)
  const [name, setName] = useState(`Variant ${Math.min(variants.length + 1, MAX_VARIANTS)}`)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [pendingApply, setPendingApply] = useState<DesignVariant | null>(null)
  const [overwriteTarget, setOverwriteTarget] = useState<DesignVariant | null>(null)
  const [compareOpen, setCompareOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedVariants = useMemo(
    () => selectedIds.map((id) => variants.find((variant) => variant.id === id)).filter((variant): variant is DesignVariant => Boolean(variant)),
    [selectedIds, variants],
  )

  const refresh = () => setVariantsRevision((revision) => revision + 1)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (compareOpen) {
        setCompareOpen(false)
      } else if (pendingApply) {
        setPendingApply(null)
      } else if (overwriteTarget) {
        setOverwriteTarget(null)
      } else if (editingId) {
        setEditingId(null)
      } else {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [compareOpen, editingId, onClose, overwriteTarget, pendingApply])

  const saveCurrent = (variantId: string, variantName: string) => {
    const variant: DesignVariant = {
      ...cloneSnapshotFromState(currentSnapshot),
      id: variantId,
      name: variantName,
      savedAt: Date.now(),
      sourceSignature: activeSourceSignature,
    }
    const result = saveVariant(variant)
    if (!result.ok) {
      setError(result.error)
      return
    }
    refresh()
    setError(null)
    setOverwriteTarget(null)
    setName(`Variant ${Math.min(getAllVariants(activeSourceSignature).length + 1, MAX_VARIANTS)}`)
    showToast(`Saved “${variantName}”.`)
  }

  const handleSave = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Give this variant a name.')
      return
    }
    const existing = getVariantByName(trimmed, activeSourceSignature)
    if (existing) {
      setOverwriteTarget(existing)
      return
    }
    saveCurrent(makeVariantId(), trimmed)
  }

  const handleRenameCommit = (id: string) => {
    const trimmed = editText.trim()
    if (trimmed) {
      const duplicate = variants.some((variant) => variant.id !== id && variant.name === trimmed)
      if (duplicate) {
        setError('That name is already in use.')
      } else {
        renameVariant(id, trimmed)
        refresh()
        setError(null)
      }
    }
    setEditingId(null)
  }

  const handleDelete = (id: string) => {
    deleteVariant(id)
    setDeleteConfirmId(null)
    setSelectedIds((ids) => ids.filter((selectedId) => selectedId !== id))
    refresh()
  }

  const handleApply = (variant: DesignVariant) => {
    if (panels.length > 0) setPendingApply(variant)
    else {
      loadVariant(variant)
      showToast(`Applied “${variant.name}”.`)
      onClose()
    }
  }

  const confirmApply = () => {
    if (!pendingApply) return
    loadVariant(pendingApply)
    showToast(`Applied “${pendingApply.name}”.`)
    setPendingApply(null)
    onClose()
  }

  if (compareOpen && selectedVariants.length >= 2) {
    return (
      <>
        <CompareOverlay variants={selectedVariants} onBack={() => setCompareOpen(false)} />
      </>
    )
  }

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal variant-modal" onClick={(event) => event.stopPropagation()}>
          <div className="row">
            <div>
              <h2>Compare variants</h2>
              <div className="hint" style={{ marginTop: 3 }}>Save up to 3 visual directions without copying your source image.</div>
            </div>
            <div className="spacer" />
            <button className="close-x" aria-label="Close variants" onClick={onClose}>✕</button>
          </div>

          <div className="variant-save-strip">
            <label className="field variant-name-field">
              <span>Save current design as</span>
              <input
                className="variant-name-input"
                type="text"
                value={name}
                onChange={(event) => { setName(event.target.value); setError(null) }}
                onKeyDown={(event) => { if (event.key === 'Enter') handleSave() }}
                aria-label="Variant name"
              />
            </label>
            <button className="primary" onClick={handleSave} disabled={variants.length >= MAX_VARIANTS && !getVariantByName(name.trim(), activeSourceSignature)}>
              <PlusIcon size={14} />Save variant
            </button>
          </div>

          {error && <div className="upload-warn">{error}</div>}

          {variants.length === 0 ? (
            <div className="variant-empty">
              <Columns2Icon size={28} strokeWidth={1.5} />
              <strong>No saved variants yet</strong>
              <span>Save the current arrangement, adjust it, then save another to compare the difference.</span>
            </div>
          ) : (
            <div className="variant-list">
              {variants.map((variant, index) => {
                const isSelected = selectedIds.includes(variant.id)
                return (
                  <div className={`variant-row ${isSelected ? 'selected' : ''}`} key={variant.id}>
                    <label className="variant-check" title={`Select ${variant.name} for comparison`}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(event) => {
                          setError(null)
                          if (event.target.checked) {
                            if (selectedIds.length >= 3) {
                              setError('Compare up to 3 variants at a time.')
                              return
                            }
                            setSelectedIds((ids) => [...ids, variant.id])
                          } else {
                            setSelectedIds((ids) => ids.filter((id) => id !== variant.id))
                          }
                        }}
                      />
                      <span className="variant-checkmark"><CheckIcon size={12} /></span>
                    </label>
                    <span className="variant-index">0{index + 1}</span>
                    <div className="variant-row-main">
                      {editingId === variant.id ? (
                        <input
                          className="variant-rename-input"
                          autoFocus
                          value={editText}
                          onChange={(event) => setEditText(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') handleRenameCommit(variant.id)
                            if (event.key === 'Escape') setEditingId(null)
                          }}
                          onBlur={() => handleRenameCommit(variant.id)}
                        />
                      ) : (
                        <span className="variant-row-name">{variant.name}</span>
                      )}
                      <span className="variant-row-meta">{variant.panels.length} panels · {variant.wall.width} × {variant.wall.height} {variant.unit}</span>
                    </div>
                    <div className="variant-row-actions">
                      <button className="ghost variant-action" title="Rename variant" aria-label={`Rename ${variant.name}`} onClick={() => { setEditingId(variant.id); setEditText(variant.name) }}>
                        <PencilIcon size={13} />
                      </button>
                      <button className="ghost variant-action" onClick={() => handleApply(variant)}>Apply</button>
                      {deleteConfirmId === variant.id ? (
                        <>
                          <button className="danger variant-action" onClick={() => handleDelete(variant.id)}>Delete</button>
                          <button className="ghost variant-action" onClick={() => setDeleteConfirmId(null)}>Cancel</button>
                        </>
                      ) : (
                        <button className="ghost variant-action danger-text" title="Delete variant" aria-label={`Delete ${variant.name}`} onClick={() => setDeleteConfirmId(variant.id)}>
                          <Trash2Icon size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="variant-footer">
            <span className="hint">{selectedVariants.length} selected · choose 2 or 3 to compare</span>
            <div className="modal-actions">
              <button onClick={onClose}>Close</button>
              <button className="primary" disabled={selectedVariants.length < 2 || !sourceImage} onClick={() => setCompareOpen(true)}>
                <Columns2Icon size={14} />Compare selected
              </button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(pendingApply)}
        title="Apply variant?"
        body={<>“{pendingApply?.name}” will replace the current arrangement and image positioning.</>}
        confirmLabel="Apply variant"
        onConfirm={confirmApply}
        onCancel={() => setPendingApply(null)}
      />
      <ConfirmDialog
        open={Boolean(overwriteTarget)}
        title="Overwrite variant?"
        body={<>A variant named “{overwriteTarget?.name}” already exists. Replace it with the current design?</>}
        confirmLabel="Overwrite"
        onConfirm={() => overwriteTarget && saveCurrent(overwriteTarget.id, overwriteTarget.name)}
        onCancel={() => setOverwriteTarget(null)}
      />
    </>
  )
}
