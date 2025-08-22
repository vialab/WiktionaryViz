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
    <div className="p-4 relative w-full max-w-4xl mx-auto">
      <EtymologyCarousel cards={data} onFocusChange={setFocusIdx} />
      <MetadataPanel card={currentCard} prevCard={prevCard} drift={drift ?? undefined} />
      {/* TODO [LOW LEVEL]: Add toolbar to save/share current timeline state with annotations and comparison to another word. */}
    </div>
  )
}

export default TimelinePage
