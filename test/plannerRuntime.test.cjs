const test = require('node:test');
const assert = require('node:assert/strict');
const { createPlannerGraphClient, taskSnapshot } = require('../power-automate/kiwi-planner-sync/planner-graph-client.cjs');
const { runPlannerSync } = require('../power-automate/kiwi-planner-sync/planner-sync-runner.cjs');
const { buildDesiredTasks, buildGraphPayloads } = require('../power-automate/kiwi-planner-sync/planner-sync-core.cjs');

const agents = [{ entraObjectId: 'agent', displayName: 'Agent', bucketId: 'bucket' }];
const ticket = {
  id: 1, subject: 'Fixture', description: 'Body', priority: 'High', status: 'New',
  category: 'Software', requester: 'Requester', assigneeEntraObjectId: 'agent',
  assigneeDisplayName: 'Agent', assigneeUpn: 'agent@example.invalid',
  assignedAtUtc: '2026-01-01T00:00:00Z', created: '2026-01-01T00:00:00Z',
  modified: '2026-01-01T00:00:00Z',
  sourceEditUrl: 'https://europarl.sharepoint.com/sites/learn.IT-Kiwi/Lists/EuropaTickets/EditForm.aspx?ID=1'
};
const desired = buildDesiredTasks(agents, [ticket])[0];

function graphFixture() {
  const calls = [];
  let task = {
    id: 'task', planId: 'plan', title: 'Old', bucketId: 'bucket',
    assignments: { agent: {} }, priority: 9, percentComplete: 0, dueDateTime: null,
    '@odata.etag': 'task-etag'
  };
  let details = { description: desired.marker, references: {}, '@odata.etag': 'details-etag' };
  const fetchImpl = async (url, options) => {
    const path = new URL(url).pathname.replace('/v1.0', '');
    calls.push({ path, ...options });
    let value;
    if (path === '/groups/group/planner/plans') value = { value: [{ id: 'plan', owner: 'group', title: 'kiwi tickets' }] };
    else if (path === '/planner/plans/plan/buckets') value = { value: [{ id: 'bucket', planId: 'plan' }] };
    else if (path === '/planner/plans/plan/tasks') value = { value: [task] };
    else if (path === '/planner/tasks' && options.method === 'POST') {
      task = { ...JSON.parse(options.body), id: 'task', '@odata.etag': 'task-etag' };
      details = { description: '', references: {}, '@odata.etag': 'details-etag' };
      return Response.json(task, { status: 201 });
    } else if (path === '/planner/tasks/task/details') {
      if (options.method === 'PATCH') details = { ...details, ...JSON.parse(options.body) };
      value = details;
    } else if (path === '/planner/tasks/task') {
      if (options.method === 'PATCH') task = { ...task, ...JSON.parse(options.body) };
      value = task;
    } else throw new Error(`Unexpected fixture path: ${path}`);
    return options.method === 'PATCH' || options.method === 'DELETE' ?
      new Response(null, { status: 204 }) : Response.json(value);
  };
  return { calls, fetchImpl };
}

test('Graph reads verified plan, buckets and task details before projecting ownership', async () => {
  const fixture = graphFixture();
  const client = createPlannerGraphClient({ getAccessToken: async () => 'fixture', fetchImpl: fixture.fetchImpl });
  const tasks = await client.readPlan('group', 'plan', agents);
  assert.equal(tasks[0].marker, desired.marker);
  assert.equal(tasks[0].taskEtag, 'task-etag');
  assert.equal(tasks[0].detailsEtag, 'details-etag');
  await assert.rejects(client.readPlan('group', 'plan', [{ ...agents[0], bucketId: 'missing' }]),
    { code: 'PlannerBucketMismatch' });
});

test('Graph follows all pages but never sends credentials to an external pagination URL', async () => {
  const calls = [];
  const client = createPlannerGraphClient({
    getAccessToken: async () => 'fixture',
    fetchImpl: async url => {
      calls.push(url);
      return Response.json({ value: [], '@odata.nextLink': 'https://example.invalid/v1.0/stolen' });
    }
  });
  await assert.rejects(client.readPlan('group', 'plan', agents), { code: 'InvalidGraphUrl' });
  assert.equal(calls.length, 1);
  const repeated = createPlannerGraphClient({
    getAccessToken: async () => 'fixture',
    fetchImpl: async () => Response.json({ value: [], '@odata.nextLink': '/groups/group/planner/plans' })
  });
  await assert.rejects(repeated.readPlan('group', 'plan', agents), { code: 'InvalidGraphPagination' });
});

