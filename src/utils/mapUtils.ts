import { getCountryFromLanguageCode } from '@/utils/languageUtils'
import { apiUrl } from '@/utils/apiBase'
import { getLanguage } from '@ladjs/country-language'
import type { EtymologyNode } from '@/types/etymology'
import type { LanguoidData } from '@/types/languoid'
import type { TranslationMarker } from '@/components/geospatial/TranslationMarkers'
import countriesIso from 'i18n-iso-countries'
// Locale registration skipped (default English names sufficient for alpha2->alpha3 conversion)

/**
 * Represents a translation entry.
 */
export interface Translation {
  lang: string
  code: string
  word: string
  sense?: string
  roman?: string
}

/**
 * Represents a geographical coordinate.
 */
interface Coordinate {
  lat: number
  lng: number
}

interface LanguageMetadata {
  name?: string | string[]
}

interface LanguoidResolutionCache {
  childrenByParent: Map<string, LanguoidData[]>
}

const resolutionCache = new WeakMap<LanguoidData[], LanguoidResolutionCache>()

export const buildWiktionaryUrl = (word: string) => {
  const slug = word.trim().replace(/\s+/g, '_')
  return `https://en.wiktionary.org/wiki/${encodeURIComponent(slug)}`
}

// Approximate representative centers for proto language macro-regions (lat,lng)
const PROTO_CENTERS: Record<string, [number, number]> = {
  'ine-pro': [49.0, 45.0], // PIE Steppe (approx)
  'gem-pro': [56.5, 11.5], // Proto-Germanic (Scandinavia / Jutland area)
  'gmw-pro': [53.2, 7.0], // Proto-West Germanic (NW Germany / Netherlands)
  'sla-pro': [52.5, 24.0], // Proto-Slavic (Central/Eastern Europe)
}

const PROTO_NAME_CENTERS: Record<string, [number, number]> = {
  'proto indo european': [49.0, 45.0],
  'proto germanic': [56.5, 11.5],
  'proto west germanic': [53.2, 7.0],
  'proto slavic': [52.5, 24.0],
}

const languageLabelToCanonical = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const tokenizeLanguageLabel = (value: string): string[] => {
  const canonical = languageLabelToCanonical(value)
  return canonical ? canonical.split(' ') : []
}

const tokenOverlapScore = (a: string, b: string): number => {
  const aTokens = new Set(tokenizeLanguageLabel(a))
  const bTokens = new Set(tokenizeLanguageLabel(b))
  if (aTokens.size === 0 || bTokens.size === 0) return 0

  let overlap = 0
  aTokens.forEach(token => {
    if (bTokens.has(token)) overlap += 1
  })

  return overlap / Math.max(aTokens.size, bTokens.size)
}

const isLikelyLanguageCode = (value: string): boolean => {
  const trimmed = value.trim()
  return /^[a-z]{2,3}(?:-[a-z0-9]+)?$/i.test(trimmed)
}

const splitCountryIds = (countryIds?: string): string[] =>
  countryIds
    ? countryIds
        .split(/\s+/)
        .map(code => code.trim().toUpperCase())
        .filter(code => code.length === 2)
    : []

const getResolutionCache = (languoidData: LanguoidData[]): LanguoidResolutionCache => {
  const cached = resolutionCache.get(languoidData)
  if (cached) return cached

  const childrenByParent = new Map<string, LanguoidData[]>()
  for (const row of languoidData) {
    const parentId = row.parent_id?.trim()
    if (!parentId) continue
    const existing = childrenByParent.get(parentId) ?? []
    existing.push(row)
    childrenByParent.set(parentId, existing)
  }

  const next = { childrenByParent }
  resolutionCache.set(languoidData, next)
  return next
}

const collectDescendants = (seed: LanguoidData, languoidData: LanguoidData[]): LanguoidData[] => {
  const seedId = seed.id?.trim()
  if (!seedId) return []
  const { childrenByParent } = getResolutionCache(languoidData)

  const descendants: LanguoidData[] = []
  const queue: LanguoidData[] = [...(childrenByParent.get(seedId) ?? [])]
  const seen = new Set<string>()

  while (queue.length) {
    const row = queue.shift()!
    const rowId = row.id?.trim()
    if (rowId && seen.has(rowId)) continue
    if (rowId) seen.add(rowId)
    descendants.push(row)

    if (rowId) {
      const children = childrenByParent.get(rowId)
      if (children?.length) queue.push(...children)
    }
  }

  return descendants
}

