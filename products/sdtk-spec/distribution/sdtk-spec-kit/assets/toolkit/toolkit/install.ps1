param(
  [string]$ProjectPath,
  [switch]$Force,
  [switch]$SkipSkills,
  [switch]$SkipRuntimeAssets,
  [switch]$Quiet,
  [ValidateSet('codex', 'claude')]
  [string]$Runtime = 'codex',
  [ValidateSet('project', 'user', '')]
  [string]$Scope = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-FileSha256 {
  param(
    [Parameter(Mandatory = $true)][string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return $null
  }

  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $hashBytes = $sha.ComputeHash($stream)
    return [BitConverter]::ToString($hashBytes).Replace('-', '')
  } finally {
    $stream.Close()
  }
}

function Copy-File {
  param(
    [Parameter(Mandatory = $true)][string]$SourcePath,
    [Parameter(Mandatory = $true)][string]$DestinationPath,
    [Parameter(Mandatory = $true)][bool]$Overwrite
  )

  if (-not (Test-Path -LiteralPath $SourcePath)) {
    throw "Missing source: $SourcePath"
  }

  if (Test-Path -LiteralPath $DestinationPath) {
    if (-not $Overwrite) {
      Write-Warning "Already exists (skipping). Use -Force to overwrite: $DestinationPath"
      return
    }
  }

  $parent = Split-Path -Parent $DestinationPath
  if ($parent -and -not (Test-Path -LiteralPath $parent)) {
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
  }

  Copy-Item -LiteralPath $SourcePath -Destination $DestinationPath -Force
}

function Get-ClaudeManagedReferenceSources {
  param(
    [Parameter(Mandatory = $true)][string]$SkillName
  )

  switch ($SkillName) {
    'api-doc' { return @(
      'templates/docs/api/YAML_CREATION_RULES.md',
      'templates/docs/api/API_DESIGN_FLOWCHART_CREATION_RULES.md'
    ) }
    'api-design-spec' { return @(
      'templates/docs/api/API_DESIGN_FLOWCHART_CREATION_RULES.md'
    ) }
    'arch' { return @(
      'templates/docs/api/YAML_CREATION_RULES.md',
      'templates/docs/api/API_DESIGN_FLOWCHART_CREATION_RULES.md',
      'templates/docs/specs/FLOW_ACTION_SPEC_CREATION_RULES.md'
    ) }
    'screen-design-spec' { return @(
      'templates/docs/specs/FLOW_ACTION_SPEC_CREATION_RULES.md',
      'skills/sdtk-screen-design-spec/references/numbering-rules.md',
      'skills/sdtk-screen-design-spec/references/figma-mcp.md',
      'skills/sdtk-screen-design-spec/references/excel-image-export.md'
    ) }
    'test-case-spec' { return @(
      'templates/docs/qa/TEST_CASE_CREATION_RULES.md'
    ) }
    default { return @() }
  }
}

function Install-ClaudeSkillDirectory {
  param(
    [Parameter(Mandatory = $true)][System.IO.DirectoryInfo]$SkillDir,
    [Parameter(Mandatory = $true)][string]$SkillsDest,
    [Parameter(Mandatory = $true)][string]$ToolkitRoot,
    [Parameter(Mandatory = $true)][bool]$Overwrite
  )

  $destDir = Join-Path $SkillsDest $SkillDir.Name
  if (Test-Path -LiteralPath $destDir) {
    if (-not $Overwrite) {
      Write-Warning "Already exists (skipping). Use -Force to overwrite: $destDir"
      return $true
    }
    Remove-Item -LiteralPath $destDir -Recurse -Force
  }

  $parent = Split-Path -Parent $destDir
  if ($parent -and -not (Test-Path -LiteralPath $parent)) {
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
  }
  Copy-Item -LiteralPath $SkillDir.FullName -Destination $destDir -Recurse -Force

  $canonicalSkillDir = Join-Path $ToolkitRoot "skills/sdtk-$($SkillDir.Name)"
  foreach ($subDirName in @('scripts', 'prompts')) {
    $srcSubDir = Join-Path $canonicalSkillDir $subDirName
    $destSubDir = Join-Path $destDir $subDirName
    if (-not (Test-Path -LiteralPath $srcSubDir)) {
      continue
    }

    if (Test-Path -LiteralPath $destSubDir) {
      Remove-Item -LiteralPath $destSubDir -Recurse -Force
    }
    Copy-Item -LiteralPath $srcSubDir -Destination $destSubDir -Recurse -Force
  }

  $referenceSources = @(Get-ClaudeManagedReferenceSources -SkillName $SkillDir.Name)
  if ($referenceSources.Count -gt 0) {
    $destRefDir = Join-Path $destDir 'references'
    if (Test-Path -LiteralPath $destRefDir) {
      Remove-Item -LiteralPath $destRefDir -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $destRefDir | Out-Null

    foreach ($relativeSource in $referenceSources) {
      $srcRefPath = Join-Path $ToolkitRoot $relativeSource
      $destRefPath = Join-Path $destRefDir ([System.IO.Path]::GetFileName($relativeSource))
      Copy-File -SourcePath $srcRefPath -DestinationPath $destRefPath -Overwrite $true
    }
  }

  return $true
}

function Install-RuntimeAdapter {
  param(
    [Parameter(Mandatory = $true)][string]$ToolkitRoot,
    [Parameter(Mandatory = $true)][string]$ProjectRoot,
    [Parameter(Mandatory = $true)][string]$RuntimeName,
    [Parameter(Mandatory = $true)][bool]$Overwrite
  )

  if ($RuntimeName -eq 'codex') {
    $source = Join-Path $ToolkitRoot 'runtimes/codex/CODEX_TEMPLATE.md'
    $dest = Join-Path $ProjectRoot 'CODEX.md'
    Copy-File -SourcePath $source -DestinationPath $dest -Overwrite $Overwrite
    return
  }

  if ($RuntimeName -eq 'claude') {
    $source = Join-Path $ToolkitRoot 'runtimes/claude/CLAUDE_TEMPLATE.md'
    $dest = Join-Path $ProjectRoot 'CLAUDE.md'
    Copy-File -SourcePath $source -DestinationPath $dest -Overwrite $Overwrite
    return
  }

  throw "Unsupported runtime: $RuntimeName"
}

function Install-ClaudeSkills {
  param(
    [Parameter(Mandatory = $true)][string]$ToolkitRoot,
    [Parameter(Mandatory = $true)][string]$ProjectRoot,
    [Parameter(Mandatory = $true)][bool]$Overwrite
  )

  $skillsSource = Join-Path $ToolkitRoot 'skills-claude'
  $skillsDest = Join-Path $ProjectRoot '.claude/skills'

  if (-not (Test-Path -LiteralPath $skillsSource)) {
    throw "Claude skills source not found: $skillsSource"
  }

  $skillCount = 0
  foreach ($skillDir in (Get-ChildItem -Path $skillsSource -Directory)) {
    $srcFile = Join-Path $skillDir.FullName 'SKILL.md'
    if (-not (Test-Path -LiteralPath $srcFile)) { continue }

    if (Install-ClaudeSkillDirectory -SkillDir $skillDir -SkillsDest $skillsDest -ToolkitRoot $ToolkitRoot -Overwrite $Overwrite) {
      $skillCount++
    }
  }

  # Remove obsolete shared Claude specialist reference catch-all if it exists
  $legacyRefDest = Join-Path $skillsDest 'references'
  if (Test-Path -LiteralPath $legacyRefDest) {
    Remove-Item -LiteralPath $legacyRefDest -Recurse -Force
  }

  $managedRefCount = 0
  foreach ($skillName in @('arch', 'api-doc', 'api-design-spec', 'screen-design-spec', 'test-case-spec')) {
    $refDir = Join-Path $skillsDest "$skillName/references"
    if (Test-Path -LiteralPath $refDir) {
      $managedRefCount += @(Get-ChildItem -LiteralPath $refDir -File).Count
    }
  }

  # Strict count assertions
  $expectedSkills = 14
  $expectedManagedRefs = 11
  if ($skillCount -ne $expectedSkills) {
    throw "Claude install failed. Expected $expectedSkills skills but installed $skillCount."
  }
  if ($managedRefCount -ne $expectedManagedRefs) {
    throw "Claude install failed. Expected $expectedManagedRefs specialist reference files but installed $managedRefCount."
  }

  Write-Host "  Skills installed: $skillCount"
  Write-Host "  Specialist refs : $managedRefCount"
}

function Test-IsMaintainerRoot {
  param(
    [Parameter(Mandatory = $true)][string]$ProjectRoot,
    [Parameter(Mandatory = $true)][string[]]$Markers
  )

  foreach ($marker in $Markers) {
    if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot $marker))) {
      return $false
    }
  }

  return $true
}

