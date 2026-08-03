param(
  [string]$ProjectPath,
  [ValidateSet('project', 'user')]
  [string]$Scope = 'project',
  [switch]$Force,
  [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$toolkitRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$skillsSource = Join-Path $toolkitRoot 'skills'
if (-not (Test-Path -LiteralPath $skillsSource)) {
  throw "Missing toolkit skills source directory: $skillsSource"
}

$managedSkills = @(Get-ChildItem -LiteralPath $skillsSource -Directory | Sort-Object Name)
if ($managedSkills.Count -ne 12) {
  throw "Expected 12 managed SDTK-CODE skills but found $($managedSkills.Count)."
}

if ($Scope -eq 'user') {
  $skillsDest = Join-Path $HOME '.claude/skills'
} else {
  if (-not $ProjectPath) {
    throw "ProjectPath is required for Claude project scope installation."
  }
  $projectRoot = (Resolve-Path -LiteralPath $ProjectPath).Path
  $skillsDest = Join-Path $projectRoot '.claude/skills'
}

New-Item -ItemType Directory -Force -Path $skillsDest | Out-Null

$copied = 0
$skipped = 0
foreach ($skillDir in $managedSkills) {
  $skillFile = Join-Path $skillDir.FullName 'SKILL.md'
  if (-not (Test-Path -LiteralPath $skillFile)) {
    throw "Managed skill is missing SKILL.md: $($skillDir.FullName)"
  }

  $destDir = Join-Path $skillsDest $skillDir.Name
  if (Test-Path -LiteralPath $destDir) {
    if (-not $Force) {
      $skipped++
      if (-not $Quiet) {
        Write-Warning "Skill already installed (skipping). Use -Force to overwrite: $($skillDir.Name)"
      }
      continue
    }
    Remove-Item -LiteralPath $destDir -Recurse -Force
  }

  Copy-Item -LiteralPath $skillDir.FullName -Destination $destDir -Recurse -Force
  $copied++
  if (-not $Quiet) {
    Write-Host "Installed: $($skillDir.Name)"
  }
}

$installedNow = @(
  Get-ChildItem -LiteralPath $skillsDest -Directory -ErrorAction SilentlyContinue |
    Where-Object { $managedSkills.Name -contains $_.Name } |
    Select-Object -ExpandProperty Name
)
if ($installedNow.Count -ne 12) {
  throw "Claude skill install incomplete. Expected 12 managed skills at $skillsDest but found $($installedNow.Count)."
}

if (-not $Quiet) {
  Write-Host ""
  Write-Host "Install summary:"
  Write-Host "- Scope: $Scope"
  Write-Host "- Destination: $skillsDest"
  Write-Host "- Copied: $copied"
  Write-Host "- Skipped: $skipped"
}
