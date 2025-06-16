import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as d3 from 'd3';
import type { NodeData } from './useTimelineData';

interface TimelineChartProps {
    data: NodeData[];
    sizeScale: d3.ScaleLinear<number, number>;
    xScale: d3.ScalePoint<string>;
    onNodeHover: (e: React.MouseEvent<SVGCircleElement, MouseEvent>, d: NodeData) => void;
    onNodeMove: (e: React.MouseEvent<SVGCircleElement, MouseEvent>, d: NodeData) => void;
    onNodeOut: () => void;
    width: number;
    height: number;
    margin: number;
}

/**
 * Renders the timeline SVG chart with animated lines, nodes, and labels.
 */
const TimelineChart: React.FC<TimelineChartProps> = ({
    data,
    sizeScale,
    xScale,
    onNodeHover,
    onNodeMove,
    onNodeOut,
    width,
    height,
    margin
}) => (
    <svg width={width} height={height}>
        <g transform={`translate(${margin},${height / 2})`}>
            {/* Lines */}
            <AnimatePresence>
                {data.slice(1).map((_, i) => (
                    <motion.line
                        key={`line-${i}`}
                        initial={{
                            x1: xScale(data[i].language),
                            x2: xScale(data[i].language),
                            opacity: 0
                        }}
                        animate={{
                            x1: xScale(data[i].language),
                            x2: xScale(data[i + 1].language),
                            opacity: 1
                        }}
                        exit={{ opacity: 0 }}
                        y1={0}
                        y2={0}
                        stroke="gray"
                        strokeWidth={2}
                        transition={{ duration: 0.7, delay: i * 0.1 }}
                    />
                ))}
            </AnimatePresence>
            {/* Circles (nodes) */}
            <AnimatePresence>
                {data.map((d, i) => (
                    <motion.circle
                        key={`circle-${i}`}
                        initial={{
                            cx: xScale(d.language),
                            cy: 0,
                            r: 0,
                            opacity: 0
                        }}
                        animate={{
                            cx: xScale(d.language),
                            cy: 0,
                            r: Math.sqrt(sizeScale(d.drift) / Math.PI),
                            opacity: 1
                        }}
                        exit={{ opacity: 0, r: 0 }}
                        fill="tomato"
                        stroke="black"
                        onMouseOver={e => onNodeHover(e, d)}
                        onMouseMove={e => onNodeMove(e, d)}
                        onMouseOut={onNodeOut}
                        transition={{ duration: 0.7, delay: i * 0.1 }}
                    />
                ))}
            </AnimatePresence>
            {/* Labels */}
            <AnimatePresence>
                {data.map((d, i) => (
                    <motion.text
                        key={`label-${i}`}
                        x={xScale(d.language)}
                        y={50}
                        textAnchor="middle"
                        className="text-sm fill-white"
                        initial={{ opacity: 0, y: 70 }}
                        animate={{ opacity: 1, y: 50 }}
                        exit={{ opacity: 0, y: 70 }}
                        transition={{ duration: 0.7, delay: i * 0.1 }}
                    >
                        {d.language}
                    </motion.text>
                ))}
            </AnimatePresence>
        </g>
    </svg>
);

export default TimelineChart;
