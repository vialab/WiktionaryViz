import { FC, useMemo, useRef } from 'react'
import { GeoJSON, Pane } from 'react-leaflet'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import L from 'leaflet'
import useProtoRegionsGeoJSON, { ProtoRegionProps } from '@/hooks/useProtoRegionsGeoJSON'

type Props = {
  path?: string
  opacity?: number
}

const clampOpacity = (value: number) => Math.max(0, Math.min(1, value))

const applyOpacity = (style: L.PathOptions, multiplier: number): L.PathOptions => ({
  ...style,
  opacity: clampOpacity((style.opacity ?? 1) * multiplier),
  fillOpacity: clampOpacity((style.fillOpacity ?? 0) * multiplier),
})

const defaultStyle: L.PathOptions = {
  color: '#a78bfa', // violet-400
  weight: 2,
  opacity: 0.85,
  fillColor: '#7c3aed', // violet-600
  fillOpacity: 0.15,
  dashArray: '6 4',
  lineCap: 'round',
  lineJoin: 'round',
  className: 'proto-zone',
}

const hoverStyle: L.PathOptions = {
  color: '#c4b5fd', // violet-300
  weight: 3,
  opacity: 1,
  fillColor: '#8b5cf6', // violet-500
  fillOpacity: 0.25,
}

const ProtoLanguageZones: FC<Props> = ({ path = '/proto_regions.geojson', opacity = 1 }) => {
  const data = useProtoRegionsGeoJSON(path)
  const geoJsonRef = useRef<L.GeoJSON>(null)

  const style = useMemo(() => applyOpacity(defaultStyle, opacity), [opacity])
  const hoveredStyle = useMemo(() => applyOpacity(hoverStyle, opacity), [opacity])

  const onEachFeature = (feature: Feature<Geometry, ProtoRegionProps>, layer: L.Layer) => {
    // Ensure interactivity for hover feedback
    if ((layer as L.Path).options) {
      ;(layer as L.Path).options.interactive = true
    }
    const props = feature.properties || ({} as ProtoRegionProps)
    const title = props.variant ? `${props.name} – ${props.variant}` : `${props.name}`

    type WithBindTooltip = L.Layer & {
      bindTooltip: (content: L.Content, options?: L.TooltipOptions) => unknown
    }
    const possible = layer as unknown as { bindTooltip?: unknown }
    if (typeof possible.bindTooltip === 'function') {
      ;(layer as WithBindTooltip).bindTooltip(title, { sticky: true, direction: 'auto' })
    }
    layer.on({
      mouseover: (e: L.LeafletEvent) => {
        const target = e.target as L.Path
        target.setStyle(hoveredStyle)
        const el = (target as L.Path).getElement?.() as SVGElement | undefined
        if (el) el.classList.add('proto-zone-hovered')
        if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) target.bringToFront()
      },
      mouseout: (e: L.LeafletEvent) => {
        const target = e.target as L.Path
        target.setStyle(style)
        const el = (e.target as L.Path).getElement?.() as SVGElement | undefined
        if (el) el.classList.remove('proto-zone-hovered')
      },
    })
  }

  if (!data) return null

  return (
    <Pane name="proto-zones" style={{ zIndex: 540 }}>
      <GeoJSON
        ref={geoJsonRef}
        data={data as FeatureCollection<Geometry, ProtoRegionProps>}
        pane="proto-zones"
        style={style}
        onEachFeature={onEachFeature}
        interactive
        bubblingMouseEvents={false}
      />
    </Pane>
  )
}

export default ProtoLanguageZones
