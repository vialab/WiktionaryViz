import { useEffect, useState, useRef } from 'react';
import { fetchWordData } from '@/hooks/useWordData';
import { useD3NetworkGraph, GraphNode, GraphLink } from './network/useD3NetworkGraph';

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

interface QueueItem {
    word: string;
    lang: string;
    color: string;
    parentId?: string;
}

/**
 * Displays an interactive etymology network graph using D3 and React.
 * Fetches etymology data and builds a force-directed graph.
 */
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

    // Change svgRef and wrapperRef types to non-nullable RefObject
    const svgRef = useRef<SVGSVGElement>(null) as React.RefObject<SVGSVGElement>;
    const wrapperRef = useRef<HTMLDivElement>(null) as React.RefObject<HTMLDivElement>;

    // Use the custom D3 hook for rendering and simulation
    useD3NetworkGraph(svgRef, wrapperRef, nodes, links);

    // TODO [HIGH LEVEL]: Progressive disclosure and pruning of weak/irrelevant links to reduce visual noise.
    // TODO [LOW LEVEL]: Add a link-strength slider and a threshold when constructing `links`, plus a toggle for "major links only".

    // TODO [HIGH LEVEL]: Shape/color encodings by category (morphology, sense, etymology) and a legend.
    // TODO [LOW LEVEL]: Extend GraphNode with `category` and map to circle/triangle/square with a small legend overlay.

    // TODO [HIGH LEVEL]: Compare mode highlighting for two inputs (e.g., distinct colors, intersection emphasis).
    // TODO [LOW LEVEL]: Add node/edge styling rules based on originating queue item color and show overlap badges.

    // Fetch and build the etymology network graph incrementally
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
                // Remove unused variable 'prev' in setQueue
                setQueue([...remainingQueue, ...newQueueItems]);
                setVisited(prev => new Set(prev).add(wordKey));
            } catch (error) {
                console.error(`Error fetching data for ${nextItem.word}:`, error);
                setQueue(remainingQueue);
            }
        };
        run();
    }, [queue, visited, nodes]);

    return (
        <div ref={wrapperRef} className="w-screen h-screen flex flex-col items-center justify-center bg-black overflow-hidden relative">
            <h2 className="text-2xl font-semibold text-white absolute top-4 left-4 z-10">
                Etymology Network: {word1} {word2 && `& ${word2}`}
            </h2>
            {/* TODO [LOW LEVEL]: Add toolbar with search, strength slider, and toggle for cognates/doublets/derivations. */}
            <svg ref={svgRef} className="w-full h-full bg-gray-900 rounded-none border-none" />
        </div>
    );
}

/**
 * Builds new nodes, links, and queue items for the etymology network graph.
 * @internal
 */
function buildEtymologyGraph(
    parentItem: QueueItem,
    etymologyTemplates: EtymologyTemplate[],
    existingNodes: GraphNode[]
): {
    newNodes: GraphNode[];
    newLinks: GraphLink[];
    newQueueItems: QueueItem[];
} {
    const newNodes: GraphNode[] = [];
    const newLinks: GraphLink[] = [];
    const newQueueItems: QueueItem[] = [];

    const parentId = `${parentItem.word} (${parentItem.lang})`;

    if (
        !existingNodes.find(node => node.id === parentId) &&
        !newNodes.find(node => node.id === parentId)
    ) {
        newNodes.push({
            id: parentId,
            label: parentItem.word,
            lang: parentItem.lang,
            color: parentItem.color
        });
    }

    let previousId = parentId;

    const derivations = etymologyTemplates.filter(
        t => t.name === 'der' || t.name === 'inh'
    );

    // Remove unused variable 'index' in forEach loops
    // derivations.forEach((template, index) => { ... })
    derivations.forEach((template) => {
        const lang = template.args['2'];
        const word = template.args['3'];
        const expansion = template.expansion;

        if (!word) return;

        const nodeId = `${word} (${lang || 'unknown'})`;
        const relationType = template.name;

        const nodeExists =
            existingNodes.find(node => node.id === nodeId) ||
            newNodes.find(node => node.id === nodeId);

        if (!nodeExists) {
            newNodes.push({
                id: nodeId,
                label: word,
                lang: lang || 'unknown',
                color: parentItem.color,
                expansion: expansion
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
            lang: lang || 'unknown',
            color: parentItem.color,
            parentId: previousId
        });
    });

    const cognates = etymologyTemplates.filter(t => t.name === 'cog');
    // cognates.forEach((template, index) => { ... })
    cognates.forEach((template) => {
        const lang = template.args['1'];
        const word = template.args['2'];
        const expansion = template.expansion;

        if (!word) return;

        const nodeId = `${word} (${lang || 'unknown'})`;

        const nodeExists =
            existingNodes.find(node => node.id === nodeId) ||
            newNodes.find(node => node.id === nodeId);

        if (!nodeExists) {
            newNodes.push({
                id: nodeId,
                label: word,
                lang: lang || 'unknown',
                color: 'orange',
                expansion: expansion
            });
        }

        newLinks.push({
            source: parentId,
            target: nodeId,
            type: 'cog'
        });

        newQueueItems.push({
            word: word,
            lang: lang || 'unknown',
            color: 'orange',
            parentId: parentId
        });
    });

    const doublets = etymologyTemplates.filter(t => t.name === 'doublet');
    // doublets.forEach((template, index) => { ... })
    doublets.forEach((template) => {
        Object.values(template.args).forEach(word => {
            const expansion = template.expansion;

            if (!word) return;

            const nodeId = `${word} (doublet)`;

            const nodeExists =
                existingNodes.find(node => node.id === nodeId) ||
                newNodes.find(node => node.id === nodeId);

            if (!nodeExists) {
                newNodes.push({
                    id: nodeId,
                    label: word,
                    lang: parentItem.lang,
                    color: 'magenta',
                    expansion: expansion
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

/**
 * Merges new nodes into the existing node list, ensuring uniqueness by id.
 * @internal
 */
function mergeUniqueNodes(existing: GraphNode[], incoming: GraphNode[]): GraphNode[] {
    const combined = [...existing];

    incoming.forEach(node => {
        if (!combined.find(n => n.id === node.id)) {
            combined.push(node);
        }
    });

    return combined;
}
