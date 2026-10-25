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

$legacyRoot=Join-Path $fixture '旧版 中文 path'
New-Item -ItemType Directory -Path $legacyRoot -Force|Out-Null
[IO.File]::WriteAllText((Join-Path $legacyRoot '入口.ps1'),'# fixture only')
[IO.File]::WriteAllText((Join-Path $legacyRoot 'installation.json'),'{"schema":"bocchi-local-install/1","themeVersion":"2.4.0"}')
$legacyPath=Join-Path $desktop 'Codex · 孤独摇滚.lnk'
$legacy=$shell.CreateShortcut($legacyPath)
$legacy.TargetPath=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$legacy.WorkingDirectory=$legacyRoot
$legacy.Arguments='-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+(Join-Path $legacyRoot '入口.ps1')+'" -Action Start'
$legacy.Save()
$legacyHash=(Get-FileHash -LiteralPath $legacyPath).Hash
Install-BocchiShortcut -Root $second -StateRoot $state -Desktop $desktop
if(Test-Path -LiteralPath $legacyPath){throw 'Verified legacy entry was not migrated'}
$legacyBackups=@(Get-ChildItem -LiteralPath (Join-Path $state 'backups') -Filter 'Codex · 孤独摇滚.lnk' -Recurse)
if($legacyBackups.Count -ne 1 -or (Get-FileHash -LiteralPath $legacyBackups[0].FullName).Hash -cne $legacyHash){throw 'Legacy backup is not exact'}
if(@(Get-ChildItem -LiteralPath $desktop -Filter '*.lnk').Count -ne 1){throw 'Upgrade leaves duplicate theme entries'}
Install-BocchiShortcut -Root $second -StateRoot $state -Desktop $desktop
if(@(Get-ChildItem -LiteralPath (Join-Path $state 'backups') -Filter '*.lnk' -Recurse).Count -ne 2){throw 'Migration is not idempotent'}
# An unrelated shortcut with the legacy display name must not be replaced.
$foreign=$shell.CreateShortcut($legacyPath)
$foreign.TargetPath=Join-Path $env:SystemRoot 'notepad.exe'
$foreign.Save()
$foreignHash=(Get-FileHash -LiteralPath $legacyPath).Hash
Install-BocchiShortcut -Root $second -StateRoot $state -Desktop $desktop
if((Get-FileHash -LiteralPath $legacyPath).Hash -cne $foreignHash){throw 'Unrelated shortcut changed'}
Write-Output 'PASS: verified legacy migration, exact recovery copy, one theme entry, repeat setup, Chinese/space paths and unrelated shortcut preservation.'
$fakeApp=Join-Path $fixture 'app';New-Item -ItemType Directory -Path (Join-Path $fakeApp 'resources') -Force|Out-Null
$fakeExe=Join-Path $fakeApp 'ChatGPT.exe';[IO.File]::WriteAllText($fakeExe,'fixture not executed')
Add-Type -AssemblyName System.Drawing
$iconSource=Join-Path $fakeApp 'resources\icon-chatgpt.ico';$stream=[IO.File]::Create($iconSource)
try{[Drawing.SystemIcons]::Application.Save($stream)}finally{$stream.Dispose()}
Install-BocchiShortcut -Root $second -StateRoot $state -Desktop $desktop -Executable $fakeExe
$expectedIcon=Join-Path $state 'icons\codex-app.ico'
if($shell.CreateShortcut($link).IconLocation -cne ($expectedIcon+',0')){throw 'Application icon is not assigned'}
if((Get-FileHash -LiteralPath $expectedIcon).Hash -cne (Get-FileHash -LiteralPath $iconSource).Hash){throw 'Icon copy differs'}
if((Get-BocchiShortcutIcon -StateRoot $state -Executable (Join-Path $env:SystemRoot 'notepad.exe')) -cne ((Join-Path $env:SystemRoot 'notepad.exe')+',0')){throw 'Executable icon fallback failed'}
Write-Output 'PASS: local application icon copy and executable fallback; no icon bundled or downloaded.'
