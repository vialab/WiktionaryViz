import { useCallback, useEffect, useMemo, useState } from 'react'
import { CircleMarker, Marker, Polygon, Popup, Polyline, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { calculateBearing, createArrowIcon } from '@/utils/mapUtils'
import type {
  AnnotationKind,
  MapAnnotation,
  SegmentAnnotation,
} from '@/types/mapState'

type AnnotationTheme = 'dark' | 'light'

interface AnnotationModeOverlayProps {
  enabled: boolean
  tool: AnnotationKind
  annotations: MapAnnotation[]
  onAnnotationsChange: (nextAnnotations: MapAnnotation[]) => void
  onToolChange: (tool: AnnotationKind) => void
  onAnnounce?: (message: string) => void
  theme?: AnnotationTheme
}

const annotationRadiusMeters = 40000

const makeId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `annotation-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const formatLabel = (value: string | null) => {
  const trimmed = value?.trim() ?? ''
  return trimmed || 'Untitled annotation'
}

const createNoteIcon = (theme: AnnotationTheme) =>
  L.divIcon({
    className: 'annotation-note-icon',
    html: `<div style="width:28px;height:28px;border-radius:9999px;display:grid;place-items:center;font-size:16px;font-weight:700;box-shadow:0 8px 20px rgba(0,0,0,.28);background:${theme === 'light' ? '#0f172a' : '#f8fafc'};color:${theme === 'light' ? '#f8fafc' : '#0f172a'};border:2px solid ${theme === 'light' ? '#38bdf8' : '#7dd3fc'};">✎</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })

