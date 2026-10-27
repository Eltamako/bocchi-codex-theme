$ErrorActionPreference='Stop'
. (Join-Path (Split-Path $PSScriptRoot -Parent) 'engine/session-guard.ps1')
$state=[pscustomobject]@{generation='g';browserId='b';daemonPid=123;runtimeHash='h'}
$status=[pscustomobject]@{state='suspended';requestId='q';generation='g';browserId='b';daemonPid=123;runtimeHash='h';renderers=@([pscustomobject]@{installed=$false;reason='automatic-dark-appearance-failed'})}
if((Get-BocchiBlockedReason $status $state 'q') -cne 'automatic-dark-appearance-failed'){throw 'Matching light-mode reason was lost'}
foreach($field in @('requestId','generation','browserId','daemonPid','runtimeHash','state')){
  $prior=$status.$field;$status.$field=$(if($field -eq 'daemonPid'){456}else{'different'})
  if(Get-BocchiBlockedReason $status $state 'q'){throw ('Accepted a mismatched '+$field)}
  $status.$field=$prior
}
$status.renderers[0].reason='required-markers-missing'
if(Get-BocchiBlockedReason $status $state 'q'){throw 'Misdiagnosed unknown page as light mode'}
Write-Output 'PASS: exact-request light-mode attribution and seven mismatch/unknown-page protections.'

$status.renderers[0].reason='required-markers-missing'
if((Get-BocchiReadinessDiagnostic $status $state 'q') -cne 'required-markers-missing'){throw 'Page diagnostic was lost'}
foreach($field in @('requestId','generation','browserId','daemonPid','runtimeHash')){
  $prior=$status.$field;$status.$field=$(if($field -eq 'daemonPid'){456}else{'different'})
  if(Get-BocchiReadinessDiagnostic $status $state 'q'){throw ('Accepted a stale diagnostic '+$field)}
  $status.$field=$prior
}
$status.state='waiting-or-blocked'
$status|Add-Member -NotePropertyName reason -NotePropertyValue 'fetch failed'
if((Get-BocchiReadinessDiagnostic $status $state 'q') -cne 'theme-connection-unavailable'){throw 'Lost connection diagnostic'}
$status.reason='Unrecognized private details'
if((Get-BocchiReadinessDiagnostic $status $state 'q') -cne 'loader-unavailable'){throw 'Unbounded diagnostic'}
$status.state='running'
if(Get-BocchiReadinessDiagnostic $status $state 'q'){throw 'Reported a failure for a running state'}
Write-Output 'PASS: nine request-scoped diagnostic, connection and unknown-reason checks.'

$status.renderers[0]=[pscustomobject]@{installed=$true;ready=$false;version='2.6.2'}
if(Test-BocchiReadyStatus $status $state 'q' '2.6.2'){throw 'Decoded but unfinished raster was treated as ready'}
if((Get-BocchiReadinessDiagnostic $status $state 'q' '2.6.2') -cne 'renderer-not-ready'){throw 'Missing raster readiness diagnostic'}
$status.renderers[0].ready=$true
if(-not (Test-BocchiReadyStatus $status $state 'q' '2.6.2')){throw 'Complete renderer rejected'}
if((Get-BocchiReadinessDiagnostic $status $state 'q' 'other') -cne 'version-mismatch'){throw 'Missing theme version diagnostic'}
$status.state='blocked'
if((Get-BocchiReadinessDiagnostic $status $state 'q' '2.6.2') -cne 'loader-stopped'){throw 'Missing terminal diagnostic'}
$status.state='retrying';$status.reason='theme-connection-unavailable'
if((Get-BocchiReadinessDiagnostic $status $state 'q' '2.6.2') -cne 'theme-connection-unavailable'){throw 'Missing retry diagnostic'}
Write-Output 'PASS: readiness, version mismatch, terminal and retry diagnostics.'

$status.state='running'
$status.renderers=@([pscustomobject]@{targetId='first';installed=$true;ready=$true;version='2.7.0'},[pscustomobject]@{targetId='second';installed=$true;ready=$true;version='2.7.0'})
if(-not (Test-BocchiReadyStatus $status $state 'q' '2.7.0')){throw 'Two ready windows rejected'}
$status.renderers[1].ready=$false
if(Test-BocchiReadyStatus $status $state 'q' '2.7.0'){throw 'Second pending window falsely accepted'}
if((Get-BocchiReadinessDiagnostic $status $state 'q' '2.7.0') -cne 'renderer-not-ready'){throw 'Second window diagnostic lost'}
$status.renderers[1].ready=$true;$status.renderers[1].targetId='first'
if(Test-BocchiReadyStatus $status $state 'q' '2.7.0'){throw 'Duplicated window identity accepted'}
$status.renderers[1].targetId='second';$status.renderers[1].version='other'
if(Test-BocchiReadyStatus $status $state 'q' '2.7.0'){throw 'Second window wrong version accepted'}
$status.state='suspended';$status.renderers[1]=[pscustomobject]@{targetId='second';installed=$false;ready=$false;reason='renderer-validation-failed'}
if((Get-BocchiReadinessDiagnostic $status $state 'q' '2.7.0') -cne 'renderer-validation-failed'){throw 'Second failed window diagnostic lost'}
$status.renderers[1].reason='automatic-dark-appearance-failed'
if((Get-BocchiBlockedReason $status $state 'q') -cne 'automatic-dark-appearance-failed'){throw 'Second window appearance failure lost'}
Write-Output 'PASS: multi-window readiness, duplicate identities and per-window diagnostics.'

$tokens=$null;$parseErrors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path (Split-Path $PSScriptRoot -Parent) 'engine/common-windows.ps1'),[ref]$tokens,[ref]$parseErrors)
if($parseErrors.Count){throw 'Common source parse failure'}
$definition=$ast.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Test-BocchiMainPageUrl'},$true)
. ([scriptblock]::Create($definition.Extent.Text))
$route='app://-/index.html?initialRoute=%2Flocal%2F00000000-0000-0000-0000-000000000000'
if(-not (Test-BocchiMainPageUrl 'app://-/index.html') -or -not (Test-BocchiMainPageUrl $route)){throw 'Verified main window URL rejected'}
foreach($bad in @('https://example.com','app://-/index.html?initialRoute=%2Favatar-overlay','app://-/detached-window.html?initialRoute=%2Fdetached-window',($route+'&extra=1'),($route+'#extra'),($route+'&initialRoute=%2Favatar-overlay'))){if(Test-BocchiMainPageUrl $bad){throw 'Auxiliary or malformed window URL accepted'}}
Write-Output 'PASS: Windows launcher accepts verified task routes and excludes auxiliary windows.'
