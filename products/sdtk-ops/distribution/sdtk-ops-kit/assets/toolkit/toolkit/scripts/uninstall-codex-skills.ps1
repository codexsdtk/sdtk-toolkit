param(
  [ValidateSet('project', 'user')]
  [string]$Scope = 'user',
  [string]$ProjectPath,
  [switch]$All,
  [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Resolve-CodexHome {
  param(
    [Parameter(Mandatory = $true)][string]$TargetScope,
    [string]$TargetProjectPath
  )

  if ($TargetScope -eq 'project') {
    if (-not $TargetProjectPath -or $TargetProjectPath.Trim().Length -eq 0) {
      throw "Project-local Codex uninstall requires -ProjectPath."
    }
    if (-not (Test-Path -LiteralPath $TargetProjectPath)) {
      New-Item -ItemType Directory -Force -Path $TargetProjectPath | Out-Null
    }
    $projectRoot = (Resolve-Path -LiteralPath $TargetProjectPath).Path
    return (Join-Path $projectRoot '.codex')
  }

  if ($env:CODEX_HOME) {
    return $env:CODEX_HOME
  }
  return (Join-Path $HOME '.codex')
}

$toolkitRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$skillsSource = Join-Path $toolkitRoot 'skills'
if (-not (Test-Path -LiteralPath $skillsSource)) {
  throw "Missing toolkit skills source directory: $skillsSource"
}

$managedSkillNames = @(
  Get-ChildItem -LiteralPath $skillsSource -Directory |
    Sort-Object Name |
    ForEach-Object { "sdtk-$($_.Name)" }
)
if ($managedSkillNames.Count -ne 15) {
  throw "Expected 15 managed SDTK-OPS skills but found $($managedSkillNames.Count)."
}

$codexHome = Resolve-CodexHome -TargetScope $Scope -TargetProjectPath $ProjectPath
$skillsDest = Join-Path $codexHome 'skills'
if (-not (Test-Path -LiteralPath $skillsDest)) {
  if (-not $Quiet) {
    Write-Host "Codex skills directory not found: $skillsDest"
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
  if ($Scope -eq 'project') {
    Write-Host "- Project-local Codex uninstall touched only SDTK-OPS-managed assets under <project>/.codex/skills."
  }
}
