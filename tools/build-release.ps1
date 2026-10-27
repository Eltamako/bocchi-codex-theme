[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$NodePath)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
. (Join-Path $root 'engine\bootstrap-shell.ps1')
$release=Get-Content -LiteralPath (Join-Path $root 'release.json') -Raw -Encoding utf8|ConvertFrom-Json
if((Get-FileHash -LiteralPath $NodePath -Algorithm SHA256).Hash -cne $release.nodeSha256){throw '请使用同版本完整包中的 Node 运行文件。SHA256 与 release.json 不一致。'}
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$dist=Join-Path $root 'dist'
New-Item -ItemType Directory -Path $dist -Force|Out-Null
$zip=Join-Path $dist ('Bocchi-Codex-Theme-'+$release.releaseVersion+'-windows-x64.zip')
if(Test-Path -LiteralPath $zip){throw '目标压缩包已存在，请先将旧包移到归档位置。'}
$files=@()
foreach($line in (Get-Content -LiteralPath (Join-Path $root 'CHECKSUMS.sha256') -Encoding utf8)){
  if($line -notmatch '^([a-fA-F0-9]{64})  (.+)$'){throw '源码校验清单格式不完整。'}
  $expected=$Matches[1];$relative=$Matches[2]
  if($relative -match '(^|/)(macos|\.github)(/|$)|\.command$|^engine/(macos-[^/]+|node-darwin-arm64)$|^tests/macos-|^tools/(build-macos\.py|inspect-macos\.py|test-macos-session\.mjs|test-renderer\.mjs)$'){throw ('Windows manifest contains a non-Windows release file: '+$relative)}
  if($relative -match '(^/|\\|:|(^|/)\.\.?(/|$))' -or $relative -match '(^|/)(\.local|\.test-output|dist|installation\.json|node\.exe|managed-profile)(/|$)' -or $relative -match '\.(log|lnk|zip)$'){throw '清单包含本机数据或不支持的路径。'}
  $current=$root
  foreach($part in $relative.Split('/')){
    $current=Join-Path $current $part
    if((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw '请先移除源码目录中的文件链接。'}
  }
  if((Get-FileHash -LiteralPath $current -Algorithm SHA256).Hash -ine $expected){throw ('源码校验不一致：'+$relative)}
  $files+=@{path=$current;relative=$relative}
}
$files+=@{path=(Join-Path $root 'CHECKSUMS.sha256');relative='CHECKSUMS.sha256'}
$archive=[IO.Compression.ZipFile]::Open($zip,[IO.Compression.ZipArchiveMode]::Create)
try{
  foreach($file in $files){
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$file.path,('Bocchi-Codex-Theme/'+$file.relative),[IO.Compression.CompressionLevel]::Optimal)|Out-Null
  }
  [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,(Resolve-Path -LiteralPath $NodePath).Path,'Bocchi-Codex-Theme/engine/node.exe',[IO.Compression.CompressionLevel]::Optimal)|Out-Null
}finally{$archive.Dispose()}
Get-FileHash -LiteralPath $zip -Algorithm SHA256

