import { useStore } from '../store/useStore'

export function Toast() {
  const toast = useStore((s) => s.toast)
  if (!toast) return null
  return <div className="toast">{toast}</div>
}
