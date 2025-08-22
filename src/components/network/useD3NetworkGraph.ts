import { useEffect } from 'react'
import * as d3 from 'd3'

export interface GraphNode extends d3.SimulationNodeDatum {
  id: string
  label: string
  lang: string
  color?: string
  expansion?: string
}

export interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode
  target: string | GraphNode
  type?: string
}

/**
 * Custom hook to render and manage a D3 force-directed network graph.
 * Handles zoom, drag, and tooltips.
 * @param svgRef - Ref to the SVG element
 * @param wrapperRef - Ref to the container div
 * @param nodes - Array of graph nodes
 * @param links - Array of graph links
 */
export function useD3NetworkGraph(
  svgRef: React.RefObject<SVGSVGElement>,
  wrapperRef: React.RefObject<HTMLDivElement>,
  nodes: GraphNode[],
  links: GraphLink[],
) {
  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = wrapperRef.current?.clientWidth || window.innerWidth
    const height = wrapperRef.current?.clientHeight || window.innerHeight

    const g = svg.append('g')

    // TODO [HIGH LEVEL]: Zoom-to-fit and saved camera states for sharable links and lecture mode.
    // TODO [LOW LEVEL]: Compute graph bounds and apply zoom.transform to fit; expose getter/setter for camera state.

    // Zoom behavior
    // @ts-expect-error: D3 zoom type mismatch workaround
    svg.call(zoom)
    // Center the zoom after initialization
    // @ts-expect-error: D3 zoom type mismatch workaround
    svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(1))

    // D3 force simulation
    const simulation = d3
      .forceSimulation<GraphNode>(nodes)
      .force(
        'link',
        d3
          .forceLink<GraphNode, GraphLink>(links)
          .id(d => d.id)
          .distance(120),
      )
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .alphaDecay(0.03)

    // Draw links
    const link = g
      .append('g')
      .attr('stroke', '#aaa')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke-width', 2)
      .attr('stroke', d => {
        switch (d.type) {
          case 'inh':
            return '#00ffff'
          case 'der':
            return '#00ff00'
          case 'cog':
            return '#ffa500'
          case 'doublet':
            return '#ff00ff'
          default:
            return '#aaa'
        }
      })
      .attr('stroke-dasharray', d => (d.type === 'cog' ? '4 2' : d.type === 'doublet' ? '6 3' : ''))

    // Tooltip div
    const tooltip = d3
      .select(wrapperRef.current)
      .append('div')
      .style('position', 'absolute')
      .style('padding', '8px')
      .style('background', 'rgba(0, 0, 0, 0.8)')
      .style('color', '#fff')
      .style('border-radius', '4px')
      .style('pointer-events', 'none')
      .style('opacity', 0)

    const showTooltip = (event: MouseEvent, d: GraphNode) => {
      tooltip
        .style('opacity', 1)
        // TODO [LOW LEVEL]: Enrich tooltip with definitions/examples and sense links.
        .html(`<strong>${d.label}</strong><br/>${d.expansion || 'No expansion available'}`)
        .style('left', `${event.pageX + 10}px`)
        .style('top', `${event.pageY + 10}px`)
    }

    const hideTooltip = () => {
      tooltip.style('opacity', 0)
    }

    // Draw nodes
    const node = g
      .append('g')
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)
      .selectAll('circle')
      .data(nodes)
      .join('circle')
      .attr('r', 10)
      .attr('fill', d => d.color || 'gray')
      // @ts-expect-error: D3 drag type mismatch workaround
      .call(drag(simulation))
      .on('mouseover', (event, d) => showTooltip(event, d))
      .on('mousemove', event => {
        tooltip.style('left', `${event.pageX + 10}px`).style('top', `${event.pageY + 10}px`)
      })
      .on('mouseout', hideTooltip)

    // TODO [LOW LEVEL]: Support in-graph filtering (click a node to filter neighbors by type or distance; highlight by attribute).

    // Draw labels
    const label = g
      .append('g')
      .selectAll('text')
      .data(nodes)
      .join('text')
      .text(d => d.label)
      .attr('font-size', 12)
      .attr('dx', 14)
      .attr('dy', '.35em')
      .attr('fill', '#fff')

    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as GraphNode).x!)
        .attr('y1', d => (d.source as GraphNode).y!)
        .attr('x2', d => (d.target as GraphNode).x!)
        .attr('y2', d => (d.target as GraphNode).y!)

      node.attr('cx', d => d.x!).attr('cy', d => d.y!)

      label.attr('x', d => d.x!).attr('y', d => d.y!)
    })

    function drag(sim: d3.Simulation<GraphNode, GraphLink>) {
      return d3
        .drag<Element, GraphNode>()
        .on('start', (event, d) => {
          if (!event.active) sim.alphaTarget(0.3).restart()
          d.fx = d.x
          d.fy = d.y
        })
        .on('drag', (event, d) => {
          d.fx = event.x
          d.fy = event.y
        })
        .on('end', (event, d) => {
          if (!event.active) sim.alphaTarget(0)
          d.fx = null
          d.fy = null
        })
    }

    return () => {
      simulation.stop()
      tooltip.remove()
    }
  }, [svgRef, wrapperRef, nodes, links])
}
