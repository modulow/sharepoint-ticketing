# Kiwi Planner ticket synchronization

This directory contains a non-secret workflow contract, reconciliation model, executable
Graph client and sync orchestration modules, fixture tests, and this deployment checklist. It is **not an
importable Power Automate package** and contains no tenant connections, plan ID, bucket
IDs, list IDs for new state lists, or credentials. Create the flows and live resources
only through the approved tenant process.

## Live accessibility inspection (2026-10-05)

Windows UI Automation can operate the user's authenticated Chrome through ordinary
accessible controls; browser cookie/token extraction is neither needed nor permitted.
The initial inspection of Power Automate and native SharePoint settings was read-only.
No flow was saved/tested, no field was created, and no ticket/card was changed.

An existing enabled **Kiwi - Sync SharePoint tickets to Planner** flow targets the
**Kiwi Tickets** plan and runs every 15 minutes. This is a separate live implementation,
not a deployment of the Node modules in this directory. Its observed configuration:

- `Get items` orders by `Created desc` and requests 5,000 items. This does not establish
  newest assignment-change ranking or complete pagination.
- Create/update task actions map an `[SP#<ID>] <subject>` title and bucket, but no
  native assignee option was configured in the inspected actions.
- Both card details and source-edit references already use dynamic ticket fields,
  rather than a constant generic description. Details include requester, assignee,
  dates, source, description, requester reply and Teams reply/thread fields. This
  inspection does not prove attachment/full exchange history completeness or successful
  end-to-end execution.
- Native `EuropaTickets` settings expose title, assignee, forwarded sender, description,
  requester, sent date, requester reply, Teams/thread/source fields and system columns.
  No status, priority, category, due-date or `PlannerAssignedAtUtc` columns were present.

Do not populate missing source options with invented values or add new ticket workflow
columns without an approved schema decision. Existing generic cards still require
positive source-link correlation before migration; their title alone is not ownership
proof. A connected browser now permits inspection and UI work, but does not make this
existing flow conform to the approved assignment/history/ownership requirements.
No private ticket content or tenant export was retained in this repository.

### Authorized schema addition (2026-10-05)

After the user explicitly authorized the four new workflow columns, this session
created them in the existing `EuropaTickets` list through authenticated Chrome
accessibility controls and verified each saved field-settings link:

| Display label | Internal name | Type / choices |
| --- | --- | --- |
| Statut | `Status` | Choice: New, In progress, Waiting, Resolved, Closed |
| Priorité | `Priority` | Choice: Low, Normal, High, Critical |
| Catégorie | `Category` | Choice: Hardware, Software, Access, Network, Telephony, Other |
| Échéance | `DueDate` | Date and time |

These choices follow the existing ticket model. All four fields are optional, without
a default value; no existing ticket was classified or given a deadline. The three
choice fields do not permit arbitrary fill-in values. DueDate was verified to include
time and have no default date. The English internal names are preserved under the
French display labels and are already recognized by `TicketSchema.ts`.

At this stage, the existing Planner flow **had not yet been changed to synchronize these fields**.
The new designer's Code View was inspected as a possible faster authoring path, but
its accessibility value did not expose complete parseable action JSON. No partial
JSON was written or saved. Advanced options were inspected, then the designer was
reloaded without saving. Status/priority remain unset on old tickets and must not be
turned into invented source values. Native Planner priority is not exposed in the
currently inspected task-update action; a supported action/version and safe field
mapping are still required before saving the live flow.

### Live card-details mapping update (2026-10-05)

On the user's further authorization, Windows accessibility was used to edit the
existing **Kiwi - Sync SharePoint tickets to Planner** flow through its expression
editor, not by replacing incomplete Code View JSON. Both `Update task details`
(creation branch) and `Update task details 1` (existing-card branch) retain their
previous ticket/body/reply/source-link content and append:

- `Status` choice `Value`, labelled Status;
- `Priority` choice `Value`, labelled Priority;
- `Category` choice `Value`, labelled Category;
- `DueDate`, labelled Due date.

Null values are displayed as `Not set`; no existing ticket is classified automatically.
The complete expressions were checked through accessible token names after applying
them. Power Automate's flow checker reported **0 errors and 0 warnings** and the save
completed with its ready-to-use confirmation.
After a full browser reload, all four field references were independently verified in
both saved action expressions, confirming persistence beyond the editor session.

