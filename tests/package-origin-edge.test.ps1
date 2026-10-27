$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
. (Join-Path $root 'engine/package-integrity.ps1')
$fixture=Join-Path $root ('.test-output/package-origin-edge-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path (Join-Path $fixture 'engine') -Force|Out-Null
$files=@('入口.ps1','安装.ps1','管理主题.ps1','Language.ps1')+@(Get-ChildItem -LiteralPath (Join-Path $root 'engine') -Filter '*.ps1' -File|ForEach-Object{'engine/'+$_.Name})
$manifest=Join-Path $fixture 'CHECKSUMS.sha256'
foreach($relative in $files){[IO.File]::WriteAllText((Join-Path $fixture $relative),'"harmless fixture"',[Text.UTF8Encoding]::new($true))}
$lines=@($files|ForEach-Object{(Get-FileHash -LiteralPath (Join-Path $fixture $_)).Hash.ToLower()+'  '+$_})
function Write-Manifest([string[]]$Values){[IO.File]::WriteAllText($manifest,($Values -join "`n")+"`n",[Text.UTF8Encoding]::new($false))}
$entry=Join-Path $fixture '入口.ps1'
Set-Content -LiteralPath $entry -Stream Zone.Identifier -Value "[ZoneTransfer]`r`nZoneId=3" -Encoding ascii
$checks=0
$failures=New-Object 'Collections.Generic.List[string]'
function Check([bool]$Ok,[string]$Message){$script:checks++;if(-not $Ok){$script:failures.Add($Message)}}
Write-Manifest $lines
$scripts=@(Get-BocchiVerifiedPackageScripts $fixture)
Check ($scripts.Count -eq $files.Count) 'Complete isolated startup set was not accepted'
# Every dependency below is reached by the startup or manager dot-source chain.
# An incomplete manifest must fail before removing the entry's source marker.
foreach($relative in @('engine/i18n.ps1','engine/common-windows.ps1','engine/config-utf8.ps1','engine/session-guard.ps1','engine/app-version.ps1','engine/install-shortcut.ps1','engine/shell-link-unicode.ps1')){
  Write-Manifest @($lines|Where-Object{$_ -notlike ('*  '+$relative)})
  $rejected=$false
  try{$null=Get-BocchiVerifiedPackageScripts $fixture}catch{$rejected=$_.Exception.Message -like 'PACKAGE_REQUIRED_FILE_MISSING*'}
  Check $rejected ('Startup dependency omitted without rejection: '+$relative)
  Check ([bool](Get-Item -LiteralPath $entry -Stream Zone.Identifier -ErrorAction SilentlyContinue)) 'Verification changed a source marker'
}
Write-Manifest $lines
# Directory junctions need no developer-mode symbolic-link privilege. Both
# targets are within this fixture; no original file or installed theme is used.
$alias=$fixture+'-root-link'
New-Item -ItemType Junction -Path $alias -Target $fixture -ErrorAction Stop|Out-Null
$rejected=$false
try{$null=Get-BocchiVerifiedPackageScripts $alias}catch{$rejected=$_.Exception.Message -eq 'PACKAGE_LINKED_ROOT'}
Check $rejected 'Linked package root accepted'
$engineAlias=Join-Path $fixture 'engine-link'
New-Item -ItemType Junction -Path $engineAlias -Target (Join-Path $fixture 'engine') -ErrorAction Stop|Out-Null
Write-Manifest ($lines+@((Get-FileHash -LiteralPath (Join-Path $fixture 'engine/i18n.ps1')).Hash.ToLower()+'  engine-link/i18n.ps1'))
$rejected=$false
try{$null=Get-BocchiVerifiedPackageScripts $fixture}catch{$rejected=$_.Exception.Message -eq 'PACKAGE_LINKED_FILE'}
Check $rejected 'Linked manifest parent accepted'
Check ([bool](Get-Item -LiteralPath $entry -Stream Zone.Identifier -ErrorAction SilentlyContinue)) 'Rejected linked path changed source marker'
Write-Manifest $lines
 $verified=@(Get-BocchiVerifiedPackageScripts $fixture)
 $engine=Join-Path $fixture 'engine'
 $moved=Join-Path $fixture 'engine-original'
 foreach($p in @($engine,$moved)){
   if(-not [IO.Path]::GetFullPath($p).StartsWith(([IO.Path]::GetFullPath($fixture)+[IO.Path]::DirectorySeparatorChar),[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe fixture move target'}
 }
 Move-Item -LiteralPath $engine -Destination $moved -ErrorAction Stop
 New-Item -ItemType Junction -Path $engine -Target $moved -ErrorAction Stop|Out-Null
 $rejected=$false
 try{$null=Unblock-BocchiVerifiedPackageScripts $verified}catch{$rejected=$_.Exception.Message -eq 'PACKAGE_LINKED_FILE'}
 Check $rejected 'Parent replaced by junction after verification was accepted'
 Check ([bool](Get-Item -LiteralPath $entry -Stream Zone.Identifier -ErrorAction SilentlyContinue)) 'Revalidation failure partially unblocked the package'
if($failures.Count){throw ($failures -join '; ')}
Write-Output ('PASS: '+$checks+' package-origin edge checks; fixture-only markers/junctions, no client or desktop changes.')
