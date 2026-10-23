// Grammar-based operator-precedence construction and shift/reduce parsing.

const terminal = (s, g) => g.terminals.has(s);
const nonterminal = (s, g) => g.nonTerminals.has(s);

function computeVT(grammar, reverse) {
  const sets = new Map([...grammar.nonTerminals].map(nt => [nt, new Set()]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const { lhs, rhs } of grammar.productions) {
      const symbols = reverse ? [...rhs].reverse() : rhs;
      const [first, second] = symbols;
      const additions = [];
      if (terminal(first, grammar)) additions.push(first);
      if (nonterminal(first, grammar)) {
        if (terminal(second, grammar)) additions.push(second);
        additions.push(...sets.get(first));
      }
      for (const t of additions) {
        if (!sets.get(lhs).has(t)) { sets.get(lhs).add(t); changed = true; }
      }
    }
  }
  return sets;
}

export const computeFirstVT = grammar => computeVT(grammar, false);
export const computeLastVT = grammar => computeVT(grammar, true);

export function buildOperatorPrecedenceModel(grammar) {
  const firstVT = computeFirstVT(grammar);
  const lastVT = computeLastVT(grammar);
  const terminals = [...grammar.terminals, '$'];
  const relations = new Map(terminals.map(t => [t, new Map()]));
  const conflicts = [];
  const errors = [];

  for (const { lhs, rhs } of grammar.productions) {
    if (!rhs.length) errors.push(`${lhs} has an epsilon production.`);
    for (let i = 0; i < rhs.length - 1; i++) {
      if (nonterminal(rhs[i], grammar) && nonterminal(rhs[i + 1], grammar)) {
        errors.push(`${lhs} has adjacent nonterminals ${rhs[i]} ${rhs[i + 1]}.`);
      }
    }
  }
  if (grammar.terminals.has('$')) errors.push('$ is reserved as the input end marker.');

  function add(left, right, relation) {
    const row = relations.get(left);
    if (!row) return;
    const old = row.get(right);
    if (old && old !== relation) {
      const conflict = conflicts.find(c => c.left === left && c.right === right);
      if (conflict) {
        if (!conflict.relations.includes(relation)) conflict.relations.push(relation);
      } else conflicts.push({ left, right, relations: [old, relation] });
    } else row.set(right, relation);
  }

  for (const { rhs } of grammar.productions) {
    for (let i = 0; i < rhs.length - 1; i++) {
      const a = rhs[i], b = rhs[i + 1], c = rhs[i + 2];
      if (terminal(a, grammar) && terminal(b, grammar)) add(a, b, '=');
      if (terminal(a, grammar) && nonterminal(b, grammar)) {
        for (const t of firstVT.get(b)) add(a, t, '<');
      }
      if (nonterminal(a, grammar) && terminal(b, grammar)) {
        for (const t of lastVT.get(a)) add(t, b, '>');
      }
      if (terminal(a, grammar) && nonterminal(b, grammar) && terminal(c, grammar)) add(a, c, '=');
    }
  }
  for (const t of firstVT.get(grammar.startSymbol) || []) add('$', t, '<');
  for (const t of lastVT.get(grammar.startSymbol) || []) add(t, '$', '>');

  return { grammar, firstVT, lastVT, terminals, relations, conflicts, errors };
}

export function parseOperatorPrecedence(tokens, model) {
  const { grammar, relations, conflicts, errors } = model;
  const input = Array.isArray(tokens) ? tokens.filter(Boolean) : [];
  const embeddedEnd = input.indexOf('$');
  if (embeddedEnd === input.length - 1) input.pop();
  input.push('$');
  const stack = [{ terminal: '$' }];
  const steps = [];
  let pos = 0;
  const show = () => stack.map(x => x.terminal ?? `{${[...x.roots].join('/')}}`).join(' ');
  const record = action => steps.push({ stack: show(), input: input.slice(pos).join(' '), action });
  const reject = error => {
    record(`REJECT: ${error}`);
    return { steps, accepted: false, error };
  };
  if (errors.length) return reject(errors.join(' '));
  if (conflicts.length) return reject('The precedence table has conflicting relations.');
  if (embeddedEnd >= 0 && embeddedEnd !== input.length - 1) return reject('$ may appear only at the end of the input.');
  const unknown = input.slice(0, -1).find(t => !grammar.terminals.has(t));
  if (unknown) return reject(`Unknown terminal ${unknown}.`);

  // A -> B has no terminal-bounded handle. Record every nonterminal that a
  // reduced substring can derive through a chain of unit productions.
  function unitClosure(initial) {
    const roots = new Set(initial);
    let changed = true;
    while (changed) {
      changed = false;
      for (const { lhs, rhs } of grammar.productions) {
        if (rhs.length === 1 && nonterminal(rhs[0], grammar) && roots.has(rhs[0]) && !roots.has(lhs)) {
          roots.add(lhs); changed = true;
        }
      }
    }
    return roots;
  }
  function topTerminal(from = stack.length - 1) {
    for (let i = from; i >= 0; i--) if (stack[i].terminal !== undefined) return i;
    return -1;
  }

  const maxSteps = Math.max(100, 10 * input.length + 10 * grammar.productions.length);
  for (let n = 0; n < maxSteps; n++) {
    if (pos === input.length - 1 && stack.length === 2 &&
        stack[0].terminal === '$' && stack[1].roots?.has(grammar.startSymbol)) {
      record('ACCEPT');
      return { steps, accepted: true, error: null };
    }
    const lookahead = input[pos];
    const top = topTerminal();
    const relation = relations.get(stack[top].terminal)?.get(lookahead);
    if (!relation) return reject(`No precedence relation for ${stack[top].terminal} and ${lookahead}.`);
    if (relation === '<' || relation === '=') {
      if (lookahead === '$') return reject('Input ended before the start symbol was derived.');
      record(`SHIFT ${lookahead}`);
      stack.push({ terminal: lookahead });
      pos++;
      continue;
    }

    // Search backward for the nearest '<' between consecutive stack terminals.
    let right = top, boundary = -1;
    while (right > 0) {
      const left = topTerminal(right - 1);
      const between = relations.get(stack[left].terminal)?.get(stack[right].terminal);
      if (between === '<') { boundary = left + 1; break; }
      if (between !== '=') return reject('No valid handle boundary on the stack.');
      right = left;
    }
    if (boundary < 0) return reject('No valid handle boundary on the stack.');
    const handle = stack.slice(boundary);
    const matches = grammar.productions.filter(({ rhs }) =>
      rhs.length === handle.length && rhs.every((symbol, i) =>
        terminal(symbol, grammar) ? handle[i].terminal === symbol : handle[i].roots?.has(symbol)));
    if (!matches.length) return reject(`No production matches handle ${handle.map(x => x.terminal ?? 'N').join(' ')}.`);
    stack.splice(boundary, stack.length - boundary, { roots: unitClosure(matches.map(p => p.lhs)) });
    record(`REDUCE ${matches.map(p => `${p.lhs} → ${p.rhs.join(' ')}`).join(' / ')}`);
  }
  return reject('Parsing exceeded the step limit.');
}

export const buildOperatorPrecedenceTable = buildOperatorPrecedenceModel;
