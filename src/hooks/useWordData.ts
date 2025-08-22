import { useEffect, useState } from 'react'
import { apiUrl } from '@/utils/apiBase'

/**
 * Standalone async function to fetch word data.
 * Use this when you want to fetch data manually (e.g., in useEffect or events).
 */
export const fetchWordData = async (word: string, language: string) => {
  if (!word || !language) {
    throw new Error('[fetchWordData] Missing word or language.')
  }

  try {
    const response = await fetch(
      apiUrl(
        `/word-data?word=${encodeURIComponent(word)}&lang_code=${encodeURIComponent(language)}`,
      ),
    )

    if (!response.ok) {
      console.error(`[fetchWordData] Request failed: ${response.status} ${response.statusText}`)
      return null
    }

    const data = await response.json()

    if (Object.keys(data).length > 0) {
      return data
    } else {
      return null
    }
  } catch (error: unknown) {
    console.error('[fetchWordData] Error fetching data:', error)
    return null
  }
}

/**
 * React hook for fetching word data reactively.
 * This is great for components where you pass in `word` and `language` as props/state.
 */
const useWordData = (word: string, language: string) => {
  const [wordData, setWordData] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    if (!word || !language) {
      setWordData(null)
      return
    }

    const fetchWordData = async () => {
      try {
        const response = await fetch(
          apiUrl(
            `/word-data?word=${encodeURIComponent(word)}&lang_code=${encodeURIComponent(language)}`,
          ),
        )

        if (!response.ok) {
          console.error(`[useWordData] Request failed: ${response.status} ${response.statusText}`)
          setWordData(null)
          return
        }

        const data = await response.json()

        if (Object.keys(data).length > 0) {
          setWordData(data)
        } else {
          setWordData(null)
        }
      } catch (error: unknown) {
        console.error('[useWordData] Error fetching data:', error)
        setWordData(null)
      }
    }

    fetchWordData()
  }, [word, language])

  return wordData
}

// TODO [HIGH LEVEL]: Add `useKwicExamples(word, lang, decade?)` hook to surface examples in Timeline/Metadata.
// TODO [LOW LEVEL]: Implement fetch to `/kwic?word&lang&decade` with pagination and debounce.

// TODO [HIGH LEVEL]: AI-assisted filter builder `useSuggestedFilters(seedWord/lang)` for Landing/Network.
// TODO [LOW LEVEL]: Implement GET `/ai/suggest-filters?word&lang` returning filter JSON and rationale.

export default useWordData
