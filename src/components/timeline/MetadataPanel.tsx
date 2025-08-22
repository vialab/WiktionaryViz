import React from 'react'
import { NodeData } from './useTimelineData'

export interface PhoneticDriftChange {
  from?: string
  to?: string
  changes?: Record<string, string>
  status?: string
}

export interface PhoneticDrift {
  ipa1: string
  ipa2: string
  alignment: PhoneticDriftChange[]
}

interface MetadataPanelProps {
  card: NodeData
  prevCard?: NodeData
  drift?: PhoneticDrift
}

export const MetadataPanel: React.FC<MetadataPanelProps> = ({ card, prevCard, drift }) => {
  // Show backend phonetic drift if available, else fallback to simple diff
  let driftInfo: React.ReactNode = null
  if (drift && drift.alignment && Array.isArray(drift.alignment)) {
    driftInfo = (
      <div className="mt-2 text-xs text-[#D4AF37]">
        <span className="font-semibold">Phonetic Drift:</span>
        <br />
        <span className="text-[#B79F58]">
          {drift.ipa1} → {drift.ipa2}
        </span>
        <br />
        <ul className="mt-1 ml-2 list-disc">
          {drift.alignment.map((diff: PhoneticDriftChange, i: number) => (
            <li key={i} className="mb-1">
              {diff.from && diff.to ? (
                <>
                  <span className="font-mono">{diff.from}</span> →{' '}
                  <span className="font-mono">{diff.to}</span>
                  {diff.changes && Object.keys(diff.changes).length > 0 && (
                    <span className="ml-2 text-[#B79F58]">
                      [
                      {Object.entries(diff.changes ?? {}).map(([feat, val], j: number) => (
                        <React.Fragment key={j}>
                          {feat}: {String(val)}
                          {j < Object.entries(diff.changes ?? {}).length - 1 ? ', ' : ''}
                        </React.Fragment>
                      ))}
                      ]
                    </span>
                  )}
                </>
              ) : diff.status === 'deletion' ? (
                <span className="text-red-400">
                  Deleted <span className="font-mono">{diff.from}</span>
                </span>
              ) : diff.status === 'insertion' ? (
                <span className="text-green-400">
                  Inserted <span className="font-mono">{diff.to}</span>
                </span>
              ) : (
                <span className="text-gray-400">Unknown change</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    )
  } else if (prevCard && prevCard.pronunciation && card.pronunciation) {
    // Simple diff: show IPA for both, highlight difference
    driftInfo = (
      <div className="mt-2 text-xs text-[#D4AF37]">
        <span className="font-semibold">Phonetic Drift:</span>
        <br />
        <span className="text-[#B79F58]">{prevCard.word} IPA:</span>{' '}
        <span className="font-mono">{prevCard.pronunciation}</span>
        <br />
        <span className="text-[#B79F58]">{card.word} IPA:</span>{' '}
        <span className="font-mono">{card.pronunciation}</span>
      </div>
    )
  }

  return (
    <div className="mt-4 p-6 rounded-xl bg-[#252525] border-2 border-[#D4AF37] shadow text-[#F5F5F5] max-w-lg mx-auto">
      <div className="font-bold text-2xl mb-2 text-[#D4AF37]">
        {card.word} <span className="text-base text-[#B79F58]">({card.lang_code})</span>
      </div>
      {card.pronunciation && (
        <div className="text-sm mb-2 text-[#B79F58]">IPA: {card.pronunciation}</div>
      )}
      {driftInfo}
      {card.tooltip && <div className="mt-2 text-xs text-[#B79F58]">{card.tooltip}</div>}
      {/* Add more metadata as needed */}
      {/* TODO [HIGH LEVEL]: Show contested/alternate etymologies and dates side-by-side with visual cues. */}
      {/* TODO [LOW LEVEL]: Accept an `alternates` array on NodeData and render as accordions with dotted styles. */}
      {/* TODO [HIGH LEVEL]: KWIC examples and citations for the current step to support evidence-based storytelling. */}
      {/* TODO [LOW LEVEL]: Add a button to fetch /kwic?word&lang&decade and render paginated examples. */}
    </div>
  )
}
