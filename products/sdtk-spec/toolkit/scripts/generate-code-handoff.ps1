param(
  [Parameter(Mandatory = $true)]
  [string]$FeatureKey,

  [Parameter(Mandatory = $true)]
  [ValidateSet('READY_FOR_SDTK_CODE', 'BLOCKED_FOR_SDTK_CODE')]
  [string]$HandoffStatus,

  [Parameter(Mandatory = $true)]
  [ValidateSet('feature', 'bugfix')]
  [string]$RecommendedLane,

  [Parameter(Mandatory = $true)]
  [string]$FeatureImplPlanPath,

  [Parameter(Mandatory = $true)]
  [string]$RepoConfigRef,

  [string[]]$RequiredRef = @(),
  [string[]]$OptionalRef = @(),
  [string[]]$OpenBlocker = @(),
  [string[]]$ImplementationSlice = @(),
  [string[]]$TestObligation = @(),
  [string[]]$RecoveryNote = @(),
  [string]$ProjectPath,
  [switch]$Force,
  [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-ForwardSlashRelativePath {
  param(
    [Parameter(Mandatory = $true)][string]$PathValue,
    [Parameter(Mandatory = $true)][string]$Label
  )

  if (-not $PathValue) {
    throw "$Label is empty."
  }
  if ($PathValue.Contains('\')) {
    throw "$Label must use repo-relative forward-slash paths: $PathValue"
  }
  if ($PathValue.StartsWith('/')) {
    throw "$Label must be repo-relative, not absolute: $PathValue"
  }
  if ($PathValue -match '^[A-Za-z]:') {
    throw "$Label must be repo-relative, not drive-qualified: $PathValue"
  }
}

function Get-CanonicalStringArray {
  param([AllowNull()][string[]]$Items)

  if ($null -eq $Items) {
    return [string[]]@()
  }

  $result = New-Object System.Collections.Generic.List[string]
  foreach ($item in $Items) {
    if ($null -eq $item) {
      continue
    }
    foreach ($part in ($item -split ',')) {
      $trimmed = $part.Trim()
      if ($trimmed.Length -eq 0) {
        continue
      }
      if (-not $result.Contains($trimmed)) {
        $result.Add($trimmed) | Out-Null
      }
    }
  }
  return [string[]]$result.ToArray()
}

function Assert-PathExistsInProject {
  param(
    [Parameter(Mandatory = $true)][string]$RelativePath,
    [Parameter(Mandatory = $true)][string]$ProjectRoot,
    [Parameter(Mandatory = $true)][string]$Label
  )

  Assert-ForwardSlashRelativePath -PathValue $RelativePath -Label $Label
  $fullPath = Join-Path $ProjectRoot ($RelativePath -replace '/', [System.IO.Path]::DirectorySeparatorChar)
  if (-not (Test-Path -LiteralPath $fullPath)) {
    throw "$Label does not exist: $RelativePath"
  }
}

function Assert-RequiredRefCoverage {
  param(
    [Parameter(Mandatory = $true)][string[]]$RequiredRefs,
    [AllowNull()][string[]]$ImplementationSlices,
    [Parameter(Mandatory = $true)][string]$FeatureKey
  )

  $archPath = "docs/architecture/ARCH_DESIGN_${FeatureKey}.md"
  $backlogPath = "docs/product/BACKLOG_${FeatureKey}.md"
  foreach ($mustHave in @($archPath, $backlogPath)) {
    if ($RequiredRefs -notcontains $mustHave) {
      throw "Required refs must include: $mustHave"
    }
  }

  $sliceText = (($ImplementationSlices | ForEach-Object { $_.ToLowerInvariant() }) -join ' || ')
  if (-not $sliceText) {
    return
  }

  if ($sliceText -match '\b(api|endpoint|contract|service|backend)\b') {
    if (-not ($RequiredRefs | Where-Object { $_ -like 'docs/api/*' })) {
      throw "Implementation slices reference API or backend scope, so required_refs must include at least one docs/api/* source."
    }
  }

  if ($sliceText -match '\b(database|migration|schema|table|sql|db)\b') {
    if (-not ($RequiredRefs | Where-Object { $_ -like 'docs/database/*' })) {
      throw "Implementation slices reference database scope, so required_refs must include at least one docs/database/* source."
    }
  }

  if ($sliceText -match '\b(ui|screen|frontend|page|form|layout)\b') {
    if (-not ($RequiredRefs | Where-Object { $_ -like 'docs/design/*' })) {
      throw "Implementation slices reference UI scope, so required_refs must include at least one docs/design/* source."
    }
  }

  if ($sliceText -match '\b(flow|interaction)\b') {
    if (-not ($RequiredRefs | Where-Object { $_ -like 'docs/specs/*_FLOW_ACTION_SPEC.md' })) {
      throw "Implementation slices reference flow scope, so required_refs must include docs/specs/[FEATURE_KEY]_FLOW_ACTION_SPEC.md."
    }
  }

  if ($sliceText -match '\b(workflow|state|transition|approval|policy|actor|permission|role)\b') {
    if (-not ($RequiredRefs | Where-Object { $_ -like 'docs/specs/*_FLOW_ACTION_SPEC.md' })) {
      throw "Implementation slices reference workflow or state-transition scope, so required_refs must include docs/specs/[FEATURE_KEY]_FLOW_ACTION_SPEC.md."
    }
    if (-not ($RequiredRefs | Where-Object { $_ -like 'docs/database/*' })) {
      throw "Implementation slices reference workflow or state-transition scope, so required_refs must include at least one docs/database/* source."
    }
  }
}

function Get-ImpactMap {
  param(
    [Parameter(Mandatory = $true)][string[]]$RequiredRefs,
    [string[]]$OptionalRefs
  )

  $impactMap = [ordered]@{
    api_refs      = New-Object System.Collections.Generic.List[string]
    database_refs = New-Object System.Collections.Generic.List[string]
    ui_refs       = New-Object System.Collections.Generic.List[string]
    flow_refs     = New-Object System.Collections.Generic.List[string]
  }

  foreach ($pathValue in @($RequiredRefs + $OptionalRefs)) {
    $trimmed = $pathValue.Trim()
    if ($trimmed.Length -eq 0) {
      continue
    }

    if ($trimmed.StartsWith('docs/api/')) {
      if (-not $impactMap.api_refs.Contains($trimmed)) {
        $impactMap.api_refs.Add($trimmed) | Out-Null
      }
      continue
    }

    if ($trimmed.StartsWith('docs/database/')) {
      if (-not $impactMap.database_refs.Contains($trimmed)) {
        $impactMap.database_refs.Add($trimmed) | Out-Null
      }
      continue
    }

    if ($trimmed.StartsWith('docs/design/')) {
      if (-not $impactMap.ui_refs.Contains($trimmed)) {
        $impactMap.ui_refs.Add($trimmed) | Out-Null
      }
      continue
    }

    if ($trimmed.StartsWith('docs/specs/') -and $trimmed.EndsWith('_FLOW_ACTION_SPEC.md')) {
      if (-not $impactMap.flow_refs.Contains($trimmed)) {
        $impactMap.flow_refs.Add($trimmed) | Out-Null
      }
    }
  }

  return [ordered]@{
    api_refs      = @($impactMap.api_refs.ToArray())
    database_refs = @($impactMap.database_refs.ToArray())
    ui_refs       = @($impactMap.ui_refs.ToArray())
    flow_refs     = @($impactMap.flow_refs.ToArray())
  }
}

if ($ProjectPath) {
  if (-not (Test-Path -LiteralPath $ProjectPath)) {
    New-Item -ItemType Directory -Force -Path $ProjectPath | Out-Null
  }
  $projectRoot = Resolve-Path -LiteralPath $ProjectPath
} else {
  $toolkitRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
  $projectRoot = Resolve-Path (Join-Path $toolkitRoot '..')
}

$FeatureKey = $FeatureKey.Trim()
if ($FeatureKey -notmatch '^[A-Z][A-Z0-9_]*$') {
  throw "Invalid FeatureKey. Use UPPER_SNAKE_CASE (A-Z, 0-9, _)."
}

if ($RepoConfigRef -ne 'sdtk-spec.config.json') {
  throw "RepoConfigRef must be exactly 'sdtk-spec.config.json'."
}

$FeatureImplPlanPath = $FeatureImplPlanPath.Trim()
$RequiredRefs = @(Get-CanonicalStringArray -Items $RequiredRef)
$OptionalRefs = @(Get-CanonicalStringArray -Items $OptionalRef)
$OpenBlockers = @(Get-CanonicalStringArray -Items $OpenBlocker)
$ImplementationSlices = @(Get-CanonicalStringArray -Items $ImplementationSlice)
$TestObligations = @(Get-CanonicalStringArray -Items $TestObligation)
$RecoveryNotes = @(Get-CanonicalStringArray -Items $RecoveryNote)

Assert-PathExistsInProject -RelativePath $RepoConfigRef -ProjectRoot $projectRoot -Label 'RepoConfigRef'
Assert-PathExistsInProject -RelativePath $FeatureImplPlanPath -ProjectRoot $projectRoot -Label 'FeatureImplPlanPath'

$expectedPlanPath = "docs/dev/FEATURE_IMPL_PLAN_${FeatureKey}.md"
if ($FeatureImplPlanPath -ne $expectedPlanPath) {
  throw "FeatureImplPlanPath must match the current feature key: $expectedPlanPath"
}

foreach ($pathValue in $RequiredRefs) {
  Assert-PathExistsInProject -RelativePath $pathValue -ProjectRoot $projectRoot -Label 'RequiredRef'
}
foreach ($pathValue in $OptionalRefs) {
  Assert-ForwardSlashRelativePath -PathValue $pathValue -Label 'OptionalRef'
  $fullPath = Join-Path $projectRoot ($pathValue -replace '/', [System.IO.Path]::DirectorySeparatorChar)
  if (-not (Test-Path -LiteralPath $fullPath)) {
    throw "OptionalRef does not exist: $pathValue"
  }
}

Assert-RequiredRefCoverage -RequiredRefs $RequiredRefs -ImplementationSlices $ImplementationSlices -FeatureKey $FeatureKey

if ($HandoffStatus -eq 'READY_FOR_SDTK_CODE') {
  if ($OpenBlockers.Count -ne 0) {
    throw "READY_FOR_SDTK_CODE requires an empty open_blockers list."
  }
  if ($ImplementationSlices.Count -eq 0) {
    throw "READY_FOR_SDTK_CODE requires at least one implementation slice."
  }
  if ($TestObligations.Count -eq 0) {
    throw "READY_FOR_SDTK_CODE requires at least one test obligation."
  }
} else {
  if ($OpenBlockers.Count -eq 0) {
    throw "BLOCKED_FOR_SDTK_CODE requires at least one open blocker."
  }
}

$docsDevDir = Join-Path $projectRoot 'docs\dev'
if (-not (Test-Path -LiteralPath $docsDevDir)) {
  New-Item -ItemType Directory -Force -Path $docsDevDir | Out-Null
}
$handoffRelPath = "docs/dev/CODE_HANDOFF_${FeatureKey}.json"
$handoffFullPath = Join-Path $projectRoot ($handoffRelPath -replace '/', [System.IO.Path]::DirectorySeparatorChar)

if ((Test-Path -LiteralPath $handoffFullPath) -and -not $Force -and -not $ValidateOnly) {
  throw "Refusing to overwrite existing CODE_HANDOFF file (use -Force): $handoffRelPath"
}

$generatedAt = (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz')
$payload = [ordered]@{
  schema_version = '0.2'
  feature_key = $FeatureKey
  generated_by = 'sdtk-dev'
  generated_at = $generatedAt
  handoff_status = $HandoffStatus
  recommended_lane = $RecommendedLane
  feature_impl_plan_path = $FeatureImplPlanPath
  required_refs = @($RequiredRefs)
  optional_refs = @($OptionalRefs)
  open_blockers = @($OpenBlockers)
  implementation_slices = @($ImplementationSlices)
  impact_map = Get-ImpactMap -RequiredRefs $RequiredRefs -OptionalRefs $OptionalRefs
  test_obligations = @($TestObligations)
  repo_config_ref = $RepoConfigRef
}

if ($RecoveryNotes.Count -gt 0) {
  $payload.recovery_notes = @($RecoveryNotes)
}

if ($ValidateOnly) {
  Write-Host "Validation only: SDTK-CODE handoff contract is valid."
  return
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$json = $payload | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($handoffFullPath, $json + [Environment]::NewLine, $utf8NoBom)

Write-Host "SDTK-CODE handoff status: $HandoffStatus"
if ($HandoffStatus -eq 'READY_FOR_SDTK_CODE') {
  Write-Host 'Suggested next step:'
  Write-Host "sdtk-code start --feature-key $FeatureKey --lane $RecommendedLane --project-path ."
} else {
  Write-Host 'SDTK-CODE handoff blockers:'
  foreach ($blocker in $OpenBlockers) {
    Write-Host "- $blocker"
  }
  Write-Host 'No SDTK-CODE start command is suggested until blockers are resolved.'
}