test('Graph includes plans returned on later pages and rejects cross-plan snapshots', async () => {
  const fixture = graphFixture();
  const client = createPlannerGraphClient({
    getAccessToken: async () => 'fixture',
    fetchImpl: async (url, options) => {
      if (url.endsWith('/groups/group/planner/plans')) return Response.json({
        value: [], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/groups/group/planner/plans?$skiptoken=next'
      });
      return fixture.fetchImpl(url, options);
    }
  });
  assert.equal((await client.readPlan('group', 'plan', agents)).length, 1);
  assert.throws(() => taskSnapshot({
    id: 'task', planId: 'different-plan', '@odata.etag': 'task-etag'
  }, { '@odata.etag': 'details-etag' }, 'plan'), { code: 'InvalidPlannerSnapshot' });
});

test('native update and details update carry separate ETags and are read back', async () => {
  const fixture = graphFixture();
  const client = createPlannerGraphClient({ getAccessToken: async () => 'fixture', fetchImpl: fixture.fetchImpl });
  assert.equal(await client.writeTask(desired, 'plan', 'task'), 'task');
  const patches = fixture.calls.filter(call => call.method === 'PATCH');
  assert.equal(patches[0].headers['If-Match'], 'task-etag');
  assert.equal(patches[1].headers['If-Match'], 'details-etag');
  assert.equal(JSON.parse(patches[0].body).priority, 3);
  assert.equal(JSON.parse(patches[1].body).description, desired.description);
  assert.equal(fixture.calls.at(-1).path, '/planner/tasks/task/details');
});

test('create writes and verifies the ownership marker without retrying POST', async () => {
  const fixture = graphFixture();
  const client = createPlannerGraphClient({ getAccessToken: async () => 'fixture', fetchImpl: fixture.fetchImpl });
  assert.equal(await client.writeTask(desired, 'plan'), 'task');
  assert.equal(fixture.calls.filter(call => call.method === 'POST').length, 1);
  const failing = createPlannerGraphClient({
    getAccessToken: async () => 'fixture', fetchImpl: async () => { throw new Error('sensitive transport content'); }
  });
  await assert.rejects(failing.writeTask(desired, 'plan'), {
    code: 'UncertainPlannerCreate',
    message: 'POST failed without a confirmed response; stop and reconcile before retrying.'
  });
});

test('conflicts and throttling stop visibly without leaking response contents', async () => {
  for (const status of [412, 429, 503]) {
    const client = createPlannerGraphClient({
      getAccessToken: async () => 'fixture',
      fetchImpl: async () => new Response('sensitive ticket/token text', {
        status, headers: { 'Retry-After': '30' }
      })
    });
    await assert.rejects(client.readPlan('group', 'plan', agents), error => {
      assert.equal(error.status, status);
      assert.equal(error.retryAfter, '30');
      assert.equal(error.code, status === 412 ? 'PlannerConcurrencyConflict' : 'GraphRequestFailed');
      assert.doesNotMatch(error.message, /sensitive/);
      return true;
    });
  }
});

test('manual tasks cannot be updated or deleted and legacy marked JSON upgrades safely', async () => {
  const task = { id: 'task', planId: 'plan', '@odata.etag': 'task-etag' };
  const legacy = taskSnapshot(task, {
    '@odata.etag': 'details-etag', description: JSON.stringify({
      managedMarker: desired.marker, sourceTicketId: 1
    })
  }, 'plan');
  assert.equal(legacy.marker, desired.marker);
  assert.throws(() => taskSnapshot(task, {
    '@odata.etag': 'details-etag', description: `${desired.marker}\n${desired.marker}`
  }, 'plan'), { code: 'AmbiguousManagedMarker' });
  const client = createPlannerGraphClient({
    getAccessToken: async () => 'fixture',
    fetchImpl: async url => Response.json(url.endsWith('/details') ?
      { description: 'Manual card', '@odata.etag': 'details-etag' } : task)
  });
  await assert.rejects(client.writeTask(desired, 'plan', 'task'), { code: 'PlannerTaskOwnershipMismatch' });
  await assert.rejects(client.deleteTask('task', 'plan', desired.marker), { code: 'PlannerTaskOwnershipMismatch' });
});

function runnerFixture() {
  const events = [];
  const saved = { mappings: [], pendingCreates: [] };
  const state = {
    withExclusiveLock: async fn => { events.push('lock'); return fn({ assertHeld: async () => {} }); },
    read: async () => saved,
    beginCreate: async intent => { events.push('intent'); saved.pendingCreates.push(intent); },
    commitMapping: async row => { events.push('mapping'); saved.mappings.push(row); saved.pendingCreates = []; },
    removeMapping: async () => events.push('remove')
  };
  const planner = {
    readPlan: async () => [],
    writeTask: async () => { events.push('write'); return 'task'; },
    deleteTask: async () => events.push('delete')
  };
  const source = { readCompleteSnapshot: async () => ({ complete: true, agents, tickets: [ticket] }) };
  return { events, saved, config: { state, planner, source, teamId: 'group', planId: 'plan' } };
}

