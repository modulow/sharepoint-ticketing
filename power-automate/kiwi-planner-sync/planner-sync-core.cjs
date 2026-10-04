'use strict';

const MANAGED_MARKER_PREFIX = 'KiwiPlannerSync:v1:';
const MAX_DESCRIPTION_LENGTH = 4000;
const TOP_TICKETS_PER_AGENT = 20;
const SHAREPOINT_HOST = 'europarl.sharepoint.com';

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = canonicalize(value[key]);
      return result;
    }, Object.create(null));
  }
  return value;
}

function validateUrl(url, label) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    fail('InvalidSourceUrl', `${label} must be an absolute HTTPS URL.`);
  }
  if (parsed.protocol !== 'https:' || parsed.hostname.toLocaleLowerCase() !== SHAREPOINT_HOST) {
    fail('InvalidSourceUrl', `${label} must use HTTPS on ${SHAREPOINT_HOST}.`);
  }
  return parsed.href;
}

function makeTicketDescription(ticket) {
  if (typeof ticket.subject !== 'string' || !ticket.subject.trim()) {
    fail('MissingTicketSubject', `Ticket ${ticket.id} has no subject.`);
  }
  const attachments = (ticket.attachments || []).map(attachment => {
    if (typeof attachment.name !== 'string' || !attachment.name.trim()) {
      fail('InvalidAttachment', `Ticket ${ticket.id} has an attachment without a file name.`);
    }
    return { name: attachment.name, url: attachment.url };
  }).sort((left, right) =>
    String(left.name).localeCompare(String(right.name)) || String(left.url).localeCompare(String(right.url))
  );
  const exchanges = (ticket.exchanges || []).map(exchange => {
    if (!exchange.id || typeof exchange.message !== 'string' ||
      typeof exchange.author !== 'string' || !Number.isFinite(Date.parse(exchange.date || ''))) {
      fail('InvalidExchange', `Ticket ${ticket.id} has an exchange without its ID, message, author, or date.`);
    }
    return {
      id: exchange.id,
      message: exchange.message,
      author: exchange.author,
      source: exchange.source,
      visibility: exchange.visibility,
      date: exchange.date,
      editUrl: exchange.editUrl
    };
  }).sort((left, right) =>
    Date.parse(left.date || '') - Date.parse(right.date || '') ||
    String(left.id).localeCompare(String(right.id))
  );
  const description = JSON.stringify(canonicalize({
    managedMarker: `${MANAGED_MARKER_PREFIX}${ticket.id}`,
    sourceTicketId: ticket.id,
    subject: ticket.subject,
    description: ticket.description,
    requester: ticket.requester,
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
    assignee: {
      entraObjectId: ticket.assigneeEntraObjectId,
      displayName: ticket.assigneeDisplayName,
      upn: ticket.assigneeUpn
    },
    assignedAtUtc: ticket.assignedAtUtc,
    dueDate: ticket.dueDate || null,
    resolution: ticket.resolution || null,
    created: ticket.created,
    modified: ticket.modified,
    fields: ticket.fields || {},
    sourceEditUrl: ticket.sourceEditUrl,
    attachments,
    exchanges
  }), null, 2);
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    fail(
      'PlannerDescriptionTooLong',
      `Ticket ${ticket.id} needs ${description.length} Planner description characters; the limit is ${MAX_DESCRIPTION_LENGTH}.`
    );
  }
  return description;
}

function buildReferences(ticket) {
  const references = [{
    kind: 'ticket',
    name: `Edit ticket ${ticket.id}`,
    url: validateUrl(ticket.sourceEditUrl, `Ticket ${ticket.id} edit URL`)
  }];
  for (const attachment of ticket.attachments || []) {
    references.push({
      kind: 'attachment',
      name: attachment.name,
      url: validateUrl(attachment.url, `Ticket ${ticket.id} attachment URL`)
    });
  }
  for (const exchange of ticket.exchanges || []) {
    references.push({
      kind: 'exchange',
      name: `Edit exchange ${exchange.id}`,
      url: validateUrl(exchange.editUrl, `Exchange ${exchange.id} edit URL`)
    });
  }
  const seen = new Set();
  return references.filter(reference => {
    if (seen.has(reference.url)) return false;
    seen.add(reference.url);
    return true;
  });
}

