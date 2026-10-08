// Main UI controller

import { parseGrammar, validateGrammar, augmentGrammar, productionToString } from './grammar.js';
import { computeFirstSets, computeFollowSets } from './firstfollow.js';
import { buildLR0Collection } from './lr0.js';
import { buildCLRCollection } from './clr.js';
import { buildLALRFromCLR } from './lalr.js';
import { buildParseTable, formatAction, getActions } from './table.js';
import { tokenize, parseString } from './parser.js';
import { formatLR0Item, formatLR1Item, symbolAfterDot, isReduceItem } from './items.js';
import { renderGraph } from './graph.js';
import { buildOperatorPrecedenceModel, parseOperatorPrecedence } from './operator-precedence.js';

// ─── State ───────────────────────────────────────────────────────
let currentParser = 'SLR1';
let grammar = null;       // augmented grammar
let firstSets = null;
let followSets = null;
let collection = null;    // canonical collection for current parser
let table = null;
let precedenceModel = null;
let constructionSteps = [];
let constructionPos = 0;  // index into steps already revealed
let builtStatesCount = 0;
let tableSteps = [];
let tablePos = 0;
let parseSteps = [];
let parsePos = 0;

// ─── Example grammars ────────────────────────────────────────────
const EXAMPLES = {
  'Simple Expression': 'E -> E + T\nE -> T\nT -> id',
  'Parenthesized Expression': 'E -> E + T\nE -> T\nT -> T * F\nT -> F\nF -> ( E )\nF -> id',
  'Conflict Grammar': 'E -> E + E\nE -> E * E\nE -> id',
  'Simple Grammar': 'S -> A\nA -> a',
  'Epsilon Grammar': 'S -> A B\nA -> a\nA -> ε\nB -> b',
};

// ─── DOM references ──────────────────────────────────────────────
const $ = id => document.getElementById(id);

function init() {
  // Parser selector buttons
  document.querySelectorAll('.parser-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.parser-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentParser = btn.dataset.parser;
      resetAll();
    });
  });

  // Example selector
  $('exampleSelect').addEventListener('change', (e) => {
    if (e.target.value && EXAMPLES[e.target.value]) {
      $('grammarInput').value = EXAMPLES[e.target.value];
    }
  });

  // Populate example dropdown
  const sel = $('exampleSelect');
  for (const name of Object.keys(EXAMPLES)) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  }

  // Build button
  $('buildBtn').addEventListener('click', buildParser);

  // Construction step buttons
  $('nextStepBtn').addEventListener('click', nextConstructionStep);
  $('prevStepBtn').addEventListener('click', prevConstructionStep);
  $('resetStepBtn').addEventListener('click', resetConstruction);
  $('buildAllBtn').addEventListener('click', buildAllSteps);

  // Table step buttons
  $('nextTableBtn').addEventListener('click', nextTableStep);
  $('prevTableBtn').addEventListener('click', prevTableStep);
  $('resetTableBtn').addEventListener('click', resetTable);
  $('buildAllTableBtn').addEventListener('click', buildAllTableSteps);

  // Parse buttons
  $('parseBtn').addEventListener('click', startParse);
  $('nextParseBtn').addEventListener('click', nextParseStep);
  $('prevParseBtn').addEventListener('click', prevParseStep);
  $('resetParseBtn').addEventListener('click', resetParse);
  $('parseAllBtn').addEventListener('click', parseAll);

  $('clearBtn').addEventListener('click', () => {
    $('grammarInput').value = '';
    $('validationMsg').innerHTML = '';
  });

  // Set default grammar
  $('grammarInput').value = EXAMPLES['Simple Expression'];
  $('exampleSelect').value = 'Simple Expression';
  updateWorkflow('grammar');
}

function resetAll() {
  grammar = null;
  firstSets = null;
  followSets = null;
  collection = null;
  table = null;
  precedenceModel = null;
  constructionSteps = [];
  constructionPos = 0;
  builtStatesCount = 0;
  tableSteps = [];
  tablePos = 0;
  parseSteps = [];
  parsePos = 0;

  $('augmentedSection').innerHTML = '';
  $('firstFollowSection').innerHTML = '';
  $('comparisonSection').innerHTML = '';
  $('comparisonSection').classList.add('hidden');
  $('inspectorSection').innerHTML = '';
  $('inspectorSection').classList.add('hidden');
  $('statesSection').innerHTML = '';
  $('graphSection').innerHTML = '';
  $('tableSection').innerHTML = '';
  $('conflictSection').innerHTML = '';
  $('parseSection').classList.add('hidden');
  $('parseResultSection').innerHTML = '';
  $('validationMsg').innerHTML = '';
  $('statusBar').innerHTML = '';
  $('constructionControls').classList.add('hidden');
  $('tableControls').classList.add('hidden');
  $('parseControls').classList.add('hidden');
  renderOverviewStats();
  updateWorkflow('grammar');
}

