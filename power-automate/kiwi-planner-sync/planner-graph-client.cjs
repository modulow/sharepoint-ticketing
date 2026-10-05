'use strict';

const {
  MANAGED_MARKER_PREFIX, MAX_REFERENCES, resolveExistingPlan, buildGraphPayloads
} = require('./planner-sync-core.cjs');

const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function taskSnapshot(task, details, planId) {
  if (!task.id || task.planId !== planId || !task['@odata.etag'] || !details['@odata.etag']) {
    fail('InvalidPlannerSnapshot', 'The task plan and both task/details ETags must be verified.');
  }
  const description = details.description || '';
  const markers = description.split(/\r?\n/).filter(line =>
    /^KiwiPlannerSync:v1:[1-9]\d*$/.test(line)
  );
  // The original blueprint used a JSON description. Preserve ownership during upgrade.
  if (!markers.length && description.trim().startsWith('{')) {
    let legacy;
    try {
      legacy = JSON.parse(description);
    } catch {
      fail('InvalidPlannerSnapshot', `Task ${task.id} has malformed legacy details.`);
    }
    if (typeof legacy.managedMarker === 'string' &&
      /^KiwiPlannerSync:v1:[1-9]\d*$/.test(legacy.managedMarker) &&
      legacy.managedMarker === `${MANAGED_MARKER_PREFIX}${legacy.sourceTicketId}`) {
      markers.push(legacy.managedMarker);
    }
  }
  if (markers.length > 1) {
    fail('AmbiguousManagedMarker', `Task ${task.id} has ambiguous ownership markers.`);
  }
  const assignees = Object.keys(task.assignments || {});
  return {
    id: task.id,
    planId,
    marker: markers[0],
    title: task.title,
    description,
    bucketId: task.bucketId,
    assigneeEntraObjectId: assignees.length === 1 ? assignees[0] : undefined,
    assignments: task.assignments || {},
    percentComplete: task.percentComplete,
    priority: task.priority,
    dueDate: task.dueDateTime || null,
    previewType: details.previewType,
    taskEtag: task['@odata.etag'],
    detailsEtag: details['@odata.etag'],
    rawReferences: details.references || {}
  };
}

