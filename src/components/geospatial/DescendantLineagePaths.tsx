import React, { useEffect, useRef, useState } from 'react'
import { Pane, LayerGroup, Polyline, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import * as L from 'leaflet'
import type { LatLngExpression } from 'leaflet'
import { getLanguage } from '@ladjs/country-language'
import useLanguoidData from '@/hooks/useLanguoidData'
import { normalizePosition, getCoordinatesForLanguage } from '@/utils/mapUtils'
import { apiUrl } from '@/utils/apiBase'
import { flattenPathsFromTree, fallbackPoint } from './descendantPathHelpers'
import type { AggregatedTreeNode } from './descendantPathHelpers'

type DescNode = {
  word?: string
  lang_code?: string | null
  romanization?: string | null
  expansion?: string | null
  aggregated?: boolean
  count?: number
}

type DescPath = DescNode[]

type RootCandidate = {
  word?: string
  lang_code?: string | null
  supporting_paths?: number
}

type RenderPoint = {
  position: LatLngExpression
  fallback: boolean
  aggregated: boolean
  count?: number
}

const nodeKey = (word?: string, langCode?: string | null) => `${word ?? ''}|${langCode ?? ''}`

const mergeExpandedPaths = (basePath: DescPath, expandedPaths: DescPath[], clickedIndex: number) => {
  const prefix = basePath.slice(0, clickedIndex + 1)
  const nextPaths = expandedPaths
    .map(path => [...prefix, ...path.slice(1)])
    .filter(path => path.length > prefix.length)

  return nextPaths.length ? nextPaths : [basePath]
}

const hashString = (value: string) => {
  let hash = 0
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return hash
}

const stablePathBase = (path: DescPath): [number, number] => {
  const signature = path.map(node => nodeKey(node.word, node.lang_code)).join('>')
  const hash = hashString(signature)
  const lat = (hash % 12000) / 100 - 60
  const lng = ((Math.floor(hash / 12000) % 30000) / 100) - 150
  return [lat, lng]
}

const getLanguageLabel = (langCode: string | null | undefined, languoidData: ReturnType<typeof useLanguoidData>) => {
  if (!langCode) return null
  const normalizedCode = langCode.toLowerCase()
  const match = languoidData.find(entry => entry.iso639P3code?.toLowerCase() === normalizedCode)
  if (match?.name && match.name.trim()) {
    return match.name
  }
  return langCode
}

const resolveLanguageName = async (langCode: string | null | undefined, languoidData: ReturnType<typeof useLanguoidData>) => {
  if (!langCode) return null

  const direct = getLanguageLabel(langCode, languoidData)
  if (direct && direct !== langCode) return direct

  return await new Promise<string | null>(resolve => {
    getLanguage(langCode, (error, data) => {
      if (error || !data) {
        resolve(direct)
        return
      }

      const name = Array.isArray(data.name) ? data.name[0] : data.name
      resolve(typeof name === 'string' && name.trim() ? name : direct)
    })
  })
}

/*
 * TODO roadmap: bidirectional descendant lineage (overview -> detail)
 *
 * Backend TODOs
 * - TODO: Add preview endpoint (e.g. /descendant-preview) for shallow graph summaries.
 * - TODO: Add count endpoint (e.g. /descendant-count) to estimate subtree size before expansion.
 * - TODO: Add paged subtree endpoint (depth + limit + cursor) for incremental loading.
 * - TODO: Support upward traversal from descendant node to proto-root candidate(s).
 * - TODO: Add aggregation payloads for large branches (cluster count + bbox + expand token).
 * - TODO: Add async job mode for very large traversals/exports.
 * - TODO: Add streaming mode (SSE/WebSocket) for progressive result delivery.
 * - TODO: Enforce server caps/timeouts and return partial/truncated metadata.
 * - TODO: Add cache + request dedupe for identical subtree queries.
 * - TODO: Add rate limiting and backoff hints to prevent accidental overload.
 *
 * Frontend TODOs
 * - TODO: Add direction toggle (upward root-finding vs downward descendant expansion).
 * - TODO: Add root-candidate picker when multiple proto roots are possible.
 * - TODO: Implement overview-first rendering (major branches only by default).
 * - TODO: Add branch-level expand/collapse and hide/show controls.
 * - TODO: Add map level-of-detail behavior (zoom-aware labels/details).
 * - TODO: Add branch aggregation UI with explicit "expand cluster" interactions.
 * - TODO: Add focus mode to highlight one branch and mute the rest.
 * - TODO: Add playback controls (play/pause/step/speed/skip).
 * - TODO: Add truncation notices and "load more" affordances.
 * - TODO: Add coordinate fallback visuals for nodes with unresolved locations.
 *
 * Reliability / quality TODOs
 * - TODO: Cancel in-flight fetches on query changes and dedupe rapid interactions.
 * - TODO: Cache fetched subtree segments client-side to avoid repeated API calls.
 * - TODO: Add traversal tests (cycles, multi-parent ambiguity, depth/node limits).
 * - TODO: Add integration tests for preview -> expand -> focus flows.
 * - TODO: Add performance instrumentation (request size, traversal duration, cache hit rate).
 */

const DescendantLineagePaths: React.FC<{ rootWord: string; rootLang: string; playSpeed?: number }> = ({
  rootWord,
  rootLang,
  playSpeed = 900,
}) => {
  const map = useMap()
  const languoidData = useLanguoidData()
  const [paths, setPaths] = useState<DescPath[]>([])
  const [mode, setMode] = useState<'auto' | 'root'>('auto')
  const [detailMode, setDetailMode] = useState<'overview' | 'full'>('overview')
  const [rootCandidates, setRootCandidates] = useState<RootCandidate[]>([])
  const [selectedRootCandidate, setSelectedRootCandidate] = useState<RootCandidate | null>(null)
  const selectedRootCandidateKey = selectedRootCandidate
    ? `${selectedRootCandidate.word ?? ''}|${selectedRootCandidate.lang_code ?? ''}`
    : ''
  const [resolvedRoot, setResolvedRoot] = useState<string | null>(null)
  const [resolvedRootLang, setResolvedRootLang] = useState<string | null>(null)
  const [lastLoadMs, setLastLoadMs] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [languageNames, setLanguageNames] = useState<Record<string, string>>({})
  const polyRefs = useRef<Record<number, L.Polyline | null>>({})
  const playbackRunRef = useRef(0)
  const expandedNodeKeysRef = useRef<Set<string>>(new Set())
  const activeBranchRef = useRef<{ pathIndex: number; nodeIndex: number } | null>(null)

  // Fetch paths from backend
  useEffect(() => {
    if (!rootWord) return
    let cancelled = false
    const controller = new AbortController()
    setLoading(true)
    setLoadError(null)
    expandedNodeKeysRef.current = new Set()
    ;(async () => {
      try {
        if (mode === 'root') {
          const baseNode: DescNode = { word: rootWord, lang_code: rootLang || null }
          if (!cancelled) {
            setPaths([[baseNode]])
            setRootCandidates([])
            setSelectedRootCandidate(null)
            setResolvedRoot(rootWord)
            setResolvedRootLang(rootLang || null)
            setLastLoadMs(0)
          }
          return
        }

        const url = apiUrl(
          `/ancestor-roots?${new URLSearchParams({
            word: rootWord,
            lang_code: rootLang || '',
          }).toString()}`,
        )
        console.debug('DescendantLineagePaths: fetching', url)
        const res = await fetch(url, { signal: controller.signal })
        if (!res.ok) {
          if (!cancelled) {
            setLoadError(`Failed to load descendant paths (${res.status})`)
          }
          setPaths([])
          setLoading(false)
          return
        }
        const json = await res.json()
        const roots = (json.roots || []) as RootCandidate[]
        const nextSelectedRoot = (() => {
          if (selectedRootCandidate) {
            const selectedKey = nodeKey(selectedRootCandidate.word, selectedRootCandidate.lang_code)
            const match = roots.find(candidate => nodeKey(candidate.word, candidate.lang_code) === selectedKey)
            if (match) return match
          }
          return (json.selected_root as RootCandidate) || roots[0] || null
        })()

        if (!cancelled) {
          const rootNode: DescNode = {
            word: nextSelectedRoot?.word || json.root || rootWord,
            lang_code: nextSelectedRoot?.lang_code || json.root_lang || rootLang || null,
          }
          setPaths([[rootNode]])
          setLastLoadMs(typeof json?.meta?.elapsed_ms === 'number' ? json.meta.elapsed_ms : null)
          setRootCandidates(roots)
          setSelectedRootCandidate(nextSelectedRoot)
          setResolvedRoot(nextSelectedRoot?.word || json.root || null)
          setResolvedRootLang(nextSelectedRoot?.lang_code || json.root_lang || null)
        }
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return
        console.error('Descendant fetch error', e)
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'Failed to load descendant paths')
          setPaths([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [rootWord, rootLang, map, languoidData, selectedRootCandidate, selectedRootCandidateKey, mode, detailMode])

  const expandNode = async (node: DescNode, basePath: DescPath, clickedIndex: number, pathIndex: number) => {
    if (!node.word) return
    const key = nodeKey(node.word, node.lang_code)
    if (expandedNodeKeysRef.current.has(key)) return
    if (!node.lang_code) return

    activeBranchRef.current = { pathIndex, nodeIndex: clickedIndex }

    const controller = new AbortController()
    setLoading(true)
    setLoadError(null)
    try {
      const url = apiUrl(
        `/descendant-preview?${new URLSearchParams({
          word: node.word,
          lang_code: node.lang_code,
          depth: '1',
          max_nodes: '200',
        }).toString()}`,
      )
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok) {
        setLoadError(`Failed to expand branch (${res.status})`)
        return
      }

      const json = await res.json()
      const newPaths = flattenPathsFromTree(json.tree as AggregatedTreeNode | null | undefined).filter(path => path.length > 1)
      const mergedPaths = mergeExpandedPaths(basePath, newPaths, clickedIndex)

      if (!newPaths.length) {
        expandedNodeKeysRef.current.add(key)
        return
      }

      setPaths(prev => {
        const next = [...prev]
        const currentIndex = Math.max(0, Math.min(pathIndex, next.length - 1))
        next.splice(currentIndex, 1, ...mergedPaths)
        return next
      })
      expandedNodeKeysRef.current.add(key)
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        setLoadError(error instanceof Error ? error.message : 'Failed to expand branch')
      }
    } finally {
      setLoading(false)
    }
  }

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

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      const uniqueCodes = new Set<string>()
      for (const path of paths) {
        for (const node of path) {
          if (node.lang_code) uniqueCodes.add(node.lang_code)
        }
      }

      const next: Record<string, string> = {}
      for (const code of Array.from(uniqueCodes)) {
        const resolved = await resolveLanguageName(code, languoidData)
        if (resolved) next[code] = resolved
        if (cancelled) return
      }

      if (!cancelled) setLanguageNames(next)
    })()

    return () => {
      cancelled = true
    }
  }, [paths, languoidData])

  const pointsForPath = (p: DescPath, pathIndex: number): RenderPoint[] => {
    const resolved: Array<[number, number] | null> = p.map(n => {
      const lc = n.lang_code || ''
      const cached = coordsMap[lc]
      return cached && Array.isArray(cached) ? (cached as [number, number]) : null
    })

    const points: RenderPoint[] = resolved.map((coord, pointIndex) => {
      if (coord) {
        return {
          position: normalizePosition(coord),
          fallback: false,
          aggregated: Boolean(p[pointIndex]?.aggregated),
          count: p[pointIndex]?.count,
        }
      }

      let synth: [number, number] | null = null
      const prevRealIndex = (() => {
        for (let i = pointIndex - 1; i >= 0; i--) {
          if (resolved[i]) return i
        }
        return -1
      })()
      const nextRealIndex = (() => {
        for (let i = pointIndex + 1; i < resolved.length; i++) {
          if (resolved[i]) return i
        }
        return -1
      })()

      if (prevRealIndex >= 0 && nextRealIndex >= 0 && resolved[prevRealIndex] && resolved[nextRealIndex]) {
        const prev = resolved[prevRealIndex]!
        const next = resolved[nextRealIndex]!
        const span = nextRealIndex - prevRealIndex
        const t = (pointIndex - prevRealIndex) / span
        synth = [prev[0] + (next[0] - prev[0]) * t, prev[1] + (next[1] - prev[1]) * t]
      } else if (prevRealIndex >= 0 && resolved[prevRealIndex]) {
        synth = fallbackPoint(resolved[prevRealIndex]!, pathIndex, pointIndex, 1)
      } else if (nextRealIndex >= 0 && resolved[nextRealIndex]) {
        synth = fallbackPoint(resolved[nextRealIndex]!, pathIndex, pointIndex, -1)
      } else {
        synth = fallbackPoint(stablePathBase(p), pathIndex, pointIndex, 1)
      }

      return {
        position: normalizePosition(synth),
        fallback: true,
        aggregated: Boolean(p[pointIndex]?.aggregated),
        count: p[pointIndex]?.count,
      }
    })

    return points
  }

  const clampPathIndex = (index: number) => {
    if (!paths.length) return 0
    return Math.max(0, Math.min(paths.length - 1, index))
  }

  const stopPlayback = () => {
    playbackRunRef.current += 1
    setIsPlaying(false)
  }

  const cyclePlaybackRate = () => {
    setPlaybackRate(current => {
      const rates = [0.5, 1, 1.5, 2]
      const currentIndex = rates.indexOf(current)
      return rates[(currentIndex + 1) % rates.length]
    })
  }

  const startPlayback = async (startIndex: number) => {
    if (!paths.length) return
    const runId = playbackRunRef.current + 1
    playbackRunRef.current = runId
    setIsPlaying(true)

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

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
        pathEl.classList.add('descendant-segment-animating')
        await sleep(Math.max(120, Math.round(playSpeed * playbackRate)) + 120)
        pathEl.classList.remove('descendant-segment-animating')
      } catch {
        // ignore
      }
    }

    const fromIndex = clampPathIndex(startIndex)
    for (let i = fromIndex; i < paths.length; i++) {
      if (playbackRunRef.current !== runId) break
      setSelected(i)
      await animatePath(i)
      if (playbackRunRef.current !== runId) break
      await sleep(240)
    }

    if (playbackRunRef.current === runId) {
      setIsPlaying(false)
    }
  }

  useEffect(() => {
    stopPlayback()
    setSelected(null)
  }, [rootWord, rootLang, mode, detailMode])

  const isOverview = detailMode === 'overview'

  return (
    <Pane name="descendant-paths" style={{ zIndex: 565 }}>
      <LayerGroup>
        {paths.map((p, idx) => {
          const points = pointsForPath(p, idx)
          const coords = points.map(point => point.position)
          if (!coords || coords.length === 0) return null
          const isActive = selected === idx
          const hasAggregatedNode = points.some(point => point.aggregated)
          const hasFallbackNode = points.some(point => point.fallback)
          const baseColor = isActive ? '#fb923c' : hasAggregatedNode ? '#eab308' : '#f97316'
          return (
            <React.Fragment key={`path-${idx}`}>
              {coords.length >= 2 ? (
                <Polyline
                  positions={coords}
                  interactive={false}
                  bubblingMouseEvents={false}
                  pathOptions={{
                    color: baseColor,
                    weight: isActive ? 3.6 : hasAggregatedNode ? 2.6 : 2.2,
                    opacity: isActive ? 0.98 : hasAggregatedNode ? 0.72 : hasFallbackNode ? 0.68 : 0.6,
                    dashArray: hasAggregatedNode ? '6 4' : hasFallbackNode ? '3 5' : undefined,
                    className: `descendant-segment${isActive ? ' descendant-segment-active' : ''}`,
                  }}
                  ref={ref => {
                    polyRefs.current[idx] = ref as unknown as L.Polyline | null
                  }}
                  eventHandlers={{
                    click: () => {
                      setSelected(prev => (prev === idx ? null : idx))
                      activeBranchRef.current = { pathIndex: idx, nodeIndex: p.length - 1 }
                    },
                  }}
                />
              ) : null}
              {points.map((point, i) => (
                <CircleMarker
                  key={`c-${idx}-${i}`}
                  center={point.position}
                  bubblingMouseEvents={false}
                  radius={selected === idx ? 7 : point.aggregated ? 6 : point.fallback ? 4.5 : 4.5}
                  pathOptions={{
                    fillColor: point.aggregated ? '#fbbf24' : point.fallback ? '#60a5fa' : '#f97316',
                    color: point.aggregated ? '#a16207' : point.fallback ? '#1d4ed8' : '#92400e',
                    weight: 1,
                    fillOpacity: selected === idx ? 0.95 : point.aggregated ? 0.88 : point.fallback ? 0.82 : 0.7,
                  }}
                  eventHandlers={{
                    click: () => {
                      setSelected(idx)
                      void expandNode(p[i], p, i, idx)
                    },
                  }}
                >
                  {(selected === idx || i === points.length - 1) && (
                    <Tooltip direction="top" offset={[0, -6]} permanent={false}>
                      <div className="leading-tight" style={{ fontSize: 12, fontWeight: 700 }}>
                        <strong>{languageNames[p[i]?.lang_code ?? ''] ?? getLanguageLabel(p[i]?.lang_code, languoidData) ?? p[i]?.lang_code}</strong>
                        <span className="ml-1 text-xs opacity-80">{p[i]?.expansion ?? p[i]?.word}</span>
                        {p[i]?.romanization && (
                          <span className="ml-1 text-xs opacity-80">{p[i]?.romanization}</span>
                        )}
                        {point.aggregated && typeof point.count === 'number' ? (
                          <span style={{ marginLeft: 6, opacity: 0.85 }}>({point.count})</span>
                        ) : null}
                        {point.fallback ? <span style={{ marginLeft: 6, opacity: 0.78 }}>[fallback]</span> : null}
                      </div>
                    </Tooltip>
                  )}
                </CircleMarker>
              ))}
            </React.Fragment>
          )
        })}
      </LayerGroup>

      <div style={{ position: 'absolute', right: 12, bottom: 92, zIndex: 580, background: 'rgba(7,9,14,0.8)', padding: 10, borderRadius: 10, color: '#f8fafc', fontSize: 12, minWidth: 240, maxWidth: 340, boxShadow: '0 18px 42px rgba(0,0,0,0.28)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontWeight: 800, color: '#FBBF24' }}>Descendant Paths</div>
            <button
              onClick={() => (isPlaying ? stopPlayback() : void startPlayback(selected ?? 0))}
              style={{ background: isPlaying ? '#ef4444' : '#10b981', color: 'white', border: 'none', padding: '6px 10px', borderRadius: 6, cursor: 'pointer' }}
              title={isPlaying ? 'Stop playback' : 'Play descendant branches'}
            >
              {isPlaying ? 'Stop' : 'Play'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              onClick={() => {
                stopPlayback()
                setSelected(prev => clampPathIndex((prev ?? 0) - 1))
              }}
              disabled={!paths.length}
              style={{
                flex: 1,
                border: '1px solid rgba(148,163,184,0.35)',
                background: 'rgba(15,23,42,0.45)',
                color: '#f8fafc',
                borderRadius: 8,
                padding: '6px 8px',
                cursor: paths.length ? 'pointer' : 'not-allowed',
                opacity: paths.length ? 1 : 0.55,
              }}
            >
              Prev
            </button>
            <button
              onClick={() => {
                stopPlayback()
                setSelected(prev => clampPathIndex((prev ?? 0) + 1))
              }}
              disabled={!paths.length}
              style={{
                flex: 1,
                border: '1px solid rgba(148,163,184,0.35)',
                background: 'rgba(15,23,42,0.45)',
                color: '#f8fafc',
                borderRadius: 8,
                padding: '6px 8px',
                cursor: paths.length ? 'pointer' : 'not-allowed',
                opacity: paths.length ? 1 : 0.55,
              }}
            >
              Next
            </button>
            <button
              onClick={cyclePlaybackRate}
              style={{
                flex: 1.1,
                border: '1px solid rgba(245,158,11,0.45)',
                background: 'rgba(245,158,11,0.14)',
                color: '#f8fafc',
                borderRadius: 8,
                padding: '6px 8px',
                cursor: 'pointer',
              }}
              title="Cycle playback speed"
            >
              {playbackRate}x speed
            </button>
          </div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              onClick={() => {
                stopPlayback()
                setSelected(paths.length ? 0 : null)
              }}
              disabled={!paths.length}
              style={{
                flex: 1,
                border: '1px solid rgba(148,163,184,0.35)',
                background: 'rgba(15,23,42,0.45)',
                color: '#f8fafc',
                borderRadius: 8,
                padding: '6px 8px',
                cursor: paths.length ? 'pointer' : 'not-allowed',
                opacity: paths.length ? 1 : 0.55,
              }}
            >
              First
            </button>
            <button
              onClick={() => {
                stopPlayback()
                setSelected(paths.length ? paths.length - 1 : null)
              }}
              disabled={!paths.length}
              style={{
                flex: 1,
                border: '1px solid rgba(148,163,184,0.35)',
                background: 'rgba(15,23,42,0.45)',
                color: '#f8fafc',
                borderRadius: 8,
                padding: '6px 8px',
                cursor: paths.length ? 'pointer' : 'not-allowed',
                opacity: paths.length ? 1 : 0.55,
              }}
            >
              Last
            </button>
            <button
              onClick={() => {
                stopPlayback()
                setSelected(null)
              }}
              style={{
                flex: 1.1,
                border: '1px solid rgba(148,163,184,0.35)',
                background: 'rgba(15,23,42,0.45)',
                color: '#f8fafc',
                borderRadius: 8,
                padding: '6px 8px',
                cursor: 'pointer',
              }}
            >
              Reset
            </button>
          </div>

          <div style={{ color: '#94a3b8', fontSize: 11, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span>{selected !== null && paths.length ? `Branch ${selected + 1} / ${paths.length}` : `${paths.length} branches`}</span>
            <span>{isPlaying ? 'Playing' : 'Paused'}</span>
          </div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              onClick={() => setMode('auto')}
              style={{
                flex: 1,
                border: '1px solid',
                borderColor: mode === 'auto' ? '#f59e0b' : 'rgba(148,163,184,0.35)',
                background: mode === 'auto' ? 'rgba(245,158,11,0.15)' : 'rgba(15,23,42,0.45)',
                color: '#f8fafc',
                borderRadius: 8,
                padding: '6px 8px',
                cursor: 'pointer',
              }}
              title="Resolve the likely proto root first, then render descendant paths"
            >
              Resolve root
            </button>
            <button
              onClick={() => setMode('root')}
              style={{
                flex: 1,
                border: '1px solid',
                borderColor: mode === 'root' ? '#f59e0b' : 'rgba(148,163,184,0.35)',
                background: mode === 'root' ? 'rgba(245,158,11,0.15)' : 'rgba(15,23,42,0.45)',
                color: '#f8fafc',
                borderRadius: 8,
                padding: '6px 8px',
                cursor: 'pointer',
              }}
              title="Use the supplied word as the root and render its descendants directly"
            >
              Use root
            </button>
          </div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              onClick={() => setDetailMode('overview')}
              style={{
                flex: 1,
                border: '1px solid',
                borderColor: detailMode === 'overview' ? '#f59e0b' : 'rgba(148,163,184,0.35)',
                background: detailMode === 'overview' ? 'rgba(245,158,11,0.15)' : 'rgba(15,23,42,0.45)',
                color: '#f8fafc',
                borderRadius: 8,
                padding: '6px 8px',
                cursor: 'pointer',
              }}
              title="Show a compact aggregated tree with collapsed branches"
            >
              Overview
            </button>
            <button
              onClick={() => setDetailMode('full')}
              style={{
                flex: 1,
                border: '1px solid',
                borderColor: detailMode === 'full' ? '#f59e0b' : 'rgba(148,163,184,0.35)',
                background: detailMode === 'full' ? 'rgba(245,158,11,0.15)' : 'rgba(15,23,42,0.45)',
                color: '#f8fafc',
                borderRadius: 8,
                padding: '6px 8px',
                cursor: 'pointer',
              }}
              title="Show the full descendant paths without collapsing"
            >
              Full detail
            </button>
          </div>

          <div style={{ color: '#cbd5e1', fontSize: 12, lineHeight: 1.4 }}>
            {resolvedRoot ? (
              <span>
                Root: <strong style={{ color: '#fef3c7' }}>{resolvedRoot}</strong>
                {resolvedRootLang ? <span style={{ marginLeft: 6, opacity: 0.85 }}>({resolvedRootLang})</span> : null}
              </span>
            ) : (
              <span>Root: <em>detecting…</em></span>
            )}
            {selectedRootCandidate?.word ? (
              <div style={{ marginTop: 4, opacity: 0.88 }}>
                Selected: <strong>{selectedRootCandidate.word}</strong>
                {selectedRootCandidate.lang_code ? <span style={{ marginLeft: 6 }}>({selectedRootCandidate.lang_code})</span> : null}
              </div>
            ) : null}
          </div>

          {loadError ? (
            <div style={{ color: '#fca5a5', background: 'rgba(127,29,29,0.35)', padding: '6px 8px', borderRadius: 6 }}>{loadError}</div>
          ) : null}

          {lastLoadMs !== null ? (
            <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
              Loaded in {lastLoadMs.toFixed(1)} ms
            </div>
          ) : null}

          {mode === 'auto' && !isOverview && rootCandidates.length > 1 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Root candidates</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 110, overflow: 'auto', paddingRight: 2 }}>
                {rootCandidates.map(candidate => {
                  const isSelectedCandidate =
                    selectedRootCandidate?.word === candidate.word && selectedRootCandidate?.lang_code === candidate.lang_code
                  return (
                    <button
                      key={`${candidate.word || 'root'}:${candidate.lang_code || 'any'}`}
                      onClick={() => setSelectedRootCandidate(candidate)}
                      style={{
                        textAlign: 'left',
                        border: '1px solid',
                        borderColor: isSelectedCandidate ? '#f59e0b' : 'rgba(148,163,184,0.35)',
                        background: isSelectedCandidate ? 'rgba(245,158,11,0.15)' : 'rgba(15,23,42,0.5)',
                        color: '#f8fafc',
                        borderRadius: 8,
                        padding: '6px 8px',
                        cursor: 'pointer',
                      }}
                      title="Refetch descendant paths from this candidate root"
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontWeight: 700 }}>{candidate.word ?? 'Unknown root'}</span>
                        <span style={{ opacity: 0.78 }}>{candidate.supporting_paths ?? 0} paths</span>
                      </div>
                      {candidate.lang_code ? <div style={{ opacity: 0.8, marginTop: 2 }}>{candidate.lang_code}</div> : null}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}

          <div style={{ marginTop: 2, maxHeight: 160, overflow: 'auto', borderTop: '1px solid rgba(148,163,184,0.16)', paddingTop: 8 }}>
            {loading ? (
              <div style={{ color: '#94a3b8' }}>Loading...</div>
            ) : paths.length ? (
              <ul style={{ paddingLeft: 12, margin: 0 }}>
                {paths.map((p, i) => (
                  <li key={`li-${i}`} style={{ marginBottom: 6 }}>
                    <button
                      onClick={() => setSelected(prev => (prev === i ? null : i))}
                      style={{ display: 'flex', justifyContent: 'space-between', width: '100%', background: selected === i ? '#1f2937' : 'transparent', color: '#f8fafc', border: 'none', textAlign: 'left', padding: '4px 6px', borderRadius: 6, cursor: 'pointer' }}
                    >
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
        </div>
      </div>
    </Pane>
  )
}

export default DescendantLineagePaths
