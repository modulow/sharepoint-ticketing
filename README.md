# Support IT Ticketing for SharePoint Online

**Live interactive demo:** https://modulow.github.io/sharepoint-ticketing/

The GitHub Pages demo uses sample data stored only in the visitor's browser. It does not
connect to SharePoint or expose tenant data. for SharePoint Online

Responsive SPFx ticket portal integrated with the Kiwi service at
`https://europarl.sharepoint.com/sites/learn.IT-Kiwi`. The visual system follows the European Parliament Brand Book 2.0 guidance applicable to digital interfaces: Reflex Blue `#0C4DA2`, Yellow `#FDE021`, official neutral colours, purposeful dialogue-line elements, clear typographic hierarchy, simple geometry, restrained motion, and accessible contrast.

The agent workspace includes the official English landscape logo supplied through the European Parliament Download Centre, following confirmation from the repository owner that its use is authorised. The end-user portal keeps the lighter logo-free hero requested for the public experience. Both interfaces use a locally installed Myriad Pro when available and the prescribed native Arial fallback.

Design reference: [European Parliament Brand Book 2.0 (abridged version for partners and contractors)](https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/tender-details/docs/1e4d944e-1589-4496-964f-548ff156dc49-CN/Annex%20VIII%20-%20European%20Parliament%20Brand%20Book_V1.pdf).

## Toolchain