const AnnotationModeOverlay: React.FC<AnnotationModeOverlayProps> = ({
  enabled,
  tool,
  annotations,
  onAnnotationsChange,
  onToolChange,
  onAnnounce,
  theme = 'dark',
}) => {
  const isLight = theme === 'light'
  const [segmentStart, setSegmentStart] = useState<[number, number] | null>(null)
  const [draftRegion, setDraftRegion] = useState<[number, number][]>([])

  useEffect(() => {
    if (!enabled || tool !== 'region') {
      setDraftRegion([])
    }
    if (!enabled || tool === 'region') {
      setSegmentStart(null)
    }
  }, [enabled, tool])

  useEffect(() => {
    if (!enabled) return
    const previousCursor = document.body.style.cursor
    document.body.style.cursor = tool === 'region' ? 'crosshair' : 'copy'
    return () => {
      document.body.style.cursor = previousCursor
    }
  }, [enabled, tool])

  useEffect(() => {
    if (!enabled || tool !== 'region') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDraftRegion([])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled, tool])

  const addAnnotation = useCallback((annotation: MapAnnotation) => {
    onAnnotationsChange([...annotations, annotation])
  }, [annotations, onAnnotationsChange])

  const finishSegment = useCallback((kind: SegmentAnnotation['kind'], start: [number, number], end: [number, number]) => {
    const promptLabel = kind === 'arrow' ? 'Label this arrow' : 'Label this custom link'
    const text = formatLabel(window.prompt(promptLabel, ''))
    addAnnotation({
      id: makeId(),
      kind,
      start,
      end,
      text,
      createdAt: new Date().toISOString(),
    })
  }, [addAnnotation])

  const handleMapClick = useCallback((event: L.LeafletMouseEvent) => {
    if (!enabled) return
    const point: [number, number] = [event.latlng.lat, event.latlng.lng]

    if (tool === 'note') {
      const text = formatLabel(window.prompt('Add a note for this location', ''))
      addAnnotation({
        id: makeId(),
        kind: 'note',
        position: point,
        text,
        createdAt: new Date().toISOString(),
      })
      onAnnounce?.('Annotation note added')
      return
    }

    if (tool === 'highlight') {
      const text = formatLabel(window.prompt('Label this highlight', ''))
      addAnnotation({
        id: makeId(),
        kind: 'highlight',
        center: point,
        radiusMeters: annotationRadiusMeters,
        text,
        createdAt: new Date().toISOString(),
      })
      onAnnounce?.('Highlight annotation added')
      return
    }

    if (tool === 'arrow' || tool === 'link') {
      if (!segmentStart) {
        setSegmentStart(point)
        return
      }

      finishSegment(tool, segmentStart, point)
      setSegmentStart(null)
      onAnnounce?.(tool === 'arrow' ? 'Arrow annotation added' : 'Custom link annotation added')
      return
    }

    if (tool === 'region') {
      setDraftRegion(current => [...current, point])
      onAnnounce?.('Region point added')
    }
  }, [addAnnotation, enabled, finishSegment, onAnnounce, segmentStart, tool])

  useMapEvents({
    click: handleMapClick,
  })

  const regionPreview = useMemo(() => {
    if (!enabled || tool !== 'region' || draftRegion.length < 2) return null
    return <Polygon positions={draftRegion} pathOptions={{ color: '#38bdf8', dashArray: '8 8', fillOpacity: 0.08 }} />
  }, [draftRegion, enabled, tool])

  return (
    <>
      {annotations.map(annotation => {
        if (annotation.kind === 'note') {
          return (
            <Marker
              key={annotation.id}
              position={annotation.position}
              icon={createNoteIcon(theme)}
              zIndexOffset={2000}
              eventHandlers={{
                click: event => {
                  event.originalEvent.stopPropagation()
                },
              }}
            >
              <Popup>
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-wide opacity-70">Note</div>
                  <div>{annotation.text}</div>
                </div>
              </Popup>
            </Marker>
          )
        }

        if (annotation.kind === 'highlight') {
          return (
            <CircleMarker
              key={annotation.id}
              center={annotation.center}
              radius={12}
              pathOptions={{ color: '#f59e0b', fillColor: '#fbbf24', fillOpacity: 0.35, weight: 3 }}
              eventHandlers={{
                click: event => {
                  event.originalEvent.stopPropagation()
                },
              }}
            >
              <Popup>
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-wide opacity-70">Highlight</div>
                  <div>{annotation.text}</div>
                </div>
              </Popup>
            </CircleMarker>
          )
        }

        if (annotation.kind === 'region') {
          return (
            <Polygon
              key={annotation.id}
              positions={annotation.points}
              pathOptions={{ color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.12, weight: 2 }}
              eventHandlers={{
                click: event => {
                  event.originalEvent.stopPropagation()
                },
              }}
            >
              <Popup>
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-wide opacity-70">Region</div>
                  <div>{annotation.text}</div>
                </div>
              </Popup>
            </Polygon>
          )
        }

        const bearing = calculateBearing(annotation.start, annotation.end)
        const isArrow = annotation.kind === 'arrow'

        return (
          <>
            <Polyline
              key={annotation.id}
              positions={[annotation.start, annotation.end]}
              pathOptions={{
                color: isArrow ? '#38bdf8' : '#c084fc',
                weight: 4,
                dashArray: isArrow ? undefined : '8 8',
              }}
              eventHandlers={{
                click: event => {
                  event.originalEvent.stopPropagation()
                },
              }}
            >
              <Popup>
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-wide opacity-70">{isArrow ? 'Arrow' : 'Link'}</div>
                  <div>{annotation.text}</div>
                </div>
              </Popup>
            </Polyline>
            {isArrow && (
              <Marker
                position={annotation.end}
                zIndexOffset={2000}
                interactive={false}
                icon={createArrowIcon(bearing, {
                  size: 24,
                  color: '#38bdf8',
                  outline: isLight ? '#ffffff' : '#082f49',
                  outlineWidth: 2,
                  opacity: 1,
                })}
              />
            )}
          </>
        )
      })}
      {regionPreview}
      {enabled && (
        <div className={isLight ? 'fixed left-4 top-20 z-[1601] max-w-xs rounded-xl border border-slate-200 bg-white/95 p-3 text-sm text-slate-700 shadow-xl shadow-slate-200/60 backdrop-blur' : 'fixed left-4 top-20 z-[1601] max-w-xs rounded-xl border border-slate-700/80 bg-slate-950/95 p-3 text-sm text-slate-100 shadow-xl shadow-black/30 backdrop-blur'}>
          <div className={isLight ? 'text-xs font-semibold uppercase tracking-wide text-amber-700' : 'text-xs font-semibold uppercase tracking-wide text-amber-300'}>
            Annotation mode on
          </div>
          <div className={isLight ? 'mt-1 text-sm text-slate-600' : 'mt-1 text-sm text-slate-300'}>
            {tool === 'note' && 'Click once to place a note.'}
            {tool === 'highlight' && 'Click once to mark a highlighted area.'}
            {tool === 'arrow' && (segmentStart ? 'Click a second point to finish the arrow.' : 'Click two points to draw an arrow.')}
            {tool === 'link' && (segmentStart ? 'Click a second point to finish the custom link.' : 'Click two points to draw a custom link.')}
            {tool === 'region' && 'Click several points to trace a region, then switch tools to stop drawing.'}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                onToolChange('note')
                onAnnounce?.('Annotation tool set to note')
              }}
              aria-pressed={tool === 'note'}
              className={tool === 'note'
                ? 'rounded-full border border-sky-400 bg-sky-500/15 px-3 py-1 text-xs font-medium text-sky-700'
                : 'rounded-full border border-slate-300 bg-transparent px-3 py-1 text-xs font-medium text-inherit'}
            >
              Note
            </button>
            <button
              type="button"
              onClick={() => {
                onToolChange('highlight')
                onAnnounce?.('Annotation tool set to highlight')
              }}
              aria-pressed={tool === 'highlight'}
              className={tool === 'highlight'
                ? 'rounded-full border border-amber-400 bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-700'
                : 'rounded-full border border-slate-300 bg-transparent px-3 py-1 text-xs font-medium text-inherit'}
            >
              Highlight
            </button>
            <button
              type="button"
              onClick={() => {
                onToolChange('arrow')
                onAnnounce?.('Annotation tool set to arrow')
              }}
              aria-pressed={tool === 'arrow'}
              className={tool === 'arrow'
                ? 'rounded-full border border-cyan-400 bg-cyan-500/15 px-3 py-1 text-xs font-medium text-cyan-700'
                : 'rounded-full border border-slate-300 bg-transparent px-3 py-1 text-xs font-medium text-inherit'}
            >
              Arrow
            </button>
            <button
              type="button"
              onClick={() => {
                onToolChange('region')
                onAnnounce?.('Annotation tool set to region')
              }}
              aria-pressed={tool === 'region'}
              className={tool === 'region'
                ? 'rounded-full border border-emerald-400 bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-700'
                : 'rounded-full border border-slate-300 bg-transparent px-3 py-1 text-xs font-medium text-inherit'}
            >
              Region
            </button>
            <button
              type="button"
              onClick={() => {
                onToolChange('link')
                onAnnounce?.('Annotation tool set to link')
              }}
              aria-pressed={tool === 'link'}
              className={tool === 'link'
                ? 'rounded-full border border-fuchsia-400 bg-fuchsia-500/15 px-3 py-1 text-xs font-medium text-fuchsia-700'
                : 'rounded-full border border-slate-300 bg-transparent px-3 py-1 text-xs font-medium text-inherit'}
            >
              Link
            </button>
          </div>
          {segmentStart && tool !== 'region' && (
            <button
              type="button"
              onClick={() => {
                setSegmentStart(null)
                onAnnounce?.('Line annotation cancelled')
              }}
              className={isLight ? 'mt-3 rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50' : 'mt-3 rounded-lg border border-slate-700 px-3 py-1 text-xs font-medium text-slate-200 transition hover:bg-slate-900'}
            >
              Cancel line
            </button>
          )}
          {tool === 'region' && draftRegion.length >= 3 && (
            <button
              type="button"
              onClick={() => {
                const text = formatLabel(window.prompt('Label this region', ''))
                onAnnotationsChange([
                  ...annotations,
                  {
                    id: makeId(),
                    kind: 'region',
                    points: draftRegion,
                    text,
                    createdAt: new Date().toISOString(),
                  },
                ])
                setDraftRegion([])
                onAnnounce?.('Region annotation added')
              }}
              className={isLight ? 'mt-3 rounded-lg border border-emerald-300 px-3 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50' : 'mt-3 rounded-lg border border-emerald-500/40 px-3 py-1 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/10'}
            >
              Finish region
            </button>
          )}
        </div>
      )}
    </>
  )
}

export default AnnotationModeOverlay