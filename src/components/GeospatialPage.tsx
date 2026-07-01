import { useCallback, useEffect, useState, useRef } from 'react'
import { MapContainer, TileLayer, LayersControl, LayerGroup, useMap } from 'react-leaflet'
import useWordData from '@/hooks/useWordData'
import useLanguoidData from '@/hooks/useLanguoidData'
import { processTranslations, processEtymologyLineage, flattenLineage } from '@/utils/mapUtils'
import 'leaflet-defaulticon-compatibility'
import L from 'leaflet'
import icon from 'leaflet/dist/images/marker-icon.png'
import iconShadow from 'leaflet/dist/images/marker-shadow.png'
import MarkerClusterGroup from 'react-leaflet-markercluster'
import 'react-leaflet-markercluster/styles'
import TranslationMarkers, { TranslationMarker } from './geospatial/TranslationMarkers'
import LineageCountryHighlights from './geospatial/LineageCountryHighlights'
import EtymologyLineagePath from './geospatial/EtymologyLineagePath'
import TimelineScrubber from './geospatial/TimelineScrubber.tsx'
import GeospatialSettingsMenu from './geospatial/GeospatialSettingsMenu'
import ProtoLanguageZones from './geospatial/ProtoLanguageZones'
import LanguageFamiliesBubbles from './geospatial/LanguageFamiliesBubbles'
import DescendantLineagePaths from './geospatial/DescendantLineagePaths'
import GeospatialGuideOverlay from './geospatial/GeospatialGuideOverlay'
import AnnotationModeOverlay from './geospatial/AnnotationModeOverlay'
import type { EtymologyNode } from '@/types/etymology'
import type { LanguoidData } from '@/types/languoid'
import type { Translation } from '@/utils/mapUtils'
import { decodeShareableStateFromSearch } from '@/utils/shareableState'

import {
  createInitialMapState,
  defaultMapLayerOpacities,
  defaultMapLayerOrder,
  type AnnotationKind,
  type GuideLayerKey,
  type MapLayerKey,
  type MapSelection,
  type MapState,
} from '@/types/mapState'

const layerOrderStep = 20
const layerOrderBase = 500

const MapInstanceRegistrar = ({ onReady }: { onReady: (map: L.Map) => void }) => {
  const map = useMap()

  useEffect(() => {
    onReady(map)
  }, [map, onReady])

  return null
}

L.Marker.prototype.options.icon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
})

// Define the expected structure for wordData
interface WordData {
  translations?: Translation[]
  etymology_templates?: { name: string; args: { [key: string]: string }; expansion: string }[]
  word: string
  lang_code: string
  lang?: string // full language name (e.g., 'Indonesian') returned by API
}

interface GeospatialPageProps {
  word: string
  language: string
  onGuideOpenRegister?: (openGuide: (() => void) | null) => void
  initialMapState?: MapState | null
  onMapStateChange?: (state: MapState) => void
  openGuideOnLoad?: boolean
  theme?: 'dark' | 'light'
  inspireCategory?: string | null
}

/**
 * GeospatialPage visualizes translations and etymology lineage on a map.
 * Uses modular components for maintainability and performance.
 */
