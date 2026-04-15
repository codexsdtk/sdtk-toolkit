param(
  [Parameter(Mandatory = $true)] [string] $RepoRoot,
  [Parameter(Mandatory = $true)] [string] $TaskFile,
  [Parameter(Mandatory = $true)] [string] $ReportFile,
  [string] $LogFile = '',
  [string] $SessionName = '',
  [string] $Model = '',
  [ValidateSet('default','dontAsk','acceptEdits','auto','bypassPermissions','plan')] [string] $PermissionMode = 'dontAsk',
  [ValidateSet('low','medium','high','max')] [string] $Effort = 'medium',
  [switch] $DryRun
)

$ErrorActionPreference = 'Stop'
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$ReviewPhases = @('controller-dev-review', 'qa-review', 'controller-acceptance')
$ReadOnlyPermissionMode = 'read-only'
$WritablePermissionMode = 'workspace-write-approved'
$NotRequiredApprovalStatus = 'not-required'
$HumanApprovedStatus = 'human-approved'
$WritableClaudeModes = @('acceptEdits', 'auto', 'bypassPermissions')

function Get-TaskBulletValue([string[]] $Lines, [string] $Heading) {
  for ($i = 0; $i -lt $Lines.Length; $i++) {
    if ($Lines[$i].Trim() -eq $Heading) {
      for ($j = $i + 1; $j -lt $Lines.Length; $j++) {
        $candidate = $Lines[$j].Trim()
        if (-not $candidate) { continue }
        if ($candidate.StartsWith('- ')) {
          return $candidate.Substring(2).Trim()
        }
        break
      }
    }
  }
  return ''
}


function Get-TaskListValues([string[]] $Lines, [string] $Heading) {
  $values = New-Object System.Collections.Generic.List[string]
  $foundHeading = $false
  for ($i = 0; $i -lt $Lines.Length; $i++) {
    $trimmed = $Lines[$i].Trim()
    if (-not $foundHeading) {
      if ($trimmed -eq $Heading) {
        $foundHeading = $true
      }
      continue
    }

    if (-not $trimmed) {
      if ($values.Count -gt 0) { break }
      continue
    }

    $headingMatch = [regex]::Match($trimmed, '^[A-Za-z].*:$')
    if ($headingMatch.Success) { break }

    $listMatch = [regex]::Match($trimmed, '^(?:-|\d+\.)\s+(?<value>.+)$')
    if ($listMatch.Success) {
      $values.Add($listMatch.Groups['value'].Value.Trim())
      continue
    }

    if ($values.Count -gt 0) { break }
  }
  return $values.ToArray()
}

function Resolve-RepoPath([string] $RepoRootPath, [string] $CandidatePath) {
  if ([string]::IsNullOrWhiteSpace($CandidatePath)) { return '' }
  if ([System.IO.Path]::IsPathRooted($CandidatePath)) { return $CandidatePath }
  return Join-Path $RepoRootPath $CandidatePath
}

function Append-FileText([string] $Path, [string] $Text) {
  if ([string]::IsNullOrWhiteSpace($Text)) { return }
  [System.IO.File]::AppendAllText($Path, [Environment]::NewLine + $Text, $Utf8NoBom)
}

function Normalize-TaskValue([string] $Value, [string] $Default = '') {
  if ([string]::IsNullOrWhiteSpace($Value)) { return $Default }
  return $Value.Trim()
}


function Convert-ToBulletBlock([string[]] $Items) {
  if ($null -eq $Items -or $Items.Count -eq 0) {
    return '- (none declared)'
  }
  return (($Items | ForEach-Object { "- $_" }) -join [Environment]::NewLine)
}

