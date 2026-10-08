// Grammar parsing, validation, and augmentation

/**
 * @typedef {Object} Production
 * @property {number} id
 * @property {string} lhs
 * @property {string[]} rhs
 */

/**
 * Parse a grammar string into a list of productions.
 * Supports -> and →, alternatives with |, whitespace around symbols.
 * @param {string} input
 * @returns {{ productions: Production[], terminals: Set<string>, nonTerminals: Set<string>, startSymbol: string, errors: string[] }}
 */
export function parseGrammar(input) {
  const errors = [];
  const productions = [];
  let id = 0;

  if (!input || !input.trim()) {
    return { productions: [], terminals: new Set(), nonTerminals: new Set(), startSymbol: '', errors: ['Grammar is empty.'] };
  }

  const lines = input.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  if (lines.length === 0) {
    return { productions: [], terminals: new Set(), nonTerminals: new Set(), startSymbol: '', errors: ['No productions found.'] };
  }

  let startSymbol = '';

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    // Split on -> or →
    const arrowMatch = line.match(/^(.+?)\s*(?:->|→)\s*(.+)$/);
    if (!arrowMatch) {
      errors.push(`Line ${lineIdx + 1}: Invalid production "${line}". Expected format: A -> α`);
      continue;
    }

    const lhs = arrowMatch[1].trim();
    const rhsStr = arrowMatch[2].trim();

    if (!lhs) {
      errors.push(`Line ${lineIdx + 1}: Missing left-hand side.`);
      continue;
    }

    if (!rhsStr) {
      errors.push(`Line ${lineIdx + 1}: Missing right-hand side.`);
      continue;
    }

    if (startSymbol === '') {
      startSymbol = lhs;
    }

    // Split alternatives by |
    const alternatives = rhsStr.split('|');
    for (const alt of alternatives) {
      const trimmed = alt.trim();
      if (!trimmed) {
        errors.push(`Line ${lineIdx + 1}: Empty alternative in production.`);
        continue;
      }

      // Check for epsilon
      if (trimmed === 'ε' || trimmed === 'epsilon' || trimmed === 'ɛ') {
        productions.push({ id: id++, lhs, rhs: [] }); // empty rhs = epsilon
        continue;
      }

      const symbols = tokenizeRHS(trimmed);
      if (symbols.length === 0) {
        errors.push(`Line ${lineIdx + 1}: Cannot parse right-hand side "${trimmed}".`);
        continue;
      }
      productions.push({ id: id++, lhs, rhs: symbols });
    }
  }

  if (productions.length === 0 && errors.length === 0) {
    errors.push('No valid productions found.');
  }

  // Identify non-terminals and terminals
  const nonTerminals = new Set();
  for (const p of productions) {
    nonTerminals.add(p.lhs);
  }

  const terminals = new Set();
  for (const p of productions) {
    for (const sym of p.rhs) {
      if (!nonTerminals.has(sym)) {
        terminals.add(sym);
      }
    }
  }

  // Validate: check that every non-terminal used on RHS that isn't a terminal has a production
  for (const p of productions) {
    for (const sym of p.rhs) {
      // Symbols that are uppercase or multi-char starting with uppercase are non-terminals
      // Actually, we identify non-terminals by which symbols appear on LHS
      // So any RHS symbol not in nonTerminals is a terminal — that's fine
    }
  }

  return { productions, terminals, nonTerminals, startSymbol, errors };
}

/**
 * Tokenize a RHS string into symbols.
 * Multi-character symbols are supported: sequences of letters/digits/_ form one symbol.
 * Single special characters (+, *, (, ), etc.) form one symbol each.
 * @param {string} rhs
 * @returns {string[]}
 */
function tokenizeRHS(rhs) {
  const tokens = [];
  let i = 0;
  while (i < rhs.length) {
    if (rhs[i] === ' ' || rhs[i] === '\t') {
      i++;
      continue;
    }
    // Check for quoted terminal like 'a' or "a" — not needed for this project, skip
    // Alphanumeric / underscore / prime (') sequences
    if (/[A-Za-z0-9_]/.test(rhs[i])) {
      let start = i;
      while (i < rhs.length && /[A-Za-z0-9_']/.test(rhs[i])) {
        i++;
      }
      tokens.push(rhs.substring(start, i));
    } else {
      // Single-character symbol (operator, parenthesis, etc.)
      tokens.push(rhs[i]);
      i++;
    }
  }
  return tokens;
}

/**
 * Validate a parsed grammar.
 * @param {{ productions: Production[], terminals: Set<string>, nonTerminals: Set<string>, startSymbol: string }} grammar
 * @returns {string[]} validation errors
 */
export function validateGrammar(grammar) {
  const errors = [];
  if (grammar.productions.length === 0) {
    errors.push('Grammar has no productions.');
    return errors;
  }
  if (!grammar.startSymbol) {
    errors.push('No start symbol found.');
  }

  // Check for non-terminals on RHS that have no productions
  const defined = new Set(grammar.productions.map(p => p.lhs));
  for (const p of grammar.productions) {
    for (const sym of p.rhs) {
      if (grammar.nonTerminals.has(sym) && !defined.has(sym)) {
        errors.push(`Non-terminal "${sym}" is used but has no production.`);
      }
    }
  }

  return errors;
}

/**
 * Augment the grammar by adding S' -> S.
 * Chooses a fresh start symbol that doesn't collide.
 * @param {{ productions: Production[], terminals: Set<string>, nonTerminals: Set<string>, startSymbol: string }} grammar
 * @returns {{ productions: Production[], terminals: Set<string>, nonTerminals: Set<string>, startSymbol: string, augmentedStart: string }}
 */
export function augmentGrammar(grammar) {
  let augStart = grammar.startSymbol + "'";
  while (grammar.nonTerminals.has(augStart)) {
    augStart += "'";
  }

  const augProduction = { id: 0, lhs: augStart, rhs: [grammar.startSymbol] };

  // Re-number all existing productions starting from 1
  const newProductions = [augProduction];
  for (let i = 0; i < grammar.productions.length; i++) {
    newProductions.push({ ...grammar.productions[i], id: i + 1 });
  }

  const newNonTerminals = new Set(grammar.nonTerminals);
  newNonTerminals.add(augStart);

  return {
    productions: newProductions,
    terminals: new Set(grammar.terminals),
    nonTerminals: newNonTerminals,
    startSymbol: grammar.startSymbol,
    augmentedStart: augStart,
  };
}

/**
 * Format a production as a string.
 * @param {Production} prod
 * @returns {string}
 */
export function productionToString(prod) {
  return `${prod.lhs} → ${prod.rhs.length === 0 ? 'ε' : prod.rhs.join(' ')}`;
}
