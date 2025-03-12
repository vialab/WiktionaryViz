import { useEffect, useState, useRef } from 'react';
import { fetchWordData } from '@/hooks/useWordData';
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
    type?: string;
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
    const [queue, setQueue] = useState<QueueItem[]>([{
        word: word1,
        lang: language1,
        color: 'steelblue',
    }, {
        word: word2,
        lang: language2,
        color: 'tomato',
    }]);
    const [visited, setVisited] = useState<Set<string>>(new Set());

    const svgRef = useRef<SVGSVGElement | null>(null);
    const wrapperRef = useRef<HTMLDivElement | null>(null);

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
                const { newNodes, newLinks, newQueueItems } = buildEtymologyGraph(nextItem, wordData?.etymology_templates || [], nodes);

                setNodes(prev => mergeUniqueNodes(prev, newNodes));
                setLinks(prev => [...prev, ...newLinks]);
                setQueue(prev => [...remainingQueue, ...newQueueItems]);
                setVisited(prev => new Set(prev).add(wordKey));
            } catch (error) {
                console.error(`Error fetching data for ${nextItem.word}:`, error);
                setQueue(remainingQueue);
            }
        };

        run();
    }, [queue, visited, nodes]);

    useEffect(() => {
        if (!svgRef.current || nodes.length === 0) return;

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        const width = wrapperRef.current?.clientWidth || window.innerWidth;
        const height = wrapperRef.current?.clientHeight || window.innerHeight;

        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 5])
            .on('zoom', (event) => g.attr('transform', event.transform));

        svg.call(zoom as any);

        const g = svg.append('g');

        const simulation = d3.forceSimulation<GraphNode>(nodes)
            .force('link', d3.forceLink<GraphNode, GraphLink>(links).id(d => d.id).distance(120))
            .force('charge', d3.forceManyBody().strength(-400))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .alphaDecay(0.03);

        const link = g.append('g')
            .attr('stroke', '#aaa')
            .selectAll('line')
            .data(links)
            .join('line')
            .attr('stroke-width', 2)
            .attr('stroke', d => {
                switch (d.type) {
                    case 'inh': return '#00ffff';
                    case 'der': return '#00ff00';
                    case 'cog': return '#ffa500';
                    case 'doublet': return '#ff00ff';
                    default: return '#aaa';
                }
            })
            .attr('stroke-dasharray', d => d.type === 'cog' ? '4 2' : d.type === 'doublet' ? '6 3' : '');

        const node = g.append('g')
            .attr('stroke', '#fff')
            .attr('stroke-width', 1.5)
            .selectAll('circle')
            .data(nodes)
            .join('circle')
            .attr('r', 10)
            .attr('fill', d => d.color || 'gray')
            .call(drag(simulation));

        const label = g.append('g')
            .selectAll('text')
            .data(nodes)
            .join('text')
            .text(d => d.label)
            .attr('font-size', 12)
            .attr('dx', 14)
            .attr('dy', '.35em')
            .attr('fill', '#fff');

        simulation.on('tick', () => {
            link.attr('x1', d => (d.source as GraphNode).x!)
                .attr('y1', d => (d.source as GraphNode).y!)
                .attr('x2', d => (d.target as GraphNode).x!)
                .attr('y2', d => (d.target as GraphNode).y!);

            node.attr('cx', d => d.x!)
                .attr('cy', d => d.y!);

            label.attr('x', d => d.x!)
                .attr('y', d => d.y!);
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

        svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(1));

        return () => simulation.stop();
    }, [nodes, links]);

    return (
        <div ref={wrapperRef} className="w-screen h-screen flex flex-col items-center justify-center bg-black overflow-hidden relative">
            <h2 className="text-2xl font-semibold text-white absolute top-4 left-4 z-10">
                Etymology Network: {word1} & {word2}
            </h2>
            <svg ref={svgRef} className="w-full h-full bg-gray-900 rounded-none border-none" />
        </div>
    );
}

function buildEtymologyGraph(parentItem: QueueItem, etymologyTemplates: EtymologyTemplate[], existingNodes: GraphNode[]): {
    newNodes: GraphNode[];
    newLinks: GraphLink[];
    newQueueItems: QueueItem[];
} {
    const newNodes: GraphNode[] = [];
    const newLinks: GraphLink[] = [];
    const newQueueItems: QueueItem[] = [];

    const parentId = `${parentItem.word} (${parentItem.lang})`;

    if (!existingNodes.find(node => node.id === parentId) && !newNodes.find(node => node.id === parentId)) {
        newNodes.push({
            id: parentId,
            label: parentItem.word,
            lang: parentItem.lang,
            color: parentItem.color
        });
    }

    let previousId = parentId;

    const derivations = etymologyTemplates.filter(t => t.name === 'der' || t.name === 'inh');

    derivations.forEach((template, index) => {
        const lang = template.args['2'] || `lang-${index}`;
        const word = template.args['3'] || `word-${index}`;
        const nodeId = `${word} (${lang})`;
        const relationType = template.name;

        const nodeExists = existingNodes.find(node => node.id === nodeId) || newNodes.find(node => node.id === nodeId);

        if (!nodeExists) {
            newNodes.push({
                id: nodeId,
                label: word,
                lang: lang,
                color: parentItem.color
            });
        }

        newLinks.push({
            source: previousId,
            target: nodeId,
            type: relationType
        });

        previousId = nodeId;

        newQueueItems.push({
            word: word,
            lang: lang,
            color: parentItem.color,
            parentId: previousId
        });
    });

    const cognates = etymologyTemplates.filter(t => t.name === 'cog');
    cognates.forEach((template, index) => {
        const lang = template.args['1'] || `lang-cog-${index}`;
        const word = template.args['2'] || `word-cog-${index}`;
        const nodeId = `${word} (${lang})`;

        const nodeExists = existingNodes.find(node => node.id === nodeId) || newNodes.find(node => node.id === nodeId);

        if (!nodeExists) {
            newNodes.push({
                id: nodeId,
                label: word,
                lang: lang,
                color: 'orange'
            });
        }

        newLinks.push({
            source: parentId,
            target: nodeId,
            type: 'cog'
        });

        newQueueItems.push({
            word: word,
            lang: lang,
            color: 'orange',
            parentId: parentId
        });
    });

    const doublets = etymologyTemplates.filter(t => t.name === 'doublet');
    doublets.forEach((template, index) => {
        Object.values(template.args).forEach(word => {
            const nodeId = `${word} (doublet)`;

            const nodeExists = existingNodes.find(node => node.id === nodeId) || newNodes.find(node => node.id === nodeId);

            if (!nodeExists) {
                newNodes.push({
                    id: nodeId,
                    label: word,
                    lang: parentItem.lang,
                    color: 'magenta'
                });
            }

            newLinks.push({
                source: parentId,
                target: nodeId,
                type: 'doublet'
            });

            newQueueItems.push({
                word: word,
                lang: parentItem.lang,
                color: 'magenta',
                parentId: parentId
            });
        });
    });

    return { newNodes, newLinks, newQueueItems };
}

function mergeUniqueNodes(existing: GraphNode[], incoming: GraphNode[]): GraphNode[] {
    const combined = [...existing];

    incoming.forEach(node => {
        if (!combined.find(n => n.id === node.id)) {
            combined.push(node);
        }
    });

    return combined;
}
