import { FC, useMemo } from 'react'
import { GeoJSON, Pane } from 'react-leaflet'
import type { FeatureCollection, Geometry, Feature } from 'geojson'
import L from 'leaflet'
import useCountriesGeoJSON, { CountryProps } from '@/hooks/useCountriesGeoJSON'
import type { EtymologyNode } from '@/types/etymology'
import { flattenLineage } from '@/utils/mapUtils'
import { isProto, regionStyleFor } from '@/utils/visualConstants'
import protoRegionsRaw from '/proto_regions.geojson?url'

interface Props {
  lineage: EtymologyNode | null
  path?: string // geojson path
  currentIndex?: number // active node index for focused country pulse
  opacity?: number
  zIndex?: number
}

// Persistent highlight style (no hover reset logic here)
// Base class names; colors applied per feature (attested vs proto)
const countryBaseClassName = 'country-path lineage-country'
const protoBaseClassName = 'country-path lineage-proto-region'

// --- Robust point-in-polygon helpers (GeoJSON uses [lng, lat]) ---
// Ray casting on a single linear ring; coordinates: [lng, lat]
function ringContains(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[j]
    const [x2, y2] = ring[i]
    const intersects =
      y1 > lat !== y2 > lat && lng < ((x2 - x1) * (lat - y1)) / (y2 - y1 + 1e-15) + x1
    if (intersects) inside = !inside
  }
  return inside
}

function polygonContains(lng: number, lat: number, rings: number[][][]): boolean {
  if (!rings.length) return false
  if (!ringContains(lng, lat, rings[0])) return false // outside outer ring
  // If inside any hole => exclude
  for (let i = 1; i < rings.length; i++) {
    if (ringContains(lng, lat, rings[i])) return false
  }
  return true
}

function multiPolygonContains(lng: number, lat: number, polygons: number[][][][]): boolean {
  return polygons.some(p => polygonContains(lng, lat, p))
}

interface IndexedFeature {
  feature: Feature<Geometry, CountryProps>
  bbox?: [number, number, number, number]
}

function featureMatchesPoint(
  feature: Feature<Geometry, unknown>,
  pointLng: number,
  pointLat: number,
  bbox?: [number, number, number, number],
): boolean {
  if (bbox) {
    const [minX, minY, maxX, maxY] = bbox
    if (pointLng < minX || pointLng > maxX || pointLat < minY || pointLat > maxY) return false
  }

  const geom = feature.geometry as Geometry
  if (!geom) return false

  if (geom.type === 'Polygon') {
    return polygonContains(pointLng, pointLat, geom.coordinates as unknown as number[][][])
  }

  if (geom.type === 'MultiPolygon') {
    return multiPolygonContains(pointLng, pointLat, geom.coordinates as unknown as number[][][][])
  }

  return false
}

function computeBBox(geom: Geometry): [number, number, number, number] | undefined {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity
  const scan = (coords: unknown): void => {
    if (!Array.isArray(coords) || coords.length === 0) return
    if (typeof coords[0] === 'number') {
      const tuple = coords as [number, number]
      const x = tuple[0]
      const y = tuple[1]
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      return
    }
    for (const c of coords as unknown[]) scan(c)
  }
  if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
    scan(geom.coordinates)
    return [minX, minY, maxX, maxY]
  }
  return undefined
}

