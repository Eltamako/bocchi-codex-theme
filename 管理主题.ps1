[CmdletBinding()]
param([ValidateSet('Start','Pause','Resume','Restore','Status')][string]$Action='Start',[ValidateSet('auto','zh-CN','en')][string]$Language)
$ErrorActionPreference='Stop'
. ([IO.Path]::Combine($PSScriptRoot,'engine','bootstrap-shell.ps1'))
$root=$PSScriptRoot
$engine=Join-Path $root 'engine'
. (Join-Path $engine 'common-windows.ps1')
$install=Get-Content -LiteralPath (Join-Path $root 'installation.json') -Raw -Encoding utf8 | ConvertFrom-Json
. (Join-Path $engine 'installation-guard.ps1')
$stateRoot=Assert-BocchiInstallation -Install $install -Root $root
. (Join-Path $engine 'i18n.ps1')
Initialize-BocchiLanguage -Root $root -StateRoot $stateRoot -Language $Language
$profile=[IO.Path]::GetFullPath((Join-Path $stateRoot 'managed-profile'))
$statePath=Join-Path $stateRoot 'runtime-state.json'
$controlPath=Join-Path $stateRoot 'control.json'
$statusPath=Join-Path $stateRoot 'status.json'
$node=Join-Path $engine 'node.exe'
$runtime=Join-Path $engine 'runtime.mjs'
$port=[int]$install.port
function Write-LocalJson([string]$Path,[object]$Value){
  $tmp=$Path+'.tmp-'+[Guid]::NewGuid().ToString('N')
  [IO.File]::WriteAllText($tmp,($Value|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $tmp -Destination $Path -Force
}
function ConvertTo-UtcStamp([object]$Value){
  if($Value -is [DateTime]){return $Value.ToUniversalTime().ToString('o')}
  return [DateTime]::Parse([string]$Value,[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime().ToString('o')
}
function Get-BundleVersion([string]$PackageRoot){
  $stream=[IO.File]::OpenRead((Join-Path $PackageRoot 'app\resources\app.asar'))
  try{
    $prefix=New-Object byte[] 16; if($stream.Read($prefix,0,16)-ne 16){throw 'Invalid application archive'}
    $headerSize=[BitConverter]::ToUInt32($prefix,4);$jsonSize=[BitConverter]::ToUInt32($prefix,12)
    if($jsonSize -gt 33554432 -or $headerSize -lt $jsonSize){throw 'Invalid application archive header'}
    $jsonBytes=New-Object byte[] $jsonSize;$read=$stream.Read($jsonBytes,0,$jsonSize)
    if($read -ne $jsonSize){throw 'Application archive read incomplete'}
    $header=[Text.Encoding]::UTF8.GetString($jsonBytes)|ConvertFrom-Json
    $entry=$header.files.'package.json';if($entry.size -gt 1000000 -or $entry.unpacked){throw 'Invalid package metadata'}
    $null=$stream.Seek((8+[long]$headerSize+[long]$entry.offset),[IO.SeekOrigin]::Begin)
    $bytes=New-Object byte[] ([int]$entry.size);if($stream.Read($bytes,0,$bytes.Length)-ne $bytes.Length){throw 'Package metadata read incomplete'}
    return ([Text.Encoding]::UTF8.GetString($bytes)|ConvertFrom-Json).version
  }finally{$stream.Dispose()}
}
function Get-OwnIdentity([object]$Codex,[switch]$AllowEmptyTargets){
  if($AllowEmptyTargets){
    if(-not (Test-DreamSkinCodexPortOwner -Port $port -Codex $Codex)){return $null}
    $identity=Get-DreamSkinCdpBrowserIdentity -Port $port
  }else{$identity=Get-DreamSkinVerifiedCdpIdentity -Port $port -Codex $Codex}
  if($null -eq $identity){return $null}
  $owners=@(Get-DreamSkinPortListeners -Port $port|Select-Object -ExpandProperty OwningProcess -Unique)
  if($owners.Count -ne 1){throw 'Unexpected listener owner count'}
  $process=Get-CimInstance Win32_Process -Filter "ProcessId = $($owners[0])"
  $profileArg='(?:^|\s)(?:"--user-data-dir='+[regex]::Escape($profile)+'"|--user-data-dir="'+[regex]::Escape($profile)+'"|--user-data-dir='+[regex]::Escape($profile)+')(?=\s|$)'
  if($process.CommandLine -notmatch $profileArg){throw 'Listener is not the theme profile; refusing to attach'}
  if($process.CommandLine -match '--type='){throw 'Unexpected managed client process'}
  return [pscustomobject]@{identity=$identity;pid=[int]$process.ProcessId;created=$process.CreationDate.ToUniversalTime().ToString('o')}
}
function Test-OwnDaemon([object]$State){
  if(-not $State -or -not $State.daemonPid){return $false}
  $p=Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$State.daemonPid)" -ErrorAction SilentlyContinue
  if(-not $p){return $false}
  return ((Test-DreamSkinPathEqual -Left $p.ExecutablePath -Right $node) -and $p.CommandLine.Contains($runtime) -and $p.CommandLine.Contains($statePath) -and $p.CreationDate.ToUniversalTime().ToString('o') -ceq (ConvertTo-UtcStamp $State.daemonCreated))
}
. (Join-Path $engine 'session-guard.ps1')
function Get-BocchiOtherDesktopClients {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory=$true)][object]$Codex,
    [int]$AllowedOwnerPid=0,
    [object[]]$Processes
  )
  # A dedicated Electron profile still shares the native task store. Its renderer
  # helpers are harmless here; a second browser/main process can own another writer.
  if(-not $PSBoundParameters.ContainsKey('Processes')){
    $Processes=@(Get-CimInstance Win32_Process -Filter "Name = 'ChatGPT.exe' OR Name = 'Codex.exe'" -ErrorAction Stop)
  }
  @($Processes|Where-Object {
    $_.ProcessId -ne $AllowedOwnerPid -and
    $_.ExecutablePath -and
    (Test-DreamSkinPathEqual -Left $_.ExecutablePath -Right $Codex.Executable) -and
    ([string]$_.CommandLine -notmatch '(?:^|\s)"?--type(?:=|\s)')
  }|Select-Object ProcessId,CreationDate,ExecutablePath)
}
$script:BocchiStartupId=[Guid]::NewGuid().ToString('N')
$script:BocchiStartupTrace=@()
function Get-BocchiLaunchOwner([object]$Codex){
  # A closed window can leave the verified browser alive with no page targets.
  # Verify the executable, loopback port and exact profile before excluding it
  # from the parallel-client check. Page readiness is checked after activation.
  return Get-OwnIdentity $Codex -AllowEmptyTargets
}
function Get-BocchiParallelState([object[]]$Processes){
  $visible=0;$background=0;$unknown=0
  foreach($item in $Processes){
    try{
      $live=Get-Process -Id ([int]$item.ProcessId) -ErrorAction Stop
      if(-not (Test-DreamSkinPathEqual -Left $live.Path -Right $item.ExecutablePath)){$unknown++;continue}
      $started=$live.StartTime.ToUniversalTime();$started=$started.AddTicks(-($started.Ticks % 10))
      if($started.ToString('o') -cne (ConvertTo-UtcStamp $item.CreationDate)){$unknown++;continue}
      if($live.MainWindowHandle -ne 0){$visible++}else{$background++}
    }catch{$unknown++}
  }
  if($visible -gt 0){return 'visible'}
  if($background -gt 0 -and $unknown -eq 0){return 'background'}
  return 'unknown'
}
function Write-BocchiStartupTrace([string]$Stage,[object]$Own){
  if($Action -notin @('Start','Resume')){return}
  try{
    $clients=@(Get-BocchiOtherDesktopClients -Codex $codex -AllowedOwnerPid 0|ForEach-Object{
      [pscustomobject]@{pid=$_.ProcessId;created=(ConvertTo-UtcStamp $_.CreationDate);windowState=(Get-BocchiParallelState @($_))}
    })
    $entry=[pscustomobject]@{stage=$Stage;at=[DateTime]::UtcNow.ToString('o');verifiedOwnerPid=$(if($Own){$Own.pid}else{0});clients=$clients}
    $script:BocchiStartupTrace+=@($entry)
    Write-LocalJson (Join-Path $stateRoot ('startup-attempt-'+$script:BocchiStartupId+'.json')) @{schema='bocchi-startup-trace/1';action=$Action;events=$script:BocchiStartupTrace}
  }catch{}
}
function Enter-BocchiOperationLock([Threading.Mutex]$Mutex,[int]$TimeoutMilliseconds=90000){
  # A second shortcut invocation waits for the first instead of reporting a failure.
  $waited=$false
  try {
    $acquired=$Mutex.WaitOne(0)
    if(-not $acquired){
      $waited=$true
      $acquired=$Mutex.WaitOne($TimeoutMilliseconds)
    }
  } catch [Threading.AbandonedMutexException] {
    # Windows grants ownership to this caller when the previous owner exits.
    $acquired=$true
  }
  if(-not $acquired){Throw-BocchiError -Key 'manager.operationTimeout' -Diagnostic 'THEME_OPERATION_WAIT_TIMEOUT: request not executed'}
  return [pscustomobject]@{acquired=$true;waited=$waited}
}
function Test-BocchiCompletedStart([object]$State,[object]$Own){
  # Only coalesce a queued start after verifying the same live session and request.
  try {
    if(-not $State -or -not $Own -or -not (Test-OwnDaemon $State)){return $false}
    if(-not (Test-BocchiSessionMatch -Saved $State -Own $Own -Profile $profile -AppVersion $appVersion -PackageVersion $codex.Version -PackageRoot $codex.PackageRoot -RuntimeHash $runtimeHash)){return $false}
    $control=Get-Content -LiteralPath $controlPath -Raw -Encoding utf8|ConvertFrom-Json
    if($control.paused -ne $false -or $control.stop -ne $false -or -not $control.requestId){return $false}
    $ready=Get-Content -LiteralPath $statusPath -Raw -Encoding utf8|ConvertFrom-Json
    if(-not (Test-BocchiReadyStatus -Status $ready -State $State -RequestId $control.requestId -ThemeVersion $install.themeVersion)){return $false}
    $age=([DateTime]::UtcNow-[DateTime]::Parse((ConvertTo-UtcStamp $ready.at)).ToUniversalTime()).TotalSeconds
    if($age -lt 0 -or $age -gt 10 -or @($ready.renderers|Where-Object {$_.imageLoaded -ne $true}).Count -gt 0){return $false}
    $window=Get-Process -Id $Own.pid -ErrorAction Stop
    return ($window.MainWindowHandle -ne 0)
  } catch {return $false}
}
function Assert-BocchiNoParallelDesktop {
  [CmdletBinding()]
  param([Parameter(Mandatory=$true)][object]$Codex,[object]$Own)
  $allowed=if($Own){[int]$Own.pid}else{0}
  $others=@(Get-BocchiOtherDesktopClients -Codex $Codex -AllowedOwnerPid $allowed)
  if($others.Count -eq 0){return}
  if($Own){
    Write-Warning (Get-BocchiText 'manager.parallelWarning')
    return
  }
  # Tray Exit is asynchronous. Allow the exact application to finish quitting.
  $deadline=(Get-Date).AddSeconds(20)
  do{
    Start-Sleep -Milliseconds 400
    $others=@(Get-BocchiOtherDesktopClients -Codex $Codex -AllowedOwnerPid $allowed)
    if($others.Count -eq 0){return}
  }while((Get-Date)-lt $deadline)
  $kind=Get-BocchiParallelState $others
  $ids=($others|ForEach-Object{[string]$_.ProcessId}) -join ', '
  Write-BocchiStartupTrace ('blocked-'+$kind) $Own
  if($kind -eq 'background'){
    Throw-BocchiError -Key 'manager.parallelBackground' -Diagnostic ('CODEX_BACKGROUND_STILL_RUNNING: '+$ids)
  }
  if($kind -eq 'visible'){
    Throw-BocchiError -Key 'manager.parallelVisible' -Diagnostic ('CODEX_WINDOW_STILL_RUNNING: '+$ids)
  }
  Throw-BocchiError -Key 'manager.parallelUnknown' -Diagnostic ('CODEX_EXIT_STATE_UNVERIFIED: '+$ids)
}
function Stop-OwnDaemon([object]$State){
  if(-not (Test-OwnDaemon $State)){return}
  Write-LocalJson $controlPath @{paused=$true;stop=$true;requestId=[Guid]::NewGuid().ToString('N')}
  $deadline=(Get-Date).AddSeconds(8)
  while((Test-OwnDaemon $State) -and (Get-Date)-lt $deadline){Start-Sleep -Milliseconds 250}
  if(Test-OwnDaemon $State){
    # Hold and recheck the exact loader process before stopping a hung old connection.
    $loaderProcess=Get-Process -Id ([int]$State.daemonPid) -ErrorAction Stop
    try {
      $heldHandle=$loaderProcess.Handle
      $start=$loaderProcess.StartTime.ToUniversalTime();$start=$start.AddTicks(-($start.Ticks % 10))
      if(-not $heldHandle -or $heldHandle -eq [IntPtr]::Zero -or $start.ToString('o') -cne (ConvertTo-UtcStamp $State.daemonCreated) -or
        -not (Test-DreamSkinPathEqual -Left $loaderProcess.Path -Right $node) -or -not (Test-OwnDaemon $State)){
        throw 'Loader identity changed; no process stopped'
      }
      Stop-Process -InputObject $loaderProcess -ErrorAction Stop
      $null=$loaderProcess.WaitForExit(3000)
    } finally {$loaderProcess.Dispose()}
  }
  if(Test-OwnDaemon $State){throw 'Previous loader did not exit; refusing a duplicate loader'}
}
function Throw-BocchiNotReady {
  $key=switch($script:BocchiReadinessReason){
    'automatic-dark-appearance-failed' {'manager.dark';break}
    'theme-connection-unavailable' {'manager.connectionWaiting';break}
    'loader-stopped' {'manager.loaderStopped';break}
    'loader-unavailable' {'manager.loaderStopped';break}
    'version-mismatch' {'manager.updated';break}
    {$_ -in @('required-surface-missing','unknown-column-owner','unknown-mode','main-region-too-small','unsupported-request-card-shell','unsupported-submitting-shell')} {'manager.layout';break}
    default {'manager.waiting'}
  }
  Throw-BocchiError -Key $key -Diagnostic ('Current theme renderer did not confirm this request; inspect local status. '+$script:BocchiReadinessReason)
}
function Wait-ThemeReady([object]$State,[string]$RequestId){
  $script:BocchiReadinessReason=$null
  $deadline=(Get-Date).AddSeconds(15)
  do {
    Start-Sleep -Milliseconds 400
    if(-not (Test-OwnDaemon $State)){$script:BocchiReadinessReason='loader-stopped';return $false}
    try {
      $ready=Get-Content -LiteralPath $statusPath -Raw -Encoding utf8|ConvertFrom-Json
      $diagnostic=Get-BocchiReadinessDiagnostic -Status $ready -State $State -RequestId $RequestId -ThemeVersion $install.themeVersion
      if($diagnostic){$script:BocchiReadinessReason=$diagnostic}
      $reason=Get-BocchiBlockedReason -Status $ready -State $State -RequestId $RequestId
      if($reason){$script:BocchiReadinessReason=$reason;return $false}
      if(Test-BocchiReadyStatus -Status $ready -State $State -RequestId $RequestId -ThemeVersion $install.themeVersion){
        $current=Get-OwnIdentity $codex
        if(Test-BocchiSessionMatch -Saved $State -Own $current -Profile $profile -AppVersion $appVersion -PackageVersion $codex.Version -PackageRoot $codex.PackageRoot -RuntimeHash $runtimeHash){return $true}
        return $false
      }
    } catch { }
  } while((Get-Date)-lt $deadline)
  return $false
}
New-Item -ItemType Directory -Path $stateRoot -Force|Out-Null
$mutex=New-Object Threading.Mutex($false,'Local\BocchiCodexTheme-9347')
$locked=$false
try{
  $gate=Enter-BocchiOperationLock -Mutex $mutex
  $locked=$gate.acquired
  if((Get-FileHash -LiteralPath $node -Algorithm SHA256).Hash -cne $install.nodeSha256){throw 'Local Node runtime hash changed'}
  $codex=Get-DreamSkinCodexInstall
  $appVersion=Get-BundleVersion $codex.PackageRoot
  $runtimeHash=(Get-FileHash -LiteralPath $runtime -Algorithm SHA256).Hash
  if($Action -in @('Start','Resume') -and ($codex.Version -cne $install.packageVersion -or $appVersion -cne $install.appVersion)){
    Write-LocalJson $controlPath @{paused=$true;stop=$true}
    throw 'Client version changed. Theme stopped; a new adapter is required.'
  }
  if($Language){Save-BocchiLanguage -StateRoot $stateRoot -Language $Language}
  $saved=if(Test-Path -LiteralPath $statePath){Get-Content -LiteralPath $statePath -Raw -Encoding utf8|ConvertFrom-Json}else{$null}
  if($Action -eq 'Status'){if(Test-Path -LiteralPath $statusPath){Get-Content -LiteralPath $statusPath -Raw -Encoding utf8};exit 0}
  if($Action -eq 'Pause'){Write-LocalJson $controlPath @{paused=$true;stop=$false};Write-Output (Get-BocchiText 'manager.paused');exit 0}
  if($Action -eq 'Restore'){
    if($saved){
      $registered=@(Get-DreamSkinRegisteredCodexInstalls|Where-Object{(Test-DreamSkinPathEqual -Left $_.PackageRoot -Right $saved.packageRoot) -and $_.Version -ceq $saved.packageVersion})
      if($registered.Count -ne 1){throw 'Original managed package identity can no longer be verified; nothing closed'}
      $restoreCodex=$registered[0]
    }else{$restoreCodex=$codex}
    Write-LocalJson $controlPath @{paused=$true;stop=$true}
    $deadline=(Get-Date).AddSeconds(10)
    while((Test-OwnDaemon $saved) -and (Get-Date)-lt $deadline){Start-Sleep -Milliseconds 300}
    if(Test-OwnDaemon $saved){throw 'Theme daemon did not stop; client left untouched'}
    $own=Get-OwnIdentity $restoreCodex -AllowEmptyTargets
    if(-not $own -and -not (Test-DreamSkinPortAvailable -Port $port)){throw 'Theme port is occupied but identity could not be verified; nothing closed'}
    if($own){
      if(-not $saved -or $own.identity.BrowserId -cne $saved.browserId -or $own.pid -ne $saved.ownerPid -or $own.created -cne (ConvertTo-UtcStamp $saved.ownerCreated)){throw 'Managed session identity changed; nothing closed'}
      & $node '--preserve-symlinks' '--preserve-symlinks-main' $runtime 'restore' $statePath
      if($LASTEXITCODE -ne 0){throw 'Managed session restore failed'}
      $deadline=(Get-Date).AddSeconds(5)
      while(-not (Test-DreamSkinPortAvailable -Port $port) -and (Get-Date)-lt $deadline){Start-Sleep -Milliseconds 300}
      # This client keeps a background process after every renderer is closed.
      # End only the re-verified, windowless dedicated-profile owner; never an exe-wide process list.
      if(-not (Test-DreamSkinPortAvailable -Port $port)){
        $remaining=Get-OwnIdentity $restoreCodex -AllowEmptyTargets
        if(-not $remaining -or $remaining.identity.BrowserId -cne $saved.browserId -or $remaining.pid -ne $saved.ownerPid -or $remaining.created -cne (ConvertTo-UtcStamp $saved.ownerCreated)){throw 'Background session identity changed; nothing terminated'}
        $remainingTargets=Invoke-RestMethod -Uri ("http://127.0.0.1:$port/json/list") -TimeoutSec 3
        $remainingProcess=Get-Process -Id $remaining.pid -ErrorAction Stop
        try{
          $heldHandle=$remainingProcess.Handle
          $liveStart=$remainingProcess.StartTime.ToUniversalTime()
          # CIM stores microseconds; normalize the native 100 ns timestamp to that precision.
          $liveStart=$liveStart.AddTicks(-($liveStart.Ticks % 10))
          if(-not $heldHandle -or $heldHandle -eq [IntPtr]::Zero -or $liveStart.ToString('o') -cne $remaining.created -or -not (Test-DreamSkinPathEqual -Left $remainingProcess.Path -Right $restoreCodex.Executable)){throw 'Background process identity changed; nothing terminated'}
          if(@($remainingTargets).Count -ne 0 -or $remainingProcess.MainWindowHandle -ne 0){throw 'Managed window is still open; background process left untouched'}
          Stop-Process -InputObject $remainingProcess -ErrorAction Stop
        }finally{$remainingProcess.Dispose()}
        $deadline=(Get-Date).AddSeconds(5)
        while(-not (Test-DreamSkinPortAvailable -Port $port) -and (Get-Date)-lt $deadline){Start-Sleep -Milliseconds 300}
      }
      if(-not (Test-DreamSkinPortAvailable -Port $port)){throw 'Managed debugging port remains open'}
    }
    Write-LocalJson $statusPath @{state='restored';at=(Get-Date).ToUniversalTime().ToString('o');configChanged=$false}
    $null=Start-DreamSkinCodex -Codex $codex
    Write-Output (Get-BocchiText 'manager.restored');exit 0
  }
  $own=Get-BocchiLaunchOwner $codex
  Write-BocchiStartupTrace 'before-parallel-check' $own
  Assert-BocchiNoParallelDesktop -Codex $codex -Own $own
  if($gate.waited -and $Action -in @('Start','Resume') -and (Test-BocchiCompletedStart -State $saved -Own $own)){
    Write-BocchiStartupTrace 'reused-completed-start' $own
    Write-Output (Get-BocchiText 'manager.reused')
    exit 0
  }
  $reusingOwn=[bool]$own
  if(-not $own){
    if(-not (Test-DreamSkinPortAvailable -Port $port)){throw 'Theme port is occupied by an unverified process'}
    New-Item -ItemType Directory -Path $profile -Force|Out-Null
    Write-BocchiStartupTrace 'before-package-launch' $own
    $null=Start-DreamSkinCodex -Codex $codex -Arguments @('--remote-debugging-address=127.0.0.1',"--remote-debugging-port=$port","--user-data-dir=$profile")
    $deadline=(Get-Date).AddSeconds(40)
    do{$own=Get-OwnIdentity $codex;if($own){break};Start-Sleep -Milliseconds 700}while((Get-Date)-lt $deadline)
    Write-BocchiStartupTrace 'after-package-launch' $own
    if(-not $own){Throw-BocchiError -Key 'manager.connectionWaiting' -Diagnostic 'THEME_ENDPOINT_NOT_READY: startup trace recorded'}
  }
  # A dedicated Electron process can survive after its window is closed.
  # Re-activate the same verified profile when its desktop Start entry is used.
  if($Action -in @('Start','Resume') -and $reusingOwn){
    $priorOwn=$own
    $null=Start-DreamSkinCodex -Codex $codex -Arguments @('--remote-debugging-address=127.0.0.1',"--remote-debugging-port=$port","--user-data-dir=$profile")
    $deadline=(Get-Date).AddSeconds(15)
    do{
      $visibleOwner=Get-Process -Id $priorOwn.pid -ErrorAction Stop
      if($visibleOwner.MainWindowHandle -ne 0){break}
      Start-Sleep -Milliseconds 300
    }while((Get-Date)-lt $deadline)
    $own=Get-OwnIdentity $codex
    if(-not $own -or $own.pid -ne $priorOwn.pid -or $own.created -cne $priorOwn.created -or $own.identity.BrowserId -cne $priorOwn.identity.BrowserId -or $visibleOwner.MainWindowHandle -eq 0){throw 'Dedicated window did not reopen with its verified identity'}
  }
  Write-BocchiStartupTrace 'verified-window-ready' $own
  $requestId=[Guid]::NewGuid().ToString('N')
  if($saved -and (Test-OwnDaemon $saved)){
    $sameSession=Test-BocchiSessionMatch -Saved $saved -Own $own -Profile $profile -AppVersion $appVersion -PackageVersion $codex.Version -PackageRoot $codex.PackageRoot -RuntimeHash $runtimeHash
    if($sameSession){
      Write-LocalJson $controlPath @{paused=$false;stop=$false;requestId=$requestId}
      if(Wait-ThemeReady -State $saved -RequestId $requestId){Write-Output (Get-BocchiText 'manager.resumed');exit 0}
      if($script:BocchiReadinessReason){Throw-BocchiNotReady}
    }
    Stop-OwnDaemon $saved
    $own=Get-OwnIdentity $codex
    if(-not $own){throw 'Managed client identity unavailable after loader recovery'}
  }
  $state=[ordered]@{schema='bocchi-runtime/1';generation=[Guid]::NewGuid().ToString('N');port=$port;browserId=$own.identity.BrowserId;ownerPid=$own.pid;ownerCreated=$own.created;profile=$profile;appVersion=$appVersion;packageVersion=$codex.Version;packageRoot=$codex.PackageRoot;runtimeHash=$runtimeHash;launcherVersion=$install.launcherVersion;created=(Get-Date).ToUniversalTime().ToString('o')}
  Write-LocalJson $statePath $state
  Write-LocalJson $controlPath @{paused=$false;stop=$false;requestId=$requestId}
  Write-LocalJson $statusPath @{state='starting';generation=$state.generation;browserId=$state.browserId}
  $arguments=ConvertTo-DreamSkinArgumentLine -Arguments @('--preserve-symlinks','--preserve-symlinks-main',$runtime,'watch',$statePath)
  $daemon=Start-Process -FilePath $node -ArgumentList $arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $stateRoot 'runtime.log') -RedirectStandardError (Join-Path $stateRoot 'runtime-error.log')
  $created=(Get-CimInstance Win32_Process -Filter "ProcessId = $($daemon.Id)").CreationDate.ToUniversalTime().ToString('o')
  $state.daemonPid=$daemon.Id;$state.daemonCreated=$created;Write-LocalJson $statePath $state
  if(-not (Wait-ThemeReady -State $state -RequestId $requestId)){Throw-BocchiNotReady}
  Write-Output (Get-BocchiText 'manager.running')
}catch{
  Write-LocalJson (Join-Path $stateRoot 'last-operation-error.json') @{action=$Action;message=$_.Exception.Message;at=(Get-Date).ToUniversalTime().ToString('o')}
  throw
}finally{if($locked){$mutex.ReleaseMutex()};$mutex.Dispose()}
