import { createInitialMapState, type MapState } from '@/types/mapState'

export interface ShareableAppState {
  visibleSection: 'landing-page' | 'geospatial'
  word1: string
  word2: string
  language1: string
  language2: string
  inspireCategory: string | null
  theme: 'dark' | 'light'
  mapState: MapState | null
}

const QUERY_KEYS = {
  section: 'section',
  theme: 'theme',
  word1: 'word1',
  word2: 'word2',
  language1: 'language1',
  language2: 'language2',
  inspireCategory: 'inspire',
  mapState: 'map',
} as const

const toBase64Url = (value: string) => {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

const fromBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new TextDecoder().decode(bytes)
}

const cleanString = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? ''
  return trimmed || ''
}

const parseMapState = (rawValue: string | null, word1: string, language1: string): MapState | null => {
  if (!rawValue) return null

  try {
    const parsed = JSON.parse(fromBase64Url(rawValue)) as Partial<MapState>
    const base = createInitialMapState(word1, language1)

    return {
      ...base,
      ...parsed,
      camera: {
        ...base.camera,
        ...parsed.camera,
      },
      selectedItem: parsed.selectedItem ?? base.selectedItem,
      activeLayers: {
        ...base.activeLayers,
        ...parsed.activeLayers,
        opacities: {
          ...base.activeLayers.opacities,
          ...parsed.activeLayers?.opacities,
        },
        order: parsed.activeLayers?.order ?? base.activeLayers.order,
      },
      filters: {
        ...base.filters,
        ...parsed.filters,
        guideOpen: false,
        guideLayer: null,
        etymologyRequested: false,
      },
      currentWord: {
        word: word1,
        language: language1,
        key: `${word1}::${language1}`,
      },
    }
  } catch {
    return null
  }
}

export const decodeShareableStateFromSearch = (search: string): ShareableAppState => {
  const params = new URLSearchParams(search)
  const word1 = cleanString(params.get(QUERY_KEYS.word1))
  const language1 = cleanString(params.get(QUERY_KEYS.language1))
  const word2 = cleanString(params.get(QUERY_KEYS.word2))
  const language2 = cleanString(params.get(QUERY_KEYS.language2))
  const sectionFromQuery = cleanString(params.get(QUERY_KEYS.section))
  const mapState = parseMapState(params.get(QUERY_KEYS.mapState), word1, language1)

  return {
    visibleSection: sectionFromQuery === 'geospatial' || mapState ? 'geospatial' : 'landing-page',
    word1,
    word2,
    language1,
    language2,
    inspireCategory: cleanString(params.get(QUERY_KEYS.inspireCategory)) || null,
    theme: params.get(QUERY_KEYS.theme) === 'light' ? 'light' : 'dark',
    mapState,
  }
}

export const encodeShareableStateToSearch = (state: ShareableAppState) => {
  const params = new URLSearchParams()

  params.set(QUERY_KEYS.section, state.visibleSection)
  params.set(QUERY_KEYS.theme, state.theme)

  if (state.word1.trim()) params.set(QUERY_KEYS.word1, state.word1.trim())
  if (state.word2.trim()) params.set(QUERY_KEYS.word2, state.word2.trim())
  if (state.language1.trim()) params.set(QUERY_KEYS.language1, state.language1.trim())
  if (state.language2.trim()) params.set(QUERY_KEYS.language2, state.language2.trim())
  if (state.inspireCategory?.trim()) params.set(QUERY_KEYS.inspireCategory, state.inspireCategory.trim())

  if (state.mapState) {
    const serializedMapState = JSON.stringify({
      ...state.mapState,
      filters: {
        ...state.mapState.filters,
        guideOpen: false,
        guideLayer: null,
        etymologyRequested: false,
      },
      currentWord: {
        word: state.word1.trim(),
        language: state.language1.trim(),
        key: `${state.word1.trim()}::${state.language1.trim()}`,
      },
    })
    params.set(QUERY_KEYS.mapState, toBase64Url(serializedMapState))
  }

  return params.toString()
}