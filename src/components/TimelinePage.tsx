import React, { useState } from 'react';
import * as d3 from 'd3';
import { useTimelineData } from './timeline/useTimelineData';
import TimelineChart from './timeline/TimelineChart';
import TimelineTooltip from './timeline/TimelineTooltip';

interface TimelinePageProps {
    word: string;
    language: string;
}

/**
 * TimelinePage visualizes phonetic drift as an animated timeline.
 * Uses modular components and a custom hook for maintainability.
 */
const TimelinePage: React.FC<TimelinePageProps> = ({ word, language }) => {
    const { data, loading } = useTimelineData(word, language);
    const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null);

    // Layout calculations
    const width = 1000;
    const height = 200;
    const margin = 50;
    const maxDrift = d3.max(data, d => d.drift) || 1;
    const sizeScale = d3.scaleLinear().domain([0, maxDrift]).range([300, 2000]);
    const xScale = d3.scalePoint<string>()
        .domain(data.map(d => d.language))
        .range([0, width - margin * 2])
        .padding(0.5);

    // Tooltip handlers for TimelineChart
    const handleNodeHover = (e: React.MouseEvent<SVGCircleElement, MouseEvent>, d: { tooltip: string }) => {
        setTooltip({ x: e.clientX, y: e.clientY, content: d.tooltip });
    };
    const handleNodeMove = (e: React.MouseEvent<SVGCircleElement, MouseEvent>) => {
        setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null);
    };
    const handleNodeOut = () => setTooltip(null);

    return (
        <div className="p-4 relative">
            <h1 className="text-xl font-bold mb-4">Phonetic Drift Timeline</h1>
            {loading ? (
                <div>Loading timeline...</div>
            ) : (
                <TimelineChart
                    data={data}
                    sizeScale={sizeScale}
                    xScale={xScale}
                    onNodeHover={handleNodeHover}
                    onNodeMove={handleNodeMove}
                    onNodeOut={handleNodeOut}
                    width={width}
                    height={height}
                    margin={margin}
                />
            )}
            <TimelineTooltip tooltip={tooltip} />
        </div>
    );
};

export default TimelinePage;
