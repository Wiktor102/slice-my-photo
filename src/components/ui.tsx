import { useState, useRef, useEffect } from 'react'
import { HexColorPicker } from 'react-colorful'
import { PipetteIcon } from 'lucide-react'
import { WALL_COLORS } from '../lib/frameColors'
import { useStore } from '../store/useStore'

export function Swatches({
  options,
  value,
  customColor,
  onPick,
  onCustomColor,
}: {
  options: { key: string; label: string; hex: string }[]
  value: string
  customColor: string
  onPick: (key: string) => void
  onCustomColor: (hex: string) => void
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const beginHistoryGroup = useStore((s) => s.beginHistoryGroup)
  const endHistoryGroup = useStore((s) => s.endHistoryGroup)
  const presets = options.filter((o) => o.key !== 'custom')

  // Click-outside: just close the picker. The colour is already committed
  // live via HexColorPicker's onChange, so no commit needed here.
  // Use pointerdown (not mousedown) because react-colorful calls
  // preventDefault() on pointerdown, which can suppress mousedown.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const handleCustomClick = () => {
    if (value !== 'custom') {
      // Switching into custom mode — set both colorKey AND customColor together
      onCustomColor(customColor)
      setOpen(true)
    } else {
      // Toggle the picker open/closed. Colour is already committed via onChange.
      setOpen((o) => !o)
    }
  }

  return (
    <div className="col" style={{ gap: 6 }} ref={wrapRef}>
      <div className="swatches">
        {presets.map((o) => (
          <button
            key={o.key}
            className={`swatch ${value === o.key ? 'active' : ''}`}
            style={{ background: o.hex }}
            title={o.label}
            onClick={() => { onPick(o.key); setOpen(false) }}
          />
        ))}
        <button
          className={`swatch swatch-custom ${value === 'custom' ? 'active' : ''}`}
          title="Custom color"
          onClick={handleCustomClick}
        >
          {value === 'custom' ? (
            <span className="swatch-custom-preview" style={{ background: customColor }} />
          ) : (
            <PipetteIcon size={14} strokeWidth={2.5} />
          )}
        </button>
      </div>
      {value === 'custom' && open && (
        <div
          style={{ background: '#1d1d23', padding: 8, borderRadius: 6, border: '1px solid var(--border)' }}
          onPointerDown={beginHistoryGroup}
          onPointerUp={endHistoryGroup}
          onPointerCancel={endHistoryGroup}
        >
          <HexColorPicker color={customColor} onChange={onCustomColor} />
        </div>
      )}
    </div>
  )
}

export function WallColorPicker({
  color,
  onChange,
}: {
  color: string
  onChange: (color: string) => void
}) {
  const [customOpen, setCustomOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const beginHistoryGroup = useStore((s) => s.beginHistoryGroup)
  const endHistoryGroup = useStore((s) => s.endHistoryGroup)
  const presets = WALL_COLORS

  useEffect(() => {
    if (!customOpen) return
    const onPointerDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setCustomOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [customOpen])

  const isCustom = !presets.some((p) => p.hex === color)

  return (
    <div className="col" style={{ gap: 6 }} ref={wrapRef}>
      <div className="wall-color-preview" style={{ background: color }}>
        <span className="wall-color-hex">{color}</span>
      </div>
      <div className="swatches">
        {presets.map((p) => (
          <button
            key={p.key}
            className={`swatch ${color === p.hex ? 'active' : ''}`}
            style={{ background: p.hex }}
            title={p.label}
            onClick={() => { onChange(p.hex); setCustomOpen(false) }}
          />
        ))}
        <button
          className={`swatch swatch-custom ${isCustom ? 'active' : ''}`}
          title="Custom color"
          onClick={() => { setCustomOpen((o) => !o) }}
        >
          {isCustom ? (
            <span className="swatch-custom-preview" style={{ background: color }} />
          ) : (
            <PipetteIcon size={14} strokeWidth={2.5} />
          )}
        </button>
      </div>
      {customOpen && (
        <div
          style={{ background: '#1d1d23', padding: 8, borderRadius: 6, border: '1px solid var(--border)' }}
          onPointerDown={beginHistoryGroup}
          onPointerUp={endHistoryGroup}
          onPointerCancel={endHistoryGroup}
        >
          <HexColorPicker color={color} onChange={onChange} />
        </div>
      )}
    </div>
  )
}

export function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <label className={`toggle ${on ? 'on' : ''}`}>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" />
      <span>{label}</span>
    </label>
  )
}

export function Segmented({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string; disabled?: boolean }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button
          key={o.key}
          className={value === o.key ? 'active' : ''}
          disabled={o.disabled}
          onClick={() => onChange(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** A controlled number input that lets the user type freely and commits on blur/Enter. */
export function CommitNumberField({
  label,
  value,
  onCommit,
  min,
  max,
  step = 1,
  disabled,
  suffix,
}: {
  label: string
  value: number
  onCommit: (v: number) => void
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  suffix?: string
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const display = editing ? text : String(Math.round(value * 100) / 100)
  const beginEdit = () => {
    setEditing(true)
    setText(String(Math.round(value * 100) / 100))
  }
  const commit = () => {
    setEditing(false)
    const v = Number(text)
    if (Number.isFinite(v)) {
      let out = v
      if (min !== undefined) out = Math.max(min, out)
      if (max !== undefined) out = Math.min(max, out)
      onCommit(out)
    }
  }
  return (
    <label className="field">
      <span>{label}{suffix ? ` (${suffix})` : ''}</span>
      <input
        type="text"
        inputMode="decimal"
        step={step}
        value={display}
        disabled={disabled}
        onFocus={beginEdit}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      />
    </label>
  )
}
