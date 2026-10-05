'use strict';

function fail(code, ticketId) {
  const error = new Error(`Cannot prove assignment history for ticket ${ticketId}.`);
  error.code = code;
  throw error;
}

function identity(value, ticketId) {
  if (value === null) return null;
  if (typeof value !== 'string' || !value.trim()) fail('InvalidHistoryIdentity', ticketId);
  return value.trim().toLowerCase();
}

function recoverAssignmentTime(ticket, history) {
  const id = ticket?.id;
  if (!Number.isSafeInteger(id) || id < 1) fail('InvalidHistoryTicket', id);
  if (!Object.hasOwn(ticket, 'assigneeEntraObjectId')) fail('InvalidHistoryIdentity', id);
  const current = identity(ticket.assigneeEntraObjectId, id);
  if (current === null) return null;
  if (history?.complete !== true || typeof history.startsAtCreation !== 'boolean' ||
    !Array.isArray(history.versions) || history.versions.length === 0 ||
    typeof ticket.sourceVersion !== 'string' || !ticket.sourceVersion) {
    fail('IncompleteAssignmentHistory', id);
  }
  const seen = new Set();
  const versions = history.versions.map(version => {
    if (typeof version?.version !== 'string' || !version.version ||
      seen.has(version.version) || !Object.hasOwn(version, 'assigneeEntraObjectId')) {
      fail('InvalidAssignmentVersion', id);
    }
    seen.add(version.version);
    const time = typeof version.createdUtc === 'string' ? Date.parse(version.createdUtc) : NaN;
    if (!Number.isFinite(time) || !/(Z|[+-]\d{2}:\d{2})$/.test(version.createdUtc)) {
      fail('InvalidAssignmentTimestamp', id);
    }
    return { version: version.version, time, agent: identity(version.assigneeEntraObjectId, id) };
  });
  // The adapter supplies complete chronological versions, not SharePoint VersionId arithmetic.
  for (let i = 1; i < versions.length; i++) {
    if (versions[i].time < versions[i - 1].time) fail('UnorderedAssignmentHistory', id);
  }
  const latest = versions[versions.length - 1];
  if (latest.version !== ticket.sourceVersion || latest.agent !== current) {
    fail('AssignmentSnapshotChanged', id);
  }
  let firstCurrent = versions.length - 1;
  while (firstCurrent > 0 && versions[firstCurrent - 1].agent === current) firstCurrent--;
  if (firstCurrent === 0 && !history.startsAtCreation) fail('MissingAssignmentBoundary', id);
  return new Date(versions[firstCurrent].time).toISOString();
}

function withAssignmentHistory(source, readHistory) {
  if (typeof source?.readCompleteSnapshot !== 'function' || typeof readHistory !== 'function') {
    fail('InvalidAssignmentHistoryAdapter', 'configuration');
  }
  return {
    async readCompleteSnapshot() {
      const snapshot = await source.readCompleteSnapshot();
      if (snapshot?.complete !== true || !Array.isArray(snapshot.tickets)) {
        fail('IncompleteSourceSnapshot', 'snapshot');
      }
      const tickets = [];
      for (const ticket of snapshot.tickets) {
        const history = ticket?.assigneeEntraObjectId === null ? null : await readHistory(ticket);
        tickets.push({ ...ticket, assignedAtUtc: recoverAssignmentTime(ticket, history) });
      }
      return { ...snapshot, tickets };
    }
  };
}

module.exports = { recoverAssignmentTime, withAssignmentHistory };