function buildParser() {
  resetAll();

  const input = $('grammarInput').value;
  const parsed = parseGrammar(input);

  if (parsed.errors.length > 0) {
    showValidation(parsed.errors, 'error');
    return;
  }

  const vErrors = validateGrammar(parsed);
  if (vErrors.length > 0) {
    showValidation(vErrors, 'error');
    return;
  }

  grammar = augmentGrammar(parsed);
  showValidation(['Grammar parsed successfully.'], 'success');

  // Show augmented grammar
  renderAugmented();

  if (currentParser === 'OP') {
    firstSets = computeFirstSets(grammar);
    followSets = computeFollowSets(grammar, firstSets);
    precedenceModel = buildOperatorPrecedenceModel(grammar);
    table = {
      action: new Map(),
      goto_: new Map(),
      conflicts: precedenceModel.conflicts,
      terminals: precedenceModel.terminals,
      nonTerminals: Array.from(grammar.nonTerminals),
      steps: [],
    };
    renderFirstFollow();
    renderOverviewStats();
    renderOperatorPrecedenceTable();
    renderOperatorPrecedenceConflicts();
    $('constructionControls').classList.add('hidden');
    $('tableControls').classList.add('hidden');
    $('parseSection').classList.remove('hidden');
    updateStatus();
    updateWorkflow('table');
    return;
  }

  // Compute FIRST and FOLLOW
  firstSets = computeFirstSets(grammar);
  followSets = computeFollowSets(grammar, firstSets);
  renderFirstFollow();
  renderParserComparison();
  renderOverviewStats();
  updateWorkflow('firstfollow');

  // Build canonical collection based on parser type
  buildCollection();

  // Show construction controls
  $('constructionControls').classList.remove('hidden');
  $('parseSection').classList.remove('hidden');

  updateStatus();
}

function buildCollection() {
  if (currentParser === 'OP') {
    precedenceModel = buildOperatorPrecedenceModel(grammar);
    table = {
      action: new Map(),
      goto_: new Map(),
      conflicts: precedenceModel.conflicts,
      terminals: precedenceModel.terminals,
      nonTerminals: Array.from(grammar.nonTerminals),
      steps: [],
    };
    renderOperatorPrecedenceTable();
    renderOperatorPrecedenceConflicts();
    return;
  }
  if (currentParser === 'LR0' || currentParser === 'SLR1') {
    const result = buildLR0Collection(grammar);
    collection = result;
    constructionSteps = result.steps;
  } else if (currentParser === 'CLR1') {
    const result = buildCLRCollection(grammar, firstSets);
    collection = result;
    constructionSteps = result.steps;
  } else if (currentParser === 'LALR1') {
    const clr = buildCLRCollection(grammar, firstSets);
    const lalr = buildLALRFromCLR(clr);
    collection = lalr;
    constructionSteps = lalr.steps;
  }
  constructionPos = 0;
  builtStatesCount = 0;
  attachStateDerivations();
  renderParserComparison();
  renderOverviewStats();
  updateWorkflow('states');
}

// ─── Construction stepping ──────────────────────────────────────

function nextConstructionStep() {
  if (constructionPos >= constructionSteps.length) return;

  const step = constructionSteps[constructionPos];
  constructionPos++;

  if (step.type === 'state') {
    builtStatesCount++;
  }

  renderStates();
  renderGraph_();
  updateStatus();
  updateWorkflow('states');

  if (constructionPos >= constructionSteps.length) {
    // Construction complete — build parse table
    buildTableSteps();
  }
}

function prevConstructionStep() {
  if (constructionPos <= 0) return;
  constructionPos--;
  const step = constructionSteps[constructionPos];
  if (step.type === 'state') {
    builtStatesCount--;
  }
  renderStates();
  renderGraph_();
  updateStatus();
}

function resetConstruction() {
  constructionPos = 0;
  builtStatesCount = 0;
  $('statesSection').innerHTML = '';
  $('graphSection').innerHTML = '';
  $('tableSection').innerHTML = '';
  $('conflictSection').innerHTML = '';
  $('tableControls').classList.add('hidden');
  tableSteps = [];
  tablePos = 0;
  updateStatus();
  updateWorkflow('states');
}

