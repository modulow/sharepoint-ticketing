const test = require('node:test');
const assert = require('node:assert/strict');
const { createInitialCommentRunner, keyFor, TICKETS_LIST_ID, HEADING } = require('../power-automate/kiwi-initial-comment/initial-comment-runner.cjs');
const { createSharePointAdapters } = require('../power-automate/kiwi-initial-comment/sharepoint-adapters.cjs');

const createdUtc = '2026-10-05T17:30:00Z';
const event = { listId: TICKETS_LIST_ID, ticketId: 42, createdUtc };
const options = { activationCutoffUtc: '2026-10-05T17:00:00Z', maxCommentLength: 1000, now: () => Date.parse('2026-10-05T18:00:00Z') };
function fixture() {
  const records = new Map();
  const comments = [];
  const source = { id: 42, listId: TICKETS_LIST_ID, createdUtc, description: 'Original question\nQuotes " & café 😀', richText: false };
  let posts = 0;
  const tickets = {
    readTicket: async () => ({ ...source }),
    listComments: async () => structuredClone(comments),
    postComment: async (id, text) => {
      assert.equal(records.get(keyFor(id)).state, 'Pending', 'durable reservation precedes native POST');
      posts++;
      comments.push({ id: String(posts), text });
    }
  };
  const ledger = {
    read: async key => structuredClone(records.get(key)),
    reserve: async (key, record) => {
      if (records.has(key)) return { created: false, record: structuredClone(records.get(key)) };
      records.set(key, structuredClone(record));
      return { created: true, record };
    },
    complete: async (key, commentId) => records.set(key, { ...records.get(key), state: 'Completed', commentId })
  };
  const runner = extra => createInitialCommentRunner({ ...options, tickets, ledger, ...extra });
  return { source, tickets, ledger, records, comments, runner, posts: () => posts };
}

test('copies full Descriptif once, preserves source and existing comments, survives restart and edits', async () => {
  const f = fixture();
  f.comments.push({ id: '99', text: 'Existing agent comment' });
  const original = structuredClone(f.source);
  const result = await f.runner()(event);
  assert.equal(result.status, 'copied');
  assert.equal(f.comments[1].text, `${HEADING}\n\n${original.description}\n\n[${keyFor(42)}]`);
  assert.deepEqual(f.source, original);
  f.source.description = 'Later correction';
  assert.equal((await f.runner()(event)).status, 'already-copied');
  assert.equal(f.posts(), 1);
  assert.equal(f.comments[0].text, 'Existing agent comment');
  assert.equal(f.records.get(keyFor(42)).state, 'Completed');
});

test('duplicate concurrent creation events authorize exactly one POST', async () => {
  const f = fixture();
  const outcomes = await Promise.allSettled([f.runner()(event), f.runner()(event), f.runner()(event)]);
  assert.equal(f.posts(), 1);
  assert.ok(outcomes.some(result => result.status === 'fulfilled'));
  await f.runner()(event);
  assert.equal(f.posts(), 1);
});

test('timeout after an accepted POST reconciles on restart without another POST', async () => {
  const f = fixture();
  const post = f.tickets.postComment;
  f.tickets.postComment = async (...args) => { await post(...args); throw new Error('Timeout'); };
  await assert.rejects(f.runner()(event), /Pending reservation retained/);
  assert.equal(f.records.get(keyFor(42)).state, 'Pending');
  await f.runner()(event);
  assert.equal(f.posts(), 1);
  assert.equal(f.records.get(keyFor(42)).state, 'Completed');
});

test('uncertain failed POST without visible comment stays Pending and never replays', async () => {
  const f = fixture();
  let attempts = 0;
  f.tickets.postComment = async () => { attempts++; throw new Error('Timeout'); };
  await assert.rejects(f.runner()(event), /uncertain/);
  await assert.rejects(f.runner()(event), /Do not replay/);
  assert.equal(attempts, 1);
});

