$ErrorActionPreference='Stop'
$stage=Split-Path $PSScriptRoot -Parent
$null=New-Item -ItemType Directory -Path (Join-Path $stage '.test-output') -Force
. (Join-Path $stage 'engine/i18n.ps1')
Initialize-BocchiLanguage -Root $stage -Language 'zh-CN'
function Write-BocchiStartupTrace {param($Stage,$Own)}
$target=Join-Path $stage '管理主题.ps1'
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile($target,[ref]$tokens,[ref]$errors)
$checks=[Collections.Generic.List[object]]::new()
function Check([string]$Name,[bool]$Ok){$checks.Add([pscustomobject]@{name=$Name;passed=$Ok});if(-not $Ok){throw $Name}}
Check 'PowerShell syntax' ($errors.Count -eq 0)
foreach($name in @('ConvertTo-UtcStamp','Get-OwnIdentity','Get-BocchiLaunchOwner','Get-BocchiOtherDesktopClients','Get-BocchiParallelState','Assert-BocchiNoParallelDesktop')){
 $def=$ast.Find({param($node)$node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name},$true)
 . ([scriptblock]::Create($def.Extent.Text))
}
function Test-DreamSkinPathEqual([string]$Left,[string]$Right){[string]::Equals($Left,$Right,[StringComparison]::OrdinalIgnoreCase)}
$script:clock=[datetime]'2026-10-20T00:00:00Z'
function Get-Date {$script:clock=$script:clock.AddSeconds(10);$script:clock}
$script:sleeps=0;$script:exitAfter=0
function Start-Sleep {param($Milliseconds)$script:sleeps++;if($script:exitAfter -and $script:sleeps -ge $script:exitAfter){$script:clients=@()}}
function Write-BocchiStartupTrace {param($Stage,$Own)$script:lastTraceStage=$Stage}
$codex=[pscustomobject]@{Executable='C:\Verified\ChatGPT.exe'}
$when=[datetime]'2026-10-20T00:00:00Z'
function P([int]$Id,[string]$Cmd,[string]$Exe='C:\Verified\ChatGPT.exe'){
 [pscustomobject]@{ProcessId=$Id;CommandLine=$Cmd;ExecutablePath=$Exe;CreationDate=$when}
}
$owner=P 10 'ChatGPT.exe "--user-data-dir=D:\中文 空格\managed-profile"'
$ordinary=P 20 'ChatGPT.exe'
$child=P 21 'ChatGPT.exe --type=renderer'
$script:clients=@()
function Get-CimInstance {param($ClassName,$Filter,$ErrorAction)if($Filter -match '^ProcessId = '){$owner}else{$script:clients}}
$script:window=[IntPtr]1;$script:livePath=$codex.Executable;$script:liveStart=$when
function Get-Process {param($Id,$ErrorAction)[pscustomobject]@{Path=$script:livePath;StartTime=$script:liveStart;MainWindowHandle=$script:window}}
Check 'no client permits launch' (@(Get-BocchiOtherDesktopClients $codex -Processes @()).Count -eq 0)
Check 'render helper ignored' (@(Get-BocchiOtherDesktopClients $codex -Processes @($child)).Count -eq 0)
Check 'verified owner excluded' (@(Get-BocchiOtherDesktopClients $codex -AllowedOwnerPid 10 -Processes @($owner,$child)).Count -eq 0)
Check 'ordinary main detected' (@(Get-BocchiOtherDesktopClients $codex -Processes @($ordinary,$child)).Count -eq 1)
Check 'unrelated executable ignored' (@(Get-BocchiOtherDesktopClients $codex -Processes @((P 30 'ChatGPT.exe' 'D:\Other\ChatGPT.exe'))).Count -eq 0)
Check 'unknown command remains blocked' (@(Get-BocchiOtherDesktopClients $codex -Processes @((P 30 $null))).Count -eq 1)
Check 'visible ordinary state' ((Get-BocchiParallelState @($ordinary)) -eq 'visible')
$script:window=[IntPtr]0
Check 'windowless ordinary state' ((Get-BocchiParallelState @($ordinary)) -eq 'background')
$script:liveStart=$when.AddSeconds(1)
Check 'PID reuse cannot be called background' ((Get-BocchiParallelState @($ordinary)) -eq 'unknown')
$script:liveStart=$when;$script:livePath='D:\Other\ChatGPT.exe'
Check 'path mismatch remains unknown' ((Get-BocchiParallelState @($ordinary)) -eq 'unknown')
$script:livePath=$codex.Executable
$script:clients=@($ordinary);$script:exitAfter=2;$script:sleeps=0
Assert-BocchiNoParallelDesktop $codex
Check 'asynchronous tray exit is allowed to finish' ($script:sleeps -eq 2 -and $script:clients.Count -eq 0)
$script:clients=@($ordinary);$script:exitAfter=0;$script:sleeps=0
$caught=''
try{Assert-BocchiNoParallelDesktop $codex}catch{$caught=$_.Exception.Data['BocchiMessageKey']}
Check 'background blocker explained and not killed' (($caught -eq 'manager.parallelBackground') -and $script:clients.Count -eq 1)
$script:window=[IntPtr]1
try{Assert-BocchiNoParallelDesktop $codex}catch{$caught=$_.Exception.Data['BocchiMessageKey']}
Check 'visible blocker explained' (($caught -eq 'manager.parallelVisible'))
$script:sleeps=0;$caught=''
try{Assert-BocchiNoParallelDesktop $codex ([pscustomobject]@{pid=10})}catch{$caught=$_.Exception.Data['BocchiMessageKey']}
Check 'existing own client cannot bypass another desktop' ($caught -eq 'manager.parallelVisible' -and $script:sleeps -gt 0 -and $script:clients.Count -eq 1)
$script:clients=@($owner,$child);$script:sleeps=0
Assert-BocchiNoParallelDesktop $codex ([pscustomobject]@{pid=10})
Check 'multiple renderer windows of the same owner remain allowed' ($script:sleeps -eq 0 -and $script:clients.Count -eq 2)
$port=9347;$profile='D:\中文 空格\managed-profile';$script:verifiedPort=$true
function Test-DreamSkinCodexPortOwner {param($Port,$Codex)$script:verifiedPort}
function Get-DreamSkinVerifiedCdpIdentity {param($Port,$Codex)$null}
function Get-DreamSkinCdpBrowserIdentity {param($Port)[pscustomobject]@{BrowserId='test-owned-browser'}}
function Get-DreamSkinPortListeners {param($Port)[pscustomobject]@{OwningProcess=10}}
Check 'old target-required probe fails on closed window' ($null -eq (Get-OwnIdentity $codex))
$found=Get-BocchiLaunchOwner $codex
Check 'closed theme recognized by exact owner and profile' ($found.pid -eq 10 -and $found.identity.BrowserId -eq 'test-owned-browser')
$owner=P 10 'ChatGPT.exe "--user-data-dir=D:\Other\profile"'
$caught='';try{Get-BocchiLaunchOwner $codex}catch{$caught=$_.Exception.Message}
Check 'foreign profile refused' ($caught.Contains('not the theme profile'))
$owner=P 10 'ChatGPT.exe "--user-data-dir=D:\中文 空格\managed-profile" --type=renderer'
$caught='';try{Get-BocchiLaunchOwner $codex}catch{$caught=$_.Exception.Message}
Check 'renderer cannot impersonate main owner' ($caught.Contains('Unexpected managed client process'))
$script:verifiedPort=$false
Check 'unverified listener never attached' ($null -eq (Get-BocchiLaunchOwner $codex))
# Exercise activation with a verified identity and fake OS boundaries only.
# The P/Invoke boundary is replaced by a harmless fixture type in this process.
Add-Type -TypeDefinition @'
using System;
namespace BocchiWindowActivation {
  public static class NativeMethods {
    public static bool Minimized;
    public static int RestoreCalls;
    public static IntPtr RestoredHandle;
    public static int Command;
    public static bool IsIconic(IntPtr handle) { return Minimized; }
    public static bool ShowWindowAsync(IntPtr handle, int command) {
      RestoreCalls++; RestoredHandle=handle; Command=command; Minimized=false; return true;
    }
  }
}
'@
$def=$ast.Find({param($node)$node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Restore-BocchiMinimizedWindow'},$true)
. ([scriptblock]::Create($def.Extent.Text))
Restore-BocchiMinimizedWindow -WindowHandle ([IntPtr]::Zero)
Check 'missing window handle is not restored' ([BocchiWindowActivation.NativeMethods]::RestoreCalls -eq 0)
$def=$ast.Find({param($node)$node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Open-BocchiOwnedWindow'},$true)
. ([scriptblock]::Create($def.Extent.Text))
$verified=[pscustomobject]@{pid=10;created=$when.ToUniversalTime().ToString('o');identity=[pscustomobject]@{BrowserId='test-owned-browser'}}
$script:currentOwner=$verified;$script:packageCalls=0;$script:activationCalls=0;$script:focusAllowed=$true;$script:openWindow=$true;$script:blockParallel=$false;$script:replaceOwner=$false;$script:pageProbes=0;$script:pageDelay=0
function Assert-BocchiNoParallelDesktop {param($Codex,$Own)if($script:blockParallel){throw 'test parallel desktop'}}
function Get-BocchiLaunchOwner {param($Codex)$script:currentOwner}
function Get-OwnIdentity {param($Codex)$script:pageProbes++;if($script:pageProbes -gt $script:pageDelay){$script:currentOwner}}
function Start-DreamSkinCodex {
 param($Codex,$Arguments)
 $script:packageCalls++
 if($script:openWindow){$script:window=[IntPtr]1}
 if($script:replaceOwner){$script:currentOwner=[pscustomobject]@{pid=20;created=$verified.created;identity=[pscustomobject]@{BrowserId='replacement'}}}
}
function New-Object {
 param($ComObject)
 if($ComObject -ne 'WScript.Shell'){throw 'Unexpected COM object in activation test'}
 $mock=[pscustomobject]@{}
 Add-Member -InputObject $mock -MemberType ScriptMethod -Name AppActivate -Value {param($TargetPid)$script:activationCalls++;if($TargetPid -ne 10){throw 'Wrong activation target'};return $script:focusAllowed}
 return $mock
}
$script:window=[IntPtr]1
$result=Open-BocchiOwnedWindow $codex $verified
Check 'visible owner is activated without package launch' ($result.pid -eq 10 -and $script:packageCalls -eq 0 -and $script:activationCalls -eq 1)
Check 'normal or maximized window is not sent SW_RESTORE' ([BocchiWindowActivation.NativeMethods]::RestoreCalls -eq 0)
[BocchiWindowActivation.NativeMethods]::Minimized=$true
$script:focusAllowed=$false
$result=Open-BocchiOwnedWindow $codex $verified
Check 'focus denial does not trigger another client' ($result.pid -eq 10 -and $script:packageCalls -eq 0 -and $script:activationCalls -eq 2)
Check 'minimized verified owner is restored before activation' ([BocchiWindowActivation.NativeMethods]::RestoreCalls -eq 1 -and [BocchiWindowActivation.NativeMethods]::RestoredHandle -eq [IntPtr]1 -and [BocchiWindowActivation.NativeMethods]::Command -eq 9)
$script:window=[IntPtr]0
$result=Open-BocchiOwnedWindow $codex $verified
Check 'windowless owner is reactivated exactly once' ($result.pid -eq 10 -and $script:packageCalls -eq 1 -and $script:activationCalls -eq 2)
$script:window=[IntPtr]0;$script:pageProbes=0;$script:pageDelay=1
$result=Open-BocchiOwnedWindow $codex $verified
Check 'window appearing before its page waits for page readiness without another launch' ($result.pid -eq 10 -and $script:pageProbes -eq 2 -and $script:packageCalls -eq 2)
$script:pageProbes=0;$script:pageDelay=100
$caught='';try{Open-BocchiOwnedWindow $codex $verified}catch{$caught=$_.Exception.Message}
Check 'a visible window without a ready page has a bounded failure' ($caught.Contains('verified identity') -and $script:pageProbes -lt 100 -and $script:packageCalls -eq 2)
$script:pageDelay=0
$script:currentOwner=[pscustomobject]@{pid=20;created=$verified.created;identity=[pscustomobject]@{BrowserId='replacement'}}
$caught='';try{Open-BocchiOwnedWindow $codex $verified}catch{$caught=$_.Exception.Message}
Check 'changed identity cannot activate or relaunch' ($caught.Contains('identity changed') -and $script:packageCalls -eq 2 -and $script:activationCalls -eq 3)
$script:currentOwner=$verified;$script:blockParallel=$true
$caught='';try{Open-BocchiOwnedWindow $codex $verified}catch{$caught=$_.Exception.Message}
Check 'parallel main client prevents package activation' ($caught -eq 'test parallel desktop' -and $script:packageCalls -eq 2 -and $script:activationCalls -eq 3)
$script:blockParallel=$false;$script:window=[IntPtr]0;$script:replaceOwner=$true
$caught='';try{Open-BocchiOwnedWindow $codex $verified}catch{$caught=$_.Exception.Message}
Check 'reopened window must retain the same browser identity' ($caught.Contains('identity changed') -and $script:packageCalls -eq 3)
$script:replaceOwner=$false;$script:currentOwner=$verified;$script:openWindow=$false;$script:window=[IntPtr]0
$caught='';try{Open-BocchiOwnedWindow $codex $verified}catch{$caught=$_.Exception.Message}
Check 'failed reopen has no second launch or false success' ($caught.Contains('verified identity') -and $script:packageCalls -eq 4)
$src=Get-Content -LiteralPath $target -Raw -Encoding utf8
Check 'launcher probes owned browser before parallel guard' ($src.Contains('$own=Get-BocchiLaunchOwner $codex'))
Check 'normal page readiness remains after window activation' ($src.Contains('$own=Get-OwnIdentity $codex') -and $src.Contains("Dedicated window did not reopen with its verified identity"))
Check 'resume can also reactivate the exact theme window' ($src.Contains("if(`$Action -in @('Start','Resume') -and `$reusingOwn)"))
. (Join-Path $PSScriptRoot 'termination-contract.ps1')
Assert-BocchiTerminationContract $ast
$out=@{passed=$true;count=$checks.Count;checks=$checks;scope='isolated PowerShell logic; no client launched or terminated'}
[IO.File]::WriteAllText((Join-Path $stage '.test-output/startup-checks.json'),($out|ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false))
$out|ConvertTo-Json -Depth 6
