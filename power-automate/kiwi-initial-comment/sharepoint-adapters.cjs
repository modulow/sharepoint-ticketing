'use strict';

const { TICKETS_LIST_ID } = require('./initial-comment-runner.cjs');
const SITE_URL = 'https://europarl.sharepoint.com/sites/learn.IT-Kiwi';
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function createSharePointAdapters({ authenticatedFetch, ledgerListId }) {
  if (typeof authenticatedFetch !== 'function') throw new Error('An authorized SharePoint HTTP adapter is required.');
  if (!guid.test(ledgerListId || '') || ledgerListId.toLowerCase() === TICKETS_LIST_ID) {
    throw new Error('A separate configured durable ledger list GUID is required.');
  }
  const source = `${SITE_URL}/_api/web/lists(guid'${TICKETS_LIST_ID}')`;
  const ledgerUrl = `${SITE_URL}/_api/web/lists(guid'${ledgerListId}')`;
  let ready = false;

  function safeUrl(url, collection) {
    const target = new URL(url, `${SITE_URL}/`);
    if (target.origin !== new URL(SITE_URL).origin || target.pathname !== new URL(collection).pathname) {
      throw new Error('Unexpected SharePoint pagination destination.');
    }
    return target.href;
  }

  async function request(url, options = {}) {
    const response = await authenticatedFetch(url, {
      ...options,
      headers: { Accept: 'application/json;odata=minimalmetadata', 'Content-Type': 'application/json;odata=nometadata', ...options.headers },
      retry: 'none'
    });
    if (!response.ok) throw new Error(`SharePoint HTTP ${response.status}; inspect the secured run details.`);
    if (response.status === 204) return {};
    const body = await response.json();
    return { body, etag: response.headers.get('ETag') || body['odata.etag'] || body['@odata.etag'] };
  }

  async function collection(url) {
    const result = [];
    const seen = new Set();
    let next = url;
    while (next) {
      next = safeUrl(next, url);
      if (seen.has(next)) throw new Error('Repeated SharePoint continuation; enumeration is incomplete.');
      seen.add(next);
      const { body } = await request(next);
      if (!body || !Array.isArray(body.value)) throw new Error('Invalid SharePoint collection response.');
      result.push(...body.value);
      next = body['odata.nextLink'] || body['@odata.nextLink'];
    }
    return result;
  }

  function ticketId(id) {
    if (!Number.isSafeInteger(id) || id < 1) throw new Error('Invalid ticket ID.');
    return id;
  }

  function checked() {
    if (!ready) throw new Error('Run SharePoint ledger preflight before copying.');
  }

  function decode(row) {
    const record = JSON.parse(row.Payload);
    if (!record || record.key !== row.Title || record.state !== row.State) throw new Error('Ledger payload and identity/state disagree.');
    return { record, id: row.Id };
  }

  async function readRow(key) {
    checked();
    if (typeof key !== 'string' || key.length > 255) throw new Error('Invalid ledger key.');
    const filter = encodeURIComponent(`Title eq '${key.replace(/'/g, "''")}'`);
    const rows = await collection(`${ledgerUrl}/items?$select=Id,Title,State,Payload&$filter=${filter}&$top=2`);
    if (rows.length > 1) throw new Error('Ledger uniqueness violated; operator review required.');
    return rows.length ? decode(rows[0]) : undefined;
  }

  return {
    async preflight() {
      ready = false;
      const [{ body: title }, { body: payload }, { body: state }] = await Promise.all(
        ['Title', 'Payload', 'State'].map(name => request(`${ledgerUrl}/fields/getbyinternalnameortitle('${name}')`))
      );
      if (!title || title.TypeAsString !== 'Text' || title.EnforceUniqueValues !== true || title.Indexed !== true ||
          !payload || payload.TypeAsString !== 'Note' || payload.RichText !== false || payload.AppendOnly !== false ||
          !state || state.TypeAsString !== 'Text') {
        throw new Error('Ledger requires unique indexed Title, plain non-append Note Payload and Text State.');
      }
      ready = true;
    },
    tickets: {
      async readTicket(id) {
        checked();
        ticketId(id);
        const [{ body: item }, { body: field }] = await Promise.all([
          request(`${source}/items(${id})?$select=Id,Created,Descriptif`),
          request(`${source}/fields/getbyinternalnameortitle('Descriptif')`)
        ]);
        if (!['Text', 'Note'].includes(field.TypeAsString)) throw new Error('Descriptif must be a text field.');
        if (field.TypeAsString === 'Note' && typeof field.RichText !== 'boolean') throw new Error('Missing Descriptif rich-text metadata.');
        return { id: item.Id, listId: TICKETS_LIST_ID, createdUtc: item.Created, description: item.Descriptif, richText: field.TypeAsString === 'Note' ? field.RichText : false };
      },
      async listComments(id) {
        checked();
        const comments = await collection(`${source}/items(${ticketId(id)})/comments?$top=100`);
        return comments.map(comment => ({ id: comment.id, text: comment.text }));
      },
      async postComment(id, text) {
        checked();
        await request(`${source}/items(${ticketId(id)})/comments`, { method: 'POST', body: JSON.stringify({ text }) });
      }
    },
    ledger: {
      async read(key) {
        return (await readRow(key))?.record;
      },
      async reserve(key, record) {
        checked();
        if (key !== record.key || record.state !== 'Pending') throw new Error('Invalid initial-comment reservation.');
        try {
          await request(`${ledgerUrl}/items`, {
            method: 'POST',
            body: JSON.stringify({ Title: key, State: 'Pending', Payload: JSON.stringify(record) })
          });
          return { created: true, record };
        } catch (cause) {
          // A duplicate or uncertain reservation must never authorize another comment POST.
          const existing = await readRow(key);
          if (!existing) throw cause;
          return { created: false, record: existing.record };
        }
      },
      async complete(key, commentId, expectedText) {
        const row = await readRow(key);
        if (!row) throw new Error('Pending ledger record disappeared.');
        const { body, etag } = await request(`${ledgerUrl}/items(${row.id})?$select=Title,State,Payload`);
        const current = decode({ ...body, Id: row.id }).record;
        if (current.key !== key || current.text !== expectedText) throw new Error('Ledger snapshot changed before completion.');
        if (current.state === 'Completed') {
          if (current.commentId !== commentId) throw new Error('Completed ledger comment identity conflict.');
          return;
        }
        if (current.state !== 'Pending' || typeof etag !== 'string' || !etag || etag === '*') {
          throw new Error('Invalid pending state or missing ledger ETag.');
        }
        await request(`${ledgerUrl}/items(${row.id})`, {
          method: 'POST',
          headers: { 'IF-MATCH': etag, 'X-HTTP-Method': 'MERGE' },
          body: JSON.stringify({ State: 'Completed', Payload: JSON.stringify({ ...current, state: 'Completed', commentId }) })
        });
      }
    }
  };
}

module.exports = { SITE_URL, createSharePointAdapters };