const deriveCoordinateFromRows = (rows: LanguoidData[]): Coordinate | null => {
  const coordinates = rows
    .map(row => parseCoordinate(row.latitude, row.longitude))
    .filter((coord): coord is Coordinate => coord !== null)

  if (!coordinates.length) return null

  const sum = coordinates.reduce(
    (acc, coord) => ({ lat: acc.lat + coord.lat, lng: acc.lng + coord.lng }),
    { lat: 0, lng: 0 },
  )

  return {
    lat: sum.lat / coordinates.length,
    lng: sum.lng / coordinates.length,
  }
}

const deriveCountryCodesFromRows = (rows: LanguoidData[]): string[] => {
  const counts = new Map<string, number>()

  rows.forEach(row => {
    splitCountryIds(row.country_ids).forEach(a2 => {
      counts.set(a2, (counts.get(a2) ?? 0) + 1)
    })
  })

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([code]) => code)
}

const getProtoCenterForLanguage = (languageCode: string): Coordinate | null => {
  const raw = languageCode.trim().toLowerCase()
  if (PROTO_CENTERS[raw]) {
    const [lat, lng] = PROTO_CENTERS[raw]
    return { lat, lng }
  }

  const canonical = languageLabelToCanonical(languageCode)
  if (PROTO_NAME_CENTERS[canonical]) {
    const [lat, lng] = PROTO_NAME_CENTERS[canonical]
    return { lat, lng }
  }

  if (canonical.startsWith('proto ')) {
    const stripped = canonical.replace(/^proto\s+/, '')
    if (PROTO_NAME_CENTERS[`proto ${stripped}`]) {
      const [lat, lng] = PROTO_NAME_CENTERS[`proto ${stripped}`]
      return { lat, lng }
    }
  }

  return null
}

const rankLanguoidRow = ({
  row,
  lookupCodes,
  lookupNames,
  candidateCountryCodes,
}: {
  row: LanguoidData
  lookupCodes: Set<string>
  lookupNames: Set<string>
  candidateCountryCodes: Set<string>
}): number => {
  const rowCode = row.iso639P3code?.trim().toLowerCase() ?? ''
  const rowName = row.name?.trim() ?? ''
  const rowNameCanonical = languageLabelToCanonical(rowName)
  let score = 0

  if (rowCode && lookupCodes.has(rowCode)) score += 250
  if (rowNameCanonical && lookupNames.has(rowNameCanonical)) score += 190

  lookupNames.forEach(candidateName => {
    if (!candidateName || !rowNameCanonical) return
    if (rowNameCanonical === candidateName) {
      score += 190
      return
    }
    if (rowNameCanonical.includes(candidateName) || candidateName.includes(rowNameCanonical)) {
      score += 90
      return
    }
    const overlap = tokenOverlapScore(rowNameCanonical, candidateName)
    if (overlap >= 0.8) {
      score += 70
    } else if (overlap >= 0.6) {
      score += 45
    }
  })

  if (row.country_ids) {
    const rowCountries = splitCountryIds(row.country_ids)
    if (rowCountries.some(country => candidateCountryCodes.has(country))) {
      score += 20
    }
  }

  if (row.latitude && row.longitude) score += 3
  return score
}

const resolveBestLanguoidRow = ({
  languageCode,
  languoidData,
  lookupCandidates,
  candidateNamesByCode,
  candidateCountryCodes,
}: {
  languageCode: string
  languoidData: LanguoidData[]
  lookupCandidates: string[]
  candidateNamesByCode: Map<string, string[]>
  candidateCountryCodes: Set<string>
}): { row: LanguoidData; score: number } | null => {
  const lookupCodes = new Set<string>()
  const lookupNames = new Set<string>()

  lookupCandidates.forEach(candidate => {
    const codeCandidate = candidate.trim().toLowerCase()
    if (codeCandidate) lookupCodes.add(codeCandidate)
    const canonical = languageLabelToCanonical(candidate)
    if (canonical) lookupNames.add(canonical)
  })

  const inputCanonical = languageLabelToCanonical(languageCode)
  if (inputCanonical) {
    lookupNames.add(inputCanonical)
    if (inputCanonical.startsWith('proto ')) {
      lookupNames.add(inputCanonical.replace(/^proto\s+/, ''))
    }
  }

  candidateNamesByCode.forEach(names => {
    names.forEach(name => {
      const canonical = languageLabelToCanonical(name)
      if (canonical) lookupNames.add(canonical)
      if (canonical.startsWith('proto ')) {
        lookupNames.add(canonical.replace(/^proto\s+/, ''))
      }
    })
  })

  let best: { row: LanguoidData; score: number } | null = null
  for (const row of languoidData) {
    const score = rankLanguoidRow({ row, lookupCodes, lookupNames, candidateCountryCodes })
    if (!best || score > best.score) {
      best = { row, score }
    }
  }

  // Guard against random low-confidence matches.
  if (!best || best.score < 70) return null
  return best
}

