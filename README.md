# Support IT Ticketing for SharePoint Online

**Ticketing route:** https://ep.europa.kiwi/sharepoint-ticketing/

The `docs/` UI now defaults to an agent-only live-tracking landing state, **not a
working live integration**. Its same-origin adapter is disabled until an approved
authentication/API service exists; it shows an explicit unavailable message and
links to the native authenticated Kiwi lists. The isolated browser-only demonstration
is available with `?demo=1`. No private tickets, credentials or tenant tokens are
included in the static assets.

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

As inspected on 4 October 2026, `https://ep.europa.kiwi/sharepoint-ticketing/` serves
an older static demonstration, **not** the authenticated SharePoint web part.
GitHub's Pages API reports source branch `modulow-support-it-ticketing`, directory
`/docs`; merging changes to `main` does not update that configured source.
The published HTML loads `secure-popup.js`, whereas current main integrates popup
behavior into `app.js`. No publishing configuration has been changed.

The published **All tickets** control itself works: DOM interaction with the served
assets renders six samples, two in the resolved filter, one selected ticket, then all
six again when All tickets is clicked. The product gap is that these are samples, not
the user's submitted SharePoint requests. Regression coverage also fixes sample
submission retaining a previous filter, and agent rows incorrectly receiving the
array index as the `opensList` argument or losing their handlers after rerenders.

The new `docs/` default removes sample data from the normal workspace. It retains
the existing stylesheet, hero, navigation, dashboard cards, ticket grids and agent
layout, but displays live-loading/sign-in/denial/unavailable states instead of
inventing tickets. Once an approved service is connected, ticket filters and read-only
detail views operate on its responses held in memory, not browser storage.
Live agent edits and attachment access remain in the native SharePoint queue.
**Create a ticket** still opens the existing Microsoft Lists form directly.
`?demo=1` explicitly selects the separate browser-only sample workspace, local sample
form and local editing; it never calls the protected API. It is not an authorization
switch for the server.

The Europa portal's link is maintained in a separate repository. A same-design external
live workspace requires the approved architecture below, not just static publication.
The Microsoft-only alternative is deploying the SPFx package to the existing Kiwi
SharePoint page and pointing the portal there. Any publication/deployment remains a
separate authorized action. No portal/tenant changes, live writes, flow toggles or live
reply tests are performed by this repository change.

The portal deep link `?action=create` immediately renders the **Create a ticket** landing
view with the secure native intake link. Arrival itself does not attempt a popup; Microsoft
authentication opens only after an explicit click. Ordinary creation buttons still open
intake directly without replacing the current dashboard or list.

The queue, unavailable state and agent workspace expose **Open Kiwi agent queue** and
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

### Cloudflare-first live tracking: approval and provisioning required

**Implemented:** a disabled, strict same-origin browser adapter in
`docs/ticket-data.js`, live-mode UI states and mock/fixture tests.
**Not implemented or provisioned:** an OAuth service, Worker, Access application,
Entra registration, ticket API, cloud secrets, permission grants or production
publication. Turning on the adapter alone cannot provide authentication or data.

The portal repository `modulow/modulow.github.io` currently documents static GitHub
Pages hosting with a custom domain and native SharePoint ticket links. Its
`backend/README.md` records that **Kiwi - Published content API** was blocked by
institutional DLP; the Worker, Wrangler configuration and runtime flow URL were
removed. The approved replacement exports only public content to a SharePoint file
for human review and manual publication. That flow is not a ticket API. Neither this
repository nor the current portal configuration establishes an active Cloudflare
Pages project, Worker route, Access application/policy, bindings or deployed secrets.
Cloudflare availability reported by the owner is not proof those components exist.
No Cloudflare account configuration was inspected or mutated here.

A possible approved target, preserving the UI, is:

```text
Browser -> Cloudflare-hosted /sharepoint-ticketing/ static UI
        -> same-origin /sharepoint-ticketing/auth/* Microsoft sign-in service
        -> same-origin /sharepoint-ticketing/api/tickets protected Worker
           -> server-verified Entra identity + learn.IT group membership
           -> delegated Graph/SharePoint reads under that user's permissions
```

This **must not be used to bypass DLP**. A delegated OAuth API differs technically
from the abandoned Power Automate HTTP flow, but still processes institutional
ticket/people data on Cloudflare infrastructure. Cloudflare Access and Worker Secrets
do not authorize that transfer. Obtain explicit institutional IT/security approval
for that data path, retention, residency and processor configuration before building
or enabling the service. If it is not approved, keep data in Microsoft 365 and use
the authenticated SPFx/native SharePoint page; an identical external live UI cannot
be promised under that constraint.

Provisioning gates for an approved Cloudflare path:

1. Confirm the Cloudflare account/project, approved zone and host, ownership of the
   existing route, and how it coexists with the current GitHub Pages site. Select
   Pages Functions or a same-origin Worker; do not assume either exists. Serve all
   auth/API paths on the same HTTPS origin. Disable or equivalently protect alternate
   Pages preview domains and `workers.dev` entry points.
