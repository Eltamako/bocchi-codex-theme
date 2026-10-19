[CmdletBinding()]
param([switch]$CheckOnly,[switch]$NoShortcuts)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'engine\bootstrap-shell.ps1')
. (Join-Path $PSScriptRoot 'engine\common-windows.ps1')
. (Join-Path $PSScriptRoot 'engine\app-version.ps1')
$release=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'release.json') -Raw -Encoding utf8|ConvertFrom-Json
$node=Join-Path $PSScriptRoot 'engine\node.exe'
if(-not (Test-Path -LiteralPath $node)){throw '这个目录是源码版。请下载同版本的 Windows 完整包，或按 README 补齐 Node 运行环境。'}
if((Get-FileHash -LiteralPath $node -Algorithm SHA256).Hash -cne $release.nodeSha256){throw 'Node 文件与发行记录不一致。请重新解压同版本完整包。'}
& $node '--preserve-symlinks' '--preserve-symlinks-main' (Join-Path $PSScriptRoot 'tools\check-assets.mjs')
if($LASTEXITCODE -ne 0){throw '素材检查没有通过，请重新解压完整包后再试。'}
$codex=Get-DreamSkinCodexInstall
$appVersion=Get-BundleVersion $codex.PackageRoot
if($appVersion -cne $release.appVersion -or $codex.Version -cne $release.packageVersion){throw ('当前客户端为 '+$appVersion+' / '+$codex.Version+'；这一版主题对应 '+$release.appVersion+' / '+$release.packageVersion+'。暂时保留原界面，等匹配的适配版即可。')}
if($CheckOnly){Write-Output '版本、运行环境和六款素材检查通过；未创建配置或快捷方式。';exit 0}
$config=Join-Path $PSScriptRoot 'installation.json'
$stateRoot=Join-Path $PSScriptRoot '.local'
if(Test-Path -LiteralPath $config){
  $existing=Get-Content -LiteralPath $config -Raw -Encoding utf8|ConvertFrom-Json
  if(-not (Test-DreamSkinPathEqual -Left $existing.stateRoot -Right $stateRoot)){throw '这个文件夹已经移动过。请在新解压的完整包中安装，原文件夹先留作回退。'}
  if($existing.nodeSha256 -cne $release.nodeSha256 -or $existing.appVersion -cne $release.appVersion -or $existing.packageVersion -cne $release.packageVersion -or $existing.themeVersion -cne $release.themeVersion){throw '已有配置属于另一发行版。请把新版本解压到独立文件夹。'}
}else{
  New-Item -ItemType Directory -Path $stateRoot -Force|Out-Null
  $value=[ordered]@{schema='bocchi-local-install/1';stateRoot=$stateRoot;backupRoot=(Join-Path $stateRoot 'backups');port=$release.port;appVersion=$release.appVersion;packageVersion=$release.packageVersion;nodeSha256=$release.nodeSha256;autostart=$false;nativeConfigChanged=$false;launcherVersion=$release.launcherVersion;themeVersion=$release.themeVersion;releaseVersion=$release.releaseVersion}
  $tmp=$config+'.tmp-'+[Guid]::NewGuid().ToString('N')
  [IO.File]::WriteAllText($tmp,($value|ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $tmp -Destination $config
}
if(-not $NoShortcuts){
  . (Join-Path $PSScriptRoot 'engine\install-shortcut.ps1')
  Install-BocchiShortcut -Root $PSScriptRoot -StateRoot $stateRoot -Desktop ([Environment]::GetFolderPath('Desktop'))
}
Write-Output '配置完成。双击 02-启动主题.cmd，或使用桌面的 Bocchi Codex Theme 入口。'
Write-Output '没有改动官方外观设置，也没有添加开机启动。'
