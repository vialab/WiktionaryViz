import * as d3 from 'd3';
import { loadTranslations, getISO639_3 } from '../dataProcessing/translationLoader';

async function buildHierarchy(translations, languoidData) {
    const root = { name: "Root", children: [] };
    const familyMap = new Map();

    for (const translation of translations) {
        try {
            const iso639_3 = await getISO639_3(translation.code, translation.lang);
            if (!iso639_3) continue;

            const languageEntry = languoidData.find(d => d.iso639P3code === iso639_3);
            if (!languageEntry) continue;

            let currentId = languageEntry.id;
            let currentName = `${translation.lang}: ${translation.word}${translation.roman ? ` (${translation.roman})` : ''}`;
            let currentNode = { name: currentName, children: [] };
            let parentNode = currentNode;

            // Traverse up the chain
            while (currentId) {
                const entry = languoidData.find(d => d.id === currentId);
                if (!entry) break;

                if (familyMap.has(entry.id)) {
                    familyMap.get(entry.id).children.push(parentNode);
                    break;
                }

                const newNode = { name: entry.name, children: [parentNode] };
                familyMap.set(entry.id, newNode);
                currentId = entry.parent_id;
                parentNode = newNode;
            }

            if (!root.children.find(child => child.name === parentNode.name)) {
                root.children.push(parentNode);
            }
        } catch (error) {
            console.error(`Error processing translation ${translation.lang}`, error);
        }
    }

    return root;
}

export async function drawRadialChart(containerId) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const radius = Math.min(width, height) / 2;

    const svg = d3.select(`#${containerId}`)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .append('g')
        .attr('transform', `translate(${width / 2},${height / 2})`);

    const translations = await loadTranslations();
    const languoidData = await d3.csv('/languoid.csv');
    const hierarchyData = await buildHierarchy(translations, languoidData);

    const root = d3.hierarchy(hierarchyData).sum(d => d.children ? 0 : 1);
    const partition = d3.partition().size([2 * Math.PI, radius])(root);

    const color = d3.scaleOrdinal(d3.schemeCategory10);

    svg.selectAll('path')
        .data(root.descendants())
        .enter()
        .append('path')
        .attr('d', d3.arc()
            .startAngle(d => d.x0)
            .endAngle(d => d.x1)
            .innerRadius(d => d.y0)
            .outerRadius(d => d.y1)
        )
        .style('fill', d => color(d.data.name.split(":")[0]))
        .on('click', function(event, d) {
            d3.selectAll('.label').style('opacity', 0);
            d3.select(this.parentNode)
                .selectAll(`.label-${d.data.name.replace(/\s/g, '-')}`)
                .style('opacity', 1);
        });

    svg.selectAll('text')
        .data(root.descendants().filter(d => d.depth > 1))
        .enter()
        .append('text')
        .attr('class', d => `label label-${d.data.name.replace(/\s/g, '-')}`)
        .attr('transform', function(d) {
            const angle = (d.x0 + d.x1) / 2 * 180 / Math.PI - 90;
            const rotate = angle > 180 ? angle + 90 : angle - 90;
            return `rotate(${rotate}) translate(${d.y0 + 10}) rotate(${rotate > 90 ? 180 : 0})`;
        })
        .attr('dy', '0.35em')
        .style('text-anchor', 'middle')
        .style('font-size', '10px')
        .style('opacity', 0)
        .text(d => d.data.name.split(":")[0]);
}
