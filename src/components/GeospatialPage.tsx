import { useEffect, useState, useRef } from 'react'
import { MapContainer, TileLayer, LayersControl, LayerGroup } from 'react-leaflet'
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
import GeospatialGuideOverlay, { type GuideLayerKey } from './geospatial/GeospatialGuideOverlay'
import type { EtymologyNode } from '@/types/etymology'
import type { LanguoidData } from '@/types/languoid'
import type { Translation } from '@/utils/mapUtils'

type LayerOpacityKey = 'translations' | 'protoZones' | 'languageFamilies' | 'etymology' | 'descendants'

type LayerOrderKey = LayerOpacityKey

type LayerOpacityState = Record<LayerOpacityKey, number>

const defaultLayerOrder: LayerOrderKey[] = [
  'translations',
  'descendants',
  'etymology',
  'protoZones',
  'languageFamilies',
]

const layerOrderStep = 20
const layerOrderBase = 500

const defaultLayerOpacities: LayerOpacityState = {
  translations: 1,
  protoZones: 1,
  languageFamilies: 1,
  etymology: 1,
  descendants: 1,
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
  theme?: 'dark' | 'light'
  inspireCategory?: string | null
}

/**
 * GeospatialPage visualizes translations and etymology lineage on a map.
 * Uses modular components for maintainability and performance.
 */
