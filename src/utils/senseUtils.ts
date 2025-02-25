import * as d3 from "d3";

/** 
 * Represents a node in the sense network.
 */
export interface SenseNode {
    id: string;
    label: string;
    tags: string[];
    isCentral?: boolean;
    x?: number;
    y?: number;
    fx?: number | null;
    fy?: number | null;
}

/** 
 * Represents a link (edge) between two nodes.
 */
export interface SenseLink {
    source: string;
    target: string;
}

/**
 * Generates a color scale based on unique sense categories/tags.
 * @param {SenseNode[]} nodes - List of sense nodes.
 * @returns {Function} A function that maps a node to a color.
 */
export const generateColorScale = (nodes: SenseNode[]) => {
    const uniqueTags = new Set<string>();

    // Collect all unique tags/categories
    nodes.forEach((node) => {
        node.tags.forEach((tag) => uniqueTags.add(tag));
    });

    const tagArray = Array.from(uniqueTags);
    const colorScale = d3.scaleOrdinal(d3.schemeTableau10).domain(tagArray);

    return (node: SenseNode) => (node.tags.length > 0 ? colorScale(node.tags[0]) : "gray");
};

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
        fx: centerX, 
        fy: centerY
    };

    nodes.push(centralNode);

    // Arrange senses radially around the central node
    const radius = 200; 
    const totalSenses = senses.length;

    senses.forEach((sense, index) => {
        const angle = (index / totalSenses) * 2 * Math.PI;

        const senseNode: SenseNode = {
            id: `sense_${index}`,
            label: sense.glosses?.[0] || "Unknown",
            tags: sense.tags || [],
            x: centerX + radius * Math.cos(angle),
            y: centerY + radius * Math.sin(angle),
            fx: null, 
            fy: null
        };

        nodes.push(senseNode);
        links.push({ source: centralNode.id, target: senseNode.id });
    });

    return { nodes, links };
};
