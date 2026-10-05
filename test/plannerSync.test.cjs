const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  MANAGED_MARKER_PREFIX,
  MAX_DESCRIPTION_LENGTH,
  buildDesiredTasks,
  buildGraphPayloads,
  resolveExistingPlan,
  planReconciliation
} = require('../power-automate/kiwi-planner-sync/planner-sync-core.cjs');

const root = path.join(__dirname, '..', 'power-automate', 'kiwi-planner-sync');
const blueprint = JSON.parse(fs.readFileSync(path.join(root, 'workflow-blueprint.json'), 'utf8'));
const operationalDefinition = JSON.parse(fs.readFileSync(
  path.join(root, 'operational-definition.json'),
  'utf8'
));

const agents = [
  { entraObjectId: 'agent-a', displayName: 'Agent A', upn: 'agent-a@example.test', bucketId: 'bucket-a' },
  { entraObjectId: 'agent-b', displayName: 'Agent B', upn: 'agent-b@example.test', bucketId: 'bucket-b' }
];

function ticket(id, overrides = {}) {
  return {
    id,
    subject: `Ticket ${id}`,
    description: `Description ${id}`,
    requester: 'Requester',
    category: 'Software',
    priority: 'High',
    status: 'New',
    assigneeEntraObjectId: 'agent-a',
    assigneeDisplayName: 'Agent A',
    assigneeUpn: 'agent-a@example.test',
    assignedAtUtc: new Date(Date.UTC(2026, 0, id)).toISOString(),
    dueDate: null,
    resolution: null,
    created: '2026-01-01T00:00:00Z',
    modified: '2026-01-02T00:00:00Z',
    fields: { Location: 'Floor 3' },
    sourceEditUrl: `https://europarl.sharepoint.com/sites/learn.IT-Kiwi/Lists/EuropaTickets/EditForm.aspx?ID=${id}`,
    attachments: [{
      name: `file-${id}.txt`,
      url: `https://europarl.sharepoint.com/sites/learn.IT-Kiwi/Lists/EuropaTickets/Attachments/${id}/file-${id}.txt`
    }],
    exchanges: [{
      id: `exchange-${id}`,
      message: `Exchange body ${id}`,
      author: 'Agent A',
      source: 'Teams',
      visibility: 'Internal',
      date: '2026-01-03T00:00:00Z',
      editUrl: `https://europarl.sharepoint.com/sites/learn.IT-Kiwi/Lists/TicketExchanges/EditForm.aspx?ID=${id}`
    }],
    ...overrides
  };
}

test('blueprint encodes approved Kiwi sync configuration and fail-closed constraints', () => {
  assert.equal(blueprint.parameters.teamId, '435074fb-2e8d-4c67-b06a-0359ddc5a939');
  assert.equal(blueprint.parameters.ticketsListId, 'f673fe2d-9733-46dd-9afe-4bf614c99202');
  assert.equal(blueprint.parameters.exchangesListId, '58aa42f2-6fa0-4df2-9a76-90189fece896');
  assert.equal(blueprint.parameters.pollIntervalMinutes, 15);
  assert.equal(blueprint.parameters.ticketsPerAgent, 20);
  assert.equal(blueprint.parameters.runConcurrency, 1);
  assert.equal(blueprint.importablePackageAvailable, false);
  assert.equal(operationalDefinition.plannerSync.trigger.intervalMinutes, 15);
  assert.equal(operationalDefinition.plannerSync.ticketWindow.limitPerAgent, 20);
  assert.equal(operationalDefinition.plannerSync.authorizedAgents.bucketPolicy.includes('including agents with no current tickets'), true);
  assert.equal(operationalDefinition.plannerSync.ticketCard.maxDescriptionCharacters, 4000);
  assert.match(blueprint.flows.assignmentTimestampCapture.bootstrap, /fail closed/);
  assert.match(blueprint.flows.plannerSync.changeDetection, /Modified/);
  assert.match(blueprint.invariants.find(invariant => invariant.includes('4000')), /no content is truncated/i);
});