This first saved change updated **card descriptions only**. Native Planner priority, progress,
due-date and assignments were not changed. No manual test run was triggered and no
end-to-end card update is claimed before a successful scheduled run/card check.
Assignment timestamp, full history/attachments, ownership and pagination gaps in the
existing flow remain separate implementation work.

### English labels and native options (2026-10-05)

At the user's request, the four live SharePoint display labels were renamed to
**Status**, **Priority**, **Category**, and **Due date**. Saved settings links were
verified through accessibility. Internal names, choice values, optionality and
no-default behavior are unchanged. No existing ticket was backfilled. Microsoft
account/browser language and unrelated legacy labels were not changed.

The existing live flow was then edited through the supported connector's accessible
expression editor and saved with its ready-to-use confirmation. The flow checker
reported **0 errors and 0 warnings**. After a full browser reload, all five native
field expressions and the new action's task-ID expression were independently
verified through their complete accessible token names. These mappings are distinct from the Graph
reference implementation below:

| Action | Saved native mapping |
| --- | --- |
| `Create a task` | Due date from `DueDate`; assigned user from `Assigned_x0020_to.Email` |
| `Apply ticket progress to new task` (new Planner V2 update action) | ID from `Create_a_task`; percent complete from source status |
| `Update a task (V2)` (existing-card branch) | Due date from `DueDate`; percent complete from source status |

Resolved/Closed map to 100, In progress to 50, and New/Waiting to 0. A missing status
preserves the existing card's `percentComplete`; a new card with no status starts at
0. Empty DueDate is supplied as null. Runtime date clearing remains unverified.
The create connector explicitly supports email addresses for assigned users; no
SharePoint numeric user ID is used as an Entra identity.

