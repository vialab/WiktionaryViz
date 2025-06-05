import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface TimelineTooltipProps {
    tooltip: { x: number; y: number; content: string } | null;
}

/**
 * Renders an animated tooltip for the timeline chart.
 */
const TimelineTooltip: React.FC<TimelineTooltipProps> = ({ tooltip }) => (
    <AnimatePresence>
        {tooltip && (
            <motion.div
                className="tooltip bg-black text-white p-2 rounded text-xs max-w-sm"
                style={{
                    position: 'fixed',
                    top: tooltip.y + 10,
                    left: tooltip.x + 10,
                    zIndex: 10,
                    maxWidth: '300px',
                    wordWrap: 'break-word',
                    whiteSpace: 'pre-wrap',
                    pointerEvents: 'none',
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
            >
                <div>{tooltip.content}</div>
            </motion.div>
        )}
    </AnimatePresence>
);

export default TimelineTooltip;
