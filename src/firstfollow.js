// FIRST and FOLLOW set computation

/**
 * Compute FIRST sets for all non-terminals.
 * @param {{ productions: Production[], terminals: Set<string>, nonTerminals: Set<string> }} grammar
 * @returns {Map<string, Set<string>>} map from non-terminal to its FIRST set
 */
export function computeFirstSets(grammar) {
  const first = new Map();

  // Initialize FIRST for all symbols
  for (const t of grammar.terminals) {
    first.set(t, new Set([t]));
  }
  for (const nt of grammar.nonTerminals) {
    first.set(nt, new Set());
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const prod of grammar.productions) {
      const before = first.get(prod.lhs).size;

      if (prod.rhs.length === 0) {
        // Epsilon production
        first.get(prod.lhs).add('ε');
      } else {
        const result = firstOfSequence(prod.rhs, first);
        for (const sym of result) {
          first.get(prod.lhs).add(sym);
        }
      }

      if (first.get(prod.lhs).size > before) {
        changed = true;
      }
    }
  }

  return first;
}

/**
 * Compute FIRST of a sequence of symbols.
 * @param {string[]} symbols
 * @param {Map<string, Set<string>>} firstSets
 * @returns {Set<string>}
 */
export function firstOfSequence(symbols, firstSets) {
  const result = new Set();

  if (symbols.length === 0) {
    result.add('ε');
    return result;
  }

  for (let i = 0; i < symbols.length; i++) {
    const sym = symbols[i];
    const symFirst = firstSets.get(sym);
    if (!symFirst) {
      // Unknown symbol — treat as terminal
      result.add(sym);
      return result;
    }
    for (const f of symFirst) {
      if (f !== 'ε') {
        result.add(f);
      }
    }
    if (!symFirst.has('ε')) {
      return result;
    }
  }

  // All symbols can derive epsilon
  result.add('ε');
  return result;
}

/**
 * Compute FOLLOW sets for all non-terminals.
 * @param {{ productions: Production[], terminals: Set<string>, nonTerminals: Set<string>, augmentedStart: string }} grammar
 * @param {Map<string, Set<string>>} firstSets
 * @returns {Map<string, Set<string>>} map from non-terminal to its FOLLOW set
 */
export function computeFollowSets(grammar, firstSets) {
  const follow = new Map();
  for (const nt of grammar.nonTerminals) {
    follow.set(nt, new Set());
  }

  const startSymbol = grammar.startSymbol || 'S';
  const augmentedStart = grammar.augmentedStart || (startSymbol.endsWith("'") ? startSymbol : `${startSymbol}'`);
  if (!follow.has(augmentedStart)) {
    follow.set(augmentedStart, new Set());
  }

  // $ is in FOLLOW of the start symbol (or augmented start when present)
  follow.get(augmentedStart).add('$');
  if (startSymbol !== augmentedStart) {
    if (!follow.has(startSymbol)) follow.set(startSymbol, new Set());
    follow.get(startSymbol).add('$');
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const prod of grammar.productions) {
      for (let i = 0; i < prod.rhs.length; i++) {
        const B = prod.rhs[i];
        if (!grammar.nonTerminals.has(B)) continue;

        const beta = prod.rhs.slice(i + 1);
        const firstBeta = firstOfSequence(beta, firstSets);

        const before = follow.get(B).size;

        // Add FIRST(β) - {ε} to FOLLOW(B)
        for (const f of firstBeta) {
          if (f !== 'ε') {
            follow.get(B).add(f);
          }
        }

        // If ε ∈ FIRST(β), add FOLLOW(A) to FOLLOW(B)
        if (firstBeta.has('ε')) {
          const followA = follow.get(prod.lhs);
          if (followA) {
            for (const f of followA) {
              follow.get(B).add(f);
            }
          }
        }

        if (follow.get(B).size > before) {
          changed = true;
        }
      }
    }
  }

  return follow;
}
