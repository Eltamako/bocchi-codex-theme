param([string]$EvidenceDirectory='')
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
. (Join-Path $root 'engine\bootstrap-shell.ps1')
. (Join-Path $root 'engine\install-shortcut.ps1')
Initialize-BocchiShellLink
$fixture=Join-Path $root ('.test-output\shortcut-'+[Guid]::NewGuid().ToString('N'))
$desktop=Join-Path $fixture 'desktop'
$state=Join-Path $fixture 'state'
$first=Join-Path $fixture 'first copy'
$second=Join-Path $fixture "中文 path & O'Brien"
$results=New-Object 'System.Collections.Generic.List[object]'
$complete=$false
function Check([string]$Name,[bool]$Passed){
  $results.Add([pscustomobject]@{name=$Name;passed=$Passed})
  if(-not $Passed){throw ('FAIL: '+$Name)}
}
function New-FixtureRoot([string]$Path){
  New-Item -ItemType Directory -Path $Path -Force|Out-Null
  $script=@'
param([string]$Action)
$value=[ordered]@{action=$Action;script=$PSCommandPath;directory=[Environment]::CurrentDirectory;shell=$PSVersionTable.PSVersion.ToString();marker='中文参数 🎸'}
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'launch-result.json'),($value|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))
'@
  [IO.File]::WriteAllText((Join-Path $Path '入口.ps1'),$script,[Text.UTF8Encoding]::new($true))
  [IO.File]::WriteAllText((Join-Path $Path 'installation.json'),'{"schema":"bocchi-local-install/1","themeVersion":"fixture"}',[Text.UTF8Encoding]::new($false))
}
function New-Record([string]$Path,[ValidateSet('Bypass','RemoteSigned')][string]$ExecutionPolicy='RemoteSigned'){
  $value=New-Object Bocchi.Theme.ShellLinkRecord
  $value.TargetPath=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $value.Arguments='-NoProfile -ExecutionPolicy '+$ExecutionPolicy+' -WindowStyle Hidden -File "'+(Join-Path $Path '入口.ps1')+'" -Action Start'
  $value.WorkingDirectory=$Path
  $value.Description='Unicode fixture 中文 🎸'
  $value.IconPath=''
  $value.ShowCommand=1
  return $value
}
function Get-Backups { return @(Get-ChildItem -LiteralPath (Join-Path $state 'backups') -Filter '*.lnk' -Recurse -ErrorAction SilentlyContinue) }

