# Kiwi Teams reply flow

`operational-definition.json` is the executable definition used in the private ordinary
Power Automate package. The package was adapted from a genuine tenant export so its
SharePoint, Teams, Office 365 Users and Content Conversion action schemas and connection
mappings are real. Export metadata and tenant connection IDs are intentionally not
committed.

The flow does not modify the active intake flow
`dada6a44-429e-4d4e-95c0-f2bf5c87e033`, send Outlook/SMTP mail, or write the direct-reply
field `R_x00e9_ponseaudemandeur`.

## Native comment copy (2026-10-05)

The reference definition now appends one native SharePoint comment for each
public Teams reply whose native-rule dispatch has been queued. This does not
confirm email delivery. The heading is `Learn IT HelpDesk`;
the text identifies the verified Teams author, contains the signed reply and
includes the source Teams message ID. Comments are posted under the SharePoint
connection account, not by impersonating the original author. No mentions are
created. Existing source-ID deduplication prevents scheduled runs from copying
an already processed reply again.

The comment POST follows `Mark_exchange_awaiting_native_rule`, so it does not
block the established email dispatch. It has no automatic retries: a network
timeout could mean SharePoint accepted the comment. A failure remains visible
in the run. Inspect for the source-message marker before recovering only the
missing comment; never reset the exchange or replay the email to repair a
comment. This is a once-only attempt, not guaranteed exactly-once delivery.
Internal Teams discussions and inbound emails are not copied by this action.
Requester questions entered directly in native comments already remain there.

The test ticket's initial question and two distinct responses were copied
manually into three separate native comments. The earlier consolidated
history was superseded. Automatic copy was added in the live designer using
the existing SharePoint connection. Saving initially remained pending, then
the designer confirmed the flow was ready to use. A fresh server details page
confirmed the enabled flow was modified at 17:12 on 2026-10-05. A fresh native
ticket form also confirmed exactly three individual history comments, with no
consolidated duplicate. An actual automatically
created comment has not yet been observed; do not treat the reference change,
zero validation errors or save confirmation as end-to-end verification.
Verify a new accepted public reply produces one comment before claiming that
the automatic path works. Existing processed messages are not replayed.

At the subsequent verification, public replies were still blocked by unresolved
native-rule exchanges. Outlook Web requested sign-in, so delivery could not be
verified. No exchange was falsely confirmed or reset, and no additional public
test reply was sent: that would either fail the existing guard or risk an
unnecessary email. Runtime comment-copy verification remains blocked until
delivery of the prior dispatch is confirmed and a new eligible reply is accepted.

## Ticket title prefix status (2026-10-05)

All six existing tickets (IDs 10-15) were updated through title-only
inline saves to `Learn IT Helpdesk - <original subject>`. Each native form
confirmed the new title. A subsequent fresh SharePoint read enumerated all six
items, verified every prefix and checked there was no continuation page.
Response and dispatch fields were not edited.
This is an existing-ticket migration, not automatic enforcement for future
items. Repository normalization is tracked separately in PR #7. Native Lists
creation and email intake still need an automatic normalization path before
their Teams/Planner projections. Do not enable a restrictive list validation
rule alone: it would reject existing intake flows that submit bare subjects.

### Combined production package preparation

The title-normalization implementation from PR #7 was integrated into the
PR #5 branch, preserving the Planner and workflow test selectors. The full
repository test command and production build completed successfully.
The rebuilt `sharepoint/solution/support-it-ticketing.sppkg` includes those
changes. Its SHA-256 is
`5D1C5F76DB9FE9BF56292D5B8B836C70D04F745CF7996DB55F0145FFC803B7F3`.

The authenticated tenant app catalogue was inspected for deployment.
Its classic Files ribbon exposed **Upload Document** as disabled for the
current account. No package was uploaded or deployed; catalogue deployment
and the requested Graph permission approval require an authorized
administrator. Preparing this package does not enforce titles in the live
native Lists form or email intake.

The experimental absolute-positioned notification HTML was not saved:
automated accessible input accepted only an incomplete fragment. The draft
was canceled and the original rule reopened and verified. Existing native
notifications remain enabled, and Planner synchronization remains paused.

### Solution publication attempt

The existing unmanaged `KiwiHelpdeskAutomations` solution was reopened through
the native Solutions navigation and showed version `1.0.0.19`. Its **Deploy**
command was disabled by environment privileges. **Publish all customizations**
was available and invoked at the user's request. On the subsequent export
visit, a new notification confirmed this publication succeeded. The unrelated
success banner dated 2026-09-21 was not used as evidence.

