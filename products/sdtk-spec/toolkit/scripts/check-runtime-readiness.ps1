param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('claude', 'codex')]
  [string]$Runtime,

  [switch]$Json
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$results = New-Object System.Collections.Generic.List[object]

function Add-Result {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][ValidateSet('PASS', 'WARN', 'FAIL')][string]$Status,
    [Parameter(Mandatory = $true)][string]$Details
  )

  $results.Add([pscustomobject]@{
    name = $Name
    status = $Status
    details = $Details
  }) | Out-Null
}

function Get-CommandPathOrNull {
  param([Parameter(Mandatory = $true)][string]$CommandName)

  try {
    $cmd = Get-Command $CommandName -ErrorAction Stop
    return $cmd.Source
  } catch {
    return $null
  }
}

function Test-WritablePath {
  param([Parameter(Mandatory = $true)][string]$TargetPath)

  $probeDir = $null
  if (Test-Path -LiteralPath $TargetPath) {
    $item = Get-Item -LiteralPath $TargetPath
    if ($item.PSIsContainer) {
      $probeDir = $item.FullName
    } else {
      $probeDir = Split-Path -Parent $item.FullName
    }
  } else {
    $probeDir = Split-Path -Parent $TargetPath
    while ($probeDir -and -not (Test-Path -LiteralPath $probeDir)) {
      $probeDir = Split-Path -Parent $probeDir
    }
  }

  if (-not $probeDir) {
    return [pscustomobject]@{ Writable = $false; Details = 'No existing parent directory found for probe.' }
  }

  $probeFile = Join-Path $probeDir ('.sdtk-write-probe-' + [guid]::NewGuid().ToString('N') + '.tmp')
  try {
    [System.IO.File]::WriteAllText($probeFile, 'ok')
    Remove-Item -LiteralPath $probeFile -Force
    return [pscustomobject]@{ Writable = $true; Details = "Writable via $probeDir" }
  } catch {
    return [pscustomobject]@{ Writable = $false; Details = $_.Exception.Message }
  }
}

function Find-PlantUmlJar {
  if ($env:PLANTUML_JAR -and (Test-Path -LiteralPath $env:PLANTUML_JAR)) {
    return $env:PLANTUML_JAR
  }

  $searchRoots = @(
    (Join-Path $homeRoot '.vscode\extensions'),
    (Join-Path $homeRoot '.vscode-insiders\extensions')
  )

  foreach ($searchRoot in $searchRoots) {
    if (-not (Test-Path -LiteralPath $searchRoot)) { continue }
    $match = Get-ChildItem -Path $searchRoot -Filter 'plantuml.jar' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($match) {
      return $match.FullName
    }
  }

  return $null
}

$toolkitRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$repoRoot = Resolve-Path (Join-Path $toolkitRoot '..')
$homeRoot = $env:HOME
if (-not $homeRoot) {
  $homeRoot = $HOME
}

