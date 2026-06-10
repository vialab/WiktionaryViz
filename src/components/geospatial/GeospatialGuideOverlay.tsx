import { FC } from 'react'

export type GuideLayerKey = 'translations' | 'etymology' | 'descendants' | 'protoZones' | 'families'

type GuideLayerInfo = {
  title: string
  summary: string
  steps: [string, string]
}

const guideLayers: Record<GuideLayerKey, GuideLayerInfo> = {
  translations: {
    title: 'Translations',
    summary: 'Marker clusters show where the current word appears in the translation map.',
    steps: [
      'Start here if you want the quickest overview of where the word lands geographically.',
      'Hover markers to inspect the translation popups and compare clusters.',
    ],
  },
  etymology: {
    title: 'Etymology lineage path',
    summary: 'This path walks backward through ancestors and highlights the active timeline node.',
    steps: [
      'Use this when you want to trace the word through time and see how the lineage unfolds.',
      'Use the timeline scrubber to step through the path or play the sequence automatically.',
    ],
  },
  descendants: {
    title: 'Descendant paths',
    summary: 'This layer expands outward from a root candidate and reveals branching descendants.',
    steps: [
      'Choose this if you want to inspect the family tree structure instead of the backward lineage.',
      'Click into deeper branches to expand more descendant paths and compare the branches.',
    ],
  },
  protoZones: {
    title: 'Proto-language zones',
    summary: 'Proto regions give broad historical context for where a family may have been centered.',
    steps: [
      'Pick this when you want a geography-first introduction before digging into the lineage.',
      'Compare the proto region with the lineage and translation layers for broader context.',
    ],
  },
  families: {
    title: 'Language families',
    summary: 'Family bubbles provide a higher-level structural view of the map and its clusters.',
    steps: [
      'This is the broadest starting point if you want to orient yourself before drilling down.',
      'Use the family context to narrow your search before switching to a specific path layer.',
    ],
  },
}

interface Props {
  open: boolean
  selectedLayer: GuideLayerKey | null
  stepIndex: number
  onChooseLayer: (layer: GuideLayerKey) => void
  onNextStep: () => void
  onClose: () => void
  onRestart: () => void
}

const layerOrder: GuideLayerKey[] = ['translations', 'etymology', 'descendants', 'protoZones', 'families']

const GeospatialGuideOverlay: FC<Props> = ({
  open,
  selectedLayer,
  stepIndex,
  onChooseLayer,
  onNextStep,
  onClose,
  onRestart,
}) => {
  if (!open) return null

  const selected = selectedLayer ? guideLayers[selectedLayer] : null
  const currentStep = selected ? selected.steps[Math.min(stepIndex, selected.steps.length - 1)] : null

  return (
    <div className="absolute inset-0 z-[12000] flex items-center justify-center bg-slate-950/75 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-700/80 bg-slate-950/95 shadow-2xl shadow-cyan-950/30">
        <div className="border-b border-slate-800/80 bg-gradient-to-r from-slate-950 via-slate-900 to-cyan-950/50 px-6 py-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.38em] text-cyan-300/80">
                Guide mode
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white md:text-4xl">
                Choose the first layer to explore
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-300 md:text-base">
                Pick a layer and the map will focus it for you, then walk you through what it shows.
              </p>
            </div>
            <button
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-full border border-slate-700/80 bg-slate-900/80 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800"
            >
              Skip guide
            </button>
          </div>
        </div>

        {!selected ? (
          <div className="px-6 py-6">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {layerOrder.map(layer => {
                const info = guideLayers[layer]
                return (
                  <button
                    key={layer}
                    onClick={() => onChooseLayer(layer)}
                    className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-left transition hover:border-cyan-400 hover:bg-slate-800/90"
                  >
                    <div className="text-lg font-semibold text-white">{info.title}</div>
                    <p className="mt-3 text-sm leading-6 text-slate-300">{info.summary}</p>
                    <div className="mt-4 text-sm font-medium text-cyan-300">Start with this layer</div>
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="grid gap-0 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="border-b border-slate-800/80 px-6 py-6 lg:border-b-0 lg:border-r">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
                    Selected layer
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold text-white">{selected.title}</h3>
                </div>
                <div className="text-right text-sm text-slate-400">
                  Step {Math.min(stepIndex + 1, selected.steps.length)} of {selected.steps.length}
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
                <h4 className="text-xl font-semibold text-white">
                  {stepIndex === 0 ? 'What you are looking at' : 'How to keep going'}
                </h4>
                <p className="mt-3 text-sm leading-6 text-slate-300">{currentStep}</p>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  onClick={onRestart}
                  className="rounded-full border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800"
                >
                  Choose another layer
                </button>
                <button
                  onClick={onNextStep}
                  className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                >
                  {stepIndex === 0 ? 'Continue' : 'Finish guide'}
                </button>
              </div>
            </div>

            <div className="space-y-4 bg-slate-950/80 px-6 py-6">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
                  What to expect
                </p>
                <p className="mt-3 text-sm leading-6 text-slate-300">{selected.summary}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
                  Guide steps
                </p>
                <ol className="mt-3 space-y-3 text-sm leading-6 text-slate-300">
                  {selected.steps.map((step, index) => (
                    <li key={step} className="flex gap-3">
                      <span
                        className={`mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full border text-[11px] font-semibold ${
                          index === stepIndex
                            ? 'border-cyan-300 bg-cyan-400 text-slate-950'
                            : index < stepIndex
                              ? 'border-emerald-400 bg-emerald-400/20 text-emerald-200'
                              : 'border-slate-700 bg-slate-900 text-slate-400'
                        }`}
                      >
                        {index + 1}
                      </span>
                      <div>
                        <div className="font-medium text-white">{step}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default GeospatialGuideOverlay