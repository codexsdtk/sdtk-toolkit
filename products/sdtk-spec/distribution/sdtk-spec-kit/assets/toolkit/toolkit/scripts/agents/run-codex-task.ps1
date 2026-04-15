param(
  [Parameter(Mandatory = $true)] [string] $RepoRoot,
  [Parameter(Mandatory = $true)] [string] $TaskFile,
  [Parameter(Mandatory = $true)] [string] $ReportFile,
  [string] $LogFile = '',
  [string] $Model = '',
  [switch] $FullAuto,
  [switch] $DryRun
)

$ErrorActionPreference = 'Stop'
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$ReviewPhases = @('controller-dev-review', 'qa-review', 'controller-acceptance')
$ReadOnlyPermissionMode = 'read-only'
$WritablePermissionMode = 'workspace-write-approved'
$NotRequiredApprovalStatus = 'not-required'
$HumanApprovedStatus = 'human-approved'
$DefaultImplementationWatchdogSeconds = 35 * 60

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

function New-PartialFailureCloseoutBlock(
  [string] $CloseoutReason,
  [string] $StallBudgetSource,
  [int] $WatchdogSeconds,
  [string] $RuntimeExitCode,
  [string] $ReportStateBeforeCloseout,
  [string] $LogPath,
  [string] $CloseoutAuthorship,
  [string] $WatchdogReached
) {
  return @"
[MAILBOX PARTIAL FAILURE CLOSEOUT]
- Closeout Reason: $CloseoutReason
- Stall Budget Source: $StallBudgetSource
- Effective Stall Budget Seconds: $WatchdogSeconds
- Runtime Exit Code: $RuntimeExitCode
- Runtime Report State Before Closeout: $ReportStateBeforeCloseout
- Raw Log Path: $LogPath
- Watchdog Timeout Reached: $WatchdogReached
- Launcher Authored Closeout Report: $CloseoutAuthorship
- Controller Fallback Recommended: yes
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

function Get-StallBudgetSeconds([string] $Phase, [string] $RawValue) {
  $normalized = Normalize-TaskValue $RawValue
  if (-not [string]::IsNullOrWhiteSpace($normalized)) {
    $match = [regex]::Match($normalized.ToLowerInvariant(), '(?<value>\d+)\s*(?<unit>seconds?|secs?|sec|minutes?|mins?|min|hours?|hrs?|hr|h)')
    if ($match.Success) {
      $value = [int]$match.Groups['value'].Value
      $unit = $match.Groups['unit'].Value
      switch -Regex ($unit) {
        '^sec' { return [Math]::Max($value, 1) }
        '^second' { return [Math]::Max($value, 1) }
        '^min' { return [Math]::Max($value * 60, 1) }
        '^minute' { return [Math]::Max($value * 60, 1) }
        '^hr$|^hrs$|^hour|^h$' { return [Math]::Max($value * 3600, 1) }
      }
    }
  }
  if ($Phase -eq 'implementation') { return $DefaultImplementationWatchdogSeconds }
  return 0
}

function Get-StallBudgetSource([string] $RawValue, [int] $Seconds) {
  $normalized = Normalize-TaskValue $RawValue
  if (-not [string]::IsNullOrWhiteSpace($normalized)) {
    return $normalized
  }
  if ($Seconds -gt 0) {
    return "defaulted to $Seconds seconds because no parseable stall budget was provided"
  }
  return 'n/a'
}

function Get-ReportState([string] $Path) {
  if (-not (Test-Path $Path)) { return 'missing' }
  $info = Get-Item $Path
  if ($info.Length -le 0) { return 'empty' }
  return 'present'
}

function Get-GitCommandOutput([string] $RepoRootPath, [string[]] $Arguments) {
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $result = (& git -C $RepoRootPath @Arguments 2>&1 | Out-String).TrimEnd()
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  if ([string]::IsNullOrWhiteSpace($result)) { return '(empty)' }
  return $result
}

function New-GitTruthBlock([string] $RepoRootPath) {
  $status = Get-GitCommandOutput $RepoRootPath @('status', '--short', '--untracked-files=all')
  $diff = Get-GitCommandOutput $RepoRootPath @('diff', '--name-only')
  $cached = Get-GitCommandOutput $RepoRootPath @('diff', '--cached', '--name-only')
  $head = Get-GitCommandOutput $RepoRootPath @('rev-parse', 'HEAD')
  $branch = Get-GitCommandOutput $RepoRootPath @('branch', '--show-current')
  return @"
10. Git Truth
- git status --short --untracked-files=all -> $status
- git diff --name-only -> $diff
- git diff --cached --name-only -> $cached
- git rev-parse HEAD -> $head
- git branch --show-current -> $branch
"@.TrimEnd()
}

function Stop-ProcessTree([int] $ProcessId) {
  $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$ProcessId" -ErrorAction SilentlyContinue)
  foreach ($child in $children) {
    Stop-ProcessTree -ProcessId $child.ProcessId
  }
  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

function Convert-ToCmdQuoted([string] $Value) {
  return '"' + ($Value -replace '"', '""') + '"'
}

function Invoke-CodexProcessWithWatchdog(
  [string] $RepoRootPath,
  [string] $PromptPath,
  [string] $ReportPath,
  [string] $LogPath,
  [string] $ModelName,
  [bool] $UseWorkspaceWrite,
  [int] $WatchdogSeconds
) {
  $runnerScriptPath = Join-Path ([System.IO.Path]::GetTempPath()) ("sdtk-mailbox-codex-" + [guid]::NewGuid().ToString('N') + '.cmd')
  $commandParts = @(
    'codex',
    'exec',
    '-c',
    (Convert-ToCmdQuoted 'mcp_servers={}'),
    '-c',
    (Convert-ToCmdQuoted 'model_reasoning_effort="medium"'),
    '-C',
    (Convert-ToCmdQuoted $RepoRootPath),
    '--output-last-message',
    (Convert-ToCmdQuoted $ReportPath)
  )
  if ($UseWorkspaceWrite) {
    $commandParts += '--full-auto'
  } else {
    $commandParts += @('--sandbox', 'read-only')
  }
  if ($ModelName) {
    $commandParts += @('--model', (Convert-ToCmdQuoted $ModelName))
  }
  $commandParts += '-'

  $commandLine = ($commandParts -join ' ') + ' < ' + (Convert-ToCmdQuoted $PromptPath)
  if ($LogPath) {
    $commandLine += ' > ' + (Convert-ToCmdQuoted $LogPath) + ' 2>&1'
  }

  $embedded = "@echo off`r`nsetlocal`r`n$commandLine`r`nexit /b %ERRORLEVEL%`r`n"
  [System.IO.File]::WriteAllText($runnerScriptPath, $embedded, $Utf8NoBom)

  $process = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/d', '/c', $runnerScriptPath) -WorkingDirectory $RepoRootPath -PassThru -WindowStyle Hidden

  $timedOut = $false
  try {
    if ($WatchdogSeconds -gt 0) {
      if (-not $process.WaitForExit($WatchdogSeconds * 1000)) {
        $timedOut = $true
        Stop-ProcessTree -ProcessId $process.Id
      }
    }
    if (-not $timedOut) {
      $process.WaitForExit()
    }
    return [pscustomobject]@{
      TimedOut = $timedOut
      ExitCode = if ($timedOut) { -1 } else { $process.ExitCode }
    }
  } finally {
    Remove-Item $runnerScriptPath -Force -ErrorAction SilentlyContinue
  }
}

function Write-StructuredPartialFailureReport(
  [string] $RepoRootPath,
  [string] $ReportPath,
  [string] $LogPath,
  [string] $CloseoutReason,
  [string] $RuntimeExitCode,
  [string] $ReportStateBeforeCloseout,
  [string] $PermissionAuditBlock,
  [string] $PartialFailureBlock,
  [string] $BoundaryMode,
  [string] $IssueCloseoutMode,
  [string] $DecisionRequested,
  [string] $Phase,
  [string] $PrimaryFormalArtifact,
  [string] $WatchdogReached
) {
  $gitTruthBlock = New-GitTruthBlock $RepoRootPath
  $repoBranch = Get-GitCommandOutput $RepoRootPath @('branch', '--show-current')
  $reportText = @"
# MAILBOX PARTIAL FAILURE REPORT
1. Metadata
- Worker: Codex mailbox launcher
- Runtime: codex
- Phase: $Phase
- Repo / Branch: $RepoRootPath | $repoBranch
- Decision Requested: $DecisionRequested
- Issue Closeout Mode: $IssueCloseoutMode
- Runtime Outcome (completed | stalled | fallback-used): stalled
2. Short Summary
- Launcher emitted a controller-usable partial-failure blocker report because the external Codex run did not reach a normal closeout path.
3. Exact Files Changed
- none confirmed
4. Carryover Findings Resolution
- no tracked diff from the stalled runtime was accepted
5. Formal Artifact Truth
- primary formal artifact path: $PrimaryFormalArtifact
- written by agent or controller fallback: launcher-authored transient blocker report only
- fallback reason when controller authored the artifact: $CloseoutReason
6. Execution Permission Audit
- see launcher audit block below
7. Phase Artifact Validation
- skipped: implementation partial-failure closeout does not run review-phase artifact validation
8. Exact Verification Results
- codex mailbox launch -> $CloseoutReason
- runtime report state before closeout -> $ReportStateBeforeCloseout
- raw log path -> $LogPath
9. Boundary Truth
- included surfaces actually touched -> no tracked diff accepted from the stalled runtime
- excluded surfaces not touched -> not fully verifiable from the stalled runtime; controller fallback required before promotion
- formal artifacts created -> transient mailbox blocker report only ($ReportPath)
- boundary mode actually executed -> $BoundaryMode
- parent issue status after this batch (`DONE` | `IN_PROGRESS`) -> IN_PROGRESS
$gitTruthBlock
11. Fallback Truth
- fallback trigger reached or not -> yes
- fallback path used or not -> launcher-authored partial-failure closeout only
- stalled runtime diff accepted: yes or no -> no
- watchdog timeout reached: yes or no -> $WatchdogReached
- launcher-authored partial-failure closeout emitted: yes or no -> yes
- raw log path -> $LogPath
- raw runtime report state before closeout -> $ReportStateBeforeCloseout
12. Blockers / Open Questions
- external Codex run ended without a usable normal closeout path; controller must review the blocker report and choose a bounded fallback or rerun
13. Ready State
- not ready
- reason -> $CloseoutReason
- next step -> choose controller fallback, native fallback, or a rerun with a new run id after reviewing the raw log
$PartialFailureBlock
$PermissionAuditBlock
"@
  [System.IO.File]::WriteAllText($ReportPath, $reportText.TrimEnd() + [Environment]::NewLine, $Utf8NoBom)
  if ($LogPath) {
    Append-FileText $LogPath $PartialFailureBlock
    Append-FileText $LogPath $PermissionAuditBlock
  }
}

if (-not (Test-Path $RepoRoot)) { throw "RepoRoot not found: $RepoRoot" }
if (-not (Test-Path $TaskFile)) { throw "TaskFile not found: $TaskFile" }

$taskLines = Get-Content $TaskFile -Encoding UTF8
$prompt = New-BoundedExecutionPrompt $taskLines
$phase = Normalize-TaskValue (Get-TaskBulletValue $taskLines 'Phase:')
$permissionMode = Normalize-TaskValue (Get-TaskBulletValue $taskLines 'Execution Permission:') $ReadOnlyPermissionMode
$approvalStatus = Normalize-TaskValue (Get-TaskBulletValue $taskLines 'Permission Approval Status:') $NotRequiredApprovalStatus
$approvedBy = Normalize-TaskValue (Get-TaskBulletValue $taskLines 'Approved By:') 'n/a'
$approvalReason = Normalize-TaskValue (Get-TaskBulletValue $taskLines 'Approval Reason:') 'n/a'
$approvedScope = Normalize-TaskValue (Get-TaskBulletValue $taskLines 'Approved Writable Scope:') 'n/a'
$approvalReference = Normalize-TaskValue (Get-TaskBulletValue $taskLines 'Approval Reference:') 'n/a'
$issueCloseoutMode = Normalize-TaskValue (Get-TaskBulletValue $taskLines 'Issue Closeout Mode:') 'phase-only'
$decisionRequested = Normalize-TaskValue (Get-TaskBulletValue $taskLines 'Decision Requested:') 'n/a'
$boundaryMode = Normalize-TaskValue (Get-TaskBulletValue $taskLines 'Boundary Mode:') 'n/a'
$primaryFormalArtifact = Normalize-TaskValue (Get-TaskBulletValue $taskLines 'Primary Formal Artifact:') 'n/a'
$stallBudgetValue = Normalize-TaskValue (Get-TaskBulletValue $taskLines 'Runtime Stall Budget / Fallback Trigger:')
New-Item -ItemType Directory -Force -Path ([System.IO.Path]::GetDirectoryName($ReportFile)) | Out-Null
if ($LogFile) {
  New-Item -ItemType Directory -Force -Path ([System.IO.Path]::GetDirectoryName($LogFile)) | Out-Null
}

$cliArgs = @('exec', '-c', 'mcp_servers={}', '-c', 'model_reasoning_effort="medium"', '-C', $RepoRoot, '--output-last-message', $ReportFile)
$useWorkspaceWrite = $false
$effectiveMode = $ReadOnlyPermissionMode
$decisionSummary = ''
$approvalFieldsArePlaceholder = (Test-PlaceholderValue $approvedBy) -and (Test-PlaceholderValue $approvalReason) -and (Test-PlaceholderValue $approvedScope)

if ($ReviewPhases -contains $phase) {
  if ($permissionMode -ne $ReadOnlyPermissionMode) {
    $auditBlock = New-PermissionAuditBlock -DeclaredPermission $permissionMode -EffectiveMode $ReadOnlyPermissionMode -ApprovalStatus $approvalStatus -ApprovedBy $approvedBy -ApprovalReason $approvalReason -ApprovedScope $approvedScope -ApprovalReference $approvalReference -DecisionSummary 'review phase attempted writable permission and was rejected before launch'
    Write-PermissionFailure -ReportPath $ReportFile -LogPath $LogFile -AuditBlock $auditBlock -Message "Review-phase mailbox runs must declare 'Execution Permission: read-only'."
  }
  if ($approvalStatus -ne $NotRequiredApprovalStatus -or -not $approvalFieldsArePlaceholder) {
    $auditBlock = New-PermissionAuditBlock -DeclaredPermission $permissionMode -EffectiveMode $ReadOnlyPermissionMode -ApprovalStatus $approvalStatus -ApprovedBy $approvedBy -ApprovalReason $approvalReason -ApprovedScope $approvedScope -ApprovalReference $approvalReference -DecisionSummary 'review phase approval metadata was inconsistent for a read-only run'
    Write-PermissionFailure -ReportPath $ReportFile -LogPath $LogFile -AuditBlock $auditBlock -Message "Read-only review phases must use 'Permission Approval Status: not-required' and leave writable approval fields as 'n/a'."
  }
  $decisionSummary = 'review phase forced explicit read-only sandbox'
} elseif ($phase -eq 'implementation') {
  if ($permissionMode -eq $WritablePermissionMode) {
    if ($approvalStatus -ne $HumanApprovedStatus) {
      $auditBlock = New-PermissionAuditBlock -DeclaredPermission $permissionMode -EffectiveMode $ReadOnlyPermissionMode -ApprovalStatus $approvalStatus -ApprovedBy $approvedBy -ApprovalReason $approvalReason -ApprovedScope $approvedScope -ApprovalReference $approvalReference -DecisionSummary 'writable implementation requested without human-approved status'
      Write-PermissionFailure -ReportPath $ReportFile -LogPath $LogFile -AuditBlock $auditBlock -Message "Writable implementation runs require 'Permission Approval Status: human-approved'."
    }
    if ((Test-PlaceholderValue $approvedBy) -or (Test-PlaceholderValue $approvalReason) -or (Test-PlaceholderValue $approvedScope)) {
      $auditBlock = New-PermissionAuditBlock -DeclaredPermission $permissionMode -EffectiveMode $ReadOnlyPermissionMode -ApprovalStatus $approvalStatus -ApprovedBy $approvedBy -ApprovalReason $approvalReason -ApprovedScope $approvedScope -ApprovalReference $approvalReference -DecisionSummary 'writable implementation requested without complete approval metadata'
      Write-PermissionFailure -ReportPath $ReportFile -LogPath $LogFile -AuditBlock $auditBlock -Message 'Writable implementation runs require Approved By, Approval Reason, and Approved Writable Scope.'
    }
    $useWorkspaceWrite = $true
    $effectiveMode = 'workspace-write'
    $decisionSummary = 'writable Codex implementation run approved and enabled from task-packet approval record'
  } elseif ($permissionMode -eq $ReadOnlyPermissionMode) {
    if ($approvalStatus -ne $NotRequiredApprovalStatus -or -not $approvalFieldsArePlaceholder) {
      $auditBlock = New-PermissionAuditBlock -DeclaredPermission $permissionMode -EffectiveMode $ReadOnlyPermissionMode -ApprovalStatus $approvalStatus -ApprovedBy $approvedBy -ApprovalReason $approvalReason -ApprovedScope $approvedScope -ApprovalReference $approvalReference -DecisionSummary 'read-only implementation run carried contradictory writable approval metadata'
      Write-PermissionFailure -ReportPath $ReportFile -LogPath $LogFile -AuditBlock $auditBlock -Message "Read-only implementation runs must use 'Permission Approval Status: not-required' and leave writable approval fields as 'n/a'."
    }
    $decisionSummary = 'implementation run remained read-only because no writable approval was declared'
  } else {
    $auditBlock = New-PermissionAuditBlock -DeclaredPermission $permissionMode -EffectiveMode $ReadOnlyPermissionMode -ApprovalStatus $approvalStatus -ApprovedBy $approvedBy -ApprovalReason $approvalReason -ApprovedScope $approvedScope -ApprovalReference $approvalReference -DecisionSummary 'unknown execution permission rejected before launch'
    Write-PermissionFailure -ReportPath $ReportFile -LogPath $LogFile -AuditBlock $auditBlock -Message "Unknown execution permission mode '$permissionMode'."
  }
} else {
  if ($permissionMode -ne $ReadOnlyPermissionMode) {
    $auditBlock = New-PermissionAuditBlock -DeclaredPermission $permissionMode -EffectiveMode $ReadOnlyPermissionMode -ApprovalStatus $approvalStatus -ApprovedBy $approvedBy -ApprovalReason $approvalReason -ApprovedScope $approvedScope -ApprovalReference $approvalReference -DecisionSummary 'non-implementation phase attempted writable permission and was rejected before launch'
    Write-PermissionFailure -ReportPath $ReportFile -LogPath $LogFile -AuditBlock $auditBlock -Message 'Only implementation-phase mailbox runs may request writable execution.'
  }
  if ($approvalStatus -ne $NotRequiredApprovalStatus -or -not $approvalFieldsArePlaceholder) {
    $auditBlock = New-PermissionAuditBlock -DeclaredPermission $permissionMode -EffectiveMode $ReadOnlyPermissionMode -ApprovalStatus $approvalStatus -ApprovedBy $approvedBy -ApprovalReason $approvalReason -ApprovedScope $approvedScope -ApprovalReference $approvalReference -DecisionSummary 'non-implementation phase approval metadata was inconsistent for a read-only run'
    Write-PermissionFailure -ReportPath $ReportFile -LogPath $LogFile -AuditBlock $auditBlock -Message "Non-implementation read-only runs must use 'Permission Approval Status: not-required' and leave writable approval fields as 'n/a'."
  }
  $decisionSummary = 'non-implementation phase forced explicit read-only sandbox'
}

if ($FullAuto -and -not $useWorkspaceWrite) {
  $decisionSummary += '; ignored manual -FullAuto override because the task packet did not authorize writable execution'
}

$watchdogSeconds = Get-StallBudgetSeconds -Phase $phase -RawValue $stallBudgetValue
$stallBudgetSource = Get-StallBudgetSource -RawValue $stallBudgetValue -Seconds $watchdogSeconds
$permissionAuditBlock = New-PermissionAuditBlock -DeclaredPermission $permissionMode -EffectiveMode $effectiveMode -ApprovalStatus $approvalStatus -ApprovedBy $approvedBy -ApprovalReason $approvalReason -ApprovedScope $approvedScope -ApprovalReference $approvalReference -DecisionSummary $decisionSummary

if ($useWorkspaceWrite) {
  $cliArgs += '--full-auto'
} else {
  $cliArgs += @('--sandbox', 'read-only')
}
if ($Model) { $cliArgs += @('--model', $Model) }
$cliArgs += '-'

if ($DryRun) {
  [pscustomobject]@{
    Cli = 'codex'
    RepoRoot = $RepoRoot
    TaskFile = $TaskFile
    ReportFile = $ReportFile
    LogFile = $LogFile
    Args = $cliArgs
    DeclaredExecutionPermission = $permissionMode
    EffectiveRuntimePermissionMode = $effectiveMode
    PermissionApprovalStatus = $approvalStatus
    ApprovedBy = $approvedBy
    ApprovalReason = $approvalReason
    ApprovedWritableScope = $approvedScope
    ApprovalReference = $approvalReference
    LauncherDecisionSummary = $decisionSummary
    RuntimeStallBudget = $stallBudgetValue
    EffectiveWatchdogSeconds = $watchdogSeconds
    PromptLength = $prompt.Length
    PromptPreview = if ($prompt.Length -gt 2000) { $prompt.Substring(0, 2000) } else { $prompt }
  } | ConvertTo-Json -Depth 4
  exit 0
}

$promptPath = Join-Path ([System.IO.Path]::GetTempPath()) ("sdtk-mailbox-prompt-" + [guid]::NewGuid().ToString('N') + '.md')
[System.IO.File]::WriteAllText($promptPath, $prompt, $Utf8NoBom)
try {
  $processResult = Invoke-CodexProcessWithWatchdog -RepoRootPath $RepoRoot -PromptPath $promptPath -ReportPath $ReportFile -LogPath $LogFile -ModelName $Model -UseWorkspaceWrite:$useWorkspaceWrite -WatchdogSeconds $watchdogSeconds
  $reportStateBeforeCloseout = Get-ReportState $ReportFile
  $runtimeExitCode = if ($processResult.TimedOut) { 'timed-out' } else { [string]$processResult.ExitCode }
  $needsPartialFailureCloseout = $processResult.TimedOut -or $processResult.ExitCode -ne 0 -or $reportStateBeforeCloseout -ne 'present'

  if ($needsPartialFailureCloseout) {
    if ($processResult.TimedOut) {
      $closeoutReason = "launcher watchdog terminated the external Codex run after $watchdogSeconds second(s) before a usable normal closeout path was reached"
      $watchdogReached = 'yes'
    } elseif ($reportStateBeforeCloseout -ne 'present') {
      $closeoutReason = "external Codex run exited with code $runtimeExitCode without writing a usable runtime report"
      $watchdogReached = 'no'
    } else {
      $closeoutReason = "external Codex run exited with code $runtimeExitCode and requires controller review before the batch can proceed"
      $watchdogReached = 'no'
    }

    $partialFailureBlock = New-PartialFailureCloseoutBlock -CloseoutReason $closeoutReason -StallBudgetSource $stallBudgetSource -WatchdogSeconds $watchdogSeconds -RuntimeExitCode $runtimeExitCode -ReportStateBeforeCloseout $reportStateBeforeCloseout -LogPath $(if ($LogFile) { $LogFile } else { 'n/a' }) -CloseoutAuthorship $(if ($reportStateBeforeCloseout -eq 'present') { 'no' } else { 'yes' }) -WatchdogReached $watchdogReached

    if ($reportStateBeforeCloseout -eq 'present') {
      Append-FileText $ReportFile $partialFailureBlock
      Append-FileText $ReportFile $permissionAuditBlock
      if ($LogFile) {
        Append-FileText $LogFile $partialFailureBlock
        Append-FileText $LogFile $permissionAuditBlock
      }
    } else {
      Write-StructuredPartialFailureReport -RepoRootPath $RepoRoot -ReportPath $ReportFile -LogPath $LogFile -CloseoutReason $closeoutReason -RuntimeExitCode $runtimeExitCode -ReportStateBeforeCloseout $reportStateBeforeCloseout -PermissionAuditBlock $permissionAuditBlock -PartialFailureBlock $partialFailureBlock -BoundaryMode $boundaryMode -IssueCloseoutMode $issueCloseoutMode -DecisionRequested $decisionRequested -Phase $phase -PrimaryFormalArtifact $primaryFormalArtifact -WatchdogReached $watchdogReached
    }

    if ($processResult.TimedOut) {
      Write-Error $closeoutReason
      exit 124
    }

    if ($processResult.ExitCode -ne 0) {
      Write-Error $closeoutReason
      exit $processResult.ExitCode
    }

    Write-Error $closeoutReason
    exit 3
  }

  Append-FileText $ReportFile $permissionAuditBlock
  if ($LogFile) {
    Append-FileText $LogFile $permissionAuditBlock
  }

  $validatorPath = Join-Path $RepoRoot 'products/sdtk-spec/toolkit/scripts/agents/validate-mailbox-formal-artifact.py'
  Invoke-PhaseArtifactValidation -TaskLines $taskLines -RepoRootPath $RepoRoot -ReportPath $ReportFile -LogPath $LogFile -ValidatorPath $validatorPath
  Write-Host "Codex report written to: $ReportFile"
} finally {
  Remove-Item $promptPath -Force -ErrorAction SilentlyContinue
}
