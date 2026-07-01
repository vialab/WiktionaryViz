import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, Sparkles } from 'lucide-react'
import useFocusTrap from '@/hooks/useFocusTrap'

export interface CommandPaletteAction {
  id: string
  label: string
  description: string
  group: string
  keywords?: string[]
  disabled?: boolean
  onSelect: () => void
}

interface CommandPaletteProps {
  open: boolean
  actions: CommandPaletteAction[]
  onClose: () => void
  theme?: 'dark' | 'light'
}

const normalize = (value: string) => value.trim().toLowerCase()

const CommandPalette: React.FC<CommandPaletteProps> = ({ open, actions, onClose, theme = 'dark' }) => {
  const isLight = theme === 'light'
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const dialogRef = useRef<HTMLDivElement | null>(null)

  useFocusTrap(open, dialogRef)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
  }, [open])

  const filteredActions = useMemo(() => {
    const normalizedQuery = normalize(query)
    const tokens = normalizedQuery.split(/\s+/).filter(Boolean)

    const scored = actions
      .map(action => {
        const haystack = normalize([
          action.label,
          action.description,
          action.group,
          ...(action.keywords ?? []),
        ].join(' '))

        if (!normalizedQuery) {
          return { action, score: 0 }
        }

        if (!tokens.every(token => haystack.includes(token))) {
          return { action, score: Number.POSITIVE_INFINITY }
        }

        const label = normalize(action.label)
        let score = 20

        if (label === normalizedQuery) score -= 10
        else if (label.startsWith(normalizedQuery)) score -= 6
        else if (label.includes(normalizedQuery)) score -= 3

        tokens.forEach(token => {
          if (label.startsWith(token)) score -= 1
          else if (label.includes(token)) score -= 0.5
        })

        return { action, score }
      })
      .filter(entry => Number.isFinite(entry.score))
      .sort((left, right) => left.score - right.score || left.action.label.localeCompare(right.action.label))

    return scored.map(entry => entry.action)
  }, [actions, query])

  useEffect(() => {
    if (!filteredActions.length) {
      setActiveIndex(0)
      return
    }

    setActiveIndex(current => Math.min(current, filteredActions.length - 1))
  }, [filteredActions])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (!filteredActions.length) return

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex(current => (current + 1) % filteredActions.length)
        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex(current => (current - 1 + filteredActions.length) % filteredActions.length)
        return
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        const action = filteredActions[activeIndex]
        if (!action || action.disabled) return
        onClose()
        action.onSelect()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [activeIndex, filteredActions, onClose, open])

  const handleSelect = (action: CommandPaletteAction) => {
    if (action.disabled) return
    onClose()
    action.onSelect()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          className={isLight
            ? 'fixed inset-0 z-[12050] flex items-start justify-center bg-slate-950/20 px-4 py-6 backdrop-blur-sm sm:px-6 sm:py-10'
            : 'fixed inset-0 z-[12050] flex items-start justify-center bg-black/60 px-4 py-6 backdrop-blur-sm sm:px-6 sm:py-10'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
        >
          <motion.div
            ref={dialogRef}
            tabIndex={-1}
            className={isLight
              ? 'flex max-h-[calc(100vh-3rem)] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white/98 shadow-2xl shadow-blue-100/60'
              : 'flex max-h-[calc(100vh-3rem)] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-700/80 bg-slate-950/96 shadow-2xl shadow-black/30'}
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.85 }}
          >
            <div className={isLight ? 'border-b border-slate-200 bg-gradient-to-r from-white via-slate-50 to-slate-100 px-4 py-4 sm:px-5' : 'border-b border-slate-800/80 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800/70 px-4 py-4 sm:px-5'}>
              <div className="flex items-start gap-3">
                <div className={isLight ? 'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 text-blue-700' : 'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 text-slate-100'}>
                  <Sparkles size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className={isLight ? 'text-[11px] font-semibold uppercase tracking-[0.34em] text-blue-700/80' : 'text-[11px] font-semibold uppercase tracking-[0.34em] text-slate-400'}>
                    Command palette
                  </div>
                  <p className={isLight ? 'mt-1 text-sm leading-6 text-slate-600' : 'mt-1 text-sm leading-6 text-slate-300'}>
                    Search map actions, layers, and view controls.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className={isLight ? 'rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-blue-300 hover:bg-slate-50 hover:text-slate-900' : 'rounded-full border border-slate-700/80 bg-slate-900/80 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-500 hover:bg-slate-800 hover:text-white'}
                  aria-label="Close command palette"
                >
                  Close
                </button>
              </div>

              <div className={isLight ? 'mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm' : 'mt-4 flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 shadow-sm'}>
                <Search size={18} className={isLight ? 'shrink-0 text-slate-400' : 'shrink-0 text-slate-500'} />
                <input
                  autoFocus
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="Type to filter commands"
                  aria-label="Search commands"
                  className={isLight ? 'w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none' : 'w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none'}
                />
                <span className={isLight ? 'rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500' : 'rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400'}>
                  {filteredActions.length}
                </span>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 sm:px-3">
              {filteredActions.length ? (
                <div className="grid gap-1">
                  {filteredActions.map((action, index) => {
                    const active = index === activeIndex
                    return (
                      <button
                        key={action.id}
                        type="button"
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => handleSelect(action)}
                        disabled={action.disabled}
                        aria-disabled={action.disabled}
                        className={active
                          ? (isLight
                            ? 'flex items-start gap-3 rounded-2xl border border-blue-300 bg-blue-50 px-4 py-3 text-left transition'
                            : 'flex items-start gap-3 rounded-2xl border border-sky-400/40 bg-sky-500/12 px-4 py-3 text-left transition')
                          : (isLight
                            ? 'flex items-start gap-3 rounded-2xl border border-transparent px-4 py-3 text-left transition hover:border-slate-200 hover:bg-slate-50'
                            : 'flex items-start gap-3 rounded-2xl border border-transparent px-4 py-3 text-left transition hover:border-slate-700 hover:bg-slate-900/70')}
                      >
                        <div className="min-w-0 flex-1">
                          <div className={isLight ? 'text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400' : 'text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500'}>
                            {action.group}
                          </div>
                          <div className={isLight ? 'mt-1 text-base font-semibold text-slate-900' : 'mt-1 text-base font-semibold text-white'}>
                            {action.label}
                          </div>
                          <p className={isLight ? 'mt-1 text-sm leading-6 text-slate-600' : 'mt-1 text-sm leading-6 text-slate-300'}>
                            {action.description}
                          </p>
                        </div>
                        <div className={isLight ? 'mt-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500' : 'mt-1 rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400'}>
                          {action.disabled ? 'Unavailable' : 'Run'}
                        </div>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className={isLight ? 'flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-sm text-slate-500' : 'flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 px-6 py-12 text-sm text-slate-400'}>
                  No commands match your search.
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default CommandPalette