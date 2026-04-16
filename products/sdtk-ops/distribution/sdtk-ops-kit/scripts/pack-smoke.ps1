$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$CliRoot = Split-Path -Parent $ScriptRoot
$Root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $CliRoot)))
$IsWindowsHost = $env:OS -eq 'Windows_NT'
$NpmCmd = if ($IsWindowsHost) { 'npm.cmd' } else { 'npm' }
$NodeCmd = if ($IsWindowsHost) { 'node.exe' } else { 'node' }

function Invoke-ProcessCapture {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$ArgumentList,
    [Parameter(Mandatory = $true)][string]$WorkingDirectory,
    [hashtable]$Environment = @{}
  )

  $stdoutPath = Join-Path $env:TEMP ("sdtk-ops-smoke-out-" + [guid]::NewGuid().ToString("N") + ".txt")
  $stderrPath = Join-Path $env:TEMP ("sdtk-ops-smoke-err-" + [guid]::NewGuid().ToString("N") + ".txt")
  $savedEnv = @{}

  foreach ($entry in $Environment.GetEnumerator()) {
    $savedEnv[$entry.Key] = [Environment]::GetEnvironmentVariable($entry.Key, 'Process')
    [Environment]::SetEnvironmentVariable($entry.Key, [string]$entry.Value, 'Process')
  }

  try {
    $process = Start-Process `
      -FilePath $FilePath `
      -ArgumentList $ArgumentList `
      -WorkingDirectory $WorkingDirectory `
      -Wait `
      -PassThru `
      -NoNewWindow `
      -RedirectStandardOutput $stdoutPath `
      -RedirectStandardError $stderrPath

    return [pscustomobject]@{
      ExitCode = $process.ExitCode
      StdOut = if (Test-Path -LiteralPath $stdoutPath) { Get-Content -LiteralPath $stdoutPath -Raw -Encoding UTF8 } else { '' }
      StdErr = if (Test-Path -LiteralPath $stderrPath) { Get-Content -LiteralPath $stderrPath -Raw -Encoding UTF8 } else { '' }
    }
  }
  finally {
    foreach ($key in $savedEnv.Keys) {
      [Environment]::SetEnvironmentVariable($key, $savedEnv[$key], 'Process')
    }
    Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
  }
}

function Assert-Success {
  param(
    [Parameter(Mandatory = $true)]$Result,
    [Parameter(Mandatory = $true)][string]$Label
  )

  if ($Result.ExitCode -ne 0) {
    throw "$Label failed.`nSTDOUT:`n$($Result.StdOut)`nSTDERR:`n$($Result.StdErr)"
  }
}

function Assert-Contains {
  param(
    [Parameter(Mandatory = $true)][string]$Text,
    [Parameter(Mandatory = $true)][string]$Needle,
    [Parameter(Mandatory = $true)][string]$Label
  )

  if ($Text -notmatch [regex]::Escape($Needle)) {
    throw "$Label missing expected text: $Needle`nActual:`n$Text"
  }
}

function Write-Gate {
  param(
    [Parameter(Mandatory = $true)][string]$Label
  )

  Write-Host ""
  Write-Host "=== $Label ==="
}

function Write-GatePass {
  param(
    [Parameter(Mandatory = $true)][string]$Label
  )

  Write-Host "[OK] $Label" -ForegroundColor Green
}

function Write-GateInfo {
  param(
    [Parameter(Mandatory = $true)][string]$Label,
    [Parameter(Mandatory = $true)][string]$Value
  )

  Write-Host ("  {0}: {1}" -f $Label, $Value)
}

function Invoke-InstalledCli {
  param(
    [Parameter(Mandatory = $true)][string]$Prefix,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$WorkingDirectory,
    [hashtable]$Environment = @{}
  )

  $binDir = Join-Path $Prefix 'node_modules/.bin'
  $cliBin = if ($IsWindowsHost) { Join-Path $binDir 'sdtk-ops.cmd' } else { Join-Path $binDir 'sdtk-ops' }
  $legacyBin = if ($IsWindowsHost) { Join-Path $binDir 'cli.cmd' } else { Join-Path $binDir 'cli' }

  if (-not (Test-Path -LiteralPath $cliBin)) {
    throw "Installed sdtk-ops binary not found: $cliBin"
  }
  if (Test-Path -LiteralPath $legacyBin) {
    throw "Unexpected legacy cli alias found: $legacyBin"
  }

  if ($IsWindowsHost) {
    return Invoke-ProcessCapture -FilePath 'cmd.exe' -ArgumentList (@('/c', $cliBin) + $Arguments) -WorkingDirectory $WorkingDirectory -Environment $Environment
  }

  return Invoke-ProcessCapture -FilePath $cliBin -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory -Environment $Environment
}

