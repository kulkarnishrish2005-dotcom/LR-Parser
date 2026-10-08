// LR(0) closure, goto, and canonical collection construction

import { lr0ItemKey, lr0StateKey, symbolAfterDot } from './items.js';

/**
 * @typedef {Object} LR0State
 * @property {number} id
 * @property {import('./items.js').LR0Item[]} items
 * @property {Map<string, number>} transitions — symbol → state id
 */

/**
 * Compute LR(0) closure of an item set.
 * @param {import('./items.js').LR0Item[]} items
 * @param {import('./grammar.js').Production[]} productions
 * @param {Set<string>} nonTerminals
 * @returns {import('./items.js').LR0Item[]}
 */
export function lr0Closure(items, productions, nonTerminals) {
  const result = [...items];
  const added = new Set(items.map(lr0ItemKey));

  let i = 0;
  while (i < result.length) {
    const item = result[i];
    const sym = symbolAfterDot(item, productions);
    if (sym && nonTerminals.has(sym)) {
      for (const prod of productions) {
        if (prod.lhs === sym) {
          const newItem = { prodId: prod.id, dot: 0 };
          const key = lr0ItemKey(newItem);
          if (!added.has(key)) {
            added.add(key);
            result.push(newItem);
          }
        }
      }
    }
    i++;
  }

  // Sort for deterministic ordering
  result.sort((a, b) => a.prodId - b.prodId || a.dot - b.dot);
  return result;
}

/**
 * Compute LR(0) GOTO(I, X).
 * @param {import('./items.js').LR0Item[]} items
 * @param {string} symbol
 * @param {import('./grammar.js').Production[]} productions
 * @param {Set<string>} nonTerminals
 * @returns {import('./items.js').LR0Item[]}
 */
export function lr0Goto(items, symbol, productions, nonTerminals) {
  const kernel = [];
  for (const item of items) {
    const sym = symbolAfterDot(item, productions);
    if (sym === symbol) {
      kernel.push({ prodId: item.prodId, dot: item.dot + 1 });
    }
  }
  if (kernel.length === 0) return [];
  return lr0Closure(kernel, productions, nonTerminals);
}

/**
 * Build the LR(0) canonical collection.
 * Returns states and construction steps for step-by-step visualization.
 * @param {{ productions: Production[], terminals: Set<string>, nonTerminals: Set<string>, augmentedStart: string }} grammar
 * @returns {{ states: LR0State[], steps: object[] }}
 */
export function buildLR0Collection(grammar) {
  const { productions, terminals, nonTerminals, augmentedStart } = grammar;

  // Initial state: closure of [S' -> . S]
  const augProd = productions.find(p => p.lhs === augmentedStart);
  const initialItems = lr0Closure([{ prodId: augProd.id, dot: 0 }], productions, nonTerminals);
  const initialState = { id: 0, items: initialItems, transitions: new Map() };

  const states = [initialState];
  const stateMap = new Map(); // state key → state id
  stateMap.set(lr0StateKey(initialItems), 0);

  const steps = [{ type: 'state', stateId: 0, items: initialItems }];

  // All grammar symbols (sorted for determinism)
  const allSymbols = [...terminals, ...nonTerminals].sort();

  let worklist = [0];
  while (worklist.length > 0) {
    const stateId = worklist.shift();
    const state = states[stateId];

    for (const sym of allSymbols) {
      const gotoItems = lr0Goto(state.items, sym, productions, nonTerminals);
      if (gotoItems.length === 0) continue;

      const key = lr0StateKey(gotoItems);
      let targetId;

      if (stateMap.has(key)) {
        targetId = stateMap.get(key);
      } else {
        targetId = states.length;
        const newState = { id: targetId, items: gotoItems, transitions: new Map() };
        states.push(newState);
        stateMap.set(key, targetId);
        worklist.push(targetId);
        steps.push({ type: 'state', stateId: targetId, items: gotoItems });
      }

      state.transitions.set(sym, targetId);
      steps.push({ type: 'transition', from: stateId, to: targetId, symbol: sym });
    }
  }

  return { states, steps };
}
