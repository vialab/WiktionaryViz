import React from 'react'

interface WordLanguageInputProps {
  word: string
  onWordChange: (word: string) => void
  id?: string
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
  id = 'word-language-input',
  inputBaseStyles = '',
  placeholder = 'Enter a word',
}) => (
  <div className="space-y-2">
    <input
      id={id}
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
