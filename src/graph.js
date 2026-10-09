// State graph visualization — SVG-based, no external libraries

import { formatLR0Item, formatLR1Item } from './items.js';

/**
 * Render the state graph as an SVG element.
 * Uses a simple layered layout — no physics engine needed.
 * @param {{ states: object[] }} collection
 * @param {string} parserType — 'LR0', 'SLR1', 'CLR1', 'LALR1'
 * @param {import('./grammar.js').Production[]} productions
 * @param {HTMLElement} container
 */
export function graphNodeSummary(state, productions, formatItem) {
  const items = state.items.map(item => formatItem(item, productions));
  const lines = items.slice(0, 3).map(line => line.length > 46 ? `${line.slice(0, 43)}…` : line);
  if (items.length > 3) lines.push(`+ ${items.length - 3} more items`);
  return lines;
}

export function renderGraph(collection, parserType, productions, container, onStateClick = null) {
  container.innerHTML = '<h3>State Graph</h3>';
  const { states } = collection;
  if (states.length === 0) return;

  const useLR1 = parserType === 'CLR1' || parserType === 'LALR1';
  const formatItem = useLR1 ? formatLR1Item : formatLR0Item;

  // A short node summary keeps the graph readable; full items remain in the inspector.
  const nodeData = states.map(state => {
    const lines = graphNodeSummary(state, productions, formatItem);
    const title = `I${state.id}`;
    const maxLen = Math.max(title.length, ...lines.map(l => l.length));
    const width = Math.max(160, maxLen * 7.2 + 24);
    const height = 28 + lines.length * 18 + 8;
    return { id: state.id, title, lines, width, height };
  });

  // Breadth-first layers place most GOTO edges between adjacent rows.
  const byId = new Map(nodeData.map(node => [node.id, node]));
  const stateById = new Map(states.map(state => [state.id, state]));
  const depth = new Map([[states[0].id, 0]]);
  const queue = [states[0].id];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    for (const target of stateById.get(id)?.transitions.values() || []) {
      if (stateById.has(target) && !depth.has(target)) {
        depth.set(target, depth.get(id) + 1);
        queue.push(target);
      }
    }
  }
  for (const state of states) if (!depth.has(state.id)) depth.set(state.id, Math.max(...depth.values()) + 1);
  const layers = [];
  for (const node of nodeData) {
    const level = depth.get(node.id);
    (layers[level] ||= []).push(node);
  }
  const padX = 55, padY = 45;
  const cellW = Math.max(...nodeData.map(n => n.width)) + 90;
  const cellH = Math.max(...nodeData.map(n => n.height)) + 90;
  const cols = Math.max(...layers.map(layer => layer?.length || 0));
  const svgW = cols * cellW + padX * 2 + 60;
  const svgH = layers.length * cellH + padY * 2;
  layers.forEach((layer, row) => layer?.forEach((node, col) => {
    node.x = padX + (cols - layer.length) * cellW / 2 + col * cellW;
    node.y = padY + row * cellH;
  }));

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', svgW);
  svg.setAttribute('height', svgH);
  svg.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);
  svg.style.maxWidth = 'none';
  svg.style.height = 'auto';

  // Defs for arrowhead
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
  marker.setAttribute('id', 'arrowhead');
  marker.setAttribute('markerWidth', '10');
  marker.setAttribute('markerHeight', '7');
  marker.setAttribute('refX', '10');
  marker.setAttribute('refY', '3.5');
  marker.setAttribute('orient', 'auto');
  const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
  polygon.setAttribute('fill', '#555');
  marker.appendChild(polygon);
  defs.appendChild(marker);
  svg.appendChild(defs);

  // Draw edges
  for (const state of states) {
    const from = byId.get(state.id);
    for (const [sym, targetId] of state.transitions) {
      const to = byId.get(targetId);
      if (!to) continue;
      let pathData, labelX, labelY;
      if (from.id === to.id) {
        const x = from.x + from.width;
        const y = from.y + from.height / 2;
        pathData = `M ${x} ${y - 8} C ${x + 55} ${y - 65}, ${x + 55} ${y + 65}, ${x} ${y + 8}`;
        labelX = x + 45; labelY = y - 52;
      } else if (to.y > from.y) {
        const x1 = from.x + from.width / 2, y1 = from.y + from.height;
        const x2 = to.x + to.width / 2, y2 = to.y - 5;
        pathData = `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`;
        labelX = (x1 + x2) / 2; labelY = (y1 + y2) / 2 - 6;
      } else {
        const x1 = from.x + from.width, y1 = from.y + from.height / 2;
        const x2 = to.x + to.width, y2 = to.y + to.height / 2;
        const routeX = Math.max(x1, x2) + 35;
        pathData = `M ${x1} ${y1} C ${routeX} ${y1}, ${routeX} ${y2}, ${x2 + 5} ${y2}`;
        labelX = routeX; labelY = (y1 + y2) / 2 - 6;
      }
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathData);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', '#888');
      path.setAttribute('stroke-width', '1.5');
      path.setAttribute('marker-end', 'url(#arrowhead)');
      svg.appendChild(path);

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', labelX);
      text.setAttribute('y', labelY);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-size', '11');
      text.setAttribute('fill', '#2563eb');
      text.setAttribute('font-weight', 'bold');
      text.textContent = sym;
      svg.appendChild(text);
    }
  }

  // Draw nodes
  for (const node of nodeData) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    if (onStateClick) {
      g.style.cursor = 'pointer';
      g.setAttribute('role', 'button');
      g.setAttribute('tabindex', '0');
      g.setAttribute('aria-label', `Inspect state I${node.id}`);
      g.addEventListener('click', () => onStateClick(node.id));
      g.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') onStateClick(node.id);
      });
    }

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', node.x);
    rect.setAttribute('y', node.y);
    rect.setAttribute('width', node.width);
    rect.setAttribute('height', node.height);
    rect.setAttribute('rx', '6');
    rect.setAttribute('ry', '6');
    rect.setAttribute('fill', node.id === 0 ? '#e0f2fe' : '#fff');
    rect.setAttribute('stroke', '#64748b');
    rect.setAttribute('stroke-width', '1.5');
    g.appendChild(rect);

    // Title bar
    const titleRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    titleRect.setAttribute('x', node.x);
    titleRect.setAttribute('y', node.y);
    titleRect.setAttribute('width', node.width);
    titleRect.setAttribute('height', '24');
    titleRect.setAttribute('rx', '6');
    titleRect.setAttribute('ry', '6');
    titleRect.setAttribute('fill', '#334155');
    g.appendChild(titleRect);

    // Fix bottom corners of title bar
    const coverRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    coverRect.setAttribute('x', node.x);
    coverRect.setAttribute('y', node.y + 18);
    coverRect.setAttribute('width', node.width);
    coverRect.setAttribute('height', '6');
    coverRect.setAttribute('fill', '#334155');
    g.appendChild(coverRect);

    const titleText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    titleText.setAttribute('x', node.x + 8);
    titleText.setAttribute('y', node.y + 16);
    titleText.setAttribute('font-size', '12');
    titleText.setAttribute('font-weight', 'bold');
    titleText.setAttribute('fill', '#fff');
    titleText.textContent = node.title;
    g.appendChild(titleText);

    // Items
    for (let j = 0; j < node.lines.length; j++) {
      const itemText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      itemText.setAttribute('x', node.x + 8);
      itemText.setAttribute('y', node.y + 40 + j * 18);
      itemText.setAttribute('font-size', '11');
      itemText.setAttribute('fill', '#1e293b');
      itemText.setAttribute('font-family', 'monospace');
      itemText.textContent = node.lines[j];
      g.appendChild(itemText);
    }

    svg.appendChild(g);
  }

  container.appendChild(svg);
}
