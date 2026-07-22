import { useCallback, useEffect, useMemo, useState } from 'react'
import { CircleMarker, Marker, Polygon, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { calculateBearing, createArrowIcon } from '@/utils/mapUtils'
import type {
  AnnotationColor,
  AnnotationKind,
  MapAnnotation,
  SegmentAnnotation,
} from '@/types/mapState'

type AnnotationTheme = 'dark' | 'light'

interface AnnotationModeOverlayProps {
  enabled: boolean
  visible: boolean
  tool: AnnotationKind
  annotationColor: AnnotationColor
  annotations: MapAnnotation[]
  onAnnotationsChange: (nextAnnotations: MapAnnotation[]) => void
  onToolChange: (tool: AnnotationKind) => void
  onAnnounce?: (message: string) => void
  theme?: AnnotationTheme
}

const annotationColorValues: Record<AnnotationColor, { stroke: string; fill: string }> = {
  red: { stroke: '#ef4444', fill: '#fca5a5' },
  green: { stroke: '#22c55e', fill: '#86efac' },
  blue: { stroke: '#38bdf8', fill: '#7dd3fc' },
  white: { stroke: '#f8fafc', fill: '#ffffff' },
  black: { stroke: '#111827', fill: '#111827' },
}

const annotationRadiusMeters = 40000
const regionCloseThresholdMeters = 35000

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

const getAnnotationLabel = (kind: 'note' | 'highlight' | 'arrow' | 'region' | 'link' | 'freehand', promptValue?: string | null) => {
  if (kind === 'note') {
    return formatLabel(promptValue ?? '')
  }

  switch (kind) {
    case 'highlight':
      return 'Highlight'
    case 'arrow':
      return 'Arrow'
    case 'region':
      return 'Region'
    case 'link':
      return 'Link'
    case 'freehand':
      return 'Freehand'
    default:
      return 'Annotation'
  }
}

const createNoteIcon = (theme: AnnotationTheme, annotationColor: AnnotationColor) =>
  L.divIcon({
    className: 'annotation-note-icon',
    html: `<div style="width:28px;height:28px;border-radius:9999px;display:grid;place-items:center;font-size:16px;font-weight:700;box-shadow:0 8px 20px rgba(0,0,0,.28);background:${theme === 'light' ? '#0f172a' : '#f8fafc'};color:${annotationColorValues[annotationColor].stroke};border:2px solid ${annotationColorValues[annotationColor].stroke};">✎</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })

const createStartMarkerIcon = (theme: AnnotationTheme) =>
  L.divIcon({
    className: 'annotation-start-marker-icon',
    html: `<div style="width:18px;height:18px;border-radius:9999px;box-shadow:0 6px 14px rgba(0,0,0,.22);background:${theme === 'light' ? '#ecfeff' : '#042f2e'};border:2px solid ${theme === 'light' ? '#06b6d4' : '#14b8a6'};"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })

const createFreehandStartIcon = (theme: AnnotationTheme) =>
  L.divIcon({
    className: 'annotation-freehand-start-icon',
    html: `<div style="width:16px;height:16px;border-radius:9999px;box-shadow:0 6px 14px rgba(0,0,0,.22);background:${theme === 'light' ? '#fdf2f8' : '#2a1220'};border:2px solid ${theme === 'light' ? '#ec4899' : '#f472b6'};"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  })

const AnnotationModeOverlay: React.FC<AnnotationModeOverlayProps> = ({
  enabled,
  visible,
  tool,
  annotationColor,
  annotations,
  onAnnotationsChange,
  onToolChange,
  onAnnounce,
  theme = 'dark',
}) => {
  const isLight = theme === 'light'
  const selectedColor = annotationColorValues[annotationColor]
  const [segmentStart, setSegmentStart] = useState<[number, number] | null>(null)
  const [segmentHover, setSegmentHover] = useState<[number, number] | null>(null)
  const [draftRegion, setDraftRegion] = useState<[number, number][]>([])
  const [regionHover, setRegionHover] = useState<[number, number] | null>(null)
  const [regionCloseHover, setRegionCloseHover] = useState(false)
  const [freehandStroke, setFreehandStroke] = useState<[number, number][]>([])
  const [freehandDrawing, setFreehandDrawing] = useState(false)
  const map = useMap()

  const annotationCursor = useMemo(() => {
    switch (tool) {
      case 'note':
      case 'highlight':
        return 'crosshair'
      case 'arrow':
      case 'link':
        return 'cell'
      case 'region':
      case 'freehand':
        return 'crosshair'
      default:
        return 'crosshair'
    }
  }, [tool])

  useEffect(() => {
    if (!enabled || tool !== 'region') {
      setDraftRegion([])
      setRegionHover(null)
      setRegionCloseHover(false)
    }
    if (!enabled || tool !== 'freehand') {
      setFreehandStroke([])
      setFreehandDrawing(false)
    }
    if (!enabled || tool === 'region') {
      setSegmentStart(null)
    }
    if (!enabled || tool !== 'arrow' && tool !== 'link') {
      setSegmentHover(null)
    }
  }, [enabled, tool])

  useEffect(() => {
    if (!enabled) return
    const previousBodyCursor = document.body.style.cursor
    const previousHtmlCursor = document.documentElement.style.cursor
    const mapRoot = document.getElementById('map-root')
    const previousMapCursor = mapRoot?.style.cursor ?? ''
    const nextCursor = regionCloseHover ? 'pointer' : annotationCursor

    document.body.style.cursor = nextCursor
    document.documentElement.style.cursor = nextCursor
    if (mapRoot) {
      mapRoot.style.cursor = nextCursor
    }
    return () => {
      document.body.style.cursor = previousBodyCursor
      document.documentElement.style.cursor = previousHtmlCursor
      if (mapRoot) {
        mapRoot.style.cursor = previousMapCursor
      }
    }
  }, [annotationCursor, enabled, regionCloseHover])

  useEffect(() => {
    if (!enabled || tool !== 'freehand') return

    const draggingWasEnabled = map.dragging.enabled()
    if (draggingWasEnabled) {
      map.dragging.disable()
    }

    return () => {
      if (draggingWasEnabled) {
        map.dragging.enable()
      }
    }
  }, [enabled, map, tool])

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
    addAnnotation({
      id: makeId(),
      kind,
      start,
      end,
      text: getAnnotationLabel(kind),
      createdAt: new Date().toISOString(),
      annotationColor,
    })
  }, [addAnnotation, annotationColor])

  const handleMapClick = useCallback((event: L.LeafletMouseEvent) => {
    if (!enabled) return

    const originalEvent = event.originalEvent as Event | undefined
    if (originalEvent) {
      const target = originalEvent.target
      if (target instanceof Element && target.closest('[data-map-ui-overlay="true"]')) {
        return
      }
    }

    const point: [number, number] = [event.latlng.lat, event.latlng.lng]

    if (tool === 'note') {
      const text = formatLabel(window.prompt('Add a note for this location', ''))
      addAnnotation({
        id: makeId(),
        kind: 'note',
        position: point,
        text,
        createdAt: new Date().toISOString(),
        annotationColor,
      })
      onAnnounce?.('Annotation note added')
      return
    }

    if (tool === 'highlight') {
      addAnnotation({
        id: makeId(),
        kind: 'highlight',
        center: point,
        radiusMeters: annotationRadiusMeters,
        text: getAnnotationLabel('highlight'),
        createdAt: new Date().toISOString(),
        annotationColor,
      })
      onAnnounce?.('Highlight annotation added')
      return
    }

    if (tool === 'arrow' || tool === 'link') {
      if (!segmentStart) {
        setSegmentStart(point)
        setSegmentHover(point)
        onAnnounce?.(tool === 'arrow'
          ? 'Arrow started. Click a second point to finish the arrow.'
          : 'Custom link started. Click a second point to finish the link.')
        return
      }

      finishSegment(tool, segmentStart, point)
      setSegmentStart(null)
      setSegmentHover(null)
      onAnnounce?.(tool === 'arrow' ? 'Arrow annotation added' : 'Custom link annotation added')
      return
    }

    if (tool === 'region') {
      const startPoint = draftRegion[0]
      const shouldCloseRegion = draftRegion.length >= 3 && startPoint
        ? L.latLng(point).distanceTo(L.latLng(startPoint)) <= regionCloseThresholdMeters
        : false

      if (shouldCloseRegion) {
        onAnnotationsChange([
          ...annotations,
          {
            id: makeId(),
            kind: 'region',
            points: draftRegion,
            text: getAnnotationLabel('region'),
            createdAt: new Date().toISOString(),
            annotationColor,
          },
        ])
        setDraftRegion([])
        setRegionHover(null)
        setRegionCloseHover(false)
        onAnnounce?.('Region annotation added')
        return
      }

      setDraftRegion(current => [...current, point])
      setRegionHover(point)
      onAnnounce?.('Region point added')
    }

    if (tool === 'freehand') {
      return
    }
  }, [addAnnotation, annotationColor, annotations, enabled, finishSegment, freehandDrawing, freehandStroke, onAnnounce, draftRegion, segmentStart, tool, onAnnotationsChange])

  useMapEvents({
    mousedown: event => {
      if (!enabled || tool !== 'freehand') return
      const point: [number, number] = [event.latlng.lat, event.latlng.lng]
      setFreehandDrawing(true)
      setFreehandStroke([point])
      onAnnounce?.('Freehand drawing started')
    },
    click: handleMapClick,
    mousemove: event => {
      if (!enabled) return
      if ((tool === 'arrow' || tool === 'link') && segmentStart) {
        setSegmentHover([event.latlng.lat, event.latlng.lng])
        return
      }
      if (tool === 'region' && draftRegion.length > 0) {
        const nextPoint = [event.latlng.lat, event.latlng.lng] as [number, number]
        setRegionHover(nextPoint)
        const startPoint = draftRegion[0]
        setRegionCloseHover(Boolean(startPoint) && draftRegion.length >= 3 && L.latLng(nextPoint).distanceTo(L.latLng(startPoint)) <= regionCloseThresholdMeters)
        return
      }
      if (tool === 'freehand' && freehandDrawing) {
        const nextPoint = [event.latlng.lat, event.latlng.lng] as [number, number]
        setFreehandStroke(current => {
          if (!current.length) return [nextPoint]
          const lastPoint = current[current.length - 1]
          const samePoint = lastPoint[0] === nextPoint[0] && lastPoint[1] === nextPoint[1]
          return samePoint ? current : [...current, nextPoint]
        })
      }
    },
    mouseup: event => {
      if (!enabled || tool !== 'freehand' || !freehandDrawing) return
      const point: [number, number] = [event.latlng.lat, event.latlng.lng]
      setFreehandStroke(current => {
        if (!current.length) return [point]
        const lastPoint = current[current.length - 1]
        const samePoint = lastPoint[0] === point[0] && lastPoint[1] === point[1]
        return samePoint ? current : [...current, point]
      })

      setFreehandDrawing(false)
      const path = freehandStroke.length > 1 ? freehandStroke : [point]
      if (path.length < 2) {
        setFreehandStroke([])
        return
      }
      onAnnotationsChange([
        ...annotations,
        {
          id: makeId(),
          kind: 'freehand',
          points: path,
          text: getAnnotationLabel('freehand'),
          createdAt: new Date().toISOString(),
          annotationColor,
        },
      ])
      setFreehandStroke([])
      onAnnounce?.('Freehand annotation added')
    },
    mouseout: () => {
      if (!enabled) return
      if (tool === 'arrow' || tool === 'link') {
        setSegmentHover(null)
        return
      }
      if (tool === 'region') {
        setRegionHover(null)
        setRegionCloseHover(false)
      }
      if (tool === 'freehand' && !freehandDrawing) {
        setFreehandStroke([])
      }
    },
  })

  const freehandPreview = useMemo(() => {
    if (!enabled || tool !== 'freehand' || freehandStroke.length === 0) return null

    return (
      <>
        <Marker
          position={freehandStroke[0]}
          interactive={false}
          zIndexOffset={2100}
          icon={createFreehandStartIcon(theme)}
        />
        <Polyline
          positions={freehandStroke}
          pathOptions={{
            color: selectedColor.stroke,
            weight: 4,
            opacity: 0.9,
          }}
          interactive={false}
        />
      </>
    )
  }, [enabled, freehandStroke, selectedColor.stroke, theme, tool])

  const draftSegment = useMemo(() => {
    if (!enabled || (tool !== 'arrow' && tool !== 'link') || !segmentStart || !segmentHover) return null
    const isArrow = tool === 'arrow'
    const bearing = calculateBearing(segmentStart, segmentHover)

    return (
      <>
        <Marker
          position={segmentStart}
          interactive={false}
          zIndexOffset={2100}
          icon={createStartMarkerIcon(theme)}
        />
        <Polyline
          positions={[segmentStart, segmentHover]}
          pathOptions={{
            color: selectedColor.stroke,
            weight: 4,
            dashArray: isArrow ? '10 10' : '8 8',
            opacity: 0.85,
          }}
          interactive={false}
        />
        {isArrow && (
          <Marker
            position={segmentHover}
            zIndexOffset={2100}
            interactive={false}
            icon={createArrowIcon(bearing, {
              size: 24,
              color: selectedColor.stroke,
              outline: isLight ? '#ffffff' : '#082f49',
              outlineWidth: 2,
              opacity: 1,
            })}
          />
        )}
      </>
    )
  }, [enabled, isLight, selectedColor.stroke, segmentHover, segmentStart, tool, theme])

  const regionPreview = useMemo(() => {
    if (!enabled || tool !== 'region' || draftRegion.length === 0 || !regionHover) return null

    const previewPoints = [...draftRegion, regionHover]

    return (
      <>
        <Marker
          position={draftRegion[0]}
          interactive={true}
          zIndexOffset={2100}
          icon={createStartMarkerIcon(theme)}
          eventHandlers={{
            mouseover: () => {
              if (draftRegion.length >= 3) {
                setRegionCloseHover(true)
              }
            },
            mouseout: () => {
              setRegionCloseHover(false)
            },
            click: () => {
              if (draftRegion.length < 3) return
              onAnnotationsChange([
                ...annotations,
                {
                  id: makeId(),
                  kind: 'region',
                  points: draftRegion,
                  text: getAnnotationLabel('region'),
                  createdAt: new Date().toISOString(),
                  annotationColor,
                },
              ])
              setDraftRegion([])
              setRegionHover(null)
              setRegionCloseHover(false)
              onAnnounce?.('Region annotation added')
            },
          }}
        />
        {draftRegion.length === 1 ? (
          <Polyline
            positions={previewPoints}
            pathOptions={{
              color: selectedColor.stroke,
              weight: 4,
              dashArray: '10 10',
              opacity: 0.85,
            }}
            interactive={false}
          />
        ) : (
          <Polygon
            positions={previewPoints}
            pathOptions={{
              color: selectedColor.stroke,
              dashArray: '10 10',
              fillOpacity: 0.12,
              fillColor: selectedColor.fill,
              opacity: 0.9,
              weight: 3,
            }}
            interactive={false}
          />
        )}
      </>
    )
  }, [annotationColor, annotations, draftRegion, enabled, onAnnounce, onAnnotationsChange, regionHover, selectedColor.fill, selectedColor.stroke, theme, tool])

  return (
    <>
      {visible && annotations.map(annotation => {
        if (annotation.kind === 'note') {
          return (
            <Marker
              key={annotation.id}
              position={annotation.position}
              icon={createNoteIcon(theme, annotation.annotationColor ?? annotationColor)}
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
          const colorValue = annotationColorValues[annotation.annotationColor ?? annotationColor]
          return (
            <CircleMarker
              key={annotation.id}
              center={annotation.center}
              radius={12}
              pathOptions={{ color: colorValue.stroke, fillColor: colorValue.fill, fillOpacity: 0.35, weight: 3 }}
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
          const colorValue = annotationColorValues[annotation.annotationColor ?? annotationColor]
          return (
            <Polygon
              key={annotation.id}
              positions={annotation.points}
              pathOptions={{ color: colorValue.stroke, fillColor: colorValue.fill, fillOpacity: 0.12, weight: 2 }}
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

        if (annotation.kind === 'freehand') {
          const colorValue = annotationColorValues[annotation.annotationColor ?? annotationColor]
          return (
            <Polyline
              key={annotation.id}
              positions={annotation.points}
              pathOptions={{ color: colorValue.stroke, weight: 4, opacity: 0.9 }}
              eventHandlers={{
                click: event => {
                  event.originalEvent.stopPropagation()
                },
              }}
            >
              <Popup>
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-wide opacity-70">Freehand</div>
                  <div>{annotation.text}</div>
                </div>
              </Popup>
            </Polyline>
          )
        }

        const bearing = calculateBearing(annotation.start, annotation.end)
        const isArrow = annotation.kind === 'arrow'
        const colorValue = annotationColorValues[annotation.annotationColor ?? annotationColor]

        return (
          <>
            <Polyline
              key={annotation.id}
              positions={[annotation.start, annotation.end]}
              pathOptions={{
                color: colorValue.stroke,
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
                  color: colorValue.stroke,
                  outline: isLight ? '#ffffff' : '#082f49',
                  outlineWidth: 2,
                  opacity: 1,
                })}
              />
            )}
          </>
        )
      })}
      {draftSegment}
      {regionPreview}
      {freehandPreview}
      {enabled && (
        <div className={isLight ? 'fixed left-4 top-20 z-[1601] max-w-xs rounded-2xl border border-amber-300 bg-amber-50/95 p-3 text-sm text-slate-700 shadow-xl shadow-amber-100/60 backdrop-blur' : 'fixed left-4 top-20 z-[1601] max-w-xs rounded-2xl border border-amber-400/40 bg-slate-950/96 p-3 text-sm text-slate-100 shadow-xl shadow-black/30 backdrop-blur ring-1 ring-amber-400/15'}>
          <div className={isLight ? 'text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-700' : 'text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-300'}>
            Annotation mode on
          </div>
          <div className={isLight ? 'mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2' : 'mt-2 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2'}>
            <div className={isLight ? 'flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500' : 'flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400'}>
              <span className={isLight ? 'flex h-5 w-5 items-center justify-center rounded-full bg-cyan-100 text-cyan-700' : 'flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/15 text-cyan-200'}>
                {tool === 'arrow' || tool === 'link' ? '1' : '!'}
              </span>
              {tool === 'arrow' || tool === 'link' ? 'Step 1 of 2' : 'Tool instructions'}
            </div>
            <div className={isLight ? 'mt-2 text-sm text-slate-600' : 'mt-2 text-sm text-slate-300'}>
              {tool === 'note' && 'Click once to place a note.'}
              {tool === 'highlight' && 'Click once to mark a highlighted area.'}
              {tool === 'arrow' && (segmentStart ? 'Step 2 of 2: click a second point to finish the arrow.' : 'Click once to set the arrow start point, then click a second point to finish it.')}
              {tool === 'link' && (segmentStart ? 'Step 2 of 2: click a second point to finish the custom link.' : 'Click once to set the link start point, then click a second point to finish it.')}
              {tool === 'freehand' && 'Press and hold, then drag to draw a freehand stroke. Release to label it.'}
              {tool === 'region' && 'Click several points to trace a region, then switch tools to stop drawing.'}
            </div>
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
                onToolChange('freehand')
                onAnnounce?.('Annotation tool set to freehand')
              }}
              aria-pressed={tool === 'freehand'}
              className={tool === 'freehand'
                ? 'rounded-full border border-rose-400 bg-rose-500/15 px-3 py-1 text-xs font-medium text-rose-700'
                : 'rounded-full border border-slate-300 bg-transparent px-3 py-1 text-xs font-medium text-inherit'}
            >
              Freehand
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
                    annotationColor,
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