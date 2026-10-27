$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $root 'engine/common-windows.ps1'),[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'Discovery source syntax error'}
foreach($name in @('ConvertTo-DreamSkinCodexInstall','Get-DreamSkinRegisteredCodexInstalls','Get-DreamSkinCodexInstall')){
 $def=$ast.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$true)
 . ([scriptblock]::Create($def.Extent.Text))
}
$script:module=$true;$script:query='ok';$script:exists=$true;$script:manifestFails=$false
function Get-Command {param($Name,$ErrorAction)if($script:module){[pscustomobject]@{Name=$Name}}}
function Test-Path {param($LiteralPath)$script:exists}
function Get-AppxPackage {param($Name,$ErrorAction)if($script:query -eq 'denied'){throw [UnauthorizedAccessException]::new('fixture')}if($script:query -eq 'failed'){throw [InvalidOperationException]::new('fixture')}$script:packages}
function Get-AppxPackageManifest {param($Package,$ErrorAction)if($script:manifestFails){throw [IO.IOException]::new('fixture')}$script:manifest}
function Package { [pscustomobject]@{Name='OpenAI.Codex';InstallLocation='D:\Verified';PackageFullName='OpenAI.Codex_fixture';PackageFamilyName='OpenAI.Codex_fixture';SignatureKind='Store';IsDevelopmentMode=$false;Architecture='X64';Version='26.1021.3705.0'} }
$script:manifest=[pscustomobject]@{Package=[pscustomobject]@{Applications=[pscustomobject]@{Application=@([pscustomobject]@{Executable='app\ChatGPT.exe';Id='Codex'})}}}
$script:packages=@((Package));$checks=0
function Expect([string]$Code){$caught=$null;try{Get-DreamSkinCodexInstall|Out-Null}catch{$caught=$_.Exception.Message};if(-not $caught -or -not $caught.StartsWith($Code)){throw "Expected $Code, got $caught"};$script:checks++}
$found=Get-DreamSkinCodexInstall
if($found.Executable -ne 'D:\Verified\app\ChatGPT.exe'){throw 'Actual registered location was not used'};$checks++
$script:module=$false;Expect 'CODEX_APPX_MODULE_UNAVAILABLE';$script:module=$true
$script:query='denied';Expect 'CODEX_APPX_QUERY_DENIED';$script:query='failed';Expect 'CODEX_APPX_QUERY_FAILED';$script:query='ok'
$script:packages=@();Expect 'CODEX_PACKAGE_NOT_REGISTERED';$script:packages=@((Package))
$script:packages[0].SignatureKind='Developer';Expect 'CODEX_DISTRIBUTION_UNSUPPORTED';$script:packages=@((Package))
$script:packages[0].Architecture='Arm64';Expect 'CODEX_ARCHITECTURE_UNSUPPORTED';$script:packages=@((Package))
$script:exists=$false;Expect 'CODEX_INSTALL_LAYOUT_CHANGED';$script:exists=$true
$script:manifestFails=$true;Expect 'CODEX_MANIFEST_READ_FAILED';$script:manifestFails=$false
$script:manifest.Package.Applications.Application[0].Executable='other.exe';Expect 'CODEX_INSTALL_LAYOUT_CHANGED'
"PASS: $checks isolated discovery checks; no system registration changed."
