import React, { FC, memo } from 'react'
import { Polyline, Marker, CircleMarker, Tooltip } from 'react-leaflet'
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
      if (visible && node.next && node.next.position && (active === undefined || idx < active)) {
        const start = center
        const end = normalizePosition(node.next.position)
        elements.push(
          <Polyline key={`polyline-${word}-${node.next.word}`} positions={[start, end]} />,
        )
        const midpoint = calculateMercatorMidpoint(start, end)
        const angle = calculateBearing(start, end)
        // Larger, higher-contrast arrow icon for improved route order visibility.
        elements.push(
          <Marker
            key={`arrow-${word}-${node.next.word}`}
            position={midpoint}
            icon={createArrowIcon(angle, { size: 26, color: '#60a5fa', outline: '#082f49', outlineWidth: 2 })}
            interactive={false}
          />,
        )
      }
    }
    node = node.next
    idx++
  }
  if (!lineage) return null
  return <>{elements}</>
})

export default EtymologyLineagePath
