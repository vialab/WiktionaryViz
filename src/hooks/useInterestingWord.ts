import { useCallback, useEffect, useState } from 'react'
import { apiUrl } from '@/utils/apiBase'

export interface InterestingWord {
  word: string
  reason: string
  lang_code?: string
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
      if (data?.entry?.word && data?.entry?.lang_code) {
        const catRaw = data.category || 'unknown'
        const obj = {
          word: data.entry.word,
          reason:
            data.entry.reason || `Highlighted in ${catRaw.replace(/_/g, ' ')} category`,
          lang_code: data.entry.lang_code,
        }
        setInterestingWord(obj)
        setCategory(catRaw.replace(/_/g, ' '))
        return { ...obj, category: catRaw }
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
