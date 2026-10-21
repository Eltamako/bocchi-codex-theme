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

# Only attribute a blocked renderer to this exact request and managed session.
function Get-BocchiBlockedReason([object]$Status,[object]$State,[string]$RequestId){
  if(-not $Status -or -not $State -or -not $RequestId){return $null}
  if($Status.state -cne 'suspended' -or $Status.requestId -cne $RequestId -or
    $Status.generation -cne $State.generation -or $Status.browserId -cne $State.browserId -or
    [int]$Status.daemonPid -ne [int]$State.daemonPid -or $Status.runtimeHash -cne $State.runtimeHash){return $null}
  $renderers=@($Status.renderers)
  if($renderers.Count -eq 1 -and $renderers[0].installed -eq $false -and $renderers[0].reason -ceq 'automatic-dark-appearance-failed'){return 'automatic-dark-appearance-failed'}
  return $null
}

# Diagnostic capture is separate from early failure: transient page states may recover.
function Get-BocchiReadinessDiagnostic([object]$Status,[object]$State,[string]$RequestId){
  if(-not $Status -or -not $State -or -not $RequestId){return $null}
  if($Status.requestId -cne $RequestId -or $Status.generation -cne $State.generation -or
    $Status.browserId -cne $State.browserId -or [int]$Status.daemonPid -ne [int]$State.daemonPid -or
    $Status.runtimeHash -cne $State.runtimeHash){return $null}
  if($Status.state -ceq 'waiting-or-blocked'){
    if($Status.reason -in @('fetch failed','Endpoint unavailable','Connection closed','Connection failed','Connection timeout')){return 'theme-connection-unavailable'}
    return 'loader-unavailable'
  }
  $renderers=@($Status.renderers)
  if($Status.state -ceq 'suspended' -and $renderers.Count -eq 1 -and $renderers[0].installed -eq $false){
    $known=@('automatic-dark-appearance-failed','required-markers-missing','unknown-active-page-or-layout','required-surface-missing','unknown-column-owner','unknown-mode','main-region-too-small','unsupported-request-card-shell','unsupported-submitting-shell','version-mismatch','expired-loader-lease')
    if($renderers[0].reason -cin $known){return $renderers[0].reason}
    return 'renderer-unavailable'
  }
  return $null
}
