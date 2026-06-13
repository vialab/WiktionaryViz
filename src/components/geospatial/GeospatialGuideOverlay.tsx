import { FC, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

export type GuideLayerKey = 'translations' | 'etymology' | 'descendants' | 'protoZones' | 'families'

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
  protoZones: {
    title: 'Proto-language zones',
    summary: 'Proto regions give broad historical context for where a family may have been centered.',
    bestFor: 'Getting a wide historical geography before drilling into a specific path.',
    steps: [
      'Pick this when you want a geography-first introduction before digging into the lineage.',
      'Compare the proto region with the lineage and translation layers for broader context.',
    ],
      accent: 'from-violet-400/20 via-slate-400/10 to-slate-900',
  },
  families: {
    title: 'Language families',
    summary: 'Family bubbles provide a higher-level structural view of the map and its clusters.',
    bestFor: 'Orienting yourself with the broadest map structure first.',
    steps: [
      'This is the broadest starting point if you want to orient yourself before drilling down.',
      'Use the family context to narrow your search before switching to a specific path layer.',
    ],
      accent: 'from-fuchsia-400/20 via-slate-400/10 to-slate-900',
  },
}

interface Props {
  open: boolean
  selectedLayer: GuideLayerKey | null
  recommendedLayer: GuideLayerKey | null
  recommendationReason: string
  availability: Record<GuideLayerKey, boolean>
  onChooseLayer: (layer: GuideLayerKey) => void
  onCloseGuide: () => void
  onClose: () => void
  onRestart: () => void
}

const layerOrder: GuideLayerKey[] = ['translations', 'etymology', 'descendants', 'protoZones', 'families']

