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
