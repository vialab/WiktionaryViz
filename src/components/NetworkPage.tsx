import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import useTeaData from "@/hooks/useWordData";
import { buildSenseNetwork, generateColorScale, SenseNode, SenseLink } from "../utils/senseUtils";

/**
 * A network visualization of senses for a given word.
 */
const NetworkPage: React.FC = () => {
    const teaData = useTeaData();
    const svgRef = useRef<SVGSVGElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [graphData, setGraphData] = useState<{ nodes: SenseNode[]; links: SenseLink[] }>({ nodes: [], links: [] });
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!teaData?.senses || !svgRef.current) return;

        const { nodes, links } = buildSenseNetwork(teaData.senses, teaData.word, teaData.lang);
        setGraphData({ nodes, links });

        if (nodes.length === 0) return;

        initializeD3Graph(nodes, links);
    }, [teaData]);

    useEffect(() => {
        updateVisibility();
    }, [expandedNodes]);

    /**
     * Initializes the D3 graph.
     */
    const initializeD3Graph = (nodes: SenseNode[], links: SenseLink[]) => {
        const width = containerRef.current?.clientWidth || 800;
        const height = containerRef.current?.clientHeight || 600;

        const svg = d3.select(svgRef.current)
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("width", "100%")
            .attr("height", "100%");

        svg.selectAll("*").remove();
        const svgGroup = svg.append("g");

        svg.call(
            d3.zoom<SVGSVGElement, unknown>()
                .scaleExtent([0.5, 3])
                .on("zoom", (event) => {
                    svgGroup.attr("transform", event.transform);
                }) as any
        );

        const colorScale = generateColorScale(nodes);

        renderLinks(svgGroup, links, nodes);
        renderNodes(svgGroup, nodes, colorScale);
    };

    /**
     * Renders the links (edges) between nodes.
     */
    const renderLinks = (
        svgGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
        links: SenseLink[],
        nodes: SenseNode[]
    ) => {
        svgGroup.append("g")
            .attr("stroke", "#999")
            .attr("stroke-opacity", 0.6)
            .selectAll("line")
            .data(links)
            .enter()
            .append("line")
            .attr("stroke-width", 2)
            .attr("opacity", 0)
            .attr("x1", (d) => getNodeX(d.source, nodes))
            .attr("y1", (d) => getNodeY(d.source, nodes))
            .attr("x2", (d) => getNodeX(d.target, nodes))
            .attr("y2", (d) => getNodeY(d.target, nodes));
    };

    /**
     * Renders the nodes (senses) in the graph.
     */
    const renderNodes = (
        svgGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
        nodes: SenseNode[],
        colorScale: Map<string, string>
    ) => {
        const nodeGroup = svgGroup.append("g")
            .selectAll("g")
            .data(nodes)
            .enter()
            .append("g")
            .attr("stroke", "#fff")
            .attr("transform", (d) => `translate(${d.x},${d.y})`)
            .attr("opacity", (d) => (d.isCentral ? 1 : 0))
            .on("click", (_, d) => toggleNodeExpansion(d));

        nodeGroup.append("circle")
            .attr("r", (d) => (d.isCentral ? 15 : 10))
            .attr("fill", (d) => colorScale.get(d.id) || "gray");

        nodeGroup.append("text")
            .attr("dy", 20)
            .attr("text-anchor", "middle")
            .text((d) => (d.label.length > 15 ? `${d.label.substring(0, 12)}...` : d.label));

        nodeGroup.on("mouseover", (event, d) => {
            d3.select(event.currentTarget).select("text").text(d.label);
        })
        .on("mouseout", (event, d) => {
            d3.select(event.currentTarget).select("text")
                .text(d.label.length > 15 ? `${d.label.substring(0, 12)}...` : d.label);
        });
    };

    /**
     * Toggles the expansion or collapse of a node's children.
     */
    const toggleNodeExpansion = (node: SenseNode) => {
        setExpandedNodes((prev) => {
            const updatedNodes = new Set(prev);
            updatedNodes.has(node.id) ? updatedNodes.delete(node.id) : updatedNodes.add(node.id);
            return updatedNodes;
        });
    };

    /**
     * Updates the visibility and position of nodes and links based on expansion state.
     */
    const updateVisibility = () => {
        const svg = d3.select(svgRef.current);

        // Update node visibility
        svg.selectAll("g")
            .data(graphData.nodes, (d: any) => d?.id || "unknown")
            .transition()
            .duration(500)
            .attr("opacity", (d: any) => (d?.isCentral || expandedNodes.has(d?.parentId || "")) ? 1 : 0);

        // Update link visibility and dynamically update positions
        svg.selectAll("line")
            .data(graphData.links)
            .transition()
            .duration(500)
            .attr("opacity", (d: any) => expandedNodes.has(d.source) || expandedNodes.has(d.target) ? 1 : 0)
            .attr("x1", (d) => getNodeX(d.source, graphData.nodes))
            .attr("y1", (d) => getNodeY(d.source, graphData.nodes))
            .attr("x2", (d) => getNodeX(d.target, graphData.nodes))
            .attr("y2", (d) => getNodeY(d.target, graphData.nodes));
    };

    /**
     * Helper function to get the X coordinate of a node by its ID.
     */
    const getNodeX = (nodeId: string, nodes: SenseNode[]): number => {
        const node = nodes.find(n => n.id === nodeId);
        return node?.x ?? 0;
    };

    /**
     * Helper function to get the Y coordinate of a node by its ID.
     */
    const getNodeY = (nodeId: string, nodes: SenseNode[]): number => {
        const node = nodes.find(n => n.id === nodeId);
        return node?.y ?? 0;
    };

    return (
        <section ref={containerRef} style={{ width: "100%", height: "100vh", position: "relative" }}>
            <svg ref={svgRef} />
        </section>
    );
};

export default NetworkPage;
