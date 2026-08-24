import { useStore } from '../store/useStore'
import { FRAME_SIZES, getPreset } from '../lib/frameSizes'
import { FRAME_COLORS, MAT_COLORS } from '../lib/frameColors'
import { panelGeometry, resolveFrame } from '../lib/geometry'
import { suggestedOpening } from '../lib/passepartout'
import { ArrowLeftRightIcon } from 'lucide-react'
import { CommitNumberField, Segmented, Swatches, Toggle, WallColorPicker } from './ui'

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
  const updatePassepartout = useStore((s) => s.updatePassepartout)
  const setImageMode = useStore((s) => s.setImageMode)
  const setImageZoom = useStore((s) => s.setImageZoom)
  const beginHistoryGroup = useStore((s) => s.beginHistoryGroup)
  const endHistoryGroup = useStore((s) => s.endHistoryGroup)

  const selected = panels.find((p) => p.id === selectedId) ?? null
  const selFrame = selected ? resolveFrame(selected, frame, perPanelFrame) : null
  const selGeom = selected && selFrame ? panelGeometry(selected, selFrame) : null
  const hasOverride = selected ? Boolean(perPanelFrame[selected.id]) : false
  const sizePresetOptions = FRAME_SIZES[unit]
  // Frame section shows the selected panel's resolved frame when in per-panel mode.
  const displayFrame = frame.perPanel && selFrame ? selFrame : frame
  const passepartout = selFrame?.passepartout ?? null
  const oneSizeSmaller = selected ? suggestedOpening(selected) : null

  const colorOptions = Object.entries(FRAME_COLORS).map(([key, v]) => ({ key, label: v.label, hex: key === 'custom' ? displayFrame.customColor : v.hex }))
  const displayMatKey = frame.perPanel && selFrame ? selFrame.passepartout.colorKey : frame.matColorKey
  const displayMatCustom = frame.perPanel && selFrame ? selFrame.passepartout.customColor : frame.matCustomColor
  const matColorOptions = Object.entries(MAT_COLORS).map(([key, v]) => ({ key, label: v.label, hex: key === 'custom' ? displayMatCustom : v.hex }))

  return (
    <aside className="sidebar right">
      <div className="card">
        <div className="section-title">Wall Setup</div>
        <div className="field-grid">
          <CommitNumberField label="Width" value={wall.width} onCommit={(v) => setWall({ width: v })} min={10} step={1} suffix={unit} />
          <CommitNumberField label="Height" value={wall.height} onCommit={(v) => setWall({ height: v })} min={10} step={1} suffix={unit} />
        </div>
        <div className="field">
          <span>Wall color</span>
          <WallColorPicker color={wall.color} onChange={(c) => setWall({ color: c })} />
        </div>
      </div>

      {selected && selFrame && selGeom && (
        <div className="card">
          <div className="section-title">Panel Properties</div>
          <label className="field">
            <span>Size preset</span>
            <div className="row" style={{ width: '100%' }}>
              <select value={selected.sizePreset} onChange={(e) => {
                const key = e.target.value
                if (key === 'custom') { updatePanel(selected.id, { sizePreset: 'custom' }); return }
                const p = getPreset(unit, key)
                if (p) setPanelSize(selected.id, p.w, p.h, key)
              }} style={{ flex: 1 }}>
                {sizePresetOptions.map((p) => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
                <option value="custom">Custom</option>
              </select>
              <button title="Swap orientation" onClick={() => orientPanel(selected.id)}><ArrowLeftRightIcon size={16} /></button>
            </div>
          </label>
          {selected.sizePreset === 'custom' && (
            <>
              <div className="field-grid">
                <CommitNumberField
                  label="Width"
                  value={selected.width}
                  suffix={unit}
                  min={10}
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
                  onCommit={(v) => {
                    if (selected.lockAspect) {
                      const ratio = selected.width / selected.height
                      setPanelSize(selected.id, v * ratio, v, 'custom')
                    } else setPanelSize(selected.id, selected.width, v, 'custom')
                  }}
                />
              </div>
              <Toggle on={!!selected.lockAspect} onChange={(v) => updatePanel(selected.id, { lockAspect: v })} label="Lock aspect ratio" />
            </>
          )}
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
          {passepartout && (
            <div className="panel-subsection">
              <div className="mini-title">Passepartout</div>
              <Toggle on={passepartout.enabled} onChange={(v) => updatePassepartout(selected.id, { enabled: v })} label="Use passepartout" />
              {passepartout.enabled && (
                <div className="col" style={{ marginTop: 8 }}>
                  <Segmented
                    options={[
                      { key: 'opening', label: 'Opening size' },
                      { key: 'inset', label: 'Even inset' },
                      { key: 'margins', label: 'Margins' },
                    ]}
                    value={passepartout.mode}
                    onChange={(v) => updatePassepartout(selected.id, { mode: v as never })}
                  />
                  {passepartout.mode === 'opening' && (
                    <>
                      <div className="field-grid">
                        <CommitNumberField
                          label="Opening width"
                          value={passepartout.openingWidth}
                          suffix={unit}
                          min={1}
                          max={selected.width}
                          step={0.5}
                          onCommit={(v) => updatePassepartout(selected.id, { openingWidth: v })}
                        />
                        <CommitNumberField
                          label="Opening height"
                          value={passepartout.openingHeight}
                          suffix={unit}
                          min={1}
                          max={selected.height}
                          step={0.5}
                          onCommit={(v) => updatePassepartout(selected.id, { openingHeight: v })}
                        />
                      </div>
                      {oneSizeSmaller && (
                        <button
                          className="ghost"
                          title="Set the opening to the next smaller common frame size"
                          onClick={() => updatePassepartout(selected.id, { mode: 'opening', openingWidth: oneSizeSmaller.w, openingHeight: oneSizeSmaller.h })}
                        >
                          Use {oneSizeSmaller.w} × {oneSizeSmaller.h} {unit} opening
                        </button>
                      )}
                    </>
                  )}
                  {passepartout.mode === 'inset' && (
                    <CommitNumberField
                      label="Inset"
                      value={passepartout.inset}
                      suffix={unit}
                      min={0}
                      max={Math.max(0, Math.min(selected.width, selected.height) / 2)}
                      step={0.5}
                      onCommit={(v) => updatePassepartout(selected.id, { inset: v })}
                    />
                  )}
                  {passepartout.mode === 'margins' && (
                    <div className="field-grid">
                      <CommitNumberField label="Top" value={passepartout.marginTop} suffix={unit} min={0} step={0.5} onCommit={(v) => updatePassepartout(selected.id, { marginTop: v })} />
                      <CommitNumberField label="Right" value={passepartout.marginRight} suffix={unit} min={0} step={0.5} onCommit={(v) => updatePassepartout(selected.id, { marginRight: v })} />
                      <CommitNumberField label="Bottom" value={passepartout.marginBottom} suffix={unit} min={0} step={0.5} onCommit={(v) => updatePassepartout(selected.id, { marginBottom: v })} />
                      <CommitNumberField label="Left" value={passepartout.marginLeft} suffix={unit} min={0} step={0.5} onCommit={(v) => updatePassepartout(selected.id, { marginLeft: v })} />
                    </div>
                  )}

                </div>
              )}
            </div>
          )}
          <div className="row" style={{ marginTop: 8 }}>
            <div className="spacer" />
            <button className="danger" onClick={() => deletePanel(selected.id)}>Delete</button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="section-title">Frame Style</div>
        <div className="row" style={{ marginBottom: 10 }}>
          <Segmented
            options={[
              { key: 'all', label: 'Apply to all' },
              { key: 'panel', label: 'Selected only', disabled: !selectedId },
            ]}
            value={frame.perPanel ? 'panel' : 'all'}
            onChange={(v) => setFrame({ perPanel: v === 'panel' })}
          />
          {frame.perPanel && hasOverride && selected && (
            <button className="ghost" title="Reset this panel's frame to global" onClick={() => resetFrameToGlobal(selected.id)}>Reset</button>
          )}
        </div>
        <CommitNumberField label="Frame edge width" value={displayFrame.edgeWidth} suffix={unit} min={0} max={20} step={0.5} onCommit={(v) => setFrame({ edgeWidth: v })} />
        <div className="field"><span>Frame color</span>
          <Swatches
            options={colorOptions}
            value={displayFrame.colorKey}
            customColor={displayFrame.customColor}
            onPick={(k) => setFrame({ colorKey: k as never })}
            onCustomColor={(hex) => setFrame({ colorKey: 'custom', customColor: hex })}
          />
        </div>
        <div className="field"><span>Passepartout color</span>
          <Swatches
            options={matColorOptions}
            value={displayMatKey}
            customColor={displayMatCustom}
            onPick={(k) => {
              if (frame.perPanel && selected) {
                updatePassepartout(selected.id, { colorKey: k as never })
              } else {
                setFrame({ matColorKey: k as never })
              }
            }}
            onCustomColor={(hex) => {
              if (frame.perPanel && selected) {
                updatePassepartout(selected.id, { colorKey: 'custom', customColor: hex })
              } else {
                setFrame({ matColorKey: 'custom', matCustomColor: hex })
              }
            }}
          />
        </div>
        <div style={{ marginTop: 8 }}>
          <Toggle on={displayFrame.shadow} onChange={(v) => setFrame({ shadow: v })} label="Drop shadow" />
        </div>
      </div>

      <div className="card">
        <div className="section-title">Image Positioning</div>
        <div className="row" style={{ marginBottom: 8 }}>
          <button className={image.mode === 'fit' ? 'primary' : ''} onClick={() => setImageMode('fit')}>Fit</button>
          <button className={image.mode === 'fill' ? 'primary' : ''} onClick={() => setImageMode('fill')}>Fill</button>
          <button className={image.mode === 'custom' ? 'primary' : ''} onClick={() => setImageMode('custom')}>Manual</button>
        </div>
        {image.mode === 'custom' && (
          <label className="field">
            <span>Zoom ({image.zoom.toFixed(2)}× fit)</span>
            <input
              type="range"
              min={1}
              max={5}
              step={0.01}
              value={image.zoom}
              onChange={(e) => setImageZoom(Number(e.target.value))}
              onPointerDown={beginHistoryGroup}
              onPointerUp={endHistoryGroup}
              onPointerCancel={endHistoryGroup}
            />
          </label>
        )}
        {image.mode === 'custom' && (
          <div className="hint">Drag the image on canvas to reposition, or drag corner handles to resize.</div>
        )}
      </div>
    </aside>
  )
}