function New-BoundedExecutionPrompt([string[]] $TaskLines) {
  $phase = Normalize-TaskValue (Get-TaskBulletValue $TaskLines 'Phase:') 'other'
  $objective = Normalize-TaskValue (Get-TaskBulletValue $TaskLines 'Objective:') 'n/a'
  $boundaryMode = Normalize-TaskValue (Get-TaskBulletValue $TaskLines 'Boundary Mode:') 'n/a'
  $inputs = Get-TaskListValues $TaskLines 'Inputs:'
  $includeBoundary = Get-TaskListValues $TaskLines 'Include Boundary:'
  $excludeBoundary = Get-TaskListValues $TaskLines 'Exclude Boundary:'
  $verification = Get-TaskListValues $TaskLines 'Required Verification:'
  $taskBody = [string]($TaskLines | Out-String)

  $envelope = @"
[MAILBOX BOUNDED EXECUTION MODE]
You are running under controller-enforced bounded execution mode.

Phase: $phase
Objective: $objective
Boundary Mode: $boundaryMode

Execution Discipline:
1. Read every listed input first and treat the `Inputs:` section as the authoritative starting source set.
2. Do not run broad repo-wide or directory-wide discovery before you have read the listed inputs.
3. Only inspect additional files when they are directly required to modify an included path or execute a required verification command.
4. Any additional inspection must stay inside the include boundary and must not cross the exclude boundary.
5. Do not mine `governance/ai/reviews/shared/` or similar directories for examples unless a specific file is already listed in `Inputs:`.
6. If the listed inputs are insufficient, stop and report the exact missing dependency instead of broad scanning.
7. Deliver the bounded patch and formal artifact before optional example-hunting or style exploration.

Authoritative Inputs:
$(Convert-ToBulletBlock $inputs)

Include Boundary:
$(Convert-ToBulletBlock $includeBoundary)

Exclude Boundary:
$(Convert-ToBulletBlock $excludeBoundary)

Required Verification:
$(Convert-ToBulletBlock $verification)

[ORIGINAL TASK PACKET]
"@

  return $envelope.TrimEnd() + [Environment]::NewLine + [Environment]::NewLine + $taskBody
}

function Test-PlaceholderValue([string] $Value) {
  $normalized = Normalize-TaskValue $Value
  if ([string]::IsNullOrWhiteSpace($normalized)) { return $true }
  return @('n/a', 'na', 'none', 'not-applicable') -contains $normalized.ToLowerInvariant()
}

function New-PermissionAuditBlock(
  [string] $DeclaredPermission,
  [string] $EffectiveMode,
  [string] $ApprovalStatus,
  [string] $ApprovedBy,
  [string] $ApprovalReason,
  [string] $ApprovedScope,
  [string] $ApprovalReference,
  [string] $DecisionSummary
) {
  return @"
[MAILBOX EXECUTION PERMISSION AUDIT]
- Declared Execution Permission: $DeclaredPermission
- Effective Runtime Permission Mode: $EffectiveMode
- Permission Approval Status: $ApprovalStatus
- Approved By: $ApprovedBy
- Approval Reason: $ApprovalReason
- Approved Writable Scope: $ApprovedScope
- Approval Reference: $ApprovalReference
- Launcher Decision Summary: $DecisionSummary
"@.TrimEnd()
}

function Write-PermissionFailure(
  [string] $ReportPath,
  [string] $LogPath,
  [string] $AuditBlock,
  [string] $Message
) {
  Append-FileText $ReportPath $AuditBlock
  Append-FileText $ReportPath "[MAILBOX PERMISSION VALIDATION] failed: $Message"
  if ($LogPath) {
    Append-FileText $LogPath $AuditBlock
    Append-FileText $LogPath "[MAILBOX PERMISSION VALIDATION] failed: $Message"
  }
  throw $Message
}

function Invoke-PhaseArtifactValidation([string[]] $TaskLines, [string] $RepoRootPath, [string] $ReportPath, [string] $LogPath, [string] $ValidatorPath) {
  $phase = Get-TaskBulletValue $TaskLines 'Phase:'
  if ($ReviewPhases -notcontains $phase) { return }

  $artifactValue = Get-TaskBulletValue $TaskLines 'Primary Formal Artifact:'
  if ([string]::IsNullOrWhiteSpace($artifactValue)) { return }
  if (-not (Test-Path $ValidatorPath)) { return }

  $artifactPath = Resolve-RepoPath $RepoRootPath $artifactValue
  if (-not (Test-Path $artifactPath)) {
    $skip = "[MAILBOX PHASE VALIDATION] skipped: primary formal artifact not found at $artifactPath"
    Append-FileText $ReportPath $skip
    if ($LogPath) { Append-FileText $LogPath $skip }
    return
  }

  $validationOutput = (& python $ValidatorPath --phase $phase --artifact $artifactPath 2>&1 | Out-String).TrimEnd()
  $validationBlock = "[MAILBOX PHASE VALIDATION]`n$validationOutput"
  Append-FileText $ReportPath $validationBlock
  if ($LogPath) { Append-FileText $LogPath $validationBlock }

  if ($LASTEXITCODE -ne 0) {
    throw "Mailbox phase artifact validation failed for $artifactPath"
  }
}

