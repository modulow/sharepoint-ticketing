const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { openIntakePopup } = require('../lib-commonjs/webparts/supportIt/utils/intakePopup');
const { KIWI_INTAKE_FORM_URL } = require('../lib-commonjs/webparts/supportIt/services/KiwiConfiguration');

const root = path.resolve(__dirname, '..');
const popupStub = () => ({
  closed: false,
  opener: 'parent',
  locations: [],
  focusCount: 0,
  focus() { this.focusCount++; },
  location: { replace(url) {
    assert.equal(this.owner.opener, null, 'opener must be cleared before navigation');
    this.owner.locations.push(url);
  } }
});
const makePopup = () => {
  const popup = popupStub();
  popup.location.owner = popup;
  return popup;
};

function staticPage(t, popup, search = '') {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'docs', 'index.html'), 'utf8'), {
    url: `https://example.test/sharepoint-ticketing/${search}`,
    runScripts: 'outside-only'
  });
  t.after(() => dom.window.close());
  const calls = [];
  dom.window.structuredClone = structuredClone;
  dom.window.scrollTo = () => {};
  dom.window.open = (...args) => { calls.push(args); return popup; };
  const dialog = dom.window.document.querySelector('dialog');
  // jsdom does not implement the browser's native dialog methods.
  dialog.showModal = () => dialog.setAttribute('open', '');
  dialog.close = () => {
    dialog.removeAttribute('open');
    dialog.dispatchEvent(new dom.window.Event('close'));
  };
  dom.window.eval(fs.readFileSync(path.join(root, 'docs', 'app.js'), 'utf8'));
  return { window: dom.window, document: dom.window.document, calls, dialog };
}

test('SPFx popup opens compact isolated window and preserves the exact native form URL', t => {
  const popup = makePopup();
  const calls = [];
  const originalWindow = global.window;
  global.window = { open: (...args) => { calls.push(args); return popup; } };
  t.after(() => { global.window = originalWindow; });
  assert.equal(openIntakePopup(KIWI_INTAKE_FORM_URL), popup);
  assert.deepEqual(calls, [['about:blank', 'kiwi-ticket-form', 'popup,width=520,height=720,resizable=yes,scrollbars=yes']]);
  assert.deepEqual(popup.locations, [KIWI_INTAKE_FORM_URL]);
});

test('SPFx blocked popup returns no window for accessible link fallback', t => {
  const originalWindow = global.window;
  global.window = { open: () => null };
  t.after(() => { global.window = originalWindow; });
  assert.equal(openIntakePopup(KIWI_INTAKE_FORM_URL), undefined);
});

test('all static Create controls open native intake synchronously without replacing dashboard or queue', t => {
  const popup = makePopup();
  const page = staticPage(t, popup);
  const app = page.document.querySelector('#app');
  const dashboard = app.innerHTML;
  page.document.querySelector('[data-view="create"]').click();
  assert.equal(page.calls.length, 1);
  assert.deepEqual(page.calls[0], ['about:blank', 'kiwi-ticket-form', 'popup,width=520,height=720,resizable=yes,scrollbars=yes']);
  assert.equal(app.innerHTML, dashboard);
  assert.deepEqual(popup.locations, [KIWI_INTAKE_FORM_URL]);
  page.document.querySelector('[data-go="create"]').click();
  assert.equal(page.calls.length, 1, 'an already-open popup is reused');
  assert.equal(popup.focusCount, 1);
  popup.closed = true;
  page.document.querySelector('[data-view="tickets"]').click();
  const queue = app.innerHTML;
  page.document.querySelector('[data-go="create"]').click();
  assert.equal(page.calls.length, 2);
  assert.equal(app.innerHTML, queue);
  assert.match(page.document.querySelector('#intake-status').textContent, /browser-only samples/);
  assert.equal(page.document.querySelectorAll('iframe').length, 0);
  assert.equal(page.window.localStorage.getItem('support-it-demo'), null);
});

test('blocked static popup shows secure fallback and dismisses without changing current page', t => {
  const page = staticPage(t, null);
  const dashboard = page.document.querySelector('#app').innerHTML;
  page.document.querySelector('[data-go="create"]').click();
  assert.ok(page.dialog.hasAttribute('open'));
  assert.equal(page.dialog.getAttribute('aria-labelledby'), 'dialog-title');
  assert.match(page.document.querySelector('[role="alert"]').textContent, /blocked/);
  const link = page.dialog.querySelector('a');
  assert.equal(link.href, KIWI_INTAKE_FORM_URL);
  assert.equal(link.target, '_blank');
  assert.equal(link.rel, 'noreferrer');
  page.document.querySelector('#retry-popup').click();
  assert.equal(page.calls.length, 2);
  page.document.querySelector('#close-dialog').click();
  assert.equal(page.dialog.hasAttribute('open'), false);
  assert.equal(page.document.querySelector('#app').innerHTML, dashboard);
});