test('ledger completion failure is recoverable by readback alone', async () => {
  const f = fixture();
  const complete = f.ledger.complete;
  f.ledger.complete = async () => { throw new Error('ETag conflict'); };
  await assert.rejects(f.runner()(event), /ETag conflict/);
  f.ledger.complete = complete;
  await f.runner()(event);
  assert.equal(f.posts(), 1);
});

test('changed, deleted or duplicate marked comments fail visibly and do not recreate', async () => {
  for (const mutation of [
    comments => { comments[0].text += ' changed'; },
    comments => { comments.length = 0; },
    comments => { comments.push({ ...comments[0], id: 'second' }); }
  ]) {
    const f = fixture();
    await f.runner()(event);
    mutation(f.comments);
    await assert.rejects(f.runner()(event), /absent, ambiguous or changed/);
    assert.equal(f.posts(), 1);
  }
});

test('invalid source, empty Descriptif, rich metadata and conversion failures have no side effects', async () => {
  for (const sourceChange of [
    { id: 43 }, { listId: 'other' }, { createdUtc: '2026-10-05T17:31:00Z' },
    { description: '' }, { description: null }, { richText: undefined }, { richText: true }
  ]) {
    const f = fixture();
    Object.assign(f.source, sourceChange);
    await assert.rejects(f.runner()(event));
    assert.equal(f.records.size, 0);
    assert.equal(f.posts(), 0);
  }
  const f = fixture();
  f.source.richText = true;
  await assert.rejects(f.runner({ htmlToText: async () => '' })(event), /empty text/);
  assert.equal(f.records.size, 0);
});

test('rich text uses approved conversion while the original field remains unchanged', async () => {
  const f = fixture();
  f.source.description = '<p>Question &amp; details</p>';
  f.source.richText = true;
  await f.runner({ htmlToText: async html => {
    assert.equal(html, f.source.description);
    return 'Question & details';
  } })(event);
  assert.ok(f.comments[0].text.includes('\n\nQuestion & details\n\n'));
  assert.equal(f.source.description, '<p>Question &amp; details</p>');
});

test('complete native limit is measured including heading and marker; overflow never truncates', async () => {
  const f = fixture();
  const exactLength = `${HEADING}\n\n${f.source.description}\n\n[${keyFor(42)}]`.length;
  await assert.rejects(f.runner({ maxCommentLength: exactLength - 1 })(event), /exceeds/);
  assert.equal(f.records.size, 0);
  await f.runner({ maxCommentLength: exactLength })(event);
  assert.equal(f.comments[0].text.length, exactLength);
});

test('activation cutoff rejects historical/future events and wrong-list IDs before any reservation', async () => {
  const f = fixture();
  for (const badEvent of [
    { ...event, createdUtc: '2026-10-05T16:00:00Z' },
    { ...event, createdUtc: '2026-10-06T16:00:00Z' },
    { ...event, createdUtc: 'invalid' },
    { ...event, listId: 'other' }, { ...event, ticketId: -1 }
  ]) await assert.rejects(f.runner()(badEvent));
  assert.equal(f.records.size, 0);
  assert.throws(() => f.runner({ activationCutoffUtc: '2099-01-01' }), /disabled/);
  assert.throws(() => f.runner({ maxCommentLength: undefined }), /verified/);
});

test('marker without durable state and unavailable state both block copying', async () => {
  const f = fixture();
  f.comments.push({ id: '1', text: `[${keyFor(42)}]` });
  await assert.rejects(f.runner()(event), /without a ledger/);
  f.ledger.read = async () => { throw new Error('Ledger unavailable'); };
  await assert.rejects(f.runner()(event), /Ledger unavailable/);
  assert.equal(f.posts(), 0);
});

