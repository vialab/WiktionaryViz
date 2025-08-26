import React, { useMemo, useRef } from 'react'
import type { EtymologyNode } from '@/types/etymology'
import { flattenLineage } from '@/utils/mapUtils'
import { useMap } from 'react-leaflet'

interface TimelineScrubberProps {
  lineage: EtymologyNode | null
  currentIndex?: number
  onChange: (index: number | undefined) => void
  // Playback additions
  isPlaying?: boolean
  onTogglePlay?: () => void
  speed?: number // ms per step
  onSpeedChange?: (ms: number) => void
  loop?: boolean
  onToggleLoop?: () => void
  onReset?: () => void // full reset (stop + show full)
}

// Simple horizontal scrubber with markers for each node.
const TimelineScrubber: React.FC<TimelineScrubberProps> = ({
  lineage,
  currentIndex,
  onChange,
  isPlaying = false,
  onTogglePlay,
  speed = 800,
  onSpeedChange,
  loop = true,
  onToggleLoop,
  onReset,
}) => {
  // TODO (Playback Pause Enhancement): Add a configurable inter-step pause (e.g., base speed for line growth + pause duration) so each node lingers briefly before advancing.
  // TODO (Auto Tooltips): During playback, automatically open the Leaflet popup (or a custom tooltip overlay) for the active node when the pause begins; close it when advancing.
  // TODO (Hide Previous Tooltip): Ensure previously opened popup closes before showing the next to avoid stacking, unless at final reveal stage.
  // TODO (Final Summary Tooltips): After playback reaches the end (and not looping), optionally open all node tooltips simultaneously (or present a summary panel) to satisfy "show all tooltips at end" requirement.
  // TODO (API Extension): Expose callbacks (onStepShow / onStepHide / onComplete) so parent (GeospatialPage) can orchestrate tooltip state and final reveal.
  // TODO (Accessibility): Announce active node change via aria-live region for screen readers during autoplay.
  const nodes = useMemo(() => flattenLineage(lineage), [lineage])
  const maxIndex = nodes.length ? nodes.length - 1 : 0
  const map = useMap()
  const restoreRef = useRef<{ drag: boolean; scroll: boolean } | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const handleRange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10)
    onChange(Number.isNaN(value) ? undefined : value)
  }

  const handleReset = () => {
    if (onReset) onReset()
    else onChange(undefined)
  }

  // Do not early-return before hooks (lint compliance); handle empty case in render.

  const handlePointerEnter = () => {
    if (!map || restoreRef.current) return
    restoreRef.current = {
      drag: map.dragging?.enabled?.() ?? false,
      scroll: map.scrollWheelZoom?.enabled?.() ?? false,
    }
    map.dragging?.disable()
    map.scrollWheelZoom?.disable()
  }

  const handlePointerLeave = () => {
    if (!map) return
    const prev = restoreRef.current
    if (prev) {
      if (prev.drag) map.dragging?.enable()
      if (prev.scroll) map.scrollWheelZoom?.enable()
    } else {
      // fallback: enable basics
      map.dragging?.enable()
      map.scrollWheelZoom?.enable()
    }
    restoreRef.current = null
  }

  const stop = (e: React.SyntheticEvent) => {
    e.stopPropagation()
  }

  if (!nodes.length) return null
  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 bottom-2 z-[600] w-[72%] max-w-4xl px-4 pt-3 pb-5 bg-slate-800/80 backdrop-blur rounded border border-slate-600/60 shadow-lg space-y-2 text-xs select-none"
      style={{ pointerEvents: 'auto' }}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onMouseDown={stop}
      onWheel={stop}
      onClick={stop}
      ref={containerRef}
    >
      <div className="flex items-center justify-between text-slate-300 gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            onClick={onTogglePlay}
            className="px-2 py-1 rounded bg-slate-700/60 hover:bg-slate-600 text-slate-200 text-xs font-medium border border-slate-500/50"
            title={isPlaying ? 'Pause playback' : 'Play lineage'}
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <label className="flex items-center gap-1 text-[11px] text-slate-400">
            Speed
            <select
              value={speed}
              onChange={e => onSpeedChange?.(parseInt(e.target.value, 10))}
              className="bg-slate-700/60 border border-slate-500/50 rounded px-1 py-0.5 text-slate-200 text-xs focus:outline-none"
            >
              <option value={1200}>Slow</option>
              <option value={800}>Normal</option>
              <option value={450}>Fast</option>
              <option value={220}>Ultra</option>
            </select>
          </label>
          <button
            onClick={onToggleLoop}
            className={`px-2 py-1 rounded text-xs font-medium border ${loop ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300' : 'bg-slate-700/60 border-slate-500/50 text-slate-300 hover:bg-slate-600'}`}
            title={loop ? 'Loop enabled (click to disable)' : 'Loop disabled (click to enable)'}
          >
            Loop
          </button>
        </div>
        <div className="flex items-center gap-3 ml-auto">
          <button
            onClick={handleReset}
            className="text-slate-400 hover:text-slate-200 transition"
            title="Show full lineage"
          >
            Full
          </button>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div
          className="flex-1 relative select-none"
          ref={trackRef}
          onMouseDown={e => {
            e.stopPropagation()
            if (!trackRef.current) return
            const rect = trackRef.current.getBoundingClientRect()
            const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
            const idx = Math.round(ratio * maxIndex)
            onChange(idx)
          }}
        >
          {/* Custom track */}
          <div className="h-2 w-full rounded-full bg-slate-600/40 overflow-hidden">
            {(() => {
              const progress = ((currentIndex ?? maxIndex) / (maxIndex || 1)) * 100
              interface ExtendedStyle extends React.CSSProperties {
                ['--play-speed']?: string
              }
              const style: ExtendedStyle = {
                width: `${progress}%`,
                ['--play-speed']: `${speed}ms`,
              }
              return (
                <div
                  className={`h-full bg-cyan-400/70 ${isPlaying ? 'transition-[width] duration-[var(--play-speed)] linear' : ''}`}
                  style={style}
                />
              )
            })()}
          </div>
          {/* Ticks */}
          <div className="absolute left-0 top-full mt-1 h-4 w-full pointer-events-none pr-px">
            {nodes.map((n, i) => {
              const pct = maxIndex === 0 ? 0 : (i / maxIndex) * 100
              const active = currentIndex === undefined || i <= currentIndex
              return (
                <div
                  key={i}
                  className={`absolute -translate-x-1/2 w-[2px] h-4 ${active ? 'bg-cyan-400' : 'bg-slate-600'}`}
                  style={{ left: `${pct}%` }}
                  title={`${n.word} (${n.lang_code})`}
                />
              )
            })}
          </div>
          {/* Thumb */}
          <div
            className="absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-cyan-400 border-2 border-cyan-300 shadow -translate-x-1/2 cursor-grab active:cursor-grabbing"
            style={{ left: `${((currentIndex ?? maxIndex) / (maxIndex || 1)) * 100}%` }}
            onMouseDown={e => {
              e.stopPropagation()
              const rect = trackRef.current?.getBoundingClientRect()
              if (!rect) return
              const move = (ev: MouseEvent) => {
                const dx = ev.clientX - rect.left
                const ratio = Math.min(1, Math.max(0, dx / rect.width))
                onChange(Math.round(ratio * maxIndex))
              }
              const up = () => {
                window.removeEventListener('mousemove', move)
                window.removeEventListener('mouseup', up)
              }
              window.addEventListener('mousemove', move)
              window.addEventListener('mouseup', up)
            }}
          />
          {/* Invisible native range for accessibility & keyboard */}
          <input
            ref={inputRef}
            type="range"
            min={0}
            max={maxIndex}
            step={1}
            value={currentIndex ?? maxIndex}
            onChange={handleRange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>
        <div className="w-28 text-right">
          {currentIndex === undefined ? (
            <span className="text-slate-400">All ({nodes.length})</span>
          ) : (
            <span className="text-cyan-300">
              {currentIndex + 1} / {nodes.length}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default TimelineScrubber
