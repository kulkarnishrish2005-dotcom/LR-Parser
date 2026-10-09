// Automated test suite for the LR Parser Visualizer

import { parseGrammar, validateGrammar, augmentGrammar } from '../src/grammar.js';
import { computeFirstSets, computeFollowSets } from '../src/firstfollow.js';
import { buildLR0Collection } from '../src/lr0.js';
import { buildCLRCollection } from '../src/clr.js';
import { buildLALRFromCLR } from '../src/lalr.js';
import { buildParseTable } from '../src/table.js';
import { tokenize, parseString } from '../src/parser.js';
import { computeFirstVT, computeLastVT, buildOperatorPrecedenceModel, parseOperatorPrecedence } from '../src/operator-precedence.js';
import { explainActions } from '../src/action-explanation.js';
import { graphNodeSummary } from '../src/graph.js';
import { EXAMPLES, STRING_EXAMPLES } from '../src/examples.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.log(`  ✗ ${message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.log(`  ✗ ${message}`);
    console.log(`    Expected: ${e}`);
    console.log(`    Actual:   ${a}`);
    failed++;
  }
}

function assertContains(actualStr, substr, message) {
  if (actualStr.includes(substr)) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.log(`  ✗ ${message}`);
    console.log(`    String: ${actualStr}`);
    failed++;
  }
}

function assertThrows(fn, message) {
  try {
    fn();
    console.log(`  ✗ ${message} — no exception thrown`);
    failed++;
  } catch (e) {
    console.log(`  ✓ ${message}`);
    passed++;
  }
}

// ─── Grammar Tests ───
console.log('\n=== GRAMMAR PARSING ===');

assert(parseGrammar('E -> E + T\nE -> T\nT -> id').productions.length >= 3,
  'Parses a simple expression grammar');

assert(parseGrammar('S -> A\nA -> a').productions.length === 2,
  'Parses a simple grammar');

assert(parseGrammar('').productions.length === 0,
  'Returns empty for empty input');

assert(parseGrammar('invalid').errors.length > 0,
  'Returns errors for invalid input');

console.log('\n=== BUILT-IN EXAMPLES ===');
assert(Object.values(EXAMPLES).every(source => {
  const parsed = parseGrammar(source);
  return parsed.errors.length === 0 && validateGrammar(parsed).length === 0;
}), 'Every built-in example is a valid grammar');
assert(Object.keys(EXAMPLES).every(name => STRING_EXAMPLES[name]?.length >= 2 &&
  STRING_EXAMPLES[name].every(sample => sample.label && sample.input.trim())),
  'Every built-in grammar has selectable nonempty string examples');

const assignment = augmentGrammar(parseGrammar(EXAMPLES['Assignment (LR(1), not SLR(1))']));
const assignmentFirst = computeFirstSets(assignment);
const assignmentLR0 = buildLR0Collection(assignment);
const assignmentCLR = buildCLRCollection(assignment, assignmentFirst);
const assignmentLALR = buildLALRFromCLR(assignmentCLR);
const assignmentSLRTable = buildParseTable('SLR1', assignmentLR0, assignment, computeFollowSets(assignment, assignmentFirst));
const assignmentCLRTable = buildParseTable('CLR1', assignmentCLR, assignment);
const assignmentLALRTable = buildParseTable('LALR1', assignmentLALR, assignment);
assert(assignmentSLRTable.conflicts.length > 0 && assignmentCLRTable.conflicts.length === 0 && assignmentLALRTable.conflicts.length === 0,
  'Assignment example distinguishes SLR from CLR and LALR');
assert(parseString(['id', '=', 'id'], assignmentCLRTable, assignment.productions).accepted &&
  parseString(['id', '=', 'id'], assignmentLALRTable, assignment.productions).accepted,
  'Assignment example accepts id = id in CLR and LALR');

const reduceReduce = augmentGrammar(parseGrammar(EXAMPLES['Reduce-Reduce Conflict']));
const reduceReduceTable = buildParseTable('SLR1', buildLR0Collection(reduceReduce), reduceReduce,
  computeFollowSets(reduceReduce, computeFirstSets(reduceReduce)));
assert(reduceReduceTable.conflicts.some(conflict => conflict.type === 'reduce-reduce') &&
  parseString(['a'], reduceReduceTable, reduceReduce.productions).steps.at(-1).action.startsWith('CONFLICT:'),
  'Reduce-reduce example stops parsing at competing reductions');

for (const [name, input] of [['Balanced Parentheses', ['(', ')', '(', ')']], ['Right Recursive List', ['id', ',', 'id']]]) {
  const example = augmentGrammar(parseGrammar(EXAMPLES[name]));
  const exampleTable = buildParseTable('SLR1', buildLR0Collection(example), example,
    computeFollowSets(example, computeFirstSets(example)));
  assert(exampleTable.conflicts.length === 0 && parseString(input, exampleTable, example.productions).accepted,
    `${name} example accepts its demonstration input in SLR`);
}

// ─── Augmentation Tests ───
console.log('\n=== GRAMMAR AUGMENTATION ===');

