import { FC, memo } from 'react'
import { Marker, Popup } from 'react-leaflet'

/**
 * Props for TranslationMarkers component.
 */
export interface TranslationMarker {
  position: [number, number]
  popupText: string
}

export interface TranslationMarkersProps {
  markers: TranslationMarker[]
}

/**
 * Renders translation markers with popups. Memoized for performance.
 */
const TranslationMarkers: FC<TranslationMarkersProps> = memo(({ markers }) => (
  <>
    {markers.map((marker, index) => (
      <Marker
        key={index}
        position={marker.position}
        interactive={true}
        eventHandlers={{
          click: e => {
            e.target.openPopup()
          },
        }}
      >
        <Popup>
          <div dangerouslySetInnerHTML={{ __html: marker.popupText }} />
        </Popup>
      </Marker>
    ))}
  </>
))

export default TranslationMarkers
