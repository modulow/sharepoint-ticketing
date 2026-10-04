const test = require('node:test');
const assert = require('node:assert/strict');
const { hasEditListItems } = require('../lib-commonjs/webparts/supportIt/services/PermissionUtils');

test('authorizes list editors and owners from effective permission masks', () => {
  assert.equal(hasEditListItems({ High: '0', Low: '4' }), true);
  assert.equal(hasEditListItems({ High: '2147483647', Low: '4294967295' }), true);
});

test('does not authorize users without EditListItems', () => {
  assert.equal(hasEditListItems({ High: '0', Low: '1' }), false);
  assert.equal(hasEditListItems({ High: 0, Low: 3 }), false);
});

