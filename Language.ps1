[CmdletBinding()]
param([ValidateSet('auto','zh-CN','en')][string]$Language)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'engine/bootstrap-shell.ps1')
. (Join-Path $PSScriptRoot 'engine/i18n.ps1')
Initialize-BocchiLanguage -Root $PSScriptRoot -Language $Language
try{
  $config=Join-Path $PSScriptRoot 'installation.json'
  if(-not (Test-Path -LiteralPath $config)){Throw-BocchiError 'entry.setupFirst'}
  $install=Get-Content -LiteralPath $config -Raw -Encoding utf8|ConvertFrom-Json
  . (Join-Path $PSScriptRoot 'engine/installation-guard.ps1')
  $expected=Assert-BocchiInstallation -Install $install -Root $PSScriptRoot
  if(-not $Language){
    Write-Host '1. 自动 / Automatic'
    Write-Host '2. 简体中文'
    Write-Host '3. English'
    do{
      $answer=Read-Host '选择语言 / Choose a language (Enter: keep current)'
      if(-not $answer){exit 0}
      $Language=switch($answer){'1'{'auto'} '2'{'zh-CN'} '3'{'en'} default{''}}
      if(-not $Language){Write-Host (Get-BocchiText 'language.invalid')}
    }while(-not $Language)
  }
  Save-BocchiLanguage -StateRoot $expected -Language $Language
  Initialize-BocchiLanguage -Root $PSScriptRoot -Language $Language
  $label=switch($Language){'auto'{Get-BocchiText 'language.auto'} 'zh-CN'{'简体中文'} 'en'{'English'}}
  Write-Output (Get-BocchiText -Key 'language.saved' -Values @($label))
}catch{Write-Host (Get-BocchiErrorText $_);Write-Host ((Get-BocchiText 'entry.details')+': '+$_.Exception.Message);exit 1}