test('hides priority from card descriptions without changing source or native payload', () => {
  const source = ticket(1, {
    fields: { Priority: 'High', priority: 'High', Priorite: 'High', 'Priorité': 'High', Location: 'Floor 3' }
  });
  const desired = buildDesiredTasks(agents, [source])[0];
  assert.doesNotMatch(desired.description, /priority|priorite|priorité/i);
  assert.match(desired.description, /Floor 3/);
  assert.equal(desired.priority, 3);
  assert.equal(source.priority, 'High');
  assert.equal(source.fields.Priority, 'High');
});

test('selects the 20 newest assignment timestamps separately for every approved agent', () => {
  const tickets = Array.from({ length: 22 }, (_, index) => ticket(index + 1));
  tickets[20] = ticket(21, { assigneeEntraObjectId: 'agent-b', assignedAtUtc: '2026-02-01T00:00:00Z' });
  tickets[21] = ticket(22, { assigneeEntraObjectId: 'agent-b', assignedAtUtc: '2026-02-02T00:00:00Z' });

  const desired = buildDesiredTasks(agents, tickets);
  const agentA = desired.filter(task => task.assigneeEntraObjectId === 'agent-a');
  const agentB = desired.filter(task => task.assigneeEntraObjectId === 'agent-b');

  assert.equal(agentA.length, 20);
  assert.deepEqual(agentA.map(task => task.sourceTicketId), Array.from({ length: 20 }, (_, index) => 20 - index));
  assert.deepEqual(agentB.map(task => task.sourceTicketId), [22, 21]);
  assert.equal(agentB[0].bucketId, 'bucket-b');
});

test('keeps empty agents in the roster and breaks equal timestamps by descending ticket ID', () => {
  const selected = buildDesiredTasks(agents, [
    ticket(8, { assignedAtUtc: '2026-03-01T00:00:00Z' }),
    ticket(9, { assignedAtUtc: '2026-03-01T00:00:00Z' })
  ]);
  assert.deepEqual(selected.map(task => task.sourceTicketId), [9, 8]);
  assert.equal(selected.some(task => task.assigneeEntraObjectId === 'agent-b'), false);
});

test('fails closed for missing assignment timestamps and agents outside the approved roster', () => {
  assert.throws(
    () => buildDesiredTasks(agents, [ticket(1, { assignedAtUtc: undefined })]),
    error => error.code === 'MissingAssignmentTimestamp'
  );
  assert.throws(
    () => buildDesiredTasks(agents, [ticket(2, { assigneeEntraObjectId: 'unapproved' })]),
    error => error.code === 'UnapprovedAssignee'
  );
});