// TODO (Country Derivation): Provide helper mapLanguageToCountries(lang_code) returning ISO_A3 codes
// by intersecting languoid.country_ids with a country metadata lookup (to be added) for highlight sets.
/**
 * Attempts to derive ISO_A3 country codes for a language code using languoidData country_ids (A2 codes).
 * Falls back to a best-guess from @ladjs/country-language first country result.
 */
export const mapLanguageToCountries = async (
  langCode: string,
  languoidData: LanguoidData[],
): Promise<string[]> => {
  const codes: Set<string> = new Set()
  if (!langCode) return []
  // Proto languages intentionally have no modern country polygons; force empty so proto regions render
  if (/-pro$/i.test(langCode) || /^proto[-\s]/i.test(langCode)) return []
  // Normalize potential proto suffix
  let normalized = langCode.replace(/-pro$/i, '')
  if (normalized.length === 2) {
    const convertedCode = await getIso639P3(normalized)
    if (convertedCode) normalized = convertedCode
  }
  // Direct lookup by iso639P3code (convert if needed not handled here; upstream ensures ISO639-3 when possible)
  const rows = languoidData.filter(r => r.iso639P3code?.toLowerCase() === normalized.toLowerCase())
  for (const r of rows) {
    if (r.country_ids) {
      r.country_ids.split(/\s+/).forEach(a2 => {
        const a2u = a2.trim().toUpperCase()
        if (a2u.length === 2) {
          const a3 = countriesIso.alpha2ToAlpha3(a2u)
          if (a3) codes.add(a3)
        }
      })
    }
  }
  if (codes.size === 0) {
    const lookupCandidates = await getLanguageLookupCandidates(langCode)
    const candidateNamesByCode = new Map<string, string[]>()
    const candidateCountryCodes = new Set<string>()

    for (const candidate of lookupCandidates) {
      const languageMetadata = await getLanguageMetadata(candidate)
      const languageNames = Array.isArray(languageMetadata?.name)
        ? languageMetadata.name
        : languageMetadata?.name
          ? [languageMetadata.name]
          : []
      candidateNamesByCode.set(candidate.toLowerCase(), languageNames.map(name => String(name).trim()))

      try {
        const fallbackCountry = (await getCountryFromLanguageCode(candidate)) as {
          code_2?: string
        } | null
        if (fallbackCountry?.code_2) {
          candidateCountryCodes.add(fallbackCountry.code_2.trim().toUpperCase())
        }
      } catch {
        /* ignore */
      }
    }

    const best = resolveBestLanguoidRow({
      languageCode: langCode,
      languoidData,
      lookupCandidates,
      candidateNamesByCode,
      candidateCountryCodes,
    })

    if (best) {
      const rowsToDerive = [best.row, ...collectDescendants(best.row, languoidData)]
      deriveCountryCodesFromRows(rowsToDerive).forEach(a2 => {
        const a3 = countriesIso.alpha2ToAlpha3(a2)
        if (a3) codes.add(a3)
      })
    }
  }
  if (codes.size === 0 && isLikelyLanguageCode(normalized)) {
    // Fallback: try country-language package mapping for code-like values only.
    try {
      const fallbackCountry = (await getCountryFromLanguageCode(normalized)) as {
        code_2?: string
      } | null
      if (fallbackCountry?.code_2) {
        const a3 = countriesIso.alpha2ToAlpha3(fallbackCountry.code_2.toUpperCase())
        if (a3) codes.add(a3)
      }
    } catch {
      /* ignore */
    }
  }
  return Array.from(codes)
}

