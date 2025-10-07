import { FC, useMemo, useRef } from 'react'
import { GeoJSON, Pane, useMap } from 'react-leaflet'
import type { FeatureCollection, Geometry, Feature } from 'geojson'
import L from 'leaflet'
import useLanguageFamiliesGeoJSON, { LanguageFamilyProps } from '@/hooks/useLanguageFamiliesGeoJSON'

type Props = { path?: string }

const palette = [
  '#ef4444', // red-500
  '#f59e0b', // amber-500
  '#10b981', // emerald-500
  '#3b82f6', // blue-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#22c55e', // green-500
  '#06b6d4', // cyan-500
  '#eab308', // yellow-500
  '#a855f7', // purple-500
]

function colorForId(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return palette[h % palette.length]
}

const LanguageFamiliesLayer: FC<Props> = ({ path = '/language_families.geojson' }) => {
  const data = useLanguageFamiliesGeoJSON(path)
  const geoJsonRef = useRef<L.GeoJSON>(null)
  const map = useMap()

  const style: L.PathOptions | ((f: Feature<Geometry, LanguageFamilyProps>) => L.PathOptions) =
    useMemo(() => {
      return (feature: Feature<Geometry, LanguageFamilyProps>) => {
        const id = feature?.properties?.id || ''
        const color = feature?.properties?.color || colorForId(id)
        return {
          color,
          weight: 1.5,
          opacity: 0.9,
          fillColor: color,
          fillOpacity: 0.15,
          className: 'family-zone',
        }
      }
    }, [])

  const onEachFeature = (feature: Feature<Geometry, LanguageFamilyProps>, layer: L.Layer) => {
    if ((layer as L.Path).options) {
      ;(layer as L.Path).options.interactive = true
    }
    const props = feature.properties || ({} as LanguageFamilyProps)
    const title = `${props.name} (${props.point_count || 0})`

    type WithBindTooltip = L.Layer & {
      bindTooltip: (content: L.Content, options?: L.TooltipOptions) => unknown
    }
    const possible = layer as unknown as { bindTooltip?: unknown }
    if (typeof possible.bindTooltip === 'function') {
      ;(layer as WithBindTooltip).bindTooltip(title, {
        permanent: false,
        direction: 'auto',
        sticky: true,
      })
    }

    layer.on({
      click: () => {
        const c =
          props.label_lat != null && props.label_lon != null
            ? [props.label_lat, props.label_lon]
            : undefined
        if (c) {
          try {
            map.flyTo(c as L.LatLngExpression, Math.max(3, map.getZoom()), { duration: 0.8 })
          } catch {
            /* ignore navigation errors */
          }
        }
      },
      mouseover: (e: L.LeafletEvent) => {
        const target = e.target as L.Path
        const current = (target.options as L.PathOptions).color
        target.setStyle({
          weight: 2.5,
          fillOpacity: 0.25,
          color: current,
        })
      },
      mouseout: (e: L.LeafletEvent) => {
        const gj = geoJsonRef.current
        if (gj) gj.resetStyle(e.target as L.Layer)
      },
    })
  }

  if (!data) return null

  return (
    <Pane name="language-families" style={{ zIndex: 535 }}>
      <GeoJSON
        ref={geoJsonRef}
        data={data as FeatureCollection<Geometry, LanguageFamilyProps>}
        pane="language-families"
        style={style as unknown as L.PathOptions}
        onEachFeature={onEachFeature}
        interactive
        bubblingMouseEvents={false}
      />
    </Pane>
  )
}

export default LanguageFamiliesLayer