test('includes full ticket fields, attachment links and exchange history without truncation', () => {
  const desired = buildDesiredTasks(agents, [ticket(1)])[0];
  assert.match(desired.description, /KiwiPlannerSync:v1:1/);
  assert.match(desired.description, /Ticket #1 - Ticket 1/);
  assert.match(desired.description, /Status: New\nCategory: Software/);
  assert.doesNotMatch(desired.description, /Priority:/);
  assert.match(desired.description, /"Location": "Floor 3"/);
  assert.match(desired.description, /Exchange body 1/);
  assert.equal(desired.title, '#1 - Ticket 1');
  assert.equal(desired.priority, 3);
  assert.deepEqual(desired.references.map(reference => reference.kind), ['ticket', 'attachment', 'exchange']);
  assert.equal(desired.references[0].url, ticket(1).sourceEditUrl);

  assert.throws(
    () => buildDesiredTasks(agents, [ticket(2, {
      exchanges: [{
        id: 'large-exchange',
        message: 'x'.repeat(MAX_DESCRIPTION_LENGTH),
        author: 'Agent A',
        date: '2026-01-03T00:00:00Z',
        editUrl: 'https://europarl.sharepoint.com/sites/learn.IT-Kiwi/Lists/TicketExchanges/EditForm.aspx?ID=2'
      }]
    })]),
    error => error.code === 'PlannerDescriptionTooLong'
  );
  assert.throws(
    () => buildDesiredTasks(agents, [ticket(3, {
      attachments: [{ name: 'unsafe', url: 'http://tenant.example.test/file' }]
    })]),
    error => error.code === 'InvalidSourceUrl'
  );
  assert.throws(
    () => buildDesiredTasks(agents, [ticket(5, {
      sourceEditUrl: 'https://attacker.example.test/edit'
    })]),
    error => error.code === 'InvalidSourceUrl'
  );
  assert.throws(
    () => buildDesiredTasks(agents, [ticket(4, {
      exchanges: [{
        id: 'exchange-4',
        message: 'missing link',
        author: 'Agent A',
        date: '2026-01-03T00:00:00Z'
      }]
    })]),
    error => error.code === 'InvalidSourceUrl'
  );
});

test('keeps completed tickets eligible and maps completion independently from ticket selection', () => {
  const [resolved, inProgress, closed] = buildDesiredTasks(agents, [
    ticket(1, { status: 'Resolved' }),
    ticket(2, { status: 'In progress' }),
    ticket(3, { status: 'Closed' })
  ]);
  assert.equal(resolved.percentComplete, 100);
  assert.equal(closed.percentComplete, 100);
  assert.equal(inProgress.percentComplete, 50);
});

test('creates, updates and recovers tasks using stable markers and per-agent mappings', () => {
  const tickets = [
    ticket(1),
    ticket(2, { assigneeEntraObjectId: 'agent-b', assignedAtUtc: '2026-04-01T00:00:00Z' })
  ];
  const plan = planReconciliation({
    agents,
    tickets,
    stateMappings: [{
      sourceTicketId: 1,
      plannerTaskId: 'task-1',
      managedMarker: `${MANAGED_MARKER_PREFIX}1`
    }],
    existingTasks: [
      { id: 'task-1', marker: `${MANAGED_MARKER_PREFIX}1` },
      { id: 'orphan-2', marker: `${MANAGED_MARKER_PREFIX}2` },
      { id: 'manual-task', marker: undefined }
    ]
  });
  assert.deepEqual(plan.upserts.map(item => item.operation), ['update', 'recover']);
  assert.equal(plan.upserts[1].existingTaskId, 'orphan-2');
  assert.equal(plan.upserts[1].desired.bucketId, 'bucket-b');
  assert.equal(plan.upserts[1].desired.assigneeEntraObjectId, 'agent-b');
  assert.deepEqual(plan.deletes, []);
});

test('moves a managed task with its ticket when the assignee changes', () => {
  const marker = `${MANAGED_MARKER_PREFIX}1`;
  const updatedTicket = ticket(1, {
    assigneeEntraObjectId: 'agent-b',
    assigneeDisplayName: 'Agent B',
    assigneeUpn: 'agent-b@example.test',
    assignedAtUtc: '2026-05-01T00:00:00Z'
  });
  const plan = planReconciliation({
    agents,
    tickets: [updatedTicket],
    stateMappings: [{
      sourceTicketId: 1,
      plannerTaskId: 'task-1',
      managedMarker: marker
    }],
    existingTasks: [{
      id: 'task-1',
      marker,
      title: updatedTicket.subject,
      description: JSON.stringify({ managedMarker: marker, sourceTicketId: 1 }),
      bucketId: 'bucket-a',
      assigneeEntraObjectId: 'agent-a',
      percentComplete: 0,
      dueDate: null,
      references: []
    }]
  });
  assert.equal(plan.upserts[0].operation, 'update');
  assert.equal(plan.upserts[0].desired.bucketId, 'bucket-b');
  assert.equal(plan.upserts[0].desired.assigneeEntraObjectId, 'agent-b');
});

test('does not rewrite a task whose canonical content and routing already match', () => {
  const desired = buildDesiredTasks(agents, [ticket(1)])[0];
  const plan = planReconciliation({
    agents,
    tickets: [ticket(1)],
    stateMappings: [{
      sourceTicketId: 1,
      plannerTaskId: 'task-1',
      managedMarker: desired.marker
    }],
    existingTasks: [{
      id: 'task-1',
      marker: desired.marker,
      title: desired.title,
      description: desired.description,
      bucketId: desired.bucketId,
      assigneeEntraObjectId: desired.assigneeEntraObjectId,
      percentComplete: desired.percentComplete,
      priority: desired.priority,
      previewType: desired.previewType,
      dueDate: desired.dueDate,
      references: desired.references
    }]
  });
  assert.equal(plan.upserts[0].operation, 'unchanged');
});

test('recovers an orphan marked task when its mapping points to a missing task ID', () => {
  const desired = buildDesiredTasks(agents, [ticket(1)])[0];
  const plan = planReconciliation({
    agents,
    tickets: [ticket(1)],
    stateMappings: [{
      sourceTicketId: 1,
      plannerTaskId: 'deleted-task',
      managedMarker: desired.marker
    }],
    existingTasks: [{
      id: 'recovered-task',
      marker: desired.marker,
      title: desired.title,
      description: desired.description,
      bucketId: desired.bucketId,
      assigneeEntraObjectId: desired.assigneeEntraObjectId,
      percentComplete: desired.percentComplete,
      priority: desired.priority,
      previewType: desired.previewType,
      dueDate: desired.dueDate,
      references: desired.references
    }]
  });

  assert.equal(plan.upserts[0].operation, 'recover');
  assert.equal(plan.upserts[0].existingTaskId, 'recovered-task');
});

test('uses only the existing kiwi tickets plan in the verified group', () => {
  const plans = [
    { id: 'kiwi-plan', title: 'kiwi tickets', owner: 'kiwi-group' },
    { id: 'other-plan', title: 'kiwi tickets', owner: 'other-group' }
  ];
  assert.equal(resolveExistingPlan(plans, 'kiwi-group'), 'kiwi-plan');
  assert.throws(() => resolveExistingPlan([], 'kiwi-group'), { code: 'ExistingPlanNotResolved' });
  assert.throws(() => resolveExistingPlan([
    ...plans, { id: 'duplicate', title: 'kiwi tickets', owner: 'kiwi-group' }
  ], 'kiwi-group'), { code: 'ExistingPlanNotResolved' });
  assert.equal(resolveExistingPlan(plans, 'kiwi-group', 'kiwi-plan'), 'kiwi-plan');
  assert.throws(() => resolveExistingPlan(plans, 'kiwi-group', 'other-plan'),
    { code: 'ExistingPlanNotResolved' });
  assert.throws(() => resolveExistingPlan([{ id: 'unknown', title: 'kiwi tickets' }], undefined),
    { code: 'ExistingPlanNotResolved' });
});

test('maps every source priority and completion to native Planner options', () => {
  for (const [priority, expected] of Object.entries({ Critical: 1, High: 3, Normal: 5, Low: 9 })) {
    const desired = buildDesiredTasks(agents, [ticket(1, {
      priority, status: 'Resolved', dueDate: '2026-02-01T12:00:00Z'
    })])[0];
    const payload = buildGraphPayloads(desired, 'kiwi-plan');
    assert.equal(payload.task.planId, 'kiwi-plan');
    assert.equal(payload.task.priority, expected);
    assert.equal(payload.task.percentComplete, 100);
    assert.equal(payload.task.dueDateTime, '2026-02-01T12:00:00Z');
    assert.equal(payload.task.bucketId, 'bucket-a');
    assert.equal(payload.task.assignments['agent-a']['@odata.type'], '#microsoft.graph.plannerAssignment');
    assert.equal(payload.details.previewType, 'description');
    assert.equal(payload.details.description, desired.description);
  }
  assert.throws(() => buildDesiredTasks(agents, [ticket(1, { priority: 'Unknown' })]),
    { code: 'UnsupportedTicketPriority' });
  assert.throws(() => buildDesiredTasks(agents, [ticket(1, { status: 'Unknown' })]),
    { code: 'UnsupportedTicketStatus' });
  assert.throws(() => buildDesiredTasks(agents, [ticket(1, { dueDate: '2026-02-01' })]),
    { code: 'InvalidDueDate' });
  assert.throws(() => buildDesiredTasks(agents, [ticket(1, { subject: 'x'.repeat(255) })]),
    { code: 'PlannerTitleTooLong' });
});

test('Graph update removes stale assignees and references without changing the plan', () => {
  const desired = buildDesiredTasks(agents, [ticket(1)])[0];
  const payload = buildGraphPayloads(desired, 'kiwi-plan', {
    id: 'task-1', planId: 'kiwi-plan',
    assignments: { 'old-agent': {}, 'agent-a': {} },
    references: { 'https%3A//europarl%2Esharepoint%2Ecom/obsolete': {} }
  });
  assert.equal(payload.task.planId, undefined);
  assert.equal(payload.task.assignments['old-agent'], null);
  assert.equal(payload.task.dueDateTime, null);
  assert.equal(payload.details.references['https%3A//europarl%2Esharepoint%2Ecom/obsolete'], null);
  const key = 'https%3A//europarl%2Esharepoint%2Ecom/sites/learn%2EIT-Kiwi/Lists/EuropaTickets/EditForm%2Easpx?ID=1';
  assert.equal(payload.details.references[key].alias, 'Edit ticket 1');
  assert.equal(payload.details.references[key]['@odata.type'], 'microsoft.graph.externalReference');
  assert.throws(() => buildGraphPayloads(desired, 'kiwi-plan', { planId: 'other-plan' }),
    { code: 'PlannerPlanMismatch' });
  assert.throws(() => buildGraphPayloads(desired, 'kiwi-plan', { id: 'unverified-task' }),
    { code: 'PlannerPlanMismatch' });
});

test('a priority-only source change triggers a native task update', () => {
  const oldDesired = buildDesiredTasks(agents, [ticket(1)])[0];
  const plan = planReconciliation({
    agents, tickets: [ticket(1)], stateMappings: [{
      sourceTicketId: 1, plannerTaskId: 'task-1', managedMarker: oldDesired.marker
    }],
    existingTasks: [{ ...oldDesired, id: 'task-1', priority: 9 }]
  });
  assert.equal(plan.upserts[0].operation, 'update');
});

test('deletes only mapped integration tasks that leave the top 20', () => {
  const plan = planReconciliation({
    agents,
    tickets: [ticket(1)],
    stateMappings: [
      { sourceTicketId: 1, plannerTaskId: 'task-1', managedMarker: `${MANAGED_MARKER_PREFIX}1` },
      { sourceTicketId: 2, plannerTaskId: 'task-2', managedMarker: `${MANAGED_MARKER_PREFIX}2` }
    ],
    existingTasks: [
      { id: 'task-1', marker: `${MANAGED_MARKER_PREFIX}1` },
      { id: 'task-2', marker: `${MANAGED_MARKER_PREFIX}2` },
      { id: 'manual-task', marker: undefined }
    ]
  });
  assert.deepEqual(plan.deletes, [{ sourceTicketId: 2, plannerTaskId: 'task-2' }]);
  assert.equal(plan.deletes.some(task => task.plannerTaskId === 'manual-task'), false);
  assert.deepEqual(plan.stateRowsToRemove, []);
});

test('does not delete an orphan marker without its mapping; requests operator repair', () => {
  const plan = planReconciliation({
    agents,
    tickets: [],
    stateMappings: [],
    existingTasks: [{ id: 'orphan', marker: `${MANAGED_MARKER_PREFIX}99` }]
  });
  assert.deepEqual(plan.deletes, []);
  assert.deepEqual(plan.unmappedManagedTasks, [{
    sourceTicketId: 99,
    plannerTaskId: 'orphan'
  }]);
});

test('fails closed on duplicate managed tasks, duplicate mappings and ownership mismatch', () => {
  const marker = `${MANAGED_MARKER_PREFIX}1`;
  assert.throws(
    () => planReconciliation({
      agents,
      tickets: [ticket(1)],
      stateMappings: [],
      existingTasks: [{ id: 'first', marker }, { id: 'second', marker }]
    }),
    error => error.code === 'DuplicateManagedTask'
  );
  assert.throws(
    () => planReconciliation({
      agents,
      tickets: [ticket(1)],
      stateMappings: [
        { sourceTicketId: 1, plannerTaskId: 'first', managedMarker: marker },
        { sourceTicketId: 1, plannerTaskId: 'second', managedMarker: marker }
      ],
      existingTasks: []
    }),
    error => error.code === 'DuplicateSyncMapping'
  );
  assert.throws(
    () => planReconciliation({
      agents,
      tickets: [],
      stateMappings: [{ sourceTicketId: 1, plannerTaskId: 'manual', managedMarker: marker }],
      existingTasks: [{ id: 'manual', marker: undefined }]
    }),
    error => error.code === 'PlannerTaskOwnershipMismatch'
  );
});
