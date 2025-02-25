import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import useTeaData from "../hooks/useTeaData";
import { buildSenseNetwork, generateColorScale, SenseNode, SenseLink } from "../utils/senseUtils";

/**
 * A network visualization of senses for a given word.
 */
const SensesNetworkSection: React.FC = () => {
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
    }, [teaData, expandedNodes]);

    const initializeD3Graph = (nodes: SenseNode[], links: SenseLink[]) => {
        const width = containerRef.current?.clientWidth || 800;
        const height = containerRef.current?.clientHeight || 600;

        const svg = d3.select(svgRef.current)
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("width", "100%")
            .attr("height", "100%")
            .call(
                d3.zoom<SVGSVGElement, unknown>()
                    .scaleExtent([0.5, 3])
                    .on("zoom", (event) => {
                        svgGroup.attr("transform", event.transform);
                    }) as any
            );

        svg.selectAll("*").remove();
        const svgGroup = svg.append("g");

        const colorScale = generateColorScale(nodes);

        renderLinks(svgGroup, links, nodes);
        renderNodes(svgGroup, nodes, colorScale);
    };

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
            .transition()
            .duration(500)
            .attr("opacity", (d) => (expandedNodes.has(d.source) ? 1 : 0))
            .attr("x1", (d) => nodes.find(n => n.id === d.source)?.x || 0)
            .attr("y1", (d) => nodes.find(n => n.id === d.source)?.y || 0)
            .attr("x2", (d) => nodes.find(n => n.id === d.target)?.x || 0)
            .attr("y2", (d) => nodes.find(n => n.id === d.target)?.y || 0);
    };

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

    const toggleNodeExpansion = (node: SenseNode) => {
        setExpandedNodes((prev) => {
            const updatedNodes = new Set(prev);
            updatedNodes.has(node.id) ? updatedNodes.delete(node.id) : updatedNodes.add(node.id);
            return updatedNodes;
        });
    };

    return (
        <section ref={containerRef} style={{ width: "100%", height: "100vh", position: "relative" }}>
            {graphData.nodes.length === 0 && (
                <p style={{ position: "absolute", top: "10px", left: "10px", color: "#ddd" }}>
                    No sense data available
                </p>
            )}
            <svg ref={svgRef} />
        </section>
    );
};

export default SensesNetworkSection;
