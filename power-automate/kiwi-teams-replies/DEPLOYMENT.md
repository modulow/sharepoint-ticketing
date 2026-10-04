# Kiwi Teams reply flow

This folder is a bounded, machine-validated blueprint for a **new scheduled flow** that
polls replies to the existing Kiwi Teams root messages. It does not duplicate or modify
the active intake flow `dada6a44-429e-4d4e-95c0-f2bf5c87e033`.

## Why there is no ZIP

Power Automate imports require a genuine exported solution containing tenant-specific
connection references and resource IDs. This workspace has no export of the target
environment, no connection-reference IDs, and no Team/Channel IDs. A hand-crafted ZIP
would be a false import contract. `workflow-blueprint.json` is therefore intentionally
marked `importable: false`; it is the validated implementation contract to reproduce in
an unmanaged solution and then export normally.

## Required setup

1. Create the columns listed under `requiredColumns` in the blueprint. In particular,
   enforce unique values on `TicketExchanges.SourceMessageId`.
2. Create the `DeliveryState` choices exactly as specified.
3. Record the Team ID, Channel ID, flow connection UPN and a UTC activation cutoff. The
   cutoff must be the deployment time so historical replies are not processed.
4. Use only the existing SharePoint, Microsoft Teams and Office 365 Users connections.
   Compose, Condition, Scope, Apply to each and Terminate are built-in actions and add no
   connector.
5. Set trigger concurrency to **1**. Set every ticket/reply loop concurrency to **1**.
6. Enable pagination for ticket roots, Teams replies and all dedupe/recovery queries.
   Use threshold 100,000 and terminate visibly if it is reached.

## Native SharePoint rule

On `EuropaTickets`, create a rule triggered when `RequesterReplyDispatchToken` changes
and `RequesterReplyState` is `ReadyForNativeRule`. Require all four guard fields from the
blueprint. Send the reply to:

- `Demandeur0.Email`;
- `RequesterReplyAgent.Email` (the validated actual Teams author).

Include ticket title, full `RequesterReplyText`, agent, and source message ID. Do not use
the technical Editor as the agent identity. The agent copy is a confirmation request,
not delivery proof. After checking it, the actual agent changes `RequesterReplyState` to
`AgentConfirmed`; the scheduled flow reconciles the exact `SourceMessageId` to
`TicketExchanges.DeliveryState=AgentConfirmed`.

Every dispatch overwrites requester, agent, text, source ID, time, state and a new GUID
token together. Do not allow another public dispatch while one remains
`ReadyForNativeRule`; this prevents stale-recipient leakage.

## Designer build order

Implement the `pipeline` array in order. Keep each named step so run history matches the
blueprint. Put HTML conversion in its own Scope and route failures to the retry state.
The conversion must produce plain text before testing the exact case-sensitive prefix
`@user`. Replies without that prefix are recorded once as Internal and never dispatched.

The author must resolve through Office 365 Users, be enabled, have a real UPN, not be the
flow connection identity, and pass SharePoint `getUserEffectivePermissions`. The mask
expression in the blueprint tests `EditListItems` (low-mask bit 4). Server ACLs remain
authoritative.

Acquire the unique `SourceMessageId` lease before staging the native-rule fields. On
transient failure update that same exchange item to `FailedRetryable`, set the error,
increment `AttemptCount`, and set `NextAttemptAt`. After five attempts use
`FailedTerminal`. Never call a rule invocation or queued message “Delivered”.

## Validation and activation

Run `npm test`; `test/workflowBlueprint.test.cjs` checks the safety invariants and
required state model. After building the cloud flow:

1. Save it **off** and inspect the definition/export against the blueprint.
2. Set the activation cutoff to the current UTC time.
3. Turn it on without replaying prior replies.
4. Do not generate a test ticket or send a test email unless separately authorized.
5. Verify run history only with a newly authorized Teams reply.
6. Export the containing unmanaged solution. That genuine export becomes the importable
   package; retain connection-reference mapping instructions with it.

