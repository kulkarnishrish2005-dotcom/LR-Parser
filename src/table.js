// ACTION/GOTO table construction for all parser types + conflict detection

import { isReduceItem, symbolAfterDot } from './items.js';

/**
 * @typedef {Object} Action
 * @property {string} type — 'shift' | 'reduce' | 'accept'
 * @property {number} [target] — state for shift, production id for reduce
 * @property {string} [prodStr] — human-readable production string for reduce
 */

/**
 * @typedef {Object} Conflict
 * @property {number} stateId
 * @property {string} symbol
 * @property {string} type — 'shift-reduce' | 'reduce-reduce'
 * @property {Action[]} actions
 */

/**
 * @typedef {Object} ParseTable
 * @property {Map<string, Action[]>} action — key: "stateId,symbol" → list of actions
 * @property {Map<string, number>} goto_ — key: "stateId,symbol" → target state
 * @property {Conflict[]} conflicts
 * @property {string[]} terminals — includes $
 * @property {string[]} nonTerminals — excludes augmented start
 * @property {object[]} steps — step-by-step table entries
 */

/**
 * Build the parsing table for a given parser type.
 * @param {string} parserType — 'LR0' | 'SLR1' | 'CLR1' | 'LALR1'
 * @param {{ states: object[] }} collection — canonical collection of states
 * @param {{ productions: Production[], terminals: Set<string>, nonTerminals: Set<string>, augmentedStart: string }} grammar
 * @param {Map<string, Set<string>>} [followSets] — needed for SLR(1)
 * @returns {ParseTable}
 */
export function buildParseTable(parserType, collection, grammar, followSets = null) {
  const grammarInfo = Array.isArray(grammar) ? (() => {
    const productions = grammar;
    const nonTerminals = new Set(productions.map(p => p.lhs));
    const terminals = new Set();
    for (const prod of productions) {
      for (const sym of prod.rhs) {
        if (!nonTerminals.has(sym)) terminals.add(sym);
      }
    }
    return {
      productions,
      terminals,
      nonTerminals,
      augmentedStart: null,
      startSymbol: productions[0]?.lhs || '',
    };
  })() : grammar;

  const { states } = collection;
  const { productions, augmentedStart: explicitAugStart } = grammarInfo || {};
  const startSymbol = grammarInfo?.startSymbol || 'S';
  const augmentedStart = explicitAugStart || (startSymbol.endsWith("'") ? startSymbol : `${startSymbol}'`);

  const action = new Map();  // "stateId,symbol" → Action[]
  const goto_ = new Map();   // "stateId,symbol" → number
  const conflicts = [];
  const steps = [];

  const terminalList = [...(grammarInfo?.terminals || new Set())].sort();
  if (!terminalList.includes('$')) terminalList.push('$');
  const ntList = [...(grammarInfo?.nonTerminals || new Set())].filter(nt => nt !== augmentedStart).sort();

  function addAction(stateId, symbol, newAction) {
    const key = `${stateId},${symbol}`;
    if (!action.has(key)) {
      action.set(key, []);
    }
    const existing = action.get(key);

    // Check for duplicate
    const isDup = existing.some(a =>
      a.type === newAction.type && a.target === newAction.target
    );
    if (isDup) return;

    existing.push(newAction);

    steps.push({
      type: 'action',
      stateId,
      symbol,
      action: newAction,
      isConflict: existing.length > 1,
    });

    if (existing.length > 1) {
      // Determine conflict type
      const hasShift = existing.some(a => a.type === 'shift');
      const reduceCount = existing.filter(a => a.type === 'reduce').length;
      let conflictType;
      if (hasShift && reduceCount > 0) {
        conflictType = 'shift-reduce';
      } else if (reduceCount > 1) {
        conflictType = 'reduce-reduce';
      } else {
        conflictType = 'shift-reduce';
      }

      // Remove old conflict for same cell if any
      const existingIdx = conflicts.findIndex(c => c.stateId === stateId && c.symbol === symbol);
      if (existingIdx >= 0) {
        conflicts.splice(existingIdx, 1);
      }
      conflicts.push({ stateId, symbol, type: conflictType, actions: [...existing] });
    }
  }

  for (const state of states) {
    for (const item of state.items) {
      const prod = productions.find(p => p.id === item.prodId);
      if (!prod) continue;

      const sym = symbolAfterDot(item, productions);

      if (sym !== null) {
        // Dot is not at the end
        const terminals = grammarInfo?.terminals || new Set();
        const nonTerminals = grammarInfo?.nonTerminals || new Set();

        if (terminals.has(sym) || sym === '$') {
          // SHIFT
          const target = state.transitions.get(sym);
          if (target !== undefined) {
            addAction(state.id, sym, { type: 'shift', target });
          }
        }
        if (nonTerminals.has(sym) && sym !== augmentedStart) {
          // GOTO
          const target = state.transitions.get(sym);
          if (target !== undefined) {
            const key = `${state.id},${sym}`;
            goto_.set(key, target);
            steps.push({ type: 'goto', stateId: state.id, symbol: sym, target });
          }
        }
      } else {
        // Dot at the end — reduce or accept
        if (prod.lhs === augmentedStart) {
          // ACCEPT
          addAction(state.id, '$', { type: 'accept' });
        } else {
          // REDUCE — depends on parser type
          const reduceAction = {
            type: 'reduce',
            target: prod.id,
            prodStr: `${prod.lhs} → ${prod.rhs.length === 0 ? 'ε' : prod.rhs.join(' ')}`,
          };

          if (parserType === 'LR0') {
            // Reduce for ALL terminals (including $)
            for (const t of terminalList) {
              addAction(state.id, t, reduceAction);
            }
          } else if (parserType === 'SLR1') {
            // Reduce only for FOLLOW(A)
            const followA = followSets.get(prod.lhs);
            if (followA) {
              for (const t of followA) {
                addAction(state.id, t, reduceAction);
              }
            }
          } else if (parserType === 'CLR1' || parserType === 'LALR1') {
            // Reduce only for the item's specific lookahead
            const la = item.lookahead;
            if (la) {
              addAction(state.id, la, reduceAction);
            }
          }
        }
      }
    }
  }

  return { action, goto_, conflicts, terminals: terminalList, nonTerminals: ntList, steps };
}

/**
 * Format an action for display.
 * @param {Action} act
 * @returns {string}
 */
export function formatAction(act) {
  switch (act.type) {
    case 'shift': return `s${act.target}`;
    case 'reduce': return `r${act.target}`;
    case 'accept': return 'acc';
    default: return '?';
  }
}

/**
 * Get the primary action for a cell (first one, if conflicts exist).
 * @param {Map<string, Action[]>} actionTable
 * @param {number} stateId
 * @param {string} symbol
 * @returns {Action|null}
 */
export function getAction(actionTable, stateId, symbol) {
  const key = `${stateId},${symbol}`;
  const actions = actionTable.get(key);
  if (!actions || actions.length === 0) return null;
  return actions[0];
}

/**
 * Get all actions for a cell.
 * @param {Map<string, Action[]>} actionTable
 * @param {number} stateId
 * @param {string} symbol
 * @returns {Action[]}
 */
export function getActions(actionTable, stateId, symbol) {
  const key = `${stateId},${symbol}`;
  return actionTable.get(key) || [];
}
