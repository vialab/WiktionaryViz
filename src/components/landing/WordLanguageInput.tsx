import React from 'react'

interface WordLanguageInputProps {
  word: string
  onWordChange: (word: string) => void
  language: string
  onLanguageChange: (lang: string) => void
  availableLanguages: string[]
  loading: boolean
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
  language,
  onLanguageChange,
  availableLanguages,
  loading,
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
    {word &&
      (loading ? (
        <p className="text-[#B79F58]">Loading languages...</p>
      ) : (
        <select
          value={language}
          onChange={e => onLanguageChange(e.target.value)}
          className={inputBaseStyles}
        >
          <option value="">Select a language</option>
          {availableLanguages.map(lang => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </select>
      ))}
  </div>
)

export default WordLanguageInput
