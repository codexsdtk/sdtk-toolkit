$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$CliRoot = Split-Path -Parent $ScriptRoot
$AssetsRoot = Join-Path (Join-Path $CliRoot 'assets') 'toolkit'
$ManifestDir = Join-Path (Join-Path $CliRoot 'assets') 'manifest'
$PackageJsonPath = Join-Path $CliRoot 'package.json'
$SourceCommitPaths = @(
  'products/sdtk-code/toolkit/install.ps1',
  'products/sdtk-code/toolkit/scripts/install-claude-skills.ps1',
  'products/sdtk-code/toolkit/scripts/install-codex-skills.ps1',
  'products/sdtk-code/toolkit/scripts/uninstall-claude-skills.ps1',
  'products/sdtk-code/toolkit/scripts/uninstall-codex-skills.ps1',
  'products/sdtk-code/toolkit/AGENTS.md',
  'products/sdtk-code/toolkit/templates/CODE_WORKFLOW_TEMPLATE.md',
  'products/sdtk-code/toolkit/sdtk-spec.config.json',
  'products/sdtk-code/toolkit/sdtk-spec.config.profiles.example.json',
  'products/sdtk-code/toolkit/skills'
)

function Resolve-SourceCommit {
  param(
    [Parameter(Mandatory = $true)]
    [string]$CliRootPath,

    [Parameter(Mandatory = $true)]
    [string[]]$PathScope
  )

  $repoRoot = $null
  try {
    $repoRoot = [string]((git -C $CliRootPath rev-parse --show-toplevel 2>$null) | Select-Object -First 1)
  } catch { }

  if ([string]::IsNullOrWhiteSpace($repoRoot)) {
    return 'unknown'
  }

  $resolvedCommit = $null
  try {
    $resolvedCommit = [string]((git -C $repoRoot log -1 --format=%H -- $PathScope 2>$null) | Select-Object -First 1)
  } catch { }

  if ([string]::IsNullOrWhiteSpace($resolvedCommit)) {
    return 'unknown'
  }

  return [string]$resolvedCommit
}

if (-not (Test-Path -LiteralPath $PackageJsonPath)) {
  Write-Host "[FAIL] package.json not found: $PackageJsonPath" -ForegroundColor Red
  exit 1
}

$PackageJson = Get-Content -Raw -Encoding UTF8 -Path $PackageJsonPath | ConvertFrom-Json
$PayloadVersion = $PackageJson.version
if (-not $PayloadVersion) {
  Write-Host "[FAIL] Could not resolve version from package.json" -ForegroundColor Red
  exit 1
}

if (-not (Test-Path -LiteralPath $AssetsRoot)) {
  Write-Host "[FAIL] Assets directory not found: $AssetsRoot" -ForegroundColor Red
  Write-Host 'Run "npm run build:payload" after the payload sync script is available.'
  exit 1
}

if (-not (Test-Path -LiteralPath $ManifestDir)) {
  New-Item -ItemType Directory -Force -Path $ManifestDir | Out-Null
}

Write-Host "=== SDTK-CODE CLI Payload Manifest Builder ==="
Write-Host "Assets root : $AssetsRoot"
Write-Host "Manifest dir: $ManifestDir"
Write-Host ""

$files = @(
  Get-ChildItem -LiteralPath $AssetsRoot -Recurse -Force |
    Where-Object { -not $_.PSIsContainer } |
    Sort-Object FullName
)
$entries = @()
$hashLines = @()

foreach ($file in $files) {
  $relPath = $file.FullName.Substring($AssetsRoot.Length)
  if ($relPath.StartsWith('\') -or $relPath.StartsWith('/')) {
    $relPath = $relPath.Substring(1)
  }
  $relPath = $relPath -replace '\\', '/'
  $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLower()

  $entries += [pscustomobject]@{
    path = $relPath
    sha256 = $hash
    size = [int64]$file.Length
  }
  $hashLines += "$hash  $relPath"
}

$resolvedSourceCommit = Resolve-SourceCommit -CliRootPath $CliRoot -PathScope $SourceCommitPaths

$manifest = [pscustomobject]@{
  version = $PayloadVersion
  sourceCommit = $resolvedSourceCommit
  fileCount = [int]$entries.Count
  files = $entries
}

$manifestPath = Join-Path $ManifestDir 'toolkit-bundle.manifest.json'
$hashPath = Join-Path $ManifestDir 'toolkit-bundle.sha256.txt'

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$manifestJson = $manifest | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText($manifestPath, $manifestJson, $utf8NoBom)
[System.IO.File]::WriteAllText($hashPath, ($hashLines -join "`n"), $utf8NoBom)

Write-Host "[OK] Manifest: $manifestPath ($($entries.Count) files)" -ForegroundColor Green
Write-Host "[OK] Hash file: $hashPath" -ForegroundColor Green