if (-not (Test-Path $RepoRoot)) { throw "RepoRoot not found: $RepoRoot" }
if (-not (Test-Path $TaskFile)) { throw "TaskFile not found: $TaskFile" }

$taskLines = Get-Content $TaskFile -Encoding UTF8
$phase = Normalize-TaskValue (Get-TaskBulletValue $taskLines 'Phase:')
$declaredPermission = Normalize-TaskValue (Get-TaskBulletValue $taskLines 'Execution Permission:') $ReadOnlyPermissionMode
$approvalStatus = Normalize-TaskValue (Get-TaskBulletValue $taskLines 'Permission Approval Status:') $NotRequiredApprovalStatus
$approvedBy = Normalize-TaskValue (Get-TaskBulletValue $taskLines 'Approved By:') 'n/a'
$approvalReason = Normalize-TaskValue (Get-TaskBulletValue $taskLines 'Approval Reason:') 'n/a'
$approvedScope = Normalize-TaskValue (Get-TaskBulletValue $taskLines 'Approved Writable Scope:') 'n/a'
$approvalReference = Normalize-TaskValue (Get-TaskBulletValue $taskLines 'Approval Reference:') 'n/a'
$prompt = New-BoundedExecutionPrompt $taskLines
New-Item -ItemType Directory -Force -Path ([System.IO.Path]::GetDirectoryName($ReportFile)) | Out-Null
if ($LogFile) {
  New-Item -ItemType Directory -Force -Path ([System.IO.Path]::GetDirectoryName($LogFile)) | Out-Null
}

$effectiveMode = $PermissionMode
$decisionSummary = ''
$approvalFieldsArePlaceholder = (Test-PlaceholderValue $approvedBy) -and (Test-PlaceholderValue $approvalReason) -and (Test-PlaceholderValue $approvedScope)
$isWritableClaudeMode = $WritableClaudeModes -contains $PermissionMode

