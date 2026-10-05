'use strict';

const {
  buildDesiredTasks, planReconciliation, MANAGED_MARKER_PREFIX
} = require('./planner-sync-core.cjs');

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

async function runPlannerSync({ source, state, planner, teamId, planId, dryRun = true }) {
  if (!teamId || !planId || typeof dryRun !== 'boolean' ||
    typeof source?.readCompleteSnapshot !== 'function' ||
    ['withExclusiveLock', 'read', 'beginCreate', 'commitMapping', 'removeMapping'].some(method =>
      typeof state?.[method] !== 'function'
    ) || ['readPlan', 'writeTask', 'deleteTask'].some(method => typeof planner?.[method] !== 'function')) {
    fail('InvalidSyncConfiguration', 'Verified plan/group IDs and complete source, durable state and Planner adapters are required.');
  }
  return state.withExclusiveLock(async lease => {
    if (typeof lease?.assertHeld !== 'function') {
      fail('MissingSyncLease', 'The durable state adapter must supply an active lease guard.');
    }
    await lease.assertHeld();
    const snapshot = await source.readCompleteSnapshot();
    if (snapshot?.complete !== true || !Array.isArray(snapshot.agents) || !Array.isArray(snapshot.tickets)) {
      fail('IncompleteSourceSnapshot', 'The source adapter must confirm complete tickets, agents, attachments and exchanges.');
    }
    const saved = await state.read();
    if (!Array.isArray(saved?.mappings) || !Array.isArray(saved?.pendingCreates)) {
      fail('InvalidSyncState', 'State must contain complete mappings and durable pending-create intents.');
    }
    if (saved.pendingCreates.length) {
      fail('PendingPlannerCreate', 'A previous create is uncertain. Repair its intent/task mapping before any further writes.');
    }
    const desired = buildDesiredTasks(snapshot.agents, snapshot.tickets);
    const tasks = await planner.readPlan(teamId, planId, snapshot.agents);
    const desiredByMarker = new Map(desired.map(task => [task.marker, task]));
    const normalizedTasks = tasks.map(task => {
      const target = desiredByMarker.get(task.marker);
      return {
        ...task,
        references: Object.entries(task.rawReferences || {}).map(([key, value]) => {
          let url;
          try {
            url = decodeURIComponent(key);
          } catch {
            fail('InvalidPlannerReference', `Task ${task.id} has an invalid encoded reference key.`);
          }
          const expected = target?.references.find(reference => reference.url === url);
          return { kind: expected?.kind || 'unmanaged', name: value.alias, url };
        }).sort((left, right) => {
          const order = reference => target?.references.findIndex(expected => expected.url === reference.url) ?? -1;
          return order(left) - order(right);
        })
      };
    });
    const plan = planReconciliation({
      agents: snapshot.agents, tickets: snapshot.tickets,
      stateMappings: saved.mappings, existingTasks: normalizedTasks
    });
    if (plan.unmappedManagedTasks.length) {
      fail('UnmappedManagedTasks', 'Out-of-window marked tasks have no state mapping; repair ownership before writes.');
    }
    // Do not return descriptions/history in dry-run output or operational logs.
    const summary = {
      dryRun,
      upserts: plan.upserts.map(item => ({
        operation: item.operation,
        sourceTicketId: item.desired.sourceTicketId,
        plannerTaskId: item.existingTaskId
      })),
      deletes: plan.deletes,
      stateRowsToRemove: plan.stateRowsToRemove
    };
    if (dryRun) return summary;
    for (const item of plan.upserts) {
      if (item.operation === 'unchanged') continue;
      await lease.assertHeld();
      if (item.operation === 'create') {
        // Persist before POST: a timeout or failed details write must never cause another blind create.
        await state.beginCreate({
          sourceTicketId: item.desired.sourceTicketId,
          managedMarker: item.desired.marker,
          planId
        });
      }
      await lease.assertHeld();
      const id = await planner.writeTask(item.desired, planId, item.existingTaskId);
      await lease.assertHeld();
      await state.commitMapping({
        sourceTicketId: item.desired.sourceTicketId,
        plannerTaskId: id,
        managedMarker: item.desired.marker,
        agentEntraObjectId: item.desired.assigneeEntraObjectId,
        bucketId: item.desired.bucketId,
        lastSuccessfulSyncUtc: new Date().toISOString()
      });
    }
    for (const item of plan.deletes) {
      await lease.assertHeld();
      await planner.deleteTask(item.plannerTaskId, planId, `${MANAGED_MARKER_PREFIX}${item.sourceTicketId}`);
      await lease.assertHeld();
      await state.removeMapping(item.sourceTicketId);
    }
    for (const id of plan.stateRowsToRemove) {
      await lease.assertHeld();
      await state.removeMapping(id);
    }
    await lease.assertHeld();
    return summary;
  });
}

module.exports = { runPlannerSync };