const getLanguageMetadata = async (code: string): Promise<LanguageMetadata | null> => {
  try {
    return await new Promise(resolve => {
      getLanguage(code, (err, data) => {
        if (err || !data) {
          resolve(null)
        } else {
          resolve(data)
        }
      })
    })
  } catch {
    return null
  }
}

const getLanguageLookupCandidates = async (languageCode: string): Promise<string[]> => {
  const trimmed = languageCode.trim()
  const stripped = trimmed.replace(/-[^-]+$/, '')
  const candidates = new Set<string>([trimmed, stripped].filter(Boolean))

  for (const candidate of Array.from(candidates)) {
    if (candidate.length === 2) {
      const convertedCode = await getIso639P3(candidate)
      if (convertedCode) candidates.add(convertedCode)
    }
  }

  return Array.from(candidates)
}

/**
 * Converts an ISO 639-1 language code to ISO 639-3.
 * @param {string} iso639_1 - The ISO 639-1 code.
 * @returns {Promise<string | null>} - The ISO 639-3 code or null if not found.
 */
export const getIso639P3 = async (iso639_1: string): Promise<string | null> => {
  try {
    if (!iso639_1) return null

    const language = await new Promise(resolve => {
      getLanguage(iso639_1, (err, data) => {
        if (err || !data || !data.iso639_3) {
          console.warn(`No ISO 639-3 mapping found for: ${iso639_1}`)
          resolve(null)
        } else {
          resolve(data.iso639_3)
        }
      })
    })

    return language as string | null
  } catch (err) {
    console.error(`Error converting ISO 639-1 to ISO 639-3: ${iso639_1}`, err)
    return null
  }
}

/**
 * Parses and validates a latitude and longitude pair.
 * @param {string | undefined} latStr - Latitude as a string.
 * @param {string | undefined} lngStr - Longitude as a string.
 * @returns {Coordinate | null} A valid coordinate object or null if invalid.
 */
const parseCoordinate = (latStr?: string, lngStr?: string): Coordinate | null => {
  if (!latStr || !lngStr) return null
  const lat = parseFloat(latStr)
  const lng = parseFloat(lngStr)
  return !isNaN(lat) && !isNaN(lng) ? { lat, lng } : null
}

/**
 * Gets coordinates based on ISO 639-3 code or language name.
 * Handles Wikimedia's custom "-pro" proto-language suffix.
 */