const GeospatialGuideOverlay: FC<Props> = ({
  open,
  selectedLayer,
  recommendedLayer,
  recommendationReason,
  availability,
  onChooseLayer,
  onCloseGuide,
  onClose,
  onRestart,
}) => {
  const selected = selectedLayer ? guideLayers[selectedLayer] : null
  const [hoveredRecommendation, setHoveredRecommendation] = useState<GuideLayerKey | null>(null)

  const recommendationTooltip =
    hoveredRecommendation != null ? recommendationReason : null

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-[12000] flex items-center justify-center bg-slate-950/75 px-6 py-6 backdrop-blur-sm sm:px-8 sm:py-8 lg:px-12 lg:py-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
        >
          <motion.div
            className="flex min-h-[36rem] max-h-[calc(100vh-3rem)] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-700/80 bg-neutral-950/95 shadow-2xl shadow-black/30 sm:max-h-[calc(100vh-4rem)] lg:max-h-[calc(100vh-5rem)] lg:min-h-[38rem]"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.85 }}
          >
            <div className="shrink-0 border-b border-slate-800/80 bg-gradient-to-r from-neutral-950 via-slate-900 to-slate-800/70 px-4 py-4 sm:px-6 sm:py-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="max-w-3xl">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.38em] text-slate-300/80">
                    Guide mode
                  </p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white md:text-4xl">
                    Choose the first layer to explore
                  </h2>
                </div>
                <button
                  onClick={onClose}
                  className="inline-flex items-center justify-center rounded-full border border-slate-700/80 bg-slate-900/80 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800"
                >
                  Skip guide
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto lg:min-h-[28rem]">
              {!selected ? (
                <div className="space-y-4 px-4 py-4 sm:px-6 sm:py-6">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {layerOrder.map(layer => {
                      const info = guideLayers[layer]
                      const ready = availability[layer]
                      const isRecommended = layer === recommendedLayer
                      return (
                        <button
                          key={layer}
                          onClick={() => onChooseLayer(layer)}
                          disabled={!ready}
                          className="group rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-left transition hover:border-slate-400 hover:bg-slate-800/90"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-lg font-semibold text-white">{info.title}</div>
                            {isRecommended && (
                              <div className="relative">
                                <span
                                  className="rounded-full border border-slate-300/60 bg-slate-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-200"
                                  onMouseEnter={() => setHoveredRecommendation(layer)}
                                  onMouseLeave={() => setHoveredRecommendation(null)}
                                >
                                  Recommended
                                </span>
                                {hoveredRecommendation === layer && recommendationTooltip && (
                                  <div className="pointer-events-none absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border border-slate-700 bg-slate-950/95 px-3 py-2 text-left text-xs leading-5 text-slate-200 shadow-xl shadow-black/30">
                                    {recommendationTooltip}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          <p className="mt-3 text-sm leading-6 text-slate-300">{info.summary}</p>
                          <div className="mt-3 max-h-0 overflow-hidden text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 opacity-0 transition-all duration-200 ease-out group-hover:max-h-6 group-hover:opacity-100">
                            Best for
                          </div>
                          <p className="max-h-0 overflow-hidden text-sm leading-6 text-slate-200 opacity-0 transition-all duration-200 ease-out group-hover:mt-1 group-hover:max-h-20 group-hover:opacity-100">
                            {info.bestFor}
                          </p>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
                  <div className="border-b border-slate-800/80 px-4 py-4 sm:px-6 sm:py-6 lg:border-b-0 lg:border-r">
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
                      Selected layer
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <h3 className="text-2xl font-semibold text-white">{selected.title}</h3>
                      {selectedLayer === recommendedLayer && (
                        <div className="relative">
                          <span
                            className="inline-flex rounded-full border border-slate-300/60 bg-slate-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-200"
                            onMouseEnter={() => setHoveredRecommendation(selectedLayer)}
                            onMouseLeave={() => setHoveredRecommendation(null)}
                          >
                            Recommended for this word
                          </span>
                          {hoveredRecommendation === selectedLayer && recommendationTooltip && (
                            <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 w-64 rounded-xl border border-slate-700 bg-slate-950/95 px-3 py-2 text-left text-xs leading-5 text-slate-200 shadow-xl shadow-black/30">
                              {recommendationTooltip}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <p className="mt-4 text-sm leading-6 text-slate-300">{selected.summary}</p>
                    <div className="mt-3 text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
                      Best for
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-200">{selected.bestFor}</p>

                    <div className="mt-5 space-y-4">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
                          How it works
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-300">
                          {selectedLayer === 'etymology'
                            ? 'The lineage animates node by node, showing how the word changes across time.'
                            : selectedLayer === 'translations'
                              ? 'Translations are grouped by geography so you can compare where the word appears.'
                              : selectedLayer === 'descendants'
                                ? 'The view expands outward from a root and reveals descendant branches as you explore.'
                                : selectedLayer === 'protoZones'
                                  ? 'The proto-zone layer frames the lineage inside a broader historical region.'
                                  : 'The family layer groups languages into broader families for a higher-level view.'}
                        </p>
                      </div>

                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
                          How to use it
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-300">
                          {selectedLayer === 'etymology'
                            ? 'Use the timeline scrubber to step through each node or press play to watch the path animate.'
                            : selectedLayer === 'translations'
                              ? 'Hover the markers and open popups to compare the spread across regions.'
                              : selectedLayer === 'descendants'
                                ? 'Click into branches to reveal deeper descendant paths and inspect the structure.'
                                : selectedLayer === 'protoZones'
                                  ? 'Compare the backdrop with the active lineage to understand the broader setting.'
                                  : 'Use the family overview first, then switch to a more specific layer when you want detail.'}
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-3">
                      <button
                        onClick={onRestart}
                        className="rounded-full border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800"
                      >
                        Choose another layer
                      </button>
                      <button
                        onClick={onCloseGuide}
                        className="rounded-full bg-slate-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
                      >
                        Start exploring
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4 bg-slate-950/80 px-4 py-4 sm:px-6 sm:py-6">
                    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 p-3">
                      <div className="flex aspect-[4/3] w-full items-center justify-center rounded-xl border border-dashed border-slate-600/80 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.14),rgba(15,23,42,0.95))] px-4 text-center">
                        <div>
                          <div className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-300/90">
                            Preview demo gif
                          </div>
                          <div className="mt-3 text-sm leading-6 text-slate-300">
                            This space will later show a short preview of the layer in action.
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default GeospatialGuideOverlay