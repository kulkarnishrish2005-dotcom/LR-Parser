Operator Precedence fix for LR-Parser

Copy these files into the same paths in your existing LR-Parser repository:
  src/operator-precedence.js
  src/app.js
  tests/tests.js

Then run:
  npm test

Expected result for this snapshot: 60 passed, 0 failed.

Test in the browser with grammar:
  E -> E + T | T
  T -> T * F | F
  F -> ( E ) | id

Select Operator Precedence, build the parser, and parse:
  id + id * id

It should ACCEPT with actual REDUCE steps. Try `id + * id` for a REJECT.
The parser now derives FIRSTVT/LASTVT and relations from the grammar,
checks invalid operator-precedence grammars and conflicts, and reduces
terminal-bounded handles using productions. There is no hardcoded operator
priority table.

Separate known input limitation: grammar symbols need spaces. Enter `a B`,
not `aB`, when you mean terminal a followed by nonterminal B.
