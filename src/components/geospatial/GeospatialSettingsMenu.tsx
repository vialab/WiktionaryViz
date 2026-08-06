import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Highlighter, Link2, PencilLine, Radius } from 'lucide-react'
import html2canvas from 'html2canvas'
import { DomEvent } from 'leaflet'
import { useMap } from 'react-leaflet'
import type { TranslationMarker } from './TranslationMarkers'
import type { EtymologyNode } from '@/types/etymology'
import type { AnnotationColor, AnnotationKind, MapLayerKey } from '@/types/mapState'
import { buildGeoJSON, downloadGeoJSON, type ExportOptions } from '@/utils/geojsonExport'
import useFocusTrap from '@/hooks/useFocusTrap'

type LayerOpacityKey = 'translations' | 'protoZones' | 'languageFamilies' | 'etymology' | 'descendants'
type LayerOpacityState = Record<LayerOpacityKey, number>
type LayerOrderKey = LayerOpacityKey
type LayerOrderState = LayerOrderKey[]
type LayerOrderDirection = 'up' | 'down'

interface SettingsSectionProps {
  title: string
  description: string
  defaultOpen?: boolean
  isLight: boolean
  children: React.ReactNode
}

const SettingsSection: React.FC<SettingsSectionProps> = ({ title, description, defaultOpen = false, isLight, children }) => (
  <details open={defaultOpen} className={isLight ? 'group rounded-xl border border-slate-200 bg-slate-50/80 p-2' : 'group rounded-xl border border-slate-800 bg-slate-900/60 p-2'}>
    <summary className={isLight ? 'flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/80 [&::-webkit-details-marker]:hidden' : 'flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left transition hover:bg-slate-950/50 [&::-webkit-details-marker]:hidden'}>
      <div>
        <div className={isLight ? 'text-xs font-semibold uppercase tracking-wide text-slate-500' : 'text-xs font-semibold uppercase tracking-wide text-slate-400'}>{title}</div>
        <p className={isLight ? 'mt-1 text-xs leading-5 text-slate-500' : 'mt-1 text-xs leading-5 text-slate-400'}>{description}</p>
      </div>
      <ChevronDown size={14} aria-hidden="true" className={isLight ? 'shrink-0 text-slate-500 transition duration-200 group-open:rotate-180 group-open:text-slate-700' : 'shrink-0 text-slate-400 transition duration-200 group-open:rotate-180 group-open:text-slate-200'} />
    </summary>
    <div className="mt-3 space-y-3">{children}</div>
  </details>
)

const neutralButtonClasses = (isLight: boolean, disabled = false) =>
  isLight
    ? `inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 ${disabled ? 'disabled:cursor-not-allowed disabled:opacity-40' : ''}`
    : `inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-900 ${disabled ? 'disabled:cursor-not-allowed disabled:opacity-40' : ''}`

const selectedNeutralButtonClasses = (isLight: boolean) =>
  isLight
    ? 'flex w-full flex-col rounded-md border border-slate-400 bg-white px-3 py-2 text-left text-sm text-slate-700 transition hover:border-slate-500 hover:bg-slate-50'
    : 'flex w-full flex-col rounded-md border border-slate-600 bg-slate-950/20 px-3 py-2 text-left text-sm text-slate-200 transition hover:border-slate-500 hover:bg-slate-900'

interface GeospatialSettingsMenuProps {
  markers: TranslationMarker[]
  lineage: EtymologyNode | null
  annotations: import('@/types/mapState').MapAnnotation[]
  word?: string
  language?: string
  canFitToData?: boolean
  onFitToData: () => void
  onResetView: () => void
  onSaveState: () => void
  onOpenGuide: () => void
  layerVisibility: Record<MapLayerKey, boolean>
  onLayerToggle: (layer: MapLayerKey) => void
  layerOpacities: LayerOpacityState
  onLayerOpacityChange: (layer: LayerOpacityKey, opacity: number) => void
  layerOrder: LayerOrderState
  onLayerMove: (layer: LayerOrderKey, direction: LayerOrderDirection) => void
  onResetLayers: () => void
  onOpenCommandPalette: () => void
  onMarkerSelect: (marker: TranslationMarker, index: number) => void
  annotationMode: boolean
  annotationsVisible: boolean
  annotationTool: AnnotationKind
  annotationColor: AnnotationColor
  annotationCount: number
  onAnnotationModeChange: (enabled: boolean) => void
  onAnnotationsVisibleChange: (enabled: boolean) => void
  onAnnotationToolChange: (tool: AnnotationKind) => void
  onAnnotationColorChange: (color: AnnotationColor) => void
  onClearAnnotations: () => void
  theme?: 'dark' | 'light'
}