const GeospatialPage: React.FC<GeospatialPageProps> = ({
  word,
  language,
  onGuideOpenRegister,
  initialMapState,
  onMapStateChange,
  openGuideOnLoad = true,
  theme = 'dark',
  inspireCategory,
}) => {
  const isLight = theme === 'light'
  const urlInitialMapState = typeof window === 'undefined'
    ? null
    : decodeShareableStateFromSearch(window.location.search).mapState
  const sharedInitialMapState = initialMapState ?? urlInitialMapState
  const shouldOpenGuideOnLoad = openGuideOnLoad
  const initialCameraCenterRef = useRef<[number, number]>(sharedInitialMapState?.camera?.center ?? [0, 0])
  const initialCameraZoomRef = useRef<number>(sharedInitialMapState?.camera?.zoom ?? 2)
  const hydratedFromSharedStateRef = useRef(Boolean(sharedInitialMapState) || !shouldOpenGuideOnLoad)
  const { wordData, loading: wordDataLoading, resolvedKey: wordDataResolvedKey } = useWordData(word, language) as {
    wordData: WordData | null
    loading: boolean
    resolvedKey: string | null
  }
  const { languoidData, loading: languoidDataLoading } = useLanguoidData() as {
    languoidData: LanguoidData[]
    loading: boolean
  }
  const [mapState, setMapState] = useState<MapState>(() => {
    const base = createInitialMapState(word, language)
    if (!sharedInitialMapState) {
      return {
        ...base,
        filters: {
          ...base.filters,
          guideOpen: shouldOpenGuideOnLoad,
        },
      }
    }

    return {
      ...base,
      ...sharedInitialMapState,
      camera: {
        ...base.camera,
        ...(sharedInitialMapState.camera ?? {}),
      },
      selectedItem: sharedInitialMapState.selectedItem ?? base.selectedItem,
      activeLayers: {
        ...base.activeLayers,
        ...sharedInitialMapState.activeLayers,
        opacities: {
          ...base.activeLayers.opacities,
          ...sharedInitialMapState.activeLayers?.opacities,
        },
        order: sharedInitialMapState.activeLayers?.order ?? base.activeLayers.order,
      },
      filters: {
        ...base.filters,
        ...(sharedInitialMapState.filters ?? {}),
        guideOpen: sharedInitialMapState.filters?.guideOpen ?? shouldOpenGuideOnLoad,
        annotationMode: sharedInitialMapState.filters?.annotationMode ?? base.filters.annotationMode,
        annotationTool: sharedInitialMapState.filters?.annotationTool ?? base.filters.annotationTool,
      },
      currentWord: {
        word,
        language,
        key: `${word}::${language}`,
      },
      annotations: Array.isArray(sharedInitialMapState.annotations) ? sharedInitialMapState.annotations : base.annotations,
    }
  })
  const [markers, setMarkers] = useState<TranslationMarker[]>([])
  const [lineage, setLineage] = useState<EtymologyNode | null>(null)
  const dwellDurationRef = useRef<number>(1200) // ms pause after each transition for reading (extended for readability)
  // Track visibility of LayersControl overlays that render non-Leaflet DOM (bubbles SVG)
  const [translationGroup, setTranslationGroup] = useState<L.LayerGroup | null>(null)
  const [protoZonesGroup, setProtoZonesGroup] = useState<L.LayerGroup | null>(null)
  const [descendantPathsGroup, setDescendantPathsGroup] = useState<L.LayerGroup | null>(null)
  const [languageFamiliesGroup, setLanguageFamiliesGroup] = useState<L.LayerGroup | null>(null)
  const [etymologyLineageGroup, setEtymologyLineageGroup] = useState<L.LayerGroup | null>(null)
  const [descendantCoordinates, setDescendantCoordinates] = useState<[number, number][]>([])
  const [liveMessage, setLiveMessage] = useState('')
  const annotations = mapState.annotations
  const hasAdjustedZoomRef = useRef(false)
  const playbackTimerRef = useRef<number | null>(null)
  const announcementTimerRef = useRef<number | null>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const handleMapReady = useCallback((instance: L.Map) => {
    if (mapInstanceRef.current === instance) return
    mapInstanceRef.current = instance
  }, [])
  // --- Dynamic zoom refs (distance-based small-jump assist) ---
  const autoZoomBaselineRef = useRef<number | null>(null) // original zoom before first auto-zoom-in
  const lastAutoZoomInRef = useRef<number | null>(null) // last zoom level we auto-raised to
  // const [highlightedCountries, setHighlightedCountries] = useState<string[]>([]); // replaced by LineageCountryHighlights overlay
  const lineageNodes = lineage ? flattenLineage(lineage) : []
  const hasPlayableLineage = lineageNodes.length > 1
  const translationCount = markers.length
  const lineageNodeCount = lineageNodes.length
  const translationBreadth = translationCount / Math.max(1, lineageNodeCount)
  const currentIndex = mapState.filters.currentIndex
  const isPlaying = mapState.filters.isPlaying
  const playSpeed = mapState.filters.playSpeedMs
  const loop = mapState.filters.loop
  const showAllPopups = mapState.filters.showAllPopups
  const guideOpen = mapState.filters.guideOpen
  const guideLayer = mapState.filters.guideLayer
  const showTranslations = mapState.activeLayers.translations
  const showProtoZones = mapState.activeLayers.protoZones
  const showDescendantPaths = mapState.activeLayers.descendants
  const showLanguageFamilies = mapState.activeLayers.languageFamilies
  const showEtymologyLineage = mapState.activeLayers.etymology
  const layerOpacities = mapState.activeLayers.opacities
  const layerOrder = mapState.activeLayers.order
  const currentWordKey = mapState.currentWord.key
  const lineageCoordinates = useCallback(() => {
    if (!lineage) return [] as [number, number][]
    return flattenLineage(lineage)
      .map(node => node.position)
      .filter((position): position is [number, number] => Array.isArray(position))
  }, [lineage])

  const layerZIndex = (layer: MapLayerKey) => {
    const index = layerOrder.indexOf(layer)
    const resolvedIndex = index >= 0 ? index : layerOrder.length - 1
    return layerOrderBase + (layerOrder.length - resolvedIndex) * layerOrderStep
  }

  const mapInstance = mapInstanceRef.current

  const updateMapState = useCallback((updater: (current: MapState) => MapState) => {
    setMapState(updater)
  }, [])

  const hasPublishedInitialMapStateRef = useRef(false)

  useEffect(() => {
    if (!hasPublishedInitialMapStateRef.current) {
      hasPublishedInitialMapStateRef.current = true
      return
    }

    onMapStateChange?.(mapState)
  }, [mapState, onMapStateChange])

  useEffect(() => () => {
    if (announcementTimerRef.current != null) {
      window.clearTimeout(announcementTimerRef.current)
    }
  }, [])

  const setFilterState = useCallback((updates: Partial<MapState['filters']>) => {
    updateMapState(current => ({
      ...current,
      filters: {
        ...current.filters,
        ...updates,
      },
    }))
  }, [updateMapState])

  const setActiveLayerState = useCallback((updates: Partial<MapState['activeLayers']>) => {
    updateMapState(current => ({
      ...current,
      activeLayers: {
        ...current.activeLayers,
        ...updates,
      },
    }))
  }, [updateMapState])

  const announce = useCallback((message: string) => {
    if (announcementTimerRef.current != null) {
      window.clearTimeout(announcementTimerRef.current)
    }

    setLiveMessage('')
    announcementTimerRef.current = window.setTimeout(() => {
      setLiveMessage(message)
      announcementTimerRef.current = null
    }, 30)
  }, [])

  const setGuideLayer = useCallback((nextGuideLayer: GuideLayerKey | null) => {
    setFilterState({ guideLayer: nextGuideLayer })
  }, [setFilterState])

  const setAnnotationMode = useCallback((enabled: boolean) => {
    setFilterState({ annotationMode: enabled })
  }, [setFilterState])

  const setAnnotationTool = useCallback((tool: AnnotationKind) => {
    setFilterState({ annotationTool: tool })
  }, [setFilterState])

  const setSelectedItem = useCallback((selectedItem: MapSelection) => {
    updateMapState(current => {
      if (current.selectedItem.kind !== selectedItem.kind) {
        return { ...current, selectedItem }
      }

      if (selectedItem.kind === 'none') {
        return current
      }

      if ('index' in current.selectedItem && 'index' in selectedItem && current.selectedItem.index === selectedItem.index) {
        return current
      }

      return { ...current, selectedItem }
    })
  }, [updateMapState])

  const setCameraState = useCallback((center: [number, number], zoom: number) => {
    updateMapState(current => {
      const sameCenter = current.camera.center[0] === center[0] && current.camera.center[1] === center[1]
      if (sameCenter && current.camera.zoom === zoom) return current
      return {
        ...current,
        camera: {
          center,
          zoom,
        },
      }
    })
  }, [updateMapState])

  useEffect(() => {
    if (!mapInstance) return

    const paneZIndexes: Array<[string, number]> = [
      ['translations', layerZIndex('translations')],
      ['proto-zones', layerZIndex('protoZones')],
      ['language-families-bubbles', layerZIndex('languageFamilies')],
      ['etymology-lineage', layerZIndex('etymology')],
      ['lineage-countries', layerZIndex('etymology') - 10],
      ['descendant-paths-lines', layerZIndex('descendants')],
      ['descendant-paths-markers', layerZIndex('descendants') + 60],
      ['descendant-paths-labels', layerZIndex('descendants') + 140],
    ]

    paneZIndexes.forEach(([name, zIndex]) => {
      const pane = mapInstance.getPane(name)
      if (pane) pane.style.zIndex = String(zIndex)
    })
  }, [layerOrder, mapInstance])

  const guideAvailability: Record<GuideLayerKey, boolean> = {
    translations: translationCount > 0,
    etymology: hasPlayableLineage,
    descendants: hasPlayableLineage,
    protoZones: true,
    families: true,
  }
  const translationHeavy = translationCount >= 25 && translationBreadth >= 10
  // If an Inspire-Me category was provided, prefer mapping it to a guided layer.
  const mapCategoryToLayer = (cat?: string | null): GuideLayerKey | null => {
    if (!cat) return null
    const c = cat.toLowerCase()
    if (c.includes('translation') || c.includes('most_translations') || c.includes('translations')) return 'translations'
    if (c.includes('longest') || c.includes('long')) return 'families'
    if (c.includes('descend') || c.includes('most_descendants')) return 'descendants'
    // fallback: null
    return null
  }

  const inspiredLayer = mapCategoryToLayer(inspireCategory)

  const recommendedLayer: GuideLayerKey = inspiredLayer ?? (translationHeavy
    ? 'translations'
    : hasPlayableLineage
      ? 'etymology'
      : translationCount > 0
        ? 'translations'
        : 'protoZones')
  const recommendationLoading =
    guideOpen &&
    guideLayer === null &&
    (wordDataLoading || languoidDataLoading || wordDataResolvedKey !== currentWordKey)
  const recommendationReason = translationHeavy
    ? `There are ${translationCount} translation markers and ${lineageNodeCount} lineage node${lineageNodeCount === 1 ? '' : 's'}. The translations layer gives the broader first view.`
    : hasPlayableLineage
      ? `This word already has a timeline path with ${lineageNodeCount} node${lineageNodeCount === 1 ? '' : 's'}, so the etymology layer gives the richest first look.`
      : translationCount > 0
        ? `There are ${translationCount} translation marker${translationCount === 1 ? '' : 's'} loaded, so the translations layer gives a quick geographic overview.`
        : 'No translation markers are loaded yet, so start with a broader geographic layer.'
  // TODO (Timeline Scrubber & Playback State):
  //  - [ ] Derive highlightedCountries (Set) from full lineage once computed; derive focusedCountries from currentIndex.
  //  - [ ] Provide callback to <EtymologyLineagePath /> for node click -> setCurrentIndex.
  //  - [ ] Render <EtymologyTimelineScrubber /> fixed at bottom: ticks, drag, play/pause (currently inside map; relocate outside LayersControl).
  //  - [ ] Handle word/language change: reset index, stop playback, clear timers (partially handled; review edge cases).
  // TODO (Playback Pause & Tooltip Lifecycle):
  //  - [ ] Introduce distinct animation vs dwell durations (currently combined into playSpeed + dwell).
  //  - [ ] Provide a user toggle (e.g., "Show all tooltips at end").
  //  - [ ] If user scrubs manually, explicitly cancel pending dwell (interval cancellation partly covers this; verify behavior).

  useEffect(() => {
    if (hydratedFromSharedStateRef.current) {
      hydratedFromSharedStateRef.current = false
      return
    }

    updateMapState(current => ({
      camera: current.camera,
      currentWord: {
        word,
        language,
        key: `${word}::${language}`,
      },
      selectedItem: { kind: 'none' },
      activeLayers: {
        ...current.activeLayers,
        translations: false,
        protoZones: false,
        descendants: false,
        languageFamilies: false,
        etymology: false,
      },
      filters: {
        ...current.filters,
        guideOpen: shouldOpenGuideOnLoad,
        guideLayer: null,
        etymologyRequested: false,
        currentIndex: undefined,
        isPlaying: false,
        showAllPopups: false,
        annotationMode: false,
        annotationTool: 'note',
      },
      annotations: [],
    }))
  }, [shouldOpenGuideOnLoad, word, language])

  useEffect(() => {
    onGuideOpenRegister?.(() => () => {
      setGuideLayer(null)
      setFilterState({ guideOpen: true })
    })

    return () => {
      onGuideOpenRegister?.(null)
    }
  }, [onGuideOpenRegister])

  useEffect(() => {
    if (!guideLayer) return

    setActiveLayerState({
      translations: guideLayer === 'translations',
      protoZones: guideLayer === 'protoZones',
      descendants: guideLayer === 'descendants',
      languageFamilies: guideLayer === 'families',
      etymology: guideLayer === 'etymology',
    })

    if (guideLayer === 'etymology') {
      setFilterState({ etymologyRequested: true })
    } else {
      setFilterState({ currentIndex: undefined, isPlaying: false, showAllPopups: false, annotationMode: false, annotationTool: 'note' })
    }
  }, [guideLayer, setActiveLayerState, setFilterState])

  useEffect(() => {
    const map = mapInstance
    const group = translationGroup
    if (!map || !group) return
    const onAdd = (e: L.LayersControlEvent) => {
      if (e.layer === group) setActiveLayerState({ translations: true })
    }
    const onRemove = (e: L.LayersControlEvent) => {
      if (e.layer === group) setActiveLayerState({ translations: false })
    }
    map.on('overlayadd', onAdd)
    map.on('overlayremove', onRemove)
    setActiveLayerState({ translations: map.hasLayer(group) })
    return () => {
      map.off('overlayadd', onAdd)
      map.off('overlayremove', onRemove)
    }
  }, [mapInstance, translationGroup, setActiveLayerState])

  useEffect(() => {
    const map = mapInstance
    const group = protoZonesGroup
    if (!map || !group) return
    const onAdd = (e: L.LayersControlEvent) => {
      if (e.layer === group) setActiveLayerState({ protoZones: true })
    }
    const onRemove = (e: L.LayersControlEvent) => {
      if (e.layer === group) setActiveLayerState({ protoZones: false })
    }
    map.on('overlayadd', onAdd)
    map.on('overlayremove', onRemove)
    setActiveLayerState({ protoZones: map.hasLayer(group) })
    return () => {
      map.off('overlayadd', onAdd)
      map.off('overlayremove', onRemove)
    }
  }, [mapInstance, protoZonesGroup, setActiveLayerState])

  useEffect(() => {
    const map = mapInstance
    const group = descendantPathsGroup
    if (!map || !group) return
    const onAdd = (e: L.LayersControlEvent) => {
      if (e.layer === group) setActiveLayerState({ descendants: true })
    }
    const onRemove = (e: L.LayersControlEvent) => {
      if (e.layer === group) setActiveLayerState({ descendants: false })
    }
    map.on('overlayadd', onAdd)
    map.on('overlayremove', onRemove)
    setActiveLayerState({ descendants: map.hasLayer(group) })
    return () => {
      map.off('overlayadd', onAdd)
      map.off('overlayremove', onRemove)
    }
  }, [mapInstance, descendantPathsGroup, setActiveLayerState])

  useEffect(() => {
    if (Array.isArray(wordData?.translations) && languoidData.length) {
      processTranslations(wordData.translations, languoidData, setMarkers)
    }
    if (Array.isArray(wordData?.etymology_templates) && languoidData.length) {
      processEtymologyLineage(
        wordData?.etymology_templates,
        languoidData,
        wordData.word,
        wordData.lang_code,
      ).then(root => {
        if (root && typeof wordData.lang === 'string' && wordData.lang?.trim()) {
          // Walk to tail node (the target word) regardless of lineage direction.
          let tail = root
          while (tail.next) tail = tail.next
          if (tail.expansion === tail.word) {
            tail.expansion = `${wordData.lang} ${tail.word}`
          }
        }
        setLineage(root)
        // Reset playback-related state for new lineage
        setFilterState({
          currentIndex: undefined,
          isPlaying: false,
          showAllPopups: false,
          guideOpen: openGuideOnLoad,
          guideLayer: null,
          etymologyRequested: false,
          annotationMode: false,
          annotationTool: 'note',
        })
        setActiveLayerState({
          translations: false,
          protoZones: false,
          descendants: false,
          etymology: false,
          languageFamilies: false,
        })
      })
    }
  }, [openGuideOnLoad, wordData, languoidData])

  useEffect(() => {
    const map = mapInstance
    if (!map) return

    const layerAvailability: Array<{ label: string; enabled: boolean; description: string }> = [
      {
        label: 'Translations',
        enabled: guideAvailability.translations,
        description: 'Shows translation markers for related languages and regions.',
      },
      {
        label: 'Etymology Lineage Path',
        enabled: guideAvailability.etymology,
        description: 'Animates the word’s etymology path step by step over time.',
      },
      {
        label: 'Descendant Paths',
        enabled: guideAvailability.descendants,
        description: 'Highlights how the word branches into descendant forms.',
      },
      {
        label: 'Proto-Language Zones',
        enabled: guideAvailability.protoZones,
        description: 'Shows estimated proto-language regions on the map.',
      },
      {
        label: 'Language Families',
        enabled: guideAvailability.families,
        description: 'Displays broad family-level geographic groupings.',
      },
    ]

    const layerLabels = Array.from(
      map.getContainer().querySelectorAll<HTMLLabelElement>('.leaflet-control-layers-overlays label'),
    )

    layerLabels.forEach(label => {
      const labelText = label.textContent?.replace(/\s+/g, ' ').trim()
      const availability = layerAvailability.find(item => item.label === labelText)
      if (!availability) return

      const disabled = !availability.enabled
      label.dataset.layerDisabled = disabled ? 'true' : 'false'
      label.setAttribute('aria-disabled', String(disabled))
      label.title = disabled
        ? 'No data available for this layer'
        : availability.description

      const input = label.querySelector<HTMLInputElement>('input[type="checkbox"]')
      if (input) {
        input.disabled = disabled
        input.tabIndex = disabled ? -1 : 0
        input.setAttribute('aria-disabled', String(disabled))
      }
    })
  }, [mapInstance, guideAvailability])

  const moveLayer = (layer: MapLayerKey, direction: 'up' | 'down') => {
    setActiveLayerState({
      order: (() => {
        const nextOrder = [...layerOrder]
        const currentIndex = nextOrder.indexOf(layer)
        if (currentIndex < 0) return nextOrder
        const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
        if (targetIndex < 0 || targetIndex >= nextOrder.length) return nextOrder
        const [item] = nextOrder.splice(currentIndex, 1)
        nextOrder.splice(targetIndex, 0, item)
        return nextOrder
      })(),
    })
  }

  const resetLayers = () => {
    setActiveLayerState({
      translations: false,
      protoZones: false,
      descendants: false,
      languageFamilies: false,
      etymology: false,
      opacities: defaultMapLayerOpacities,
      order: defaultMapLayerOrder,
    })
    setFilterState({
      currentIndex: undefined,
      isPlaying: false,
      showAllPopups: false,
      etymologyRequested: false,
      annotationMode: false,
      annotationTool: 'note',
    })
    setSelectedItem({ kind: 'none' })
    setGuideLayer(null)
    announce('Layer settings restored to defaults')
  }

  useEffect(() => {
    if (!lineage || !mapState.filters.etymologyRequested || !showEtymologyLineage || guideOpen) return
    const nodes = flattenLineage(lineage)
    if (nodes.length < 1) return
    if (currentIndex !== undefined) return

    setFilterState({ currentIndex: 0, isPlaying: true, showAllPopups: false })
  }, [currentIndex, guideOpen, lineage, mapState.filters.etymologyRequested, setFilterState, showEtymologyLineage])

  // Playback effect (optimized with dwell pause and popup lifecycle).
  useEffect(() => {
    if (!isPlaying || !lineage) return
    const nodes = flattenLineage(lineage)
    if (!nodes.length) return
    const maxIndex = nodes.length - 1

    // Clear any existing timer before scheduling a new sequence.
    if (playbackTimerRef.current) {
      clearTimeout(playbackTimerRef.current)
      playbackTimerRef.current = null
    }

    // If starting fresh (full view), reset and begin at 0.
    const startIndex = currentIndex === undefined ? 0 : currentIndex
    // Begin new run -> ensure we hide the final all-popups state.
    setFilterState({ showAllPopups: false })

    const transitionMs = playSpeed // (potential future: separate growth vs fade)
    const dwellMs = dwellDurationRef.current
    const stepTotal = transitionMs + dwellMs

    let cancelled = false

    const schedule = (idx: number) => {
      if (cancelled) return
      setFilterState({ currentIndex: idx })
      // Schedule next advance after combined transition + dwell.
      playbackTimerRef.current = window.setTimeout(() => {
        if (cancelled) return
        if (idx < maxIndex) {
          schedule(idx + 1)
        } else {
          // Reached end
          if (loop) {
            schedule(0)
          } else {
            // Show all popups and stop playback (keep final index so last marker is included).
            setFilterState({ showAllPopups: true, isPlaying: false })
          }
        }
      }, stepTotal)
    }

    schedule(startIndex)

    return () => {
      cancelled = true
      if (playbackTimerRef.current) {
        clearTimeout(playbackTimerRef.current)
        playbackTimerRef.current = null
      }
    }
  }, [isPlaying, playSpeed, lineage, loop, currentIndex, setFilterState])

  // Auto-pan + dynamic zoom assistance for small geographic jumps.
  useEffect(() => {
    if (!mapInstance || currentIndex === undefined || !lineage) return
    const nodes = flattenLineage(lineage)
    if (currentIndex < 0 || currentIndex >= nodes.length) return

    const currentNode = nodes[currentIndex]
    const currentPos = currentNode.position // [lat, lng]
    if (!currentPos) return

    try {
      const map = mapInstance
      const baseZoom = map.getZoom()
      const MIN_DETAIL_ZOOM = 4 // first-level detail when starting playback
      const MIN_SEGMENT_PX = 140 // desired on-screen minimum distance for a hop
      const REVERT_SEGMENT_PX = 400 // if a hop is this large, consider zooming back out
      const MAX_AUTO_ZOOM = 5.5 // hard cap to avoid excessive zoom-in

      const prevIndex = currentIndex > 0 ? currentIndex - 1 : null
      const prevPos = prevIndex != null ? nodes[prevIndex]?.position : null

      if (isPlaying) {
        // Playback center motion is now owned by the active segment frame callback.
        return
      }

      // Manual scrubbing retains the existing repositioning behavior.
      if (!hasAdjustedZoomRef.current && baseZoom < MIN_DETAIL_ZOOM) {
        hasAdjustedZoomRef.current = true
        map.flyTo([currentPos[0], currentPos[1]], MIN_DETAIL_ZOOM, { duration: 0.9 })
        return
      }

      // If we have a previous position, we can compute on-screen pixel distance.
      if (prevPos) {
        const projectDist = (zoom: number) => {
          // Leaflet expects (lat,lng)
          const a = map
            .project(L.latLng(prevPos[0], prevPos[1]), zoom)
            .subtract(map.project(L.latLng(currentPos[0], currentPos[1]), zoom))
          return Math.hypot(a.x, a.y)
        }
        const distNow = projectDist(baseZoom)

        // Small jump: progressively zoom in until segment length reaches threshold or we hit max.
        if (distNow < MIN_SEGMENT_PX) {
          if (autoZoomBaselineRef.current == null) autoZoomBaselineRef.current = baseZoom
          let targetZoom = baseZoom
          while (targetZoom < MAX_AUTO_ZOOM && projectDist(targetZoom) < MIN_SEGMENT_PX) {
            targetZoom += 0.5 // half-step granularity for smoother animation
          }
          // Midpoint center so both previous & current remain visible providing context.
          const mid: [number, number] = [
            (prevPos[0] + currentPos[0]) / 2,
            (prevPos[1] + currentPos[1]) / 2,
          ]
          if (targetZoom !== baseZoom) {
            lastAutoZoomInRef.current = targetZoom
            map.flyTo(mid, targetZoom, { duration: 0.75 })
          } else {
            // Even at max; just pan to midpoint for consistency.
            map.panTo(mid, { animate: true, duration: 0.75 })
          }
        } else {
          // Large enough distance: pan directly to current node. Optionally revert previous auto-zoom.
          // Decide if we should revert (hysteresis): only revert if we previously auto-zoomed and distance is comfortably large.
          if (
            autoZoomBaselineRef.current != null &&
            lastAutoZoomInRef.current != null &&
            distNow > REVERT_SEGMENT_PX &&
            baseZoom > autoZoomBaselineRef.current + 0.1
          ) {
            // Revert to baseline while centering at currentPos.
            map.flyTo([currentPos[0], currentPos[1]], autoZoomBaselineRef.current, {
            })
            lastAutoZoomInRef.current = null
            autoZoomBaselineRef.current = null
          } else {
            map.panTo([currentPos[0], currentPos[1]], { animate: true, duration: 0.9 })
          }
        }
      } else {
        // No previous node (first node) -> simple pan (or ensure min detail already handled above).
        map.panTo([currentPos[0], currentPos[1]], { animate: true, duration: 0.9 })
      }
    } catch {
      // swallow map errors
    }

  }, [currentIndex, lineage, mapInstance])

  // Stop playback if lineage removed or user selects Full (undefined).
  useEffect(() => {
    if (currentIndex === undefined && isPlaying) {
      setFilterState({ isPlaying: false })
    }
    if (currentIndex === undefined) {
      // Allow a fresh zoom-in next time playback begins
      hasAdjustedZoomRef.current = false
      // Reset auto-zoom state so a new lineage playback starts clean.
      autoZoomBaselineRef.current = null
      lastAutoZoomInRef.current = null
    }
  }, [currentIndex, isPlaying, setFilterState])

  // Stop timers on unmount
  useEffect(() => {
    return () => {
      if (playbackTimerRef.current) clearTimeout(playbackTimerRef.current)
    }
  }, [])

  // Bind to overlay add/remove for the Language Families overlay so we can mount/unmount bubbles SVG
  useEffect(() => {
    const map = mapInstance
    const group = languageFamiliesGroup
    if (!map || !group) return
    const onAdd = (e: L.LayersControlEvent) => {
      if (e.layer === group) setActiveLayerState({ languageFamilies: true })
    }
    const onRemove = (e: L.LayersControlEvent) => {
      if (e.layer === group) setActiveLayerState({ languageFamilies: false })
    }
    map.on('overlayadd', onAdd)
    map.on('overlayremove', onRemove)
    // initialize based on whether the group is currently on the map
    setActiveLayerState({ languageFamilies: map.hasLayer(group) })
    return () => {
      map.off('overlayadd', onAdd)
      map.off('overlayremove', onRemove)
    }
  }, [mapInstance, languageFamiliesGroup, setActiveLayerState])

  // Mirror the etymology overlay state so the timeline scrubber only shows while that layer is visible.
  useEffect(() => {
    const map = mapInstance
    const group = etymologyLineageGroup
    if (!map || !group) return
    const onAdd = (e: L.LayersControlEvent) => {
      if (e.layer === group) setActiveLayerState({ etymology: true })
    }
    const onRemove = (e: L.LayersControlEvent) => {
      if (e.layer === group) {
        setActiveLayerState({ etymology: false })
        setFilterState({ isPlaying: false, currentIndex: undefined, showAllPopups: false })
      }
    }
    map.on('overlayadd', onAdd)
    map.on('overlayremove', onRemove)
    return () => {
      map.off('overlayadd', onAdd)
      map.off('overlayremove', onRemove)
    }
  }, [mapInstance, etymologyLineageGroup, setActiveLayerState, setFilterState])

  useEffect(() => {
    if (!mapInstance) return

    const syncCamera = () => {
      const center = mapInstance.getCenter()
      setCameraState([center.lat, center.lng], mapInstance.getZoom())
    }

    syncCamera()
    mapInstance.on('moveend zoomend', syncCamera)
    return () => {
      mapInstance.off('moveend zoomend', syncCamera)
    }
  }, [mapInstance, setCameraState])

  useEffect(() => {
    if (currentIndex === undefined || !lineage) {
      setSelectedItem({ kind: 'none' })
      return
    }

    const nodes = flattenLineage(lineage)
    const currentNode = nodes[currentIndex]
    if (!currentNode) return

    setSelectedItem({
      kind: 'lineage-node',
      index: currentIndex,
      word: currentNode.word,
      language: currentNode.lang_code,
    })
  }, [currentIndex, lineage, setSelectedItem])

  const selectedTranslationIndex = mapState.selectedItem.kind === 'translation-marker'
    ? mapState.selectedItem.index
    : null
  const selectedLineageIndex = mapState.selectedItem.kind === 'lineage-node'
    ? mapState.selectedItem.index
    : null

  useEffect(() => {
    if (!lineage || currentIndex === undefined) return

    const nodes = flattenLineage(lineage)
    const currentNode = nodes[currentIndex]
    if (!currentNode) return

    const label = `${currentNode.word} (${currentNode.lang_code})`
    announce(isPlaying
      ? `Playback step ${currentIndex + 1} of ${nodes.length}: ${label}`
      : `Timeline focused on step ${currentIndex + 1} of ${nodes.length}: ${label}`)
  }, [announce, currentIndex, isPlaying, lineage])

  const handleMarkerSelect = useCallback((marker: TranslationMarker, index: number) => {
    const popupText = marker.popupText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    setSelectedItem({
      kind: 'translation-marker',
      index,
      label: marker.popupText,
    })
    announce(`Selected translation marker ${index + 1}${popupText ? `: ${popupText}` : ''}`)
  }, [announce, setSelectedItem])

  const handleNodeSelect = useCallback((node: EtymologyNode, index: number) => {
    setFilterState({ currentIndex: index })
    setSelectedItem({
      kind: 'lineage-node',
      index,
      word: node.word,
      language: node.lang_code,
    })
  }, [setFilterState, setSelectedItem])

  const fitToData = useCallback(() => {
    if (!mapInstance) return

    const positions: [number, number][] = []

    if (showTranslations) {
      positions.push(...markers.map(marker => marker.position))
    }

    if (showEtymologyLineage) {
      positions.push(...lineageCoordinates())
    }

    if (showDescendantPaths) {
      positions.push(...descendantCoordinates)
    }

    if (!positions.length) return

    const map = mapInstance
    const bounds = L.latLngBounds(positions.map(position => L.latLng(position[0], position[1])))

    if (bounds.isValid() && bounds.getNorthEast().equals(bounds.getSouthWest())) {
      map.flyTo(bounds.getCenter(), Math.max(map.getZoom(), 5), { duration: 0.8 })
      return
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.15), {
        animate: true,
        duration: 0.8,
        maxZoom: 8,
      })
    }
  }, [descendantCoordinates, lineageCoordinates, markers, mapInstance, showDescendantPaths, showEtymologyLineage, showTranslations])

  const canFitToData = showTranslations || showEtymologyLineage || showDescendantPaths

  return (
    <section
      id="geospatial"
      className={isLight ? 'h-[calc(100vh-4rem)] w-full overflow-hidden bg-white text-slate-900' : 'h-[calc(100vh-4rem)] w-full overflow-hidden bg-gray-900 text-white'}
    >
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {liveMessage}
      </div>
      <MapContainer
        center={initialCameraCenterRef.current}
        zoom={initialCameraZoomRef.current}
        minZoom={2}
        scrollWheelZoom={true}
        wheelPxPerZoomLevel={240}
        className="relative w-full h-full"
        style={{ background: isLight ? '#f8fafc' : '#0b0f1a' }}
        id="map-root"
      >
        <MapInstanceRegistrar onReady={handleMapReady} />
        <GeospatialSettingsMenu
          markers={markers}
          lineage={lineage}
          word={word}
          language={language}
          mapInstance={mapInstance}
          canFitToData={canFitToData}
          onFitToData={() => {
            fitToData()
            announce('Map fitted to visible data')
          }}
          layerOpacities={layerOpacities}
          onLayerOpacityChange={(layer, opacity) => {
            setActiveLayerState({ opacities: { ...layerOpacities, [layer]: opacity } })
            announce(`${layer} opacity set to ${Math.round(opacity * 100)} percent`)
          }}
          layerOrder={layerOrder}
          onLayerMove={(layer, direction) => {
            moveLayer(layer, direction)
            announce(`${layer} moved ${direction}`)
          }}
          onResetLayers={resetLayers}
          annotationMode={mapState.filters.annotationMode}
          annotationTool={mapState.filters.annotationTool}
          annotationCount={annotations.length}
          onAnnotationModeChange={enabled => {
            setAnnotationMode(enabled)
            announce(`Annotation mode ${enabled ? 'enabled' : 'disabled'}`)
          }}
          onAnnotationToolChange={tool => {
            setAnnotationTool(tool)
            announce(`Annotation tool set to ${tool}`)
          }}
          onClearAnnotations={() => {
            updateMapState(current => ({
              ...current,
              annotations: [],
            }))
            announce('Annotations cleared')
          }}
          theme={theme}
        />
        <AnnotationModeOverlay
          enabled={mapState.filters.annotationMode}
          tool={mapState.filters.annotationTool}
          annotations={annotations}
          onAnnotationsChange={nextAnnotations => {
            updateMapState(current => ({
              ...current,
              annotations: nextAnnotations,
            }))
          }}
          onToolChange={setAnnotationTool}
          onAnnounce={announce}
          theme={theme}
        />
        <LayersControl position="topright">
          {/* Base Layers */}
          <LayersControl.BaseLayer checked={theme === 'dark'} name="Dark (CartoDB)">
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              subdomains={['a', 'b', 'c', 'd']}
              maxZoom={20}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer checked={theme === 'light'} name="Light (OSM)">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
          </LayersControl.BaseLayer>
          {/* GeoJSON export button added; future: standardized dynamic layer ingestion. */}
          {/* TODO [LOW LEVEL]: Add a file/URL loader for GeoJSON and render via GeoJSON component with style options. */}
          {/* Country highlighting now limited to lineage-related countries only (no global hover). */}
          {/* General Etymology Markers Layer */}
          <LayersControl.Overlay checked={showTranslations} name="Translations">
            <MarkerClusterGroup
              ref={(instance: L.LayerGroup | null) => setTranslationGroup(instance)}
              clusterPane="translations"
            >
              {showTranslations && (
                <TranslationMarkers
                  markers={markers}
                  opacity={layerOpacities.translations}
                  zIndex={layerZIndex('translations')}
                  onMarkerClick={handleMarkerSelect}
                  selectedIndex={selectedTranslationIndex}
                />
              )}
            </MarkerClusterGroup>
          </LayersControl.Overlay>
          {/* Proto-Language Zones overlay from public/proto_regions.geojson */}
          <LayersControl.Overlay checked={showProtoZones} name="Proto-Language Zones">
            <LayerGroup ref={(instance: L.LayerGroup | null) => setProtoZonesGroup(instance)}>
              {showProtoZones && (
                <ProtoLanguageZones
                  path="/proto_regions.geojson"
                  opacity={layerOpacities.protoZones}
                  zIndex={layerZIndex('protoZones')}
                />
              )}
            </LayerGroup>
          </LayersControl.Overlay>
          {/* Language Families polygons from Glottolog-derived hulls */}
          <LayersControl.Overlay checked={showLanguageFamilies} name="Language Families">
            <LayerGroup ref={(instance: L.LayerGroup | null) => setLanguageFamiliesGroup(instance)}>
              {showLanguageFamilies && (
                <LanguageFamiliesBubbles
                  path="/language_families.geojson"
                  opacity={layerOpacities.languageFamilies}
                  zIndex={layerZIndex('languageFamilies')}
                />
              )}
            </LayerGroup>
          </LayersControl.Overlay>
          {/* Etymology Lineage Path Layer (includes associated country highlights) */}
          <LayersControl.Overlay checked={showEtymologyLineage} name="Etymology Lineage Path">
            <LayerGroup ref={(instance: L.LayerGroup | null) => setEtymologyLineageGroup(instance)}>
              {showEtymologyLineage && (
                <>
                  <LineageCountryHighlights
                    lineage={lineage}
                    currentIndex={currentIndex}
                    opacity={layerOpacities.etymology}
                    zIndex={layerZIndex('etymology')}
                  />
                  <EtymologyLineagePath
                    lineage={lineage}
                    currentIndex={currentIndex}
                    selectedIndex={selectedLineageIndex}
                    isPlaying={isPlaying}
                    segmentDurationMs={playSpeed}
                    dwellMs={dwellDurationRef.current}
                    showAllPopups={showAllPopups}
                    opacity={layerOpacities.etymology}
                    zIndex={layerZIndex('etymology')}
                    onNodeClick={handleNodeSelect}
                  />
                </>
              )}
            </LayerGroup>
          </LayersControl.Overlay>
          {/* Descendant paths from ancestor (all branches) */}
          <LayersControl.Overlay checked={showDescendantPaths} name="Descendant Paths">
            <LayerGroup ref={(instance: L.LayerGroup | null) => setDescendantPathsGroup(instance)}>
              {showDescendantPaths && (
                <DescendantLineagePaths
                  rootWord={word || (lineage?.word ?? '')}
                  rootLang={language || (lineage?.lang_code ?? '')}
                  opacity={layerOpacities.descendants}
                  zIndex={layerZIndex('descendants')}
                  onVisibleCoordinatesChange={setDescendantCoordinates}
                />
              )}
            </LayerGroup>
          </LayersControl.Overlay>
          {/* TODO (Timeline UI): After implementing, mount timeline scrubber outside LayersControl for fixed positioning. */}
          {/* TODO [HIGH LEVEL]: Trade-route path types (land/sea) with arrows and timestamps to show diffusion. */}
          {/* TODO [LOW LEVEL]: Extend lineage nodes with route metadata and render dashed patterns and directional arrows. */}
          {/* TODO [HIGH LEVEL]: Filters (time slider, region, language family) to declutter map; uncertainty styling. */}
          {/* TODO [LOW LEVEL]: Add a control panel to filter markers by decade/region and desaturate uncertain items. */}
        </LayersControl>
        {showEtymologyLineage && lineage && (
          <TimelineScrubber
            lineage={lineage}
            currentIndex={currentIndex}
            onChange={index => setFilterState({ currentIndex: index })}
            isPlaying={isPlaying}
            onTogglePlay={() => {
              setFilterState({ isPlaying: !isPlaying })
              announce(isPlaying ? 'Playback paused' : 'Playback started')
            }}
            speed={playSpeed}
            onSpeedChange={speed => {
              setFilterState({ playSpeedMs: speed })
              announce(`Playback speed set to ${speed} milliseconds per step`)
            }}
            loop={loop}
            onToggleLoop={() => {
              setFilterState({ loop: !loop })
              announce(loop ? 'Loop disabled' : 'Loop enabled')
            }}
            onReset={() => {
              setFilterState({ currentIndex: undefined, isPlaying: false, showAllPopups: false })
              announce('Timeline reset to full view')
            }}
            theme={theme}
          />
        )}
        <GeospatialGuideOverlay
          open={guideOpen}
          selectedLayer={guideLayer}
          recommendedLayer={recommendedLayer}
          recommendationLoading={recommendationLoading}
          recommendationReason={recommendationReason}
          availability={guideAvailability}
          onChooseLayer={(layer: GuideLayerKey) => {
            setGuideLayer(layer)
            setFilterState({ guideOpen: true })
            announce(`Guide layer selected: ${layer}`)
          }}
          onCloseGuide={() => {
            setFilterState({ guideOpen: false })
            announce('Guide closed')
          }}
          onClose={() => {
            setFilterState({ guideOpen: false })
            announce('Guide closed')
          }}
          onRestart={() => {
            setGuideLayer(null)
            setFilterState({
              etymologyRequested: false,
              currentIndex: undefined,
              isPlaying: false,
              showAllPopups: false,
              annotationMode: false,
              annotationTool: 'note',
            })
            setActiveLayerState({ etymology: false })
            announce('Guide restarted')
          }}
          theme={theme}
        />
      </MapContainer>
    </section>
  )
}

export default GeospatialPage
