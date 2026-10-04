(function () {
  'use strict';

  const endpoint = './api/tickets';
  const signInUrl = './auth/login';
  // Enable only after the protected service and institutional data-processing approval exist.
  const enabled = false;
  const textFields = ['subject', 'description', 'category', 'priority', 'status', 'requester', 'assignee', 'modified', 'due', 'resolution'];

  function validateTickets(body) {
    if (!body || body.schemaVersion !== 1 || !Array.isArray(body.tickets)) {
      throw new Error('The protected ticket service returned an invalid response.');
    }
    const ids = new Set();
    return body.tickets.map(ticket => {
      if (!ticket || !Number.isSafeInteger(ticket.id) || ticket.id <= 0 || ids.has(ticket.id) ||
          textFields.some(field => typeof ticket[field] !== 'string') ||
          !Number.isSafeInteger(ticket.attachmentCount) || ticket.attachmentCount < 0) {
        throw new Error('The protected ticket service returned an invalid ticket.');
      }
      ids.add(ticket.id);
      return Object.fromEntries(['id', ...textFields, 'attachmentCount'].map(field => [field, ticket[field]]));
    });
  }

  async function load() {
    if (!enabled) {
      throw new Error('Live tracking is not configured. Microsoft sign-in, agent authorization and an IT-approved protected API must be provisioned before tickets can appear here. Use the authenticated Kiwi queue in the meantime.');
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await window.fetch(endpoint, {
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      if (response.status === 401) {
        return { signInRequired: true, tickets: [] };
      }
      if (response.status === 403) {
        throw new Error('Access denied. Only authorized learn.IT support agents can view this workspace.');
      }
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
        throw new Error('The protected ticket service is unavailable or misconfigured. No sample data has been substituted.');
      }
      return { signInRequired: false, tickets: validateTickets(await response.json()) };
    } finally {
      window.clearTimeout(timeout);
    }
  }

  window.KiwiTicketData = Object.freeze({ load, signInUrl });
})();
