import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface NodeData {
    language: string;
    drift: number;
    tooltip: string;
}

const data: NodeData[] = [
    {
        language: 'Sanskrit',
        drift: 0,
        tooltip: `Sanskrit → Classical Persian
IPA: nɑːrəŋɡ → nɑː.ˈɾaŋɡ
Segments: ['n', 'ɑː', 'r', 'ə', 'ŋ', 'ɡ'] → ['n', 'ɑː', 'ɾ', 'a', 'ŋ', 'ɡ']
Raw Weighted Distance: 0.75
Avg Segment Count: 6.00
Normalized Drift per Segment: 0.12
Feature Differences by Aligned Segments:
  n    → n    | 0 feature diffs
  ɑː   → ɑː   | 0 feature diffs
  r    → ɾ    | 0 feature diffs
  ə    → a    | 2 feature diffs
  ŋ    → ŋ    | 0 feature diffs
  ɡ    → ɡ    | 0 feature diffs`
    },
    {
        language: 'Classical Persian',
        drift: 0.12,
        tooltip: `Classical Persian → Arabic
IPA: nɑː.ˈɾaŋɡ → naː.rand͡ʒ
Segments: ['n', 'ɑː', 'ɾ', 'a', 'ŋ', 'ɡ'] → ['n', 'aː', 'r', 'a', 'n', 'd͡ʒ']
Raw Weighted Distance: 4.75
Avg Segment Count: 6.00
Normalized Drift per Segment: 0.79
Feature Differences by Aligned Segments:
  n    → n    | 0 feature diffs
  ɑː   → aː   | 1 feature diff
  ɾ    → r    | 0 feature diffs
  a    → a    | 0 feature diffs
  ŋ    → n    | 5 feature diffs
  ɡ    → d͡ʒ  | 6 feature diffs`
    },
    {
        language: 'Arabic',
        drift: 0.91,
        tooltip: `Arabic → Old Spanish
IPA: naː.rand͡ʒ → naˈɾãŋ.xa
Segments: ['n', 'aː', 'r', 'a', 'n', 'd͡ʒ'] → ['n', 'a', 'ɾ', 'ã', 'ŋ', 'x', 'a']
Raw Weighted Distance: 14.00
Avg Segment Count: 6.50
Normalized Drift per Segment: 2.15
Feature Differences by Aligned Segments:
  n    → n    | 0 feature diffs
  aː   → a    | 1 feature diff
  r    → ɾ    | 0 feature diffs
  a    → ã   | 1 feature diff
  n    → ŋ    | 5 feature diffs
  d͡ʒ  → x    | 8 feature diffs`
    },
    {
        language: 'Old Spanish',
        drift: 3.06,
        tooltip: `Old Spanish → Latin
IPA: naˈɾãŋ.xa → aˈran.t͡ʃa
Segments: ['n', 'a', 'ɾ', 'ã', 'ŋ', 'x', 'a'] → ['a', 'r', 'a', 'n', 't͡ʃ', 'a']
Raw Weighted Distance: 13.25
Avg Segment Count: 6.50
Normalized Drift per Segment: 2.04
Feature Differences by Aligned Segments:
  n    → a    | 10 feature diffs
  a    → r    | 10 feature diffs
  ɾ    → a    | 10 feature diffs
  ã   → n    | 9 feature diffs
  ŋ    → t͡ʃ  | 9 feature diffs
  x    → a    | 8 feature diffs`
    },
    {
        language: 'Latin',
        drift: 5.10,
        tooltip: `Latin → Old French
IPA: aˈran.t͡ʃa → ɔˈrɛndʒə
Segments: ['a', 'r', 'a', 'n', 't͡ʃ', 'a'] → ['ɔ', 'r', 'ɛ', 'n', 'd', 'ʒ', 'ə']
Raw Weighted Distance: 12.25
Avg Segment Count: 6.50
Normalized Drift per Segment: 1.88
Feature Differences by Aligned Segments:
  a    → ɔ    | 3 feature diffs
  r    → r    | 0 feature diffs
  a    → ɛ    | 3 feature diffs
  n    → n    | 0 feature diffs
  t͡ʃ  → d    | 5 feature diffs
  a    → ʒ    | 10 feature diffs`
    },
    {
        language: 'Old French',
        drift: 6.98,
        tooltip: `Old French → Dutch
IPA: ɔˈrɛndʒə → ˌoːˈrɑn.jə
Segments: ['ɔ', 'r', 'ɛ', 'n', 'd', 'ʒ', 'ə'] → ['oː', 'r', 'ɑ', 'n', 'j', 'ə']
Raw Weighted Distance: 14.88
Avg Segment Count: 6.50
Normalized Drift per Segment: 2.29
Feature Differences by Aligned Segments:
  ɔ    → oː   | 2 feature diffs
  r    → r    | 0 feature diffs
  ɛ    → ɑ    | 4 feature diffs
  n    → n    | 0 feature diffs
  d    → j    | 7 feature diffs
  ʒ    → ə    | 9 feature diffs`
    },
    {
        language: 'Dutch',
        drift: 9.27,
        tooltip: `Dutch → Indonesian
IPA: ˌoːˈrɑn.jə → oˈra.ɲə
Segments: ['oː', 'r', 'ɑ', 'n', 'j', 'ə'] → ['o', 'r', 'a', 'ɲ', 'ə']
Raw Weighted Distance: 9.62
Avg Segment Count: 5.50
Normalized Drift per Segment: 1.75
Feature Differences by Aligned Segments:
  oː   → o    | 1 feature diff
  r    → r    | 0 feature diffs
  ɑ    → a    | 1 feature diff
  n    → ɲ    | 4 feature diffs
  j    → ə    | 5 feature diffs`
    }
];

