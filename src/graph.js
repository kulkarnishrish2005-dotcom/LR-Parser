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
export function renderGraph(collection, parserType, productions, container) {
  container.innerHTML = '';
  const { states } = collection;
  if (states.length === 0) return;

  const useLR1 = parserType === 'CLR1' || parserType === 'LALR1';
  const formatItem = useLR1 ? formatLR1Item : formatLR0Item;

  // Measure text to size nodes
  const nodeData = states.map(state => {
    const lines = state.items.map(item => formatItem(item, productions));
    const title = `I${state.id}`;
    const maxLen = Math.max(title.length, ...lines.map(l => l.length));
    const width = Math.max(140, maxLen * 8 + 24);
    const height = 28 + lines.length * 18 + 8;
    return { id: state.id, title, lines, width, height };
  });

  // Simple grid layout
  const cols = Math.max(1, Math.ceil(Math.sqrt(states.length)));
  const padX = 40, padY = 40;
  const cellW = Math.max(...nodeData.map(n => n.width)) + padX;
  const cellH = Math.max(...nodeData.map(n => n.height)) + padY;

  nodeData.forEach((node, i) => {
    node.x = (i % cols) * cellW + padX;
    node.y = Math.floor(i / cols) * cellH + padY;
  });

  const svgW = cols * cellW + padX * 2;
  const svgH = (Math.ceil(states.length / cols)) * cellH + padY * 2;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', svgW);
  svg.setAttribute('height', svgH);
  svg.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);
  svg.style.maxWidth = '100%';
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
    const from = nodeData[state.id];
    for (const [sym, targetId] of state.transitions) {
      const to = nodeData[targetId];
      const fromCx = from.x + from.width / 2;
      const fromCy = from.y + from.height / 2;
      const toCx = to.x + to.width / 2;
      const toCy = to.y + to.height / 2;

      // Calculate edge endpoint on node boundary
      const dx = toCx - fromCx;
      const dy = toCy - fromCy;

      if (dx === 0 && dy === 0) continue; // self-loop — skip for simplicity

      const dist = Math.sqrt(dx * dx + dy * dy);
      const nx = dx / dist;
      const ny = dy / dist;

      // Offset start/end to node boundaries
      const x1 = fromCx + nx * (from.width / 2);
      const y1 = fromCy + ny * (from.height / 2);
      const x2 = toCx - nx * (to.width / 2 + 5);
      const y2 = toCy - ny * (to.height / 2 + 5);

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', x1);
      line.setAttribute('y1', y1);
      line.setAttribute('x2', x2);
      line.setAttribute('y2', y2);
      line.setAttribute('stroke', '#888');
      line.setAttribute('stroke-width', '1.5');
      line.setAttribute('marker-end', 'url(#arrowhead)');
      svg.appendChild(line);

      // Label
      const labelX = (x1 + x2) / 2;
      const labelY = (y1 + y2) / 2 - 6;
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
