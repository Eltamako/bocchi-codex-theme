param([ValidateSet('Start','Pause','Resume','Restore')][string]$Action='Start')
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
  if(-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'installation.json'))){throw '请先双击 01-安装.cmd，完成本机配置。'}
  $entryInstall=Get-Content -LiteralPath ([IO.Path]::Combine($PSScriptRoot,'installation.json')) -Raw -Encoding utf8|ConvertFrom-Json
  $entryResultPath=[IO.Path]::Combine($entryInstall.stateRoot,'last-entry-result.json')
  Write-EntryResult 'started'
  & ([IO.Path]::Combine($PSScriptRoot,'管理主题.ps1')) -Action $Action
  if($LASTEXITCODE -and $LASTEXITCODE -ne 0){throw ('Theme operation returned exit code '+$LASTEXITCODE)}
  Write-EntryResult 'succeeded'
} catch {
  try{Write-EntryResult 'failed' $_.Exception.Message}catch{}
  $message="这次主题操作没有完成。`n`n" + $_.Exception.Message + "`n`n可以先看看 docs 中的《常见问题》和《恢复与回退》。"
  $popup=New-Object -ComObject WScript.Shell
  $null=$popup.Popup($message,0,'孤独摇滚 · Codex 主题',16)
  exit 1
}