function Get-MaintainerRootInstallMessage {
  param(
    [Parameter(Mandatory = $true)][string]$ProjectRoot
  )

  return @(
    "Refusing to install managed project files into the SDTK maintainer repo root: $ProjectRoot"
    "This install flow would overwrite repo-owned files such as AGENTS.md, CODEX.md, CLAUDE.md, sdtk-spec.config.json, sdtk-spec.config.profiles.example.json."
    "Target a consumer project path instead of the SDTK maintainer monorepo root."
    "If you only need runtime assets, install them into a separate consumer project path rather than the maintainer repo root."
  ) -join "`n"
}

$toolkitRoot = Resolve-Path $PSScriptRoot
$canonicalRulesPath = Join-Path $toolkitRoot 'templates/docs/api/FLOWCHART_CREATION_RULES.md'
$canonicalRulesHash = Get-FileSha256 -Path $canonicalRulesPath
$apiDesignRulesPath = Join-Path $toolkitRoot 'templates/docs/api/API_DESIGN_CREATION_RULES.md'
$apiDesignRulesHash = Get-FileSha256 -Path $apiDesignRulesPath
$flowActionRulesPath = Join-Path $toolkitRoot 'templates/docs/specs/FLOW_ACTION_SPEC_CREATION_RULES.md'
$flowActionRulesHash = Get-FileSha256 -Path $flowActionRulesPath

