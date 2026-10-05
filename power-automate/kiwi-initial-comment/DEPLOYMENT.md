# Initial Descriptif to native SharePoint comments

## Scope and actual deployment state

The clarified request is to copy the existing **Descriptif** into the ticket's native
SharePoint comments automatically by default, alongside existing intake/reply flows.
This is **not** ingestion of inbound email replies, an agent's `Reponse au demandeur`
field, or `TicketExchanges`.

`initial-comment-runner.cjs` and `sharepoint-adapters.cjs` implement the guarded copy
with injected authenticated HTTP and durable state. They are **not an imported cloud
flow, an installed production service, or part of the SPFx package**. No tenant
configuration, initial comments, emails, source fields or Planner state have been
changed while implementing this reference. Do not infer runtime deployment from tests.

## Behavior

On each **new item created** in the existing `EuropaTickets` list, a separately
configured handler invokes the runner. Once deployed, every admitted creation event
is copied without an opt-in flag or dependency on an agent's response cadence.
The creation event supplies list GUID, numeric item ID and original `Created` timestamp.
The runner verifies those against the stored item, reads `Descriptif`, and posts:

```text
Learn IT Helpdesk - Descriptif initial du demandeur

<full description text>

[kiwi-initial-description:<list GUID>:<item ID>:v1]
```

The source field remains intact. No source-item MERGE, reply dispatch, assignment
change, notification replay or Planner request is made. Native comments are authored
by the authorized SharePoint connection account; the heading describes the source,
not an impersonated requester. No mention payload is created.

The first admitted snapshot is retained in a durable ledger. Later changes to
Descriptif do not append another initial comment. Delayed creation-event processing
reads the description as it exists at that first handling, not reconstructed item
history. If exact creation-time text is required, capture it in the approved creation
event before any enrichment/edit; do not represent the current read as historical proof.
For rich-text Descriptif, configure an approved HTML-to-text converter (for example,
the existing Content Conversion service). Store the full converted text, never raw HTML
rendered as markup. Plain-text descriptions preserve their text, line breaks and Unicode.
An empty field/conversion, unverified metadata, or complete comment exceeding the
configured tenant-verified limit fails explicitly **before reservation or comment POST**.
No truncation, splitting, replacement description or success-shaped fallback is used.
This is important for the existing email intake that initially writes only a title:
do not treat that empty initial field as a successfully copied description.

## Durable deduplication and uncertain outcomes

Use a **separate dedicated ledger list**, not the Teams exchange ledger. Provision:

| Internal name | Required schema |
| --- | --- |
| `Title` | Single-line Text, indexed, enforce unique values; immutable copy key |
| `State` | Single-line Text; `Pending` or `Completed` written by the service |
| `Payload` | Plain multi-line Note, rich text off, append-only off; JSON snapshot |

The ledger contains the full comment snapshot and therefore private requester text.
Restrict access to the service and authorized operators. Do not export it into Git or
log it publicly. The HTTP adapter must supply approved authentication and write digest
where needed; **never place tokens, mailbox contents or connection IDs in source**.
Preflight checks uniqueness/indexing and field types before any ticket copy.

The unique key is fixed per list/item, independent of event retry or description edits.
An atomic create reserves `Pending` **before** the single comment POST. Concurrent
duplicates do not authorize another POST. The adapter requests no retries, and the
authenticated wrapper must honor this for all writes.

After the POST, enumerate all native comment pages and require exactly one comment
with the saved marker, exact snapshot text and a usable comment ID. Only then mark the
ledger `Completed` using its ETag. Completion failures are visible and recoverable by
readback alone. Later invocations still verify the saved comment; deletion, editing,
ambiguous markers or missing state is reported, not repaired by another POST.

A crash after reservation but before POST and a timeout after a server-accepted POST
are indistinguishable until readback. For `Pending`, a later invocation **only reads
comments and reconciles**. If no exact marked comment is visible, it fails visibly
without another POST. This deliberately sacrifices automatic retry to avoid duplicate
comments under uncertain delivery; it is not an exactly-once delivery claim.

Do not remove a ledger row, reset `TicketExchanges`, replay an email or delete a comment
to recover. Inspect secured request history and comments first. If a POST was proven
never accepted, a separately authorized operator may perform the missing comment
once and reconcile the preserved Pending record. There is no automatic reset API.

## Exact deployment steps

1. Leave existing intake, agent reply, notification and Teams mapping flows unchanged.
   Keep Planner paused. Use the existing site
   `https://europarl.sharepoint.com/sites/learn.IT-Kiwi`, source list GUID
   `f673fe2d-9733-46dd-9afe-4bf614c99202`; do not rename `Learn-IT-Tickets` or
   `Lists/EuropaTickets`.
2. Provision the restricted ledger above and supply **its actual GUID**. Confirm native
   comments are enabled and the connection may read the source, enumerate/post comments
   and create/update ledger records. Confirm the actual per-comment length limit
   in this tenant and supply it explicitly; there is no guessed production default.
   Include the heading and marker in the measured limit.
3. Configure a separate new-item handler for that exact list, with concurrency 1.
   Route the creation event to the runner in an approved Node 22 service, or implement
   the same action ordering in a genuinely exported cloud flow. This directory is
   not a Power Automate import ZIP; authentication, event subscription and hosting
   must be configured by the deployment owner.
4. Configure an activation cutoff at deployment UTC. Events created before it are
   rejected: no historical scan or backfill is enabled. A future cutoff disables
   startup. Match event `Created` to stored `Created`; do not substitute Modified.
5. Instantiate `createSharePointAdapters({ authenticatedFetch, ledgerListId })`, await
   `preflight()`, then construct `createInitialCommentRunner` with its `tickets` and
   `ledger`, `activationCutoffUtc`, `maxCommentLength`, and any approved `htmlToText`.
   Call it with `{ listId, ticketId, createdUtc }` for each creation event.
   Surface rejected promises in secured job/run error reporting; never acknowledge an
   unsuccessful copy as successful. No inbox subscription is needed.
6. With separate permission for a labelled live test ticket, verify: Descriptif
   unchanged; exactly one native comment; ledger Completed with that comment ID.
   Redeliver the same creation event and confirm no second comment. Verify a
   failed/uncertain POST remains visibly Pending without automatic retransmission.
   Re-read saved configuration and server comment/ledger state before claiming
   automatic runtime delivery. Do not test by replaying a real email.

Existing items need a separately approved bounded backfill plan with an explicit item
set, comment-marker checks, and the same ledger safeguards. This reference deliberately
does not enable one implicitly.
