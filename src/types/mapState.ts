export type GuideLayerKey = 'translations' | 'etymology' | 'descendants' | 'protoZones' | 'families'

export type MapLayerKey = 'translations' | 'protoZones' | 'languageFamilies' | 'etymology' | 'descendants'

export type AnnotationKind = 'note' | 'highlight' | 'arrow' | 'region' | 'link'

export interface BaseAnnotation {
  id: string
  kind: AnnotationKind
  text: string
  createdAt: string
}

export interface PointAnnotation extends BaseAnnotation {
  kind: 'note'
  position: [number, number]
}

export interface HighlightAnnotation extends BaseAnnotation {
  kind: 'highlight'
  center: [number, number]
  radiusMeters: number
}

export interface SegmentAnnotation extends BaseAnnotation {
  kind: 'arrow' | 'link'
  start: [number, number]
  end: [number, number]
}

export interface RegionAnnotation extends BaseAnnotation {
  kind: 'region'
  points: [number, number][]
}

export type MapAnnotation = PointAnnotation | HighlightAnnotation | SegmentAnnotation | RegionAnnotation

export type LayerOpacityState = Record<MapLayerKey, number>

export type LayerOrderState = MapLayerKey[]

export type MapSelection =
  | { kind: 'none' }
  | { kind: 'translation-marker'; index: number; label: string }
  | { kind: 'lineage-node'; index: number; word: string; language: string }

export interface MapCameraState {
  center: [number, number]
  zoom: number
}

export interface MapActiveLayersState {
  translations: boolean
  protoZones: boolean
  languageFamilies: boolean
  etymology: boolean
  descendants: boolean
  opacities: LayerOpacityState
  order: LayerOrderState
}

export interface MapFilterState {
  guideOpen: boolean
  guideLayer: GuideLayerKey | null
  etymologyRequested: boolean
  currentIndex: number | undefined
  isPlaying: boolean
  loop: boolean
  showAllPopups: boolean
  playSpeedMs: number
  annotationMode: boolean
  annotationTool: AnnotationKind
}

export interface MapCurrentWordState {
  word: string
  language: string
  key: string
}

export interface MapState {
  camera: MapCameraState
  selectedItem: MapSelection
  activeLayers: MapActiveLayersState
  filters: MapFilterState
  currentWord: MapCurrentWordState
  annotations: MapAnnotation[]
}

export const defaultMapLayerOpacities: LayerOpacityState = {
  translations: 1,
  protoZones: 1,
  languageFamilies: 1,
  etymology: 1,
  descendants: 1,
}

export const defaultMapLayerOrder: LayerOrderState = [
  'translations',
  'descendants',
  'etymology',
  'protoZones',
  'languageFamilies',
]

export const createInitialMapState = (word: string, language: string): MapState => ({
  camera: {
    center: [0, 0],
    zoom: 2,
  },
  selectedItem: { kind: 'none' },
  activeLayers: {
    translations: false,
    protoZones: false,
    languageFamilies: false,
    etymology: false,
    descendants: false,
    opacities: defaultMapLayerOpacities,
    order: defaultMapLayerOrder,
  },
  filters: {
    guideOpen: true,
    guideLayer: null,
    etymologyRequested: false,
    currentIndex: undefined,
    isPlaying: false,
    loop: false,
    showAllPopups: false,
    playSpeedMs: 800,
    annotationMode: false,
    annotationTool: 'note',
  },
  currentWord: {
    word,
    language,
    key: `${word}::${language}`,
  },
  annotations: [],
})