import React, { useEffect, useRef, useState } from 'react'
import { Pane, LayerGroup, Polyline, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import * as L from 'leaflet'
import type { LatLngExpression } from 'leaflet'
import useLanguoidData from '@/hooks/useLanguoidData'
import { normalizePosition, getCoordinatesForLanguage } from '@/utils/mapUtils'
import { apiUrl } from '@/utils/apiBase'

type DescNode = {
  word?: string
  lang_code?: string | null
  expansion?: string | null
}

type DescPath = DescNode[]

const DescendantLineagePaths: React.FC<{ rootWord: string; rootLang: string; playSpeed?: number }> = ({
  rootWord,
  rootLang,
  playSpeed = 900,
}) => {
  const map = useMap()
  const languoidData = useLanguoidData()
  const [paths, setPaths] = useState<DescPath[]>([])
  const [resolvedRoot, setResolvedRoot] = useState<string | null>(null)
  const [resolvedRootLang, setResolvedRootLang] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const polyRefs = useRef<Record<number, L.Polyline | null>>({})

  // Fetch paths from backend
  useEffect(() => {
    if (!rootWord) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        // const url = apiUrl(
        //   `/descendant-paths-from-root?word=${encodeURIComponent(rootWord)}&lang_code=${encodeURIComponent(
        //     rootLang || '',
        //   )}`,
        // )
        console.debug('DescendantLineagePaths: fetching', url)
        const res = await fetch(url)
        if (!res.ok) {
          setPaths([])
          setLoading(false)
          return
        }
        const json = await res.json()
        const raw = (json.paths || []) as DescPath[]
        if (!cancelled) {
          setPaths(raw)
          setResolvedRoot(json.root || null)
          setResolvedRootLang(json.root_lang || null)
          // If we have a resolved root language, try to center map there once loaded
          try {
            const rootLang = json.root_lang || null
            if (rootLang && map && languoidData && languoidData.length) {
              const pos = await getCoordinatesForLanguage(rootLang, languoidData)
              if (pos && !cancelled) {
                map.flyTo([pos.lat, pos.lng], Math.max(3, map.getZoom()), { duration: 0.8 })
              }
            }
          } catch {
            // ignore
          }
        }
      } catch (e) {
        console.error('Descendant fetch error', e)
        if (!cancelled) setPaths([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [rootWord, rootLang, map, languoidData])

  // Resolve coordinates for each node by language code (cache by lang)
  const [coordsMap, setCoordsMap] = useState<Record<string, [number, number] | null>>({})

  useEffect(() => {
    if (!paths || paths.length === 0) {
      setCoordsMap({})
      return
    }
    if (!languoidData || languoidData.length === 0) return
    let cancelled = false
    ;(async () => {
      const uniqueLangs = new Set<string>()
      for (const p of paths) for (const n of p) if (n.lang_code) uniqueLangs.add(n.lang_code)
      const next: Record<string, [number, number] | null> = { ...coordsMap }
      for (const lc of Array.from(uniqueLangs)) {
        if (next[lc] !== undefined) continue
        try {
          const pos = await getCoordinatesForLanguage(lc, languoidData)
          next[lc] = pos ? [pos.lat, pos.lng] : null
        } catch {
          next[lc] = null
        }
        if (cancelled) return
      }
      if (!cancelled) setCoordsMap(next)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paths, languoidData])

  const coordsForPath = (p: DescPath): LatLngExpression[] =>
    p
      .map(n => {
        const lc = n.lang_code || ''
        const cached = coordsMap[lc]
        if (cached && Array.isArray(cached)) return normalizePosition(cached as [number, number])
        return null
      })
      .filter(Boolean) as LatLngExpression[]

  useEffect(() => {
    if (!isPlaying) return
    if (!paths.length) {
      setIsPlaying(false)
      return
    }
    let cancelled = false

    const animatePath = async (index: number) => {
      const poly = polyRefs.current[index]
      if (!poly) return
      try {
  const pathEl = poly.getElement() as SVGPathElement | null
  if (!pathEl) return
  const latlngs = (poly.getLatLngs && poly.getLatLngs()) || []
        if (latlngs.length < 2) return
  const p0 = map.project(latlngs[0] as L.LatLng)
  const p1 = map.project(latlngs[1] as L.LatLng)
        const dist = pathEl.getTotalLength ? pathEl.getTotalLength() : p0.distanceTo(p1)
        pathEl.style.strokeDasharray = `${dist}`
        pathEl.style.strokeDashoffset = `${dist}`
        void pathEl.getBoundingClientRect()
        pathEl.classList.add('etymology-segment-animating')
        await new Promise(resolve => setTimeout(resolve, playSpeed + 120))
        pathEl.classList.remove('etymology-segment-animating')
      } catch {
        // ignore
      }
    }

    ;(async () => {
      for (let i = 0; i < paths.length; i++) {
        if (cancelled) break
        setSelected(i)
        await animatePath(i)
        await new Promise(resolve => setTimeout(resolve, 240))
      }
      setIsPlaying(false)
    })()
    return () => {
      cancelled = true
    }
  }, [isPlaying, paths, playSpeed, map])

  return (
    <Pane name="descendant-paths" style={{ zIndex: 565 }}>
      <LayerGroup>
        {paths.map((p, idx) => {
          const coords = coordsForPath(p)
          if (!coords || coords.length < 2) return null
          const isActive = selected === idx
          const baseColor = isActive ? '#fb923c' : '#f97316'
          return (
            <React.Fragment key={`path-${idx}`}>
              <Polyline
                positions={coords}
                pathOptions={{ color: baseColor, weight: isActive ? 3.6 : 2.2, opacity: isActive ? 0.98 : 0.6, className: `etymology-segment${isActive ? ' etymology-segment-active' : ''}` }}
                ref={ref => {
                  polyRefs.current[idx] = ref as unknown as L.Polyline | null
                }}
                eventHandlers={{ click: () => setSelected(prev => (prev === idx ? null : idx)) }}
              />
              {coords.map((c, i) => (
                <CircleMarker key={`c-${idx}-${i}`} center={c} radius={selected === idx ? 6 : 3.5} pathOptions={{ fillColor: '#f97316', color: '#92400e', weight: 1, fillOpacity: selected === idx ? 0.95 : 0.7 }}>
                  {(selected === idx || i === coords.length - 1) && (
                    <Tooltip direction="top" offset={[0, -6]} permanent={false}>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>{p[i]?.expansion ?? p[i]?.word}</div>
                    </Tooltip>
                  )}
                </CircleMarker>
              ))}
            </React.Fragment>
          )
        })}
      </LayerGroup>

      {/* <div style={{ position: 'absolute', right: 12, bottom: 92, zIndex: 580, background: 'rgba(7,9,14,0.7)', padding: 8, borderRadius: 8, color: '#f8fafc', fontSize: 12, minWidth: 200 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontWeight: 700, color: '#FBBF24' }}>Descendant Paths</div>
            <div>
              <button onClick={() => setIsPlaying(p => !p)} style={{ background: isPlaying ? '#ef4444' : '#10b981', color: 'white', border: 'none', padding: '6px 8px', borderRadius: 6, cursor: 'pointer' }} title={isPlaying ? 'Stop playback' : 'Play descendant branches'}>
                {isPlaying ? 'Stop' : 'Play'}
              </button>
            </div>
          </div>
          <div style={{ color: '#cbd5e1', fontSize: 12 }}>
            {resolvedRoot ? (
              <span>
                Root: <strong style={{ color: '#fef3c7' }}>{resolvedRoot}</strong>
                {resolvedRootLang ? <span style={{ marginLeft: 6, opacity: 0.85 }}>({resolvedRootLang})</span> : null}
              </span>
            ) : (
              <span>Root: <em>detecting…</em></span>
            )}
          </div>
        </div>
        <div style={{ marginTop: 8, maxHeight: 160, overflow: 'auto' }}>
          {loading ? (
            <div style={{ color: '#94a3b8' }}>Loading...</div>
          ) : paths.length ? (
            <ul style={{ paddingLeft: 12, margin: 0 }}>
              {paths.map((p, i) => (
                <li key={`li-${i}`} style={{ marginBottom: 6 }}>
                  <button onClick={() => setSelected(prev => (prev === i ? null : i))} style={{ display: 'flex', justifyContent: 'space-between', width: '100%', background: selected === i ? '#1f2937' : 'transparent', color: '#f8fafc', border: 'none', textAlign: 'left', padding: '4px 6px', borderRadius: 6, cursor: 'pointer' }}>
                    <span style={{ fontSize: 13 }}>{p[0]?.word ?? `Branch ${i + 1}`}</span>
                    <span style={{ opacity: 0.8, fontSize: 12 }}>{p.length} pts</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div style={{ color: '#94a3b8' }}>No descendant paths found</div>
          )}
        </div>
      </div> */}
    </Pane>
  )
}

export default DescendantLineagePaths