if ($ReviewPhases -contains $phase) {
  if ($declaredPermission -ne $ReadOnlyPermissionMode) {
    $auditBlock = New-PermissionAuditBlock -DeclaredPermission $declaredPermission -EffectiveMode $PermissionMode -ApprovalStatus $approvalStatus -ApprovedBy $approvedBy -ApprovalReason $approvalReason -ApprovedScope $approvedScope -ApprovalReference $approvalReference -DecisionSummary 'review phase attempted writable permission and was rejected before launch'
    Write-PermissionFailure -ReportPath $ReportFile -LogPath $LogFile -AuditBlock $auditBlock -Message "Review-phase mailbox runs must declare 'Execution Permission: read-only'."
  }
  if ($approvalStatus -ne $NotRequiredApprovalStatus -or -not $approvalFieldsArePlaceholder) {
    $auditBlock = New-PermissionAuditBlock -DeclaredPermission $declaredPermission -EffectiveMode $PermissionMode -ApprovalStatus $approvalStatus -ApprovedBy $approvedBy -ApprovalReason $approvalReason -ApprovedScope $approvedScope -ApprovalReference $approvalReference -DecisionSummary 'review phase approval metadata was inconsistent for a read-only run'
    Write-PermissionFailure -ReportPath $ReportFile -LogPath $LogFile -AuditBlock $auditBlock -Message "Read-only review phases must use 'Permission Approval Status: not-required' and leave writable approval fields as 'n/a'."
  }
  if ($isWritableClaudeMode) {
    $auditBlock = New-PermissionAuditBlock -DeclaredPermission $declaredPermission -EffectiveMode $PermissionMode -ApprovalStatus $approvalStatus -ApprovedBy $approvedBy -ApprovalReason $approvalReason -ApprovedScope $approvedScope -ApprovalReference $approvalReference -DecisionSummary 'review phase requested writable Claude permission mode and was rejected before launch'
    Write-PermissionFailure -ReportPath $ReportFile -LogPath $LogFile -AuditBlock $auditBlock -Message "Read-only mailbox tasks may not use writable Claude permission modes such as acceptEdits, auto, or bypassPermissions."
  }
  $decisionSummary = 'review phase allowed only non-writable Claude permission mode'
} elseif ($phase -eq 'implementation') {
  if ($declaredPermission -eq $WritablePermissionMode) {
    if ($approvalStatus -ne $HumanApprovedStatus) {
      $auditBlock = New-PermissionAuditBlock -DeclaredPermission $declaredPermission -EffectiveMode $PermissionMode -ApprovalStatus $approvalStatus -ApprovedBy $approvedBy -ApprovalReason $approvalReason -ApprovedScope $approvedScope -ApprovalReference $approvalReference -DecisionSummary 'writable Claude implementation requested without human-approved status'
      Write-PermissionFailure -ReportPath $ReportFile -LogPath $LogFile -AuditBlock $auditBlock -Message "Writable implementation runs require 'Permission Approval Status: human-approved'."
    }
    if ((Test-PlaceholderValue $approvedBy) -or (Test-PlaceholderValue $approvalReason) -or (Test-PlaceholderValue $approvedScope)) {
      $auditBlock = New-PermissionAuditBlock -DeclaredPermission $declaredPermission -EffectiveMode $PermissionMode -ApprovalStatus $approvalStatus -ApprovedBy $approvedBy -ApprovalReason $approvalReason -ApprovedScope $approvedScope -ApprovalReference $approvalReference -DecisionSummary 'writable Claude implementation requested without complete approval metadata'
      Write-PermissionFailure -ReportPath $ReportFile -LogPath $LogFile -AuditBlock $auditBlock -Message 'Writable implementation runs require Approved By, Approval Reason, and Approved Writable Scope.'
    }
    if (-not $isWritableClaudeMode) {
      $auditBlock = New-PermissionAuditBlock -DeclaredPermission $declaredPermission -EffectiveMode $PermissionMode -ApprovalStatus $approvalStatus -ApprovedBy $approvedBy -ApprovalReason $approvalReason -ApprovedScope $approvedScope -ApprovalReference $approvalReference -DecisionSummary 'writable Claude implementation requested without explicit writable Claude permission mode'
      Write-PermissionFailure -ReportPath $ReportFile -LogPath $LogFile -AuditBlock $auditBlock -Message 'Writable Claude implementation runs require an explicit writable permission mode such as acceptEdits, auto, or bypassPermissions.'
    }
    $decisionSummary = 'writable Claude implementation run approved and enabled from task-packet approval record'
  } elseif ($declaredPermission -eq $ReadOnlyPermissionMode) {
    if ($approvalStatus -ne $NotRequiredApprovalStatus -or -not $approvalFieldsArePlaceholder) {
      $auditBlock = New-PermissionAuditBlock -DeclaredPermission $declaredPermission -EffectiveMode $PermissionMode -ApprovalStatus $approvalStatus -ApprovedBy $approvedBy -ApprovalReason $approvalReason -ApprovedScope $approvedScope -ApprovalReference $approvalReference -DecisionSummary 'read-only implementation run carried contradictory writable approval metadata'
      Write-PermissionFailure -ReportPath $ReportFile -LogPath $LogFile -AuditBlock $auditBlock -Message "Read-only implementation runs must use 'Permission Approval Status: not-required' and leave writable approval fields as 'n/a'."
    }
    if ($isWritableClaudeMode) {
      $auditBlock = New-PermissionAuditBlock -DeclaredPermission $declaredPermission -EffectiveMode $PermissionMode -ApprovalStatus $approvalStatus -ApprovedBy $approvedBy -ApprovalReason $approvalReason -ApprovedScope $approvedScope -ApprovalReference $approvalReference -DecisionSummary 'read-only implementation run requested writable Claude permission mode and was rejected before launch'
      Write-PermissionFailure -ReportPath $ReportFile -LogPath $LogFile -AuditBlock $auditBlock -Message "Read-only mailbox tasks may not use writable Claude permission modes such as acceptEdits, auto, or bypassPermissions."
    }
    $decisionSummary = 'implementation run remained non-writable because no writable approval was declared'
  } else {
    $auditBlock = New-PermissionAuditBlock -DeclaredPermission $declaredPermission -EffectiveMode $PermissionMode -ApprovalStatus $approvalStatus -ApprovedBy $approvedBy -ApprovalReason $approvalReason -ApprovedScope $approvedScope -ApprovalReference $approvalReference -DecisionSummary 'unknown execution permission rejected before launch'
    Write-PermissionFailure -ReportPath $ReportFile -LogPath $LogFile -AuditBlock $auditBlock -Message "Unknown execution permission mode '$declaredPermission'."
  }
} else {
  if ($declaredPermission -ne $ReadOnlyPermissionMode) {
    $auditBlock = New-PermissionAuditBlock -DeclaredPermission $declaredPermission -EffectiveMode $PermissionMode -ApprovalStatus $approvalStatus -ApprovedBy $approvedBy -ApprovalReason $approvalReason -ApprovedScope $approvedScope -ApprovalReference $approvalReference -DecisionSummary 'non-implementation phase attempted writable permission and was rejected before launch'
    Write-PermissionFailure -ReportPath $ReportFile -LogPath $LogFile -AuditBlock $auditBlock -Message 'Only implementation-phase mailbox runs may request writable execution.'
  }
  if ($approvalStatus -ne $NotRequiredApprovalStatus -or -not $approvalFieldsArePlaceholder) {
    $auditBlock = New-PermissionAuditBlock -DeclaredPermission $declaredPermission -EffectiveMode $PermissionMode -ApprovalStatus $approvalStatus -ApprovedBy $approvedBy -ApprovalReason $approvalReason -ApprovedScope $approvedScope -ApprovalReference $approvalReference -DecisionSummary 'non-implementation phase approval metadata was inconsistent for a read-only run'
    Write-PermissionFailure -ReportPath $ReportFile -LogPath $LogFile -AuditBlock $auditBlock -Message "Non-implementation read-only runs must use 'Permission Approval Status: not-required' and leave writable approval fields as 'n/a'."
  }
  if ($isWritableClaudeMode) {
    $auditBlock = New-PermissionAuditBlock -DeclaredPermission $declaredPermission -EffectiveMode $PermissionMode -ApprovalStatus $approvalStatus -ApprovedBy $approvedBy -ApprovalReason $approvalReason -ApprovedScope $approvedScope -ApprovalReference $approvalReference -DecisionSummary 'non-implementation phase requested writable Claude permission mode and was rejected before launch'
    Write-PermissionFailure -ReportPath $ReportFile -LogPath $LogFile -AuditBlock $auditBlock -Message "Read-only mailbox tasks may not use writable Claude permission modes such as acceptEdits, auto, or bypassPermissions."
  }
  $decisionSummary = 'non-implementation phase allowed only non-writable Claude permission mode'
}

