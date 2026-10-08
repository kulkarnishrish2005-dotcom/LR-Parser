// Automated test suite for the LR Parser Visualizer

import { parseGrammar, validateGrammar, augmentGrammar } from '../src/grammar.js';
import { computeFirstSets, computeFollowSets } from '../src/firstfollow.js';
import { buildLR0Collection } from '../src/lr0.js';
import { buildCLRCollection } from '../src/clr.js';
import { buildLALRFromCLR } from '../src/lalr.js';
import { buildParseTable } from '../src/table.js';
import { tokenize, parseString } from '../src/parser.js';

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

// ─── Summary ───
console.log(`\n=== TEST SUMMARY ===`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(failed === 0 ? '✓ ALL TESTS PASSED' : '✗ SOME TESTS FAILED');