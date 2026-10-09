import { formatLR0Item, formatLR1Item, isReduceItem, symbolAfterDot } from './items.js';

// Describe the actual action(s) stored in one ACTION cell for the inspector.
export function explainActions(state, symbol, actions, parserType, productions, followSets) {
  const lr1 = parserType === 'CLR1' || parserType === 'LALR1';
  const format = lr1 ? formatLR1Item : formatLR0Item;
  return actions.map(action => {
    if (action.type === 'shift') {
      const items = state.items.filter(item => symbolAfterDot(item, productions) === symbol);
      return {
        title: `SHIFT to I${action.target}`,
        reason: `GOTO(I${state.id}, ${symbol}) = I${action.target}`,
        items: items.map(item => format(item, productions)),
      };
    }
    if (action.type === 'accept') {
      const items = state.items.filter(item => {
        const prod = productions.find(p => p.id === item.prodId);
        return prod?.id === 0 && isReduceItem(item, productions) && (!lr1 || item.lookahead === '$');
      });
      return {
        title: 'ACCEPT',
        reason: `Completed augmented start item on $`,
        items: items.map(item => format(item, productions)),
      };
    }
    const prod = productions.find(p => p.id === action.target);
    const items = state.items.filter(item =>
      item.prodId === action.target && isReduceItem(item, productions) && (!lr1 || item.lookahead === symbol)
    );
    const reason = parserType === 'LR0'
      ? 'LR(0) reduction applies on every terminal'
      : parserType === 'SLR1'
        ? `${symbol} ∈ FOLLOW(${prod?.lhs}); FOLLOW(${prod?.lhs}) = { ${[...(followSets?.get(prod?.lhs) || [])].join(', ')} }`
        : `LR(1) item lookahead is ${symbol}`;
    return {
      title: `REDUCE ${prod?.lhs} → ${prod?.rhs.length ? prod.rhs.join(' ') : 'ε'}`,
      reason,
      items: items.map(item => format(item, productions)),
    };
  });
}
