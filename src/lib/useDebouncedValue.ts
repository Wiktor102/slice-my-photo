import { useEffect, useState } from 'react'

/**
 * Returns `value` delayed by `delayMs`. While new values keep arriving faster
 * than `delayMs` (e.g. during a drag), the previous value is kept so
 * consumers render a stable result instead of flickering every frame.
 * The returned value is reference-identical to the last settled input,
 * which lets callers detect a pending update via `debounced !== value`.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return settled
}

