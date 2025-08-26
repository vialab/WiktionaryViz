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
import CountriesLayer from './geospatial/CountriesLayer'
import LineageCountryHighlights from './geospatial/LineageCountryHighlights'
import EtymologyLineagePath from './geospatial/EtymologyLineagePath'
import TimelineScrubber from './geospatial/TimelineScrubber.tsx'
import ExportGeoJSONButton from './geospatial/ExportGeoJSONButton'
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
  const [loop, setLoop] = useState<boolean>(true)
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null)
  const hasAdjustedZoomRef = useRef(false)
  // const [highlightedCountries, setHighlightedCountries] = useState<string[]>([]); // replaced by LineageCountryHighlights overlay
  // TODO (Timeline Scrubber & Playback State):
  //  - [ ] Add currentIndex state (number) representing focused lineage node for timeline.
  //  - [ ] Add playing state + playback speed (ms per step) & timer ref for auto-advance.
  //  - [ ] When currentIndex changes, pan/fly map to node coordinates (if available) & update focused countries in CountriesLayer.
  //  - [ ] Derive highlightedCountries (Set) from full lineage once computed; derive focusedCountries from currentIndex.
  //  - [ ] Pass highlighted/focused arrays to <CountriesLayer /> (after its API update).
  //  - [ ] Provide callback to <EtymologyLineagePath /> for node click -> setCurrentIndex.
  //  - [ ] Render <EtymologyTimelineScrubber /> fixed at bottom: ticks, drag, play/pause.
  //  - [ ] Handle word/language change: reset index, stop playback, clear timers.
  // TODO (Playback Pause & Tooltip Lifecycle):
  //  - [ ] Introduce two-phase step timing: (a) animate path growth / transition, (b) dwell pause for reading.
  //  - [ ] On dwell start: open active node popup (store ref or programmatically open via leaflet instance).
  //  - [ ] Before advancing: close previously opened popup unless final stage.
  //  - [ ] On completion (non-loop): open ALL node popups (iterate layers) OR synthesize a consolidated tooltip panel.
  //  - [ ] Provide a user toggle (e.g., "Show all popups at end") in scrubber controls.
  //  - [ ] If user scrubs manually, cancel current pause timer and close transient popup.

  useEffect(() => {
    if (Array.isArray(wordData?.translations) && languoidData.length) {
      processTranslations(wordData.translations, languoidData, setMarkers)
    }
    if (Array.isArray(wordData?.etymology_templates) && languoidData.length) {
      processEtymologyLineage(
        wordData.etymology_templates,
        languoidData,
        wordData.word,
        wordData.lang_code,
      ).then(root => {
        setLineage(root)
        setCurrentIndex(undefined)
        setIsPlaying(false) // reset playback on new lineage
      })
    }
  }, [wordData, languoidData])

  // Playback effect: auto-advance currentIndex while playing.
  useEffect(() => {
    if (!isPlaying || !lineage) return
    const nodes = flattenLineage(lineage)
    if (!nodes.length) return
    const maxIndex = nodes.length - 1
    // If starting from undefined (full), jump to 0.
    if (currentIndex === undefined) {
      setCurrentIndex(0)
      return // next effect run will schedule interval
    }
    const id = window.setInterval(() => {
      setCurrentIndex(prev => {
        if (prev === undefined) return 0
        if (prev < maxIndex) return prev + 1
        if (loop) return 0 // wrap
        // stop at end if not looping
        clearInterval(id)
        setIsPlaying(false)
        return prev
      })
    }, playSpeed)
    return () => clearInterval(id)
  }, [isPlaying, playSpeed, lineage, loop, currentIndex])

  // Auto-pan map to active node when currentIndex changes (single initial zoom-in).
  useEffect(() => {
    if (!mapInstance || currentIndex === undefined || !lineage) return
    const nodes = flattenLineage(lineage)
    if (currentIndex < 0 || currentIndex >= nodes.length) return
    const node = nodes[currentIndex]
    const pos = node.position
    if (pos && pos[0] != null && pos[1] != null) {
      try {
        const baseZoom = mapInstance.getZoom()
        const minZoomForDetail = 3.2 // Enough to see a single country but keep context
        if (!hasAdjustedZoomRef.current && baseZoom < minZoomForDetail) {
          hasAdjustedZoomRef.current = true
          mapInstance.flyTo([pos[0], pos[1]], minZoomForDetail, { duration: 0.9 })
        } else {
          // Just pan; keep current zoom so entire country remains visible
          mapInstance.panTo([pos[0], pos[1]], { animate: true, duration: 0.9 })
        }
      } catch {
        // ignore
      }
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
    }
  }, [currentIndex, isPlaying])

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
          {/* Countries hover highlight layer */}
          <LayersControl.Overlay checked name="Countries (hover)">
            <LayerGroup>
              <CountriesLayer />
              {/* Persistent lineage country highlight overlay (non-interactive) */}
              <LineageCountryHighlights lineage={lineage} currentIndex={currentIndex} />
            </LayerGroup>
          </LayersControl.Overlay>
          {/* General Etymology Markers Layer */}
          <LayersControl.Overlay checked name="Etymology Markers">
            <MarkerClusterGroup>
              <TranslationMarkers markers={markers} />
            </MarkerClusterGroup>
          </LayersControl.Overlay>
          {/* Etymology Lineage Path Layer */}
          <LayersControl.Overlay name="Etymology Lineage Path">
            <LayerGroup>
              <EtymologyLineagePath lineage={lineage} currentIndex={currentIndex} />
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
          }}
        />
      </MapContainer>
    </section>
  )
}

export default GeospatialPage
