import { useEffect, useState } from 'react'
import { apiUrl } from '@/utils/apiBase'
import { useDebounce } from './useDebounce'

/**
 * Custom hook to fetch available languages for a given word.
 * @param word The word to fetch languages for.
 * @returns An object with languages, loading, and error state.
 */
export function useAvailableLanguages(word: string) {
  const debouncedWord = useDebounce(word, 400) // 400ms debounce
  const [languages, setLanguages] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!debouncedWord) {
      setLanguages([])
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    fetch(apiUrl(`/available-languages?word=${encodeURIComponent(debouncedWord)}`))
      .then(res => res.json())
      .then(data => setLanguages(data.languages || []))
      .catch(() => setError('Failed to fetch languages.'))
      .finally(() => setLoading(false))
  }, [debouncedWord])

  return { languages, loading, error }
}
