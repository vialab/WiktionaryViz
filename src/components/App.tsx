import { useState } from 'react'
import Navbar from '@/components/Navbar'
import LandingPage from '@/components/LandingPage'
import GeospatialPage from '@/components/GeospatialPage'
import NetworkPage from '@/components/NetworkPage'
import TimelinePage from '@/components/TimelinePage'

function App() {
  const [visibleSection, setVisibleSection] = useState<string>('landing-page')
  const [word1, setWord1] = useState<string>('')
  const [word2, setWord2] = useState<string>('')
  const [language1, setLanguage1] = useState('')
  const [language2, setLanguage2] = useState('')

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
    <div className="flex flex-col min-h-screen bg-[#1F1F1FFF] text-[#F5F5F5]">
      {/* Navbar */}
      <header className="bg-[#1C1C1E] shadow-md p-3 z-50 fixed top-0 w-full">
        <Navbar title="WiktionaryViz" onTitleClick={() => setVisibleSection('landing-page')} />
      </header>

      {/* Main content takes up remaining space */}
      <main className="flex-1 flex flex-col items-center mt-16">
        {visibleSection === 'landing-page' && (
          <LandingPage
            setVisibleSection={setVisibleSection}
            setWord1={setWord1}
            setWord2={setWord2}
            setLanguage1={setLanguage1}
            setLanguage2={setLanguage2}
            word1={word1}
            word2={word2}
            language1={language1}
            language2={language2}
          />
        )}
        {visibleSection === 'geospatial' && <GeospatialPage word={word1} language={language1} />}
        {visibleSection === 'network' && (
          <NetworkPage word1={word1} word2={word2} language1={language1} language2={language2} />
        )}
        {visibleSection === 'timeline' && <TimelinePage word={word1} language={language1} />}

        {/* TODO [HIGH LEVEL]: Add a "Lecture/Presentation" mode that scripts camera pans/zooms and reveals, with narration hooks. */}
        {/* TODO [LOW LEVEL]: Provide a presentation controller component to step through saved view states across pages. */}
      </main>
    </div>
  )
}

export default App
