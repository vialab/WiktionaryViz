import { FC, memo } from 'react'
import { Marker, Pane, Popup } from 'react-leaflet'

/**
 * Props for TranslationMarkers component.
 */
export interface TranslationMarker {
  position: [number, number]
  popupText: string
}

export interface TranslationMarkersProps {
  markers: TranslationMarker[]
  opacity?: number
  zIndex?: number
}

/**
 * Renders translation markers with popups. Memoized for performance.
 */
const TranslationMarkers: FC<TranslationMarkersProps> = memo(({ markers, opacity = 1, zIndex = 600 }) => (
  <Pane name="translations" style={{ zIndex }}>
    <>
      {markers.map((marker, index) => (
        <Marker
          key={index}
          position={marker.position}
          opacity={opacity}
          pane="translations"
          interactive={true}
          eventHandlers={{
            click: e => {
              e.target.openPopup()
            },
          }}
        >
          <Popup pane="translations">
            <div dangerouslySetInnerHTML={{ __html: marker.popupText }} />
          </Popup>
        </Marker>
      ))}
    </>
  </Pane>
))

export default TranslationMarkers
