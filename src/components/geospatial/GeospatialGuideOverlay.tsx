import { FC, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { GuideLayerKey } from '@/types/mapState'
import useFocusTrap from '@/hooks/useFocusTrap'

type GuideLayerInfo = {
  title: string
  summary: string
  bestFor: string
  steps: string[]
  accent: string
}

const guideLayers: Record<GuideLayerKey, GuideLayerInfo> = {
  translations: {
    title: 'Translations',
    summary: 'Marker clusters show where the current word appears in the translation map.',
    bestFor: 'Quickly seeing where this word appears geographically.',
    steps: [
      'Start here if you want the quickest overview of where the word lands geographically.',
      'Hover markers to inspect the translation popups and compare clusters.',
    ],
      accent: 'from-slate-200/20 via-slate-400/10 to-slate-900',
  },
  etymology: {
    title: 'Etymology lineage path',
    summary: 'This path walks backward through ancestors and highlights the active timeline node.',
    bestFor: 'Tracing the word through time and watching the lineage animate.',
    steps: [
      'Use this when you want to trace the word through time and see how the lineage unfolds.',
      'Use the timeline scrubber to step through the path or play the sequence automatically.',
    ],
      accent: 'from-amber-400/20 via-slate-400/10 to-slate-900',
  },
  descendants: {
    title: 'Descendant paths',
    summary: 'This layer expands outward from a root candidate and reveals branching descendants.',
    bestFor: 'Exploring how the lineage branches outward from a root.',
    steps: [
      'Choose this if you want to inspect the family tree structure instead of the backward lineage.',
      'Click into deeper branches to expand more descendant paths and compare the branches.',
    ],
      accent: 'from-emerald-400/20 via-slate-400/10 to-slate-900',
  },
}

interface Props {
  open: boolean
  selectedLayer: GuideLayerKey | null
  recommendedLayer: GuideLayerKey | null
  recommendationLoading?: boolean
  recommendationReason: string
  availability: Record<GuideLayerKey, boolean>
  onChooseLayer: (layer: GuideLayerKey) => void
  onCloseGuide: () => void
  onClose: () => void
  onRestart: () => void
  theme?: 'dark' | 'light'
}

const layerOrder: GuideLayerKey[] = ['translations', 'etymology', 'descendants']

const guidePreviewBasePath = import.meta.env.BASE_URL || '/'

const guidePreviewVideos: Record<GuideLayerKey, string> = {
  translations: `${guidePreviewBasePath}geospatial-guide-previews/translations.mp4`,
  etymology: `${guidePreviewBasePath}geospatial-guide-previews/etymology.mp4`,
  descendants: `${guidePreviewBasePath}geospatial-guide-previews/descendants.mp4`,
}

const getSelectedPreviewVideo = (layer: GuideLayerKey | null) => {
  if (layer == null) {
    return guidePreviewVideos.translations
  }

  return guidePreviewVideos[layer]
}

interface GuideLayerCardProps {
  layer: GuideLayerKey
  info: GuideLayerInfo
  isLight: boolean
  disabled: boolean
  selected: boolean
  isRecommended: boolean
  recommendationTooltip: string | null
  hoveredRecommendation: GuideLayerKey | null
  setHoveredRecommendation: (layer: GuideLayerKey | null) => void
  onChooseLayer: (layer: GuideLayerKey) => void
}

const GuideLayerCard: FC<GuideLayerCardProps> = ({
  layer,
  info,
  isLight,
  disabled,
  selected,
  isRecommended,
  recommendationTooltip,
  hoveredRecommendation,
  setHoveredRecommendation,
  onChooseLayer,
}) => {
  const cardRef = useRef<HTMLButtonElement | null>(null)
  const [isCompact, setIsCompact] = useState(false)

  useEffect(() => {
    const element = cardRef.current
    if (!element || typeof ResizeObserver === 'undefined') return

    const updateLayout = () => {
      setIsCompact(element.offsetWidth < 240)
    }

    updateLayout()
    const observer = new ResizeObserver(updateLayout)
    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  return (
    <button
      ref={cardRef}
      onClick={() => onChooseLayer(layer)}
      disabled={disabled}
      aria-disabled={disabled}
      aria-pressed={selected}
      title={disabled ? 'No data available for this layer' : undefined}
      className={isLight
        ? 'group rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-blue-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:opacity-60'
        : 'group rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-left transition hover:border-slate-400 hover:bg-slate-800/90 disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-900/40 disabled:text-slate-500 disabled:opacity-55'}
    >
      <div className={isCompact ? 'flex flex-col gap-2' : 'flex items-start justify-between gap-3'}>
        {isRecommended && (
          <div className={isCompact ? 'relative self-start' : 'relative shrink-0'}>
            <span
              className={isLight ? 'rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-700' : 'rounded-full border border-slate-300/60 bg-slate-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-200'}
              onMouseEnter={() => setHoveredRecommendation(layer)}
              onMouseLeave={() => setHoveredRecommendation(null)}
            >
              Recommended
            </span>
            {hoveredRecommendation === layer && recommendationTooltip && (
              <div className={isLight ? 'pointer-events-none absolute left-0 top-full z-20 mt-2 w-[min(14rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs leading-5 text-slate-700 shadow-xl shadow-blue-100/60 sm:left-auto sm:right-0 sm:w-56' : 'pointer-events-none absolute left-0 top-full z-20 mt-2 w-[min(14rem,calc(100vw-2rem))] rounded-xl border border-slate-700 bg-slate-950/95 px-3 py-2 text-left text-xs leading-5 text-slate-200 shadow-xl shadow-black/30 sm:left-auto sm:right-0 sm:w-56'}>
                {recommendationTooltip}
              </div>
            )}
          </div>
        )}
        <div className={isLight ? 'min-w-0 text-lg font-semibold text-slate-900' : 'min-w-0 text-lg font-semibold text-white'}>{info.title}</div>
      </div>
      <p className={isLight ? 'mt-3 text-sm leading-6 text-slate-600' : 'mt-3 text-sm leading-6 text-slate-300'}>{info.summary}</p>
      {disabled && (
        <div className={isLight ? 'mt-3 inline-flex rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500' : 'mt-3 inline-flex rounded-full border border-slate-700 bg-slate-800/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400'}>
          No data available
        </div>
      )}
      <div className="mt-3 min-h-[4.5rem] space-y-1">
        <div className={isLight ? 'text-xs font-semibold uppercase tracking-[0.24em] text-slate-400' : 'text-xs font-semibold uppercase tracking-[0.24em] text-slate-500'}>
          Best for
        </div>
        <p className={isLight ? 'text-sm leading-6 text-slate-700' : 'text-sm leading-6 text-slate-200'}>
          {info.bestFor}
        </p>
      </div>
    </button>
  )
}

const GeospatialGuideOverlay: FC<Props> = ({
  open,
  selectedLayer,
  recommendedLayer,
  recommendationLoading = false,
  recommendationReason,
  availability,
  onChooseLayer,
  onCloseGuide,
  onClose,
  onRestart,
  theme = 'dark',
}) => {
  const selected = selectedLayer ? guideLayers[selectedLayer] : null
  const [hoveredRecommendation, setHoveredRecommendation] = useState<GuideLayerKey | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const isLight = theme === 'light'

  useFocusTrap(open, dialogRef)

  const recommendationTooltip =
    hoveredRecommendation != null ? recommendationReason : null

  const bodyContent = selected ? (
    <div className="grid min-h-0 gap-0 lg:grid-cols-[1.1fr_0.9fr]">
      <div className={isLight ? 'min-h-0 border-b border-slate-200 px-4 py-4 sm:px-6 sm:py-6 lg:border-b-0 lg:border-r' : 'min-h-0 border-b border-slate-800/80 px-4 py-4 sm:px-6 sm:py-6 lg:border-b-0 lg:border-r'}>
        <p className={isLight ? 'text-xs font-semibold uppercase tracking-[0.28em] text-blue-700' : 'text-xs font-semibold uppercase tracking-[0.28em] text-slate-400'}>
          Selected layer
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h3 className={isLight ? 'text-2xl font-semibold text-slate-900' : 'text-2xl font-semibold text-white'}>{selected.title}</h3>
          {selectedLayer === recommendedLayer && (
            <div className="relative">
              <span
                className={isLight ? 'inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-700' : 'inline-flex rounded-full border border-slate-300/60 bg-slate-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-200'}
                onMouseEnter={() => setHoveredRecommendation(selectedLayer)}
                onMouseLeave={() => setHoveredRecommendation(null)}
              >
                Recommended for this word
              </span>
              {hoveredRecommendation === selectedLayer && recommendationTooltip && (
                <div className={isLight ? 'pointer-events-none absolute left-0 top-full z-20 mt-2 w-64 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs leading-5 text-slate-700 shadow-xl shadow-blue-100/60' : 'pointer-events-none absolute left-0 top-full z-20 mt-2 w-64 rounded-xl border border-slate-700 bg-slate-950/95 px-3 py-2 text-left text-xs leading-5 text-slate-200 shadow-xl shadow-black/30'}>
                  {recommendationTooltip}
                </div>
              )}
            </div>
          )}
        </div>

        <p className={isLight ? 'mt-4 text-sm leading-6 text-slate-600' : 'mt-4 text-sm leading-6 text-slate-300'}>{selected.summary}</p>
        <div className={isLight ? 'mt-3 text-xs font-semibold uppercase tracking-[0.28em] text-blue-700' : 'mt-3 text-xs font-semibold uppercase tracking-[0.28em] text-slate-400'}>
          Best for
        </div>
        <p className={isLight ? 'mt-1 text-sm leading-6 text-slate-700' : 'mt-1 text-sm leading-6 text-slate-200'}>{selected.bestFor}</p>

        <div className="mt-5 space-y-4">
          <div>
            <div className={isLight ? 'text-xs font-semibold uppercase tracking-[0.28em] text-blue-700' : 'text-xs font-semibold uppercase tracking-[0.28em] text-slate-400'}>
              How it works
            </div>
            <p className={isLight ? 'mt-2 text-sm leading-6 text-slate-600' : 'mt-2 text-sm leading-6 text-slate-300'}>
              {selectedLayer === 'etymology'
                ? 'The lineage animates node by node, showing how the word changes across time.'
                : selectedLayer === 'translations'
                  ? 'Translations are grouped by geography so you can compare where the word appears.'
                  : 'The view expands outward from a root and reveals descendant branches as you explore.'}
            </p>
          </div>

          <div>
            <div className={isLight ? 'text-xs font-semibold uppercase tracking-[0.28em] text-blue-700' : 'text-xs font-semibold uppercase tracking-[0.28em] text-slate-400'}>
              How to use it
            </div>
            <p className={isLight ? 'mt-2 text-sm leading-6 text-slate-600' : 'mt-2 text-sm leading-6 text-slate-300'}>
              {selectedLayer === 'etymology'
                ? 'Use the timeline scrubber to step through each node or press play to watch the path animate.'
                : selectedLayer === 'translations'
                  ? 'Hover the markers and open popups to compare the spread across regions.'
                  : 'Click into branches to reveal deeper descendant paths and inspect the structure.'}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            onClick={onRestart}
            className={isLight ? 'rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-blue-300 hover:bg-slate-50' : 'rounded-full border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800'}
          >
            Choose another layer
          </button>
          <button
            onClick={onCloseGuide}
            className={isLight ? 'rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500' : 'rounded-full bg-slate-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-200'}
          >
            Start exploring
          </button>
        </div>
      </div>

      <div className={isLight ? 'min-h-0 space-y-4 overflow-y-auto bg-slate-50 px-4 py-4 sm:px-6 sm:py-6' : 'min-h-0 space-y-4 overflow-y-auto bg-slate-950/80 px-4 py-4 sm:px-6 sm:py-6'}>
        <div className={isLight ? 'overflow-hidden rounded-2xl border border-slate-200 bg-white p-3' : 'overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 p-3'}>
          <div className={isLight ? 'relative aspect-video w-full overflow-hidden rounded-xl border border-blue-200 bg-slate-950 shadow-lg shadow-blue-100/50' : 'relative aspect-video w-full overflow-hidden rounded-xl border border-slate-700/80 bg-slate-950 shadow-lg shadow-black/30'}>
            <video
              src={getSelectedPreviewVideo(selectedLayer)}
              aria-label={`${selected.title} preview video`}
              className="h-full w-full object-cover"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
            />
            <div className={isLight ? 'absolute inset-0 bg-[linear-gradient(to_top,rgba(248,250,252,0.08),rgba(15,23,42,0.05))]' : 'absolute inset-0 bg-[linear-gradient(to_top,rgba(2,6,23,0.18),rgba(2,6,23,0.04))]'} />
            <div className={isLight ? 'absolute left-4 top-4 inline-flex rounded-full border border-blue-200 bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-blue-700 shadow-sm' : 'absolute left-4 top-4 inline-flex rounded-full border border-slate-600/80 bg-slate-950/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-200 shadow-sm'}>
              Preview video
            </div>
            <div className={isLight ? 'absolute bottom-4 left-4 right-4 rounded-2xl border border-white/70 bg-white/88 px-3 py-2 text-sm leading-6 text-slate-700 shadow-lg shadow-slate-200/40' : 'absolute bottom-4 left-4 right-4 rounded-2xl border border-slate-700/80 bg-slate-950/80 px-3 py-2 text-sm leading-6 text-slate-200 shadow-lg shadow-black/30'}>
              A short animated preview for the selected layer.
            </div>
          </div>
        </div>
      </div>
    </div>
  ) : recommendationLoading ? (
    <div className="flex min-h-[22rem] items-center justify-center px-4 py-10 sm:px-6 sm:py-12">
      <div className={isLight ? 'w-full max-w-xl rounded-3xl border border-slate-200 bg-white px-6 py-6 shadow-xl shadow-blue-100/50' : 'w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-900/85 px-6 py-6 shadow-xl shadow-black/30'}>
        <div className="flex items-start gap-4">
          <div className={isLight ? 'mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-blue-200 bg-blue-50' : 'mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-950'}>
            <motion.div
              className={isLight ? 'h-5 w-5 rounded-full border-2 border-blue-600 border-t-transparent' : 'h-5 w-5 rounded-full border-2 border-slate-200 border-t-transparent'}
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className={isLight ? 'text-[11px] font-semibold uppercase tracking-[0.34em] text-blue-700/80' : 'text-[11px] font-semibold uppercase tracking-[0.34em] text-slate-400'}>
              Guide mode
            </p>
            <h3 className={isLight ? 'mt-2 text-2xl font-semibold tracking-tight text-slate-900' : 'mt-2 text-2xl font-semibold tracking-tight text-white'}>
              Calculating best layer recommendation...
            </h3>
            <p className={isLight ? 'mt-3 text-sm leading-6 text-slate-600' : 'mt-3 text-sm leading-6 text-slate-300'}>
              We’re loading the word data so the guide can pick the right first layer.
            </p>
          </div>
        </div>
      </div>
    </div>
  ) : (
    <div className="min-h-0 space-y-4 px-4 py-4 sm:px-6 sm:py-6">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {layerOrder.map(layer => {
          const info = guideLayers[layer]
          const ready = availability[layer]
          const isRecommended = layer === recommendedLayer
          const disabled = !ready
          return (
            <GuideLayerCard
              key={layer}
              layer={layer}
              info={info}
              isLight={isLight}
              disabled={disabled}
              selected={selectedLayer === layer}
              isRecommended={isRecommended}
              recommendationTooltip={recommendationTooltip}
              hoveredRecommendation={hoveredRecommendation}
              setHoveredRecommendation={setHoveredRecommendation}
              onChooseLayer={onChooseLayer}
            />
          )
        })}
      </div>
    </div>
  )

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          data-map-ui-overlay="true"
          className={isLight ? 'absolute inset-0 z-[12000] flex items-start justify-center overflow-y-auto bg-slate-900/15 px-3 py-3 backdrop-blur-sm sm:items-center sm:px-6 sm:py-6 lg:px-10 lg:py-8' : 'absolute inset-0 z-[12000] flex items-start justify-center overflow-y-auto bg-slate-950/75 px-3 py-3 backdrop-blur-sm sm:items-center sm:px-6 sm:py-6 lg:px-10 lg:py-8'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
        >
          <motion.div
            ref={dialogRef}
            tabIndex={-1}
            className={isLight ? 'flex w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white/97 shadow-2xl shadow-blue-100/60 max-h-[calc(100vh-1rem)] sm:max-h-[calc(100vh-2rem)] lg:max-h-[calc(100vh-3rem)] lg:min-h-[38rem]' : 'flex w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-700/80 bg-neutral-950/95 shadow-2xl shadow-black/30 max-h-[calc(100vh-1rem)] sm:max-h-[calc(100vh-2rem)] lg:max-h-[calc(100vh-3rem)] lg:min-h-[38rem]'}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.85 }}
          >
            <div className={isLight ? 'shrink-0 border-b border-slate-200 bg-gradient-to-r from-white via-slate-50 to-slate-100 px-4 py-4 sm:px-6 sm:py-5' : 'shrink-0 border-b border-slate-800/80 bg-gradient-to-r from-neutral-950 via-slate-900 to-slate-800/70 px-4 py-4 sm:px-6 sm:py-5'}>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="max-w-3xl">
                  <p className={isLight ? 'text-[11px] font-semibold uppercase tracking-[0.38em] text-blue-700/80' : 'text-[11px] font-semibold uppercase tracking-[0.38em] text-slate-300/80'}>
                    Guide mode
                  </p>
                  <h2 className={isLight ? 'mt-2 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl' : 'mt-2 text-3xl font-semibold tracking-tight text-white md:text-4xl'}>
                    Choose the first layer to explore
                  </h2>
                </div>
                <button
                  onClick={onClose}
                  className={isLight ? 'inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-blue-300 hover:bg-slate-50' : 'inline-flex items-center justify-center rounded-full border border-slate-700/80 bg-slate-900/80 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800'}
                >
                  Skip guide
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto lg:min-h-[28rem]">
              {bodyContent}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default GeospatialGuideOverlay