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
  onMarkerClick?: (marker: TranslationMarker, index: number) => void
  selectedIndex?: number | null
}

/**
 * Renders translation markers with popups. Memoized for performance.
 */
const TranslationMarkers: FC<TranslationMarkersProps> = memo(({ markers, opacity = 1, zIndex = 600, onMarkerClick, selectedIndex }) => (
  <Pane name="translations" style={{ zIndex }}>
    <>
      {markers.map((marker, index) => {
        const isSelected = selectedIndex === index
        return (
          <Marker
            key={index}
            position={marker.position}
            opacity={opacity}
            pane="translations"
            interactive={true}
            eventHandlers={{
              click: e => {
                onMarkerClick?.(marker, index)
                e.target.openPopup()
              },
            }}
          >
            <Popup pane="translations">
              <div className="space-y-2">
                <div className={isSelected ? 'inline-flex rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-700' : 'inline-flex rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600'}>
                  {isSelected ? 'Selected marker' : 'Translation marker'}
                </div>
                <div dangerouslySetInnerHTML={{ __html: marker.popupText }} />
              </div>
            </Popup>
          </Marker>
        )
      })}
    </>
  </Pane>
))

export default TranslationMarkers