function buildAllSteps() {
  while (constructionPos < constructionSteps.length) {
    const step = constructionSteps[constructionPos];
    constructionPos++;
    if (step.type === 'state') builtStatesCount++;
  }
  renderStates();
  renderGraph_();
  updateStatus();
  buildTableSteps();
}

function buildTableSteps() {
  const followForSLR = currentParser === 'SLR1' ? followSets : null;
  table = buildParseTable(currentParser, collection, grammar, followForSLR);
  tableSteps = table.steps;
  tablePos = 0;
  $('tableControls').classList.remove('hidden');
  renderOverviewStats();
  updateStatus();
  updateWorkflow('table');
}

// ─── Table stepping ──────────────────────────────────────────────

function nextTableStep() {
  if (tablePos >= tableSteps.length) return;
  tablePos++;
  renderTable();
  renderConflicts();
  updateStatus();
  updateWorkflow('table');
}

function prevTableStep() {
  if (tablePos <= 0) return;
  tablePos--;
  renderTable();
  renderConflicts();
  updateStatus();
  updateWorkflow('table');
}

function resetTable() {
  tablePos = 0;
  renderTable();
  renderConflicts();
  updateStatus();
  updateWorkflow('table');
}

function buildAllTableSteps() {
  tablePos = tableSteps.length;
  renderTable();
  renderConflicts();
  updateStatus();
  updateWorkflow('conflicts');
}

// ─── Parse stepping ──────────────────────────────────────────────

function startParse() {
  const input = $('parseInput').value.trim();
  if (!input) {
    $('parseResultSection').innerHTML = '<div class="msg error">Please enter a string to parse.</div>';
    return;
  }

  if (currentParser === 'OP') {
    if (!precedenceModel) {
      precedenceModel = buildOperatorPrecedenceModel(grammar);
    }
    const tokens = tokenize(input);
    const result = parseOperatorPrecedence(tokens, precedenceModel);
    parseSteps = result.steps;
    parsePos = 0;
    $('parseControls').classList.remove('hidden');
    $('parseResultSection').innerHTML = '';
    renderParseTable();
    updateWorkflow('parse');
    return;
  }

  if (!table) {
    alert('Please build the parser and complete table construction first.');
    return;
  }

  // Ensure full table is built
  if (tablePos < tableSteps.length) {
    buildAllTableSteps();
  }

  const tokens = tokenize(input);
  const result = parseString(tokens, table, grammar.productions);
  parseSteps = result.steps;
  parsePos = 0;

  $('parseControls').classList.remove('hidden');
  $('parseResultSection').innerHTML = '';
  renderParseTable();
  updateWorkflow('parse');
}

function nextParseStep() {
  if (parsePos >= parseSteps.length) return;
  parsePos++;
  renderParseTable();
  updateWorkflow('parse');
}

function prevParseStep() {
  if (parsePos <= 0) return;
  parsePos--;
  renderParseTable();
  updateWorkflow('parse');
}

function resetParse() {
  parsePos = 0;
  renderParseTable();
  updateWorkflow('parse');
}

function parseAll() {
  parsePos = parseSteps.length;
  renderParseTable();
  updateWorkflow('parse');
}

// ─── Rendering ────────────────────────────────────────────────────

function showValidation(messages, type) {
  const el = $('validationMsg');
  el.innerHTML = messages.map(m => `<div class="msg ${type}">${escHtml(m)}</div>`).join('');
}

function renderAugmented() {
  const el = $('augmentedSection');
  let html = '<h3>Augmented Grammar</h3><div class="production-list">';
  for (const p of grammar.productions) {
    html += `<div class="production"><span class="prod-id">(${p.id})</span> ${escHtml(productionToString(p))}</div>`;
  }
  html += '</div>';
  el.innerHTML = html;
}

function renderFirstFollow() {
  const el = $('firstFollowSection');
  let html = '<div class="ff-grid">';

  html += '<div class="ff-col"><h3>FIRST Sets</h3>';
  for (const nt of grammar.nonTerminals) {
    const set = firstSets.get(nt);
    html += `<div class="ff-entry"><strong>FIRST(${escHtml(nt)})</strong> = { ${[...set].map(escHtml).join(', ')} }</div>`;
  }
  html += '</div>';

  html += '<div class="ff-col"><h3>FOLLOW Sets</h3>';
  for (const nt of grammar.nonTerminals) {
    const set = followSets.get(nt);
    html += `<div class="ff-entry"><strong>FOLLOW(${escHtml(nt)})</strong> = { ${[...set].map(escHtml).join(', ')} }</div>`;
  }
  html += '</div>';

  html += '</div>';
  el.innerHTML = html;
}

