[CmdletBinding()]
param([switch]$CheckOnly,[switch]$NoShortcuts,[ValidateSet('auto','zh-CN','en')][string]$Language)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'engine\bootstrap-shell.ps1')
. (Join-Path $PSScriptRoot 'engine\common-windows.ps1')
. (Join-Path $PSScriptRoot 'engine\app-version.ps1')
. (Join-Path $PSScriptRoot 'engine/i18n.ps1')
Initialize-BocchiLanguage -Root $PSScriptRoot -Language $Language
try {
$release=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'release.json') -Raw -Encoding utf8|ConvertFrom-Json
$node=Join-Path $PSScriptRoot 'engine\node.exe'
if(-not (Test-Path -LiteralPath $node)){Throw-BocchiError 'install.source'}
if((Get-FileHash -LiteralPath $node -Algorithm SHA256).Hash -cne $release.nodeSha256){Throw-BocchiError 'install.runtime'}
. (Join-Path $PSScriptRoot 'engine/package-integrity.ps1')
try{$verifiedScripts=@(Get-BocchiVerifiedPackageScripts -Root $PSScriptRoot)}catch{Throw-BocchiError -Key 'install.integrity' -Diagnostic $_.Exception.Message}
$assetDetails=& $node '--preserve-symlinks' '--preserve-symlinks-main' (Join-Path $PSScriptRoot 'tools\check-assets.mjs') 2>&1
if($LASTEXITCODE -ne 0){Throw-BocchiError -Key 'install.assets' -Diagnostic ($assetDetails|Out-String)}
$codex=Get-DreamSkinCodexInstall
$appVersion=Get-BundleVersion $codex.PackageRoot
if($appVersion -cne $release.appVersion -or $codex.Version -cne $release.packageVersion){Throw-BocchiError -Key 'install.version' -Values @($appVersion,$codex.Version,$release.appVersion,$release.packageVersion)}
if($CheckOnly){Write-Output (Get-BocchiText 'install.checked');exit 0}
$config=Join-Path $PSScriptRoot 'installation.json'
$stateRoot=Join-Path $PSScriptRoot '.local'
. (Join-Path $PSScriptRoot 'engine/installation-guard.ps1')
$stateRoot=Assert-BocchiInstallation -Install ([pscustomobject]@{schema='bocchi-local-install/1';stateRoot=$stateRoot}) -Root $PSScriptRoot
$alreadyInstalled=Test-Path -LiteralPath $config
if($alreadyInstalled){
  $existing=Get-Content -LiteralPath $config -Raw -Encoding utf8|ConvertFrom-Json
  . (Join-Path $PSScriptRoot 'engine/installation-guard.ps1')
  $stateRoot=Assert-BocchiInstallation -Install $existing -Root $PSScriptRoot
  if($existing.nodeSha256 -cne $release.nodeSha256 -or $existing.appVersion -cne $release.appVersion -or $existing.packageVersion -cne $release.packageVersion -or $existing.themeVersion -cne $release.themeVersion){Throw-BocchiError 'install.otherRelease'}
}
try{$unblocked=Unblock-BocchiVerifiedPackageScripts -Scripts $verifiedScripts}catch{Throw-BocchiError -Key 'install.unblock' -Diagnostic $_.Exception.Message}
if($unblocked -gt 0){Write-Output (Get-BocchiText 'install.unblocked' @($unblocked))}
if(-not $alreadyInstalled){
  New-Item -ItemType Directory -Path $stateRoot -Force|Out-Null
  $value=[ordered]@{schema='bocchi-local-install/1';stateRoot=$stateRoot;backupRoot=(Join-Path $stateRoot 'backups');port=$release.port;appVersion=$release.appVersion;packageVersion=$release.packageVersion;nodeSha256=$release.nodeSha256;autostart=$false;nativeConfigChanged=$false;launcherVersion=$release.launcherVersion;themeVersion=$release.themeVersion;releaseVersion=$release.releaseVersion}
  $tmp=$config+'.tmp-'+[Guid]::NewGuid().ToString('N')
  [IO.File]::WriteAllText($tmp,($value|ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $tmp -Destination $config
}
if($Language -or -not (Test-Path -LiteralPath (Join-Path $stateRoot 'language.json'))){
  Save-BocchiLanguage -StateRoot $stateRoot -Language $(if($Language){$Language}else{'auto'})
}
if(-not $NoShortcuts){
  . (Join-Path $PSScriptRoot 'engine\install-shortcut.ps1')
  Install-BocchiShortcut -Root $PSScriptRoot -StateRoot $stateRoot -Desktop ([Environment]::GetFolderPath('Desktop')) -Description (Get-BocchiText 'shortcut.description') -Executable $codex.Executable
}
Write-Output (Get-BocchiText 'install.done')
Write-Output (Get-BocchiText 'install.preserved')

}catch{Write-Host (Get-BocchiErrorText $_);Write-Host ((Get-BocchiText 'entry.details')+': '+$_.Exception.Message);exit 1}
