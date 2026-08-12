import { createInitialMapState, type MapAnnotation, type MapLayerKey, type MapSelection, type MapState } from '@/types/mapState'

export const VISUALIZATION_STATE_VERSION = 1 as const

export interface VisualizationStateEnvelope {
  version: typeof VISUALIZATION_STATE_VERSION
  mapState: MapState
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const isLayerKey = (value: unknown): value is MapLayerKey => value === 'translations' || value === 'protoZones' || value === 'languageFamilies' || value === 'etymology' || value === 'descendants'

const isCameraCenter = (value: unknown): value is [number, number] => Array.isArray(value) && value.length === 2 && typeof value[0] === 'number' && typeof value[1] === 'number'

const clonePoint = (point: [number, number]): [number, number] => [point[0], point[1]]

const cloneSelection = (selection: MapSelection): MapSelection => {
  if (selection.kind === 'none') return selection
  return { ...selection }
}

const cloneAnnotation = (annotation: MapAnnotation): MapAnnotation => {
  switch (annotation.kind) {
    case 'note':
      return { ...annotation, position: clonePoint(annotation.position) }
    case 'highlight':
      return { ...annotation, center: clonePoint(annotation.center) }
    case 'arrow':
    case 'link':
      return { ...annotation, start: clonePoint(annotation.start), end: clonePoint(annotation.end) }
    case 'region':
    case 'freehand':
      return { ...annotation, points: annotation.points.map(clonePoint) }
    default:
      return annotation
  }
}

const cloneMapState = (mapState: MapState): MapState => ({
  ...mapState,
  camera: {
    center: clonePoint(mapState.camera.center),
    zoom: mapState.camera.zoom,
  },
  selectedItem: cloneSelection(mapState.selectedItem),
  activeLayers: {
    ...mapState.activeLayers,
    opacities: { ...mapState.activeLayers.opacities },
    order: [...mapState.activeLayers.order],
  },
  filters: {
    ...mapState.filters,
  },
  currentWord: {
    ...mapState.currentWord,
  },
  annotations: mapState.annotations.map(cloneAnnotation),
})

const normalizeMapState = (value: unknown, fallbackWord: string, fallbackLanguage: string): MapState => {
  const base = createInitialMapState(fallbackWord, fallbackLanguage)

  if (!isRecord(value)) {
    return base
  }

  const rawCamera = isRecord(value.camera) ? value.camera : null
  const rawActiveLayers = isRecord(value.activeLayers) ? value.activeLayers : null
  const rawFilters = isRecord(value.filters) ? value.filters : null
  const rawCurrentWord = isRecord(value.currentWord) ? value.currentWord : null
  const rawCenter = rawCamera && isCameraCenter(rawCamera.center) ? rawCamera.center : null
  const rawOrder = rawActiveLayers && Array.isArray(rawActiveLayers.order) && rawActiveLayers.order.every(isLayerKey)
    ? rawActiveLayers.order
    : null
  const currentWord = {
    word: typeof rawCurrentWord?.word === 'string' && rawCurrentWord.word.trim() ? rawCurrentWord.word.trim() : fallbackWord,
    language: typeof rawCurrentWord?.language === 'string' && rawCurrentWord.language.trim() ? rawCurrentWord.language.trim() : fallbackLanguage,
    key: typeof rawCurrentWord?.key === 'string' && rawCurrentWord.key.trim()
      ? rawCurrentWord.key.trim()
      : `${fallbackWord}::${fallbackLanguage}`,
  }

  return {
    ...base,
    ...value,
    camera: {
      ...base.camera,
      ...(rawCamera ?? {}),
      center: rawCenter ? [Number(rawCenter[0]) || 0, Number(rawCenter[1]) || 0] : base.camera.center,
      zoom: typeof rawCamera?.zoom === 'number' ? rawCamera.zoom : base.camera.zoom,
    },
    selectedItem: isRecord(value.selectedItem) && typeof value.selectedItem.kind === 'string'
      ? (value.selectedItem as MapSelection)
      : base.selectedItem,
    activeLayers: {
      ...base.activeLayers,
      ...(rawActiveLayers ?? {}),
      opacities: {
        ...base.activeLayers.opacities,
        ...(isRecord(rawActiveLayers?.opacities)
          ? (rawActiveLayers.opacities as Record<string, unknown>)
          : {}),
      },
      order: rawOrder ?? base.activeLayers.order,
    },
    filters: {
      ...base.filters,
      ...(rawFilters ?? {}),
      guideOpen: typeof rawFilters?.guideOpen === 'boolean'
        ? rawFilters.guideOpen
        : base.filters.guideOpen,
      guideLayer: typeof rawFilters?.guideLayer === 'string'
        ? (rawFilters.guideLayer as 'translations' | 'etymology' | 'descendants')
        : base.filters.guideLayer,
      etymologyRequested: typeof rawFilters?.etymologyRequested === 'boolean'
        ? rawFilters.etymologyRequested
        : base.filters.etymologyRequested,
      currentIndex: typeof rawFilters?.currentIndex === 'number'
        ? rawFilters.currentIndex
        : undefined,
      isPlaying: typeof rawFilters?.isPlaying === 'boolean'
        ? rawFilters.isPlaying
        : base.filters.isPlaying,
      loop: typeof rawFilters?.loop === 'boolean'
        ? rawFilters.loop
        : base.filters.loop,
      showAllPopups: typeof rawFilters?.showAllPopups === 'boolean'
        ? rawFilters.showAllPopups
        : base.filters.showAllPopups,
      playSpeedMs: typeof rawFilters?.playSpeedMs === 'number'
        ? rawFilters.playSpeedMs
        : base.filters.playSpeedMs,
      annotationMode: typeof rawFilters?.annotationMode === 'boolean'
        ? rawFilters.annotationMode
        : base.filters.annotationMode,
      annotationTool: typeof rawFilters?.annotationTool === 'string'
        ? (rawFilters.annotationTool as MapState['filters']['annotationTool'])
        : base.filters.annotationTool,
      annotationColor: typeof rawFilters?.annotationColor === 'string'
        ? (rawFilters.annotationColor as MapState['filters']['annotationColor'])
        : base.filters.annotationColor,
      annotationCategory: typeof rawFilters?.annotationCategory === 'string'
        ? (rawFilters.annotationCategory as MapState['filters']['annotationCategory'])
        : base.filters.annotationCategory,
    },
    currentWord,
    annotations: Array.isArray(value.annotations) ? (value.annotations as MapAnnotation[]).map(cloneAnnotation) : base.annotations,
  }
}

export const serializeVisualizationState = (mapState: MapState): VisualizationStateEnvelope => ({
  version: VISUALIZATION_STATE_VERSION,
  mapState: cloneMapState(mapState),
})

export const deserializeVisualizationState = (value: unknown, fallbackWord = '', fallbackLanguage = ''): VisualizationStateEnvelope | null => {
  const raw = typeof value === 'string'
    ? (() => {
        try {
          return JSON.parse(value) as unknown
        } catch {
          return null
        }
      })()
    : value

  if (!isRecord(raw)) return null

  if (typeof raw.version === 'number' && 'mapState' in raw) {
    return {
      version: VISUALIZATION_STATE_VERSION,
      mapState: normalizeMapState(raw.mapState, fallbackWord, fallbackLanguage),
    }
  }

  if ('camera' in raw && 'currentWord' in raw && 'activeLayers' in raw && 'filters' in raw) {
    return {
      version: VISUALIZATION_STATE_VERSION,
      mapState: normalizeMapState(raw, fallbackWord, fallbackLanguage),
    }
  }

  return null
}

export const restoreMapStateFromVisualizationState = (
  envelope: VisualizationStateEnvelope,
  fallbackWord: string,
  fallbackLanguage: string,
): MapState => normalizeMapState(envelope.mapState, fallbackWord, fallbackLanguage)
