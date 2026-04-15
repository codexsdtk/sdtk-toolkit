<#
.SYNOPSIS
  Syncs required SDTK-SPEC toolkit files into sdtk-spec-kit/assets/toolkit/.
.DESCRIPTION
  Creates a deterministic payload directory for npm packaging.
  Only the files needed by CLI commands (init, generate) and SDTK-SPEC handoff support are synced.
#>

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$CliRoot    = Split-Path -Parent $ScriptRoot
$RepoRoot   = (Resolve-Path (Join-Path $CliRoot '..\..\..\..')).Path
$SpecRoot   = Join-Path $RepoRoot 'products\sdtk-spec'
$AssetsRoot = Join-Path (Join-Path $CliRoot 'assets') 'toolkit'

# --- Files to sync (relative to products/sdtk-spec/) ---
$FilesToSync = @(
  'toolkit/install.ps1',
  'toolkit/scripts/init-feature.ps1',
  'toolkit/scripts/generate-code-handoff.ps1',
  'toolkit/scripts/install-codex-skills.ps1',
  'toolkit/scripts/uninstall-codex-skills.ps1',
  'toolkit/scripts/install-claude-skills.ps1',
  'toolkit/scripts/uninstall-claude-skills.ps1',
  'toolkit/scripts/agents/run-claude-task.ps1',
  'toolkit/scripts/agents/run-codex-task.ps1',
  'toolkit/scripts/agents/validate-mailbox-formal-artifact.py',
  'toolkit/sdtk-spec.config.json',
  'toolkit/sdtk-spec.config.profiles.example.json',
  'toolkit/README.md',
  'toolkit/SDTK_TOOLKIT.md',
  'toolkit/AGENTS.md',
  'toolkit/runtimes/codex/CODEX_TEMPLATE.md',
  'toolkit/runtimes/claude/CLAUDE_TEMPLATE.md'
)

# --- Directories to sync recursively ---
$DirsToSync = @(
  'toolkit/templates',
  'toolkit/skills',
  'toolkit/skills-claude'
)

Write-Host "=== SDTK CLI Payload Sync ==="
Write-Host "Repo root : $RepoRoot"
Write-Host "Assets root: $AssetsRoot"
Write-Host ""

# Clean previous assets
if (Test-Path $AssetsRoot) {
  Remove-Item -Path $AssetsRoot -Recurse -Force
  Write-Host "Cleaned previous assets directory."
}

$syncedCount = 0
$errors = @()

# Sync individual files
foreach ($relPath in $FilesToSync) {
  $src = Join-Path $SpecRoot $relPath
  if (-not (Test-Path -LiteralPath $src)) {
    $errors += "MISSING: $relPath"
    continue
  }
  $dest = Join-Path $AssetsRoot $relPath
  $destDir = Split-Path -Parent $dest
  if (-not (Test-Path $destDir)) {
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
  }
  Copy-Item -LiteralPath $src -Destination $dest -Force
  $syncedCount++
}

# Sync directories recursively
foreach ($relDir in $DirsToSync) {
  $srcDir = Join-Path $SpecRoot $relDir
  if (-not (Test-Path -LiteralPath $srcDir)) {
    $errors += "MISSING DIR: $relDir"
    continue
  }
  $destDir = Join-Path $AssetsRoot $relDir
  if (-not (Test-Path $destDir)) {
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
  }
  $files = Get-ChildItem -Path $srcDir -Recurse -File
  foreach ($file in $files) {
    $relFilePath = $file.FullName.Substring($srcDir.Length).TrimStart('\', '/')
    $destFile = Join-Path $destDir $relFilePath
    $destFileDir = Split-Path -Parent $destFile
    if (-not (Test-Path $destFileDir)) {
      New-Item -ItemType Directory -Path $destFileDir -Force | Out-Null
    }
    Copy-Item -LiteralPath $file.FullName -Destination $destFile -Force
    $syncedCount++
  }
}

Write-Host ""
if ($errors.Count -gt 0) {
  Write-Host "[FAIL] Payload sync failed. Missing sources:" -ForegroundColor Red
  $errors | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
  exit 1
}

Write-Host "[OK] Synced $syncedCount files to assets/toolkit/." -ForegroundColor Green