const augResult = augmentGrammar({
  productions: [
    { id: 1, lhs: 'E', rhs: ['E', '+', 'T'] },
    { id: 2, lhs: 'E', rhs: ['T'] },
    { id: 3, lhs: 'T', rhs: ['id'] }
  ],
  nonTerminals: new Set(['E', 'T']),
  terminals: new Set(['+', 'id']),
  startSymbol: 'E',
});
assert(augResult.augmentedStart === "E'",
  'Augmentation adds S\' → S with primed start');
assertEqual(augResult.productions[0].lhs, "E'",
  'New production S\' → E');
assertEqual(augResult.productions[0].id, 0,
  'New production gets id 0');
assertEqual(augResult.productions.length, 4,
  '3 original + 1 augmented = 4 productions');
assert(!augResult.nonTerminals.has('E\'\''),
  'Augmented start does not collide with existing');

// ─── FIRST Sets Tests ───
console.log('\n=== FIRST SETS ===');

const grammaSimple = parseGrammar('E -> E + T\nE -> T\nT -> id');
const firstSimple = computeFirstSets(grammaSimple);
assert(firstSimple.get('E') instanceof Set,
  'FIRST(E) returns a Set');
assert(firstSimple.get('T') instanceof Set,
  'FIRST(T) returns a Set');
assert(firstSimple.get('E')?.has('id'),
  'FIRST(E) contains id');
assert(firstSimple.get('T')?.has('id'),
  'FIRST(T) contains id');

// ─── FOLLOW Sets Tests ───
console.log('\n=== FOLLOW SETS ===');

const grammaWithE = parseGrammar('E -> E + T\nE -> T\nT -> id');
const firstW = computeFirstSets(grammaWithE);
const followW = computeFollowSets(grammaWithE, firstW);
assert(followW.get('E')?.has('$'),
  'FOLLOW(E) contains $');
assert(followW.get('E')?.has('$'),
  'FOLLOW(E) contains $ (with $)');

// ─── LR(0) Tests ───
console.log('\n=== LR(0) CANONICAL COLLECTION ===');

const lr0Gramma = parseGrammar('E -> E + T\nE -> T\nT -> id');
const lr0GrammarAugmented = augmentGrammar(lr0Gramma);
const lr0Result = buildLR0Collection(lr0GrammarAugmented);
assert(lr0Result.states.length > 0,
  'LR(0) builds at least one state');
assert(lr0Result.steps.length > 0,
  'LR(0) builds at least one construction step');

// ─── LR(0) Table Tests ───
console.log('\n=== LR(0) TABLE ===');

const lr0Table = buildParseTable('LR0', lr0Result, lr0GrammarAugmented.productions);
assert(lr0Table.action instanceof Map,
  'LR(0) table has ACTION map');
assert(lr0Table.goto_ instanceof Map,
  'LR(0) table has GOTO map');
assert(Array.isArray(lr0Table.conflicts),
  'LR(0) table has conflicts array');

// ─── SLR(1) Tests ───
console.log('\n=== SLR(1) TABLE ===');

const slrGrammaAugmented = augmentGrammar(parseGrammar('E -> E + T\nE -> T\nT -> id'));
const slrResult = buildLR0Collection(lr0GrammarAugmented); // reuse collection
const slrTable = buildParseTable('SLR1', slrResult, slrGrammaAugmented, computeFollowSets(slrGrammaAugmented, computeFirstSets(slrGrammaAugmented)));
assert(slrTable.conflicts.length >= 0,
  'SLR(1) table has conflicts array');

// ─── CLR(1) Tests ───
console.log('\n=== CLR(1) ===');

const clrResult = buildCLRCollection(lr0GrammarAugmented, computeFirstSets(lr0GrammarAugmented));
assert(clrResult.states.length > 0,
  'CLR(1) builds at least one state');
const clrTable = buildParseTable('CLR1', clrResult, lr0GrammarAugmented);
assert(clrTable.action instanceof Map,
  'CLR(1) table has ACTION map');

// ─── LALR(1) Tests ───
console.log('\n=== LALR(1) ===');

const lalrResult = buildLALRFromCLR(clrResult);
assert(lalrResult.states.length > 0,
  'LALR(1) builds at least one state');
const lalrTable = buildParseTable('LALR1', lalrResult, lr0GrammarAugmented);
assert(lalrTable.action instanceof Map,
  'LALR(1) table has ACTION map');

// ─── Conflict Detection Tests ───
console.log('\n=== CONFLICT DETECTION ===');

const conflictGramma = parseGrammar('E -> E + E\nE -> E * E\nE -> id');
const conflictAugmented = augmentGrammar(conflictGramma);
const conflictLR0 = buildLR0Collection(conflictAugmented);
const conflictTable = buildParseTable('SLR1', conflictLR0, conflictAugmented, computeFollowSets(conflictAugmented, computeFirstSets(conflictAugmented)));
assert(conflictTable.conflicts.length > 0,
  'Conflict grammar detects shift-reduce or reduce-reduce conflicts');
