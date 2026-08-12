import html2canvas from 'html2canvas'
import type { FeatureCollection, Geometry } from 'geojson'
import type { EtymologyNode } from '@/types/etymology'
import type { MapAnnotation, MapSelection, MapState } from '@/types/mapState'
import type { TranslationMarker } from '@/components/geospatial/TranslationMarkers'
import { buildGeoJSON } from '@/utils/geojsonExport'
import { flattenLineage } from '@/utils/mapUtils'

export interface CurrentMapExportBundle {
  type: 'wiktionaryviz-current-map-export'
  exportedAt: string
  currentWord: MapState['currentWord']
  camera: MapState['camera']
  selectedItem: MapSelection
  activeLayers: MapState['activeLayers']
  filters: MapState['filters']
  includeAnnotations: boolean
  counts: {
    markers: number
    lineageNodes: number
    annotations: number
  }
  geojson: FeatureCollection<Geometry, Record<string, unknown>>
}

export interface MapCaptureOptions {
  includeAnnotations: boolean
}

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const normalizeColor = (doc: Document, colorValue: string | null | undefined): string | null => {
  if (!colorValue) return null
  if (/oklab|oklch/i.test(colorValue)) return 'rgb(0, 0, 0)'

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

const normalizeCloneForCapture = (clonedDoc: Document, includeAnnotations: boolean) => {
  try {
    const win = clonedDoc.defaultView || window
    const colorTokenRegex = /(rgba?\([^)]+\)|hsla?\([^)]+\)|oklab\([^)]+\)|oklch\([^)]+\))/gi
    const allEls: (HTMLElement | SVGElement | Element)[] = [
      clonedDoc.documentElement,
      clonedDoc.body,
      ...Array.from(clonedDoc.querySelectorAll<HTMLElement | SVGElement>('*')),
    ]

    const chromeSelectors = [
      '[data-map-ui-overlay="true"]',
      '.leaflet-control-container',
      '.leaflet-control-attribution',
    ]
    chromeSelectors.forEach(selector => {
      clonedDoc.querySelectorAll<HTMLElement | SVGElement>(selector).forEach(element => {
        element.setAttribute('style', `${element.getAttribute('style') ?? ''};display:none !important;`)
      })
    })

    if (!includeAnnotations) {
      const annotationSelectors = [
        '.annotation-note-icon',
        '.annotation-start-marker-icon',
        '.annotation-freehand-start-icon',
        '.annotation-export-element',
        '.leaflet-popup-pane',
      ]
      annotationSelectors.forEach(selector => {
        clonedDoc.querySelectorAll<HTMLElement | SVGElement>(selector).forEach(element => {
          element.setAttribute('style', `${element.getAttribute('style') ?? ''};display:none !important;`)
        })
      })
    }

    allEls.forEach(el => {
      try {
        const cs = win.getComputedStyle(el as Element)
        const color = normalizeColor(clonedDoc, cs.color)
        if (color) (el as HTMLElement).style.color = color

        const bg = normalizeColor(clonedDoc, cs.backgroundColor)
        if (bg) (el as HTMLElement).style.backgroundColor = bg

        const border = normalizeColor(clonedDoc, cs.borderColor)
        if (border) (el as HTMLElement).style.borderColor = border

        const outline = normalizeColor(clonedDoc, cs.outlineColor)
        if (outline) (el as HTMLElement).style.outlineColor = outline

        try {
          const box = cs.boxShadow
          if (box && box !== 'none') {
            colorTokenRegex.lastIndex = 0
            let newBox = box
            const matches = box.match(colorTokenRegex)
            if (matches) {
              matches.forEach(token => {
                const norm = normalizeColor(clonedDoc, token)
                if (norm && norm !== token) {
                  newBox = newBox.replace(token, norm)
                }
              })
              ;(el as HTMLElement).style.boxShadow = newBox
            }
          }
        } catch {
          // ignore box-shadow normalization failures
        }

        if (el instanceof SVGElement) {
          try {
            const rawFill = (el as any).getAttribute?.('fill') || (cs as any).fill || (el as any).style?.fill
            const rawStroke = (el as any).getAttribute?.('stroke') || (cs as any).stroke || (el as any).style?.stroke
            const nf = normalizeColor(clonedDoc, rawFill)
            if (nf) (el as any).setAttribute('fill', nf)
            const ns = normalizeColor(clonedDoc, rawStroke)
            if (ns) (el as any).setAttribute('stroke', ns)
          } catch {
            // ignore SVG normalization failures
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
                const norm = normalizeColor(clonedDoc, token)
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
    // ignore clone adjustments if anything goes wrong
  }
}

export const captureMapCanvas = async (target: HTMLElement, options: MapCaptureOptions) => {
  return html2canvas(target, {
    useCORS: true,
    backgroundColor: null,
    onclone: (clonedDoc: Document) => {
      normalizeCloneForCapture(clonedDoc, options.includeAnnotations)
    },
  })
}

export const buildSvgFromCanvas = (canvas: HTMLCanvasElement, title = 'WiktionaryViz map export') => {
  const width = Math.max(1, canvas.width)
  const height = Math.max(1, canvas.height)
  const png = canvas.toDataURL('image/png')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <title>${escapeXml(title)}</title>
  <image x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none" href="${png}" xlink:href="${png}" />
</svg>`
}

export const downloadText = (content: string, fileName: string, mimeType: string) => {
  if (typeof document === 'undefined') return

  const blob = new Blob([content], { type: mimeType })
  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.URL.revokeObjectURL(url)
}

export const downloadJson = (value: unknown, fileName: string) => {
  downloadText(JSON.stringify(value, null, 2), fileName, 'application/json')
}

export const downloadSvg = (svgText: string, fileName: string) => {
  downloadText(svgText, fileName, 'image/svg+xml;charset=utf-8')
}

export const buildCurrentMapExportBundle = ({
  markers,
  lineage,
  annotations,
  mapState,
  includeAnnotations,
}: {
  markers: TranslationMarker[]
  lineage: EtymologyNode | null
  annotations: MapAnnotation[]
  mapState: MapState
  includeAnnotations: boolean
}): CurrentMapExportBundle => {
  const lineageNodes = flattenLineage(lineage)
  return {
    type: 'wiktionaryviz-current-map-export',
    exportedAt: new Date().toISOString(),
    currentWord: mapState.currentWord,
    camera: mapState.camera,
    selectedItem: mapState.selectedItem,
    activeLayers: mapState.activeLayers,
    filters: mapState.filters,
    includeAnnotations,
    counts: {
      markers: markers.length,
      lineageNodes: lineageNodes.length,
      annotations: includeAnnotations ? annotations.length : 0,
    },
    geojson: buildGeoJSON(markers, lineage, annotations, { annotations: includeAnnotations }) as FeatureCollection<Geometry, Record<string, unknown>>,
  }
}