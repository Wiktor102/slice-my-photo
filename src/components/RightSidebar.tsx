import { useStore } from '../store/useStore'
import { FRAME_SIZES, getPreset } from '../lib/frameSizes'
import { FRAME_COLORS, MAT_COLORS } from '../lib/frameColors'
import { panelGeometry, resolveFrame } from '../lib/geometry'
import { MIN_OPENING_SIZE, suggestedOpening } from '../lib/passepartout'
import { formatMeasurement, fromMm, MIN_PANEL_SIZE_MM, MIN_WALL_SIZE_MM, toMm } from '../lib/units'
import { ArrowLeftRightIcon } from 'lucide-react'
import { CommitNumberField, Segmented, Swatches, Toggle, WallColorPicker } from './ui'
import { PreflightSummary } from './PreflightSummary'

export function RightSidebar() {
  const unit = useStore((s) => s.unit)
  const wall = useStore((s) => s.wall)
  const setWall = useStore((s) => s.setWall)
  const panels = useStore((s) => s.panels)
  const selectedId = useStore((s) => s.selectedId)
  const selectedIds = useStore((s) => s.selectedIds)
  const frame = useStore((s) => s.frame)
  const perPanelFrame = useStore((s) => s.perPanelFrame)
  const image = useStore((s) => s.image)

  const setPanelSize = useStore((s) => s.setPanelSize)
  const setPanelDisplayUnit = useStore((s) => s.setPanelDisplayUnit)
  const setPanelOuterPosition = useStore((s) => s.setPanelOuterPosition)
  const updatePanel = useStore((s) => s.updatePanel)
  const orientPanel = useStore((s) => s.orientPanel)
  const deletePanel = useStore((s) => s.deletePanel)
  const deleteSelectedPanels = useStore((s) => s.deleteSelectedPanels)
  const duplicateSelectedPanels = useStore((s) => s.duplicateSelectedPanels)
  const alignSelectedPanels = useStore((s) => s.alignSelectedPanels)
  const distributeSelectedPanels = useStore((s) => s.distributeSelectedPanels)
  const centerSelectedPanels = useStore((s) => s.centerSelectedPanels)
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
  const panelUnit = selected?.displayUnit ?? unit
  const sizePresetOptions = FRAME_SIZES[panelUnit]
  // Frame section shows the selected panel's resolved frame when in per-panel mode.
  const displayFrame = frame.perPanel && selFrame ? selFrame : frame
  const passepartout = selFrame?.passepartout ?? null
  const oneSizeSmaller = selected ? suggestedOpening(selected) : null
  const selectedCount = selectedIds.length

  const colorOptions = Object.entries(FRAME_COLORS).map(([key, v]) => ({ key, label: v.label, hex: key === 'custom' ? displayFrame.customColor : v.hex }))
  const displayMatKey = frame.perPanel && selFrame ? selFrame.passepartout.colorKey : frame.matColorKey
  const displayMatCustom = frame.perPanel && selFrame ? selFrame.passepartout.customColor : frame.matCustomColor
  const matColorOptions = Object.entries(MAT_COLORS).map(([key, v]) => ({ key, label: v.label, hex: key === 'custom' ? displayMatCustom : v.hex }))

  return (
    <aside className="sidebar right">
      <PreflightSummary />

      <div className="card">
        <div className="section-title">Wall Setup</div>
        <div className="field-grid">
          <CommitNumberField label="Width" value={fromMm(wall.width, unit)} onCommit={(v) => setWall({ width: toMm(v, unit) })} min={fromMm(MIN_WALL_SIZE_MM, unit)} step={unit === 'cm' ? 1 : 0.5} suffix={unit} />
          <CommitNumberField label="Height" value={fromMm(wall.height, unit)} onCommit={(v) => setWall({ height: toMm(v, unit) })} min={fromMm(MIN_WALL_SIZE_MM, unit)} step={unit === 'cm' ? 1 : 0.5} suffix={unit} />
        </div>
        <div className="field">
          <span>Wall color</span>
          <WallColorPicker color={wall.color} onChange={(c) => setWall({ color: c })} />
        </div>
      </div>

      {selectedCount > 0 && (
        <div className="card layout-tools">
          <div className="section-title">Layout Tools</div>
          <div className="hint layout-selection-hint">
            {selectedCount} panel{selectedCount === 1 ? '' : 's'} selected · Shift/Ctrl/Cmd-click to add
          </div>
          <div className="layout-tool-row">
            <button onClick={duplicateSelectedPanels} disabled={panels.length >= 8} title="Duplicate selected panels with a small offset">Duplicate</button>
            <button onClick={centerSelectedPanels} title="Center the selected group on the wall">Center on wall</button>
          </div>
          <div className="layout-tool-group">
            <span>Horizontal</span>
            <div className="layout-tool-row">
              <button onClick={() => alignSelectedPanels('horizontal', 'start')} title="Align selected frames by their left edges">Left</button>
              <button onClick={() => alignSelectedPanels('horizontal', 'center')} title="Align selected frame centers horizontally">Center</button>
              <button onClick={() => alignSelectedPanels('horizontal', 'end')} title="Align selected frames by their right edges">Right</button>
              <button onClick={() => distributeSelectedPanels('horizontal')} disabled={selectedCount < 3} title="Distribute selected frames evenly from left to right">Distribute</button>
            </div>
          </div>
          <div className="layout-tool-group">
            <span>Vertical</span>
            <div className="layout-tool-row">
              <button onClick={() => alignSelectedPanels('vertical', 'start')} title="Align selected frames by their top edges">Top</button>
              <button onClick={() => alignSelectedPanels('vertical', 'center')} title="Align selected frame centers vertically">Middle</button>
              <button onClick={() => alignSelectedPanels('vertical', 'end')} title="Align selected frames by their bottom edges">Bottom</button>
              <button onClick={() => distributeSelectedPanels('vertical')} disabled={selectedCount < 3} title="Distribute selected frames evenly from top to bottom">Distribute</button>
            </div>
          </div>
          <div className="hint layout-key-hint">Arrow keys nudge · Shift + Arrow moves farther</div>
        </div>
      )}

      {selected && selFrame && selGeom && (
        <div className="card">
          <div className="section-title">Panel Properties</div>
          <label className="field">
            <span>Panel units</span>
            <select
              value={panelUnit}
              onChange={(e) => setPanelDisplayUnit(selected.id, e.target.value as 'cm' | 'in')}
            >
              <option value="cm">Centimeters (cm)</option>
              <option value="in">Inches (in)</option>
            </select>
          </label>
          <label className="field">
            <span>Size preset</span>
            <div className="row" style={{ width: '100%' }}>
              <select value={selected.sizePreset} onChange={(e) => {
                const key = e.target.value
                if (key === 'custom') { updatePanel(selected.id, { sizePreset: 'custom' }); return }
                const p = getPreset(panelUnit, key)
                if (p) setPanelSize(selected.id, toMm(p.w, panelUnit), toMm(p.h, panelUnit), key)
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
                  value={fromMm(selected.width, panelUnit)}
                  suffix={panelUnit}
                  min={fromMm(MIN_PANEL_SIZE_MM, panelUnit)}
                  step={panelUnit === 'cm' ? 1 : 0.5}
                  onCommit={(v) => {
                    if (selected.lockAspect) {
                      const ratio = selected.height / selected.width
                      const width = toMm(v, panelUnit)
                      setPanelSize(selected.id, width, width * ratio, 'custom')
                    } else setPanelSize(selected.id, toMm(v, panelUnit), selected.height, 'custom')
                  }}
                />
                <CommitNumberField
                  label="Height"
                  value={fromMm(selected.height, panelUnit)}
                  suffix={panelUnit}
                  min={fromMm(MIN_PANEL_SIZE_MM, panelUnit)}
                  step={panelUnit === 'cm' ? 1 : 0.5}
                  onCommit={(v) => {
                    if (selected.lockAspect) {
                      const ratio = selected.width / selected.height
                      const height = toMm(v, panelUnit)
                      setPanelSize(selected.id, height * ratio, height, 'custom')
                    } else setPanelSize(selected.id, selected.width, toMm(v, panelUnit), 'custom')
                  }}
                />
              </div>
              <Toggle on={!!selected.lockAspect} onChange={(v) => updatePanel(selected.id, { lockAspect: v })} label="Lock aspect ratio" />
            </>
          )}
          <div className="field-grid" style={{ marginTop: 8 }}>
            <CommitNumberField
              label="X (outer)"
              value={fromMm(selGeom.outer.x, unit)}
              suffix={unit}
              onCommit={(v) => setPanelOuterPosition(selected.id, toMm(v, unit), selGeom.outer.y)}
            />
            <CommitNumberField
              label="Y (outer)"
              value={fromMm(selGeom.outer.y, unit)}
              suffix={unit}
              onCommit={(v) => setPanelOuterPosition(selected.id, selGeom.outer.x, toMm(v, unit))}
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
                          value={fromMm(passepartout.openingWidth, panelUnit)}
                          suffix={panelUnit}
                          min={fromMm(MIN_OPENING_SIZE, panelUnit)}
                          max={fromMm(selected.width, panelUnit)}
                          step={panelUnit === 'cm' ? 0.5 : 0.25}
                          onCommit={(v) => updatePassepartout(selected.id, { openingWidth: toMm(v, panelUnit) })}
                        />
                        <CommitNumberField
                          label="Opening height"
                          value={fromMm(passepartout.openingHeight, panelUnit)}
                          suffix={panelUnit}
                          min={fromMm(MIN_OPENING_SIZE, panelUnit)}
                          max={fromMm(selected.height, panelUnit)}
                          step={panelUnit === 'cm' ? 0.5 : 0.25}
                          onCommit={(v) => updatePassepartout(selected.id, { openingHeight: toMm(v, panelUnit) })}
                        />
                      </div>
                      {oneSizeSmaller && (
                        <button
                          className="ghost"
                          title="Set the opening to the next smaller common frame size"
                          onClick={() => updatePassepartout(selected.id, { mode: 'opening', openingWidth: oneSizeSmaller.w, openingHeight: oneSizeSmaller.h })}
                        >
                          Use {formatMeasurement(oneSizeSmaller.w, panelUnit)} × {formatMeasurement(oneSizeSmaller.h, panelUnit)} {panelUnit} opening
                        </button>
                      )}
                    </>
                  )}
                  {passepartout.mode === 'inset' && (
                    <CommitNumberField
                      label="Inset"
                      value={fromMm(passepartout.inset, panelUnit)}
                      suffix={panelUnit}
                      min={0}
                      max={fromMm(Math.max(0, Math.min(selected.width, selected.height) / 2), panelUnit)}
                      step={panelUnit === 'cm' ? 0.5 : 0.25}
                      onCommit={(v) => updatePassepartout(selected.id, { inset: toMm(v, panelUnit) })}
                    />
                  )}
                  {passepartout.mode === 'margins' && (
                    <div className="field-grid">
                      <CommitNumberField label="Top" value={fromMm(passepartout.marginTop, panelUnit)} suffix={panelUnit} min={0} step={panelUnit === 'cm' ? 0.5 : 0.25} onCommit={(v) => updatePassepartout(selected.id, { marginTop: toMm(v, panelUnit) })} />
                      <CommitNumberField label="Right" value={fromMm(passepartout.marginRight, panelUnit)} suffix={panelUnit} min={0} step={panelUnit === 'cm' ? 0.5 : 0.25} onCommit={(v) => updatePassepartout(selected.id, { marginRight: toMm(v, panelUnit) })} />
                      <CommitNumberField label="Bottom" value={fromMm(passepartout.marginBottom, panelUnit)} suffix={panelUnit} min={0} step={panelUnit === 'cm' ? 0.5 : 0.25} onCommit={(v) => updatePassepartout(selected.id, { marginBottom: toMm(v, panelUnit) })} />
                      <CommitNumberField label="Left" value={fromMm(passepartout.marginLeft, panelUnit)} suffix={panelUnit} min={0} step={panelUnit === 'cm' ? 0.5 : 0.25} onCommit={(v) => updatePassepartout(selected.id, { marginLeft: toMm(v, panelUnit) })} />
                    </div>
                  )}

                </div>
              )}
            </div>
          )}
          <div className="row" style={{ marginTop: 8 }}>
            <div className="spacer" />
            <button
              className="danger"
              onClick={() => selectedCount > 1 ? deleteSelectedPanels() : deletePanel(selected.id)}
            >
              {selectedCount > 1 ? `Delete ${selectedCount} panels` : 'Delete'}
            </button>
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
        <CommitNumberField label="Frame edge width" value={fromMm(displayFrame.edgeWidth, frame.perPanel && selected ? panelUnit : unit)} suffix={frame.perPanel && selected ? panelUnit : unit} min={0} max={fromMm(200, frame.perPanel && selected ? panelUnit : unit)} step={frame.perPanel && selected && panelUnit === 'in' ? 0.25 : 0.5} onCommit={(v) => setFrame({ edgeWidth: toMm(v, frame.perPanel && selected ? panelUnit : unit) })} />
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