2. Obtain tenant approval for a **single-tenant Microsoft Entra** registration and
   exact HTTPS callback/logout URIs. Build server-side authorization-code sign-in
   with PKCE, state/nonce checks, issuer/tenant/audience validation, and Secure,
   HttpOnly, appropriately SameSite session cookies. OAuth credentials and delegated
   tokens stay server-side in approved secret/session storage, never in static
   source, browser storage, public content exports or logs. CSRF protection is
   required for any later write API; this adapter only reads.
3. Have administrators approve the least-privilege delegated Graph/SharePoint
   permissions needed to resolve the current user's transitive membership and read
   the Kiwi list/field metadata. Evaluate resource-scoped permissions supported by
   the chosen API; do not substitute broad app-only access for a user who cannot
   read the list. Conditional Access and SharePoint permission denials must remain
   effective.
4. On **every API request**, verify the authenticated institutional identity and
   transitive membership of learn.IT group
   `435074fb-2e8d-4c67-b06a-0359ddc5a939` server-side. Never trust a client-supplied
   agent flag, arbitrary email domain, query parameter, decoded-but-unverified JWT
   or incomplete group claim. Group overage/lookup failure fails closed. Verify
   that each authorized member has full-ticket read permissions on `EuropaTickets`
   (`f673fe2d-9733-46dd-9afe-4bf614c99202`) and that nonmembers/guests cannot bypass
   the gate by direct API calls. The user's group-access requirement is a desired
   policy, not proof of current effective SharePoint permissions.
5. If Cloudflare Access is used as an additional perimeter, configure the Entra
   identity provider and agent policy for both UI and API; verify its signed
   assertions and protect direct origins. Access sign-in is **not** a delegated
   Graph token and cannot replace the Microsoft OAuth/list authorization checks.
6. Implement the ticket adapter against real list metadata, reusing the existing
   `TicketSchema` field resolution behavior (Title/Titre, Descriptif, Demandeur0,
   optional assignment/status/priority/due-date/response fields). Follow pagination
   fully or fail explicitly; never silently return a partial queue. Preserve actual
   values rather than substituting sample agents or statuses. Return only the
   permitted ticket fields and do not proxy arbitrary URLs.
7. Return `401` JSON for no session, `403` JSON for unauthorized agents or denied
   SharePoint access, and explicit errors for upstream/configuration failures.
   Ticket responses require `Cache-Control: private, no-store`, CDN cache bypass,
   JSON content type, no wildcard credentialed CORS, and no sensitive request/
   response logging or static snapshots. Recheck revocation and logout behavior.
8. Test real approved identities: authorized group member, nonmember, guest,
   expired/revoked session and direct API access. Verify no token/data enters
   caches/storage/logs, pagination and complete ticket projections, and existing
   intake/attachment/Teams behavior. Only then enable the adapter's `enabled`
   constant and explicitly publish the approved route/assets. Neither merging this
   PR nor switching the constant provisions a backend.

The UI contract is `GET ./api/tickets` relative to `/sharepoint-ticketing/`, with
same-origin cookies and no browser bearer tokens. `./auth/login` is a **reserved
future service route**, not an existing or simulated login endpoint. It is only
shown after the enabled service returns 401. Redirecting API fetches to HTML sign-in
is rejected. Successful responses must have JSON content type and
`Cache-Control: private, no-store`; missing or public/shared-cache policy is rejected
before parsing tickets. This browser check cannot prevent an upstream cache from
storing a misconfigured response: server/CDN cache bypass remains mandatory.
Requests time out after 15 seconds with an explicit retry message. Navigation away
clears live ticket data/details and invalidates pending responses; back/forward-cache
restoration rechecks access before rendering. Server authorization and logout/
revocation checks are still required and are not implemented by these UI measures.
Responses use `{ "schemaVersion": 1, "tickets": [...] }`, where each
ticket has a unique positive integer `id`, nonnegative integer `attachmentCount`,
and string fields `subject`, `description`, `category`, `priority`, `status`,
`requester`, `assignee`, `modified`, `due`, `resolution`. Empty optional strings
represent unset fields. Unknown properties are discarded, malformed data is rejected
as a whole, and no sample fallback occurs. The projection includes native response
notes and attachment counts; opening attachment contents remains an authenticated
native SharePoint operation. Fixture tests do not establish any live authorization.

The assignment selector expands transitive user members of the real learn.IT Microsoft
365 group through Microsoft Graph, then calls SharePoint `ensureuser` so updates use the
correct site user IDs. It never adds members. If expansion is unavailable, the management
web part reports an explicit error instead of falling back to the incomplete SharePoint
Members group.

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

## Teams reply automation blueprint

`power-automate/kiwi-teams-replies/` contains the validated implementation contract for
polling Kiwi Teams thread replies and staging only literal `@user` replies for the
requester. It includes durable `SourceMessageId` deduplication, effective-permission
checks, activation cutoff, pagination, concurrency control, retry/terminal failure
states, and an actual-agent/native-rule confirmation handshake.

It is intentionally not presented as an importable ZIP: a valid Power Automate package
must be exported from a solution with real connection references and Team/Channel IDs.
See its `DEPLOYMENT.md` for the exact tenant-side build, validation and export steps.

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
