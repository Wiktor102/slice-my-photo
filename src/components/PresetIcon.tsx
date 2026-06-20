import type { PresetDef } from '../lib/presets'

export function PresetIcon({ preset, size = 36 }: { preset: PresetDef; size?: number }) {
  const pad = 2
  const inner = size - pad * 2
  const cellW = inner / preset.cols
  const cellH = inner / preset.rows
  const gap = 1.5
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`translate(${pad},${pad})`}>
        {preset.cells.map((c, i) => {
          const x = c.col * cellW + gap / 2
          const y = c.row * cellH + gap / 2
          const w = c.colSpan * cellW - gap
          const h = c.rowSpan * cellH - gap
          return <rect key={i} x={x} y={y} width={w} height={h} rx={1.5} fill="none" stroke="currentColor" strokeWidth={1.4} />
        })}
      </g>
    </svg>
  )
}