if (-not $ProjectPath) {
  $ProjectPath = (Resolve-Path (Join-Path $toolkitRoot '..')).Path
}
$projectRoot = Resolve-Path -LiteralPath $ProjectPath

$maintainerRootMarkers = @(
  'governance/ai/core/IMPROVEMENT_BACKLOG.md',
  'products/sdtk-spec/toolkit/install.ps1'
)

if (Test-IsMaintainerRoot -ProjectRoot $projectRoot -Markers $maintainerRootMarkers) {
  throw (Get-MaintainerRootInstallMessage -ProjectRoot $projectRoot)
}

# Merge SkipRuntimeAssets and legacy SkipSkills
if ($SkipRuntimeAssets) { $SkipSkills = $true }

# Default scope: project for Claude, user for Codex
if (-not $Scope -or $Scope -eq '') {
  if ($Runtime -eq 'claude') { $Scope = 'project' }
  else { $Scope = 'user' }
}

if (-not $Quiet) {
  Write-Host "SDTK toolkit : $toolkitRoot"
  Write-Host "Project root : $projectRoot"
  Write-Host "Runtime      : $Runtime"
  if ($canonicalRulesHash) {
    Write-Host "API ruleset  : $canonicalRulesPath"
    Write-Host "Ruleset hash : $canonicalRulesHash"
  } else {
    Write-Warning "API ruleset not found: $canonicalRulesPath"
  }
  if ($apiDesignRulesHash) {
    Write-Host "API design ruleset: $apiDesignRulesPath"
    Write-Host "Ruleset hash      : $apiDesignRulesHash"
  } else {
    Write-Warning "API design ruleset not found: $apiDesignRulesPath"
  }
  if ($flowActionRulesHash) {
    Write-Host "Flow ruleset : $flowActionRulesPath"
    Write-Host "Ruleset hash : $flowActionRulesHash"
  } else {
    Write-Warning "Flow ruleset not found: $flowActionRulesPath"
  }
}

