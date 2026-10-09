// Quick verification script - import modules and test key algorithms
import { parseGrammar, validateGrammar, augmentGrammar } from './src/grammar.js';
import { computeFirstSets, computeFollowSets } from './src/firstfollow.js';
import { buildLR0Collection } from './src/lr0.js';
import { buildCLRCollection } from './src/clr.js';
import { buildLALRFromCLR } from './src/lalr.js';
import { buildParseTable } from './src/table.js';
import { tokenize, parseString } from './src/parser.js';

console.log('=== LR Parser Visualizer - Core Verification ===\n');

// Test 1: Grammar A
console.log('--- Grammar A: Simple Expression ---');
const ga = parseGrammar('E -> E + T\nE -> T\nT -> id');
console.log(`Productions: ${ga.productions.length}`);
console.log(`Start symbol: ${ga.startSymbol}`);
const gaAug = augmentGrammar(ga);
console.log(`Augmented: ${gaAug.augmentedStart} -> ${gaAug.productions[0].lhs} → ${gaAug.productions[0].rhs.join(' ')}`);
const gaFirst = computeFirstSets(gaAug);
console.log(`FIRST(E): ${[...gaFirst.get('E')].join(', ')}`);
const gaFollow = computeFollowSets(gaAug, gaFirst);
console.log(`FOLLOW(E): ${[...gaFollow.get('E')].join(', ')}`);

// Build LR(0) collection
const gaLR0 = buildLR0Collection(gaAug);
console.log(`LR(0) states: ${gaLR0.states.length}`);
console.log(`LR(0) steps: ${gaLR0.steps.length}`);

// Build SLR(1) table
const gaSLRTable = buildParseTable('SLR1', gaLR0, gaAug, gaFollow);
console.log(`SLR(1) conflicts: ${gaSLRTable.conflicts.length}`);
console.log(`SLR(1) ACTION entries: ${gaSLRTable.action.size}`);
console.log(`SLR(1) GOTO entries: ${gaSLRTable.goto_.size}`);

// Test parsing
const gaTokens = ['id', '+', 'id', '$'];
const gaParseResult = parseString(gaTokens, gaSLRTable, gaAug.productions);
console.log(`Parsing "id + id": ${gaParseResult.accepted ? 'ACCEPT' : 'REJECT'}`);

// Test 2: Grammar B (conflict grammar)
console.log('\n--- Grammar B: Conflict Grammar ---');
const gb = parseGrammar('E -> E + E\nE -> E * E\nE -> id');
const gbAug = augmentGrammar(gb);
const gbLR0 = buildLR0Collection(gbAug);
const gbSLRTable = buildParseTable('SLR1', gbLR0, gbAug, computeFollowSets(gbAug, computeFirstSets(gbAug)));
console.log(`SLR(1) conflicts: ${gbSLRTable.conflicts.length} (expected > 0)`);
gbSLRTable.conflicts.forEach(c => console.log(`  - State I${c.stateId}, Symbol: ${c.symbol}, Type: ${c.type}`));

// Test 3: Grammar C (parenthesized expression)
console.log('\n--- Grammar C: Parenthesized Expression ---');
const gc = parseGrammar('E -> E + T\nE -> T\nT -> T * F\nT -> F\nF -> ( E )\nF -> id');
const gcAug = augmentGrammar(gc);
const gcLR0 = buildLR0Collection(gcAug);
const gcSLRTable = buildParseTable('SLR1', gcLR0, gcAug, computeFollowSets(gcAug, computeFirstSets(gcAug)));
console.log(`SLR(1) conflicts: ${gcSLRTable.conflicts.length} (expected 0)`);
gcSLRTable.conflicts.forEach(c => console.log(`  - State I${c.stateId}, Symbol: ${c.symbol}, Type: ${c.type}`));

// Test parsing with Grammar C
const gcTokens = ['id', '+', 'id', '*', 'id', '$'];
const gcParseResult = parseString(gcTokens, gcSLRTable, gcAug.productions);
console.log(`Parsing "id + id * id": ${gcParseResult.accepted ? 'ACCEPT' : 'REJECT'}`);

// Summary
console.log('\n=== VERIFICATION COMPLETE ===');
