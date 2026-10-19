$ErrorActionPreference='Stop'
$stage=Split-Path $PSScriptRoot -Parent
$results=[Collections.Generic.List[object]]::new()
function Check([string]$Name,[bool]$Pass){
  $results.Add([pscustomobject]@{name=$Name;passed=$Pass})
  if(-not $Pass){throw ('Failed: '+$Name)}
}
$tokens=$null;$parseErrors=$null
$null=[Management.Automation.Language.Parser]::ParseFile((Join-Path $stage '管理主题.ps1'),[ref]$tokens,[ref]$parseErrors)
Check 'candidate PowerShell parse' ($parseErrors.Count -eq 0)
function Test-DreamSkinPathEqual([string]$Left,[string]$Right){
  [string]::Equals($Left,$Right,[StringComparison]::OrdinalIgnoreCase)
}
$manager=[Management.Automation.Language.Parser]::ParseFile((Join-Path $stage '管理主题.ps1'),[ref]$tokens,[ref]$parseErrors)
foreach($name in @('Get-BocchiOtherDesktopClients','Assert-BocchiNoParallelDesktop')){
 $definition=$manager.Find({param($a) $a -is [Management.Automation.Language.FunctionDefinitionAst] -and $a.Name -eq $name},$true)
 if(-not $definition){throw ('Missing function: '+$name)}
 . ([scriptblock]::Create($definition.Extent.Text))
}
$codex=[pscustomobject]@{Executable='C:\VerifiedApp\ChatGPT.exe'}
function P([int]$Id,[string]$Cmd,[string]$Exe='C:\VerifiedApp\ChatGPT.exe'){
  [pscustomobject]@{ProcessId=$Id;CommandLine=$Cmd;ExecutablePath=$Exe;CreationDate=[datetime]'2026-10-19T00:00:00Z'}
}
Check 'no clients permits launch' (@(Get-BocchiOtherDesktopClients $codex -Processes @()).Count -eq 0)
$own=P 10 'ChatGPT.exe --user-data-dir=theme'
Check 'verified owner is reused' (@(Get-BocchiOtherDesktopClients $codex -AllowedOwnerPid 10 -Processes @($own)).Count -eq 0)
$children=@((P 11 'ChatGPT.exe --type=renderer'),(P 12 'ChatGPT.exe "--type=gpu-process"'),(P 13 'ChatGPT.exe --type utility'))
Check 'renderer gpu and utility helpers excluded' (@(Get-BocchiOtherDesktopClients $codex -Processes $children).Count -eq 0)
$other=P 20 'ChatGPT.exe'
$found=@(Get-BocchiOtherDesktopClients $codex -AllowedOwnerPid 10 -Processes (@($own,$other)+$children))
Check 'second main client detected' ($found.Count -eq 1 -and $found[0].ProcessId -eq 20)
Check 'unrelated similarly named app ignored' (@(Get-BocchiOtherDesktopClients $codex -Processes @((P 21 'ChatGPT.exe' 'D:\OtherApp\ChatGPT.exe'))).Count -eq 0)
Check 'verified executable with unknown command is treated cautiously' (@(Get-BocchiOtherDesktopClients $codex -Processes @((P 22 $null))).Count -eq 1)
function Get-CimInstance { param($ClassName,$Filter,$ErrorAction) @($other) }
$blocked=$false
try{Assert-BocchiNoParallelDesktop -Codex $codex}catch{$blocked=$_.Exception.Message.StartsWith('Codex 已经打开了。')}
Check 'fresh theme launch refuses a parallel client' $blocked
$warning=@()
Assert-BocchiNoParallelDesktop -Codex $codex -Own ([pscustomobject]@{pid=10}) -WarningAction SilentlyContinue -WarningVariable warning
Check 'existing owner stays running with a clear warning' ($warning.Count -eq 1)
$out=[pscustomobject]@{at=(Get-Date).ToUniversalTime().ToString('o');passed=$results.Count;checks=$results}
[IO.File]::WriteAllText((Join-Path $stage '.test-output/guard-checks.json'),($out|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
$out|ConvertTo-Json -Depth 5
