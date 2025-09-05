import { useEffect, useState } from 'react'
import { apiUrl } from '@/utils/apiBase'
import { useDebounce } from './useDebounce'

/**
 * Custom hook to fetch available languages for a given word.
 * @param word The word to fetch languages for.
 * @returns An object with languages, loading, and error state.
 */
export interface AvailableLanguage {
  code: string
  name: string
}

export function useAvailableLanguages(word: string) {
  const debouncedWord = useDebounce(word, 400) // 400ms debounce
  const [languages, setLanguages] = useState<AvailableLanguage[]>([])
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
      .then(data => {
        const langs = data.languages || []
        // Backward compatibility: if array of strings, map to {code,name}
        const normalized: AvailableLanguage[] = Array.isArray(langs) && typeof langs[0] === 'string'
          ? (langs as string[]).map(c => ({ code: c, name: c }))
          : (langs as Array<{code: string; name?: string}>).map(l => ({ code: l.code, name: l.name || l.code }))
        setLanguages(normalized)
      })
      .catch(() => setError('Failed to fetch languages.'))
      .finally(() => setLoading(false))
  }, [debouncedWord])

  return { languages, loading, error }
}
