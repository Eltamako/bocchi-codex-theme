$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
. (Join-Path $root 'engine/package-integrity.ps1')
$fixture=Join-Path $root ('.test-output/package-integrity-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path (Join-Path $fixture 'engine') -Force|Out-Null
$files=@('入口.ps1','安装.ps1','管理主题.ps1','Language.ps1','engine/app-version.ps1','engine/bootstrap-shell.ps1','engine/common-windows.ps1','engine/config-utf8.ps1','engine/i18n.ps1','engine/install-shortcut.ps1','engine/installation-guard.ps1','engine/package-integrity.ps1','engine/session-guard.ps1','engine/shell-link-unicode.ps1','readme.txt')
$checks=0
function Check($ok,$message){if(-not $ok){throw $message};$script:checks++}
foreach($relative in $files){[IO.File]::WriteAllText((Join-Path $fixture $relative),'param($Action) "harmless fixture"',[Text.UTF8Encoding]::new($true))}
$manifest=Join-Path $fixture 'CHECKSUMS.sha256'
$lines=@($files|ForEach-Object{(Get-FileHash -LiteralPath (Join-Path $fixture $_)).Hash.ToLower()+'  '+$_})
[IO.File]::WriteAllText($manifest,($lines -join "`n")+"`n",[Text.UTF8Encoding]::new($false))
$entry=Join-Path $fixture '入口.ps1'
$extra=Join-Path $fixture 'not-in-manifest.ps1'
[IO.File]::WriteAllText($extra,'unlisted script')
foreach($p in @($entry,$extra)){Set-Content -LiteralPath $p -Stream Zone.Identifier -Value "[ZoneTransfer]`r`nZoneId=3" -Encoding ascii}
$scripts=@(Get-BocchiVerifiedPackageScripts $fixture)
Check ($scripts.Count -eq 14) 'All and only production startup scripts selected'
Check ([bool](Get-Item -LiteralPath $entry -Stream Zone.Identifier)) 'Verification must not remove marker'
foreach($line in @($lines[0],('0'*64+'  ../outside.ps1'),('0'*64+'  C:/outside.ps1'),('0'*64+'  engine//x.ps1'),('0'*64+'  engine/x.ps1:stream'),('0'*64+'  engine/trailing.'))){
  [IO.File]::WriteAllText($manifest,($lines -join "`n")+"`n"+$line+"`n")
  $rejected=$false;try{$null=Get-BocchiVerifiedPackageScripts $fixture}catch{$rejected=$true}
  Check $rejected 'Unsafe or duplicate manifest accepted'
  Check ([bool](Get-Item -LiteralPath $entry -Stream Zone.Identifier)) 'Invalid manifest changed marker'
}
[IO.File]::WriteAllText($manifest,(($lines|Where-Object{$_ -notlike '*  入口.ps1'}) -join "`n")+"`n",[Text.UTF8Encoding]::new($false))
$rejected=$false;try{$null=Get-BocchiVerifiedPackageScripts $fixture}catch{$rejected=$_.Exception.Message -like 'PACKAGE_REQUIRED_FILE_MISSING*'}
Check $rejected 'Missing startup entry accepted'
[IO.File]::WriteAllText($manifest,($lines -join "`n")+"`n",[Text.UTF8Encoding]::new($false))
$last=Join-Path $fixture 'engine/installation-guard.ps1'
$saved=[IO.File]::ReadAllBytes($last)
try{
  [IO.File]::AppendAllText($last,'changed')
  $rejected=$false;try{$null=Unblock-BocchiVerifiedPackageScripts $scripts}catch{$rejected=$_.Exception.Message -eq 'PACKAGE_CHANGED_BEFORE_UNBLOCK'}
  Check $rejected 'Changed file accepted'
  Check ([bool](Get-Item -LiteralPath $entry -Stream Zone.Identifier)) 'Partial unblock before all hashes were verified'
}finally{[IO.File]::WriteAllBytes($last,$saved)}
$before=(Get-FileHash -LiteralPath $entry).Hash
Check ((Unblock-BocchiVerifiedPackageScripts $scripts) -eq 1) 'Expected exactly one verified marker cleared'
Check (-not (Get-Item -LiteralPath $entry -Stream Zone.Identifier -ErrorAction SilentlyContinue)) 'Verified marker remains'
Check ((Get-FileHash -LiteralPath $entry).Hash -ceq $before) 'Script content changed'
Check ([bool](Get-Item -LiteralPath $extra -Stream Zone.Identifier)) 'Unlisted script was unblocked'
Check ((Unblock-BocchiVerifiedPackageScripts $scripts) -eq 0) 'Repeat operation not idempotent'
Write-Output ('PASS: '+$checks+' package-integrity checks; only isolated fixture markers changed.')