No old private solution ZIP was reimported: those artifacts predate the live
ETag repair and comment-copy action and could overwrite them. This publication
does not import the rebuilt SPFx package, change SharePoint notification HTML
or add future-ticket title normalization to the native intake flows.

### Fresh unmanaged live export

At the user's request, the published live solution was exported as **unmanaged**
version `1.0.0.20` and downloaded successfully. The new ZIP was kept in private
session artifacts, not committed to the repository. Its size is 18,760 bytes
and SHA-256 is
`BAD87EBB77866BE12EC93F13CC8EEC36F8ADAA1874FC8983F8DE1D61E73B4658`.
The archive manifest confirms `Managed=0`.

Direct archive inspection confirms the current Teams reply workflow includes
the minimalmetadata/coalesced ETag repair and exactly one comment POST after
`Mark_exchange_awaiting_native_rule` succeeds, with the expected JSON-safe
body and retry policy `none`. This verifies persisted configuration, not
runtime comment creation. The export contains the Teams reply and Planner
workflows plus their solution metadata; it does not contain the SPFx package,
native list notification templates or the separate form intake flow.
No import, replay or Planner activation was performed.

## First-responder assignment ETag repair (2026-10-05)

A public reply was recognized and recorded as `Processing`, but the initial
assignment failed with HTTP 412 before response staging or dispatch. The
assignment snapshot requested `odata=nometadata`, which omitted the ETag, while
the write expected the Graph-style `@odata.etag` property. Later successful
scheduled runs deduplicated the existing exchange; they did not recover it.

The assignment snapshot now requests `odata=minimalmetadata`. Its guarded
`IF-MATCH` uses SharePoint's `odata.etag`, with `@odata.etag` as an alternate
metadata representation. No wildcard ETag or unconditional assignment is used.
The two corresponding live designer inputs were updated and saved; the
repository contract test covers both the response format and ETag expression.

For recovery, verify that the failed action precedes `Stage_ticket_reply` and
`Commit_dispatch_token_only`, and that the ticket's reply fields and dispatch
token remain empty. Only then mark that exact incomplete exchange
`FailedTerminal`, preserving its message and unique source ID. An explicitly
authorized new copy in the mapped ticket thread receives a new message ID and
passes normal authorization, deduplication and dispatch checks. Never mark a
failed assignment `AgentConfirmed`, clear unrelated pending exchanges, or
replay a message whose dispatch might already have occurred.

The visible list title is now **Learn-IT-Tickets**. Its original
`Lists/EuropaTickets` address and list GUID are unchanged. Replies under the
forwarded email root are distinct from replies under the mapped Workflows
ticket root; only the latter are currently monitored.

Live recovery verification: the test ticket's first responder was assigned,
its signed `TeamsReplyText` and responding-agent field were staged, and a
nonempty dispatch token was committed. The new exchange reached
`AwaitingNativeRule`. The connected Outlook mailbox then showed both the
requester reply and the responding-agent confirmation at 15:41, with the
response and assigned-agent signature present. Only that verified exchange
was manually marked `AgentConfirmed`; both pre-dispatch failed attempts remain
`FailedTerminal`. This is direct inbox evidence for the connected test account,
not a delivery guarantee for other recipients or automatic acknowledgement
of future native-rule sends. The generated subject still used `EuropaTickets`
in these received messages despite the visible list rename.

## Live notification presentation (2026-10-05)

All five existing native list rules were updated in place through the authenticated
SharePoint rule editor. Conditions, recipients and enabled states were preserved.
Custom messages now begin with an explicit `[Kiwi]` heading, followed by a dynamic
ticket title, the relevant response where applicable, and a signature containing
the actual **Assigned to** Person-field token plus `learn.IT`. That token was
inserted with the native dynamic-content picker, not as literal text or a guessed
agent name. The saved requester direct-response rule was reopened and its heading
and token chip checked.

| Existing notification | Custom-message heading |
| --- | --- |
| Requester recorded | `[Kiwi] Your ticket has been received` |
| Direct response to requester | `[Kiwi] Reply to your ticket` |
| Direct response copy to modifier | `[Kiwi] Your reply has been recorded` |
| Teams response to requester | `[Kiwi] Reply to your ticket` |
| Teams response copy to actual responding agent | `[Kiwi] Your Teams reply has been recorded` |

Creation and requester-response messages explain that an empty assigned-agent
name means the ticket is awaiting assignment. They do not substitute the author
or last modifier for the assigned agent. Confirmation copies no longer claim
that their receipt proves delivery to the requester. Existing Teams response text
still contains the verified responding author's signature; the additional
assigned-agent signature identifies the ticket owner, who may be different.