test('sample form opens in a labelled modal, cancels without writes, and only saves locally on submit', t => {
  const page = staticPage(t, null);
  const dashboard = page.document.querySelector('#app').innerHTML;
  page.document.querySelector('[data-demo-create]').click();
  assert.ok(page.dialog.hasAttribute('open'));
  assert.match(page.document.querySelector('#dialog-title').textContent, /sample/);
  assert.equal(page.document.querySelector('#app').innerHTML, dashboard);
  page.document.querySelector('#close-dialog').click();
  assert.equal(page.window.localStorage.getItem('support-it-demo'), null);
  page.document.querySelector('[data-demo-create]').click();
  const form = page.document.querySelector('#ticket-form');
  form.elements.subject.value = 'Local sample only';
  form.elements.description.value = 'No tenant calls';
  form.dispatchEvent(new page.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(page.dialog.hasAttribute('open'), false);
  assert.equal(JSON.parse(page.window.localStorage.getItem('support-it-demo'))[0].subject, 'Local sample only');
  assert.equal(page.calls.length, 0);
});

test('action=create renders live intake landing immediately without attempting an automatic popup', t => {
  const page = staticPage(t, makePopup(), '?source=portal&action=create');
  assert.equal(page.document.querySelector('#app h2').textContent, 'Create a ticket');
  assert.ok(page.document.querySelector('[data-view="create"]').classList.contains('active'));
  assert.equal(page.document.querySelector('#ticket-form'), null, 'no ambiguous demo intake on arrival');
  assert.equal(page.calls.length, 0, 'authentication popup requires an explicit click');
  const link = page.document.querySelector('[data-live-tool]');
  assert.equal(link.href, KIWI_INTAKE_FORM_URL);
  link.click();
  assert.equal(page.calls.length, 1);
  assert.equal(page.document.querySelector('#app h2').textContent, 'Create a ticket');
  page.document.querySelector('[data-sample-form]').click();
  assert.ok(page.document.querySelector('#ticket-form'));
  assert.equal(page.window.localStorage.getItem('support-it-demo'), null);
});

test('unknown action keeps dashboard landing', t => {
  const page = staticPage(t, null, '?action=tickets');
  assert.ok(page.document.querySelector('#app .summary-grid'));
  assert.equal(page.calls.length, 0);
});

test('queue and exchanges reuse native intake window across demo queue and agent rerenders', t => {
  const popup = makePopup();
  const page = staticPage(t, popup);
  page.document.querySelector('[data-view="create"]').click();
  page.document.querySelector('[data-view="tickets"]').click();
  const queue = page.document.querySelector('#app').innerHTML;
  const links = page.document.querySelectorAll('[data-live-tool]');
  links[0].click();
  assert.equal(popup.locations.at(-1), 'https://europarl.sharepoint.com/sites/learn.IT-Kiwi/Lists/EuropaTickets/AllItems.aspx');
  links[1].click();
  assert.equal(popup.locations.at(-1), 'https://europarl.sharepoint.com/sites/learn.IT-Kiwi/Lists/TicketExchanges/AllItems.aspx');
  assert.equal(page.document.querySelector('#app').innerHTML, queue);
  page.document.querySelector('[data-view="management"]').click();
  page.document.querySelector('[data-agent="unassigned"]').click();
  page.document.querySelector('[data-live-tool]').click();
  page.document.querySelector('[data-view="create"]').click();
  assert.equal(popup.locations.at(-1), KIWI_INTAKE_FORM_URL, 'intake retargets the shared window after a list action');
  assert.equal(page.calls.length, 1);
  assert.equal(page.window.localStorage.getItem('support-it-demo'), null);
});

test('blocked queue and exchange popups retain exact live destination fallback', t => {
  const page = staticPage(t, null);
  page.document.querySelector('[data-view="tickets"]').click();
  const links = [...page.document.querySelectorAll('[data-live-tool]')];
  for (const link of links) {
    link.click();
    assert.ok(page.dialog.hasAttribute('open'));
    assert.equal(page.dialog.querySelector('a').href, link.href);
    assert.equal(page.dialog.querySelector('a').rel, 'noreferrer');
    page.document.querySelector('#retry-popup').click();
    assert.equal(page.dialog.querySelector('a').href, link.href);
    page.document.querySelector('#close-dialog').click();
  }
  assert.equal(page.calls.length, 4);
  assert.equal(page.window.localStorage.getItem('support-it-demo'), null);
});

test('SharePoint UI preserves landing view, refreshes on popup closure, and opens ticket detail in a modal', async t => {
  const dom = new JSDOM('<div id="root"></div>', {
    url: 'https://example.test/',
    pretendToBeVisual: true
  });
  const globals = ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'FormData', 'requestAnimationFrame', 'cancelAnimationFrame', 'MessageChannel'];
  const descriptors = globals.map(key => [key, Object.getOwnPropertyDescriptor(global, key)]);
  globals.forEach(key => Object.defineProperty(global, key, {
    configurable: true,
    value: typeof dom.window[key] === 'function' && key.includes('AnimationFrame')
      ? dom.window[key].bind(dom.window) : dom.window[key]
  }));
  dom.window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
  const Module = require('node:module');
  const originalLoad = Module._load;
  let SupportIt;
  try {
    Module._load = function (request, ...args) {
      if (request === './SupportIt.module.scss') return new Proxy({}, { get: (_, key) => key });
      return originalLoad.call(this, request, ...args);
    };
    SupportIt = require('../lib-commonjs/webparts/supportIt/components/SupportIt').default;
  } finally {
    Module._load = originalLoad;
  }
  const React = require('react');
  const ReactDOM = require('react-dom');
  const { act } = require('react-dom/test-utils');
  const container = dom.window.document.querySelector('#root');
  t.after(() => {
    act(() => { ReactDOM.unmountComponentAtNode(container); });
    dom.window.close();
    descriptors.forEach(([key, descriptor]) => {
      if (descriptor) Object.defineProperty(global, key, descriptor);
      else delete global[key];
    });
  });
  const popup = makePopup();
  dom.window.open = () => popup;
  let poll;
  let timerCleared = false;
  dom.window.setInterval = callback => { poll = callback; return 42; };
  dom.window.clearInterval = id => { timerCleared = id === 42; };
  let reads = 0;
  let writes = 0;
  let completeSave;
  const user = { id: 1, displayName: 'Sample user', email: 'sample@example.test' };
  const ticket = {
    id: 7, subject: 'Test request', description: 'Sample description', category: 'Software',
    priority: 'Normal', status: 'New', author: user, created: '2026-01-01', modified: '2026-01-01',
    attachmentCount: 0
  };
  const service = {
    getUserContext: async () => ({ user, isAgent: true }),
    getTickets: async () => { reads++; return [ticket]; },
    updateTicket: async (_id, update) => {
      writes++;
      assert.deepEqual(update, { status: 'In progress' });
      await new Promise(resolve => { completeSave = resolve; });
    },
    getIntakeFormUrl: () => KIWI_INTAKE_FORM_URL
  };
  await act(async () => { ReactDOM.render(React.createElement(SupportIt, { service, userDisplayName: 'Sample user' }), container); });
  const document = dom.window.document;
  const create = [...document.querySelectorAll('nav button')].find(button => button.textContent === 'Create a ticket');
  act(() => { create.click(); });
  assert.ok(document.querySelector('#summary-title'), 'dashboard remains mounted');
  assert.deepEqual(popup.locations, [KIWI_INTAKE_FORM_URL]);
  popup.closed = true;
  await act(async () => { poll(); });
  assert.equal(reads, 2, 'closing popup refreshes authenticated ticket reads');
  assert.ok(timerCleared);
  assert.equal(writes, 0, 'window closure never creates or updates a ticket');
  const ticketButton = [...document.querySelectorAll('button')].find(button => button.textContent.includes('Test request'));
  ticketButton.focus();
  await act(async () => { ticketButton.click(); });
  const modal = document.querySelector('[role="dialog"]');
  assert.ok(modal);
  assert.ok(document.querySelector('#summary-title'), 'detail modal does not replace the landing page');
  assert.ok(document.getElementById(modal.getAttribute('aria-labelledby')));
  await act(async () => {
    document.querySelector('[aria-label="Close ticket window"]').click();
    await new Promise(resolve => setTimeout(resolve, 30));
  });
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.equal(document.activeElement, ticketButton, 'focus returns to the launching ticket control');
  await act(async () => { ticketButton.click(); });
  const agentForm = document.querySelector('form');
  agentForm.elements.status.value = 'In progress';
  await act(async () => { agentForm.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); });
  assert.equal(writes, 1);
  assert.equal(document.querySelector('[aria-label="Close ticket window"]').disabled, true);
  await act(async () => { completeSave(); });
  assert.equal(document.querySelector('[aria-label="Close ticket window"]').disabled, false);
  assert.match(document.querySelector('[role="dialog"]').textContent, /Ticket #7 was updated/);
  await act(async () => {
    document.querySelector('[role="dialog"]').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
  });
  assert.equal(document.querySelector('[role="dialog"]'), null);
  dom.window.open = () => null;
  await act(async () => { create.click(); });
  const fallback = document.querySelector('[role="dialog"]');
  assert.match(fallback.textContent, /blocked/);
  assert.equal(fallback.querySelector('a').href, KIWI_INTAKE_FORM_URL);
  await act(async () => { fallback.querySelector('[aria-label="Close ticket window"]').click(); });
  assert.equal(reads, 3, 'fallback dismissal refreshes ticket reads without a submission');
});
