import React, { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import WordLanguageInput from './landing/WordLanguageInput'
import { useAvailableLanguages } from '@/hooks/useAvailableLanguages'
import { useInterestingWord } from '@/hooks/useInterestingWord'

interface LandingPageProps {
  // new preferred props
  initialWord?: string
  initialLanguage?: string
  suggestedWords?: string[]
  isLoading?: boolean
  onExplore?: (word: string, language: string) => void
  onSelectCompareMode?: () => void
  onExploreCompare?: (a: string, aLang: string, b: string, bLang: string) => void
  onBackToSearch?: () => void
  setWord2?: (word: string) => void
  setLanguage2?: (lang: string) => void
  // legacy/backwards compatible controlled second-word props (used by App.tsx)
  word2?: string
  language2?: string
  // legacy/backwards compatible controlled first-word language prop
  language1?: string

  // legacy/backwards compatible optional props (used by App.tsx)
  setVisibleSection?: (section: string) => void
  setWord1?: (word: string) => void
  setLanguage1?: (lang: string) => void
  // also accept the older controlled prop name
  word1?: string
}

/**
 * New focused landing page for WiktionaryViz.
 * - Full-screen centered layout
 * - Header, interaction card (search + language + CTA), discovery chips
 * - Accessible and keyboard-friendly
 */
export default function LandingPage({
  initialWord,
  initialLanguage = 'English',
  suggestedWords = ['world', 'love', 'sun', 'orange'],
  isLoading = false,
  onExplore,
  setVisibleSection,
  setWord1,
  setLanguage1,
  word1,
  language1,
}: LandingPageProps) {
  const [word, setWord] = useState<string>(initialWord ?? word1 ?? '')
  // prefer any legacy controlled language props when provided (fall back to initialLanguage)
  const [language, setLanguage] = useState<string>(language1 || initialLanguage)

  const inputRef = useRef<HTMLInputElement | null>(null)

  // explorationType and selectedVisualization may be reintroduced if we add more controls above the fold;
  // keep the minimal state needed for now.

  // hooks for available languages and interesting word suggestions
  const { languages: availableLangs, loading: langsLoading } = useAvailableLanguages(word)
  const { loading: interestingLoading, refresh } = useInterestingWord()

  // Autofocus on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // helper to call parent handler with backwards-compat fallback
  const triggerExplore = (w: string, lang: string) => {
    const trimmed = w.trim()
    if (!trimmed) return

    if (onExplore) {
      onExplore(trimmed, lang)
      return
    }

    // fallback behavior for existing App: set the word and language and navigate to geospatial
    setWord1?.(trimmed)
    setLanguage1?.(lang)
    setVisibleSection?.('geospatial')
  }

  // form submission handled by onSubmit; no per-input key handler needed

  // chips removed; inspiration and interesting-word hook provide suggestions

  const inspireLabels = [
    'borrowed most often',
    'oldest Indo-European root',
    'widely translated',
    'common across families',
  ]

  const [inspireWord, setInspireWord] = useState<string | null>(null)
  const [inspireLabel, setInspireLabel] = useState<string | null>(null)

  const handleInspire = async () => {
    if (interestingLoading) return
    // Ask the backend for a fresh interesting word when possible
    if (typeof refresh === 'function') {
      try {
        const result = await refresh()
        if (result?.word) {
          setInspireWord(result.word)
          setInspireLabel(result.reason || 'interesting')
          setWord(result.word)
          inputRef.current?.focus()
        }
        return
      } catch {
        // fall through to local fallback
      }
    }

    // Fallback: pick from local suggestedWords
    if (!suggestedWords || suggestedWords.length === 0) return
    const pick = suggestedWords[Math.floor(Math.random() * suggestedWords.length)]
    const lab = inspireLabels[Math.floor(Math.random() * inspireLabels.length)]
    setInspireWord(pick)
    setInspireLabel(lab)
    setWord(pick)
    inputRef.current?.focus()
  }

  // Do not auto-populate a word on startup. Only set a word when the user clicks
  // "Inspire me". The hook's `refresh` returns the fetched word so we can
  // update local state immediately after a manual refresh.

  const onSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (isLoading) return
    triggerExplore(word, language)
  }

  return (
    <section className="flex items-center justify-center bg-gradient-to-b from-neutral-950 via-slate-900 to-neutral-950 py-12 px-4 min-h-[calc(100vh-4rem)]">
      <div className="w-full max-w-2xl mx-auto text-center">
        {/* Header / identity (use div to avoid global header CSS) */}
        <div role="banner" className="mb-8">
          <h1 className="text-3xl md:text-4xl font-semibold text-slate-100 leading-tight">
            WiktionaryViz
          </h1>
          <p className="mt-3 text-slate-300 text-base md:text-lg max-w-xl mx-auto">
            Explore how words evolve across time and languages.
          </p>
        </div>

        {/* Interaction zone (card) */}
        <motion.section
          aria-labelledby="search-heading"
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="bg-neutral-950/70 backdrop-blur-sm border border-slate-800 rounded-2xl shadow-2xl shadow-black/20 p-6 md:p-8"
        >
          <h2 id="search-heading" className="sr-only">
            Search a word
          </h2>

          {/* Compare mode is intentionally disabled for now. */}
          <div className="mb-4 flex items-center justify-between opacity-40">
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-300">Compare mode</span>

              <button
                type="button"
                role="switch"
                aria-checked={false}
                aria-disabled="true"
                disabled
                className="relative inline-flex h-6 w-11 flex-shrink-0 cursor-not-allowed rounded-full bg-slate-700 transition-colors focus:outline-none"
              >
                <span className="sr-only">Compare mode disabled</span>
                <motion.span
                  initial={{ left: 4 }}
                  animate={{ left: 4 }}
                  transition={{ type: 'spring', stiffness: 700, damping: 30 }}
                  className="pointer-events-none absolute top-0.5 left-1 h-5 w-5 rounded-full bg-slate-100 shadow-md"
                />
              </button>
            </div>
          </div>
          <form onSubmit={onSubmit} className="space-y-4">
            {/* <div>
              <WordLanguageInput
                word={word}
                onWordChange={setWord}
                inputBaseStyles="w-full px-4 py-3 rounded-lg bg-neutral-800 text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-1"
                placeholder="Enter a word or phrase…"
              />
            </div> */}

            <div className="flex flex-col gap-3">
              <div>
                <label className="sr-only">Word and language</label>
                <div className="flex items-stretch w-full rounded-lg overflow-hidden border border-neutral-800 bg-neutral-900">
                  <div className="flex-1">
                    <WordLanguageInput
                      word={word}
                      onWordChange={setWord}
                      inputBaseStyles="w-full px-4 py-3 rounded-none bg-transparent text-slate-100 placeholder-slate-400 focus:outline-none"
                      placeholder="Enter a word or phrase…"
                    />
                  </div>

                  {word && word.trim().length > 0 && (
                    <div className="w-40 md:w-44 flex items-center px-2 border-l border-slate-800 bg-slate-900">
                      {langsLoading ? (
                        <p className="text-slate-300">Loading…</p>
                      ) : (
                        <select
                          className="w-full h-11 bg-slate-900 text-slate-100 px-2 focus:outline-none appearance-none"
                          value={language}
                          onChange={e => setLanguage(e.target.value)}
                          aria-label="Language"
                          disabled={isLoading}
                        >
                          <option value="">Select a language</option>
                          {availableLangs.map(l => {
                            const obj = typeof l === 'string' ? { code: l, name: l } : (l as { code: string; name: string })
                            return (
                              <option key={obj.code} value={obj.code}>
                                {obj.name}
                              </option>
                            )
                          })}
                        </select>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Submit button below inputs */}
              <div className="flex items-end">
                <button
                  type="submit"
                  className={`w-full inline-flex items-center justify-center px-4 py-3 rounded-lg font-semibold transition-transform focus:outline-none focus:ring-2 focus:ring-slate-500
                    ${isLoading ? 'bg-slate-600 text-slate-100 cursor-not-allowed opacity-90' : 'bg-slate-700 hover:bg-slate-600 text-slate-100'}`}
                  disabled={isLoading}
                  aria-disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <svg
                        className="animate-spin -ml-1 mr-3 h-5 w-5 text-slate-100"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                        ></path>
                      </svg>
                      Exploring…
                    </>
                  ) : (
                    'Explore'
                  )}
                </button>
              </div>
            </div>
          </form>
        </motion.section>

        {/* Discovery / context zone */}
        <aside className="mt-6 text-left">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={handleInspire}
              className="px-3 py-1.5 bg-slate-700 text-slate-100 rounded-md text-sm font-medium hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-500"
              disabled={isLoading || interestingLoading}
            >
              Inspire me
            </button>
            {inspireLabel ? (
              <span className="text-sm text-slate-300">
                {inspireWord} — {inspireLabel}
              </span>
            ) : (
              <span className="text-sm text-slate-400">Get a random interesting word</span>
            )}
          </div>
          {/* Intentionally omitted the "Try exploring a word from..." suggestion component.
              We keep only the Inspire me button which uses the backend hook `useInterestingWord`.
          */}
        </aside>
      </div>
    </section>
  )
}