function createPlannerGraphClient({ getAccessToken, fetchImpl = fetch, timeoutMs = 30000 }) {
  if (typeof getAccessToken !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 1) {
    fail('MissingGraphAuthentication', 'Supply an approved Graph token provider and positive request timeout.');
  }

  async function request(path, method = 'GET', body, etag) {
    const url = path.startsWith('/') ? `${GRAPH_ROOT}${path}` : path;
    const parsed = new URL(url);
    if (parsed.origin !== 'https://graph.microsoft.com' || !parsed.pathname.startsWith('/v1.0/') ||
      parsed.username || parsed.password || parsed.hash) {
      fail('InvalidGraphUrl', 'Graph requests and pagination must remain on the v1.0 Graph endpoint.');
    }
    const token = await getAccessToken();
    if (typeof token !== 'string' || !token || /[\r\n]/.test(token)) {
      fail('MissingGraphAuthentication', 'The approved token provider returned no valid access token.');
    }
    let response;
    try {
      response = await fetchImpl(url, {
        method, redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(etag ? { 'If-Match': etag } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
    } catch {
      fail(method === 'POST' ? 'UncertainPlannerCreate' : 'GraphTransportFailure',
        `${method} failed without a confirmed response; stop and reconcile before retrying.`);
    }
    if (!response.ok) {
      const error = new Error(`Graph ${method} failed with HTTP ${response.status}; no success was recorded.`);
      error.code = response.status === 412 ? 'PlannerConcurrencyConflict' : 'GraphRequestFailed';
      error.status = response.status;
      error.retryAfter = response.headers.get('Retry-After');
      throw error;
    }
    if (response.status === 204) return undefined;
    try {
      return await response.json();
    } catch {
      fail(method === 'POST' ? 'UncertainPlannerCreate' : 'InvalidGraphResponse',
        `Graph ${method} returned an invalid JSON response; stop and reconcile.`);
    }
  }

  async function collection(path) {
    const values = [];
    const seen = new Set();
    while (path) {
      if (seen.has(path)) fail('InvalidGraphPagination', 'Graph returned a repeated pagination link.');
      seen.add(path);
      const page = await request(path);
      if (!Array.isArray(page?.value)) fail('InvalidGraphPagination', 'Graph returned an incomplete collection.');
      values.push(...page.value);
      path = page['@odata.nextLink'];
      if (path !== undefined && (typeof path !== 'string' || !path)) {
        fail('InvalidGraphPagination', 'Graph returned an invalid pagination link.');
      }
    }
    return values;
  }

  const idPath = id => {
    if (typeof id !== 'string' || !id.trim()) fail('InvalidPlannerId', 'A Planner resource ID is required.');
    return encodeURIComponent(id);
  };

  async function readTask(id, planId) {
    const task = await request(`/planner/tasks/${idPath(id)}`);
    if (task.planId !== planId) fail('PlannerPlanMismatch', 'The task does not belong to the configured plan.');
    const details = await request(`/planner/tasks/${idPath(id)}/details`);
    return taskSnapshot(task, details, planId);
  }

  return {
    async readPlan(teamId, planId, agents) {
      const plans = await collection(`/groups/${idPath(teamId)}/planner/plans`);
      resolveExistingPlan(plans, teamId, planId);
      const buckets = await collection(`/planner/plans/${idPath(planId)}/buckets`);
      for (const agent of agents) {
        if (!buckets.some(bucket => bucket.id === agent.bucketId && bucket.planId === planId)) {
          fail('PlannerBucketMismatch', 'An approved agent bucket is missing from the configured plan.');
        }
      }
      const tasks = await collection(`/planner/plans/${idPath(planId)}/tasks`);
      const snapshots = [];
      for (const task of tasks) {
        const details = await request(`/planner/tasks/${idPath(task.id)}/details`);
        snapshots.push(taskSnapshot(task, details, planId));
      }
      return snapshots;
    },
    async writeTask(desired, planId, existingId) {
      if (!Array.isArray(desired.references) || desired.references.length > MAX_REFERENCES) {
        fail('PlannerReferencesTooMany', 'A task must not exceed the Planner reference limit.');
      }
      let current;
      if (existingId) {
        current = await readTask(existingId, planId);
        if (current.marker !== desired.marker) {
          fail('PlannerTaskOwnershipMismatch', 'Task ownership changed before the update.');
        }
      }
      const payload = buildGraphPayloads(desired, planId, current ? {
        ...current, references: current.rawReferences
      } : {});
      let id = existingId;
      if (!id) {
        const created = await request('/planner/tasks', 'POST', payload.task);
        if (!created?.id || created.planId !== planId) {
          fail('UncertainPlannerCreate', 'Created task identity could not be confirmed; do not create again automatically.');
        }
        id = created.id;
        // A new task has no details marker yet. Any subsequent failure requires repair.
        const details = await request(`/planner/tasks/${idPath(id)}/details`);
        if (!details?.['@odata.etag']) fail('InvalidPlannerSnapshot', `Created task ${id} has no details ETag.`);
        await request(`/planner/tasks/${idPath(id)}/details`, 'PATCH', payload.details, details['@odata.etag']);
      } else {
        await request(`/planner/tasks/${idPath(id)}`, 'PATCH', payload.task, current.taskEtag);
        await request(`/planner/tasks/${idPath(id)}/details`, 'PATCH', payload.details, current.detailsEtag);
      }
      const verified = await readTask(id, planId);
      if (verified.marker !== desired.marker || verified.title !== desired.title ||
        verified.description !== desired.description || verified.bucketId !== desired.bucketId ||
        verified.assigneeEntraObjectId !== desired.assigneeEntraObjectId ||
        verified.priority !== desired.priority || verified.percentComplete !== desired.percentComplete ||
        verified.previewType !== desired.previewType ||
        (verified.dueDate ? Date.parse(verified.dueDate) : null) !==
          (desired.dueDate ? Date.parse(desired.dueDate) : null)) {
        fail('PlannerWriteNotVerified', `Task ${id} did not match the desired projection after writing.`);
      }
      const expectedReferences = buildGraphPayloads(desired, planId).details.references;
      const referenceKeys = Object.keys(verified.rawReferences);
      if (referenceKeys.length !== Object.keys(expectedReferences).length ||
        referenceKeys.some(key => verified.rawReferences[key].alias !== expectedReferences[key]?.alias)) {
        fail('PlannerWriteNotVerified', `Task ${id} references did not match after writing.`);
      }
      return id;
    },
    async deleteTask(id, planId, marker) {
      const current = await readTask(id, planId);
      if (current.marker !== marker) fail('PlannerTaskOwnershipMismatch', 'Task ownership changed before deletion.');
      await request(`/planner/tasks/${idPath(id)}`, 'DELETE', undefined, current.taskEtag);
    }
  };
}

module.exports = { createPlannerGraphClient, taskSnapshot };
