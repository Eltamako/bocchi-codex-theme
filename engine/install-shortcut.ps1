function Install-BocchiShortcut([string]$Root,[string]$StateRoot,[string]$Desktop){
  $shortcutPath=Join-Path $Desktop 'Bocchi Codex Theme.lnk'
  $shell=New-Object -ComObject WScript.Shell
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
  $shortcut.Description='孤独摇滚 · 四款壁纸与 STARRY 切换'
  $shortcut.Save()
}
