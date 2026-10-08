// LR(0) and LR(1) item representation

/**
 * @typedef {Object} LR0Item
 * @property {number} prodId      — production id
 * @property {number} dot         — dot position (0 = before first symbol)
 */

/**
 * @typedef {Object} LR1Item
 * @property {number} prodId
 * @property {number} dot
 * @property {string} lookahead
 */

/**
 * Create a canonical string key for an LR(0) item.
 * @param {LR0Item} item
 * @returns {string}
 */
export function lr0ItemKey(item) {
  return `${item.prodId}:${item.dot}`;
}

/**
 * Create a canonical string key for an LR(1) item.
 * @param {LR1Item} item
 * @returns {string}
 */
export function lr1ItemKey(item) {
  return `${item.prodId}:${item.dot}:${item.lookahead}`;
}

/**
 * Create a canonical key for a set of LR(0) items (for state equality).
 * @param {LR0Item[]} items
 * @returns {string}
 */
export function lr0StateKey(items) {
  const keys = items.map(lr0ItemKey).sort();
  return keys.join('|');
}

/**
 * Create a canonical key for a set of LR(1) items (for state equality).
 * @param {LR1Item[]} items
 * @returns {string}
 */
export function lr1StateKey(items) {
  const keys = items.map(lr1ItemKey).sort();
  return keys.join('|');
}

/**
 * Get the LR(0) core key for a set of LR(1) items (for LALR merging).
 * @param {LR1Item[]} items
 * @returns {string}
 */
export function lr1CoreKey(items) {
  const keys = items.map(i => `${i.prodId}:${i.dot}`).sort();
  // Deduplicate (multiple lookaheads share the same core)
  return [...new Set(keys)].join('|');
}

/**
 * Format an LR(0) item as a string.
 * @param {LR0Item} item
 * @param {Production[]} productions
 * @returns {string}
 */
export function formatLR0Item(item, productions) {
  const prod = productions[item.prodId] || productions.find(p => p.id === item.prodId);
  if (!prod) return `???`;
  const rhs = [...prod.rhs];
  rhs.splice(item.dot, 0, '·');
  return `${prod.lhs} → ${rhs.join(' ')}`;
}

/**
 * Format an LR(1) item as a string.
 * @param {LR1Item} item
 * @param {Production[]} productions
 * @returns {string}
 */
export function formatLR1Item(item, productions) {
  const prod = productions[item.prodId] || productions.find(p => p.id === item.prodId);
  if (!prod) return `???`;
  const rhs = [...prod.rhs];
  rhs.splice(item.dot, 0, '·');
  return `[${prod.lhs} → ${rhs.join(' ')}, ${item.lookahead}]`;
}

/**
 * Get the symbol after the dot, or null if dot is at the end.
 * @param {{ prodId: number, dot: number }} item
 * @param {Production[]} productions
 * @returns {string|null}
 */
export function symbolAfterDot(item, productions) {
  const prod = productions.find(p => p.id === item.prodId);
  if (!prod || item.dot >= prod.rhs.length) return null;
  return prod.rhs[item.dot];
}

/**
 * Check if the dot is at the end (reduce item).
 * @param {{ prodId: number, dot: number }} item
 * @param {Production[]} productions
 * @returns {boolean}
 */
export function isReduceItem(item, productions) {
  const prod = productions.find(p => p.id === item.prodId);
  if (!prod) return false;
  return item.dot >= prod.rhs.length;
}
