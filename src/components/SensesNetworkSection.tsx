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

        // Append a group inside SVG for zooming
        const svgGroup = svg.append("g");

        // Enable zoom and pan
        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.5, 3])
            .on("zoom", (event) => {
                svgGroup.attr("transform", event.transform);
            });

        svg.call(zoom as any);

        // Tooltip element
        const tooltip = d3.select(containerRef.current)
            .append("div")
            .style("position", "absolute")
            .style("background", "rgba(0, 0, 0, 0.8)")
            .style("color", "#fff")
            .style("padding", "6px")
            .style("border-radius", "4px")
            .style("font-size", "12px")
            .style("visibility", "hidden")
            .style("pointer-events", "none");

        // Generate color scale
        const colorScale = generateColorScale(nodes);

        // Add links (edges)
        svgGroup
            .append("g")
            .attr("stroke", "#999")
            .attr("stroke-opacity", 0.6)
            .selectAll("line")
            .data(links)
            .enter()
            .append("line")
            .attr("x1", (d) => nodes.find((n) => n.id === d.source)?.x || 0)
            .attr("y1", (d) => nodes.find((n) => n.id === d.source)?.y || 0)
            .attr("x2", (d) => nodes.find((n) => n.id === d.target)?.x || 0)
            .attr("y2", (d) => nodes.find((n) => n.id === d.target)?.y || 0)
            .attr("stroke-width", 2);

        // Add nodes (senses)
        const nodeSelection = svgGroup
            .append("g")
            .attr("stroke", "#fff")
            .attr("stroke-width", 2)
            .selectAll("circle")
            .data(nodes)
            .enter()
            .append("circle")
            .attr("cx", (d) => d.x!)
            .attr("cy", (d) => d.y!)
            .attr("r", (d) => (d.isCentral ? 15 : 10))
            .attr("fill", (d) => (d.isCentral ? "gold" : colorScale(d))) // Apply dynamic color
            .call(drag) // 🛠️ Reintroduced the missing drag function
            .on("mouseover", (event, d) => {
                tooltip
                    .style("visibility", "visible")
                    .text(d.label);
            })
            .on("mousemove", (event) => {
                tooltip
                    .style("top", `${event.pageY - 30}px`)
                    .style("left", `${event.pageX + 10}px`);
            })
            .on("mouseout", () => {
                tooltip.style("visibility", "hidden");
            });

        return () => {};
    }, [teaData]);

    return (
        <section ref={containerRef} style={{ width: "100%", height: "600px", position: "relative" }}>
            {graphData.nodes.length === 0 && <p style={{ position: "absolute", top: "10px", left: "10px" }}>No sense data available</p>}
            <svg ref={svgRef} />
        </section>
    );
};

/**
 * D3 drag behavior function.
 */
const drag = d3
    .drag<SVGCircleElement, SenseNode>()
    .on("start", (event, d) => {
        if (!d.isCentral) {
            d.fx = d.x;
            d.fy = d.y;
        }
    })
    .on("drag", (event, d) => {
        if (!d.isCentral) {
            d.fx = event.x;
            d.fy = event.y;
            d3.select(event.sourceEvent.target)
                .attr("cx", event.x)
                .attr("cy", event.y);
        }
    })
    .on("end", (event, d) => {
        if (!d.isCentral) {
            d.fx = null;
            d.fy = null;
        }
    });

export default SensesNetworkSection;
