# Pure checks shared by the launcher and its regression tests. PowerShell 5.1 compatible.
function Test-BocchiSessionMatch([object]$Saved,[object]$Own,[string]$Profile,[string]$AppVersion,[string]$PackageVersion,[string]$PackageRoot,[string]$RuntimeHash){
  if(-not $Saved -or -not $Own){return $false}
  try {
    return ($Saved.schema -ceq 'bocchi-runtime/1' -and
      $Saved.browserId -ceq $Own.identity.BrowserId -and [int]$Saved.ownerPid -eq [int]$Own.pid -and
      (ConvertTo-UtcStamp $Saved.ownerCreated) -ceq (ConvertTo-UtcStamp $Own.created) -and
      (Test-DreamSkinPathEqual -Left $Saved.profile -Right $Profile) -and
      $Saved.appVersion -ceq $AppVersion -and $Saved.packageVersion -ceq $PackageVersion -and
      (Test-DreamSkinPathEqual -Left $Saved.packageRoot -Right $PackageRoot) -and
      $Saved.runtimeHash -ceq $RuntimeHash)
  } catch { return $false }
}
function Test-BocchiReadyStatus([object]$Status,[object]$State,[string]$RequestId,[string]$ThemeVersion){
  if(-not $Status -or -not $State -or -not $RequestId){return $false}
  if($Status.state -cne 'running' -or $Status.requestId -cne $RequestId -or
    $Status.generation -cne $State.generation -or $Status.browserId -cne $State.browserId -or
    [int]$Status.daemonPid -ne [int]$State.daemonPid -or $Status.runtimeHash -cne $State.runtimeHash){return $false}
  $renderers=@($Status.renderers)
  return ($renderers.Count -eq 1 -and $renderers[0].installed -eq $true -and $renderers[0].version -ceq $ThemeVersion)
}
