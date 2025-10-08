import { FC, useEffect, useMemo, useRef, useState } from 'react'
import { Pane, useMap } from 'react-leaflet'
import type { FeatureCollection, Geometry, Feature, Polygon, MultiPoint } from 'geojson'
import useLanguageFamiliesGeoJSON, { LanguageFamilyProps } from '@/hooks/useLanguageFamiliesGeoJSON'
import { BSplineShapeGenerator, BubbleSet, PointPath, ShapeSimplifier } from 'bubblesets'

type Props = { path?: string }

const palette = [
  '#ef4444',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#22c55e',
  '#06b6d4',
  '#eab308',
  '#a855f7',
]

function colorForId(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return palette[h % palette.length]
}

type PathEntry = {
  id: string
  d: string
  color: string
  title: string
  name: string
  labelX: number
  labelY: number
}

const LanguageFamiliesBubbles: FC<Props> = ({ path = '/language_families.geojson' }) => {
  const data = useLanguageFamiliesGeoJSON(path)
  const map = useMap()
  const [paths, setPaths] = useState<PathEntry[]>([])
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null)
  const [hoverCandidates, setHoverCandidates] = useState<PathEntry[] | null>(null)
  const [menuIndex, setMenuIndex] = useState<number>(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const bubble = useMemo(() => new BubbleSet(), [])
  const simplifiers = useMemo(
    () => [new ShapeSimplifier(0.0), new BSplineShapeGenerator(), new ShapeSimplifier(0.0)],
    [],
  )
  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 })
  const [svgSize, setSvgSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })

  // Compute screen-space bubble paths for current map view
  const recompute = useMemo(() => {
    return () => {
      if (!data) return
      const sz = map.getSize()
      const w = sz.x
      const h = sz.y
      if (sizeRef.current.w !== w || sizeRef.current.h !== h) {
        sizeRef.current = { w, h }
        setSvgSize({ w, h })
      }
      const newPaths: PathEntry[] = []
      const pad = 6
      const dot = 8 // rectangle size for each sampled vertex (in px)

      const project = (lat: number, lon: number) => map.latLngToLayerPoint([lat, lon])

      const eachFeature = (f: Feature<Geometry, LanguageFamilyProps>): void => {
        if (!f.geometry) return
        const id = f.properties?.id || ''
        const color = colorForId(id)
        const name = f.properties?.name ?? id
        const title = `${name} (${f.properties?.point_count ?? 0})`
        const rects: { x: number; y: number; width: number; height: number }[] = []
        let minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity

        if (f.geometry.type === 'Polygon') {
          // Use outer ring only
          const poly = f.geometry as Polygon
          const ring = poly.coordinates[0] || []
          if (ring.length < 3) return
          // Sample vertices to reduce rectangles; aim for at most ~48 points per feature
          const step = Math.max(1, Math.ceil(ring.length / 48))
          for (let i = 0; i < ring.length; i += step) {
            const [lon, lat] = ring[i]
            const p = project(lat, lon)
            rects.push({ x: p.x - dot / 2, y: p.y - dot / 2, width: dot, height: dot })
            if (p.x < minX) minX = p.x
            if (p.y < minY) minY = p.y
            if (p.x > maxX) maxX = p.x
            if (p.y > maxY) maxY = p.y
          }
        } else if (f.geometry.type === 'MultiPoint') {
          const mp = f.geometry as MultiPoint
          const coords = mp.coordinates || []
          // Sample points; if there are many, downsample to ~96 rects
          const step = Math.max(1, Math.ceil(coords.length / 96))
          for (let i = 0; i < coords.length; i += step) {
            const [lon, lat] = coords[i]
            const p = project(lat, lon)
            rects.push({ x: p.x - dot / 2, y: p.y - dot / 2, width: dot, height: dot })
            if (p.x < minX) minX = p.x
            if (p.y < minY) minY = p.y
            if (p.x > maxX) maxX = p.x
            if (p.y > maxY) maxY = p.y
          }
        } else {
          return
        }
        if (rects.length < 1) return
        try {
          const list = bubble.createOutline(BubbleSet.addPadding(rects, pad), [], null)
          const outline = new PointPath(list).transform(simplifiers)
          const d = `${outline}`
          if (d && d.length > 0) {
            const labelX = (minX + maxX) / 2
            const labelY = (minY + maxY) / 2
            newPaths.push({ id, d, color, title, name, labelX, labelY })
          }
        } catch {
          // fallback: skip this feature on failure
        }
      }

      if (Array.isArray((data as FeatureCollection).features)) {
        for (const f of (data as FeatureCollection<Geometry, LanguageFamilyProps>).features) {
          eachFeature(f)
        }
      }
      setPaths(newPaths)
    }
  }, [data, map, bubble, simplifiers])

  // Initial compute and on map interactions
  useEffect(() => {
    if (!data) return
    recompute()
    const onMoveEnd = () => recompute()
    map.on('moveend', onMoveEnd)
    map.on('zoomend', onMoveEnd)
    return () => {
      map.off('moveend', onMoveEnd)
      map.off('zoomend', onMoveEnd)
    }
  }, [data, recompute, map])

  // Keyboard handling: Escape to unlock/close menu
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedId(null)
        setHoverId(null)
        setHoverCandidates(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Reset menu selection when candidate list changes
  useEffect(() => {
    if (hoverCandidates && hoverCandidates.length > 0) setMenuIndex(0)
  }, [hoverCandidates])

  if (!data) return null

  return (
    <Pane name="language-families-bubbles" style={{ zIndex: 536 }}>
      <svg
        ref={svgRef}
        width={svgSize.w}
        height={svgSize.h}
        style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}
        onMouseLeave={() => {
          setHoverId(null)
          setHoverPos(null)
          setHoverCandidates(null)
        }}
        onMouseDown={e => {
          // Click background clears selection
          if (e.target === svgRef.current) {
            setSelectedId(null)
            setHoverId(null)
            setHoverCandidates(null)
          }
        }}
      >
        {(() => {
          const activeId = selectedId || hoverId || null
          const hovered = activeId ? paths.find(p => p.id === activeId) : null
          const others = activeId ? paths.filter(p => p.id !== activeId) : paths
          const renderPath = (p: PathEntry, isHovered: boolean) => {
            const baseFill = 0.16
            const hasFocus = !!(selectedId || hoverId)
            const fillOpacity = isHovered ? 0.28 : hasFocus ? baseFill * 0.35 : baseFill
            const strokeOpacity = isHovered ? 0.98 : hasFocus ? 0.45 : 0.95
            const strokeWidth = isHovered ? 2.4 : 1.4
            return (
              <g key={p.id}>
                {/* Invisible fat hit-area to improve targeting in dense clusters */}
                <path
                  d={p.d}
                  fill="none"
                  stroke="#000"
                  strokeOpacity={0}
                  strokeWidth={28}
                  data-bubble-id={p.id}
                  style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                  onMouseEnter={() => setHoverId(p.id)}
                  onMouseLeave={() => {
                    setHoverId(prev => (prev === p.id ? null : prev))
                    setHoverPos(null)
                    setHoverCandidates(null)
                  }}
                  onMouseMove={e => {
                    const svg = svgRef.current
                    if (!svg) return
                    const rect = svg.getBoundingClientRect()
                    const x = e.clientX - rect.left
                    const y = e.clientY - rect.top
                    const OFFSET_X = 10
                    const OFFSET_Y = -10
                    setHoverPos({ x: x + OFFSET_X, y: y + OFFSET_Y })
                    const els = document.elementsFromPoint(e.clientX, e.clientY)
                    const ids: string[] = []
                    for (const el of els) {
                      if (
                        el instanceof SVGPathElement &&
                        (el as SVGPathElement).hasAttribute('data-bubble-id')
                      ) {
                        const id = (el as SVGPathElement).getAttribute('data-bubble-id')
                        if (id && !ids.includes(id)) ids.push(id)
                      }
                    }
                    if (ids.length > 1) {
                      const cands = ids
                        .map(id => paths.find(pp => pp.id === id))
                        .filter(Boolean) as PathEntry[]
                      setHoverCandidates(cands)
                    } else {
                      setHoverCandidates(null)
                    }
                  }}
                  onMouseDown={e => {
                    e.stopPropagation()
                    // Toggle lock: click again to unlock
                    setSelectedId(prev => (prev === p.id ? null : p.id))
                  }}
                />
                <path
                  d={p.d}
                  fill={p.color}
                  fillOpacity={fillOpacity}
                  stroke={p.color}
                  strokeOpacity={strokeOpacity}
                  strokeWidth={strokeWidth}
                  data-bubble-id={p.id}
                  style={{ pointerEvents: 'visiblePainted', cursor: 'pointer' }}
                  onMouseEnter={() => setHoverId(p.id)}
                  onMouseLeave={() => {
                    setHoverId(prev => (prev === p.id ? null : prev))
                    setHoverPos(null)
                    setHoverCandidates(null)
                  }}
                  onMouseMove={e => {
                    const svg = svgRef.current
                    if (!svg) return
                    const rect = svg.getBoundingClientRect()
                    const x = e.clientX - rect.left
                    const y = e.clientY - rect.top
                    const OFFSET_X = 10
                    const OFFSET_Y = -10
                    setHoverPos({ x: x + OFFSET_X, y: y + OFFSET_Y })

                    // Disambiguation: find all bubble paths under cursor
                    const els = document.elementsFromPoint(e.clientX, e.clientY)
                    const ids: string[] = []
                    for (const el of els) {
                      if (
                        el instanceof SVGPathElement &&
                        (el as SVGPathElement).hasAttribute('data-bubble-id')
                      ) {
                        const id = (el as SVGPathElement).getAttribute('data-bubble-id')
                        if (id && !ids.includes(id)) ids.push(id)
                      }
                    }
                    if (ids.length > 1) {
                      const cands = ids
                        .map(id => paths.find(pp => pp.id === id))
                        .filter(Boolean) as PathEntry[]
                      setHoverCandidates(cands)
                    } else {
                      setHoverCandidates(null)
                    }
                  }}
                  onMouseDown={e => {
                    e.stopPropagation()
                    setSelectedId(prev => (prev === p.id ? null : p.id))
                  }}
                >
                  <title>{p.title}</title>
                </path>
              </g>
            )
          }
          return (
            <>
              {/* Render non-hovered first (possibly faded) */}
              {others.map(p => renderPath(p, false))}
              {/* Render hovered last to raise z-order */}
              {hovered ? renderPath(hovered, true) : null}
            </>
          )
        })()}
        {/* Render the hover label last so it's above all bubble paths */}
  {(selectedId || hoverId) &&
          (() => {
      const activeId = selectedId || hoverId
      const p = paths.find(pp => pp.id === activeId)
            if (!p) return null
      const pos = hoverPos ?? { x: p.labelX, y: p.labelY }
            return (
              <g
                key="hover-label"
                transform={`translate(${pos.x}, ${pos.y})`}
                style={{ pointerEvents: 'none' }}
              >
                {/* Background pill using textLength unknown: approximate with a rect via <text> measurement is complex; keep stroke-text for simplicity */}
                <text
                  x={0}
                  y={0}
                  textAnchor="start"
                  dominantBaseline="hanging"
                  fontSize={16}
                  fill="#ffffff"
                  style={{
                    paintOrder: 'stroke',
                    stroke: 'rgba(0,0,0,0.9)',
                    strokeWidth: 3,
                    filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.6))',
                  }}
                >
      {` ${p.name}${selectedId ? ' 🔒' : ''} `}
                </text>
              </g>
            )
          })()}

        {/* Disambiguation menu when multiple bubbles are under cursor */}
    {hoverCandidates && hoverCandidates.length > 1 && hoverPos && (
          <g
            key="hover-menu"
      transform={`translate(${hoverPos.x }, ${hoverPos.y + 28})`}
            style={{ pointerEvents: 'auto' }}
            onWheel={e => {
              e.preventDefault()
              e.stopPropagation()
              const len = hoverCandidates.length
              if (!len) return
              const dir = e.deltaY > 0 ? 1 : -1
              setMenuIndex(i => (i + dir + len) % len)
            }}
          >
            {/* Panel background */}
            <rect x={-6} y={-6} rx={6} ry={6} width={240} height={hoverCandidates.length * 22 + 12} fill="rgba(10,10,15,0.92)" stroke="rgba(255,255,255,0.2)" />
            {hoverCandidates.slice(0, 8).map((c, idx) => {
              const isActive = idx === menuIndex
              return (
              <g
                key={c.id}
                transform={`translate(0, ${idx * 22})`}
                style={{ cursor: 'pointer' }}
                onMouseDown={e => {
                  e.stopPropagation()
      setHoverId(c.id)
      setSelectedId(c.id)
                  setHoverCandidates(null)
                }}
                onMouseEnter={() => setMenuIndex(idx)}
              >
                <rect x={-4} y={0} width={232} height={20} fill={isActive ? 'rgba(255,255,255,0.08)' : 'transparent'} />
                <rect x={0} y={4} width={12} height={12} fill={c.color} rx={2} ry={2} />
                <text
                  x={18}
                  y={14}
                  fontSize={13}
                  fill="#ffffff"
                  style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.9)', strokeWidth: 2 }}
                >
                  {c.name}
                </text>
              </g>
            )})}
          </g>
        )}
      </svg>
    </Pane>
  )
}

export default LanguageFamiliesBubbles