function attachStateDerivations() {
  if (!collection || !collection.states) return;

  const incoming = new Map();
  for (const state of collection.states) {
    for (const [symbol, target] of state.transitions) {
      if (!incoming.has(target)) incoming.set(target, []);
      incoming.get(target).push({ from: state.id, symbol });
    }
  }

  for (const state of collection.states) {
    if (state.id === 0) {
      state.derivation = {
        type: 'closure',
        detail: `Initial closure from ${grammar.augmentedStart} → . ${grammar.startSymbol}`,
      };
      continue;
    }

    const parents = incoming.get(state.id) || [];
    if (parents.length > 0) {
      const sources = parents.map(p => `I${p.from} via ${p.symbol}`).join(', ');
      state.derivation = {
        type: 'goto',
        detail: `Derived by GOTO / closure from ${sources}`,
      };
    } else {
      state.derivation = {
        type: 'closure',
        detail: 'Closure expansion',
      };
    }
  }
}

function renderParserComparison() {
  const el = $('comparisonSection');
  if (!grammar) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }

  const parsers = ['LR0', 'SLR1', 'CLR1', 'LALR1'];
  const rows = parsers.map(name => {
    let result;
    if (name === 'LR0' || name === 'SLR1') {
      result = buildLR0Collection(grammar);
    } else if (name === 'CLR1') {
      result = buildCLRCollection(grammar, firstSets);
    } else {
      const clr = buildCLRCollection(grammar, firstSets);
      result = buildLALRFromCLR(clr);
    }

    let table;
    if (name === 'LR0') {
      table = buildParseTable(name, result, grammar);
    } else if (name === 'SLR1') {
      table = buildParseTable(name, result, grammar, followSets);
    } else if (name === 'CLR1') {
      table = buildParseTable(name, result, grammar);
    } else {
      table = buildParseTable(name, result, grammar);
    }

    return {
      name,
      displayName: name === 'LR0' ? 'LR(0)' : name === 'SLR1' ? 'SLR(1)' : name === 'CLR1' ? 'CLR(1)' : 'LALR(1)',
      states: result.states.length,
      conflicts: table.conflicts.length,
      active: name === currentParser,
    };
  });

  el.classList.remove('hidden');
  el.innerHTML = `
    <h3>Parser comparison</h3>
    <div class="comparison-grid">
      ${rows.map(row => `
        <div class="comparison-card ${row.active ? 'active' : ''}">
          <div class="comparison-name">${row.displayName}</div>
          <div class="comparison-metric"><span>States</span><strong>${row.states}</strong></div>
          <div class="comparison-metric"><span>Conflicts</span><strong>${row.conflicts}</strong></div>
        </div>
      `).join('')}
    </div>
  `;
}

function showInspector(html) {
  const el = $('inspectorSection');
  el.classList.remove('hidden');
  el.innerHTML = html;
}

function explainState(stateId) {
  if (!collection || !collection.states) return '';
  const state = collection.states.find(s => s.id === stateId);
  if (!state) return 'State not found.';

  const derivation = state.derivation || { detail: 'Derived during closure construction' };
  const itemLines = (state.items || []).map(item => {
    const fmt = (currentParser === 'CLR1' || currentParser === 'LALR1') ? formatLR1Item : formatLR0Item;
    return `<li>${escHtml(fmt(item, grammar.productions))}</li>`;
  }).join('');

  const parentSummary = derivation.detail ? `Derivation: ${escHtml(derivation.detail)}` : 'Derivation: closure expansion';
  return `
    <div class="inspector-box">
      <div class="inspector-header">State I${stateId}</div>
      <div class="inspector-body">
        <p><strong>${escHtml(parentSummary)}</strong></p>
        <ul class="inspector-list">${itemLines}</ul>
      </div>
    </div>
  `;
}

