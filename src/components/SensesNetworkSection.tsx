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

    useEffect(() => {
        if (!teaData?.senses || !svgRef.current) return;

        // Process senses and include central node
        const { nodes, links } = buildSenseNetwork(teaData.senses, teaData.word, teaData.lang);
        setGraphData({ nodes, links });

        if (nodes.length === 0) return;

        const width = containerRef.current?.clientWidth || 800;
        const height = containerRef.current?.clientHeight || 600;

        // Clear previous render
        d3.select(svgRef.current).selectAll("*").remove();

        // Create SVG container
        const svg = d3
            .select(svgRef.current)
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("width", "100%")
            .attr("height", "100%");

        const colorScale = generateColorScale(nodes);

        // Add links (edges)
        svg.append("g")
            .attr("stroke", "#999")
            .attr("stroke-opacity", 0.6)
            .selectAll("line")
            .data(links)
            .enter()
            .append("line")
            .attr("x1", d => nodes.find(n => n.id === d.source)?.x || 0)
            .attr("y1", d => nodes.find(n => n.id === d.source)?.y || 0)
            .attr("x2", d => nodes.find(n => n.id === d.target)?.x || 0)
            .attr("y2", d => nodes.find(n => n.id === d.target)?.y || 0)
            .attr("stroke-width", 2);

        // Add nodes (senses)
        const nodeGroup = svg.append("g")
            .attr("stroke", "#fff")
            .attr("stroke-width", 2)
            .selectAll("g")
            .data(nodes)
            .enter()
            .append("g")
            .attr("transform", d => `translate(${d.x},${d.y})`);

        nodeGroup.append("circle")
            .attr("r", d => (d.isCentral ? 15 : 10))
            .attr("fill", d => colorScale.get(d.id) || "gray");

        // Add default text labels with ellipsis
        const label = nodeGroup.append("text")
            .attr("dy", 20) // Position label below the node
            .attr("text-anchor", "middle")
            .text(d => (d.label.length > 15 ? `${d.label.substring(0, 12)}...` : d.label));

        // Expand label on hover
        nodeGroup.on("mouseover", function (event, d) {
            d3.select(this).select("text")
                .text(d.label);
        })
        .on("mouseout", function (event, d) {
            d3.select(this).select("text")
                .text(d.label.length > 15 ? `${d.label.substring(0, 12)}...` : d.label);
        });

    }, [teaData]);

    return (
        <section ref={containerRef} style={{ width: "100%", height: "600px", position: "relative" }}>
            {graphData.nodes.length === 0 && <p style={{ position: "absolute", top: "10px", left: "10px" }}>No sense data available</p>}
            <svg ref={svgRef} />
        </section>
    );
};

export default SensesNetworkSection;