function buildDesiredTasks(agents, tickets, limit = TOP_TICKETS_PER_AGENT) {
  if (!Array.isArray(agents) || agents.length === 0) {
    fail('MissingAgentRoster', 'The authorized agent roster must not be empty.');
  }
  if (!Array.isArray(tickets)) {
    fail('InvalidTicketData', 'The SharePoint ticket response must be an array.');
  }
  if (!Number.isInteger(limit) || limit < 1) {
    fail('InvalidTicketLimit', 'The per-agent ticket limit must be a positive integer.');
  }

  const agentById = new Map();
  const bucketIds = new Set();
  for (const agent of agents) {
    if (!agent.entraObjectId || !agent.bucketId || !agent.displayName) {
      fail('InvalidAgent', 'Every active agent needs an Entra object ID, display name, and bucket ID.');
    }
    if (agentById.has(agent.entraObjectId) || bucketIds.has(agent.bucketId)) {
      fail('DuplicateAgentMapping', 'Agent Entra IDs and Planner bucket IDs must each be unique.');
    }
    agentById.set(agent.entraObjectId, agent);
    bucketIds.add(agent.bucketId);
  }

  const ticketIds = new Set();
  const assignedByAgent = new Map(agents.map(agent => [agent.entraObjectId, []]));
  for (const ticket of tickets) {
    if (!Number.isSafeInteger(ticket.id) || ticket.id < 1 || ticketIds.has(ticket.id)) {
      fail('InvalidTicketId', 'Every source ticket must have a unique positive integer ID.');
    }
    ticketIds.add(ticket.id);
    if (!ticket.assigneeEntraObjectId) continue;
    if (!agentById.has(ticket.assigneeEntraObjectId)) {
      fail('UnapprovedAssignee', `Ticket ${ticket.id} is assigned to an agent outside the approved roster.`);
    }
    const assignedAt = Date.parse(ticket.assignedAtUtc || '');
    if (!Number.isFinite(assignedAt)) {
      fail('MissingAssignmentTimestamp', `Ticket ${ticket.id} has no proven assignment timestamp.`);
    }
    validateUrl(ticket.sourceEditUrl, `Ticket ${ticket.id} edit URL`);
    for (const attachment of ticket.attachments || []) {
      validateUrl(attachment.url, `Ticket ${ticket.id} attachment URL`);
    }
    const agent = agentById.get(ticket.assigneeEntraObjectId);
    assignedByAgent.get(agent.entraObjectId).push({ ticket, assignedAt, agent });
  }

  const desired = [];
  for (const agent of agents) {
    const ranked = assignedByAgent.get(agent.entraObjectId).sort((left, right) =>
      right.assignedAt - left.assignedAt || right.ticket.id - left.ticket.id
    );
    for (const { ticket } of ranked.slice(0, limit)) {
      const completed = ['Resolved', 'Closed'].includes(ticket.status);
      desired.push({
        sourceTicketId: ticket.id,
        marker: `${MANAGED_MARKER_PREFIX}${ticket.id}`,
        title: ticket.subject,
        description: makeTicketDescription(ticket),
        bucketId: agent.bucketId,
        assigneeEntraObjectId: agent.entraObjectId,
        percentComplete: completed ? 100 : ticket.status === 'In progress' ? 50 : 0,
        dueDate: ticket.dueDate || null,
        references: buildReferences(ticket)
      });
    }
  }
  return desired;
}