if ($Runtime -eq 'codex') {
  $cliPath = Get-CommandPathOrNull -CommandName 'codex'
  if ($cliPath) {
    Add-Result -Name 'cli' -Status 'PASS' -Details "codex found at $cliPath"
  } else {
    Add-Result -Name 'cli' -Status 'FAIL' -Details 'codex command not found in PATH'
  }

  $codexHome = $env:CODEX_HOME
  if (-not $codexHome) {
    $codexHome = Join-Path $homeRoot '.codex'
  }

  $authSignals = New-Object System.Collections.Generic.List[string]
  if ($env:OPENAI_API_KEY) { $authSignals.Add('OPENAI_API_KEY') | Out-Null }
  if ($env:CODEX_API_KEY) { $authSignals.Add('CODEX_API_KEY') | Out-Null }
  foreach ($candidate in @((Join-Path $codexHome 'auth.json'), (Join-Path $codexHome 'config.toml'))) {
    if (Test-Path -LiteralPath $candidate) { $authSignals.Add($candidate) | Out-Null }
  }
  if ($authSignals.Count -gt 0) {
    Add-Result -Name 'auth' -Status 'PASS' -Details ('Authentication signal found: ' + ($authSignals -join ', '))
  } else {
    Add-Result -Name 'auth' -Status 'WARN' -Details 'Could not confirm Codex auth via env or config files.'
  }

  $skillPath = Join-Path $codexHome 'skills'
  $writable = Test-WritablePath -TargetPath $skillPath
  if ($writable.Writable) {
    Add-Result -Name 'skill-path' -Status 'PASS' -Details ("$skillPath -- " + $writable.Details)
  } else {
    Add-Result -Name 'skill-path' -Status 'FAIL' -Details ("$skillPath -- " + $writable.Details)
  }
}
else {
  $cliPath = Get-CommandPathOrNull -CommandName 'claude'
  if ($cliPath) {
    Add-Result -Name 'cli' -Status 'PASS' -Details "claude found at $cliPath"
  } else {
    Add-Result -Name 'cli' -Status 'FAIL' -Details 'claude command not found in PATH'
  }

  $authSignals = New-Object System.Collections.Generic.List[string]
  if ($env:ANTHROPIC_API_KEY) { $authSignals.Add('ANTHROPIC_API_KEY') | Out-Null }
  if ($env:CLAUDE_CODE_OAUTH_TOKEN) { $authSignals.Add('CLAUDE_CODE_OAUTH_TOKEN') | Out-Null }
  foreach ($candidate in @((Join-Path $homeRoot '.claude'), (Join-Path $homeRoot '.config\claude'))) {
    if (Test-Path -LiteralPath $candidate) { $authSignals.Add($candidate) | Out-Null }
  }
  if ($authSignals.Count -gt 0) {
    Add-Result -Name 'auth' -Status 'PASS' -Details ('Authentication signal found: ' + ($authSignals -join ', '))
  } else {
    Add-Result -Name 'auth' -Status 'WARN' -Details 'Could not confirm Claude auth via env or local config directories.'
  }

  $projectSkillPath = Join-Path $repoRoot '.claude\skills'
  $projectWritable = Test-WritablePath -TargetPath $projectSkillPath
  if ($projectWritable.Writable) {
    Add-Result -Name 'project-skill-path' -Status 'PASS' -Details ("$projectSkillPath -- " + $projectWritable.Details)
  } else {
    Add-Result -Name 'project-skill-path' -Status 'FAIL' -Details ("$projectSkillPath -- " + $projectWritable.Details)
  }

  $userSkillPath = Join-Path $homeRoot '.claude\skills'
  $userWritable = Test-WritablePath -TargetPath $userSkillPath
  if ($userWritable.Writable) {
    Add-Result -Name 'user-skill-path' -Status 'PASS' -Details ("$userSkillPath -- " + $userWritable.Details)
  } else {
    Add-Result -Name 'user-skill-path' -Status 'FAIL' -Details ("$userSkillPath -- " + $userWritable.Details)
  }
}

$requiredFiles = @(
  (Join-Path $toolkitRoot 'AGENTS.md'),
  (Join-Path $toolkitRoot 'sdtk-spec.config.json'),
  (Join-Path $toolkitRoot 'skills\skills.catalog.yaml')
)
if ($Runtime -eq 'codex') {
  $requiredFiles += (Join-Path $toolkitRoot 'runtimes\codex\CODEX_TEMPLATE.md')
} else {
  $requiredFiles += (Join-Path $toolkitRoot 'runtimes\claude\CLAUDE_TEMPLATE.md')
}
$missing = @($requiredFiles | Where-Object { -not (Test-Path -LiteralPath $_) })
if ($missing.Count -eq 0) {
  Add-Result -Name 'required-files' -Status 'PASS' -Details 'Required toolkit runtime files are present.'
} else {
  Add-Result -Name 'required-files' -Status 'FAIL' -Details ('Missing: ' + ($missing -join ', '))
}

$javaPath = Get-CommandPathOrNull -CommandName 'java'
if ($javaPath) {
  Add-Result -Name 'java' -Status 'PASS' -Details "java found at $javaPath"
} else {
  Add-Result -Name 'java' -Status 'WARN' -Details 'java not found; design-layout image rendering may be unavailable.'
}

$plantUmlJar = Find-PlantUmlJar
if ($plantUmlJar) {
  Add-Result -Name 'plantuml-jar' -Status 'PASS' -Details "plantuml.jar found at $plantUmlJar"
} else {
  Add-Result -Name 'plantuml-jar' -Status 'WARN' -Details 'plantuml.jar not found in known locations.'
}

$nodePath = Get-CommandPathOrNull -CommandName 'node'
if ($nodePath) {
  Add-Result -Name 'node' -Status 'PASS' -Details "node found at $nodePath"
} else {
  Add-Result -Name 'node' -Status 'WARN' -Details 'node not found; browser and helper tooling may be unavailable.'
}

$summary = [pscustomobject]@{
  pass = @($results | Where-Object { $_.status -eq 'PASS' }).Count
  warn = @($results | Where-Object { $_.status -eq 'WARN' }).Count
  fail = @($results | Where-Object { $_.status -eq 'FAIL' }).Count
}

$payload = [pscustomobject]@{
  runtime = $Runtime
  results = $results
  summary = $summary
}

if ($Json) {
  $payload | ConvertTo-Json -Depth 6
} else {
  foreach ($result in $results) {
    Write-Host ("[{0}] {1} - {2}" -f $result.status, $result.name, $result.details)
  }
  Write-Host ("Summary: PASS={0} WARN={1} FAIL={2}" -f $summary.pass, $summary.warn, $summary.fail)
}