Write-Host "=== SDTK-OPS Pack Smoke ==="
Write-Host "CLI root: $CliRoot"
Write-Host ""

Write-Gate 'Gate 1 - Payload Refresh And Verification'
& (Join-Path $ScriptRoot 'sync-toolkit-assets.ps1')
& (Join-Path $ScriptRoot 'build-toolkit-manifest.ps1')

$verify = Invoke-ProcessCapture -FilePath $NodeCmd -ArgumentList @('-e', "require('./src/lib/toolkit-payload').verify()") -WorkingDirectory $CliRoot
Assert-Success -Result $verify -Label 'Payload verify'
Write-GatePass 'Payload refresh and payload verify'

$tempRoot = Join-Path $env:TEMP ("sdtk-ops-pack-smoke-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null

try {
  Write-Gate 'Gate 2 - Versioned Tarball Creation And Install'
  $pack = Invoke-ProcessCapture -FilePath $NpmCmd -ArgumentList @('pack', '--json', '--pack-destination', $tempRoot) -WorkingDirectory $CliRoot
  Assert-Success -Result $pack -Label 'npm pack'
  $tarballMeta = ($pack.StdOut | ConvertFrom-Json)[0]
  $tarballPath = Join-Path $tempRoot $tarballMeta.filename
  if (-not (Test-Path -LiteralPath $tarballPath)) {
    throw "Packed tarball not found: $tarballPath"
  }

  $prefix = Join-Path $tempRoot 'prefix'
  New-Item -ItemType Directory -Force -Path $prefix | Out-Null
  $install = Invoke-ProcessCapture -FilePath $NpmCmd -ArgumentList @('install', '--prefix', $prefix, $tarballPath) -WorkingDirectory $Root
  Assert-Success -Result $install -Label 'npm install packed tarball'
  Write-GateInfo -Label 'Temp root' -Value $tempRoot
  Write-GateInfo -Label 'Tarball' -Value $tarballPath
  Write-GateInfo -Label 'Prefix' -Value $prefix
  Write-GatePass 'Versioned tarball created and installed into temporary prefix'

  Write-Gate 'Gate 3 - Installed Help Surface'
  $help = Invoke-InstalledCli -Prefix $prefix -Arguments @('--help') -WorkingDirectory $tempRoot
  Assert-Success -Result $help -Label 'installed --help'
  Assert-Contains -Text $help.StdOut -Needle 'SDTK-OPS CLI' -Label 'installed help'
  if ($help.StdOut -match "(?m)^\s*generate\s+") {
    throw "Installed help unexpectedly lists generate as a supported command."
  }
  Write-GatePass 'Installed help surface is truthful'

  Write-Gate 'Gate 4 - Claude Project Init'
  $claudeProject = Join-Path $tempRoot 'claude-project'
  New-Item -ItemType Directory -Force -Path $claudeProject | Out-Null
  $claudeInit = Invoke-InstalledCli -Prefix $prefix -Arguments @('init', '--runtime', 'claude', '--skip-runtime-assets', '--project-path', $claudeProject) -WorkingDirectory $tempRoot
  Assert-Success -Result $claudeInit -Label 'installed claude init'
  foreach ($fileName in @('AGENTS.md', 'sdtk-spec.config.json', 'sdtk-spec.config.profiles.example.json')) {
    if (-not (Test-Path -LiteralPath (Join-Path $claudeProject $fileName))) {
      throw "Claude init missing file: $fileName"
    }
  }
  Write-GateInfo -Label 'Claude project path' -Value $claudeProject
  Write-GatePass 'Claude project init copied the three shared files'

  Write-Gate 'Gate 5 - Claude Project Runtime Install Status Uninstall'
  $claudeInstall = Invoke-InstalledCli -Prefix $prefix -Arguments @('runtime', 'install', '--runtime', 'claude', '--scope', 'project', '--project-path', $claudeProject) -WorkingDirectory $tempRoot
  Assert-Success -Result $claudeInstall -Label 'installed claude runtime install'
  $claudeStatus = Invoke-InstalledCli -Prefix $prefix -Arguments @('runtime', 'status', '--runtime', 'claude', '--project-path', $claudeProject) -WorkingDirectory $tempRoot
  Assert-Success -Result $claudeStatus -Label 'installed claude runtime status'
  Assert-Contains -Text $claudeStatus.StdOut -Needle 'installed (15/15 SDTK-OPS skills)' -Label 'installed claude runtime status'
  $claudeUninstall = Invoke-InstalledCli -Prefix $prefix -Arguments @('runtime', 'uninstall', '--runtime', 'claude', '--scope', 'project', '--project-path', $claudeProject) -WorkingDirectory $tempRoot
  Assert-Success -Result $claudeUninstall -Label 'installed claude runtime uninstall'
  Write-GatePass 'Claude project runtime install, status, and uninstall passed'

  Write-Gate 'Gate 6 - Codex User Init'
  $codexProject = Join-Path $tempRoot 'codex-project'
  $codexHome = Join-Path $tempRoot '.codex-home'
  New-Item -ItemType Directory -Force -Path $codexProject, $codexHome | Out-Null
  $codexEnv = @{ CODEX_HOME = $codexHome }

  $codexInit = Invoke-InstalledCli -Prefix $prefix -Arguments @('init', '--runtime', 'codex', '--skip-runtime-assets', '--project-path', $codexProject) -WorkingDirectory $tempRoot -Environment $codexEnv
  Assert-Success -Result $codexInit -Label 'installed codex init'
  foreach ($fileName in @('AGENTS.md', 'sdtk-spec.config.json', 'sdtk-spec.config.profiles.example.json')) {
    if (-not (Test-Path -LiteralPath (Join-Path $codexProject $fileName))) {
      throw "Codex init missing file: $fileName"
    }
  }
  Write-GateInfo -Label 'Codex project path' -Value $codexProject
  Write-GateInfo -Label 'CODEX_HOME' -Value $codexHome
  Write-GatePass 'Codex init copied the three shared files'

  Write-Gate 'Gate 7 - Codex User Runtime Install Status Uninstall'
  $codexInstall = Invoke-InstalledCli -Prefix $prefix -Arguments @('runtime', 'install', '--runtime', 'codex', '--scope', 'user') -WorkingDirectory $tempRoot -Environment $codexEnv
  Assert-Success -Result $codexInstall -Label 'installed codex runtime install'
  $codexStatus = Invoke-InstalledCli -Prefix $prefix -Arguments @('runtime', 'status', '--runtime', 'codex') -WorkingDirectory $tempRoot -Environment $codexEnv
  Assert-Success -Result $codexStatus -Label 'installed codex runtime status'
  Assert-Contains -Text $codexStatus.StdOut -Needle 'installed (15/15 SDTK-OPS skills)' -Label 'installed codex runtime status'
  if (-not (Test-Path -LiteralPath (Join-Path $codexHome 'skills/sdtk-ops-verify/SKILL.md'))) {
    throw 'Installed Codex smoke payload is missing sdtk-ops-verify.'
  }
  $codexUninstall = Invoke-InstalledCli -Prefix $prefix -Arguments @('runtime', 'uninstall', '--runtime', 'codex', '--all') -WorkingDirectory $tempRoot -Environment $codexEnv
  Assert-Success -Result $codexUninstall -Label 'installed codex runtime uninstall'
  Write-GatePass 'Codex user runtime install, status, and uninstall passed'

  Write-Gate 'Gate 8 - Codex Gate C0 Rejection'
  $blocked = Invoke-InstalledCli -Prefix $prefix -Arguments @('runtime', 'install', '--runtime', 'codex', '--scope', 'project') -WorkingDirectory $tempRoot -Environment $codexEnv
  if ($blocked.ExitCode -eq 0) {
    throw 'Codex project-scope runtime install unexpectedly succeeded.'
  }
  Assert-Contains -Text ($blocked.StdOut + $blocked.StdErr) -Needle 'does not support project-local' -Label 'Codex Gate C0'
  Write-GatePass 'Codex project-scope rejection remained truthful'

  Write-Host ""
  Write-Host "=== SDTK-OPS Pack Smoke Summary ==="
  Write-GatePass 'Installed-binary tarball smoke passed'
}
finally {
  Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