function planReconciliation({ agents, tickets, stateMappings, existingTasks, limit }) {
  if (!Array.isArray(stateMappings) || !Array.isArray(existingTasks)) {
    fail('InvalidSyncState', 'Planner sync mappings and the current plan task snapshot must be arrays.');
  }
  const desired = buildDesiredTasks(agents, tickets, limit);
  const desiredById = new Map(desired.map(task => [task.sourceTicketId, task]));
  const mappingById = new Map();
  for (const mapping of stateMappings) {
    if (!Number.isSafeInteger(mapping.sourceTicketId) || mapping.sourceTicketId < 1 ||
      mappingById.has(mapping.sourceTicketId)) {
      fail('DuplicateSyncMapping', 'Sync state must contain at most one mapping per source ticket.');
    }
    mappingById.set(mapping.sourceTicketId, mapping);
  }

  const tasksByMarker = new Map();
  const tasksById = new Map();
  for (const task of existingTasks) {
    if (!task.id || tasksById.has(task.id)) {
      fail('InvalidPlannerTask', 'Planner task IDs must be present and unique.');
    }
    tasksById.set(task.id, task);
    if (!task.marker) continue;
    if (!task.marker.startsWith(MANAGED_MARKER_PREFIX)) continue;
    if (tasksByMarker.has(task.marker)) {
      fail('DuplicateManagedTask', `More than one integration-owned Planner task has marker ${task.marker}.`);
    }
    tasksByMarker.set(task.marker, task);
  }

  const upserts = [];
  for (const desiredTask of desired) {
    const mapping = mappingById.get(desiredTask.sourceTicketId);
    if (mapping && mapping.managedMarker !== desiredTask.marker) {
      fail('UnownedSyncMapping', `Ticket ${desiredTask.sourceTicketId} has a mapping without the expected ownership marker.`);
    }
    const markedTask = tasksByMarker.get(desiredTask.marker);
    const mappedTask = mapping ? tasksById.get(mapping.plannerTaskId) : undefined;
    if (mappedTask && mappedTask.marker !== desiredTask.marker) {
      fail('PlannerTaskOwnershipMismatch', `Mapped Planner task for ticket ${desiredTask.sourceTicketId} is not integration-owned.`);
    }
    if (mappedTask && markedTask && mappedTask.id !== markedTask.id) {
      fail('PlannerTaskMappingMismatch', `Ticket ${desiredTask.sourceTicketId} maps to a different task than its ownership marker.`);
    }
    const existing = mappedTask || markedTask;
    const matches = existing &&
      existing.title === desiredTask.title &&
      existing.description === desiredTask.description &&
      existing.bucketId === desiredTask.bucketId &&
      existing.assigneeEntraObjectId === desiredTask.assigneeEntraObjectId &&
      existing.percentComplete === desiredTask.percentComplete &&
      (existing.dueDate || null) === desiredTask.dueDate &&
      JSON.stringify(canonicalize(existing.references || [])) === JSON.stringify(canonicalize(desiredTask.references));
    const needsRecovery = existing && (!mapping || mapping.plannerTaskId !== existing.id);
    upserts.push({
      operation: !existing ? 'create' : needsRecovery ? 'recover' : matches ? 'unchanged' : 'update',
      desired: desiredTask,
      existingTaskId: existing?.id
    });
  }

  const deletes = [];
  const stateRowsToRemove = [];
  const unmappedManagedTasks = [];
  for (const mapping of stateMappings) {
    if (desiredById.has(mapping.sourceTicketId)) continue;
    const expectedMarker = `${MANAGED_MARKER_PREFIX}${mapping.sourceTicketId}`;
    if (mapping.managedMarker !== expectedMarker) {
      fail('UnownedSyncMapping', `Ticket ${mapping.sourceTicketId} has a mapping without the expected ownership marker.`);
    }
    const mappedTask = tasksById.get(mapping.plannerTaskId);
    const markedTask = tasksByMarker.get(expectedMarker);
    if (mappedTask && markedTask && mappedTask.id !== markedTask.id) {
      fail('PlannerTaskMappingMismatch', `Ticket ${mapping.sourceTicketId} maps to a different task than its ownership marker.`);
    }
    if (mappedTask && mappedTask.marker !== expectedMarker) {
      fail('PlannerTaskOwnershipMismatch', `Mapped Planner task for ticket ${mapping.sourceTicketId} is not integration-owned.`);
    }
    const existing = mappedTask || markedTask;
    if (existing) {
      deletes.push({ sourceTicketId: mapping.sourceTicketId, plannerTaskId: existing.id });
    } else {
      stateRowsToRemove.push(mapping.sourceTicketId);
    }
  }

  for (const task of existingTasks) {
    if (!task.marker?.startsWith(MANAGED_MARKER_PREFIX)) continue;
    const sourceTicketId = Number(task.marker.slice(MANAGED_MARKER_PREFIX.length));
    if (!Number.isSafeInteger(sourceTicketId) || sourceTicketId < 1) {
      fail('InvalidManagedMarker', `Planner task ${task.id} has a malformed integration marker.`);
    }
    if (desiredById.has(sourceTicketId) || mappingById.has(sourceTicketId)) continue;
    unmappedManagedTasks.push({ sourceTicketId, plannerTaskId: task.id });
  }

  return { desired, upserts, deletes, stateRowsToRemove, unmappedManagedTasks };
}

module.exports = {
  MANAGED_MARKER_PREFIX,
  MAX_DESCRIPTION_LENGTH,
  TOP_TICKETS_PER_AGENT,
  buildDesiredTasks,
  makeTicketDescription,
  planReconciliation
};