const GeospatialSettingsMenu: React.FC<GeospatialSettingsMenuProps> = ({
  markers,
  lineage,
  annotations,
  word,
  language,
  canFitToData = false,
  onFitToData,
  onResetView,
  onSaveState,
  onOpenGuide,
  layerVisibility,
  onLayerToggle,
  layerOpacities,
  onLayerOpacityChange,
  layerOrder,
  onLayerMove,
  onResetLayers,
  onOpenCommandPalette,
  onMarkerSelect,
  annotationMode,
  annotationsVisible,
  annotationTool,
  annotationColor,
  annotationCount,
  onAnnotationModeChange,
  onAnnotationsVisibleChange,
  onAnnotationToolChange,
  onAnnotationColorChange,
  onClearAnnotations,
  theme = 'dark',
}) => {
  const isLight = theme === 'light'
  const map = useMap()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [translationSearchQuery, setTranslationSearchQuery] = useState('')
  const [options, setOptions] = useState<ExportOptions>({ markers: true, lineagePoints: true, lineagePath: true, annotations: true })
  const previewRef = useRef<HTMLDivElement | null>(null)
  const sidebarRef = useRef<HTMLElement | null>(null)

  useFocusTrap(Boolean(previewDataUrl), previewRef)

  useEffect(() => {
    const element = sidebarRef.current
    if (!element) return

    DomEvent.disableScrollPropagation(element)

    return () => {
      DomEvent.enableScrollPropagation(element)
    }
  }, [])

  useEffect(() => {
    if (!map) return

    const enableScrollZoom = () => {
      map.scrollWheelZoom?.disable()
    }

    const disableScrollZoom = () => {
      map.scrollWheelZoom?.enable()
    }

    const element = sidebarRef.current
    if (!element) return

    element.addEventListener('pointerenter', enableScrollZoom)
    element.addEventListener('pointerleave', disableScrollZoom)

    return () => {
      element.removeEventListener('pointerenter', enableScrollZoom)
      element.removeEventListener('pointerleave', disableScrollZoom)
      map.scrollWheelZoom?.enable()
    }
  }, [map])

  const layerControls = useMemo(() => ([
    { key: 'translations' as const, label: 'Translations', hint: 'Marker clusters and popups' },
    { key: 'etymology' as const, label: 'Etymology', hint: 'Lineage path and country highlights' },
    { key: 'descendants' as const, label: 'Descendants', hint: 'Branching descendant routes' },
    { key: 'protoZones' as const, label: 'Proto zones', hint: 'Historical region polygons' },
    { key: 'languageFamilies' as const, label: 'Families', hint: 'Bubble overlays and labels' },
  ]), [])

  const opacityControls = useMemo(() => ([
    { key: 'translations' as const, label: 'Translations', hint: 'Marker clusters and popups' },
    { key: 'protoZones' as const, label: 'Proto-language zones', hint: 'Historical region polygons' },
    { key: 'languageFamilies' as const, label: 'Language families', hint: 'Bubble overlays and labels' },
    { key: 'etymology' as const, label: 'Etymology', hint: 'Lineage path and country highlights' },
    { key: 'descendants' as const, label: 'Descendant paths', hint: 'Branching paths and labels' },
  ]), [])

  const orderControls = useMemo(() => ([
    { key: 'translations' as const, label: 'Translations', hint: 'Marker clusters and popups' },
    { key: 'descendants' as const, label: 'Descendant paths', hint: 'Branching paths and labels' },
    { key: 'etymology' as const, label: 'Etymology', hint: 'Lineage path and country highlights' },
    { key: 'protoZones' as const, label: 'Proto-language zones', hint: 'Historical region polygons' },
    { key: 'languageFamilies' as const, label: 'Language families', hint: 'Bubble overlays and labels' },
  ]), [])

  const annotationControls = useMemo(() => ([
    { key: 'note' as const, label: 'Note', hint: 'Click once to add text', icon: PencilLine },
    { key: 'highlight' as const, label: 'Highlight', hint: 'Click once to mark an area', icon: Highlighter },
    { key: 'arrow' as const, label: 'Arrow', hint: 'Two clicks: start, then end', icon: ArrowRight },
    { key: 'freehand' as const, label: 'Freehand', hint: 'Press and drag to sketch a stroke', icon: PencilLine },
    { key: 'region' as const, label: 'Region', hint: 'Click multiple points to trace an area', icon: Radius },
    { key: 'link' as const, label: 'Link', hint: 'Two clicks to connect two points', icon: Link2 },
  ]), [])

  const annotationColorOptions = useMemo(() => ([
    { key: 'red' as const, label: 'Red', swatch: '#ef4444', selectedRing: 'ring-red-500' },
    { key: 'green' as const, label: 'Green', swatch: '#22c55e', selectedRing: 'ring-emerald-500' },
    { key: 'blue' as const, label: 'Blue', swatch: '#38bdf8', selectedRing: 'ring-sky-500' },
    { key: 'white' as const, label: 'White', swatch: '#f8fafc', selectedRing: 'ring-slate-300' },
    { key: 'black' as const, label: 'Black', swatch: '#111827', selectedRing: 'ring-slate-900' },
  ]), [])

  const shortcutHelpItems = useMemo(() => ([
    { keys: ['Alt', '1'], label: 'Toggle translations layer' },
    { keys: ['Alt', '2'], label: 'Toggle etymology layer' },
    { keys: ['Alt', '3'], label: 'Toggle descendant paths layer' },
    { keys: ['Alt', '4'], label: 'Toggle proto-language zones' },
    { keys: ['Alt', '5'], label: 'Toggle language families' },
    { keys: ['Alt', '6'], label: 'Toggle annotations layer' },
    { keys: ['Alt', 'A'], label: 'Toggle annotation mode' },
    { keys: ['Alt', 'F'], label: 'Fit the map to visible data' },
    { keys: ['Alt', 'R'], label: 'Reset the map view' },
    { keys: ['Alt', 'S'], label: 'Copy the current shareable state link' },
    { keys: ['Ctrl', 'K'], label: 'Open the command palette' },
  ]), [])

  const exportLayerToggles = useMemo(() => ([
    { key: 'markers' as const, label: 'Translation markers' },
    { key: 'lineagePoints' as const, label: 'Lineage points' },
    { key: 'lineagePath' as const, label: 'Lineage path' },
    { key: 'annotations' as const, label: 'Annotations' },
  ]), [])

  const filteredTranslationMarkers = useMemo(() => {
    const normalizedQuery = translationSearchQuery.trim().toLowerCase()
    if (!normalizedQuery) return [] as Array<{ marker: TranslationMarker; index: number; score: number }>

    const tokens = normalizedQuery.split(/\s+/).filter(Boolean)

    return markers
      .map((marker, index) => {
        const haystack = [marker.word, marker.language, marker.code, marker.roman, marker.sense, marker.popupText]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        if (!tokens.every(token => haystack.includes(token))) {
          return null
        }

        const word = marker.word.toLowerCase()
        const language = marker.language.toLowerCase()
        const code = marker.code.toLowerCase()
        let score = 20

        if (word === normalizedQuery || language === normalizedQuery || code === normalizedQuery) {
          score -= 10
        } else if (word.startsWith(normalizedQuery) || language.startsWith(normalizedQuery) || code.startsWith(normalizedQuery)) {
          score -= 6
        } else if (word.includes(normalizedQuery) || language.includes(normalizedQuery) || code.includes(normalizedQuery)) {
          score -= 3
        }

        tokens.forEach(token => {
          if (word.startsWith(token) || language.startsWith(token) || code.startsWith(token)) {
            score -= 1
          } else if (word.includes(token) || language.includes(token) || code.includes(token)) {
            score -= 0.5
          }
        })

        return { marker, index, score }
      })
      .filter((entry): entry is { marker: TranslationMarker; index: number; score: number } => entry !== null)
      .sort((left, right) => left.score - right.score || left.marker.word.localeCompare(right.marker.word))
  }, [markers, translationSearchQuery])

  const handleTranslationSelect = useCallback((marker: TranslationMarker, index: number) => {
    if (!layerVisibility.translations) {
      onLayerToggle('translations')
    }

    onMarkerSelect(marker, index)
  }, [layerVisibility.translations, onLayerToggle, onMarkerSelect])

  const onChange = (key: keyof ExportOptions) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setOptions(prev => ({ ...prev, [key]: e.target.checked }))
  }

  const handleExport = useCallback(() => {
    downloadGeoJSON(buildGeoJSON(markers, lineage, annotations, options))
  }, [annotations, markers, lineage, options])

  const tryFindTarget = useCallback(() => {
    const byId = document.getElementById('map-root')
    if (byId) return byId
    const byClass = document.querySelector('.leaflet-container') as HTMLElement | null
    if (byClass) return byClass
    return document.querySelector('[role="application"]') as HTMLElement | null
  }, [])

  const handleCapture = useCallback(async () => {
    const target = tryFindTarget()
    if (!target) {
      setError('Map element not found in DOM; cannot capture.')
      return
    }

    setError(null)
    setCapturing(true)

    try {
      const capturePromise = html2canvas(target, {
        useCORS: true,
        backgroundColor: null,
        onclone: (clonedDoc: Document) => {
          try {
            const win = clonedDoc.defaultView || window
            const normalizeColor = (colorValue: string | null | undefined): string | null => {
              if (!colorValue) return null
              if (/oklab|oklch/i.test(colorValue)) return 'rgb(0, 0, 0)'
              try {
                const span = clonedDoc.createElement('span')
                span.style.color = colorValue
                span.style.display = 'none'
                clonedDoc.body.appendChild(span)
                const computed = (clonedDoc.defaultView || window).getComputedStyle(span).color
                span.remove()
                return computed || colorValue
              } catch {
                return colorValue
              }
            }

            const colorTokenRegex = /(rgba?\([^)]+\)|hsla?\([^)]+\)|oklab\([^)]+\)|oklch\([^)]+\))/gi
            const allEls: (HTMLElement | SVGElement | Element)[] = [clonedDoc.documentElement, clonedDoc.body, ...Array.from(clonedDoc.querySelectorAll<HTMLElement | SVGElement>('*'))]

            allEls.forEach(el => {
              try {
                const cs = win.getComputedStyle(el as Element)
                const color = normalizeColor(cs.color)
                if (color) (el as HTMLElement).style.color = color
                const bg = normalizeColor(cs.backgroundColor)
                if (bg) (el as HTMLElement).style.backgroundColor = bg
                const border = normalizeColor(cs.borderColor)
                if (border) (el as HTMLElement).style.borderColor = border
                const outline = normalizeColor(cs.outlineColor)
                if (outline) (el as HTMLElement).style.outlineColor = outline

                try {
                  const box = cs.boxShadow
                  if (box && box !== 'none') {
                    colorTokenRegex.lastIndex = 0
                    let newBox = box
                    const matches = box.match(colorTokenRegex)
                    if (matches) {
                      matches.forEach(token => {
                        const norm = normalizeColor(token)
                        if (norm && norm !== token) newBox = newBox.replace(token, norm)
                      })
                      ;(el as HTMLElement).style.boxShadow = newBox
                    }
                  }
                } catch {
                  // ignore box-shadow issues
                }

                if (el instanceof SVGElement) {
                  try {
                    const rawFill = (el as any).getAttribute?.('fill') || (cs as any).fill || (el as any).style?.fill
                    const rawStroke = (el as any).getAttribute?.('stroke') || (cs as any).stroke || (el as any).style?.stroke
                    const nf = normalizeColor(rawFill)
                    if (nf) (el as any).setAttribute('fill', nf)
                    const ns = normalizeColor(rawStroke)
                    if (ns) (el as any).setAttribute('stroke', ns)
                  } catch {
                    // ignore SVG issues
                  }
                }

                const inlineStyle = el.getAttribute('style')
                if (inlineStyle) {
                  colorTokenRegex.lastIndex = 0
                  if (colorTokenRegex.test(inlineStyle)) {
                    colorTokenRegex.lastIndex = 0
                    let newStyle = inlineStyle
                    const styleMatches = inlineStyle.match(colorTokenRegex)
                    if (styleMatches) {
                      styleMatches.forEach(token => {
                        const norm = normalizeColor(token)
                        if (norm && norm !== token) newStyle = newStyle.replace(token, norm)
                      })
                      el.setAttribute('style', newStyle)
                    }
                  }
                }
              } catch {
                // ignore element-level issues
              }
            })
          } catch {
            // ignore clone adjustments
          }
        },
      })

      const timeoutPromise = new Promise<HTMLCanvasElement>((_, reject) => setTimeout(() => reject(new Error('capture-timeout')), 15000))
      const canvas = (await Promise.race([capturePromise, timeoutPromise])) as HTMLCanvasElement
      setPreviewDataUrl(canvas.toDataURL('image/png'))
    } catch (captureError: any) {
      // eslint-disable-next-line no-console
      console.error('Screenshot capture failed', captureError)
      if (captureError && captureError.message === 'capture-timeout') {
        setError('Capture timed out. The map may include cross-origin tiles — try a different basemap.')
      } else if (captureError && /oklab|oklch/i.test(String(captureError.message || ''))) {
        setError('Screenshot failed due to unsupported CSS color functions (oklab/oklch). Try switching basemap or use the Export GeoJSON control.')
      } else {
        setError('Screenshot failed. See console for details.')
      }
    } finally {
      setCapturing(false)
    }
  }, [tryFindTarget])

  const handleDownload = useCallback(() => {
    if (!previewDataUrl) return
    const a = document.createElement('a')
    const fileNameWord = (word && word.trim()) || 'map'
    const fileNameLang = (language && language.trim()) || 'unknown'
    a.href = previewDataUrl
    a.download = `${fileNameWord}-${fileNameLang}-screenshot.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }, [previewDataUrl, word, language])

  return (
    <>
      <aside
        ref={sidebarRef}
        aria-label="Map sidebar"
        data-map-ui-overlay="true"
        onMouseDown={event => event.stopPropagation()}
        onClick={event => event.stopPropagation()}
        data-collapsed={isCollapsed ? 'true' : 'false'}
        className={isLight
          ? `fixed inset-y-0 left-0 z-[10000] flex flex-col border-r border-slate-200/90 bg-white/96 text-slate-900 shadow-2xl shadow-slate-200/40 backdrop-blur transition-[width] duration-200 ease-out ${isCollapsed ? 'w-14' : 'w-[min(22rem,calc(100vw-1rem))]'}`
          : `fixed inset-y-0 left-0 z-[10000] flex flex-col border-r border-slate-800/90 bg-slate-950/96 text-slate-100 shadow-2xl shadow-black/30 backdrop-blur transition-[width] duration-200 ease-out ${isCollapsed ? 'w-14' : 'w-[min(22rem,calc(100vw-1rem))]'}`}
        style={{ pointerEvents: 'auto' }}
      >
        <div className={isLight ? 'border-b border-slate-200 bg-gradient-to-b from-white via-slate-50 to-slate-100 px-3 py-3' : 'border-b border-slate-800 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-900/80 px-3 py-3'}>
          <div className={isCollapsed ? 'flex flex-col items-center gap-2' : 'flex items-start justify-between gap-3'}>
            {!isCollapsed && (
              <div>
                <div className={isLight ? 'text-[11px] font-semibold uppercase tracking-[0.34em] text-blue-700/80' : 'text-[11px] font-semibold uppercase tracking-[0.34em] text-slate-400'}>Map sidebar</div>
                <h2 className={isLight ? 'mt-2 text-lg font-semibold text-slate-900' : 'mt-2 text-lg font-semibold text-white'}>{word && language ? `${word} · ${language}` : 'WiktionaryViz'}</h2>
                <p className={isLight ? 'mt-1 text-sm leading-6 text-slate-600' : 'mt-1 text-sm leading-6 text-slate-300'}>Control layers, annotations, and exports from one persistent panel.</p>
              </div>
            )}
            <button
              type="button"
              onClick={() => setIsCollapsed(prev => !prev)}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!isCollapsed}
              className={isLight
                ? 'inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-slate-50'
                : 'inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-sm transition hover:border-slate-500 hover:bg-slate-800'}
            >
              {isCollapsed ? <ChevronRight size={18} aria-hidden="true" /> : <ChevronLeft size={18} aria-hidden="true" />}
            </button>
          </div>

          {isCollapsed && (
            <p className={isLight ? 'mt-3 text-center text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500' : 'mt-3 text-center text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400'}>
              Sidebar
            </p>
          )}

          {!isCollapsed && (
            <>
              <section className="mt-4 grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={onFitToData} disabled={!canFitToData} className={neutralButtonClasses(isLight, !canFitToData)}>Fit to data</button>
                <button type="button" onClick={onOpenGuide} className={neutralButtonClasses(isLight)}>Open guide</button>
                <button type="button" onClick={onOpenCommandPalette} className={neutralButtonClasses(isLight)}>Command palette</button>
                <button type="button" onClick={onResetView} className={neutralButtonClasses(isLight)}>Reset view</button>
                <button type="button" onClick={onSaveState} className={neutralButtonClasses(isLight)}>Copy shareable link</button>
                <button type="button" onClick={onResetLayers} className={neutralButtonClasses(isLight)}>Reset layers</button>
              </section>
            </>
          )}
        </div>

        {!isCollapsed && (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
          <SettingsSection title="Layers" description="Turn map content on or off and adjust the visual stack in one place." defaultOpen isLight={isLight}>
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                {layerControls.map(item => {
                  const active = layerVisibility[item.key]
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => onLayerToggle(item.key)}
                      aria-pressed={active}
                      className={active
                        ? (isLight ? 'flex flex-col rounded-xl border border-blue-300 bg-blue-50 px-3 py-3 text-left shadow-sm transition hover:border-blue-400 hover:bg-blue-50' : 'flex flex-col rounded-xl border border-sky-400/40 bg-sky-500/10 px-3 py-3 text-left shadow-sm transition hover:border-sky-300/60 hover:bg-sky-500/15')
                        : (isLight ? 'flex flex-col rounded-xl border border-slate-200 bg-white px-3 py-3 text-left transition hover:border-slate-300 hover:bg-slate-50' : 'flex flex-col rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-3 text-left transition hover:border-slate-700 hover:bg-slate-900')}
                    >
                      <span className={isLight ? 'text-sm font-semibold text-slate-900' : 'text-sm font-semibold text-slate-100'}>{item.label}</span>
                      <span className={isLight ? 'mt-1 text-xs leading-5 text-slate-500' : 'mt-1 text-xs leading-5 text-slate-400'}>{item.hint}</span>
                    </button>
                  )
                })}
              </div>

              <div className={isLight ? 'rounded-lg border border-slate-200 bg-white p-3' : 'rounded-lg border border-slate-800 bg-slate-950/40 p-3'}>
                <label className={isLight ? 'text-xs font-semibold uppercase tracking-wide text-slate-500' : 'text-xs font-semibold uppercase tracking-wide text-slate-400'} htmlFor="translation-search">
                  Search translations
                </label>
                <input
                  id="translation-search"
                  type="search"
                  value={translationSearchQuery}
                  onChange={event => setTranslationSearchQuery(event.target.value)}
                  placeholder="Word, language, or code"
                  className={isLight ? 'mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none' : 'mt-2 w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-slate-500 focus:outline-none'}
                />
                <p className={isLight ? 'mt-2 text-xs leading-5 text-slate-500' : 'mt-2 text-xs leading-5 text-slate-400'}>
                  Try a word, language name, or language code such as <span className={isLight ? 'font-medium text-slate-700' : 'font-medium text-slate-200'}>چای</span>, <span className={isLight ? 'font-medium text-slate-700' : 'font-medium text-slate-200'}>Iranian Persian</span>, or <span className={isLight ? 'font-medium text-slate-700' : 'font-medium text-slate-200'}>fa-ira</span>.
                </p>

                {translationSearchQuery.trim() && (
                  <div className="mt-3 space-y-2">
                    <div className={isLight ? 'text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500' : 'text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400'}>
                      {filteredTranslationMarkers.length} match{filteredTranslationMarkers.length === 1 ? '' : 'es'}
                    </div>
                    <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                      {filteredTranslationMarkers.length ? filteredTranslationMarkers.slice(0, 20).map(({ marker, index }) => (
                        <button
                          key={`${marker.code}-${marker.word}-${index}`}
                          type="button"
                          onClick={() => handleTranslationSelect(marker, index)}
                          className={isLight ? 'flex w-full flex-col rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left transition hover:border-blue-300 hover:bg-white' : 'flex w-full flex-col rounded-xl border border-slate-800 bg-slate-950/30 px-3 py-2 text-left transition hover:border-slate-500 hover:bg-slate-900'}
                        >
                          <div className={isLight ? 'text-sm font-semibold text-slate-900' : 'text-sm font-semibold text-slate-100'}>
                            {marker.word}
                          </div>
                          <div className={isLight ? 'mt-0.5 text-xs text-slate-500' : 'mt-0.5 text-xs text-slate-400'}>
                            {marker.language} · {marker.code}
                          </div>
                          {marker.sense && (
                            <div className={isLight ? 'mt-1 text-xs leading-5 text-slate-600' : 'mt-1 text-xs leading-5 text-slate-300'}>
                              {marker.sense}
                            </div>
                          )}
                        </button>
                      )) : (
                        <div className={isLight ? 'rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500' : 'rounded-xl border border-dashed border-slate-800 bg-slate-950/30 px-3 py-3 text-sm text-slate-400'}>
                          No translation markers match that query.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <details open={false} className={isLight ? 'group rounded-lg border border-slate-200 bg-white' : 'group rounded-lg border border-slate-800 bg-slate-950/40'}>
                  <summary className={isLight ? 'flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 [&::-webkit-details-marker]:hidden' : 'flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400 [&::-webkit-details-marker]:hidden'}>
                    <span>Layer order</span>
                    <ChevronDown size={14} aria-hidden="true" className={isLight ? 'shrink-0 text-slate-500 transition duration-200 group-open:rotate-180 group-open:text-slate-700' : 'shrink-0 text-slate-400 transition duration-200 group-open:rotate-180 group-open:text-slate-200'} />
                  </summary>
                  <div className="space-y-2 px-2 pb-2">
                    {layerOrder.map((layerKey, index) => {
                      const item = orderControls.find(entry => entry.key === layerKey)
                      if (!item) return null
                      const isTop = index === 0
                      const isBottom = index === layerOrder.length - 1
                      const rankLabel = isTop ? 'Top' : isBottom ? 'Bottom' : `#${index + 1}`
                      return (
                        <div key={item.key} className={isLight ? 'rounded-md border border-slate-200 bg-slate-50 p-2' : 'rounded-md border border-slate-800 bg-slate-950/30 p-2'}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className={isLight ? 'text-sm font-medium text-slate-700' : 'text-sm font-medium text-slate-100'}>{item.label}</div>
                              <div className={isLight ? 'text-xs text-slate-500' : 'text-xs text-slate-400'}>{item.hint}</div>
                            </div>
                            <div className={isLight ? 'text-xs font-semibold uppercase tracking-wide text-slate-500' : 'text-xs font-semibold uppercase tracking-wide text-slate-400'}>{rankLabel}</div>
                          </div>
                          <div className="mt-2 flex gap-2">
                            <button type="button" onClick={() => onLayerMove(item.key, 'up')} disabled={isTop} className={isLight ? 'rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-blue-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40' : 'rounded-full border border-slate-700 px-3 py-1 text-xs font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40'}>Move up</button>
                            <button type="button" onClick={() => onLayerMove(item.key, 'down')} disabled={isBottom} className={isLight ? 'rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-blue-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40' : 'rounded-full border border-slate-700 px-3 py-1 text-xs font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40'}>Move down</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </details>
              </div>

              <div>
                <details open={false} className={isLight ? 'group rounded-lg border border-slate-200 bg-white' : 'group rounded-lg border border-slate-800 bg-slate-950/40'}>
                  <summary className={isLight ? 'flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 [&::-webkit-details-marker]:hidden' : 'flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400 [&::-webkit-details-marker]:hidden'}>
                    <span>Layer opacity</span>
                    <ChevronDown size={14} aria-hidden="true" className={isLight ? 'shrink-0 text-slate-500 transition duration-200 group-open:rotate-180 group-open:text-slate-700' : 'shrink-0 text-slate-400 transition duration-200 group-open:rotate-180 group-open:text-slate-200'} />
                  </summary>
                  <div className={isLight ? 'space-y-3 px-2 pb-2' : 'space-y-3 px-2 pb-2'}>
                    {opacityControls.map(item => {
                      const value = Math.round(layerOpacities[item.key] * 100)
                      return (
                        <div key={item.key} className="space-y-1">
                          <div className="flex items-center justify-between gap-3">
                            <label className={isLight ? 'text-sm text-slate-700' : 'text-sm text-slate-200'} htmlFor={`opacity-${item.key}`}>{item.label}</label>
                            <span className={isLight ? 'text-xs font-medium text-slate-500' : 'text-xs font-medium text-slate-400'}>{value}%</span>
                          </div>
                          <input id={`opacity-${item.key}`} type="range" min={0} max={100} step={1} value={value} onChange={event => onLayerOpacityChange(item.key, Number(event.target.value) / 100)} aria-label={`${item.label} opacity`} aria-describedby={`opacity-hint-${item.key}`} className="h-2 w-full cursor-pointer accent-sky-500" />
                          <p id={`opacity-hint-${item.key}`} className={isLight ? 'text-xs leading-4 text-slate-500' : 'text-xs leading-4 text-slate-400'}>{item.hint}</p>
                        </div>
                      )
                    })}
                  </div>
                </details>
              </div>

              <button type="button" onClick={onResetLayers} className={neutralButtonClasses(isLight)}>Reset layers</button>
            </div>
          </SettingsSection>

          <SettingsSection title="Annotation" description="Turn editing on, choose a tool, or hide the annotation layer." isLight={isLight}>
            <div className={isLight ? 'space-y-3 rounded-lg border border-slate-200 bg-white p-2' : 'space-y-3 rounded-lg border border-slate-800 bg-slate-950/40 p-2'}>
              <button type="button" onClick={() => onAnnotationModeChange(!annotationMode)} aria-pressed={annotationMode} className={neutralButtonClasses(isLight)}>
                {annotationMode ? 'Disable annotation mode' : 'Enable annotation mode'}
              </button>
              <p className={isLight ? 'px-1 text-xs leading-5 text-slate-500' : 'px-1 text-xs leading-5 text-slate-400'}>
                {annotationCount > 0 ? `${annotationCount} annotation${annotationCount === 1 ? '' : 's'} saved on the map.` : 'Click the map to add notes, highlights, arrows, regions, or custom links.'}
              </p>
              <button type="button" onClick={() => onAnnotationsVisibleChange(!annotationsVisible)} aria-pressed={annotationsVisible} className={neutralButtonClasses(isLight)}>
                {annotationsVisible ? 'Hide annotation layer' : 'Show annotation layer'}
              </button>
              <p className={isLight ? 'px-1 text-xs leading-5 text-slate-500' : 'px-1 text-xs leading-5 text-slate-400'}>
                {annotationsVisible ? 'Annotations are visible as their own layer and can be exported.' : 'Annotations remain in map state but are hidden from the canvas and export.'}
              </p>
              <div className={isLight ? 'rounded-md border border-slate-200 bg-slate-50 p-2' : 'rounded-md border border-slate-800 bg-slate-900/60 p-2'}>
                <div className="mt-2 flex flex-wrap gap-2">
                  {annotationColorOptions.map(option => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => onAnnotationColorChange(option.key)}
                      aria-pressed={annotationColor === option.key}
                      aria-label={`Set annotation colour to ${option.label}`}
                      className={annotationColor === option.key
                        ? `flex h-10 w-10 items-center justify-center rounded-full border transition ${isLight ? 'border-slate-400 bg-slate-100' : 'border-slate-500 bg-slate-900'} ring-2 ring-offset-2 ring-offset-transparent ${option.selectedRing}`
                        : `flex h-10 w-10 items-center justify-center rounded-full border transition ${isLight ? 'border-slate-300 bg-transparent hover:bg-slate-50' : 'border-slate-700 bg-transparent hover:bg-slate-900'}`}
                    >
                      <span
                        className={option.key === 'white' ? 'h-4 w-4 rounded-full border border-slate-300' : 'h-4 w-4 rounded-full border border-transparent'}
                        style={{ backgroundColor: option.swatch }}
                        aria-hidden="true"
                      />
                    </button>
                  ))}
                </div>
              </div>
              <div className={isLight ? 'space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2' : 'space-y-2 rounded-md border border-slate-800 bg-slate-900/60 p-2'}>
                {annotationControls.map(item => {
                  const ToolIcon = item.icon
                  return (
                  <button key={item.key} type="button" onClick={() => onAnnotationToolChange(item.key)} aria-pressed={annotationTool === item.key} className={annotationTool === item.key ? selectedNeutralButtonClasses(isLight) : (isLight ? 'flex w-full flex-col rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 transition hover:border-slate-300 hover:bg-slate-50' : 'flex w-full flex-col rounded-md border border-slate-800 bg-slate-950/20 px-3 py-2 text-left text-sm text-slate-200 transition hover:border-slate-700 hover:bg-slate-900')}>
                    <span className="flex items-center gap-2 font-medium">
                      <ToolIcon size={14} aria-hidden="true" />
                      {item.label}
                    </span>
                    <span className={isLight ? 'text-xs text-slate-500' : 'text-xs text-slate-400'}>{item.hint}</span>
                  </button>
                  )
                })}
              </div>
              {annotationTool === 'arrow' && (
                <div className={isLight ? 'rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-800' : 'rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100'}>
                  Arrow drawing needs two clicks. First click starts the arrow, second click finishes it.
                </div>
              )}
              {annotationTool === 'link' && (
                <div className={isLight ? 'rounded-lg border border-fuchsia-200 bg-fuchsia-50 px-3 py-2 text-xs text-fuchsia-800' : 'rounded-lg border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-2 text-xs text-fuchsia-100'}>
                  Custom links also use two clicks: start from one point, then click the target point.
                </div>
              )}
              <button type="button" onClick={onClearAnnotations} disabled={annotationCount === 0} className={neutralButtonClasses(isLight, annotationCount === 0)}>
                Clear annotations
              </button>
            </div>
          </SettingsSection>

          <SettingsSection title="Export and Capture" description="Download GeoJSON or capture a preview without leaving the panel." isLight={isLight}>
            <div className="space-y-3">
              <div>
                <div className={isLight ? 'text-xs font-semibold uppercase tracking-wide text-slate-500' : 'text-xs font-semibold uppercase tracking-wide text-slate-400'}>Export GeoJSON</div>
                <fieldset className={isLight ? 'mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2' : 'mt-2 space-y-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2'}>
                  <legend className="sr-only">Include layers</legend>
                  {exportLayerToggles.map(item => (
                    <label key={item.key} className={isLight ? 'flex items-center gap-2 text-sm text-slate-700' : 'flex items-center gap-2 text-sm text-slate-200'}>
                      <input type="checkbox" checked={options[item.key] !== false} onChange={onChange(item.key)} className={isLight ? 'h-4 w-4 rounded border-slate-300 bg-white text-blue-600' : 'h-4 w-4 rounded border-slate-600 bg-slate-900 text-indigo-400'} />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </fieldset>
                <button type="button" onClick={handleExport} className={neutralButtonClasses(isLight)}>Download GeoJSON</button>
              </div>

              <div>
                <div className={isLight ? 'text-xs font-semibold uppercase tracking-wide text-slate-500' : 'text-xs font-semibold uppercase tracking-wide text-slate-400'}>Screenshot</div>
                <p className={isLight ? 'mt-2 text-xs leading-5 text-slate-500' : 'mt-2 text-xs leading-5 text-slate-400'}>Capture the current map view and open a preview before downloading.</p>
                <button type="button" onClick={handleCapture} disabled={capturing} className={neutralButtonClasses(isLight, capturing)}>{capturing ? 'Capturing…' : 'Capture Screenshot'}</button>
                {error && <p className={isLight ? 'mt-2 text-xs text-rose-600' : 'mt-2 text-xs text-rose-400'}>{error}</p>}
              </div>
            </div>
          </SettingsSection>

          <SettingsSection title="Keyboard shortcuts" description="Use quick keys when you want to move faster than the mouse." isLight={isLight}>
            <div className={isLight ? 'space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2' : 'space-y-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2'}>
              <p className={isLight ? 'text-xs leading-5 text-slate-500' : 'text-xs leading-5 text-slate-400'}>Shortcuts only fire when you are not typing in a field.</p>
              <div className="grid gap-2">
                {shortcutHelpItems.map(item => (
                  <div key={item.label} className={isLight ? 'flex items-start justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2' : 'flex items-start justify-between gap-3 rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2'}>
                    <div className={isLight ? 'text-sm text-slate-700' : 'text-sm text-slate-200'}>{item.label}</div>
                    <div className="flex shrink-0 items-center gap-1">
                      {item.keys.map(key => <kbd key={key} className={isLight ? 'rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600' : 'rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300'}>{key}</kbd>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </SettingsSection>
          </div>
        )}
      </aside>

      {previewDataUrl && (
        <div role="dialog" aria-modal="true" className={isLight ? 'fixed inset-0 z-[11000] flex items-center justify-center bg-slate-900/20 p-4' : 'fixed inset-0 z-[11000] flex items-center justify-center bg-black/60 p-4'}>
          <div ref={previewRef} tabIndex={-1} className={isLight ? 'max-h-[90vh] max-w-[90vw] overflow-auto rounded-lg bg-white shadow-lg shadow-blue-100/60' : 'max-h-[90vh] max-w-[90vw] overflow-auto rounded-lg bg-neutral-900 shadow-lg'}>
            <div className={isLight ? 'flex items-center justify-between border-b border-slate-200 p-3' : 'flex items-center justify-between border-b border-neutral-800 p-3'}>
              <span className={isLight ? 'text-sm text-slate-700' : 'text-sm text-gray-200'}>Screenshot Preview</span>
              <button onClick={() => setPreviewDataUrl(null)} className={isLight ? 'text-sm text-slate-500 hover:text-slate-800' : 'text-sm text-gray-400 hover:text-gray-200'} aria-label="Close preview">✕</button>
            </div>

            <div className="p-3">
              <img src={previewDataUrl} alt="Map screenshot preview" className="max-h-[70vh] max-w-full rounded" />
            </div>

            <div className={isLight ? 'flex items-center justify-between border-t border-slate-200 p-3' : 'flex items-center justify-between border-t border-neutral-800 p-3'}>
              <div className={isLight ? 'text-xs text-slate-500' : 'text-xs text-gray-400'}>{error ? `Preview ready. ${error}` : 'Preview ready.'}</div>
              <button onClick={handleDownload} className={isLight ? 'rounded border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm text-slate-700 hover:border-blue-300 hover:bg-white' : 'rounded border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-gray-200 hover:bg-neutral-700'}>Download</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default GeospatialSettingsMenu