const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const generated = require('../power-automate/kiwi-initial-comment/build-definition.cjs');
const definition = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'power-automate', 'kiwi-initial-comment', 'operational-definition.json')));
const actions = new Map();
let deepest = 0;
function walk(current, depth = 0, inLoop = false) {
  for (const [name, node] of Object.entries(current || {})) {
    assert.ok(!actions.has(name), `Duplicate action ${name}`);
    actions.set(name, node);
    deepest = Math.max(deepest, depth);
    if (node.type === 'Terminate') assert.equal(inLoop, false, `Terminate in loop: ${name}`);
    if (node.type === 'SetVariable') assert.ok(!JSON.stringify(node.inputs.value).includes(`variables('${node.inputs.name}')`), `Self-referencing variable ${name}`);
    for (const dependency of Object.keys(node.runAfter || {})) assert.ok(current[dependency], `Out-of-scope runAfter ${name} -> ${dependency}`);
    const nextDepth = depth + (['If', 'Scope', 'Until', 'Foreach', 'Switch'].includes(node.type) ? 1 : 0);
    walk(node.actions, nextDepth, inLoop || ['Until', 'Foreach'].includes(node.type));
    walk(node.else?.actions, nextDepth, inLoop || ['Until', 'Foreach'].includes(node.type));
  }
}
walk(definition.actions);

test('native definition matches generator, disabled defaults and bounded serial polling', () => {
  assert.deepEqual(definition, generated);
  assert.equal(definition.parameters.ActivationCutoffUtc.defaultValue, '2099-12-31T00:00:00Z');
  assert.equal(definition.parameters.VerifiedCommentLimit.defaultValue, 0);
  assert.equal(definition.parameters.LedgerListId.defaultValue, '');
  assert.equal(definition.triggers.Recurrence.recurrence.interval, 1);
  assert.equal(definition.triggers.Recurrence.runtimeConfiguration.concurrency.runs, 1);
  assert.ok(deepest <= 8, `Control depth ${deepest}`);
  for (const node of actions.values()) if (node.type === 'Foreach') assert.equal(node.runtimeConfiguration.concurrency.repetitions, 1);
});

test('native connector shapes use existing verified HTTP and conversion operations without secrets', () => {
  for (const node of actions.values()) {
    if (node.type !== 'OpenApiConnection') continue;
    assert.ok(['HttpRequest', 'HtmlToText'].includes(node.inputs.host.operationId));
    assert.equal(node.inputs.authentication, "@parameters('$authentication')");
    if (node.inputs.host.operationId === 'HttpRequest') {
      assert.equal(node.inputs.host.connectionName, 'shared_sharepointonline');
      assert.ok(node.inputs.parameters['parameters/uri']);
      assert.deepEqual(node.inputs.retryPolicy, { type: 'none' });
    } else {
      assert.equal(node.inputs.host.connectionName, 'shared_conversionservice');
      assert.deepEqual(node.inputs.parameters, { Content: "@body('Read_current_ticket')?['Descriptif']" });
    }
  }
  const writes = [...actions.values()].filter(node => node.inputs?.parameters?.['parameters/method'] === 'POST');
  assert.equal(writes.length, 3);
  assert.equal(actions.get('Complete_ledger').inputs.parameters['parameters/headers']['IF-MATCH'], "@outputs('Current_etag')");
  assert.ok(!JSON.stringify(writes).includes('IF-MATCH":"*'));
  assert.ok(!JSON.stringify(definition).includes('TeamsReplyDispatchToken'));
});

test('native POST is authorized only by successful unique reservation; JSON preserves requester text', () => {
  assert.deepEqual(actions.get('Save_reserved_id').runAfter, { Reserve_pending: ['Succeeded'] });
  assert.deepEqual(actions.get('Post_native_comment').runAfter, { Save_reserved_record: ['Succeeded'] });
  assert.deepEqual(actions.get('Recover_uncertain_reservation').runAfter, { Reserve_pending: ['Failed', 'TimedOut'] });
  assert.equal(actions.get('Post_native_comment').inputs.parameters['parameters/body'], "@setProperty(json('{}'),'text',variables('CommentText'))");
  assert.match(actions.get('Reservation_recovery_valid').actions.Fail_reservation_uncertain.inputs.value, /no POST authorized/);
  assert.match(actions.get('Fail_missing_comment').inputs.value, /no automatic replay/);
});

test('native pagination rejects partial source pages and enforces same-item continuations and bounded comment readback', () => {
  assert.match(actions.get('Ticket_page_complete').expression, /lessOrEquals.*100/);
  assert.match(actions.get('Ticket_page_complete').expression, /odata.nextLink/);
  assert.match(actions.get('Read_new_tickets').inputs.parameters['parameters/uri'], /Created ge datetime/);
  for (const prefix of ['Before', 'After']) {
    assert.equal(actions.get(`${prefix}_pages`).limit.count, 100);
    assert.match(actions.get(`${prefix}_validate_next`).expression, /startsWith/);
    assert.match(actions.get(`${prefix}_validate_next`).expression, /parameters\('SiteUrl'\)/);
    assert.match(actions.get(`${prefix}_validate_next`).expression, /CommentPageCount/);
  }
  assert.match(actions.get('Snapshot_unchanged').expression, /Current_payload.*text/);
  assert.match(actions.get('Exact_text_and_id').expression, /CommentText/);
});

test('workflow expressions have balanced delimiters and referenced named actions exist', () => {
  function inspect(value) {
    if (Array.isArray(value)) return value.forEach(inspect);
    if (value && typeof value === 'object') return Object.values(value).forEach(inspect);
    if (typeof value !== 'string' || !value.startsWith('@')) return;
    let quoted = false;
    let balance = 0;
    for (let index = 1; index < value.length; index++) {
      const character = value[index];
      if (character === "'") {
        if (quoted && value[index + 1] === "'") { index++; continue; }
        quoted = !quoted;
      } else if (!quoted) {
        if (character === '(') balance++;
        if (character === ')') balance--;
        assert.ok(balance >= 0, value);
      }
    }
    assert.equal(quoted, false, `Unclosed string: ${value}`);
    assert.equal(balance, 0, `Unbalanced expression: ${value}`);
    for (const match of value.matchAll(/(?:body|outputs|items)\('([^']+)'\)/g)) assert.ok(actions.has(match[1]), `Unknown reference ${match[1]}`);
  }
  inspect(definition);
});
