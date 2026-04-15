param(
  [string]$ProjectPath,
  [ValidateSet('project', 'user')]
  [string]$Scope = 'project',
  [switch]$All,
  [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$toolkitRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$skillsSource = Join-Path $toolkitRoot 'skills'
if (-not (Test-Path -LiteralPath $skillsSource)) {
  throw "Missing toolkit skills source directory: $skillsSource"
}

$managedSkillNames = @(
  Get-ChildItem -LiteralPath $skillsSource -Directory | Sort-Object Name | Select-Object -ExpandProperty Name
)
if ($managedSkillNames.Count -ne 15) {
  throw "Expected 15 managed SDTK-OPS skills but found $($managedSkillNames.Count)."
}

if ($Scope -eq 'user') {
  $skillsDest = Join-Path $HOME '.claude/skills'
} else {
  if (-not $ProjectPath) {
    throw "ProjectPath is required for Claude project scope uninstall."
  }
  if (-not (Test-Path -LiteralPath $ProjectPath)) {
    New-Item -ItemType Directory -Force -Path $ProjectPath | Out-Null
  }
  $projectRoot = (Resolve-Path -LiteralPath $ProjectPath).Path
  $skillsDest = Join-Path $projectRoot '.claude/skills'
}

if (-not (Test-Path -LiteralPath $skillsDest)) {
  if (-not $Quiet) {
    Write-Host "Claude skills directory not found: $skillsDest"
  }
  exit 0
}

$removed = New-Object System.Collections.Generic.List[string]
$missing = New-Object System.Collections.Generic.List[string]
foreach ($name in $managedSkillNames) {
  $dest = Join-Path $skillsDest $name
  if (-not (Test-Path -LiteralPath $dest)) {
    $missing.Add($name) | Out-Null
    continue
  }

  Remove-Item -LiteralPath $dest -Recurse -Force
  $removed.Add($name) | Out-Null
}

if (-not $Quiet) {
  Write-Host ""
  Write-Host "Uninstall summary:"
  Write-Host "- Scope: $Scope"
  Write-Host "- Destination: $skillsDest"
  Write-Host "- Removed: $($removed.Count)"
  Write-Host "- Missing/Skipped: $($missing.Count)"
}
