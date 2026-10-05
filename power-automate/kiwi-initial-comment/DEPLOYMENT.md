# Initial Descriptif to native SharePoint comments

## Scope and actual deployment state

The integrated reference is committed on the coordinator branch as `6760ef9`
(with the preceding runtime and deployment commits). The live agent reply
cadence was separately reduced to one minute and confirmed after a server reload.
The initial-description copy is **not deployed or activated**. Native import
offers a Dataverse solution or legacy package, not a raw workflow-definition JSON.
The existing private solution export contains only the agent-reply and Planner
resources; importing it does not install this new flow. Do not replace either
existing resource with this definition. A genuine new cloud-flow resource,
mapped connections and a restricted ledger must be provisioned before activation.
No ledger, import package or live description comment was created in this task.

The clarified request is to copy the existing **Descriptif** into the ticket's native
SharePoint comments automatically by default, alongside existing intake/reply flows.
This is **not** ingestion of inbound email replies, an agent's `Reponse au demandeur`
field, or `TicketExchanges`.

`initial-comment-runner.cjs` and `sharepoint-adapters.cjs` implement the guarded copy
with injected authenticated HTTP and durable state. They are **not an imported cloud
flow, an installed production service, or part of the SPFx package**. No tenant
configuration, initial comments, emails, source fields or Planner state have been
changed while implementing this reference. Do not infer runtime deployment from tests.

`operational-definition.json` now supplies the native workflow definition, generated
deterministically by `build-definition.cjs`. It uses the verified
`shared_sharepointonline/HttpRequest` and `shared_conversionservice/HtmlToText` action
shapes, an existing supported Recurrence trigger, and no custom Node connector.
It is executable workflow content **not a fabricated import package**: deploy it only
through a real authorized solution/flow resource with mapped connections. Defaults
remain cutoff 2099, limit 0 and an empty ledger GUID; it cannot process tickets as shipped.

### Native definition-specific admission and limits

The supplied JSON uses **one-minute serial polling**, rather than inventing an
unverified SharePoint event-trigger export schema. It enumerates tickets created
at/after the deployment cutoff, re-reads current Descriptif and the ledger, and thus
also sees email descriptions filled after creation. It never enumerates pre-cutoff
tickets or imports mailbox messages. Completed keys are checked, not reposted.
If adapting to the designer's created-or-modified trigger, preserve all safeguards
and provide its genuine trigger export; do not combine both enabled implementations.

The source query admits at most **100 post-cutoff tickets**. A 101st row or any source
continuation fails before processing, not silently truncates. This version requires
source pagination/partitioning before that capacity is reached; resetting the cutoff
or deleting ledger rows is **not** a safe capacity workaround. Each comment enumeration
has a maximum of 100 pages, strict same-site/item continuation checks and a visible
failure when another page remains. Control nesting is at most eight. Terminate actions
are outside Foreach/Until; variable increments use Compose before SetVariable.

The entire run fails visibly on invalid input, empty/not-yet-finalized descriptions,
uncertain writes or readback mismatch. An empty early email item has no reservation,
so a later poll may admit it when its description is populated. Such a failed item
blocks later items in that run; this bounded workflow is not a durable per-item retry
queue. A Pending marker missing from comments blocks for operator review and never
automatically reposts. A reserve timeout/conflict authorizes only a later reconciliation.
Native POST success followed by failure to save Completed is also readback-only recovery.
All HTTP actions have retry `none`; no source item, Teams exchange or Planner write exists.

HTTP/conversion inputs/outputs are secured in the definition. Variable and Compose
history may contain private description snapshots; restrict flow-run access as well
as ledger permissions. Do not claim every native run value is content-free.

## Behavior

For each **new item created** in the existing `EuropaTickets` list, a separately
configured handler invokes the runner once its description is available. Once deployed, every admitted creation event
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
3. Prefer a separate native Power Automate **When an item is created or modified**
   handler for that exact list, with concurrency 1. Gate on original Created at/after
   the cutoff and on a nonempty finalized Descriptif. This covers both immediate
   form intake and the email flow that fills Descriptif after initial item creation.
   Do not copy the title-only intermediate email item. Use the native action plan
   below with existing SharePoint and Content Conversion connections; no Node host
   or mailbox subscription is required. Alternatively, an approved Node 22 handler
   may use the tested runner directly. This directory is not a Power Automate import ZIP.