export const getCoordinatesForLanguage = async (
  languageCode: string,
  languoidData: LanguoidData[],
): Promise<Coordinate | null> => {
  console.log(`Getting coordinates for: ${languageCode}`)

  if (!languageCode) {
    console.warn('No language code provided for lookup.')
    return null
  }

  const protoCenter = getProtoCenterForLanguage(languageCode)
  if (protoCenter) return protoCenter

  let iso639P3 = languageCode.trim()
  const lookupCandidates = await getLanguageLookupCandidates(languageCode)

  // 🛠 Strip "-pro" suffix if present
  if (iso639P3.endsWith('-pro')) {
    iso639P3 = iso639P3.replace('-pro', '') // Remove "-pro"
    console.warn(`Detected proto-language. Adjusting lookup: ${languageCode} -> ${iso639P3}`)
    lookupCandidates.unshift(iso639P3)
  }

  // Convert ISO 639-1 to ISO 639-3 if necessary
  if (iso639P3.length === 2) {
    const convertedCode = await getIso639P3(iso639P3)
    if (convertedCode) {
      iso639P3 = convertedCode
      console.log(`Converted ${languageCode} -> ${iso639P3}`)
    }
  }

  // Validate input before lookup
  if (!iso639P3) {
    console.warn(`No valid ISO 639-3 code found for: ${languageCode}`)
    return null
  }

  const exactMatchRow = languoidData.find(
    row => row.iso639P3code?.trim().toLowerCase() === iso639P3.toLowerCase(),
  )
  if (exactMatchRow) {
    const exactCoordinate = parseCoordinate(exactMatchRow.latitude, exactMatchRow.longitude)
    if (exactCoordinate) {
      return exactCoordinate
    }

    const approximateFromDescendants = deriveCoordinateFromRows([
      exactMatchRow,
      ...collectDescendants(exactMatchRow, languoidData),
    ])
    if (approximateFromDescendants) {
      return approximateFromDescendants
    }
  }

  const candidateNamesByCode = new Map<string, string[]>()
  const candidateCountryCodes = new Set<string>()

  for (const candidate of lookupCandidates) {
    const languageMetadata = await getLanguageMetadata(candidate)
    const languageNames = Array.isArray(languageMetadata?.name)
      ? languageMetadata.name
      : languageMetadata?.name
        ? [languageMetadata.name]
        : []

    candidateNamesByCode.set(candidate.toLowerCase(), languageNames.map(name => String(name).trim().toLowerCase()).filter(Boolean))

    try {
      const fallbackCountry = (await getCountryFromLanguageCode(candidate)) as {
        code_2?: string
      } | null
      if (fallbackCountry?.code_2) {
        candidateCountryCodes.add(fallbackCountry.code_2.trim().toUpperCase())
      }
    } catch {
      /* ignore */
    }
  }

  const bestMatch = resolveBestLanguoidRow({
    languageCode,
    languoidData,
    lookupCandidates: Array.from(new Set([iso639P3, ...lookupCandidates])),
    candidateNamesByCode,
    candidateCountryCodes,
  })

  if (bestMatch) {
    const directCoordinate = parseCoordinate(bestMatch.row.latitude, bestMatch.row.longitude)
    if (directCoordinate) {
      console.log(`Matched language by scored lookup: ${bestMatch.row.iso639P3code} (${bestMatch.row.name})`)
      console.log(`Coordinates: ${bestMatch.row.latitude}, ${bestMatch.row.longitude}`)
      return directCoordinate
    }

    const rowsForApproximation = [bestMatch.row, ...collectDescendants(bestMatch.row, languoidData)]
    const approximateCoordinate = deriveCoordinateFromRows(rowsForApproximation)
    if (approximateCoordinate) {
      console.log(
        `Matched language by hierarchical approximation: ${bestMatch.row.iso639P3code} (${bestMatch.row.name})`,
      )
      console.log(`Coordinates: ${approximateCoordinate.lat}, ${approximateCoordinate.lng}`)
      return approximateCoordinate
    }
  }

  if (isLikelyLanguageCode(languageCode)) {
    try {
      for (const candidate of lookupCandidates) {
        const fallbackCountry = (await getCountryFromLanguageCode(candidate)) as {
          code_2?: string
        } | null
        if (fallbackCountry?.code_2) {
          const fallbackCoordinate = await getCountryCoordinates(fallbackCountry.code_2, languoidData)
          if (fallbackCoordinate.lat !== 0 && fallbackCoordinate.lng !== 0) {
            return fallbackCoordinate
          }
        }
      }
    } catch (err) {
      console.error(`Error while resolving fallback country for language code: ${languageCode}`, err)
    }
  }

  console.warn(`No coordinates found for language code: ${iso639P3}. Skipping.`)
  return null // ✅ SAFELY SKIP if there's no mapping
}

/**
 * Fetches a single representative coordinate for a given country.
 * @param {string} countryA2Code - The country code in A2 format.
 * @param {LanguoidData[]} languoidData - The dataset containing language metadata.
 * @returns {Promise<Coordinate>} A single coordinate for the country.
 */
export const getCountryCoordinates = async (
  countryA2Code: string,
  languoidData: LanguoidData[],
): Promise<Coordinate> => {
  console.log('Getting country coordinates for:', countryA2Code)

  const normalizedCountryCode = countryA2Code.toUpperCase()
  const countryDataList = languoidData.filter(row => {
    const countryIds = row.country_ids ? row.country_ids.trim().split(/\s+/) : []
    return countryIds.includes(normalizedCountryCode)
  })

  const validCoordinates = countryDataList
    .map(row => parseCoordinate(row.latitude, row.longitude))
    .filter((coord): coord is Coordinate => coord !== null)

  if (validCoordinates.length > 0) {
    return validCoordinates[0]
  }

  console.log(`No coordinates found for ${countryA2Code}, returning default (0,0)`)
  return { lat: 0, lng: 0 }
}

/**
 * Processes translations and generates map markers.
 * @param {Translation[]} translations - The list of translations.
 * @param {LanguoidData[]} languoidData - The dataset containing language metadata.
 * @param {React.Dispatch<React.SetStateAction<Marker[]>>} setMarkers - Function to update markers.
 */
