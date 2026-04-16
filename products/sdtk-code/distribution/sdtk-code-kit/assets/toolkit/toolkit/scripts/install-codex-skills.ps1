param(
  [ValidateSet('project', 'user')]
  [string]$Scope = 'user',
  [string]$ProjectPath,
  [switch]$Force,
  [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Resolve-CodexHome {
  param(
    [Parameter(Mandatory = $true)][string]$TargetScope,
    [string]$TargetProjectPath
  )

  if ($TargetScope -eq 'project') {
    if (-not $TargetProjectPath -or $TargetProjectPath.Trim().Length -eq 0) {
      throw "Project-local Codex install requires -ProjectPath."
    }
    if (-not (Test-Path -LiteralPath $TargetProjectPath)) {
      New-Item -ItemType Directory -Force -Path $TargetProjectPath | Out-Null
    }
    $projectRoot = (Resolve-Path -LiteralPath $TargetProjectPath).Path
    return (Join-Path $projectRoot '.codex')
  }

  if ($env:CODEX_HOME) {
    return $env:CODEX_HOME
  }
  return (Join-Path $HOME '.codex')
}

function Write-Utf8NoBomFile {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Content
  )

  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Rewrite-SkillFrontmatterName {
  param(
    [Parameter(Mandatory = $true)][string]$SkillFilePath,
    [Parameter(Mandatory = $true)][string]$ExpectedName
  )

  $content = Get-Content -LiteralPath $SkillFilePath -Raw -Encoding UTF8
  $newline = if ($content.Contains("`r`n")) { "`r`n" } else { "`n" }
  $match = [regex]::Match(
    $content,
    '\A(?<prefix>\s*(?:<!--[\s\S]*?-->\s*)?)---\r?\n(?<frontmatter>[\s\S]*?)\r?\n---(?<suffix>[\s\S]*)\z'
  )
  if (-not $match.Success) {
    throw "Skill file is missing a valid YAML frontmatter block: $SkillFilePath"
  }

  $frontmatter = $match.Groups['frontmatter'].Value
  if ($frontmatter -notmatch '(?m)^name:\s*(?<name>[^\r\n]+)\s*$') {
    throw "Skill file is missing a frontmatter name field: $SkillFilePath"
  }

  $updatedFrontmatter = [regex]::Replace(
    $frontmatter,
    '(?m)^name:\s*[^\r\n]+\s*$',
    "name: $ExpectedName",
    1
  )

  $updatedContent = $match.Groups['prefix'].Value + '---' + $newline + $updatedFrontmatter + $newline + '---' + $match.Groups['suffix'].Value
  Write-Utf8NoBomFile -Path $SkillFilePath -Content $updatedContent
}

$toolkitRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$skillsSource = Join-Path $toolkitRoot 'skills'
if (-not (Test-Path -LiteralPath $skillsSource)) {
  throw "Missing toolkit skills source directory: $skillsSource"
}

$managedSkills = @(Get-ChildItem -LiteralPath $skillsSource -Directory | Sort-Object Name)
if ($managedSkills.Count -ne 12) {
  throw "Expected 12 managed SDTK-CODE skills but found $($managedSkills.Count)."
}

$codexHome = Resolve-CodexHome -TargetScope $Scope -TargetProjectPath $ProjectPath
$skillsDest = Join-Path $codexHome 'skills'
New-Item -ItemType Directory -Force -Path $skillsDest | Out-Null

$copied = 0
$skipped = 0
foreach ($skillDir in $managedSkills) {
  $skillFile = Join-Path $skillDir.FullName 'SKILL.md'
  if (-not (Test-Path -LiteralPath $skillFile)) {
    throw "Managed skill is missing SKILL.md: $($skillDir.FullName)"
  }

  $destName = "sdtk-$($skillDir.Name)"
  $destDir = Join-Path $skillsDest $destName
  if (Test-Path -LiteralPath $destDir) {
    if (-not $Force) {
      $skipped++
      if (-not $Quiet) {
        Write-Warning "Skill already installed (skipping). Use -Force to overwrite: $destName"
      }
      continue
    }
    Remove-Item -LiteralPath $destDir -Recurse -Force
  }

  Copy-Item -LiteralPath $skillDir.FullName -Destination $destDir -Recurse -Force
  try {
    Rewrite-SkillFrontmatterName -SkillFilePath (Join-Path $destDir 'SKILL.md') -ExpectedName $destName
  } catch {
    if (Test-Path -LiteralPath $destDir) {
      Remove-Item -LiteralPath $destDir -Recurse -Force
    }
    throw
  }

  $copied++
  if (-not $Quiet) {
    Write-Host "Installed: $destName"
  }
}

$expectedNames = $managedSkills.Name | ForEach-Object { "sdtk-$_" }
$installedNow = @(
  Get-ChildItem -LiteralPath $skillsDest -Directory -ErrorAction SilentlyContinue |
    Where-Object { $expectedNames -contains $_.Name } |
    Select-Object -ExpandProperty Name
)
if ($installedNow.Count -ne 12) {
  throw "Codex skill install incomplete. Expected 12 managed skills at $skillsDest but found $($installedNow.Count)."
}

if (-not $Quiet) {
  Write-Host ""
  Write-Host "Install summary:"
  Write-Host "- Scope: $Scope"
  Write-Host "- Destination: $skillsDest"
  Write-Host "- Copied: $copied"
  Write-Host "- Skipped: $skipped"
  if ($Scope -eq 'project') {
    Write-Host "- Project-local Codex support requires launching Codex with CODEX_HOME=<project>/.codex."
    Write-Host "- Native .codex/skills auto-discovery is not claimed."
  }
}
