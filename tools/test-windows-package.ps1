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
$seen=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach($line in $manifest){
  if($line -notmatch '^([a-fA-F0-9]{64})  (.+)$'){throw 'Invalid manifest'}
  $relative=$Matches[2]
  if(-not $seen.Add($relative)){throw 'Duplicate manifest path'}
  if($relative -match '(^/|\\|:|(^|/)\.\.?(/|$))'){throw 'Unsafe manifest path'}
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
  if(@($actual|Sort-Object -Unique).Count -ne $actual.Count){throw 'Duplicate ZIP entry'}
  if($actual -match '(^/|\\|:|(^|/)\.\.?(/|$))'){throw 'Unsafe ZIP entry'}
  if(@(Compare-Object ($expected|Sort-Object) ($actual|Sort-Object)).Count){throw 'Windows ZIP entries differ from manifest and runtime'}
  if($actual -match '/(macos|\.github)/|\.command$|/node-darwin-arm64$|/macos-[^/]+$|/(build-macos\.py|inspect-macos\.py|test-macos-session\.mjs|test-renderer\.mjs)$'){throw 'Windows ZIP contains Mac or CI files'}
  foreach($required in @('Start.cmd','Pause.cmd','Resume.cmd','Restore.cmd','engine/runtime.mjs','theme/adapter.json','engine/node.exe','tests/windows-runtime.test.mjs','tests/windows-boundary-probe.mjs')){
    if($actual -notcontains ('Bocchi-Codex-Theme/'+$required)){throw "Missing Windows entry: $required"}
  }
  foreach($line in $manifest){
    if($line -notmatch '^([a-fA-F0-9]{64})  (.+)$'){throw 'Invalid manifest'}
    $hash=$Matches[1];$relative=$Matches[2]
    $stream=$archive.GetEntry('Bocchi-Codex-Theme/'+$relative).Open()
    $sha=[Security.Cryptography.SHA256]::Create()
    try{$actualHash=[BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','')}
    finally{$sha.Dispose();$stream.Dispose()}
    if($actualHash -ine $hash){throw ('Archived source hash mismatch: '+$relative)}
  }
}finally{$archive.Dispose()}
[IO.Compression.ZipFile]::ExtractToDirectory($zip,(Join-Path $scratch 'extracted'))
$package=Join-Path $scratch 'extracted/Bocchi-Codex-Theme'
$runtime=Join-Path $package 'engine/node.exe'
# File absence is a distribution contract, not a ban on platform source living
# in the repository. The Windows behavior tests separately exercise coexistence.
foreach($relative in @('macos','engine/macos-app.mjs','engine/macos-identity.mjs','engine/node-darwin-arm64')){
  if(Test-Path -LiteralPath (Join-Path $package $relative)){throw ('Mac-only path in extracted Windows package: '+$relative)}
}
$runtimeTests=@((Join-Path $package 'tests/windows-runtime.test.mjs'))
$sharedPlatformTest=Join-Path $package 'tests/runtime-platform.test.mjs'
if(Test-Path -LiteralPath $sharedPlatformTest){$runtimeTests+=@($sharedPlatformTest)}
& $runtime --preserve-symlinks --preserve-symlinks-main --test @runtimeTests
if($LASTEXITCODE -ne 0){throw 'Extracted Windows runtime regression failed'}
# A stale or hand-edited manifest must fail before creating a mixed ZIP.
$foreign=@('macos/adapter.json','01-start.command','.github/workflows/tests.yml','engine/macos-app.mjs','engine/macos-identity.mjs','engine/node-darwin-arm64','tools/build-macos.py','tools/inspect-macos.py','tools/test-macos-session.mjs','tools/test-renderer.mjs','tests/macos-app.test.mjs','tests/macos-package.test.py')
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
Write-Host "Windows ZIP verified: $($actual.Count) entries; all $($manifest.Count) archived source hashes matched; extracted Windows runtime regressions passed; $($foreign.Count) mixed manifests rejected before archive creation."
