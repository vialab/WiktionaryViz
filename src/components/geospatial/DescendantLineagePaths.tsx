import React, { useEffect, useRef, useState } from 'react'
import { Pane, LayerGroup, Polyline, CircleMarker, Tooltip } from 'react-leaflet'
import * as L from 'leaflet'
import type { LatLngExpression } from 'leaflet'
import { getLanguage } from '@ladjs/country-language'
import useLanguoidData from '@/hooks/useLanguoidData'
import { normalizePosition, getCoordinatesForLanguage } from '@/utils/mapUtils'
import { apiUrl } from '@/utils/apiBase'
import { fallbackPoint } from './descendantPathHelpers'
import type { LanguoidData } from '@/types/languoid'

type DescNode = {
  word?: string
  lang_code?: string | null
  lookupWord?: string | null
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

type DirectDescendant = {
  word?: string
  lang_code?: string | null
  lang?: string | null
  roman?: string | null
  expansion?: string | null
}

type WordDataResponse = {
  word?: string
  lang_code?: string
  lang?: string | null
  descendants?: DirectDescendant[]
}

type RenderPoint = {
  position: LatLngExpression
  fallback: boolean
  aggregated: boolean
  count?: number
}

const nodeKey = (word?: string, langCode?: string | null) => `${word ?? ''}|${langCode ?? ''}`

const normalizeLookupWord = (word?: string | null) => {
  if (!word) return null
  const normalized = word.normalize('NFKD')
  const stripped = normalized.replace(/\p{M}+/gu, '').trim()
  return stripped || word.trim() || null
}

const toNode = (item: DirectDescendant | undefined | null): DescNode | null => {
  if (!item?.word || !item.lang_code) return null
  return {
    word: item.word,
    lang_code: item.lang_code,
    lookupWord: normalizeLookupWord(item.word),
    expansion: item.expansion || undefined,
    romanization: item.roman || undefined,
  }
}

const mergeExpandedPaths = (basePath: DescPath, expandedPaths: DescPath[], clickedIndex: number) => {
  const prefix = basePath.slice(0, clickedIndex + 1)
  const nextPaths = expandedPaths
    .map(path => [...prefix, ...path.slice(1)])
    .filter(path => path.length > prefix.length)

  return nextPaths.length ? nextPaths : [basePath]
}

const hasVisibleDescendants = (paths: DescPath[], basePath: DescPath, clickedIndex: number) => {
  const prefix = basePath.slice(0, clickedIndex + 1)
  return paths.some(path => {
    if (path.length <= prefix.length) return false
    return prefix.every((node, index) => nodeKey(node.word, node.lang_code) === nodeKey(path[index]?.word, path[index]?.lang_code))
  })
}

const collapsePathsFromNode = (paths: DescPath[], basePath: DescPath, clickedIndex: number) => {
  const prefix = basePath.slice(0, clickedIndex + 1)
  return paths.filter(path => {
    if (path.length <= prefix.length) return true
    return !prefix.every((node, index) => nodeKey(node.word, node.lang_code) === nodeKey(path[index]?.word, path[index]?.lang_code))
  })
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

const getLanguageLabel = (langCode: string | null | undefined, languoidData: LanguoidData[]) => {
  if (!langCode) return null
  const normalizedCode = langCode.toLowerCase()
  const match = languoidData.find(entry => entry.iso639P3code?.toLowerCase() === normalizedCode)
  if (match?.name && match.name.trim()) {
    return match.name
  }
  return langCode
}

const resolveLanguageName = async (langCode: string | null | undefined, languoidData: LanguoidData[]) => {
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

const DescendantLineagePaths: React.FC<{ rootWord: string; rootLang: string }> = ({
  rootWord,
  rootLang,
}) => {
  const { languoidData } = useLanguoidData() as { languoidData: LanguoidData[]; loading: boolean }
  const [paths, setPaths] = useState<DescPath[]>([])
  const [, setRootCandidates] = useState<RootCandidate[]>([])
  const [, setResolvedRoot] = useState<string | null>(null)
  const [, setResolvedRootLang] = useState<string | null>(null)
  const [, setLastLoadMs] = useState<number | null>(null)
  const [, setLoading] = useState(false)
  const [, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [, setIsPlaying] = useState(false)
  const [languageNames, setLanguageNames] = useState<Record<string, string>>({})
  const polyRefs = useRef<Record<number, L.Polyline | null>>({})
  const playbackRunRef = useRef(0)
  const expandedNodeKeysRef = useRef<Set<string>>(new Set())
  const activeBranchRef = useRef<{ pathIndex: number; nodeIndex: number } | null>(null)

  // Fetch the resolved root only; descendants are expanded one hop at a time on click.
  useEffect(() => {
    if (!rootWord) return
    let cancelled = false
    const controller = new AbortController()
    setLoading(true)
    setLoadError(null)
    expandedNodeKeysRef.current = new Set()
    ;(async () => {
      try {
        const url = apiUrl(
          `/descendant-root?${new URLSearchParams({
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
        const json = (await res.json()) as { root?: string; root_lang?: string; selected_root?: RootCandidate }
        if (!cancelled) {
          const rootNode: DescNode = {
            word: json.selected_root?.word || json.root || rootWord,
            lang_code: json.selected_root?.lang_code || json.root_lang || rootLang || null,
          }
          setPaths([[rootNode]])
          setLastLoadMs(null)
          setRootCandidates([])
          setResolvedRoot(rootNode.word || rootWord)
          setResolvedRootLang(rootNode.lang_code || rootLang || null)
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
  }, [rootWord, rootLang])

  const expandNode = async (node: DescNode, basePath: DescPath, clickedIndex: number, pathIndex: number) => {
    const lookupWord = node.lookupWord || node.word
    if (!lookupWord) return
    const key = nodeKey(lookupWord, node.lang_code)
    if (expandedNodeKeysRef.current.has(key)) return
    if (!node.lang_code) return

    activeBranchRef.current = { pathIndex, nodeIndex: clickedIndex }

    const controller = new AbortController()
    setLoading(true)
    setLoadError(null)
    try {
      const url = apiUrl(`/word-data?${new URLSearchParams({ word: lookupWord, lang_code: node.lang_code }).toString()}`)
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok) {
        setLoadError(`Failed to expand branch (${res.status})`)
        return
      }

      const json = (await res.json()) as WordDataResponse
      const descendants = Array.isArray(json.descendants) ? json.descendants : []
      const childPaths = descendants
        .map(child => toNode(child))
        .filter((child): child is DescNode => Boolean(child))
        .map(child => [...basePath.slice(0, clickedIndex + 1), child])
      const newPaths = childPaths
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

  const collapseNode = (basePath: DescPath, clickedIndex: number) => {
    const prefix = basePath.slice(0, clickedIndex + 1)
    const keysToRemove = new Set(prefix.map(node => nodeKey(node.lookupWord || node.word, node.lang_code)))

    setPaths(prev => {
      const next = collapsePathsFromNode(prev, basePath, clickedIndex)
      const prefixKey = prefix.map(node => nodeKey(node.word, node.lang_code)).join('>')
      const hasPrefix = next.some(path => path.map(node => nodeKey(node.word, node.lang_code)).join('>') === prefixKey)
      if (!hasPrefix) {
        const insertAt = Math.max(
          0,
          prev.findIndex(path => {
            if (path.length <= prefix.length) return false
            return prefix.every((node, index) => nodeKey(node.word, node.lang_code) === nodeKey(path[index]?.word, path[index]?.lang_code))
          }),
        )
        next.splice(insertAt < 0 ? next.length : insertAt, 0, prefix)
      }
      return next
    })
    setSelected(null)
    activeBranchRef.current = null

    for (const path of paths) {
      if (path.length <= prefix.length) continue
      if (!prefix.every((node, index) => nodeKey(node.word, node.lang_code) === nodeKey(path[index]?.word, path[index]?.lang_code))) {
        continue
      }
      for (const descendant of path.slice(clickedIndex + 1)) {
        keysToRemove.add(nodeKey(descendant.lookupWord || descendant.word, descendant.lang_code))
      }
    }

    for (const key of keysToRemove) {
      expandedNodeKeysRef.current.delete(key)
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


  const stopPlayback = () => {
    playbackRunRef.current += 1
    setIsPlaying(false)
  }

  useEffect(() => {
    stopPlayback()
    setSelected(null)
  }, [rootWord, rootLang])

  return (
    <Pane name="descendant-paths-lines" style={{ zIndex: 560 }}>
      <Pane name="descendant-paths-markers" style={{ zIndex: 620 }}>
        <Pane name="descendant-paths-labels" style={{ zIndex: 700 }}>
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
                  pane="descendant-paths-lines"
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
                  pane="descendant-paths-markers"
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
                      const isExpandedHere = hasVisibleDescendants(paths, p, i)
                      if (isExpandedHere) {
                        collapseNode(p, i)
                        return
                      }

                      setSelected(idx)
                      void expandNode(p[i], p, i, idx)
                    },
                  }}
                >
                  {(selected === idx || i === points.length - 1) && (
                    <Tooltip pane="descendant-paths-labels" direction="top" offset={[0, -6]} permanent={false}>
                      <div className="leading-tight" style={{ fontSize: 12, fontWeight: 700 }}>
                        <strong>{languageNames[p[i]?.lang_code ?? ''] ?? getLanguageLabel(p[i]?.lang_code, languoidData) ?? p[i]?.lang_code}</strong>
                        {p[i]?.word && (
                          <span className="ml-1 text-xs opacity-80">{p[i].word}</span>
                        )}
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
        </Pane>
      </Pane>
    </Pane>
  )
}

export default DescendantLineagePaths
