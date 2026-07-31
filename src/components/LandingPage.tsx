import React, { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import WordLanguageInput from './landing/WordLanguageInput'
import { useAvailableLanguages } from '@/hooks/useAvailableLanguages'
import { useInterestingWord } from '@/hooks/useInterestingWord'

interface LandingPageProps {
  theme?: 'dark' | 'light'
  // new preferred props
  initialWord?: string
  initialLanguage?: string
  suggestedWords?: string[]
  isLoading?: boolean
  onExplore?: (word: string, language: string) => void
  onExploreCompare?: (a: string, aLang: string, b: string, bLang: string) => void
  onSelectCompareMode?: () => void
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
  setInspireCategory?: (cat: string | null) => void
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
  theme = 'dark',
  initialWord,
  initialLanguage = 'English',
  suggestedWords = ['world', 'love', 'sun', 'orange'],
  isLoading = false,
  onExplore,
  onExploreCompare,
  onSelectCompareMode,
  setVisibleSection,
  setWord1,
  setLanguage1,
  setWord2,
  setLanguage2,
  setInspireCategory,
  word1,
  word2,
  language1,
  language2,
}: LandingPageProps) {
  const [word, setWord] = useState<string>(initialWord ?? word1 ?? '')
  // prefer any legacy controlled language props when provided (fall back to initialLanguage)
  const [language, setLanguage] = useState<string>(language1 || initialLanguage)
  const [compareMode, setCompareMode] = useState(Boolean(word2?.trim() || language2?.trim()))
  const [compareWord, setCompareWord] = useState<string>(word2 ?? '')
  const [compareLanguage, setCompareLanguage] = useState<string>(language2 || language1 || initialLanguage)
  const isLight = theme === 'light'
  const wordHasWhitespace = /\s/.test(word)

  const inputRef = useRef<HTMLInputElement | null>(null)

  // explorationType and selectedVisualization may be reintroduced if we add more controls above the fold;
  // keep the minimal state needed for now.

  // hooks for available languages and interesting word suggestions
  const { languages: availableLangs, loading: langsLoading } = useAvailableLanguages(word)
  const { languages: compareAvailableLangs, loading: compareLangsLoading } = useAvailableLanguages(compareWord)
  const { loading: interestingLoading, refresh } = useInterestingWord()

  // Autofocus on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setCompareWord(word2 ?? '')
  }, [word2])

  useEffect(() => {
    setCompareLanguage(language2 || language1 || initialLanguage)
  }, [initialLanguage, language1, language2])

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

  const triggerCompareExplore = (a: string, aLang: string, b: string, bLang: string) => {
    const leftWord = a.trim()
    const rightWord = b.trim()
    if (!leftWord || !rightWord) return

    if (onExploreCompare) {
      onExploreCompare(leftWord, aLang, rightWord, bLang)
      return
    }

    setWord1?.(leftWord)
    setLanguage1?.(aLang)
    setWord2?.(rightWord)
    setLanguage2?.(bLang)
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
            // Propagate to parent controlled props so App receives the word selection.
            setWord1?.(result.word)
            if (result.lang_code) setLanguage1?.(result.lang_code)
            if (result.category) setInspireCategory?.(result.category)
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
    if (compareMode) {
      triggerCompareExplore(word, language, compareWord, compareLanguage)
      return
    }
    triggerExplore(word, language)
  }

  const toggleCompareMode = () => {
    setCompareMode(current => {
      const next = !current
      onSelectCompareMode?.()

      if (!next) {
        setCompareWord('')
        setCompareLanguage(language1 || initialLanguage)
        setWord2?.('')
        setLanguage2?.('')
      }

      return next
    })
  }

  return (
    <section className={isLight ? 'flex min-h-[calc(100vh-4rem)] items-center justify-center bg-gradient-to-b from-white via-slate-50 to-slate-100 px-4 py-12' : 'flex min-h-[calc(100vh-4rem)] items-center justify-center bg-transparent px-4 py-12'}>
      <div className="w-full max-w-2xl mx-auto text-center">
        {/* Header / identity (use div to avoid global header CSS) */}
        <div role="banner" className="mb-8">
          <h1 className={isLight ? 'text-3xl font-semibold leading-tight text-slate-900 md:text-4xl' : 'text-3xl font-semibold leading-tight text-slate-100 md:text-4xl'}>
            WiktionaryViz
          </h1>
          <p className={isLight ? 'mx-auto mt-3 max-w-xl text-base text-slate-600 md:text-lg' : 'mx-auto mt-3 max-w-xl text-base text-slate-300 md:text-lg'}>
            Explore how words evolve across time and languages.
          </p>
        </div>

        {/* Interaction zone (card) */}
        <motion.section
          aria-labelledby="search-heading"
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className={isLight ? 'rounded-2xl border border-slate-200 bg-white/95 p-6 shadow-2xl shadow-blue-100/50 backdrop-blur-sm md:p-8' : 'rounded-2xl border border-slate-800 bg-neutral-950/70 p-6 shadow-2xl shadow-black/20 backdrop-blur-sm md:p-8'}
        >
          <h2 id="search-heading" className="sr-only">
            Search a word
          </h2>

          <div className={isLight ? 'mb-4 flex items-center justify-between' : 'mb-4 flex items-center justify-between'}>
            <div className="flex items-center gap-3">
              <span className={isLight ? 'text-sm text-slate-500' : 'text-sm text-slate-300'}>Compare mode</span>

              <button
                type="button"
                role="switch"
                aria-checked={compareMode}
                aria-label="Toggle compare mode"
                onClick={toggleCompareMode}
                className={isLight ? `relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors focus:outline-none ${compareMode ? 'bg-blue-500' : 'bg-slate-200'}` : `relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors focus:outline-none ${compareMode ? 'bg-blue-500' : 'bg-slate-700'}`}
              >
                <span className="sr-only">Compare mode {compareMode ? 'enabled' : 'disabled'}</span>
                <motion.span
                  initial={{ left: compareMode ? 20 : 4 }}
                  animate={{ left: compareMode ? 20 : 4 }}
                  transition={{ type: 'spring', stiffness: 700, damping: 30 }}
                  className={isLight ? 'pointer-events-none absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md' : 'pointer-events-none absolute top-0.5 h-5 w-5 rounded-full bg-slate-100 shadow-md'}
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
                <div className={isLight ? 'flex w-full flex-col items-stretch overflow-hidden rounded-lg border border-slate-200 bg-white sm:flex-row' : 'flex w-full flex-col items-stretch overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 sm:flex-row'}>
                  <div className="min-w-0 flex-1">
                    <WordLanguageInput
                      id="landing-word-input"
                      label="Word and language"
                      word={word}
                      onWordChange={setWord}
                      inputBaseStyles={isLight ? 'w-full rounded-none bg-transparent px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none' : 'w-full rounded-none bg-transparent px-4 py-3 text-slate-100 placeholder-slate-400 focus:outline-none'}
                      placeholder="Enter a word or phrase…"
                    />
                  </div>

                  {word && word.trim().length > 0 && (
                    <div className={isLight ? 'flex w-full items-center border-t border-slate-200 bg-white px-2 py-1 sm:w-40 sm:border-l sm:border-t-0 sm:py-0 md:w-44' : 'flex w-full items-center border-t border-slate-800 bg-slate-900 px-2 py-1 sm:w-40 sm:border-l sm:border-t-0 sm:py-0 md:w-44'}>
                      {langsLoading ? (
                        <p className={isLight ? 'text-slate-500' : 'text-slate-300'}>Loading…</p>
                      ) : (
                        <select
                          className={isLight ? 'h-11 w-full min-w-0 appearance-none bg-white px-2 text-slate-900 focus:outline-none' : 'h-11 w-full min-w-0 appearance-none bg-slate-900 px-2 text-slate-100 focus:outline-none'}
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
                {wordHasWhitespace && (
                  <p
                    role="status"
                    aria-live="polite"
                    className={isLight ? 'mt-2 text-left text-sm text-amber-700' : 'mt-2 text-left text-sm text-amber-300'}
                  >
                    Warning: whitespace detected in the word input.
                  </p>
                )}
              </div>

              {compareMode && (
                <div className={isLight ? 'rounded-lg border border-dashed border-slate-200 bg-slate-50/70 p-4' : 'rounded-lg border border-dashed border-slate-700 bg-slate-900/40 p-4'}>
                  <div className="mb-2 text-left text-sm font-medium text-slate-500">
                    Compare with
                  </div>
                  <div className={isLight ? 'flex w-full flex-col items-stretch overflow-hidden rounded-lg border border-slate-200 bg-white sm:flex-row' : 'flex w-full flex-col items-stretch overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 sm:flex-row'}>
                    <div className="min-w-0 flex-1">
                      <WordLanguageInput
                        id="landing-compare-word-input"
                        label="Compare word and language"
                        word={compareWord}
                        onWordChange={setCompareWord}
                        inputBaseStyles={isLight ? 'w-full rounded-none bg-transparent px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none' : 'w-full rounded-none bg-transparent px-4 py-3 text-slate-100 placeholder-slate-400 focus:outline-none'}
                        placeholder="Enter a second word or phrase…"
                      />
                    </div>

                    {compareWord && compareWord.trim().length > 0 && (
                      <div className={isLight ? 'flex w-full items-center border-t border-slate-200 bg-white px-2 py-1 sm:w-40 sm:border-l sm:border-t-0 sm:py-0 md:w-44' : 'flex w-full items-center border-t border-slate-800 bg-slate-900 px-2 py-1 sm:w-40 sm:border-l sm:border-t-0 sm:py-0 md:w-44'}>
                        {compareLangsLoading ? (
                          <p className={isLight ? 'text-slate-500' : 'text-slate-300'}>Loading…</p>
                        ) : (
                          <select
                            className={isLight ? 'h-11 w-full min-w-0 appearance-none bg-white px-2 text-slate-900 focus:outline-none' : 'h-11 w-full min-w-0 appearance-none bg-slate-900 px-2 text-slate-100 focus:outline-none'}
                            value={compareLanguage}
                            onChange={e => setCompareLanguage(e.target.value)}
                            aria-label="Compare language"
                            disabled={isLoading}
                          >
                            <option value="">Select a language</option>
                            {compareAvailableLangs.map(l => {
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
              )}

              {/* Submit button below inputs */}
              <div className="flex items-end">
                <button
                  type="submit"
                  className={`w-full inline-flex items-center justify-center rounded-lg px-4 py-3 font-semibold transition-transform focus:outline-none focus:ring-2 ${isLight ? 'focus:ring-blue-400' : 'focus:ring-slate-500'}
                    ${isLoading || (compareMode && !compareWord.trim()) ? (isLight ? 'bg-blue-200 text-slate-600 cursor-not-allowed opacity-90' : 'bg-slate-600 text-slate-100 cursor-not-allowed opacity-90') : (isLight ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-slate-700 text-slate-100 hover:bg-slate-600')}`}
                  disabled={isLoading || (compareMode && !compareWord.trim())}
                  aria-disabled={isLoading || (compareMode && !compareWord.trim())}
                >
                  {isLoading ? (
                    <>
                      <svg
                        className={isLight ? 'animate-spin -ml-1 mr-3 h-5 w-5 text-white' : 'animate-spin -ml-1 mr-3 h-5 w-5 text-slate-100'}
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
                      {compareMode ? 'Comparing…' : 'Exploring…'}
                    </>
                  ) : (
                    compareMode ? 'Compare' : 'Explore'
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
              className={isLight ? 'rounded-md bg-white px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-400' : 'rounded-md bg-slate-700 px-3 py-1.5 text-sm font-medium text-slate-100 hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-500'}
              disabled={isLoading || interestingLoading}
            >
              Inspire me
            </button>
            {inspireLabel ? (
              <span className={isLight ? 'text-sm text-slate-600' : 'text-sm text-slate-300'}>
                {inspireWord} — {inspireLabel}
              </span>
            ) : (
              <span className={isLight ? 'text-sm text-slate-500' : 'text-sm text-slate-400'}>Get a random interesting word</span>
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
