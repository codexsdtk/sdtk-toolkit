$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$CliRoot = Split-Path -Parent $ScriptRoot
$ProductRoot = Split-Path -Parent (Split-Path -Parent $CliRoot)
$AssetsRoot = Join-Path (Join-Path $CliRoot 'assets') 'toolkit'

$FilesToSync = @(
  'toolkit/AGENTS.md',
  'toolkit/install.ps1',
  'toolkit/sdtk-spec.config.json',
  'toolkit/sdtk-spec.config.profiles.example.json',
  'toolkit/SDTKOPS_TOOLKIT.md'
)

$DirsToSync = @(
  'toolkit/skills'
)

$RuntimeScriptRelPaths = @(
  'toolkit/scripts/install-claude-skills.ps1',
  'toolkit/scripts/install-codex-skills.ps1',
  'toolkit/scripts/uninstall-claude-skills.ps1',
  'toolkit/scripts/uninstall-codex-skills.ps1'
)

function Ensure-ParentDirectory {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $parent = Split-Path -Parent $Path
  if (-not (Test-Path -LiteralPath $parent)) {
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
  }
}

function Write-Utf8NoBomFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [string]$Content
  )

  Ensure-ParentDirectory -Path $Path
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Write-RuntimeCompatibilityStub {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [string]$ScriptName
  )

  $content = @"
param()

`$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Write-Error "SDTK-OPS payload script '$ScriptName' is not implemented yet. Plan A Batch A3 installs the real runtime behavior."
exit 1
"@

  Write-Utf8NoBomFile -Path $Path -Content $content
}

Write-Host "=== SDTK-OPS CLI Payload Sync ==="
Write-Host "Product root: $ProductRoot"
Write-Host "Assets root : $AssetsRoot"
Write-Host "Policy      : package runtime payload; no repo-relative reads"
Write-Host ""

if (Test-Path -LiteralPath $AssetsRoot) {
  Remove-Item -LiteralPath $AssetsRoot -Recurse -Force
  Write-Host "Cleaned previous assets directory."
}

$errors = @()
$copiedCount = 0
$generatedCount = 0

foreach ($relPath in $FilesToSync) {
  $src = Join-Path $ProductRoot $relPath
  if (-not (Test-Path -LiteralPath $src)) {
    $errors += "MISSING: $relPath"
    continue
  }

  $dest = Join-Path $AssetsRoot $relPath
  Ensure-ParentDirectory -Path $dest
  Copy-Item -LiteralPath $src -Destination $dest -Force
  $copiedCount++
}

foreach ($relDir in $DirsToSync) {
  $srcDir = Join-Path $ProductRoot $relDir
  if (-not (Test-Path -LiteralPath $srcDir)) {
    $errors += "MISSING DIR: $relDir"
    continue
  }

  $destDir = Join-Path $AssetsRoot $relDir
  New-Item -ItemType Directory -Force -Path $destDir | Out-Null

  $files = Get-ChildItem -LiteralPath $srcDir -Recurse -File |
    Where-Object { $_.Name -ne 'placeholder.md' } |
    Sort-Object FullName

  foreach ($file in $files) {
    $relFilePath = $file.FullName.Substring($srcDir.Length).TrimStart('\', '/')
    $destFile = Join-Path $destDir $relFilePath
    Ensure-ParentDirectory -Path $destFile
    Copy-Item -LiteralPath $file.FullName -Destination $destFile -Force
    $copiedCount++
  }
}

foreach ($relPath in $RuntimeScriptRelPaths) {
  $src = Join-Path $ProductRoot $relPath
  $dest = Join-Path $AssetsRoot $relPath
  if (Test-Path -LiteralPath $src) {
    Ensure-ParentDirectory -Path $dest
    Copy-Item -LiteralPath $src -Destination $dest -Force
    $copiedCount++
    continue
  }

  $scriptName = Split-Path -Leaf $relPath
  Write-RuntimeCompatibilityStub -Path $dest -ScriptName $scriptName
  $generatedCount++
}

Write-Host ""
if ($errors.Count -gt 0) {
  Write-Host "[FAIL] Payload sync failed. Missing required sources:" -ForegroundColor Red
  $errors | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
  exit 1
}

Write-Host "[OK] Copied $copiedCount files to assets/toolkit/." -ForegroundColor Green
Write-Host "[OK] Generated $generatedCount compatibility runtime stubs under assets/toolkit/toolkit/scripts/." -ForegroundColor Green