function restFixture() {
  const ledgerListId = '11111111-1111-1111-1111-111111111111';
  const requests = [];
  const rows = [];
  const comments = [];
  let unique = true;
  let foreignContinuation = false;
  const response = (body, status = 200, etag = '"4"') => ({ ok: status < 400, status, json: async () => body, headers: { get: () => etag } });
  const authenticatedFetch = async (url, init) => {
    requests.push({ url, ...init });
    assert.equal(init.retry, 'none');
    const parsed = new URL(url);
    const isLedger = url.includes(ledgerListId);
    const method = init.method || 'GET';
    if (url.includes('/fields/')) {
      if (url.includes("('Title')")) return response({ TypeAsString: 'Text', EnforceUniqueValues: unique, Indexed: true });
      if (url.includes("('Payload')")) return response({ TypeAsString: 'Note', RichText: false, AppendOnly: false });
      if (url.includes("('State')")) return response({ TypeAsString: 'Text' });
      return response({ TypeAsString: 'Note', RichText: false });
    }
    if (isLedger && /items\(1\)/.test(parsed.pathname)) {
      if (method === 'POST') {
        assert.equal(init.headers['IF-MATCH'], '"4"');
        Object.assign(rows[0], JSON.parse(init.body));
        return response({}, 204);
      }
      return response(rows[0]);
    }
    if (isLedger) {
      if (method === 'POST') {
        if (rows.length) return response({}, 409);
        rows.push({ Id: 1, ...JSON.parse(init.body) });
        return response(rows[0], 201);
      }
      return response({ value: rows });
    }
    if (parsed.pathname.endsWith('/comments')) {
      if (method === 'POST') {
        comments.push({ id: '7', ...JSON.parse(init.body) });
        return response(comments[0], 201);
      }
      if (foreignContinuation) return response({ value: [], 'odata.nextLink': 'https://evil.test/comments' });
      if (!parsed.searchParams.has('$skiptoken')) return response({ value: [], 'odata.nextLink': `${parsed.origin}${parsed.pathname}?$skiptoken=next` });
      return response({ value: comments });
    }
    return response({ Id: 42, Created: createdUtc, Descriptif: 'REST fixture "text"\n& café' });
  };
  return { ledgerListId, authenticatedFetch, requests, rows, comments, nonUnique: () => { unique = false; }, foreign: () => { foreignContinuation = true; } };
}

test('REST adapters persist unique state and native JSON-safe comments with complete pagination and ETag', async () => {
  const f = restFixture();
  const adapters = createSharePointAdapters(f);
  await adapters.preflight();
  const run = createInitialCommentRunner({ ...options, ...adapters });
  await run(event);
  await run(event);
  assert.equal(f.rows.length, 1);
  assert.equal(f.rows[0].State, 'Completed');
  assert.equal(f.comments.length, 1);
  assert.match(f.comments[0].text, /REST fixture "text"\n& café/);
  const writes = f.requests.filter(request => request.method === 'POST');
  assert.equal(writes.length, 3, 'reserve, native comment, completed state only');
  assert.ok(writes.every(request => request.url.includes(f.ledgerListId) || request.url.includes('/comments')));
  const record = JSON.parse(f.rows[0].Payload);
  assert.equal((await adapters.ledger.reserve(record.key, { ...record, state: 'Pending' })).created, false);
});

test('REST adapters fail closed without unique ledger and reject foreign pagination without sending credentials', async () => {
  const f = restFixture();
  const adapters = createSharePointAdapters(f);
  await assert.rejects(adapters.tickets.readTicket(42), /preflight/);
  f.nonUnique();
  await assert.rejects(adapters.preflight(), /unique indexed/);
  const safe = restFixture();
  const configured = createSharePointAdapters(safe);
  await configured.preflight();
  safe.foreign();
  await assert.rejects(configured.tickets.listComments(42), /pagination destination/);
  assert.ok(safe.requests.every(request => !request.url.includes('evil.test')));
});

test('REST completion refuses a changed snapshot before an ETag-protected state update', async () => {
  const f = restFixture();
  const adapters = createSharePointAdapters(f);
  await adapters.preflight();
  await createInitialCommentRunner({ ...options, ...adapters })(event);
  const count = f.requests.filter(request => request.method === 'POST').length;
  await assert.rejects(adapters.ledger.complete(keyFor(42), '7', 'Wrong snapshot'), /snapshot changed/);
  assert.equal(f.requests.filter(request => request.method === 'POST').length, count);
});
