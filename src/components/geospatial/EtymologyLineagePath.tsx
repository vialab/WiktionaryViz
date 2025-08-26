import React, { FC, memo, useEffect, useRef, useState } from 'react'
import { Polyline, Marker, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import {
  normalizePosition,
  createArrowIcon,
  calculateBearing,
  calculateMercatorMidpoint,
} from '@/utils/mapUtils'
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
const AnimatedSegment: FC<{ start: [number, number]; end: [number, number]; growMs: number; angle: number; midpoint: [number, number] }> = ({ start, end, growMs, angle, midpoint }) => {
  const polyRef = useRef<L.Polyline | null>(null)
  const map = useMap()
  const [showArrow, setShowArrow] = useState(false)
  useEffect(() => {
    const poly = polyRef.current
    if (!poly) return
    try {
      // Compute approximate pixel length via projected points
      const latLngs = poly.getLatLngs() as L.LatLng[]
      if (latLngs.length < 2) return
      const p0 = map.project(latLngs[0])
      const p1 = map.project(latLngs[1])
      const dist = p0.distanceTo(p1)
      const pathEl = poly.getElement() as SVGPathElement | null
      if (pathEl) {
        pathEl.style.strokeDasharray = `${dist}`
        pathEl.style.strokeDashoffset = `${dist}`
        pathEl.style.setProperty('--seg-len', `${dist}`)
        pathEl.style.setProperty('--grow-ms', `${growMs}ms`)
        // Trigger reflow then animate
        void pathEl.getBoundingClientRect()
        pathEl.classList.add('etymology-segment-animating')
        // Show arrow shortly after animation begins (e.g., 25% of duration) for "travelling" effect
        const appearDelay = Math.max(120, Math.min(growMs * 0.25, 400))
        const t = window.setTimeout(() => setShowArrow(true), appearDelay)
        return () => window.clearTimeout(t)
      }
    } catch {
      // ignore
    }
  }, [growMs, map])
  return (
    <>
      <Polyline
        positions={[start, end]}
        pathOptions={{ className: 'etymology-segment etymology-segment-animating' }}
        ref={ref => {
          polyRef.current = ref as unknown as L.Polyline | null
        }}
      />
      {showArrow && (
        <Marker
          key={`arrow-anim-${midpoint[0]}-${midpoint[1]}-${angle}`}
          position={midpoint}
          icon={createArrowIcon(angle, { size: 26, color: '#60a5fa', outline: '#082f49', outlineWidth: 2 })}
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
        const midpoint = calculateMercatorMidpoint(start, end)
        const angle = calculateBearing(start, end)
        if (alreadyPast) {
          // Static drawn segment
          elements.push(
            <>
              <Polyline
                key={`polyline-static-${word}-${node.next.word}`}
                positions={[start, end]}
                pathOptions={{ className: 'etymology-segment-static' }}
              />
              <Marker
                key={`arrow-static-${word}-${node.next.word}`}
                position={midpoint}
                icon={createArrowIcon(angle, { size: 26, color: '#60a5fa', outline: '#082f49', outlineWidth: 2 })}
                interactive={false}
              />
            </>,
          )
        } else if (edgeActive) {
          elements.push(
            <AnimatedSegment
              key={`polyline-anim-${word}-${node.next.word}`}
              start={start}
              end={end}
              growMs={Math.min(900, 400 + Math.hypot(start[0] - end[0], start[1] - end[1]) * 60)}
              angle={angle}
              midpoint={midpoint}
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