test('runner defaults to content-free dry-run and takes the exclusive lock', async () => {
  const { events, config } = runnerFixture();
  const summary = await runPlannerSync(config);
  assert.deepEqual(events, ['lock']);
  assert.equal(summary.dryRun, true);
  assert.equal(summary.upserts[0].operation, 'create');
  assert.doesNotMatch(JSON.stringify(summary), /Body|Requester|Authorization/);
});

test('runner persists intent before create and commits mappings only after verified writes', async () => {
  const { events, saved, config } = runnerFixture();
  await runPlannerSync({ ...config, dryRun: false });
  assert.deepEqual(events, ['lock', 'intent', 'write', 'mapping']);
  assert.equal(saved.mappings[0].plannerTaskId, 'task');
  assert.equal(saved.pendingCreates.length, 0);
});

test('failed creates retain durable intent and block duplicate creation on the next run', async () => {
  const { events, saved, config } = runnerFixture();
  config.planner.writeTask = async () => { events.push('write'); throw new Error('fixture failure'); };
  await assert.rejects(runPlannerSync({ ...config, dryRun: false }), /fixture failure/);
  assert.deepEqual(events, ['lock', 'intent', 'write']);
  assert.equal(saved.pendingCreates.length, 1);
  await assert.rejects(runPlannerSync({ ...config, dryRun: false }), { code: 'PendingPlannerCreate' });
});

test('runner rejects incomplete sources and orphan markers before any writes', async () => {
  const { events, config } = runnerFixture();
  config.source.readCompleteSnapshot = async () => ({ complete: false, agents, tickets: [ticket] });
  await assert.rejects(runPlannerSync({ ...config, dryRun: false }), { code: 'IncompleteSourceSnapshot' });
  assert.deepEqual(events, ['lock']);
  config.source.readCompleteSnapshot = async () => ({ complete: true, agents, tickets: [] });
  config.planner.readPlan = async () => [{ id: 'orphan', marker: desired.marker }];
  await assert.rejects(runPlannerSync({ ...config, dryRun: false }), { code: 'UnmappedManagedTasks' });
  assert.deepEqual(events, ['lock', 'lock']);
});

test('runner does not rewrite matching native task and reference snapshots', async () => {
  const { events, saved, config } = runnerFixture();
  saved.mappings.push({ sourceTicketId: 1, plannerTaskId: 'task', managedMarker: desired.marker });
  config.planner.readPlan = async () => [{
    ...desired, id: 'task', rawReferences: buildGraphPayloads(desired, 'plan').details.references
  }];
  const summary = await runPlannerSync({ ...config, dryRun: false });
  assert.equal(summary.upserts[0].operation, 'unchanged');
  assert.deepEqual(events, ['lock']);
});

test('runner deletes only mapped out-of-window tasks and removes state after confirmation', async () => {
  const { events, saved, config } = runnerFixture();
  saved.mappings.push({ sourceTicketId: 1, plannerTaskId: 'task', managedMarker: desired.marker });
  config.source.readCompleteSnapshot = async () => ({ complete: true, agents, tickets: [] });
  config.planner.readPlan = async () => [{ id: 'task', marker: desired.marker }, { id: 'manual' }];
  config.planner.deleteTask = async (id, planId, marker) => {
    assert.equal(id, 'task');
    assert.equal(planId, 'plan');
    assert.equal(marker, desired.marker);
    events.push('delete');
  };
  await runPlannerSync({ ...config, dryRun: false });
  assert.deepEqual(events, ['lock', 'delete', 'remove']);
  events.length = 0;
  config.planner.deleteTask = async () => { throw new Error('delete failure'); };
  await assert.rejects(runPlannerSync({ ...config, dryRun: false }), /delete failure/);
  assert.deepEqual(events, ['lock']);
});

test('reference limit is checked before any task writes without silently dropping links', () => {
  const withAttachments = count => ({
    ...ticket, attachments: Array.from({ length: count }, (_, id) => ({
      name: `${id}.txt`,
      url: `https://europarl.sharepoint.com/sites/learn.IT-Kiwi/Attachments/${id}.txt`
    }))
  });

  assert.equal(buildDesiredTasks(agents, [withAttachments(14)])[0].references.length, 15);
  assert.throws(() => buildDesiredTasks(agents, [withAttachments(15)]),
    { code: 'PlannerReferencesTooMany' });
});

test('runner stops writing when the durable lease is lost after intent persistence', async () => {
  const { events, saved, config } = runnerFixture();
  let held = true;
  config.state.withExclusiveLock = async fn => fn({
    assertHeld: async () => { if (!held) throw new Error('lease lost'); }
  });
  config.state.beginCreate = async intent => { saved.pendingCreates.push(intent); held = false; };
  await assert.rejects(runPlannerSync({ ...config, dryRun: false }), /lease lost/);
  assert.equal(saved.pendingCreates.length, 1);
  assert.deepEqual(events, []);
});