Native rules expose only custom body text, not a configurable email subject or
the standard SharePoint change-summary header. Their generated
`<ticket title> was updated in <list title>` subject is not independently
customizable; the list title is now `Learn-IT-Tickets`.
Replacing it requires a separately configured mail-capable flow/connection and
a guarded cutover to avoid duplicate sends; no such connection was created here.
No notification was replayed during this presentation update. Previous inbox
verification proves delivery for the earlier diagnostic messages, not rendering
or delivery of the newly revised templates.

## Exact prerequisites

The dispatch field's live display title was renamed to `TicketID` at the
user's request on 2026-10-05, superseding the initial `Ticket-Number` label.
A fresh field-schema read verified its internal
name remains `TeamsReplyDispatchToken` and its type remains Text. This is a
label-only change: values remain dispatch identifiers, not ticket numbers.
Keep workflow references on the internal name; use the item ID for the actual
ticket number.

The native ticket response form now hides `Titre`, `Expéditeur du transfert`,
`TeamsThreadId`, `TicketID`, `Status`, `Priority`, `Category` and `Due date`.
This was saved through **Edit form > Edit columns** and verified by reopening
the saved selections. All other selections were preserved, including requester,
description, assigned agent and response. Columns and stored values were not
deleted; list views and workflow internal-name references remain unchanged.
These are shared native form visibility settings, not a separate response-only
custom form.

These `EuropaTickets` fields and rules are already live:

- `TeamsReplyText`: single-line text, maximum 255;
- `TeamsReplyAgent`: one Person, groups disabled;
- `TeamsReplyDispatchToken`: single-line text, maximum 255;
- `Assigned_x0020_to` (`Assigned to`): one Person, groups disabled;
- enabled rule when `TeamsReplyDispatchToken` changes -> `Demandeur0`, message token
  `TeamsReplyText`;
- enabled rule when `TeamsReplyDispatchToken` changes -> `TeamsReplyAgent`, message token
  `TeamsReplyText`.

`TicketExchanges.SourceMessageId` already has **Enforce unique values** enabled, and the
following state column is live and reopen-verified:

| Internal name | Type | Choices |
| --- | --- | --- |
| `DeliveryState` | Choice, single value | `Processing`, `AwaitingNativeRule`, `AgentConfirmed`, `FailedTerminal`, `IgnoredInternal` |

No lease, attempt-count, retry-date, error-note, requester-source or confirmation column
is required by this bounded implementation. Existing `Title` plus the failed run history
carry the failure reason.

## Import and safe activation

1. Keep the flow off during import. Map the four package resources to the existing
   SharePoint, Microsoft Teams, Office 365 Users and Content Conversion connections.
2. Open the imported flow and replace the visible `Deployment_cutoff_UTC` Compose value
   `2099-12-31T00:00:00Z` with the current UTC deployment time.
3. Save and verify the recurrence concurrency is 1 and both `Apply to each` loops are
   sequential.
4. Confirm the Team ID is `435074fb-2e8d-4c67-b06a-0359ddc5a939`, the Channel ID is
   `19:BM44z26OAyIXfxi0S1s4L4m5T2obLQX1-tAeZVxJ5gE1@thread.tacv2`, and the list GUIDs are:
   - `EuropaTickets`: `f673fe2d-9733-46dd-9afe-4bf614c99202`;
   - `TicketExchanges`: `58aa42f2-6fa0-4df2-9a76-90189fece896`.
5. Turn it on only after the cutoff and both native rules are ready. Do not create a test
   reply or email without separate authorization.

The packaged future cutoff makes an accidental early enablement fail before any ticket
is read. Replies older than the deployment cutoff never create ledger rows.

## Operational behavior

For each mapped ticket, the flow obtains Teams replies through the supported Teams
connector Graph action. It resolves the author through Office 365 Users, ensures that
user in SharePoint, and checks effective `EditListItems` on that exact ticket item.
Laurent is not excluded merely because he owns the connections.
SharePoint identity IDs are numeric at runtime. The authorization guard treats only
`greater(int(coalesce(id, 0)), 0)` as present; it never calls `empty()` on an integer.
The signature first name comes only from the verified SharePoint PeopleManager
`UserProfileProperties` entry whose key is `FirstName`. The flow never guesses from
`displayName` or the UPN, and fails closed when `FirstName` is absent or empty.

HTML is converted with Content Conversion before classification. Only literal,
case-sensitive `@user` followed by end-of-text, a space, LF or CRLF is public. The prefix
is removed exactly once. The requester-facing text is the unchanged reply followed by LF,
the PeopleManager first name, LF and `learn.IT`. Empty replies or a complete signed text
over 255 characters are recorded as `FailedTerminal`; the run fails visibly and nothing
is truncated or dispatched. Other human replies are recorded once as `IgnoredInternal`.

