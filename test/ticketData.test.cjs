const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'docs', 'ticket-data.js'), 'utf8');
const fixture = {
  id: 7, subject: '<script>ticket</script>', description: 'Fixture details',
  category: 'Software', priority: 'Normal', status: 'New',
  requester: 'Fixture requester', assignee: 'Fixture agent', modified: '2026-10-01',
  due: '2026-10-08', resolution: 'Fixture notes', attachmentCount: 2
};

function page(t, { enabled = false, response, loader, storage } = {}) {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'docs', 'index.html'), 'utf8'), {
    url: 'https://example.test/sharepoint-ticketing/',
    runScripts: 'outside-only'
  });
  t.after(() => dom.window.close());
  const calls = [];
  dom.window.AbortController = AbortController;
  dom.window.fetch = async (...args) => {
    calls.push(args);
    if (response instanceof Error) throw response;
    return response;
  };
  dom.window.scrollTo = () => {};
  const dialog = dom.window.document.querySelector('dialog');
  dialog.showModal = () => dialog.setAttribute('open', '');
  dialog.close = () => {
    dialog.removeAttribute('open');
    dialog.dispatchEvent(new dom.window.Event('close'));
  };
  if (storage) dom.window.localStorage.setItem('support-it-demo', JSON.stringify(storage));
  dom.window.eval(enabled ? source.replace('const enabled = false;', 'const enabled = true;') : source);
  if (loader) dom.window.KiwiTicketData = { load: loader, signInUrl: './auth/login' };
  return { window: dom.window, document: dom.window.document, calls };
}

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' }
});
const start = async p => {
  p.window.eval(fs.readFileSync(path.join(root, 'docs', 'app.js'), 'utf8'));
  await new Promise(resolve => setTimeout(resolve, 20));
};

test('default live workspace is disabled, makes no API request, and never reads stored samples', async t => {
  const p = page(t, { storage: [{ ...fixture, subject: 'Never display this sample' }] });
  await start(p);
  assert.equal(p.calls.length, 0);
  assert.equal(p.document.querySelector('#app h2').textContent, 'Live tracking unavailable');
  assert.match(p.document.querySelector('[role="alert"]').textContent, /not configured/);
  assert.equal(p.document.querySelector('[data-demo-create]').hidden, true);
  p.document.querySelector('[data-view="tickets"]').click();
  assert.doesNotMatch(p.document.querySelector('#app').textContent, /Never display|VPN|No tickets/);
  assert.equal(p.document.querySelectorAll('[data-live-tool]').length, 2);
  assert.equal(JSON.parse(p.window.localStorage.getItem('support-it-demo'))[0].subject, 'Never display this sample');
});

test('approved adapter uses same-origin protected API without client tokens or caching', async t => {
  const p = page(t, { enabled: true, response: jsonResponse({ schemaVersion: 1, tickets: [fixture] }) });
  const result = await p.window.KiwiTicketData.load();
  assert.equal(result.tickets[0].id, 7);
  const [url, options] = p.calls[0];
  assert.equal(url, './api/tickets');
  assert.equal(options.credentials, 'same-origin');
  assert.equal(options.cache, 'no-store');
  assert.equal(options.redirect, 'error');
  assert.deepEqual(Object.keys(options.headers), ['Accept']);
  assert.equal(p.window.localStorage.length, 0);
});

test('unauthenticated and forbidden responses never render tickets', async t => {
  for (const status of [401, 403]) {
    const p = page(t, { enabled: true, response: jsonResponse({}, status) });
    await start(p);
    if (status === 401) {
      assert.equal(p.document.querySelector('#app h2').textContent, 'Microsoft sign-in required');
      assert.equal(p.document.querySelector('#app a.primary').getAttribute('href'), './auth/login');
    } else {
      assert.match(p.document.querySelector('[role="alert"]').textContent, /Access denied/);
      assert.equal(p.document.querySelector('#app a.primary'), null);
    }
    assert.equal(p.document.querySelectorAll('.ticket-card').length, 0);
  }
});

