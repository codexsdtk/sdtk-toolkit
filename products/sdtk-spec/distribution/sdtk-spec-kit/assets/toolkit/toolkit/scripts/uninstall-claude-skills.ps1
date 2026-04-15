param(
  [string]$ProjectPath,
  [ValidateSet('project', 'user')]
  [string]$Scope = 'project',
  [string]$SkillName,
  [switch]$All,
  [switch]$BackupExisting,
  [string]$BackupPath
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

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

$toolkitRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$skillsSrc = Join-Path $toolkitRoot 'skills-claude'
if (-not (Test-Path -LiteralPath $skillsSrc)) {
  throw "Missing toolkit Claude skills source directory: $skillsSrc"
}

$managedSkillNames = Get-ChildItem -LiteralPath $skillsSrc -Directory | Select-Object -ExpandProperty Name
if (-not $managedSkillNames -or $managedSkillNames.Count -eq 0) {
  throw "No managed Claude skills found in: $skillsSrc"
}

$targetNames = @()
if ($SkillName) {
  if ($managedSkillNames -notcontains $SkillName) {
    throw "Skill '$SkillName' is not in managed Claude skills list. Known skills: $($managedSkillNames -join ', ')"
  }
  $targetNames = @($SkillName)
} elseif ($All) {
  $targetNames = @($managedSkillNames)
} else {
  $targetNames = @($managedSkillNames)
}

# Resolve destination based on scope
if ($Scope -eq 'user') {
  $skillsDest = Join-Path $HOME '.claude/skills'
} else {
  if (-not $ProjectPath) {
    $ProjectPath = (Resolve-Path (Join-Path $toolkitRoot '..')).Path
  }
  $projectRoot = Resolve-Path -LiteralPath $ProjectPath
  $skillsDest = Join-Path $projectRoot '.claude/skills'
}

if (-not (Test-Path -LiteralPath $skillsDest)) {
  Write-Host "Claude skills directory not found: $skillsDest"
  exit 0
}

$backupRootResolved = $null
if ($BackupExisting) {
  if (-not $BackupPath -or $BackupPath.Trim().Length -eq 0) {
    $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $parentDir = if ($Scope -eq 'user') { Join-Path $HOME '.claude' } else { $projectRoot }
    $BackupPath = Join-Path $parentDir (Join-Path 'skills-backups' ("uninstall-" + $timestamp))
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

# Also remove references directory if uninstalling all
if ($All -or (-not $SkillName)) {
  $refDir = Join-Path $skillsDest 'references'
  if (Test-Path -LiteralPath $refDir) {
    if ($BackupExisting) {
      Backup-Directory -SourcePath $refDir -BackupRoot $backupRootResolved -Name 'references' | Out-Null
      Write-Host "Backed up: references -> $backupRootResolved/references"
    }
    Remove-Item -LiteralPath $refDir -Recurse -Force
    Write-Host "Removed references directory."
  }
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
