import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Navbar from '@/components/Navbar'
import LandingPage from '@/components/LandingPage'
import GeospatialPage from '@/components/GeospatialPage'
import { createInitialMapState, type MapState } from '@/types/mapState'
import type { SavedViewRecord } from '@/utils/savedViews'
import {
  createSavedViewRecord,
  duplicateSavedViewRecord,
  importSavedViewRecord,
  loadSavedViews,
  persistSavedViews,
  renameSavedViewRecord,
  restoreMapStateFromSavedView,
} from '@/utils/savedViews'
import { decodeShareableStateFromSearch, encodeShareableStateToSearch } from '@/utils/shareableState'
import useInteractionLogger from '@/hooks/useInteractionLogger'

type ThemeMode = 'dark' | 'light'

const camerasMatch = (left: MapState['camera'] | null | undefined, right: MapState['camera'] | null | undefined) => {
  if (!left || !right) return false
  return left.zoom === right.zoom && left.center[0] === right.center[0] && left.center[1] === right.center[1]
}

const stateWithCamera = (state: MapState | null, camera: MapState['camera'], word: string, language: string) => {
  const base = state ?? createInitialMapState(word, language)
  if (camerasMatch(base.camera, camera)) return base

  return {
    ...base,
    camera: {
      center: [camera.center[0], camera.center[1]] as [number, number],
      zoom: camera.zoom,
    },
    currentWord: {
      ...base.currentWord,
      word,
      language,
      key: `${word}::${language}`,
    },
  }
}

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
  const [savedViews, setSavedViews] = useState<SavedViewRecord[]>(() => loadSavedViews())
  const [geospatialGuideOpenHandler, setGeospatialGuideOpenHandler] = useState<(() => void) | null>(null)
  const [leftControlsOpenHandler, setLeftControlsOpenHandler] = useState<(() => void) | null>(null)
  const [rightControlsOpenHandler, setRightControlsOpenHandler] = useState<(() => void) | null>(null)
  const [compareLeftMapState, setCompareLeftMapState] = useState<MapState | null>(initialShareableState.mapState)
  const [compareRightMapState, setCompareRightMapState] = useState<MapState | null>(null)
  const [compareViewportSync, setCompareViewportSync] = useState(true)
  const [compareDifferenceView, setCompareDifferenceView] = useState(true)
  const activeWordKey = `${word1}::${language1}`
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (initialShareableState.theme) return initialShareableState.theme
    if (typeof window === 'undefined') return 'dark'
    const storedTheme = window.localStorage.getItem('wiktionaryviz-theme')
    return storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : 'dark'
  })
  useInteractionLogger({
    section: visibleSection,
    word: word1,
    language: language1,
    compareWord: word2 || undefined,
    compareLanguage: language2 || undefined,
  })
  const handleMapStateChange = useCallback((state: MapState) => {
    setShareableMapState(state)
    setMapStateReady(true)
  }, [])

  const handleCompareMapStateChange = useCallback((side: 'left' | 'right', state: MapState) => {
    if (side === 'left') {
      setCompareLeftMapState(state)
      setShareableMapState(state)
      setMapStateReady(true)

      if (compareViewportSync && word2.trim()) {
        setCompareRightMapState(current => stateWithCamera(current, state.camera, word2, language2))
      }
      return
    }

    setCompareRightMapState(state)

    if (compareViewportSync) {
      setCompareLeftMapState(current => stateWithCamera(current, state.camera, word1, language1))
    }
  }, [compareViewportSync, language1, language2, word1, word2])

  const clearAnnotationState = useCallback((state: MapState | null, nextWord: string, nextLanguage: string): MapState | null => {
    if (!state) return null

    return {
      ...state,
      selectedItem: { kind: 'none' },
      currentWord: {
        word: nextWord,
        language: nextLanguage,
        key: `${nextWord}::${nextLanguage}`,
      },
      filters: {
        ...state.filters,
        currentIndex: undefined,
        isPlaying: false,
        showAllPopups: false,
        guideOpen: false,
        guideLayer: null,
        etymologyRequested: false,
        annotationMode: false,
        annotationTool: 'note',
      },
      annotations: [],
    }
  }, [])

  const activeWordKeyRef = useRef(activeWordKey)

  const mapStateForCurrentWord = useMemo(() => {
    if (!shareableMapState) return null
    if (shareableMapState.currentWord.key === activeWordKey) return shareableMapState
    return clearAnnotationState(shareableMapState, word1, language1)
  }, [activeWordKey, clearAnnotationState, language1, shareableMapState, word1])

  useEffect(() => {
    if (activeWordKeyRef.current === activeWordKey) return
    activeWordKeyRef.current = activeWordKey

    setShareableMapState(current => clearAnnotationState(current, word1, language1))
  }, [activeWordKey, clearAnnotationState, language1, word1])

  useEffect(() => {
    persistSavedViews(savedViews)
  }, [savedViews])

  const handleSaveCurrentView = useCallback((name: string) => {
    if (!mapStateForCurrentWord) return

    const nextRecord = createSavedViewRecord(name, mapStateForCurrentWord)
    setSavedViews(current => [nextRecord, ...current])
  }, [mapStateForCurrentWord])

  const handleLoadSavedView = useCallback((viewId: string) => {
    const target = savedViews.find(record => record.id === viewId)
    if (!target) return

    const restored = restoreMapStateFromSavedView(
      target,
      target.state.mapState.currentWord.word,
      target.state.mapState.currentWord.language,
    )

    setWord1(restored.currentWord.word)
    setLanguage1(restored.currentWord.language)
    setWord2('')
    setLanguage2('')
    setVisibleSection('geospatial')
    setShareableMapState(restored)
    setMapStateReady(true)
  }, [savedViews])

  const handleRenameSavedView = useCallback((viewId: string, name: string) => {
    setSavedViews(current => current.map(record => (record.id === viewId ? renameSavedViewRecord(record, name) : record)))
  }, [])

  const handleDuplicateSavedView = useCallback((viewId: string) => {
    setSavedViews(current => {
      const target = current.find(record => record.id === viewId)
      if (!target) return current
      return [duplicateSavedViewRecord(target), ...current]
    })
  }, [])

  const handleDeleteSavedView = useCallback((viewId: string) => {
    setSavedViews(current => current.filter(record => record.id !== viewId))
  }, [])

  const handleMoveSavedView = useCallback((viewId: string, direction: 'up' | 'down') => {
    setSavedViews(current => {
      const index = current.findIndex(record => record.id === viewId)
      if (index < 0) return current

      const targetIndex = direction === 'up' ? index - 1 : index + 1
      if (targetIndex < 0 || targetIndex >= current.length) return current

      const next = [...current]
      const [item] = next.splice(index, 1)
      next.splice(targetIndex, 0, item)
      return next
    })
  }, [])

  const handleImportSavedView = useCallback((rawJson: string) => {
    const imported = importSavedViewRecord(rawJson)
    if (!imported) return false

    setSavedViews(current => {
      const next = current.filter(record => record.id !== imported.id)
      return [imported, ...next]
    })

    return true
  }, [])

  const handleExportCurrentView = useCallback(() => {
    if (typeof window === 'undefined' || !mapStateForCurrentWord) return

    const exportRecord = createSavedViewRecord(`${mapStateForCurrentWord.currentWord.word || 'Current'} view`, mapStateForCurrentWord)
    const blob = new Blob([JSON.stringify(exportRecord, null, 2)], { type: 'application/json' })
    const url = window.URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${exportRecord.name.replace(/\s+/g, '-').toLowerCase()}.json`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.URL.revokeObjectURL(url)
  }, [mapStateForCurrentWord])

  const handleExploreCompare = useCallback((leftWord: string, leftLanguage: string, rightWord: string, rightLanguage: string) => {
    setWord1(leftWord)
    setLanguage1(leftLanguage)
    setWord2(rightWord)
    setLanguage2(rightLanguage)
    setVisibleSection('geospatial')
    setShareableMapState(current => clearAnnotationState(current, leftWord, leftLanguage))
    setCompareLeftMapState(current => clearAnnotationState(current, leftWord, leftLanguage) ?? createInitialMapState(leftWord, leftLanguage))
    setCompareRightMapState(current => clearAnnotationState(current, rightWord, rightLanguage) ?? createInitialMapState(rightWord, rightLanguage))
  }, [])

  const handlePivotPrimaryWord = useCallback((nextWord: string, nextLanguage: string) => {
    setWord1(nextWord)
    setLanguage1(nextLanguage)
    setWord2('')
    setLanguage2('')
    setVisibleSection('geospatial')
    setShareableMapState(current => clearAnnotationState(current, nextWord, nextLanguage))
    setCompareLeftMapState(current => clearAnnotationState(current, nextWord, nextLanguage) ?? createInitialMapState(nextWord, nextLanguage))
    setCompareRightMapState(null)
  }, [])

  const handlePivotCompareWord = useCallback((side: 'left' | 'right', nextWord: string, nextLanguage: string) => {
    if (side === 'left') {
      setWord1(nextWord)
      setLanguage1(nextLanguage)
      setCompareLeftMapState(current => clearAnnotationState(current, nextWord, nextLanguage) ?? createInitialMapState(nextWord, nextLanguage))
    } else {
      setWord2(nextWord)
      setLanguage2(nextLanguage)
      setCompareRightMapState(current => clearAnnotationState(current, nextWord, nextLanguage) ?? createInitialMapState(nextWord, nextLanguage))
    }
    setVisibleSection('geospatial')
    setShareableMapState(current => clearAnnotationState(current, nextWord, nextLanguage))
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
      mapState: visibleSection === 'geospatial' ? mapStateForCurrentWord : null,
    })

    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
    window.history.replaceState(null, '', nextUrl)
  }, [inspireCategory, language1, language2, mapStateForCurrentWord, mapStateReady, theme, visibleSection, word1, word2])

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
  const compareViewLayoutClasses = 'grid min-h-0 flex-1 gap-4 lg:grid-cols-2'
  const compareLeftState = compareLeftMapState ?? mapStateForCurrentWord ?? createInitialMapState(word1, language1)
  const compareRightState = compareRightMapState ?? (compareViewActive ? createInitialMapState(word2, language2) : null)
  const handleSwapCompareWords = useCallback(() => {
    if (!compareRightState) return

    const nextLeftWord = word2
    const nextLeftLanguage = language2
    const nextRightWord = word1
    const nextRightLanguage = language1
    const nextLeftState = compareRightState
    const nextRightState = compareLeftState

    setWord1(nextLeftWord)
    setLanguage1(nextLeftLanguage)
    setWord2(nextRightWord)
    setLanguage2(nextRightLanguage)
    setCompareLeftMapState(nextLeftState)
    setCompareRightMapState(nextRightState)
    setShareableMapState(nextLeftState)
    setVisibleSection('geospatial')
  }, [compareLeftState, compareRightState, language1, language2, word1, word2])

  const compareDifference = useMemo(() => {
    if (!compareViewActive || !compareDifferenceView || !compareRightState) return null

    const compareLayers: Array<{ key: keyof MapState['activeLayers']; label: string }> = [
      { key: 'translations', label: 'Translations' },
      { key: 'protoZones', label: 'Proto regions' },
      { key: 'languageFamilies', label: 'Language families' },
      { key: 'etymology', label: 'Etymology' },
      { key: 'descendants', label: 'Descendants' },
      { key: 'annotations', label: 'Annotations' },
    ]

    const leftOnlyLayers = compareLayers.filter(({ key }) => Boolean(compareLeftState.activeLayers[key]) && !Boolean(compareRightState.activeLayers[key])).map(({ label }) => label)
    const rightOnlyLayers = compareLayers.filter(({ key }) => Boolean(compareRightState.activeLayers[key]) && !Boolean(compareLeftState.activeLayers[key])).map(({ label }) => label)
    const sharedLayers = compareLayers.filter(({ key }) => Boolean(compareLeftState.activeLayers[key]) && Boolean(compareRightState.activeLayers[key])).map(({ label }) => label)

    return {
      leftOnlyLayers,
      rightOnlyLayers,
      sharedLayers,
      cameraChanged: !camerasMatch(compareLeftState.camera, compareRightState.camera),
      selectionChanged: JSON.stringify(compareLeftState.selectedItem) !== JSON.stringify(compareRightState.selectedItem),
      annotationDelta: compareLeftState.annotations.length - compareRightState.annotations.length,
      wordChanged: compareLeftState.currentWord.word !== compareRightState.currentWord.word || compareLeftState.currentWord.language !== compareRightState.currentWord.language,
    }
  }, [compareDifferenceView, compareLeftState, compareRightState, compareViewActive])

  const renderComparePane = (
    word: string,
    language: string,
    instanceId: string,
    side: 'left' | 'right',
  ) => (
    <GeospatialPage
      key={`${word}::${language}::${instanceId}`}
      word={word}
      language={language}
      inspireCategory={inspireCategory}
      onGuideOpenRegister={side === 'left' ? setGeospatialGuideOpenHandler : undefined}
      onControlsOpenRegister={side === 'left' ? setLeftControlsOpenHandler : setRightControlsOpenHandler}
      initialMapState={side === 'left' ? compareLeftState : compareRightState ?? createInitialMapState(word, language)}
      onMapStateChange={state => handleCompareMapStateChange(side, state)}
      onPivotSearch={(nextWord, nextLanguage) => handlePivotCompareWord(side, nextWord, nextLanguage)}
      savedViews={side === 'left' ? savedViews : []}
      onSaveCurrentView={side === 'left' ? handleSaveCurrentView : undefined}
      onLoadSavedView={side === 'left' ? handleLoadSavedView : undefined}
      onRenameSavedView={side === 'left' ? handleRenameSavedView : undefined}
      onDuplicateSavedView={side === 'left' ? handleDuplicateSavedView : undefined}
      onDeleteSavedView={side === 'left' ? handleDeleteSavedView : undefined}
      onMoveSavedView={side === 'left' ? handleMoveSavedView : undefined}
      onImportSavedView={side === 'left' ? handleImportSavedView : undefined}
      onExportCurrentView={side === 'left' ? handleExportCurrentView : undefined}
      theme={theme}
      embedded
      instanceId={instanceId}
      compareMode
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
            key={`${word1}::${language1}::primary`}
            word={word1}
            language={language1}
            inspireCategory={inspireCategory}
            onGuideOpenRegister={setGeospatialGuideOpenHandler}
            initialMapState={mapStateForCurrentWord}
            onMapStateChange={handleMapStateChange}
            onPivotSearch={handlePivotPrimaryWord}
            savedViews={savedViews}
            onSaveCurrentView={handleSaveCurrentView}
            onLoadSavedView={handleLoadSavedView}
            onRenameSavedView={handleRenameSavedView}
            onDuplicateSavedView={handleDuplicateSavedView}
            onDeleteSavedView={handleDeleteSavedView}
            onMoveSavedView={handleMoveSavedView}
            onImportSavedView={handleImportSavedView}
            onExportCurrentView={handleExportCurrentView}
            theme={theme}
            instanceId="primary"
          />
        )}
        {compareViewActive && (
          <div className="flex w-full flex-1 min-h-0 flex-col gap-3 p-3 lg:p-4">
            <div className={theme === 'light' ? 'rounded-2xl border border-slate-200 bg-white/92 px-4 py-3 text-slate-700 shadow-sm backdrop-blur' : 'rounded-2xl border border-slate-800 bg-neutral-950/75 px-4 py-3 text-slate-200 shadow-sm backdrop-blur'}>
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.28em] opacity-70">Compare workspace</div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span className="font-semibold">{word1 || 'Left word'}</span>
                    <span className="opacity-60">{language1 ? `(${language1})` : '(left)'}</span>
                    <span className="opacity-40">vs</span>
                    <span className="font-semibold">{word2 || 'Right word'}</span>
                    <span className="opacity-60">{language2 ? `(${language2})` : '(right)'}</span>
                  </div>
                  {compareDifferenceView && compareDifference && (
                    <div className={theme === 'light' ? 'flex flex-wrap gap-2 text-xs text-slate-600' : 'flex flex-wrap gap-2 text-xs text-slate-300'}>
                      <span className={theme === 'light' ? 'rounded-full bg-slate-100 px-2.5 py-1' : 'rounded-full bg-slate-800 px-2.5 py-1'}>Shared {compareDifference.sharedLayers.length || 0}</span>
                      <span className={theme === 'light' ? 'rounded-full bg-slate-100 px-2.5 py-1' : 'rounded-full bg-slate-800 px-2.5 py-1'}>Left-only {compareDifference.leftOnlyLayers.length || 0}</span>
                      <span className={theme === 'light' ? 'rounded-full bg-slate-100 px-2.5 py-1' : 'rounded-full bg-slate-800 px-2.5 py-1'}>Right-only {compareDifference.rightOnlyLayers.length || 0}</span>
                      <span className={theme === 'light' ? 'rounded-full bg-slate-100 px-2.5 py-1' : 'rounded-full bg-slate-800 px-2.5 py-1'}>{compareDifference.cameraChanged ? 'Viewport changed' : 'Viewports aligned'}</span>
                    </div>
                  )}
                </div>
                <div className={theme === 'light' ? 'flex flex-wrap items-center gap-2 rounded-full border border-slate-200 bg-slate-50 p-1' : 'flex flex-wrap items-center gap-2 rounded-full border border-slate-800 bg-neutral-900 p-1'}>
                  <button type="button" onClick={handleSwapCompareWords} className={theme === 'light' ? 'rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap bg-white text-slate-700 transition hover:bg-slate-100' : 'rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap bg-neutral-800 text-slate-200 transition hover:bg-neutral-700'}>
                    Swap
                  </button>
                  <button type="button" onClick={() => leftControlsOpenHandler?.()} className={theme === 'light' ? 'rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap bg-white text-slate-700 transition hover:bg-slate-100' : 'rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap bg-neutral-800 text-slate-200 transition hover:bg-neutral-700'}>
                    Open left controls
                  </button>
                  <button type="button" onClick={() => rightControlsOpenHandler?.()} className={theme === 'light' ? 'rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap bg-white text-slate-700 transition hover:bg-slate-100' : 'rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap bg-neutral-800 text-slate-200 transition hover:bg-neutral-700'}>
                    Open right controls
                  </button>
                  <button type="button" aria-pressed={compareViewportSync} onClick={() => setCompareViewportSync(current => !current)} className={theme === 'light' ? `rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${compareViewportSync ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}` : `rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${compareViewportSync ? 'bg-slate-100 text-slate-950' : 'bg-neutral-900 text-slate-300 hover:bg-neutral-800'}`}>
                    {compareViewportSync ? 'Sync on' : 'Sync off'}
                  </button>
                  <button type="button" aria-pressed={compareDifferenceView} onClick={() => setCompareDifferenceView(current => !current)} className={theme === 'light' ? `rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${compareDifferenceView ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}` : `rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${compareDifferenceView ? 'bg-emerald-500 text-slate-950' : 'bg-neutral-900 text-slate-300 hover:bg-neutral-800'}`}>
                    {compareDifferenceView ? 'Diff on' : 'Diff off'}
                  </button>
                </div>
              </div>
            </div>
            <div className={compareViewLayoutClasses}>
              <div className={theme === 'light' ? 'flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm' : 'flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-neutral-950 shadow-sm'}>
                {renderComparePane(word1, language1, 'left', 'left')}
              </div>
              <div className={theme === 'light' ? 'flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm' : 'flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-neutral-950 shadow-sm'}>
                {renderComparePane(word2, language2, 'right', 'right')}
              </div>
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
