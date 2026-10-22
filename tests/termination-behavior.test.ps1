$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$tokens=$null;$errors=$null
$managerPath=if($env:BOCCHI_TEST_MANAGER){$env:BOCCHI_TEST_MANAGER}else{Join-Path $root '管理主题.ps1'}
$ast=[Management.Automation.Language.Parser]::ParseFile($managerPath,[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'Manager parse failed'}
foreach($name in @('Stop-OwnDaemon','ConvertTo-UtcStamp')){
 $fn=$ast.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$true)
 . ([scriptblock]::Create($fn.Extent.Text))
}
$node='C:\Fixture\node.exe';$controlPath='fixture-control'
$state=[pscustomobject]@{daemonPid=123;daemonCreated='2026-10-22T00:00:00.0000000Z'}
function Test-DreamSkinPathEqual($Left,$Right){[string]::Equals($Left,$Right,[StringComparison]::OrdinalIgnoreCase)}
function Get-Date {$script:clock=$script:clock.AddSeconds(10);return $script:clock}
function Start-Sleep {param($Milliseconds)}
function Write-LocalJson {param($Path,$Value)$script:writes++}
function Test-OwnDaemon {param($State)$script:checks++;return ($script:identity -and -not $script:stopped -and -not ($script:scenario -eq 'late-identity' -and $script:checks -ge 4))}
function Get-Process {param($Id,$ErrorAction)$script:probes++;return $script:held}
function Stop-Process {param($InputObject,$ErrorAction)$script:terminations++;if(-not [object]::ReferenceEquals($InputObject,$script:held)){throw 'Wrong held process'};$script:stopped=$true}
function Reset-Fixture($Scenario){
 $script:scenario=$Scenario;$script:clock=[datetime]'2026-10-22T00:00:00Z'
 $script:writes=0;$script:checks=0;$script:probes=0;$script:terminations=0;$script:stopped=$false;$script:disposed=$false;$script:identity=$Scenario -ne 'initial-identity'
 $script:held=[pscustomobject]@{Handle=[IntPtr]1;StartTime=[datetime]'2026-10-22T00:00:00Z';Path=$node}
 $script:held|Add-Member ScriptMethod WaitForExit {param($Milliseconds)return $true}
 $script:held|Add-Member ScriptMethod Dispose {$script:disposed=$true}
 if($Scenario -eq 'pid-reuse'){$script:held.StartTime=$script:held.StartTime.AddSeconds(1)}
 if($Scenario -eq 'wrong-path'){$script:held.Path='C:\Other\node.exe'}
 if($Scenario -eq 'missing-handle'){$script:held.Handle=[IntPtr]0}
}
foreach($scenario in @('initial-identity','pid-reuse','wrong-path','missing-handle','late-identity')){
 Reset-Fixture $scenario
 $caught=$false;try{Stop-OwnDaemon $state}catch{$caught=$true}
 if($script:terminations -ne 0){throw ('Terminated unverified fixture: '+$scenario)}
 if($scenario -eq 'initial-identity'){
  if($script:writes -ne 0 -or $script:probes -ne 0){throw 'Initial mismatch must not write control or obtain a process'}
 }elseif(-not $caught -or -not $script:disposed){throw ('Mismatch did not reject and dispose: '+$scenario)}
}
Reset-Fixture 'valid';Stop-OwnDaemon $state
if($script:terminations -ne 1 -or -not $script:disposed){throw 'Verified fixture did not exercise termination branch'}
Write-Output 'PASS: five daemon identity/PID-reuse negatives call no termination; valid held-object positive calls exactly once. All process/control operations mocked; client Restore termination remains covered only by static contract.'
