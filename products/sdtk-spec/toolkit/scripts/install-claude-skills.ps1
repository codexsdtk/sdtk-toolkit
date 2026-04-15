param(
  [string]$ProjectPath,
  [ValidateSet('project', 'user')]
  [string]$Scope = 'project',
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

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

$toolkitRoot = Resolve-Path (Join-Path $PSScriptRoot '..')

# Resolve destination based on scope
if ($Scope -eq 'user') {
  $skillsDest = Join-Path $HOME '.claude/skills'
  Write-Host "Scope: user (installing to $skillsDest)"
} else {
  if (-not $ProjectPath) {
    $ProjectPath = (Resolve-Path (Join-Path $toolkitRoot '..')).Path
  }
  $projectRoot = Resolve-Path -LiteralPath $ProjectPath
  $skillsDest = Join-Path $projectRoot '.claude/skills'
  Write-Host "Scope: project (installing to $skillsDest)"
}

$skillsSource = Join-Path $toolkitRoot 'skills-claude'
if (-not (Test-Path -LiteralPath $skillsSource)) {
  throw "Claude skills source not found: $skillsSource"
}

$skillCount = 0
foreach ($skillDir in (Get-ChildItem -Path $skillsSource -Directory)) {
  $srcFile = Join-Path $skillDir.FullName 'SKILL.md'
  if (-not (Test-Path -LiteralPath $srcFile)) { continue }

  if (Install-ClaudeSkillDirectory -SkillDir $skillDir -SkillsDest $skillsDest -ToolkitRoot $toolkitRoot -Overwrite ([bool]$Force)) {
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
Write-Host "  Destination     : $skillsDest"