test('invalid service data, HTML login responses, and network failures fail explicitly', async t => {
  for (const response of [
    jsonResponse({ schemaVersion: 1, tickets: [{ ...fixture, description: null }] }),
    jsonResponse({ schemaVersion: 1, tickets: [fixture, fixture] }),
    jsonResponse({ tickets: [fixture] }),
    new Response('<html>Login</html>', { headers: { 'Content-Type': 'text/html' } }),
    new Response(JSON.stringify({ schemaVersion: 1, tickets: [fixture] }), {
      headers: { 'Content-Type': 'application/jsonp', 'Cache-Control': 'private, no-store' }
    }),
    jsonResponse({}, 500),
    new Error('Fixture network failure')
  ]) {
    const p = page(t, { enabled: true, response });
    await start(p);
    assert.equal(p.document.querySelector('#app h2').textContent, 'Live tracking unavailable');
    assert.ok(p.document.querySelector('[role="alert"]').textContent);
    assert.equal(p.document.querySelectorAll('.ticket-card').length, 0);
    assert.equal(p.window.localStorage.length, 0);
  }
});

test('API responses without private no-store cache policy fail before parsing ticket data', async t => {
  for (const cacheControl of ['', 'private', 'no-store', 'public, no-store', 'private, no-store, public', 'private, no-store, s-maxage=60']) {
    const p = page(t, { enabled: true, response: new Response(
      JSON.stringify({ schemaVersion: 1, tickets: [fixture] }),
      { headers: { 'Content-Type': 'application/json', 'Cache-Control': cacheControl } }
    ) });
    await assert.rejects(p.window.KiwiTicketData.load(), /private, no-store/);
  }
  const p = page(t, { enabled: true, response: new Response(
    JSON.stringify({ schemaVersion: 1, tickets: [fixture] }),
    { headers: { 'Content-Type': 'Application/JSON; charset=utf-8', 'Cache-Control': 'Private, No-Store' } }
  ) });
  assert.equal((await p.window.KiwiTicketData.load()).tickets[0].id, fixture.id);
});

test('service timeout aborts the request and reports an actionable error', async t => {
  const p = page(t, { enabled: true });
  let timeout;
  let cleared;
  let signal;
  p.window.setTimeout = (callback, delay) => {
    assert.equal(delay, 15000);
    timeout = callback;
    return 73;
  };
  p.window.clearTimeout = id => { cleared = id; };
  p.window.fetch = (_url, options) => {
    signal = options.signal;
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
  };
  const rejected = assert.rejects(p.window.KiwiTicketData.load(), /timed out.*Retry/);
  timeout();
  await rejected;
  assert.equal(signal.aborted, true);
  assert.equal(cleared, 73);
});

test('missing adapter fails closed with explicit status rather than exposing samples', async t => {
  const p = page(t);
  delete p.window.KiwiTicketData;
  await start(p);
  assert.match(p.document.querySelector('[role="alert"]').textContent, /adapter is unavailable/);
  assert.equal(p.calls.length, 0);
  assert.equal(p.document.querySelectorAll('.ticket-card').length, 0);
});

