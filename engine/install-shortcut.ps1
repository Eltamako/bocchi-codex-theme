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
function Install-BocchiShortcut([string]$Root,[string]$StateRoot,[string]$Desktop,[string]$Description='Bocchi the Rock! · Six wallpapers and the STARRY picker',[string]$Executable){
  $shortcutPath=Join-Path $Desktop 'Bocchi Codex Theme.lnk'
  $shell=New-Object -ComObject WScript.Shell
  # Migrate only the known legacy entry after verifying its exact launcher and
  # install metadata. A similarly named user shortcut must remain untouched.
  $legacyPath=Join-Path $Desktop 'Codex · 孤独摇滚.lnk'
  $legacyHash=$null
  if(Test-Path -LiteralPath $legacyPath){
    try{
      $legacy=$shell.CreateShortcut($legacyPath)
      $legacyRoot=$legacy.WorkingDirectory
      $legacyEntry=Join-Path $legacyRoot '入口.ps1'
      $expectedArgs='-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+$legacyEntry+'" -Action Start'
      $legacyInstall=Get-Content -LiteralPath (Join-Path $legacyRoot 'installation.json') -Raw -Encoding utf8|ConvertFrom-Json
      $expectedTarget=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
      if($legacy.TargetPath -ieq $expectedTarget -and $legacy.Arguments -ceq $expectedArgs -and
         $legacyInstall.schema -ceq 'bocchi-local-install/1' -and (Test-Path -LiteralPath $legacyEntry)){
        $legacyHash=(Get-FileHash -LiteralPath $legacyPath -Algorithm SHA256).Hash
      }
    }catch{$legacyHash=$null}
  }
  if($legacyHash){
    $legacyBackup=Join-Path $StateRoot ('backups\shortcut-'+(Get-Date -Format 'yyyyMMdd-HHmmss-fff')+'-'+[Guid]::NewGuid().ToString('N').Substring(0,6))
    New-Item -ItemType Directory -Path $legacyBackup -Force|Out-Null
    $savedLegacy=Join-Path $legacyBackup 'Codex · 孤独摇滚.lnk'
    Copy-Item -LiteralPath $legacyPath -Destination $savedLegacy
    if((Get-FileHash -LiteralPath $savedLegacy -Algorithm SHA256).Hash -cne $legacyHash){throw 'Legacy shortcut backup mismatch'}
  }
  if(Test-Path -LiteralPath $shortcutPath){
    $old=$shell.CreateShortcut($shortcutPath)
    if($old.Arguments -cnotmatch [regex]::Escape((Join-Path $Root '入口.ps1'))){
      $backup=Join-Path $StateRoot ('backups\shortcut-'+(Get-Date -Format 'yyyyMMdd-HHmmss-fff')+'-'+[Guid]::NewGuid().ToString('N').Substring(0,6))
      New-Item -ItemType Directory -Path $backup -Force|Out-Null
      Copy-Item -LiteralPath $shortcutPath -Destination (Join-Path $backup 'Bocchi Codex Theme.lnk')
    }
  }
  $shortcut=$shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $shortcut.Arguments='-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+(Join-Path $Root '入口.ps1')+'" -Action Start'
  $shortcut.WorkingDirectory=$Root
  $shortcut.Description=$Description
  $iconLocation=Get-BocchiShortcutIcon -StateRoot $StateRoot -Executable $Executable
  if($iconLocation){$shortcut.IconLocation=$iconLocation}
  $shortcut.Save()
  $verified=$shell.CreateShortcut($shortcutPath)
  if($verified.TargetPath -ine $shortcut.TargetPath -or $verified.Arguments -cne $shortcut.Arguments -or $verified.WorkingDirectory -ine $Root){throw 'Desktop shortcut verification failed'}
  if($legacyHash -and (Test-Path -LiteralPath $legacyPath) -and
     (Get-FileHash -LiteralPath $legacyPath -Algorithm SHA256).Hash -ceq $legacyHash){
    # The exact old file is backed up and the replacement was read back first.
    Remove-Item -LiteralPath $legacyPath
  }
}
