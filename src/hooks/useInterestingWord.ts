import { useCallback, useEffect, useState } from 'react'
import { apiUrl } from '@/utils/apiBase'

export interface InterestingWord {
  word: string
  reason: string
  lang_code?: string
  lang_name?: string
  gloss?: string
}

/**
 * Custom hook to fetch a random interesting word from the backend.
 * @returns The interesting word, its category, loading state, and a refresh function.
 */
export function useInterestingWord() {
  const [interestingWord, setInterestingWord] = useState<InterestingWord | null>(null)
  const [category, setCategory] = useState<string>('')
  const [loading, setLoading] = useState(false)

  const fetchInterestingWord = useCallback(async (): Promise<(InterestingWord & { category?: string }) | null> => {
    setLoading(true)
    try {
      const res = await fetch(apiUrl('/random-interesting-word'))
      const data = await res.json()
      const payload = data?.entry && typeof data.entry === 'object' ? data.entry : data
      if (payload?.word && (payload?.lang_code || payload?.lang_name)) {
        const catRaw = data.category || 'unknown'
        const obj = {
          word: payload.word,
          reason: payload.reason || `Highlighted in ${catRaw.replace(/_/g, ' ')} category`,
          lang_code: payload.lang_code,
          lang_name: payload.lang_name || payload.lang || payload.lang_code,
          gloss: payload.gloss || undefined,
        }
        setInterestingWord(obj)
        setCategory(catRaw.replace(/_/g, ' '))
        return { ...obj, category: catRaw }
      } else if (payload?.word) {
        const obj = {
          word: payload.word,
          reason: payload.reason || 'Interesting word',
          lang_code: payload.lang_code,
          lang_name: payload.lang_name || payload.lang_code,
          gloss: payload.gloss || undefined,
        }
        setInterestingWord(obj)
        setCategory('unknown')
        return { ...obj, category: 'unknown' }
      } else {
        const obj = { word: 'example', reason: 'Could not fetch real interesting words.' }
        setInterestingWord(obj)
        setCategory('unknown')
        return { ...obj, category: 'unknown' }
      }
    } catch {
      const obj = { word: 'example', reason: 'Could not fetch real interesting words.' }
      setInterestingWord(obj)
      setCategory('unknown')
      return { ...obj, category: 'unknown' }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchInterestingWord()
  }, [fetchInterestingWord])

  return { interestingWord, category, loading, refresh: fetchInterestingWord }
}
