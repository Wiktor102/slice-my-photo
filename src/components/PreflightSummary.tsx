import { useMemo, useState } from 'react'
import { ChevronDownIcon } from 'lucide-react'
import { computePreflight } from '../lib/preflight'
import { useImagePlacement, useStore } from '../store/useStore'
import { useDebouncedValue } from '../lib/useDebouncedValue'
import type { PreflightStatus } from '../lib/preflight'

const SETTLE_MS = 250

const STATUS_LABEL: Record<PreflightStatus, string> = {
  good: 'Ready',
  warning: 'Review',
  error: 'Fix needed',
}

function statusIcon(status: PreflightStatus): string {
  if (status === 'good') return '✓'
  if (status === 'warning') return '!'
  return '×'
}

function formatDpi(dpi: number): string {
  return dpi > 0 ? `${Math.round(dpi)} DPI` : 'No image coverage'
}

function formatEdges(edges: string[]): string {
  return edges.join(', ')
}

export function PreflightSummary() {
  const sourceImage = useStore((s) => s.sourceImage)
  const panels = useStore((s) => s.panels)
  const frame = useStore((s) => s.frame)
  const perPanelFrame = useStore((s) => s.perPanelFrame)
  const wall = useStore((s) => s.wall)
  const unit = useStore((s) => s.unit)
  const { scale, panX, panY } = useImagePlacement()

  const inputs = useMemo(() => ({
    panels,
    frame,
    perPanelFrame,
    wall,
    unit,
    sourceImage,
    placement: { scale, panX, panY },
  }), [panels, frame, perPanelFrame, wall, unit, sourceImage, scale, panX, panY])

  // Recompute only once layout changes settle, so dragging panels or the
  // image doesn't re-run the analysis (and flicker) on every frame.
  const settled = useDebouncedValue(inputs, SETTLE_MS)
  const settling = settled !== inputs

  const report = useMemo(() => {
    if (!settled.sourceImage || settled.panels.length === 0) return null
    return computePreflight({ ...settled, sourceImage: settled.sourceImage })
  }, [settled])

  // Keep the details collapsed until the user asks to see them.
  const [open, setOpen] = useState(false)

  if (!sourceImage) {
    return (
      <section className="card preflight-card" aria-labelledby="preflight-title">
        <div className="section-title" id="preflight-title">Print preflight</div>
        <div className="hint">Upload an image to check print quality.</div>
      </section>
    )
  }

  if (!report || report.panels.length === 0) {
    return (
      <section className="card preflight-card" aria-labelledby="preflight-title">
        <div className="section-title" id="preflight-title">Print preflight</div>
        <div className="hint">Add a panel to check print quality.</div>
      </section>
    )
  }

  const overallStatus: PreflightStatus = report.errorCount > 0
    ? 'error'
    : report.warningCount > 0
      ? 'warning'
      : 'good'
  const overallLabel = overallStatus === 'good'
    ? 'Ready to print'
    : overallStatus === 'warning'
      ? 'Review before export'
      : 'Fix issues before export'
  // Lead with what needs attention; only celebrate when everything passes.
  const goodCount = report.panels.length - report.warningCount - report.errorCount
  const counts = settling
    ? <span className="preflight-count-pending">updating…</span>
    : overallStatus === 'good'
      ? <span className="preflight-count-good">All {goodCount} OK</span>
      : <>
          {report.errorCount > 0 && (
            <span className="preflight-count-error">{report.errorCount} issue{report.errorCount === 1 ? '' : 's'}</span>
          )}
          {report.warningCount > 0 && (
            <span className="preflight-count-warning">{report.warningCount} to review</span>
          )}
        </>

  return (
    <section
      className={`card preflight-card preflight-${overallStatus}${settling ? ' preflight-settling' : ''}`}
      aria-labelledby="preflight-title"
    >
      <button
        type="button"
        className="preflight-heading"
        aria-expanded={open}
        aria-controls="preflight-body"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`preflight-badge preflight-badge-${overallStatus}`} aria-hidden="true">{statusIcon(overallStatus)}</span>
        <div className="preflight-heading-copy">
          <div className="section-title" id="preflight-title">Print preflight</div>
          <strong>{overallLabel}</strong>
        </div>
        <span className="preflight-counts">
          {counts}
        </span>
        <ChevronDownIcon size={14} className="preflight-chevron" aria-hidden="true" />
      </button>

      {open && (
        <div id="preflight-body" className="preflight-body">
          <div className="preflight-legend">300+ DPI good · 150–299 review · under 150 low</div>

          <div className="preflight-panels">
            {report.panels.map((panel) => {
              const issueLines: string[] = []
              if (panel.coverage.coverageRatio < 1) {
                issueLines.push(panel.coverage.coveredRect
                  ? `Image gap: ${formatEdges(panel.coverage.missingEdges)}`
                  : 'Image does not cover this crop')
              }
              if (panel.overlaps.length > 0) {
                issueLines.push(`Overlaps panel${panel.overlaps.length === 1 ? '' : 's'} ${panel.overlaps.map((index) => index + 1).join(', ')}`)
              }
              if (panel.outsideWall.length > 0) issueLines.push(`Outside wall: ${formatEdges(panel.outsideWall)}`)

              return (
                <div className={`preflight-panel preflight-panel-${panel.status}`} key={panel.panelId}>
                  <div className="preflight-panel-row">
                    <span className={`preflight-dot preflight-dot-${panel.status}`} aria-label={STATUS_LABEL[panel.status]}>{statusIcon(panel.status)}</span>
                    <span className="preflight-panel-name">Panel {panel.index + 1}</span>
                    <span className={`preflight-panel-dpi preflight-dpi-${panel.dpiBand}`}>{formatDpi(panel.dpi)}</span>
                    <span className="preflight-panel-coverage">{Math.round(panel.coverage.coverageRatio * 100)}%</span>
                  </div>
                  {issueLines.length > 0 && (
                    <div className="preflight-issues">
                      {issueLines.map((line) => <div key={line}>{line}</div>)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