**Native priority is not configured.** The available documented `UpdateTask_V2`
and `UpdateTask_V3` actions do not expose it. A priority-capable, approved connector
version or Graph connection is still required; no new API connection or policy
bypass was attempted. Priority and category remain in both card descriptions.
Shared Planner label names were not overwritten to represent ticket categories.
Connector capability reference: [Microsoft Planner connector actions](https://learn.microsoft.com/en-us/connectors/planner/).

**Existing-card reassignment is not configured.** An exploratory assignment updater
was removed before saving rather than accumulate stale assignees. Safe synchronization
still needs validated current-assignment IDs, old-assignee removal and unassignment
handling. No existing task was manually reassigned.

Saving configuration is not proof of a successful scheduled run or resulting cards.
No manual test run or private ticket edit was performed in this update. The existing
15-minute schedule remains enabled; scheduled execution may apply saved mappings.
Assignment-change ranking, complete history/attachments, state/ownership, pagination,
and safe cleanup remain outstanding as recorded above.

## Solution-based deployment

Use an exported Power Platform solution for the live cloud flow, not the reference
blueprint JSON or Node modules. The existing unmanaged **KiwiHelpdeskAutomations**
solution now includes the existing **Kiwi - Sync SharePoint tickets to Planner**
flow and its generated Planner connection reference, alongside the previously
included **Kiwi - Teams replies to requester** flow and connection references.
The existing Planner flow was added from outside Dataverse; no copy was created and
no disabled content/API flow was added.

On 2026-10-05, **KiwiHelpdeskAutomations 1.0.0.11** was exported successfully and
downloaded locally as `KiwiHelpdeskAutomations_1_0_0_11.zip` (12,399 bytes). Archive
validation confirmed `Managed=0`, version `1.0.0.11`, exactly the two intended
workflow JSON files, and the current Planner action/source-field mappings.
The solution checker completed with zero issues on the same components during the
initial export; the recovery unmanaged export did not rerun it.
SHA-256: `AABEDAA57E637EA836483F5F18D530F85B20016987B4CF6BB9FCB339127C6C35`.
The ZIP remains in the browser's local Downloads folder, not in Git. No destination
import or activation was performed.

The user explicitly selected an **unmanaged** export so that the imported flows remain
editable. Keep the authoring solution unmanaged too. Unmanaged import merges components
into the destination's unmanaged customization layer; it does not provide the managed
upgrade/uninstall boundary normally used for production ALM. Review existing destination
components and take a backup before importing or overwriting them. Do not use the
initial managed export for this user-directed deployment. Keep raw solution exports
outside this public repository:
definitions can contain tenant URLs, identifiers, connection metadata and literal
configuration even though the authenticated connection itself is not portable.

Before import, verify the package's intended flows and dependencies, approve its
data audience, and configure destination-specific site/list/group/plan settings.
The current flow still has source-environment settings; solution packaging alone
does not parameterize these or fix its incomplete ranking/reassignment/priority logic.
Map every connection reference to an authorized destination connection (SharePoint,
Planner, Teams and other dependencies), with required access and tenant policies.
The four SharePoint columns, lists, Planner plan/buckets and their contents are
external resources and are not provisioned by this flow solution export.
Import can automatically enable flows that were enabled at export once connection
references resolve. Arrange a controlled import with activation suppressed or
connections left unbound until resource identities and definitions are reviewed;
do not assume an import is inert. Keep destination flows disabled until controlled
acceptance is approved. Import/activation in a destination environment is a separate
operation, not performed by exporting.

Use the official [solution export](https://learn.microsoft.com/en-us/power-automate/export-flow-solution)
and [solution import](https://learn.microsoft.com/en-us/power-automate/import-flow-solution)
procedures. The solution checker and export success do not replace runtime checks
or prove compliance with the per-agent top-20 contract.

## Existing-card refresh safeguards (2026-10-05)

The user requested updating existing cards in place. Inspection of the exported live
definition showed title-only matching and cleanup: the flow selected the first
`[SP#<ID>]` task and deleted similarly titled tasks outside `DesiredPrefixes`.
Neither establishes ownership sufficiently for destructive cleanup.

An unmanaged solution update, version **1.0.0.12**, was prepared privately from the
verified export, retaining the existing flow identity and all original update payloads.
The existing-card branch now requires exactly one title candidate, reads its details,
and requires an exact complete description line containing that ticket's SharePoint
edit URL before updating it. CRLF and LF are supported; ticket ID 1 cannot match
ticket ID 10. Duplicate candidates or an unverified source link are left untouched,
with explicit `REFRESH_SKIPPED_DUPLICATE_MATCHES` or
`REFRESH_SKIPPED_SOURCE_LINK_MISMATCH` diagnostic actions in run history.
This positive correlation permits this bounded legacy refresh, not adoption for
future deletion. It is not a durable integration-owned marker/state migration.

The old deletion condition is now constant false. Automatic cleanup remains disabled
until ownership, complete source pagination and actual assignment ranking are implemented.
Cards outside the existing desired-ticket selection are retained, not deleted or
claimed refreshed. Creation behavior is unchanged; this is not delete-and-recreate.
Native priority and existing-card assignee synchronization remain unimplemented.

The local package parsed successfully and passed seven source-link guard fixtures.
The Planner flow was paused before import. Power Automate imported the solution with
an activation warning; the imported definition was then verified in the designer,
including its source guard and constant-false deletion token. The live flow checker
reported zero errors and warnings. The protected flow was explicitly re-enabled,
and Power Automate confirmed admission of a manual refresh run.

The manual run at **10:13 local time** completed successfully in **1 minute
24 seconds**. All **11 desired-ticket iterations** were independently checked in
the run viewer: the native task update and task-details update succeeded, creation
was skipped, and neither source-mismatch nor duplicate-match diagnostic was executed.
The deletion action was observed skipped and its deployed constant-false condition
prevents cleanup throughout this run. This confirms in-place connector writes to
11 existing cards, not merely a saved configuration. No ticket content or identities
were copied into the record. Native priority and reassignment were not part of these
writes; cards outside this desired set are not claimed refreshed.
The raw update package and original backup remain outside Git.
The unchanged **Kiwi - Teams replies to requester** flow was checked after import
and remains enabled; it was not manually run.

## Contract

- `workflow-blueprint.json` defines the confirmed behavior and required tenant schema.
- `planner-sync-core.cjs` is the deterministic reference model used by the repository
  tests. The cloud flows must preserve its ranking, task projection, marker, ownership,
  and no-truncation semantics; Power Automate does not execute this CommonJS file.
- `planner-graph-client.cjs` performs actual Graph reads and conditional task/details
  writes with an injected approved token provider. No credentials are bundled.
- `planner-sync-runner.cjs` runs the model against injected source/state/Graph adapters.
  It is not a scheduler, SharePoint adapter, OAuth login, or tenant provisioning script.
- The target group is Kiwi Team `435074fb-2e8d-4c67-b06a-0359ddc5a939`. The existing
  `EuropaTickets` and `TicketExchanges` list IDs are recorded in the blueprint.
- SharePoint is authoritative. The 15-minute recurring flow is one-way to Planner. It
  includes resolved/closed tickets, marks those Planner tasks complete, assigns each
  task to the corresponding approved agent, and removes only integration-owned Planner
  tasks that are outside the per-agent top 20.
- Cards include the source ticket fields, all attachment links, and TicketExchanges
  history. The ticket, attachment, and exchange links point back to SharePoint; edits
  are made there, not in Planner.

## Required resources and permissions

Before implementation in a tenant, verify the live Team/group, that all current members
are authorized for full ticket content, and that group membership is governed. Obtain
the separate approved agent roster with each user's Entra object ID, UPN, and display
name; do not derive the roster from display names or assume every group member is an
agent.

The required SharePoint-side resources are:

1. Add `PlannerAssignedAtUtc` (date/time, UTC) to `EuropaTickets` after the tenant
   operator verifies access, consent, and the data handling requirements.
2. Create a restricted `PlannerSyncAgents` list with unique `AgentEntraObjectId`,
   `AgentUPN`, `AgentDisplayName`, `PlannerBucketId`, and `Active`.
3. Create a restricted `PlannerSyncState` list with unique `SourceTicketId`,
   `AgentEntraObjectId`, `PlannerBucketId`, `PlannerTaskId`, `ManagedMarker`, and
   `LastSuccessfulSyncUtc`.
4. Create one event-triggered assignment timestamp flow and one scheduled synchronization
   flow. Ensure the approved owner can maintain them and their SharePoint/Planner
   connections. Confirm the required licensing and consent for every connector/API.

The flow connections need read access to ticket fields, attachment metadata and file
URLs, and all relevant `TicketExchanges` fields; write access to the timestamp and two
restricted state lists; and Planner rights to enumerate plan tasks/buckets, read and
update task details/references, assign tasks, create/update/delete integration-owned
tasks, and observe the target plan. Existing SPFx `GroupMember.Read.All` is not Planner
authorization. Microsoft Graph documents delegated `Tasks.ReadWrite` for plan, bucket,
and task writes (the creating user must be a target group member); app-only
`Tasks.ReadWrite.All` is tenant-wide and requires administrator consent. Prefer the
least-privilege approved connector flow and do not add Planner consent to the SPFx
package by default.

No email address, plan/bucket ID, SharePoint connection reference, OAuth secret, token,
or exported live-flow package belongs in this repository.

## Assignment timestamp capture and initial backfill

The event-triggered flow must use SharePoint's change token/version data to determine
that `Assigned_x0020_toId` actually changed. It must write that assignment event's
timestamp to `PlannerAssignedAtUtc`, clear the timestamp on unassignment, and avoid
writing repeatedly when its own timestamp update triggers another item-modified event.
Use concurrency control and compare timestamps so an older delayed event cannot replace
a newer assignment time. Confirm this behavior for SPFx edits, native list-form edits,
and every existing flow/automation that writes assignment.

For existing assignments, inspect version history and backfill only the most recent
version in which the assignee changed to the current assignee. If list versioning or
available history cannot prove the assignment time, leave the timestamp unset and hold
that ticket out of sync until its next observed assignment change. Never substitute
`Modified`, `Created`, or a migration time as a claimed assignment timestamp. Verify
that no assigned ticket lacking a valid timestamp can silently enter the top 20.

## Plan/bucket provisioning

The user has already created **kiwi tickets**. Bind that existing plan, not a new one.
Enumerate plans in the verified Kiwi group, select the exact plan ID, and stop if the
name is ambiguous or the supplied ID belongs to a different group. Never adopt generic
existing tasks by description or title alone: verify their source ticket and establish
an explicit approved mapping/marker first. Otherwise leave those tasks untouched.

Provision missing agent buckets once after validating the
roster, group membership, user licensing, and write permission. Save the verified plan
ID and exactly one bucket ID per authorized support agent in approved tenant
configuration and `PlannerSyncAgents`, including agents with zero assigned tickets.
Do not recreate the plan or buckets from the recurring flow. If a new agent is approved,
provision their bucket and roster row before the next sync; a missing or duplicated
bucket mapping must fail the run visibly.

Validate that Graph/Planner supports task `assignments`, `percentComplete`, bucket
changes, task-details updates, and `references` with the selected connector. If the
connector needs Graph HTTP calls, confirm licensing, authentication and admin consent
first. Use ETags/`If-Match` for updates and deletes. The actual edit form for each item
must be validated in the target site; do not assume that the generic intake URL edits
existing tickets.

### Ticket-specific cards and native Planner options

`buildDesiredTasks` now produces a `#<ID> - <subject>` title and labelled, readable
ticket details, rather than a generic description or a raw JSON card. `buildGraphPayloads`
produces distinct Graph task and task-details bodies:

| Source option | Planner field |
| --- | --- |
| Assignee | `assignments` plus that agent's `bucketId` |
| Priority | `priority`: Critical 1, High 3, Normal 5, Low 9 |
| Status | `percentComplete`: resolved/closed 100, in progress 50, new/waiting 0 |
| Due date | `dueDateTime`, preserving source timezone; null clears an old date |
| Ticket ID and subject | `title`, maximum 255 characters; oversize fails |
| Category, requester, exact status, resolution and extra fields | Labelled description (Planner has no matching arbitrary custom fields) |
| Attachments and edit links | `references` on details, with OData-encoded URL property keys |

The precise Waiting/Resolved/Closed distinction remains in the description; Planner's
three progress states cannot represent all ticket statuses. No categories are relabelled
in the shared plan without a separately verified label mapping. Editing continues through
the native SharePoint form.

Update **both** `/planner/tasks/{id}` and `/planner/tasks/{id}/details`, using their
separate ETags and the exact plan's access rights. Writing only a description cannot
set the card's native priority, due date, assignment or completion. Remove stale
assignees/references with explicit null values. For a newly created task, write and
verify its marker/details before recording state; an uncertain marker-write failure
requires operator repair, not another automatic create.

### Executable Node runtime integration

The runtime can be hosted in an institutionally approved Node 22 service, separately
from the Power Automate implementation. **There is no configured runnable production
job in this repository yet.** Its missing adapters must be implemented and reviewed
before activation, not replaced with exported tenant data committed to the repository.

Create the Graph client with `createPlannerGraphClient({ getAccessToken })`, where
`getAccessToken` asynchronously obtains a Microsoft Graph token through the approved
host's OAuth connection. Never extract browser cookies or pass tokens through chat,
command-line arguments, source files or logs. The legacy modulow provisioning app ID
is not verified for Kiwi and must not be repurposed.

Invoke `runPlannerSync({ source, state, planner, teamId, planId, dryRun })` with that
Graph client and the exact verified group/plan IDs. `dryRun` defaults to `true`; even a
dry run reads tenant APIs when real adapters are supplied, so it requires approved access.
The result contains IDs and operation names only, not copied ticket bodies/history.

| Adapter operation | Required semantics |
| --- | --- |
| `source.readCompleteSnapshot()` | Return `{ complete: true, agents, tickets }` only after complete authorized paging, attachment/history reads, metadata-based field normalization, Entra identity resolution and proven assignment timestamps. Any failure must reject, not return partial data. Tickets/agents use the model's schema. |
| `state.withExclusiveLock(callback)` | Acquire a durable cross-process lease, pass `{ assertHeld() }` to the callback, renew while it runs, and release in a finally block. `assertHeld` must reject immediately if the lease is lost. The runner checks before each write and state commit; the host must also fence overlapping executions and cancel in-flight work on lease loss. |
| `state.read()` | Return all `{ mappings, pendingCreates }`, with source-ticket IDs unique and state scoped to this exact plan. |
| `state.beginCreate(intent)` | Durably persist unique ticket ID, marker and plan ID **before** POST, without ticket text. |
| `state.commitMapping(row)` | Atomically persist the verified mapping and remove the corresponding pending-create intent. Failure must leave the intent present. |
| `state.removeMapping(ticketId)` | Remove only that plan's mapping after confirmed deletion or a complete snapshot proving its task absent. |

The client verifies all plan/bucket/task pages, refuses pagination outside Microsoft
Graph, rejects ambiguous markers and changes to task ownership, uses separate task
and details ETags, and reads back all synchronized options/references before a mapping
can be committed. Legacy marked JSON descriptions are recognized for an upgrade.
Unmarked generic cards are still not adopted automatically.

Conflicts, transport errors, 429/503, incomplete pages or invalid responses stop the run
visibly. HTTP errors expose status and `retryAfter` but not response bodies or tokens.
The host must honor `Retry-After` before a later reconciliation run; this client does not
automatically retry writes. A failed or uncertain create leaves a durable pending intent
and blocks later writes. An operator must locate/repair the task and atomically settle
that intent before running again; a missing marker is never treated as proof that POST
did not create a task.

Planner currently allows [15 references per task](https://learn.microsoft.com/en-us/planner/planner-limits).
The model preflights this limit as well as description/title lengths. An over-limit
ticket requires an approved linked-history design; references are not silently dropped.
The host's 15-minute schedule, OAuth connection, SharePoint source/state adapters,
timestamp capture/backfill, and existing-card migration remain unconfigured prerequisites.

## Scheduled sync algorithm

1. Trigger every 15 minutes, with recurrence concurrency set to one. Check for any
   still-running previous attempt before making writes.
2. Read the approved agent roster, ticket items, attachment metadata/URLs, and related
   `TicketExchanges` pages. Follow every page; a failed/incomplete page aborts the
   current run rather than silently omitting records.
3. Require each assigned ticket to have a roster-matched Entra object ID and proven
   `PlannerAssignedAtUtc`. Rank independently per agent by timestamp descending and
   ticket ID descending for ties; keep the first 20. Unassigned tickets are excluded.
4. Build the complete task description and source references. Include every
   non-system ticket field plus all exchange messages and authors/dates. Add references
   to the validated SharePoint EditForm, attachment, and exchange URLs. `plannerTaskDetails.description`
   is limited to 4,000 characters; if the complete details exceed the limit, fail
   visibly without truncating or writing a partial task.
5. Include `KiwiPlannerSync:v1:<ticketId>` in canonical task details as the reserved
   marker and use `PlannerSyncState`
   as the authoritative source-ticket-to-task mapping. If a task-create response is
   uncertain, enumerate task details and find exactly one matching marker before
   retrying. Zero matches permits one create; multiple matches fail for operator repair.
6. Update changed tasks only, moving them to the current assignee's bucket and assigning
   the Planner task to that agent. Resolved/Closed map to 100% complete; active tickets
   do not. Compare the complete canonical payload on each run because attachment and
   exchange changes can occur independently of the ticket item's `Modified` value.
7. Only after task writes succeed, persist state mappings. Do not duplicate ticket
   bodies or exchange text in the state list. For tasks outside the desired top-20 sets,
   delete only a task with both the exact reserved marker and corresponding sync state.
   If a marked task has no mapping, fail for operator repair and do not delete it. Delete
   a state row only after a confirmed Planner deletion. Never delete a manual/unmarked
   task or a SharePoint item.
8. Handle 429/503 with `Retry-After` and only retry idempotent operations. Do not log
   ticket descriptions, attachment data, or exchange text. Report failures by run ID,
   ticket ID, task ID, operation, and error code, and do not mark a partial run complete.

## Pre-activation verification

- Verify Team/group ID and live authorized audience; obtain approved roster and Entra IDs.
- Verify the flow owner has licensing, durable connection ownership, provisioning rights,
  and access to all source/state lists and the target plan; obtain any required consent.
- Verify the source item EditForm URL and per-attachment/exchange edit links for actual
  items. Confirm list read/write permissions and version history availability.
- Verify the assignment-change trigger sees changes from SPFx, native forms, and all
  existing flows. Test out-of-order event delivery, timestamp clearing/reassignment,
  self-trigger prevention, and the initial version-history backfill.
- Verify copying attachment links and exchange history to the Planner audience is
  authorized, and confirm behavior for records over Planner's 4,000-character details
  limit. Oversized records must stop with an actionable error.
- In a controlled test plan, test one task for each status, assignment movement,
  references, duplicate-create recovery, 429 handling, pagination, interrupted mapping
  writes, expiry from the top 20, manual-task preservation, and no SharePoint deletion.
- Keep the production recurrence disabled until all checks pass and the authorized
  tenant operator confirms that production activation is appropriate.

## Disable and recovery

Disable the scheduled flow before changing the roster, plan ID, mapping schema, or
timestamp capture. Keep the state lists and Planner tasks while investigating. Do not
bulk-delete tasks or state rows to recover a partial run. Reconcile each failed ticket
by marker, task ETag, source ticket ID, assignee, bucket, and existing mapping; correct
the minimum inconsistent record and re-run once. For uncertain create/delete outcomes,
search the full plan by marker before retrying. Re-enable only after an operator confirms
the mapping and top-20 projection. The assignment-capture flow must remain active while
assignments can change.

## Repository validation

Run `npm test`, `npm run lint`, and `npm run build`. These checks use local fixtures
only and make no SharePoint, Graph, Planner, Teams, or Power Automate calls. This
blueprint does not create a plan, grant consent, or enable a live flow.