const TimelinePage: React.FC = () => {
    const svgRef = useRef<SVGSVGElement | null>(null);

    useEffect(() => {
        const width = 1000;
        const height = 200;
        const margin = 50;

        const maxDrift = d3.max(data, d => d.drift) || 1;
        const sizeScale = d3.scaleLinear().domain([0, maxDrift]).range([300, 2000]);

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        const g = svg.append('g').attr('transform', `translate(${margin},${height / 2})`);

        const xScale = d3.scalePoint()
            .domain(data.map(d => d.language))
            .range([0, width - margin * 2])
            .padding(0.5);

        // Tooltip
        const tooltip = d3.select('body')
    .append('div')
    .attr('class', 'tooltip bg-black text-white p-2 rounded text-xs max-w-sm')
    .style('position', 'absolute')
    .style('z-index', '10')
    .style('visibility', 'hidden')
    .style('max-width', '300px') // Ensure wrapping occurs
    .style('word-wrap', 'break-word')
    .style('white-space', 'pre-wrap'); // Allow newlines and wrapping

        // Lines
        g.selectAll('line')
            .data(data.slice(1))
            .enter()
            .append('line')
            .attr('x1', (_, i) => xScale(data[i].language)!)
            .attr('x2', (_, i) => xScale(data[i + 1].language)!)
            .attr('y1', 0)
            .attr('y2', 0)
            .attr('stroke', 'gray')
            .attr('stroke-width', 2);

        // Circles (nodes)
        g.selectAll('circle')
            .data(data)
            .enter()
            .append('circle')
            .attr('cx', d => xScale(d.language)!)
            .attr('cy', 0)
            .attr('r', d => Math.sqrt(sizeScale(d.drift) / Math.PI))
            .attr('fill', 'tomato')
            .attr('stroke', 'black')
            .on('mouseover', (_, d) => {
                tooltip.html(`<div>${d.tooltip}</div>`)
                    .style('visibility', 'visible');
            })
            .on('mousemove', (event) => {
                tooltip
                    .style('top', `${event.pageY - 10}px`)
                    .style('left', `${event.pageX + 10}px`);
            })
            .on('mouseout', () => {
                tooltip.style('visibility', 'hidden');
            });

        // Labels
        g.selectAll('text')
            .data(data)
            .enter()
            .append('text')
            .attr('x', d => xScale(d.language)!)
            .attr('y', 50)
            .attr('text-anchor', 'middle')
            .attr('class', 'text-sm fill-white')
            .text(d => d.language);

        return () => {
            tooltip.remove();
        };
    }, []);

    return (
        <div className="p-4">
            <h1 className="text-xl font-bold mb-4">Phonetic Drift Timeline</h1>
            <svg ref={svgRef} width={1000} height={200} />
        </div>
    );
};

export default TimelinePage;
