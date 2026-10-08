// CLR(1) closure, goto, and canonical collection construction

import { lr1ItemKey, lr1StateKey, symbolAfterDot } from './items.js';
import { firstOfSequence } from './firstfollow.js';

/**
 * @typedef {Object} CLRState
 * @property {number} id
 * @property {import('./items.js').LR1Item[]} items
 * @property {Map<string, number>} transitions — symbol → state id
 */

/**
 * Compute CLR(1) closure of an LR(1) item set.
 * @param {import('./items.js').LR1Item[]} items
 * @param {import('./grammar.js').Production[]} productions
 * @param {Set<string>} nonTerminals
 * @param {Map<string, Set<string>>} firstSets
 * @returns {import('./items.js').LR1Item[]}
 */
export function clrClosure(items, productions, nonTerminals, firstSets) {
  const result = [...items];
  const added = new Set(items.map(lr1ItemKey));

  let i = 0;
  while (i < result.length) {
    const item = result[i];
    const prod = productions.find(p => p.id === item.prodId);
    const sym = symbolAfterDot(item, productions);

    if (sym && nonTerminals.has(sym)) {
      // For [A -> α . B β, a], compute FIRST(βa)
      const beta = prod.rhs.slice(item.dot + 1);
      const betaA = [...beta, item.lookahead];
      const lookaheads = firstOfSequence(betaA, firstSets);
      // Remove ε — shouldn't appear but be safe
      lookaheads.delete('ε');

      for (const bProd of productions) {
        if (bProd.lhs === sym) {
          for (const la of lookaheads) {
            const newItem = { prodId: bProd.id, dot: 0, lookahead: la };
            const key = lr1ItemKey(newItem);
            if (!added.has(key)) {
              added.add(key);
              result.push(newItem);
            }
          }
        }
      }
    }
    i++;
  }

  // Sort for deterministic ordering
  result.sort((a, b) => a.prodId - b.prodId || a.dot - b.dot || a.lookahead.localeCompare(b.lookahead));
  return result;
}

/**
 * Compute CLR(1) GOTO(I, X).
 * @param {import('./items.js').LR1Item[]} items
 * @param {string} symbol
 * @param {import('./grammar.js').Production[]} productions
 * @param {Set<string>} nonTerminals
 * @param {Map<string, Set<string>>} firstSets
 * @returns {import('./items.js').LR1Item[]}
 */
export function clrGoto(items, symbol, productions, nonTerminals, firstSets) {
  const kernel = [];
  for (const item of items) {
    const sym = symbolAfterDot(item, productions);
    if (sym === symbol) {
      kernel.push({ prodId: item.prodId, dot: item.dot + 1, lookahead: item.lookahead });
    }
  }
  if (kernel.length === 0) return [];
  return clrClosure(kernel, productions, nonTerminals, firstSets);
}

/**
 * Build the CLR(1) canonical collection.
 * @param {{ productions: Production[], terminals: Set<string>, nonTerminals: Set<string>, augmentedStart: string }} grammar
 * @param {Map<string, Set<string>>} firstSets
 * @returns {{ states: CLRState[], steps: object[] }}
 */
export function buildCLRCollection(grammar, firstSets) {
  const { productions, terminals, nonTerminals, augmentedStart } = grammar;

  const augProd = productions.find(p => p.lhs === augmentedStart);
  const initialItems = clrClosure(
    [{ prodId: augProd.id, dot: 0, lookahead: '$' }],
    productions, nonTerminals, firstSets
  );
  const initialState = { id: 0, items: initialItems, transitions: new Map() };

  const states = [initialState];
  const stateMap = new Map();
  stateMap.set(lr1StateKey(initialItems), 0);

  const steps = [{ type: 'state', stateId: 0, items: initialItems }];

  const allSymbols = [...terminals, ...nonTerminals].sort();

  let worklist = [0];
  while (worklist.length > 0) {
    const stateId = worklist.shift();
    const state = states[stateId];

    for (const sym of allSymbols) {
      const gotoItems = clrGoto(state.items, sym, productions, nonTerminals, firstSets);
      if (gotoItems.length === 0) continue;

      const key = lr1StateKey(gotoItems);
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
