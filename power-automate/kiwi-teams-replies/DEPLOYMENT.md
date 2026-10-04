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

HTML is converted with Content Conversion before classification. Only literal,
case-sensitive `@user` followed by end-of-text, a space, LF or CRLF is public. The prefix
is removed exactly once. Empty text and text over 255 characters are recorded as
`FailedTerminal`, the run fails visibly, and nothing is truncated or dispatched. Other
human replies are recorded once as `IgnoredInternal`.

For a valid public reply, the flow creates a unique `Processing` exchange, writes
`TeamsReplyText` and `TeamsReplyAgent`, re-reads and compares the requester, Teams thread,
text and agent, and only then changes `TeamsReplyDispatchToken`. The exchange becomes
`AwaitingNativeRule` after that token update. This means:

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

The flow asks for 51 ticket roots and 50 replies as sentinels. It terminates before
processing when either sentinel is reached or Teams returns `@odata.nextLink`; it never
silently loses a later page. This is an explicit limitation: once a mapped Teams thread
contains 50 or more replies, that thread will fail every scheduled run until proper
pagination is implemented or the ticket-to-thread mapping is deliberately retired.

Power Automate rejects `Terminate` inside `Foreach`. Nested failures therefore set serial
`FailureCode` and `FailureMessage` variables. Remaining reply bodies are gated off, and a
single top-level action terminates the run after both loops finish.

## Validation

Run `npm test`. The workflow tests load `operational-definition.json` and check the
actual connector operation IDs, IDs, cutoff guard, serial concurrency, page fail-stops,
human/permission guards, unique-ledger lookup, exact `@user` classifier, 255-character
failure, staged-field re-read and token-only final update.

The previously authorized intake test proves only form -> list -> Teams root creation:
ticket `[TEST] Kiwi form integration - Laurent - 2026-10-04 17:45`,
`TeamsThreadId=1791128977119`, successful 3-second intake run, and requester receipt.
It does not prove this reply flow or native-rule delivery.
