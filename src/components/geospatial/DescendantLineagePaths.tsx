import React, { useEffect, useRef, useState } from 'react'
import { Pane, LayerGroup, Polyline, CircleMarker, Marker, Tooltip } from 'react-leaflet'
import * as L from 'leaflet'
import type { LatLngExpression } from 'leaflet'
import { getLanguage } from '@ladjs/country-language'
import useLanguoidData from '@/hooks/useLanguoidData'
import { normalizePosition, getCoordinatesForLanguage, createArrowIcon, calculateBearing } from '@/utils/mapUtils'
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
  root_key?: string | null
  supporting_paths?: number
}

type DescendantTreeNode = {
  word?: string
  lang_code?: string | null
  expansion?: string | null
  romanization?: string | null
  aggregated?: boolean
  count?: number
  children?: DescendantTreeNode[]
}

type DescendantRootResponse = {
  root?: string
  root_lang?: string
  selected_root?: RootCandidate
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

const toNode = (item: DescendantTreeNode | undefined | null): DescNode | null => {
  if (!item?.word || !item.lang_code) return null
  return {
    word: item.word,
    lang_code: item.lang_code,
    lookupWord: normalizeLookupWord(item.word),
    expansion: item.expansion || undefined,
    romanization: item.romanization || undefined,
    aggregated: Boolean(item.aggregated),
    count: item.count,
  }
}

const flattenDescendantTree = (node: DescendantTreeNode | undefined | null): DescPath[] => {
  const rootNode = toNode(node)
  if (!rootNode) return []

  const children = Array.isArray(node?.children) ? node.children : []
  if (!children.length) {
    return [[rootNode]]
  }

  const paths: DescPath[] = []
  for (const child of children) {
    const childPaths = flattenDescendantTree(child)
    for (const childPath of childPaths) {
      paths.push([rootNode, ...childPath])
    }
  }

  return paths.length ? paths : [[rootNode]]
}

const pathKey = (path: DescPath) => path.map(node => nodeKey(node.word, node.lang_code)).join('>')

const prefixKey = (path: DescPath, endIndex: number) => path.slice(0, endIndex + 1).map(node => nodeKey(node.word, node.lang_code)).join('>')

const pathMatchesPrefix = (path: DescPath, prefix: DescPath) => {
  if (path.length < prefix.length) return false
  return prefix.every((node, index) => nodeKey(node.word, node.lang_code) === nodeKey(path[index]?.word, path[index]?.lang_code))
}

const pathHasDescendants = (paths: DescPath[], prefix: DescPath) => paths.some(path => path.length > prefix.length && pathMatchesPrefix(path, prefix))

const deriveVisiblePaths = (allPaths: DescPath[], expandedPrefixes: Set<string>) => {
  const visible = new Map<string, DescPath>()

  for (const fullPath of allPaths) {
    if (!fullPath.length) continue

    let visibleLength = 1
    for (let index = 0; index < fullPath.length - 1; index++) {
      const currentPrefixKey = prefixKey(fullPath, index)
      if (!expandedPrefixes.has(currentPrefixKey)) break
      visibleLength = index + 2
    }

    const visiblePath = fullPath.slice(0, visibleLength)
    visible.set(pathKey(visiblePath), visiblePath)
  }

  return Array.from(visible.values())
}

const mergeSubtreePaths = (existingPaths: DescPath[], prefix: DescPath, subtreePaths: DescPath[]) => {
  const prefixWithoutRoot = prefix.slice(0, -1)
  const merged = new Map<string, DescPath>()

  for (const path of existingPaths) {
    merged.set(pathKey(path), path)
  }

  for (const subtreePath of subtreePaths) {
    const fullPath = [...prefixWithoutRoot, ...subtreePath]
    merged.set(pathKey(fullPath), fullPath)
  }

  return Array.from(merged.values())
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

const getArrowPosition = (start: [number, number], end: [number, number], offset = 0.14): [number, number] => {
  const clampedOffset = Math.max(0, Math.min(0.35, offset))
  const t = 1 - clampedOffset
  return [
    start[0] + (end[0] - start[0]) * t,
    start[1] + (end[1] - start[1]) * t,
  ]
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

const DescendantLineagePaths: React.FC<{ rootWord: string; rootLang: string; opacity?: number; zIndex?: number; onVisibleCoordinatesChange?: (positions: [number, number][]) => void; onNodeSelect?: (node: DescNode, pathIndex: number, nodeIndex: number) => void }> = ({
  rootWord,
  rootLang,
  opacity = 1,
  zIndex = 560,
  onVisibleCoordinatesChange,
  onNodeSelect,
}) => {
  const { languoidData } = useLanguoidData() as { languoidData: LanguoidData[]; loading: boolean }
  const [paths, setPaths] = useState<DescPath[]>([])
  const [allPaths, setAllPaths] = useState<DescPath[]>([])
  const [expandedPrefixes, setExpandedPrefixes] = useState<Set<string>>(new Set())
  const [, setRootCandidates] = useState<RootCandidate[]>([])
  const [, setResolvedRoot] = useState<string | null>(null)
  const [, setResolvedRootLang] = useState<string | null>(null)
  const [, setLastLoadMs] = useState<number | null>(null)
  const [isLoading, setLoading] = useState(false)
  const [, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [focusedBranchKey, setFocusedBranchKey] = useState<string | null>(null)
  const [, setIsPlaying] = useState(false)
  const [languageNames, setLanguageNames] = useState<Record<string, string>>({})
  const [loadingBranch, setLoadingBranch] = useState<{ pathIndex: number; nodeIndex: number } | null>(null)
  const polyRefs = useRef<Record<number, L.Polyline | null>>({})
  const playbackRunRef = useRef(0)

  // Fetch the resolved root only; descendants are expanded one hop at a time on click.
  useEffect(() => {
    if (!rootWord) return
    let cancelled = false
    const controller = new AbortController()
    setLoading(true)
    setLoadError(null)
    setExpandedPrefixes(new Set())
    ;(async () => {
      try {
        const startedAt = performance.now()
        const url = apiUrl(
          `/descendant-root?${new URLSearchParams({
            word: rootWord,
            lang_code: rootLang || '',
          }).toString()}`,
        )
        console.info('[Descendants] Searching for root node', { word: rootWord, lang: rootLang || '(unknown)' })
        const res = await fetch(url, { signal: controller.signal })
        if (!res.ok) {
          if (!cancelled) {
            setLoadError(`Failed to load descendant paths (${res.status})`)
          }
          setPaths([])
          setLoading(false)
          return
        }
        const json = (await res.json()) as DescendantRootResponse
        if (!cancelled) {
          const rootNode: DescNode = {
            word: json.selected_root?.word || json.root || rootWord,
            lang_code: json.selected_root?.lang_code || json.root_lang || rootLang || null,
          }
          setAllPaths([[rootNode]])
          setPaths([[rootNode]])
          setLastLoadMs(null)
          setRootCandidates([])
          setResolvedRoot(rootNode.word || rootWord)
          setResolvedRootLang(rootNode.lang_code || rootLang || null)
          console.info('[Descendants] Root node found', {
            word: rootNode.word,
            lang: rootNode.lang_code,
            elapsedMs: Math.round(performance.now() - startedAt),
          })
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

  useEffect(() => {
    setPaths(deriveVisiblePaths(allPaths, expandedPrefixes))
  }, [allPaths, expandedPrefixes])

  const loadSubtreeForNode = async (basePath: DescPath, clickedIndex: number, pathIndex: number) => {
    const node = basePath[clickedIndex]
    const lookupWord = node?.lookupWord || node?.word
    const langCode = node?.lang_code
    if (!lookupWord || !langCode) return

    setLoadingBranch({ pathIndex, nodeIndex: clickedIndex })
    setLoading(true)
    setLoadError(null)

    try {
      const selectedNode = basePath[clickedIndex]
      const nodeRootKey = selectedNode?.word && selectedNode?.lang_code
        ? `${selectedNode.word}_${selectedNode.lang_code}`
        : null

      console.debug('[DescendantLineagePaths] fetching immediate children', {
        clickedIndex,
        pathIndex,
        lookupWord,
        langCode,
        nodeRootKey,
        selectedNode: { word: selectedNode?.word, lang_code: selectedNode?.lang_code },
        basePath: basePath.map(node => ({ word: node.word, lang_code: node.lang_code })),
      })

      const url = apiUrl(`/descendant-children?${new URLSearchParams({
        word: lookupWord,
        lang_code: langCode,
        max_children: '12',
        ...(nodeRootKey ? { root_key: nodeRootKey } : {}),
      }).toString()}`)
      const res = await fetch(url)
      if (!res.ok) {
        setLoadError(`Failed to expand branch (${res.status})`)
        return
      }

      const json = (await res.json()) as { children?: Array<{ word?: string; lang_code?: string | null; key?: string }> }
      const children = json.children ?? []
      console.debug('[DescendantLineagePaths] immediate children response', {
        lookupWord,
        langCode,
        count: children.length,
        children,
      })
      if (!children.length) {
        return
      }

      const prefix = basePath.slice(0, clickedIndex + 1)
      const subtree: DescPath[] = children.map(child => [
        {
          word: node.word,
          lang_code: node.lang_code,
          lookupWord: normalizeLookupWord(node.word),
          expansion: node.expansion,
          aggregated: false,
        },
        {
          word: child.word,
          lang_code: child.lang_code,
          lookupWord: normalizeLookupWord(child.word),
          expansion: undefined,
          aggregated: false,
        },
      ])

      setAllPaths(prev => mergeSubtreePaths(prev, prefix, subtree))
      setExpandedPrefixes(prev => {
        const next = new Set(prev)
        next.add(prefixKey(basePath, clickedIndex))
        return next
      })
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to expand branch')
    } finally {
      setLoading(false)
      setLoadingBranch(current => (
        current?.pathIndex === pathIndex && current?.nodeIndex === clickedIndex ? null : current
      ))
    }
  }

  const toggleNodeExpansion = async (basePath: DescPath, clickedIndex: number, pathIndex: number) => {
    const prefix = basePath.slice(0, clickedIndex + 1)
    const key = prefixKey(basePath, clickedIndex)

    if (!pathHasDescendants(allPaths, prefix)) {
      await loadSubtreeForNode(basePath, clickedIndex, pathIndex)
      return
    }

    setSelected(null)
    setLoadError(null)
    setExpandedPrefixes(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        for (const currentKey of Array.from(next)) {
          if (currentKey === key || currentKey.startsWith(`${key}>`)) {
            next.delete(currentKey)
          }
        }
      } else {
        next.add(key)
      }
      return next
    })

    if (typeof window !== 'undefined') {
      setLoading(true)
      window.requestAnimationFrame(() => setLoading(false))
    }
  }

  // Resolve coordinates for each node by language code (cache by lang)
  const [coordsMap, setCoordsMap] = useState<Record<string, [number, number] | null>>({})
  const uniquePathLanguageCodes = new Set(
    paths.flatMap(path => path.map(node => node.lang_code).filter((code): code is string => Boolean(code))),
  )
  const resolvedCoordinateCount = Array.from(uniquePathLanguageCodes).filter(code => coordsMap[code] !== undefined).length
  const isInitialSetup = !loadingBranch && (
    isLoading || (paths.length > 0 && resolvedCoordinateCount < uniquePathLanguageCodes.size)
  )
  const initialSetupMessage = paths.length === 0
    ? 'Finding root node'
    : `Resolving map positions (${resolvedCoordinateCount}/${uniquePathLanguageCodes.size})`

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
      if (!cancelled) {
        setCoordsMap(next)
        console.info('[Descendants] Coordinates resolved', {
          languages: uniqueLangs.size,
          resolved: Array.from(uniqueLangs).filter(code => next[code] !== null).length,
        })
      }
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

      if (!cancelled) {
        setLanguageNames(next)
        console.info('[Descendants] Language labels resolved', { languages: uniqueCodes.size })
      }
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

  const loadingIcon = L.divIcon({
    className: '',
    html: `
      <div style="display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:9999px;background:rgba(15,23,42,0.88);border:1px solid rgba(251,191,36,0.65);box-shadow:0 10px 30px rgba(15,23,42,0.35);">
        <div style="width:18px;height:18px;border-radius:9999px;border:3px solid rgba(251,191,36,0.35);border-top-color:rgb(251,191,36);animation:spin 0.9s linear infinite;"></div>
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  })

  const rootLoadingIcon = L.divIcon({
    className: '',
    html: `
      <div style="display:flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:9999px;background:rgba(15,23,42,0.88);border:1px solid rgba(96,165,250,0.7);box-shadow:0 12px 34px rgba(15,23,42,0.42);">
        <div style="width:22px;height:22px;border-radius:9999px;border:3px solid rgba(96,165,250,0.3);border-top-color:rgb(96,165,250);animation:spin 0.9s linear infinite;"></div>
      </div>
    `,
    iconSize: [56, 56],
    iconAnchor: [28, 28],
  })

  useEffect(() => {
    if (!onVisibleCoordinatesChange) return

    const visiblePositions = paths.flatMap((path, pathIndex) =>
      pointsForPath(path, pathIndex).map(point => point.position as [number, number]),
    )

    onVisibleCoordinatesChange(visiblePositions)
  }, [onVisibleCoordinatesChange, paths, coordsMap])


  const stopPlayback = () => {
    playbackRunRef.current += 1
    setIsPlaying(false)
  }

  useEffect(() => {
    stopPlayback()
    setSelected(null)
    setFocusedBranchKey(null)
  }, [rootWord, rootLang])

  return (
    <>
      {isInitialSetup ? (
        <div className="descendant-loading-hud" role="status" aria-live="polite" aria-atomic="true">
          <span className="descendant-loading-spinner" aria-hidden="true" />
          <span>
            <strong>Descendants</strong>
            <small>{initialSetupMessage}</small>
          </span>
        </div>
      ) : null}
    <Pane name="descendant-paths-lines" style={{ zIndex }}>
      <Pane name="descendant-paths-markers" style={{ zIndex: zIndex + 60 }}>
        <Pane name="descendant-paths-labels" style={{ zIndex: zIndex + 140 }}>
      <LayerGroup>
        {isLoading && paths.length === 1 && allPaths.length === 1 ? (
          <Marker
            pane="descendant-paths-markers"
            position={pointsForPath(paths[0], 0)[0]?.position ?? [0, 0]}
            icon={rootLoadingIcon}
            interactive={false}
          >
            <Tooltip pane="descendant-paths-labels" direction="top" offset={[0, -12]} permanent opacity={1}>
              <div className="leading-tight" style={{ fontSize: 12, fontWeight: 700 }}>
                <strong>Finding root node</strong>
                <span className="ml-1 text-xs opacity-80">Loading the first parent node...</span>
              </div>
            </Tooltip>
          </Marker>
        ) : null}
        {paths.map((p, idx) => {
          const points = pointsForPath(p, idx)
          const coords = points.map(point => point.position)
          if (!coords || coords.length === 0) return null
          const isActive = selected === idx
          const hasAggregatedNode = points.some(point => point.aggregated)
          const hasFallbackNode = points.some(point => point.fallback)
          const baseColor = isActive ? '#fb923c' : hasAggregatedNode ? '#eab308' : '#f97316'
          const baseLayerOpacity = Math.max(0, Math.min(1, opacity))
          const isFocusedBranch = focusedBranchKey
            ? prefixKey(p, Math.min(p.length, focusedBranchKey.split('>').length) - 1) === focusedBranchKey
            : true
          const branchOpacity = isFocusedBranch ? 1 : 0.22
          const layerOpacity = baseLayerOpacity * branchOpacity
          return (
            <React.Fragment key={`path-${idx}`}>
              {coords.length >= 2 ? (
                <>
                  <Polyline
                    positions={coords}
                    pane="descendant-paths-lines"
                    interactive={false}
                    bubblingMouseEvents={false}
                    pathOptions={{
                      color: baseColor,
                      weight: isActive ? 3.6 : hasAggregatedNode ? 2.6 : 2.2,
                      opacity: (isActive ? 0.98 : hasAggregatedNode ? 0.72 : hasFallbackNode ? 0.68 : 0.6) * layerOpacity,
                      dashArray: hasAggregatedNode ? '6 4' : hasFallbackNode ? '3 5' : undefined,
                      className: `descendant-segment${isActive ? ' descendant-segment-active' : ''}`,
                    }}
                    ref={ref => {
                      polyRefs.current[idx] = ref as unknown as L.Polyline | null
                    }}
                    eventHandlers={{
                      click: () => {
                        setSelected(prev => (prev === idx ? null : idx))
                      },
                    }}
                  />
                  {coords.slice(0, -1).map((start, segmentIndex) => {
                    const end = coords[segmentIndex + 1] as [number, number]
                    const angle = calculateBearing(start as [number, number], end)
                    return (
                      <Marker
                        key={`desc-arrow-${idx}-${segmentIndex}`}
                        pane="descendant-paths-markers"
                        position={getArrowPosition(start as [number, number], end)}
                        icon={createArrowIcon(angle, {
                          size: isActive ? 22 : hasAggregatedNode ? 20 : 18,
                          color: baseColor,
                          outline: '#082f49',
                          outlineWidth: 2,
                          opacity: layerOpacity,
                        })}
                        interactive={false}
                      />
                    )
                  })}
                </>
              ) : null}
              {points.map((point, i) => (
                <CircleMarker
                  key={`c-${idx}-${i}`}
                  center={point.position}
                  pane="descendant-paths-markers"
                  bubblingMouseEvents={false}
                  ref={instance => {
                    const element = instance?.getElement()
                    if (element) {
                      const metadataElement = element as HTMLElement
                      metadataElement.dataset.eventTarget = 'descendant-node'
                      metadataElement.dataset.mapEntity = `${p[i]?.lang_code ?? 'unknown'}:${p[i]?.word ?? 'unknown'}:${idx}:${i}`
                    }
                  }}
                  radius={selected === idx ? 11 : point.aggregated ? 9 : point.fallback ? 7.5 : 7.5}
                  pathOptions={{
                    fillColor: point.aggregated ? '#fbbf24' : point.fallback ? '#60a5fa' : '#f97316',
                    color: point.aggregated ? '#a16207' : point.fallback ? '#1d4ed8' : '#92400e',
                    weight: 1,
                    opacity: layerOpacity,
                    fillOpacity: (selected === idx ? 0.95 : point.aggregated ? 0.88 : point.fallback ? 0.82 : 0.7) * layerOpacity,
                  }}
                  eventHandlers={{
                    click: () => {
                      onNodeSelect?.(p[i], idx, i)
                      setFocusedBranchKey(prefixKey(p, i))
                      setSelected(prev => (prev === idx ? null : idx))
                      void toggleNodeExpansion(p, i, idx)
                    },
                  }}
                >
                  {(selected === idx || i === points.length - 1) && (
                    <Tooltip pane="descendant-paths-labels" direction="top" offset={[0, -6]} permanent={false} opacity={layerOpacity}>
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
        {isLoading && loadingBranch && paths[loadingBranch.pathIndex] ? (
          <Marker
            pane="descendant-paths-markers"
            position={pointsForPath(paths[loadingBranch.pathIndex], loadingBranch.pathIndex)[loadingBranch.nodeIndex]?.position ?? [0, 0]}
            icon={loadingIcon}
            interactive={false}
          >
            <Tooltip pane="descendant-paths-labels" direction="top" offset={[0, -10]} permanent opacity={1}>
              <div className="leading-tight" style={{ fontSize: 12, fontWeight: 700 }}>
                <strong>Loading descendants</strong>
                <span className="ml-1 text-xs opacity-80">Finding the next descendant nodes...</span>
              </div>
            </Tooltip>
          </Marker>
        ) : null}
      </LayerGroup>
        </Pane>
      </Pane>
    </Pane>
    </>
  )
}

export default DescendantLineagePaths
