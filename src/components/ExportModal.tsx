import { useState } from 'react'
import { useStore } from '../store/useStore'
import { computePlan, runExport } from '../lib/export'
import type { ExportOptions } from '../lib/export'

export function ExportModal() {
  const setExportOpen = useStore((s) => s.setExportOpen)
  const panels = useStore((s) => s.panels)

  const [format, setFormat] = useState<'jpeg' | 'png'>('jpeg')
  const [quality, setQuality] = useState(92)
  const [bleed, setBleed] = useState(false)
  const [includeVis, setIncludeVis] = useState(true)
  const [includeMeas, setIncludeMeas] = useState(true)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const plan = computePlan({
    format,
    quality: quality / 100,
    bleedCm: bleed ? 0.3 : 0,
    includeVisualization: includeVis,
    includeMeasurements: includeMeas,
  })

  const options: ExportOptions = {
    format,
    quality: quality / 100,
    bleedCm: bleed ? 0.3 : 0,
    includeVisualization: includeVis,
    includeMeasurements: includeMeas,
  }

  const canExport = panels.length > 0 && !busy

  const handleExport = async () => {
    setBusy(true)
    setError(null)
    setProgress({ done: 0, total: plan.panels.length + (plan.visualization ? 1 : 0) })
    try {
      await runExport(options, (done, total) => setProgress({ done, total }))
      setExportOpen(false)
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  return (
    <div className="modal-overlay" onClick={() => !busy && setExportOpen(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h2>Export</h2>
          <div className="spacer" />
          <button className="close-x" disabled={busy} onClick={() => setExportOpen(false)}>✕</button>
        </div>

        {panels.length === 0 ? (
          <div className="hint">Add at least one panel before exporting.</div>
        ) : (
          <>
            <div className="field">
              <span>Format</span>
              <div className="seg">
                <button className={format === 'jpeg' ? 'active' : ''} onClick={() => setFormat('jpeg')}>JPEG</button>
                <button className={format === 'png' ? 'active' : ''} onClick={() => setFormat('png')}>PNG</button>
              </div>
            </div>

            {format === 'jpeg' && (
              <label className="field">
                <span>JPEG Quality: {quality}%</span>
                <input type="range" min={50} max={100} value={quality} onChange={(e) => setQuality(Number(e.target.value))} />
              </label>
            )}

            <label className="toggle on" style={{ marginTop: 4 }}>
              <input type="checkbox" checked={bleed} onChange={(e) => setBleed(e.target.checked)} />
              <span className="track" />
              <span>Add 3 mm bleed per side</span>
            </label>

            <label className={`toggle ${includeVis ? 'on' : ''}`}>
              <input type="checkbox" checked={includeVis} onChange={(e) => setIncludeVis(e.target.checked)} />
              <span className="track" />
              <span>Include visualization image</span>
            </label>

            <label className={`toggle ${includeMeas ? 'on' : ''}`}>
              <input type="checkbox" checked={includeMeas} onChange={(e) => setIncludeMeas(e.target.checked)} />
              <span className="track" />
              <span>Include measurements sheet (PDF)</span>
            </label>

            {plan.warnings.length > 0 && (
              <div className="upload-warn" style={{ marginTop: 4 }}>
                {plan.warnings.map((w) => (
                  <div key={w.index}>⚠ Panel {w.index + 1}: effective DPI is {w.dpi} (below 300). Consider a smaller size.</div>
                ))}
              </div>
            )}

            {error && <div className="upload-warn">{error}</div>}

            <div className="modal-actions">
              {busy && progress ? (
                <span className="hint">Exporting… {progress.done}/{progress.total}</span>
              ) : (
                <span className="hint">{plan.panels.length} panel image{plan.panels.length === 1 ? '' : 's'}{plan.visualization ? ' + visualization' : ''}{includeMeas ? ' + measurements' : ''}</span>
              )}
              <button className="primary" disabled={!canExport} onClick={handleExport}>
                {busy ? 'Working…' : 'Download ZIP'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
