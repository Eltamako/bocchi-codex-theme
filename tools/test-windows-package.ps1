[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$NodePath)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
Add-Type -AssemblyName System.IO.Compression.FileSystem
$scratch=Join-Path $root ('.test-output/windows-package-'+[Guid]::NewGuid().ToString('N'))
$source=Join-Path $scratch 'source'
New-Item -ItemType Directory -Path $source -Force|Out-Null
$manifest=@(Get-Content -LiteralPath (Join-Path $root 'CHECKSUMS.sha256') -Encoding utf8)
$expected=@('Bocchi-Codex-Theme/CHECKSUMS.sha256','Bocchi-Codex-Theme/engine/node.exe')
foreach($line in $manifest){
  if($line -notmatch '^([a-fA-F0-9]{64})  (.+)$'){throw 'Invalid manifest'}
  $relative=$Matches[2]
  $target=Join-Path $source $relative
  New-Item -ItemType Directory -Path (Split-Path $target -Parent) -Force|Out-Null
  Copy-Item -LiteralPath (Join-Path $root $relative) -Destination $target
  $expected+=('Bocchi-Codex-Theme/'+$relative)
}
Copy-Item -LiteralPath (Join-Path $root 'CHECKSUMS.sha256') -Destination $source
& (Join-Path $source 'tools/build-release.ps1') -NodePath $NodePath
$zip=@(Get-ChildItem (Join-Path $source 'dist') -Filter '*.zip')[0].FullName
$archive=[IO.Compression.ZipFile]::OpenRead($zip)
try{
  $actual=@($archive.Entries|ForEach-Object{$_.FullName})
  if(@(Compare-Object ($expected|Sort-Object) ($actual|Sort-Object)).Count){throw 'Windows ZIP entries differ from manifest and runtime'}
  if($actual -match '/(macos|\.github)/|\.command$|/node-darwin-arm64$|/macos-[^/]+$|/(build-macos\.py|inspect-macos\.py|test-macos-session\.mjs|test-renderer\.mjs)$'){throw 'Windows ZIP contains Mac or CI files'}
  foreach($required in @('Start.cmd','Pause.cmd','Resume.cmd','Restore.cmd','engine/runtime.mjs','theme/adapter.json','engine/node.exe')){
    if($actual -notcontains ('Bocchi-Codex-Theme/'+$required)){throw "Missing Windows entry: $required"}
  }
}finally{$archive.Dispose()}
[IO.Compression.ZipFile]::ExtractToDirectory($zip,(Join-Path $scratch 'extracted'))
$package=Join-Path $scratch 'extracted/Bocchi-Codex-Theme'
$runtime=Join-Path $package 'engine/node.exe'
& $runtime --test (Join-Path $package 'tests/windows-runtime.test.mjs')
if($LASTEXITCODE -ne 0){throw 'Extracted Windows runtime regression failed'}
# A stale or hand-edited manifest must fail before creating a mixed ZIP.
$foreign=@('macos/adapter.json','01-start.command','.github/workflows/tests.yml','engine/macos-app.mjs','tools/build-macos.py','tests/macos-app.test.mjs')
foreach($relative in $foreign){
  Set-Content -LiteralPath (Join-Path $source 'CHECKSUMS.sha256') -Encoding utf8 -Value (($manifest -join "`n")+"`n"+('0'*64)+'  '+$relative)
  if(Test-Path -LiteralPath $zip){Remove-Item -LiteralPath $zip}
  $rejected=$false
  try{& (Join-Path $source 'tools/build-release.ps1') -NodePath $NodePath}catch{
    if($_.Exception.Message -notmatch 'non-Windows release file'){throw}
    $rejected=$true
  }
  if(-not $rejected -or (Test-Path -LiteralPath $zip)){throw "Mixed manifest was not rejected: $relative"}
}
Write-Host "Windows ZIP verified: $($actual.Count) entries; extracted runtime passed; six mixed manifests rejected."
