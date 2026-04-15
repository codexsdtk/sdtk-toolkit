$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$CliRoot = Split-Path -Parent $ScriptRoot
$ProductRoot = Split-Path -Parent (Split-Path -Parent $CliRoot)
$AssetsRoot = Join-Path (Join-Path $CliRoot 'assets') 'toolkit'

# Keep the payload intentionally narrow.
# The workflow-first CLI requires exactly one shipped template:
# toolkit/templates/CODE_WORKFLOW_TEMPLATE.md
# Do not bulk-sync toolkit/templates/**.
$FilesToSync = @(
  'toolkit/install.ps1',
  'toolkit/scripts/install-claude-skills.ps1',
  'toolkit/scripts/install-codex-skills.ps1',
  'toolkit/scripts/uninstall-claude-skills.ps1',
  'toolkit/scripts/uninstall-codex-skills.ps1',
  'toolkit/AGENTS.md',
  'toolkit/templates/CODE_WORKFLOW_TEMPLATE.md',
  'toolkit/sdtk-spec.config.json',
  'toolkit/sdtk-spec.config.profiles.example.json'
)

$DirsToSync = @(
  'toolkit/skills'
)

Write-Host "=== SDTK-CODE CLI Payload Sync ==="
Write-Host "Product root: $ProductRoot"
Write-Host "Assets root : $AssetsRoot"
Write-Host "Policy      : runtime assets plus CODE_WORKFLOW_TEMPLATE.md only"
Write-Host ""

if (Test-Path -LiteralPath $AssetsRoot) {
  Remove-Item -LiteralPath $AssetsRoot -Recurse -Force
  Write-Host "Cleaned previous assets directory."
}

$errors = @()
$syncedCount = 0

foreach ($relPath in $FilesToSync) {
  $src = Join-Path $ProductRoot $relPath
  if (-not (Test-Path -LiteralPath $src)) {
    $errors += "MISSING: $relPath"
    continue
  }

  $dest = Join-Path $AssetsRoot $relPath
  $destDir = Split-Path -Parent $dest
  if (-not (Test-Path -LiteralPath $destDir)) {
    New-Item -ItemType Directory -Force -Path $destDir | Out-Null
  }

  Copy-Item -LiteralPath $src -Destination $dest -Force
  $syncedCount++
}

foreach ($relDir in $DirsToSync) {
  $srcDir = Join-Path $ProductRoot $relDir
  if (-not (Test-Path -LiteralPath $srcDir)) {
    $errors += "MISSING DIR: $relDir"
    continue
  }

  $destDir = Join-Path $AssetsRoot $relDir
  New-Item -ItemType Directory -Force -Path $destDir | Out-Null

  $files = Get-ChildItem -LiteralPath $srcDir -Recurse -File
  foreach ($file in $files) {
    $relFilePath = $file.FullName.Substring($srcDir.Length).TrimStart('\', '/')
    $destFile = Join-Path $destDir $relFilePath
    $destFileDir = Split-Path -Parent $destFile
    if (-not (Test-Path -LiteralPath $destFileDir)) {
      New-Item -ItemType Directory -Force -Path $destFileDir | Out-Null
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
