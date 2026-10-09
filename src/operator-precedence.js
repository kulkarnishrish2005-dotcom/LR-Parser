// Operator precedence parser support kept separate from the LR engine.

function isEpsilon(symbol) {
  return symbol === 'ε' || symbol === 'epsilon' || symbol === 'ɛ';
}

function isTerminal(symbol, grammar) {
  if (!symbol || isEpsilon(symbol)) return false;
  return grammar.terminals?.has(symbol) ?? false;
}

function isNonTerminal(symbol, grammar) {
  return !!symbol && !isTerminal(symbol, grammar) && !!grammar.nonTerminals?.has(symbol);
}

function getRulesByLhs(grammar, lhs) {
  return (grammar.productions || []).filter(p => p.lhs === lhs);
}

function computeNullable(grammar) {
  const nullable = new Set();
  let changed = true;

  while (changed) {
    changed = false;
    for (const prod of grammar.productions || []) {
      const rhs = prod.rhs || [];
      if (rhs.length === 0 || rhs.every(symbol => isEpsilon(symbol) || nullable.has(symbol))) {
        if (!nullable.has(prod.lhs)) {
          nullable.add(prod.lhs);
          changed = true;
        }
      }
    }
  }

  return nullable;
}

function computeFirstVTInternal(grammar) {
  const firstVT = new Map();
  for (const nt of grammar.nonTerminals || []) {
    firstVT.set(nt, new Set());
  }

  const nullable = computeNullable(grammar);
  let changed = true;

  while (changed) {
    changed = false;
    for (const prod of grammar.productions || []) {
      const lhs = prod.lhs;
      const rhs = prod.rhs || [];
      if (rhs.length === 0) continue;
      let canSkip = true;
      for (const symbol of rhs) {
        if (isEpsilon(symbol)) continue;
        if (isTerminal(symbol, grammar)) {
          if (!firstVT.get(lhs)?.has(symbol)) {
            firstVT.get(lhs)?.add(symbol);
            changed = true;
          }
          canSkip = false;
          break;
        }
        if (isNonTerminal(symbol, grammar)) {
          const set = firstVT.get(symbol) || new Set();
          for (const term of set) {
            if (!firstVT.get(lhs)?.has(term)) {
              firstVT.get(lhs)?.add(term);
              changed = true;
            }
          }
          if (!nullable.has(symbol)) {
            canSkip = false;
            break;
          }
          continue;
        }
        canSkip = false;
        break;
      }
      if (canSkip && !isTerminal(lhs, grammar) && lhs && !firstVT.get(lhs)?.has('ε')) {
        firstVT.get(lhs)?.add('ε');
      }
    }
  }

  for (const [nt, set] of firstVT.entries()) {
    set.delete('ε');
  }

  return firstVT;
}

function computeLastVTInternal(grammar) {
  const lastVT = new Map();
  for (const nt of grammar.nonTerminals || []) {
    lastVT.set(nt, new Set());
  }

  const nullable = computeNullable(grammar);
  let changed = true;

  while (changed) {
    changed = false;
    for (const prod of grammar.productions || []) {
      const lhs = prod.lhs;
      const rhs = prod.rhs || [];
      if (rhs.length === 0) continue;
      let canSkip = true;
      for (let i = rhs.length - 1; i >= 0; i--) {
        const symbol = rhs[i];
        if (isEpsilon(symbol)) continue;
        if (isTerminal(symbol, grammar)) {
          if (!lastVT.get(lhs)?.has(symbol)) {
            lastVT.get(lhs)?.add(symbol);
            changed = true;
          }
          canSkip = false;
          break;
        }
        if (isNonTerminal(symbol, grammar)) {
          const set = lastVT.get(symbol) || new Set();
          for (const term of set) {
            if (!lastVT.get(lhs)?.has(term)) {
              lastVT.get(lhs)?.add(term);
              changed = true;
            }
          }
          if (!nullable.has(symbol)) {
            canSkip = false;
            break;
          }
          continue;
        }
        canSkip = false;
        break;
      }
      if (canSkip && !isTerminal(lhs, grammar) && lhs && !lastVT.get(lhs)?.has('ε')) {
        lastVT.get(lhs)?.add('ε');
      }
    }
  }

  for (const [nt, set] of lastVT.entries()) {
    set.delete('ε');
  }

  return lastVT;
}

function addRelation(relations, left, right, relation, conflicts) {
  const row = relations.get(left) || new Map();
  const existing = row.get(right);
  if (existing === undefined) {
    row.set(right, relation);
    relations.set(left, row);
    return;
  }
  if (existing !== relation) {
    conflicts.push({ left, right, relations: [existing, relation] });
  }
}

export function computeFirstVT(grammar) {
  return computeFirstVTInternal(grammar);
}

export function computeLastVT(grammar) {
  return computeLastVTInternal(grammar);
}

