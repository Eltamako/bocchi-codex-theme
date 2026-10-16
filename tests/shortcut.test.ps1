$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
. (Join-Path $root 'engine\bootstrap-shell.ps1')
. (Join-Path $root 'engine\install-shortcut.ps1')
$fixture=Join-Path $root ('.test-output\shortcut-'+[Guid]::NewGuid().ToString('N'))
$desktop=Join-Path $fixture 'desktop'
$state=Join-Path $fixture 'state'
$first=Join-Path $fixture 'first copy'
$second=Join-Path $fixture 'second copy'
foreach($dir in @($desktop,$state,$first,$second)){New-Item -ItemType Directory -Path $dir -Force|Out-Null}
Install-BocchiShortcut -Root $first -StateRoot $state -Desktop $desktop
$link=Join-Path $desktop 'Bocchi Codex Theme.lnk'
$shell=New-Object -ComObject WScript.Shell
$created=$shell.CreateShortcut($link)
if($created.WorkingDirectory -cne $first -or -not $created.Arguments.Contains(('"'+(Join-Path $first '入口.ps1')+'"'))){throw 'Incorrect shortcut target or quoting'}
if($created.Arguments -notmatch '-WindowStyle Hidden' -or $created.Arguments -notmatch '-Action Start'){throw 'Unexpected launch arguments'}
$hash=(Get-FileHash -LiteralPath $link).Hash
Install-BocchiShortcut -Root $second -StateRoot $state -Desktop $desktop
$backups=@(Get-ChildItem -LiteralPath (Join-Path $state 'backups') -Filter '*.lnk' -Recurse)
if($backups.Count -ne 1 -or (Get-FileHash -LiteralPath $backups[0].FullName).Hash -cne $hash){throw 'Original shortcut not preserved'}
if($shell.CreateShortcut($link).WorkingDirectory -cne $second){throw 'Shortcut not updated'}
Install-BocchiShortcut -Root $second -StateRoot $state -Desktop $desktop
if(@(Get-ChildItem -LiteralPath (Join-Path $state 'backups') -Filter '*.lnk' -Recurse).Count -ne 1){throw 'Repeated setup produced another backup'}
Write-Output 'PASS: create, quoted arguments, hidden launch, exact backup, update and idempotent shortcut setup. Test directory only; no desktop changes or launch.'
