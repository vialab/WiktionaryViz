import { FC, memo } from 'react'
import { Marker, Tooltip } from 'react-leaflet'

/**
 * Props for TranslationMarkers component.
 */
export interface TranslationMarker {
  position: [number, number]
  popupText: string
  word: string
  language: string
  code: string
  sense?: string
  roman?: string
  wiktionaryUrl: string
}

export interface TranslationMarkersProps {
  markers: TranslationMarker[]
  onMarkerClick?: (marker: TranslationMarker, index: number) => void
}

/**
 * Renders translation markers with hoverable tooltips. Memoized for performance.
 */
const TranslationMarkers: FC<TranslationMarkersProps> = memo(({ markers, onMarkerClick }) => (
  <>
    {markers.map((marker, index) => (
      <Marker
        key={index}
        position={marker.position}
        interactive={true}
        riseOnHover={true}
        ref={instance => {
          const element = instance?.getElement()
          if (element) {
            element.dataset.eventTarget = 'translation-marker'
            element.dataset.mapEntity = `${marker.code}:${marker.word}:${index}`
          }
        }}
        eventHandlers={{
          mouseover: e => {
            e.target.openTooltip()
          },
          mouseout: e => {
            e.target.closeTooltip()
          },
          click: e => {
            onMarkerClick?.(marker, index)
            e.target.openTooltip()
          },
        }}
      >
        <Tooltip direction="top" offset={[0, -8]} sticky interactive>
          <div dangerouslySetInnerHTML={{ __html: marker.popupText }} />
        </Tooltip>
      </Marker>
    ))}
  </>
))

export default TranslationMarkers
