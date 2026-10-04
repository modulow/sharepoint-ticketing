const assert = require('node:assert/strict');
const test = require('node:test');
const { initialView, open, popupName } = require('../docs/secure-popup.js');

test('action=create opens the ticket portal on the create view', () => {
  assert.equal(initialView('?action=create'), 'create');
  assert.equal(initialView('?action=tickets'), 'dashboard');
  assert.equal(initialView(''), 'dashboard');
});

test('secure SharePoint destinations use one named popup', () => {
  const calls = [];
  const popup = {
    focusCalled: false,
    opener: {},
    focus() {
      this.focusCalled = true;
    }
  };
  const browserWindow = {
    open(...args) {
      calls.push(args);
      return popup;
    }
  };

  assert.equal(open('https://europarl.sharepoint.com/form', browserWindow), true);
  assert.deepEqual(calls, [[
    'https://europarl.sharepoint.com/form',
    popupName,
    'popup=yes,width=520,height=720,resizable=yes,scrollbars=yes'
  ]]);
  assert.equal(popup.opener, null);
  assert.equal(popup.focusCalled, true);
});

test('blocked popups leave the caller free to follow the fallback link', () => {
  const browserWindow = {
    open() {
      return null;
    }
  };

  assert.equal(open('https://europarl.sharepoint.com/form', browserWindow), false);
});
