# Operational constraint review

| Constraint | Verified implementation |
| --- | --- |
| Existing intake flow remains live | Reply package creates a separate scheduled flow and does not reference or update flow `dada6a44-429e-4d4e-95c0-f2bf5c87e033`. |
| Native rules have one condition | Both enabled rules trigger only when `TeamsReplyDispatchToken` changes; all guards are in the flow. |
| Direct reply rules must remain untouched | The definition never writes `R_x00e9_ponseaudemandeur`. |
| Native rule payload is single-line 255 | `TeamsReplyText` is validated at 1-255 characters; longer content is recorded and fails without truncation. |
| Technical Editor is not the Teams author | `UserProfile_V2`, `ensureuser` and item-specific `getUserEffectivePermissions` resolve and authorize the actual Teams author, who is stored in `TeamsReplyAgent`. |
| Laurent may be a legitimate human agent | No connection UPN or Laurent-specific exclusion exists. |
| Automation and system replies are not public | A non-empty `from.user.id`, empty `from.application`, normal message type and non-root message ID are required. Existing `SourceMessageId` ledger rows are skipped. |
| Historical processing is unauthorized | The package has a future cutoff sentinel and fails before reading tickets until deployment supplies a current UTC cutoff. |
| No silent page loss | The flow fails before processing when it receives 51 roots, 50 replies, or any Teams `@odata.nextLink`; a 50-reply thread remains a persistent blocker until pagination is implemented or its mapping is retired. |
| Power Automate forbids nested termination | Loop failures set serial error variables; the only processing `Terminate` runs at top level after both loops. |
| Dedupe is durable | `SourceMessageId` is unique and queried before any exchange or dispatch write. All execution is serial. |
| Native rule invocation is not delivery proof | State advances only to `AwaitingNativeRule`; the implementation has no `Delivered` state. |
| Import metadata must be genuine | The private package is adapted from a tenant export containing the four actual connector mappings; those IDs are not committed. |

## Remaining activation boundary

No reply-polling run, ticket write, token write or email was performed while producing
the package. `TicketExchanges.DeliveryState` and its five choices are live and verified.
During import, map the four existing connections. Keep the flow off, replace the future
cutoff with the current UTC deployment time, inspect the imported definition, and only
then enable it.

The existing authorized intake test proves form-to-root creation and acknowledgement
only. End-to-end Teams reply routing remains unverified until a separately authorized new
reply is tested after deployment.
