interface Props {
  open: boolean
  title: string
  body: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  destructive?: boolean
}

export function ConfirmDialog({ open, title, body, confirmLabel = 'Confirm', cancelLabel = 'Cancel', onConfirm, onCancel, destructive }: Props) {
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <div className="hint" style={{ fontSize: 13 }}>{body}</div>
        <div className="modal-actions">
          <button onClick={onCancel}>{cancelLabel}</button>
          <button className={destructive ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
