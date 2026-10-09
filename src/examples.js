// Built-in grammars available from the Load Example dropdown.
export const EXAMPLES = {
  'Simple Expression': 'E -> E + T\nE -> T\nT -> id',
  'Parenthesized Expression': 'E -> E + T\nE -> T\nT -> T * F\nT -> F\nF -> ( E )\nF -> id',
  'Conflict Grammar': 'E -> E + E\nE -> E * E\nE -> id',
  'Simple Grammar': 'S -> A\nA -> a',
  'Epsilon Grammar': 'S -> A B\nA -> a\nA -> ε\nB -> b',
  'Assignment (LR(1), not SLR(1))': 'S -> L = R\nS -> R\nL -> * R\nL -> id\nR -> L',
  'Reduce-Reduce Conflict': 'S -> A\nS -> B\nA -> a\nB -> a',
  'Balanced Parentheses': 'S -> ( S ) S\nS -> ε',
  'Right Recursive List': 'L -> id , L\nL -> id',
};

// A choice fills the parse input; it does not run the parser automatically.
export const STRING_EXAMPLES = {
  'Simple Expression': [
    { label: 'Expression: id + id', input: 'id + id' },
    { label: 'Malformed: id + + id', input: 'id + + id' },
  ],
  'Parenthesized Expression': [
    { label: 'Expression: id + id * id', input: 'id + id * id' },
    { label: 'Parentheses: ( id + id ) * id', input: '( id + id ) * id' },
    { label: 'Malformed: id + * id', input: 'id + * id' },
  ],
  'Conflict Grammar': [
    { label: 'Simple: id', input: 'id' },
    { label: 'Conflict: id + id * id', input: 'id + id * id' },
  ],
  'Simple Grammar': [
    { label: 'Single token: a', input: 'a' },
    { label: 'Extra token: a a', input: 'a a' },
  ],
  'Epsilon Grammar': [
    { label: 'Nullable A: b', input: 'b' },
    { label: 'Nonempty A: a b', input: 'a b' },
    { label: 'Extra a: a a b', input: 'a a b' },
  ],
  'Assignment (LR(1), not SLR(1))': [
    { label: 'CLR/LALR: id = id', input: 'id = id' },
    { label: 'CLR/LALR: * id = id', input: '* id = id' },
    { label: 'Malformed: id = = id', input: 'id = = id' },
  ],
  'Reduce-Reduce Conflict': [
    { label: 'Conflict: a', input: 'a' },
    { label: 'Extra token: a a', input: 'a a' },
  ],
  'Balanced Parentheses': [
    { label: 'One pair: ( )', input: '( )' },
    { label: 'Two pairs: ( ) ( )', input: '( ) ( )' },
    { label: 'Unclosed: ( ( )', input: '( ( )' },
  ],
  'Right Recursive List': [
    { label: 'One item: id', input: 'id' },
    { label: 'Two items: id , id', input: 'id , id' },
    { label: 'Missing item: id ,', input: 'id ,' },
  ],
};
