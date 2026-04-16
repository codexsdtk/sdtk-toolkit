param(
  [Parameter(Mandatory = $true)]
  [string]$SkillName,

  [Parameter(Mandatory = $true)]
  [string]$Pack,

  [switch]$WithPrompts,
  [switch]$WithReferences,
  [switch]$WithScripts,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Utf8NoBom {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Content
  )

  $parent = Split-Path -Parent $Path
  if ($parent -and -not (Test-Path -LiteralPath $parent)) {
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
  }

  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Convert-ToTitle {
  param([Parameter(Mandatory = $true)][string]$Name)

  return (($Name -split '-') | Where-Object { $_ -and $_.Trim().Length -gt 0 } | ForEach-Object {
    if ($_.Length -eq 1) { $_.ToUpper() }
    else { $_.Substring(0,1).ToUpper() + $_.Substring(1) }
  }) -join ' '
}

if ($SkillName -notmatch '^[a-z0-9][a-z0-9-]*$') {
  throw "Invalid SkillName. Use lowercase letters, numbers, and hyphens only."
}
if (-not $Pack.Trim()) {
  throw "Pack must not be empty."
}

$toolkitRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$repoRoot = Resolve-Path (Join-Path $toolkitRoot '..\..\..')
$skillRoot = Join-Path $toolkitRoot "skills/$SkillName"
$skillDoc = Join-Path $skillRoot 'SKILL.md'
$testsRoot = Join-Path $repoRoot 'tests'
$testStub = Join-Path $testsRoot ("test_" + ($SkillName -replace '-', '_') + '.py')
$catalogPath = Join-Path $toolkitRoot 'skills/skills.catalog.yaml'

if ((Test-Path -LiteralPath $skillRoot) -and -not $Force) {
  throw "Skill directory already exists (use -Force to overwrite): $skillRoot"
}
if ((Test-Path -LiteralPath $testStub) -and -not $Force) {
  throw "Test stub already exists (use -Force to overwrite): $testStub"
}
if (-not (Test-Path -LiteralPath $catalogPath)) {
  throw "Missing catalog file: $catalogPath"
}

if ((Test-Path -LiteralPath $skillRoot) -and $Force) {
  Remove-Item -LiteralPath $skillRoot -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $skillRoot | Out-Null
if ($WithPrompts) {
  New-Item -ItemType Directory -Force -Path (Join-Path $skillRoot 'prompts') | Out-Null
  New-Item -ItemType File -Force -Path (Join-Path $skillRoot 'prompts/.gitkeep') | Out-Null
}
if ($WithReferences) {
  New-Item -ItemType Directory -Force -Path (Join-Path $skillRoot 'references') | Out-Null
  New-Item -ItemType File -Force -Path (Join-Path $skillRoot 'references/.gitkeep') | Out-Null
}
if ($WithScripts) {
  New-Item -ItemType Directory -Force -Path (Join-Path $skillRoot 'scripts') | Out-Null
  New-Item -ItemType File -Force -Path (Join-Path $skillRoot 'scripts/.gitkeep') | Out-Null
}

$title = Convert-ToTitle -Name $SkillName
$skillDocContent = @"
---
name: $SkillName
description: Replace this scaffold description with a trigger-oriented 'Use when ...' sentence before shipping.
---

# $title

## Critical Constraints
- I do not ship this skill without replacing these scaffold constraints with real workflow constraints.
- I do not claim this skill is ready until references, prompts, scripts, and tests are validated.

## Outputs
- TBD

## Process
1. Replace this scaffold with the real workflow.
2. Add references, prompts, or scripts only when they reduce ambiguity or improve determinism.
3. Add tests before merging the skill.
"@
Write-Utf8NoBom -Path $skillDoc -Content $skillDocContent

$className = (($SkillName -replace '-', ' ') -split ' ' | Where-Object { $_ } | ForEach-Object {
  if ($_.Length -eq 1) { $_.ToUpper() }
  else { $_.Substring(0,1).ToUpper() + $_.Substring(1) }
}) -join ''

$testStubContent = @"
from __future__ import annotations

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKILL_DOC = ROOT / 'products' / 'sdtk-spec' / 'toolkit' / 'skills' / '$SkillName' / 'SKILL.md'


class ${className}Tests(unittest.TestCase):
    def test_skill_doc_exists(self) -> None:
        self.assertTrue(SKILL_DOC.exists())


if __name__ == '__main__':
    unittest.main()
"@
Write-Utf8NoBom -Path $testStub -Content $testStubContent

$catalogContent = Get-Content -Raw -LiteralPath $catalogPath -Encoding UTF8
if ($catalogContent.Length -gt 0 -and $catalogContent[0] -eq [char]0xFEFF) {
  $catalogContent = $catalogContent.Substring(1)
}
if ($catalogContent -match "(?m)^\s*-\s+name:\s+$([regex]::Escape($SkillName))\s*$") {
  Write-Warning "Catalog entry already exists for $SkillName (leaving catalog unchanged)."
} else {
  if ($WithReferences) {
    $referenceLines = @(
      '    references:',
      "      - toolkit/skills/$SkillName/references/.gitkeep"
    )
  } else {
    $referenceLines = @('    references: []')
  }

  if ($WithPrompts) {
    $promptLines = @(
      '    prompts:',
      "      - toolkit/skills/$SkillName/prompts/.gitkeep"
    )
  } else {
    $promptLines = @('    prompts: []')
  }

  if ($WithScripts) {
    $scriptLines = @(
      '    scripts:',
      "      - toolkit/skills/$SkillName/scripts/.gitkeep"
    )
  } else {
    $scriptLines = @('    scripts: []')
  }

  $entryLines = @(
    ''
    "  - name: $SkillName"
    '    phase: specialist'
    '    role_tag: /replace-me'
    '    use_when: Replace this scaffold entry with the real activation rule before shipping.'
    '    primary_inputs:'
    '      - TBD'
    '    primary_outputs:'
    '      - TBD'
    '    hard_gates:'
    '      - Replace this scaffold gate before shipping.'
  ) + $referenceLines + $promptLines + $scriptLines + @(
    '    runtime_support: [claude, codex]'
    '    dependencies: []'
    "    pack: $Pack"
  )

  $emptyCatalogReplacement = "schema_version: 1$([Environment]::NewLine)skills:"
  $catalogContent = $catalogContent -replace '(?ms)^schema_version:\s*1\s*skills:\s*\[\s*\]\s*$', $emptyCatalogReplacement
  $newCatalog = $catalogContent.TrimEnd() + [Environment]::NewLine + ($entryLines -join [Environment]::NewLine) + [Environment]::NewLine
  Write-Utf8NoBom -Path $catalogPath -Content $newCatalog
}

Write-Host "Created skill scaffold: $SkillName"
Write-Host "Skill doc : $skillDoc"
Write-Host "Test stub : $testStub"
Write-Host "Catalog   : $catalogPath"
