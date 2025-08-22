import React from 'react'

interface VisualizationTypeSelectorProps {
  value: string | null
  onChange: (value: string) => void
  options?: string[]
}

/**
 * Selector for visualization type (geospatial, network, timeline, etc).
 */
const VisualizationTypeSelector: React.FC<VisualizationTypeSelectorProps> = ({
  value,
  onChange,
  options = ['geospatial', 'network', 'timeline'],
}) => (
  <ul className="mt-3 grid grid-cols-1 gap-3 text-left">
    {options.map(option => (
      <li key={option}>
        <label className="flex items-center space-x-3 cursor-pointer">
          <input
            type="radio"
            name="visualization"
            value={option}
            checked={value === option}
            onChange={() => onChange(option)}
            className="hidden peer"
          />
          <div className="w-5 h-5 rounded-full border-2 border-[#F5F5F5] peer-checked:border-[#D4AF37] peer-checked:bg-[#D4AF37] flex items-center justify-center hover:border-[#B79F58] transition-all cursor-pointer">
            <div className="w-2.5 h-2.5 bg-black rounded-full opacity-0 peer-checked:opacity-100 transition-opacity"></div>
          </div>
          <span className="text-[#F5F5F5] capitalize">{option}</span>
        </label>
      </li>
    ))}
  </ul>
)

export default VisualizationTypeSelector
