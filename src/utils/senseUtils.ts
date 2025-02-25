import * as d3 from "d3";

/** 
 * Represents a node in the sense network.
 */
export interface SenseNode {
    id: string;
    label: string;
    tags: string[];
    isCentral?: boolean;
    parentId?: string | null; // Tracks parent sense for hierarchy
    x?: number;
    y?: number;
}

/** 
 * Represents a link (edge) between two nodes.
 */
export interface SenseLink {
    source: string;
    target: string;
}

/**
 * Builds a radial network of senses for a word.
 * @param {any[]} senses - The list of senses from teaData.
 * @param {string} word - The word being analyzed.
 * @param {string} lang - The language of the word.
 * @returns { nodes, links } - Nodes and edges for the D3 visualization.
 */
export const buildSenseNetwork = (senses: any[], word: string, lang: string) => {
    const nodes: SenseNode[] = [];
    const links: SenseLink[] = [];

    // Center of the graph
    const centerX = 400;
    const centerY = 300;

    // Create the central node representing the main word
    const centralNode: SenseNode = {
        id: `central_${word}`,
        label: `${word} (${lang})`,
        tags: [],
        isCentral: true,
        x: centerX,
        y: centerY,
    };

    nodes.push(centralNode);

    // Arrange senses radially around the central node
    const radius = 200;
    const totalSenses = senses.length;

    senses.forEach((sense: any, index: number) => {
        const angle = (index / totalSenses) * 2 * Math.PI;
        const senseNode: SenseNode = {
            id: `sense_${index}`,
            label: sense.glosses?.[0] || "Unknown",
            tags: sense.tags || [],
            parentId: centralNode.id,
            x: centerX + radius * Math.cos(angle),
            y: centerY + radius * Math.sin(angle),
        };

        nodes.push(senseNode);
        links.push({ source: centralNode.id, target: senseNode.id });

        // Handle sub-senses
        if (sense.glosses.length > 1) {
            const subRadius = 100;
            sense.glosses.slice(1).forEach((gloss: string, subIndex: number) => {
                const subAngle = ((subIndex + 1) / sense.glosses.length) * 2 * Math.PI;
                const subNode: SenseNode = {
                    id: `subSense_${index}_${subIndex}`,
                    label: gloss,
                    tags: sense.tags || [],
                    parentId: senseNode.id,
                    x: senseNode.x! + subRadius * Math.cos(subAngle),
                    y: senseNode.y! + subRadius * Math.sin(subAngle),
                };

                nodes.push(subNode);
                links.push({ source: senseNode.id, target: subNode.id });
            });
        }
    });

    return { nodes, links };
};

/**
 * Generates a color scale based on sense depth.
 * @param {SenseNode[]} nodes - Nodes in the network.
 * @returns {Map<string, string>} - Mapping of node IDs to colors.
 */
export const generateColorScale = (nodes: SenseNode[]) => {
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10);
    const nodeColorMap = new Map<string, string>();

    nodes.forEach((node, index) => {
        const depth = node.parentId ? 1 : 0;
        nodeColorMap.set(node.id, colorScale(`${depth + (index % 10)}`)); // 🛠️ Fix: Ensuring string type
    });

    return nodeColorMap;
};
