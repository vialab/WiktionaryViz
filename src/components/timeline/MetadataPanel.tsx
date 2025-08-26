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
      <div className="mt-4 text-sm text-[#D4AF37]">
        <div className="font-semibold mb-2 text-base">Phonetic Drift</div>
        <div className="text-[#B79F58] mb-3 text-sm md:text-base">
          <span className="font-mono px-2 py-1 bg-[#1d1d1d] rounded-md mr-2 border border-[#3a3a3a]">
            {drift.ipa1}
          </span>
          →
          <span className="font-mono px-2 py-1 bg-[#1d1d1d] rounded-md ml-2 border border-[#3a3a3a]">
            {drift.ipa2}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs md:text-sm border-separate border-spacing-y-1">
            <thead>
              <tr className="text-[#B79F58]">
                <th className="text-left font-medium px-2 py-1">From</th>
                <th className="text-left font-medium px-2 py-1">To</th>
                <th className="text-left font-medium px-2 py-1 w-1/2">Feature Changes</th>
              </tr>
            </thead>
            <tbody>
              {drift.alignment.map((diff: PhoneticDriftChange, i: number) => {
                if (diff.from && diff.to) {
                  return (
                    <tr key={i} className="bg-[#1e1e1e] hover:bg-[#242424] transition-colors">
                      <td className="font-mono px-2 py-1 align-top">{diff.from}</td>
                      <td className="font-mono px-2 py-1 align-top">{diff.to}</td>
                      <td className="px-2 py-1 text-[#B79F58] align-top">
                        {diff.changes && Object.keys(diff.changes).length > 0 ? (
                          <div className="flex flex-wrap gap-x-2 gap-y-1">
                            {Object.entries(diff.changes).map(([feat, val], j: number) => (
                              <span
                                key={j}
                                className="inline-flex items-center gap-1 bg-[#2a2a2a] px-2 py-0.5 rounded-md border border-[#3a3a3a]"
                              >
                                <span className="text-[#f0d78c]">{feat}</span>
                                <span className="text-[#9cb4ff] font-mono">{String(val)}</span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-400 italic">—</span>
                        )}
                      </td>
                    </tr>
                  )
                } else if (diff.status === 'deletion') {
                  return (
                    <tr key={i} className="bg-[#1e1e1e] hover:bg-[#242424]">
                      <td className="font-mono px-2 py-1 text-red-400" colSpan={3}>
                        Deleted <span className="font-bold">{diff.from}</span>
                      </td>
                    </tr>
                  )
                } else if (diff.status === 'insertion') {
                  return (
                    <tr key={i} className="bg-[#1e1e1e] hover:bg-[#242424]">
                      <td className="font-mono px-2 py-1 text-green-400" colSpan={3}>
                        Inserted <span className="font-bold">{diff.to}</span>
                      </td>
                    </tr>
                  )
                }
                return (
                  <tr key={i} className="bg-[#1e1e1e] hover:bg-[#242424]">
                    <td className="px-2 py-1 text-gray-400 italic" colSpan={3}>
                      Unknown change
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
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
    <div
      className="p-6 md:p-8 text-[#F5F5F5] w-full bg-[#252525] border-t border-[#2f2f2f]"
      role="region"
      aria-label="Etymology metadata"
    >
  <div className="max-w-4xl px-2 sm:px-4">
      <div className="font-bold text-3xl md:text-4xl mb-3 text-[#D4AF37] tracking-wide leading-snug">
        {card.word}{' '}
        <span className="text-lg md:text-xl text-[#B79F58] font-medium">({card.lang})</span>
      </div>
      {card.pronunciation && (
        <div className="text-base md:text-lg mb-3 text-[#B79F58] font-mono bg-[#1d1d1d] inline-block px-3 py-1 rounded-md border border-[#3a3a3a]">
          {card.pronunciation}
        </div>
      )}
      {driftInfo}
      </div>
      {/* Add more metadata as needed */}
      {/* TODO [HIGH LEVEL]: Show contested/alternate etymologies and dates side-by-side with visual cues. */}
      {/* TODO [LOW LEVEL]: Accept an `alternates` array on NodeData and render as accordions with dotted styles. */}
      {/* TODO [HIGH LEVEL]: KWIC examples and citations for the current step to support evidence-based storytelling. */}
      {/* TODO [LOW LEVEL]: Add a button to fetch /kwic?word&lang&decade and render paginated examples. */}
    </div>
  )
}
