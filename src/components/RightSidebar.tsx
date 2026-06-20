import { useStore } from '../store/useStore'
import { FRAME_SIZES, getPreset } from '../lib/frameSizes'
import { FRAME_COLORS, MAT_COLORS } from '../lib/frameColors'
import { panelGeometry, resolveFrame } from '../lib/geometry'
import { CommitNumberField, NumberField, Segmented, Swatches, Toggle } from './ui'

export function RightSidebar() {
  const unit = useStore((s) => s.unit)
  const wall = useStore((s) => s.wall)
  const setWall = useStore((s) => s.setWall)
  const panels = useStore((s) => s.panels)
  const selectedId = useStore((s) => s.selectedId)
  const frame = useStore((s) => s.frame)
  const perPanelFrame = useStore((s) => s.perPanelFrame)
  const image = useStore((s) => s.image)

  const setPanelSize = useStore((s) => s.setPanelSize)
  const setPanelOuterPosition = useStore((s) => s.setPanelOuterPosition)
  const updatePanel = useStore((s) => s.updatePanel)
  const orientPanel = useStore((s) => s.orientPanel)
  const deletePanel = useStore((s) => s.deletePanel)
  const setFrame = useStore((s) => s.setFrame)
  const resetFrameToGlobal = useStore((s) => s.resetFrameToGlobal)
  const setImageMode = useStore((s) => s.setImageMode)
  const setImageZoom = useStore((s) => s.setImageZoom)
  const resetImage = useStore((s) => s.resetImage)

  const selected = panels.find((p) => p.id === selectedId) ?? null
  const selFrame = selected ? resolveFrame(selected, frame, perPanelFrame) : null
  const selGeom = selected && selFrame ? panelGeometry(selected, selFrame) : null
  const hasOverride = selected ? Boolean(perPanelFrame[selected.id]) : false
  const sizePresetOptions = FRAME_SIZES[unit]
  // Frame section shows the selected panel's resolved frame when in per-panel mode.
  const displayFrame = frame.perPanel && selFrame ? selFrame : frame

  const colorOptions = Object.entries(FRAME_COLORS).map(([key, v]) => ({ key, label: v.label, hex: key === 'custom' ? displayFrame.customColor : v.hex }))
  const matColorOptions = Object.entries(MAT_COLORS).map(([key, v]) => ({ key, label: v.label, hex: key === 'custom' ? displayFrame.matCustomColor : v.hex }))

  return (
    <aside className="sidebar right">
      <div className="card">
        <div className="section-title">Wall Setup</div>
        <div className="field-grid">
          <NumberField label="Width" value={wall.width} onChange={(v) => setWall({ width: v })} min={10} step={1} suffix={unit} />
          <NumberField label="Height" value={wall.height} onChange={(v) => setWall({ height: v })} min={10} step={1} suffix={unit} />
        </div>
        <label className="field">
          <span>Wall color</span>
          <input type="color" value={wall.color} onChange={(e) => setWall({ color: e.target.value })} style={{ width: '100%', height: 32, padding: 0, background: 'none' }} />
        </label>
      </div>

      {selected && selFrame && selGeom && (
        <div className="card">
          <div className="section-title">Panel Properties</div>
          <label className="field">
            <span>Size preset</span>
            <select value={selected.sizePreset} onChange={(e) => {
              const key = e.target.value
              if (key === 'custom') { updatePanel(selected.id, { sizePreset: 'custom' }); return }
              const p = getPreset(unit, key)
              if (p) setPanelSize(selected.id, p.w, p.h, key)
            }}>
              {sizePresetOptions.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
              <option value="custom">Custom</option>
            </select>
          </label>
          <div className="field-grid">
            <CommitNumberField
              label="Width"
              value={selected.width}
              suffix={unit}
              min={10}
              disabled={selected.sizePreset !== 'custom'}
              onCommit={(v) => {
                if (selected.lockAspect) {
                  const ratio = selected.height / selected.width
                  setPanelSize(selected.id, v, v * ratio, 'custom')
                } else setPanelSize(selected.id, v, selected.height, 'custom')
              }}
            />
            <CommitNumberField
              label="Height"
              value={selected.height}
              suffix={unit}
              min={10}
              disabled={selected.sizePreset !== 'custom'}
              onCommit={(v) => {
                if (selected.lockAspect) {
                  const ratio = selected.width / selected.height
                  setPanelSize(selected.id, v * ratio, v, 'custom')
                } else setPanelSize(selected.id, selected.width, v, 'custom')
              }}
            />
          </div>
          <Toggle on={!!selected.lockAspect} onChange={(v) => updatePanel(selected.id, { lockAspect: v })} label="Lock aspect ratio" />
          <div className="field-grid" style={{ marginTop: 8 }}>
            <CommitNumberField
              label="X (outer)"
              value={selGeom.outer.x}
              suffix={unit}
              onCommit={(v) => setPanelOuterPosition(selected.id, v, selGeom.outer.y)}
            />
            <CommitNumberField
              label="Y (outer)"
              value={selGeom.outer.y}
              suffix={unit}
              onCommit={(v) => setPanelOuterPosition(selected.id, selGeom.outer.x, v)}
            />
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button onClick={() => orientPanel(selected.id)}>↻ Swap Orientation</button>
            <div className="spacer" />
            <button className="danger" onClick={() => deletePanel(selected.id)}>Delete</button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="section-title">Frame Style</div>
        <div className="row" style={{ marginBottom: 10 }}>
          <Segmented
            options={[{ key: 'all', label: 'Apply to all' }, { key: 'panel', label: 'Selected only' }]}
            value={frame.perPanel ? 'panel' : 'all'}
            onChange={(v) => setFrame({ perPanel: v === 'panel' })}
          />
          {frame.perPanel && hasOverride && selected && (
            <button className="ghost" title="Reset this panel's frame to global" onClick={() => resetFrameToGlobal(selected.id)}>Reset</button>
          )}
        </div>
        <CommitNumberField label="Frame edge width" value={displayFrame.edgeWidth} suffix={unit} min={0} max={20} step={0.5} onCommit={(v) => setFrame({ edgeWidth: v })} />
        <label className="field"><span>Frame color</span>
          <Swatches
            options={colorOptions}
            value={displayFrame.colorKey}
            customColor={displayFrame.customColor}
            onPick={(k) => setFrame({ colorKey: k as never })}
            onCustomColor={(hex) => setFrame({ colorKey: 'custom', customColor: hex })}
          />
        </label>
        <div style={{ marginTop: 8 }}>
          <Toggle on={displayFrame.matEnabled} onChange={(v) => setFrame({ matEnabled: v })} label="Mat / passepartout" />
        </div>
        {displayFrame.matEnabled && (
          <>
            <CommitNumberField label="Mat width" value={displayFrame.matWidth} suffix={unit} min={1} max={5} step={0.5} onCommit={(v) => setFrame({ matWidth: v })} />
            <label className="field"><span>Mat color</span>
              <Swatches
                options={matColorOptions}
                value={displayFrame.matColorKey}
                customColor={displayFrame.matCustomColor}
                onPick={(k) => setFrame({ matColorKey: k as never })}
                onCustomColor={(hex) => setFrame({ matColorKey: 'custom', matCustomColor: hex })}
              />
            </label>
          </>
        )}
        <div style={{ marginTop: 8 }}>
          <Toggle on={displayFrame.shadow} onChange={(v) => setFrame({ shadow: v })} label="Drop shadow" />
        </div>
      </div>

      <div className="card">
        <div className="section-title">Image Positioning</div>
        <div className="row" style={{ marginBottom: 8 }}>
          <button className={image.mode === 'fit' ? 'primary' : ''} onClick={() => setImageMode('fit')}>Fit</button>
          <button className={image.mode === 'fill' ? 'primary' : ''} onClick={() => setImageMode('fill')}>Fill</button>
          <button onClick={resetImage}>Reset</button>
        </div>
        <label className="field">
          <span>Zoom {image.mode === 'custom' ? `(${image.zoom.toFixed(2)}× fit)` : ''}</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={image.mode === 'custom' ? image.zoom : 1}
            onChange={(e) => setImageZoom(Number(e.target.value))}
          />
        </label>
        <div className="hint">Click the image on the canvas to select it, then drag to reposition or drag a corner handle to zoom proportionally. Drag empty canvas to pan the view (hold Space to pan over the image).</div>
      </div>
    </aside>
  )
}
