// src/visualizations/networkGraphSenseGloss.js

import * as d3 from 'd3';
import { loadSenses } from '../dataProcessing/senseLoader';

export async function drawNetworkGraph(containerId) {
    const data = await loadSenses();
    if (!data || !data.senses || !data.word) {
        console.error("Failed to load senses data or word.");
        return;
    }

    const { senses, word: centralWord } = data;

    const nodes = [];
    const links = [];
    const nodeMap = new Map();

    // Add the central node
    nodes.push({ id: centralWord, group: 'central' });
    nodeMap.set(centralWord, { id: centralWord, group: 'central' });

    senses.forEach((sense) => {
        sense.senseid.forEach((senseid) => {
            if (!nodeMap.has(senseid)) {
                const node = { id: senseid, group: 'senseid' };
                nodes.push(node);
                nodeMap.set(senseid, node);
            }

            links.push({ source: centralWord, target: senseid });

            sense.glosses.forEach((gloss) => {
                if (!nodeMap.has(gloss)) {
                    const node = { id: gloss, group: 'gloss' };
                    nodes.push(node);
                    nodeMap.set(gloss, node);
                }
                links.push({ source: senseid, target: gloss });
            });
        });
    });

    d3.select(`#${containerId}`).selectAll('*').remove();

    const svg = d3
        .select(`#${containerId}`)
        .append('svg')
        .attr('width', '100vw')
        .attr('height', '100vh')
        .style('width', '100vw')
        .style('height', '100vh')
        .call(
            d3.zoom().on('zoom', (event) => {
                g.attr('transform', event.transform);
            })
        );

    const g = svg.append('g');

    const simulation = d3
        .forceSimulation(nodes)
        .force('link', d3.forceLink(links).id((d) => d.id).distance(120))
        .force('charge', d3.forceManyBody().strength(-300))
        .force('center', d3.forceCenter(window.innerWidth / 2, window.innerHeight / 2));

    // Draw links
    const link = g
        .append('g')
        .selectAll('line')
        .data(links)
        .enter()
        .append('line')
        .attr('stroke-width', 1.5)
        .attr('stroke', '#aaa');

    // Draw nodes with outlines
    const node = g
        .append('g')
        .selectAll('circle')
        .data(nodes)
        .enter()
        .append('circle')
        .attr('r', (d) => (d.group === 'central' ? 12 : 6)) // Larger radius for central node
        .attr('fill', (d) =>
            d.group === 'central' ? '#EE7A7AFF' : d.group === 'senseid' ? '#5EA3D1FF' : '#8CDD86FF'
        )
        .attr('stroke', '#fff') // White outline for better readability
        .attr('stroke-width', 1.5)
        .call(
            d3
                .drag()
                .on('start', (event, d) => {
                    if (!event.active) simulation.alphaTarget(0.3).restart();
                    d.fx = event.x;
                    d.fy = event.y;
                })
                .on('drag', (event, d) => {
                    d.fx = event.x;
                    d.fy = event.y;
                })
                .on('end', (event, d) => {
                    if (!event.active) simulation.alphaTarget(0);
                    d.fx = null;
                    d.fy = null;
                })
        );

    // Add labels and apply dynamic offset based on node position
    const label = g
        .append('g')
        .selectAll('text')
        .data(nodes)
        .enter()
        .append('text')
        .text((d) => d.id)
        .attr('font-size', (d) => (d.group === 'central' ? '12px' : '10px'))
        .attr('fill', '#333')
        .attr('text-anchor', 'middle');

    // Update positions on each tick
    simulation.on('tick', () => {
        link
            .attr('x1', (d) => d.source.x)
            .attr('y1', (d) => d.source.y)
            .attr('x2', (d) => d.target.x)
            .attr('y2', (d) => d.target.y);

        node.attr('cx', (d) => d.x).attr('cy', (d) => d.y);

        // Position the labels dynamically with an offset from the nodes
        label
            .attr('x', (d) => d.x + (d.x > window.innerWidth / 2 ? 15 : -15)) // Offset based on horizontal position
            .attr('y', (d) => d.y + (d.y > window.innerHeight / 2 ? 10 : -10)); // Offset based on vertical position
    });
}
