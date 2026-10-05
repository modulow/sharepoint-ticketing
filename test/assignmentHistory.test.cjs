'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { recoverAssignmentTime, withAssignmentHistory } =
  require('../power-automate/kiwi-planner-sync/assignment-history.cjs');
const { buildDesiredTasks } = require('../power-automate/kiwi-planner-sync/planner-sync-core.cjs');

const time = day => `2026-09-${String(day).padStart(2, '0')}T10:00:00Z`;
const ticket = { id: 1, assigneeEntraObjectId: 'agent-b', sourceVersion: '5.0' };
const history = () => ({
  complete: true,
  startsAtCreation: true,
  versions: [null, 'agent-a', 'agent-b', 'agent-b', 'agent-b'].map((agent, i) => ({
    version: `${i + 1}.0`, createdUtc: time(i + 1), assigneeEntraObjectId: agent
  }))
});
const rejects = (code, change) => {
  const h = history();
  change(h);
  assert.throws(() => recoverAssignmentTime(ticket, h), error => error.code === code);
};

test('assignment time excludes later unrelated modifications', () => {
  assert.equal(recoverAssignmentTime(ticket, history()), new Date(time(3)).toISOString());
});

test('A to B to A uses the latest assignment event, not the first', () => {
  const h = history();
  h.versions[0].assigneeEntraObjectId = 'agent-b';
  assert.equal(recoverAssignmentTime(ticket, h), new Date(time(3)).toISOString());
});

test('case-insensitive Entra identity preserves the actual assignment time', () => {
  const h = history();
  h.versions[3].assigneeEntraObjectId = 'AGENT-B';
  assert.equal(recoverAssignmentTime(ticket, h), new Date(time(3)).toISOString());
});

test('initial assignment is provable only from history beginning at creation', () => {
  const h = history();
  h.versions.forEach(v => { v.assigneeEntraObjectId = 'agent-b'; });
  assert.equal(recoverAssignmentTime(ticket, h), new Date(time(1)).toISOString());
  h.startsAtCreation = false;
  assert.throws(() => recoverAssignmentTime(ticket, h), e => e.code === 'MissingAssignmentBoundary');
});

test('retained history proves an assignment only when its earlier boundary is present', () => {
  const h = history();
  h.startsAtCreation = false;
  h.versions = h.versions.slice(1);
  assert.equal(recoverAssignmentTime(ticket, h), new Date(time(3)).toISOString());
  h.versions = h.versions.slice(1);
  assert.throws(() => recoverAssignmentTime(ticket, h), e => e.code === 'MissingAssignmentBoundary');
});

test('unassignment clears ranking time without requiring old history', () => {
  assert.equal(recoverAssignmentTime({ id: 1, assigneeEntraObjectId: null }, null), null);
  assert.throws(() => recoverAssignmentTime({ id: 1 }, null), e => e.code === 'InvalidHistoryIdentity');
  assert.throws(() => recoverAssignmentTime({ ...ticket, assigneeEntraObjectId: undefined }, history()),
    e => e.code === 'InvalidHistoryIdentity');
});

test('incomplete histories fail rather than falling back to Modified', () => {
  rejects('IncompleteAssignmentHistory', h => { h.complete = false; });
  rejects('IncompleteAssignmentHistory', h => { h.versions = []; });
});

test('changed source snapshot fails before assigning a timestamp', () => {
  rejects('AssignmentSnapshotChanged', h => { h.versions[4].version = '6.0'; });
  rejects('AssignmentSnapshotChanged', h => { h.versions[4].assigneeEntraObjectId = 'agent-c'; });
});

test('invalid, missing or duplicate version data fails explicitly', () => {
  rejects('InvalidAssignmentVersion', h => { delete h.versions[1].assigneeEntraObjectId; });
  rejects('InvalidAssignmentVersion', h => { h.versions[1].version = '1.0'; });
  rejects('InvalidHistoryIdentity', h => { h.versions[1].assigneeEntraObjectId = ''; });
  rejects('InvalidAssignmentTimestamp', h => { h.versions[1].createdUtc = '2026-09-02T10:00:00'; });
  rejects('UnorderedAssignmentHistory', h => { h.versions[1].createdUtc = time(7); });
});

test('source decorator computes timestamps without mutating snapshot or trusting cached time', async () => {
  const snapshot = { complete: true, agents: [], tickets: [{ ...ticket, assignedAtUtc: time(5) },
    { id: 2, assigneeEntraObjectId: null, assignedAtUtc: time(4) }] };
  const calls = [];
  const decorated = withAssignmentHistory({ readCompleteSnapshot: async () => snapshot }, async t => {
    calls.push(t.id);
    return history();
  });
  const result = await decorated.readCompleteSnapshot();
  assert.deepEqual(calls, [1]);
  assert.equal(result.tickets[0].assignedAtUtc, new Date(time(3)).toISOString());
  assert.equal(result.tickets[1].assignedAtUtc, null);
  assert.equal(snapshot.tickets[0].assignedAtUtc, time(5));
});

test('source and history failures propagate without a success-shaped partial snapshot', async () => {
  const source = { readCompleteSnapshot: async () => ({ complete: true, tickets: [ticket] }) };
  const decorated = withAssignmentHistory(source, async () => ({ ...history(), complete: false }));
  await assert.rejects(decorated.readCompleteSnapshot(), e => e.code === 'IncompleteAssignmentHistory');
  await assert.rejects(withAssignmentHistory({ readCompleteSnapshot: async () => ({ complete: false }) },
    async () => history()).readCompleteSnapshot(), e => e.code === 'IncompleteSourceSnapshot');
});

test('recovered events drive exactly the latest 20 per agent, with ticket-ID tie breaks', async () => {
  const agents = ['a', 'b'].map(name => ({
    entraObjectId: `agent-${name}`, displayName: name, upn: `${name}@example.test`, bucketId: `bucket-${name}`
  }));
  const tickets = Array.from({ length: 44 }, (_, index) => ({
    id: index + 1, subject: `Ticket ${index + 1}`, sourceVersion: '3.0',
    assigneeEntraObjectId: index < 22 ? 'agent-a' : 'agent-b',
    assigneeDisplayName: 'Agent', assigneeUpn: 'agent@example.test',
    description: 'Fixture', requester: 'Requester', status: 'New', priority: 'Normal',
    category: 'Software', created: time(1), modified: time(28),
    sourceEditUrl: `https://europarl.sharepoint.com/sites/learn.IT-Kiwi/Lists/EuropaTickets/EditForm.aspx?ID=${index + 1}`
  }));
  const source = withAssignmentHistory({
    readCompleteSnapshot: async () => ({ complete: true, agents, tickets })
  }, async t => ({
    complete: true, startsAtCreation: true,
    versions: [
      { version: '1.0', createdUtc: time(1), assigneeEntraObjectId: null },
      { version: '2.0', createdUtc: time(2 + Math.floor((t.id - 1) % 22 / 2)),
        assigneeEntraObjectId: t.assigneeEntraObjectId },
      { version: '3.0', createdUtc: time(28), assigneeEntraObjectId: t.assigneeEntraObjectId }
    ]
  }));
  const snapshot = await source.readCompleteSnapshot();
  const desired = buildDesiredTasks(snapshot.agents, snapshot.tickets);
  for (const [index, agent] of agents.entries()) {
    const selected = desired.filter(task => task.assigneeEntraObjectId === agent.entraObjectId);
    assert.equal(selected.length, 20);
    assert.deepEqual(selected.map(task => task.sourceTicketId),
      Array.from({ length: 20 }, (_, i) => (index + 1) * 22 - i));
  }
});
