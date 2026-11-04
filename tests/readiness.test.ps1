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

# Real wait loop with a simulated clock and a verified per-request status.
& {
  $tokens=$null;$errors=$null
  $manager=[Management.Automation.Language.Parser]::ParseFile((Join-Path (Split-Path $PSScriptRoot -Parent) '管理主题.ps1'),[ref]$tokens,[ref]$errors)
  if($errors.Count){throw 'Manager parse failure'}
  $def=$manager.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Wait-ThemeReady'},$true)
  . ([scriptblock]::Create($def.Extent.Text))
  $t=@{now=[datetime]'2026-11-04T00:00:00Z';ms=0;readyAt=22000;reason='unknown-active-page-or-layout';owned=$true;request='q'}
  $install=@{themeVersion='2.9.0'};$codex=@{Version='pkg';PackageRoot='verified'};$statusPath='simulation'
  function Get-Date {$t.now.AddMilliseconds($t.ms)}
  function Start-Sleep {param($Milliseconds) $t.ms+=$Milliseconds}
  function Test-OwnDaemon {$true}
  function Get-OwnIdentity {return @{identity='verified'}}
  function Test-BocchiSessionMatch {return $t.owned}
  function Get-Content {
    param($LiteralPath,[switch]$Raw,$Encoding)
    $ok=$t.ms -ge $t.readyAt
    @{at=$t.now.AddMilliseconds($t.ms-$t.age).ToUniversalTime().ToString('o');generation='g';browserId='b';daemonPid=123;runtimeHash='h';requestId=$t.request;state=$(if($ok){'running'}else{'suspended'});
      renderers=@(@{targetId='main';installed=$ok;ready=$ok;version='2.9.0';reason=$t.reason})}|ConvertTo-Json -Depth 4 -Compress
  }
  if(Wait-ThemeReady $state 'q'){throw 'Warm reuse must not take the cold-start grace period'}
  $t.ms=0
  if(-not (Wait-ThemeReady $state 'q' -ColdStart) -or $t.ms -ne 22000){throw 'Late first page did not become ready in the same startup'}
  $t.ms=0;$t.readyAt=400
  if(-not (Wait-ThemeReady $state 'q' -ColdStart) -or $t.ms -ne 400){throw 'Fast first paint was delayed'}
  $t.ms=0;$t.readyAt=90000
  if((Wait-ThemeReady $state 'q' -ColdStart) -or $t.ms -ne 60000){throw 'Missing page extended the cold-start limit indefinitely'}
  $t.ms=0;$t.request='stale'
  if((Wait-ThemeReady $state 'q' -ColdStart) -or $t.ms -gt 15500){throw 'Another request extended this startup'}
  $t.ms=0;$t.request='q';$t.reason='automatic-dark-appearance-failed'
  if((Wait-ThemeReady $state 'q' -ColdStart) -or $t.ms -ne 400){throw 'Appearance error was hidden by cold-start grace'}
  $t.ms=0;$t.readyAt=22000;$t.reason='unknown-active-page-or-layout';$t.owned=$false
  if(Wait-ThemeReady $state 'q' -ColdStart){throw 'Unverified client accepted after cold-start grace'}
  $t.ms=0;$t.readyAt=120000;$t.reason='awaiting-active-page';$t.owned=$true;$t.age=0
  if((Wait-ThemeReady $state 'q' -ColdStart) -or $script:BocchiReadinessReason -ne 'watching-for-page'){throw 'Healthy watcher was treated as fully ready or failed'}
  foreach($key in @('age','owned','request')){
    $t.ms=0;$t.age=0;$t.owned=$true;$t.request='q'
    $t[$key]=@{age=20000;owned=$false;request='stale'}[$key]
    if((Wait-ThemeReady $state 'q' -ColdStart) -or $script:BocchiReadinessReason -eq 'watching-for-page'){throw 'Stale request, status or ownership accepted for handoff'}
  }
  $status.state='suspended'
  $status.renderers=@(@{targetId='one';version='2.9.0';installed=$false;ready=$false;reason='awaiting-active-page'},@{targetId='two';version='2.9.0';installed=$true;ready=$true})
  if((Get-BocchiReadinessDiagnostic $status $state 'q' '2.9.0') -ne 'awaiting-active-page'){throw 'Valid ready sibling did not allow handoff'}
  $status.renderers[1]=@{targetId='two';version='2.9.0';installed=$false;ready=$false;reason='renderer-validation-failed'}
  if((Get-BocchiReadinessDiagnostic $status $state 'q' '2.9.0') -ne 'renderer-validation-failed'){throw 'Waiting window hid a broken sibling'}

}
Write-Output 'PASS: delayed and fast first page, capped timeout, warm reuse, stale request, real errors and owner verification.'
