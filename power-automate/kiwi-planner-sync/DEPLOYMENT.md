# Kiwi Planner ticket synchronization

This directory contains a non-secret workflow contract, an executable reference model
for reconciliation policy, fixture tests, and this deployment checklist. It is **not an
importable Power Automate package** and contains no tenant connections, plan ID, bucket
IDs, list IDs for new state lists, or credentials. Create the flows and live resources
only through the approved tenant process.

## Contract

- `workflow-blueprint.json` defines the confirmed behavior and required tenant schema.
- `planner-sync-core.cjs` is the deterministic reference model used by the repository
  tests. The cloud flows must preserve its ranking, task projection, marker, ownership,
  and no-truncation semantics; Power Automate does not execute this CommonJS file.
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

Provision the plan and buckets once in the confirmed Kiwi Team after validating the
roster, group membership, user licensing, and write permission. Save the returned plan
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
