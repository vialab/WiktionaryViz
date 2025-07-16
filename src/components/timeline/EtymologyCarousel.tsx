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
  const [focusIdx, setFocusIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cards.length) return;
    setFocusIdx(0);
  }, [cards.length]);

  useEffect(() => {
    onFocusChange(focusIdx);
    // Scroll to focused card
    if (containerRef.current) {
      const left = focusIdx * (CARD_WIDTH + CARD_GAP) + CARD_WIDTH / 2 - containerRef.current.offsetWidth / 2;
      containerRef.current.scrollTo({ left, behavior: 'smooth' });
    }
  }, [focusIdx, onFocusChange]);

  if (!cards.length) {
    return <div className="w-full text-center py-8 text-gray-400">No etymology data available.</div>;
  }

  return (
    <div className="relative w-full flex items-center">
      {/* Left Arrow */}
      <button
        className="absolute left-0 z-10 h-16 w-10 flex items-center justify-center bg-zinc-800 bg-opacity-60 text-white rounded-r-xl shadow hover:bg-opacity-80 transition disabled:opacity-30"
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
        className="flex overflow-x-auto snap-x py-8 px-4 space-x-8 scrollbar-hidden cursor-grab w-full"
        style={{ scrollSnapType: 'x proximity', WebkitOverflowScrolling: 'touch' }}
      >
        {cards.map((card, i) => {
          const offset = i - focusIdx;
          const scale = offset === 0 ? 1.1 : 0.85 - Math.abs(offset) * 0.05;
          const rotateY = offset * 25;
          const zIndex = 100 - Math.abs(offset);
          const opacity = offset === 0 ? 1 : 0.7;

          return (
            <motion.div
              key={i}
              className={clsx(
                'snap-center flex-shrink-0 rounded-xl shadow-lg transition-all duration-300',
                offset === 0 ? 'bg-zinc-700 text-white' : 'bg-white text-gray-800'
              )}
              style={{
                width: CARD_WIDTH,
                zIndex,
                opacity,
                marginRight: i === cards.length - 1 ? 0 : CARD_GAP,
                perspective: 1000,
              }}
              animate={{
                scale,
                rotateY,
              }}
              whileTap={{ scale: 1.05 }}
              onClick={() => setFocusIdx(i)}
            >
              <div className="p-6 flex flex-col items-center">
                <div className="text-2xl font-bold">{card.word}</div>
                <div className="text-sm mb-2">{card.lang_code}</div>
                {card.pronunciation && (
                  <div className="text-xs italic text-gray-500">{card.pronunciation}</div>
                )}
                {card.tooltip && (
                  <div className="mt-2 text-xs">{card.tooltip}</div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
      {/* Right Arrow */}
      <button
        className="absolute right-0 z-10 h-16 w-10 flex items-center justify-center bg-zinc-800 bg-opacity-60 text-white rounded-l-xl shadow hover:bg-opacity-80 transition disabled:opacity-30"
        style={{ top: '50%', transform: 'translateY(-50%)' }}
        onClick={() => setFocusIdx(idx => Math.min(cards.length - 1, idx + 1))}
        disabled={focusIdx === cards.length - 1}
        aria-label="Next"
      >
        <span className="material-icons text-3xl">chevron_right</span>
      </button>
    </div>
  );
};
