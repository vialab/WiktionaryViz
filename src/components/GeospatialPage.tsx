import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { Circle, MapContainer, Marker, Polygon, Polyline, Rectangle, TileLayer, useMap } from 'react-leaflet'

const cartoApiKey = import.meta.env.VITE_CARTO_API_KEY?.trim()
const cartoDarkTileUrl = `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png${cartoApiKey ? `?key=${encodeURIComponent(cartoApiKey)}` : ''}`

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
import MarkerEvidenceDrawer from './geospatial/MarkerEvidenceDrawer'
import AnnotationModeOverlay from './geospatial/AnnotationModeOverlay'
import CommandPalette, { type CommandPaletteAction } from './geospatial/CommandPalette'
import type { EtymologyNode } from '@/types/etymology'
import type { LanguoidData } from '@/types/languoid'
import type { Translation } from '@/utils/mapUtils'
import type { SavedViewRecord } from '@/utils/savedViews'
import { decodeShareableStateFromSearch } from '@/utils/shareableState'
import {
  buildCurrentMapExportBundle,
  buildSvgFromCanvas,
  captureMapCanvas,
  downloadJson,
  downloadSvg,
} from '@/utils/mapExport'

import {
  createInitialMapState,
  defaultMapLayerOpacities,
  defaultMapLayerOrder,
  type AnnotationColor,
  type AnnotationKind,
  type MapAnnotation,
  type GuideLayerKey,
  type MapLayerKey,
  type MapSelection,
  type MapState,
} from '@/types/mapState'
import { buildWiktionaryUrl } from '@/utils/mapUtils'

const layerOrderStep = 20
const layerOrderBase = 500

const MapInstanceRegistrar = ({ onReady }: { onReady: (map: L.Map) => void }) => {
  const map = useMap()

  useEffect(() => {
    onReady(map)
  }, [map, onReady])

  return null
}

const MinimapSizeInvalidator = () => {
  const map = useMap()

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => {
      map.invalidateSize({ pan: false, animate: false })
    })
    return () => {
      window.cancelAnimationFrame(raf)
    }
  }, [map])

  return null
}

const minimapAnnotationColorValues: Record<AnnotationColor, { stroke: string; fill: string }> = {
  red: { stroke: '#ef4444', fill: '#fca5a5' },
  green: { stroke: '#22c55e', fill: '#86efac' },
  blue: { stroke: '#38bdf8', fill: '#7dd3fc' },
  white: { stroke: '#f8fafc', fill: '#ffffff' },
  black: { stroke: '#111827', fill: '#111827' },
}

const MinimapAnnotations = ({
  annotations,
}: {
  annotations: MapAnnotation[]
}) => (
  <>
    {annotations.map(annotation => {
      const color = minimapAnnotationColorValues[annotation.annotationColor ?? 'red']
      if (annotation.kind === 'note') {
        return (
          <Marker
            key={annotation.id}
            position={annotation.position}
            icon={L.divIcon({
              className: 'annotation-note-icon annotation-export-element',
              html: `<div style="width:10px;height:10px;border-radius:9999px;background:${color.stroke};border:1px solid #fff;box-shadow:0 0 0 1px rgba(2,6,23,.35);"></div>`,
              iconSize: [10, 10],
              iconAnchor: [5, 5],
            })}
            interactive={false}
          />
        )
      }

      if (annotation.kind === 'highlight') {
        return (
          <Circle
            key={annotation.id}
            center={annotation.center}
            radius={annotation.radiusMeters}
            pathOptions={{
              color: color.stroke,
              fillColor: color.fill,
              fillOpacity: 0.22,
              weight: 1,
            }}
            interactive={false}
          />
        )
      }

      if (annotation.kind === 'arrow' || annotation.kind === 'link') {
        return (
          <Polyline
            key={annotation.id}
            positions={[annotation.start, annotation.end]}
            pathOptions={{
              color: color.stroke,
              opacity: 0.85,
              weight: 2,
              dashArray: annotation.kind === 'link' ? '6 6' : undefined,
            }}
            interactive={false}
          />
        )
      }

      if (annotation.kind === 'region') {
        return (
          <Polygon
            key={annotation.id}
            positions={annotation.points}
            pathOptions={{
              color: color.stroke,
              fillColor: color.fill,
              fillOpacity: 0.18,
              weight: 1.5,
            }}
            interactive={false}
          />
        )
      }

      if (annotation.kind === 'freehand') {
        return (
          <Polyline
            key={annotation.id}
            positions={annotation.points}
            pathOptions={{
              color: color.stroke,
              opacity: 0.9,
              weight: 2,
            }}
            interactive={false}
          />
        )
      }

      return null
    })}
  </>
)

