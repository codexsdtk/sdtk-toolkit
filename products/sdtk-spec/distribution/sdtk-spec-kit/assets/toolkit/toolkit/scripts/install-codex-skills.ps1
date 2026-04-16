param(
  [ValidateSet('project', 'user')]
  [string]$Scope = 'user',
  [string]$ProjectPath,
  [switch]$Force
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

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$skillsSrc = Join-Path $repoRoot 'skills'
$canonicalRulesPath = Join-Path $repoRoot 'templates/docs/api/FLOWCHART_CREATION_RULES.md'
$canonicalRulesHash = Get-FileSha256 -Path $canonicalRulesPath
$canonicalApiDesignRulesPath = Join-Path $repoRoot 'templates/docs/api/API_DESIGN_CREATION_RULES.md'
$canonicalApiDesignRulesHash = Get-FileSha256 -Path $canonicalApiDesignRulesPath
$canonicalFlowRulesPath = Join-Path $repoRoot 'templates/docs/specs/FLOW_ACTION_SPEC_CREATION_RULES.md'
$canonicalFlowRulesHash = Get-FileSha256 -Path $canonicalFlowRulesPath
$canonicalTestCaseRulesPath = Join-Path $repoRoot 'templates/docs/qa/TEST_CASE_CREATION_RULES.md'
$canonicalTestCaseRulesHash = Get-FileSha256 -Path $canonicalTestCaseRulesPath

if (-not (Test-Path -LiteralPath $skillsSrc)) {
  throw "Missing skills directory: $skillsSrc"
}

$codexHome = Resolve-CodexHome -TargetScope $Scope -TargetProjectPath $ProjectPath
$skillsDest = Join-Path $codexHome 'skills'
New-Item -ItemType Directory -Force -Path $skillsDest | Out-Null

Get-ChildItem -LiteralPath $skillsSrc -Directory | ForEach-Object {
  $dest = Join-Path $skillsDest $_.Name
  if (Test-Path -LiteralPath $dest) {
    if (-not $Force) {
      Write-Warning "Skill already installed (skipping). Use -Force to overwrite: $($_.Name)"
      $existingSkillRulesPath = Join-Path $dest 'references/FLOWCHART_CREATION_RULES.md'
      $existingSkillRulesHash = Get-FileSha256 -Path $existingSkillRulesPath
      if ($existingSkillRulesHash) {
        if ($canonicalRulesHash -and ($existingSkillRulesHash -eq $canonicalRulesHash)) {
          Write-Host "  - Existing ruleset: FLOWCHART_CREATION_RULES.md (SHA256=$existingSkillRulesHash, source-sync=OK)"
        } elseif ($canonicalRulesHash) {
          Write-Warning "  - Existing ruleset hash mismatch for $($_.Name): skill=$existingSkillRulesHash template=$canonicalRulesHash"
        } else {
          Write-Host "  - Existing ruleset: FLOWCHART_CREATION_RULES.md (SHA256=$existingSkillRulesHash)"
        }
      }
      $existingFlowRulesPath = Join-Path $dest 'references/FLOW_ACTION_SPEC_CREATION_RULES.md'
      $existingFlowRulesHash = Get-FileSha256 -Path $existingFlowRulesPath
      if ($existingFlowRulesHash) {
        if ($canonicalFlowRulesHash -and ($existingFlowRulesHash -eq $canonicalFlowRulesHash)) {
          Write-Host "  - Existing ruleset: FLOW_ACTION_SPEC_CREATION_RULES.md (SHA256=$existingFlowRulesHash, source-sync=OK)"
        } elseif ($canonicalFlowRulesHash) {
          Write-Warning "  - Existing ruleset hash mismatch for $($_.Name): skill=$existingFlowRulesHash template=$canonicalFlowRulesHash"
        } else {
          Write-Host "  - Existing ruleset: FLOW_ACTION_SPEC_CREATION_RULES.md (SHA256=$existingFlowRulesHash)"
        }
      }
      $existingApiDesignRulesPath = Join-Path $dest 'references/API_DESIGN_CREATION_RULES.md'
      $existingApiDesignRulesHash = Get-FileSha256 -Path $existingApiDesignRulesPath
      if ($existingApiDesignRulesHash) {
        if ($canonicalApiDesignRulesHash -and ($existingApiDesignRulesHash -eq $canonicalApiDesignRulesHash)) {
          Write-Host "  - Existing ruleset: API_DESIGN_CREATION_RULES.md (SHA256=$existingApiDesignRulesHash, source-sync=OK)"
        } elseif ($canonicalApiDesignRulesHash) {
          Write-Warning "  - Existing ruleset hash mismatch for $($_.Name): skill=$existingApiDesignRulesHash template=$canonicalApiDesignRulesHash"
        } else {
          Write-Host "  - Existing ruleset: API_DESIGN_CREATION_RULES.md (SHA256=$existingApiDesignRulesHash)"
        }
      }
      $existingTestCaseRulesPath = Join-Path $dest 'references/TEST_CASE_CREATION_RULES.md'
      $existingTestCaseRulesHash = Get-FileSha256 -Path $existingTestCaseRulesPath
      if ($existingTestCaseRulesHash) {
        if ($canonicalTestCaseRulesHash -and ($existingTestCaseRulesHash -eq $canonicalTestCaseRulesHash)) {
          Write-Host "  - Existing ruleset: TEST_CASE_CREATION_RULES.md (SHA256=$existingTestCaseRulesHash, source-sync=OK)"
        } elseif ($canonicalTestCaseRulesHash) {
          Write-Warning "  - Existing ruleset hash mismatch for $($_.Name): skill=$existingTestCaseRulesHash template=$canonicalTestCaseRulesHash"
        } else {
          Write-Host "  - Existing ruleset: TEST_CASE_CREATION_RULES.md (SHA256=$existingTestCaseRulesHash)"
        }
      }
      return
    }
    Remove-Item -LiteralPath $dest -Recurse -Force
  }
  Copy-Item -LiteralPath $_.FullName -Destination $dest -Recurse -Force
  Write-Host "Installed: $($_.Name)"

  $skillRulesPath = Join-Path $dest 'references/FLOWCHART_CREATION_RULES.md'
  $skillRulesHash = Get-FileSha256 -Path $skillRulesPath
  if ($skillRulesHash) {
    if ($canonicalRulesHash -and ($skillRulesHash -eq $canonicalRulesHash)) {
      Write-Host "  - Ruleset: FLOWCHART_CREATION_RULES.md (SHA256=$skillRulesHash, source-sync=OK)"
    } elseif ($canonicalRulesHash) {
      Write-Warning "  - Ruleset hash mismatch for $($_.Name): skill=$skillRulesHash template=$canonicalRulesHash"
    } else {
      Write-Host "  - Ruleset: FLOWCHART_CREATION_RULES.md (SHA256=$skillRulesHash)"
    }
  }

  $skillFlowRulesPath = Join-Path $dest 'references/FLOW_ACTION_SPEC_CREATION_RULES.md'
  $skillFlowRulesHash = Get-FileSha256 -Path $skillFlowRulesPath
  if ($skillFlowRulesHash) {
    if ($canonicalFlowRulesHash -and ($skillFlowRulesHash -eq $canonicalFlowRulesHash)) {
      Write-Host "  - Ruleset: FLOW_ACTION_SPEC_CREATION_RULES.md (SHA256=$skillFlowRulesHash, source-sync=OK)"
    } elseif ($canonicalFlowRulesHash) {
      Write-Warning "  - Ruleset hash mismatch for $($_.Name): skill=$skillFlowRulesHash template=$canonicalFlowRulesHash"
    } else {
      Write-Host "  - Ruleset: FLOW_ACTION_SPEC_CREATION_RULES.md (SHA256=$skillFlowRulesHash)"
    }
  }

  $skillApiDesignRulesPath = Join-Path $dest 'references/API_DESIGN_CREATION_RULES.md'
  $skillApiDesignRulesHash = Get-FileSha256 -Path $skillApiDesignRulesPath
  if ($skillApiDesignRulesHash) {
    if ($canonicalApiDesignRulesHash -and ($skillApiDesignRulesHash -eq $canonicalApiDesignRulesHash)) {
      Write-Host "  - Ruleset: API_DESIGN_CREATION_RULES.md (SHA256=$skillApiDesignRulesHash, source-sync=OK)"
    } elseif ($canonicalApiDesignRulesHash) {
      Write-Warning "  - Ruleset hash mismatch for $($_.Name): skill=$skillApiDesignRulesHash template=$canonicalApiDesignRulesHash"
    } else {
      Write-Host "  - Ruleset: API_DESIGN_CREATION_RULES.md (SHA256=$skillApiDesignRulesHash)"
    }
  }

  $skillTestCaseRulesPath = Join-Path $dest 'references/TEST_CASE_CREATION_RULES.md'
  $skillTestCaseRulesHash = Get-FileSha256 -Path $skillTestCaseRulesPath
  if ($skillTestCaseRulesHash) {
    if ($canonicalTestCaseRulesHash -and ($skillTestCaseRulesHash -eq $canonicalTestCaseRulesHash)) {
      Write-Host "  - Ruleset: TEST_CASE_CREATION_RULES.md (SHA256=$skillTestCaseRulesHash, source-sync=OK)"
    } elseif ($canonicalTestCaseRulesHash) {
      Write-Warning "  - Ruleset hash mismatch for $($_.Name): skill=$skillTestCaseRulesHash template=$canonicalTestCaseRulesHash"
    } else {
      Write-Host "  - Ruleset: TEST_CASE_CREATION_RULES.md (SHA256=$skillTestCaseRulesHash)"
    }
  }
}

Write-Host ""
Write-Host "Skills installed into: $skillsDest"
Write-Host "Codex scope: $Scope"
if ($Scope -eq 'project') {
  Write-Host "Project-local Codex installs are valid only when Codex is launched with CODEX_HOME=<project>/.codex."
  Write-Host "This installer does not claim native .codex/skills auto-discovery."
}
if ($canonicalRulesHash) {
  Write-Host "Canonical API ruleset: $canonicalRulesPath"
  Write-Host "Canonical API ruleset SHA256: $canonicalRulesHash"
} else {
  Write-Warning "Canonical API ruleset not found: $canonicalRulesPath"
}
if ($canonicalApiDesignRulesHash) {
  Write-Host "Canonical API design ruleset: $canonicalApiDesignRulesPath"
  Write-Host "Canonical API design ruleset SHA256: $canonicalApiDesignRulesHash"
} else {
  Write-Warning "Canonical API design ruleset not found: $canonicalApiDesignRulesPath"
}
if ($canonicalFlowRulesHash) {
  Write-Host "Canonical Flow Action ruleset: $canonicalFlowRulesPath"
  Write-Host "Canonical Flow Action ruleset SHA256: $canonicalFlowRulesHash"
} else {
  Write-Warning "Canonical Flow Action ruleset not found: $canonicalFlowRulesPath"
}
if ($canonicalTestCaseRulesHash) {
  Write-Host "Canonical Test Case ruleset: $canonicalTestCaseRulesPath"
Write-Host "Canonical Test Case ruleset SHA256: $canonicalTestCaseRulesHash"
} else {
  Write-Warning "Canonical Test Case ruleset not found: $canonicalTestCaseRulesPath"
}
Write-Host "Restart Codex to pick up new skills."
