import { useCallback, useEffect, useState } from 'react'
import Navbar from '@/components/Navbar'
import LandingPage from '@/components/LandingPage'
import GeospatialPage from '@/components/GeospatialPage'
import type { MapState } from '@/types/mapState'
import { decodeShareableStateFromSearch, encodeShareableStateToSearch } from '@/utils/shareableState'

type ThemeMode = 'dark' | 'light'
type CompareViewMode = 'split' | 'single'

function App() {
  const initialShareableState = (() => {
    if (typeof window === 'undefined') return decodeShareableStateFromSearch('')
    return decodeShareableStateFromSearch(window.location.search)
  })()
  const [visibleSection, setVisibleSection] = useState<string>(initialShareableState.visibleSection)
  const [word1, setWord1] = useState<string>(initialShareableState.word1)
  const [word2, setWord2] = useState<string>(initialShareableState.word2)
  const [language1, setLanguage1] = useState(initialShareableState.language1)
  const [language2, setLanguage2] = useState(initialShareableState.language2)
  const [inspireCategory, setInspireCategory] = useState<string | null>(initialShareableState.inspireCategory)
  const [shareableMapState, setShareableMapState] = useState<MapState | null>(initialShareableState.mapState)
  const [mapStateReady, setMapStateReady] = useState(Boolean(initialShareableState.mapState))
  const [geospatialGuideOpenHandler, setGeospatialGuideOpenHandler] = useState<(() => void) | null>(null)
  const [compareViewMode, setCompareViewMode] = useState<CompareViewMode>('split')
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (initialShareableState.theme) return initialShareableState.theme
    if (typeof window === 'undefined') return 'dark'
    const storedTheme = window.localStorage.getItem('wiktionaryviz-theme')
    return storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : 'dark'
  })

  const handleMapStateChange = useCallback((state: MapState) => {
    setShareableMapState(state)
    setMapStateReady(true)
  }, [])

  const handleExploreCompare = useCallback((leftWord: string, leftLanguage: string, rightWord: string, rightLanguage: string) => {
    setWord1(leftWord)
    setLanguage1(leftLanguage)
    setWord2(rightWord)
    setLanguage2(rightLanguage)
    setVisibleSection('geospatial')
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return
    document.body.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    window.localStorage.setItem('wiktionaryviz-theme', theme)
  }, [theme])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (visibleSection === 'geospatial' && !mapStateReady) return

    const query = encodeShareableStateToSearch({
      visibleSection: visibleSection === 'geospatial' ? 'geospatial' : 'landing-page',
      word1,
      word2,
      language1,
      language2,
      inspireCategory,
      theme,
      mapState: visibleSection === 'geospatial' ? shareableMapState : null,
    })

    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
    window.history.replaceState(null, '', nextUrl)
  }, [inspireCategory, language1, language2, mapStateReady, shareableMapState, theme, visibleSection, word1, word2])

  // TODO [HIGH LEVEL]: Support shareable, state-preserving URLs that encode current view, filters, words, languages, and selections.
  // Rationale: Participants 4, 6 asked for reproducibility and easy sharing. Enable deep-linking to exact visualization states.
  // TODO [LOW LEVEL]: Add a useEffect to sync visibleSection, word1/word2, language1/language2 to URL query params and a parser on mount.

  // TODO [HIGH LEVEL]: Add "Mode" switch (Simple/Public vs Expert) to adjust UI complexity and controls density.
  // Rationale: Participants 5, 7 emphasized accessibility with depth-on-demand.
  // TODO [LOW LEVEL]: Add a mode state and pass as prop to pages to conditionally render advanced filters and panels.

  // TODO [HIGH LEVEL]: Add global presets/examples launcher and recent sessions (bookmarks) for onboarding and quick starts.
  // Rationale: Participant 6 requested presets and saved configurations.
  // TODO [LOW LEVEL]: Implement a lightweight preset registry and a bookmarks context with localStorage persistence.

  const compareViewActive = visibleSection === 'geospatial' && word2.trim().length > 0
  const compareViewLayoutClasses = compareViewMode === 'single'
    ? 'flex min-h-0 flex-1 flex-col gap-4'
    : 'grid min-h-0 flex-1 gap-4 lg:grid-cols-2'

  const renderComparePane = (word: string, language: string, instanceId: string, interactive: boolean) => (
    <GeospatialPage
      word={word}
      language={language}
      inspireCategory={inspireCategory}
      onGuideOpenRegister={interactive ? setGeospatialGuideOpenHandler : undefined}
      initialMapState={shareableMapState}
      onMapStateChange={interactive ? handleMapStateChange : undefined}
      theme={theme}
      embedded
      instanceId={instanceId}
    />
  )

  return (
    <div className={theme === 'light' ? 'flex min-h-screen flex-col bg-white text-slate-900' : 'flex min-h-screen flex-col bg-neutral-900 text-slate-100'}>
      {/* Navbar */}
      <header className={theme === 'light' ? 'fixed top-0 z-50 w-full border-b border-slate-200/80 bg-white/90 p-3 shadow-sm backdrop-blur-sm' : 'fixed top-0 z-50 w-full bg-neutral-900/95 p-3 shadow-md shadow-black/20 backdrop-blur-sm'}>
        <Navbar
          title="WiktionaryViz"
          onTitleClick={() => setVisibleSection('landing-page')}
          showBackHomeButton={visibleSection === 'geospatial'}
          onBackHomeClick={() => setVisibleSection('landing-page')}
          showGuideButton={visibleSection === 'geospatial'}
          onGuideClick={() => geospatialGuideOpenHandler?.()}
          theme={theme}
          onToggleTheme={() => setTheme(current => (current === 'dark' ? 'light' : 'dark'))}
        />
      </header>

      {/* Main content takes up remaining space */}
      <main className="flex-1 flex flex-col items-center mt-16">
        {visibleSection === 'landing-page' && (
          <LandingPage
            theme={theme}
            setVisibleSection={setVisibleSection}
            setWord1={setWord1}
            setWord2={setWord2}
            setLanguage1={setLanguage1}
            setLanguage2={setLanguage2}
            setInspireCategory={setInspireCategory}
            onExploreCompare={handleExploreCompare}
            word1={word1}
            word2={word2}
            language1={language1}
            language2={language2}
          />
        )}
        {visibleSection === 'geospatial' && !compareViewActive && (
          <GeospatialPage
            word={word1}
            language={language1}
            inspireCategory={inspireCategory}
            onGuideOpenRegister={setGeospatialGuideOpenHandler}
            initialMapState={shareableMapState}
            onMapStateChange={handleMapStateChange}
            theme={theme}
            instanceId="primary"
          />
        )}
        {compareViewActive && (
          <div className="flex w-full flex-1 min-h-0 flex-col gap-4 p-4 lg:p-6">
            <div className={theme === 'light' ? 'rounded-xl border border-slate-200 bg-white/90 px-4 py-3 text-slate-700 shadow-sm' : 'rounded-xl border border-slate-800 bg-neutral-950/70 px-4 py-3 text-slate-200 shadow-sm'}>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-[0.24em] opacity-70">Compare view</div>
                  <div className="mt-1 text-sm">
                    <span className="font-semibold">{word1 || 'Left word'}</span>
                    <span className="opacity-70"> {language1 ? `(${language1})` : ''}</span>
                    <span className="mx-2 opacity-50">vs</span>
                    <span className="font-semibold">{word2 || 'Right word'}</span>
                    <span className="opacity-70"> {language2 ? `(${language2})` : ''}</span>
                  </div>
                </div>
                <div className={theme === 'light' ? 'flex flex-wrap gap-1 rounded-full border border-slate-200 bg-slate-50 p-1' : 'flex flex-wrap gap-1 rounded-full border border-slate-800 bg-neutral-900 p-1'}>
                  <button
                    type="button"
                    onClick={() => setCompareViewMode('split')}
                    className={compareViewMode === 'split'
                      ? 'rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap bg-blue-600 text-white'
                      : theme === 'light'
                        ? 'rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-slate-600 hover:text-slate-900'
                        : 'rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-slate-300 hover:text-slate-100'}
                  >
                    Split view
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompareViewMode('single')}
                    className={compareViewMode === 'single'
                      ? 'rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap bg-blue-600 text-white'
                      : theme === 'light'
                        ? 'rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-slate-600 hover:text-slate-900'
                        : 'rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-slate-300 hover:text-slate-100'}
                  >
                    Single view
                  </button>
                </div>
              </div>
            </div>
            <div className={compareViewLayoutClasses}>
              {compareViewMode === 'split' ? (
                <>
                  <div className={theme === 'light' ? 'flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm' : 'flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-neutral-950 shadow-sm'}>
                    {renderComparePane(word1, language1, 'left', true)}
                  </div>
                  <div className={theme === 'light' ? 'flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm' : 'flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-neutral-950 shadow-sm'}>
                    {renderComparePane(word2, language2, 'right', false)}
                  </div>
                </>
              ) : (
                <>
                  <div className={theme === 'light' ? 'flex min-h-[34rem] flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm' : 'flex min-h-[34rem] flex-1 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-neutral-950 shadow-sm'}>
                    <div className={theme === 'light' ? 'border-b border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500' : 'border-b border-slate-800 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400'}>
                      Primary compare
                    </div>
                    <div className="flex min-h-0 flex-1">
                      {renderComparePane(word1, language1, 'left', true)}
                    </div>
                  </div>
                  <div className={theme === 'light' ? 'flex min-h-[34rem] flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm' : 'flex min-h-[34rem] flex-1 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-neutral-950 shadow-sm'}>
                    <div className={theme === 'light' ? 'border-b border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500' : 'border-b border-slate-800 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400'}>
                      Secondary compare
                    </div>
                    <div className="flex min-h-0 flex-1">
                      {renderComparePane(word2, language2, 'right', false)}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        {/* TODO [HIGH LEVEL]: Add a "Lecture/Presentation" mode that scripts camera pans/zooms and reveals, with narration hooks. */}
        {/* TODO [LOW LEVEL]: Provide a presentation controller component to step through saved view states across pages. */}
      </main>
    </div>
  )
}

export default App
