import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as d3 from 'd3';
import type { NodeData } from './useTimelineData';

interface TimelineChartProps {
    data: NodeData[];
    sizeScale: d3.ScaleLinear<number, number>;
    onNodeHover: (e: React.MouseEvent<SVGCircleElement, MouseEvent>, d: NodeData) => void;
    onNodeMove: (e: React.MouseEvent<SVGCircleElement, MouseEvent>, d: NodeData) => void;
    onNodeOut: () => void;
    width: number;
    height: number;
    margin: number;
}

/**
 * Renders the timeline SVG chart with animated lines, nodes, and labels in a linear ancestry chain.
 */
const TimelineChart: React.FC<TimelineChartProps> = ({
    data,
    sizeScale,
    onNodeHover,
    onNodeMove,
    onNodeOut,
    width,
    height,
    margin
}) => {
    // Linear layout: space nodes evenly along the width
    const nodeCount = data.length;
    const innerWidth = width - 2 * margin;
    const xStep = nodeCount > 1 ? innerWidth / (nodeCount - 1) : 0;
    const getX = (i: number) => margin + i * xStep;

    // TODO [HIGH LEVEL]: Visual encoding for uncertainty and contested info (e.g., dotted connectors, desaturated colors, alt paths).
    // TODO [LOW LEVEL]: Drive strokeDasharray and fill opacity from NodeData flags like `contested` or `uncertain`.

    // TODO [HIGH LEVEL]: Data quality encoding (complete vs partial-ai vs full-ai) to support transparency about AI use.
    // TODO [LOW LEVEL]: Map NodeData.dataQuality to color/opacity legend and add a small legend component near the chart.
    return (
        <svg width={width} height={height}>
            <g transform={`translate(0,${height / 2})`}>
                {/* Lines */}
                <AnimatePresence>
                    {data.slice(1).map((_, i) => (
                        <motion.line
                            key={`line-${i}`}
                            initial={{
                                x1: getX(i),
                                x2: getX(i),
                                opacity: 0
                            }}
                            animate={{
                                x1: getX(i),
                                x2: getX(i + 1),
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
                                cx: getX(i),
                                cy: 0,
                                r: 0,
                                opacity: 0
                            }}
                            animate={{
                                cx: getX(i),
                                cy: 0,
                                r: Math.sqrt(sizeScale(d.drift) / Math.PI),
                                opacity: 1
                            }}
                            exit={{ opacity: 0, r: 0 }}
                            // TODO [LOW LEVEL]: Use quality-aware color scale instead of static 'tomato'.
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
                            x={getX(i)}
                            y={50}
                            textAnchor="middle"
                            className="text-sm fill-white"
                            initial={{ opacity: 0, y: 70 }}
                            animate={{ opacity: 1, y: 50 }}
                            exit={{ opacity: 0, y: 70 }}
                            transition={{ duration: 0.7, delay: i * 0.1 }}
                        >
                            {d.lang}
                        </motion.text>
                    ))}
                </AnimatePresence>
            </g>
        </svg>
    );
};

export default TimelineChart;
