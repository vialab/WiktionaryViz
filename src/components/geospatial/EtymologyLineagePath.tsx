import React, { FC, memo } from 'react';
import { Polyline, Marker, CircleMarker, Popup } from 'react-leaflet';
import { normalizePosition, createArrowIcon, calculateBearing, calculateMercatorMidpoint } from '@/utils/mapUtils';
import type { EtymologyNode } from './EtymologyLineagePath';

export interface EtymologyLineagePathProps {
  lineage: EtymologyNode | null;
}

/**
 * Renders the etymology lineage as a sequence of CircleMarkers, Polylines, and arrow Markers.
 * Memoized for performance.
 */
const EtymologyLineagePath: FC<EtymologyLineagePathProps> = memo(({ lineage }) => {
  if (!lineage) return null;
  const elements: React.ReactNode[] = [];
  let currentNode = lineage;

  while (currentNode && currentNode.next) {
    const { word, lang_code, romanization, position } = currentNode;
    const nextNode = currentNode.next;
    const start = normalizePosition(position);
    const end = normalizePosition(nextNode.position);

    // Add CircleMarker for current node
    elements.push(
      <CircleMarker
        key={`circle-${word}-${lang_code}`}
        center={start}
        radius={8}
        fillColor="#3388ff"
        color="#3388ff"
        weight={1}
        opacity={1}
        fillOpacity={0.7}
      >
        <Popup>
          <div>
            {currentNode.expansion}
            {romanization && ` - ${romanization}`}
          </div>
        </Popup>
      </CircleMarker>
    );

    // Add Polyline + Arrow Marker
    elements.push(
      <Polyline
        key={`polyline-${word}-${nextNode.word}`}
        positions={[start, end]}
      />
    );
    const midpoint = calculateMercatorMidpoint(start, end);
    const angle = calculateBearing(start, end);
    elements.push(
      <Marker
        key={`arrow-${word}-${nextNode.word}`}
        position={midpoint}
        icon={createArrowIcon(angle)}
        interactive={false}
      />
    );
    currentNode = nextNode;
  }

  // Add CircleMarker for last node (tail of the lineage)
  if (currentNode && currentNode.position) {
    const { word, lang_code, romanization, position } = currentNode;
    const last = normalizePosition(position);
    elements.push(
      <CircleMarker
        key={`circle-${word}-${lang_code}`}
        center={last}
        radius={8}
        fillColor="#3388ff"
        color="#3388ff"
        weight={1}
        opacity={1}
        fillOpacity={0.7}
      >
        <Popup>
          <div>
            {word}
            {romanization && ` - ${romanization}`}
          </div>
        </Popup>
      </CircleMarker>
    );
  }
  return <>{elements}</>;
});

export default EtymologyLineagePath;
