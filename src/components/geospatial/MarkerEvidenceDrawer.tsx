import { FC } from 'react'
import { ExternalLink, X } from 'lucide-react'

interface MarkerEvidenceDrawerProps {
  open: boolean
  sourceKind: 'translation-marker' | 'lineage-node' | 'descendant-node' | 'none'
  word: string
  language: string
  wiktionaryUrl: string
  onClose: () => void
  theme?: 'dark' | 'light'
}

const MarkerEvidenceDrawer: FC<MarkerEvidenceDrawerProps> = ({
  open,
  sourceKind,
  word,
  language,
  wiktionaryUrl,
  onClose,
  theme = 'dark',
}) => {
  const isLight = theme === 'light'

  if (!open) return null

  return (
    <aside
      aria-label="Marker evidence drawer"
      className={isLight
        ? 'fixed right-4 top-4 z-[11500] flex h-[calc(100vh-2rem)] w-[min(30rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white text-slate-900 shadow-2xl shadow-slate-200/50 backdrop-blur'
        : 'fixed right-4 top-4 z-[11500] flex h-[calc(100vh-2rem)] w-[min(30rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-slate-700/80 bg-slate-950 text-slate-100 shadow-2xl shadow-black/40 backdrop-blur'}
    >
      <div className={isLight ? 'border-b border-slate-200 bg-slate-50 px-4 py-3' : 'border-b border-slate-800 bg-slate-900/80 px-4 py-3'}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={isLight ? 'text-[11px] font-semibold uppercase tracking-[0.34em] text-blue-700/80' : 'text-[11px] font-semibold uppercase tracking-[0.34em] text-slate-400'}>
              {sourceKind === 'lineage-node'
                ? 'Etymology evidence'
                : sourceKind === 'descendant-node'
                  ? 'Descendant evidence'
                  : 'Evidence drawer'}
            </p>
            <h2 className={isLight ? 'mt-2 truncate text-xl font-semibold text-slate-900' : 'mt-2 truncate text-xl font-semibold text-white'}>
              {word}
            </h2>
            <p className={isLight ? 'mt-1 text-sm text-slate-600' : 'mt-1 text-sm text-slate-300'}>
              {language}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={isLight
              ? 'inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-300 bg-white text-slate-700 transition hover:border-blue-300 hover:bg-slate-50'
              : 'inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 text-slate-200 transition hover:border-slate-500 hover:bg-slate-800'}
            aria-label="Close evidence drawer"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={wiktionaryUrl}
            target="_blank"
            rel="noreferrer"
            className={isLight
              ? 'inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 transition hover:border-blue-300 hover:bg-blue-100'
              : 'inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm font-medium text-slate-100 transition hover:border-slate-500 hover:bg-slate-800'}
          >
            Open in new tab
            <ExternalLink size={14} aria-hidden="true" />
          </a>
          <span className={isLight ? 'inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs text-slate-500' : 'inline-flex items-center rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-400'}>
            Mini browser preview
          </span>
        </div>
      </div>

      <div className={isLight ? 'min-h-0 flex-1 bg-white' : 'min-h-0 flex-1 bg-slate-950'}>
        <iframe
          title={`Wiktionary page for ${word}`}
          src={wiktionaryUrl}
          className="h-full w-full border-0"
          loading="lazy"
        />
      </div>

      <div className={isLight ? 'border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500' : 'border-t border-slate-800 bg-slate-900/80 px-4 py-3 text-xs leading-5 text-slate-400'}>
        If the page does not render inside the drawer, use the open-in-new-tab link to browse the page directly.
      </div>
    </aside>
  )
}

export default MarkerEvidenceDrawer
