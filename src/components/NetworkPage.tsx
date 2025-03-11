import { useEffect, useState, useRef } from 'react';
import useWordData from '@/hooks/useWordData';
import * as d3 from 'd3';

interface NetworkPageProps {
    word1: string;
    word2: string;
    language1: string;
    language2: string;
}

interface EtymologyTemplate {
    name: string;
    args: Record<string, string>;
    expansion: string;
}

interface GraphNode {
    id: string;
    label: string;
    lang: string;
    color?: string;
}

interface GraphLink {
    source: string;
    target: string;
}

export default function NetworkPage({ word1, word2, language1, language2 }: NetworkPageProps) {
    console.log('[NetworkPage] Props:', { word1, word2, language1, language2 });

    const data1 = useWordData(word1, language1);
    const data2 = useWordData(word2, language2);

    console.log('[NetworkPage] data1:', data1);
    console.log('[NetworkPage] data2:', data2);

    const [nodes, setNodes] = useState<GraphNode[]>([]);
    const [links, setLinks] = useState<GraphLink[]>([]);
    const svgRef = useRef<SVGSVGElement | null>(null);

    useEffect(() => {
        if (data1 && data2) {
            console.log('[NetworkPage] Building graphs...');
            const graph1 = buildEtymologyGraph(data1.etymology_templates || [], 'steelblue');
            const graph2 = buildEtymologyGraph(data2.etymology_templates || [], 'tomato');

            console.log('[NetworkPage] Graph1:', graph1);
            console.log('[NetworkPage] Graph2:', graph2);

            setNodes([...graph1.nodes, ...graph2.nodes]);
            setLinks([...graph1.links, ...graph2.links]);
        } else {
            console.log('[NetworkPage] Waiting for both data1 and data2...');
        }
    }, [data1, data2, word1, word2]);

    useEffect(() => {
        console.log('[NetworkPage] useEffect triggered for rendering graph.');

        if (!svgRef.current) {
            console.warn('[NetworkPage] SVG ref is null.');
            return;
        }
        if (nodes.length === 0) {
            console.warn('[NetworkPage] No nodes to render.');
            return;
        }

        console.log('[NetworkPage] Rendering graph with nodes and links:', nodes, links);

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        const width = parseInt(svg.style('width')) || 800;
        const height = parseInt(svg.style('height')) || 600;

        const simulation = d3
            .forceSimulation(nodes)
            .force('link', d3.forceLink(links).id((d: any) => d.id).distance(100))
            .force('charge', d3.forceManyBody().strength(-300))
            .force('center', d3.forceCenter(width / 2, height / 2));

        const link = svg
            .append('g')
            .attr('stroke', '#aaa')
            .selectAll('line')
            .data(links)
            .join('line')
            .attr('stroke-width', 2);

        const node = svg
            .append('g')
            .attr('stroke', '#fff')
            .attr('stroke-width', 1.5)
            .selectAll('circle')
            .data(nodes)
            .join('circle')
            .attr('r', 8)
            .attr('fill', (d) => d.color || 'gray')
            .call(drag(simulation) as any);

        const label = svg
            .append('g')
            .selectAll('text')
            .data(nodes)
            .join('text')
            .text((d) => d.label)
            .attr('font-size', 10)
            .attr('dx', 12)
            .attr('dy', '.35em')
            .attr('fill', '#fff');

        simulation.on('tick', () => {
            link
                .attr('x1', (d) => (d.source as any).x)
                .attr('y1', (d) => (d.source as any).y)
                .attr('x2', (d) => (d.target as any).x)
                .attr('y2', (d) => (d.target as any).y);

            node
                .attr('cx', (d) => (d as any).x)
                .attr('cy', (d) => (d as any).y);

            label
                .attr('x', (d) => (d as any).x)
                .attr('y', (d) => (d as any).y);
        });

        function drag(simulation: d3.Simulation<d3.SimulationNodeDatum, undefined>) {
            return d3.drag()
                .on('start', (event, d: any) => {
                    console.log('[NetworkPage] Drag started:', d);
                    if (!event.active) simulation.alphaTarget(0.3).restart();
                    d.fx = d.x;
                    d.fy = d.y;
                })
                .on('drag', (event, d: any) => {
                    d.fx = event.x;
                    d.fy = event.y;
                })
                .on('end', (event, d: any) => {
                    console.log('[NetworkPage] Drag ended:', d);
                    if (!event.active) simulation.alphaTarget(0);
                    d.fx = null;
                    d.fy = null;
                });
        }
    }, [nodes, links]);

    return (
        <div className="w-full h-full flex flex-col items-center justify-center p-4">
            <h2 className="text-2xl font-semibold mb-4 text-white">
                Etymology Network: {word1} & {word2}
            </h2>
            <svg ref={svgRef} width="800" height="600" className="bg-gray-900 rounded-lg shadow-lg border border-gray-700" />
        </div>
    );
}

function buildEtymologyGraph(etymologyTemplates: EtymologyTemplate[], color: string): { nodes: GraphNode[]; links: GraphLink[] } {
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];

    let previousNodeId: string | null = null;

    console.log('[buildEtymologyGraph] Building graph with color:', color);

    console.log('[buildEtymologyGraph] Etymology templates:', etymologyTemplates);

    const derivations = etymologyTemplates.filter(t => t.name === 'der');
    console.log('[buildEtymologyGraph] Derivations:', derivations);

    derivations.forEach((template, index) => {
        const lang = template.args["2"] || `lang-${index}`;
        const word = template.args["3"] || `word-${index}`;

        const nodeId = `${word} (${lang})`;
        console.log(`[buildEtymologyGraph] Adding node: ${nodeId}`);

        nodes.push({
            id: nodeId,
            label: word,
            lang: lang,
            color: color
        });

        if (previousNodeId) {
            console.log(`[buildEtymologyGraph] Linking ${previousNodeId} → ${nodeId}`);
            links.push({
                source: previousNodeId,
                target: nodeId
            });
        }

        previousNodeId = nodeId;
    });

    const cognates = etymologyTemplates.filter(t => t.name === 'cog');
    console.log('[buildEtymologyGraph] Cognates:', cognates);

    const parentForCognates = previousNodeId || (nodes.length > 0 ? nodes[0].id : null);

    cognates.forEach((template, index) => {
        const lang = template.args["1"] || `lang-cog-${index}`;
        const word = template.args["2"] || `word-cog-${index}`;

        const nodeId = `${word} (${lang})`;
        console.log(`[buildEtymologyGraph] Adding cognate node: ${nodeId}`);

        nodes.push({
            id: nodeId,
            label: word,
            lang: lang,
            color: 'orange'
        });

        if (parentForCognates) {
            console.log(`[buildEtymologyGraph] Linking ${parentForCognates} → ${nodeId}`);
            links.push({
                source: parentForCognates,
                target: nodeId
            });
        }
    });

    return { nodes, links };
}