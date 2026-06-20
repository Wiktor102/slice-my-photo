import { useCallback, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import { megapixels } from '../lib/imageUtils'
import type { Unit } from '../types'

const ACCEPT = 'image/jpeg,image/png,image/webp'

export function UploadScreen() {
  const unit = useStore((s) => s.unit)
  const setUnit = useStore((s) => s.setUnit)
  const loadImageFromFile = useStore((s) => s.loadImageFromFile)
  const imageLoading = useStore((s) => s.imageLoading)
  const imageWarning = useStore((s) => s.imageWarning)
  const sourceImage = useStore((s) => s.sourceImage)

  const [dragging, setDragging] = useState(false)
  const [fileWarning, setFileWarning] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(
    (file: File) => {
      setFileWarning(null)
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
        setFileWarning('Please use a JPEG, PNG, or WebP image.')
        return
      }
      if (file.size > 30 * 1024 * 1024) {
        setFileWarning('This file is larger than 30 MB. It may take a moment to process.')
      }
      loadImageFromFile(file)
    },
    [loadImageFromFile],
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files?.[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  const lowRes =
    sourceImage && megapixels(sourceImage.nativeWidth, sourceImage.nativeHeight) < 1
      ? `Image is ${sourceImage.nativeWidth}×${sourceImage.nativeHeight}px — prints may look soft at large sizes.`
      : null

  return (
    <div className="upload-screen" onDragOver={(e) => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
      <div className="upload-card">
        <div className="brand">
          <div className="brand-mark" aria-hidden>
            <span />
            <span />
            <span />
          </div>
          <h1>Slice My Photo</h1>
          <p className="brand-sub">Split one photo across a wall of framed panels.</p>
        </div>

        <div
          className={`dropzone ${dragging ? 'drag' : ''} ${sourceImage ? 'loaded' : ''}`}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') inputRef.current?.click() }}
        >
          {imageLoading ? (
            <div className="dz-loading">
              <div className="spinner" />
              <span>Processing image…</span>
            </div>
          ) : sourceImage ? (
            <div className="dz-preview">
              <img src={sourceImage.proxyUrl} alt="Uploaded preview" />
              <div className="dz-info">
                <strong>{sourceImage.name}</strong>
                <span>{sourceImage.nativeWidth} × {sourceImage.nativeHeight}px</span>
              </div>
            </div>
          ) : (
            <div className="dz-empty">
              <div className="dz-icon" aria-hidden>⬆</div>
              <strong>Drag &amp; drop your image</strong>
              <span>or</span>
              <button type="button" className="primary" onClick={(e) => { e.stopPropagation(); inputRef.current?.click() }}>Browse files</button>
              <span className="hint">JPEG, PNG, or WebP</span>
            </div>
          )}
        </div>
        <input ref={inputRef} type="file" accept={ACCEPT} hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />

        {(fileWarning || imageWarning || lowRes) && (
          <div className={`upload-warn ${lowRes ? 'soft' : ''}`}>⚠ {fileWarning || imageWarning || lowRes}</div>
        )}

        <div className="upload-units">
          <span className="hint">Units:</span>
          <label className={unit === 'cm' ? 'radio-on' : ''}>
            <input type="radio" name="unit" checked={unit === 'cm'} onChange={() => setUnit('cm' as Unit)} />
            Centimeters
          </label>
          <label className={unit === 'in' ? 'radio-on' : ''}>
            <input type="radio" name="unit" checked={unit === 'in'} onChange={() => setUnit('in' as Unit)} />
            Inches
          </label>
        </div>

        <button
          type="button"
          className="primary big"
          disabled={!sourceImage || imageLoading}
          onClick={() => useStore.getState().setScreen('editor')}
        >
          Continue to Editor →
        </button>
      </div>
    </div>
  )
}
