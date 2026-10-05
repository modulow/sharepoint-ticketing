const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { JSDOM } = require('jsdom');
const { normalizeTicketTitle } = require('../lib-commonjs/webparts/supportIt/utils/ticketTitle');

const originalLoad = Module._load;
let SharePointTicketService;
try {
  Module._load = function (request, ...args) {
    if (request === '@microsoft/sp-http') return { SPHttpClient: { configurations: { v1: {} } } };
    return originalLoad.call(this, request, ...args);
  };
  ({ SharePointTicketService } = require('../lib-commonjs/webparts/supportIt/services/SharePointTicketService'));
} finally {
  Module._load = originalLoad;
}

const prefix = 'Learn IT Helpdesk - ';
const cases = [
  ['VPN issue', `${prefix}VPN issue`],
  ['  VPN issue  ', `${prefix}VPN issue`],
  [`${prefix}VPN issue`, `${prefix}VPN issue`],
  ['learn it helpdesk - VPN issue', `${prefix}VPN issue`],
  ['LEARN IT HELPDESK - Learn IT Helpdesk - VPN issue', `${prefix}VPN issue`],
  ['Learn IT Helpdesk VPN issue', `${prefix}VPN issue`],
  ['Learn IT Helpdeskish subject', `${prefix}Learn IT Helpdeskish subject`],
  ['Subject - Learn IT Helpdesk', `${prefix}Subject - Learn IT Helpdesk`],
  ['VPN <error> & café 😀', `${prefix}VPN <error> & café 😀`],
  ['x'.repeat(235), `${prefix}${'x'.repeat(235)}`],
  [`${prefix}${'x'.repeat(235)}`, `${prefix}${'x'.repeat(235)}`]
];
const invalid = ['', '   ', 'Learn IT Helpdesk', `${prefix}Learn IT Helpdesk - `, 'x'.repeat(236), `${prefix}${'x'.repeat(236)}`];

function demoPage(t, stored) {
  const root = path.resolve(__dirname, '..', 'docs');
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
    url: 'https://example.test/', runScripts: 'outside-only'
  });
  t.after(() => dom.window.close());
  dom.window.structuredClone = structuredClone;
  dom.window.scrollTo = () => {};
  dom.window.document.querySelector('dialog').showModal = () => {};
  dom.window.document.querySelector('dialog').close = () => {};
  if (stored) dom.window.localStorage.setItem('support-it-demo', JSON.stringify(stored));
  dom.window.eval(fs.readFileSync(path.join(root, 'app.js'), 'utf8'));
  return dom.window;
}

test('normalization preserves subjects, exact case, idempotence and the 255 boundary in SPFx and demo', t => {
  const window = demoPage(t);
  for (const [input, expected] of cases) {
    assert.equal(normalizeTicketTitle(input), expected);
    assert.equal(normalizeTicketTitle(expected), expected);
    assert.equal(window.normalizeTicketTitle(input), expected);
  }
  for (const input of invalid) {
    assert.throws(() => normalizeTicketTitle(input), /subject|255/);
    assert.throws(() => window.normalizeTicketTitle(input), /subject|255/);
  }
  assert.equal(normalizeTicketTitle('x'.repeat(235)).length, 255);
  assert.equal(normalizeTicketTitle('😀'.repeat(117)).length, 254);
  assert.throws(() => normalizeTicketTitle('😀'.repeat(118)), /255/);
});

function service(current, postStatus = 204, headerEtag = null) {
  const reads = [];
  const writes = [];
  const fields = [
    ['Title', 'Text'], ['Descriptif', 'Note'], ['Statut', 'Choice'], ['Assigned_x0020_to', 'User']
  ].map(([InternalName, TypeAsString]) => ({ InternalName, Title: InternalName, TypeAsString, Hidden: false, ReadOnlyField: false }));
  const response = data => ({ ok: true, headers: { get: key => key === 'ETag' ? headerEtag : null }, json: async () => data });
  const context = { spHttpClient: {
    get: async url => {
      reads.push(url);
      return response(url.includes('/fields?') ? { value: fields } : current);
    },
    post: async (url, _configuration, options) => {
      writes.push({ url, ...options, body: JSON.parse(options.body) });
      return { ok: postStatus === 204, status: postStatus, statusText: 'Precondition Failed', json: async () => ({ error: { message: 'Ticket changed; refresh.' } }) };
    }
  } };
  return { client: new SharePointTicketService(context), reads, writes };
}