- SharePoint Framework **1.23.2** (latest released package and latest version in Microsoft's compatibility table when this project was created)
- Node.js **22 LTS**, `>=22.14.0 <23`
- React **17.0.1**, as required by SPFx 1.23.2
- npm 10+
- PnP.PowerShell for tenant provisioning

Microsoft references: [SPFx compatibility](https://learn.microsoft.com/sharepoint/dev/spfx/compatibility) and [development environment](https://learn.microsoft.com/sharepoint/dev/spfx/set-up-your-development-environment).

## Develop and package

```powershell
npm install
npm test
npm run lint
npm run build
```

`npm run build` creates `sharepoint/solution/support-it-ticketing.sppkg`. Generated dependency/build folders are gitignored.

## Kiwi integration

The deployed web parts use these existing resources without changing their permissions:

- `EuropaTickets`, list ID `f673fe2d-9733-46dd-9afe-4bf614c99202`;
- `TicketExchanges`, retained for the existing Kiwi conversation flow (not written by this client);
- the existing Microsoft Lists intake form for Title/Titre, Descriptif and attachments;
- effective `EditListItems` permission on `EuropaTickets` for agent authorization;
- Microsoft 365 group `435074fb-2e8d-4c67-b06a-0359ddc5a939` for the assignment selector.

At runtime the client reads the `EuropaTickets` field metadata and resolves required and
optional fields by stable internal names and localized display labels. It does not assume
the original English `Tickets` schema. `Author`, `Created`, `Modified`, attachment state,
and any detected category, priority, status, assignee, due-date and requester-response
fields are projected from the real list.

Agent authorization is permission-aware: the web part reads the current user's effective
permissions on `EuropaTickets` and enables management only when `EditListItems` is
present. This includes Owners and group 5 through their existing role assignments without
assuming that the role definition name is a SharePoint group. It does not enumerate
`/sitegroups(5)/users` or claim that SharePoint expands nested M365 membership.

Requester queries use `Demandeur0` when that person field exists and also include items
authored by the signed-in user. This covers email-created requests whose technical Author
is the flow owner and form-created requests whose Author is the requester. The displayed
requester likewise prefers `Demandeur0` and falls back to Author.

Ticket creation deliberately opens the existing modern Lists form in a compact browser
popup (520 x 720 requested; browsers may choose a tab on mobile) rather than posting a
partial item through REST. This preserves attachments, actual `Author`, native rules and
the existing creation flow. Every existing **Create a ticket** button opens the popup
synchronously from the click, leaving the dashboard/list and current filters in place.
The form is not embedded in an iframe: Microsoft sign-in is unreliable in cross-domain
frames. The popup's opener is cleared before it navigates to the authenticated form.
A blocked popup displays an accessible dialog with a normal secure-form link; that
fallback may open a tab. No ticket creation or reply is performed by the client.

The SharePoint web part refreshes ticket reads after the popup closes, without treating
closure as successful submission. Submission is performed only inside the native form.
If the fallback link is used, close the fallback dialog after submitting to refresh.
**Refresh tickets** also performs a read-only refresh, including when browser isolation
prevents reliable popup-closure tracking.
Ticket cards open details and existing agent updates in a responsive, focus-trapped
Fluent UI modal with Close and Escape dismissal and focus restoration. Closing is
disabled while an agent save is in progress.

### Europa portal landing page

`https://ep.europa.kiwi/sharepoint-ticketing/` currently serves the static `docs/`
browser-only demonstration, **not** the authenticated SharePoint web part. Its existing
**Create a ticket** buttons now open the real Kiwi intake popup directly. **Try sample
form** opens an explicitly labelled local-only modal; ticket lists and agent management
remain sample data and do not read private SharePoint data. Real intake goes through the
existing SharePoint/Teams automation; this UI does not send Teams replies or modify flows.

The Europa portal's link is maintained in a separate repository. It should open the above
ticketing URL in the same tab, not navigate directly to the Lists form. Publish the updated
`docs/` assets to the hosting pipeline serving that route. To provide authenticated live
ticket tracking/agent management, deploy the SPFx package to the existing Kiwi SharePoint
page and point the portal at that page; the public static demo cannot supply those features
without a separately approved authenticated architecture. No portal/tenant changes,
live writes, flow toggles or live reply tests are performed by this repository change.

The portal deep link `?action=create` immediately renders the **Create a ticket** landing
view with the secure native intake link. Arrival itself does not attempt a popup; Microsoft
authentication opens only after an explicit click. Ordinary creation buttons still open
intake directly without replacing the current dashboard or list.

The static queue and sample agent workspace also expose **Open Kiwi agent queue** and
**Open reply exchanges** links to the real `EuropaTickets` and `TicketExchanges` lists.
Intake and these live tools reuse the named `kiwi-ticket-form` popup where the retained
window handle permits it; the same destination only refocuses it. Switching destinations
navigates that window and may discard unsaved native form changes. Browser isolation,
closing the window, or reloading the landing page may require a new popup. Each blocked
action has an accessible fallback link to its exact destination. These links do not
grant permissions, read list contents into the public UI, or dispatch Teams replies.

This reconciles the earlier popup proposal's deep-link, named-window, queue and exchange
links without copying its stale baseline. Its automatic view replacement after ordinary
creation clicks, mixed live/sample creation form, and post-navigation opener clearing
are intentionally not retained: the current UI preserves its landing view, separates
sample submission, and clears the opener before initial authenticated navigation.

The assignment selector expands transitive user members of the real learn.IT Microsoft
365 group through Microsoft Graph, then calls SharePoint `ensureuser` so updates use the
correct site user IDs. It never adds members. If expansion is unavailable, the management
web part reports an explicit error instead of falling back to the incomplete SharePoint
Members group.

### Ticket title policy

Ticket writes owned by this client use **`Learn IT Helpdesk - <original subject>`**.
The spelling and case of the prefix are exact. Normalization is idempotent, corrects
case variants, removes repeated leading prefixes, and keeps the individual subject.
The complete title must fit SharePoint's 255-character text limit: an unprefixed
subject can occupy 235 UTF-16 code units. Empty subjects and overflow are explicit
errors; the client never truncates the subject or substitutes a constant title.

SPFx agent saves re-read the stored title, normalize it in the same update as the
requested fields, and use that snapshot's ETag. A concurrent update returns an error
instead of overwriting another editor's title. An oversized legacy subject blocks
the save until an authorized agent shortens it in the native list. Reads still show
the actual stored title, not a fabricated prefix. The browser-only demo uses the same
policy for its seeds, sample creation and agent saves; existing browser data is
normalized only on save. This change does not migrate existing live items.

**Live follow-up is required:** the popup delegates creation to the native Microsoft
Lists form, so this repository cannot enforce titles at that boundary. Before claiming
all live tickets follow the policy, the tenant owner must apply it to both the email
intake flow's ticket `Title` mapping and the modern Lists form's post-create/update
automation, before downstream Teams/Planner projections consume the title. Re-read the
current subject and version; produce `Learn IT Helpdesk - <subject>`, skip an unchanged
normalized title to prevent recursive triggers, and use an ETag-protected update.
For email overflow, route to a visible failure/manual-review path before creating;
for Lists overflow, flag the item for agent correction without truncation or downstream
publication. A native form submission may already have created an unprefixed item before
post-create automation runs: strict at-creation enforcement requires a separately
approved intake change, not a popup URL parameter or a renamed list.

The Teams reply blueprint intentionally retains its assignment/reply/dispatch-token
contract and does not normalize titles during a reply. Its `TicketExchanges` titles
are exchange audit labels, not ticket subjects. Enforce title policy in the dedicated
intake/update automation rather than changing token-only dispatch semantics.
Keep the visible list name **Learn-IT-Tickets**, URL `Lists/EuropaTickets`, and GUID
`f673fe2d-9733-46dd-9afe-4bf614c99202` unchanged. Publish the static assets and rebuild/
deploy the SPFx package separately; no tenant changes or deployment are performed here.

### Deploy to Kiwi

1. Upload `sharepoint/solution/support-it-ticketing.sppkg` version `1.8.1.0` to the
   European Parliament tenant App Catalog and deploy it.
2. In the SharePoint admin center, approve the package's pending Microsoft Graph
   `GroupMember.Read.All` API request.
3. Add the **Support IT** web part to the intended page on
   `https://europarl.sharepoint.com/sites/learn.IT-Kiwi`.
4. Add **Support IT Management** only to an agent-restricted page. The component also
   verifies effective `EditListItems` permission on `EuropaTickets`.
5. Test as a normal requester and as a Kiwi agent. Confirm that the modern intake form
   creates an `EuropaTickets` item and that assignment resolves an existing learn.IT
   member.

No package deployment or API approval is performed automatically by this repository.

## Initial requester description in native comments

`power-automate/kiwi-initial-comment/` implements a separate reference handler that
copies each admitted new ticket's existing **Descriptif** to its native SharePoint
comments while preserving the field. A unique durable ledger reservation precedes the
single POST; exact comment readback and ETag-protected completion prevent ordinary
duplicates. Uncertain writes remain visibly Pending and are never automatically replayed.
Empty/oversized descriptions fail without truncation; rich text needs an approved
conversion adapter. This does not import email replies or write `TicketExchanges`.

The handler is not deployed, bundled into SPFx, or connected to a production trigger.
See `power-automate/kiwi-initial-comment/DEPLOYMENT.md` for the dedicated ledger schema,
creation-event hookup, cutoff, authentication, limit/conversion preflights and live
verification steps. Existing agent/email paths remain independent; Planner stays paused.

## Teams reply automation blueprint

`power-automate/kiwi-teams-replies/` contains the validated implementation contract for
polling Kiwi Teams thread replies and staging only literal `@user` replies for the
requester. It includes durable `SourceMessageId` deduplication, effective-permission
checks, activation cutoff, pagination, concurrency control, retry/terminal failure
states, and an actual-agent/native-rule confirmation handshake.

It is intentionally not presented as an importable ZIP: a valid Power Automate package
must be exported from a solution with real connection references and Team/Channel IDs.
See its `DEPLOYMENT.md` for the exact tenant-side build, validation and export steps.

## Kiwi Planner ticket sync

`power-automate/kiwi-planner-sync/` defines the approved design for a one-way SharePoint
to Planner sync in the Kiwi Team. It specifies the 15-minute recurrence, a bucket and
Planner assignment per authorized agent, the newest 20 tickets per agent by a maintained
assignment timestamp, completed Planner tasks for resolved/closed tickets, complete
ticket/attachment/TicketExchanges content, SharePoint edit links, and safe removal of
only integration-owned tasks that leave the top 20.

The user-created **kiwi tickets** plan must be reused by verified plan ID. The reference
model projects each ticket into an ID/subject title, readable full details, and native
Planner assignment, priority, due date and completion fields. Its Graph payload builder
separates task updates from details/reference updates; writing only a generic description
does not populate those options. Existing unmarked cards require verified source-ticket
mapping before adoption; their identity is never guessed from the description.

`planner-graph-client.cjs` now performs the actual Graph plan/task/detail reads and
conditional writes when supplied an approved token provider. `planner-sync-runner.cjs`
orchestrates reconciliation under a durable exclusive lock, defaults to a content-free
dry run, and requires a persisted create intent before a POST so interrupted runs cannot
blindly duplicate tasks. Its source and durable-state adapters must still be implemented
and connected in the approved tenant host; no authentication or schedule is bundled.

This folder is not an importable or deployed Power Automate package. It
does not create the Planner plan, agent buckets, `PlannerAssignedAtUtc` field,
`PlannerSyncAgents`/`PlannerSyncState` lists, connector connections, or live flows. The
assignment timestamp flow must observe every assignment-change path and backfill
verified assignment times from SharePoint version history; records without a provable
timestamp fail closed. Planner details exceeding 4,000 characters or 15 unique references
fail visibly without truncation. Tenant provisioning, Graph/connector consent, and production activation
require authenticated tenant access, any required consent, and successful controlled
verification; none are performed by this repository. See
`power-automate/kiwi-planner-sync/DEPLOYMENT.md` before any tenant setup.

## Legacy modulow provisioning reference

The remaining provisioning instructions describe the original demonstration tenant.
Do not run them against learn.IT-Kiwi; the Kiwi integration reuses existing lists,
groups, permissions, rules and flows.

Prerequisites:

1. Install PnP.PowerShell: `Install-Module PnP.PowerShell -Scope CurrentUser`.
2. Use an account allowed to create sites and configure permissions.
3. The existing interactive Entra application client ID `9a3dfc8f-3edf-4f21-9db3-2aaa72624188` must retain delegated SharePoint `AllSites.FullControl` consent while provisioning.

Run from PowerShell, supplying the intended site collection administrator:

```powershell
.\scripts\Provision-SupportIt.ps1 -OwnerUpn "sharepoint-admin@modulow.com"
```

The script is idempotent and:

- creates the modern `Support IT` site when absent;
- creates the **Tickets** list with stable English internal names and display labels;
- enables versioning and attachments;
- applies item-level read/write restrictions (`own items` for standard users);
- grants **Everyone except external users** Read at web scope and a custom list-only contributor role without Manage Lists;
- creates an empty **Support IT Agents** group with list Edit access, which bypasses item-level restrictions;
- creates useful views and a modern home page/navigation.

It exits with an explicit error if prerequisites or SharePoint operations fail. It never stores an access token or secret.

## Deploy the app

1. Build the `.sppkg`.
2. Open the tenant App Catalog (`https://modulow.sharepoint.com/sites/appcatalog`, or the configured tenant catalog).
3. Upload `sharepoint/solution/support-it-ticketing.sppkg`.
4. Select **Enable this app and add it to all sites** only if tenant-wide availability is intended; otherwise deploy normally and add the app on the Support IT site.
5. Add the **Support IT** web part to the home page and publish it.
6. For agents, create a restricted page and add the **Support IT Management** web part. The management component only loads ticket data for members of the `Support IT Agents` group.

The page must contain a section before a web part can be added. After the app is installed on the site, run:

```powershell
Connect-PnPOnline -Url "https://modulow.sharepoint.com/sites/support-it" `
  -Interactive -ClientId "9a3dfc8f-3edf-4f21-9db3-2aaa72624188"

$page = Get-PnPPage -Identity "Home.aspx"
if (@($page.Sections).Count -eq 0) {
  Add-PnPPageSection -Page "Home" -SectionTemplate OneColumn -Order 1
}

Add-PnPPageWebPart `
  -Page "Home" `
  -Component "4742c330-3d76-4123-be50-1c6b16ae31bf" `
  -Section 1 `
  -Column 1
Set-PnPPage -Identity "Home" -Publish
```

Remove the provisioning placeholder text in the page editor after confirming that the web part loads. Run `Add-PnPPageWebPart` only once unless you intentionally want another instance.

The same `.sppkg` includes the agent backend. Add it to an agent page with component ID
`2fa58b43-786f-40e9-9fc2-2608969d64d7`:

```powershell
Add-PnPPage -Name "Support-Management" -LayoutType Article -ErrorAction SilentlyContinue
$managementPage = Get-PnPPage -Identity "Support-Management.aspx"
Set-PnPPage -Identity $managementPage -HeaderType None
if (@($managementPage.Sections).Count -eq 0) {
  Add-PnPPageSection -Page "Support-Management" -SectionTemplate OneColumn -Order 1
}

$managementComponent = Get-PnPAvailablePageComponents -Page $managementPage |
  Where-Object {
    $_.Id.ToString().Trim("{}") -eq "2fa58b43-786f-40e9-9fc2-2608969d64d7"
  } |
  Select-Object -First 1
if (-not $managementComponent) {
  throw "Support IT Management is not available. Deploy the latest .sppkg first."
}

Add-PnPPageWebPart `
  -Page "Support-Management" `
  -Component $managementComponent `
  -Section 1 `
  -Column 1
Set-PnPPage -Identity "Support-Management" -Publish

$pageItem = Get-PnPFile -Url "SitePages/Support-Management.aspx" -AsListItem
$owners = Get-PnPGroup -AssociatedOwnerGroup
$readRole = Get-PnPRoleDefinition |
  Where-Object { $_.RoleTypeKind.ToString() -eq "Reader" } |
  Select-Object -First 1
$adminRole = Get-PnPRoleDefinition |
  Where-Object { $_.RoleTypeKind.ToString() -eq "Administrator" } |
  Select-Object -First 1
Set-PnPListItemPermission -List "Site Pages" -Identity $pageItem.Id `
  -Group $owners -AddRole $adminRole.Name -ClearExisting
Set-PnPListItemPermission -List "Site Pages" -Identity $pageItem.Id `
  -Group "Support IT Agents" -AddRole $readRole.Name
if (-not (Get-PnPNavigationNode -Location QuickLaunch |
    Where-Object { $_.Title -eq "Ticket Management" })) {
  Add-PnPNavigationNode -Location QuickLaunch -Title "Ticket Management" `
    -Url "/sites/support-it/SitePages/Support-Management.aspx"
}
```

The commands restrict `Support-Management.aspx` to the Support IT Agents group and site
owners, then expose it as **Ticket Management** in the site navigation. The web part also
performs an authorization check.

After uploading the package, approve its pending **Microsoft Graph /
GroupMember.Read.All** request in the SharePoint admin API access page. This delegated
application permission is required only to expand the existing learn.IT group for the
agent selector. SharePoint list access continues to use the signed-in user's session and
the existing Kiwi permissions.

## Permissions and agents

Defense in depth is applied:

- SharePoint list settings restrict standard users to reading and editing only items they created.
- The client additionally filters non-agent REST queries with `AuthorId eq <current user ID>`.
- The web part exposes all-ticket queries and management controls only when the current user belongs to **Support IT Agents**.
- The separate **Support IT Management** web part provides global metrics, search and filters, assignment, priority, status, due-date and resolution editing for agents.
- Standard internal users receive Read—not Edit—at web scope and list-scoped contributor rights without Manage Lists.

To add an authorized agent:

```powershell
Connect-PnPOnline -Url "https://modulow.sharepoint.com/sites/support-it" `
  -Interactive -ClientId "9a3dfc8f-3edf-4f21-9db3-2aaa72624188"
Add-PnPGroupMember -Group "Support IT Agents" -LoginName "agent@modulow.com"
```

Remove an agent with `Remove-PnPGroupMember`. Keep this group limited to support staff because its Edit role permits management of every ticket.

## Data model

| Internal name | Display label | Type |
|---|---|---|
| `Title` | Subject | Text |
| `Description` | Description | Multiple lines |
| `Category` | Category | Choice |
| `Priority` | Priority | Choice |
| `Status` | Status | Choice |
| `AssignedTo` | Assigned to | Person |
| `DueDate` | Due date | Date/time |
| `Resolution` | Resolution | Multiple lines |
| `Author`, `Created`, `Modified` | Created by, Created, Modified | Built-in |

Attachments are enabled on the list. They can be managed through the standard SharePoint item form; the portal reports attachment presence but does not upload files in this release.

## Temporary provisioning app cleanup

After provisioning, the dedicated Entra app may be removed if no future script runs are needed. In the Entra admin center, locate application ID `9a3dfc8f-3edf-4f21-9db3-2aaa72624188`, revoke its delegated consent, then delete the app registration. This does not affect the deployed SPFx web part. Do not delete it before any planned reruns of the provisioning script.
