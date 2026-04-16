param(
  [Parameter(Mandatory = $true)]
  [string]$FeatureKey,

  [Parameter(Mandatory = $true)]
  [string]$FeatureName,

  [string]$ProjectPath,

  [switch]$Force,

  [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function ConvertTo-PascalCase {
  param([Parameter(Mandatory = $true)][string]$Text)

  $parts = @($Text -split '[^A-Za-z0-9]+' | Where-Object { $_ -and $_.Trim().Length -gt 0 })
  if (-not $parts -or $parts.Count -eq 0) {
    return ''
  }

  return ($parts | ForEach-Object {
    if ($_.Length -eq 1) { $_.Substring(0, 1).ToUpper() }
    else { $_.Substring(0, 1).ToUpper() + $_.Substring(1) }
  }) -join ''
}

function Render-Template {
  param(
    [Parameter(Mandatory = $true)][string]$TemplatePath,
    [Parameter(Mandatory = $true)][hashtable]$Tokens
  )

  $content = Get-Content -Raw -Path $TemplatePath -Encoding UTF8
  # Strip BOM if present (Windows PowerShell 5.1 may read BOM into string)
  if ($content.Length -gt 0 -and $content[0] -eq [char]0xFEFF) {
    $content = $content.Substring(1)
  }
  foreach ($key in $Tokens.Keys) {
    $content = $content.Replace("{{${key}}}", [string]$Tokens[$key])
  }
  return $content
}

function Write-RenderedFile {
  param(
    [Parameter(Mandatory = $true)][string]$DestinationPath,
    [Parameter(Mandatory = $true)][string]$TemplatePath,
    [Parameter(Mandatory = $true)][hashtable]$Tokens,
    [Parameter(Mandatory = $true)][bool]$Overwrite
  )

  if ((Test-Path -LiteralPath $DestinationPath) -and -not $Overwrite) {
    throw "Refusing to overwrite existing file (use -Force): $DestinationPath"
  }

  $parent = Split-Path -Parent $DestinationPath
  if ($parent -and -not (Test-Path -LiteralPath $parent)) {
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
  }

  $rendered = Render-Template -TemplatePath $TemplatePath -Tokens $Tokens
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($DestinationPath, $rendered, $utf8NoBom)
}

$config = $null
function Get-StringOrDefault {
  param(
    [AllowNull()][object]$Value,
    [Parameter(Mandatory = $true)][string]$Default
  )

  if ($null -eq $Value) {
    return $Default
  }
  $text = ([string]$Value).Trim()
  if ($text.Length -eq 0) {
    return $Default
  }
  return $text
}

function Get-PropValue {
  param(
    [AllowNull()][object]$Object,
    [Parameter(Mandatory = $true)][string]$Name
  )

  if ($null -eq $Object) {
    return $null
  }
  $prop = $Object.PSObject.Properties[$Name]
  if ($null -eq $prop) {
    return $null
  }
  return $prop.Value
}

$toolkitRoot = Resolve-Path (Join-Path $PSScriptRoot '..')

if ($ProjectPath) {
  if (-not (Test-Path -LiteralPath $ProjectPath)) {
    New-Item -ItemType Directory -Force -Path $ProjectPath | Out-Null
  }
  $projectRoot = Resolve-Path -LiteralPath $ProjectPath
} else {
  $projectRoot = Resolve-Path (Join-Path $toolkitRoot '..')
}

# Warn if legacy Docs/ compatibility folder exists at project root
$legacyDocs = Join-Path $projectRoot 'Docs'
if ((Test-Path -LiteralPath $legacyDocs) -and ($env:OS -eq 'Windows_NT')) {
  Write-Host "[WARN] Legacy 'Docs/' folder detected at project root." -ForegroundColor Yellow
  Write-Host "       On Windows, 'docs/' and 'Docs/' resolve to same folder." -ForegroundColor Yellow
  Write-Host "       Consider: git mv Docs tmp-docs && git mv tmp-docs docs" -ForegroundColor Yellow
}

$templateRoot = Join-Path $toolkitRoot 'templates'

if (-not (Test-Path -LiteralPath $templateRoot)) {
  throw "Missing templates directory: $templateRoot"
}

$configPath = Join-Path $projectRoot 'sdtk-spec.config.json'
if (-not (Test-Path -LiteralPath $configPath)) {
  $configPath = Join-Path $toolkitRoot 'sdtk-spec.config.json'
}

if (Test-Path -LiteralPath $configPath) {
  try {
    $config = Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json
  } catch {
    throw "Failed to parse config file: $configPath`n$($_.Exception.Message)"
  }
}

$FeatureKey = $FeatureKey.Trim()
$FeatureName = $FeatureName.Trim()

if (-not $FeatureKey) { throw "FeatureKey is empty." }
if ($FeatureKey -notmatch '^[A-Z][A-Z0-9_]*$') {
  throw "Invalid FeatureKey. Use UPPER_SNAKE_CASE (A-Z, 0-9, _)."
}
if (-not $FeatureName) { throw "FeatureName is empty." }

$now = Get-Date
$date = $now.ToString('yyyy-MM-dd')
$dateTime = $now.ToString('yyyy-MM-dd HH:mm')

$featureSnake = $FeatureKey.ToLower()
$featurePascal = ConvertTo-PascalCase -Text $FeatureName
if (-not $featurePascal) {
  $featurePascal = ConvertTo-PascalCase -Text $FeatureKey
}

$stack = Get-PropValue -Object $config -Name 'stack'
$commands = Get-PropValue -Object $config -Name 'commands'

$stackBackend = Get-StringOrDefault -Value (Get-PropValue -Object $stack -Name 'backend') -Default 'TBD'
$stackFrontend = Get-StringOrDefault -Value (Get-PropValue -Object $stack -Name 'frontend') -Default 'TBD'
$stackMobile = Get-StringOrDefault -Value (Get-PropValue -Object $stack -Name 'mobile') -Default 'TBD'
$stackDatabase = Get-StringOrDefault -Value (Get-PropValue -Object $stack -Name 'database') -Default 'TBD'
$stackAuth = Get-StringOrDefault -Value (Get-PropValue -Object $stack -Name 'auth') -Default 'TBD'

$cmdBackendTests = Get-StringOrDefault -Value (Get-PropValue -Object $commands -Name 'backendTests') -Default 'TBD'
$cmdBackendTypecheck = Get-StringOrDefault -Value (Get-PropValue -Object $commands -Name 'backendTypecheck') -Default 'TBD'
$cmdBackendLint = Get-StringOrDefault -Value (Get-PropValue -Object $commands -Name 'backendLint') -Default 'TBD'
$cmdFrontendTests = Get-StringOrDefault -Value (Get-PropValue -Object $commands -Name 'frontendTests') -Default 'TBD'
$cmdFrontendLint = Get-StringOrDefault -Value (Get-PropValue -Object $commands -Name 'frontendLint') -Default 'TBD'
$cmdE2eTests = Get-StringOrDefault -Value (Get-PropValue -Object $commands -Name 'e2eTests') -Default 'TBD'

$tokens = @{
  FEATURE_KEY   = $FeatureKey
  FEATURE_NAME  = $FeatureName
  FEATURE_PASCAL = $featurePascal
  FEATURE_SNAKE = $featureSnake
  DATE          = $date
  DATETIME      = $dateTime

  STACK_BACKEND = $stackBackend
  STACK_FRONTEND = $stackFrontend
  STACK_MOBILE = $stackMobile
  STACK_DATABASE = $stackDatabase
  STACK_AUTH = $stackAuth

  CMD_BACKEND_TESTS = $cmdBackendTests
  CMD_BACKEND_TYPECHECK = $cmdBackendTypecheck
  CMD_BACKEND_LINT = $cmdBackendLint
  CMD_FRONTEND_TESTS = $cmdFrontendTests
  CMD_FRONTEND_LINT = $cmdFrontendLint
  CMD_E2E_TESTS = $cmdE2eTests
}

$outputs = @(
  @{ Dest = (Join-Path $projectRoot 'SHARED_PLANNING.md'); Template = (Join-Path $templateRoot 'SHARED_PLANNING.md') },
  @{ Dest = (Join-Path $projectRoot 'QUALITY_CHECKLIST.md'); Template = (Join-Path $templateRoot 'QUALITY_CHECKLIST.md') },

  @{ Dest = (Join-Path $projectRoot "docs/product/PROJECT_INITIATION_$FeatureKey.md"); Template = (Join-Path $templateRoot 'docs/product/PROJECT_INITIATION_TEMPLATE.md') },
  @{ Dest = (Join-Path $projectRoot "docs/specs/BA_SPEC_$FeatureKey.md"); Template = (Join-Path $templateRoot 'docs/specs/BA_SPEC_TEMPLATE.md') },
  @{ Dest = (Join-Path $projectRoot "docs/specs/${FeatureKey}_FLOW_ACTION_SPEC.md"); Template = (Join-Path $templateRoot 'docs/specs/FLOW_ACTION_SPEC_TEMPLATE.md') },
  @{ Dest = (Join-Path $projectRoot "docs/product/PRD_$FeatureKey.md"); Template = (Join-Path $templateRoot 'docs/product/PRD_TEMPLATE.md') },
  @{ Dest = (Join-Path $projectRoot "docs/product/BACKLOG_$FeatureKey.md"); Template = (Join-Path $templateRoot 'docs/product/BACKLOG_TEMPLATE.md') },
  @{ Dest = (Join-Path $projectRoot "docs/architecture/ARCH_DESIGN_$FeatureKey.md"); Template = (Join-Path $templateRoot 'docs/architecture/ARCH_DESIGN_TEMPLATE.md') },
  @{ Dest = (Join-Path $projectRoot "docs/database/DATABASE_SPEC_$FeatureKey.md"); Template = (Join-Path $templateRoot 'docs/database/DATABASE_SPEC_TEMPLATE.md') },

  @{ Dest = (Join-Path $projectRoot "docs/api/${featurePascal}_API.yaml"); Template = (Join-Path $templateRoot 'docs/api/FEATURE_API_TEMPLATE.yaml') },
  @{ Dest = (Join-Path $projectRoot "docs/api/${FeatureKey}_ENDPOINTS.md"); Template = (Join-Path $templateRoot 'docs/api/API_ENDPOINTS_TEMPLATE.md') },
  @{ Dest = (Join-Path $projectRoot "docs/api/${FeatureKey}_API_DESIGN_DETAIL.md"); Template = (Join-Path $templateRoot 'docs/api/API_DESIGN_DETAIL_TEMPLATE.md') },
  @{ Dest = (Join-Path $projectRoot "docs/api/${featureSnake}_api_flow_list.txt"); Template = (Join-Path $templateRoot 'docs/api/feature_api_flow_list_TEMPLATE.txt') },
  @{ Dest = (Join-Path $projectRoot "docs/design/DESIGN_LAYOUT_$FeatureKey.md"); Template = (Join-Path $templateRoot 'docs/design/DESIGN_LAYOUT_TEMPLATE.md') },

  @{ Dest = (Join-Path $projectRoot "docs/dev/FEATURE_IMPL_PLAN_$FeatureKey.md"); Template = (Join-Path $templateRoot 'docs/dev/FEATURE_IMPL_PLAN_TEMPLATE.md') },
  @{ Dest = (Join-Path $projectRoot "docs/qa/${FeatureKey}_TEST_CASE.md"); Template = (Join-Path $templateRoot 'docs/qa/TEST_CASE_TEMPLATE.md') },
  @{ Dest = (Join-Path $projectRoot "docs/qa/QA_RELEASE_REPORT_$FeatureKey.md"); Template = (Join-Path $templateRoot 'docs/qa/QA_RELEASE_REPORT_TEMPLATE.md') },
  @{ Dest = (Join-Path $projectRoot "docs/qa/CONTROLLER_ACCEPTANCE_$FeatureKey.md"); Template = (Join-Path $templateRoot 'docs/qa/CONTROLLER_ACCEPTANCE_TEMPLATE.md') }
)

if ($ValidateOnly) {
  foreach ($item in $outputs) {
    $tmpl = [string]$item.Template
    if (-not (Test-Path -LiteralPath $tmpl)) {
      throw "Missing template file: $tmpl"
    }
  }

  Write-Host "Validation only: inputs and templates are valid."
  Write-Host "No files were written because -ValidateOnly was specified."
  return
}

$created = New-Object System.Collections.Generic.List[string]
foreach ($item in $outputs) {
  $dest = [string]$item.Dest
  $tmpl = [string]$item.Template
  if (-not (Test-Path -LiteralPath $tmpl)) {
    throw "Missing template file: $tmpl"
  }

  $willOverwrite = (Test-Path -LiteralPath $dest)
  Write-RenderedFile -DestinationPath $dest -TemplatePath $tmpl -Tokens $tokens -Overwrite ([bool]$Force)
  if (-not $willOverwrite) {
    $created.Add($dest) | Out-Null
  }
}

Write-Host "Initialized feature: $FeatureKey ($FeatureName)"
Write-Host "FeaturePascal: $featurePascal"
Write-Host "FeatureSnake: $featureSnake"

if ($created.Count -gt 0) {
  Write-Host ""
  Write-Host "Created files:"
  $created | ForEach-Object { Write-Host " - $_" }
} else {
  Write-Host ""
  Write-Host "No new files created (all existed); use -Force to overwrite if needed."
}
