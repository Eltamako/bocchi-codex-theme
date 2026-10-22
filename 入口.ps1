param([ValidateSet('Start','Pause','Resume','Restore')][string]$Action='Start',[ValidateSet('auto','zh-CN','en')][string]$Language)
$ErrorActionPreference='Stop'
$entryRunId=[Guid]::NewGuid().ToString('N')
$entryStarted=[DateTime]::UtcNow.ToString('o')
$entryResultPath=$null
function Write-EntryResult([string]$Result,[string]$Message=''){
  if(-not $entryResultPath){return}
  $value=[ordered]@{runId=$entryRunId;action=$Action;result=$Result;message=$Message;started=$entryStarted;completed=[DateTime]::UtcNow.ToString('o');shellVersion=$PSVersionTable.PSVersion.ToString();utilityModule=(Get-Command Get-FileHash -ErrorAction SilentlyContinue).Module.Path}
  $temporary=$entryResultPath+'.tmp-'+$entryRunId
  [IO.File]::WriteAllText($temporary,($value|ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $temporary -Destination $entryResultPath -Force
}
try {
  . ([IO.Path]::Combine($PSScriptRoot,'engine','bootstrap-shell.ps1'))
  . ([IO.Path]::Combine($PSScriptRoot,'engine','i18n.ps1'))
  Initialize-BocchiLanguage -Root $PSScriptRoot -Language $Language
  if(-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'installation.json'))){Throw-BocchiError 'entry.setupFirst'}
  $entryInstall=Get-Content -LiteralPath ([IO.Path]::Combine($PSScriptRoot,'installation.json')) -Raw -Encoding utf8|ConvertFrom-Json
  . (Join-Path $PSScriptRoot 'engine/installation-guard.ps1')
  $entryStateRoot=Assert-BocchiInstallation -Install $entryInstall -Root $PSScriptRoot
  $entryResultPath=[IO.Path]::Combine($entryStateRoot,'last-entry-result.json')
  Write-EntryResult 'started'
  $options=@{Action=$Action};if($Language){$options.Language=$Language}
  & ([IO.Path]::Combine($PSScriptRoot,'管理主题.ps1')) @options
  if($LASTEXITCODE -and $LASTEXITCODE -ne 0){throw ('Theme operation returned exit code '+$LASTEXITCODE)}
  Write-EntryResult 'succeeded'
} catch {
  try{Write-EntryResult 'failed' $_.Exception.Message}catch{}
  if(Get-Command Get-BocchiText -ErrorAction SilentlyContinue){
    $message=(Get-BocchiText 'entry.failed')+"`n`n"+(Get-BocchiErrorText $_)+"`n`n"+(Get-BocchiText 'entry.help')+"`n`n"+(Get-BocchiText 'entry.details')+': '+$_.Exception.Message
    $title=Get-BocchiText 'app.title'
  }else{
    $message="主题启动环境尚未准备好，请保留下面的诊断信息。`nThe theme could not prepare its startup environment. Please keep the diagnostic details below.`n`n"+$_.Exception.Message
    $title='Bocchi Codex Theme'
  }
  $popup=New-Object -ComObject WScript.Shell
  $null=$popup.Popup($message,0,$title,16)
  exit 1
}
