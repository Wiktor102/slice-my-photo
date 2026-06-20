import { useState } from 'react'
import { HexColorPicker } from 'react-colorful'

interface NumberFieldProps {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  suffix?: string
}

export function NumberField({ label, value, onChange, min, max, step = 1, disabled, suffix }: NumberFieldProps) {
  return (
    <label className="field">
      <span>{label}{suffix ? ` (${suffix})` : ''}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? Math.round(value * 100) / 100 : ''}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v)) onChange(v)
        }}
      />
    </label>
  )
}

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
  return (
    <div className="col" style={{ gap: 6 }}>
      <div className="swatches">
        {options.map((o) => (
          <button
            key={o.key}
            className={`swatch ${value === o.key ? 'active' : ''}`}
            style={{ background: o.hex }}
            title={o.label}
            onClick={() => onPick(o.key)}
          />
        ))}
        {value === 'custom' && (
          <button
            className={`swatch active`}
            style={{ background: customColor }}
            title="Custom"
            onClick={() => setOpen((o) => !o)}
          />
        )}
      </div>
      {value === 'custom' && open && (
        <div style={{ background: '#1d1d23', padding: 8, borderRadius: 6, border: '1px solid var(--border)' }}>
          <HexColorPicker color={customColor} onChange={onCustomColor} />
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
  options: { key: string; label: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.key} className={value === o.key ? 'active' : ''} onClick={() => onChange(o.key)}>
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
