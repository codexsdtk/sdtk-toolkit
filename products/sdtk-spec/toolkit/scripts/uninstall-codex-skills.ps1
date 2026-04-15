param(
  [ValidateSet('project', 'user')]
  [string]$Scope = 'user',
  [string]$ProjectPath,
  [string]$SkillName,
  [switch]$All,
  [switch]$BackupExisting,
  [string]$BackupPath
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

function Backup-Directory {
  param(
    [Parameter(Mandatory = $true)][string]$SourcePath,
    [Parameter(Mandatory = $true)][string]$BackupRoot,
    [Parameter(Mandatory = $true)][string]$Name
  )

  if (-not (Test-Path -LiteralPath $SourcePath)) {
    return $null
  }

  New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
  $dest = Join-Path $BackupRoot $Name
  if (Test-Path -LiteralPath $dest) {
    Remove-Item -LiteralPath $dest -Recurse -Force
  }
  Copy-Item -LiteralPath $SourcePath -Destination $dest -Recurse -Force
  return $dest
}

if ($All -and $SkillName) {
  throw "Use either -All or -SkillName, not both."
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$skillsSrc = Join-Path $repoRoot 'skills'
if (-not (Test-Path -LiteralPath $skillsSrc)) {
  throw "Missing toolkit skills source directory: $skillsSrc"
}

$managedSkillNames = Get-ChildItem -LiteralPath $skillsSrc -Directory | Select-Object -ExpandProperty Name
if (-not $managedSkillNames -or $managedSkillNames.Count -eq 0) {
  throw "No managed skills found in: $skillsSrc"
}

$targetNames = @()
if ($SkillName) {
  if ($managedSkillNames -notcontains $SkillName) {
    throw "Skill '$SkillName' is not in managed toolkit skills list. Known skills: $($managedSkillNames -join ', ')"
  }
  $targetNames = @($SkillName)
} elseif ($All) {
  $targetNames = @($managedSkillNames)
} else {
  # Default behavior: uninstall all toolkit-managed skills.
  $targetNames = @($managedSkillNames)
}

$codexHome = Resolve-CodexHome -TargetScope $Scope -TargetProjectPath $ProjectPath
$skillsDest = Join-Path $codexHome 'skills'
if (-not (Test-Path -LiteralPath $skillsDest)) {
  Write-Host "Codex skills directory not found: $skillsDest"
  exit 0
}

$backupRootResolved = $null
if ($BackupExisting) {
  if (-not $BackupPath -or $BackupPath.Trim().Length -eq 0) {
    $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $BackupPath = Join-Path $codexHome (Join-Path 'skills-backups' ("uninstall-" + $timestamp))
  }
  New-Item -ItemType Directory -Force -Path $BackupPath | Out-Null
  $backupRootResolved = (Resolve-Path -LiteralPath $BackupPath).Path
  Write-Host "Backup mode enabled: $backupRootResolved"
}

$removed = New-Object System.Collections.Generic.List[string]
$missing = New-Object System.Collections.Generic.List[string]

foreach ($name in $targetNames) {
  $dest = Join-Path $skillsDest $name
  if (-not (Test-Path -LiteralPath $dest)) {
    $missing.Add($name) | Out-Null
    Write-Warning "Skill not installed, skipping: $name"
    continue
  }

  if ($BackupExisting) {
    $backupDest = Backup-Directory -SourcePath $dest -BackupRoot $backupRootResolved -Name $name
    if ($backupDest) {
      Write-Host "Backed up: $name -> $backupDest"
    }
  }

  Remove-Item -LiteralPath $dest -Recurse -Force
  $removed.Add($name) | Out-Null
  Write-Host "Uninstalled: $name"
}

Write-Host ""
Write-Host "Uninstall summary:"
Write-Host "- Scope: $Scope"
Write-Host "- Destination: $skillsDest"
Write-Host "- Removed: $($removed.Count)"
if ($removed.Count -gt 0) {
  $removed | ForEach-Object { Write-Host "  - $_" }
}
Write-Host "- Missing/Skipped: $($missing.Count)"
if ($missing.Count -gt 0) {
  $missing | ForEach-Object { Write-Host "  - $_" }
}
if ($backupRootResolved) {
  Write-Host "- Backup directory: $backupRootResolved"
}
if ($Scope -eq 'project') {
  Write-Host "- Project-local Codex uninstall touched only SDTK-managed assets under <project>/.codex/skills."
}
