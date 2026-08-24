import { useStore } from '../store/useStore'
import { PRESETS } from '../lib/presets'
import { getPreset } from '../lib/frameSizes'
import { panelGeometry, panelsOverlap, resolveFrame } from '../lib/geometry'
import { PresetIcon } from './PresetIcon'
import { Trash2Icon } from 'lucide-react'

export function LeftSidebar() {
  const unit = useStore((s) => s.unit)
  const panels = useStore((s) => s.panels)
  const selectedId = useStore((s) => s.selectedId)
  const presetActive = useStore((s) => s.presetActive)
  const gap = useStore((s) => s.gap)
  const frame = useStore((s) => s.frame)
  const perPanelFrame = useStore((s) => s.perPanelFrame)

  const applyPreset = useStore((s) => s.applyPreset)
  const setGap = useStore((s) => s.setGap)
  const addPanel = useStore((s) => s.addPanel)
  const deletePanel = useStore((s) => s.deletePanel)
  const selectPanel = useStore((s) => s.selectPanel)

  const geoms = panels.map((p) => panelGeometry(p, resolveFrame(p, frame, perPanelFrame)))

  return (
    <aside className="sidebar left">
      <div className="card">
        <div className="section-title">Preset Layouts</div>
        <div className="preset-grid">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              className={`preset-btn ${presetActive === p.key ? 'active' : ''}`}
              onClick={() => applyPreset(p.key)}
              title={p.name}
            >
              <PresetIcon preset={p} />
              <span>{p.name}</span>
            </button>
          ))}
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label>Gap ({unit}) — outer edge to outer edge</label>
          <input
            type="number"
            min={0}
            step={0.5}
            value={gap}
            onChange={(e) => setGap(Number(e.target.value))}
            disabled={!presetActive}
          />
        </div>
      </div>

      <div className="card">
        <div className="section-title">Custom</div>
        <button
          style={{ width: '100%' }}
          onClick={addPanel}
          disabled={panels.length >= 8}
          title={panels.length >= 8 ? 'Maximum of 8 panels reached' : 'Add a panel at the wall center'}
        >
          + Add Panel
        </button>
        {panels.length >= 8 && <div className="hint" style={{ marginTop: 6 }}>Maximum of 8 panels.</div>}
      </div>

      <div className="card">
        <div className="section-title">Panels ({panels.length}/8)</div>
        {panels.length === 0 ? (
          <div className="empty-hint">Add panels from the left sidebar or choose a preset.</div>
        ) : (
          <div className="panel-list">
            {panels.map((p, i) => {
              const sizeKey = getPreset(unit, p.sizePreset)
              const sizeLabel = sizeKey ? `${sizeKey.w}×${sizeKey.h}` : `${Math.round(p.width)}×${Math.round(p.height)}`
              const overlap = panelsOverlap(geoms, i)
              return (
                <div
                  key={p.id}
                  className={`panel-row ${selectedId === p.id ? 'selected' : ''}`}
                  onClick={() => selectPanel(p.id)}
                >
                  <span className="num">{i + 1}</span>
                  <span className="size">{sizeLabel} {unit}</span>
                  {overlap && <span className="warn-dot" title="Overlaps another panel">⚠</span>}
                  <button
                    className="del"
                    title="Delete panel"
                    aria-label={`Delete panel ${i + 1}`}
                    onClick={(e) => { e.stopPropagation(); deletePanel(p.id) }}
                  >
                    <Trash2Icon size={16} strokeWidth={1.8} aria-hidden="true" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </aside>
  )
}
