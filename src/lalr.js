// LALR(1) construction by merging CLR(1) states with identical LR(0) cores

import { lr1CoreKey } from './items.js';

/**
 * @typedef {Object} LALRState
 * @property {number} id
 * @property {import('./items.js').LR1Item[]} items
 * @property {Map<string, number>} transitions
 * @property {number[]} mergedFrom — original CLR state IDs
 */

/**
 * Build LALR(1) states by merging CLR(1) states with identical cores.
 * @param {{ states: import('./clr.js').CLRState[] }} clrCollection
 * @returns {{ states: LALRState[], steps: object[], clrToLalr: Map<number, number> }}
 */
export function buildLALRFromCLR(clrCollection) {
  const { states: clrStates } = clrCollection;

  // Group CLR states by their LR(0) core
  const coreGroups = new Map(); // core key → [clr state indices]
  for (const state of clrStates) {
    const key = lr1CoreKey(state.items);
    if (!coreGroups.has(key)) {
      coreGroups.set(key, []);
    }
    coreGroups.get(key).push(state.id);
  }

  // Sort groups by the minimum CLR state id for deterministic numbering
  const sortedGroups = [...coreGroups.values()].sort((a, b) => Math.min(...a) - Math.min(...b));

  // Map CLR state id → LALR state id
  const clrToLalr = new Map();
  const lalrStates = [];
  const steps = [];

  for (let lalrId = 0; lalrId < sortedGroups.length; lalrId++) {
    const group = sortedGroups[lalrId];
    for (const clrId of group) {
      clrToLalr.set(clrId, lalrId);
    }

    // Merge items: same core, union of lookaheads
    const mergedItemsMap = new Map(); // "prodId:dot" → Set of lookaheads
    for (const clrId of group) {
      const clrState = clrStates[clrId];
      for (const item of clrState.items) {
        const coreKey = `${item.prodId}:${item.dot}`;
        if (!mergedItemsMap.has(coreKey)) {
          mergedItemsMap.set(coreKey, new Set());
        }
        mergedItemsMap.get(coreKey).add(item.lookahead);
      }
    }

    // Convert back to LR(1) items
    const items = [];
    const sortedCoreKeys = [...mergedItemsMap.keys()].sort();
    for (const coreKey of sortedCoreKeys) {
      const [prodId, dot] = coreKey.split(':').map(Number);
      const lookaheads = [...mergedItemsMap.get(coreKey)].sort();
      for (const la of lookaheads) {
        items.push({ prodId, dot, lookahead: la });
      }
    }

    lalrStates.push({
      id: lalrId,
      items,
      transitions: new Map(),
      mergedFrom: [...group].sort(),
    });

    steps.push({
      type: 'state',
      stateId: lalrId,
      items,
      mergedFrom: [...group].sort(),
    });
  }

  // Remap transitions
  for (const lalrState of lalrStates) {
    const firstClrId = lalrState.mergedFrom[0];
    const clrState = clrStates[firstClrId];
    for (const [sym, clrTarget] of clrState.transitions) {
      const lalrTarget = clrToLalr.get(clrTarget);
      lalrState.transitions.set(sym, lalrTarget);
      steps.push({ type: 'transition', from: lalrState.id, to: lalrTarget, symbol: sym });
    }
  }

  return { states: lalrStates, steps, clrToLalr };
}
