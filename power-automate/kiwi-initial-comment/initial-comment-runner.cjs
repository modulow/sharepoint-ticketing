'use strict';

const TICKETS_LIST_ID = 'f673fe2d-9733-46dd-9afe-4bf614c99202';
const HEADING = 'Learn IT Helpdesk - Descriptif initial du demandeur';

function timestamp(value, label) {
  const parsed = typeof value === 'string' && value.trim() ? Date.parse(value) : NaN;
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${label}.`);
  return parsed;
}

function keyFor(ticketId) {
  if (!Number.isSafeInteger(ticketId) || ticketId <= 0) throw new Error('Invalid ticket ID.');
  return `kiwi-initial-description:${TICKETS_LIST_ID}:${ticketId}:v1`;
}

function createInitialCommentRunner({ tickets, ledger, activationCutoffUtc, maxCommentLength, htmlToText, now = Date.now }) {
  const cutoff = timestamp(activationCutoffUtc, 'activation cutoff');
  if (cutoff > now()) throw new Error('Activation cutoff is in the future; initial comment copying is disabled.');
  if (!Number.isSafeInteger(maxCommentLength) || maxCommentLength < 1) {
    throw new Error('A verified native comment length limit is required.');
  }
  for (const [adapter, methods] of [[tickets, ['readTicket', 'listComments', 'postComment']], [ledger, ['read', 'reserve', 'complete']]]) {
    if (!adapter || methods.some(method => typeof adapter[method] !== 'function')) {
      throw new Error('Configured ticket and durable ledger adapters are required.');
    }
  }

  async function reconcile(key, ticketId, record) {
    if (!record || record.key !== key || record.ticketId !== ticketId ||
        typeof record.text !== 'string' || !record.text.endsWith(`\n\n[${key}]`) ||
        !['Pending', 'Completed'].includes(record.state)) {
      throw new Error('Invalid initial-comment ledger record; operator review required.');
    }
    const comments = await tickets.listComments(ticketId);
    if (!Array.isArray(comments)) throw new Error('Incomplete native comment enumeration.');
    const marked = comments.filter(comment => typeof comment.text === 'string' && comment.text.includes(`[${key}]`));
    if (marked.length !== 1 || marked[0].text !== record.text ||
        !['string', 'number'].includes(typeof marked[0].id) || !String(marked[0].id)) {
      throw new Error('Initial comment is absent, ambiguous or changed. Do not replay; inspect the pending ledger and native comments.');
    }
    const commentId = String(marked[0].id);
    if (record.state === 'Completed') {
      if (record.commentId !== commentId) throw new Error('Initial comment identity changed; operator review required.');
      return { status: 'already-copied', ticketId, commentId };
    }
    await ledger.complete(key, commentId, record.text);
    return { status: 'copied', ticketId, commentId };
  }

  return async function copyInitialDescription(event) {
    if (!event || event.listId !== TICKETS_LIST_ID) throw new Error('Unexpected source list.');
    const key = keyFor(event.ticketId);
    const created = timestamp(event.createdUtc, 'creation event timestamp');
    if (created < cutoff || created > now()) throw new Error('Creation event is outside the activation window; historical copying is not enabled.');
    const existing = await ledger.read(key);
    if (existing) return reconcile(key, event.ticketId, existing);

    const source = await tickets.readTicket(event.ticketId);
    if (!source || source.id !== event.ticketId || source.listId !== TICKETS_LIST_ID ||
        timestamp(source.createdUtc, 'stored creation timestamp') !== created) {
      throw new Error('Creation event does not match the stored ticket.');
    }
    if (typeof source.description !== 'string' || !source.description.trim()) {
      throw new Error('Descriptif is empty; no initial comment was created.');
    }
    let description = source.description;
    if (source.richText === true) {
      if (typeof htmlToText !== 'function') throw new Error('Rich Descriptif requires an approved HTML-to-text converter.');
      description = await htmlToText(source.description);
    } else if (source.richText !== false) {
      throw new Error('Descriptif rich-text metadata must be verified before copying.');
    }
    if (typeof description !== 'string' || !description.trim()) throw new Error('Descriptif conversion returned empty text.');
    const text = `${HEADING}\n\n${description}\n\n[${key}]`;
    if (text.length > maxCommentLength) throw new Error('Complete initial comment exceeds the verified native limit. No description was truncated or posted.');
    const initialComments = await tickets.listComments(event.ticketId);
    if (!Array.isArray(initialComments)) throw new Error('Incomplete native comment enumeration.');
    if (initialComments.some(comment =>
      typeof comment.text === 'string' && comment.text.includes(`[${key}]`))) {
      throw new Error('An initial-comment marker exists without a ledger. Operator review required; no duplicate posted.');
    }
    const record = { key, ticketId: event.ticketId, state: 'Pending', text };
    const reservation = await ledger.reserve(key, record);
    if (!reservation || typeof reservation.created !== 'boolean') throw new Error('Invalid durable reservation result.');
    if (!reservation.created) return reconcile(key, event.ticketId, reservation.record);
    // Pending survives a crash or an uncertain POST. Never automatically issue a second POST.
    try {
      await tickets.postComment(event.ticketId, text);
    } catch (cause) {
      throw new Error('Native initial-comment POST failed or is uncertain. Pending reservation retained; inspect comments before recovery.', { cause });
    }
    return reconcile(key, event.ticketId, record);
  };
}

module.exports = { TICKETS_LIST_ID, HEADING, keyFor, createInitialCommentRunner };
