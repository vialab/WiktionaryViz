import { FC, useEffect, useMemo, useRef, useState } from 'react'
import { Pane, useMap } from 'react-leaflet'
import type { FeatureCollection, Geometry, Feature, Polygon } from 'geojson'
import useLanguageFamiliesGeoJSON, {
  LanguageFamilyProps,
} from '@/hooks/useLanguageFamiliesGeoJSON'
import {
  BSplineShapeGenerator,
  BubbleSet,
  PointPath,
  ShapeSimplifier,
} from 'bubblesets'

type Props = { path?: string }

const palette = [
  '#ef4444',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#22c55e',
  '#06b6d4',
  '#eab308',
  '#a855f7',
]

function colorForId(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return palette[h % palette.length]
}

type PathEntry = { id: string; d: string; color: string; title: string }

const LanguageFamiliesBubbles: FC<Props> = ({ path = '/language_families.geojson' }) => {
  const data = useLanguageFamiliesGeoJSON(path)
  const map = useMap()
  const [paths, setPaths] = useState<PathEntry[]>([])
  const bubble = useMemo(() => new BubbleSet(), [])
  const simplifiers = useMemo(
    () => [new ShapeSimplifier(0.0), new BSplineShapeGenerator(), new ShapeSimplifier(0.0)],
    [],
  )
  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 })
  const [svgSize, setSvgSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })

  // Compute screen-space bubble paths for current map view
  const recompute = useMemo(() => {
    return () => {
      if (!data) return
      const sz = map.getSize()
      const w = sz.x
      const h = sz.y
      if (sizeRef.current.w !== w || sizeRef.current.h !== h) {
        sizeRef.current = { w, h }
        setSvgSize({ w, h })
      }
      const newPaths: PathEntry[] = []
      const pad = 6
      const dot = 8 // rectangle size for each sampled vertex (in px)

      const project = (lat: number, lon: number) => map.latLngToLayerPoint([lat, lon])

      const eachFeature = (
        f: Feature<Geometry, LanguageFamilyProps>,
      ): void => {
        if (f.geometry?.type !== 'Polygon') return
        const id = f.properties?.id || ''
        const color = colorForId(id)
        const title = `${f.properties?.name ?? id} (${f.properties?.point_count ?? 0})`
        // Use outer ring only
        const poly = f.geometry as Polygon
        const ring = poly.coordinates[0] || []
        if (ring.length < 3) return
        // Sample vertices to reduce rectangles; aim for at most ~48 points per feature
        const step = Math.max(1, Math.ceil(ring.length / 48))
        const rects: { x: number; y: number; width: number; height: number }[] = []
        for (let i = 0; i < ring.length; i += step) {
          const [lon, lat] = ring[i]
          const p = project(lat, lon)
          rects.push({ x: p.x - dot / 2, y: p.y - dot / 2, width: dot, height: dot })
        }
        if (rects.length < 1) return
        try {
          const list = bubble.createOutline(BubbleSet.addPadding(rects, pad), [], null)
          const outline = new PointPath(list).transform(simplifiers)
          const d = `${outline}`
          if (d && d.length > 0) newPaths.push({ id, d, color, title })
        } catch {
          // fallback: skip this feature on failure
        }
      }

      if (Array.isArray((data as FeatureCollection).features)) {
        for (const f of (data as FeatureCollection<Geometry, LanguageFamilyProps>).features) {
          eachFeature(f)
        }
      }
      setPaths(newPaths)
    }
  }, [data, map, bubble, simplifiers])

  // Initial compute and on map interactions
  useEffect(() => {
    if (!data) return
    recompute()
    const onMoveEnd = () => recompute()
    map.on('moveend', onMoveEnd)
    map.on('zoomend', onMoveEnd)
    return () => {
      map.off('moveend', onMoveEnd)
      map.off('zoomend', onMoveEnd)
    }
  }, [data, recompute, map])

  if (!data) return null

  return (
    <Pane name="language-families-bubbles" style={{ zIndex: 536, pointerEvents: 'none' }}>
      <svg
        width={svgSize.w}
        height={svgSize.h}
        style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}
      >
        {paths.map(p => (
          <g key={p.id}>
            <path
              d={p.d}
              fill={p.color}
              fillOpacity={0.16}
              stroke={p.color}
              strokeOpacity={0.95}
              strokeWidth={1.5}
            >
              <title>{p.title}</title>
            </path>
          </g>
        ))}
      </svg>
    </Pane>
  )
}

export default LanguageFamiliesBubbles