$permissionAuditBlock = New-PermissionAuditBlock -DeclaredPermission $declaredPermission -EffectiveMode $PermissionMode -ApprovalStatus $approvalStatus -ApprovedBy $approvedBy -ApprovalReason $approvalReason -ApprovedScope $approvedScope -ApprovalReference $approvalReference -DecisionSummary $decisionSummary
$cliArgs = @('-p', '--output-format', 'text', '--no-session-persistence', '--add-dir', $RepoRoot, '--permission-mode', $PermissionMode, '--effort', $Effort)
if ($SessionName) { $cliArgs += @('--name', $SessionName) }
if ($Model) { $cliArgs += @('--model', $Model) }
$cliArgs += $prompt

if ($DryRun) {
  [pscustomobject]@{
    Cli = 'claude'
    RepoRoot = $RepoRoot
    TaskFile = $TaskFile
    ReportFile = $ReportFile
    LogFile = $LogFile
    Args = $cliArgs
    PromptLength = $prompt.Length
    PromptPreview = if ($prompt.Length -gt 2000) { $prompt.Substring(0, 2000) } else { $prompt }
    DeclaredExecutionPermission = $declaredPermission
    EffectiveRuntimePermissionMode = $PermissionMode
    PermissionApprovalStatus = $approvalStatus
    ApprovedBy = $approvedBy
    ApprovalReason = $approvalReason
    ApprovedWritableScope = $approvedScope
    ApprovalReference = $approvalReference
    LauncherDecisionSummary = $decisionSummary
  } | ConvertTo-Json -Depth 4
  exit 0
}

$output = & claude @cliArgs 2>&1
$outputText = ($output | Out-String)
[System.IO.File]::WriteAllText($ReportFile, $outputText, $Utf8NoBom)
if ($LogFile) {
  [System.IO.File]::WriteAllText($LogFile, $outputText, $Utf8NoBom)
}

Append-FileText $ReportFile $permissionAuditBlock
if ($LogFile) {
  Append-FileText $LogFile $permissionAuditBlock
}

$validatorPath = Join-Path $PSScriptRoot 'validate-mailbox-formal-artifact.py'
Invoke-PhaseArtifactValidation -TaskLines $taskLines -RepoRootPath $RepoRoot -ReportPath $ReportFile -LogPath $LogFile -ValidatorPath $validatorPath
Write-Host "Claude report written to: $ReportFile"
