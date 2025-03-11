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
    const subSenseTracker = new Map<string, number>(); // Tracks sub-sense count for correct positioning

    const centerX = 400;
    const centerY = 300;
    const subSpacingFactor = 100;

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

        processSubSenses(sense, parentNode, nodes, nodeMap, links, subSenseTracker, subSpacingFactor);
    });

    return { nodes, links };
};

/**
 * Creates a SenseNode object.
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
 */
const calculatePosition = (
    index: number,
    totalNodes: number,
    centerX: number,
    centerY: number,
    radius: number
): { x: number; y: number } => {
    const angle = (index / totalNodes) * Math.PI * 2;
    return {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
    };
};

/**
 * Processes sub-senses and attaches them to their parent nodes.
 */
const processSubSenses = (
    sense: any,
    parentNode: SenseNode,
    nodes: SenseNode[],
    nodeMap: Map<string, SenseNode>,
    links: SenseLink[],
    subSenseTracker: Map<string, number>,
    subSpacingFactor: number
) => {
    if (!sense.senseid || sense.senseid.length <= 1) return;

    sense.senseid.slice(1).forEach((subId: string) => {
        if (nodeMap.has(subId)) return;

        // Track how many sub-senses this parent has to distribute them evenly
        const siblingCount = subSenseTracker.get(parentNode.id) || 0;
        subSenseTracker.set(parentNode.id, siblingCount + 1);

        // Find correct gloss associated with this subId
        const subGlossIndex = sense.senseid.indexOf(subId);
        const subGloss = subGlossIndex !== -1 ? sense.raw_glosses[subGlossIndex] : "Unknown";

        // Calculate position based on sibling index
        const position = calculatePosition(siblingCount, subSenseTracker.get(parentNode.id)!, parentNode.x!, parentNode.y!, subSpacingFactor);
        
        const subNode = createNode(
            subId,
            subGloss,
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

/**
 * Builds a shortest path network between two words.
 * @param wordData1 - The first word's data object.
 * @param wordData2 - The second word's data object.
 * @returns Nodes and links representing the shortest path.
 */
export const buildShortestPathNetwork = (
    wordData1: { word: string; senses: any[]; lang: string },
    wordData2: { word: string; senses: any[]; lang: string }
): { nodes: SenseNode[]; links: SenseLink[] } => {
    const nodes: SenseNode[] = [];
    const links: SenseLink[] = [];

    // Central nodes for each word
    const centralNode1: SenseNode = createNode(
        `central_${wordData1.word}`,
        `${wordData1.word} (${wordData1.lang})`,
        [],
        true,
        null,
        { x: 300, y: 300 }
    );

    const centralNode2: SenseNode = createNode(
        `central_${wordData2.word}`,
        `${wordData2.word} (${wordData2.lang})`,
        [],
        true,
        null,
        { x: 700, y: 300 }
    );

    nodes.push(centralNode1, centralNode2);

    // Create a "path" link between the two
    links.push({ source: centralNode1.id, target: centralNode2.id });

    // Optional: add senses as subnodes (demo, can be expanded to find "real" paths)
    wordData1.senses.slice(0, 3).forEach((sense, index) => {
        const senseNode = createNode(
            `sense1_${index}`,
            sense.raw_glosses?.[0] || `Sense ${index}`,
            sense.tags || [],
            false,
            centralNode1.id,
            calculatePosition(index, 3, centralNode1.x!, centralNode1.y!, 150)
        );
        nodes.push(senseNode);
        links.push({ source: centralNode1.id, target: senseNode.id });
    });

    wordData2.senses.slice(0, 3).forEach((sense, index) => {
        const senseNode = createNode(
            `sense2_${index}`,
            sense.raw_glosses?.[0] || `Sense ${index}`,
            sense.tags || [],
            false,
            centralNode2.id,
            calculatePosition(index, 3, centralNode2.x!, centralNode2.y!, 150)
        );
        nodes.push(senseNode);
        links.push({ source: centralNode2.id, target: senseNode.id });
    });

    return { nodes, links };
};

/**
 * Builds a comparative network visualization between two words.
 * @param wordData1 - The first word's data object.
 * @param wordData2 - The second word's data object.
 * @returns Nodes and links representing similarities and differences.
 */
export const buildComparativeNetwork = (
    wordData1: { word: string; senses: any[]; lang: string },
    wordData2: { word: string; senses: any[]; lang: string }
): { nodes: SenseNode[]; links: SenseLink[] } => {
    const nodes: SenseNode[] = [];
    const links: SenseLink[] = [];

    const centerX = 500;
    const centerY1 = 200;
    const centerY2 = 500;

    // Central nodes
    const centralNode1: SenseNode = createNode(
        `central_${wordData1.word}`,
        `${wordData1.word} (${wordData1.lang})`,
        [],
        true,
        null,
        { x: centerX, y: centerY1 }
    );

    const centralNode2: SenseNode = createNode(
        `central_${wordData2.word}`,
        `${wordData2.word} (${wordData2.lang})`,
        [],
        true,
        null,
        { x: centerX, y: centerY2 }
    );

    nodes.push(centralNode1, centralNode2);

    // Example similarity link between the two words
    links.push({ source: centralNode1.id, target: centralNode2.id });

    // Add senses of both words for comparison (you can expand this with similarity logic)
    wordData1.senses.slice(0, 5).forEach((sense, index) => {
        const senseNode = createNode(
            `sense1_${index}`,
            sense.raw_glosses?.[0] || `Sense ${index}`,
            sense.tags || [],
            false,
            centralNode1.id,
            calculatePosition(index, 5, centerX, centerY1, 150)
        );
        nodes.push(senseNode);
        links.push({ source: centralNode1.id, target: senseNode.id });
    });

    wordData2.senses.slice(0, 5).forEach((sense, index) => {
        const senseNode = createNode(
            `sense2_${index}`,
            sense.raw_glosses?.[0] || `Sense ${index}`,
            sense.tags || [],
            false,
            centralNode2.id,
            calculatePosition(index, 5, centerX, centerY2, 150)
        );
        nodes.push(senseNode);
        links.push({ source: centralNode2.id, target: senseNode.id });
    });

    return { nodes, links };
};