try{
  foreach($dir in @($desktop,$state)){New-Item -ItemType Directory -Path $dir -Force|Out-Null}
  New-FixtureRoot $first
  New-FixtureRoot $second
  $description='Bocchi fixture 中文 🎸'
  Install-BocchiShortcut -Root $first -StateRoot $state -Desktop $desktop -Description $description
  $link=Join-Path $desktop 'Bocchi Codex Theme.lnk'
  $created=Read-BocchiShellLink $link
  $expectedArgs=(New-Record $first).Arguments
  Check 'Unicode readback equals independently retained arguments' ($created.Arguments -ceq $expectedArgs -and $created.Description -ceq $description -and $created.WorkingDirectory -ceq $first)
  Check 'New shortcut explicitly uses RemoteSigned' ($created.Arguments.StartsWith('-NoProfile -ExecutionPolicy RemoteSigned -WindowStyle Hidden -File '))
  Write-BocchiShellLink -Path $link -Value (New-Record $first -ExecutionPolicy Bypass)
  $hash=(Get-FileHash -LiteralPath $link).Hash
  Install-BocchiShortcut -Root $second -StateRoot $state -Desktop $desktop -Description $description
  $backups=Get-Backups
  Check 'Bypass primary upgrade preserves exact old shortcut bytes' ($backups.Count -eq 1 -and (Get-FileHash -LiteralPath $backups[0].FullName).Hash -ceq $hash)
  $expectedArgs=(New-Record $second).Arguments
  Check 'Chinese space ampersand apostrophe path remains exact' ((Read-BocchiShellLink $link).Arguments -ceq $expectedArgs)
  $currentHash=(Get-FileHash -LiteralPath $link).Hash
  Install-BocchiShortcut -Root $second -StateRoot $state -Desktop $desktop -Description $description
  Check 'Repeat installation preserves link bytes and backup count' ((Get-Backups).Count -eq 1 -and (Get-FileHash -LiteralPath $link).Hash -ceq $currentHash)

  # ShellExecute the .lnk itself. Its script only writes this fixture's result.
  $process=Start-Process -FilePath $link -WindowStyle Hidden -PassThru
  $resultPath=Join-Path $second 'launch-result.json'
  $deadline=[DateTime]::UtcNow.AddSeconds(15)
  while(-not (Test-Path -LiteralPath $resultPath) -and [DateTime]::UtcNow -lt $deadline){Start-Sleep -Milliseconds 100}
  Check 'Actual shortcut launches the harmless fixture' (Test-Path -LiteralPath $resultPath)
  if($process){Check 'Fixture process exits within 10 seconds' ($process.WaitForExit(10000))}
  $launched=Get-Content -LiteralPath $resultPath -Raw -Encoding utf8|ConvertFrom-Json
  Check 'Actual launch preserves script path working directory and Action' ($launched.action -ceq 'Start' -and $launched.script -ceq (Join-Path $second '入口.ps1') -and $launched.directory -ieq $second -and $launched.marker -ceq '中文参数 🎸')

  # The writer is deliberately made lossy. The original expected value must not
  # pass merely because two readers return identical corrupted strings.
  $savedWriter=(Get-Item Function:\Write-BocchiShellLink).ScriptBlock
  try{
    function Write-BocchiShellLink([string]$Path,[object]$Value){
      $bad=New-Object Bocchi.Theme.ShellLinkRecord
      foreach($name in @('TargetPath','Arguments','WorkingDirectory','Description','IconPath','IconIndex','ShowCommand')){$bad.$name=$Value.$name}
      $bad.Arguments=$bad.Arguments.Replace('入口.ps1','??.ps1')
      [Bocchi.Theme.ShellLinks]::Write($Path,$bad)
    }
    $rejected=$false
    try{Install-BocchiShortcut -Root $first -StateRoot $state -Desktop $desktop -Description $description}catch{$rejected=$_.Exception.Message -like '*verification failed*'}
    Check 'Lossy writer rejected before replacing original link' ($rejected -and (Get-FileHash -LiteralPath $link).Hash -ceq $currentHash -and (Get-Backups).Count -eq 1)
    Check 'Failed staging removes only its temporary shortcut' (@(Get-ChildItem -LiteralPath $desktop -Filter '.bocchi-shortcut-*.lnk').Count -eq 0)
  }finally{Set-Item Function:\Write-BocchiShellLink $savedWriter}

  $legacyRoot=Join-Path $fixture '旧版 中文 path'
  New-FixtureRoot $legacyRoot
  $legacyPath=Join-Path $desktop 'Codex · 孤独摇滚.lnk'
  Write-BocchiShellLink -Path $legacyPath -Value (New-Record $legacyRoot -ExecutionPolicy Bypass)
  $legacyHash=(Get-FileHash -LiteralPath $legacyPath).Hash
  Install-BocchiShortcut -Root $second -StateRoot $state -Desktop $desktop -Description $description
  $legacyBackups=@(Get-Backups|Where-Object{$_.Name -ceq 'Codex · 孤独摇滚.lnk'})
  Check 'Verified Bypass legacy link migrated only after exact backup' (-not (Test-Path -LiteralPath $legacyPath) -and $legacyBackups.Count -eq 1 -and (Get-FileHash -LiteralPath $legacyBackups[0].FullName).Hash -ceq $legacyHash)
  Write-BocchiShellLink -Path $legacyPath -Value (New-Record $legacyRoot -ExecutionPolicy RemoteSigned)
  $remoteSignedLegacyHash=(Get-FileHash -LiteralPath $legacyPath).Hash
  Install-BocchiShortcut -Root $second -StateRoot $state -Desktop $desktop -Description $description
  $legacyBackups=@(Get-Backups|Where-Object{$_.Name -ceq 'Codex · 孤独摇滚.lnk'})
  $legacyHashes=@($legacyBackups|ForEach-Object{(Get-FileHash -LiteralPath $_.FullName).Hash})
  Check 'Verified RemoteSigned legacy link migrated with both original backups intact' (-not (Test-Path -LiteralPath $legacyPath) -and $legacyBackups.Count -eq 2 -and $legacyHashes -ccontains $legacyHash -and $legacyHashes -ccontains $remoteSignedLegacyHash)
  Install-BocchiShortcut -Root $second -StateRoot $state -Desktop $desktop -Description $description
  Check 'Migration repeat does not duplicate backup or entry' ((Get-Backups).Count -eq 3 -and @(Get-ChildItem -LiteralPath $desktop -Filter '*.lnk').Count -eq 1)

  $foreign=New-Record $legacyRoot
  $foreign.TargetPath=Join-Path $env:SystemRoot 'notepad.exe'
  Write-BocchiShellLink -Path $legacyPath -Value $foreign
  $foreignHash=(Get-FileHash -LiteralPath $legacyPath).Hash
  Install-BocchiShortcut -Root $second -StateRoot $state -Desktop $desktop -Description $description
  Check 'Unrelated same-name legacy link is preserved' ((Get-FileHash -LiteralPath $legacyPath).Hash -ceq $foreignHash)

  $foreignDesktop=Join-Path $fixture 'foreign desktop'
  New-Item -ItemType Directory -Path $foreignDesktop -Force|Out-Null
  $foreignPrimary=Join-Path $foreignDesktop 'Bocchi Codex Theme.lnk'
  Write-BocchiShellLink -Path $foreignPrimary -Value $foreign
  $foreignPrimaryHash=(Get-FileHash -LiteralPath $foreignPrimary).Hash
  $rejected=$false
  try{Install-BocchiShortcut -Root $second -StateRoot $state -Desktop $foreignDesktop}catch{$rejected=$_.Exception.Message -like '*not a verified theme entry*'}
  Check 'Unrelated same-name primary link is refused and preserved' ($rejected -and (Get-FileHash -LiteralPath $foreignPrimary).Hash -ceq $foreignPrimaryHash)
  $foreign=New-Record $second
  $foreign.Arguments+=' -Unexpected'
  Write-BocchiShellLink -Path $foreignPrimary -Value $foreign
  $foreignPrimaryHash=(Get-FileHash -LiteralPath $foreignPrimary).Hash
  $rejected=$false
  try{Install-BocchiShortcut -Root $second -StateRoot $state -Desktop $foreignDesktop}catch{$rejected=$_.Exception.Message -like '*not a verified theme entry*'}
  Check 'Lookalike primary entry with extra arguments is preserved' ($rejected -and (Get-FileHash -LiteralPath $foreignPrimary).Hash -ceq $foreignPrimaryHash)

  $foreign=New-Record $second
  $foreign.Arguments=$foreign.Arguments.Replace('-ExecutionPolicy RemoteSigned','-ExecutionPolicy Unrestricted')
  Write-BocchiShellLink -Path $foreignPrimary -Value $foreign
  $foreignPrimaryHash=(Get-FileHash -LiteralPath $foreignPrimary).Hash
  $rejected=$false
  try{Install-BocchiShortcut -Root $second -StateRoot $state -Desktop $foreignDesktop}catch{$rejected=$_.Exception.Message -like '*not a verified theme entry*'}
  Check 'Other execution policy forms remain unowned and preserved' ($rejected -and (Get-FileHash -LiteralPath $foreignPrimary).Hash -ceq $foreignPrimaryHash)

  $foreign=New-Record $second
  $foreign.Arguments=$foreign.Arguments.Replace('入口.ps1','??.ps1')
  Write-BocchiShellLink -Path $foreignPrimary -Value $foreign
  $foreignPrimaryHash=(Get-FileHash -LiteralPath $foreignPrimary).Hash
  $rejected=$false
  try{Install-BocchiShortcut -Root $second -StateRoot $state -Desktop $foreignDesktop}catch{$rejected=$_.Exception.Message -like '*not a verified theme entry*'}
  Check 'Previously corrupted primary entry is preserved rather than guessed owned' ($rejected -and (Get-FileHash -LiteralPath $foreignPrimary).Hash -ceq $foreignPrimaryHash)

  $fakeApp=Join-Path $fixture 'app'
  New-Item -ItemType Directory -Path (Join-Path $fakeApp 'resources') -Force|Out-Null
  $fakeExe=Join-Path $fakeApp 'ChatGPT.exe'
  [IO.File]::WriteAllText($fakeExe,'fixture not executed')
  Add-Type -AssemblyName System.Drawing
  $iconSource=Join-Path $fakeApp 'resources\icon-chatgpt.ico'
  $stream=[IO.File]::Create($iconSource)
  try{[Drawing.SystemIcons]::Application.Save($stream)}finally{$stream.Dispose()}
  Install-BocchiShortcut -Root $second -StateRoot $state -Desktop $desktop -Description $description -Executable $fakeExe
  $expectedIcon=Join-Path $state 'icons\codex-app.ico'
  Check 'Icon copied exactly and Unicode link stores its path' ((Read-BocchiShellLink $link).IconLocation -ceq ($expectedIcon+',0') -and (Get-FileHash -LiteralPath $expectedIcon).Hash -ceq (Get-FileHash -LiteralPath $iconSource).Hash)
  Check 'Executable icon fallback unchanged' ((Get-BocchiShortcutIcon -StateRoot $state -Executable (Join-Path $env:SystemRoot 'notepad.exe')) -ceq ((Join-Path $env:SystemRoot 'notepad.exe')+',0'))

  $complete=$true
  Write-Output ('PASS: '+$results.Count+' shortcut checks; only fixture links and a harmless fixture child were used.')
}finally{
  if(-not $EvidenceDirectory){$EvidenceDirectory=$fixture}
  New-Item -ItemType Directory -Path $EvidenceDirectory -Force|Out-Null
  $report=[ordered]@{schema='bocchi-shortcut-regression/1';utc=[DateTime]::UtcNow.ToString('o');shell=$PSVersionTable.PSVersion.ToString();edition=$PSVersionTable.PSEdition;fixture=$fixture;results=@($results.ToArray());passed=$complete -and @($results.ToArray()|Where-Object{-not $_.passed}).Count -eq 0;scope='Isolated .lnk files, real ShellExecute of harmless fixture; no real desktop links or client launches'}
  $reportPath=Join-Path $EvidenceDirectory ('shortcut-'+$PSVersionTable.PSEdition+'-'+$PSVersionTable.PSVersion.ToString()+'.json')
  [IO.File]::WriteAllText($reportPath,($report|ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false))
  Write-Output ('Evidence: '+$reportPath)
}
