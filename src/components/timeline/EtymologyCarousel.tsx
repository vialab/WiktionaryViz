import React, { useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { NodeData } from './useTimelineData';

const CARD_WIDTH = 260;
const CARD_GAP = 32;

interface EtymologyCarouselProps {
  cards: NodeData[];
  onFocusChange: (index: number) => void;
}

export const EtymologyCarousel: React.FC<EtymologyCarouselProps> = ({ cards, onFocusChange }) => {
  // Reverse the cards so the furthest ancestor is first
  const reversedCards = [...cards].reverse();
  const [focusIdx, setFocusIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  // Padding to keep focused card centered at edges
  const EDGE_PADDING = (CARD_WIDTH + CARD_GAP) * 1.5;

  // Helper for drift bar color (red intensity for higher drift)
  function driftBarColor(drift: number) {
    // Drift 0 = gray, drift >0 = interpolate from gold to red
    if (drift === 0) return '#B79F58';
    // Clamp drift for color scaling
    const maxDrift = 20;
    const t = Math.min(drift, maxDrift) / maxDrift;
    // Interpolate gold (#B79F58) to red (#ef4444)
    const r = Math.round(183 + t * (239 - 183));
    const g = Math.round(159 - t * (159 - 68));
    const b = Math.round(88 - t * (88 - 68));
    return `rgb(${r},${g},${b})`;
  }

  // Helper for drift bar length (min 20px, max 100px)
  function driftBarLength(drift: number) {
    const minLen = 20, maxLen = 100, maxDrift = 20;
    return minLen + Math.min(drift, maxDrift) / maxDrift * (maxLen - minLen);
  }

  useEffect(() => {
    if (!reversedCards.length) return;
    setFocusIdx(0);
  }, [reversedCards.length]);

  useEffect(() => {
    onFocusChange(focusIdx);
    // Scroll to focused card, with edge padding
    if (containerRef.current) {
      const left = EDGE_PADDING + focusIdx * (CARD_WIDTH + CARD_GAP) + CARD_WIDTH / 2 - containerRef.current.offsetWidth / 2;
      containerRef.current.scrollTo({ left, behavior: 'smooth' });
    }
  }, [focusIdx, onFocusChange, reversedCards.length, EDGE_PADDING]);

  if (!reversedCards.length) {
    return <div className="w-full text-center py-8 text-gray-400">No etymology data available.</div>;
  }

  return (
    <div className="relative w-full flex items-center">
      {/* Timeline orientation labels */}
      <div style={{position: 'absolute', top: 12, left: 24, zIndex: 20, fontWeight: 700, color: '#B79F58', fontSize: 18, letterSpacing: 1}}>Older</div>
      <div style={{position: 'absolute', top: 12, right: 24, zIndex: 20, fontWeight: 700, color: '#B79F58', fontSize: 18, letterSpacing: 1}}>Younger</div>
      {/* Left Arrow */}
      <button
        className="absolute left-0 z-10 h-16 w-10 flex items-center justify-center bg-[#252525] bg-opacity-80 text-[#D4AF37] rounded-r-xl shadow hover:bg-opacity-90 transition disabled:opacity-30"
        style={{ top: '50%', transform: 'translateY(-50%)' }}
        onClick={() => setFocusIdx(idx => Math.max(0, idx - 1))}
        disabled={focusIdx === 0}
        aria-label="Previous"
      >
        <span className="material-icons text-3xl">chevron_left</span>
      </button>
      {/* Carousel */}
      <div
        ref={containerRef}
        className="flex overflow-x-auto snap-x py-8 scrollbar-hidden cursor-grab w-full bg-[#181818] rounded-xl"
        style={{ scrollSnapType: 'x proximity', WebkitOverflowScrolling: 'touch', paddingLeft: EDGE_PADDING, paddingRight: EDGE_PADDING }}
      >
        {reversedCards.map((card, i) => {
          const offset = i - focusIdx;
          const scale = offset === 0 ? 1.1 : 0.85 - Math.abs(offset) * 0.05;
          const rotateY = offset * 25;
          const zIndex = 100 - Math.abs(offset);
          const opacity = offset === 0 ? 1 : 0.7;

          // Border color by data quality
          let borderColor = '#D4AF37'; // default gold
          if (card.dataQuality === 'complete') borderColor = '#22c55e'; // green
          else if (card.dataQuality === 'partial-ai') borderColor = '#f59e42'; // orange
          else if (card.dataQuality === 'full-ai') borderColor = '#ef4444'; // red

          // Drift bar and badge
          const drift = card.drift ?? 0;
          const driftBarStyle = {
            width: driftBarLength(drift),
            height: 8,
            background: driftBarColor(drift),
            borderRadius: 4,
            margin: '0 auto',
            marginTop: 4,
            transition: 'width 0.3s, background 0.3s',
          };

          // Drift badge style
          const badgeStyle = {
            position: 'absolute' as const,
            top: 8,
            right: 12,
            background: '#252525',
            color: '#B79F58',
            borderRadius: 6,
            padding: '2px 8px',
            fontSize: 14,
            fontWeight: 600,
            boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
          };

          // Connector line thickness
          const connectorThickness = Math.max(2, Math.min(drift, 16));

          return (
            <motion.div
              key={i}
              className={clsx(
                'snap-center flex-shrink-0 rounded-xl shadow-lg transition-all duration-300 border-2',
                offset === 0
                  ? 'bg-[#252525] text-[#F5F5F5]'
                  : 'bg-[#181818] text-[#B79F58]'
              )}
              style={{
                width: CARD_WIDTH,
                zIndex,
                opacity,
                marginRight: i === reversedCards.length - 1 ? 0 : CARD_GAP,
                perspective: 1000,
                borderColor: borderColor,
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
              animate={{
                scale,
                rotateY,
              }}
              whileTap={{ scale: 1.05 }}
              onClick={() => setFocusIdx(i)}
            >
              {/* Drift score badge */}
              <div style={badgeStyle}>Δ = {drift}</div>
              <div className="p-6 flex flex-col items-center">
                <div className="text-2xl font-bold">{card.word}</div>
                <div className="text-sm mb-2">{card.lang_code}</div>
                {card.pronunciation && (
                  <div className="text-xs italic text-[#B79F58]">{card.pronunciation}</div>
                )}
                {card.tooltip && (
                  <div className="mt-2 text-xs text-[#B79F58]">{card.tooltip}</div>
                )}
              </div>
              {/* Drift bar below card */}
              <div style={driftBarStyle} />
              {/* Connector line to previous card */}
              {i > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    left: -CARD_GAP / 2,
                    top: CARD_WIDTH / 2 - 8,
                    width: CARD_GAP,
                    height: connectorThickness,
                    background: driftBarColor(drift),
                    borderRadius: 4,
                    zIndex: 1,
                  }}
                />
              )}
            </motion.div>
          );
        })}
      </div>
      {/* Right Arrow */}
      <button
        className="absolute right-0 z-10 h-16 w-10 flex items-center justify-center bg-[#252525] bg-opacity-80 text-[#D4AF37] rounded-l-xl shadow hover:bg-opacity-90 transition disabled:opacity-30"
        style={{ top: '50%', transform: 'translateY(-50%)' }}
        onClick={() => setFocusIdx(idx => Math.min(reversedCards.length - 1, idx + 1))}
        disabled={focusIdx === reversedCards.length - 1}
        aria-label="Next"
      >
        <span className="material-icons text-3xl">chevron_right</span>
      </button>
    </div>
  );
};
