import React, { useState, useEffect } from 'react'
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

  if (loading) return <div>Loading timeline...</div>
  if (!data.length) return <div>No etymology found.</div>

  return (
    <div className="relative w-full">
      {/* Floating legend (doesn't affect main centering) */}
      <aside className="hidden md:flex flex-col gap-3 fixed top-28 left-8 w-[220px] z-30">
        <div className="text-[#B79F58] text-[0.65rem] tracking-wide uppercase font-semibold pl-1">
          Phonetic Data Source
        </div>
        <div className="flex flex-col gap-3 bg-[#181818] px-4 py-4 rounded-xl border border-[#2f2f2f] shadow-inner">
          <LegendSwatch color="#22c55e" label="Human IPA" description="Complete" />
          <LegendSwatch color="#f59e42" label="Hybrid" description="Phonemic + AI" />
          <LegendSwatch color="#ef4444" label="AI Inferred" description="No human IPA" />
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