function explainTableCell(stateId, symbol, kind) {
  if (!collection || !collection.states) return '';
  const state = collection.states.find(s => s.id === stateId);
  if (!state) return 'No state information available.';

  const items = (state.items || []).filter(item => {
    if (kind === 'goto') return symbolAfterDot(item, grammar.productions) === symbol;
    if (kind === 'shift') return symbolAfterDot(item, grammar.productions) === symbol;
    if (kind === 'reduce') return isReduceItem(item, grammar.productions);
    return false;
  });

  const itemList = items.length
    ? items.map(item => {
        const fmt = (currentParser === 'CLR1' || currentParser === 'LALR1') ? formatLR1Item : formatLR0Item;
        return `<li>${escHtml(fmt(item, grammar.productions))}</li>`;
      }).join('')
    : '<li>No matching item found.</li>';

  let summary = '';
  if (kind === 'goto') {
    const target = state.transitions.get(symbol);
    summary = `GOTO from I${stateId} on ${escHtml(symbol)} -> I${target}`;
  } else if (kind === 'shift') {
    const target = state.transitions.get(symbol);
    summary = `SHIFT on ${escHtml(symbol)} -> I${target}`;
  } else if (kind === 'reduce') {
    const reduceItems = (state.items || []).filter(item => isReduceItem(item, grammar.productions));
    const match = reduceItems.map(item => {
      const prod = grammar.productions.find(p => p.id === item.prodId);
      return prod ? `${prod.lhs} → ${prod.rhs.length === 0 ? 'ε' : prod.rhs.join(' ')}` : 'unknown production';
    }).join('<br>');
    summary = `Reduce using:<br>${match}`;
  }

  return `
    <div class="inspector-box">
      <div class="inspector-header">${kind.toUpperCase()} / ${escHtml(symbol)}</div>
      <div class="inspector-body">
        <p>${summary}</p>
        <ul class="inspector-list">${itemList}</ul>
      </div>
    </div>
  `;
}

function explainConflict(conflict) {
  if (!collection) return 'No conflict information available.';
  const state = collection.states.find(s => s.id === conflict.stateId);
  const entries = (conflict.actions || []).map(action => {
    if (action.type === 'shift') return `SHIFT ${action.target}`;
    if (action.type === 'reduce') return `REDUCE ${action.prodStr || action.target}`;
    if (action.type === 'accept') return 'ACCEPT';
    return action.type;
  }).join(' / ');
  const relevant = (state?.items || []).map(item => {
    const fmt = (currentParser === 'CLR1' || currentParser === 'LALR1') ? formatLR1Item : formatLR0Item;
    return `<li>${escHtml(fmt(item, grammar.productions))}</li>`;
  }).join('');

  return `
    <div class="inspector-box warning-box">
      <div class="inspector-header">${escHtml(conflict.type.toUpperCase())} CONFLICT</div>
      <div class="inspector-body">
        <p><strong>State I${conflict.stateId}</strong> on <strong>${escHtml(conflict.symbol)}</strong></p>
        <p>Competing actions: ${escHtml(entries)}</p>
        <ul class="inspector-list">${relevant}</ul>
      </div>
    </div>
  `;
}

