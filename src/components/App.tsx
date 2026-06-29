import { useEffect, useState } from 'react'
import Navbar from '@/components/Navbar'
import LandingPage from '@/components/LandingPage'
import GeospatialPage from '@/components/GeospatialPage'

type ThemeMode = 'dark' | 'light'

function App() {
  const [visibleSection, setVisibleSection] = useState<string>('landing-page')
  const [word1, setWord1] = useState<string>('')
  const [word2, setWord2] = useState<string>('')
  const [language1, setLanguage1] = useState('')
  const [language2, setLanguage2] = useState('')
  const [inspireCategory, setInspireCategory] = useState<string | null>(null)
  const [geospatialGuideOpenHandler, setGeospatialGuideOpenHandler] = useState<(() => void) | null>(null)
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'dark'
    const storedTheme = window.localStorage.getItem('wiktionaryviz-theme')
    return storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : 'dark'
  })

  useEffect(() => {
    if (typeof document === 'undefined') return
    document.body.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    window.localStorage.setItem('wiktionaryviz-theme', theme)
  }, [theme])

  // TODO [HIGH LEVEL]: Support shareable, state-preserving URLs that encode current view, filters, words, languages, and selections.
  // Rationale: Participants 4, 6 asked for reproducibility and easy sharing. Enable deep-linking to exact visualization states.
  // TODO [LOW LEVEL]: Add a useEffect to sync visibleSection, word1/word2, language1/language2 to URL query params and a parser on mount.

  // TODO [HIGH LEVEL]: Add "Mode" switch (Simple/Public vs Expert) to adjust UI complexity and controls density.
  // Rationale: Participants 5, 7 emphasized accessibility with depth-on-demand.
  // TODO [LOW LEVEL]: Add a mode state and pass as prop to pages to conditionally render advanced filters and panels.

  // TODO [HIGH LEVEL]: Add global presets/examples launcher and recent sessions (bookmarks) for onboarding and quick starts.
  // Rationale: Participant 6 requested presets and saved configurations.
  // TODO [LOW LEVEL]: Implement a lightweight preset registry and a bookmarks context with localStorage persistence.

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
            word1={word1}
            word2={word2}
            language1={language1}
            language2={language2}
          />
        )}
        {visibleSection === 'geospatial' && (
          <GeospatialPage
            word={word1}
            language={language1}
            inspireCategory={inspireCategory}
            onGuideOpenRegister={setGeospatialGuideOpenHandler}
            theme={theme}
          />
        )}
        {/* TODO [HIGH LEVEL]: Add a "Lecture/Presentation" mode that scripts camera pans/zooms and reveals, with narration hooks. */}
        {/* TODO [LOW LEVEL]: Provide a presentation controller component to step through saved view states across pages. */}
      </main>
    </div>
  )
}

export default App
