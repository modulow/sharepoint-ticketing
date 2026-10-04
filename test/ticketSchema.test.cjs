const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveTicketSchema } = require('../lib-commonjs/webparts/supportIt/services/TicketSchema');

const field = (InternalName, Title, TypeAsString) => ({
  InternalName,
  Title,
  TypeAsString,
  Hidden: false,
  ReadOnlyField: false
});

test('resolves Kiwi fields from internal names and localized labels', () => {
  assert.deepEqual(resolveTicketSchema([
    field('Title', 'Titre', 'Text'),
    field('Descriptif', 'Descriptif', 'Note'),
    field('Demandeur0', 'Demandeur', 'User'),
    field('LegacyCategoryName', 'Catégorie', 'Choice'),
    field('AssignedTo', 'Assigné à', 'User'),
    field('R_x00e9_ponseaudemandeur', 'Réponse au demandeur', 'Text')
  ]), {
    title: 'Title',
    description: 'Descriptif',
    requester: 'Demandeur0',
    category: 'LegacyCategoryName',
    priority: undefined,
    status: undefined,
    assignedTo: 'AssignedTo',
    dueDate: undefined,
    resolution: 'R_x00e9_ponseaudemandeur'
  });
});

test('fails explicitly when required intake fields are absent', () => {
  assert.throws(
    () => resolveTicketSchema([field('Title', 'Titre', 'Text')]),
    /Descriptif\/Description/
  );
});