const GeospatialPage: React.FC<GeospatialPageProps> = ({ word, language, onGuideOpenRegister, theme = 'dark', inspireCategory }) => {
  const isLight = theme === 'light'
  const { wordData, loading: wordDataLoading, resolvedKey: wordDataResolvedKey } = useWordData(word, language) as {
    wordData: WordData | null
    loading: boolean
    resolvedKey: string | null
  }
  const { languoidData, loading: languoidDataLoading } = useLanguoidData() as {
    languoidData: LanguoidData[]
    loading: boolean
  }
  const [markers, setMarkers] = useState<TranslationMarker[]>([])
  const [lineage, setLineage] = useState<EtymologyNode | null>(null)
  const [currentIndex, setCurrentIndex] = useState<number | undefined>(undefined)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playSpeed, setPlaySpeed] = useState<number>(800) // ms per step
  const [loop, setLoop] = useState<boolean>(false)
  const [showAllPopups, setShowAllPopups] = useState(false)
  const [guideOpen, setGuideOpen] = useState(true)
  const [guideLayer, setGuideLayer] = useState<GuideLayerKey | null>(null)
  const [showTranslations, setShowTranslations] = useState(false)
  const [showProtoZones, setShowProtoZones] = useState(false)
  const [showDescendantPaths, setShowDescendantPaths] = useState(false)
  const [etymologyRequested, setEtymologyRequested] = useState(false)
  const [layerOpacities, setLayerOpacities] = useState<LayerOpacityState>(defaultLayerOpacities)
  const [layerOrder, setLayerOrder] = useState<LayerOrderKey[]>(defaultLayerOrder)
  const dwellDurationRef = useRef<number>(1200) // ms pause after each transition for reading (extended for readability)
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null)
  // Track visibility of LayersControl overlays that render non-Leaflet DOM (bubbles SVG)
  const [translationGroup, setTranslationGroup] = useState<L.LayerGroup | null>(null)
  const [protoZonesGroup, setProtoZonesGroup] = useState<L.LayerGroup | null>(null)
  const [descendantPathsGroup, setDescendantPathsGroup] = useState<L.LayerGroup | null>(null)
  const [showLanguageFamilies, setShowLanguageFamilies] = useState(false)
  const [languageFamiliesGroup, setLanguageFamiliesGroup] = useState<L.LayerGroup | null>(null)
  const [showEtymologyLineage, setShowEtymologyLineage] = useState(false)
  const [etymologyLineageGroup, setEtymologyLineageGroup] = useState<L.LayerGroup | null>(null)
  const hasAdjustedZoomRef = useRef(false)
  const playbackTimerRef = useRef<number | null>(null)
  // --- Dynamic zoom refs (distance-based small-jump assist) ---
  const autoZoomBaselineRef = useRef<number | null>(null) // original zoom before first auto-zoom-in
  const lastAutoZoomInRef = useRef<number | null>(null) // last zoom level we auto-raised to
  // const [highlightedCountries, setHighlightedCountries] = useState<string[]>([]); // replaced by LineageCountryHighlights overlay
  const lineageNodes = lineage ? flattenLineage(lineage) : []
  const hasPlayableLineage = lineageNodes.length > 1
  const translationCount = markers.length
  const lineageNodeCount = lineageNodes.length
  const translationBreadth = translationCount / Math.max(1, lineageNodeCount)
  const layerZIndex = (layer: LayerOrderKey) => {
    const index = layerOrder.indexOf(layer)
    const resolvedIndex = index >= 0 ? index : layerOrder.length - 1
    return layerOrderBase + (layerOrder.length - resolvedIndex) * layerOrderStep
  }

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
  const currentWordKey = `${word}::${language}`
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
    setGuideOpen(true)
    setGuideLayer(null)
    setShowTranslations(false)
    setShowProtoZones(false)
    setShowDescendantPaths(false)
    setEtymologyRequested(false)
    setShowEtymologyLineage(false)
    setCurrentIndex(undefined)
    setIsPlaying(false)
    setShowAllPopups(false)
  }, [word, language])

  useEffect(() => {
    onGuideOpenRegister?.(() => () => {
      setGuideLayer(null)
      setGuideOpen(true)
    })

    return () => {
      onGuideOpenRegister?.(null)
    }
  }, [onGuideOpenRegister])

  useEffect(() => {
    if (!guideLayer) return

    setShowTranslations(guideLayer === 'translations')
    setShowProtoZones(guideLayer === 'protoZones')
    setShowDescendantPaths(guideLayer === 'descendants')
    setShowLanguageFamilies(guideLayer === 'families')
    setShowEtymologyLineage(guideLayer === 'etymology')

    if (guideLayer === 'etymology') {
      setEtymologyRequested(true)
    } else {
      setCurrentIndex(undefined)
      setIsPlaying(false)
      setShowAllPopups(false)
    }
  }, [guideLayer])

  useEffect(() => {
    const map = mapInstance
    const group = translationGroup
    if (!map || !group) return
    const onAdd = (e: L.LayersControlEvent) => {
      if (e.layer === group) setShowTranslations(true)
    }
    const onRemove = (e: L.LayersControlEvent) => {
      if (e.layer === group) setShowTranslations(false)
    }
    map.on('overlayadd', onAdd)
    map.on('overlayremove', onRemove)
    setShowTranslations(map.hasLayer(group))
    return () => {
      map.off('overlayadd', onAdd)
      map.off('overlayremove', onRemove)
    }
  }, [mapInstance, translationGroup])

  useEffect(() => {
    const map = mapInstance
    const group = protoZonesGroup
    if (!map || !group) return
    const onAdd = (e: L.LayersControlEvent) => {
      if (e.layer === group) setShowProtoZones(true)
    }
    const onRemove = (e: L.LayersControlEvent) => {
      if (e.layer === group) setShowProtoZones(false)
    }
    map.on('overlayadd', onAdd)
    map.on('overlayremove', onRemove)
    setShowProtoZones(map.hasLayer(group))
    return () => {
      map.off('overlayadd', onAdd)
      map.off('overlayremove', onRemove)
    }
  }, [mapInstance, protoZonesGroup])

  useEffect(() => {
    const map = mapInstance
    const group = descendantPathsGroup
    if (!map || !group) return
    const onAdd = (e: L.LayersControlEvent) => {
      if (e.layer === group) setShowDescendantPaths(true)
    }
    const onRemove = (e: L.LayersControlEvent) => {
      if (e.layer === group) setShowDescendantPaths(false)
    }
    map.on('overlayadd', onAdd)
    map.on('overlayremove', onRemove)
    setShowDescendantPaths(map.hasLayer(group))
    return () => {
      map.off('overlayadd', onAdd)
      map.off('overlayremove', onRemove)
    }
  }, [mapInstance, descendantPathsGroup])

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
        setCurrentIndex(undefined)
        setIsPlaying(false)
        setShowAllPopups(false)
        setGuideOpen(true)
        setGuideLayer(null)
        setShowTranslations(false)
        setShowProtoZones(false)
        setShowDescendantPaths(false)
        setEtymologyRequested(false)
        setShowEtymologyLineage(false)
      })
    }
  }, [wordData, languoidData])

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

  const moveLayer = (layer: LayerOrderKey, direction: 'up' | 'down') => {
    setLayerOrder(prev => {
      const currentIndex = prev.indexOf(layer)
      if (currentIndex < 0) return prev
      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
      if (targetIndex < 0 || targetIndex >= prev.length) return prev
      const next = [...prev]
      const [item] = next.splice(currentIndex, 1)
      next.splice(targetIndex, 0, item)
      return next
    })
  }

  const resetLayerOrder = () => setLayerOrder(defaultLayerOrder)

  useEffect(() => {
    if (!lineage || !etymologyRequested || !showEtymologyLineage || guideOpen) return
    const nodes = flattenLineage(lineage)
    if (nodes.length < 1) return
    if (currentIndex !== undefined) return

    setCurrentIndex(0)
    setIsPlaying(true)
    setShowAllPopups(false)
  }, [currentIndex, etymologyRequested, guideOpen, lineage, showEtymologyLineage])

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
    setShowAllPopups(false)

    const transitionMs = playSpeed // (potential future: separate growth vs fade)
    const dwellMs = dwellDurationRef.current
    const stepTotal = transitionMs + dwellMs

    let cancelled = false

    const schedule = (idx: number) => {
      if (cancelled) return
      setCurrentIndex(idx)
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
            setShowAllPopups(true)
            setIsPlaying(false)
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
  }, [isPlaying, playSpeed, lineage, loop, currentIndex])

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
              duration: 0.85,
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
      setIsPlaying(false)
    }
    if (currentIndex === undefined) {
      // Allow a fresh zoom-in next time playback begins
      hasAdjustedZoomRef.current = false
      // Reset auto-zoom state so a new lineage playback starts clean.
      autoZoomBaselineRef.current = null
      lastAutoZoomInRef.current = null
    }
  }, [currentIndex, isPlaying])

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
      if (e.layer === group) setShowLanguageFamilies(true)
    }
    const onRemove = (e: L.LayersControlEvent) => {
      if (e.layer === group) setShowLanguageFamilies(false)
    }
    map.on('overlayadd', onAdd)
    map.on('overlayremove', onRemove)
    // initialize based on whether the group is currently on the map
    setShowLanguageFamilies(map.hasLayer(group))
    return () => {
      map.off('overlayadd', onAdd)
      map.off('overlayremove', onRemove)
    }
  }, [mapInstance, languageFamiliesGroup])

  // Mirror the etymology overlay state so the timeline scrubber only shows while that layer is visible.
  useEffect(() => {
    const map = mapInstance
    const group = etymologyLineageGroup
    if (!map || !group) return
    const onAdd = (e: L.LayersControlEvent) => {
      if (e.layer === group) setShowEtymologyLineage(true)
    }
    const onRemove = (e: L.LayersControlEvent) => {
      if (e.layer === group) {
        setShowEtymologyLineage(false)
        setIsPlaying(false)
        setCurrentIndex(undefined)
        setShowAllPopups(false)
      }
    }
    map.on('overlayadd', onAdd)
    map.on('overlayremove', onRemove)
    setShowEtymologyLineage(map.hasLayer(group))
    return () => {
      map.off('overlayadd', onAdd)
      map.off('overlayremove', onRemove)
    }
  }, [mapInstance, etymologyLineageGroup])

  return (
    <section
      id="geospatial"
      className={isLight ? 'h-[calc(100vh-4rem)] w-full overflow-hidden bg-white text-slate-900' : 'h-[calc(100vh-4rem)] w-full overflow-hidden bg-gray-900 text-white'}
    >
      <MapContainer
        center={[0, 0]}
        zoom={2}
        minZoom={2}
        scrollWheelZoom={true}
        wheelPxPerZoomLevel={240}
        className="relative w-full h-full"
        style={{ background: isLight ? '#f8fafc' : '#0b0f1a' }}
        id="map-root"
        ref={(instance: L.Map | null) => {
          if (instance) setMapInstance(instance)
        }}
      >
        <GeospatialSettingsMenu
          markers={markers}
          lineage={lineage}
          word={word}
          language={language}
          mapInstance={mapInstance}
          layerOpacities={layerOpacities}
          onLayerOpacityChange={(layer, opacity) => {
            setLayerOpacities(prev => ({ ...prev, [layer]: opacity }))
          }}
          layerOrder={layerOrder}
          onLayerMove={moveLayer}
          onResetLayerOrder={resetLayerOrder}
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
                    isPlaying={isPlaying}
                    segmentDurationMs={playSpeed}
                    dwellMs={dwellDurationRef.current}
                    showAllPopups={showAllPopups}
                    opacity={layerOpacities.etymology}
                    zIndex={layerZIndex('etymology')}
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
            onChange={setCurrentIndex}
            isPlaying={isPlaying}
            onTogglePlay={() => setIsPlaying(p => !p)}
            speed={playSpeed}
            onSpeedChange={setPlaySpeed}
            loop={loop}
            onToggleLoop={() => setLoop(l => !l)}
            onReset={() => {
              setCurrentIndex(undefined)
              setIsPlaying(false)
              setShowAllPopups(false)
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
            setGuideOpen(true)
          }}
          onCloseGuide={() => setGuideOpen(false)}
          onClose={() => setGuideOpen(false)}
          onRestart={() => {
            setGuideLayer(null)
            setEtymologyRequested(false)
            setShowEtymologyLineage(false)
            setCurrentIndex(undefined)
            setIsPlaying(false)
            setShowAllPopups(false)
          }}
          theme={theme}
        />
      </MapContainer>
    </section>
  )
}

export default GeospatialPage
