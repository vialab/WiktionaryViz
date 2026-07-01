// Utility functions to export currently visualized map data (markers & lineage) to GeoJSON.
// GeoJSON spec: https://datatracker.ietf.org/doc/html/rfc7946
import type { TranslationMarker } from '@/components/geospatial/TranslationMarkers'
import type { EtymologyNode } from '@/types/etymology'
import type { MapAnnotation } from '@/types/mapState'
import { flattenLineage } from '@/utils/mapUtils'

export interface ExportOptions {
  markers?: boolean // include translation markers as Point features
  lineagePoints?: boolean // include lineage nodes as Point features
  lineagePath?: boolean // include lineage path as LineString feature
  annotations?: boolean // include user annotations as GeoJSON features
  metadata?: Record<string, unknown> // arbitrary collection-level metadata
  fileName?: string // override default file name
}

interface LineageNodeFeatureProps {
  word: string
  lang_code: string
  romanization: string | null
  expansion: string
  index: number // order in the lineage
}

export function buildGeoJSON(
  markers: TranslationMarker[],
  lineageRoot: EtymologyNode | null,
  annotations: MapAnnotation[] = [],
  opts: ExportOptions = {},
) {
  const {
    markers: includeMarkers = true,
    lineagePoints = true,
    lineagePath = true,
    annotations: includeAnnotations = true,
    metadata = {},
  } = opts

  type Position = [number, number]
  interface PointGeometry {
    type: 'Point'
    coordinates: Position
  }
  interface LineStringGeometry {
    type: 'LineString'
    coordinates: Position[]
  }
  type GenericGeometry = PointGeometry | LineStringGeometry
  interface GenericFeature {
    type: 'Feature'
    geometry: GenericGeometry
    properties: Record<string, unknown>
  }
  const features: GenericFeature[] = []

  const toLonLat = (position: [number, number]) => [position[1], position[0]] as [number, number]

  if (includeMarkers) {
    for (const m of markers) {
      const [lat, lon] = m.position // position already [lat, lon]
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] }, // GeoJSON is [lon, lat]
        properties: {
          type: 'translation_marker',
          popupText: m.popupText,
        },
      })
    }
  }

  const lineageArr = flattenLineage(lineageRoot)
  if (lineageArr.length) {
    // TODO (Export Enhancement): include countries array & era metadata when added to EtymologyNode.
    // TODO: optionally restrict lineagePath to currentIndex (animated export) if timeline scrubbing is active.
    if (lineagePoints && lineageArr.some(n => n.position)) {
      lineageArr.forEach((n, idx) => {
        if (!n.position) return // skip nodes without coordinates
        const [lat, lon] = n.position
        const props: LineageNodeFeatureProps = {
          word: n.word,
          lang_code: n.lang_code,
          romanization: n.romanization,
          expansion: n.expansion,
          index: idx,
        }
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lon, lat] },
          properties: { type: 'etymology_node', ...props },
        })
      })
    }
    if (lineagePath) {
      const coords = lineageArr
        .filter(n => n.position)
        .map(n => [n.position![1], n.position![0]] as [number, number]) // [lon, lat]
      if (coords.length >= 2) {
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: { type: 'etymology_path', nodeCount: coords.length },
        })
      }
    }
  }

  if (includeAnnotations) {
    annotations.forEach(annotation => {
      if (annotation.kind === 'note') {
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: toLonLat(annotation.position) },
          properties: {
            type: 'user_annotation',
            annotationKind: annotation.kind,
            text: annotation.text,
            createdAt: annotation.createdAt,
          },
        })
        return
      }

      if (annotation.kind === 'highlight') {
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: toLonLat(annotation.center) },
          properties: {
            type: 'user_annotation',
            annotationKind: annotation.kind,
            text: annotation.text,
            createdAt: annotation.createdAt,
            radiusMeters: annotation.radiusMeters,
          },
        })
        return
      }

      if (annotation.kind === 'region') {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: annotation.points.map(toLonLat),
          },
          properties: {
            type: 'user_annotation',
            annotationKind: annotation.kind,
            text: annotation.text,
            createdAt: annotation.createdAt,
          },
        })
        return
      }

      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [toLonLat(annotation.start), toLonLat(annotation.end)],
        },
        properties: {
          type: 'user_annotation',
          annotationKind: annotation.kind,
          text: annotation.text,
          createdAt: annotation.createdAt,
        },
      })
    })
  }

  interface ExportFeatureCollection {
    type: 'FeatureCollection'
    features: GenericFeature[]
    metadata: {
      generated: string
      counts: { markers: number; lineageNodes: number; annotations: number }
      [k: string]: unknown
    }
  }
  const collection: ExportFeatureCollection = {
    type: 'FeatureCollection',
    features,
    metadata: {
      generated: new Date().toISOString(),
      counts: {
        markers: includeMarkers ? markers.length : 0,
        lineageNodes: lineagePoints ? lineageArr.filter(n => n.position).length : 0,
        annotations: includeAnnotations ? annotations.length : 0,
      },
      ...metadata,
    },
  }
  return collection
}

export function downloadGeoJSON(
  geojson: {
    type: 'FeatureCollection'
    features: {
      type: 'Feature'
      geometry: { type: string; coordinates: unknown }
      properties: Record<string, unknown>
    }[]
    metadata?: Record<string, unknown>
  },
  fileName = 'wiktionary_viz_export.geojson',
) {
  const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/geo+json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