export const processTranslations = async (
  translations: Translation[],
  languoidData: LanguoidData[],
  setMarkers: React.Dispatch<React.SetStateAction<TranslationMarker[]>>,
) => {
  try {
    console.log('Starting to process translations...')

    const cleanedTranslations = translations.filter(t => t.lang && t.code && t.word)
    const seenMarkers = new Map<string, string[]>()
    const newMarkers: TranslationMarker[] = []

    for (const translation of cleanedTranslations) {
      try {
        console.log('Processing translation:', translation)
        let coordinates: Coordinate[] = []

        // Try language-based lookup first
        const langCoordinate = await getCoordinatesForLanguage(translation.code, languoidData)
        if (langCoordinate) {
          coordinates = [langCoordinate]
        }

        // Fallback to country coordinates if no exact match found
        if (coordinates.length === 0) {
          const country = await getCountryFromLanguageCode(translation.code)
          if (country) {
            console.log(`Fallback to country coordinates for code: ${translation.code}`)
            const fallbackCoordinate = await getCountryCoordinates(country.code_2, languoidData)
            if (fallbackCoordinate.lat !== 0 && fallbackCoordinate.lng !== 0) {
              coordinates = [fallbackCoordinate]
            }
          }
        }

        // Group multiple meanings under the same marker
        for (const { lat, lng } of coordinates) {
          if (lat !== 0 && lng !== 0) {
            const markerKey = `${lat}|${lng}|${translation.lang}|${translation.word}|${translation.roman}|${translation.code}`

            const meaning = translation.sense ? `${translation.sense}` : 'No meaning provided'
            if (seenMarkers.has(markerKey)) {
              seenMarkers.get(markerKey)!.push(`<br> - ${meaning}`)
            } else {
              seenMarkers.set(markerKey, [`<br> - ${meaning}`])
            }
          }
        }
      } catch (err) {
        console.error('Error processing translation:', translation, err)
        continue
      }
    }

    // Create final markers with grouped meanings
    seenMarkers.forEach((meanings, key) => {
      const [lat, lng, lang, word, roman, code] = key.split('|')
      newMarkers.push({
        position: [parseFloat(lat), parseFloat(lng)],
        popupText: `${lang} (${code}): ${word} ${roman !== 'undefined' ? `(${roman})` : ''}<br>Meaning(s):${meanings.join('')}`,
        word,
        language: lang,
        code,
        roman: roman !== 'undefined' ? roman : undefined,
        wiktionaryUrl: buildWiktionaryUrl(word),
      })
    })

    setMarkers(prevMarkers => [...prevMarkers, ...newMarkers])
    console.log('Finished processing translations. New markers:', newMarkers)
  } catch (err) {
    console.error('Critical error processing translations:', err)
  }
}

/**
 * Processes etymology lineage and generates a direct historical path.
 * @param {any[]} etymologyTemplates - The etymology templates from teaData.
 * @param {LanguoidData[]} languoidData - The dataset containing language metadata.
 * @param {string} targetWord - The final word being traced (e.g., "tea").
 * @param {string} targetLang - The language code of the word (e.g., "en").
 * @returns {Promise<{ positions: [number, number][], lineageText: string }[]>} - The ordered lineage path.
 */
