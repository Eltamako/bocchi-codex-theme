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
$script:sleeps=0;$warning=@()
Assert-BocchiNoParallelDesktop $codex ([pscustomobject]@{pid=10}) -WarningAction SilentlyContinue -WarningVariable warning
Check 'existing own client reuses without a wait or stop' ($warning.Count -eq 1 -and $script:sleeps -eq 0)
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
$src=Get-Content -LiteralPath $target -Raw -Encoding utf8
Check 'launcher probes owned browser before parallel guard' ($src.Contains('$own=Get-BocchiLaunchOwner $codex'))
Check 'normal page readiness remains after window activation' ($src.Contains('$own=Get-OwnIdentity $codex') -and $src.Contains("Dedicated window did not reopen with its verified identity"))
Check 'resume can also reactivate the exact theme window' ($src.Contains("if(`$Action -in @('Start','Resume') -and `$reusingOwn)"))
$base=Get-Content -LiteralPath $target -Raw -Encoding utf8
Check 'no new process termination path' (([regex]::Matches($base,'Stop-Process')).Count -eq ([regex]::Matches($src,'Stop-Process')).Count)
$out=@{passed=$true;count=$checks.Count;checks=$checks;scope='isolated PowerShell logic; no client launched or terminated'}
[IO.File]::WriteAllText((Join-Path $stage '.test-output/startup-checks.json'),($out|ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false))
$out|ConvertTo-Json -Depth 6
