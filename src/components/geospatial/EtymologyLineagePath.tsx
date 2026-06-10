import React, { FC, memo, useEffect, useRef, useState } from 'react'
import { Polyline, Marker, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import { normalizePosition, createArrowIcon, calculateBearing } from '@/utils/mapUtils'
import { isProto, edgeStyleBetween } from '@/utils/visualConstants'
import type { EtymologyNode } from '@/types/etymology'

const getTrailingPosition = (
  map: L.Map,
  start: [number, number],
  end: [number, number],
  progress: number,
  trailingProgress = 0.1,
): [number, number] => {
  const clamped = Math.max(0, Math.min(1, progress - trailingProgress))
  const projectedStart = map.project(start)
  const projectedEnd = map.project(end)
  const interpolatedPoint = projectedStart.add(projectedEnd.subtract(projectedStart).multiplyBy(clamped))
  const latLng = map.unproject(interpolatedPoint)
  return [latLng.lat, latLng.lng]
}

export interface EtymologyLineagePathProps {
  lineage: EtymologyNode | null
  /** Index (0-based) of current timeline focus; controls partial rendering. */
  currentIndex?: number
  /** Whether the lineage is actively playing. Enables the active edge animation. */
  isPlaying?: boolean
  /** Duration in milliseconds for the currently animating segment. */
  segmentDurationMs?: number
  /** Dwell duration in milliseconds between segments. Threaded for timeline coordination. */
  dwellMs?: number
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
 *
 * TODO (Animation Phasing):
 *  - [ ] Split rendering into two layers: (a) already-complete segments, (b) currently animating segment with stroke-dasharray animation.
 *  - [ ] Provide per-segment duration + dwell pause prop to coordinate with TimelineScrubber.
 *  - [ ] Optionally use requestAnimationFrame for smoother growth animation rather than CSS-only for long great-circle paths.
 */

// Internal component to animate a single segment (active edge)
const AnimatedSegment: FC<{
  start: [number, number]
  end: [number, number]
  growMs: number
  dwellMs?: number
  angle: number
  proto?: boolean
}> = ({ start, end, growMs, dwellMs, angle, proto }) => {
  const polyRef = useRef<L.Polyline | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const map = useMap()
  const [mounted, setMounted] = useState(false)
  const [showEndpoint, setShowEndpoint] = useState(false)

  useEffect(() => {
    const poly = polyRef.current
    if (!poly) return
    let frameId = 0
    setMounted(false)
    setShowEndpoint(false)
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
      if (dwellMs !== undefined) {
        pathEl.style.setProperty('--dwell-ms', `${dwellMs}ms`)
      }
      pathEl.classList.add('etymology-segment-animating')
      setMounted(true)
      const startTime = performance.now()
      let lastLatLng: [number, number] = [...start]
      const animate = (now: number) => {
        const progress = Math.min(1, (now - startTime) / growMs)
        pathEl.style.strokeDashoffset = `${dist * (1 - progress)}`
        // Keep the arrow slightly behind the growing edge so it does not sit on the node.
        const [lat, lng] = getTrailingPosition(map, start, end, progress)
        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng])
          // Dynamically rotate arrow to local bearing to mitigate long-segment distortion.
          try {
            const localBearing = calculateBearing(lastLatLng, [lat, lng])
            const iconEl = markerRef.current.getElement()
            const inner = iconEl?.firstElementChild as HTMLElement | null
            if (inner) inner.style.transform = `rotate(${localBearing}deg)`
          } catch {
            // ignore rotation errors
          }
        }
        lastLatLng = [lat, lng]
        if (progress < 1) {
          frameId = requestAnimationFrame(animate)
        } else {
          setShowEndpoint(true)
        }
      }
      frameId = requestAnimationFrame(animate)
    } catch {
      // ignore
    }
    return () => {
      if (frameId) cancelAnimationFrame(frameId)
    }
  }, [growMs, map, start, end, dwellMs])

  return (
    <>
      <Polyline
        positions={[start, end]}
        pathOptions={{
          className: `etymology-segment etymology-segment-animating ${proto ? 'proto-dotted' : ''}`,
          dashArray: proto ? '6 6' : undefined,
          color: proto ? '#e11d48' : '#60a5fa',
        }}
        ref={ref => {
          polyRef.current = ref as unknown as L.Polyline | null
        }}
      />
      {mounted && (
        <Marker
          ref={ref => {
            markerRef.current = ref as unknown as L.Marker | null
          }}
          position={getTrailingPosition(map, start, end, 1)}
          // Initial angle; will be updated frame-by-frame.
          icon={createArrowIcon(angle, {
            size: 28,
            color: proto ? '#e11d48' : '#60a5fa',
            outline: '#082f49',
            outlineWidth: 2,
          })}
          interactive={false}
        />
      )}
      {showEndpoint && (
        <CircleMarker
          center={end}
          radius={7}
          fillColor={proto ? '#e11d48' : '#3388ff'}
          color={proto ? '#e11d48' : '#3388ff'}
          weight={1}
          opacity={1}
          fillOpacity={0.8}
          className={proto ? 'etymology-node proto-endpoint' : 'etymology-node endpoint'}
        />
      )}
    </>
  )
}