function renderStates() {
  const el = $('statesSection');
  const useLR1 = currentParser === 'CLR1' || currentParser === 'LALR1';
  const fmt = useLR1 ? formatLR1Item : formatLR0Item;

  // Collect revealed state steps
  const revealed = constructionSteps.slice(0, constructionPos);
  const stateSteps = revealed.filter(s => s.type === 'state');
  const transSteps = revealed.filter(s => s.type === 'transition');

  let html = `<h3>Canonical Collection — ${stateSteps.length} state${stateSteps.length !== 1 ? 's' : ''}</h3>`;
  html += '<div class="states-grid">';

  for (const step of stateSteps) {
    const stateId = step.stateId;
    const derivation = (collection && collection.states && collection.states[stateId]) ? (collection.states[stateId].derivation || { detail: 'Closure expansion' }) : { detail: 'Closure expansion' };
    html += `<div class="state-card" id="state-${stateId}" data-state-id="${stateId}">`;
    html += `<div class="state-title">I${stateId}</div>`;
    html += `<div class="state-meta">${escHtml(derivation.detail)}</div>`;
    if (currentParser === 'LALR1' && step.mergedFrom) {
      html += `<div class="state-meta">Merged CLR states: ${step.mergedFrom.map(id => `I${id}`).join(', ')}</div>`;
    }
    html += '<div class="state-items">';
    for (const item of step.items) {
      html += `<div class="item">${escHtml(fmt(item, grammar.productions))}</div>`;
    }
    html += '</div>';

    // Show transitions for this state
    const trans = transSteps.filter(t => t.from === stateId);
    if (trans.length > 0) {
      html += '<div class="state-trans">';
      for (const t of trans) {
        html += `<span class="trans">─ ${escHtml(t.symbol)} → I${t.to}</span>`;
      }
      html += '</div>';
    }

    html += '</div>';
  }

  html += '</div>';
  el.innerHTML = html;

  el.querySelectorAll('.state-card').forEach(card => {
    card.addEventListener('click', () => {
      const sid = Number(card.dataset.stateId);
      showInspector(explainState(sid));
      el.querySelectorAll('.state-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
    });
  });
}

function renderGraph_() {
  // Build a partial collection up to current step
  const revealed = constructionSteps.slice(0, constructionPos);
  const stateSteps = revealed.filter(s => s.type === 'state');
  const transSteps = revealed.filter(s => s.type === 'transition');

  if (stateSteps.length === 0) {
    $('graphSection').innerHTML = '';
    return;
  }

  // Build partial states array
  const partialStates = stateSteps.map(s => ({
    id: s.stateId,
    items: s.items,
    transitions: new Map(),
  }));
  // Add revealed transitions
  for (const t of transSteps) {
    const state = partialStates.find(s => s.id === t.from);
    if (state) {
      state.transitions.set(t.symbol, t.to);
    }
  }

  const partial = { states: partialStates };
  renderGraph(partial, currentParser, grammar.productions, $('graphSection'));
}

function renderOperatorPrecedenceTable() {
  const el = $('tableSection');
  if (!precedenceModel) return;

  const terminals = precedenceModel.terminals;
  const rows = terminals.map(row => {
    const cells = terminals.map(col => {
      const relation = precedenceModel.relations.get(row)?.get(col) || '';
      const className = relation ? `rel-${relation}` : '';
      return `<td class="${className}">${relation || ''}</td>`;
    }).join('');
    return `<tr><th>${escHtml(row)}</th>${cells}</tr>`;
  }).join('');

  el.innerHTML = `
    <h3>Operator Precedence Relations</h3>
    <div class="table-scroll">
      <table class="parse-table">
        <thead><tr><th></th>${terminals.map(t => `<th>${escHtml(t)}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderOperatorPrecedenceConflicts() {
  const el = $('conflictSection');
  if (!precedenceModel) {
    el.innerHTML = '';
    return;
  }

  if (precedenceModel.conflicts.length === 0) {
    el.innerHTML = '<div class="msg success">✓ No precedence conflicts detected.</div>';
    return;
  }

  el.innerHTML = `
    <div class="msg warning"><strong>⚠ ${precedenceModel.conflicts.length} precedence conflict${precedenceModel.conflicts.length > 1 ? 's' : ''}</strong></div>
    ${precedenceModel.conflicts.map(conflict => `
      <div class="conflict-card">
        <div class="conflict-type">CONFLICT</div>
        <div>Pair: ${escHtml(conflict.left)} / ${escHtml(conflict.right)}</div>
        <div>Relations: ${conflict.relations.map(r => escHtml(r)).join(' / ')}</div>
      </div>
    `).join('')}
  `;
}

function renderTable() {
  if (currentParser === 'OP') {
    renderOperatorPrecedenceTable();
    return;
  }
  if (!table) return;

  const el = $('tableSection');
  const visibleSteps = tableSteps.slice(0, tablePos);

  // Build visible action/goto
  const visAction = new Map();
  const visGoto = new Map();

  for (const step of visibleSteps) {
    if (step.type === 'action') {
      const key = `${step.stateId},${step.symbol}`;
      if (!visAction.has(key)) visAction.set(key, []);
      const list = visAction.get(key);
      const isDup = list.some(a => a.type === step.action.type && a.target === step.action.target);
      if (!isDup) list.push(step.action);
    } else if (step.type === 'goto') {
      const key = `${step.stateId},${step.symbol}`;
      visGoto.set(key, step.target);
    }
  }

  const stateIds = collection.states.map(s => s.id);
  const terminals = table.terminals;
  const nonTerminals = table.nonTerminals;

  let html = '<h3>ACTION / GOTO Table</h3>';
  html += '<div class="table-scroll"><table class="parse-table">';
  html += '<thead><tr><th>State</th>';
  html += '<th colspan="' + terminals.length + '" class="action-header">ACTION</th>';
  html += '<th colspan="' + nonTerminals.length + '" class="goto-header">GOTO</th>';
  html += '</tr><tr><th></th>';
  for (const t of terminals) html += `<th>${escHtml(t)}</th>`;
  for (const nt of nonTerminals) html += `<th>${escHtml(nt)}</th>`;
  html += '</tr></thead><tbody>';

  for (const sid of stateIds) {
    html += `<tr><td class="state-col">${sid}</td>`;
    for (const t of terminals) {
      const key = `${sid},${t}`;
      const actions = visAction.get(key) || [];
      const cellClass = actions.length > 1 ? 'conflict-cell' : (actions.length === 1 && actions[0].type === 'accept' ? 'accept-cell' : '');
      const text = actions.map(formatAction).join('/');
      html += `<td class="${cellClass} clickable-cell" data-kind="action" data-symbol="${escHtml(t)}" data-state="${sid}">${text}</td>`;
    }
    for (const nt of nonTerminals) {
      const key = `${sid},${nt}`;
      const val = visGoto.get(key);
      html += `<td class="goto-cell clickable-cell" data-kind="goto" data-symbol="${escHtml(nt)}" data-state="${sid}">${val !== undefined ? val : ''}</td>`;
    }
    html += '</tr>';
  }

  html += '</tbody></table></div>';
  el.innerHTML = html;

  el.querySelectorAll('.clickable-cell').forEach(cell => {
    cell.addEventListener('click', () => {
      const sid = Number(cell.dataset.state);
      const symbol = cell.dataset.symbol;
      const kind = cell.dataset.kind;
      showInspector(explainTableCell(sid, symbol, kind));
    });
  });
}

function renderConflicts() {
  if (currentParser === 'OP') {
    renderOperatorPrecedenceConflicts();
    return;
  }
  if (!table) return;

  const el = $('conflictSection');
  // Show only conflicts visible at current table pos
  const visibleSteps = tableSteps.slice(0, tablePos);
  const conflictSteps = visibleSteps.filter(s => s.isConflict);

  if (conflictSteps.length === 0 && tablePos >= tableSteps.length) {
    el.innerHTML = '<div class="msg success">✓ No conflicts detected. Grammar is ' + parserDisplayName() + '.</div>';
    return;
  }

  if (conflictSteps.length === 0) {
    el.innerHTML = '';
    return;
  }

  // Deduplicate conflicts
  const seen = new Set();
  const uniqueConflicts = [];
  for (const c of table.conflicts) {
    const key = `${c.stateId},${c.symbol}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueConflicts.push(c);
    }
  }

  let html = `<div class="msg warning"><strong>⚠ ${uniqueConflicts.length} CONFLICT${uniqueConflicts.length > 1 ? 'S' : ''} DETECTED</strong><br>Grammar is NOT ${parserDisplayName()}.</div>`;
  for (const c of uniqueConflicts) {
    html += `<div class="conflict-card clickable-conflict" data-conflict-state="${c.stateId}" data-conflict-symbol="${escHtml(c.symbol)}">`;
    html += `<div class="conflict-type">${c.type.toUpperCase()} CONFLICT</div>`;
    html += `<div>State: I${c.stateId} &nbsp; Symbol: <code>${escHtml(c.symbol)}</code></div>`;
    html += '<div>Actions:';
    for (const a of c.actions) {
      if (a.type === 'shift') html += ` SHIFT ${a.target}`;
      else if (a.type === 'reduce') html += ` REDUCE ${a.prodStr}`;
      else if (a.type === 'accept') html += ' ACCEPT';
    }
    html += '</div></div>';
  }

  el.innerHTML = html;

  el.querySelectorAll('.clickable-conflict').forEach(card => {
    card.addEventListener('click', () => {
      const stateId = Number(card.dataset.conflictState);
      const symbol = card.dataset.conflictSymbol;
      const conflict = table.conflicts.find(c => c.stateId === stateId && c.symbol === symbol);
      if (conflict) showInspector(explainConflict(conflict));
    });
  });
}

function renderParseTable() {
  const el = $('parseResultSection');
  const visible = parseSteps.slice(0, parsePos);

  if (visible.length === 0) {
    el.innerHTML = '<p class="hint">Click "Next Step" to begin parsing.</p>';
    return;
  }

  let html = '<div class="table-scroll"><table class="parse-table parse-steps-table">';
  html += '<thead><tr><th>#</th><th>Stack</th><th>Input</th><th>Action</th></tr></thead><tbody>';

  for (let i = 0; i < visible.length; i++) {
    const s = visible[i];
    const isLast = i === visible.length - 1;
    const rowClass = isLast ? (s.action.startsWith('ACCEPT') ? 'accept-row' : s.action.startsWith('ERROR') ? 'error-row' : '') : '';
    html += `<tr class="${rowClass}">`;
    html += `<td>${i + 1}</td>`;
    html += `<td class="mono">${escHtml(s.stack)}</td>`;
    html += `<td class="mono">${escHtml(s.input)}</td>`;
    html += `<td>${escHtml(s.action)}</td>`;
    html += '</tr>';
  }

  html += '</tbody></table></div>';

  // Show final result if all steps shown
  if (parsePos >= parseSteps.length && parseSteps.length > 0) {
    const last = parseSteps[parseSteps.length - 1];
    if (last.action.startsWith('ACCEPT')) {
      html += '<div class="msg success parse-result">✓ ACCEPTED</div>';
    } else if (last.action.startsWith('ERROR')) {
      html += `<div class="msg error parse-result">✗ REJECTED<br><pre>${escHtml(last.action.replace('ERROR: ', ''))}</pre></div>`;
    }
  }

  el.innerHTML = html;
}

function updateStatus() {
  const parts = [];
  parts.push(`Parser: <strong>${parserDisplayName()}</strong>`);
  if (currentParser === 'OP' && precedenceModel) {
    parts.push(`Relations: <strong>${precedenceModel.relations.size}</strong>`);
    parts.push(`Conflicts: <strong>${precedenceModel.conflicts.length}</strong>`);
  } else if (collection) {
    const totalStates = collection.states.length;
    const totalSteps = constructionSteps.length;
    parts.push(`States: <strong>${builtStatesCount} / ${totalStates}</strong>`);
    const pct = constructionPos >= totalSteps ? '100' : Math.floor((constructionPos / totalSteps) * 100);
    parts.push(`Construction: <strong>${constructionPos >= totalSteps ? 'Complete' : pct + '%'}</strong>`);
  }
  if (table && currentParser !== 'OP') {
    parts.push(`Table: <strong>${tablePos} / ${tableSteps.length}</strong>`);
    parts.push(`Conflicts: <strong>${table.conflicts.length}</strong>`);
  }
  $('statusBar').innerHTML = parts.join(' &nbsp;|&nbsp; ');
}

function renderOverviewStats() {
  const stats = $('overviewStats');
  const items = [];

  if (grammar) {
    if (currentParser === 'OP' && precedenceModel) {
      items.push({ label: 'Relations', value: String(precedenceModel.relations.size) });
      items.push({ label: 'Productions', value: String(grammar.productions.length) });
      items.push({ label: 'Terminals', value: String(grammar.terminals.size) });
      items.push({ label: 'Non-Terminals', value: String(grammar.nonTerminals.size) });
      items.push({ label: 'Conflicts', value: String(precedenceModel.conflicts.length) });
    } else {
      items.push({ label: 'States', value: collection ? String(collection.states.length) : '—' });
      items.push({ label: 'Productions', value: String(grammar.productions.length) });
      items.push({ label: 'Terminals', value: String(grammar.terminals.size) });
      items.push({ label: 'Non-Terminals', value: String(grammar.nonTerminals.size) });
      items.push({ label: 'Conflicts', value: table ? String(table.conflicts.length) : '—' });
    }
  } else {
    items.push({ label: 'States', value: '—' });
    items.push({ label: 'Productions', value: '—' });
    items.push({ label: 'Terminals', value: '—' });
    items.push({ label: 'Non-Terminals', value: '—' });
    items.push({ label: 'Conflicts', value: '—' });
  }

  stats.innerHTML = items.map(item => `
    <div class="stat-card">
      <span>${item.label}</span>
      <strong>${item.value}</strong>
    </div>
  `).join('');
}

function updateWorkflow(stage) {
  const steps = document.querySelectorAll('.workflow li');
  const map = ['grammar', 'firstfollow', 'states', 'table', 'conflicts', 'parse'];
  const index = map.indexOf(stage);
  steps.forEach((step, i) => {
    step.classList.toggle('active', i === index || (stage === 'firstfollow' && i === 1) || (stage === 'table' && i === 3) || (stage === 'conflicts' && i === 4) || (stage === 'parse' && i === 5));
  });
}

function parserDisplayName() {
  const names = { 'LR0': 'LR(0)', 'SLR1': 'SLR(1)', 'CLR1': 'CLR(1)', 'LALR1': 'LALR(1)', 'OP': 'Operator Precedence' };
  return names[currentParser] || currentParser;
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Init ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
