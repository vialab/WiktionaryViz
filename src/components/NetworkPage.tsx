import { useEffect, useState, useRef } from 'react';
import { fetchWordData} from '@/hooks/useWordData';
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

interface GraphNode extends d3.SimulationNodeDatum {
    id: string;
    label: string;
    lang: string;
    color?: string;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
    source: string | GraphNode;
    target: string | GraphNode;
}

interface QueueItem {
    word: string;
    lang: string;
    color: string;
    parentId?: string;
}

export default function NetworkPage({ word1, word2, language1, language2 }: NetworkPageProps) {
    const [nodes, setNodes] = useState<GraphNode[]>([]);
    const [links, setLinks] = useState<GraphLink[]>([]);
    const [queue, setQueue] = useState<QueueItem[]>([
        { word: word1, lang: language1, color: 'steelblue' },
        { word: word2, lang: language2, color: 'tomato' }
    ]);
    const [visited, setVisited] = useState<Set<string>>(new Set());

    const svgRef = useRef<SVGSVGElement | null>(null);

    useEffect(() => {
        if (queue.length === 0) return;

        const nextItem = queue[0];
        const remainingQueue = queue.slice(1);

        const wordKey = `${nextItem.word}-${nextItem.lang}`;

        if (visited.has(wordKey)) {
            setQueue(remainingQueue);
            return;
        }

        const run = async () => {
            try {
                const wordData = await fetchWordData(nextItem.word, nextItem.lang);
                console.log(`[NetworkPage] Data fetched for ${nextItem.word}:`, wordData);
        
                const { newNodes, newLinks, newQueueItems } = buildEtymologyGraph(
                    nextItem,
                    wordData?.etymology_templates || []
                );
        
                setNodes((prev) => [...prev, ...newNodes]);
                setLinks((prev) => [...prev, ...newLinks]);
                setQueue((prev) => [...remainingQueue, ...newQueueItems]);
                setVisited((prev) => {
                    const updated = new Set(prev);
                    updated.add(wordKey);
                    return updated;
                });
            } catch (error) {
                console.error(`[NetworkPage] Error fetching data for ${nextItem.word}:`, error);
                setQueue(remainingQueue); // Skip this item if failed
            }
        };
        run();
    }, [queue, visited]);

    useEffect(() => {
        if (!svgRef.current || nodes.length === 0) {
            console.warn('[NetworkPage] No graph to render.');
            return;
        }

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        const width = parseInt(svg.style('width')) || 800;
        const height = parseInt(svg.style('height')) || 600;

        const simulation = d3
            .forceSimulation<GraphNode>(nodes)
            .force('link', d3.forceLink<GraphNode, GraphLink>(links).id((d) => d.id).distance(100))
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
            .call(drag(simulation));

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
                .attr('x1', (d) => (d.source as GraphNode).x!)
                .attr('y1', (d) => (d.source as GraphNode).y!)
                .attr('x2', (d) => (d.target as GraphNode).x!)
                .attr('y2', (d) => (d.target as GraphNode).y!);

            node
                .attr('cx', (d) => d.x!)
                .attr('cy', (d) => d.y!);

            label
                .attr('x', (d) => d.x!)
                .attr('y', (d) => d.y!);
        });

        function drag(sim: d3.Simulation<GraphNode, GraphLink>) {
            return d3.drag<Element, GraphNode>()
                .on('start', (event, d) => {
                    if (!event.active) sim.alphaTarget(0.3).restart();
                    d.fx = d.x;
                    d.fy = d.y;
                })
                .on('drag', (event, d) => {
                    d.fx = event.x;
                    d.fy = event.y;
                })
                .on('end', (event, d) => {
                    if (!event.active) sim.alphaTarget(0);
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

function buildEtymologyGraph(
    parentItem: QueueItem,
    etymologyTemplates: EtymologyTemplate[]
): {
    newNodes: GraphNode[];
    newLinks: GraphLink[];
    newQueueItems: QueueItem[];
} {
    const newNodes: GraphNode[] = [];
    const newLinks: GraphLink[] = [];
    const newQueueItems: QueueItem[] = [];

    const parentId = `${parentItem.word} (${parentItem.lang})`;

    // Add parent node
    newNodes.push({
        id: parentId,
        label: parentItem.word,
        lang: parentItem.lang,
        color: parentItem.color
    });

    const derivations = etymologyTemplates.filter((t) => t.name === 'der');
    derivations.forEach((template, index) => {
        const lang = template.args['2'] || `lang-${index}`;
        const word = template.args['3'] || `word-${index}`;
        const nodeId = `${word} (${lang})`;

        newNodes.push({
            id: nodeId,
            label: word,
            lang: lang,
            color: parentItem.color
        });

        newLinks.push({
            source: parentId,
            target: nodeId
        });

        newQueueItems.push({
            word: word,
            lang: lang,
            color: parentItem.color,
            parentId: parentId
        });
    });

    const cognates = etymologyTemplates.filter((t) => t.name === 'cog');
    cognates.forEach((template, index) => {
        const lang = template.args['1'] || `lang-cog-${index}`;
        const word = template.args['2'] || `word-cog-${index}`;
        const nodeId = `${word} (${lang})`;

        newNodes.push({
            id: nodeId,
            label: word,
            lang: lang,
            color: 'orange'
        });

        newLinks.push({
            source: parentId,
            target: nodeId
        });

        newQueueItems.push({
            word: word,
            lang: lang,
            color: 'orange',
            parentId: parentId
        });
    });

    return { newNodes, newLinks, newQueueItems };
}
