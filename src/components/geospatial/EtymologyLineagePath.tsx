import React, { FC, memo, useEffect, useRef, useState } from 'react'
import { Polyline, Marker, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import { normalizePosition, createArrowIcon, calculateBearing } from '@/utils/mapUtils'
import type { EtymologyNode } from '@/types/etymology'

export interface EtymologyLineagePathProps {
  lineage: EtymologyNode | null
  /** Index (0-based) of current timeline focus; controls partial rendering. */
  currentIndex?: number
  /** When true, force display of all popups (end-of-playback overview). */
  showAllPopups?: boolean
}

/**
 * Renders the etymology lineage as a sequence of CircleMarkers, Polylines, and arrow Markers.
 * Memoized for performance.
 *
* TODO (Timeline & Highlight Integration):
*  - [ ] Provide a flattenLineage utility externally instead of while-loop duplication (reuse in exporter & timeline scrubber).
*  - [ ] Add data-country / data-index attributes on markers for debugging and potential DOM-driven highlighting.
*  - [ ] Expose callback (e.g., onNodeClick) to sync user clicks on nodes with timeline position.
 *
* TODO (Popup / Tooltip Automation):
*  - [ ] Provide imperative handle (forwardRef) exposing openPopupForIndex / closeAllTooltips to support playback control in GeospatialPage.
*  - [ ] (Already done) Mode to leave all tooltips open after completion.
 *
 * TODO (Animation Phasing):
 *  - [ ] Split rendering into two layers: (a) already-complete segments, (b) currently animating segment with stroke-dasharray animation.
 *  - [ ] Provide per-segment duration + dwell pause prop to coordinate with TimelineScrubber.
 *  - [ ] Optionally use requestAnimationFrame for smoother growth animation rather than CSS-only for long great-circle paths.
 */
// Internal component to animate a single segment (active edge)
const AnimatedSegment: FC<{ start: [number, number]; end: [number, number]; growMs: number; angle: number }> = ({ start, end, growMs, angle }) => {
  const polyRef = useRef<L.Polyline | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const map = useMap()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const poly = polyRef.current
    if (!poly) return
    try {
      const latLngs = poly.getLatLngs() as L.LatLng[]
      if (latLngs.length < 2) return
      const p0 = map.project(latLngs[0])
      const p1 = map.project(latLngs[1])
      const dist = p0.distanceTo(p1)
      const pathEl = poly.getElement() as SVGPathElement | null
      if (!pathEl) return
      pathEl.style.strokeDasharray = `${dist}`
      pathEl.style.strokeDashoffset = `${dist}`
      pathEl.style.setProperty('--seg-len', `${dist}`)
      pathEl.style.setProperty('--grow-ms', `${growMs}ms`)
      void pathEl.getBoundingClientRect()
      pathEl.classList.add('etymology-segment-animating')
      setMounted(true)
      const startTime = performance.now()
      const animate = (now: number) => {
        const progress = Math.min(1, (now - startTime) / growMs)
        // Linear interpolation in lat/lng space
        const lat = start[0] + (end[0] - start[0]) * progress
        const lng = start[1] + (end[1] - start[1]) * progress
        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng])
        }
        if (progress < 1) requestAnimationFrame(animate)
      }
      requestAnimationFrame(animate)
    } catch {
      // ignore
    }
  }, [growMs, map, start, end])

  return (
    <>
      <Polyline
        positions={[start, end]}
        pathOptions={{ className: 'etymology-segment etymology-segment-animating' }}
        ref={ref => {
          polyRef.current = ref as unknown as L.Polyline | null
        }}
      />
      {mounted && (
        <Marker
          ref={ref => {
            markerRef.current = ref as unknown as L.Marker | null
          }}
          position={start}
          icon={createArrowIcon(angle, { size: 28, color: '#60a5fa', outline: '#082f49', outlineWidth: 2 })}
          interactive={false}
        />
      )}
    </>
  )
}

const EtymologyLineagePath: FC<EtymologyLineagePathProps> = memo(({ lineage, currentIndex, showAllPopups }) => {
  const elements: React.ReactNode[] = []
  let node: EtymologyNode | null = lineage
  let idx = 0
  const active = typeof currentIndex === 'number' ? currentIndex : undefined

  while (node) {
    const { word, lang_code, romanization, position, expansion } = node
    if (position) {
      const center = normalizePosition(position)
      const isActive = active === idx
      const visible = active === undefined || idx <= active // only show nodes up to active
      if (visible) {
        elements.push(
            <CircleMarker
            key={`circle-${word}-${lang_code}`}
            center={center}
            radius={isActive ? 10 : 7}
            fillColor={isActive ? '#fbbf24' : '#3388ff'}
            color={isActive ? '#f59e0b' : '#3388ff'}
            weight={isActive ? 2 : 1}
            opacity={1}
            fillOpacity={isActive ? 0.9 : 0.7}
            className={isActive ? 'etymology-node-active node-pulse' : 'etymology-node'}
          >
      {(showAllPopups || isActive) && (
              <Tooltip
        permanent={showAllPopups || isActive}
                direction="top"
                offset={[0, -6]}
                className={showAllPopups ? 'etymology-tooltip-final' : 'etymology-tooltip-active'}
              >
                <div className="leading-tight">
                  <strong>{expansion || word}</strong>
                  {romanization && <span className="ml-1 text-xs opacity-80">{romanization}</span>}
                </div>
              </Tooltip>
            )}
          </CircleMarker>,
        )
      }
      // Draw edge to next if within active range
      if (node.next && node.next.position) {
        const start = center
        const end = normalizePosition(node.next.position)
        const nextIndex = idx + 1
        const edgeActive = active !== undefined && nextIndex === active // edge leading to active node animates
        const alreadyPast = active === undefined || nextIndex < active
        // Precompute for whichever branch uses them
  const angle = calculateBearing(start, end)
        if (alreadyPast) {
          // Static drawn segment
          elements.push(
            <Polyline
              key={`polyline-static-${word}-${node.next.word}`}
              positions={[start, end]}
              pathOptions={{ className: 'etymology-segment-static' }}
            />,
          )
          // Arrow at end of completed segment
          elements.push(
            <Marker
              key={`arrow-static-${word}-${node.next.word}`}
              position={end}
              icon={createArrowIcon(angle, { size: 22, color: '#3b82f6', outline: '#082f49', outlineWidth: 2 })}
              interactive={false}
            />,
          )
        } else if (edgeActive) {
          elements.push(
            <AnimatedSegment
              key={`polyline-anim-${word}-${node.next.word}`}
              start={start}
              end={end}
              growMs={Math.min(900, 400 + Math.hypot(start[0] - end[0], start[1] - end[1]) * 60)}
              angle={angle}
            />,
          )
        } else {
          // Future segment (not yet visible) => no line & no arrow
        }
      }
    }
    node = node.next
    idx++
  }
  if (!lineage) return null
  return <>{elements}</>
})

export default EtymologyLineagePath
