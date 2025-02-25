import * as d3 from "d3";

/**
 * Represents a node in the sense network.
 */
export interface SenseNode {
    id: string;
    label: string;
    tags: string[];
    isCentral?: boolean;
    parentId?: string | null;
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
 * Generates a color scale based on sense depth.
 * @param nodes - Nodes in the network.
 * @returns Mapping of node IDs to colors.
 */
export const generateColorScale = (nodes: SenseNode[]): Map<string, string> => {
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10);
    return new Map(nodes.map((node, index) => [node.id, colorScale(`${node.parentId ? 1 : 0}${index % 10}`)]));
};

/**
 * Constructs a radial network of senses using `senseid` for structure and `raw_glosses` for labels.
 * @param senses - The list of senses from teaData.
 * @param word - The word being analyzed.
 * @param lang - The language of the word.
 * @returns Nodes and links for the network visualization.
 */
export const buildSenseNetwork = (senses: any[], word: string, lang: string): { nodes: SenseNode[], links: SenseLink[] } => {
    const nodes: SenseNode[] = [];
    const links: SenseLink[] = [];
    const nodeMap = new Map<string, SenseNode>();

    const centerX = 400;
    const centerY = 300;
    const subSpacingFactor = 100; // Distance between sub-nodes

    // Create the central node representing the main word.
    const centralNode: SenseNode = createNode(`central_${word}`, `${word} (${lang})`, [], true, null, { x: centerX, y: centerY });
    nodes.push(centralNode);
    nodeMap.set(centralNode.id, centralNode);

    senses.forEach((sense, index) => {
        if (!sense.senseid || sense.senseid.length === 0 || !sense.raw_glosses) return;

        const firstSenseId = sense.senseid[0];
        let parentNode = nodeMap.get(firstSenseId);

        if (!parentNode) {
            const position = calculatePosition(index, senses.length, centerX, centerY, 250);
            parentNode = createNode(
                firstSenseId,
                sense.raw_glosses[0] || "Unknown",
                sense.tags || [],
                false,
                centralNode.id,
                position
            );

            nodes.push(parentNode);
            nodeMap.set(firstSenseId, parentNode);
            links.push({ source: centralNode.id, target: parentNode.id });
        }

        processSubSenses(sense, parentNode, nodes, nodeMap, links, centerX, centerY, subSpacingFactor);
    });

    return { nodes, links };
};

/**
 * Creates a SenseNode object.
 * @param id - Unique identifier for the node.
 * @param label - The label to display.
 * @param tags - Associated tags for the node.
 * @param isCentral - Whether the node is the central root.
 * @param parentId - Parent node ID.
 * @param position - { x, y } coordinates.
 * @returns A SenseNode object.
 */
const createNode = (
    id: string,
    label: string,
    tags: string[],
    isCentral: boolean,
    parentId: string | null,
    position: { x: number; y: number }
): SenseNode => ({
    id,
    label,
    tags,
    isCentral,
    parentId,
    x: position.x,
    y: position.y,
});

/**
 * Computes the position of a node in a radial layout.
 * @param index - Index of the node.
 * @param totalNodes - Total number of nodes at this level.
 * @param centerX - Center X position.
 * @param centerY - Center Y position.
 * @param radius - Distance from the center.
 * @returns { x, y } coordinates.
 */
const calculatePosition = (index: number, totalNodes: number, centerX: number, centerY: number, radius: number): { x: number; y: number } => {
    const angle = (index / totalNodes) * Math.PI * 2;
    return {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
    };
};

/**
 * Processes sub-senses and attaches them to their parent nodes.
 * @param sense - The sense object from the dataset.
 * @param parentNode - The parent node to attach sub-senses to.
 * @param nodes - Array of nodes in the network.
 * @param nodeMap - Map to track existing nodes.
 * @param links - Array of links connecting nodes.
 * @param centerX - Center X coordinate for reference.
 * @param centerY - Center Y coordinate for reference.
 * @param subSpacingFactor - Distance between sub-nodes.
 */
const processSubSenses = (
    sense: any,
    parentNode: SenseNode,
    nodes: SenseNode[],
    nodeMap: Map<string, SenseNode>,
    links: SenseLink[],
    centerX: number,
    centerY: number,
    subSpacingFactor: number
) => {
    if (!sense.senseid || sense.senseid.length <= 1) return;

    sense.senseid.slice(1).forEach((subId: string, subIndex: number) => {
        if (nodeMap.has(subId)) return;

        const position = calculatePosition(subIndex, sense.senseid.length - 1, parentNode.x ?? centerX, parentNode.y ?? centerY, subSpacingFactor);
        const subNode = createNode(
            subId,
            sense.raw_glosses[subIndex + 1] || "Unknown",
            sense.tags || [],
            false,
            parentNode.id,
            position
        );

        nodes.push(subNode);
        nodeMap.set(subId, subNode);
        links.push({ source: parentNode.id, target: subNode.id });
    });
};
