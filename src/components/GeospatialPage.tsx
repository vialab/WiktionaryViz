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
// CountriesLayer removed: hover interaction replaced by lineage-focused highlights.
import LineageCountryHighlights from './geospatial/LineageCountryHighlights'
import EtymologyLineagePath from './geospatial/EtymologyLineagePath'
import TimelineScrubber from './geospatial/TimelineScrubber.tsx'
import ExportGeoJSONButton from './geospatial/ExportGeoJSONButton'
import ProtoLanguageZones from './geospatial/ProtoLanguageZones'
import LanguageFamiliesLayer from './geospatial/LanguageFamiliesLayer'
import type { EtymologyNode } from '@/types/etymology'
import type { Translation } from '@/utils/mapUtils'

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
}

/**
 * GeospatialPage visualizes translations and etymology lineage on a map.
 * Uses modular components for maintainability and performance.
 */
const GeospatialPage: React.FC<GeospatialPageProps> = ({ word, language }) => {
  const wordData = useWordData(word, language) as WordData | null
  const languoidData = useLanguoidData()
  const [markers, setMarkers] = useState<TranslationMarker[]>([])
  const [lineage, setLineage] = useState<EtymologyNode | null>(null)
  const [currentIndex, setCurrentIndex] = useState<number | undefined>(undefined)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playSpeed, setPlaySpeed] = useState<number>(800) // ms per step
  const [loop, setLoop] = useState<boolean>(false)
  const [showAllPopups, setShowAllPopups] = useState(false)
  const dwellDurationRef = useRef<number>(1200) // ms pause after each transition for reading (extended for readability)
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null)
  const hasAdjustedZoomRef = useRef(false)
  const playbackTimerRef = useRef<number | null>(null)
  // --- Dynamic zoom refs (distance-based small-jump assist) ---
  const autoZoomBaselineRef = useRef<number | null>(null) // original zoom before first auto-zoom-in
  const lastAutoZoomInRef = useRef<number | null>(null) // last zoom level we auto-raised to
  const lastIndexRef = useRef<number | null>(null) // previous index to compute segment distance
  // const [highlightedCountries, setHighlightedCountries] = useState<string[]>([]); // replaced by LineageCountryHighlights overlay
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
      })
    }
  }, [wordData, languoidData])

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

      // If this is the very first focused node after showing full lineage, ensure a minimum detail zoom.
      if (!hasAdjustedZoomRef.current && baseZoom < MIN_DETAIL_ZOOM) {
        hasAdjustedZoomRef.current = true
        map.flyTo([currentPos[0], currentPos[1]], MIN_DETAIL_ZOOM, { duration: 0.9 })
        lastIndexRef.current = currentIndex
        return
      }

      const prevIndex = currentIndex > 0 ? currentIndex - 1 : null
      const prevPos = prevIndex != null ? nodes[prevIndex]?.position : null

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

    lastIndexRef.current = currentIndex
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
      lastIndexRef.current = null
    }
  }, [currentIndex, isPlaying])

  // Stop timers on unmount
  useEffect(() => {
    return () => {
      if (playbackTimerRef.current) clearTimeout(playbackTimerRef.current)
    }
  }, [])

  return (
    <section id="geospatial" className="w-full h-screen bg-gray-900 text-white">
      <MapContainer
        center={[0, 0]}
        zoom={2}
        minZoom={2}
        scrollWheelZoom={false}
        className="relative w-full h-full"
        style={{ background: '#0b0f1a' }}
        ref={instance => {
          if (instance) setMapInstance(instance)
        }}
      >
        {/* Export current map data as GeoJSON */}
        <ExportGeoJSONButton markers={markers} lineage={lineage} />
        <LayersControl position="topright">
          {/* Base Layers */}
          <LayersControl.BaseLayer checked name="Dark (CartoDB)">
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              subdomains={['a', 'b', 'c', 'd']}
              maxZoom={20}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Light (OSM)">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
          </LayersControl.BaseLayer>
          {/* GeoJSON export button added; future: standardized dynamic layer ingestion. */}
          {/* TODO [LOW LEVEL]: Add a file/URL loader for GeoJSON and render via GeoJSON component with style options. */}
          {/* Country highlighting now limited to lineage-related countries only (no global hover). */}
          {/* General Etymology Markers Layer */}
          <LayersControl.Overlay checked name="Translations">
            <MarkerClusterGroup>
              <TranslationMarkers markers={markers} />
            </MarkerClusterGroup>
          </LayersControl.Overlay>
          {/* Proto-Language Zones overlay from public/proto_regions.geojson */}
          <LayersControl.Overlay name="Proto-Language Zones">
            <LayerGroup>
              <ProtoLanguageZones path="/proto_regions.geojson" />
            </LayerGroup>
          </LayersControl.Overlay>
          {/* Language Families polygons from Glottolog-derived hulls */}
          <LayersControl.Overlay name="Language Families">
            <LayerGroup>
              <LanguageFamiliesLayer path="/language_families.geojson" />
            </LayerGroup>
          </LayersControl.Overlay>
          {/* Etymology Lineage Path Layer (includes associated country highlights) */}
          <LayersControl.Overlay checked name="Etymology Lineage Path">
            <LayerGroup>
              <LineageCountryHighlights lineage={lineage} currentIndex={currentIndex} />
              <EtymologyLineagePath
                lineage={lineage}
                currentIndex={currentIndex}
                showAllPopups={showAllPopups}
              />
            </LayerGroup>
          </LayersControl.Overlay>
          {/* TODO (Timeline UI): After implementing, mount timeline scrubber outside LayersControl for fixed positioning. */}
          {/* TODO [HIGH LEVEL]: Trade-route path types (land/sea) with arrows and timestamps to show diffusion. */}
          {/* TODO [LOW LEVEL]: Extend lineage nodes with route metadata and render dashed patterns and directional arrows. */}
          {/* TODO [HIGH LEVEL]: Filters (time slider, region, language family) to declutter map; uncertainty styling. */}
          {/* TODO [LOW LEVEL]: Add a control panel to filter markers by decade/region and desaturate uncertain items. */}
        </LayersControl>
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
        />
      </MapContainer>
    </section>
  )
}

export default GeospatialPage
