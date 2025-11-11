import React from 'react'

interface WordLanguageInputProps {
  word: string
  onWordChange: (word: string) => void
  label?: string
  inputBaseStyles?: string
  placeholder?: string
}

/**
 * Input group for word and language selection.
 */
const WordLanguageInput: React.FC<WordLanguageInputProps> = ({
  word,
  onWordChange,
  label,
  inputBaseStyles = '',
  placeholder = 'Enter a word',
}) => (
  <div className="space-y-2">
    {label && <label className="block text-[#F5F5F5] font-medium">{label}</label>}
    <input
      type="text"
      placeholder={placeholder}
      value={word}
      onChange={e => onWordChange(e.target.value)}
      className={inputBaseStyles}
    />
    {/* Language selection moved to parent (LandingPage) to centralize backend fetching */}
  </div>
)

export default WordLanguageInput
