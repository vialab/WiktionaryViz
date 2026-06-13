import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Settings } from 'lucide-react'
import html2canvas from 'html2canvas'
import type L from 'leaflet'
import type { TranslationMarker } from './TranslationMarkers'
import type { EtymologyNode } from '@/types/etymology'
import { buildGeoJSON, downloadGeoJSON, type ExportOptions } from '@/utils/geojsonExport'

interface GeospatialSettingsMenuProps {
  markers: TranslationMarker[]
  lineage: EtymologyNode | null
  word?: string
  language?: string
  mapInstance?: L.Map | null
  theme?: 'dark' | 'light'
}

const GeospatialSettingsMenu: React.FC<GeospatialSettingsMenuProps> = ({
  markers,
  lineage,
  word,
  language,
  mapInstance,
  theme = 'dark',
}) => {
  const isLight = theme === 'light'
  const [open, setOpen] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [options, setOptions] = useState<ExportOptions>({
    markers: true,
    lineagePoints: true,
    lineagePath: true,
  })
  const menuRef = useRef<HTMLDivElement | null>(null)

  const closeMenu = useCallback(() => setOpen(false), [])
  const toggleMenu = () => setOpen(prev => !prev)

  const onChange = (key: keyof ExportOptions) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setOptions(prev => ({ ...prev, [key]: e.target.checked }))
  }

  const handleExport = useCallback(() => {
    const geojson = buildGeoJSON(markers, lineage, options)
    downloadGeoJSON(geojson)
  }, [markers, lineage, options])

  const tryFindTarget = useCallback(() => {
    const byId = document.getElementById('map-root')
    if (byId) return byId

    const byClass = document.querySelector('.leaflet-container') as HTMLElement | null
    if (byClass) return byClass

    const byRole = document.querySelector('[role="application"]') as HTMLElement | null
    if (byRole) return byRole

    return null
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

            const normalizeColorInClonedDoc = (
              doc: Document,
              colorValue: string | null | undefined,
            ): string | null => {
              if (!colorValue) return null

              if (/oklab|oklch/i.test(colorValue)) {
                return 'rgb(0, 0, 0)'
              }

              try {
                const span = doc.createElement('span')
                span.style.color = colorValue
                span.style.display = 'none'
                doc.body.appendChild(span)
                const computed = (doc.defaultView || window).getComputedStyle(span).color
                span.remove()
                return computed || colorValue
              } catch {
                return colorValue
              }
            }

            const COLOR_TOKEN_REGEX =
              /(rgba?\([^)]+\)|hsla?\([^)]+\)|oklab\([^)]+\)|oklch\([^)]+\))/gi

            const allEls: (HTMLElement | SVGElement | Element)[] = [
              clonedDoc.documentElement,
              clonedDoc.body,
              ...Array.from(clonedDoc.querySelectorAll<HTMLElement | SVGElement>('*')),
            ]

            allEls.forEach(el => {
              try {
                const cs = win.getComputedStyle(el as Element)

                const color = normalizeColorInClonedDoc(clonedDoc, cs.color)
                if (color) (el as HTMLElement).style.color = color

                const bg = normalizeColorInClonedDoc(clonedDoc, cs.backgroundColor)
                if (bg) (el as HTMLElement).style.backgroundColor = bg

                const border = normalizeColorInClonedDoc(clonedDoc, cs.borderColor)
                if (border) (el as HTMLElement).style.borderColor = border

                const outline = normalizeColorInClonedDoc(clonedDoc, cs.outlineColor)
                if (outline) (el as HTMLElement).style.outlineColor = outline

                try {
                  const box = cs.boxShadow
                  if (box && box !== 'none') {
                    COLOR_TOKEN_REGEX.lastIndex = 0
                    let newBox = box
                    const matches = box.match(COLOR_TOKEN_REGEX)
                    if (matches) {
                      matches.forEach(token => {
                        const norm = normalizeColorInClonedDoc(clonedDoc, token)
                        if (norm && norm !== token) {
                          newBox = newBox.replace(token, norm)
                        }
                      })
                      ;(el as HTMLElement).style.boxShadow = newBox
                    }
                  }
                } catch {
                  // ignore box-shadow issues
                }

                if (el instanceof SVGElement) {
                  try {
                    const rawFill =
                      (el as any).getAttribute?.('fill') ||
                      (cs as any).fill ||
                      (el as any).style?.fill
                    const rawStroke =
                      (el as any).getAttribute?.('stroke') ||
                      (cs as any).stroke ||
                      (el as any).style?.stroke

                    const nf = normalizeColorInClonedDoc(clonedDoc, rawFill)
                    if (nf) (el as any).setAttribute('fill', nf)

                    const ns = normalizeColorInClonedDoc(clonedDoc, rawStroke)
                    if (ns) (el as any).setAttribute('stroke', ns)
                  } catch {
                    // ignore SVG issues
                  }
                }

                const inlineStyle = el.getAttribute('style')
                if (inlineStyle) {
                  COLOR_TOKEN_REGEX.lastIndex = 0
                  if (COLOR_TOKEN_REGEX.test(inlineStyle)) {
                    COLOR_TOKEN_REGEX.lastIndex = 0
                    let newStyle = inlineStyle
                    const styleMatches = inlineStyle.match(COLOR_TOKEN_REGEX)
                    if (styleMatches) {
                      styleMatches.forEach(token => {
                        const norm = normalizeColorInClonedDoc(clonedDoc, token)
                        if (norm && norm !== token) {
                          newStyle = newStyle.replace(token, norm)
                        }
                      })
                      el.setAttribute('style', newStyle)
                    }
                  }
                }
              } catch {
                // element-level ignore
              }
            })
          } catch {
            // ignore clone adjustments if anything goes wrong
          }
        },
      })

      const timeoutMs = 15000
      const timeoutPromise = new Promise<HTMLCanvasElement>((_, reject) =>
        setTimeout(() => reject(new Error('capture-timeout')), timeoutMs),
      )

      const canvas = (await Promise.race([capturePromise, timeoutPromise])) as HTMLCanvasElement
      setPreviewDataUrl(canvas.toDataURL('image/png'))
    } catch (captureError: any) {
      // eslint-disable-next-line no-console
      console.error('Screenshot capture failed', captureError)
      if (captureError && captureError.message === 'capture-timeout') {
        setError(
          'Capture timed out. The map may include cross-origin tiles — try a different basemap.',
        )
      } else if (captureError && /oklab|oklch/i.test(String(captureError.message || ''))) {
        setError(
          'Screenshot failed due to unsupported CSS color functions (oklab/oklch). Try switching basemap or use the Export GeoJSON control.',
        )
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

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current) return
      if (!menuRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const exportLayerToggles = useMemo(
    () => [
      { key: 'markers' as const, label: 'Translation Markers' },
      { key: 'lineagePoints' as const, label: 'Lineage Points' },
      { key: 'lineagePath' as const, label: 'Lineage Path' },
    ],
    [],
  )

  return (
    <div className="fixed bottom-2 left-2 z-[10000]" style={{ pointerEvents: 'auto' }} ref={menuRef}>
      <button
        onClick={toggleMenu}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open map settings"
        className={isLight
          ? 'inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm backdrop-blur transition hover:border-blue-300 hover:bg-slate-50'
          : 'inline-flex items-center gap-2 rounded-full border border-slate-500/40 bg-slate-700/90 px-4 py-2 text-sm font-medium text-white shadow backdrop-blur transition hover:bg-slate-600'}
      >
        <Settings size={16} />
        Settings
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Map settings"
          className={isLight
            ? 'absolute bottom-full left-0 mb-2 w-80 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-2xl shadow-blue-100/50 backdrop-blur'
            : 'absolute bottom-full left-0 mb-2 w-80 rounded-xl border border-slate-700/80 bg-slate-950/95 p-3 shadow-2xl backdrop-blur'}
        >
          <div className={isLight ? 'flex items-center justify-between border-b border-slate-200 pb-2' : 'flex items-center justify-between border-b border-slate-800 pb-2'}>
            <span className={isLight ? 'text-sm font-semibold text-blue-700' : 'text-sm font-semibold text-indigo-300'}>Map Settings</span>
            <button
              onClick={closeMenu}
              className={isLight ? 'text-xs text-slate-500 transition hover:text-slate-800' : 'text-xs text-slate-400 transition hover:text-slate-100'}
              aria-label="Close settings menu"
            >
              ✕
            </button>
          </div>

          <div className="space-y-3 pt-3">
            <section className="space-y-2">
              <div className={isLight ? 'text-xs font-semibold uppercase tracking-wide text-slate-500' : 'text-xs font-semibold uppercase tracking-wide text-slate-400'}>
                Export GeoJSON
              </div>
              <fieldset className={isLight ? 'space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2' : 'space-y-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2'}>
                <legend className="sr-only">Include layers</legend>
                {exportLayerToggles.map(item => (
                  <label key={item.key} className={isLight ? 'flex items-center gap-2 text-sm text-slate-700' : 'flex items-center gap-2 text-sm text-slate-200'}>
                    <input
                      type="checkbox"
                      checked={options[item.key] !== false}
                      onChange={onChange(item.key)}
                      className={isLight ? 'h-4 w-4 rounded border-slate-300 bg-white text-blue-600' : 'h-4 w-4 rounded border-slate-600 bg-slate-900 text-indigo-400'}
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </fieldset>
              <button
                onClick={handleExport}
                className={isLight ? 'inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-500' : 'inline-flex w-full items-center justify-center rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700'}
              >
                Download GeoJSON
              </button>
            </section>

            <section className={isLight ? 'space-y-2 border-t border-slate-200 pt-3' : 'space-y-2 border-t border-slate-800 pt-3'}>
              <div className={isLight ? 'text-xs font-semibold uppercase tracking-wide text-slate-500' : 'text-xs font-semibold uppercase tracking-wide text-slate-400'}>
                Screenshot
              </div>
              <p className={isLight ? 'text-xs leading-5 text-slate-500' : 'text-xs leading-5 text-slate-400'}>
                Capture the current map view and open a preview before downloading.
              </p>
              <button
                onClick={handleCapture}
                disabled={capturing}
                className={isLight ? 'inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300' : 'inline-flex w-full items-center justify-center rounded-lg bg-slate-700/90 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:bg-slate-700/60'}
              >
                {capturing ? 'Capturing…' : 'Capture Screenshot'}
              </button>
            </section>
          </div>
        </div>
      )}

      {previewDataUrl && (
        <div
          role="dialog"
          aria-modal="true"
          className={isLight ? 'fixed inset-0 z-[11000] flex items-center justify-center bg-slate-900/20 p-4' : 'fixed inset-0 z-[11000] flex items-center justify-center bg-black/60 p-4'}
        >
          <div className={isLight ? 'max-h-[90vh] max-w-[90vw] overflow-auto rounded-lg bg-white shadow-lg shadow-blue-100/60' : 'max-h-[90vh] max-w-[90vw] overflow-auto rounded-lg bg-neutral-900 shadow-lg'}>
            <div className={isLight ? 'flex items-center justify-between border-b border-slate-200 p-3' : 'flex items-center justify-between border-b border-neutral-800 p-3'}>
              <span className={isLight ? 'text-sm text-slate-700' : 'text-sm text-gray-200'}>Screenshot Preview</span>
              <button
                onClick={() => setPreviewDataUrl(null)}
                className={isLight ? 'text-sm text-slate-500 hover:text-slate-800' : 'text-sm text-gray-400 hover:text-gray-200'}
                aria-label="Close preview"
              >
                ✕
              </button>
            </div>

            <div className="p-3">
              {error ? (
                <div className="text-sm text-red-400">{error}</div>
              ) : (
                <img
                  src={previewDataUrl}
                  alt="Map screenshot preview"
                  className="block h-auto max-w-full rounded"
                />
              )}
            </div>

            <div className={isLight ? 'flex justify-end gap-2 border-t border-slate-200 p-3' : 'flex justify-end gap-2 border-t border-neutral-800 p-3'}>
              <button
                onClick={() => setPreviewDataUrl(null)}
                className={isLight ? 'rounded bg-slate-900 px-3 py-1 text-sm text-white transition hover:bg-slate-800' : 'rounded bg-slate-700/90 px-3 py-1 text-sm text-white transition hover:bg-slate-600'}
              >
                Close
              </button>
              <button
                onClick={handleDownload}
                disabled={!!error}
                className={`rounded px-3 py-1 text-sm text-white ${error ? 'cursor-not-allowed bg-gray-600' : 'bg-green-600 hover:bg-green-700'}`}
              >
                Download
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default GeospatialSettingsMenu