const EtymologyLineagePath: FC<EtymologyLineagePathProps> = memo(
  ({ lineage, currentIndex, isPlaying = false, segmentDurationMs, dwellMs, showAllPopups }) => {
    const map = useMap()
    const completedSegments: React.ReactNode[] = []
    const activeSegments: React.ReactNode[] = []
    let node: EtymologyNode | null = lineage
    let idx = 0
    const active = typeof currentIndex === 'number' ? currentIndex : undefined
    const activeEdgeIndex = isPlaying && active !== undefined ? active + 1 : undefined

    while (node) {
      const { word, lang_code, romanization, position, expansion } = node
      if (position) {
        const center = normalizePosition(position)
        const isActive = active === idx
        const visible = active === undefined || idx <= active // only show nodes up to active
        if (visible) {
          const tooltipPermanent = showAllPopups || isActive
          completedSegments.push(
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
              <Tooltip
                permanent={tooltipPermanent}
                direction="top"
                offset={[0, -6]}
                className={showAllPopups ? 'etymology-tooltip-final' : 'etymology-tooltip-active'}
              >
                <div className="leading-tight">
                  <strong>{expansion || word}</strong>
                  {romanization && (
                    <span className="ml-1 text-xs opacity-80">{romanization}</span>
                  )}
                </div>
              </Tooltip>
            </CircleMarker>,
          )
        }
        // Draw edge to next if within active range
        if (node.next && node.next.position) {
          const start = center
          const end = normalizePosition(node.next.position)
          const nextIndex = idx + 1
          const edgeActive = activeEdgeIndex === nextIndex
          const alreadyPast = active === undefined || nextIndex <= active
          // Precompute for whichever branch uses them
          const angle = calculateBearing(start, end)
          if (alreadyPast) {
            // Static drawn segment
            const edgeStyle = edgeStyleBetween(lang_code, node.next.lang_code)
            const dash = edgeStyle.dashArray
            completedSegments.push(
              <Polyline
                key={`polyline-static-${word}-${node.next.word}`}
                positions={[start, end]}
                pathOptions={{
                  className: `etymology-segment-static ${dash ? 'proto-dotted' : 'attested-solid'}`,
                  weight: edgeStyle.weight,
                  color: edgeStyle.color,
                  dashArray: dash || undefined,
                }}
              />,
            )
            // Arrow at end of completed segment
            completedSegments.push(
              <Marker
                key={`arrow-static-${word}-${node.next.word}`}
                position={getTrailingPosition(map, start, end, 1)}
                icon={createArrowIcon(angle, {
                  size: 22,
                  color: isProto(lang_code) || isProto(node.next.lang_code) ? '#e11d48' : '#3b82f6',
                  outline: '#082f49',
                  outlineWidth: 2,
                })}
                interactive={false}
              />,
            )
          } else if (edgeActive) {
            const protoEdge = isProto(lang_code) || isProto(node.next.lang_code)
            activeSegments.push(
              <AnimatedSegment
                key={`polyline-anim-${word}-${node.next.word}`}
                start={start}
                end={end}
                growMs={
                  segmentDurationMs ?? Math.min(900, 400 + Math.hypot(start[0] - end[0], start[1] - end[1]) * 60)
                }
                dwellMs={dwellMs}
                angle={angle}
                proto={protoEdge}
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
    return (
      <>
        {completedSegments}
        {activeSegments}
      </>
    )
  },
)

export default EtymologyLineagePath
