# Support IT Ticketing for SharePoint Online

Responsive SPFx ticket portal for `https://modulow.sharepoint.com/sites/support-it`. The visual language follows the public `modulow/ep-l-d-brochure` reference—large uppercase headings, modular color blocks, `#1559a4` blue, `#fff000` yellow, pale backgrounds, angled details, and restrained motion—without modifying that repository.

The Europea font files are **not copied** because the reference repository does not publish an explicit reusable font license. The stylesheet uses a local `Europea` installation when available and falls back to Aptos/Segoe UI.

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

## Provision SharePoint

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
5. Add the **Support IT** web part to the home page and publish it. You can use the page editor, or the reliable PnP.PowerShell sequence below.

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

The solution requests no Microsoft Graph or SharePoint API permission grant because it uses the current user's SharePoint session through `SPHttpClient`.

## Permissions and agents

Defense in depth is applied:

- SharePoint list settings restrict standard users to reading and editing only items they created.
- The client additionally filters non-agent REST queries with `AuthorId eq <current user ID>`.
- The web part exposes all-ticket queries and management controls only when the current user belongs to **Support IT Agents**.
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
