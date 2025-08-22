import { useRef, useEffect, useState } from 'react'

// Simple debounce utility for React hooks
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)
  const handler = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (handler.current) clearTimeout(handler.current)
    handler.current = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)
    return () => {
      if (handler.current) clearTimeout(handler.current)
    }
  }, [value, delay])

  return debouncedValue
}
