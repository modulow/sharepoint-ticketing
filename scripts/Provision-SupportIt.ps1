[CmdletBinding()]
param(
    [Parameter()]
    [string]$TenantAdminUrl = "https://modulow-admin.sharepoint.com",

    [Parameter()]
    [string]$SiteUrl = "https://modulow.sharepoint.com/sites/support-it",

    [Parameter()]
    [string]$SiteTitle = "Support IT",

    [Parameter()]
    [string]$ClientId = "9a3dfc8f-3edf-4f21-9db3-2aaa72624188",

    [Parameter(Mandatory)]
    [string]$OwnerUpn
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$listTitle = "Tickets"
$agentsGroup = "Support IT Agents"
$contributorRole = "Support IT Ticket Contributor"

function Write-Step {
    param([Parameter(Mandatory)][string]$Message)
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Get-LocalizedRoleName {
    param(
        [Parameter(Mandatory)]
        [ValidateSet("Reader", "Contributor", "Editor", "Administrator")]
        [string]$RoleTypeKind
    )

    $role = Get-PnPRoleDefinition |
        Where-Object { $_.RoleTypeKind.ToString() -eq $RoleTypeKind } |
        Select-Object -First 1
    if (-not $role) {
        throw "The built-in SharePoint role with RoleTypeKind '$RoleTypeKind' could not be resolved."
    }

    return $role.Name
}

function Ensure-Field {
    param(
        [Parameter(Mandatory)][string]$InternalName,
        [Parameter(Mandatory)][string]$DisplayName,
        [Parameter(Mandatory)][ValidateSet("Note", "Choice", "User", "DateTime")][string]$Type,
        [string[]]$Choices
    )

    $field = Get-PnPField -List $listTitle -Identity $InternalName -ErrorAction SilentlyContinue
    if (-not $field) {
        $parameters = @{
            List         = $listTitle
            DisplayName  = $DisplayName
            InternalName = $InternalName
            Type         = $Type
            AddToDefaultView = $false
        }
        if ($Choices) {
            $parameters.Choices = $Choices
        }
        Add-PnPField @parameters | Out-Null
        Write-Host "Created field $DisplayName ($InternalName)."
    }

    Set-PnPField -List $listTitle -Identity $InternalName -Values @{ Title = $DisplayName } | Out-Null
}

function Ensure-View {
    param(
        [Parameter(Mandatory)][string]$Title,
        [Parameter(Mandatory)][string[]]$Fields,
        [Parameter(Mandatory)][string]$Query
    )

    $view = Get-PnPView -List $listTitle -Identity $Title -ErrorAction SilentlyContinue
    if ($view) {
        Set-PnPView -List $listTitle -Identity $Title -Fields $Fields -Values @{ ViewQuery = $Query; RowLimit = 100 } | Out-Null
    }
    else {
        Add-PnPView -List $listTitle -Title $Title -Fields $Fields -Query $Query -RowLimit 100 | Out-Null
    }
}

try {
    if (-not (Get-Module -ListAvailable -Name PnP.PowerShell)) {
        throw "PnP.PowerShell is not installed. Run: Install-Module PnP.PowerShell -Scope CurrentUser"
    }

    Import-Module PnP.PowerShell
    Write-Step "Connecting to the SharePoint admin center"
    Connect-PnPOnline -Url $TenantAdminUrl -Interactive -ClientId $ClientId

    $site = Get-PnPTenantSite -Identity $SiteUrl -ErrorAction SilentlyContinue
    if (-not $site) {
        Write-Step "Creating the modern Support IT site"
        New-PnPSite `
            -Type TeamSiteWithoutMicrosoft365Group `
            -Title $SiteTitle `
            -Url $SiteUrl `
            -Owner $OwnerUpn `
            -Lcid 1033 `
            -TimeZone 3 | Out-Null
    }
    else {
        Write-Host "Site already exists: $SiteUrl"
    }

    Write-Step "Connecting to the Support IT site"
    Connect-PnPOnline -Url $SiteUrl -Interactive -ClientId $ClientId

    $web = Get-PnPWeb -Includes Title
    if ($web.Title -ne $SiteTitle) {
        Set-PnPWeb -Title $SiteTitle
    }

    Write-Step "Resolving the tenant-wide internal-users principal"
    $tenantId = Get-PnPTenantId
    $internalUsersLogin = "c:0-.f|rolemanager|spo-grid-all-users/$tenantId"
    $internalUsers = New-PnPUser -LoginName $internalUsersLogin

    $readerRoleName = Get-LocalizedRoleName -RoleTypeKind "Reader"
    $contributeRoleName = Get-LocalizedRoleName -RoleTypeKind "Contributor"
    $editorRoleName = Get-LocalizedRoleName -RoleTypeKind "Editor"
    $administratorRoleName = Get-LocalizedRoleName -RoleTypeKind "Administrator"

    Set-PnPWebPermission -User $internalUsers.LoginName -AddRole $readerRoleName | Out-Null

    Write-Step "Creating the agent group and least-privilege contributor role"
    $agentGroup = Get-PnPGroup -Identity $agentsGroup -ErrorAction SilentlyContinue
    if (-not $agentGroup) {
        New-PnPGroup -Title $agentsGroup -Description "Support agents authorized to manage every ticket." | Out-Null
    }

    $role = Get-PnPRoleDefinition -Identity $contributorRole -ErrorAction SilentlyContinue
    if (-not $role) {
        Add-PnPRoleDefinition `
            -RoleName $contributorRole `
            -Clone $contributeRoleName `
            -Exclude ManageLists, ManagePermissions, ManageWeb | Out-Null
    }

    Write-Step "Creating and configuring the Tickets list"
    $list = Get-PnPList -Identity $listTitle -ErrorAction SilentlyContinue
    if (-not $list) {
        Add-PnPList -Title $listTitle -Template GenericList -OnQuickLaunch | Out-Null
    }

    Set-PnPList `
        -Identity $listTitle `
        -EnableAttachments $true `
        -EnableVersioning $true `
        -MajorVersions 50 `
        -ReadSecurity 2 `
        -WriteSecurity 2 | Out-Null

    Set-PnPField -List $listTitle -Identity "Title" -Values @{
        Title = "Subject"
        Required = $true
    } | Out-Null

    Ensure-Field -InternalName "Description" -DisplayName "Description" -Type Note
    Ensure-Field -InternalName "Category" -DisplayName "Category" -Type Choice -Choices @(
        "Hardware", "Software", "Access", "Network", "Telephony", "Other"
    )
    Ensure-Field -InternalName "Priority" -DisplayName "Priority" -Type Choice -Choices @(
        "Low", "Normal", "High", "Critical"
    )
    Ensure-Field -InternalName "Status" -DisplayName "Status" -Type Choice -Choices @(
        "New", "In progress", "Waiting", "Resolved", "Closed"
    )
    Ensure-Field -InternalName "AssignedTo" -DisplayName "Assigned to" -Type User
    Ensure-Field -InternalName "DueDate" -DisplayName "Due date" -Type DateTime
    Ensure-Field -InternalName "Resolution" -DisplayName "Resolution" -Type Note

    Set-PnPField -List $listTitle -Identity "Category" -Values @{ Required = $true; DefaultValue = "Software" } | Out-Null
    Set-PnPField -List $listTitle -Identity "Priority" -Values @{ Required = $true; DefaultValue = "Normal" } | Out-Null
    Set-PnPField -List $listTitle -Identity "Status" -Values @{ Required = $true; DefaultValue = "New" } | Out-Null

    Write-Step "Applying list permissions"
    Set-PnPList -Identity $listTitle -BreakRoleInheritance -CopyRoleAssignments:$false -ClearSubscopes:$true | Out-Null
    Set-PnPListPermission -Identity $listTitle -User $internalUsers.LoginName -AddRole $contributorRole | Out-Null
    Set-PnPListPermission -Identity $listTitle -Group $agentsGroup -AddRole $editorRoleName | Out-Null
    Set-PnPListPermission -Identity $listTitle -User $OwnerUpn -AddRole $administratorRoleName | Out-Null

    Write-Step "Creating list views"
    $viewFields = @("ID", "Title", "Category", "Priority", "Status", "AssignedTo", "DueDate", "Author", "Created", "Modified")
    Ensure-View -Title "All tickets" -Fields $viewFields -Query "<OrderBy><FieldRef Name='Modified' Ascending='FALSE'/></OrderBy>"
    Ensure-View -Title "Open tickets" -Fields $viewFields -Query "<Where><And><Neq><FieldRef Name='Status'/><Value Type='Choice'>Resolved</Value></Neq><Neq><FieldRef Name='Status'/><Value Type='Choice'>Closed</Value></Neq></And></Where><OrderBy><FieldRef Name='Priority' Ascending='FALSE'/><FieldRef Name='Created' Ascending='TRUE'/></OrderBy>"
    Ensure-View -Title "My tickets" -Fields $viewFields -Query "<Where><Eq><FieldRef Name='Author'/><Value Type='Integer'><UserID/></Value></Eq></Where><OrderBy><FieldRef Name='Modified' Ascending='FALSE'/></OrderBy>"

    Write-Step "Preparing the modern home page and navigation"
    $page = Get-PnPPage -Identity "Home.aspx" -ErrorAction SilentlyContinue
    if (-not $page) {
        Add-PnPPage -Name "Home" -LayoutType Home -Publish | Out-Null
        Add-PnPPageTextPart -Page "Home" -Text "<h2>Support IT</h2><p>Add the <strong>Support IT</strong> web part to this page after deploying the SPFx package.</p>" -Section 1 -Column 1 | Out-Null
        Set-PnPPage -Identity "Home" -Publish | Out-Null
    }
    Set-PnPHomePage -RootFolderRelativeUrl "SitePages/Home.aspx"

    if (-not (Get-PnPNavigationNode -Location QuickLaunch | Where-Object { $_.Title -eq "Support IT" })) {
        Add-PnPNavigationNode -Location QuickLaunch -Title "Support IT" -Url "$SiteUrl/SitePages/Home.aspx" | Out-Null
    }
    if (-not (Get-PnPNavigationNode -Location QuickLaunch | Where-Object { $_.Title -eq "Tickets" })) {
        Add-PnPNavigationNode -Location QuickLaunch -Title "Tickets" -Url "$SiteUrl/Lists/Tickets/AllItems.aspx" | Out-Null
    }

    Write-Host "`nProvisioning completed successfully: $SiteUrl" -ForegroundColor Green
    Write-Host "The '$agentsGroup' group is intentionally empty. Add authorized agents explicitly."
}
catch {
    Write-Error "Support IT provisioning failed: $($_.Exception.Message)"
    exit 1
}
finally {
    Disconnect-PnPOnline -ErrorAction SilentlyContinue
}
