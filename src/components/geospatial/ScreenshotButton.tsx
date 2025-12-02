import React, { useCallback, useState } from 'react'
import html2canvas from 'html2canvas'
import type L from 'leaflet'

interface ScreenshotButtonProps {
  word?: string
  language?: string
  mapInstance?: L.Map | null
}

const ScreenshotButton: React.FC<ScreenshotButtonProps> = ({ word, language, mapInstance }) => {
  const [capturing, setCapturing] = useState(false)
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const tryFindTarget = () => {
    const byId = document.getElementById('map-root')
    if (byId) return byId

    const byClass = document.querySelector('.leaflet-container') as HTMLElement | null
    if (byClass) return byClass

    const byRole = document.querySelector('[role="application"]') as HTMLElement | null
    if (byRole) return byRole

    return null
  }

  const handleCapture = useCallback(async () => {
    const target = tryFindTarget()
    if (!target) {
      setError('Map element not found in DOM; cannot capture.')
      return
    }

    setError(null)
    setCapturing(true)

    try {
      // First try leaflet-image if a Leaflet map instance is available.
      if (mapInstance) {
        try {
          // @ts-expect-error leaflet-image has no type declarations
          const leafletImageMod = await import('leaflet-image')
          const leafletImage =
            (leafletImageMod && (leafletImageMod as any).default) || leafletImageMod

          const canvas: HTMLCanvasElement = await new Promise((resolve, reject) => {
            try {
              leafletImage(mapInstance as any, (err: any, canv: HTMLCanvasElement) => {
                if (err) reject(err)
                else resolve(canv)
              })
            } catch (e) {
              reject(e)
            }
          })

          setPreviewDataUrl(canvas.toDataURL('image/png'))
          return
        } catch (leafletErr) {
          // eslint-disable-next-line no-console
          console.warn('leaflet-image capture failed, falling back to html2canvas', leafletErr)
        }
      }

      const capturePromise = html2canvas(target, {
        useCORS: true,
        backgroundColor: null,
        onclone: (clonedDoc: Document) => {
          try {
            const win = clonedDoc.defaultView || window

            // Helper: normalize any CSS color string using the cloned document.
            const normalizeColorInClonedDoc = (
              doc: Document,
              colorValue: string | null | undefined,
            ): string | null => {
              if (!colorValue) return null

              // Hard fallback for modern color spaces html2canvas cannot parse.
              if (/oklab|oklch/i.test(colorValue)) {
                // You can change this to any RGB you prefer.
                return 'rgb(0, 0, 0)'
              }

              try {
                const span = doc.createElement('span')
                span.style.color = colorValue
                span.style.display = 'none'
                doc.body.appendChild(span)
                const computed = (doc.defaultView || window).getComputedStyle(span).color
                span.remove()
                // If the browser can’t parse it, fall back to original
                return computed || colorValue
              } catch {
                return colorValue
              }
            }

            // Regex to find color-like tokens in box-shadow / inline style
            const COLOR_TOKEN_REGEX =
              /(rgba?\([^)]+\)|hsla?\([^)]+\)|oklab\([^)]+\)|oklch\([^)]+\))/gi

            // Include html + body + all descendants
            const allEls: (HTMLElement | SVGElement | Element)[] = [
              clonedDoc.documentElement,
              clonedDoc.body,
              ...Array.from(clonedDoc.querySelectorAll<HTMLElement | SVGElement>('*')),
            ]

            allEls.forEach(el => {
              try {
                const cs = win.getComputedStyle(el as Element)

                // Normalize simple color properties
                const color = normalizeColorInClonedDoc(clonedDoc, cs.color)
                if (color) (el as HTMLElement).style.color = color

                const bg = normalizeColorInClonedDoc(clonedDoc, cs.backgroundColor)
                if (bg) (el as HTMLElement).style.backgroundColor = bg

                const border = normalizeColorInClonedDoc(clonedDoc, cs.borderColor)
                if (border) (el as HTMLElement).style.borderColor = border

                const outline = normalizeColorInClonedDoc(clonedDoc, cs.outlineColor)
                if (outline) (el as HTMLElement).style.outlineColor = outline

                // box-shadow may include complex color functions; normalize each token
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

                // SVG paint properties
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

                // Inline style attribute text (gradients, etc.)
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
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('Screenshot capture failed', err)
      if (err && err.message === 'capture-timeout') {
        setError(
          'Capture timed out. The map may include cross-origin tiles — try a different basemap.',
        )
      } else if (err && /oklab|oklch/i.test(String(err.message || ''))) {
        setError(
          'Screenshot failed due to unsupported CSS color functions (oklab/oklch). Try switching basemap or use the Export GeoJSON control.',
        )
      } else {
        setError('Screenshot failed. See console for details.')
      }
    } finally {
      setCapturing(false)
    }
  }, [mapInstance])

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
      <div
        className="fixed bottom-16 left-2 z-[10000]"
        style={{ pointerEvents: 'auto' }}
      >
        <button
          onClick={handleCapture}
          disabled={capturing}
          className="bg-slate-700/90 hover:bg-slate-600 text-white font-medium px-4 py-2 rounded shadow text-sm backdrop-blur border border-slate-500/40"
        >
          {capturing ? 'Capturing…' : 'Screenshot'}
        </button>
      </div>

      {previewDataUrl && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[11000] flex items-center justify-center bg-black/60 p-4"
        >
          <div className="bg-neutral-900 rounded-lg shadow-lg max-w-[90vw] max-h-[90vh] overflow-auto">
            <div className="p-3 flex items-center justify-between border-b border-neutral-800">
              <span className="text-sm text-gray-200">Screenshot Preview</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPreviewDataUrl(null)}
                  className="text-gray-400 hover:text-gray-200 text-sm px-2"
                  aria-label="Close preview"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-3">
              {error ? (
                <div className="text-sm text-red-400">{error}</div>
              ) : (
                <img
                  src={previewDataUrl}
                  alt="Map screenshot preview"
                  className="block max-w-full h-auto rounded"
                />
              )}
            </div>

            <div className="p-3 flex justify-end gap-2 border-t border-neutral-800">
              <button
                onClick={() => setPreviewDataUrl(null)}
                className="bg-slate-700/90 hover:bg-slate-600 text-white px-3 py-1 rounded text-sm"
              >
                Close
              </button>
              <button
                onClick={handleDownload}
                disabled={!!error}
                className={`${
                  error ? 'bg-gray-600 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
                } text-white px-3 py-1 rounded text-sm`}
              >
                Download
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default ScreenshotButton
