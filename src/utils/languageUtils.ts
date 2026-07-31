import * as countryLanguage from '@ladjs/country-language'

export const getCountryFromLanguageCode = (code: string): Promise<any> => {
  const candidates = Array.from(new Set([
    code.trim(),
    code.trim().replace(/-[^-]+$/, ''),
  ].filter(Boolean)))

  const tryCandidate = async (candidate: string): Promise<any> => new Promise((resolve, reject) => {
    countryLanguage.getLanguage(candidate, (err: any, language: any) => {
      if (err) {
        reject(err)
        return
      }

      resolve(language?.countries?.[0] ?? null)
    })
  })

  return (async () => {
    for (const candidate of candidates) {
      try {
        const country = await tryCandidate(candidate)
        if (country) return country
      } catch {
        continue
      }
    }

    return null
  })()
}
