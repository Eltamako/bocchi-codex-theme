. (Join-Path $PSScriptRoot 'shell-link-unicode.ps1')

function Get-BocchiShortcutIcon([string]$StateRoot,[string]$Executable){
  if(-not $Executable -or -not (Test-Path -LiteralPath $Executable)){return $null}
  $source=Join-Path (Split-Path $Executable -Parent) 'resources\icon-chatgpt.ico'
  if(-not (Test-Path -LiteralPath $source)){return $Executable+',0'}
  $icons=Join-Path $StateRoot 'icons'
  New-Item -ItemType Directory -Path $icons -Force|Out-Null
  $icon=Join-Path $icons 'codex-app.ico'
  Copy-Item -LiteralPath $source -Destination $icon -Force
  if((Get-FileHash -LiteralPath $source).Hash -cne (Get-FileHash -LiteralPath $icon).Hash){throw 'Desktop icon copy verification failed'}
  return $icon+',0'
}

function Test-BocchiOwnedShortcut([object]$Shortcut){
  try{
    $legacyRoot=$Shortcut.WorkingDirectory
    if(-not $legacyRoot -or -not [IO.Path]::IsPathRooted($legacyRoot)){return $false}
    $legacyEntry=Join-Path $legacyRoot '入口.ps1'
    $expectedArgs=@('Bypass','RemoteSigned')|ForEach-Object{'-NoProfile -ExecutionPolicy '+$_+' -WindowStyle Hidden -File "'+$legacyEntry+'" -Action Start'}
    $expectedTarget=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $legacyInstall=Get-Content -LiteralPath (Join-Path $legacyRoot 'installation.json') -Raw -Encoding utf8|ConvertFrom-Json
    return ($Shortcut.TargetPath -ieq $expectedTarget -and $expectedArgs -ccontains $Shortcut.Arguments -and
      $legacyInstall.schema -ceq 'bocchi-local-install/1' -and (Test-Path -LiteralPath $legacyEntry -PathType Leaf))
  }catch{return $false}
}

function Test-BocchiShortcutValue([object]$Actual,[object]$Expected){
  return ($Actual.TargetPath -ieq $Expected.TargetPath -and $Actual.Arguments -ceq $Expected.Arguments -and
    $Actual.WorkingDirectory -ieq $Expected.WorkingDirectory -and $Actual.Description -ceq $Expected.Description -and
    $Actual.IconPath -ieq $Expected.IconPath -and $Actual.IconIndex -eq $Expected.IconIndex -and
    $Actual.ShowCommand -eq $Expected.ShowCommand)
}

function Backup-BocchiShortcut([string]$Path,[string]$StateRoot,[string]$ExpectedHash){
  if((Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash -cne $ExpectedHash){throw 'Desktop shortcut changed during setup; it was preserved'}
  $backup=Join-Path $StateRoot ('backups\shortcut-'+(Get-Date -Format 'yyyyMMdd-HHmmss-fff')+'-'+[Guid]::NewGuid().ToString('N').Substring(0,6))
  New-Item -ItemType Directory -Path $backup -Force|Out-Null
  $saved=Join-Path $backup ([IO.Path]::GetFileName($Path))
  Copy-Item -LiteralPath $Path -Destination $saved
  if((Get-FileHash -LiteralPath $saved -Algorithm SHA256).Hash -cne $ExpectedHash){throw 'Desktop shortcut backup mismatch'}
}

function Install-BocchiShortcut([string]$Root,[string]$StateRoot,[string]$Desktop,[string]$Description='Bocchi the Rock! · Six wallpapers and the STARRY picker',[string]$Executable){
  Initialize-BocchiShellLink
  $shortcutPath=Join-Path $Desktop 'Bocchi Codex Theme.lnk'
  $legacyPath=Join-Path $Desktop 'Codex · 孤独摇滚.lnk'
  $legacyHash=$null
  $oldHash=$null
  $old=$null
  # Read ownership before writing anything. Unrelated same-name links survive.
  if(Test-Path -LiteralPath $legacyPath){
    try{
      $candidateHash=(Get-FileHash -LiteralPath $legacyPath -Algorithm SHA256).Hash
      if(Test-BocchiOwnedShortcut (Read-BocchiShellLink $legacyPath)){$legacyHash=$candidateHash}
    }catch{$legacyHash=$null}
  }
  if(Test-Path -LiteralPath $shortcutPath){
    $oldHash=(Get-FileHash -LiteralPath $shortcutPath -Algorithm SHA256).Hash
    try{$old=Read-BocchiShellLink $shortcutPath}catch{throw 'The existing Bocchi Codex Theme shortcut cannot be read; it was preserved'}
    if(-not (Test-BocchiOwnedShortcut $old)){throw 'The existing Bocchi Codex Theme shortcut is not a verified theme entry; it was preserved'}
  }

  # Keep these plain .NET values independently of the COM object. Comparing two
  # COM getters can accept the same lossy ANSI conversion on both sides.
  $expected=New-Object Bocchi.Theme.ShellLinkRecord
  $expected.TargetPath=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $expected.Arguments='-NoProfile -ExecutionPolicy RemoteSigned -WindowStyle Hidden -File "'+(Join-Path $Root '入口.ps1')+'" -Action Start'
  $expected.WorkingDirectory=$Root
  $expected.Description=$Description
  $expected.IconPath=''
  $expected.IconIndex=0
  $expected.ShowCommand=1
  $iconLocation=Get-BocchiShortcutIcon -StateRoot $StateRoot -Executable $Executable
  if($iconLocation){
    $comma=$iconLocation.LastIndexOf(',')
    $expected.IconPath=$iconLocation.Substring(0,$comma)
    $expected.IconIndex=[int]$iconLocation.Substring($comma+1)
  }

  $unchanged=$old -and (Test-BocchiShortcutValue $old $expected)
  if(-not $unchanged){
    $temporary=Join-Path $Desktop ('.bocchi-shortcut-'+[Guid]::NewGuid().ToString('N')+'.lnk')
    try{
      Write-BocchiShellLink -Path $temporary -Value $expected
      if(-not (Test-BocchiShortcutValue (Read-BocchiShellLink $temporary) $expected)){throw 'Desktop shortcut verification failed; the original entry was preserved'}
      if($oldHash){
        Backup-BocchiShortcut -Path $shortcutPath -StateRoot $StateRoot -ExpectedHash $oldHash
        if((Get-FileHash -LiteralPath $shortcutPath -Algorithm SHA256).Hash -cne $oldHash){throw 'Desktop shortcut changed during setup; it was preserved'}
        [IO.File]::Replace($temporary,$shortcutPath,[NullString]::Value)
      }else{
        # Move without overwrite also refuses a same-name link created meanwhile.
        [IO.File]::Move($temporary,$shortcutPath)
      }
    }finally{if(Test-Path -LiteralPath $temporary){Remove-Item -LiteralPath $temporary}}
  }
  if(-not (Test-BocchiShortcutValue (Read-BocchiShellLink $shortcutPath) $expected)){throw 'Desktop shortcut verification failed'}
  if($legacyHash -and (Test-Path -LiteralPath $legacyPath) -and
    (Get-FileHash -LiteralPath $legacyPath -Algorithm SHA256).Hash -ceq $legacyHash){
    Backup-BocchiShortcut -Path $legacyPath -StateRoot $StateRoot -ExpectedHash $legacyHash
    if((Get-FileHash -LiteralPath $legacyPath -Algorithm SHA256).Hash -cne $legacyHash){throw 'Legacy shortcut changed during setup; it was preserved'}
    Remove-Item -LiteralPath $legacyPath
  }
}