4. Configure an activation cutoff at deployment UTC. Events created before it are
   rejected: no historical scan or backfill is enabled. A future cutoff disables
   startup. Match event `Created` to stored `Created`; do not substitute Modified.
5. Instantiate `createSharePointAdapters({ authenticatedFetch, ledgerListId })`, await
   `preflight()`, then construct `createInitialCommentRunner` with its `tickets` and
   `ledger`, `activationCutoffUtc`, `maxCommentLength`, and any approved `htmlToText`.
   Call it with `{ listId, ticketId, createdUtc }` for each creation event.
   Surface rejected promises in secured job/run error reporting; never acknowledge an
   unsuccessful copy as successful. No inbox subscription is needed.
6. Do not create a test ticket without separate permission: normal intake can send
   emails. Otherwise wait for the next real ticket. Verify: Descriptif
   unchanged; exactly one native comment; ledger Completed with that comment ID.
   Redeliver the same creation event and confirm no second comment. Verify a
   failed/uncertain POST remains visibly Pending without automatic retransmission.
   Re-read saved configuration and server comment/ledger state before claiming
   automatic runtime delivery. Do not test by replaying a real email.

Existing items need a separately approved bounded backfill plan with an explicit item
set, comment-marker checks, and the same ledger safeguards. This reference deliberately
does not enable one implicitly.

## Native Power Automate authoring plan (preferred deployment)

Create **Kiwi - Descriptif initial dans les commentaires** disabled first. Reuse the
existing SharePoint connection and, only for rich Descriptif, Content Conversion.
No Office 365 mailbox, Teams, Outlook or Planner connector is involved. The separate
ledger is needed because posting a native comment does not provide an idempotency key;
putting state in the source ticket instead would trigger its existing update flows.
Keep the flow's trigger and every loop concurrency at 1. Disable action retries for
all writes. Secure inputs/outputs containing Descriptif, converted text or ledger Payload.

Configure Compose values `Activation_cutoff_UTC` (sentinel
`2099-12-31T00:00:00Z` until activation), `Verified_comment_limit` (0 until verified),
`Source_list_GUID` and `Ledger_list_GUID`. Validate cutoff is not future and limit is
positive before processing. The trigger is SharePoint **When an item is created or
modified** on the source GUID. Do not duplicate or edit the existing intake flow.
Admit only items whose `Created` is at/after cutoff and not future. Read the current
item through REST, comparing ID and Created with the trigger; use the current Descriptif
so email enrichment events can succeed after the initial empty-field run.

Build the following actions with the existing **Send an HTTP request to SharePoint**
action (`shared_sharepointonline` / `HttpRequest`). Relative URIs below use
`/_api/web/lists(guid'<GUID>')`, not display names. Reads accept
`application/json;odata=minimalmetadata`; writes use
`Content-Type: application/json;odata=nometadata`.