For a valid public reply, the flow creates a unique `Processing` exchange, writes
`TeamsReplyText` and `TeamsReplyAgent`, re-reads and compares the requester, Teams thread,
text and agent, and only then changes `TeamsReplyDispatchToken`. The exchange becomes
`AwaitingNativeRule` after that token update.

The staged re-read uses SharePoint REST and explicitly selects `Demandeur0Id` and
`TeamsReplyAgentId`. It also selects `Assigned_x0020_toId`. The native `Get item` action
returns Person values without their numeric IDs in this tenant and must not be used for
this correlation.

Before staging the reply, the flow reads `Assigned_x0020_toId`. If it is already
positive, no assignment write occurs. If it is empty, an `IF-MATCH` MERGE using that
read's ETag assigns the actual responder. A concurrent assignment makes the MERGE fail
rather than overwrite another agent. The final correlation requires either the preserved
existing assignee or the newly assigned first responder.

This means:

- `Processing`: fail-stop or pre-token state; inspect manually and never blindly replay;
- `AwaitingNativeRule`: SharePoint accepted the token change and native rules are queued;
- `AgentConfirmed`: the actual Teams agent received and checked the rule copy, then
  manually confirmed this exact exchange;
- neither state proves email delivery;
- there is no automatic retry after an uncertain token update.

Only one unresolved public dispatch per ticket may remain `Processing` or
`AwaitingNativeRule`. A later public reply is recorded as `FailedTerminal` and the run
fails visibly, preventing a second token change from reusing stale staged values. After
the operator resolves the earlier exchange (or the agent confirms it), an operator may
deliberately recover the blocked reply by deleting its failed ledger row; the flow never
does that automatically.

For a staging mismatch that occurred before any token update, keep the flow off and
verify the failed run shows `Commit_dispatch_token_only` skipped. Locate exactly one
`TicketExchanges` row with the affected ticket, the original `SourceMessageId`, title
`Public Teams reply - staging mismatch`, and state `FailedTerminal`. Delete only that
row. Leave the already staged ticket text and agent intact; the next run overwrites them
with the same validated values. Re-enable and run once without reposting the Teams
message, then disable while inspecting the new exchange and token. Never delete a
`Processing` or `AwaitingNativeRule` row for this recovery.

The flow asks for 51 ticket roots and 50 replies as sentinels. It terminates before
processing when either sentinel is reached or Teams returns `@odata.nextLink`; it never
silently loses a later page. This is an explicit limitation: once a mapped Teams thread
contains 50 or more replies, that thread will fail every scheduled run until proper
pagination is implemented or the ticket-to-thread mapping is deliberately retired.

Power Automate rejects `Terminate` inside `Foreach`. Nested failures therefore set serial
`FailureCode` and `FailureMessage` variables. Remaining reply bodies are gated off, and a
single top-level action terminates the run after both loops finish.
Power Automate also rejects assigning a variable from an expression that reads that same
variable. Each `SetVariable` therefore writes a literal or an expression independent of
its target; the surrounding condition requires `FailureCode` to be empty so the first
failure cannot be overwritten by a later ticket.

Power Automate also limits control nesting to eight. The cutoff and ticket-page checks
are top-level preflights, and the reply-page check is a sibling of the reply loop. The
deepest concrete path is exactly eight control parents:

`For_each_ticket` -> `For_each_reply` -> `Reply_is_new_human_content` ->
`Source_message_is_unseen` -> `Reply_is_public` ->
`Public_reply_length_is_valid` -> `Author_and_requester_are_authorized` ->
`Staged_values_are_current` -> token action.

For manual solution authoring, create these eight root actions in order:

1. `Deployment_cutoff_UTC` (Compose).
2. `Initialize_failure_code`.
3. `Initialize_failure_message`.
4. `Activation_cutoff_is_invalid` (Condition).
5. `List_ticket_roots`.
6. `Ticket_page_limit_reached` (Condition).
7. `For_each_ticket`.
8. `Terminate_after_processing_failure` (Condition).

## Validation

Run `npm test`. The workflow tests load `operational-definition.json` and check the
actual connector operation IDs, IDs, cutoff guard, serial concurrency, page fail-stops,
human/permission guards, unique-ledger lookup, exact `@user` classifier, 255-character
failure, numeric identity handling, staged-field re-read and token-only final update.

The previously authorized intake test proves only form -> list -> Teams root creation:
ticket `[TEST] Kiwi form integration - Laurent - 2026-10-04 17:45`,
`TeamsThreadId=1791128977119`, successful 3-second intake run, and requester receipt.
It does not prove this reply flow or native-rule delivery.