export const processEtymologyLineage = async (
  etymologyTemplates: { name: string; args: { [key: string]: string }; expansion: string }[],
  languoidData: LanguoidData[],
  targetWord: string,
  targetLang: string,
): Promise<EtymologyNode | null> => {
  if (!etymologyTemplates || etymologyTemplates.length === 0) {
    console.warn('No etymology templates found.')
    return null
  }

  const position = await getCoordinatesForLanguage(targetLang, languoidData)

  const targetCountries = await mapLanguageToCountries(targetLang, languoidData)
  let currentNode: EtymologyNode | null = {
    word: targetWord,
    lang_code: targetLang,
    romanization: null,
    position: position ? [position.lat, position.lng] : null,
    next: null,
    expansion: targetWord, // Use the word itself as the initial expansion
    countries: targetCountries,
  }

  console.log('Current node:', currentNode)

  // Ensure the initial position is valid
  if (
    currentNode &&
    (!currentNode.position || isNaN(currentNode.position[0]) || isNaN(currentNode.position[1]))
  ) {
    console.warn(
      `Initial position for targetLang (${targetLang}) is invalid. Setting default coordinates.`,
    )
    if (currentNode) currentNode.position = [0, 0] // Default fallback coordinates
  }

  // Include inheritance ('inh') along with borrowing ('bor'/'bor+') and derivation ('der')
  const orderedEtymology = etymologyTemplates.filter(entry =>
    ['bor', 'bor+', 'der', 'inh'].includes(entry.name),
  )

  for (const entry of orderedEtymology) {
    const { args, expansion } = entry
    const sourceLang = args['2']?.trim() ?? null
    const sourceWord = args['3']?.trim() ?? expansion
    const sourceRomanization = args['tr']?.trim() ?? null

    if (!sourceLang) {
      console.warn(`Skipping entry due to missing sourceLang:`, entry)
      continue
    }

    let sourceCoords = await getCoordinatesForLanguage(sourceLang, languoidData)

    // If proto and no coords found, use macro-region center
    if (!sourceCoords && /-pro$/.test(sourceLang) && PROTO_CENTERS[sourceLang]) {
      const [lat, lng] = PROTO_CENTERS[sourceLang]
      sourceCoords = { lat, lng }
    }

    // Approximate coordinates if not found
    if (!sourceCoords) {
      console.warn(`No coordinates found for sourceLang: ${sourceLang}. Approximating...`)
      if (currentNode && currentNode.position) {
        sourceCoords = { lat: currentNode.position[0] + 1, lng: currentNode.position[1] + 1 }
      } else {
        sourceCoords = { lat: 0, lng: 0 }
      }
    }

    // Handle specific overrides for known languages
    if (sourceLang === 'fa-cls') {
      sourceCoords = { lat: 32.9, lng: 53.3 }
    }
    if (sourceLang === 'ar') {
      sourceCoords = { lat: 27.96, lng: 43.85 }
    }

    // Ensure sourceCoords is valid and not NaN
    if (!sourceCoords || isNaN(sourceCoords.lat) || isNaN(sourceCoords.lng)) {
      console.warn(`Source coordinates for ${sourceLang} are invalid. Skipping this entry.`)
      continue
    }

    const countries = await mapLanguageToCountries(sourceLang, languoidData)
    const newNode: EtymologyNode = {
      word: sourceWord,
      lang_code: sourceLang,
      romanization: sourceRomanization,
      position: [sourceCoords.lat, sourceCoords.lng],
      next: currentNode,
      expansion: expansion,
      countries,
    }

    currentNode = newNode
  }

  console.log('Finished processing etymology lineage. Result:', currentNode)
  return currentNode
}

// Extracts all possible ancestor forms for each etymology step from etymology_text
export function extractEtymologyVariants(etymologyText: string): { lang: string; word: string }[] {
  // Example regex: matches 'from Middle Dutch arance, orange', 'from Old French orenge, arange', etc.
  // Handles: from <Language> <word1>[,| and| or] <word2> ...
  const variants: { lang: string; word: string }[] = []
  if (!etymologyText) return variants
  // Regex to match: from <Language> <word>[,| and| or] <word2> ...
  const regex = /from ([A-Z][a-zA-Z ]+?) ([^,.;()\[\]]+)(?:, ([^,.;()\[\]]+))*/g // eslint-disable-line no-useless-escape
  let match
  while ((match = regex.exec(etymologyText)) !== null) {
    const lang = match[1].trim()
    // match[2] is the first word, match[3] is the second (if present), etc.
    if (match[2]) variants.push({ lang, word: match[2].trim() })
    // Check for additional comma-separated words
    if (match[0].includes(',')) {
      const rest = match[0].split(/from [A-Z][a-zA-Z ]+ /)[1]
      if (rest) {
        rest
          .split(',')
          .slice(1)
          .forEach(w => {
            const word = w.trim().replace(/^(and|or) /, '')
            if (word) variants.push({ lang, word })
          })
      }
    }
  }
  return variants
}

// Utility: fetches the IPA for a given word/lang from /word-data
export const fetchIPAForWord = async (word: string, lang: string): Promise<string | null> => {
  try {
    const res = await fetch(
      apiUrl(`/word-data?word=${encodeURIComponent(word)}&lang_code=${encodeURIComponent(lang)}`),
    )
    if (!res.ok) return null
    const data = await res.json()
    // Try to get IPA from sounds
    if (Array.isArray(data.sounds) && data.sounds.length > 0 && data.sounds[0].ipa) {
      return data.sounds[0].ipa
    }
    // Fallback: try to get IPA from head_templates or forms if needed (not implemented here)
    return null
  } catch {
    return null
  }
}