test('SPFx saves normalize the latest persisted title with the same update and exact ETag', async () => {
  for (const title of ['VPN issue', `${prefix}VPN issue`]) {
    const { client, reads, writes } = service({ Title: title, '@odata.etag': '"7"' });
    await client.updateTicket(42, { status: 'Waiting', assignedToId: 9 });
    assert.match(reads[1], /items\(42\)\?\$select=Title$/);
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0].body, { Statut: 'Waiting', Assigned_x0020_toId: 9, Title: `${prefix}VPN issue` });
    assert.equal(writes[0].headers['IF-MATCH'], '"7"');
  }
});

test('SPFx overflow, empty title and missing version reject before any write', async () => {
  for (const current of [
    { Title: 'x'.repeat(236), '@odata.etag': '"7"' },
    { Title: '', '@odata.etag': '"7"' },
    { Title: 'VPN issue' },
    { Title: 'VPN issue', '@odata.etag': '*' },
    { '@odata.etag': '"7"' }
  ]) {
    const { client, writes } = service(current);
    await assert.rejects(client.updateTicket(42, { status: 'Waiting' }));
    assert.equal(writes.length, 0);
  }
});

test('SPFx supports REST OData v3 and header ETags as well as OData v4 metadata', async () => {
  for (const [current, header] of [
    [{ Title: 'VPN issue', 'odata.etag': '"8"' }, null],
    [{ Title: 'VPN issue' }, '"8"']
  ]) {
    const { client, writes } = service(current, 204, header);
    await client.updateTicket(42, { status: 'Waiting' });
    assert.equal(writes[0].headers['IF-MATCH'], '"8"');
  }
});

test('SPFx concurrent change is surfaced, never retried with wildcard', async () => {
  const { client, writes } = service({ Title: 'VPN issue', '@odata.etag': '"7"' }, 412);
  await assert.rejects(client.updateTicket(42, { status: 'Waiting' }), /SharePoint 412: Ticket changed/);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].headers['IF-MATCH'], '"7"');
});

test('demo creation shows overflow error without writes then preserves full valid subject', t => {
  const window = demoPage(t);
  window.document.querySelector('[data-demo-create]').click();
  const form = window.document.querySelector('#ticket-form');
  form.elements.subject.value = 'x'.repeat(236);
  form.elements.description.value = 'Sample';
  const submit = () => form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  submit();
  assert.equal(window.localStorage.getItem('support-it-demo'), null);
  assert.equal(form.querySelector('[role="alert"]').hidden, false);
  assert.match(form.querySelector('[role="alert"]').textContent, /255/);
  form.elements.subject.value = 'x'.repeat(235);
  submit();
  assert.equal(JSON.parse(window.localStorage.getItem('support-it-demo'))[0].subject, `${prefix}${'x'.repeat(235)}`);
});

test('demo seeds are prefixed and agent save preserves legacy subject; overflow leaves all fields unchanged', t => {
  const window = demoPage(t);
  assert.match(window.document.querySelector('.ticket-row strong').textContent, /^Learn IT Helpdesk - /);
  const stored = [{ id: 1, subject: 'Legacy subject', description: 'Demo', category: 'Other', status: 'New', priority: 'Normal', assignee: '', requester: 'Demo' }];
  const legacy = demoPage(t, stored);
  legacy.document.querySelector('[data-view="management"]').click();
  let form = legacy.document.querySelector('#management-form');
  form.dispatchEvent(new legacy.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(JSON.parse(legacy.localStorage.getItem('support-it-demo'))[0].subject, `${prefix}Legacy subject`);
  stored[0].subject = 'x'.repeat(236);
  const oversized = demoPage(t, stored);
  oversized.document.querySelector('[data-view="management"]').click();
  form = oversized.document.querySelector('#management-form');
  form.elements.status.value = 'Waiting';
  form.dispatchEvent(new oversized.Event('submit', { bubbles: true, cancelable: true }));
  assert.deepEqual(JSON.parse(oversized.localStorage.getItem('support-it-demo')), stored);
  assert.equal(form.querySelector('[role="alert"]').hidden, false);
});
