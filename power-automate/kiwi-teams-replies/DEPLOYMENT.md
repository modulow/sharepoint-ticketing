# Kiwi Teams reply flow

`operational-definition.json` is the executable definition used in the private ordinary
Power Automate package. The package was adapted from a genuine tenant export so its
SharePoint, Teams, Office 365 Users and Content Conversion action schemas and connection
mappings are real. Export metadata and tenant connection IDs are intentionally not
committed.

The flow does not modify the active intake flow
`dada6a44-429e-4d4e-95c0-f2bf5c87e033`, send Outlook/SMTP mail, or write the direct-reply
field `R_x00e9_ponseaudemandeur`.

## Exact prerequisites

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