const MinimapOverview = ({
  sourceMap,
  markers,
  lineage,
  theme,
  word,
  language,
  currentIndex,
  isPlaying,
  showAllPopups,
  annotations,
  layerOpacities,
  layerVisibility,
}: {
  sourceMap: L.Map | null
  markers: TranslationMarker[]
  lineage: EtymologyNode | null
  theme: 'dark' | 'light'
  word: string
  language: string
  currentIndex: number | undefined
  isPlaying: boolean
  showAllPopups: boolean
  annotations: MapAnnotation[]
  layerOpacities: Record<MapLayerKey, number>
  layerVisibility: {
    translations: boolean
    protoZones: boolean
    languageFamilies: boolean
    etymology: boolean
    descendants: boolean
    annotations: boolean
  }
}) => {
  const [bounds, setBounds] = useState<L.LatLngBounds>(() => (
    sourceMap ? sourceMap.getBounds() : L.latLngBounds([[-90, -180], [90, 180]])
  ))

  useEffect(() => {
    if (!sourceMap) return

    const syncBounds = () => {
      setBounds(sourceMap.getBounds())
    }

    syncBounds()
    sourceMap.on('move zoom', syncBounds)
    return () => {
      sourceMap.off('move zoom', syncBounds)
    }
  }, [sourceMap])

  const isLight = theme === 'light'

  return (
    <div
      className="pointer-events-none absolute bottom-4 right-4 z-[600] overflow-hidden rounded-2xl border border-slate-300/70 bg-slate-950/75 shadow-2xl backdrop-blur-sm"
      style={{ width: 240, height: 120 }}
      aria-label="Map overview"
    >
      <MapContainer
        center={[0, 0]}
        zoom={0}
        minZoom={0}
        maxZoom={0}
        zoomControl={false}
        attributionControl={false}
        dragging={false}
        doubleClickZoom={false}
        scrollWheelZoom={false}
        boxZoom={false}
        keyboard={false}
        className="h-full w-full"
        style={{ background: isLight ? '#f8fafc' : '#020817' }}
      >
        <MinimapSizeInvalidator />
        {theme === 'dark' ? (
          <TileLayer
            url={cartoDarkTileUrl}
            subdomains={['a', 'b', 'c', 'd']}
            attribution=""
          />
        ) : (
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution=""
          />
        )}
        {layerVisibility.translations && (
          <TranslationMarkers markers={markers} />
        )}
        {layerVisibility.protoZones && (
          <ProtoLanguageZones
            path="/proto_regions.geojson"
            opacity={layerOpacities.protoZones}
            zIndex={540}
          />
        )}
        {layerVisibility.languageFamilies && (
          <LanguageFamiliesBubbles
            path="/language_families.geojson"
            opacity={layerOpacities.languageFamilies}
            zIndex={536}
          />
        )}
        {layerVisibility.etymology && lineage && (
          <>
            <LineageCountryHighlights
              lineage={lineage}
              currentIndex={currentIndex}
              opacity={layerOpacities.etymology}
              zIndex={550}
            />
            <EtymologyLineagePath
              lineage={lineage}
              currentIndex={currentIndex}
              isPlaying={isPlaying}
              segmentDurationMs={800}
              dwellMs={1200}
              showAllPopups={showAllPopups}
              opacity={layerOpacities.etymology}
              zIndex={560}
            />
          </>
        )}
        {layerVisibility.descendants && (
          <DescendantLineagePaths
            rootWord={word}
            rootLang={language}
            opacity={layerOpacities.descendants}
            zIndex={562}
          />
        )}
        {layerVisibility.annotations && (
          <MinimapAnnotations annotations={annotations} />
        )}
        <Rectangle
          bounds={bounds}
          pathOptions={{
            color: isLight ? '#0f172a' : '#f8fafc',
            fillOpacity: 0,
            weight: 1.5,
          }}
          interactive={false}
        />
      </MapContainer>
    </div>
  )
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
  onPivotSearch?: (word: string, language: string) => void
  onGuideOpenRegister?: (openGuide: (() => void) | null) => void
  onControlsOpenRegister?: (openControls: (() => void) | null) => void
  initialMapState?: MapState | null
  onMapStateChange?: (state: MapState) => void
  syncedCamera?: MapState['camera'] | null
  savedViews?: SavedViewRecord[]
  onSaveCurrentView?: (name: string) => void
  onLoadSavedView?: (viewId: string) => void
  onRenameSavedView?: (viewId: string, name: string) => void
  onDuplicateSavedView?: (viewId: string) => void
  onDeleteSavedView?: (viewId: string) => void
  onMoveSavedView?: (viewId: string, direction: 'up' | 'down') => void
  onImportSavedView?: (rawJson: string) => boolean
  onExportCurrentView?: () => void
  openGuideOnLoad?: boolean
  theme?: 'dark' | 'light'
  inspireCategory?: string | null
  embedded?: boolean
  instanceId?: string
  compareMode?: boolean
}

/**
 * GeospatialPage visualizes translations and etymology lineage on a map.
 * Uses modular components for maintainability and performance.
 */
