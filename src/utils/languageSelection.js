export function normalizeLanguageOption(language) {
  if (typeof language === 'string') {
    return { code: language, name: language }
  }

  if (language && typeof language === 'object') {
    return {
      code: language.code || '',
      name: language.name || language.code || '',
    }
  }

  return { code: '', name: '' }
}

export function resolveAutoLanguageSelection(currentLanguage, availableLanguages, fallbackLanguage = '') {
  const options = Array.isArray(availableLanguages)
    ? availableLanguages
        .map(normalizeLanguageOption)
        .filter(option => option.code)
    : []

  if (options.length === 0) {
    return currentLanguage || fallbackLanguage || ''
  }

  const currentIsValid = Boolean(currentLanguage) && options.some(option => option.code === currentLanguage)
  if (options.length === 1) {
    return currentIsValid ? currentLanguage : options[0].code
  }

  if (!currentLanguage && fallbackLanguage && options.some(option => option.code === fallbackLanguage)) {
    return fallbackLanguage
  }

  return currentLanguage || fallbackLanguage || ''
}