| Stage | Native actions and decision |
| --- | --- |
| Preflight | GET ledger `fields/getbyinternalnameortitle('Title')`, `'Payload'` and `'State'`. Verify the table above, including Payload.AppendOnly false. Fail visibly before writes if not valid. GET source item selecting Id,Created,Descriptif and source field metadata via `fields/getbyinternalnameortitle('Descriptif')`. |
| Copy key | Compose `concat('kiwi-initial-description:f673fe2d-9733-46dd-9afe-4bf614c99202:',string(triggerBody()?['ID']),':v1')`. Marker is `concat('[',outputs('Copy_key'),']')`. It is independent of version, Modified, agent message ID or description edits. |
| Find ledger | GET ledger `items?$select=Id,Title,State,Payload&$filter=Title eq '<copy key>'&$top=2`. Fail if more than one row. For a row, parse Payload using `json(...)` and verify key/item/state. Go directly to readback/reconciliation, never to comment POST. |
| Prepare text, new key only | For plain Text/Note use unchanged Descriptif. For a rich Note use Content Conversion **Html to text** on Descriptif. Require nonempty converted text. Compose heading + LF LF + text + LF LF + marker. Check the length of this full value against Verified_comment_limit; fail without truncation when too long. |
| Check existing comments | GET source `items(<ID>)/comments?$top=100`; follow every nextLink. Check for marker without ledger before reserving. If present, fail for operator review rather than posting again. |
| Reserve | POST ledger `items` with Title=copy key, State=`Pending`, Payload=JSON string containing key, numeric ticketId, state=`Pending`, and full text. Only the branch where this unique create **Succeeded** may proceed to comment POST. |
| Concurrent/uncertain reserve | If create fails/times out, re-read ledger. A matching row authorizes readback only, not a POST. If absent or malformed, terminate visibly. Do not use a failed create branch as a retry path. |
| Native comment | POST source `items(<ID>)/comments` with body object `setProperty(json('{}'),'text',outputs('Complete_comment_text'))`. Retry policy **None**. This JSON-safe object avoids breaking on quotes, line breaks or HTML characters in Descriptif. |
| Readback | Enumerate source comments again, including every nextLink. Require exactly one comment with the marker, exact saved text, and nonempty id. A pending run may complete using this readback even if its earlier POST response was lost. |
| Complete | GET the ledger row with minimalmetadata; require unchanged key/text and an ETag. POST that ledger item with `X-HTTP-Method: MERGE`, `IF-MATCH` from response header ETag or body `odata.etag`/`@odata.etag`, and updated State/Payload=`Completed` plus string commentId. Never use `IF-MATCH: *`. |
| Missing/changed comment | If no exact comment, several markers, altered text or wrong ID exists, terminate visibly and retain state. Never reset or delete the ledger; never send another comment automatically. |

For JSON snapshots, compose an object with `setProperty` calls and then `string(...)`;
do not concatenate requester text into JSON syntax. For comment enumeration, initialize
an array of matching comments and a continuation variable, loop sequentially, and follow
`coalesce(body('Read_comments')?['odata.nextLink'],
body('Read_comments')?['@odata.nextLink'])`. Validate every continuation stays on the
same SharePoint site and item-comment collection before using it. Fail on a repeated
link or a page bound reached with a continuation still present; never declare success
from a partial page. The Node fixtures exercise equivalent full enumeration and
cross-origin rejection.

In the existing-ledger branch, use the **saved** Payload.text, not today's Descriptif.
Completed rows still require exact comment ID/text readback. Pending rows with no
visible comment remain Pending and visibly fail; do not turn a readback failure into
an automatic POST retry. At most one comment creation attempt is authorized per key.

Activation must be verified in the designer and after a server reload/export. A real
new approved form submission and a finalized-description creation from email intake
are separate runtime cases; do not claim the email case from a form-only test. Tests
must not replay received mail. If the email path has no safe approved new test, report
that runtime case as unverified while retaining its trigger configuration.

### Comment limit evidence

[This SharePoint developer walkthrough](https://beaucameron.com/2021/01/18/add-comments-to-sharepoint-list-items-using-the-rest-api/)
documents the native POST with a `text` body and connection-user authorship.
[This Microsoft Community Hub report](https://techcommunity.microsoft.com/discussions/sharepoint_general/sharepoint-item-comment-size/3822577)
confirms a native `comment too long` failure, but the retrieved post **does not establish
a numeric maximum**. Do not describe a commonly repeated 1,000-character value as
verified Microsoft documentation or as a measured limit in this tenant.

The deployment owner must verify a supported limit or explicitly approve a conservative
complete-comment cap and record it as a local policy, not a proven SharePoint maximum.
Leave the activation parameter at 0 until then. Inspecting a form's actual input
maxlength, if present, is read-only evidence; otherwise a boundary POST needs separate
live-test authorization and must not be attempted against an existing private ticket.
The tests' value of 1,000 is a **fixture configuration only**. Any server rejection at
an admitted size remains a visible Pending failure, never a truncated or replayed comment.
