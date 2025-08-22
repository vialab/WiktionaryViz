import { FC, useEffect, useRef } from 'react'
import { GeoJSON, Pane } from 'react-leaflet'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import L from 'leaflet'
import useCountriesGeoJSON, { CountryProps } from '@/hooks/useCountriesGeoJSON'

/**
 * TODO (Geo Etymology Phase 1 - Country Highlighting)
 *  - [ ] Replace selectedIsoA3 with highlightedIsoA3?: string[] and focusedIsoA3?: string[] (current timeline node).
 *  - [ ] Maintain backwards compatibility during migration (treat selectedIsoA3 as focused array length 1).
 *  - [ ] Add highlightedStyle & focusedStyle (pulse / stronger stroke) below; keep existing hoverStyle.
 *  - [ ] Use memoized Sets for style lookups instead of per-feature conditionals with arrays.
 *  - [ ] Expose imperative ref API (e.g., flashCountry(code)) to briefly animate a country when timeline index changes.
 *  - [ ] On mouseout, reapply correct highlighted/focused style rather than always resetting to default.
 *  - [ ] Add CSS class hooks: country-highlighted, country-focused for animation via Tailwind or custom CSS.
 */
type Props = {
  path?: string
  /** Legacy single selected country (treated as focused). */
  selectedIsoA3?: string
}

// CountryProps type is imported from useCountriesGeoJSON

const defaultStyle: L.PathOptions = {
  color: '#64748b', // slate-500
  weight: 1,
  opacity: 0.8,
  fillColor: '#0b1220', // deep dark
  fillOpacity: 0.06,
  interactive: true,
  className: 'country-path',
}

const hoverStyle: L.PathOptions = {
  color: '#22d3ee', // cyan-400
  weight: 3,
  opacity: 1,
  fillColor: '#0891b2', // cyan-600
  fillOpacity: 0.35,
}

const selectedStyle: L.PathOptions = {
  color: '#38bdf8',
  weight: 2,
  opacity: 1,
  fillColor: '#0ea5e9',
  fillOpacity: 0.25,
}

// Highlighting moved to LineageCountryHighlights overlay component.

// TODO: Introduce highlightedStyle (all lineage countries) & focusedStyle (current step on timeline)
// const highlightedStyle: L.PathOptions = { ...defaultStyle, color: '#0ea5e9', weight: 1.5, fillOpacity: 0.12, className: 'country-path country-highlighted' };
// const focusedStyle: L.PathOptions = { ...hoverStyle, weight: 4, className: 'country-path country-focused' };

const CountriesLayer: FC<Props> = ({ path = '/countries.geojson', selectedIsoA3 }) => {
  const data = useCountriesGeoJSON(path)
  const geoJsonRef = useRef<L.GeoJSON>(null)

  useEffect(() => {
    if (data) {
      console.debug('CountriesLayer: loaded features', (data.features || []).length)
    }
  }, [data])

  // Helper to read ISO3 from CountryProps
  const getIso3 = (props: CountryProps | undefined): string | undefined => {
    if (!props) return undefined
    return props.ISO_A3 || props.iso_a3 || props.ISO3 || props.ADM0_A3 || props.ISO_A3_EH
  }

  // After render, hard-force style on the selected ISO3 (debug aid)
  useEffect(() => {
    const gj = geoJsonRef.current
    if (!gj || !data) return
    let count = 0
    gj.eachLayer((layer: L.Layer) => {
      const feature = (layer as L.GeoJSON).feature as Feature<Geometry, CountryProps> | undefined
      const iso3 = feature ? getIso3(feature.properties) : undefined
      const hasSetStyle = (layer as L.Path).setStyle !== undefined
      if (selectedIsoA3 && iso3 === selectedIsoA3 && hasSetStyle) {
        ;(layer as L.Path).setStyle(selectedStyle as L.PathOptions)
        count++
      }
    })
    console.debug('CountriesLayer: forced highlight matches', count)
  }, [data, selectedIsoA3])

  const style = (feature?: Feature<Geometry, CountryProps>): L.PathOptions => {
    if (!feature) return defaultStyle
    const iso3 = (
      feature.properties?.ISO_A3 ??
      feature.properties?.iso_a3 ??
      feature.properties?.ISO3
    )?.toUpperCase()
    if (selectedIsoA3 && iso3 === selectedIsoA3.toUpperCase()) return selectedStyle
    return defaultStyle
  }

  const onEachFeature = (feature: Feature<Geometry, CountryProps>, layer: L.Layer) => {
    // Ensure each shape is interactive
    if ((layer as L.Path).options) {
      ;(layer as L.Path).options.interactive = true
    }
    // Bind a tooltip to verify interactivity and show a label on hover
    const props: CountryProps = (feature.properties || {}) as CountryProps
    const name = props.NAME_EN ?? props.NAME ?? props.ADMIN ?? props.SOVEREIGNT ?? 'Country'
    type WithBindTooltip = L.Layer & {
      bindTooltip: (content: L.Content, options?: L.TooltipOptions) => unknown
    }
    const possible = layer as unknown as { bindTooltip?: unknown }
    if (typeof possible.bindTooltip === 'function') {
      ;(layer as WithBindTooltip).bindTooltip(String(name), { sticky: true, direction: 'auto' })
    }
    layer.on({
      mouseover: (e: L.LeafletEvent) => {
        console.debug('CountriesLayer: mouseover on', name)
        const target = e.target as L.Path
        target.setStyle(hoverStyle)
        const el = (target as L.Path).getElement?.() as SVGElement | undefined
        if (el) {
          el.style.cursor = 'pointer'
          el.classList.add('country-hovered')
        }
        // keep above other paths while hovered
        if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
          target.bringToFront()
        }
      },
      mouseout: (e: L.LeafletEvent) => {
        const gj = geoJsonRef.current
        if (gj) gj.resetStyle(e.target as L.Layer)
        const el = (e.target as L.Path).getElement?.() as SVGElement | undefined
        if (el) {
          el.style.cursor = 'auto'
          el.classList.remove('country-hovered')
        }
      },
    })
  }

  if (!data) return null

  return (
    <Pane name="countries" style={{ zIndex: 550 }}>
      <GeoJSON
        ref={geoJsonRef}
        data={data as FeatureCollection<Geometry, CountryProps>}
        attribution="Country boundaries © Natural Earth"
        pane="countries"
        style={style}
        onEachFeature={onEachFeature}
        interactive
        bubblingMouseEvents={false}
      />
    </Pane>
  )
}

export default CountriesLayer
