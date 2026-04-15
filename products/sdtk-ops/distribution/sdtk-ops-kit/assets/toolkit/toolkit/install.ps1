param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('codex', 'claude')]
  [string]$Runtime,

  [string]$ProjectPath,

  [ValidateSet('project', 'user', '')]
  [string]$Scope = '',

  [switch]$Force,
  [switch]$SkipRuntimeAssets,
  [switch]$SkipSkills,
  [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Copy-File {
  param(
    [Parameter(Mandatory = $true)][string]$SourcePath,
    [Parameter(Mandatory = $true)][string]$DestinationPath,
    [Parameter(Mandatory = $true)][bool]$Overwrite
  )

  if (-not (Test-Path -LiteralPath $SourcePath)) {
    throw "Missing source file: $SourcePath"
  }

  if ((Test-Path -LiteralPath $DestinationPath) -and -not $Overwrite) {
    if (-not $Quiet) {
      Write-Warning "Already exists (skipping). Use -Force to overwrite: $DestinationPath"
    }
    return
  }

  $parent = Split-Path -Parent $DestinationPath
  if ($parent -and -not (Test-Path -LiteralPath $parent)) {
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
  }

  Copy-Item -LiteralPath $SourcePath -Destination $DestinationPath -Force
}

function Test-IsMaintainerRoot {
  param(
    [Parameter(Mandatory = $true)][string]$ProjectRoot,
    [Parameter(Mandatory = $true)][string[]]$Markers
  )

  foreach ($marker in $Markers) {
    if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot $marker))) {
      return $false
    }
  }

  return $true
}

function Get-MaintainerRootInstallMessage {
  param(
    [Parameter(Mandatory = $true)][string]$ProjectRoot
  )

  return @(
    "Refusing to install managed project files into the SDTK maintainer repo root: $ProjectRoot"
    "This install flow would overwrite repo-owned files such as AGENTS.md, CODEX.md, CLAUDE.md, sdtk-spec.config.json, sdtk-spec.config.profiles.example.json."
    "Target a consumer project path instead of the SDTK maintainer monorepo root."
    "If you only need runtime assets, install them into a separate consumer project path rather than the maintainer repo root."
  ) -join "`n"
}

function Resolve-OrCreateDirectory {
  param(
    [Parameter(Mandatory = $true)][string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
  }

  return (Resolve-Path -LiteralPath $Path).Path
}

$toolkitRoot = (Resolve-Path -LiteralPath $PSScriptRoot).Path
if (-not $ProjectPath) {
  $ProjectPath = (Get-Location).Path
}
$projectRoot = Resolve-OrCreateDirectory -Path $ProjectPath

$maintainerRootMarkers = @(
  'governance/ai/core/IMPROVEMENT_BACKLOG.md',
  'products/sdtk-ops/toolkit/install.ps1'
)

if (Test-IsMaintainerRoot -ProjectRoot $projectRoot -Markers $maintainerRootMarkers) {
  throw (Get-MaintainerRootInstallMessage -ProjectRoot $projectRoot)
}

if (-not $Scope) {
  $Scope = if ($Runtime -eq 'claude') { 'project' } else { 'user' }
}

if ($SkipSkills) {
  if (-not $Quiet) {
    Write-Warning "-SkipSkills is deprecated. Use -SkipRuntimeAssets instead."
  }
  $SkipRuntimeAssets = $true
}

if (-not $Quiet) {
  Write-Host "SDTK-OPS installer"
  Write-Host "  Runtime: $Runtime"
  Write-Host "  Scope:   $Scope"
  Write-Host "  Project: $projectRoot"
  Write-Host ""
}

$sharedFiles = @(
  'AGENTS.md',
  'sdtk-spec.config.json',
  'sdtk-spec.config.profiles.example.json'
)

foreach ($fileName in $sharedFiles) {
  Copy-File `
    -SourcePath (Join-Path $toolkitRoot $fileName) `
    -DestinationPath (Join-Path $projectRoot $fileName) `
    -Overwrite ([bool]$Force)

  if (-not $Quiet) {
    Write-Host "  [OK] $fileName"
  }
}

if (-not $SkipRuntimeAssets) {
  $scriptPath = if ($Runtime -eq 'claude') {
    Join-Path $toolkitRoot 'scripts/install-claude-skills.ps1'
  } else {
    Join-Path $toolkitRoot 'scripts/install-codex-skills.ps1'
  }

  if (-not (Test-Path -LiteralPath $scriptPath)) {
    throw "Missing runtime installer: $scriptPath"
  }

  if (-not $Quiet) {
    Write-Host ""
    Write-Host "Installing $Runtime runtime assets..."
  }

  $params = @{
    Scope = $Scope
    ProjectPath = $projectRoot
    Quiet = [bool]$Quiet
  }
  if ($Force) {
    $params.Force = $true
  }

  & $scriptPath @params
}

if (-not $Quiet) {
  Write-Host ""
  Write-Host "SDTK-OPS installation complete."
}
