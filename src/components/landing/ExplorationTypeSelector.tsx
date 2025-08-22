import React from 'react'

interface ExplorationTypeSelectorProps {
  value: 'single' | 'compare' | null
  onChange: (type: 'single' | 'compare') => void
}

/**
 * Selector for exploration type (single or compare).
 */
const ExplorationTypeSelector: React.FC<ExplorationTypeSelectorProps> = ({ value, onChange }) => (
  <div className="flex justify-center gap-4 mb-6">
    <button
      className={`px-4 py-2 rounded-md font-semibold transition ${
        value === 'single'
          ? 'bg-[#D4AF37] text-black'
          : 'bg-[#0F0F0F] text-[#D4AF37] border border-[#D4AF37] hover:bg-[#1C1C1E]'
      }`}
      onClick={() => onChange('single')}
    >
      Explore one word
    </button>
    <button
      className={`px-4 py-2 rounded-md font-semibold transition ${
        value === 'compare'
          ? 'bg-[#D4AF37] text-black'
          : 'bg-[#0F0F0F] text-[#D4AF37] border border-[#D4AF37] hover:bg-[#1C1C1E]'
      }`}
      onClick={() => onChange('compare')}
    >
      Compare two words
    </button>
  </div>
)

export default ExplorationTypeSelector
