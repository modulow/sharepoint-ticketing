const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const blueprint = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'power-automate', 'kiwi-teams-replies', 'workflow-blueprint.json'),
  'utf8'
));

test('Teams reply blueprint declares its honest import boundary', () => {
  assert.equal(blueprint.kind, 'PowerAutomateCloudFlowBlueprint');
  assert.equal(blueprint.importable, false);
  assert.match(blueprint.importBlocker, /connection references/i);
  assert.equal(blueprint.existingIntakeFlow.mustNotDuplicate, true);
});

test('Teams reply blueprint enforces authorization and requester safety', () => {
  const invariants = blueprint.invariants.join('\n');
  assert.match(invariants, /literal case-sensitive @user/);
  assert.match(invariants, /effective EditListItems/);
  assert.match(invariants, /activationCutoffUtc/);
  assert.match(invariants, /unique durable dedupe key/);
  assert.match(invariants, /never treated as proof of delivery/);
  assert.match(invariants, /No stale requester or agent/);
});

test('Teams reply blueprint has durable state and pagination controls', () => {
  const exchangeColumns = blueprint.requiredColumns.TicketExchanges;
  const sourceId = exchangeColumns.find(column => column.internalName === 'SourceMessageId');
  const deliveryState = exchangeColumns.find(column => column.internalName === 'DeliveryState');
  assert.equal(sourceId.enforceUniqueValues, true);
  assert.deepEqual(deliveryState.choices, [
    'Processing',
    'AwaitingNativeRule',
    'AgentConfirmed',
    'FailedRetryable',
    'FailedTerminal',
    'IgnoredInternal'
  ]);
  assert.equal(blueprint.trigger.concurrency, 1);
  assert.equal(blueprint.parameters.pageThreshold, 100000);
  assert.match(JSON.stringify(blueprint.pipeline), /onThresholdReached/);
});

test('Teams reply blueprint never writes long public text to legacy reply field', () => {
  const serialized = JSON.stringify(blueprint);
  assert.match(serialized, /RequesterReplyText/);
  assert.match(serialized, /R_x00e9_ponseaudemandeur/);
  assert.match(serialized, /never sets Delivered|never call.*Delivered/i);
});