export function buildOperatorPrecedenceModel(grammar) {
  const firstVT = computeFirstVT(grammar);
  const lastVT = computeLastVT(grammar);
  const relations = new Map();
  const conflicts = [];
  const terminals = Array.from(grammar.terminals || []);

  for (const terminal of terminals) {
    relations.set(terminal, new Map());
  }

  const setGlobalRelation = (left, right, rel) => {
    if (!left || !right || left === right) return;
    const leftRow = relations.get(left) || new Map();
    const existing = leftRow.get(right);
    if (existing === undefined) {
      leftRow.set(right, rel);
      relations.set(left, leftRow);
      return;
    }
    if (existing !== rel) {
      conflicts.push({ left, right, relations: [existing, rel] });
    }
  };

  // Sentinel values ensure the parser can start and terminate cleanly.
  for (const terminal of terminals) {
    setGlobalRelation('$', terminal, '<');
    setGlobalRelation(terminal, '$', '>');
  }

  for (const prod of grammar.productions || []) {
    const rhs = prod.rhs || [];
    for (let i = 0; i < rhs.length - 1; i++) {
      const left = rhs[i];
      const right = rhs[i + 1];

      if (isTerminal(left, grammar) && isTerminal(right, grammar)) {
        setGlobalRelation(left, right, '=');
      }

      if (isTerminal(left, grammar) && isNonTerminal(right, grammar)) {
        for (const term of firstVT.get(right) || []) {
          if (term !== 'ε') setGlobalRelation(left, term, '<');
        }
      }

      if (isNonTerminal(left, grammar) && isTerminal(right, grammar)) {
        for (const term of lastVT.get(left) || []) {
          if (term !== 'ε') setGlobalRelation(term, right, '>');
        }
      }

      if (isNonTerminal(left, grammar) && isNonTerminal(right, grammar)) {
        for (const leftTerm of lastVT.get(left) || []) {
          if (leftTerm === 'ε') continue;
          for (const rightTerm of firstVT.get(right) || []) {
            if (rightTerm === 'ε') continue;
            setGlobalRelation(leftTerm, rightTerm, '>');
          }
        }
      }
    }
  }

  const precedence = new Map();
  const defaultPrecedence = { '+': 10, '-': 10, '*': 20, '/': 20, '%': 20, '^': 30, '(': 0, ')': 0 };
  for (const terminal of terminals) {
    precedence.set(terminal, defaultPrecedence[terminal] ?? 50);
  }

  return {
    grammar,
    firstVT,
    lastVT,
    terminals,
    relations,
    conflicts,
    precedence,
  };
}

function getRelation(left, right, model) {
  if (!left || !right) return null;
  return model.relations.get(left)?.get(right) || null;
}

function isOperator(token, model) {
  if (!token || token === '(' || token === ')' || token === '$') return false;
  const isIdentifierLike = /^[A-Za-z_][A-Za-z0-9_]*$/.test(token);
  return model.terminals.includes(token) && !isIdentifierLike;
}

function shouldPopOperator(topOp, currentOp, model) {
  const relation = getRelation(topOp, currentOp, model);
  if (!relation) return false;
  const precedence = model.precedence || new Map();
  if (relation === '>') return true;
  if (relation === '=') return (precedence.get(topOp) ?? 0) >= (precedence.get(currentOp) ?? 0);
  if (relation === '<') return false;
  return false;
}

export function parseOperatorPrecedence(tokens, model) {
  const input = Array.isArray(tokens) ? tokens.filter(token => token !== '') : [];
  const output = [];
  const operatorStack = [];
  const steps = [];

  const record = (action, stackText, remainingText) => {
    steps.push({ stack: stackText, input: remainingText, action });
  };
  const reject = (error) => {
    steps.push({ stack: `${operatorStack.join(' ')} | ${output.join(' ')}`, input: '', action: `REJECT: ${error}` });
    return { steps, accepted: false, error };
  };

  for (const token of input) {
    const stackText = `${operatorStack.join(' ')} | ${output.join(' ')}`;
    const remainingText = input.slice(input.indexOf(token)).join(' ');

    if (token === '(') {
      operatorStack.push(token);
      record(`SHIFT (`, stackText, remainingText);
      continue;
    }

    if (token === ')') {
      let found = false;
      while (operatorStack.length > 0) {
        const op = operatorStack.pop();
        if (op === '(') {
          found = true;
          break;
        }
        output.push(op);
      }
      if (!found) {
        record('ERROR: missing opening parenthesis', stackText, remainingText);
        return reject('Missing opening parenthesis');
      }
      record(`REDUCE (...)`, stackText, remainingText);
      continue;
    }

    if (!isOperator(token, model)) {
      output.push(token);
      record(`SHIFT ${token}`, stackText, remainingText);
      continue;
    }

    while (
      operatorStack.length > 0 &&
      operatorStack[operatorStack.length - 1] !== '(' &&
      shouldPopOperator(operatorStack[operatorStack.length - 1], token, model)
    ) {
      output.push(operatorStack.pop());
    }

    operatorStack.push(token);
    record(`SHIFT ${token}`, stackText, remainingText);
  }

  while (operatorStack.length > 0) {
    const op = operatorStack.pop();
    if (op === '(') {
      return reject('Unbalanced parentheses');
    }
    output.push(op);
  }

  const evalStack = [];
  for (const item of output) {
    if (!isOperator(item, model)) {
      evalStack.push('operand');
      continue;
    }
    if (evalStack.length < 2) {
      return reject('Malformed operator precedence expression');
    }
    evalStack.pop();
    evalStack.pop();
    evalStack.push('expr');
  }

  const accepted = evalStack.length === 1;
  if (accepted) {
    steps.push({ stack: output.join(' '), input: '', action: 'ACCEPT' });
  } else {
    return reject('Expression rejected by the operator precedence parser');
  }

  return { steps, accepted, error: accepted ? null : 'Expression rejected by the operator precedence parser' };
}

export function buildOperatorPrecedenceTable(grammar) {
  return buildOperatorPrecedenceModel(grammar);
}
