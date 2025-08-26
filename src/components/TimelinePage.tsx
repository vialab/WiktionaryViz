import React, { useState, useEffect, useRef } from 'react'
import { apiUrl } from '@/utils/apiBase'
import { useTimelineData, NodeData } from './timeline/useTimelineData'
import { EtymologyCarousel } from './timeline/EtymologyCarousel'
import { MetadataPanel, type PhoneticDrift } from './timeline/MetadataPanel'

interface TimelinePageProps {
  word: string
  language: string
}

const TimelinePage: React.FC<TimelinePageProps> = ({ word, language }) => {
  const { data, loading } = useTimelineData(word, language)
  const [focusIdx, setFocusIdx] = useState(0)
  const [drift, setDrift] = useState<PhoneticDrift | null>(null)
  const [legendInfoOpen, setLegendInfoOpen] = useState(false)
  const legendRef = useRef<HTMLDivElement | null>(null)

  // TODO [HIGH LEVEL]: Narrative mode for storytelling timelines with chapters, captions, and evidence callouts.
  // Rationale: Participants 1, 5, 7 emphasized story-first timelines with citations and examples.
  // TODO [LOW LEVEL]: Add a narrative script structure (array of steps) and a player UI to step through focusIdx with annotations.

  // Carousel uses ancestor-to-root order
  // Metadata panel uses reversed order to match carousel's visual order
  const reversedData = [...data].reverse()
  const currentCard = reversedData[focusIdx]
  const prevCard = focusIdx > 0 ? reversedData[focusIdx - 1] : undefined

  // Fetch phonetic drift from backend when cards change
  useEffect(() => {
    async function fetchDrift() {
      function getIPA(card: NodeData | undefined): string | undefined {
        if (!card) return undefined
        if (card.pronunciation) {
          return card.pronunciation.replace(/^\[|\]$/g, '')
        }
        return undefined
      }
      const ipa1 = getIPA(prevCard)
      const ipa2 = getIPA(currentCard)
      if (ipa1 && ipa2) {
        try {
          const res = await fetch(
            apiUrl(
              `/phonetic-drift-detailed?ipa1=${encodeURIComponent(ipa1)}&ipa2=${encodeURIComponent(ipa2)}`,
            ),
          )
          if (res.ok) {
            const driftData = (await res.json()) as PhoneticDrift
            setDrift(driftData)
          } else {
            setDrift(null)
          }
        } catch {
          setDrift(null)
        }
      } else {
        setDrift(null)
      }
    }
    fetchDrift()
  }, [prevCard, currentCard])

  // TODO [HIGH LEVEL]: Show contested/uncertain data visually (dotted lines, grayscale, alternate nodes/dates) in timeline.
  // TODO [LOW LEVEL]: Extend NodeData with uncertainty flags and render styles in TimelineChart and MetadataPanel accordingly.

  // TODO [HIGH LEVEL]: Integrate KWIC (keyword-in-context) usage examples per sense and decade.
  // TODO [LOW LEVEL]: Add a panel fetching /kwic?word=...&sense=...&decade=... and paginate examples inline.


  // Close legend info on outside click / escape (hook always declared)
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (!legendInfoOpen) return
      if (legendRef.current && !legendRef.current.contains(e.target as Node)) {
        setLegendInfoOpen(false)
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (legendInfoOpen && e.key === 'Escape') setLegendInfoOpen(false)
    }
    document.addEventListener('mousedown', handle)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handle)
      document.removeEventListener('keydown', handleKey)
    }
  }, [legendInfoOpen])

  if (loading) return <div>Loading timeline...</div>
  if (!data.length) return <div>No etymology found.</div>

  return (
    <div className="relative w-full">
      {/* Floating legend (doesn't affect main centering) */}
      <aside
        className="hidden md:flex flex-col gap-3 fixed top-28 left-8 w-[230px] z-30"
        aria-label="Phonetic data provenance legend"
      >
        <div className="text-[#B79F58] text-[0.65rem] tracking-wide uppercase font-semibold pl-1 flex items-center justify-between">
          <span>Phonetic Data Source</span>
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={legendInfoOpen}
            aria-controls="legend-info-popover"
            onClick={() => setLegendInfoOpen(o => !o)}
            className="ml-2 text-[#B79F58] hover:text-[#D4AF37] focus:outline-none focus:ring-2 focus:ring-[#D4AF37] rounded p-1"
            title="More information"
          >
            <span className="material-icons text-base">info</span>
          </button>
        </div>
        <div
          ref={legendRef}
          className="relative flex flex-col gap-3 bg-[#181818] px-4 py-4 rounded-xl border border-[#2f2f2f] shadow-inner"
        >
          <LegendSwatch color="#22c55e" label="Human IPA" description="Complete" />
          <LegendSwatch color="#f59e42" label="Hybrid" description="Phonemic + AI" />
            <LegendSwatch color="#ef4444" label="AI Inferred" description="No human IPA" />
          {legendInfoOpen && (
            <div
              id="legend-info-popover"
              role="dialog"
              aria-modal="false"
              className="absolute -right-2 top-2 translate-x-full w-80 max-w-[22rem] bg-[#1f1f1f] border border-[#3a3a3a] rounded-lg p-4 text-xs text-[#E9E3CF] shadow-xl z-40"
            >
              <div className="flex items-start justify-between mb-2">
                <h2 className="font-semibold text-[#D4AF37] tracking-wide text-sm">What these colours mean</h2>
                <button
                  onClick={() => setLegendInfoOpen(false)}
                  className="text-[#B79F58] hover:text-[#F5F5F5] focus:outline-none focus:ring-2 focus:ring-[#D4AF37] rounded p-1"
                  aria-label="Close legend info"
                >
                  <span className="material-icons text-sm">close</span>
                </button>
              </div>
              <p className="leading-relaxed mb-2">
                Source entries vary in phonetic detail. Some have a human curated phonetic (narrow) IPA, some only a
                phonemic (broad) IPA, and some lack IPA entirely. When phonetic detail is missing, an AI model estimates a
                likely phonetic realization for that historical stage using patterns learned from the language and related
                data.
              </p>
              <ul className="list-disc ml-4 space-y-1 text-[#B79F58]">
                <li><span className="text-[#22c55e] font-semibold">Human IPA</span>: Curated phonetic transcription present.</li>
                <li><span className="text-[#f59e42] font-semibold">Hybrid</span>: Human phonemic base + AI phonetic refinement.</li>
                <li><span className="text-[#ef4444] font-semibold">AI Inferred</span>: No human IPA; AI estimated from context.</li>
              </ul>
              <p className="mt-3 text-[0.65rem] text-[#8d8055]">
                This transparency helps you gauge certainty and potential reconstruction error in cross-stage comparisons.
              </p>
            </div>
          )}
        </div>
      </aside>
      {/* Main centered content with left padding space for legend at md+ */}
      <div className="mx-auto max-w-6xl px-4 lg:px-8 md:pl-[260px]">
        <div className="flex flex-col gap-0 min-h-[560px]">
          <div className="rounded-t-2xl bg-[#181818] border border-b-0 border-[#2f2f2f] px-2 sm:px-4 pt-4 pb-2 relative z-10">
            <EtymologyCarousel cards={data} onFocusChange={setFocusIdx} edgePadding={70} />
          </div>
          <div className="rounded-b-2xl bg-[#252525] border border-t-0 border-[#2f2f2f] shadow-xl flex-1">
            {currentCard ? (
              <MetadataPanel
                card={currentCard}
                prevCard={prevCard}
                drift={drift ?? undefined}
              />
            ) : (
              <div className="p-8 text-center text-[#B79F58] text-sm">Select a node to view metadata.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default TimelinePage

// Inline legend swatch component (kept local to avoid extra file churn)
const LegendSwatch: React.FC<{ color: string; label: string; description: string }> = ({
  color,
  label,
  description,
}) => (
  <div className="flex items-center gap-2 text-[#F5F5F5]">
    <span
      className="inline-block rounded-md border border-[#3a3a3a]"
      style={{ width: 18, height: 18, boxShadow: `0 0 0 3px ${color} inset`, background: '#252525' }}
      title={`${label} – ${description}`}
    />
    <div className="leading-tight">
      <div className="font-semibold" style={{ color }}>{label}</div>
      <div className="text-[0.65rem] md:text-[0.7rem] text-[#B79F58] uppercase tracking-wide">{description}</div>
    </div>
  </div>
)