const conflictInput = parseString(['id', '+', 'id', '*', 'id'], conflictTable, conflictAugmented.productions);
assert(!conflictInput.accepted && conflictInput.steps.at(-1).action.startsWith('CONFLICT:'),
  'LR parsing stops at a conflicting ACTION cell');
assertContains(conflictInput.steps.at(-1).action, 'ACTION[',
  'Conflict parse step identifies the ambiguous cell');

console.log('\n=== ACTION EXPLANATIONS ===');
function actionExplanationFor(table, collection, grammar, type, actionType, follow = null) {
  const [key, actions] = [...table.action].find(([, list]) => list.some(action => action.type === actionType));
  const [stateId, symbol] = key.split(',');
  return explainActions(collection.states[Number(stateId)], symbol, actions, type, grammar.productions, follow)
    .find(detail => detail.title.startsWith(actionType.toUpperCase()));
}
const slrFollow = computeFollowSets(slrGrammaAugmented, computeFirstSets(slrGrammaAugmented));
const slrShift = actionExplanationFor(slrTable, slrResult, slrGrammaAugmented, 'SLR1', 'shift', slrFollow);
const slrReduce = actionExplanationFor(slrTable, slrResult, slrGrammaAugmented, 'SLR1', 'reduce', slrFollow);
const slrAccept = actionExplanationFor(slrTable, slrResult, slrGrammaAugmented, 'SLR1', 'accept', slrFollow);
assert(slrShift.items.length > 0 && slrShift.reason.includes('GOTO'), 'Shift explanation identifies producing item and target');
assert(slrReduce.items.length > 0 && slrReduce.reason.includes('FOLLOW('), 'SLR reduction explains FOLLOW placement');
assert(slrAccept.items.length > 0 && slrAccept.reason.includes('augmented'), 'Accept explanation identifies augmented item');
const clrReduce = actionExplanationFor(clrTable, clrResult, lr0GrammarAugmented, 'CLR1', 'reduce');
assert(clrReduce.items.length > 0 && clrReduce.reason.includes('lookahead'), 'CLR reduction explains item lookahead');

console.log('\n=== GRAPH SUMMARY ===');
assertEqual(graphNodeSummary({ items: [1, 2, 3, 4, 5] }, [], item => `item ${item}`),
  ['item 1', 'item 2', 'item 3', '+ 2 more items'], 'Graph nodes show at most three item lines and a remainder count');

// ─── String Parsing Tests ───
console.log('\n=== STRING PARSING ===');

const testGramma = parseGrammar('E -> E + T\nE -> T\nT -> id');
const testAugmented = augmentGrammar(testGramma);
const testLR0 = buildLR0Collection(testAugmented);
const testTable = buildParseTable('LR0', testLR0, testAugmented.productions);

const result = parseString(['id', '+', 'id', '$'], testTable, testAugmented.productions);
assert(result.accepted === true,
  'Parsing "id + id" with LR(0) table accepts');

const result2 = parseString(['id', '+', 'id', 'extra'], testTable);
assert(result2.accepted === false,
  'Parsing "id + id extra" with LR(0) table rejects');

console.log('\n=== OPERATOR PRECEDENCE ===');

const precedenceGrammar = parseGrammar('E -> E + T\nE -> T\nT -> T * F\nT -> F\nF -> ( E )\nF -> id');
const precedenceModel = buildOperatorPrecedenceModel(precedenceGrammar);

const firstVT = computeFirstVT(precedenceGrammar);
assert(firstVT.get('E')?.has('id') && firstVT.get('E')?.has('('),
  'FIRSTVT(E) contains leading terminals');

const lastVT = computeLastVT(precedenceGrammar);
assert(lastVT.get('E')?.has('id') && lastVT.get('E')?.has(')'),
  'LASTVT(E) contains trailing terminals');

assert(precedenceModel.relations.size > 0,
  'Precedence relations are generated between terminals');

const conflictGrammar = parseGrammar('S -> a b\nD -> a E\nE -> b');
const conflictModel = buildOperatorPrecedenceModel(conflictGrammar);
assert(conflictModel.conflicts.length > 0,
  'Precedence conflict detection records ambiguous pairs');

const acceptedPrec = parseOperatorPrecedence(['id', '+', 'id'], precedenceModel);
assert(acceptedPrec.accepted === true,
  'Operator precedence parser accepts valid arithmetic input');

const rejectedPrec = parseOperatorPrecedence(['id', '+', '*', 'id'], precedenceModel);
assert(rejectedPrec.accepted === false,
  'Operator precedence parser rejects invalid arithmetic input');
assert(rejectedPrec.steps.at(-1).action.startsWith('REJECT:'),
  'Operator precedence rejection ends with a visible REJECT row');

// ─── Summary ───
console.log(`\n=== TEST SUMMARY ===`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(failed === 0 ? '✓ ALL TESTS PASSED' : '✗ SOME TESTS FAILED');
if (failed > 0) process.exitCode = 1;