const GeospatialPage: React.FC<GeospatialPageProps> = ({
  word,
  language,
  onPivotSearch,
  onGuideOpenRegister,
  onControlsOpenRegister,
  initialMapState,
  onMapStateChange,
  syncedCamera,
  savedViews = [],
  onSaveCurrentView,
  onLoadSavedView,
  onRenameSavedView,
  onDuplicateSavedView,
  onDeleteSavedView,
  onMoveSavedView,
  onImportSavedView,
  onExportCurrentView,
  openGuideOnLoad = true,
  theme = 'dark',
  inspireCategory,
  embedded = false,
  instanceId,
  compareMode = false,
}) => {
  const isLight = theme === 'light'
  const urlInitialMapState = typeof window === 'undefined'
    ? null
    : decodeShareableStateFromSearch(window.location.search).mapState
  const sharedInitialMapState = initialMapState ?? urlInitialMapState
  const currentWordKey = `${word}::${language}`
  const shouldOpenGuideOnLoadRef = useRef(openGuideOnLoad && !sharedInitialMapState)
  const shouldOpenGuideOnLoad = shouldOpenGuideOnLoadRef.current
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
        guideOpen: false,
        annotationMode: sharedInitialMapState.filters?.annotationMode ?? base.filters.annotationMode,
        annotationTool: sharedInitialMapState.filters?.annotationTool ?? base.filters.annotationTool,
        annotationColor: sharedInitialMapState.filters?.annotationColor ?? base.filters.annotationColor,
        annotationCategory: sharedInitialMapState.filters?.annotationCategory ?? base.filters.annotationCategory,
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
  const [descendantCoordinates, setDescendantCoordinates] = useState<[number, number][]>([])
  const [liveMessage, setLiveMessage] = useState('')
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [presentationMode, setPresentationMode] = useState(false)
  const [hideControls, setHideControls] = useState(false)
  const [presentationLabels, setPresentationLabels] = useState(false)
  const [exportIncludeAnnotations, setExportIncludeAnnotations] = useState(true)
  const annotations = mapState.currentWord.key === currentWordKey ? mapState.annotations : []
  const hasAdjustedZoomRef = useRef(false)
  const playbackTimerRef = useRef<number | null>(null)
  const announcementTimerRef = useRef<number | null>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const pendingSyncedCameraRef = useRef<MapState['camera'] | null>(null)
  const sectionRef = useRef<HTMLElement | null>(null)
  const [mainMap, setMainMap] = useState<L.Map | null>(null)
  const handleMapReady = useCallback((instance: L.Map) => {
    if (mapInstanceRef.current === instance) return
    mapInstanceRef.current = instance
    setMainMap(instance)
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
  const showAnnotations = mapState.activeLayers.annotations
  const layerOpacities = mapState.activeLayers.opacities
  const layerOrder = mapState.activeLayers.order
  const activeMapWordKey = mapState.currentWord.key
  const sectionId = instanceId ? `geospatial-${instanceId}` : 'geospatial'
  const mapRootId = instanceId ? `map-root-${instanceId}` : 'map-root'
  const effectiveHideControls = hideControls || presentationMode
  const effectivePresentationLabels = presentationLabels || presentationMode
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

  useEffect(() => {
    const section = sectionRef.current
    if (!section || typeof document === 'undefined') return

    const isFullscreen = document.fullscreenElement === section
    if (presentationMode && !isFullscreen) {
      void section.requestFullscreen?.().catch(() => {})
    }
    if (!presentationMode && isFullscreen) {
      void document.exitFullscreen?.().catch(() => {})
    }
  }, [presentationMode])

  useEffect(() => {
    const handleFullscreenChange = () => {
      const section = sectionRef.current
      if (!section) return
      if (document.fullscreenElement !== section) {
        setPresentationMode(false)
      }
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
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

  const setAnnotationsVisible = useCallback((enabled: boolean) => {
    setActiveLayerState({ annotations: enabled })
  }, [setActiveLayerState])

  const setAnnotationMode = useCallback((enabled: boolean) => {
    setFilterState({ annotationMode: enabled })
    if (enabled) {
      setAnnotationsVisible(true)
    }
  }, [setAnnotationsVisible, setFilterState])

  const setAnnotationTool = useCallback((tool: AnnotationKind) => {
    setFilterState({ annotationTool: tool })
  }, [setFilterState])

  const setAnnotationColor = useCallback((annotationColor: MapState['filters']['annotationColor']) => {
    setFilterState({ annotationColor })
  }, [setFilterState])

  const setAnnotationCategory = useCallback((annotationCategory: MapState['filters']['annotationCategory']) => {
    setFilterState({ annotationCategory })
  }, [setFilterState])

  const toggleLayerVisibility = useCallback((layer: MapLayerKey) => {
    updateMapState(current => ({
      ...current,
      activeLayers: {
        ...current.activeLayers,
        [layer]: !current.activeLayers[layer],
      },
      ...(layer === 'etymology'
        ? {
            filters: {
              ...current.filters,
              etymologyRequested: false,
              currentIndex: undefined,
              isPlaying: false,
              showAllPopups: !current.activeLayers[layer],
            },
          }
        : null),
    }))
  }, [updateMapState])

  const resetView = useCallback(() => {
    if (!mapInstance) return
    mapInstance.flyTo(initialCameraCenterRef.current, initialCameraZoomRef.current, {
      duration: 0.8,
    })
    announce('Map view reset')
  }, [announce, mapInstance])

  const saveShareableState = useCallback(async () => {
    if (typeof window === 'undefined') return
    const shareableUrl = window.location.href
    try {
      await window.navigator.clipboard.writeText(shareableUrl)
      announce('Shareable map link copied to clipboard')
    } catch {
      window.prompt('Copy this shareable map link', shareableUrl)
    }
  }, [announce])

  const exportMapPng = useCallback(async () => {
    if (typeof document === 'undefined') return
    const target = document.getElementById(mapRootId) ?? (document.querySelector('.leaflet-container') as HTMLElement | null)
    if (!target) {
      announce('Map element not found for PNG export')
      return
    }

    try {
      const canvas = await captureMapCanvas(target, { includeAnnotations: exportIncludeAnnotations })
      const fileNameWord = (word && word.trim()) || 'map'
      const fileNameLang = (language && language.trim()) || 'unknown'
      const anchor = document.createElement('a')
      anchor.href = canvas.toDataURL('image/png')
      anchor.download = `${fileNameWord}-${fileNameLang}-map.png`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      announce('PNG export downloaded')
    } catch {
      announce('PNG export failed')
    }
  }, [announce, exportIncludeAnnotations, language, mapRootId, word])

  const exportMapSvg = useCallback(async () => {
    if (typeof document === 'undefined') return
    const target = document.getElementById(mapRootId) ?? (document.querySelector('.leaflet-container') as HTMLElement | null)
    if (!target) {
      announce('Map element not found for SVG export')
      return
    }

    try {
      const canvas = await captureMapCanvas(target, { includeAnnotations: exportIncludeAnnotations })
      const fileNameWord = (word && word.trim()) || 'map'
      const fileNameLang = (language && language.trim()) || 'unknown'
      const svgText = buildSvgFromCanvas(canvas, `${fileNameWord} ${fileNameLang} export`)
      downloadSvg(svgText, `${fileNameWord}-${fileNameLang}-map.svg`)
      announce('SVG export downloaded')
    } catch {
      announce('SVG export failed')
    }
  }, [announce, exportIncludeAnnotations, language, mapRootId, word])

  const exportMapJson = useCallback(() => {
    const fileNameWord = (word && word.trim()) || 'map'
    const fileNameLang = (language && language.trim()) || 'unknown'
    downloadJson(
      buildCurrentMapExportBundle({
        markers,
        lineage,
        annotations,
        mapState,
        includeAnnotations: exportIncludeAnnotations,
      }),
      `${fileNameWord}-${fileNameLang}-map.json`,
    )
    announce('JSON export downloaded')
  }, [announce, annotations, exportIncludeAnnotations, language, lineage, mapState, markers, word])

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

    const translationsClusterPane = mapInstance.getPane('translations-clusters') ?? mapInstance.createPane('translations-clusters')
    translationsClusterPane.style.zIndex = String(layerZIndex('translations') - 20)

    const paneZIndexes: Array<[string, number]> = [
      ['translation-labels', layerZIndex('translations') + 80],
      ['proto-zones', layerZIndex('protoZones')],
      ['language-families-bubbles', layerZIndex('languageFamilies')],
      ['etymology-lineage-lines', layerZIndex('etymology')],
      ['etymology-lineage-markers', layerZIndex('etymology') + 60],
      ['etymology-lineage-labels', layerZIndex('etymology') + 140],
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
  }
  const translationHeavy = translationCount >= 25 && translationBreadth >= 10
  // If an Inspire-Me category was provided, prefer mapping it to a guided layer.
  const mapCategoryToLayer = (cat?: string | null): GuideLayerKey | null => {
    if (!cat) return null
    const c = cat.toLowerCase()
    if (c.includes('translation') || c.includes('most_translations') || c.includes('translations')) return 'translations'
    if (c.includes('descend') || c.includes('most_descendants')) return 'descendants'
    // fallback: null
    return null
  }

  const inspiredLayer = mapCategoryToLayer(inspireCategory)

  const recommendedLayer: GuideLayerKey | null = inspiredLayer ?? (translationHeavy
    ? 'translations'
    : hasPlayableLineage
      ? 'etymology'
      : translationCount > 0
        ? 'translations'
        : null)
  const recommendationLoading =
    guideOpen &&
    guideLayer === null &&
    (wordDataLoading || languoidDataLoading || wordDataResolvedKey !== activeMapWordKey)
  const recommendationReason = translationHeavy
    ? `There are ${translationCount} translation markers and ${lineageNodeCount} lineage node${lineageNodeCount === 1 ? '' : 's'}. The translations layer gives the broader first view.`
    : hasPlayableLineage
      ? `This word already has a timeline path with ${lineageNodeCount} node${lineageNodeCount === 1 ? '' : 's'}, so the etymology layer gives the richest first look.`
      : translationCount > 0
        ? `There are ${translationCount} translation marker${translationCount === 1 ? '' : 's'} loaded, so the translations layer gives a quick geographic overview.`
        : 'No translation markers are loaded yet, so start with a broader geographic layer.'

  const previousWordKeyRef = useRef(currentWordKey)

  useEffect(() => {
    if (previousWordKeyRef.current === currentWordKey) return
    previousWordKeyRef.current = currentWordKey

    updateMapState(current => ({
      ...current,
      currentWord: {
        word,
        language,
        key: currentWordKey,
      },
      selectedItem: { kind: 'none' },
      filters: {
        ...current.filters,
        currentIndex: undefined,
        isPlaying: false,
        showAllPopups: false,
        guideOpen: false,
        guideLayer: null,
        etymologyRequested: false,
        annotationMode: false,
        annotationTool: 'note',
      },
      annotations: [],
    }))
  }, [currentWordKey, language, updateMapState, word])
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
      descendants: guideLayer === 'descendants',
      etymology: guideLayer === 'etymology',
    })

    if (guideLayer === 'etymology') {
      setFilterState({ etymologyRequested: true })
    } else {
      setFilterState({ currentIndex: undefined, isPlaying: false, showAllPopups: false, annotationMode: false, annotationTool: 'note' })
    }
  }, [guideLayer, setActiveLayerState, setFilterState])

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
        if (hydratedFromSharedStateRef.current) {
          hydratedFromSharedStateRef.current = false
          return
        }

        // Reset playback-related state for a newly loaded word.
        setFilterState({
          currentIndex: undefined,
          isPlaying: false,
          showAllPopups: false,
          guideOpen: shouldOpenGuideOnLoad,
          guideLayer: null,
          etymologyRequested: false,
          annotationMode: false,
          annotationTool: 'note',
          annotationCategory: mapState.filters.annotationCategory,
        })
        setActiveLayerState({
          translations: false,
          protoZones: false,
          descendants: false,
          etymology: false,
          languageFamilies: false,
          annotations: true,
        })
        updateMapState(current => ({
          ...current,
          currentWord: {
            word,
            language,
            key: `${word}::${language}`,
          },
          selectedItem: { kind: 'none' },
          annotations: [],
        }))
      })
    }
  }, [mapState.filters.annotationCategory, languoidData, shouldOpenGuideOnLoad, updateMapState, wordData])

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
              duration: 0.75,
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

  useEffect(() => {
    if (!mapInstance) return

    const syncCamera = () => {
      if (pendingSyncedCameraRef.current) {
        const pending = pendingSyncedCameraRef.current
        const center = mapInstance.getCenter()
        const zoom = mapInstance.getZoom()
        const sameCamera = zoom === pending.zoom && center.lat === pending.center[0] && center.lng === pending.center[1]
        if (sameCamera) {
          pendingSyncedCameraRef.current = null
          return
        }
      }

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
    if (!mapInstance || !syncedCamera) return

    const center = mapInstance.getCenter()
    const sameCamera = mapInstance.getZoom() === syncedCamera.zoom && center.lat === syncedCamera.center[0] && center.lng === syncedCamera.center[1]
    if (sameCamera) return

    pendingSyncedCameraRef.current = syncedCamera
    mapInstance.flyTo([syncedCamera.center[0], syncedCamera.center[1]], syncedCamera.zoom, { animate: true, duration: 0.35 })
  }, [mapInstance, syncedCamera])

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
      wiktionaryUrl: buildWiktionaryUrl(currentNode.word),
    })
  }, [currentIndex, lineage, setSelectedItem])

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
      word: marker.word,
      language: marker.language,
      wiktionaryUrl: marker.wiktionaryUrl || buildWiktionaryUrl(marker.word),
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
      wiktionaryUrl: buildWiktionaryUrl(node.word),
    })
  }, [setFilterState, setSelectedItem])

  const handleDescendantNodeSelect = useCallback((node: { word?: string; lang_code?: string | null }, index: number) => {
    if (!node.word || !node.lang_code) return
    setSelectedItem({
      kind: 'descendant-node',
      index,
      word: node.word,
      language: node.lang_code,
      wiktionaryUrl: buildWiktionaryUrl(node.word),
    })
  }, [setSelectedItem])

  const handlePivotFromSelection = useCallback(() => {
    const selectedItem = mapState.selectedItem
    if (selectedItem.kind === 'none') return

    const nextWord = selectedItem.word.trim()
    if (!nextWord) return

    let nextLanguage = selectedItem.language.trim()
    if (selectedItem.kind === 'translation-marker') {
      const marker = markers[selectedItem.index]
      if (marker?.code?.trim()) {
        nextLanguage = marker.code.trim()
      }
    }

    if (!nextLanguage) {
      announce('Cannot pivot search because this node has no language code')
      return
    }

    setFilterState({ currentIndex: undefined, isPlaying: false, showAllPopups: false })
    setSelectedItem({ kind: 'none' })
    onPivotSearch?.(nextWord, nextLanguage)
    announce(`Pivoted search to ${nextWord} (${nextLanguage})`)
  }, [announce, mapState.selectedItem, markers, onPivotSearch, setFilterState, setSelectedItem])

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

  const commandPaletteActions = useMemo<CommandPaletteAction[]>(() => [
    {
      id: 'open-guide',
      label: 'Open geospatial guide',
      description: 'Open the layer guide and recommendation overlay.',
      group: 'Navigation',
      keywords: ['guide', 'layer help', 'onboarding'],
      onSelect: () => {
        setFilterState({ guideOpen: true })
        announce('Guide opened')
      },
    },
    {
      id: 'fit-to-data',
      label: 'Fit to data',
      description: 'Zoom to the currently visible markers, lineage, and descendant paths.',
      group: 'View',
      keywords: ['zoom to data', 'frame data'],
      disabled: !canFitToData,
      onSelect: () => {
        fitToData()
        announce('Map fitted to visible data')
      },
    },
    {
      id: 'reset-view',
      label: 'Reset map view',
      description: 'Return to the default center and zoom for this word.',
      group: 'View',
      keywords: ['reset camera', 'reset zoom'],
      onSelect: () => {
        resetView()
      },
    },
    {
      id: 'copy-shareable-link',
      label: 'Copy shareable link',
      description: 'Copy the current map state URL to the clipboard.',
      group: 'View',
      keywords: ['save view', 'share state', 'copy url'],
      onSelect: () => {
        void saveShareableState()
      },
    },
    {
      id: 'export-map-png',
      label: 'Export map as PNG',
      description: 'Download the current map as a raster image.',
      group: 'Export',
      keywords: ['screenshot', 'image export', 'png'],
      onSelect: () => {
        void exportMapPng()
      },
    },
    {
      id: 'export-map-svg',
      label: 'Export map as SVG',
      description: 'Download the current map as an SVG snapshot.',
      group: 'Export',
      keywords: ['vector export', 'svg'],
      onSelect: () => {
        void exportMapSvg()
      },
    },
    {
      id: 'export-map-json',
      label: 'Export map as JSON',
      description: 'Download the current map data bundle.',
      group: 'Export',
      keywords: ['data export', 'json', 'geojson'],
      onSelect: () => {
        exportMapJson()
      },
    },
    {
      id: 'reset-layers',
      label: 'Reset layers',
      description: 'Restore layer visibility, opacity, and order to defaults.',
      group: 'View',
      keywords: ['clear layers', 'restore defaults'],
      onSelect: () => {
        resetLayers()
      },
    },
    {
      id: 'toggle-presentation-mode',
      label: presentationMode ? 'Exit presentation mode' : 'Enter presentation mode',
      description: 'Toggle fullscreen presentation mode.',
      group: 'View',
      keywords: ['fullscreen', 'present', 'talk mode'],
      onSelect: () => {
        setPresentationMode(current => !current)
      },
    },
    {
      id: 'toggle-hide-controls',
      label: effectiveHideControls ? 'Show controls' : 'Hide controls',
      description: 'Temporarily hide UI chrome on the map.',
      group: 'View',
      keywords: ['chrome', 'screenshot mode', 'minimal ui'],
      onSelect: () => {
        setHideControls(current => !current)
      },
    },
    {
      id: 'toggle-presentation-labels',
      label: effectivePresentationLabels ? 'Standard labels' : 'Presentation labels',
      description: 'Increase label contrast and size for projection.',
      group: 'View',
      keywords: ['high contrast', 'readability', 'labels'],
      onSelect: () => {
        setPresentationLabels(current => !current)
      },
    },
    {
      id: 'toggle-translations-layer',
      label: showTranslations ? 'Hide translations layer' : 'Show translations layer',
      description: 'Toggle translation markers and cluster popups.',
      group: 'Layers',
      keywords: ['toggle labels', 'translation markers', 'markers'],
      onSelect: () => {
        toggleLayerVisibility('translations')
        announce(`Translations layer ${showTranslations ? 'hidden' : 'shown'}`)
      },
    },
    {
      id: 'toggle-etymology-layer',
      label: showEtymologyLineage ? 'Hide etymology layer' : 'Show etymology layer',
      description: 'Toggle the animated lineage path.',
      group: 'Layers',
      keywords: ['show path to root', 'lineage', 'etymology'],
      onSelect: () => {
        toggleLayerVisibility('etymology')
        announce(`Etymology layer ${showEtymologyLineage ? 'hidden' : 'shown'}`)
      },
    },
    {
      id: 'toggle-descendants-layer',
      label: showDescendantPaths ? 'Hide descendant paths' : 'Show descendants',
      description: 'Toggle branching descendant routes on the map.',
      group: 'Layers',
      keywords: ['show descendants', 'descendant paths', 'branching'],
      onSelect: () => {
        toggleLayerVisibility('descendants')
        announce(`Descendant paths ${showDescendantPaths ? 'hidden' : 'shown'}`)
      },
    },
    {
      id: 'toggle-proto-zones',
      label: showProtoZones ? 'Hide proto-language zones' : 'Show proto-language zones',
      description: 'Toggle historical proto-region polygons.',
      group: 'Layers',
      keywords: ['proto regions', 'historical regions', 'zones'],
      onSelect: () => {
        toggleLayerVisibility('protoZones')
        announce(`Proto-language zones ${showProtoZones ? 'hidden' : 'shown'}`)
      },
    },
    {
      id: 'toggle-language-families',
      label: showLanguageFamilies ? 'Hide language families' : 'Show language families',
      description: 'Toggle family bubbles and labels.',
      group: 'Layers',
      keywords: ['family bubbles', 'language families'],
      onSelect: () => {
        toggleLayerVisibility('languageFamilies')
        announce(`Language families ${showLanguageFamilies ? 'hidden' : 'shown'}`)
      },
    },
      {
        id: 'toggle-annotations-layer',
        label: showAnnotations ? 'Hide annotations layer' : 'Show annotations layer',
        description: 'Toggle user-created annotations as their own map layer.',
        group: 'Annotations',
        keywords: ['annotation layer', 'hide notes', 'show notes', 'export annotations'],
        onSelect: () => {
          setAnnotationsVisible(!showAnnotations)
          announce(`Annotations layer ${showAnnotations ? 'hidden' : 'shown'}`)
        },
      },
    {
      id: 'toggle-annotation-mode',
      label: mapState.filters.annotationMode ? 'Disable annotation mode' : 'Enable annotation mode',
      description: 'Switch between exploratory mode and map annotation mode.',
      group: 'Annotations',
      keywords: ['notes', 'highlights', 'arrows', 'regions', 'links'],
      onSelect: () => {
        setAnnotationMode(!mapState.filters.annotationMode)
        announce(`Annotation mode ${mapState.filters.annotationMode ? 'disabled' : 'enabled'}`)
      },
    },
    {
      id: 'annotation-tool-note',
      label: 'Use note tool',
      description: 'Add a text note directly onto the map.',
      group: 'Annotations',
      keywords: ['marker note', 'annotation note'],
      onSelect: () => {
        setAnnotationTool('note')
        announce('Annotation tool set to note')
      },
    },
    {
      id: 'annotation-tool-highlight',
      label: 'Use highlight tool',
      description: 'Mark an area of interest with a highlight.',
      group: 'Annotations',
      keywords: ['highlight area'],
      onSelect: () => {
        setAnnotationTool('highlight')
        announce('Annotation tool set to highlight')
      },
    },
    {
      id: 'annotation-tool-arrow',
      label: 'Use arrow tool',
      description: 'Draw a directional annotation.',
      group: 'Annotations',
      keywords: ['direction', 'arrow annotation'],
      onSelect: () => {
        setAnnotationTool('arrow')
        announce('Annotation tool set to arrow')
      },
    },
    {
      id: 'annotation-tool-freehand',
      label: 'Use freehand tool',
      description: 'Sketch a freehand stroke on the map.',
      group: 'Annotations',
      keywords: ['draw', 'sketch', 'whiteboard'],
      onSelect: () => {
        setAnnotationTool('freehand')
        announce('Annotation tool set to freehand')
      },
    },
    {
      id: 'clear-annotations',
      label: 'Clear annotations',
      description: 'Remove all annotations from the current map state.',
      group: 'Annotations',
      keywords: ['delete notes', 'remove annotations'],
      disabled: annotations.length === 0,
      onSelect: () => {
        updateMapState(current => ({
          ...current,
          annotations: [],
        }))
        announce('Annotations cleared')
      },
    },
  ], [
    annotations.length,
    announce,
    canFitToData,
    fitToData,
    exportMapJson,
    exportMapPng,
    exportMapSvg,
    effectiveHideControls,
    effectivePresentationLabels,
    presentationMode,
    mapState.filters.annotationMode,
    resetLayers,
    resetView,
    saveShareableState,
    setAnnotationMode,
    setAnnotationTool,
    setFilterState,
    showDescendantPaths,
    showEtymologyLineage,
    showLanguageFamilies,
    showProtoZones,
    showTranslations,
    showAnnotations,
    toggleLayerVisibility,
    updateMapState,
    setAnnotationsVisible,
  ])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return

      const target = event.target as HTMLElement | null
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) {
        return
      }

      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandPaletteOpen(current => !current)
        return
      }

      if (event.key === 'Escape' && (presentationMode || effectiveHideControls)) {
        event.preventDefault()
        setPresentationMode(false)
        setHideControls(false)
        return
      }

      if (commandPaletteOpen) return

      if (!event.altKey || event.ctrlKey || event.metaKey) return

      const key = event.key.toLowerCase()
      const shortcutHandlers: Record<string, () => void> = {
        '1': () => toggleLayerVisibility('translations'),
        '2': () => toggleLayerVisibility('etymology'),
        '3': () => toggleLayerVisibility('descendants'),
        '4': () => toggleLayerVisibility('protoZones'),
        '5': () => toggleLayerVisibility('languageFamilies'),
        '6': () => setAnnotationsVisible(!showAnnotations),
        a: () => setAnnotationMode(!mapState.filters.annotationMode),
        f: () => fitToData(),
        r: () => resetView(),
        p: () => setPresentationMode(current => !current),
        h: () => setHideControls(current => !current),
        l: () => setPresentationLabels(current => !current),
        s: () => {
          void saveShareableState()
        },
      }

      const handler = shortcutHandlers[key]
      if (!handler) return

      event.preventDefault()
      handler()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [commandPaletteOpen, effectiveHideControls, fitToData, mapState.filters.annotationMode, presentationMode, resetView, saveShareableState, setAnnotationMode, setAnnotationsVisible, showAnnotations, toggleLayerVisibility])

  return (
    <section
      id={sectionId}
      ref={sectionRef}
      data-hide-map-ui={effectiveHideControls ? 'true' : 'false'}
      data-presentation-mode={presentationMode ? 'true' : 'false'}
      data-presentation-labels={effectivePresentationLabels ? 'true' : 'false'}
      className={embedded ? (isLight ? 'flex h-full min-h-0 w-full flex-col overflow-hidden bg-white text-slate-900' : 'flex h-full min-h-0 w-full flex-col overflow-hidden bg-gray-900 text-white') : (isLight ? 'h-[calc(100vh-4rem)] w-full overflow-hidden bg-white text-slate-900' : 'h-[calc(100vh-4rem)] w-full overflow-hidden bg-gray-900 text-white')}
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
        className={embedded ? 'relative w-full flex-1 min-h-0' : 'relative w-full h-full'}
        style={{ background: isLight ? '#f8fafc' : '#0b0f1a' }}
        id={mapRootId}
      >
        <MapInstanceRegistrar onReady={handleMapReady} />
        <GeospatialSettingsMenu
          markers={markers}
          lineage={lineage}
          annotations={annotations}
          mapState={mapState}
          mapRootId={mapRootId}
          word={word}
          language={language}
          canFitToData={canFitToData}
          onFitToData={() => {
            fitToData()
            announce('Map fitted to visible data')
          }}
          onResetView={resetView}
          onSaveState={saveShareableState}
          onOpenGuide={() => {
            setFilterState({ guideOpen: true })
            announce('Guide opened')
          }}
          layerVisibility={{
            translations: showTranslations,
            protoZones: showProtoZones,
            languageFamilies: showLanguageFamilies,
            etymology: showEtymologyLineage,
            descendants: showDescendantPaths,
          }}
          onLayerToggle={layer => toggleLayerVisibility(layer)}
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
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
          onMarkerSelect={handleMarkerSelect}
          savedViews={savedViews}
          onSaveCurrentView={onSaveCurrentView}
          onLoadSavedView={onLoadSavedView}
          onRenameSavedView={onRenameSavedView}
          onDuplicateSavedView={onDuplicateSavedView}
          onDeleteSavedView={onDeleteSavedView}
          onMoveSavedView={onMoveSavedView}
          onImportSavedView={onImportSavedView}
          onExportCurrentView={onExportCurrentView}
          annotationMode={mapState.filters.annotationMode}
          annotationsVisible={showAnnotations}
          annotationTool={mapState.filters.annotationTool}
          annotationColor={mapState.filters.annotationColor}
          annotationCount={annotations.length}
          onAnnotationModeChange={enabled => {
            setAnnotationMode(enabled)
            announce(`Annotation mode ${enabled ? 'enabled' : 'disabled'}`)
          }}
          onAnnotationsVisibleChange={enabled => {
            setAnnotationsVisible(enabled)
            announce(`Annotations layer ${enabled ? 'shown' : 'hidden'}`)
          }}
          onAnnotationToolChange={tool => {
            setAnnotationTool(tool)
            announce(`Annotation tool set to ${tool}`)
          }}
          onAnnotationColorChange={annotationColor => {
            setAnnotationColor(annotationColor)
            announce(`Annotation colour set to ${annotationColor}`)
          }}
          annotationCategory={mapState.filters.annotationCategory}
          onAnnotationCategoryChange={category => {
            setAnnotationCategory(category)
            announce(`Annotation category set to ${category}`)
          }}
          onClearAnnotations={() => {
            updateMapState(current => ({
              ...current,
              annotations: [],
            }))
            announce('Annotations cleared')
          }}
          exportIncludeAnnotations={exportIncludeAnnotations}
          onExportIncludeAnnotationsChange={setExportIncludeAnnotations}
          presentationMode={presentationMode}
          onPresentationModeChange={setPresentationMode}
          hideControls={hideControls}
          onHideControlsChange={setHideControls}
          presentationLabels={presentationLabels}
          onPresentationLabelsChange={setPresentationLabels}
          theme={theme}
          dockSide="left"
          startCollapsed={compareMode}
          onOpenControlsRegister={onControlsOpenRegister}
        />
        {theme === 'dark' ? (
          <TileLayer
            key="dark"
            url={cartoDarkTileUrl}
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            subdomains={['a', 'b', 'c', 'd']}
            maxZoom={20}
          />
        ) : (
          <TileLayer
            key="light"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        )}
        {/* Country highlighting now limited to lineage-related countries only (no global hover). */}
        {showTranslations && (
          <MarkerClusterGroup
            clusterPane="translations-clusters"
            spiderfyDistanceMultiplier={1.35}
          >
            <TranslationMarkers
              markers={markers}
              onMarkerClick={handleMarkerSelect}
            />
          </MarkerClusterGroup>
        )}
        {showProtoZones && (
          <ProtoLanguageZones
            path="/proto_regions.geojson"
            opacity={layerOpacities.protoZones}
            zIndex={layerZIndex('protoZones')}
          />
        )}
        {showLanguageFamilies && (
          <LanguageFamiliesBubbles
            path="/language_families.geojson"
            opacity={layerOpacities.languageFamilies}
            zIndex={layerZIndex('languageFamilies')}
          />
        )}
        {showEtymologyLineage && lineage && (
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
        {showDescendantPaths && (
          <DescendantLineagePaths
            rootWord={word || (lineage?.word ?? '')}
            rootLang={language || (lineage?.lang_code ?? '')}
            opacity={layerOpacities.descendants}
            zIndex={layerZIndex('descendants')}
            onVisibleCoordinatesChange={setDescendantCoordinates}
            onNodeSelect={(node, pathIndex) => {
              handleDescendantNodeSelect(node, pathIndex)
            }}
          />
        )}
        {showAnnotations && (
          <AnnotationModeOverlay
            enabled={mapState.filters.annotationMode}
            visible={showAnnotations || mapState.filters.annotationMode}
            tool={mapState.filters.annotationTool}
            annotationColor={mapState.filters.annotationColor}
            annotationCategory={mapState.filters.annotationCategory}
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
        )}
        {/* TODO (Timeline UI): After implementing, mount timeline scrubber outside the layer tree for fixed positioning. */}
        {/* TODO [HIGH LEVEL]: Trade-route path types (land/sea) with arrows and timestamps to show diffusion. */}
        {/* TODO [LOW LEVEL]: Extend lineage nodes with route metadata and render dashed patterns and directional arrows. */}
        {/* TODO [HIGH LEVEL]: Filters (time slider, region, language family) to declutter map; uncertainty styling. */}
        {/* TODO [LOW LEVEL]: Add a control panel to filter markers by decade/region and desaturate uncertain items. */}
        {showEtymologyLineage && lineage && (
          <TimelineScrubber
            lineage={lineage}
            currentIndex={currentIndex}
            onChange={index => setFilterState({ currentIndex: index })}
            isPlaying={isPlaying}
            onTogglePlay={() => {
              if (!isPlaying && currentIndex === undefined) {
                setFilterState({ currentIndex: 0, isPlaying: true, showAllPopups: false })
                announce('Playback started')
                return
              }

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
        <MinimapOverview
          sourceMap={mainMap}
          markers={markers}
          lineage={lineage}
          theme={theme}
          word={word}
          language={language}
          currentIndex={currentIndex}
          isPlaying={isPlaying}
          showAllPopups={showAllPopups}
          annotations={annotations}
          layerOpacities={layerOpacities}
          layerVisibility={{
            translations: showTranslations,
            protoZones: showProtoZones,
            languageFamilies: showLanguageFamilies,
            etymology: showEtymologyLineage,
            descendants: showDescendantPaths,
            annotations: showAnnotations,
          }}
        />
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
        <MarkerEvidenceDrawer
          open={mapState.selectedItem.kind !== 'none'}
          sourceKind={mapState.selectedItem.kind}
          word={mapState.selectedItem.kind === 'none' ? '' : mapState.selectedItem.word}
          language={mapState.selectedItem.kind === 'none' ? '' : mapState.selectedItem.language}
          wiktionaryUrl={mapState.selectedItem.kind === 'none' ? '' : mapState.selectedItem.wiktionaryUrl}
          onPivotSearch={handlePivotFromSelection}
          onClose={() => setSelectedItem({ kind: 'none' })}
          theme={theme}
          dockSide="right"
        />
        <CommandPalette
          open={commandPaletteOpen}
          actions={commandPaletteActions}
          onClose={() => setCommandPaletteOpen(false)}
          theme={theme}
        />
      </MapContainer>
    </section>
  )
}

export default GeospatialPage