/**
 * Normalizes a position to a [lat, lng] tuple.
 */
export const normalizePosition = (
  pos: [number, number] | { lat: number; lng: number } | null | undefined,
): [number, number] => {
  if (!pos) {
    console.warn('Missing position:', pos)
    return [0, 0] // Fallback
  }
  if (Array.isArray(pos)) {
    return pos
  }
  if (typeof pos === 'object' && 'lat' in pos && 'lng' in pos) {
    return [pos.lat, pos.lng]
  }
  console.error('Invalid position format:', pos)
  return [0, 0]
}

/**
 * Creates a Leaflet arrow icon rotated to the supplied bearing angle.
 * Now supports sizing & color customization for improved legibility.
 *
 * NOTE: Previously a fixed 10x10 CSS triangle; enlarged & outlined for clarity.
 */
export const createArrowIcon = (
  angle: number,
  options: {
    size?: number
    color?: string
    outline?: string
    outlineWidth?: number
    opacity?: number
  } = {},
) => {
  const {
    size = 22,
    color = '#3b82f6',
    outline = '#0f172a',
    outlineWidth = 1.6,
    opacity = 0.95,
  } = options
  // Using an inline SVG for sharper scaling and optional outline.
  // Coordinate system: 0 0 100 100 -> arrow pointing "up"; we rotate to bearing.
  const svg = `<svg width="${size}" height="${size}" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;">
      <path d="M50 4 L10 92 L50 72 L90 92 Z" fill="${color}" stroke="${outline}" stroke-width="${outlineWidth}" stroke-linejoin="round" />
    </svg>`
  return window.L.divIcon({
    className: 'arrow-icon',
    html: `<div style="transform: rotate(${angle}deg); opacity:${opacity}; filter: drop-shadow(0 0 2px rgba(0,0,0,0.4));">${svg}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

/**
 * Calculates the bearing (angle) between two coordinates.
 */
export const calculateBearing = (start: [number, number], end: [number, number]): number => {
  const [lat1, lon1] = start.map(deg => (deg * Math.PI) / 180)
  const [lat2, lon2] = end.map(deg => (deg * Math.PI) / 180)
  const deltaLon = lon2 - lon1
  const x = Math.sin(deltaLon) * Math.cos(lat2)
  const y = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon)
  const bearingRad = Math.atan2(x, y)
  const bearingDeg = ((bearingRad * 180) / Math.PI + 360) % 360
  return bearingDeg
}

/**
 * Calculates the midpoint between two coordinates in Mercator projection.
 */
export const calculateMercatorMidpoint = (
  coord1: [number, number],
  coord2: [number, number],
): [number, number] => {
  const [lat1, lng1] = coord1
  const [lat2, lng2] = coord2
  const srcLatRad = lat1 * (Math.PI / 180)
  const dstLatRad = lat2 * (Math.PI / 180)
  const middleLatRad = Math.atan(
    Math.sinh(
      Math.log(
        Math.sqrt(
          (Math.tan(dstLatRad) + 1 / Math.cos(dstLatRad)) *
            (Math.tan(srcLatRad) + 1 / Math.cos(srcLatRad)),
        ),
      ),
    ),
  )
  const middleLat = middleLatRad * (180 / Math.PI)
  const middleLng = (lng1 + lng2) / 2
  return [middleLat, middleLng]
}

// TODO (Timeline Helpers):
//  - add flattenLineage(root: EtymologyNode|null) exported here for reuse (currently duplicated in geojsonExport).
//  - add getLineageArrayWithIndices(root) to precompute arrays for timeline scrubber.
//  - add computeLineageCountrySets(root) to build highlighted / ordered focused arrays.
export const flattenLineage = (root: EtymologyNode | null): EtymologyNode[] => {
  const arr: EtymologyNode[] = []
  let cur = root
  while (cur) {
    arr.push(cur)
    cur = cur.next
  }
  return arr
}

export const collectHighlightedCountries = (root: EtymologyNode | null): string[] => {
  const set = new Set<string>()
  flattenLineage(root).forEach(n => n.countries?.forEach(c => set.add(c)))
  return Array.from(set)
}