test('authorized fixture tickets keep filters/design, escape details, and disable browser edits', async t => {
  const p = page(t, { enabled: true, response: jsonResponse({
    schemaVersion: 1, tickets: [fixture, { ...fixture, id: 8, status: 'Resolved', assignee: '' }]
  }) });
  await start(p);
  assert.equal(p.document.querySelectorAll('.summary-grid .summary-card').length, 4);
  p.document.querySelector('[data-ticket-filter="resolved"]').click();
  assert.equal(p.document.querySelectorAll('.ticket-card').length, 1);
  p.document.querySelector('[data-view="tickets"]').click();
  assert.equal(p.document.querySelector('#app h2').textContent, 'All tickets');
  assert.equal(p.document.querySelectorAll('.ticket-card').length, 2);
  p.document.querySelector('[data-ticket-detail="7"]').click();
  assert.ok(p.document.querySelector('dialog').hasAttribute('open'));
  assert.match(p.document.querySelector('#dialog-body').textContent, /Fixture requester/);
  assert.match(p.document.querySelector('#dialog-body').textContent, /Fixture notes/);
  assert.match(p.document.querySelector('#dialog-body').textContent, /2026-10-08/);
  assert.match(p.document.querySelector('#dialog-body').textContent, /Attachments: 2/);
  assert.equal(p.document.querySelector('#dialog-body script'), null);
  p.document.querySelector('#close-dialog').click();
  p.document.querySelector('[data-view="management"]').click();
  assert.equal(p.document.querySelector('#management-form'), null);
  p.document.querySelector('[data-agent="Fixture agent"]').click();
  p.document.querySelector('[data-ticket="7"]').click();
  assert.match(p.document.querySelector('.editor').textContent, /Fixture details/);
  assert.equal(p.window.localStorage.length, 0);
});

test('refresh removes prior details immediately and rejects stale responses', async t => {
  const pending = [];
  const p = page(t, { loader: () => new Promise(resolve => pending.push(resolve)) });
  await start(p);
  pending[0]({ tickets: [fixture], signInRequired: false });
  await new Promise(resolve => setTimeout(resolve, 0));
  p.document.querySelector('[data-view="tickets"]').click();
  p.document.querySelector('[data-ticket-detail="7"]').click();
  p.document.querySelector('#reset-demo').click();
  assert.equal(p.document.querySelector('dialog').hasAttribute('open'), false);
  assert.equal(p.document.querySelector('#dialog-body').textContent, '');
  assert.equal(p.document.querySelectorAll('.ticket-card').length, 0);
  p.document.querySelector('#reset-demo').click();
  pending[2]({ tickets: [], signInRequired: true });
  await new Promise(resolve => setTimeout(resolve, 0));
  pending[1]({ tickets: [fixture], signInRequired: false });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(p.document.querySelector('#app h2').textContent, 'Microsoft sign-in required');
  assert.equal(p.document.querySelectorAll('.ticket-card').length, 0);
});

test('browser history restoration clears ticket details and rechecks access before rendering', async t => {
  const pending = [];
  const p = page(t, { loader: () => new Promise(resolve => pending.push(resolve)) });
  await start(p);
  pending[0]({ tickets: [fixture], signInRequired: false });
  await new Promise(resolve => setTimeout(resolve, 0));
  p.document.querySelector('[data-view="tickets"]').click();
  p.document.querySelector('[data-ticket-detail="7"]').click();
  p.window.dispatchEvent(new p.window.PageTransitionEvent('pagehide', { persisted: true }));
  assert.equal(p.document.querySelector('dialog').hasAttribute('open'), false);
  assert.equal(p.document.querySelector('#dialog-body').textContent, '');
  assert.equal(p.document.querySelectorAll('.ticket-card').length, 0);
  assert.doesNotMatch(p.document.querySelector('#app').textContent, /Fixture/);
  p.window.dispatchEvent(new p.window.PageTransitionEvent('pageshow', { persisted: true }));
  assert.equal(pending.length, 2);
  assert.equal(p.document.querySelector('#app h2').textContent, 'Loading tickets');
  // A response started before a second navigation must not restore ticket data.
  p.window.dispatchEvent(new p.window.PageTransitionEvent('pagehide', { persisted: true }));
  pending[1]({ tickets: [fixture], signInRequired: false });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(p.document.querySelectorAll('.ticket-card').length, 0);
  p.window.dispatchEvent(new p.window.PageTransitionEvent('pageshow', { persisted: true }));
  pending[2]({ tickets: [], signInRequired: true });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(p.document.querySelector('#app h2').textContent, 'Microsoft sign-in required');
  assert.equal(p.window.localStorage.length, 0);
});
