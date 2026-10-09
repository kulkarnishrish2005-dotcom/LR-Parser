# Interactive LR Parser Visualizer

A browser-based compiler design project demonstrating bottom-up parsing with LR(0), SLR(1), CLR(1), and LALR(1) parsers.

## Quick Start

1. Open `index.html` in a web browser (or run `python3 -m http.server 8080` then visit `http://localhost:8080`)
2. Select a parser type from the buttons at the top
3. Enter a grammar or load one of the built-in examples
4. Click "Build Parser" to construct the canonical collection
5. Use "Next Step" to walk through state construction incrementally
6. Click "Build All" to complete the table
7. Enter a test string and click "Parse" to parse it

The **Try a string** picker beside the parse input supplies sample strings for each built-in grammar. Choosing one fills the input; click **Parse** to see the trace. Parser type can change the result, especially for conflict grammars.

## Supported Grammar Syntax

- **Production separator**: `->` or `→` (arrow)
- **Alternatives**: `|` (e.g., `A -> B | C`)
- **Epsilon**: `ε` (or `epsilon`, `ɛ`)
- **Whitespace**: freely allowed around symbols
- **Left-hand side**: any non-terminal name (uppercase letters, e.g., `E`, `T`, `S`)
- **Right-hand side**: terminals and non-terminals (lowercase letters, digits, operators)

### Example Formats

```
E -> E + T
E -> T
T -> id
```

or with alternatives:

```
E -> E + T | T
T -> id
```

### Built-in Example Grammars

| Example | Description |
|---------|-------------|
| **Simple Expression** | `E -> E + T`, `E -> T`, `T -> id` |
| **Parenthesized Expression** | `E -> E + T`, `E -> T`, `T -> T * F`, `T -> F`, `F -> ( E )`, `F -> id` |
| **Conflict Grammar** | `E -> E + E`, `E -> E * E`, `E -> id` (demonstrates shift-reduce conflicts) |
| **Simple Grammar** | `S -> A`, `A -> a` |
| **Epsilon Grammar** | `S -> A B`, `A -> a`, `A -> ε`, `B -> b` |
| **Assignment (LR(1), not SLR(1))** | `S -> L = R / R`, `L -> * R / id`, `R -> L`; try `id = id` in CLR(1) or LALR(1) |
| **Reduce-Reduce Conflict** | `S -> A / B`, `A -> a`, `B -> a`; shows competing reductions |
| **Balanced Parentheses** | `S -> ( S ) S / ε`; try `( ) ( )` in SLR(1) |
| **Right Recursive List** | `L -> id , L / id`; try `id , id` in SLR(1) |

## Parser Types

- **LR(0)**: Simplest — no lookahead. Reduces for all terminals.
- **SLR(1)**: Uses FOLLOW sets to determine where reductions apply. Reuses LR(0) canonical collection.
- **CLR(1)**: Uses item-specific lookaheads from FIRST sets. Most powerful of the three.
- **LALR(1)**: Merges CLR(1) states with identical LR(0) cores. Same power as SLR(1) in practice.

## What's Implemented (Phase 1)

### Core Engine Modules

| Module | Purpose |
|--------|---------|
| `src/grammar.js` | Grammar parsing, validation, augmentation |
| `src/firstfollow.js` | FIRST and FOLLOW set computation |
| `src/items.js` | LR(0)/LR(1) item representation, equality, formatting |
| `src/lr0.js` | LR(0) closure, goto, canonical collection construction |
| `src/clr.js` | CLR(1) closure, goto, canonical collection construction |
| `src/lalr.js` | LALR(1) state merging from CLR(1) cores |
| `src/table.js` | ACTION/GOTO table construction + conflict detection for all parser types |
| `src/parser.js` | Bottom-up string parsing engine |
| `src/graph.js` | SVG-based state graph visualization |

### UI Features

- **Parser selector**: LR(0), SLR(1), CLR(1), LALR(1)
- **Grammar input**: Textarea with built-in example dropdown
- **Augmented grammar display**: Shows S' → S
- **FIRST/FOLLOW sets**: Computed and displayed
- **Canonical collection**: Step-by-step state construction with Next/Previous/Reset
- **State graph**: SVG visualization of states and transitions
- **ACTION/GOTO table**: Interactive table building incrementally
- **Conflict detection**: Shift-reduce and reduce-reduce conflicts displayed
- **String parsing**: Step-by-step bottom-up parsing with stack/inputs/actions
- **Accept/Reject**: Full ACCEPT/REJECT with diagnostic messages

### Test Suite

- 16 automated tests covering: grammar parsing, augmentation, FIRST/FOLLOW, LR(0) closure/goto/canonical collection/table, SLR(1), CLR(1), LALR(1), conflict detection, and string parsing (accept/reject)

## What's Planned for Phase 2

- AI explanations of parser actions
- Advanced derivation panels
- Parser comparison dashboard
- Detailed conflict inspector
- Report generation
- PDF export
- Backend/database integration
- Authentication and deployment

## Implementation Architecture

The project follows a clean modular architecture:

```
grammar.js        → parsing, validation, augmentation
firstfollow.js    → FIRST and FOLLOW sets
items.js          → LR(0)/LR(1) item representation
lr0.js            → LR(0) canonical collection
clr.js            → CLR(1) canonical collection
lalr.js           → LALR(1) state merging
table.js          → ACTION/GOTO tables + conflict detection
parser.js         → bottom-up string parsing
graph.js          → SVG state graph
app.js            → UI controller
style.css         → theming and layout
index.html        → entry point
```

Key design decisions:
- All algorithmic logic is pure and testable (no DOM dependency)
- Deterministic ordering ensured through sorted iteration
- Stable state IDs across runs for same grammar
- SLR(1) reuses LR(0) collection; only reduction placement changes
- LALR(1) properly merges CLR(1) states with identical cores
- No external dependencies — zero build step

## Verified Grammars

| Grammar | States | Conflicts | Accepts |
|---------|--------|-----------|---------|
| `E -> E + T / E -> T / T -> id` | 7+ states | 0 (SLR(1)) | `id + id` |
| `E -> E + E / E -> E * E / E -> id` | 6+ states | >0 (conflicts) | — |
| `E -> E + T / E -> T / T -> T * F / T -> F / F -> ( E ) / F -> id` | 9+ states | 0 (SLR(1)) | `id + id * id` |