Copy-File -SourcePath (Join-Path $toolkitRoot 'AGENTS.md') -DestinationPath (Join-Path $projectRoot 'AGENTS.md') -Overwrite ([bool]$Force)
Copy-File -SourcePath (Join-Path $toolkitRoot 'sdtk-spec.config.json') -DestinationPath (Join-Path $projectRoot 'sdtk-spec.config.json') -Overwrite ([bool]$Force)
Copy-File -SourcePath (Join-Path $toolkitRoot 'sdtk-spec.config.profiles.example.json') -DestinationPath (Join-Path $projectRoot 'sdtk-spec.config.profiles.example.json') -Overwrite ([bool]$Force)
Copy-File -SourcePath (Join-Path $toolkitRoot 'session/SDTK_ACTIVE_BOOTSTRAP.md') -DestinationPath (Join-Path $projectRoot 'governance/ai/session/SDTK_ACTIVE_BOOTSTRAP.md') -Overwrite ([bool]$Force)
Copy-File -SourcePath (Join-Path $toolkitRoot 'session/SDTK_AGENT_WORKING_RULES.md') -DestinationPath (Join-Path $projectRoot 'governance/ai/session/SDTK_AGENT_WORKING_RULES.md') -Overwrite ([bool]$Force)
Install-RuntimeAdapter -ToolkitRoot $toolkitRoot -ProjectRoot $projectRoot -RuntimeName $Runtime -Overwrite ([bool]$Force)

if (($Runtime -eq 'codex') -and (-not $SkipSkills)) {
  $skillInstaller = Join-Path $toolkitRoot 'scripts/install-codex-skills.ps1'
  if (-not (Test-Path -LiteralPath $skillInstaller)) {
    throw "Missing skill installer script: $skillInstaller"
  }

  Write-Host ""
  Write-Host "Installing Codex skills (scope: $Scope)..."
  if ($Force) {
    & $skillInstaller -Scope $Scope -ProjectPath $projectRoot.ToString() -Force | Out-Host
  } else {
    & $skillInstaller -Scope $Scope -ProjectPath $projectRoot.ToString() | Out-Host
  }
}
elseif (($Runtime -eq 'claude') -and (-not $SkipSkills)) {
  $skillInstaller = Join-Path $toolkitRoot 'scripts/install-claude-skills.ps1'
  if (-not (Test-Path -LiteralPath $skillInstaller)) {
    # Fallback to inline Install-ClaudeSkills for backward compatibility
    Write-Host ""
    Write-Host "Installing Claude Code skills..."
    Install-ClaudeSkills -ToolkitRoot $toolkitRoot -ProjectRoot $projectRoot -Overwrite ([bool]$Force)
  } else {
    Write-Host ""
    Write-Host "Installing Claude Code skills (scope: $Scope)..."
    if ($Force) {
      & $skillInstaller -Scope $Scope -ProjectPath $projectRoot.ToString() -Force | Out-Host
    } else {
      & $skillInstaller -Scope $Scope -ProjectPath $projectRoot.ToString() | Out-Host
    }
  }
}

if (-not $Quiet) {
  Write-Host ""
  Write-Host "Install complete."
  Write-Host "Next:"
  Write-Host "1) Edit project config: $((Join-Path $projectRoot 'sdtk-spec.config.json'))"
  Write-Host "2) Review bootstrap files:"
  Write-Host "   $((Join-Path $projectRoot 'governance/ai/session/SDTK_ACTIVE_BOOTSTRAP.md'))"
  Write-Host "   $((Join-Path $projectRoot 'governance/ai/session/SDTK_AGENT_WORKING_RULES.md'))"
  if ($Runtime -eq 'codex') {
    Write-Host "3) Restart Codex (to load runtime adapter and skills)"
  } else {
    Write-Host "3) Restart Claude Code (to load CLAUDE.md + skills)"
    Write-Host "   Commands: /orchestrator /pm /ba /arch /dev /qa"
  }
  Write-Host '4) Generate feature docs:'
  Write-Host '   sdtk generate --feature-key YOUR_FEATURE --feature-name "Your Feature"'
}
