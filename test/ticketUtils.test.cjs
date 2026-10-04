const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeTickets } = require('../lib-commonjs/webparts/supportIt/utils/ticketUtils');

const ticket = (status, priority) => ({
  id: 1,
  subject: 'Test',
  description: 'Description',
  category: 'Software',
  priority,
  status,
  author: { id: 1, displayName: 'Utilisateur', email: 'user@example.com' },
  created: '2026-01-01T00:00:00Z',
  modified: '2026-01-01T00:00:00Z',
  attachmentCount: 0
});

test('summarizeTickets counts workflow and priority states', () => {
  assert.deepEqual(
    summarizeTickets([
      ticket('New', 'Critical'),
      ticket('Waiting', 'Normal'),
      ticket('Resolved', 'High'),
      ticket('Closed', 'Critical')
    ]),
    { total: 4, open: 2, waiting: 1, resolved: 2, critical: 1 }
  );
});