const LineageCountryHighlights: FC<Props> = ({
  lineage,
  path = '/countries.geojson',
  currentIndex,
  opacity = 1,
  zIndex = 560,
}) => {
  const data = useCountriesGeoJSON(path)
  const lineageNodes = useMemo(() => flattenLineage(lineage), [lineage])
  const lineagePoints = useMemo(
    () => lineageNodes.map(n => n.position).filter(Boolean) as [number, number][],
    [lineageNodes],
  )
  const activePoint = useMemo(
    () =>
      typeof currentIndex === 'number' && currentIndex >= 0 && currentIndex < lineageNodes.length
        ? lineageNodes[currentIndex].position
        : null,
    [currentIndex, lineageNodes],
  )

  interface ProtoProps {
    lang_code: string
    name?: string
    variant?: string
    ISO_A3?: string
  }

  const { countriesFiltered, protoFiltered, activeIds } = useMemo((): {
    countriesFiltered: FeatureCollection<Geometry, CountryProps> | null
    protoFiltered: FeatureCollection<Geometry, ProtoProps> | null
    activeIds: Set<string>
  } => {
    if (!data || !lineagePoints.length) {
      return { countriesFiltered: null, protoFiltered: null, activeIds: new Set() }
    }

    // Load proto regions GeoJSON (static). We fetch via dynamic import URL string (Vite '?url').
    // We'll synchronously fetch; caching by browser makes cost negligible for few KB.
    let protoFeatures: Feature<Geometry, ProtoProps>[] = []
    try {
      const url = protoRegionsRaw as unknown as string
      // NOTE: This synchronous fetch in render-memo is acceptable because the resource is local & small;
      // alternative: pre-fetch outside component state and cache, but scope minimal.
      const xhr = new XMLHttpRequest()
      xhr.open('GET', url, false)
      xhr.send(null)
      if (xhr.status >= 200 && xhr.status < 300) {
        const parsed = JSON.parse(xhr.responseText) as FeatureCollection<Geometry, ProtoProps>
        protoFeatures = parsed.features as Feature<Geometry, ProtoProps>[]
      }
    } catch (e) {
      console.warn('Failed to load proto_regions.geojson', e)
    }
    // Pre-index with bbox for faster rejection
    const indexed: IndexedFeature[] = data.features
      .filter(
        f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'),
      )
      .map(f => ({
        feature: f as Feature<Geometry, CountryProps>,
        bbox: computeBBox(f.geometry as Geometry),
      }))

    const indexedProto: Array<{
      feature: Feature<Geometry, ProtoProps>
      bbox?: [number, number, number, number]
    }> = protoFeatures
      .filter(
        f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'),
      )
      .map(f => ({
        feature: f,
        bbox: computeBBox(f.geometry as Geometry),
      }))

    const countryMatched = new Set<Feature<Geometry, CountryProps>>()
    const countryFocused = new Set<Feature<Geometry, CountryProps>>()
    const protoMatched = new Set<Feature<Geometry, ProtoProps>>()
    const protoFocused = new Set<Feature<Geometry, ProtoProps>>()
    const activeNode =
      typeof currentIndex === 'number' && currentIndex >= 0 && currentIndex < lineageNodes.length
        ? lineageNodes[currentIndex]
        : null

    for (const [lat, lng] of lineagePoints) {
      // lineage positions stored as [lat, lng]
      const pointLng = lng
      const pointLat = lat
      for (const { feature, bbox } of indexed) {
        if (countryMatched.has(feature)) continue // already included
        if (featureMatchesPoint(feature, pointLng, pointLat, bbox)) countryMatched.add(feature)
      }
    }
    if (activePoint) {
      const [alat, alng] = activePoint as [number, number]
      for (const { feature, bbox } of indexed) {
        if (featureMatchesPoint(feature, alng, alat, bbox)) countryFocused.add(feature)
      }
    }

    if (activeNode && isProto(activeNode.lang_code)) {
      const focusedProto = indexedProto.find(
        ({ feature }) => feature.properties?.lang_code === activeNode.lang_code,
      )
      if (focusedProto) protoFocused.add(focusedProto.feature)
    }

    // Augment with proto polygons for lineage nodes that are proto and have no matched country features.
    const lineageNodesNeedingProto = lineageNodes.filter(
      n => isProto(n.lang_code) && (!n.countries || n.countries.length === 0),
    )
    for (const ln of lineageNodesNeedingProto) {
      const f = protoFeatures.find(p => p.properties?.lang_code === ln.lang_code)
      if (f) protoMatched.add(f)
    }

    return {
      countriesFiltered: { ...data, features: Array.from(countryMatched) },
      protoFiltered:
        protoMatched.size > 0 ? { type: 'FeatureCollection', features: Array.from(protoMatched) } : null,
      activeIds: new Set(
        [
          ...Array.from(countryFocused).map(
            f => (f.properties as CountryProps | undefined)?.ISO_A3 || (f.id as string) || '',
          ),
          ...Array.from(protoFocused).map(
            f => (f.properties as ProtoProps | undefined)?.lang_code || (f.id as string) || '',
          ),
        ].filter(Boolean),
      ),
    }
  }, [data, lineagePoints, activePoint, lineageNodes])

  if (
    (!countriesFiltered || !countriesFiltered.features.length) &&
    (!protoFiltered || !protoFiltered.features.length)
  )
    return null

  return (
    <Pane name="lineage-countries" style={{ zIndex, pointerEvents: 'none' }}>
      {protoFiltered && protoFiltered.features.length > 0 && (
        <GeoJSON
          data={protoFiltered as FeatureCollection<Geometry, ProtoProps>}
          style={feat => {
            const props = feat?.properties as ProtoProps | undefined
            const style = regionStyleFor(props?.lang_code || '')
            return {
              ...style,
              className: `${protoBaseClassName} proto-region`,
              interactive: false,
            } as L.PathOptions
          }}
          pane="lineage-countries"
          interactive={false}
          bubblingMouseEvents={false}
        />
      )}
      <GeoJSON
        data={countriesFiltered as FeatureCollection<Geometry, CountryProps>}
        style={feat => {
          const props = feat?.properties as CountryProps | undefined
          const style = regionStyleFor('')
          const id = props?.ISO_A3 || (feat?.id as string) || ''
          const focused = typeof id === 'string' ? activeIds?.has(id) : false
          const layerOpacity = Math.max(0, Math.min(1, opacity))
          const baseStyle = style as L.PathOptions
          return {
            ...style,
            opacity: Math.max(0, Math.min(1, (baseStyle.opacity ?? 1) * layerOpacity)),
            fillOpacity: Math.max(0, Math.min(1, (baseStyle.fillOpacity ?? 0) * layerOpacity)),
            className: `${countryBaseClassName} country-highlighted attested-region${focused ? ' country-focused' : ''}`,
            interactive: false,
          } as L.PathOptions
        }}
        pane="lineage-countries"
        interactive={false}
        bubblingMouseEvents={false}
      />
    </Pane>
  )
}

export default LineageCountryHighlights
