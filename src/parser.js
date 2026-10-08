// String parsing engine — classic bottom-up LR parsing

import { getAction, formatAction } from './table.js';

/**
 * @typedef {Object} ParseStep
 * @property {string} stack — display string of the stack
 * @property {string} input — remaining input
 * @property {string} action — description of the action taken
 */

/**
 * Tokenize an input string for parsing.
 * Splits by whitespace; each token is matched against grammar terminals.
 * @param {string} input
 * @returns {string[]}
 */
export function tokenize(input) {
  if (!input || !input.trim()) return [];
  return input.trim().split(/\s+/);
}

/**
 * Parse a string using the given ACTION/GOTO table.
 * @param {string[]} tokens — input tokens
 * @param {import('./table.js').ParseTable} table
 * @param {import('./grammar.js').Production[]} productions
 * @returns {{ steps: ParseStep[], accepted: boolean, error: string|null }}
 */
export function parseString(tokens, table, productions = table?.productions || []) {
  const actionTable = table?.action || new Map();
  const gotoTable = table?.goto_ || new Map();
  const steps = [];

  // Stack holds alternating state numbers and symbols: [s0, sym, s1, sym, s2, ...]
  // We'll represent as an array of { type: 'state'|'symbol', value }
  const stack = [0]; // start with state 0
  const input = [...(Array.isArray(tokens) ? tokens : []), '$'];
  let pos = 0;

  const MAX_STEPS = 10000;
  let stepCount = 0;

  while (stepCount < MAX_STEPS) {
    stepCount++;
    const state = stack[stack.length - 1];
    const sym = input[pos];

    // Record current state
    const stackStr = formatStack(stack);
    const inputStr = input.slice(pos).join(' ');

    const act = getAction(actionTable, state, sym);

    if (!act) {
      steps.push({
        stack: stackStr,
        input: inputStr,
        action: `ERROR: No action for state ${state}, symbol "${sym}"`,
      });
      return {
        steps,
        accepted: false,
        error: `No ACTION exists for:\n\nState ${state}\nSymbol: ${sym}`,
      };
    }

    if (act.type === 'shift') {
      steps.push({
        stack: stackStr,
        input: inputStr,
        action: `SHIFT ${act.target}`,
      });
      stack.push(sym);
      stack.push(act.target);
      pos++;
    } else if (act.type === 'reduce') {
      const prod = productions.find(p => p.id === act.target);
      if (!prod) {
        steps.push({
          stack: stackStr,
          input: inputStr,
          action: `ERROR: Unknown production ${act.target}`,
        });
        return { steps, accepted: false, error: `Unknown production ID ${act.target}` };
      }

      const prodStr = `${prod.lhs} → ${prod.rhs.length === 0 ? 'ε' : prod.rhs.join(' ')}`;

      // Pop 2 * |rhs| elements from stack (symbol + state for each)
      const popCount = prod.rhs.length * 2;
      stack.splice(stack.length - popCount, popCount);

      const topState = stack[stack.length - 1];
      stack.push(prod.lhs);

      // Look up GOTO
      const gotoKey = `${topState},${prod.lhs}`;
      const gotoState = gotoTable.get(gotoKey);
      if (gotoState === undefined) {
        steps.push({
          stack: stackStr,
          input: inputStr,
          action: `REDUCE ${prodStr}`,
        });
        steps.push({
          stack: formatStack(stack),
          input: inputStr,
          action: `ERROR: No GOTO for state ${topState}, non-terminal "${prod.lhs}"`,
        });
        return {
          steps,
          accepted: false,
          error: `No GOTO exists for:\n\nState ${topState}\nNon-terminal: ${prod.lhs}`,
        };
      }

      stack.push(gotoState);

      steps.push({
        stack: stackStr,
        input: inputStr,
        action: `REDUCE ${prodStr}`,
      });
    } else if (act.type === 'accept') {
      steps.push({
        stack: stackStr,
        input: inputStr,
        action: 'ACCEPT',
      });
      return { steps, accepted: true, error: null };
    }
  }

  return {
    steps,
    accepted: false,
    error: 'Parser exceeded maximum step count. Possible infinite loop.',
  };
}

/**
 * Format the parser stack for display.
 * @param {Array} stack — alternating states and symbols
 * @returns {string}
 */
function formatStack(stack) {
  return stack.join(' ');
}
